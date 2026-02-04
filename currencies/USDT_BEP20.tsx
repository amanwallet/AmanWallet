import React, { useEffect, useState } from "react";
import TokenTemplate from "./TokenTemplate";
import { getERC20Balance, sendERC20 } from "../providerAdapter";
import * as SecureStore from "expo-secure-store";
import { Alert } from "react-native";
import { ethers } from "ethers";
import { NETWORKS, EXPLORER_TX } from "../providers";

// ✅ استيراد دالة verifyPin
import { verifyPin } from "../screens/pinAuth";

const TOKEN_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

export default function USDT_BEP20({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.00");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const pk = await SecureStore.getItemAsync("privateKey");
    if (!pk) return;

    const wallet = new ethers.Wallet(pk);
    const addr = await wallet.getAddress();
    setAddress(addr);
    refresh(addr);
  }

  async function refresh(addr?: string) {
    const pk = await SecureStore.getItemAsync("privateKey");
    if (!pk) return;

    const wallet = new ethers.Wallet(pk);
    const holder = addr || wallet.address;

    const bal = await getERC20Balance({
      chain: "bsc",
      holder,
      token: TOKEN_ADDRESS,
    });

    setBalance(Number(bal).toFixed(6));
  }

  async function send() {
    // ✅ التعديل: استخدام verifyPin بدلاً من المقارنة المباشرة
    const ok = await verifyPin(pin);
    if (!ok) {
      Alert.alert("خطأ", "PIN غير صحيح");
      return;
    }

    setSending(true);
    try {
      const pk = await SecureStore.getItemAsync("privateKey");
      if (!pk) throw new Error("No private key");

      const tx = await sendERC20({
        chain: "bsc",
        privateKey: pk,
        token: TOKEN_ADDRESS,
        to: recipient,
        amount,
      });

      Alert.alert("تم الإرسال", "تم إرسال USDT بنجاح");
      setAmount("");
      setPin("");
      refresh();
      return { txHash: tx, explorerUrl: EXPLORER_TX.bsc(tx) };
    } finally {
      setSending(false);
    }
  }

  return (
    <TokenTemplate
      title="USDT (BEP-20)"
      symbol="USDT"
      network="BNB Smart Chain"
      networkFee="BNB"
      address={address}
      balance={balance}
      recipient={recipient}
      amount={amount}
      pin={pin}
      sending={sending}
      onBack={() => navigation.goBack()}
      onRefresh={() => refresh()}
      onRecipientChange={setRecipient}
      onAmountChange={setAmount}
      onPinChange={setPin}
      onSendWithResult={send}
    />
  );
}