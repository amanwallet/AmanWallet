// TRX.tsx - الإصدار المصحح النهائي
// إصلاح مشكلة التحقق من التوقيع على الشبكة
import React, { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import TokenTemplate from "./TokenTemplate";
import {
  tronGetTrxBalance,
  normalizeTronAddress,
  SUN_PER_TRX,
  toSun,
  sendTrxAuto,
  privateKeyToTronAddress
} from "../tronHub";

const SYMBOL = "TRX";
const KEY_ADDR = "tron_address";
const KEY_PIN  = "wallet_pin";
const KEY_PK   = "tron_privateKey";

export default function TRX({ navigation }: any) {
  const [balance, setBalance] = useState("0.000000");
  const [address, setAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try {
      const addr = (await SecureStore.getItemAsync(KEY_ADDR)) || "";
      setAddress(addr);
      if (addr) {
        const sun = await tronGetTrxBalance(normalizeTronAddress(addr));
        setBalance((Number(sun) / SUN_PER_TRX).toFixed(6));
      } else setBalance("0.000000");
    } catch { setBalance("0.000000"); }
  };

  const copy = async () => {
    try {
      if (!address) return;
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(address);
      alert("📋 تم نسخ العنوان");
    } catch {}
  };

  const getTronPrivateKey = async (): Promise<string> => {
    try {
      // أولاً: جلب مفتاح TRON الخاص المخزن
      const tronPk = await SecureStore.getItemAsync(KEY_PK);
      if (tronPk) {
        console.log('🔑 استخدام مفتاح TRON الخاص:', tronPk.substring(0, 16) + '...');
        
        // التحقق من أن المفتاح يطابق العنوان المخزن
        const expectedAddress = privateKeyToTronAddress(tronPk);
        const storedAddress = await SecureStore.getItemAsync(KEY_ADDR);
        
        if (expectedAddress !== storedAddress) {
          console.warn('⚠️ المفتاح لا يطابق العنوان المخزن:', {
            expected: expectedAddress,
            stored: storedAddress
          });
          throw new Error('المفتاح الخاص لا يطابق عنوان TRON المخزن');
        }
        
        return tronPk;
      }
      
      throw new Error('لا يوجد مفتاح TRON خاص محفوظ');
    } catch (error) {
      console.error('❌ خطأ في جلب المفتاح الخاص:', error);
      throw new Error('تعذر الوصول إلى المفتاح الخاص لـ TRON. يرجى استيراد المحفظة مرة أخرى.');
    }
  };

  const verifyKeysMatch = async (): Promise<boolean> => {
    try {
      const currentAddress = await SecureStore.getItemAsync(KEY_ADDR);
      const tronPk = await SecureStore.getItemAsync(KEY_PK);
      
      if (!currentAddress || !tronPk) return false;
      
      const expectedAddress = privateKeyToTronAddress(tronPk);
      
      console.log('🔍 التحقق من المطابقة:', {
        expectedAddress,
        storedAddress: currentAddress,
        match: expectedAddress === currentAddress
      });
      
      return expectedAddress === currentAddress;
    } catch {
      return false;
    }
  };

  const onSendWithResult = async () => {
    try {
      const savedPin = await SecureStore.getItemAsync(KEY_PIN);
      if ((savedPin || "") !== pin) throw new Error("الرقم السري غير صحيح");
      
      // التحقق من أن المفاتيح متطابقة
      const keysMatch = await verifyKeysMatch();
      if (!keysMatch) {
        throw new Error("المفتاح الخاص لا يطابق العنوان المخزن. يرجى إعادة استيراد المحفظة.");
      }
      
      const pk = await getTronPrivateKey();
      if (!pk) throw new Error("لا يوجد مفتاح خاص محفوظ");

      setSending(true);

      const from = normalizeTronAddress(address);
      const to   = normalizeTronAddress(recipient.trim());
      const amt  = amount.trim() || "0";

      console.log('🚀 بدء إرسال TRX:', { 
        from, 
        to, 
        amount: amt,
        privateKeyLength: pk.length 
      });
      
      // ✨ استدعاء الإرسال التلقائي (يبني + يوقّع + يبث)
      await sendTrxAuto(from, to, amt, pk.trim().replace(/^0x/, ""));
      alert("✅ تم إرسال TRX بنجاح!");
      setAmount(""); setPin(""); await refresh();
    } catch (e: any) {
      console.error('❌ فشل إرسال TRX:', e.message);
      alert(e.message || "فشل الإرسال");
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="TRON (Mainnet)"
      symbol={SYMBOL}
      balance={balance}
      address={address}
      amountLabel="(TRX)"
      recipient={recipient}
      amount={amount}
      pin={pin}
      sending={sending}
      onBack={() => navigation.goBack?.()}
      onRefresh={refresh}
      onCopy={copy}
      onRecipientChange={setRecipient}
      onAmountChange={setAmount}
      onPinChange={setPin}
      onSendAll={() => setAmount(balance)}
      onSendWithResult={onSendWithResult}
    />
  );
}