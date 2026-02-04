// walletUtils.ts - الدوال المشتركة للمحافظ (بدون SEI و XLM و SUI) - تم التعديل
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import * as secp from '@noble/secp256k1';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { sha256 as sha256_noble } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';

// TRON
import { privateKeyToTronAddress } from './tronHub';

// XRPL
import { Wallet as XRPLWallet } from 'xrpl';

/* ===== تنظيف وتوحيد العبارة السرية ===== */
export const normalizeMnemonic = (m: string): string => {
  if (!m) return '';
  return m.trim().toLowerCase().replace(/\s+/g, ' ');
};

/* ===== دوائر المساعدة ===== */
const fromHex = (hex: string) => {
  const cleanHex = hex.replace(/^0x/, '');
  if (cleanHex.length % 2 !== 0) throw new Error('Hex string must have even length');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
};

const U8 = (hex: string) => fromHex(hex);
const dsha = (u: Uint8Array) => sha256_noble(sha256_noble(u));
const join = (...a: Uint8Array[]) => {
  const l = a.reduce((n, x) => n + x.length, 0);
  const o = new Uint8Array(l);
  let p = 0;
  for (const x of a) { o.set(x, p); p += x.length; }
  return o;
};
const btcAddr = (pubC: Uint8Array) => {
  const h160 = ripemd160(sha256_noble(pubC));
  const payload = join(Uint8Array.of(0x00), h160);
  return bs58.encode(join(payload, dsha(payload).slice(0, 4)));
};
const btcWIF = (priv0x: string) => {
  const payload = join(Uint8Array.of(0x80), U8(priv0x), Uint8Array.of(0x01));
  return bs58.encode(join(payload, dsha(payload).slice(0, 4)));
};
const hard = (i:number)=>(i|0x80000000)>>>0;
const ser32 = (i:number)=>Uint8Array.of((i>>>24)&255,(i>>>16)&255,(i>>>8)&255,i&255);
function slip10Master(seed: Uint8Array) {
  const I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  return { kL: I.slice(0,32), kR: I.slice(32) };
}
function slip10Derive(seed: Uint8Array, path="m/44'/501'/0'/0'") {
  let { kL, kR } = slip10Master(seed);
  const parts = path.split('/').slice(1).map(p => hard(parseInt(p.replace("'", ''), 10)));
  for (const i of parts) {
    const I = hmac(sha512, kR, join(Uint8Array.of(0), kL, ser32(i)));
    kL = I.slice(0,32); kR = I.slice(32);
  }
  return kL;
}

/* ===== اشتقاق/تخزين جميع الشبكات من العبارة ===== */
export async function persistAllFromMnemonic(mnemonic: string) {
  // تنظيف وتوحيد العبارة قبل أي استخدام
  const m = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(m, english)) {
    throw new Error('العبارة السرية غير صالحة');
  }

  const hd = ethers.utils.HDNode.fromMnemonic(m);

  // EVM
  const evm = hd.derivePath("m/44'/60'/0'/0/0");
  await SecureStore.setItemAsync('privateKey', evm.privateKey);
  await SecureStore.setItemAsync('evm_address', evm.address);

  // BTC
  try {
    const btc = hd.derivePath("m/44'/0'/0'/0/0");
    const btcPriv = btc?.privateKey;
    if (!btcPriv) {
      console.warn('⚠️ BTC derive failed: privateKey missing — skipping BTC');
    } else {
      const pubCompressed = secp.getPublicKey(Buffer.from(btcPriv.replace(/^0x/, ""), "hex"), true);
      await SecureStore.setItemAsync('btc_address', btcAddr(pubCompressed));
      await SecureStore.setItemAsync('btc_privateKey', btcWIF(btcPriv));
    }
  } catch (e) {
    console.warn('⚠️ BTC persist failed:', String(e));
  }

  // SOL
  const seed = mnemonicToSeedSync(m);
  const solSeed = slip10Derive(seed);
  const kp = nacl.sign.keyPair.fromSeed(solSeed);
  await SecureStore.setItemAsync('sol_secret', bs58.encode(kp.secretKey));

  // TRON
  try {
    const tronPath = "m/44'/195'/0'/0/0";
    const tronHD = hd.derivePath(tronPath);
    const tronPrivateKey = tronHD.privateKey;
    
    if (!tronPrivateKey) {
      console.warn('⚠️ TRON derive failed: privateKey missing — skipping TRON');
    } else {
      // تم إزالة console.log الخطير هنا
      
      const tronAddress = privateKeyToTronAddress(tronPrivateKey);
      // تم إزالة console.log الخطير هنا
      
      if (!tronAddress.startsWith('T') || tronAddress.length !== 34) {
        throw new Error(`عنوان TRON غير صالح: ${tronAddress}`);
      }
      
      await SecureStore.setItemAsync('tron_privateKey', tronPrivateKey);
      await SecureStore.setItemAsync('tron_address', tronAddress);
      // تم إزالة console.log الخطير هنا
    }
  } catch (e) {
    console.warn('❌ TRON derive failed', String(e));
    throw e;
  }

  // XRP
  try {
    const xrpWallet = XRPLWallet.fromMnemonic(m, { 
      derivationPath: "m/44'/144'/0'/0/0" 
    });
    // تم إزالة console.log الخطير هنا
    
    if (!xrpWallet.address.startsWith('r') || xrpWallet.address.length < 25) {
      throw new Error('عنوان XRP غير صالح');
    }
    
    await SecureStore.setItemAsync('xrp_address', String(xrpWallet.address));
    
    // ✅ التصحيح الهام: إصلاح تخزين xrp_secret (آمن)
    if (typeof xrpWallet.seed !== 'string' || xrpWallet.seed.length === 0) {
      throw new Error('XRP seed missing — لن نخزن mnemonic داخل xrp_secret');
    }
    await SecureStore.setItemAsync('xrp_secret', xrpWallet.seed);
    // تم إزالة console.log الخطير هنا
  } catch (e) { 
    console.warn('XRP derive failed', String(e)); 
  }

  // تنظيف أي بيانات مخزنة سابقة لـ SEI و XLM و SUI
  await cleanupRemovedAssets();

  // تهيئة ألوان الشبكات (بدون SEI و XLM و SUI)
  await ensureNetColorsInitialized();
}

/* ===== تنظيف البيانات المخزنة للعملات المحذوفة ===== */
async function cleanupRemovedAssets() {
  const removedAssets = [
    'sei_privateKey', 
    'sei_address', 
    'xlm_address', 
    'xlm_secret',
    'sui_address' // تمت إضافة SUI
  ];
  
  for (const key of removedAssets) {
    try {
      await SecureStore.deleteItemAsync(key);
      console.log(`🧹 تم حذف ${key}`);
    } catch (e) {
      console.log(`⚠️ لا يمكن حذف ${key}:`, String(e));
    }
  }
}

/* ===== تهيئة ألوان الشبكات (بدون SEI و XLM و SUI) ===== */
async function ensureNetColorsInitialized() {
  const KEY = "net_colors_v1";
  try {
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing) {
      // تحديث الخريطة الموجودة بإزالة SEI و XLM و SUI
      const map = JSON.parse(existing);
      delete map.sei;
      delete map.xlm;
      delete map.sui;
      await SecureStore.setItemAsync(KEY, JSON.stringify(map));
      return;
    }
    
    const map = {
      bitcoin:{ badge:"#F7931A", bg:"#F7931A22" },
      ethereum:{ badge:"#627EEA", bg:"#627EEA22" },
      bsc:{ badge:"#F0B90B", bg:"#F0B90B22" },
      polygon:{ badge:"#8247E5", bg:"#8247E522" },
      solana:{ badge:"#14F195", bg:"#14F19522" },
      arbitrum:{ badge:"#2f6feb", bg:"#2f6feb22" },
      xrp:{ badge:"#00aae4", bg:"#00aae422" },
      tron:{ badge:"#E51A2E", bg:"#E51A2E22" },
      // تم إزالة SUI
    };
    await SecureStore.setItemAsync(KEY, JSON.stringify(map));
  } catch (e) {
    console.log('⚠️ خطأ في تهيئة ألوان الشبكات:', e);
  }
}

/* ===== الحصول على قائمة الشبكات المدعومة (بدون SEI و XLM و SUI) ===== */
export function getSupportedNetworks() {
  return [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
    { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
    { id: 'bsc', name: 'BNB Smart Chain', symbol: 'BNB' },
    { id: 'polygon', name: 'Polygon', symbol: 'MATIC' },
    { id: 'solana', name: 'Solana', symbol: 'SOL' },
    { id: 'arbitrum', name: 'Arbitrum', symbol: 'ETH' },
    { id: 'xrp', name: 'XRP Ledger', symbol: 'XRP' },
    { id: 'tron', name: 'TRON', symbol: 'TRX' }
    // تم إزالة SUI
  ];
}