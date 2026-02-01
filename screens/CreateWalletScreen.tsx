// CreateWalletScreen.tsx - الإصدار المعدل (بدون SEI و XLM)
import 'react-native-get-random-values';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  StyleSheet, ScrollView, ActivityIndicator, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeProvider';

import { ethers } from 'ethers';
import * as secp from '@noble/secp256k1';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { sha256 as sha256_noble } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { bech32 } from 'bech32';
import { keccak256 } from 'ethers/lib/utils';

import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';

// TRON
import { privateKeyToTronAddress } from '../tronHub';

// XRPL
import { Wallet as XRPLWallet } from 'xrpl';

// SUI فقط - تم إزالة SEI
import { suiAddressFromMnemonic } from '../SUI';

// استيراد الدوال المشتركة
import { persistAllFromMnemonic, normalizeMnemonic } from '../walletUtils';

/* ===== Modal: تأكيد النسخ ===== */
function CopyConfirmModal({
  visible, onCancel, onConfirm, rtl
}: { visible: boolean; onCancel: ()=>void; onConfirm: ()=>void; rtl: boolean; }) {
  const { colors, resolved } = useTheme();
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const okWords = ['ok', 'okay', 'موافق', 'اوكي', 'أوكي'];
  const canConfirm = okWords.includes(text.trim().toLowerCase());
  useEffect(()=>{ if (!visible) setText(''); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalWrap}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
            {t('setPin.copyConfirmTitle', 'تحذير مهم')}
          </Text>
          <Text style={{ color: colors.text, marginTop: 6, lineHeight: 20, textAlign: rtl ? 'right' : 'left' }}>
            {t('setPin.copyConfirmBody',
              'العبارة السرية تمنح الوصول الكامل لأموالك. أنت المسؤول الوحيد عن حفظها بشكل آمن. اكتب "موافق" أو "OK" للتأكيد.')}
          </Text>

          <TextInput
            style={[
              styles.input,
              { marginTop: 12, borderColor: colors.border, backgroundColor: resolved==='dark' ? '#0f1520' : '#fafafa', textAlign: rtl ? 'right' : 'left', color: colors.text }
            ]}
            placeholder={rtl ? 'اكتب موافق أو OK هنا' : 'Type OK or موافق here'}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
          />

          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity onPress={onCancel} style={[styles.secondary, { flex:1 }]}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{t('alerts.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={canConfirm ? onConfirm : undefined}
              disabled={!canConfirm}
              style={[styles.primary, { flex:1, opacity: canConfirm ? 1 : .5 }]}
            >
              <Text style={{ fontWeight:'800', color:'#fff' }}>{t('alerts.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ===== Modal: تأكيد الإنشاء ===== */
function CreateConfirmModal({
  visible, onCancel, onConfirm, rtl
}: { visible: boolean; onCancel: ()=>void; onConfirm: ()=>void; rtl: boolean; }) {
  const { colors, resolved } = useTheme();
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const okWords = ['ok', 'okay', 'موافق', 'اوكي', 'أوكي'];
  const canConfirm = okWords.includes(text.trim().toLowerCase());
  useEffect(()=>{ if (!visible) setText(''); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalWrap}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
            {rtl ? 'تأكيد إنشاء المحفظة' : 'Confirm Wallet Creation'}
          </Text>
          <Text style={{ color: colors.text, marginTop: 6, lineHeight: 20, textAlign: rtl ? 'right' : 'left' }}>
            {rtl
              ? 'هل حفظت عبارة الاسترجاع؟ لن تظهر مرة ثانية. أنت المسؤول الوحيد عن حفظها. اكتب "موافق" أو "OK" للمتابعة.'
              : 'Have you saved the recovery phrase? It will NOT be shown again. You are solely responsible for keeping it safe. Type "OK" or "موافق" to continue.'}
          </Text>

          <TextInput
            style={[
              styles.input,
              { marginTop: 12, borderColor: colors.border, backgroundColor: resolved==='dark' ? '#0f1520' : '#fafafa', textAlign: rtl ? 'right' : 'left', color: colors.text }
            ]}
            placeholder={rtl ? 'اكتب موافق أو OK هنا' : 'Type OK or موافق here'}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
          />

          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity onPress={onCancel} style={[styles.secondary, { flex:1 }]}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{t('alerts.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={canConfirm ? onConfirm : undefined}
              disabled={!canConfirm}
              style={[styles.primary, { flex:1, opacity: canConfirm ? 1 : .5 }]}
            >
              <Text style={{ fontWeight:'800', color:'#fff' }}>{t('alerts.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ===== شبكة 3×4 لعرض الكلمات ===== */
function GridShell({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme();
  return (
    <View style={[
      styles.mnCard,
      { borderColor: resolved==='dark' ? '#243041' : '#cfd8e3', backgroundColor: resolved==='dark' ? '#0f1520' : '#f8fafc' }
    ]}>
      <View style={{ flexDirection: 'row', flexWrap:'wrap', justifyContent:'space-between' }}>
        {children}
      </View>
    </View>
  );
}

function GridCell({ index, children }: { index:number; children: React.ReactNode }) {
  const { resolved } = useTheme();
  return (
    <View style={[
      styles.cell,
      { borderColor: resolved==='dark' ? '#243041' : '#cfd8e3', backgroundColor: resolved==='dark' ? '#121a27' : '#fff' }
    ]}>
      <Text style={{ fontSize:11, fontWeight:'800', marginBottom:4, opacity:.8, color: resolved==='dark' ? '#93a4bc' : '#64748b' }}>{index+1}</Text>
      {children}
    </View>
  );
}

function MnemonicGridReadonly({ phrase }: { phrase: string }) {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  const { resolved } = useTheme();
  return (
    <GridShell>
      {Array.from({ length: 12 }).map((_, i) => (
        <GridCell key={i} index={i}>
          <Text selectable style={{ fontSize:16, color: resolved==='dark' ? '#e5e7eb' : '#111827' }}>
            {words[i] || '•••••'}
          </Text>
        </GridCell>
      ))}
    </GridShell>
  );
}

/* ===== زر اللغة ===== */
function InlineLanguageToggle() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const [lang, setLang] = useState<'ar'|'en'>(i18n.language.startsWith('ar') ? 'ar' : 'en');
  useEffect(()=>{ setLang(i18n.language.startsWith('ar') ? 'ar' : 'en'); }, [i18n.language]);
  const toggle = async () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    await i18n.changeLanguage(next);
    await SecureStore.setItemAsync('app_lang', next);
    setLang(next);
  };
  return (
    <TouchableOpacity
      onPress={toggle}
      style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:12, borderWidth:1, borderColor: colors.border }}
    >
      <Text style={{ fontWeight:'800' }}>{lang === 'ar' ? 'EN' : 'AR'}</Text>
    </TouchableOpacity>
  );
}

/* ===== الشاشة الرئيسية ===== */
export default function CreateWalletScreen() {
  const { colors, resolved } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const rtl = i18n.language.startsWith('ar');

  const [generated, setGenerated] = useState('');
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('RecoveryHub' as any);
  };

  const onGenerate = () => {
    const m = generateMnemonic(english, 128);
    setGenerated(m); 
    setAck(false);
  };

  const actuallyCopy = async () => {
    if (!generated) return;
    await Clipboard.setStringAsync(generated);
    Alert.alert(t('alerts.ok'), t('token.copied'));
    setTimeout(async () => {
      const cur = (await Clipboard.getStringAsync()) || "";
      if (cur.trim() === generated.trim()) await Clipboard.setStringAsync("");
    }, 30_000);
    setShowCopyConfirm(false);
    setAck(true);
  };

  const doCreate = async () => {
    try {
      setLoading(true);
      
      // حفظ العبارة السرية مؤقتاً (بدون PIN)
      const cleanMnemonic = normalizeMnemonic(generated);
      await SecureStore.setItemAsync('mnemonic', cleanMnemonic);
      await persistAllFromMnemonic(cleanMnemonic);
      
      // تنظيف الحالة المحلية
      setGenerated('');
      setAck(false);

      // الانتقال لشاشة PIN مع العبارة
      navigation.navigate('PinEntry', { 
        mnemonic: cleanMnemonic,
        mode: 'create'
      });

    } catch (e: any) {
      Alert.alert("خطأ", e?.message || "فشل الإنشاء");
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!generated) return Alert.alert(t('alerts.warn'), rtl ? 'ولّد العبارة أولاً' : 'Generate the phrase first');
    
    const cleanGenerated = normalizeMnemonic(generated);
    if (!validateMnemonic(cleanGenerated, english)) return Alert.alert(t('alerts.error'), rtl ? 'العبارة غير صحيحة' : 'Invalid phrase');

    setShowCreateConfirm(true);
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: colors.bg }]}>
        <TouchableOpacity onPress={onBack} style={[styles.headBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.primary, fontWeight:'800' }}>{rtl ? 'رجوع' : 'Back'}</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontWeight:'900', fontSize:18 }} numberOfLines={1}>
          {t('setPin.title') || 'إنشاء محفظة جديدة'}
        </Text>
        <InlineLanguageToggle />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal:16, paddingBottom:24 }}>
        <View style={{ marginTop:12 }}>
          <Text style={{ fontWeight:'800', color: colors.text, marginBottom: 8 }}>
            {rtl ? `عبارة الاسترجاع (12 كلمة)` : `Recovery phrase (12 words)`}
          </Text>

          {!generated ? (
            <TouchableOpacity onPress={onGenerate} disabled={loading} style={[styles.secondary, loading && {opacity:0.6}]}>
              <Text style={{ color:'#3b82f6', fontWeight:'800' }}>{rtl ? 'توليد العبارة' : 'Generate phrase'}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <MnemonicGridReadonly phrase={generated} />

              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap:8 }}>
                <TouchableOpacity onPress={()=>setShowCopyConfirm(true)} disabled={loading} style={[styles.primary, loading && {opacity:0.6}]}>
                  <Text style={{ color:'#fff', fontWeight:'800' }}>{rtl ? 'نسخ' : 'Copy'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onGenerate} disabled={loading} style={[styles.secondary, loading && {opacity:0.6}]}>
                  <Text style={{ color:'#3b82f6', fontWeight:'800' }}>{rtl ? 'إعادة توليد' : 'Regenerate'}</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems:'center', gap:8, marginTop:8 }}>
                <TouchableOpacity onPress={()=>setAck(a=>!a)} style={[styles.chk, { borderColor: colors.border, backgroundColor: ack ? '#3b82f6' : 'transparent' }]} />
                <Text style={{ color: colors.text }}>
                  {rtl ? 'أقر أني كتبت العبارة في مكان آمن' : 'I confirm I wrote the phrase safely'}
                </Text>
              </View>
            </>
          )}

          <TouchableOpacity
            onPress={handleCreate}
            disabled={loading || !generated}
            style={[styles.primary, { marginTop: 12, opacity: (loading || !generated) ? .6 : 1 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color:'#fff', fontWeight:'800' }}>
                {rtl ? '🚀 إنشاء المحفظة' : '🚀 Create Wallet'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modals */}
      <CopyConfirmModal
        visible={showCopyConfirm}
        onCancel={()=>setShowCopyConfirm(false)}
        onConfirm={actuallyCopy}
        rtl={rtl}
      />
      <CreateConfirmModal
        visible={showCreateConfirm}
        onCancel={()=>setShowCreateConfirm(false)}
        onConfirm={() => { setShowCreateConfirm(false); setAck(true); doCreate(); }}
        rtl={rtl}
      />
    </SafeAreaView>
  );
}

/* ===== الأنماط ===== */
const styles = StyleSheet.create({
  header: { justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headBtn: { paddingHorizontal:12, paddingVertical:8, borderRadius:12, borderWidth:1 },
  hint: { opacity:.7, marginBottom:6, textAlign:'left' },
  input: { borderWidth:1, borderRadius:12, padding:12, fontSize:16, marginBottom:8 },
  primary: { backgroundColor:'#3b82f6', paddingVertical:12, borderRadius:12, alignItems:'center' },
  secondary: { backgroundColor:'#e5edf7', paddingVertical:12, borderRadius:12, alignItems:'center' },
  chk: { width:20, height:20, borderRadius:4, borderWidth:2 },
  mnCard: { borderWidth:1, borderRadius:12, padding:12, marginTop:8 },
  cell: { width: '31%', marginBottom:10, borderWidth:1, borderRadius:10, padding:10 },
  modalWrap: { flex:1, backgroundColor:'rgba(0,0,0,.4)', justifyContent:'center', padding:20 },
  modalCard: { borderRadius:14, padding:16 },
  modalTitle: { fontWeight:'900', fontSize:18 },
});