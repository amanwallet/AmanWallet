// providerAdapter.ts - الإصدار المصحح والمدمج بعد إزالة SEI و XLM
import { ethers } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
// XRPL الإصدار الجديد
import { Client, Wallet, xrpToDrops, dropsToXrp } from "xrpl";
import axios from "axios";

import { rpc } from "./providers";
import Abe from "./Abe";

// ============ XRPL Client Setup ============

let xrplClient: Client | null = null;
async function getXrplClient(): Promise<Client> {
  if (!xrplClient) xrplClient = new Client(Abe.xrplWss());
  if (xrplClient.isConnected()) return xrplClient;
  await xrplClient.connect();
  return xrplClient;
}

// ------------------
// EVM SUPPORT - الإصدار المصحح باستخدام الخريطة الموحدة
// ------------------
export type EvmChain = "ethereum" | "arbitrum" | "polygon" | "bsc" | "base";

export function getProvider(chain: EvmChain = "ethereum") {
  const url = rpc(chain);
  if (!url) throw new Error(`RPC missing for ${chain}`);
  return new ethers.providers.JsonRpcProvider(url);
}

export function getWallet(privateKey: string, chain: EvmChain = "ethereum") {
  return new ethers.Wallet(privateKey, getProvider(chain));
}

export async function getNativeBalance(chain: EvmChain, address: string): Promise<string> {
  const p = getProvider(chain);
  const bal = await p.getBalance(address);
  return ethers.utils.formatEther(bal);
}

export async function sendNativeTx(params: {
  chain: EvmChain;
  privateKey: string;
  to: string;
  amountEth: string;
}): Promise<string> {
  const p = getProvider(params.chain);
  const w = new ethers.Wallet(params.privateKey, p);
  const tx = await w.sendTransaction({ 
    to: params.to, 
    value: ethers.utils.parseEther(params.amountEth)
  });
  const rec = await tx.wait();
  return rec?.hash ?? tx.hash;
}

// إضافة دالة sendNative للتوافق
export const sendNative = (chain: EvmChain, privateKey: string, to: string, amountEth: string) =>
  sendNativeTx({ chain, privateKey, to, amountEth });

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export async function getERC20Balance(params: {
  chain: EvmChain;
  holder: string;
  token: string;
  decimals?: number;
}): Promise<string> {
  const c = new ethers.Contract(params.token, ERC20_ABI, getProvider(params.chain));
  const [raw, dec] = await Promise.all([
    c.balanceOf(params.holder),
    params.decimals !== undefined ? params.decimals : c.decimals(),
  ]);
  return ethers.utils.formatUnits(raw, dec as number);
}

export async function sendERC20(params: {
  chain: EvmChain;
  privateKey: string;
  token: string;
  to: string;
  amount: string;
  decimals?: number;
}): Promise<string> {
  const wallet = getWallet(params.privateKey, params.chain);
  const c = new ethers.Contract(params.token, ERC20_ABI, wallet);
  const dec = params.decimals !== undefined ? params.decimals : await c.decimals();
  const value = ethers.utils.parseUnits(params.amount, dec);
  const tx = await c.transfer(params.to, value);
  await tx.wait();
  return tx.hash!;
}

// إضافة دوال LINK ERC-20
const LINK_ETH_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";

export function getERC20Balance_LINK(holder: string): Promise<string> {
  return getERC20Balance({
    chain: "ethereum",
    holder,
    token: LINK_ETH_ADDRESS,
    decimals: 18,
  });
}

export function sendLINK(privateKey: string, to: string, amount: string): Promise<string> {
  return sendERC20({
    chain: "ethereum",
    privateKey,
    token: LINK_ETH_ADDRESS,
    to,
    amount,
    decimals: 18,
  });
}

// ------------------
// BITCOIN SUPPORT
// ------------------
const BTC_RPC = Abe.getRpc('btc');

/**
 * Get BTC balance (in BTC units)
 */
export async function getBTCBalance(address: string): Promise<string> {
  try {
    const res = await axios.post(BTC_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    });
    const satoshis = res.data?.result?.balance || 0;
    return (Number(satoshis) / 1e8).toFixed(8);
  } catch (error) {
    console.error('BTC balance fetch failed:', error);
    return "0.00000000";
  }
}

/**
 * Send BTC transaction from WIF
 */
export async function sendBTCFromWIF(params: {
  fromWIF: string;
  to: string;
  amountBTC: string;
}): Promise<string> {
  const network = bitcoin.networks.bitcoin;
  const keyPair = bitcoin.ECPair.fromWIF(params.fromWIF, network);
  const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });
  if (!address) throw new Error("فشل توليد عنوان من WIF");
  throw new Error("وظيفة إرسال BTC تتطلب خدمة UTXO (غير مدعومة مباشرة عبر Ankr RPC).");
}

// ============ XRPL SUPPORT - الإصدار المحسن الجديد ============

// توليد المفاتيح
export async function ensureXRPKeys() {
  const addr = await getItem("xrp_address");
  const seed = await getItem("xrp_secret");
  if (addr && seed) return { address: addr, seed };

  const mnemonic = await getOrCreateMnemonic();
  const wallet = Wallet.fromMnemonic(mnemonic, { derivationPath: "m/44'/144'/0'/0/0" });

  if (!wallet.seed) throw new Error("XRP seed missing");
  await saveItem("xrp_address", wallet.address);
  await saveItem("xrp_secret", wallet.seed);
  return { address: wallet.address, seed: wallet.seed };
}

// جلب الرصيد
export async function getXRPBalance(address: string): Promise<string> {
  const c = await getXrplClient();
  try {
    const r = await c.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });
    const drops = r.result?.account_data?.Balance ?? "0";
    return (Number(drops) / 1e6).toFixed(6);
  } catch (e: any) {
    if (e?.data?.error === "actNotFound" || String(e?.message||"").includes("actNotFound")) {
      return "0.000000";
    }
    return "0.000000";
  }
}

// إرسال XRP - الإصدار المحسن لدعم كل من seed و mnemonic
export async function sendXRP(params: {
  seed: string;
  to: string;
  amountXRP: string;
  destinationTag?: number;
  memo?: string;
}): Promise<string> {
  const c = await getXrplClient();
  
  // تحديد نوع المفتاح وإنشاء المحفظة المناسبة
  const secret = params.seed.trim();
  let wallet: Wallet;
  
  if (secret.startsWith('s')) {
    // إذا كان seed (يبدأ بـ s)
    wallet = Wallet.fromSeed(secret);
  } else {
    // إذا كان mnemonic
    wallet = Wallet.fromMnemonic(secret, { derivationPath: "m/44'/144'/0'/0/0" });
  }

  const payment: any = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: params.to,
    Amount: xrpToDrops(params.amountXRP),
  };
  
  if (params.destinationTag != null) payment.DestinationTag = params.destinationTag;
  if (params.memo) {
    payment.Memos = [{ Memo: { MemoData: Buffer.from(params.memo, "utf8").toString("hex") } }];
  }

  const prepared = await c.autofill(payment);
  const signed = wallet.sign(prepared);
  const res = await c.submitAndWait(signed.tx_blob);
  return res.result?.hash || "";
}

// ------------------
// LINK ERC-20 SUPPORT
// ------------------
export async function getLINKBalance(address: string): Promise<string> {
  return getERC20Balance_LINK(address);
}

export async function sendLINKBalance(params: {
  privateKey: string;
  to: string;
  amount: string;
}): Promise<string> {
  return sendLINK(params.privateKey, params.to, params.amount);
}

// ------------------
// دوال مساعدة للتخزين (مطلوبة لـ ensureXRPKeys)
async function getItem(key: string): Promise<string | null> {
  try {
    // افترض أن لديك وظيفة تخزين مناسبة
    return localStorage?.getItem(key) || null;
  } catch {
    return null;
  }
}

async function saveItem(key: string, value: string): Promise<void> {
  try {
    localStorage?.setItem(key, value);
  } catch (error) {
    console.warn(`Failed to save ${key}:`, error);
  }
}

async function getOrCreateMnemonic(): Promise<string> {
  // هذه دالة افتراضية - يجب استبدالها بتنفيذك الفعلي
  const existing = await getItem("wallet_mnemonic");
  if (existing) return existing;
  
  const newMnemonic = ethers.Wallet.createRandom().mnemonic.phrase;
  await saveItem("wallet_mnemonic", newMnemonic);
  return newMnemonic;
}

// =============================================================================
// دوال إضافية للتوافق مع المكونات الأخرى
// =============================================================================

// دالة للحصول على رصيد أي شبكة EVM
export async function getEvmBalance(chain: EvmChain, address: string): Promise<string> {
  return getNativeBalance(chain, address);
}

// دالة عامة لإرسال العملات الأصلية
export async function sendEvmNative(params: {
  chain: EvmChain;
  privateKey: string;
  to: string;
  amount: string;
}): Promise<string> {
  return sendNativeTx({
    chain: params.chain,
    privateKey: params.privateKey,
    to: params.to,
    amountEth: params.amount
  });
}

// =============================================================================
// التصدير الرئيسي
// =============================================================================

export default {
  // EVM Functions
  getProvider,
  getWallet,
  getNativeBalance,
  sendNativeTx,
  sendNative,
  getERC20Balance,
  sendERC20,
  getERC20Balance_LINK,
  sendLINK,
  
  // Bitcoin Functions
  getBTCBalance,
  sendBTCFromWIF,
  
  // XRPL Functions
  ensureXRPKeys,
  getXRPBalance,
  sendXRP,
  
  // LINK Functions
  getLINKBalance,
  sendLINKBalance,
  
  // دوال إضافية
  getEvmBalance,
  sendEvmNative,
};