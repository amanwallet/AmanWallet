import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';
import TokenTemplate from './TokenTemplate';
import { getERC20Balance, sendERC20, getProvider } from '../providerAdapter';
import { NETWORKS } from "../providers";

const SHIB_ADDRESS = '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE';

export default function SHIB({ navigation }: any) {
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0.000000');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const [gasFee, setGasFee] = useState('0.000000');

  useEffect(() => { refresh(); }, []);
  const refresh = async () => { await loadWalletAndBalance(); await estimateGasFee(); };

  const loadWalletAndBalance = async () => {
    try {
      const pk = await SecureStore.getItemAsync('privateKey'); if (!pk) return;
      const wallet = new ethers.Wallet(pk); setAddress(wallet.address);
      const bal = await getERC20Balance({ chain: "ethereum", holder: wallet.address, token: SHIB_ADDRESS });
      setBalance(Number(bal).toFixed(6));
    } catch { setBalance('0.000000'); }
  };

  const estimateGasFee = async () => {
    try {
      const p = getProvider("ethereum");
      const fd = await p.getFeeData();
      const gasLimit = ethers.BigNumber.from(100000);
      const maxFeePerGas = fd.maxFeePerGas || ethers.utils.parseUnits('30', 'gwei');
      const feeWei = gasLimit.mul(maxFeePerGas);
      setGasFee(Number(ethers.utils.formatEther(feeWei)).toFixed(6));
    } catch { setGasFee('0.000000'); }
  };

  const copy = async () => { if (!address) return; await Clipboard.setStringAsync(address); Alert.alert('تم النسخ', 'تم نسخ عنوان المحفظة.'); };

  const onSendWithResult = async () => {
    if (!recipient || !amount) throw new Error('أدخل العنوان والمبلغ.');
    if (!ethers.utils.isAddress(recipient)) throw new Error('عنوان المستلم غير صحيح.');
    const savedPin = await SecureStore.getItemAsync('wallet_pin'); if (pin !== savedPin) throw new Error('الرقم السري غير صحيح.');
    const pk = await SecureStore.getItemAsync('privateKey'); if (!pk) throw new Error('لا يوجد مفتاح خاص');

    setSending(true);
    try {
      const txHash = await sendERC20({ chain: "ethereum", privateKey: pk, token: SHIB_ADDRESS, to: recipient.trim(), amount: amount.trim() });
      setAmount(''); setPin(''); await loadWalletAndBalance();
      return { txHash, explorerUrl: `https://etherscan.io/tx/${txHash}` };
    } finally { setSending(false); }
  };

  return (
    <TokenTemplate
      title="Shiba Inu (SHIB)" symbol="SHIB" network={NETWORKS.ethereum.label}
      balance={balance} address={address} networkFee={`${gasFee} ETH`}
      badgeColor="#E74C3C" badgeBg="#E74C3C22"
      recipient={recipient} amount={amount} pin={pin} sending={sending}
      onBack={() => navigation.goBack()} onRefresh={refresh} onCopy={copy}
      onRecipientChange={setRecipient} onAmountChange={setAmount} onPinChange={setPin}
      onSendAll={() => setAmount(balance)}
      onSendWithResult={onSendWithResult}
    />
  );
}