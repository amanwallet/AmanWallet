// screens/SOMI_BASE.tsx — SOMI (OFT on Base) — نهائي
import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getERC20Balance, sendERC20 } from "../providerAdapter";
import { NETWORKS, EXPLORER_TX } from "../providers";

// ✅ عقد SOMI على Ethereum مزروع مباشرة هنا
const SOMI_TOKEN_ADDRESS = ethers.utils.getAddress(
  "0x47636b3188774a3E7273D85A537b9bA4Ee7b2535"
);
const SOMI_DECIMALS = 18; // عدّلها لو مختلفة

export default function SOMI_BASE({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try {
      const pk = await SecureStore.getItemAsync("privateKey");
      if (!pk) { setAddress(""); setBalance("0.000000"); return; }
      const w = new ethers.Wallet(pk);
      setAddress(w.address);

      const bal = await getERC20Balance({
        chain: "base",
        holder: w.address,
        token: SOMI_TOKEN_ADDRESS,
        decimals: SOMI_DECIMALS,
      });
      setBalance(Number(bal || "0").toFixed(6));
    } catch (e) {
      setBalance("0.000000");
    }
  };

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert("تم النسخ", "تم نسخ العنوان");
  };

  const onSendWithResult = async () => {
    const saved = await SecureStore.getItemAsync("wallet_pin");
    if (saved !== pin) throw new Error("الرقم السري غير صحيح");
    const pk = await SecureStore.getItemAsync("privateKey");
    if (!pk) throw new Error("لا يوجد مفتاح خاص");

    const to = recipient.trim();
    if (!to) throw new Error("يرجى إدخال عنوان المستلم");
    const amt = amount.trim();
    if (!amt || Number(amt) <= 0) throw new Error("الرجاء إدخال مبلغ صحيح");

    setSending(true);
    try {
      const txHash = await sendERC20({
        chain: "base",
        privateKey: pk,
        token: SOMI_TOKEN_ADDRESS,
        to,
        amount: amt,
        decimals: SOMI_DECIMALS,
      });
      setAmount(""); setPin(""); await refresh();
      return { txHash, explorerUrl: EXPLORER_TX.base(txHash) };
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="SOMI (Base)"
      symbol="SOMI"
      network={NETWORKS.ethereum.label}
      balance={balance}
      address={address}
      networkFee={"ETH :Estimated network fee"}
      badgeColor="#7C3AED"
      badgeBg="#7C3AED22"
      recipient={recipient}
      amount={amount}
      pin={pin}
      sending={sending}
      onBack={() => navigation.goBack()}
      onRefresh={refresh}
      onCopy={copy}
      onRecipientChange={setRecipient}
      onAmountChange={setAmount}
      onPinChange={setPin}
      onSendAll={() => setAmount(balance)}
      onSendWithResult={onSendWithResult}
      // ✅ تم إزالة onAfterSend نهائياً
    />
  );
}