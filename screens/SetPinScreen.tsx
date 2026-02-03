// SetPinScreen.tsx - الإصدار المعدل (للاسترجاع بـ 12 كلمة فقط)
import 'react-native-get-random-values';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeProvider';

import { validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';

// استيراد الدوال المشتركة
import { persistAllFromMnemonic, normalizeMnemonic } from '../walletUtils';

/* ===== شبكة 3×4 لإدخال الكلمات ===== */
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

function MnemonicGridEditable({
  value, onChange, count = 12, rtl = true
}: { value: string; onChange: (s:string)=>void; count?: 12; rtl?: boolean }) {
  const { resolved } = useTheme();
  const words = useMemo(()=> {
    const arr = value.trim().split(/\s+/).filter(Boolean);
    return Array.from({ length: count }, (_, i) => arr[i] || '');
  }, [value, count]);
  const inputs = useRef<Array<TextInput|null>>([]);

  const setWord = (i:number, w:string) => {
    if (w.includes(' ')) {
      const parts = w.trim().replace(/\s+/g,' ').split(' ');
      const base = value.trim().split(/\s+/).filter(Boolean);
      while (base.length < count) base.push('');
      for (let k = 0; k < parts.length && i + k < count; k++) base[i + k] = parts[k].toLowerCase();
      onChange(base.join(' ').trim());
      inputs.current[Math.min(i + parts.length, count - 1)]?.focus();
      return;
    }
    const base = value.trim().split(/\s+/).filter(Boolean);
    while (base.length < count) base.push('');
    base[i] = w.replace(/\s/g,'').toLowerCase();
    onChange(base.join(' ').trim());
  };
  return (
    <GridShell>
      {Array.from({ length: count }).map((_, i) => (
        <GridCell key={i} index={i}>
          <TextInput
            ref={(r)=>inputs.current[i]=r}
            style={{ fontSize:16, padding:0, textAlign: rtl ? 'right' : 'left', color: resolved==='dark' ? '#e5e7eb' : '#111827' }}
            value={words[i]}
            onChangeText={(t)=>setWord(i,t)}
            returnKeyType={i===count-1 ? 'done' : 'next'}
            onSubmitEditing={()=>inputs.current[i+1]?.focus()}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="•••••"
            placeholderTextColor={resolved==='dark' ? '#6b7280' : '#9ca3af'}
          />
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
export default function SetPinScreen({ navigation, route }: any) {
  const { colors, resolved } = useTheme();
  const { t, i18n } = useTranslation();
  const rtl = i18n.language.startsWith('ar');

  const [restore, setRestore] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(()=>{ 
    (async ()=>{
      const saved = await SecureStore.getItemAsync('app_lang');
      if (saved === 'ar' || saved === 'en') await i18n.changeLanguage(saved);
      
      const m = (route.params as any)?.mnemonic;
      if (m) {
        setRecoveryMode(true);
        
        // تنظيف العبارة قبل الاستخدام
        const cleanMnemonic = normalizeMnemonic(m);
        setRestore(cleanMnemonic);
        
        try {
          setLoading(true);
          await persistAllFromMnemonic(cleanMnemonic);
          await SecureStore.setItemAsync("mnemonic", cleanMnemonic);
          setLoading(false);
          navigation.replace("Home");
        } catch (error) {
          console.warn('Recovery failed:', error);
          setLoading(false);
          Alert.alert(t('alerts.error'), t('alerts.recoveryFailed'));
        }
      }
    })();
  }, [route?.params]);

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('RecoveryHub' as any);
  };

  const pasteRestore = async () => {
    const txt = (await Clipboard.getStringAsync())?.trim() || '';
    if (!txt) return;
    const cleanTxt = normalizeMnemonic(txt);
    setRestore(cleanTxt);
  };

  const handleRestore = async () => {
    try {
      const cleanRestore = normalizeMnemonic(restore);
      const n = cleanRestore ? cleanRestore.split(' ').length : 0;

      if (n !== 12) {
        return Alert.alert(t('alerts.warn'), rtl ? 'أدخل 12 كلمة' : 'Enter 12 words');
      }

      if (!validateMnemonic(cleanRestore, english)) {
        return Alert.alert(t('alerts.error'), rtl ? 'العبارة غير صحيحة' : 'Invalid phrase');
      }

      setLoading(true);
      
      // حفظ العبارة مؤقتاً
      await SecureStore.setItemAsync('mnemonic', cleanRestore);
      await persistAllFromMnemonic(cleanRestore);
      
      // تنظيف الحالة المحلية
      setRestore('');

      // الانتقال لشاشة PIN
      navigation.navigate('PinEntry', { 
        mnemonic: cleanRestore,
        mode: 'restore'
      });

    } catch (e: any) {
      Alert.alert(t('alerts.error'), e?.message || (rtl ? 'فشل الاسترجاع' : 'Restore failed'));
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: colors.bg }]}>
        <TouchableOpacity onPress={onBack} style={[styles.headBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.primary, fontWeight:'800' }}>{rtl ? 'رجوع' : 'Back'}</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontWeight:'900', fontSize:18 }} numberOfLines={1}>
          {recoveryMode ? (rtl ? 'استرجاع المحفظة' : 'Wallet Recovery') : (t('setPin.title') || 'استرجاع المحفظة')}
        </Text>
        <InlineLanguageToggle />
      </View>

      {recoveryMode && loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.text, marginTop: 16 }}>
            {rtl ? 'جاري استرجاع المحفظة...' : 'Recovering wallet...'}
          </Text>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal:16, paddingBottom:24 }}>
          <View style={{ marginTop:12 }}>
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', justifyContent:'space-between', alignItems:'center' }}>
              <Text style={{ fontWeight:'800', color: colors.text, marginBottom: 8 }}>
                {t('recover.title') || 'Recovery phrase (12 words)'}
              </Text>
              <TouchableOpacity onPress={pasteRestore} disabled={loading}>
                <Text style={{ color:'#3b82f6', fontWeight:'800', opacity: loading ? 0.6 : 1 }}>
                  {rtl ? 'لصق من الحافظة' : 'Paste from clipboard'}
                </Text>
              </TouchableOpacity>
            </View>

            <MnemonicGridEditable value={restore} onChange={setRestore} rtl={rtl} />

            <TouchableOpacity
              onPress={handleRestore}
              disabled={loading}
              style={[styles.primary, { marginTop: 12, opacity: loading ? .6 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color:'#fff', fontWeight:'800' }}>
                  {rtl ? '🔄 استرجاع المحفظة' : '🔄 Restore Wallet'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ===== الأنماط ===== */
const styles = StyleSheet.create({
  header: { justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headBtn: { paddingHorizontal:12, paddingVertical:8, borderRadius:12, borderWidth:1 },
  input: { borderWidth:1, borderRadius:12, padding:12, fontSize:16, marginBottom:8 },
  primary: { backgroundColor:'#3b82f6', paddingVertical:12, borderRadius:12, alignItems:'center' },
  secondary: { backgroundColor:'#e5edf7', paddingVertical:12, borderRadius:12, alignItems:'center' },
  mnCard: { borderWidth:1, borderRadius:12, padding:12, marginTop:8 },
  cell: { width: '31%', marginBottom:10, borderWidth:1, borderRadius:10, padding:10 },
});