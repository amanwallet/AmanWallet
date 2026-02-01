// currencies/LINK.tsx
import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';
import TokenTemplate from './TokenTemplate';
import { getLINKBalance, sendLINKBalance, getProvider } from '../providerAdapter';
import { NETWORKS } from "../providers";

export default function LINK({ navigation }: any) {
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0.000000');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const [gasFee, setGasFee] = useState('0.000000');

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try {
      const pk = await SecureStore.getItemAsync('privateKey');
      if (!pk) return;
      
      const wallet = new ethers.Wallet(pk);
      setAddress(wallet.address);
      
      const bal = await getLINKBalance(wallet.address);
      setBalance(Number(bal).toFixed(6));
      
      await estimateGasFee();
    } catch {
      setBalance('0.000000');
    }
  };

  const estimateGasFee = async () => {
    try {
      const p = getProvider("ethereum");
      const fd = await p.getFeeData();
      const gasLimit = ethers.BigNumber.from(100000);
      const maxFeePerGas = fd.maxFeePerGas || ethers.utils.parseUnits('30', 'gwei');
      const feeWei = gasLimit.mul(maxFeePerGas);
      setGasFee(Number(ethers.utils.formatEther(feeWei)).toFixed(6));
    } catch {
      setGasFee('0.000000');
    }
  };

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert('تم النسخ', 'تم نسخ عنوان المحفظة.');
  };

  const onSendWithResult = async () => {
    if (!recipient || !amount) throw new Error('أدخل العنوان والمبلغ.');
    if (!ethers.utils.isAddress(recipient)) throw new Error('عنوان المستلم غير صحيح.');
    
    const savedPin = await SecureStore.getItemAsync('wallet_pin');
    if (pin !== savedPin) throw new Error('الرقم السري غير صحيح.');
    
    const pk = await SecureStore.getItemAsync('privateKey');
    if (!pk) throw new Error('لا يوجد مفتاح خاص');

    setSending(true);
    try {
      const txHash = await sendLINKBalance({
        privateKey: pk,
        to: recipient.trim(),
        amount: amount.trim()
      });
      
      setAmount('');
      setPin('');
      await refresh();
      return { 
        txHash, 
        explorerUrl: `https://etherscan.io/tx/${txHash}` 
      };
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="Chainlink"
      symbol="LINK"
      network={NETWORKS.ethereum.label}
      balance={balance}
      address={address}
      networkFee={`${gasFee} ETH`}
      badgeColor="#2A5ADA"
      badgeBg="#2A5ADA22"
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