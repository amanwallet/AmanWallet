// providers.ts - الملف الموحد والمصحح بعد إزالة SEI و XLM
import Constants from 'expo-constants';
import Abe from "./Abe";

// === أنواع الشبكات ===
export type EvmChain = "ethereum" | "polygon" | "bsc" | "arbitrum" | "base" | "bnb";
export type NetworkKey = "ethereum" | "polygon" | "bsc" | "arbitrum" | "base" | "solana" | "bitcoin" | "xrp";

// === خريطة RPC الموحدة - المصدر الوحيد للروابط ===
export const EVM_RPC_MAP: Record<EvmChain, string> = {
  ethereum: Abe.getRpc(1),
  polygon: Abe.getRpc(137),
  bsc: Abe.getRpc(56),
  arbitrum: Abe.getRpc(42161),
  base: Abe.getRpc(8453),
  bnb: Abe.getRpc(56),
};

// === روابط فعلية ===
export const PROVIDERS = {
  ankr: {
    multichain: Abe.getRpc('multichain'),
    eth: EVM_RPC_MAP.ethereum,
    polygon: EVM_RPC_MAP.polygon,
    bsc: EVM_RPC_MAP.bsc,
    arbitrum: EVM_RPC_MAP.arbitrum,
    base: EVM_RPC_MAP.base,
    btc_blockbook: Abe.getRpc('btc_blockbook'),
    btc_rpc: Abe.getRpc('btc'),
  },

  public: {
    solana: Abe.solanaRpc(),
    blockstream: Abe.btcApi(),
  },

  // الشبكات الجديدة المضافة
  xrpl: {
    wss: Abe.xrplWss(),
  },
};

// === RPC === (للتوافق مع الكود القديم)
export const RPC = EVM_RPC_MAP;

// === XRPL ===
export const XRPL = {
  wss: Abe.xrplWss(),
} as const;

// === NETWORKS ===
export const NETWORKS = {
  xrpl: {
    wss: Abe.xrplWss(),
  },
  ethereum: { key: "ethereum", label: "Ethereum (Ankr)", currency: "ETH" },
  polygon: { key: "polygon", label: "Polygon (Ankr)", currency: "MATIC" },
  bsc: { key: "bsc", label: "BSC (Ankr)", currency: "BNB" },
  arbitrum: { key: "arbitrum", label: "Arbitrum One", currency: "ETH" },
  base: { key: "base", label: "Base (Ankr)", currency: "ETH" },
  solana: { key: "solana", label: "Solana Mainnet", currency: "SOL" },
  bitcoin: { key: "bitcoin", label: "Bitcoin", currency: "BTC" },
  xrp: { key: "xrp", label: "XRP Ledger", currency: "XRP" },
};

// === APIs الأسعار ===
export const PRICE_PROVIDERS = {
  coingecko: {
    btcUsd: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    solUsd: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    ethUsd: "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    maticUsd: "https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=usd",
    bnbUsd: "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd",
    xrpUsd: "https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd",
  },
  coindesk: {
    btcUsd: "https://api.coindesk.com/v1/bpi/currentprice/USD.json"
  },
  jupiter: {
    solUsd: "https://price.jup.ag/v6/price?ids=SOL"
  }
};

// === APIs المستكشفات ===
export const EXPLORER_API = {
  polygonscan: "https://api.polygonscan.com/api",
  etherscan: "https://api.etherscan.io/api", 
  bscscan: "https://api.bscscan.com/api",
};

// === روابط المعاملات ===
export const EXPLORER_TX = {
  ethereum: (txHash: string) => `https://etherscan.io/tx/${txHash}`,
  polygon: (txHash: string) => `https://polygonscan.com/tx/${txHash}`,
  bsc: (txHash: string) => `https://bscscan.com/tx/${txHash}`,
  solana: (sig: string) => `https://solscan.io/tx/${sig}`,
  bitcoin: (txid: string) => `https://mempool.space/tx/${txid}`,
  arbitrum: (h: string) => `https://arbiscan.io/tx/${h}`,
  xrp: (h: string) => `https://xrpscan.com/tx/${h}`,
};

// === روابط العناوين ===
export const EXPLORER_ADDRESS = {
  ethereum: (addr: string) => `https://etherscan.io/address/${addr}`,
  polygon: (addr: string) => `https://polygonscan.com/address/${addr}`,
  bsc: (addr: string) => `https://bscscan.com/address/${addr}`,
  solana: (addr: string) => `https://solscan.io/account/${addr}`,
  bitcoin: (addr: string) => `https://mempool.space/address/${addr}`,
  arbitrum: (addr: string) => `https://arbiscan.io/address/${addr}`,
  xrp: (addr: string) => `https://xrpscan.com/account/${addr}`,
};

// === EXPLORER ===
export const EXPLORER = {
  ethereum: {
    address: (a: string) => `https://etherscan.io/address/${a}`,
    tx: (h: string) => `https://etherscan.io/tx/${h}`,
  },
  xrp: {
    address: (a: string) => `https://xrpscan.com/account/${a}`,
    tx: (h: string) => `https://xrpscan.com/tx/${h}`,
  },
};

// =============================================================================
// دوال EVM والشبكات الأخرى
// =============================================================================

// دوال مختصرة للوصول للروابط - تستخدم الخريطة الموحدة
export const rpc = (chain: EvmChain): string => EVM_RPC_MAP[chain];
export const ankrMulti = () => Abe.getRpc('multichain');
export const btcBlockbook = () => Abe.getRpc('btc_blockbook');
export const btcRpc = () => Abe.getRpc('btc');
export const solanaRpc = () => Abe.solanaRpc();
export const btcBlockstream = () => Abe.btcApi();
export const arbRpc = () => EVM_RPC_MAP.arbitrum;

// =============================================================================
// تسميات الشبكات والإعدادات
// =============================================================================

export const NETWORK_NAMES = {
  ethereum: "Ethereum Mainnet", 
  polygon: "Polygon Mainnet",
  bsc: "Binance Smart Chain",
  solana: "Solana Mainnet",
  bitcoin: "Bitcoin Mainnet",
  xrp: "XRP Ledger Mainnet",
};

export const networkLabel = (
  key: keyof typeof NETWORKS,
  withVendor = true
) => {
  const raw = NETWORKS[key]?.label || String(key);
  if (withVendor) return raw;
  return raw.replace(/\s*\(.*?\)\s*$/g, "").trim();
};

// =============================================================================
// دوال مساعدة للاتصال والاختبار
// =============================================================================

/** اختبار اتصال RPC */
export const testRpcConnection = async (rpcUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1
      })
    });

    if (!response.ok) return false;
    
    const data = await response.json();
    return !data.error && data.result;
  } catch (error) {
    console.error('RPC connection test failed:', error);
    return false;
  }
};

// =============================================================================
// تصدير كل الدوال والثوابت
// =============================================================================

export default {
  // الروابط الأساسية
  PROVIDERS,
  PRICE_PROVIDERS,
  EXPLORER_API,
  EXPLORER_TX,
  EXPLORER_ADDRESS,
  EXPLORER,
  
  // RPC والشبكات الجديدة
  RPC,
  XRPL,
  NETWORKS,
  EVM_RPC_MAP,
  
  // دوال الشبكات
  rpc,
  ankrMulti,
  btcBlockbook,
  btcRpc,
  solanaRpc,
  btcBlockstream,
  arbRpc,
  
  // المعلومات
  NETWORK_NAMES,
  networkLabel,
  
  // الاختبار
  testRpcConnection,
};