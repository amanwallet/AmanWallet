// storage.ts
import * as SecureStore from 'expo-secure-store';
import * as Random from 'expo-random';
import * as bip39 from 'bip39';

const MNEMONIC_KEY = 'wallet_mnemonic_v1';
const ONBOARDED_KEY = 'onboarded_v1'; // علامة أنه خلّص شاشة الترحيب

/** هل توجد محفظة بالفعل؟ */
export async function hasWallet(): Promise<boolean> {
  const m = await SecureStore.getItemAsync(MNEMONIC_KEY);
  return !!m;
}

/** توليد أو استرجاع mnemonic ثابت */
export async function getOrCreateMnemonic(): Promise<string> {
  // إن كان موجود أرجعه
  const existing = await SecureStore.getItemAsync(MNEMONIC_KEY);
  if (existing) return existing;

  // توليد Entropy عشوائي قوي (32 بايت = 256-bit)
  const entropy = await Random.getRandomBytesAsync(32);
  const hex = Buffer.from(entropy).toString('hex');

  // تحويل إلى BIP-39 mnemonic
  const mnemonic = bip39.entropyToMnemonic(hex);

  // حفظه آمنًا
  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);

  return mnemonic;
}

/** إرجاع الـ mnemonic إن وجد */
export async function getMnemonic(): Promise<string | null> {
  return SecureStore.getItemAsync(MNEMONIC_KEY);
}

/** حفظ قيمة نصية لأي مفتاح آخر */
export async function saveItem(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

/** قراءة قيمة نصية لأي مفتاح آخر */
export async function getItem(key: string) {
  return SecureStore.getItemAsync(key);
}

/** وضع علامة أنه خلّصنا الترحيب (اختياري) */
export async function setOnboarded() {
  await SecureStore.setItemAsync(ONBOARDED_KEY, '1');
}

export async function isOnboarded() {
  const v = await SecureStore.getItemAsync(ONBOARDED_KEY);
  return v === '1';
}

/** (اختياري للتطوير) مسح المحفظة */
export async function clearWalletForDev() {
  await SecureStore.deleteItemAsync(MNEMONIC_KEY);
  await SecureStore.deleteItemAsync(ONBOARDED_KEY);
}
