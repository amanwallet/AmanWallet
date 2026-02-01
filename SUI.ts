// SUI.ts — ملف كامل: توليد mnemonic صالح + اشتقاق keypair + إرسال حقيقي
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import * as SecureStore from 'expo-secure-store';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import nacl from 'tweetnacl';
import Abe from "./Abe"; // [تمت الإضافة]

export const SUI_DECIMALS = 9;
export const MIST_PER_SUI = 10 ** SUI_DECIMALS;
// عدّل هذا RPC إذا تريد testnet/devnet أو مزوّد آخر
export const SUI_RPC = Abe.getRpc('sui'); // [تم التعديل]

/* ----------------- Utilities ----------------- */
function normalizeMnemonic(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.mnemonic === 'string') return o.mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    if (typeof o.phrase === 'string') return o.phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  return '';
}

function hmacSha512(key: Uint8Array | string, data: Uint8Array | string): Uint8Array {
  const mac = hmac.create(sha512, key);
  mac.update(data);
  return mac.digest();
}

/* ----------------- SLIP-0010 (ed25519) ----------------- */
const SUI_PATH = "m/44'/784'/0'/0'/0'";

function parsePath(path: string): number[] {
  if (!path || path === 'm') return [];
  const parts = path.split('/');
  if (parts[0] !== 'm') throw new Error('Invalid path');
  return parts.slice(1).map((p) => {
    const hardened = p.endsWith("'");
    const n = parseInt(hardened ? p.slice(0, -1) : p, 10);
    if (!Number.isFinite(n)) throw new Error('Invalid path index');
    return (n | 0x80000000) >>> 0;
  });
}

function slip10Master(seed: Uint8Array) {
  const I = hmacSha512('ed25519 seed', seed);
  return { key: I.slice(0, 32), chain: I.slice(32) };
}

function concatBytes(...parts: Uint8Array[]) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function ser32(i: number) {
  return Uint8Array.of((i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255);
}

function slip10Derive(seed: Uint8Array, path: string): Uint8Array {
  let { key, chain } = slip10Master(seed);
  for (const idx of parsePath(path)) {
    const data = concatBytes(Uint8Array.of(0x00), key, ser32(idx));
    const I = hmacSha512(chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key; // 32-byte seed for Ed25519
}

/* ----------------- Sui client ----------------- */
export function getSuiClient(): SuiClient {
  return new SuiClient({ url: SUI_RPC });
}

/* ----------------- Keypair derivation (compatible) ----------------- */
async function keypairFromMnemonicCompat(mnemonic: string): Promise<Ed25519Keypair> {
  // حاول استخدام أي دالة مدمجة في المكتبة أولاً (بعض إصدارات mysten قد تحتوي على helper)
  const maybeDerive = (Ed25519Keypair as any)?.deriveKeypair as
    | ((mnemonic: string, path?: string) => Ed25519Keypair)
    | undefined;

  if (typeof maybeDerive === 'function') {
    try {
      return maybeDerive(mnemonic, SUI_PATH);
    } catch {
      // fallthrough to manual
    }
  }

  // fallback: SLIP-0010 -> tweetnacl -> fromSecretKey
  const seed = mnemonicToSeedSync(mnemonic); // 64 bytes
  const seed32 = slip10Derive(Uint8Array.from(seed), SUI_PATH); // 32 bytes
  const kp = nacl.sign.keyPair.fromSeed(seed32); // secretKey 64 bytes

  // بعض إصدارات Ed25519Keypair تقبل fromSecretKey (64 bytes), وبعضها تتطلب شكل آخر.
  if (typeof (Ed25519Keypair as any).fromSecretKey === 'function') {
    try {
      return (Ed25519Keypair as any).fromSecretKey(Uint8Array.from(kp.secretKey));
    } catch {
      // continue to manual construction
    }
  }

  // محاولة بناء keypair يدويًا إن لم تتوفر fromSecretKey
  try {
    // البعض يملك ctor أو واجهة داخلية؛ هذا حل احتياطي
    const secret64 = Uint8Array.from(kp.secretKey);
    // إذا المكتبة تتطلب 32 بايت seed في fromSecretKey، حاول استخدامها بالحالة المناسبة
    if (typeof (Ed25519Keypair as any).fromSeed === 'function') {
      try {
        return (Ed25519Keypair as any).fromSeed(seed32);
      } catch {}
    }

    // آخر حل: استخدم fromSecretKey على المكونات إن كانت متاحة
    return (Ed25519Keypair as any).fromSecretKey
      ? (Ed25519Keypair as any).fromSecretKey(secret64)
      : (() => { throw new Error('Ed25519Keypair.fromSecretKey not available'); })();
  } catch (e) {
    console.error('keypairFromMnemonicCompat failed', e);
    throw e;
  }
}

/* ----------------- Exports: keypair/address ----------------- */
export async function suiKeypairFromMnemonic(raw: unknown): Promise<Ed25519Keypair> {
  const m = normalizeMnemonic(raw);
  if (!m || !validateMnemonic(m, english)) {
    throw new Error('Invalid mnemonic phrase');
  }
  return await keypairFromMnemonicCompat(m);
}

export async function suiAddressFromMnemonic(raw: unknown): Promise<string> {
  const kp = await suiKeypairFromMnemonic(raw);
  // طرق الحصول على العنوان قد تختلف حسب الإصدار
  if (typeof (kp as any).getPublicKey === 'function' && typeof (kp as any).getPublicKey().toSuiAddress === 'function') {
    return (kp as any).getPublicKey().toSuiAddress();
  }
  if (typeof (kp as any).toSuiAddress === 'function') {
    return (kp as any).toSuiAddress();
  }
  // آخر خيار: استخراج public key ثم تحويله (اعتماداً على mysten utils - نترك fallback خطأ واضح)
  throw new Error('Cannot derive SUI address from keypair (incompatible Ed25519Keypair API)');
}

/* ----------------- Converters ----------------- */
export function mistToSui(mist: string | number | bigint): string {
  const v = BigInt(mist || 0);
  const whole = v / BigInt(MIST_PER_SUI);
  const frac = (v % BigInt(MIST_PER_SUI)).toString().padStart(SUI_DECIMALS, '0');
  return `${whole}.${frac}`.replace(/\.?0+$/, (m) => (m.startsWith('.') ? '.0' : '0'));
}

export function suiToMist(amount: string): string {
  if (!amount) return '0';
  const [w, f = ''] = amount.split('.');
  const whole = BigInt(w || '0');
  const frac = BigInt((f + '0'.repeat(SUI_DECIMALS)).slice(0, SUI_DECIMALS));
  return (whole * BigInt(MIST_PER_SUI) + frac).toString();
}

/* ----------------- Balance ----------------- */
export async function getSuiBalanceMist(address: string): Promise<string> {
  try {
    const client = getSuiClient();
    const bal = await client.getBalance({ owner: address });
    return bal.totalBalance || '0';
  } catch (err) {
    console.error('getSuiBalanceMist error', err);
    return '0';
  }
}

/* ----------------- Send (واقعي) ----------------- */
type SendParams = {
  mnemonic: unknown;
  to: string;
  amountMist: string | number | bigint;
  gasBudgetMist?: number;
};

export async function sendSuiNative({
  mnemonic, to, amountMist, gasBudgetMist = 10_000_000,
}: SendParams): Promise<{ digest: string; message: string }> {
  try {
    if (!to || !to.startsWith('0x')) throw new Error('عنوان الوجهة غير صالح');

    const keypair = await suiKeypairFromMnemonic(mnemonic);
    const client = getSuiClient();

    const txb = new TransactionBlock();
    txb.setGasBudget(Number(gasBudgetMist));

    const amtBig = BigInt(amountMist || 0);
    if (amtBig <= BigInt(0)) throw new Error('المبلغ غير صالح');

    // splitCoins and transferObjects usage — قد يفشل إن لم يكن هناك عملة كافية
    const coin = txb.splitCoins(txb.gas, [txb.pure(amtBig)]);
    txb.transferObjects([coin], txb.pure(to));

    // حاول API الحديث أولاً
    if (typeof (client as any).signAndExecuteTransactionBlock === 'function') {
      const res = await (client as any).signAndExecuteTransactionBlock({
        transactionBlock: txb,
        signer: keypair,
        options: { showEffects: true },
      });
      return { digest: res.digest, message: 'تم الإرسال بنجاح' };
    }

    // fallback لنسخ أقدم
    if (typeof (client as any).signAndExecuteTransaction === 'function') {
      const res = await (client as any).signAndExecuteTransaction({
        transaction: txb,
        signer: keypair,
        options: { showEffects: true },
      });
      return { digest: res.digest, message: 'تم الإرسال بنجاح' };
    }

    throw new Error('إصدار مكتبة Sui غير مدعوم لإرسال المعاملات');
  } catch (e: any) {
    console.error('Error sending SUI:', e);
    throw new Error(`فشل إرسال SUI: ${e?.message || e}`);
  }
}

/* ----------------- Persist / export ----------------- */
export async function persistSuiFromMnemonic(mnemonic: unknown): Promise<string> {
  const addr = await suiAddressFromMnemonic(mnemonic);
  await SecureStore.setItemAsync('sui_address', addr);
  return addr;
}

export async function getPersistedSuiAddress(): Promise<string | null> {
  return await SecureStore.getItemAsync('sui_address');
}

export async function exportPrivateKeyFromMnemonic(mnemonic: unknown): Promise<string> {
  const kp = await suiKeypairFromMnemonic(mnemonic);
  // حسب واجهة الإصدار، حاول استرجاع secret
  if (typeof (kp as any).getSecretKey === 'function') {
    const secret = (kp as any).getSecretKey();
    return bytesToHex(secret);
  }
  // أو from internal property
  if ((kp as any).keypair && (kp as any).keypair.secretKey) {
    return bytesToHex((kp as any).keypair.secretKey);
  }
  throw new Error('تعذر استخراج المفتاح الخاص من keypair هذا');
}

/* ----------------- Generate new wallet (mnemonic + persist) ----------------- */
export function generateNewSuiWallet(persist: boolean = true): { mnemonic: string; address: string } {
  // نولد mnemonic صالح (12 كلمة) باستخدام english wordlist
  const mnemonic = generateMnemonic(128); // 128 bits -> 12 words
  const norm = normalizeMnemonic(mnemonic);
  // نستخرج العنوان فورًا (non-blocking sync wrapper)
  // ملاحظة: استخراج العنوان يحتاج اشتقاق keypair (async) — سنفعل ذلك بمزامنة بواسطة then
  let address = '';
  suiAddressFromMnemonic(norm)
    .then((a) => {
      address = a;
      if (persist) SecureStore.setItemAsync('mnemonic', norm);
      if (persist) SecureStore.setItemAsync('sui_address', a);
    })
    .catch((e) => {
      console.error('generateNewSuiWallet: failed derive address', e);
    });

  return { mnemonic: norm, address };
}

/* ----------------- Utilities ----------------- */
export async function testSuiConnection(): Promise<'ok' | 'down'> {
  try {
    const client = getSuiClient();
    // استخدم نقطة نهاية حديثة متاحة
    await client.getChainIdentifier();
    return 'ok';
  } catch (err) {
    console.error('testSuiConnection error', err);
    return 'down';
  }
}

export function validateSuiMnemonic(raw: unknown): boolean {
  const m = normalizeMnemonic(raw);
  return !!m && validateMnemonic(m, english);
}

export function isValidSuiAddress(address: string): boolean {
  return /^0x[0-9a-f]{64}$/i.test(address);
}

export async function getSuiTransactions(address: string, limit: number = 10) {
  try {
    const client = getSuiClient();
    // قد تختلف دالة queryTransactions حسب الإصدار؛ هذه محاولة عامة
    if (typeof (client as any).queryTransactions === 'function') {
      return await (client as any).queryTransactions({ filter: { FromAddress: address }, limit, order: 'descending' });
    }
    // بديل: use getTransactions if متاح
    if (typeof (client as any).getTransactions === 'function') {
      return await (client as any).getTransactions({ address, limit });
    }
    return [];
  } catch (e) {
    console.error('Error fetching transactions:', e);
    return [];
  }
}