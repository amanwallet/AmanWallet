import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getNativeBalance, sendNativeTx, getProvider } from "../providerAdapter";
import { NETWORKS, EXPLORER_TX } from "../providers";

// ✅ استيراد دالة verifyPin
import { verifyPin } from "../screens/pinAuth";

export default function ETH_ARB({ navigation }: any) {
  const [balance, setBalance] = useState("0.000000"),
    [address, setAddress] = useState(""),
    [recipient, setRecipient] = useState(""),
    [amount, setAmount] = useState(""),
    [pin, setPin] = useState(""),
    [sending, setSending] = useState(false),
    [fee, setFee] = useState("0.000000");

  useEffect(() => {
    refresh();
  }, []);

  const estimateFee = async () => {
    try {
      const p = getProvider("arbitrum");
      const fd = await p.getFeeData();
      const gasLimit = ethers.BigNumber.from(21000);
      const maxFeePerGas = fd.maxFeePerGas || ethers.utils.parseUnits("0.1", "gwei");
      const feeWei = gasLimit.mul(maxFeePerGas);
      setFee(Number(ethers.utils.formatEther(feeWei)).toFixed(6));
    } catch {
      setFee("0.000000");
    }
  };

  const refresh = async () => {
    try {
      const pk = await SecureStore.getItemAsync("privateKey");
      if (!pk) return;
      const w = new ethers.Wallet(pk);
      setAddress(w.address);
      const bal = await getNativeBalance("arbitrum", w.address);
      setBalance(Number(bal).toFixed(6));
      await estimateFee();
    } catch {
      setBalance("0.000000");
      setFee("0.000000");
    }
  };

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert("تم النسخ", "تم نسخ عنوان Arbitrum");
  };

  const onSendWithResult = async () => {
    // ✅ التعديل: استخدام verifyPin بدلاً من المقارنة المباشرة
    const ok = await verifyPin(pin);
    if (!ok) throw new Error("الرقم السري غير صحيح");
    
    const pk = await SecureStore.getItemAsync("privateKey");
    if (!pk) throw new Error("لا يوجد مفتاح خاص");
    setSending(true);
    try {
      const txHash = await sendNativeTx({
        chain: "arbitrum",
        privateKey: pk,
        to: recipient.trim(),
        amountEth: amount.trim(),
      });
      setAmount("");
      setPin("");
      await refresh();
      return { txHash, explorerUrl: EXPLORER_TX.arbitrum(txHash) };
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="Ethereum (Arbitrum)"
      symbol="ETH"
      network={NETWORKS.arbitrum.label}
      balance={balance}
      address={address}
      networkFee={`${fee} ETH`}
      badgeColor="#2D374B"
      badgeBg="#2D374B22"
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