// screens/Settings.tsx — تصميم "خرافي" مُعدَّل مع تصحيحات الـ RTL والترجمة
import React, { useEffect, useRef, useState, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, StyleSheet,
  Platform, ScrollView, Modal, Pressable, KeyboardAvoidingView, Switch
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';
import * as Updates from 'expo-updates';
import { useTheme, Mode } from '../ThemeProvider';
import { ChevronRight, User, Lock, Fingerprint, Globe, Sun, RefreshCw, LogOut, Trash2 } from 'lucide-react-native';

// ✅ استيراد دوال PIN الجديدة
import { verifyPin, setPin, deletePin } from "./pinAuth";

/* ---------- عناصر واجهة قابلة لإعادة الاستخدام - تم تصحيح RowItem ---------- */

const Divider = memo(({ color }: { color: string }) => (
  <View style={[styles.divider, { backgroundColor: color }]} />
));

const Card = memo(({ children, colors }: {
  children: React.ReactNode;
  colors: any;
}) => (
  <View
    style={[
      styles.card,
      {
        backgroundColor: colors.card,
        borderColor: colors.border,
      },
    ]}
  >
    {children}
  </View>
));

const RowItem = memo(({
  left, right, onPress, colors, rtl, disabled, icon
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  colors: any;
  rtl: boolean;
  disabled?: boolean;
  icon?: React.ReactNode; 
}) => (
  <TouchableOpacity
    activeOpacity={onPress ? 0.7 : 1}
    onPress={onPress}
    disabled={!onPress || disabled}
    style={[
      styles.rowItem,
      {
        flexDirection: rtl ? 'row-reverse' : 'row',
        backgroundColor: colors.card, 
        borderColor: colors.border,
        opacity: disabled ? 0.6 : 1,
        // 🚀 زيادة الهامش الجانبي لتجنب تداخل السهم
        paddingEnd: rtl ? 0 : 35, 
        paddingStart: rtl ? 35 : 0, 
      },
    ]}
  >
    {icon && <View style={[styles.iconContainer, { marginStart: rtl ? 0 : 0, marginEnd: rtl ? 12 : 12 }]}>{icon}</View>}
    <View style={{ flex: 1 }}>{left}</View>
    {!!right && <View style={{ marginStart: rtl ? 0 : 12, marginEnd: rtl ? 12 : 0 }}>{right}</View>}
    
    {onPress && (
      <View style={[rtl ? styles.rtlChevron : styles.ltrChevron]}>
        {/* استخدام أيقونة ChevronRight بحجم 22 */}
        <ChevronRight size={22} color={colors.textMuted} />
      </View>
    )}
  </TouchableOpacity>
));

/* ---------- الصفحة - تم تعديل المنطق والتصميم هنا ---------- */

export default function Settings() {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { colors, mode, setMode, resolved } = useTheme();

  // State declarations
  const [walletName, setWalletName] = useState('MultiVault');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempWalletName, setTempWalletName] = useState('');

  const constLang = (i18n.resolvedLanguage || i18n.language || 'ar').startsWith('ar') ? 'ar' : 'en';
  const [lang, setLang] = useState<'ar' | 'en'>(constLang as 'ar' | 'en');
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    updateId?: string;
    isChecking: boolean;
    updateAvailable: boolean;
  }>({
    currentVersion: Updates.runtimeVersion || 'Unknown',
    updateId: undefined,
    isChecking: false,
    updateAvailable: false,
  });

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinStep, setPinStep] = useState<1 | 2 | 3>(1);
  const [pinEntered, setPinEntered] = useState('');
  const [pinNew, setPinNew] = useState('');

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmEn, setDeleteConfirmEn] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const inputRef = useRef<TextInput>(null);
  // 🔥 تعديل مهم: RTL دائماً مهما كانت اللغة
  const rtl = true; // ثابت RTL دائماً

  useEffect(() => {
    (async () => {
      const storedName = await SecureStore.getItemAsync('wallet_name');
      if (storedName) setWalletName(storedName);

      const savedLang = await SecureStore.getItemAsync('app_lang');
      if (savedLang === 'ar' || savedLang === 'en') {
        setLang(savedLang);
        await i18n.changeLanguage(savedLang);
      }

      const bioEnabled = await SecureStore.getItemAsync('biometric_enabled');
      setBiometricEnabled(bioEnabled === '1');
    })();
  }, []);

  /* ---------- أفعال - تم تعديل دالة saveLanguage لمعالجة مشكلة الصفحة الرئيسية ---------- */

  const startEditingName = () => {
    setTempWalletName(walletName);
    setIsEditingName(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
    setTempWalletName('');
  };

  const saveWalletName = async () => {
    const name = tempWalletName.trim();
    if (!name) {
      Alert.alert(t('alerts.warn'), t('alerts.enterName'));
      return;
    }
    if (name.length > 32) {
      Alert.alert(t('alerts.warn'), t('settings.nameTooLong'));
      return;
    }
    setWalletName(name);
    await SecureStore.setItemAsync('wallet_name', name);
    setIsEditingName(false);
    Alert.alert(t('alerts.ok'), t('alerts.nameSaved'));
  };

  const openChangePin = () => {
    setPinStep(1);
    setPinEntered('');
    setPinNew('');
    setPinModalVisible(true);
  };

  const openLanguageModal = () => {
    Alert.alert(
      t('settings.language'),
      t('settings.selectLanguage'),
      [
        { text: t('settings.arabic'), onPress: () => saveLanguage('ar') },
        { text: t('settings.english'), onPress: () => saveLanguage('en') },
      ]
    );
  };

  const openThemeModal = () => {
    Alert.alert(
      t('settings.theme'),
      t('settings.selectTheme'),
      [
        { text: t('settings.themeSystem'), onPress: () => changeTheme('system') },
        { text: t('settings.themeLight'), onPress: () => changeTheme('light') },
        { text: t('settings.themeDark'), onPress: () => changeTheme('dark') },
      ]
    );
  };

  const openUpdateModal = () => {
    Alert.alert(
      t('settings.appUpdate'),
      `${t('settings.currentVersion')}: ${updateInfo.currentVersion}\n${t('settings.updateStatus')}: ${updateInfo.updateAvailable ? t('settings.updateAvailable') : t('settings.notCheckedYet')}`,
      [
        { text: t('alerts.cancel'), style: 'cancel' },
        { text: updateInfo.updateAvailable ? t('settings.updateNow') : t('settings.checkForUpdates'), onPress: updateInfo.updateAvailable ? downloadAndReloadUpdate : checkForUpdates },
      ]
    );
  };

  // 🚀 دالة تغيير اللغة التي تعمل على جميع الشاشات
  const saveLanguage = async (lng: 'ar' | 'en') => {
    try {
      console.log('🌐 Changing language to:', lng);
      
      // 1. حفظ اللغة في SecureStore
      await SecureStore.setItemAsync('app_lang', lng);
      
      // 2. تغيير اللغة في i18next
      await i18n.changeLanguage(lng);
      
      // 3. تحديث الحالة المحلية
      setLang(lng);
      
      // 4. عرض رسالة تأكيد
      Alert.alert(
        t('alerts.ok'), 
        t('alerts.langSaved'),
        [
          { 
            text: t('settings.reloadAppNow') || 'إعادة التحميل', 
            onPress: () => {
              // 🚀 إعادة تعيين التنقل لفرض تحديث جميع الشاشات
              navigation.reset({
                index: 0,
                routes: [{ name: 'Home' }]
              });
            }
          },
          { 
            text: t('alerts.cancel'), 
            style: 'cancel' 
          }
        ]
      );
      
    } catch (error) {
      console.error('❌ Error changing language:', error);
      Alert.alert(t('alerts.error'), 'فشل تغيير اللغة');
    }
  };

  const changeTheme = async (m: Mode) => {
    await setMode(m);
  };

  const toggleBiometric = async () => {
    try {
      const next = !biometricEnabled;
      if (next) {
        const has = await LocalAuthentication.hasHardwareAsync();
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (!has || !types.length) {
          Alert.alert(t('alerts.warn'), t('settings.biometricNotAvailable'));
          return;
        }
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: t('settings.enableBiometricPrompt'),
          disableDeviceFallback: false,
          requireConfirmation: false,
        });
        if (res.success) {
          await SecureStore.setItemAsync('biometric_enabled', '1');
          setBiometricEnabled(true);
          Alert.alert(t('alerts.ok'), t('settings.biometricEnabled'));
        }
      } else {
        await SecureStore.deleteItemAsync('biometric_enabled');
        setBiometricEnabled(false);
        Alert.alert(t('alerts.ok'), t('settings.biometricDisabled'));
      }
    } catch (e) {
      Alert.alert(t('alerts.error'), String(e));
    }
  };

  const checkForUpdates = async () => {
    try {
      setUpdateInfo(prev => ({ ...prev, isChecking: true }));
      if (!(Updates as any).checkForUpdateAsync) {
        Alert.alert(t('alerts.warn'), t('settings.updateNotAvailableInExpo'));
        return;
      }
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateInfo(prev => ({
          ...prev,
          updateId: update.manifest?.id || 'Available',
          updateAvailable: true,
        }));
      } else {
        Alert.alert(t('alerts.ok'), t('settings.noUpdates'));
        setUpdateInfo(prev => ({
          ...prev,
          updateId: 'None',
          updateAvailable: false,
        }));
      }
    } catch (error) {
      Alert.alert(t('alerts.error'), (t('settings.updateCheckFailed') || 'Update check failed: ') + String(error));
    } finally {
      setUpdateInfo(prev => ({ ...prev, isChecking: false }));
    }
  };

  const downloadAndReloadUpdate = async () => {
    try {
      Alert.alert(t('settings.downloadingUpdate'), t('settings.updateDownloadProgress'));
      await Updates.fetchUpdateAsync();
      Alert.alert(t('alerts.ok'), t('settings.updateDownloadComplete'), [
        { text: t('settings.reloadNow'), onPress: () => Updates.reloadAsync() },
      ]);
    } catch (error) {
      Alert.alert(t('alerts.error'), t('settings.updateDownloadFailed') + String(error));
    }
  };

  const logoutOnly = () => {
    Alert.alert(
      t('settings.logoutConfirmTitle'),
      t('settings.logoutConfirmBody'),
      [
        { text: t('alerts.cancel'), style: 'cancel' },
        {
          text: t('settings.confirmLogout'),
          style: 'destructive',
          onPress: () => (navigation as any).reset({ index: 0, routes: [{ name: 'EnterPin' }] }),
        },
      ]
    );
  };

  const openDeleteModal = () => {
    Alert.alert(
      t('settings.deleteConfirmTitle'),
      t('settings.deleteConfirmBody'),
      [
        { text: t('alerts.cancel'), style: 'cancel' },
        {
          text: t('settings.confirmDelete'),
          style: 'destructive',
          onPress: () => {
            setDeleteConfirmEn('');
            setDeleteModalVisible(true);
          },
        },
      ]
    );
  };

  const deleteWallet = async () => {
    setIsDeleting(true);
    try {
      // ✅ التعديل: استخدام deletePin الجديدة
      await deletePin();
      
      await SecureStore.deleteItemAsync('mnemonic');
      await SecureStore.deleteItemAsync('privateKey');
      await SecureStore.deleteItemAsync('btc_address');
      await SecureStore.deleteItemAsync('btc_privateKey');
      await SecureStore.deleteItemAsync('trx_address');
      await SecureStore.deleteItemAsync('trx_privateKey');
      await SecureStore.deleteItemAsync('sol_secret');
      
      await SecureStore.deleteItemAsync('wallet_name');
      await SecureStore.deleteItemAsync('app_lang');
      await SecureStore.deleteItemAsync('app_theme');
      await SecureStore.deleteItemAsync('biometric_enabled');

      setDeleteModalVisible(false);
      setIsDeleting(false);

      Alert.alert(t('alerts.ok'), t('settings.walletDeletedSuccess'));
      (navigation as any).reset({ index: 0, routes: [{ name: 'SetPin' }] });
    } catch (error) {
      setIsDeleting(false);
      Alert.alert(t('alerts.error'), t('settings.walletDeleteFailed'));
    }
  };

  const canDelete = deleteConfirmEn.trim() === 'DELETE';

  /* ---------- واجهة - تم تعديل التنسيق (Styles) وزر الحذف ---------- */

  const getCurrentSelectionText = (type: 'lang' | 'theme') => {
    if (type === 'lang') {
      return lang === 'ar' ? t('settings.arabic') : t('settings.english');
    }
    const themeLabel =
      mode === "system"
        ? t("settings.themeSystem")
        : mode === "light"
          ? t("settings.themeLight")
          : mode === "dark"
            ? t("settings.themeDark")
            : t("settings.themeSystem");
    return themeLabel;
  };

  const UpdateStatusText = () => {
    if (updateInfo.isChecking) return t('settings.checkingUpdates');
    if (updateInfo.updateAvailable) return t('settings.updateAvailable');
    if (updateInfo.updateId === 'None') return t('settings.noUpdates');
    return t('settings.notCheckedYet');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="always"
          contentInsetAdjustmentBehavior="always"
        >
          {/* ===== رابط تعديل الاسم (في وضع التحرير) ===== */}
          {isEditingName && (
            <Card colors={{ ...colors, resolved }}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>{t('settings.walletName')}</Text>
                <Divider color={colors.border} />
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    {
                      borderColor: colors.primary,
                      backgroundColor: resolved === 'dark' ? '#0f1520' : '#fff',
                      color: colors.text,
                      textAlign: rtl ? 'right' : 'left',
                    },
                  ]}
                  value={tempWalletName}
                  onChangeText={setTempWalletName}
                  placeholder={t('settings.walletName')}
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  autoCorrect={false}
                  autoCapitalize="none"
                  maxLength={32}
                />
                <View style={[styles.actionsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: colors.border }]} onPress={cancelEditingName}>
                    <Text style={[styles.btnText, { color: colors.text }]}>{t('alerts.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={saveWalletName}>
                    <Text style={[styles.btnText, { color: '#fff' }]}>{t('settings.saveName')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          )}

          {/* ===== مجموعة الإعدادات الأساسية ===== */}
          <Card colors={{ ...colors, resolved }}>
            {/* رابط اسم المحفظة (خارج وضع التحرير) */}
            {!isEditingName && (
              <RowItem
                colors={{ ...colors, resolved }}
                rtl={rtl}
                icon={<User size={20} color={colors.primary} />}
                onPress={startEditingName}
                left={
                  <View>
                    {/* 🚀 زيادة حجم الخط في العنوان */}
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.walletName')}</Text> 
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{walletName}</Text>
                  </View>
                }
              />
            )}

            <Divider color={colors.border} />

            {/* رابط تغيير الرمز (PIN) */}
            <RowItem
              colors={{ ...colors, resolved }}
              rtl={rtl}
              icon={<Lock size={20} color={colors.primary} />}
              onPress={openChangePin}
              left={
                <View>
                    {/* 🚀 استخدام ترجمة الـ PIN بدلاً من النص الثابت */}
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.changePin')}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('settings.pinTitle') || 'settings.secure'}</Text>
                </View>
              }
            />
          </Card>

          {/* ===== مجموعة الأمان ===== */}
          <Card colors={{ ...colors, resolved }}>
            {/* رابط البصمة (Switch) */}
            <RowItem
              colors={{ ...colors, resolved }}
              rtl={rtl}
              icon={<Fingerprint size={20} color={biometricEnabled ? '#1B5E20' : colors.textMuted} />}
              onPress={toggleBiometric}
              left={<Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.biometric')}</Text>}
              right={
                <Switch
                  value={biometricEnabled}
                  onValueChange={toggleBiometric}
                  thumbColor={Platform.OS === 'android' ? (biometricEnabled ? '#00C853' : '#888') : undefined}
                  trackColor={{ false: '#555', true: '#1B5E20' }}
                />
              }
            />
          </Card>

          {/* ===== مجموعة المظهر واللغة ===== */}
          <Card colors={{ ...colors, resolved }}>
            {/* رابط اللغة */}
            <RowItem
              colors={{ ...colors, resolved }}
              rtl={rtl}
              icon={<Globe size={20} color={colors.primary} />}
              onPress={openLanguageModal}
              left={<Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.language')}</Text>}
              right={<Text style={{ color: colors.textMuted, fontSize: 14 }}>{getCurrentSelectionText('lang')}</Text>}
            />

            <Divider color={colors.border} />

            {/* رابط المظهر */}
            <RowItem
              colors={{ ...colors, resolved }}
              rtl={rtl}
              icon={<Sun size={20} color={colors.primary} />}
              onPress={openThemeModal}
              left={<Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.theme')}</Text>}
              right={<Text style={{ color: colors.textMuted, fontSize: 14 }}>{getCurrentSelectionText('theme')}</Text>}
            />
          </Card>

          {/* ===== تحديث التطبيق ===== */}
          <Card colors={{ ...colors, resolved }}>
            <RowItem
              colors={{ ...colors, resolved }}
              rtl={rtl}
              icon={<RefreshCw size={20} color={updateInfo.updateAvailable ? '#10B981' : colors.primary} />}
              onPress={openUpdateModal}
              left={
                <View>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{t('settings.appUpdate')}</Text>
                  <Text style={{ color: updateInfo.updateAvailable ? '#10B981' : colors.textMuted, fontSize: 13 }}>
                    {UpdateStatusText()}
                  </Text>
                </View>
              }
              right={<Text style={{ color: colors.textMuted, fontSize: 14 }}>{updateInfo.currentVersion}</Text>}
            />
          </Card>

          {/* ===== أزرار الإجراءات ===== */}
          <View style={[styles.actionButtonsContainer, { marginTop: 40 }]}>
            {/* تسجيل الخروج - بارز بلون محايد */}
            <TouchableOpacity onPress={logoutOnly} style={[styles.actionBtn, { backgroundColor: colors.border }]}>
              <View style={[styles.actionContent, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <LogOut size={20} color={colors.text} style={rtl ? { marginStart: 10 } : { marginEnd: 10 }} />
                <Text style={[styles.actionText, { color: colors.text }]}>{t('settings.logout')}</Text>
              </View>
            </TouchableOpacity>

            {/* حذف المحفظة - أصبح صغيراً وأقل وضوحاً */}
            <TouchableOpacity onPress={openDeleteModal} style={[styles.deleteMinorBtn]}>
              <View style={[styles.actionContent, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Trash2 size={20} color={colors.danger} style={rtl ? { marginStart: 10 } : { marginEnd: 10 }} />
                <Text style={[styles.deleteMinorText, { color: colors.danger }]}>{t('settings.delete')}</Text>
              </View>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ===== المودالات (تم الإبقاء عليها كما هي) ===== */}
      <PinChangeModal
        visible={pinModalVisible}
        onClose={() => setPinModalVisible(false)}
        step={pinStep}
        value={pinEntered}
        rtl={rtl}
        colors={{ ...colors, resolved }}
        onDigit={handleKeyDigit}
        onBackspace={handleBackspace}
        onNext={handleNextPinStep}
        t={t}
      />

      <DeleteConfirmationModal
        visible={deleteModalVisible}
        onClose={() => !isDeleting && setDeleteModalVisible(false)}
        colors={{ ...colors, resolved }}
        rtl={rtl}
        confirmEn={deleteConfirmEn}
        onConfirmEnChange={setDeleteConfirmEn}
        canDelete={canDelete}
        isDeleting={isDeleting}
        onDelete={deleteWallet}
        t={t}
      />
    </View>
  );

  /* ---------- PIN handlers - تم الإبقاء عليها كما هي ---------- */
  function handleKeyDigit(d: string) {
    if (pinEntered.length < 6) setPinEntered(prev => prev + d);
  }
  function handleBackspace() { setPinEntered(prev => prev.slice(0, -1)); }
  async function handleNextPinStep() {
    if (pinEntered.length !== 6) return;
    if (pinStep === 1) {
      // ✅ التعديل: استخدام verifyPin بدلاً من SecureStore القديم
      const ok = await verifyPin(pinEntered);
      if (!ok) {
        setPinEntered('');
        Alert.alert(t('alerts.error'), t('alerts.pinWrongOld'));
        return;
      }
      setPinEntered('');
      setPinStep(2);
      return;
    }
    if (pinStep === 2) {
      setPinNew(pinEntered);
      setPinEntered('');
      setPinStep(3);
      return;
    }
    if (pinStep === 3) {
      if (pinNew !== pinEntered) {
        setPinEntered('');
        Alert.alert(t('alerts.error'), t('alerts.pinMismatch'));
        return;
      }
      // ✅ التعديل: استخدام setPin الجديدة
      await setPin(pinNew);
      setPinModalVisible(false);
      Alert.alert(t('alerts.ok'), t('alerts.pinChanged'));
    }
  }
}

/* ---------- مودالات إضافية - تم الإبقاء عليها كما هي ---------- */
const PinChangeModal = ({
  visible, onClose, step, value, rtl, colors, onDigit, onBackspace, onNext, t
}: {
  visible: boolean;
  onClose: () => void;
  step: 1 | 2 | 3;
  value: string;
  rtl: boolean;
  colors: any;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onNext: () => void;
  t: any;
}) => {
  const title = step === 1 ? t('settings.oldPin') : step === 2 ? t('settings.newPin') : t('settings.confirmPin');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.modalFull, { backgroundColor: colors.bg }]}>
        <View style={[styles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={onClose} style={[styles.modalHeaderBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 18, color: colors.text }}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.modalHeaderTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          <View style={styles.modalHeaderBtn} />
        </View>

        <View style={styles.modalBody}>
          <View style={styles.dotsRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    borderColor: colors.border,
                    backgroundColor: i < value.length ? colors.primary : 'transparent',
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.keypadWrap}>
            {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['bs', '0', 'ok']].map((row, idx) => (
              <View key={idx} style={[styles.keypadRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {row.map((k) => {
                  if (k === 'bs')
                    return (
                      <Pressable key="bs" style={[styles.key, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={onBackspace}>
                        <Text style={[styles.keyText, { color: colors.text }]}>⌫</Text>
                      </Pressable>
                    );
                  if (k === 'ok')
                    return (
                      <Pressable key="ok" style={[styles.key, { borderColor: colors.border, backgroundColor: colors.primary }]} onPress={onNext}>
                        <Text style={[styles.keyText, { color: '#fff', fontWeight: '800' }]}>OK</Text>
                      </Pressable>
                    );
                  return (
                    <Pressable key={k} style={[styles.key, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={() => onDigit(k)}>
                      <Text style={[styles.keyText, { color: colors.text }]}>{k}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const DeleteConfirmationModal = ({
  visible, onClose, colors, rtl, confirmEn, onConfirmEnChange, canDelete, isDeleting, onDelete, t
}: {
  visible: boolean;
  onClose: () => void;
  colors: any;
  rtl: boolean;
  confirmEn: string;
  onConfirmEnChange: (text: string) => void;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  t: any;
}) => {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalFull, { backgroundColor: colors.bg }]}>
        <View style={[styles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={onClose} disabled={isDeleting} style={[styles.modalHeaderBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 18, color: isDeleting ? colors.textMuted : colors.text }}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.modalHeaderTitle, { color: colors.danger }]} numberOfLines={1}>{t('settings.deleteWalletConfirm')}</Text>
          <View style={styles.modalHeaderBtn} />
        </View>

        <ScrollView style={styles.modalBody} contentContainerStyle={styles.deleteModalContent}>
          <View style={[styles.warningBox, { backgroundColor: colors.danger + '20' }]}>
            <Text style={[styles.warningText, { color: colors.danger }]}>
              {t('settings.deleteWarning')}
            </Text>
          </View>

          <Text style={[styles.deleteInstruction, { color: colors.text }]}>{t('settings.deleteInstructionSingle') || 'Type "DELETE" to confirm.'}</Text>

          <View style={styles.deleteInputsContainer}>
            <View style={styles.deleteInputGroup}>
              <Text style={[styles.deleteInputLabel, { color: colors.text }]}>Type "DELETE"</Text>
              <TextInput
                style={[
                  styles.deleteInput,
                  {
                    borderColor: canDelete ? '#10B981' : colors.border,
                    backgroundColor: colors.card,
                    color: colors.text,
                  },
                ]}
                value={confirmEn}
                onChangeText={onConfirmEnChange}
                placeholder="DELETE"
                placeholderTextColor={colors.textMuted}
                editable={!isDeleting}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.deleteConfirmBtn,
              {
                backgroundColor: canDelete ? colors.danger : colors.border,
                opacity: isDeleting ? 0.7 : 1,
              },
            ]}
            onPress={onDelete}
            disabled={!canDelete || isDeleting}
          >
            <Text style={styles.deleteConfirmBtnText}>
              {isDeleting ? t('settings.deleting') : t('settings.confirmDelete')}
            </Text>
          </TouchableOpacity>

          {isDeleting && (
            <Text style={[styles.deletingText, { color: colors.textMuted }]}>{t('settings.deletingProgress')}</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

/* ---------- أنماط - تم تعديل الأنماط هنا ---------- */
const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { paddingHorizontal: 18, paddingBottom: 28, paddingTop: 12 },

  // Cards
  card: {
    paddingVertical: 4, 
    paddingHorizontal: 16,
    borderRadius: 16,
    marginTop: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    ...Platform.select({ android: { elevation: 2 } }),
  },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  sectionSubtitle: { fontSize: 12, marginTop: 2 },
  divider: { height: 1, marginVertical: 4, borderRadius: 999 }, 
  
  // Row Title (New style for better visibility)
  rowTitle: { 
    fontSize: 16, 
    fontWeight: '700',
    // 🚀 زيادة حجم الخط قليلاً كما طلب
    ...Platform.select({ 
        ios: { fontWeight: '600' }, 
        android: { fontWeight: '700' } 
    }), 
  },

  // Rows / inputs / buttons
  rowItem: {
    paddingVertical: 14,
    paddingHorizontal: 0, 
    borderRadius: 12, 
    borderWidth: 0, 
    alignItems: 'center',
  },
  iconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 🚀 تحريك السهم لوضعه المطلق
  ltrChevron: { position: 'absolute', right: 0 },
  rtlChevron: { position: 'absolute', left: 0 }, 

  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '800' },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  smallBtnText: { fontSize: 14, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10 },

  // Chips - لم تعد مستخدمة
  rowWrap: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
  },

  // Update box - لم تعد مستخدمة
  updateInfoContainer: { marginBottom: 12 },
  updateInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  updateInfoLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  updateInfoValue: { fontSize: 14, fontWeight: '700', flex: 1, textAlign: 'right' },

  // Actions
  actionButtonsContainer: { marginTop: 24, gap: 12 },
  actionBtn: { padding: 15, borderRadius: 14 },
  actionText: { color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '800', flex: 1 },
  actionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, 

  // 🚀 الأنماط الجديدة لزر حذف المحفظة الصغير
  deleteMinorBtn: { 
      paddingVertical: 15, 
      paddingHorizontal: 15,
      borderRadius: 14,
      backgroundColor: 'transparent', // خلفية شفافة
      borderWidth: 1.5,
      // 🚨 استخدام لون border خفيف لجعله "أقل وضوحاً"
      borderColor: '#dcdcdc', 
  },
  deleteMinorText: { 
      textAlign: 'center', 
      fontSize: 16, 
      fontWeight: '800', 
      flex: 1 
  },

  // Modals (shared)
  modalFull: { flex: 1, paddingTop: 50, paddingHorizontal: 16, paddingBottom: 24 },
  modalHeader: { alignItems: 'center', marginBottom: 8 },
  modalHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modalHeaderTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '900' },
  modalBody: { flex: 1 },

  // PIN keypad
  dotsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 10 },
  dot: { width: 14, height: 14, borderWidth: 2, borderRadius: 7 },
  keypadWrap: { paddingBottom: 24, marginTop: 16 },
  keypadRow: { justifyContent: 'space-between', marginVertical: 6, flexDirection: 'row' },
  key: {
    flex: 1,
    marginHorizontal: 6,
    height: 58,
    borderWidth: 1.5,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 20, fontWeight: '700' },

  // Delete modal
  deleteModalContent: { flexGrow: 1, paddingBottom: 24 },
  warningBox: { padding: 16, borderRadius: 12, marginBottom: 20 },
  warningText: { fontSize: 16, fontWeight: '900', textAlign: 'center' },
  deleteInstruction: { fontSize: 14, marginBottom: 20, textAlign: 'center', lineHeight: 20 },
  deleteInputsContainer: { gap: 16, marginBottom: 24 },
  deleteInputGroup: { gap: 8 },
  deleteInputLabel: { fontSize: 14, fontWeight: '600' },
  deleteInput: { borderWidth: 2, borderRadius: 12, padding: 12, fontSize: 16, fontWeight: '600' },
  deleteConfirmBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
  deleteConfirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  deletingText: { textAlign: 'center', marginTop: 12, fontSize: 14, fontStyle: 'italic' },
});