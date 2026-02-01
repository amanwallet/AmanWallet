// currencies/ASTER_BEP20.tsx — ASTER (BEP20 on BSC)
import React, { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getERC20Balance, sendERC20 } from "../providerAdapter";
import { NETWORKS, EXPLORER_TX } from "../providers";

// عنوان عقد ASTER على BSC (BEP20)
const TOKEN_ADDRESS = ethers.utils.getAddress("0x000Ae314E2A2172a039B26378814C252734f556A");

export default function ASTER_BEP20({ navigation }: any) {
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
      
      // ✅ حفظ عنوان ASTER للتأكد من ظهوره في HomeScreen
      await SecureStore.setItemAsync("aster_address", walletAddress);
      
      try { 
        const dec = await decimalsReader.decimals();
        setDecimals(Number(dec) || 18);
      } catch {
        setDecimals(18);
      }
      
      await refresh();
    } catch (e:any) { 
      Alert.alert("خطأ", e?.message ?? String(e)); 
    }
  }

  async function refresh() {
    try {
      const pk = await SecureStore.getItemAsync("privateKey");
      const addr = new ethers.Wallet(String(pk)).address;
      const b = await getERC20Balance({ 
        chain:"bsc", 
        holder: addr, 
        token: TOKEN_ADDRESS, 
        decimals: decimals ?? undefined 
      });
      setBalance(Number(b).toFixed(6));
      
      // ✅ حفظ الرصيد للتأكد من ظهوره في HomeScreen
      await SecureStore.setItemAsync("custom_aster_balance", Number(b).toFixed(6));
    } catch (e:any) { 
      Alert.alert("تعذّر تحديث الرصيد", e?.message ?? String(e)); 
    }
  }

  function copy() {
    Clipboard.setStringAsync(address);
    Alert.alert("تم النسخ", "نُسخ العنوان");
  }

  // إرسال مع إرجاع نتيجة لاستخدامها في شاشة السجل
  async function onSendWithResult() {
    try {
      if (!recipient || !amount) { Alert.alert("حقول ناقصة", "أدخل العنوان والمبلغ"); return; }
      setSending(true);
      const pk = await SecureStore.getItemAsync("privateKey");
      if (!pk) throw new Error("المفتاح غير موجود");
      const txHash = await sendERC20({
        chain: "bsc",
        privateKey: pk!,
        token: TOKEN_ADDRESS,
        to: recipient.trim(),
        amount: amount.trim(),
        decimals: decimals ?? undefined,
      });
      return { ok:true, tx: { chain:"bsc", hash: txHash } };
    } catch (e:any) {
      Alert.alert("فشل الإرسال", e?.message ?? String(e));
      return { ok:false };
    } finally { setSending(false); }
  }

  return (
    <TokenTemplate
      title="ASTER"
      symbol="ASTER"
      amountLabel="(ASTER)"
      networkFee="BNB: رسوم الشبكة"
      badgeColor="#2563EB"
      badgeBg="#2563EB22"
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