import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import TokenTemplate from "./TokenTemplate";
import { getBTCBalance, sendBTC } from "../providerAdapter";
import { NETWORKS, EXPLORER_TX } from "../providers";

export default function BTC({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  const refresh = async () => {
    try {
      const btcAddress = await SecureStore.getItemAsync("btc_address");
      if (!btcAddress) {
        console.warn("BTC address not found in storage");
        return;
      }
      
      setAddress(btcAddress);
      const bal = await getBTCBalance(btcAddress);
      setBalance(Number(bal).toFixed(6));
    } catch (error) {
      console.warn("BTC refresh error:", error);
      setBalance("0.000000");
    }
  };

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert("تم النسخ", "تم نسخ عنوان Bitcoin");
  };

  const onSendWithResult = async () => {
    if (!recipient || !amount) throw new Error("أدخل العنوان والمبلغ.");
    
    const savedPin = await SecureStore.getItemAsync("wallet_pin");
    if (pin !== savedPin) throw new Error("الرقم السري غير صحيح.");
    
    const btcWif = await SecureStore.getItemAsync("btc_wif");
    if (!btcWif) throw new Error("لا يوجد مفتاح BTC");

    setSending(true);
    try {
      const txHash = await sendBTC({
        wif: btcWif,
        to: recipient.trim(),
        amountBTC: amount.trim()
      });
      
      setAmount("");
      setPin("");
      await refresh();
      return { 
        txHash, 
        explorerUrl: EXPLORER_TX.bitcoin(txHash)
      };
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="Bitcoin"
      symbol="BTC"
      network="Bitcoin Mainnet"
      balance={balance}
      address={address}
      networkFee="~0.0001 BTC"
      badgeColor="#F7931A"
      badgeBg="#F7931A22"
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
    />
  );
}