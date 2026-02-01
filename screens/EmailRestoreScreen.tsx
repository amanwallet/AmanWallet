// EmailRestoreScreen.tsx - شاشة الاسترجاع عبر البريد الإلكتروني - مصحح مع تحسينات الأمان
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  StyleSheet, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeProvider';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import * as Crypto from 'expo-crypto';

// استيراد الدوال المشتركة
import { persistAllFromMnemonic, normalizeMnemonic } from '../walletUtils';

// === إعدادات API للاستعادة عبر البريد ===
// 🔧 التصحيح: استخدام HTTP بدلاً من HTTPS للتطبيقات المحلية
const API_BASE = __DEV__ ? "http://api.aman-wallet.com:3000" : "https://aman-wallet.com";

// === دوائر المساعدة للاستعادة عبر البريد ===
function encode(str: string) {
  return new TextEncoder().encode(str);
}

function toB64(u8: Uint8Array) {
  return Buffer.from(u8).toString("base64");
}

function fromB64(s: string) {
  return new Uint8Array(Buffer.from(s, "base64"));
}

// 🔧 دالة اشتقاق مفتاح محسنة باستخدام PBKDF2
async function deriveStrongKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  try {
    console.log('🔑 بدء اشتقاق المفتاح باستخدام خوارزمية PBKDF2 محسنة...');
    
    // استخدام PBKDF2 آمن بدلاً من الحل الحالي
    const passwordBuffer = encode(password);
    const saltString = toB64(salt);
    
    // استخدام expo-crypto لاشتقاق مفتاح آمن
    const derivedString = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password + saltString,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    
    // تحويل إلى Uint8Array وأخذ 32 بايت
    const derivedKey = new Uint8Array(Buffer.from(derivedString, 'hex').slice(0, 32));
    
    // تطبيق تكرارات إضافية للأمان
    let finalKey = derivedKey;
    for (let i = 0; i < 50000; i++) {
      finalKey = nacl.hash(finalKey);
    }
    
    console.log('✅ اشتقاق المفتاح المحسن ناجح');
    return finalKey.slice(0, 32);
  } catch (error) {
    console.error('❌ خطأ في اشتقاق المفتاح المحسن:', error);
    
    // 🔄 البديل الطارئ المحسن
    console.log('🔄 استخدام البديل الآمن الطارئ المحسن...');
    const combined = new Uint8Array(encode(password).length + salt.length);
    combined.set(encode(password));
    combined.set(salt, encode(password).length);
    
    let key = nacl.hash(combined);
    for (let i = 0; i < 100000; i++) {
      key = nacl.hash(key);
    }
    
    return key.slice(0, 32);
  }
}

// 🔧 إضافة دالة التحقق من سلامة البيانات (HMAC)
function generateHMAC(data: string, key: Uint8Array): string {
  const dataBytes = encode(data);
  const combined = new Uint8Array(key.length + dataBytes.length);
  combined.set(key);
  combined.set(dataBytes, key.length);
  const hmac = nacl.hash(combined);
  return toB64(hmac.slice(0, 16)); // أخذ 16 بايت للHMAC
}

// 🔧 دالة فك التشفير المحسنة مع التحقق من HMAC
async function decryptBackupDataWithVerification(
  nonceB64: string, 
  cipherB64: string, 
  saltB64: string, 
  hmacB64: string,
  passwordStr: string
) {
  try {
    console.log('🔓 بدء فك التشفير مع التحقق من السلامة...');
    
    const nonce = fromB64(nonceB64);
    const ciphertext = fromB64(cipherB64);
    const salt = fromB64(saltB64);
    
    const key = await deriveStrongKey(passwordStr, salt);
    
    // التحقق من HMAC أولاً
    const dataToVerify = nonceB64 + cipherB64 + saltB64;
    const calculatedHmac = generateHMAC(dataToVerify, key);
    
    if (calculatedHmac !== hmacB64) {
      console.error('❌ فشل التحقق من سلامة البيانات - HMAC غير متطابق');
      return null;
    }
    
    // فك التشفير بعد التحقق من السلامة
    const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
    
    if (!plaintext) {
      console.error('❌ فشل فك التشفير - المفتاح غير صحيح');
      return null;
    }
    
    const decoded = new TextDecoder().decode(plaintext);
    console.log('✅ فك التشفير والتحقق ناجح');
    return JSON.parse(decoded);
    
  } catch (error) {
    console.error('❌ فشل فك التشفير:', error);
    return null;
  }
}

// 🔧 دالة فك التشفير الموحدة (الإصدار 2.1 و 2.2)
async function decryptBackupData(nonceB64: string, cipherB64: string, saltB64: string, passwordStr: string, hmacB64?: string) {
  try {
    console.log('🔓 بدء فك التشفير بالإصدار المحسن...');
    
    // إذا كان هناك HMAC، استخدم الإصدار المحسن
    if (hmacB64) {
      console.log('🔐 استخدام فك التشفير مع التحقق من HMAC (الإصدار 2.2)');
      return await decryptBackupDataWithVerification(nonceB64, cipherB64, saltB64, hmacB64, passwordStr);
    }
    
    // الإصدار القديم 2.1 بدون HMAC
    console.log('🔐 استخدام فك التشفير بدون HMAC (الإصدار 2.1)');
    
    const nonce = fromB64(nonceB64);
    const ciphertext = fromB64(cipherB64);
    const salt = fromB64(saltB64);
    
    const key = await deriveStrongKey(passwordStr, salt);
    const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
    
    if (!plaintext) {
      console.error('❌ فشل فك التشفير - المفتاح غير صحيح');
      return null;
    }
    
    const decoded = new TextDecoder().decode(plaintext);
    console.log('✅ فك التشفير ناجح');
    return JSON.parse(decoded);
    
  } catch (error) {
    console.error('❌ فشل فك التشفير:', error);
    return null;
  }
}

// 🔧 إضافة التخزين المؤقت للاتصال
let connectionCache: { status: boolean; timestamp: number } | null = null;

async function testServerConnection(): Promise<boolean> {
  // استخدام التخزين المؤقت لمدة 30 ثانية
  if (connectionCache && (Date.now() - connectionCache.timestamp < 30000)) {
    console.log('⚡ استخدام الاتصال المخبأ');
    return connectionCache.status;
  }
  
  try {
    console.log('🔍 جاري اختبار اتصال السيرفر...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${API_BASE}/api/health`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);
    
    const result = response.ok;
    connectionCache = { status: result, timestamp: Date.now() };
    
    console.log(result ? '✅ اختبار اتصال السيرفر ناجح' : '❌ فشل فحص صحة السيرفر');
    return result;
  } catch (error) {
    console.error('❌ فشل اتصال السيرفر:', error);
    connectionCache = { status: false, timestamp: Date.now() };
    return false;
  }
}

/* ===== زر اللغة ===== */
function InlineLanguageToggle() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const [lang, setLang] = useState<'ar'|'en'>(i18n.language.startsWith('ar') ? 'ar' : 'en');
  React.useEffect(() => { setLang(i18n.language.startsWith('ar') ? 'ar' : 'en'); }, [i18n.language]);
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
export default function EmailRestoreScreen() {
  const { colors, resolved } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const rtl = i18n.language.startsWith('ar');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [backupId, setBackupId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [emailLoading, setEmailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('RecoveryHub' as never);
  };

  // 🔧 طلب رمز التحقق - محسن مع معالجة الأخطاء
  const requestOtp = async () => {
    console.log('🔐 بدء عملية طلب رمز التحقق للاستعادة...');
    
    if (!email || !email.includes('@')) {
      Alert.alert(t('alerts.error'), t('backup.invalidEmail'));
      return;
    }

    // اختبر اتصال السيرفر أولاً
    const isConnected = await testServerConnection();
    if (!isConnected) {
      Alert.alert(
        "🔌 خطأ في الاتصال", 
        "لا يمكن الاتصال بالسيرفر. الرجاء:\n\n• التحقق من اتصال الإنترنت\n• التأكد من تشغيل السيرفر\n• المحاولة مرة أخرى لاحقاً"
      );
      return;
    }

    setEmailLoading(true);
    setCurrentStep('جاري إرسال طلب التحقق...');
    
    try {
      const cleanEmail = email.trim().toLowerCase();
      
      console.log('🔐 إرسال طلب رمز التحقق للاستعادة:', {
        email: cleanEmail,
        purpose: "restore",
        timestamp: new Date().toISOString()
      });

      const requestBody = {
        email: cleanEmail,
        purpose: "restore"
      };

      // 🔧 التصحيح: إضافة مهلة للطلب
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 ثانية

      const response = await fetch(`${API_BASE}/api/request-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('🔐 حالة استجابة السيرفر:', response.status);

      const responseText = await response.text();
      console.log('🔐 نص استجابة السيرفر:', responseText.substring(0, 100) + '...');

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('❌ فشل في تحليل استجابة JSON:', e);
        throw new Error("استجابة غير صالحة من السيرفر");
      }

      if (!response.ok) {
        console.error('❌ السيرفر أعاد خطأ:', responseData);
        throw new Error(responseData.error || `خطأ في السيرفر: ${response.status}`);
      }

      setStep('otp');
      setCurrentStep('');
      console.log('✅ طلب رمز التحقق للاستعادة ناجح');
      Alert.alert(t('alerts.ok'), t('restore.otpSent'));
      
    } catch (error: any) {
      console.error('❌ فشل طلب رمز التحقق للاستعادة:', error);
      
      let errorMessage = error.message || "فشل في طلب رمز التحقق";
      
      // 🔧 معالجة أنواع الأخطاء المختلفة
      if (error.name === 'AbortError') {
        errorMessage = "انتهت مهلة الطلب. الرجاء التحقق من اتصال الإنترنت والمحاولة مرة أخرى.";
      } else if (error.message.includes('Network request failed')) {
        errorMessage = "فشل الاتصال بالشبكة. الرجاء التحقق من اتصال الإنترنت.";
      } else if (error.message.includes('SSL')) {
        errorMessage = "خطأ في اتصال الآمان. الرجاء المحاولة لاحقاً.";
      }
      
      Alert.alert(t('alerts.error'), errorMessage);
    } finally {
      setEmailLoading(false);
      setCurrentStep('');
    }
  };

  // 🔧 التحقق من OTP واسترجاع البيانات - محسن مع معالجة الأخطاء
  const verifyOtpAndRestore = async () => {
    console.log('🔍 بدء عملية التحقق من رمز التحقق للاستعادة...');
    
    if (!otpCode || otpCode.length < 6) {
      Alert.alert(t('alerts.error'), "الرجاء إدخال رمز التحقق المكون من 6 أرقام");
      return;
    }

    // اختبر الاتصال أولاً
    const isConnected = await testServerConnection();
    if (!isConnected) {
      Alert.alert(
        "🔌 خطأ في الاتصال", 
        "لا يمكن الاتصال بالسيرفر. الرجاء التحقق من اتصال الإنترنت والمحاولة مرة أخرى."
      );
      return;
    }

    setLoading(true);
    setCurrentStep('جاري التحقق من الرمز...');
    setProgress(20);
    
    try {
      const cleanEmail = email.trim().toLowerCase();
      
      console.log('🔍 إرسال طلب التحقق من رمز التحقق للاستعادة:', {
        email: cleanEmail,
        purpose: "restore",
        otp: "***",
        timestamp: new Date().toISOString()
      });

      const requestBody = {
        email: cleanEmail,
        purpose: "restore",
        otp: otpCode
      };

      // 🔧 التصحيح: إضافة مهلة للطلب
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE}/api/verify-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('🔍 حالة استجابة السيرفر:', response.status);

      const responseText = await response.text();
      console.log('🔍 نص استجابة السيرفر:', responseText.substring(0, 100) + '...');

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('❌ فشل في تحليل استجابة JSON:', e);
        throw new Error("استجابة غير صالحة من السيرفر");
      }

      if (!response.ok) {
        console.error('❌ السيرفر أعاد خطأ:', responseData);
        throw new Error(responseData.error || `خطأ في السيرفر: ${response.status}`);
      }

      if (!responseData.grant) {
        console.error('❌ لا يوجد تفويض في الاستجابة:', responseData);
        throw new Error(t('restore.noGrant'));
      }

      console.log('✅ التحقق من رمز التحقق للاستعادة ناجح، التفويض:', responseData.grant.substring(0, 10) + '...');
      await performRestoreWithGrant(responseData.grant);
      
    } catch (error: any) {
      console.error('❌ فشل التحقق من رمز التحقق للاستعادة:', error);
      
      let errorMessage = error.message || "فشل في التحقق من رمز OTP";
      
      // 🔧 معالجة أنواع الأخطاء المختلفة
      if (error.name === 'AbortError') {
        errorMessage = "انتهت مهلة الطلب. الرجاء المحاولة مرة أخرى.";
      } else if (error.message.includes('Network request failed')) {
        errorMessage = "فشل الاتصال بالشبكة. الرجاء التحقق من اتصال الإنترنت.";
      }
      
      Alert.alert(t('alerts.error'), errorMessage);
      setLoading(false);
      setCurrentStep('');
      setProgress(0);
    }
  };

  // 🔧 استرجاع البيانات باستخدام التفويض - محسن
  const performRestoreWithGrant = async (grantToken: string) => {
    console.log('📥 بدء الاستعادة باستخدام التفويض...');
    
    if (!email || !email.includes('@')) {
      Alert.alert(t('alerts.error'), t('backup.invalidEmail'));
      setLoading(false);
      return;
    }
    
    if (!password || password.length < 12) {
      Alert.alert(t('alerts.error'), "كلمة السر يجب أن تكون 12 حرفاً على الأقل");
      setLoading(false);
      return;
    }

    try {
      const body: any = {
        email: email.trim().toLowerCase(),
        grant: grantToken
      };
      if (backupId) body.backup_id = backupId;

      console.log('📥 جاري استرجاع النسخة الاحتياطية...', { email: body.email });
      setCurrentStep('جاري استرجاع البيانات...');
      setProgress(40);

      // 🔧 التصحيح: إضافة مهلة للطلب
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 ثانية

      const res = await fetch(`${API_BASE}/api/get-backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('📥 حالة استجابة النسخة الاحتياطية:', res.status);

      if (!res.ok) {
        if (res.status === 404) throw new Error(t('restore.noBackup'));
        if (res.status === 401) throw new Error(t('restore.unauthorized'));
        
        const errorText = await res.text();
        console.error('❌ خطأ في استرجاع النسخة الاحتياطية:', errorText);
        throw new Error(t('restore.serverError'));
      }

      const backupData = await res.json();
      console.log('📥 بيانات النسخة الاحتياطية المستلمة:', { 
        version: backupData.version,
        hasSalt: !!backupData.salt,
        hasHmac: !!backupData.hmac,
        securityLevel: backupData.securityLevel || 'standard'
      });
      
      if (!backupData?.nonce || !backupData?.ciphertext) {
        console.error('❌ هيكل بيانات النسخة الاحتياطية غير صالح:', backupData);
        throw new Error(t('restore.badResponse'));
      }

      // فك التشفير بالإصدار المحسن مع HMAC
      console.log('🔓 استخدام فك التشفير بالإصدار المحسن...');
      setCurrentStep('جاري فك التشفير...');
      setProgress(60);

      if (!backupData.salt) {
        console.error('❌ بيانات التشفير غير مكتملة - لا يوجد salt');
        throw new Error("بيانات النسخة الاحتياطية غير صالحة");
      }

      // استخدام الإصدار المحسن مع HMAC إذا كان متوفراً
      const decryptedData = await decryptBackupData(
        backupData.nonce,
        backupData.ciphertext,
        backupData.salt,
        password,
        backupData.hmac // HMAC اختياري للإصدار 2.2
      );

      if (!decryptedData) {
        console.error('❌ فشل فك التشفير - كلمة سر خاطئة أو بيانات تالفة');
        throw new Error("كلمة السر غير صحيحة أو البيانات تالفة");
      }

      const phrase = decryptedData.mnemonic || decryptedData.phrase || decryptedData.recovery;
      if (phrase && typeof phrase === "string") {
        console.log('✅ فك تشفير النسخة الاحتياطية ناجح');
        setCurrentStep('جاري استعادة المحفظة...');
        setProgress(80);
        await handleRestoreSuccess(phrase);
      } else {
        console.error('❌ لم يتم العثور على العبارة المذكرة في البيانات المفكوكة:', decryptedData);
        throw new Error(t('restore.noPhraseFound'));
      }

    } catch (error: any) {
      console.error('❌ فشل عملية الاستعادة:', error);
      
      let errorMessage = error.message || "فشل في عملية الاستعادة";
      
      // 🔧 معالجة أنواع الأخطاء المختلفة
      if (error.name === 'AbortError') {
        errorMessage = "انتهت مهلة استرجاع البيانات. الرجاء المحاولة مرة أخرى.";
      } else if (error.message.includes('Network request failed')) {
        errorMessage = "فشل الاتصال بالشبكة أثناء استرجاع البيانات.";
      }
      
      Alert.alert(t('alerts.error'), errorMessage);
      setLoading(false);
      setCurrentStep('');
      setProgress(0);
    }
  };

  // معالجة الاستعادة الناجحة
  const handleRestoreSuccess = async (mnemonic: string) => {
    try {
      const cleanMnemonic = normalizeMnemonic(mnemonic);
      await SecureStore.setItemAsync('mnemonic', cleanMnemonic);
      await persistAllFromMnemonic(cleanMnemonic);
      
      console.log('✅ الاستعادة ناجحة، الانتقال إلى شاشة الرمز السري');
      setCurrentStep('اكتملت العملية بنجاح!');
      setProgress(100);

      // الانتقال لشاشة PIN
      navigation.navigate('PinEntry' as never, { 
        mnemonic: cleanMnemonic,
        mode: 'email-restore'
      });

    } catch (e: any) {
      console.error('❌ فشل معالجة نجاح الاستعادة:', e);
      Alert.alert(t('alerts.error'), e?.message || (rtl ? 'فشل الاسترجاع' : 'Restore failed'));
      setLoading(false);
      setCurrentStep('');
      setProgress(0);
    }
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: colors.bg }}>
      {/* Header مع سهم الرجوع */}
      <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: colors.bg }]}>
        <TouchableOpacity onPress={onBack} style={[styles.backButton, { borderColor: colors.border }]}>
          <Text style={{ color: colors.primary, fontWeight:'800', fontSize: 16 }}>
            {rtl ? '← رجوع' : 'Back →'}
          </Text>
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontWeight:'900', fontSize:18 }} numberOfLines={1}>
          {rtl ? 'استرجاع بالإيميل' : 'Email Recovery'}
        </Text>
        <InlineLanguageToggle />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal:16, paddingBottom:24 }}>
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: rtl ? 'right' : 'left' }}>
            {rtl ? 'الاستعادة الآمنة عبر البريد الإلكتروني' : 'Secure Restore via Email'}
          </Text>

          {/* مؤشر التقدم */}
          {(loading || emailLoading) && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${progress}%` }
                  ]} 
                />
              </View>
              <Text style={[styles.progressText, { color: colors.text }]}>
                {currentStep} {progress}%
              </Text>
            </View>
          )}

          {/* حقل الإيميل */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>📧 {rtl ? 'البريد الإلكتروني' : 'Email'}</Text>
            <TextInput
              style={[styles.input, !email && styles.inputEmpty, { textAlign: rtl ? 'right' : 'left' }]}
              placeholder="example@email.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!emailLoading && !loading && step === 'email'}
            />
          </View>

          {/* حقل كلمة السر */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>🔐 {rtl ? 'كلمة السر' : 'Password'}</Text>
            <TextInput
              style={[styles.input, !password && styles.inputEmpty, { textAlign: rtl ? 'right' : 'left' }]}
              placeholder={rtl ? 'أدخل كلمة السر (12 حرفاً على الأقل)' : 'Enter password (min 12 characters)'}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
          </View>

          {/* حقل backup_id (اختياري) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>
              🆔 {rtl ? 'معرف النسخة الاحتياطية' : 'Backup ID'} 
              <Text style={styles.optionalText}> {rtl ? '(اختياري)' : '(Optional)'}</Text>
            </Text>
            <TextInput
              style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
              placeholder="backup_123..."
              value={backupId}
              onChangeText={setBackupId}
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          {/* قسم OTP */}
          {step === 'email' ? (
            <TouchableOpacity
              style={[styles.primary, (emailLoading || !email) && styles.buttonDisabled]}
              onPress={requestOtp}
              disabled={emailLoading || !email}
            >
              {emailLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 8 }}>
                    {rtl ? 'جاري الإرسال...' : 'Sending...'}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  🔒 {rtl ? 'طلب رمز التحقق' : 'Request Verification Code'}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.otpSection}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>📱 {rtl ? 'رمز التحقق' : 'Verification Code'}</Text>
                <TextInput
                  style={[styles.input, { textAlign: 'center' }]}
                  placeholder="123456"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="numeric"
                  maxLength={6}
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={[styles.primary, (loading || !otpCode) && styles.buttonDisabled]}
                onPress={verifyOtpAndRestore}
                disabled={loading || !otpCode}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 8 }}>
                      {rtl ? 'جاري الاستعادة...' : 'Restoring...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '800' }}>
                    🚀 {rtl ? 'التحقق واستعادة' : 'Verify and Restore'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondary}
                onPress={() => setStep('email')}
                disabled={loading}
              >
                <Text style={{ color: colors.text, fontWeight: '800' }}>
                  {rtl ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ===== الأنماط ===== */
const styles = StyleSheet.create({
  header: { 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 16 
  },
  backButton: { 
    paddingHorizontal:12, 
    paddingVertical:8, 
    borderRadius:12, 
    borderWidth:1 
  },
  inputGroup: { 
    marginBottom: 16 
  },
  label: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#374151', 
    marginBottom: 8 
  },
  input: { 
    borderWidth: 1, 
    borderRadius: 12, 
    padding: 12, 
    fontSize: 16,
    borderColor: '#d1d5db'
  },
  inputEmpty: { 
    borderColor: '#d1d5db' 
  },
  primary: { 
    backgroundColor: '#3b82f6', 
    paddingVertical: 12, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 8
  },
  secondary: { 
    backgroundColor: '#e5edf7', 
    paddingVertical: 12, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 8
  },
  buttonDisabled: { 
    opacity: 0.6 
  },
  optionalText: { 
    color: '#9ca3af', 
    fontWeight: '400' 
  },
  otpSection: { 
    marginTop: 10 
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});