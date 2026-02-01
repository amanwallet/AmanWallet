// tronHub.ts - الإصدار النهائي (Keccak-256 + تأكيد التنفيذ)
// إصلاح مفاتيح TRON + تحسين إرسال TRC20 + فحص إيصال التنفيذ

import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";

// ==============================
// إعدادات الاتصال (RPC)
// ==============================
let PRIMARY_TRON_REST = "https://api.trongrid.io";
const FALLBACKS: string[] = [];

// ==============================
// أدوات عامة
// ==============================
export const SUN_PER_TRX = 1_000_000;

const hex = (u8: Uint8Array) =>
  Array.from(u8).map(b => b.toString(16).padStart(2, "0")).join("");

const fromHex = (h: string) => {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  const a = new Uint8Array(s.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16);
  return a;
};

const b64ToUtf8 = (b64: string) => {
  try {
    // @ts-ignore
    if (typeof atob === "function") return decodeURIComponent(escape(atob(b64)));
    // @ts-ignore
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return b64;
  }
};

// -------- Base58Check (TRON) --------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP: Record<string, number> = Object.fromEntries([...B58].map((c, i) => [c, i]));

function base58checkDecode(str: string): Uint8Array {
  let num = 0n;
  for (const c of str) {
    const v = B58_MAP[c];
    if (v === undefined) throw new Error("Invalid base58");
    num = num * 58n + BigInt(v);
  }
  const tmp: number[] = [];
  while (num > 0n) {
    tmp.push(Number(num % 256n));
    num /= 256n;
  }
  const leading = [...str].findIndex(c => c !== "1");
  const payload = new Uint8Array(tmp.length + (leading < 0 ? 0 : leading));
  payload.set(tmp.reverse(), leading < 0 ? 0 : leading);
  return payload;
}

function sha256buf(d: Uint8Array) {
  return sha256(d) as Uint8Array;
}

function base58checkEncode(data: Uint8Array) {
  const h1 = sha256buf(data);
  const h2 = sha256buf(h1);
  const chk = h2.slice(0, 4);
  const full = new Uint8Array(data.length + 4);
  full.set(data, 0);
  full.set(chk, data.length);
  let num = 0n;
  for (const b of full) num = num * 256n + BigInt(b);
  let out = "";
  while (num > 0n) {
    const r = Number(num % 58n);
    num /= 58n;
    out = B58[r] + out;
  }
  for (let i = 0; i < full.length && full[i] === 0; i++) out = "1" + out;
  return out;
}

export const tronToBase58 = (addr: string) => {
  const a = (addr || "").trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) throw new Error("Invalid TRON address");
  return a;
};

const tronBase58To41Hex = (addrB58: string) => {
  const raw = base58checkDecode(addrB58);
  if (raw.length < 21) throw new Error("Bad TRON address bytes");
  return "41" + hex(raw.slice(1, 21));
};

export function tronHex41ToBase58(input: string) {
  const h = input.toLowerCase().replace(/^0x/, "");
  if (!h.startsWith("41") || h.length < 42) throw new Error("Not 41* address");
  const data = fromHex(h).slice(0, 21);
  return base58checkEncode(data);
}

// ==============================
// 🔧 توليد عنوان TRON من المفتاح الخاص
// ==============================
export function privateKeyToTronAddress(privateKeyHex: string): string {
  const cleanPk = privateKeyHex.replace(/^0x/, "");
  if (cleanPk.length !== 64)
    throw new Error(`المفتاح الخاص غير صالح: ${cleanPk.length} حرفًا بدلاً من 64`);
  try {
    const publicKey = secp256k1.getPublicKey(cleanPk, false);
    const publicKeyRaw = publicKey.slice(1);
    const pubHash = keccak_256(publicKeyRaw);
    const addr20 = pubHash.slice(12);
    const addressBytes = new Uint8Array(21);
    addressBytes[0] = 0x41;
    addressBytes.set(addr20, 1);
    return base58checkEncode(addressBytes);
  } catch (error: any) {
    throw new Error(`فشل توليد العنوان: ${error.message}`);
  }
}

export function normalizeTronAddress(anyAddr: string) {
  const v = (anyAddr || "").trim();
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v)) return v;
  if (/^(0x)?41[0-9a-fA-F]{40}$/.test(v)) return tronHex41ToBase58(v);
  throw new Error("العنوان ليس لشبكة TRON.");
}

// ==============================
// الاتصال بالشبكة
// ==============================
async function post(path: string, body: any) {
  const urls = [PRIMARY_TRON_REST, ...FALLBACKS];
  let lastErr: any = null;
  for (const base of urls) {
    try {
      const u = base.endsWith("/") ? base.slice(0, -1) : base;
      const r = await fetch(u + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("RPC unreachable");
}

// ==============================
// أرصدة
// ==============================
export async function tronGetTrxBalance(addrB58: string) {
  const addr41 = tronBase58To41Hex(tronToBase58(addrB58));
  const res = await post("/wallet/getaccount", { address: addr41, visible: false });
  return BigInt(res?.balance || 0);
}

// ✅ قراءة رصيد TRC20
export async function tronTrc20BalanceOf(contract: string, owner: string): Promise<bigint> {
  const to41 = (a: string) =>
    /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) ? tronBase58To41Hex(a) : a.replace(/^0x/i, "");
  const contract41 = to41(contract);
  const owner41 = to41(owner);
  const owner20 = owner41.slice(2);
  const parameter = owner20.padStart(64, "0");
  const res = await post("/wallet/triggerconstantcontract", {
    owner_address: owner41,
    contract_address: contract41,
    function_selector: "balanceOf(address)",
    parameter,
    visible: false,
  });
  const hexVal = res?.constant_result?.[0] || "0";
  return BigInt("0x" + hexVal);
}

// ==============================
// بناء معاملات
// ==============================
export async function tronBuildTrxTransfer(fromB58: string, toB58: string, amountSun: bigint) {
  const from41 = tronBase58To41Hex(fromB58);
  const to41 = tronBase58To41Hex(toB58);
  const tx = await post("/wallet/createtransaction", {
    to_address: to41,
    owner_address: from41,
    amount: Number(amountSun),
    visible: false,
  });
  if (!tx?.raw_data_hex) throw new Error("Failed to build TRX tx");
  return tx;
}

export async function tronBuildTrc20Transfer(
  contractB58: string,
  fromB58: string,
  toB58: string,
  amount: bigint,
  feeLimitSun: bigint
) {
  const contract41 = tronBase58To41Hex(contractB58);
  const from41 = tronBase58To41Hex(fromB58);
  const to41 = tronBase58To41Hex(toB58);
  const parameter = to41.slice(2).padStart(64, "0") + amount.toString(16).padStart(64, "0");
  const res = await post("/wallet/triggersmartcontract", {
    owner_address: from41,
    contract_address: contract41,
    function_selector: "transfer(address,uint256)",
    parameter,
    fee_limit: Number(feeLimitSun),
    visible: false,
  });
  const tx = res?.transaction ?? res;
  if (!tx?.raw_data_hex) throw new Error("Failed to build TRC20 tx");
  return tx;
}

// ==============================
// التوقيع المحلي
// ==============================
export function tronSignTx(unsigned: any, pkHex: string) {
  const raw = fromHex(unsigned.raw_data_hex);
  const txHash = sha256(raw);
  const cleanPk = pkHex.replace(/^0x/, "");
  if (cleanPk.length !== 64) throw new Error(`المفتاح الخاص غير صالح`);
  const expectedAddress = privateKeyToTronAddress(cleanPk);
  const fromAddress = tronHex41ToBase58(unsigned.raw_data.contract[0].parameter.value.owner_address);
  if (expectedAddress !== fromAddress)
    throw new Error("❌ المفتاح لا يتطابق مع العنوان المرسل");
  const signature = secp256k1.sign(txHash, cleanPk);
  const sigBytes = signature.toCompactRawBytes();
  const recId = signature.recovery!;
  const signatureHex = hex(sigBytes) + recId.toString(16).padStart(2, "0");
  const txID = hex(txHash);
  return { ...unsigned, signature: [signatureHex], txID };
}

// ==============================
// فحص التنفيذ (إضافة جديدة)
// ==============================
const TRANSFER_TOPIC =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function getTxInfo(txID: string) {
  try {
    const info = await post("/wallet/gettransactioninfobyid", { value: txID });
    return info || null;
  } catch {
    return null;
  }
}
function hexNo0x(s: string) {
  return (s || "").replace(/^0x/i, "");
}
async function waitForConfirmation(txID: string, contractB58?: string, timeoutMs = 30000, pollMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  const contract41 = contractB58 ? tronBase58To41Hex(contractB58).toLowerCase() : null;
  while (Date.now() < deadline) {
    const info = await getTxInfo(txID);
    if (info && info.receipt) {
      const status = (info.receipt.result || "").toString().toUpperCase();
      if (status === "SUCCESS") {
        const logs = Array.isArray(info.log) ? info.log : [];
        if (!contract41) return { ok: true, info };
        const ok = logs.some((lg: any) => {
          const addrOk = hexNo0x(lg.address).toLowerCase() === hexNo0x(contract41!).toLowerCase();
          const topics = (lg.topics || []).map((t: string) => hexNo0x(t).toLowerCase());
          const isTransfer = topics[0] === TRANSFER_TOPIC;
          return addrOk && isTransfer;
        });
        return { ok, info };
      }
      const reasonHex = (info.contractResult?.[0] || "").toString();
      const fee = info.fee || 0;
      return { ok: false, info, error: `فشل تنفيذ العقد (status=${status}).`, reasonHex, fee };
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  return { ok: false, error: "انتهى وقت الانتظار لتأكيد المعاملة." };
}

// ==============================
// بث
// ==============================
export async function tronBroadcast(signedTx: any) {
  const res = await post("/wallet/broadcasttransaction", signedTx);
  if (res?.result === true)
    return { ...res, txID: signedTx?.txID || res?.txid || res?.txID };
  const msg = res?.message ? b64ToUtf8(res.message) : "";
  const low = (msg || "").toLowerCase();
  if (low.includes("bandwidth") || low.includes("energy")) {
    const retry = await post("/wallet/broadcasttransaction", signedTx);
    if (retry?.result === true)
      return { ...retry, txID: signedTx?.txID || retry?.txid || retry?.txID };
    throw new Error("⚠️ الطاقة/النطاق منخفض. اترك 20–30 TRX.");
  }
  if (low.includes("sig") || low.includes("signature"))
    throw new Error("❌ توقيع غير صالح.");
  if (low.includes("contract_validate_error"))
    throw new Error("❌ العقد رفض العملية.");
  throw new Error(`فشل البث: ${msg || JSON.stringify(res)}`);
}

// ==============================
// إرسال تلقائي TRX / TRC20
// ==============================
export const toSun = (trx: number | string) => BigInt(Math.round(Number(trx) * SUN_PER_TRX));
export const fromSun = (sun: bigint) => Number(sun) / SUN_PER_TRX;

export async function sendTrxAuto(fromAny: string, toAny: string, amountTrx: number | string, privateKeyHex: string) {
  const from = normalizeTronAddress(fromAny);
  const to = normalizeTronAddress(toAny);
  const expected = privateKeyToTronAddress(privateKeyHex);
  if (expected !== from) throw new Error("❌ المفتاح لا يطابق العنوان المرسل");
  const unsigned = await tronBuildTrxTransfer(from, to, toSun(amountTrx));
  const signed = tronSignTx(unsigned, privateKeyHex);
  const res = await tronBroadcast(signed);
  return res;
}

export async function sendTrc20Auto(contractB58: string, fromAny: string, toAny: string, amountUnits: bigint, privateKeyHex: string) {
  const from = normalizeTronAddress(fromAny);
  const to = normalizeTronAddress(toAny);
  const expected = privateKeyToTronAddress(privateKeyHex);
  if (expected !== from) throw new Error("❌ المفتاح لا يطابق العنوان المرسل");

  const limits = [10_000_000n, 30_000_000n, 50_000_000n];
  let lastErr: any = null;
  for (const limit of limits) {
    try {
      const unsigned = await tronBuildTrc20Transfer(contractB58, from, to, amountUnits, limit);
      const signed = tronSignTx(unsigned, privateKeyHex.trim().replace(/^0x/, ""));
      const res = await tronBroadcast(signed);
      const txID = res?.txID || signed?.txID;
      const confirm = await waitForConfirmation(txID, contractB58, 40000, 1500);
      if (!confirm.ok) throw new Error(`❌ فشل التنفيذ: ${confirm.error || "غير معروف"}`);
      return { ...res, confirmed: true, txID, fee_limit_used: limit };
    } catch (e: any) {
      const m = (e?.message || "").toLowerCase();
      lastErr = e;
      if (m.includes("energy") || m.includes("bandwidth") || m.includes("contract")) continue;
      break;
    }
  }
  throw lastErr || new Error("فشل إرسال TRC20 بعد محاولات.");
}

export async function tronPing() {
  try {
    const b = await post("/wallet/getnowblock", {});
    return !!b?.blockID;
  } catch {
    return false;
  }
}
