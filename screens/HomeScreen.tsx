// screens/HomeScreen.tsx - الإصدار المعدل مع دعم RTL الكامل وإضافة USDT_BEP20
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  Switch, RefreshControl, Alert, Platform,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { ethers } from "ethers";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Connection, PublicKey } from "@solana/web3.js";
import { useTranslation } from "react-i18next";
import { useTheme } from "../ThemeProvider";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { getBalance as getPolyTokenBalance } from "../tokenHub";
import { ankrMulti, solanaRpc, btcBlockbook, PRICE_PROVIDERS } from "../providers";
import { ANKR_RPC } from "../Abe";

/* ================= Constants ================= */
const ANKR_MULTI = ankrMulti();
const SOLANA_RPC = solanaRpc();
const BTC_BLOCKBOOK = btcBlockbook();
const TRON_RPC = ANKR_RPC.tron;

// عقد USDT الرسمي على Tron
const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const KEY_WALLET_PIN = "wallet_pin";
const KEY_WALLET_NAME = "wallet_name";
const KEY_LAST_PRICES = "last_prices_v1";
const KEY_LAST_BALANCES = "last_balances_v1";
const PRICES_CACHE_TTL_MIN = 60;

/* ================= Types ================= */
type PricesMap = Record<string, number>;
type Balances = Record<string, string>;
type PriceChanges = Record<string, number>;

type TokenDef = {
  symbol: string;
  name: string;
  icon: any;
  network: { label: string; emoji: string; color: string };
  priceKey: string;
  screen: string;
  balanceKey: string;
  sortOrder: number;
  priceChange24h?: number;
};

type AnkrAsset = {
  blockchain: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimals: number;
  tokenContractAddress?: string | null;
  tokenPrice?: number;
  balance: string;
  balanceUsd?: string;
  thumbnail?: string;
};

/* ================= Helper Functions ================= */
const solAddressFromSecret = (b58sec: string): string => {
  const raw = bs58.decode(b58sec);
  if (raw.length === 64) return bs58.encode(raw.slice(32));
  if (raw.length === 32) return bs58.encode(nacl.sign.keyPair.fromSeed(raw).publicKey);
  throw new Error("Invalid Solana secret length");
};

const localIcon = (sym: string) => {
  try {
    switch (sym.toUpperCase()) {
      case "BTC": return require("../assets/btc.png");
      case "ETH": return require("../assets/eth.png");
      case "BNB": return require("../assets/bnb.png");
      case "MATIC": return require("../assets/matic.png");
      case "SOL": return require("../assets/sol.png");
      case "USDC": return require("../assets/usdc.png");
      case "USDT": return require("../assets/usdt.png");
      case "ARB": return require("../assets/arb.png");
      case "XRP": return require("../assets/xrp.png");
      case "TRX": return require("../assets/trx.png");
      default: return null;
    }
  } catch { return null; }
};

/* ================= Chain and Symbol Aliases ================= */
const CHAIN_ALIASES: Record<string, string> = {
  btc: "bitcoin", bitcoin: "bitcoin", "bitcoin-mainnet": "bitcoin",
  eth: "ethereum", ethereum: "ethereum", "ethereum-mainnet": "ethereum",
  bsc: "bsc", "binance-smart-chain": "bsc",
  polygon: "polygon", matic: "polygon", "polygon-pos": "polygon", "polygon-mainnet": "polygon",
  sol: "solana", solana: "solana", "solana-mainnet-beta": "solana",
  arb: "arbitrum", arbitrum: "arbitrum", "arbitrum-one": "arbitrum",
  base: "base",
  xrpl: "xrpl",
  tron: "tron",
};

const normalizeChain = (n: string): string => CHAIN_ALIASES[n?.toLowerCase()] || n?.toLowerCase();

const SYMBOL_ALIASES: Record<string, string[]> = {
  "btc@bitcoin": ["BTC", "XBT"],
  "eth@ethereum": ["ETH", "WETH"],
  "bnb@bsc": ["BNB", "WBNB"],
  "matic@polygon": ["MATIC", "POL"],
  "sol@solana": ["SOL", "SOLANA"],
  "usdc@ethereum": ["USDC"],
  "usdt@ethereum": ["USDT", "USDTE"],
  "usdt@bsc": ["USDT"], // تمت الإضافة
  "usdc@polygon": ["USDC", "USDCe"],
  "usdt@polygon": ["USDT"],
  "usdt@tron": ["USDT"],
  "arb@arbitrum": ["ARB"],
  "eth@arbitrum": ["ETH", "WETH"],
  "arb@ethereum": ["ARB"],
  "eth@base": ["ETH", "WETH"],
  "xrp@xrpl": ["XRP"],
  "trx@tron": ["TRX"],
};

const priceFromAsset = (a: AnkrAsset): number => {
  const bal = parseFloat(a.balance || "0");
  if (a.tokenPrice && isFinite(a.tokenPrice)) return a.tokenPrice;
  if (a.balanceUsd && bal > 0) return (parseFloat(a.balanceUsd) || 0) / bal;
  return 0;
};

/* ================= Order Configuration ================= */
const SYMBOL_ORDER: Record<string, number> = {
  USDC: 1, USDT: 2, ETH: 3, BTC: 4, BNB: 5, MATIC: 6, SOL: 7,
  ARB: 8, XRP: 9, TRX: 10,
};

const NETWORK_ORDER: Record<string, number> = {
  Ethereum: 1, Polygon: 2, "Arbitrum One": 3, BSC: 4, Solana: 5,
  Bitcoin: 6, Tron: 7, Base: 8, XRPL: 9,
};

/* ================= Main Component ================= */
export default function HomeScreen({ navigation }: any) {
  const { t, i18n } = useTranslation();
  const { colors, resolved } = useTheme();
  
  // 🔥 تعديل مهم: RTL دائماً مهما كانت اللغة
  const rtl = true; // ثابت RTL دائماً

  const chain = {
    bitcoin: "Bitcoin",
    ethereum: "Ethereum",
    bsc: "BSC",
    polygon: "Polygon",
    polygonMainnet: "Polygon",
    solana: "Solana",
    arbitrum: "Arbitrum",
    base: "Base",
    xrpl: "XRPL",
    tron: "Tron",
  };

  const buildCoins = (): TokenDef[] => ([
    { symbol:"USDC", name:"USD Coin", icon:localIcon("USDC")||require("../assets/usdc.png"),
      network:{label:"ERC20", emoji:"🔷", color:"#627EEA"}, priceKey:"usdc@ethereum", screen:"USDC_ERC20", balanceKey:"USDC_ERC20", sortOrder: 1, priceChange24h: 0.1 },
    { symbol:"USDC", name:"USD Coin", icon:localIcon("USDC")||require("../assets/usdc.png"),
      network:{label:"Polygon", emoji:"🟣", color:"#8247E5"}, priceKey:"usdc@polygon", screen:"USDC", balanceKey:"USDC_POLY", sortOrder: 2, priceChange24h: 0.05 },
    { symbol:"USDT", name:"Tether", icon:localIcon("USDT")||require("../assets/usdt.png"),
      network:{label:"ERC20", emoji:"🔷", color:"#627EEA"}, priceKey:"usdt@ethereum", screen:"USDT_ERC20", balanceKey:"USDT_ERC20", sortOrder: 3, priceChange24h: -0.02 },
    { symbol:"USDT", name:"Tether", icon:localIcon("USDT")||require("../assets/usdt.png"),
      network:{label:"BSC", emoji:"🟡", color:"#F0B90B"}, priceKey:"usdt@bsc", screen:"USDT_BEP20", balanceKey:"USDT_BSC", sortOrder: 3.5, priceChange24h: -0.01 },
    { symbol:"USDT", name:"Tether", icon:localIcon("USDT")||require("../assets/usdt.png"),
      network:{label:"Polygon", emoji:"🟣", color:"#8247E5"}, priceKey:"usdt@polygon", screen:"USDT", balanceKey:"USDT_POLY", sortOrder: 4, priceChange24h: -0.01 },
    { symbol:"USDT", name:"Tether", icon:localIcon("USDT")||require("../assets/usdt.png"),
      network:{label:"TRON", emoji:"🔴", color:"#E51A2E"}, priceKey:"usdt@tron", screen:"USDT_TRX", balanceKey:"USDT_TRON", sortOrder: 4.5, priceChange24h: 0.0 },
    { symbol:"ETH", name:"Ethereum", icon:localIcon("ETH")||require("../assets/eth.png"),
      network:{label:"Ethereum", emoji:"🔷", color:"#627EEA"}, priceKey:"eth@ethereum", screen:"ETH", balanceKey:"ETH", sortOrder: 5, priceChange24h: 2.45 },
    { symbol:"ETH", name:"Ethereum", icon:localIcon("ETH") || require("../assets/eth.png"),
      network:{ label:"Arbitrum", emoji:"🟦", color:"#2f6feb" }, priceKey:"eth@arbitrum", screen:"ETH_ARB", balanceKey:"ETH_ARB", sortOrder: 6, priceChange24h: 2.38 },
    { symbol:"ETH", name:"Ethereum", icon:localIcon("ETH") || require("../assets/eth.png"),
      network:{ label:"Base", emoji:"🟦", color:"#0052FF" }, priceKey:"eth@base", screen:"ETH_BASE", balanceKey:"ETH_BASE", sortOrder: 7, priceChange24h: 2.42 },
    { symbol:"BTC", name:"Bitcoin", icon:localIcon("BTC")||require("../assets/btc.png"),
      network:{label:"Bitcoin", emoji:"🟠", color:"#F7931A"}, priceKey:"btc@bitcoin", screen:"BTC", balanceKey:"BTC", sortOrder: 8, priceChange24h: 1.85 },
    { symbol:"BNB", name:"BNB", icon:localIcon("BNB")||require("../assets/bnb.png"),
      network:{label:"BSC", emoji:"🟡", color:"#F0B90B"}, priceKey:"bnb@bsc", screen:"BNB", balanceKey:"BNB", sortOrder: 9, priceChange24h: 0.75 },
    { symbol:"MATIC", name:"Polygon", icon:localIcon("MATIC")||require("../assets/matic.png"),
      network:{label:"Polygon", emoji:"🟣", color:"#8247E5"}, priceKey:"matic@polygon", screen:"MATIC", balanceKey:"MATIC", sortOrder: 10, priceChange24h: -0.32 },
    { symbol:"SOL", name:"Solana", icon:localIcon("SOL")||require("../assets/sol.png"),
      network:{label:"Solana", emoji:"🟦", color:"#14F195"}, priceKey:"sol@solana", screen:"SOL", balanceKey:"SOL", sortOrder: 11, priceChange24h: 3.21 },
    { symbol:"ARB", name:"Arbitrum", icon:localIcon("ARB") || require("../assets/arb.png"),
      network:{ label:"Arbitrum", emoji:"🟦", color:"#2f6feb" }, priceKey:"arb@arbitrum", screen:"ARB", balanceKey:"ARB", sortOrder: 12, priceChange24h: 0.92 },
    { symbol:"ARB", name:"Arbitrum", icon:localIcon("ARB") || require("../assets/arb.png"),
      network:{ label:"ERC20", emoji:"🔷", color:"#627EEA" }, priceKey:"arb@ethereum", screen:"ARB_ETH", balanceKey:"ARB_ETH", sortOrder: 13, priceChange24h: 0.89 },
    { symbol:"XRP", name:"Ripple", icon:localIcon("XRP")||require("../assets/xrp.png"),
      network:{label:"XRPL", emoji:"🌀", color:"#00AAE4"}, priceKey:"xrp@xrpl", screen:"XRP", balanceKey:"XRP", sortOrder: 14, priceChange24h: -0.45 },
    { symbol:"TRX", name:"TRON", icon:localIcon("TRX")||require("../assets/trx.png"),
      network:{label:"TRON", emoji:"🔴", color:"#E51A2E"}, priceKey:"trx@tron", screen:"TRX", balanceKey:"TRX", sortOrder: 15, priceChange24h: -0.15 },
  ]);

  const [walletName, setWalletName] = useState("MultiVault");
  const [balances, setBalances] = useState<Balances>({});
  const [prices, setPrices] = useState<PricesMap>({});
  const [hideZero, setHideZero] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [priceChanges, setPriceChanges] = useState<PriceChanges>({});

  useEffect(() => {
    navigation.setOptions({ title: t("home.title") });
  }, [navigation, t]);

  useEffect(() => {
    (async () => {
      const pin = await SecureStore.getItemAsync(KEY_WALLET_PIN);
      if (!pin) { navigation.replace("SetPin"); return; }
      const nm = await SecureStore.getItemAsync(KEY_WALLET_NAME);
      if (nm) setWalletName(nm);

      try {
        const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
        if (raw) {
          const { ts, prices: cached } = JSON.parse(raw);
          const fresh = Date.now() - (ts ?? 0) < PRICES_CACHE_TTL_MIN * 60_000;
          if (cached && fresh) setPrices(prev => Object.keys(prev).length ? prev : cached);
        }
      } catch {}

      await waitForWalletAndFetch(fetchAll, 8, 500);
    })();
  }, []);

  useFocusEffect(useCallback(() => { waitForWalletAndFetch(fetchAll, 8, 500); }, []));

  async function waitForWalletAndFetch(onReady: () => Promise<void>, tries = 20, intervalMs = 750) {
    for (let i = 0; i < tries; i++) {
      try {
        const pk = await SecureStore.getItemAsync("privateKey");
        const solSecret = await SecureStore.getItemAsync("sol_secret");
        const btcAddr = await SecureStore.getItemAsync("btc_address");
        const xrpAddr = await SecureStore.getItemAsync("xrp_address");
        const tronAddr = await SecureStore.getItemAsync("tron_address");
        if (pk || solSecret || btcAddr || xrpAddr || tronAddr) { await onReady(); return; }
      } catch {}
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  const withTimeout = (p: Promise<Response>, ms = 7000) =>
    Promise.race([p, new Promise<Response>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]) as Promise<Response>;

  /* ================= Price Fetching Functions ================= */
  async function getSolPriceUSD(cached?: number): Promise<number | null> {
    try {
      const r = await withTimeout(fetch(PRICE_PROVIDERS.jupiter.solUsd));
      if (r.ok) { const j = await r.json(); const p = j?.data?.SOL?.price; if (p != null && isFinite(Number(p))) return Number(p); }
    } catch {}
    try {
      const r = await withTimeout(fetch(PRICE_PROVIDERS.coingecko.solUsd));
      if (r.ok) { const j = await r.json(); const p = j?.solana?.usd; if (p != null && isFinite(Number(p))) return Number(p); }
    } catch {}
    return cached ?? null;
  }

  async function getBtcPriceUSD(cached?: number): Promise<number | null> {
    try {
      const r = await withTimeout(fetch(PRICE_PROVIDERS.coingecko.btcUsd));
      if (r.ok) { const j = await r.json(); const p = j?.bitcoin?.usd; if (p != null && isFinite(Number(p))) return Number(p); }
    } catch {}
    return cached ?? null;
  }

  async function getXrpPriceUSD(cached?: number): Promise<number | null> {
    try {
      const r = await withTimeout(fetch(PRICE_PROVIDERS.coingecko.xrpUsd));
      if (r.ok) { const j = await r.json(); const p = j?.ripple?.usd; if (p != null && isFinite(Number(p))) return Number(p); }
    } catch {}
    return cached ?? null;
  }

  async function getTrxPriceUSD(cached?: number): Promise<number | null> {
    try {
      const r = await withTimeout(fetch("https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd"));
      if (r.ok) { const j = await r.json(); const p = j?.tron?.usd; if (p != null && isFinite(Number(p))) return Number(p); }
    } catch {}
    return cached ?? null;
  }

  /* ================= Main Data Fetching Function ================= */
  const fetchAll = async () => {
    try {
      setRefreshing(true);

      const privateKey = await SecureStore.getItemAsync("privateKey");
      const solSecret  = await SecureStore.getItemAsync("sol_secret");
      const btcAddr    = await SecureStore.getItemAsync("btc_address");
      const xrpAddr    = await SecureStore.getItemAsync("xrp_address");
      const tronAddr   = await SecureStore.getItemAsync("tron_address");
      const evmAddr = privateKey ? new ethers.Wallet(privateKey).address : undefined;
      const solAddr = solSecret ? solAddressFromSecret(solSecret) : undefined;

      if (!evmAddr && !solAddr && !btcAddr && !xrpAddr && !tronAddr) { 
        setRefreshing(false); 
        return; 
      }

      const all: AnkrAsset[] = [];
      let solPriceFromCustom: number | undefined;

      // 1) EVM via Ankr
      if (evmAddr) {
        let page: string | undefined;
        do {
          const body = { 
            id: 1, 
            jsonrpc: "2.0", 
            method: "ankr_getAccountBalance", 
            params: { walletAddress: evmAddr, pageSize: 50, pageToken: page } 
          };
          const res = await fetch(ANKR_MULTI, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(body) 
          });
          if (!res.ok) throw new Error(`ANKR ${res.status}`);
          const j = await res.json();
          const items: AnkrAsset[] = j?.result?.assets || j?.result?.balances || [];
          page = j?.result?.nextPageToken;
          all.push(...items);
        } while (page);
      }

      // 2) SOL balance + price
      if (solAddr) {
        try {
          const conn = new Connection(SOLANA_RPC, "confirmed");
          const lamports = await conn.getBalance(new PublicKey(solAddr));
          const sol = lamports / 1e9;

          let cachedSol: number | undefined;
          try {
            const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
            if (raw) { 
              const obj = JSON.parse(raw); 
              const v = obj?.prices?.["sol@solana"]; 
              if (typeof v === "number") cachedSol = v; 
            }
          } catch {}

          let solPx = prices["sol@solana"];
          if (solPx == null || solPx === 0) {
            const p = await getSolPriceUSD(cachedSol);
            if (p != null) {
              solPx = p; 
              solPriceFromCustom = p;
              try {
                const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
                const cached = raw ? JSON.parse(raw) : { ts: Date.now(), prices: {} as PricesMap };
                cached.prices["sol@solana"] = p; 
                cached.ts = Date.now();
                await SecureStore.setItemAsync(KEY_LAST_PRICES, JSON.stringify(cached));
              } catch {}
            }
          } else { 
            solPriceFromCustom = solPx; 
          }

          all.push({
            blockchain: "solana",
            tokenSymbol: "SOL",
            tokenName: "Solana",
            tokenDecimals: 9,
            tokenContractAddress: undefined,
            tokenPrice: solPx ?? undefined,
            balance: String(sol),
            balanceUsd: solPx ? String(sol * solPx) : undefined,
          });
        } catch (e: any) { 
          console.warn("Solana RPC error:", e?.message || e); 
        }
      }

      // Parse Ankr assets into balances/prices
      const nextB: Balances = {};
      const nextP: PricesMap = { ...prices };
      const coinsList = buildCoins();

      for (const c of coinsList) {
        const [sym, chainRaw] = c.priceKey.split("@");
        const chainKey = normalizeChain(chainRaw);
        const aliasKey = `${sym}@${chainKey}`.toLowerCase();
        const aliases = SYMBOL_ALIASES[aliasKey] || [sym.toUpperCase()];

        const asset = all.find(a =>
          normalizeChain(a.blockchain) === chainKey &&
          aliases.map(s => s.toUpperCase()).includes(a.tokenSymbol.toUpperCase())
        );

        if (asset) {
          const amt = parseFloat(asset.balance || "0") || 0;
          nextB[c.balanceKey] = amt.toFixed(6);
          const px = priceFromAsset(asset);
          if (px) nextP[aliasKey] = px;
        } else {
          if (nextB[c.balanceKey] === undefined) nextB[c.balanceKey] = "0";
        }
      }

      if (solPriceFromCustom != null) nextP["sol@solana"] = solPriceFromCustom;

      // Polygon direct for stables
      if (evmAddr) {
        try {
          const [usdtPoly, usdcPoly] = await Promise.all([
            getPolyTokenBalance({ token: "USDT@polygon", address: evmAddr }),
            getPolyTokenBalance({ token: "USDC@polygon", address: evmAddr }),
          ]);
          nextB["USDT_POLY"] = Number(usdtPoly || "0").toFixed(6);
          nextB["USDC_POLY"] = Number(usdcPoly || "0").toFixed(6);
          nextP["usdt@polygon"] = 1;
          nextP["usdc@polygon"] = 1;
        } catch (e) { 
          console.warn("Polygon direct (USDT/USDC) failed:", e); 
        }
      }

      // BTC
      try {
        const btcAddr2 = await SecureStore.getItemAsync("btc_address");
        if (btcAddr2) {
          const resp = await fetch(`${BTC_BLOCKBOOK}/api/v2/address/${btcAddr2}?details=basic`);
          if (resp.ok) {
            const j = await resp.json();
            const sats = Number(j?.balance ?? "0");
            const btc = isFinite(sats) ? sats / 1e8 : 0;
            nextB["BTC"] = btc.toFixed(8);

            let cachedBtc: number | undefined;
            try {
              const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
              if (raw) { 
                const obj = JSON.parse(raw); 
                const v = obj?.prices?.["btc@bitcoin"]; 
                if (typeof v === "number") cachedBtc = v; 
              }
            } catch {}

            let btcPx = prices["btc@bitcoin"];
            if (btcPx == null || btcPx === 0) {
              const p = await getBtcPriceUSD(cachedBtc);
              if (p != null) {
                btcPx = p; 
                nextP["btc@bitcoin"] = p;
                try {
                  const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
                  const cached = raw ? JSON.parse(raw) : { ts: Date.now(), prices: {} as PricesMap };
                  cached.prices["btc@bitcoin"] = p; 
                  cached.ts = Date.now();
                  await SecureStore.setItemAsync(KEY_LAST_PRICES, JSON.stringify(cached));
                } catch {}
              } else if (cachedBtc != null) {
                nextP["btc@bitcoin"] = cachedBtc;
              }
            } else {
              nextP["btc@bitcoin"] = btcPx;
            }
          }
        }
      } catch (e) { 
        console.warn("BTC balance error", e); 
      }

      // TRON (TRX)
      try {
        if (tronAddr) {
          const r = await fetch(`${TRON_RPC}/wallet/getaccount`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: tronAddr, visible: true })
          });
          if (r.ok) {
            const j = await r.json();
            const sun = Number(j?.balance ?? 0);
            const trx = isFinite(sun) ? sun / 1e6 : 0;
            nextB["TRX"] = trx.toFixed(6);

            let cachedTrx: number | undefined;
            try {
              const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
              if (raw) { 
                const obj = JSON.parse(raw); 
                const v = obj?.prices?.["trx@tron"]; 
                if (typeof v === "number") cachedTrx = v; 
              }
            } catch {}

            let trxPx = prices["trx@tron"];
            if (trxPx == null || trxPx === 0) {
              const p = await getTrxPriceUSD(cachedTrx);
              if (p != null) {
                trxPx = p; 
                nextP["trx@tron"] = p;
                try {
                  const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
                  const cached = raw ? JSON.parse(raw) : { ts: Date.now(), prices: {} as PricesMap };
                  cached.prices["trx@tron"] = p; 
                  cached.ts = Date.now();
                  await SecureStore.setItemAsync(KEY_LAST_PRICES, JSON.stringify(cached));
                } catch {}
              } else if (cachedTrx != null) {
                nextP["trx@tron"] = cachedTrx;
              }
            } else {
              nextP["trx@tron"] = trxPx;
            }
          }
        }
      } catch (e) { 
        console.warn("TRON balance error", e); 
      }

      // ==== TRON USDT ====
      try {
        const tronAddr = await SecureStore.getItemAsync("tron_address");
        if (tronAddr) {
          const { tronTrc20BalanceOf } = await import("../tronHub");
          
          const usdtBalance = await tronTrc20BalanceOf(TRON_USDT_CONTRACT, tronAddr);

          const formatted =
            typeof usdtBalance === "bigint"
              ? Number(usdtBalance) / 1_000_000
              : Number(usdtBalance || 0);

          nextB["USDT_TRON"] = formatted.toFixed(6);
          nextP["usdt@tron"] = 1;
          console.log("💰 USDT_TRON = ", formatted);
        }
      } catch (err) {
        console.warn("USDT_TRON balance error:", err);
      }

      // XRP
      try {
        let cachedXrp: number | undefined;
        try {
          const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
          if (raw) { 
            const obj = JSON.parse(raw); 
            const v = obj?.prices?.["xrp@xrpl"]; 
            if (typeof v === "number") cachedXrp = v; 
          }
        } catch {}

        let xrpPx = prices["xrp@xrpl"];
        if (xrpPx == null || xrpPx === 0) {
          const p = await getXrpPriceUSD(cachedXrp);
          if (p != null) {
            xrpPx = p; 
            nextP["xrp@xrpl"] = p;
            try {
              const raw = await SecureStore.getItemAsync(KEY_LAST_PRICES);
              const cached = raw ? JSON.parse(raw) : { ts: Date.now(), prices: {} as PricesMap };
              cached.prices["xrp@xrpl"] = p; 
              cached.ts = Date.now();
              await SecureStore.setItemAsync(KEY_LAST_PRICES, JSON.stringify(cached));
            } catch {}
          } else if (cachedXrp != null) {
            nextP["xrp@xrpl"] = cachedXrp;
          }
        } else {
          nextP["xrp@xrpl"] = xrpPx;
        }
      } catch (e) { 
        console.warn("XRP price error", e); 
      }

      // Fallback for stablecoins
      if (nextP["usdc@ethereum"] === undefined) nextP["usdc@ethereum"] = 1;
      if (nextP["usdc@polygon"]  === undefined) nextP["usdc@polygon"]  = 1;
      if (nextP["usdt@ethereum"] === undefined) nextP["usdt@ethereum"] = 1;
      if (nextP["usdt@bsc"]      === undefined) nextP["usdt@bsc"]      = 1;
      if (nextP["usdt@polygon"]  === undefined) nextP["usdt@polygon"]  = 1;
      if (nextP["usdt@tron"]     === undefined) nextP["usdt@tron"]     = 1;

      // XRP balance
      try {
        const { getXRPBalance } = await import("../providerAdapter");
        const xrpAddr = await SecureStore.getItemAsync("xrp_address");
        if (xrpAddr) {
          const bal = await getXRPBalance(xrpAddr);
          nextB["XRP"] = Number(bal).toFixed(6);
          const xrpPx = await getXrpPriceUSD();
          if (xrpPx) nextP["xrp@xrpl"] = xrpPx;
        }
      } catch (e) { 
        console.warn("XRP fetch error:", e); 
      }

      // حفظ الأرصدة والأسعار فقط بدون تسجيل المعاملات الواردة
      setBalances(nextB);
      setPrices(nextP);
      try { 
        await SecureStore.setItemAsync(KEY_LAST_BALANCES, JSON.stringify(nextB));
        await SecureStore.setItemAsync(KEY_LAST_PRICES, JSON.stringify({ ts: Date.now(), prices: nextP })); 
      } catch {}

    } catch (e: any) {
      console.warn("Fetch error:", e?.message || e);
      if (Object.keys(balances).length === 0) {
        const zeros: Balances = {};
        for (const c of buildCoins()) zeros[c.balanceKey] = "0";
        setBalances(zeros);
      }
      Alert.alert("Warning", "Failed to fetch balances");
    } finally {
      setRefreshing(false);
    }
  };

  const totalUSD = useMemo(
    () => buildCoins().reduce((sum, c) => {
      const amt = parseFloat(balances[c.balanceKey] || "0") || 0;
      const px  = prices[c.priceKey] || 0;
      return sum + amt * px;
    }, 0),
    [balances, prices]
  );

  const sortedData = useMemo(() => {
    const coins = hideZero
      ? buildCoins().filter(c => parseFloat(balances[c.balanceKey] || "0") > 0)
      : buildCoins();

    const seen = new Set<string>();
    const deduped = [];
    for (const c of coins) {
      const key = `${c.symbol}:${c.network.label}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(c);
      }
    }

    deduped.sort((a, b) => {
      const symbolOrderA = SYMBOL_ORDER[a.symbol] || 999;
      const symbolOrderB = SYMBOL_ORDER[b.symbol] || 999;
      if (symbolOrderA !== symbolOrderB) return symbolOrderA - symbolOrderB;
      const networkOrderA = NETWORK_ORDER[a.network.label] || 999;
      const networkOrderB = NETWORK_ORDER[b.network.label] || 999;
      if (networkOrderA !== networkOrderB) return networkOrderA - networkOrderB;
      return a.sortOrder - b.sortOrder;
    });

    return deduped;
  }, [hideZero, balances]);

  const formatUSDValue = (value: number) => {
    if (value === 0) return "$0.00";
    
    if (value < 0.0001) {
      return `$${value.toFixed(6)}`;
    } else if (value < 0.01) {
      return `$${value.toFixed(4)}`;
    } else if (value < 1) {
      return `$${value.toFixed(3)}`;
    } else if (value < 1000) {
      return `$${value.toFixed(2)}`;
    } else {
      return `$${value.toFixed(0)}`;
    }
  };

  const formatAmount = (amt: number, symbol: string) => {
    if (amt === 0) return `0 ${symbol}`;
    
    if (amt < 0.000001) {
      return `<0.000001 ${symbol}`;
    } else if (amt < 1) {
      return `${amt.toFixed(6)} ${symbol}`;
    } else if (amt < 1000) {
      return `${amt.toFixed(4)} ${symbol}`;
    } else {
      return `${amt.toFixed(2)} ${symbol}`;
    }
  };

  const renderItem = useCallback(({ item }: { item: TokenDef }) => {
    const amount = parseFloat(balances[item.balanceKey] || "0") || 0;
    const price = prices[item.priceKey] || 0;
    const usdValue = amount * price;
    const change = item.priceChange24h || 0;
    const isPositive = change >= 0;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[
          styles.listItem, 
          { backgroundColor: colors.card },
          rtl && styles.listItemRTL
        ]}
        onPress={() => navigation.navigate(item.screen)}
      >
        {/* Left Section - Icon and Info */}
        <View style={[
          styles.leftSection,
          rtl && styles.leftSectionRTL
        ]}>
          <View style={[
            styles.iconContainer, 
            { backgroundColor: item.network.color + '20' },
            rtl && styles.iconContainerRTL
          ]}>
            <Image source={item.icon} style={styles.icon} />
          </View>
          <View style={[
            styles.infoContainer,
            rtl && styles.infoContainerRTL
          ]}>
            <Text style={[
              styles.symbol, 
              { color: colors.text },
              rtl && styles.textRight
            ]}>{item.symbol}</Text>
            <Text style={[
              styles.network, 
              { color: colors.textMuted },
              rtl && styles.textRight
            ]}>{item.network.label}</Text>
          </View>
        </View>

        {/* Right Section - Amount, USD Value, and Change */}
        <View style={[
          styles.rightSection,
          rtl && styles.rightSectionRTL
        ]}>
          <Text style={[
            styles.amount, 
            { color: colors.text },
            rtl && styles.textRight
          ]}>
            {formatAmount(amount, item.symbol)}
          </Text>
          <Text style={[
            styles.usdValue, 
            { color: colors.text },
            rtl && styles.textRight
          ]}>
            {formatUSDValue(usdValue)}
          </Text>
          <View style={styles.changeContainer}>
            <Ionicons 
              name={isPositive ? "trending-up" : "trending-down"} 
              size={12} 
              color={isPositive ? "#16A34A" : "#DC2626"} 
            />
            <Text style={[
              styles.changeText, 
              { color: isPositive ? "#16A34A" : "#DC2626" }
            ]}>
              {isPositive ? '+' : ''}{change.toFixed(2)}%
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [balances, prices, colors, navigation, rtl]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Total Balance Card */}
      <View style={styles.totalContainer}>
        <View style={[styles.totalCard, { backgroundColor: colors.card }]}>
          <Text style={[
            styles.totalLabel, 
            { color: colors.textMuted },
            rtl && styles.textRight
          ]}>
            {t("home.total")}
          </Text>
          <Text style={[
            styles.totalValue, 
            { color: colors.text },
            rtl && styles.textRight
          ]}>
            ${totalUSD.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Hide Zero Balances Switch */}
      <View style={[
        styles.hideZeroContainer, 
        { backgroundColor: colors.card },
        rtl && styles.hideZeroContainerRTL
      ]}>
        <Text style={[
          styles.hideZeroText, 
          { color: colors.text },
            rtl && styles.textRight
        ]}>
          {t("home.hideZero")}
        </Text>
        <Switch
          value={hideZero}
          onValueChange={setHideZero}
          thumbColor={Platform.OS === "android" ? (hideZero ? "#00C853" : "#888") : undefined}
          trackColor={{ false: resolved === "dark" ? "#333" : "#ddd", true: resolved === "dark" ? "#1B5E20" : "#9CCC65" }}
        />
      </View>

      {/* Tokens List */}
      <FlatList
        data={sortedData}
        keyExtractor={(i) => i.symbol + ":" + i.balanceKey}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchAll} tintColor="#888" />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: '#f8fafc',
  },
  totalContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
  },
  totalCard: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  totalLabel: { 
    fontSize: 14, 
    fontWeight: "600", 
    marginBottom: 8, 
    textAlign: "center", 
    color: '#666',
  },
  totalValue: { 
    fontSize: 28, 
    fontWeight: "700", 
    textAlign: "center", 
    color: '#000',
  },
  hideZeroContainer: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginVertical: 10,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  hideZeroText: { 
    fontSize: 16, 
    fontWeight: "600", 
    color: '#000',
  },
  listContainer: { 
    paddingHorizontal: 20, 
    paddingBottom: 24,
    paddingTop: 5,
  },
  listItem: {
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 8, 
    backgroundColor: '#ffffff',
    minHeight: 88,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: { 
    width: 36, 
    height: 36, 
    borderRadius: 18,
  },
  infoContainer: { 
    flex: 1,
  },
  symbol: { 
    fontSize: 16, 
    fontWeight: "700", 
    marginBottom: 2,
    color: '#000',
  },
  network: { 
    fontSize: 12, 
    fontWeight: "500", 
    color: '#666',
  },
  rightSection: {
    alignItems: "flex-end",
    minWidth: 120,
  },
  amount: { 
    fontSize: 14, 
    fontWeight: "600", 
    marginBottom: 2,
    color: '#000',
    textAlign: 'right',
  },
  usdValue: { 
    fontSize: 15, 
    fontWeight: "700", 
    marginBottom: 4,
    color: '#000',
    textAlign: 'right',
  },
  changeContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  changeText: { 
    fontSize: 11, 
    fontWeight: "600",
    marginLeft: 4,
  },
  /* ================= RTL Styles ================= */
  listItemRTL: {
    flexDirection: 'row-reverse',
  },
  leftSectionRTL: {
    flexDirection: 'row-reverse',
  },
  iconContainerRTL: {
    marginRight: 0,
    marginLeft: 12,
  },
  infoContainerRTL: {
    alignItems: 'flex-end',
  },
  rightSectionRTL: {
    alignItems: 'flex-start',
  },
  textRight: {
    textAlign: 'right',
  },
  textLeft: {
    textAlign: 'left',
  },
  hideZeroContainerRTL: {
    flexDirection: 'row-reverse',
  },
});