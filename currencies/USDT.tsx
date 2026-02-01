import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getBalance, send, estimateNetworkFee } from "../tokenHub";
import { NETWORKS } from "../providers";

const TOKEN_ID = "USDT@polygon" as const;

export default function USDT({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
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
      const bal = await getBalance({ token: TOKEN_ID, address: a });
      setBalance(Number(bal || "0").toFixed(6));
      const est = await estimateNetworkFee({ token: TOKEN_ID, from: a, to: a, amount: amount || "0.01" });
      setFee(Number(est || "0").toFixed(6));
    } catch { setBalance("0.000000"); setFee("0.000000"); }
  };

  const copy = async () => { if (!address) return; await Clipboard.setStringAsync(address); Alert.alert("تم النسخ", "تم نسخ عنوان المحفظة"); };

  const onSendWithResult = async () => {
    const savedPin = await SecureStore.getItemAsync("wallet_pin");
    if (!savedPin || savedPin !== pin) throw new Error("الرقم السري غير صحيح");
    const pk = await SecureStore.getItemAsync("privateKey"); if (!pk) throw new Error("لا يوجد مفتاح خاص");
    setSending(true);
    try {
      const txHash = await send({ token: TOKEN_ID, privateKey: pk, to: recipient.trim(), amount: amount.trim() });
      setAmount(""); setPin(""); await refresh();
      return { txHash, explorerUrl: `https://polygonscan.com/tx/${txHash}` };
    } finally { setSending(false); }
  };

  return (
    <TokenTemplate
      title="محفظة USDT" symbol="USDT" network={NETWORKS.polygon.label}
      balance={balance} address={address} networkFee={`${fee} MATIC`}
      badgeColor="#8247E5" badgeBg="#8247E522"
      recipient={recipient} amount={amount} pin={pin} sending={sending}
      onBack={() => navigation.goBack()} onRefresh={() => refresh()}
      onCopy={copy}
      onRecipientChange={setRecipient} onAmountChange={setAmount} onPinChange={setPin}
      onSendAll={() => setAmount(balance)}
      onSendWithResult={onSendWithResult}
    />
  );
}