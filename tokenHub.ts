// tokenHub.ts — Polygon hub (read/write RPCs) + MATIC/USDT/USDC
import { ethers, BigNumber } from "ethers";
import { rpc } from "./providers";

/* ================== 1) RPCs (قراءة/إرسال) ================== */
// استخدام الروابط من providers.ts بدلاً من الروابط المباشرة
const POLYGON_READ_RPC  = rpc("polygon");
const POLYGON_WRITE_RPC = rpc("polygon");

// يسمح لك بتغييرها في وقت التشغيل (مثلاً من Settings)
export function setPolygonRPCs(opts: { read?: string; write?: string }) {
  if (opts.read)  polygonRead = makeProvider(opts.read);
  if (opts.write) polygonWrite = makeProvider(opts.write);
}

function makeProvider(url: string) {
  return new ethers.providers.StaticJsonRpcProvider(url, { chainId: 137, name: "polygon" });
}

let polygonRead  = makeProvider(POLYGON_READ_RPC);
let polygonWrite = makeProvider(POLYGON_WRITE_RPC);

function readProv()  { return polygonRead; }
function writeProv() { return polygonWrite ?? polygonRead; }

/* ================== 2) تعريف العملات ================== */
type TokenId = "MATIC@polygon" | "USDT@polygon" | "USDC@polygon" | "USDCe@polygon";

type TokenSpec = {
  id: TokenId;
  symbol: string;
  decimals: number;
  address: string | null; // null = native (MATIC)
};

const addr = (a: string) => ethers.utils.getAddress(a.toLowerCase());

export const TOKENS: Record<TokenId, TokenSpec> = {
  "MATIC@polygon": { id: "MATIC@polygon", symbol: "MATIC", decimals: 18, address: null },
  "USDT@polygon":  { id: "USDT@polygon",  symbol: "USDT",  decimals: 6,  address: addr("0xc2132d05d31c914a87c6611c10748aeb04b58e8f") },
  "USDC@polygon":  { id: "USDC@polygon",  symbol: "USDC",  decimals: 6,  address: addr("0x3c499c542cef5e3811e1192ce70d8cc03d5c3359") }, // الجديد
  "USDCe@polygon": { id: "USDCe@polygon", symbol: "USDC",  decimals: 6,  address: addr("0x2791bca1f2de4661ed88a30c99a7a9449aa84174") }, // القديم
};

/* ================== 3) رسوم Polygon (EIP-1559 + min tip 25 gwei) ================== */
const MIN_PRIORITY_GWEI = "25";
async function getPriorityFee(p: ethers.providers.Provider) {
  try { const hex = await (p as any).send("eth_maxPriorityFeePerGas", []); if (hex) return BigNumber.from(hex); } catch {}
  return ethers.utils.parseUnits(MIN_PRIORITY_GWEI, "gwei");
}
async function polygonFees(p: ethers.providers.Provider) {
  const fd = await p.getFeeData();
  const rawPrio = fd.maxPriorityFeePerGas ?? (await getPriorityFee(p));
  const latest = await (p as any).send("eth_getBlockByNumber", ["latest", false]);
  const base = latest?.baseFeePerGas ? BigNumber.from(latest.baseFeePerGas) : null;

  if (base) {
    const minPrio = ethers.utils.parseUnits(MIN_PRIORITY_GWEI, "gwei");
    let maxPriorityFeePerGas = rawPrio.lt(minPrio) ? minPrio : rawPrio;
    let maxFeePerGas = base.mul(2).add(maxPriorityFeePerGas);
    if (fd.gasPrice && maxFeePerGas.lt(fd.gasPrice)) maxFeePerGas = fd.gasPrice;
    return { mode: "eip1559" as const, maxFeePerGas, maxPriorityFeePerGas };
  }
  const gasPrice = fd.gasPrice ?? BigNumber.from(await (p as any).send("eth_gasPrice", []));
  return { mode: "legacy" as const, gasPrice };
}

/* ================== 4) ABI ERC-20 ================== */
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address,uint256) returns (bool)",
];

/* ================== 5) قراءة الرصيد ================== */
export async function getBalance(opts: { token: TokenId; address: string }) {
  const t = TOKENS[opts.token];
  if (!t) throw new Error("Unknown token");
  const a = ethers.utils.getAddress(opts.address);

  try {
    if (!t.address) {
      const wei = await readProv().getBalance(a);
      return ethers.utils.formatUnits(wei, t.decimals);
    } else {
      const c = new ethers.Contract(t.address, ERC20_ABI, readProv());
      const dec = t.decimals || (await c.decimals().catch(() => 18));
      const raw = await c.balanceOf(a);
      return ethers.utils.formatUnits(raw, dec);
    }
  } catch (e: any) {
    console.log("[getBalance error]", e?.message || e);
    return "0";
  }
}

/* (اختياري) تقدير رسوم العرض بالـ MATIC */
export async function estimateNetworkFee(opts: { token: TokenId; from: string; to: string; amount: string }) {
  const t = TOKENS[opts.token]; if (!t) throw new Error("Unknown token");
  const from = ethers.utils.getAddress(opts.from), to = ethers.utils.getAddress(opts.to || from);
  const p = readProv();

  try {
    if (!t.address) {
      const value = ethers.utils.parseUnits(opts.amount || "0", t.decimals);
      let gas = await p.estimateGas({ from, to, value }).catch(() => BigNumber.from(21000));
      if (gas.lt(21000)) gas = BigNumber.from(21000);
      const fees = await polygonFees(p);
      const cost = fees.mode === "eip1559" ? gas.mul(fees.maxFeePerGas) : gas.mul(fees.gasPrice);
      return ethers.utils.formatEther(cost);
    } else {
      const dummy = new ethers.Wallet("0x" + "0".repeat(64), p);
      const c = new ethers.Contract(t.address, ERC20_ABI, dummy);
      const value = ethers.utils.parseUnits(opts.amount || "0", t.decimals);
      const gas = await c.estimateGas.transfer(to, value, { from }).catch(() => BigNumber.from(100000));
      const fees = await polygonFees(p);
      const cost = fees.mode === "eip1559" ? gas.mul(fees.maxFeePerGas) : gas.mul(fees.gasPrice);
      return ethers.utils.formatEther(cost);
    }
  } catch (e: any) {
    console.log("[estimateNetworkFee error]", e?.message || e);
    return "0";
  }
}

/* أقصى MATIC بعد خصم الرسوم (لزر إرسال الكل) */
export async function maxSendableNative(opts: { from: string; to: string; safetyBps?: number }) {
  const from = ethers.utils.getAddress(opts.from), to = ethers.utils.getAddress(opts.to);
  const p = readProv();
  const bal = await p.getBalance(from);
  const fees = await polygonFees(p);

  let gas = await p.estimateGas({ from, to, value: ethers.utils.parseEther("0.001") }).catch(() => BigNumber.from(21000));
  if (gas.lt(21000)) gas = BigNumber.from(21000);

  const gasWithMargin = gas.mul(10000 + (opts.safetyBps ?? 1000)).div(10000);
  const cost = fees.mode === "eip1559" ? gasWithMargin.mul(fees.maxFeePerGas) : gasWithMargin.mul(fees.gasPrice);

  if (bal.lte(cost)) return "0";
  return ethers.utils.formatEther(bal.sub(cost));
}

/* ================== 6) الإرسال — دائمًا عبر write RPC ================== */
export async function send(opts: { token: TokenId; privateKey: string; to: string; amount: string }) {
  const t = TOKENS[opts.token]; if (!t) throw new Error("Unknown token");
  const to = ethers.utils.getAddress(opts.to);
  const p = writeProv();
  const wallet = new ethers.Wallet(opts.privateKey, p);

  if (!t.address) {
    // Native MATIC
    const value = ethers.utils.parseUnits(opts.amount, t.decimals);
    const fees = await polygonFees(p);
    const gasLimit = await p.estimateGas({ from: wallet.address, to, value }).catch(() => BigNumber.from(21000));
    const txReq: ethers.providers.TransactionRequest =
      fees.mode === "eip1559"
        ? { to, value, gasLimit, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, type: 2, chainId: 137 }
        : { to, value, gasLimit, gasPrice: fees.gasPrice, chainId: 137 };
    const tx = await wallet.sendTransaction(txReq);
    await tx.wait(1);
    return tx.hash;
  } else {
    // ERC-20 (USDT/USDC)
    const c = new ethers.Contract(t.address, ERC20_ABI, wallet);
    const value = ethers.utils.parseUnits(opts.amount, t.decimals);
    const fees = await polygonFees(p);
    const gasLimit = await c.estimateGas.transfer(to, value).catch(() => BigNumber.from(100000));
    const overrides =
      fees.mode === "eip1559"
        ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, gasLimit, type: 2 }
        : { gasPrice: fees.gasPrice, gasLimit };
    const tx = await c.transfer(to, value, overrides);
    await tx.wait(1);
    return tx.hash;
  }
}