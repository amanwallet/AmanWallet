// currencies/LIGHT_BEP20.tsx — LIGHT (BEP20 on BSC)
import React, { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getERC20Balance, sendERC20 } from "../providerAdapter";
import { NETWORKS, EXPLORER_TX } from "../providers";

// عنوان عقد LIGHT على BSC (BEP20) - تم إصلاحه
const TOKEN_ADDRESS = "0x2cd39c66ac8ed7d76c43b2e6d24e6b6a5b2e0174"; // استخدام العنوان بأحرف صغيرة

export default function LIGHT_BEP20({ navigation }: any) {
  const [address, setAddress]   = useState("");
  const [balance, setBalance]   = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount]     = useState("");
  const [pin, setPin]           = useState("");
  const [sending, setSending]   = useState(false);
  const [decimals, setDecimals] = useState<number | null>(null);

  // قراءة Decimals من العقد مرة واحدة
  const decimalsReader = useMemo(() => {
    const abi = ["function decimals() view returns (uint8)"];
    const provider = new ethers.providers.JsonRpcProvider(NETWORKS.bsc.rpc);
    return new ethers.Contract(TOKEN_ADDRESS, abi, provider);
  }, []);

  useEffect(() => { init(); }, []);

  async function init() {
    try {
      const pk = await SecureStore.getItemAsync("privateKey");
      if (!pk) { 
        Alert.alert("لا يوجد محفظة", "أنشئ أو استورد محفظة أولاً"); 
        return; 
      }
      const wallet = new ethers.Wallet(pk);
      const walletAddress = await wallet.getAddress();
      setAddress(walletAddress);
      
      try { 
        const dec = await decimalsReader.decimals();
        setDecimals(Number(dec) || 18);
      } catch {
        setDecimals(18);
      }
      
      await refresh();
    } catch (e:any) { 
      console.error("خطأ في init:", e);
      Alert.alert("خطأ", e?.message ?? String(e)); 
    }
  }

  async function refresh() {
    try {
      const pk = await SecureStore.getItemAsync("privateKey");
      if (!pk) return;
      
      const addr = new ethers.Wallet(pk).address;
      const b = await getERC20Balance({ 
        chain:"bsc", 
        holder: addr, 
        token: TOKEN_ADDRESS, 
        decimals: decimals ?? undefined 
      });
      setBalance(Number(b).toFixed(6));
    } catch (e:any) { 
      console.error("خطأ في refresh:", e);
      setBalance("0.000000");
    }
  }

  function copy() {
    Clipboard.setStringAsync(address);
    Alert.alert("تم النسخ", "نُسخ العنوان");
  }

  async function onSendWithResult() {
    try {
      if (!recipient || !amount) { 
        Alert.alert("حقول ناقصة", "أدخل العنوان والمبلغ"); 
        return; 
      }
      
      setSending(true);
      const pk = await SecureStore.getItemAsync("privateKey");
      if (!pk) throw new Error("المفتاح غير موجود");
      
      const txHash = await sendERC20({
        chain: "bsc",
        privateKey: pk,
        token: TOKEN_ADDRESS,
        to: recipient.trim(),
        amount: amount.trim(),
        decimals: decimals ?? undefined,
      });
      
      setAmount("");
      setPin("");
      await refresh();
      
      return { 
        txHash, 
        explorerUrl: EXPLORER_TX.bsc(txHash) 
      };
    } catch (e:any) {
      console.error("فشل الإرسال:", e);
      Alert.alert("فشل الإرسال", e?.message ?? String(e));
      throw e;
    } finally { 
      setSending(false); 
    }
  }

  return (
    <TokenTemplate
      title="LIGHT"
      symbol="LIGHT"
      amountLabel="(LIGHT)"
      networkFee="BNB: رسوم الشبكة"
      badgeColor="#FFD700"
      badgeBg="#FFD70022"
      address={address}
      balance={balance}
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