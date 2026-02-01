import React,{useEffect,useState} from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ethers } from "ethers";
import TokenTemplate from "./TokenTemplate";
import { getERC20Balance, sendERC20 } from "../providerAdapter";
import { NETWORKS } from "../providers";

const TOKEN = ethers.utils.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"); // USDC
const DECIMALS = 6;

export default function USDC_ERC20({navigation}:any){
  const [address,setAddress]=useState(""),[balance,setBalance]=useState("0.000000");
  const [recipient,setRecipient]=useState(""),[amount,setAmount]=useState("");
  const [pin,setPin]=useState(""),[sending,setSending]=useState(false);

  useEffect(()=>{refresh();},[]);
  const refresh=async()=>{ try{
    const pk=await SecureStore.getItemAsync("privateKey"); if(!pk) return;
    const w=new ethers.Wallet(pk); setAddress(w.address);
    const bal=await getERC20Balance({ chain:"ethereum", holder: w.address, token: TOKEN, decimals: DECIMALS });
    setBalance(Number(bal).toFixed(6));
  }catch{ setBalance("0.000000"); } };

  const copy=async()=>{ if(!address)return; await Clipboard.setStringAsync(address); Alert.alert("تم النسخ","تم نسخ العنوان"); };

  const onSendWithResult=async()=>{ 
    const saved=await SecureStore.getItemAsync("wallet_pin"); if(saved!==pin) throw new Error("الرقم السري غير صحيح");
    const pk=await SecureStore.getItemAsync("privateKey"); if(!pk) throw new Error("لا يوجد مفتاح خاص");
    setSending(true);
    try{
      const txHash=await sendERC20({ chain:"ethereum", privateKey: pk, token: TOKEN, to: recipient.trim(), amount: amount.trim(), decimals: DECIMALS });
      setAmount(""); setPin(""); await refresh();
      return { txHash, explorerUrl: `https://etherscan.io/tx/${txHash}` };
    } finally { setSending(false); }
  };

  return (
    <TokenTemplate
      title="USDC (ERC20)" symbol="USDC" network={NETWORKS.ethereum.label}
      balance={balance} address={address}
      badgeColor="#2775CA" badgeBg="#2775CA22"
      recipient={recipient} amount={amount} pin={pin} sending={sending}
      onBack={()=>navigation.goBack()} onRefresh={refresh} onCopy={copy}
      onRecipientChange={setRecipient} onAmountChange={setAmount} onPinChange={setPin}
      onSendAll={()=> setAmount(balance)}
      onSendWithResult={onSendWithResult}
    />
  );
}