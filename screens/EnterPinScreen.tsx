// screens/EnterPinScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Animated,
  ScrollView,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '../ThemeProvider';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');
const PIN_LENGTH = 6;

/* ===================== PIN lock helpers ===================== */
const PIN_FAILS_KEY = 'pin_fails';
const PIN_LOCK_UNTIL_KEY = 'pin_lock_until';

async function getNowMs() {
  return Date.now();
}

async function getPinState() {
  const f = await SecureStore.getItemAsync(PIN_FAILS_KEY);
  const u = await SecureStore.getItemAsync(PIN_LOCK_UNTIL_KEY);
  return { fails: f ? parseInt(f, 10) : 0, lockUntil: u ? parseInt(u, 10) : 0 };
}
async function setPinState(fails: number, lockUntil: number) {
  await SecureStore.setItemAsync(PIN_FAILS_KEY, String(fails));
  await SecureStore.setItemAsync(PIN_LOCK_UNTIL_KEY, String(lockUntil));
}
async function checkLocked(): Promise<number> {
  const { lockUntil } = await getPinState();
  const now = await getNowMs();
  return Math.max(0, lockUntil - now);
}

/* ===================== Wallet / PIN presence ===================== */
async function hasStoredWallet(): Promise<boolean> {
  const evmPk = await SecureStore.getItemAsync('privateKey');
  return !!evmPk;
}
async function hasSavedPin(): Promise<boolean> {
  const pin = await SecureStore.getItemAsync('wallet_pin');
  return !!pin && pin.length > 0;
}

/* ===================== Biometric helpers ===================== */
async function ensureBiometricEnabledDefaultOn(): Promise<boolean> {
  const val = await SecureStore.getItemAsync('biometric_enabled');
  if (val === '0') return false;
  if (val === '1') return true;
  await SecureStore.setItemAsync('biometric_enabled', '1');
  return true;
}

async function tryBiometricAuth(navigation: any, label: string) {
  try {
    const [walletExists, pinExists] = await Promise.all([hasStoredWallet(), hasSavedPin()]);
    if (!walletExists || !pinExists) return false;

    const enabled = await ensureBiometricEnabledDefaultOn();
    if (!enabled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: label || 'Biometric',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      requireConfirmation: false,
    });

    if (result.success) {
      await setPinState(0, 0);
      navigation.replace('Home');
      return true;
    }
  } catch (error) {
    console.warn('Biometric auth error:', error);
  }
  return false;
}

/* ===== زر اللغة ===== */
function InlineLanguageToggle() {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const [lang, setLang] = useState<'ar' | 'en'>(i18n.language.startsWith('ar') ? 'ar' : 'en');
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setLang(i18n.language.startsWith('ar') ? 'ar' : 'en');
  }, [i18n.language]);

  const handlePress = async () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    const next = lang === 'ar' ? 'en' : 'ar';
    await i18n.changeLanguage(next);
    await SecureStore.setItemAsync('app_lang', next);
    setLang(next);
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        style={[styles.languageButton, { backgroundColor: colors.card + '20', borderColor: colors.primary }]}
      >
        <Text style={[styles.languageText, { color: colors.primary }]}>{lang === 'ar' ? 'EN' : 'AR'}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ===================== Screen ===================== */
export default function EnterPinScreen({ navigation }: any) {
  const { colors, resolved } = useTheme();
  const { t, i18n } = useTranslation();
  const rtl = i18n.language.startsWith('ar');

  const [pin, setPin] = useState('');
  const [lockRemaining, setLockRemaining] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [walletExists, setWalletExists] = useState(false);
  const [pinExists, setPinExists] = useState(false);
  const [walletName, setWalletName] = useState<string | null>(null);

  const buttonScale = useRef(new Animated.Value(1)).current;
  const bioScale = useRef(new Animated.Value(1)).current;
  const pinInputRef = useRef<TextInput>(null);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync('app_lang');
      if (saved === 'ar' || saved === 'en') {
        await i18n.changeLanguage(saved);
        if (saved === 'ar') {
          I18nManager.allowRTL(true);
          I18nManager.forceRTL(true);
        } else {
          I18nManager.allowRTL(false);
          I18nManager.forceRTL(false);
        }
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync('wallet_name');
      if (stored) setWalletName(stored);
    })();
  }, []);

  useEffect(() => {
    const checkLockStatus = async () => {
      const remaining = await checkLocked();
      setLockRemaining(remaining);
    };
    checkLockStatus();
    const interval = setInterval(checkLockStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [hasWallet, hasPin] = await Promise.all([hasStoredWallet(), hasSavedPin()]);
        setWalletExists(!!hasWallet);
        setPinExists(!!hasPin);

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

        const available = hasHardware && enrolled;
        setBiometricAvailable(available);

        const enabled = await ensureBiometricEnabledDefaultOn();
        setBiometricEnabled(enabled);

        const hasFace = supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        const hasFinger = supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

        if (rtl) {
          setBiometricLabel(hasFace ? 'الفتح بالوجه' : hasFinger ? 'الفتح بالبصمة' : 'الفتح البيومتري');
        } else {
          setBiometricLabel(hasFace ? 'Unlock with Face' : hasFinger ? 'Unlock with Fingerprint' : 'Biometric Unlock');
        }
      } catch (error) {
        console.warn('Biometric setup error:', error);
        setBiometricAvailable(false);
      }
    })();
  }, [i18n.language, rtl]);

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      (async () => {
        pinInputRef.current?.focus();

        const remainMs = await checkLocked();
        if (!mounted || remainMs > 0) return;
        if (walletExists && pinExists && biometricAvailable && biometricEnabled) {
          setBusy(true);
          await tryBiometricAuth(navigation, biometricLabel);
          setBusy(false);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [walletExists, pinExists, biometricAvailable, biometricEnabled, biometricLabel, navigation])
  );

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const animateBioButton = () => {
    Animated.sequence([
      Animated.timing(bioScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(bioScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const triggerShake = () => {
    pinInputRef.current?.focus();
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const onConfirm = async () => {
    animateButton();

    const remainMs = await checkLocked();
    if (remainMs > 0) {
      Alert.alert(t('alerts.error'), t('alerts.tryLater', { seconds: Math.ceil(remainMs / 1000) }));
      return;
    }

    const saved = await SecureStore.getItemAsync('wallet_pin');
    if (pin === saved) {
      await setPinState(0, 0);
      navigation.replace('Home');
    } else {
      const { fails } = await getPinState();
      const nextFails = fails + 1;
      let lockUntil = 0;
      if (nextFails >= 3) lockUntil = (await getNowMs()) + 30000;
      await setPinState(nextFails, lockUntil);

      triggerShake();
      Alert.alert(t('alerts.error'), t('alerts.pinWrongOld'));
      setPin('');
    }
  };

  const handleBiometricAuth = async () => {
    animateBioButton();
    setBusy(true);
    await tryBiometricAuth(navigation, biometricLabel);
    setBusy(false);
  };

  const renderPinDots = () => {
    const dots = [];
    for (let i = 0; i < PIN_LENGTH; i++) {
      const isFilled = i < pin.length;
      dots.push(
        <View
          key={i}
          style={[
            styles.pinDot,
            {
              backgroundColor: isFilled ? colors.primary : colors.card,
              borderColor: isLocked ? colors.danger : colors.border,
            },
          ]}
        />
      );
    }
    return (
      <TouchableOpacity
        style={[styles.pinDotsContainer, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
        onPress={() => pinInputRef.current?.focus()}
        activeOpacity={1}
      >
        {dots}
      </TouchableOpacity>
    );
  };

  const isLocked = lockRemaining > 0;
  const canShowBiometric = walletExists && pinExists && biometricAvailable && biometricEnabled && !isLocked;

  return (
    <View style={[styles.container, { backgroundColor: resolved === 'dark' ? '#0f1a2f' : '#f8fafc' }]}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: 'height' })} style={styles.keyboardAvoid}>
          {/* زر اللغة - تم نقله للزاوية */}
          <View style={[styles.langToggleContainer, rtl ? { left: 24 } : { right: 24 }]}>
            <InlineLanguageToggle />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.mainContent}>
              {/* ===== القسم العلوي ===== */}
              <View style={styles.topSection}>
                {/* Header */}
                <View style={styles.header}>
                  <Ionicons name="lock-closed" size={32} color={colors.primary} />
                  <Text style={[styles.title, { color: colors.text }]}>{t('enterPin.title')}</Text>
                  {walletName && (
                    <Text style={[styles.walletName, { color: colors.textMuted }]}>{walletName}</Text>
                  )}
                </View>

                {/* Instruction Text */}
                <View style={styles.instructionContainer}>
                  <Text style={[styles.instructionText, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('enterPin.instruction')}
                  </Text>
                </View>

                {/* Lock Banner */}
                {isLocked && (
                  <View style={[styles.lockBanner, { backgroundColor: colors.danger + '20' }]}>
                    <Ionicons name="time-outline" size={20} color={colors.danger} />
                    <Text style={[styles.lockText, { color: colors.danger }]}>
                      {t('enterPin.locked', { seconds: Math.ceil(lockRemaining / 1000) })}
                    </Text>
                  </View>
                )}

                {/* PIN Input */}
                <Animated.View style={{ transform: [{ translateX: shakeAnimation }], width: '100%', alignItems: 'center' }}>
                  {renderPinDots()}
                  <TextInput
                    ref={pinInputRef}
                    style={styles.hiddenInput}
                    keyboardType="number-pad"
                    maxLength={PIN_LENGTH}
                    value={pin}
                    onChangeText={setPin}
                    editable={!isLocked}
                    autoFocus
                    secureTextEntry
                  />
                </Animated.View>
              </View>

              {/* ===== القسم السفلي ===== */}
              <View style={styles.bottomSection}>
                {/* Confirm Button */}
                <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
                  <TouchableOpacity
                    onPress={onConfirm}
                    style={[
                      styles.confirmButton,
                      {
                        backgroundColor: isLocked ? colors.textMuted : colors.primary,
                        opacity: isLocked ? 0.6 : pin.length === PIN_LENGTH ? 1 : 0.6,
                      },
                    ]}
                    disabled={isLocked || pin.length !== PIN_LENGTH}
                  >
                    <View style={[styles.buttonContent, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                      {rtl ? (
                        <>
                          <Ionicons name="arrow-back" size={20} color="#fff" />
                          <Text style={styles.confirmButtonText}>{t('enterPin.confirm')}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.confirmButtonText}>{t('enterPin.confirm')}</Text>
                          <Ionicons name="arrow-forward" size={20} color="#fff" />
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </Animated.View>

                {/* Biometric Button */}
                {canShowBiometric && (
                  <Animated.View style={[styles.biometricContainer, { transform: [{ scale: bioScale }] }]}>
                    <TouchableOpacity
                      onPress={handleBiometricAuth}
                      style={[
                        styles.biometricButton,
                        { borderColor: colors.primary + '40', backgroundColor: colors.primary + '10' },
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                      ) : (
                        <>
                          {rtl ? (
                            <>
                              <Text style={[styles.biometricText, { color: colors.primary }]}>{biometricLabel}</Text>
                              <Ionicons 
                                name={biometricLabel.includes('Face') || biometricLabel.includes('وجه') ? 'scan-outline' : 'finger-print'} 
                                size={24} 
                                color={colors.primary} 
                              />
                            </>
                          ) : (
                            <>
                              <Ionicons 
                                name={biometricLabel.includes('Face') || biometricLabel.includes('وجه') ? 'scan-outline' : 'finger-print'} 
                                size={24} 
                                color={colors.primary} 
                              />
                              <Text style={[styles.biometricText, { color: colors.primary }]}>{biometricLabel}</Text>
                            </>
                          )}
                        </>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* زر نسيت الرمز - المعدل للإشارة إلى RecoveryHubScreen */}
                <TouchableOpacity
                  style={[styles.forgotContainer, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                  onPress={() => navigation.navigate('RecoveryHub')}
                >
                  <Ionicons name="help-circle-outline" size={18} color={colors.primary} />
                  <Text style={[styles.forgotText, { color: colors.primary, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('enterPin.forgot')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/* ===== STYLES ===== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: height * 0.05,
  },
  bottomSection: {
    alignItems: 'center',
    paddingBottom: 16,
    gap: 16,
    width: '100%',
  },
  langToggleContainer: {
    position: 'absolute',
    top: 16,
    zIndex: 10,
  },
  languageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  languageText: {
    fontWeight: '800',
    fontSize: 14,
  },
  header: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  walletName: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 14,
    marginTop: 2,
  },
  instructionContainer: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  instructionText: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    width: '100%',
    marginVertical: 10,
  },
  lockText: {
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  pinDotsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginVertical: 24,
    width: '100%',
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  confirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    width: '100%',
  },
  buttonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  biometricContainer: {
    alignItems: 'center',
    width: '100%',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    paddingHorizontal: 24,
    minWidth: 200,
    justifyContent: 'center',
  },
  biometricText: {
    fontWeight: '700',
    fontSize: 16,
  },
  forgotContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  forgotText: {
    fontWeight: '700',
    fontSize: 16,
  },
});