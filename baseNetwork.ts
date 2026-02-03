// baseNetwork.ts
// خدمة شبكة Base + روابط المستكشف. لا تنشئ شبكات جديدة.
// يستخدم نفس RPC الثابت — ومع استعادة نفس 12 كلمة يرجع نفس العنوان.

import { ethers } from "ethers";
import Abe from "./Abe"; // [تمت الإضافة]

export const BASE_RPC = Abe.getRpc(8453); // [تم التعديل]

export const baseProvider = new ethers.providers.JsonRpcProvider(BASE_RPC);

export const baseExplorer = {
  tx: (hash: string) => `https://basescan.org/tx/${hash}`,
  address: (addr: string) => `https://basescan.org/address/${addr}`,
  token: (addr: string) => `https://basescan.org/token/${addr}`,
};