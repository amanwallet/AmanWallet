// currencies/XRP.tsx — الإصدار المصحح النهائي
import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import TokenTemplate from './TokenTemplate';
import { getXRPBalance, sendXRP } from '../providerAdapter';
import { EXPLORER } from '../providers';

// ✅ استيراد دالة verifyPin
import { verifyPin } from "../screens/pinAuth";

export default function XRP({ navigation }: any) {
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0.000000');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const [destinationTag, setDestinationTag] = useState('');

  useEffect(() => { 
    refresh(); 
  }, []);

  const refresh = async () => {
    try {
      const xrpAddress = await SecureStore.getItemAsync('xrp_address');
      if (!xrpAddress) {
        console.warn('XRP address not found in storage');
        return;
      }
      
      setAddress(xrpAddress);
      const bal = await getXRPBalance(xrpAddress);
      setBalance(Number(bal).toFixed(6));
    } catch (error) {
      console.warn('XRP refresh error:', error);
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
    
    // ✅ التعديل: استخدام verifyPin بدلاً من المقارنة المباشرة
    const ok = await verifyPin(pin);
    if (!ok) throw new Error('الرقم السري غير صحيح.');
    
    const xrpSecret = await SecureStore.getItemAsync('xrp_secret');
    if (!xrpSecret) throw new Error('لا يوجد مفتاح XRP');

    setSending(true);
    try {
      const txHash = await sendXRP({
        seed: xrpSecret,
        to: recipient.trim(),
        amountXRP: amount.trim(),
        destinationTag: destinationTag ? parseInt(destinationTag) : undefined
      });
      
      setAmount('');
      setPin('');
      setDestinationTag('');
      await refresh();
      return { 
        txHash, 
        explorerUrl: EXPLORER.xrp.tx(txHash)
      };
    } finally {
      setSending(false);
    }
  };

  return (
    <TokenTemplate
      title="XRP"
      symbol="XRP"
      network="XRP Ledger"
      balance={balance}
      address={address}
      networkFee="~0.000012 XRP"
      badgeColor="#00AAE4"
      badgeBg="#00AAE422"
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
          key: 'destinationTag',
          label: 'Destination Tag (اختياري)',
          value: destinationTag,
          onChange: setDestinationTag,
          placeholder: 'أدخل Destination Tag',
          keyboardType: 'number-pad'
        }
      ]}
      activationNote="قد يتطلب الحساب إيداع/تفعيل أولي على XRPL."
    />
  );
}