// currencies/ARB_ETH.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";

import TokenTemplate from "./TokenTemplate";
import { NETWORKS, EXPLORER_TX } from "../providers";

/* =========================
   ARB (ERC20) on Ethereum L1
   ========================= */
// العنوان الصحيح لـ ARB على Ethereum
const ARB_L1 = "0xb50721bcf8d664c30412cfbc6cf7a15145234ad1";
const DECIMALS = 18;

// استخدم providerAdapter بدلاً من Ankr مباشرة
const getProvider = () => {
  const { getProvider } = require("../providerAdapter");
  return getProvider("ethereum");
};

/* ======= Gas/Confirm Settings ======= */
const MIN_ETH_FOR_GAS = 0.00025;
const GAS_LIMIT_PRIMARY = 90000;
const GAS_LIMIT_RETRY = 120000;
const CONFIRMATIONS = 1;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export default function ARB_ETH({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [arbBalance, setArbBalance] = useState("0.000000");
  const [ethForGas, setEthForGas] = useState("0.000000");
  const [feeEst, setFeeEst] = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);

  const canSend = useMemo(() => {
    const a = Number(amount || "0");
    const b = Number(arbBalance || "0");
    const e = Number(ethForGas || "0");
    return a > 0 && a <= b + 1e-12 && e >= MIN_ETH_FOR_GAS && !sending;
  }, [amount, arbBalance, ethForGas, sending]);

  useEffect(() => { refresh(); }, []);

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert("تم النسخ", "تم نسخ عنوان Ethereum Mainnet");
  };

  const estimateFee = async (provider: ethers.providers.Provider) => {
    try {
      const fd = await provider.getFeeData();
      const price = fd.maxFeePerGas || fd.gasPrice || ethers.utils.parseUnits("30", "gwei");
      const wei = ethers.BigNumber.from(GAS_LIMIT_PRIMARY).mul(price);
      setFeeEst(Number(ethers.utils.formatEther(wei)).toFixed(6));
    } catch {
      setFeeEst("0.000000");
    }
  };

  const refresh = async () => {
    try {
      const pk = await SecureStore.getItemAsync("privateKey");
      if (!pk) return;

      const provider = getProvider();
      const net = await provider.getNetwork();
      if (net.chainId !== 1) {
        throw new Error(`متصل بسلسلة خاطئة (chainId=${net.chainId}). يلزم Ethereum Mainnet (1).`);
      }

      const wallet = new ethers.Wallet(pk, provider);
      setAddress(wallet.address);

      // رصيد ETH للغاز
      const ethWei = await provider.getBalance(wallet.address);
      setEthForGas(Number(ethers.utils.formatEther(ethWei)).toFixed(6));

      // رصيد ARB ERC20
      const token = new ethers.Contract(ARB_L1, ERC20_ABI, provider);
      const raw = await token.balanceOf(wallet.address);
      const bal = Number(ethers.utils.formatUnits(raw, DECIMALS)).toFixed(6);
      setArbBalance(bal);

      await estimateFee(provider);
    } catch (e: any) {
      console.warn("ARB_ETH refresh error:", e);
      setArbBalance("0.000000");
      setEthForGas("0.000000");
      setFeeEst("0.000000");
      Alert.alert("خطأ", String(e?.message || e));
    }
  };

  const onSendWithResult = async () => {
    // تحقق من PIN
    const savedPin = await SecureStore.getItemAsync("wallet_pin");
    if (savedPin !== pin) throw new Error("الرقم السري غير صحيح");

    // تحقّقات أساسية
    const to = recipient.trim();
    if (!ethers.utils.isAddress(to)) throw new Error("عنوان المستلم غير صالح");
    const amtNum = Number(amount || "0");
    if (!(amtNum > 0)) throw new Error("أدخل مبلغًا صحيحًا");
    if (amtNum > Number(arbBalance || "0") + 1e-12) throw new Error("المبلغ يتجاوز الرصيد المتاح");
    if (Number(ethForGas || "0") < MIN_ETH_FOR_GAS) throw new Error("لا يوجد ETH كافٍ على Ethereum Mainnet لرسوم الشبكة");

    const pk = await SecureStore.getItemAsync("privateKey");
    if (!pk) throw new Error("لا يوجد مفتاح خاص");

    setSending(true);
    try {
      const provider = getProvider();
      const net = await provider.getNetwork();
      if (net.chainId !== 1) throw new Error(`chainId=${net.chainId} — ليس Ethereum Mainnet`);

      const signer = new ethers.Wallet(pk, provider);
      const token = new ethers.Contract(ARB_L1, ERC20_ABI, signer);
      const value = ethers.utils.parseUnits(amount.trim(), DECIMALS);

      const fd = await provider.getFeeData();
      const base: ethers.PayableOverrides = {};
      if (fd.maxFeePerGas) base.maxFeePerGas = fd.maxFeePerGas;
      if (fd.maxPriorityFeePerGas) base.maxPriorityFeePerGas = fd.maxPriorityFeePerGas;

      let tx;
      try {
        tx = await token.transfer(to, value, { ...base, gasLimit: GAS_LIMIT_PRIMARY });
      } catch (e: any) {
        if (String(e?.code || "").includes("UNPREDICTABLE_GAS_LIMIT")) {
          tx = await token.transfer(to, value, { ...base, gasLimit: GAS_LIMIT_RETRY });
        } else {
          throw e;
        }
      }

      const receipt = await tx.wait(CONFIRMATIONS);
      if (!receipt || receipt.status !== 1) throw new Error("المعاملة لم تُعتمد على السلسلة");

      setAmount(""); setPin("");
      await refresh();

      return {
        txHash: receipt.transactionHash,
        explorerUrl: EXPLORER_TX.ethereum(receipt.transactionHash),
      };
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="Arbitrum (ERC20)"
      symbol="ARB"
      network={NETWORKS.ethereum.label}
      balance={arbBalance}
      address={address}
      networkFee={`${feeEst} ETH`}
      badgeColor="#2f6feb"
      badgeBg="#2f6feb22"
      recipient={recipient}
      amount={amount}
      pin={pin}
      sending={sending || !canSend}
      disabledSend={!canSend}
      onRecipientChange={setRecipient}
      onAmountChange={setAmount}
      onPinChange={setPin}
      onSendAll={() => setAmount(arbBalance)}
      onRefresh={refresh}
      onCopy={copy}
      onSendWithResult={onSendWithResult}
      onBack={() => navigation.goBack()}
    />
  );
}