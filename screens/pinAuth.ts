// screens/pinAuth.ts
import * as SecureStore from "expo-secure-store";
import * as Random from "expo-random";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { Buffer } from "buffer";

const PIN_PLAIN_KEY = "wallet_pin";          // القديم
const PIN_SALT_KEY  = "wallet_pin_salt_b64"; // الجديد
const PIN_HASH_KEY  = "wallet_pin_hash_b64"; // الجديد

function b64(u8: Uint8Array) {
  return Buffer.from(u8).toString("base64");
}
function fromB64(s: string) {
  return new Uint8Array(Buffer.from(s, "base64"));
}
function derivePinHash(pin: string, salt: Uint8Array) {
  // ✅ التعديل: تقليل عدد التكرارات من 200,000 إلى 60,000 لتحسين الأداء
  return pbkdf2(sha256, pin, salt, { c: 60_000, dkLen: 32 });
}

export async function hasPin(): Promise<boolean> {
  const h = await SecureStore.getItemAsync(PIN_HASH_KEY);
  const p = await SecureStore.getItemAsync(PIN_PLAIN_KEY);
  return !!h || !!p;
}

export async function setPin(pin: string): Promise<void> {
  const salt = Random.getRandomBytes(16);
  const hash = derivePinHash(pin, salt);
  await SecureStore.setItemAsync(PIN_SALT_KEY, b64(salt));
  await SecureStore.setItemAsync(PIN_HASH_KEY, b64(hash));
  await SecureStore.deleteItemAsync(PIN_PLAIN_KEY); // حذف القديم
}

export async function verifyPin(pinAttempt: string): Promise<boolean> {
  // الجديد
  const saltB64 = await SecureStore.getItemAsync(PIN_SALT_KEY);
  const hashB64 = await SecureStore.getItemAsync(PIN_HASH_KEY);

  if (saltB64 && hashB64) {
    const salt = fromB64(saltB64);
    const expected = fromB64(hashB64);
    const got = derivePinHash(pinAttempt, salt);
    return Buffer.from(got).equals(Buffer.from(expected));
  }

  // توافقية: PIN القديم (نص) + ترقية تلقائية بدون كسر
  const plain = await SecureStore.getItemAsync(PIN_PLAIN_KEY);
  if (plain && plain === pinAttempt) {
    await setPin(pinAttempt);
    return true;
  }
  return false;
}

export async function deletePin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_PLAIN_KEY);
  await SecureStore.deleteItemAsync(PIN_SALT_KEY);
  await SecureStore.deleteItemAsync(PIN_HASH_KEY);
}