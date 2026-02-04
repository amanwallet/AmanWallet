import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getBalance, send, estimateNetworkFee } from "../tokenHub";
import { NETWORKS } from "../providers";

// ✅ استيراد دالة verifyPin
import { verifyPin } from "../screens/pinAuth";

const IDS = ["USDC@polygon", "USDCe@polygon"] as const;
type Id = typeof IDS[number];

export default function USDC_Polygon({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState<Id | null>(null);
  const [fee, setFee] = useState("0.000000");

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const pk = await SecureStore.getItemAsync("privateKey"); if (!pk) return;
      const w = new ethers.Wallet(pk);
      setAddress(w.address);
      await refresh(w.address);
    } catch {}
  };

  const refresh = async (addr?: string) => {
    try {
      const a = addr || address; if (!a) return;
      let picked: Id | null = null;
      let found = "0";
      for (const id of IDS) {
        const bal = await getBalance({ token: id, address: a });
        if (Number(bal) > 0) { picked = id; found = bal; break; }
        picked = id; found = bal;
      }
      setActive(picked);
      setBalance(Number(found || "0").toFixed(6));
      const est = await estimateNetworkFee({ token: picked!, from: a, to: a, amount: amount || "0.01" });
      setFee(Number(est || "0").toFixed(6));
    } catch { setActive(null); setBalance("0.000000"); setFee("0.000000"); }
  };

  const copy = async () => { if (!address) return; await Clipboard.setStringAsync(address); Alert.alert("تم النسخ", "تم نسخ عنوان المحفظة"); };
  const onSendWithResult = async () => {
    if (!active) throw new Error("لم يتم تحديد عقد USDC");
    
    // ✅ التعديل: استخدام verifyPin بدلاً من المقارنة المباشرة
    const ok = await verifyPin(pin);
    if (!ok) throw new Error("الرقم السري غير صحيح");
    
    const pk = await SecureStore.getItemAsync("privateKey"); if (!pk) throw new Error("لا يوجد مفتاح خاص");
    setSending(true);
    try {
      const txHash = await send({ token: active, privateKey: pk, to: recipient.trim(), amount: amount.trim() });
      setAmount(""); setPin(""); await refresh();
      return { txHash, explorerUrl: `https://polygonscan.com/tx/${txHash}` };
    } finally { setSending(false); }
  };

  return (
    <TokenTemplate
      title="USDC - Polygon" symbol="USDC" network={NETWORKS.polygon.label}
      balance={balance} address={address} networkFee={`~${fee} MATIC`}
      badgeColor="#2775CA" badgeBg="#2775CA22"
      recipient={recipient} amount={amount} pin={pin} sending={sending}
      onBack={() => navigation.goBack()} onRefresh={() => refresh()} onCopy={copy}
      onRecipientChange={setRecipient} onAmountChange={setAmount} onPinChange={setPin}
      onSendAll={() => setAmount(balance)}
      onSendWithResult={onSendWithResult}
    />
  );
}