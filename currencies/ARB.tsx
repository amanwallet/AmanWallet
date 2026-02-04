import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getERC20Balance, sendERC20 } from "../providerAdapter";
import { NETWORKS, EXPLORER_TX } from "../providers";
import { useTranslation } from "react-i18next";

// ✅ استيراد دالة verifyPin
import { verifyPin } from "../screens/pinAuth";

const ARB_ADDRESS = "0x912CE59144191C1204E64559FE8253a0e49E6548";
const DECIMALS = 18;

export default function ARB({ navigation }: any) {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try {
      const pk = await SecureStore.getItemAsync("privateKey"); if (!pk) return;
      const w = new ethers.Wallet(pk);
      setAddress(w.address);
      const bal = await getERC20Balance({ chain:"arbitrum", holder:w.address, token: ARB_ADDRESS, decimals: DECIMALS });
      setBalance(Number(bal || "0").toFixed(6));
    } catch { setBalance("0.000000"); }
  };

  const copy = async () => { if (!address) return; await Clipboard.setStringAsync(address); Alert.alert(t("alerts.ok"), t("token.copied")); };

  const onSendWithResult = async () => {
    // ✅ التعديل: استخدام verifyPin بدلاً من المقارنة المباشرة
    const ok = await verifyPin(pin);
    if (!ok) throw new Error(t("alerts.pinWrongOld"));
    
    const pk = await SecureStore.getItemAsync("privateKey"); if (!pk) throw new Error("لا يوجد مفتاح خاص");
    if (!recipient || !amount) throw new Error("أدخل العنوان والمبلغ");
    setSending(true);
    try {
      const txHash = await sendERC20({ chain:"arbitrum", privateKey: pk, token: ARB_ADDRESS, to: recipient.trim(), amount: amount.trim(), decimals: DECIMALS });
      setAmount(""); setPin(""); await refresh();
      return { txHash, explorerUrl: EXPLORER_TX.arbitrum(txHash) };
    } finally { setSending(false); }
  };

  return (
    <TokenTemplate
      title="Arbitrum (ARB)" symbol="ARB" network={NETWORKS.arbitrum.label}
      balance={balance} address={address}
      badgeColor="#2f6feb" badgeBg="#2f6feb22"
      recipient={recipient} amount={amount} pin={pin} sending={sending}
      onBack={() => navigation.goBack()} onRefresh={refresh} onCopy={copy}
      onRecipientChange={setRecipient} onAmountChange={setAmount} onPinChange={setPin}
      onSendAll={() => setAmount(balance)}
      onSendWithResult={onSendWithResult}
    />
  );
}