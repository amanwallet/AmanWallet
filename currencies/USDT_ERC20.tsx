import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';
import TokenTemplate from './TokenTemplate';
import { getERC20Balance, sendERC20, getProvider } from '../providerAdapter';
import { NETWORKS } from "../providers";

const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const DECIMALS = 6;

export default function USDT_ERC20({ navigation }: any) {
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('0.000000');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const [gasFee, setGasFee] = useState('0.000000');

  useEffect(() => { refresh(); }, []);

  const getEthData = async (addr: string) => {
    try {
      const p = getProvider("ethereum");
      const [bal, fd] = await Promise.all([p.getBalance(addr), p.getFeeData()]);
      const gasLimit = ethers.BigNumber.from(100000);
      const maxFeePerGas = fd.maxFeePerGas || ethers.utils.parseUnits('30','gwei');
      const feeWei = gasLimit.mul(maxFeePerGas);
      setGasFee(parseFloat(ethers.utils.formatEther(feeWei)).toFixed(6));
    } catch { setGasFee('0.000000'); }
  };

  const loadWalletAndBalance = async () => {
    try {
      const pk = await SecureStore.getItemAsync('privateKey'); if (!pk) return;
      const wallet = new ethers.Wallet(pk); setWalletAddress(wallet.address);
      const bal = await getERC20Balance({ chain: "ethereum", holder: wallet.address, token: usdtAddress, decimals: DECIMALS });
      setBalance(Number(bal).toFixed(6));
      await getEthData(wallet.address);
    } catch {}
  };

  const refresh = async () => { await loadWalletAndBalance(); };
  const copyToClipboard = async () => { if (!walletAddress) return; await Clipboard.setStringAsync(walletAddress); Alert.alert('تم النسخ', 'تم نسخ عنوان المحفظة'); };

  const onSendWithResult = async () => {
    const storedPin = await SecureStore.getItemAsync('wallet_pin'); if (pin !== storedPin) throw new Error('PIN غير صحيح');
    if (!recipient || !amount) throw new Error('أدخل العنوان والمبلغ');
    const pk = await SecureStore.getItemAsync('privateKey'); if (!pk) throw new Error('لا يوجد مفتاح خاص');
    setSending(true);
    try {
      const tx = await sendERC20({ chain: "ethereum", privateKey: pk, token: usdtAddress, to: recipient.trim(), amount, decimals: DECIMALS });
      setAmount(''); setPin(''); await loadWalletAndBalance();
      return { txHash: tx, explorerUrl: `https://etherscan.io/tx/${tx}` };
    } finally { setSending(false); }
  };

  return (
    <TokenTemplate
      title="محفظة USDT" symbol="USDT" network={NETWORKS.ethereum.label}
      balance={balance} address={walletAddress} networkFee={`${gasFee} ETH`}
      badgeColor="#627EEA" badgeBg="#627EEA22"
      recipient={recipient} amount={amount} pin={pin} sending={sending}
      onBack={() => navigation.goBack()} onRefresh={refresh} onCopy={copyToClipboard}
      onRecipientChange={setRecipient} onAmountChange={setAmount} onPinChange={setPin}
      onSendAll={()=> setAmount(balance)}
      onSendWithResult={onSendWithResult}
    />
  );
}