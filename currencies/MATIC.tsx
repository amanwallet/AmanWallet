import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getBalance, send, maxSendableNative, estimateNetworkFee } from "../tokenHub";

const TOKEN_ID = "MATIC@polygon" as const;

export default function MATIC({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [fee, setFee] = useState("EIP-1559 (محسوب)");

  useEffect(() => { init(); }, []);

  const init = async () => {
    const pk = await SecureStore.getItemAsync("privateKey");
    if (!pk) { Alert.alert("MATIC", "لا يوجد مفتاح خاص — أنشئ محفظتك أولًا."); return; }
    const w = new ethers.Wallet(pk);
    setAddress(w.address);
    await refresh(w.address);
  };

  const refresh = async (addr?: string) => {
    try {
      const a = addr || address; if (!a) return;
      const bal = await getBalance({ token: TOKEN_ID, address: a });
      setBalance(Number(bal || "0").toFixed(6));
      const est = await estimateNetworkFee({ token: TOKEN_ID, from: a, to: a, amount: amount || "0.01" });
      setFee(`~${Number(est||"0").toFixed(6)} MATIC`);
    } catch { setBalance("0.000000"); }
  };

  const copy = async () => { if (!address) return; await Clipboard.setStringAsync(address); Alert.alert("تم النسخ", "تم نسخ عنوان Polygon"); };
  const sendAll = async () => {
    try {
      if (!recipient || !ethers.utils.isAddress(recipient)) return Alert.alert("تنبيه", "أدخل عنوان مستلم صالح أولًا");
      const max = await maxSendableNative({ from: address, to: recipient });
      setAmount(Number(max || "0").toFixed(6));
    } catch (e:any) { Alert.alert("Error", e?.message || "فشل احتساب الحد الأقصى"); }
  };

  const onSendWithResult = async () => {
    const savedPin = await SecureStore.getItemAsync("wallet_pin");
    if (!savedPin || savedPin !== pin) throw new Error("PIN غير صحيح");
    const pk = await SecureStore.getItemAsync("privateKey");
    if (!pk) throw new Error("لا يوجد مفتاح خاص");
    setSending(true);
    try {
      const txHash = await send({ token: TOKEN_ID, privateKey: pk, to: recipient.trim(), amount: amount.trim() });
      setAmount(""); setRecipient(""); setPin("");
      await refresh();
      return { txHash, explorerUrl: `https://polygonscan.com/tx/${txHash}` };
    } finally { setSending(false); }
  };

  return (
    <TokenTemplate
      title="Polygon"
      symbol="MATIC"
      network="Polygon Mainnet"
      balance={balance}
      address={address}
      networkFee={fee}
      badgeColor="#8247E5"
      badgeBg="#8247E522"
      recipient={recipient}
      amount={amount}
      pin={pin}
      sending={sending}
      onBack={() => navigation.goBack()}
      onRefresh={() => refresh()}
      onCopy={copy}
      onRecipientChange={setRecipient}
      onAmountChange={setAmount}
      onPinChange={setPin}
      onSendAll={sendAll}
      onSendWithResult={onSendWithResult}
    />
  );
}