import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getNativeBalance, sendNativeTx, getProvider } from "../providerAdapter";
import { NETWORKS, EXPLORER_TX } from "../providers";

export default function ETH_BASE({ navigation }: any) {
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
      const p = getProvider("base");
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
      const bal = await getNativeBalance("base", w.address);
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
    Alert.alert("تم النسخ", "تم نسخ عنوان Base");
  };

  const onSendWithResult = async () => {
    const saved = await SecureStore.getItemAsync("wallet_pin");
    if (saved !== pin) throw new Error("الرقم السري غير صحيح");
    const pk = await SecureStore.getItemAsync("privateKey");
    if (!pk) throw new Error("لا يوجد مفتاح خاص");
    setSending(true);
    try {
      const txHash = await sendNativeTx({
        chain: "base",
        privateKey: pk,
        to: recipient.trim(),
        amountEth: amount.trim(),
      });
      setAmount("");
      setPin("");
      await refresh();
      return { txHash, explorerUrl: EXPLORER_TX.base(txHash) };
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="Ethereum (Base)"
      symbol="ETH"
      network={NETWORKS.base.label}
      balance={balance}
      address={address}
      networkFee={`${fee} ETH`}
      badgeColor="#0052FF"
      badgeBg="#0052FF22"
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