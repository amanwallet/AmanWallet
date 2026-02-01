// currencies/XLM.tsx — الإصدار المصحح النهائي
import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import TokenTemplate from './TokenTemplate';
import { getXLMBalance, sendXLM } from '../providerAdapter';
import { EXPLORER } from '../providers';

export default function XLM({ navigation }: any) {
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0.000000');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const [memo, setMemo] = useState('');

  useEffect(() => { 
    refresh(); 
  }, []);

  const refresh = async () => {
    try {
      const xlmAddress = await SecureStore.getItemAsync('xlm_address');
      if (!xlmAddress) {
        console.warn('XLM address not found in storage');
        return;
      }
      
      setAddress(xlmAddress);
      const bal = await getXLMBalance(xlmAddress);
      setBalance(Number(bal).toFixed(6));
    } catch (error) {
      console.warn('XLM refresh error:', error);
      setBalance('0.000000');
    }
  };

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert('تم النسخ', 'تم نسخ عنوان المحفظة.');
  };

  const onSendWithResult = async () => {
    if (!recipient || !amount) throw new Error('أدخل العنوان والمبلغ.');
    
    const savedPin = await SecureStore.getItemAsync('wallet_pin');
    if (pin !== savedPin) throw new Error('الرقم السري غير صحيح.');
    
    const xlmSecret = await SecureStore.getItemAsync('xlm_secret');
    if (!xlmSecret) throw new Error('لا يوجد مفتاح XLM');

    setSending(true);
    try {
      const txHash = await sendXLM({
        secret: xlmSecret,
        to: recipient.trim(),
        amountXLM: amount.trim(),
        memo: memo || undefined
      });
      
      setAmount('');
      setPin('');
      setMemo('');
      await refresh();
      return { 
        txHash, 
        explorerUrl: EXPLORER.xlm.tx(txHash)
      };
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="XLM"
      symbol="XLM"
      network="Stellar"
      balance={balance}
      address={address}
      networkFee="~0.00001 XLM"
      badgeColor="#14B6E8"
      badgeBg="#14B6E822"
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
      onAfterSend={(tx) => navigation.navigate("Logs", { focusTx: tx })}
      extraFields={[
        {
          key: 'memo',
          label: 'Memo (اختياري)',
          value: memo,
          onChange: setMemo,
          placeholder: 'أدخل Memo نصي'
        }
      ]}
      activationNote="قد يحتاج الحساب تفعيل برصيد أساسي على Stellar."
    />
  );
}