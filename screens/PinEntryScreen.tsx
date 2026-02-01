// PinEntryScreen.tsx - الإصدار المصحح مع تشخيص مشكلة ciphertext
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeProvider';
import * as SecureStore from 'expo-secure-store';
import nacl from "tweetnacl";
import * as Crypto from 'expo-crypto';

// إعدادات API
const API_BASE = __DEV__ ? "http://api.aman-wallet.com:3000" : "https://aman-wallet.com";

// دوائر المساعدة
function encode(str: string) {
  return new TextEncoder().encode(str);
}

function toB64(u8: Uint8Array) {
  return Buffer.from(u8).toString("base64");
}

function fromB64(s: string) {
  return new Uint8Array(Buffer.from(s, "base64"));
}

// دالة اشتقاق المفتاح
async function deriveStrongKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  try {
    const passwordBuffer = encode(password);
    const saltString = toB64(salt);
    
    const derivedString = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password + saltString,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    
    const derivedKey = new Uint8Array(Buffer.from(derivedString, 'hex').slice(0, 32));
    
    let finalKey = derivedKey;
    for (let i = 0; i < 50000; i++) {
      finalKey = nacl.hash(finalKey);
    }
    
    return finalKey.slice(0, 32);
  } catch (error) {
    console.error('Key derivation error:', error);
    
    // البديل الطارئ
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

// دالة التحقق من قوة كلمة السر
function validatePasswordStrength(password: string): { isValid: boolean; message: string } {
  if (password.length < 12) {
    return { isValid: false, message: 'Password must be at least 12 characters' };
  }
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
    return { 
      isValid: false, 
      message: 'Password must include uppercase, lowercase, numbers, and special characters' 
    };
  }
  
  const commonPasswords = ['123456789', 'password', 'qwerty', 'admin', 'welcome'];
  if (commonPasswords.includes(password.toLowerCase())) {
    return { isValid: false, message: 'Password is too weak, please choose a stronger one' };
  }
  
  return { isValid: true, message: 'Strong password' };
}

// 🔧 دالة التشفير المعدلة - بدون HMAC
async function encryptWalletDataEnhanced(walletData: any, passwordStr: string) {
  const nonce = nacl.randomBytes(24);
  const salt = nacl.randomBytes(32);
  const key = await deriveStrongKey(passwordStr, salt);
  const message = encode(JSON.stringify(walletData));
  const ciphertext = nacl.secretbox(message, nonce, key);
  
  return {
    version: "2.1", // 🔧 تعديل من 2.2 إلى 2.1 لتجنب مشكلة HMAC
    nonce: toB64(nonce),
    salt: toB64(salt),
    ciphertext: toB64(ciphertext),
    iterations: 100000,
    algorithm: "XSalsa20-Poly1305",
    timestamp: new Date().toISOString(),
  };
}

// اختبار اتصال السيرفر
async function testServerConnection(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${API_BASE}/api/health`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('Server connection failed:', error);
    return false;
  }
}

export default function PinEntryScreen({ navigation, route }: any) {
  const { colors, theme } = useTheme();
  const { i18n } = useTranslation();
  const rtl = i18n.language.startsWith('ar');
  
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');

  // حقول النسخة الاحتياطية
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({ isValid: false, message: '' });
  
  // حالات OTP
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const { mnemonic } = route.params;
  const validPin = pin.length === 6 && pin === pin2;

  // النصوص الثابتة باللغة الإنجليزية
  const TEXTS = {
    // Header
    back: 'Back',
    title: 'Set PIN Code',
    
    // PIN Section
    choosePin: 'Choose a 6-digit PIN',
    pinHint: 'This PIN will be used to unlock your wallet',
    enterPin: 'Enter PIN',
    confirmPin: 'Confirm PIN',
    confirmPinButton: 'Confirm PIN',
    
    // Backup Section
    createBackup: 'Create Secure Backup',
    backupTitle: 'Secure Backup',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    requestOtp: 'Request OTP',
    otpCode: 'OTP Code',
    verifyUpload: 'Verify & Upload',
    cancel: 'Cancel',
    backup: 'Backup',
    sending: 'Sending...',
    uploading: 'Uploading...',
    backupSuccess: 'Backup saved successfully',
    otpSent: 'OTP sent to your email',
    
    // Messages
    pinMismatch: 'PIN must be 6 digits and match',
    emailInvalid: 'Please enter a valid email',
    passwordWeak: 'Password is too weak',
    passwordMismatch: 'Passwords do not match',
    connectionError: 'Cannot connect to server. Please check your internet connection',
    unknownError: 'An unknown error occurred',
    backupFailed: 'Backup upload failed. Please try again.',
    ciphertextIssue: 'Encryption data format issue detected'
  };

  const handleSetPin = async () => {
    if (!validPin) {
      Alert.alert('Warning', TEXTS.pinMismatch);
      return;
    }

    try {
      setLoading(true);
      
      await SecureStore.setItemAsync('wallet_pin', pin);
      await SecureStore.setItemAsync('mnemonic', mnemonic);
      
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }]
      });
      
    } catch (error) {
      console.error('Error setting PIN:', error);
      Alert.alert('Error', TEXTS.unknownError);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (text.length > 0) {
      setPasswordStrength(validatePasswordStrength(text));
    } else {
      setPasswordStrength({ isValid: false, message: '' });
    }
  };

  const validateBackupInputs = (): boolean => {
    if (!email || !email.includes('@')) {
      Alert.alert('Error', TEXTS.emailInvalid);
      return false;
    }

    if (!passwordStrength.isValid) {
      Alert.alert('Error', passwordStrength.message || TEXTS.passwordWeak);
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', TEXTS.passwordMismatch);
      return false;
    }

    return true;
  };

  const requestOtp = async () => {
    if (!validateBackupInputs()) return;

    const isConnected = await testServerConnection();
    if (!isConnected) {
      Alert.alert('Connection Error', TEXTS.connectionError);
      return;
    }

    setBackupLoading(true);
    setCurrentStep('Sending verification request...');

    try {
      const cleanEmail = email.trim().toLowerCase();
      
      const requestBody = {
        email: cleanEmail,
        purpose: "backup_upload"
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE}/api/request-otp`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      setOtpRequested(true);
      setCurrentStep('');
      Alert.alert("Success", TEXTS.otpSent);
      
    } catch (error: any) {
      console.error('OTP request failed:', error);
      Alert.alert("Error", error.message || "Failed to request OTP");
    } finally {
      setBackupLoading(false);
      setCurrentStep('');
    }
  };

  const verifyOtpAndUpload = async () => {
    if (!otpCode || otpCode.length !== 6) {
      Alert.alert("Error", "Please enter 6-digit OTP code");
      return;
    }

    if (!validateBackupInputs()) return;

    setBackupLoading(true);
    setCurrentStep('Verifying code...');
    setUploadProgress(20);

    try {
      const cleanEmail = email.trim().toLowerCase();
      
      const requestBody = {
        email: cleanEmail,
        purpose: "backup_upload",
        otp: otpCode
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE}/api/verify-otp`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OTP verification failed:', errorText);
        throw new Error("OTP verification failed");
      }

      const responseData = await response.json();
      
      if (!responseData.grant) {
        throw new Error("No grant received from server");
      }

      setCurrentStep('Encrypting data...');
      setUploadProgress(50);

      // تشفير البيانات
      const walletData = { mnemonic, createdAt: new Date().toISOString() };
      const encryptedData = await encryptWalletDataEnhanced(walletData, password);

      // 🔧 تسجيل معلومات التشفير للتشخيص
      console.log('🔐 Encrypted data details:', {
        ciphertextLength: encryptedData.ciphertext.length,
        ciphertextSample: encryptedData.ciphertext.substring(0, 30) + '...',
        ciphertextEnd: encryptedData.ciphertext.substring(encryptedData.ciphertext.length - 10),
        isBase64: /^[A-Za-z0-9+/=]+$/.test(encryptedData.ciphertext),
        nonceLength: encryptedData.nonce.length,
        saltLength: encryptedData.salt.length,
        version: encryptedData.version
      });

      setCurrentStep('Uploading data...');
      setUploadProgress(70);

      // 🔧 تحضير البيانات للرفع مع تشخيص شامل
      const uploadData = {
        email: cleanEmail,
        ...encryptedData,
        backup_id: `backup_${Date.now()}`,
        grant: responseData.grant,
        algorithm: encryptedData.algorithm || "XSalsa20-Poly1305",
        securityLevel: "enhanced"
      };

      console.log('📤 Upload data prepared:', {
        email: cleanEmail,
        backup_id: uploadData.backup_id,
        grantLength: responseData.grant?.length,
        dataKeys: Object.keys(uploadData)
      });

      // رفع البيانات
      const uploadResponse = await fetch(`${API_BASE}/api/upload-backup`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(uploadData)
      });

      // 🔧 معالجة رد السيرفر بشكل مفصل
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('❌ Upload failed with status:', uploadResponse.status);
        console.error('❌ Error response:', errorText);
        
        let errorMessage = "Backup upload failed";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const result = await uploadResponse.json();
      console.log('✅ Upload successful:', result);

      setCurrentStep('Completed successfully!');
      setUploadProgress(100);

      Alert.alert("Success", TEXTS.backupSuccess);
      resetBackupProcess();
      
    } catch (error: any) {
      console.error('❌ Backup upload failed:', error);
      
      // 🔧 رسالة خطأ مفصلة
      let errorMessage = error.message || TEXTS.backupFailed;
      if (errorMessage.includes('ciphertext')) {
        errorMessage = `${TEXTS.ciphertextIssue}: ${errorMessage}`;
      }
      
      Alert.alert("Error", errorMessage);
    } finally {
      setBackupLoading(false);
      setCurrentStep('');
      setUploadProgress(0);
    }
  };

  const resetBackupProcess = () => {
    setOtpRequested(false);
    setOtpCode("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setPasswordStrength({ isValid: false, message: '' });
    setShowBackup(false);
  };

  // الحصول على لون الخلفية بناءً على السمة
  const getInputBackgroundColor = () => {
    return theme === 'dark' ? '#0f1520' : '#fafafa';
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.headBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>
              {TEXTS.back}
            </Text>
          </TouchableOpacity>
          
          <Text style={{ color: colors.text, fontWeight: '900', fontSize: 18 }}>
            {TEXTS.title}
          </Text>
          
          <View style={{ width: 60 }} />
        </View>

        {/* المحتوى */}
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
            {TEXTS.choosePin}
          </Text>
          
          <Text style={[styles.hint, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {TEXTS.pinHint}
          </Text>

          {/* إدخال PIN */}
          <TextInput
            style={[
              styles.input,
              { 
                borderColor: colors.border, 
                backgroundColor: getInputBackgroundColor(),
                textAlign: 'center',
                color: colors.text
              }
            ]}
            placeholder={TEXTS.enterPin}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            value={pin}
            onChangeText={setPin}
          />

          {/* تأكيد PIN */}
          <TextInput
            style={[
              styles.input,
              { 
                borderColor: colors.border, 
                backgroundColor: getInputBackgroundColor(),
                textAlign: 'center',
                color: colors.text
              }
            ]}
            placeholder={TEXTS.confirmPin}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            value={pin2}
            onChangeText={setPin2}
          />

          {/* زر تأكيد PIN */}
          <TouchableOpacity
            onPress={handleSetPin}
            disabled={loading || !validPin}
            style={[
              styles.primary,
              { 
                opacity: (loading || !validPin) ? 0.6 : 1,
                marginTop: 20,
                marginBottom: 20
              }
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                {TEXTS.confirmPinButton}
              </Text>
            )}
          </TouchableOpacity>

          {/* قسم النسخة الاحتياطية */}
          {showBackup && (
            <View style={styles.backupSection}>
              <Text style={[styles.backupTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                {TEXTS.createBackup}
              </Text>

              {/* مؤشر التقدم */}
              {(backupLoading && uploadProgress > 0) && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { width: `${uploadProgress}%` }
                      ]} 
                    />
                  </View>
                  <Text style={[styles.progressText, { color: colors.text }]}>
                    {currentStep} {uploadProgress}%
                  </Text>
                </View>
              )}

              {/* حقل الإيميل */}
              <TextInput
                style={[
                  styles.input,
                  { 
                    borderColor: colors.border, 
                    backgroundColor: getInputBackgroundColor(),
                    textAlign: rtl ? 'right' : 'left',
                    color: colors.text
                  }
                ]}
                placeholder={TEXTS.email}
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                editable={!backupLoading && !otpRequested}
              />

              {/* حقل كلمة السر */}
              <TextInput
                style={[
                  styles.input,
                  { 
                    borderColor: passwordStrength.isValid ? '#10b981' : colors.border, 
                    backgroundColor: getInputBackgroundColor(),
                    textAlign: rtl ? 'right' : 'left',
                    color: colors.text
                  }
                ]}
                placeholder={`${TEXTS.password} (min 12 chars)`}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={handlePasswordChange}
                editable={!backupLoading}
              />

              {/* مؤشر قوة كلمة السر */}
              {password.length > 0 && (
                <Text style={[
                  styles.passwordStrength, 
                  { color: passwordStrength.isValid ? '#10b981' : '#ef4444' }
                ]}>
                  {passwordStrength.message}
                </Text>
              )}

              {/* تأكيد كلمة السر */}
              <TextInput
                style={[
                  styles.input,
                  { 
                    borderColor: colors.border, 
                    backgroundColor: getInputBackgroundColor(),
                    textAlign: rtl ? 'right' : 'left',
                    color: colors.text
                  }
                ]}
                placeholder={TEXTS.confirmPassword}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!backupLoading}
              />

              {/* قسم OTP */}
              {!otpRequested ? (
                <TouchableOpacity
                  style={[styles.backupButton, backupLoading && styles.buttonDisabled]}
                  onPress={requestOtp}
                  disabled={backupLoading || !email || !passwordStrength.isValid || password !== confirmPassword}
                >
                  {backupLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, marginLeft: 8 }}>
                        {TEXTS.sending}
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                      📧 {TEXTS.requestOtp}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.otpSection}>
                  <TextInput
                    style={[
                      styles.input,
                      { 
                        borderColor: colors.border, 
                        backgroundColor: getInputBackgroundColor(),
                        textAlign: 'center',
                        color: colors.text
                      }
                    ]}
                    placeholder={TEXTS.otpCode}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    editable={!backupLoading}
                  />

                  <TouchableOpacity
                    style={[styles.backupButton, backupLoading && styles.buttonDisabled]}
                    onPress={verifyOtpAndUpload}
                    disabled={backupLoading || !otpCode}
                  >
                    {backupLoading ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, marginLeft: 8 }}>
                          {TEXTS.uploading}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                        🚀 {TEXTS.verifyUpload}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* زر إلغاء */}
              <TouchableOpacity
                onPress={() => {
                  setShowBackup(false);
                  resetBackupProcess();
                }}
                style={styles.cancelButton}
                disabled={backupLoading}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>
                  {TEXTS.cancel}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* زر النسخ الاحتياطي الثابت في الأسفل */}
        {!showBackup && (
          <View style={[styles.fixedBottom, { backgroundColor: colors.bg }]}>
            <TouchableOpacity
              onPress={() => setShowBackup(true)}
              style={styles.backupTrigger}
            >
              <Text style={styles.backupTriggerText}>
                📧 {TEXTS.backup}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  primary: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  fixedBottom: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  backupTrigger: {
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  backupTriggerText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  backupSection: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  backupTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  backupButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  otpSection: {
    marginTop: 10,
  },
  passwordStrength: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
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