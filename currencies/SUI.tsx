// currencies/SUI.tsx — واجهة SUI مع تأكيدات قبل الإرسال
import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import TokenTemplate from "./TokenTemplate";
import {
  suiAddressFromMnemonic, getSuiBalanceMist, sendSuiNative,
  mistToSui, suiToMist, SUI_DECIMALS, testSuiConnection
} from "../SUI";

// دالة تنظيف العبارة السرية
const normalizeMnemonic = (m: string): string => {
  if (!m) return '';
  return m.trim().toLowerCase().replace(/\s+/g, ' ');
};

export default function SUI({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.000000000"); // عرض بالـ SUI (مثلاً "1.234000000")
  const [balanceMist, setBalanceMist] = useState("0"); // قيمة المِست الخام كسلسلة
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<boolean>(true);

  useEffect(() => { refresh(); checkConnection(); }, []);
  const checkConnection = async () => setConnectionStatus(await testSuiConnection());

  const refresh = async () => {
    try {
      const raw = await SecureStore.getItemAsync("mnemonic");
      const mnemonic = normalizeMnemonic(raw || "");
      if (!mnemonic) { setAddress(""); setBalance("0.000000000"); setBalanceMist("0"); return; }

      const addr = await suiAddressFromMnemonic(mnemonic);
      setAddress(addr);
      await SecureStore.setItemAsync("sui_address", addr);
      const mist = await getSuiBalanceMist(addr);
      setBalanceMist(mist || "0");
      setBalance(Number(mistToSui(mist || "0")).toFixed(SUI_DECIMALS));
    } catch (err) {
      console.error('refresh SUI error', err);
      setBalance("0.000000000");
      setBalanceMist("0");
    }
  };

  const copy = async () => { if (address) { await Clipboard.setStringAsync(address); Alert.alert("تم النسخ", "تم نسخ العنوان"); } };

  // الدالة التي تنفّذ الإرسال الحقيقي (تستخدم sendSuiNative)
  const sendNow = async (): Promise<{ digest?: string } | null> => {
    const saved = await SecureStore.getItemAsync("wallet_pin");
    if (saved !== pin) {
      throw new Error("الرقم السري غير صحيح");
    }
    const raw = await SecureStore.getItemAsync("mnemonic");
    const mnemonic = normalizeMnemonic(raw || "");
    if (!mnemonic) throw new Error("لا يوجد عبارة استرداد");

    const to = recipient.trim();
    if (!to || !to.startsWith("0x")) throw new Error("أدخل عنوان SUI صالح يبدأ بـ 0x");

    const amt = amount.trim();
    if (!amt || Number(amt) <= 0) throw new Error("الرجاء إدخال مبلغ صحيح");

    setSending(true);
    try {
      const res = await sendSuiNative({ mnemonic, to, amountMist: suiToMist(amt) });
      // res.digest موجود عند النجاح
      await refresh();
      setAmount("");
      setPin("");
      setRecipient("");
      return { digest: res?.digest };
    } finally {
      setSending(false);
    }
  };

  // الدالة التي تعرض تأكيد قبل الإرسال وتتحقق من الرصيد
  const confirmAndSend = async () => {
    try {
      // تحقق مبدئي من الحقول
      const to = recipient.trim();
      if (!to || !to.startsWith("0x")) { Alert.alert("خطأ", "أدخل عنوان SUI صالح يبدأ بـ 0x"); return; }

      const amt = amount.trim();
      if (!amt || Number(amt) <= 0) { Alert.alert("خطأ", "الرجاء إدخال مبلغ صحيح أكبر من صفر"); return; }

      // تحويل المبلغ إلى mist
      const amtMistStr = suiToMist(amt);
      const amtMist = BigInt(amtMistStr || "0");
      const balMist = BigInt(balanceMist || "0");

      // تحقق من كفاية الرصيد
      if (balMist < amtMist) {
        // رصيد غير كافٍ — اسأل المستخدم إن أراد محاكاة أو إلغاء
        Alert.alert(
          "الرصيد غير كافٍ",
          `رصيدك الحالي = ${balance} SUI\nالمبلغ المطلوب = ${amt} SUI\nهل تريد المحاكاة (لن يتم إرسال أي شيء فعليًا) أم إلغاء؟`,
          [
            { text: "إلغاء", style: "cancel" },
            {
              text: "محاكاة",
              onPress: () => {
                // عرض نجاح محاكاة
                const fakeTx = `SIMULATED-${Date.now()}`;
                Alert.alert("نجاح (محاكاة)", `تمت المحاكاة. Tx: ${fakeTx}`);
                // لا نجري أي تغييرات حقيقية
              }
            }
          ]
        );
        return;
      }

      // حساب الرصيد المتبقّي بعد الإرسال (محسوب بشكل تقريبي)
      const remainingMist = balMist - amtMist;
      const remainingSui = Number(mistToSui(remainingMist.toString())).toFixed(SUI_DECIMALS);

      // عرض نافذة التأكيد النهائية للمستخدم
      Alert.alert(
        "تأكيد الإرسال",
        `إرسال ${amt} SUI (${amtMist.toString()} mist)\nإلى: ${to}\n\nرصيدك الحالي: ${balance} SUI\nالرصيد المتوقع بعد الإرسال تقريبًا: ${remainingSui} SUI\n\nهل تريد المتابعة؟`,
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "إرسال",
            onPress: async () => {
              try {
                setSending(true);
                const res = await sendNow();
                // عند النجاح نعرض تفاصيل المعاملة (digest)
                if (res && res.digest) {
                  Alert.alert("نجاح", `تم الإرسال. Tx: ${res.digest}`);
                } else {
                  Alert.alert("نجاح", "تم الإرسال بنجاح (بدون digest مرئي)");
                }
              } catch (err: any) {
                console.error('send error', err);
                Alert.alert("فشل الإرسال", err?.message || "حصل خطأ أثناء الإرسال");
              } finally {
                setSending(false);
                // تحديث الرصيد بعد محاولة الإرسال
                await refresh();
              }
            }
          }
        ]
      );
    } catch (err: any) {
      console.error('confirmAndSend error', err);
      Alert.alert("خطأ", err?.message || "حصل خطأ غير متوقع");
    }
  };

  const handleSendAll = () => {
    // اترك هامش صغير للغاز حتى لا يفشل الإرسال؛ هنا نقرر هامش 0.001 SUI
    const adjusted = Math.max(Number(balance) - 0.001, 0).toFixed(SUI_DECIMALS).toString();
    setAmount(adjusted);
  };
  const handleBack = () => { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate("Home"); };

  return (
    <TokenTemplate
      title="SUI" symbol="SUI"
      balance={balance} address={address}
      amountLabel={`(${SUI_DECIMALS} dec)`}
      badgeColor="#6B31D6" badgeBg="#6B31D622"
      recipient={recipient} amount={amount} pin={pin}
      sending={sending} connectionStatus={connectionStatus}
      onBack={handleBack} onRefresh={refresh} onCopy={copy}
      onRecipientChange={setRecipient} onAmountChange={setAmount} onPinChange={setPin}
      onSendAll={handleSendAll}
      // هنا نمرّر الدالة الجديدة التي تعرض التأكيد قبل الإرسال
      onSendWithResult={confirmAndSend}
    />
  );
}