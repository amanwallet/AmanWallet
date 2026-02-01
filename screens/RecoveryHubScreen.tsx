// RecoveryHubScreen.tsx - تصميم عصري ومُحسَّن مع RTL كامل
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, I18nManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeProvider';
import { Globe, Sun, ChevronRight } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

export default function RecoveryHubScreen() {
  const { colors, mode, setMode } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  
  const [currentLang, setCurrentLang] = useState<'ar' | 'en'>('ar');
  const [isChangingLang, setIsChangingLang] = useState(false);
  const rtl = currentLang === 'ar';

  useEffect(() => {
    // تحميل اللغة المحفوظة
    const loadSavedLanguage = async () => {
      try {
        const savedLang = await SecureStore.getItemAsync('app_lang');
        if (savedLang === 'ar' || savedLang === 'en') {
          setCurrentLang(savedLang);
          await i18n.changeLanguage(savedLang);
          
          if (savedLang === 'ar') {
            I18nManager.allowRTL(true);
            I18nManager.forceRTL(true);
          } else {
            I18nManager.allowRTL(false);
            I18nManager.forceRTL(false);
          }
        }
      } catch (error) {
        console.error('Error loading language:', error);
      }
    };
    loadSavedLanguage();
  }, []);

  useEffect(() => {
    if (isChangingLang) return;
    const lang = (i18n.language || 'ar').startsWith('ar') ? 'ar' : 'en';
    if (lang !== currentLang) {
      setCurrentLang(lang);
    }
  }, [i18n.language]);

  const buttons = [
    {
      id: 'create',
      title: t('recoveryHub.createWalletTitle'),
      subtitle: t('recoveryHub.createWalletSubtitle'),
      icon: '🚀',
      screen: 'CreateWallet' as any,
      color: '#3b82f6', // Blue
      description: t('recoveryHub.createDescription') || 'إنشاء محفظة جديدة بعبارة سرية جديدة'
    },
    {
      id: 'recover',
      title: t('recoveryHub.recoverMnemonicTitle'),
      subtitle: t('recoveryHub.recoverMnemonicSubtitle'),
      icon: '🔄',
      screen: 'SetPin' as any,
      color: '#10b981', // Green
      description: t('recoveryHub.recoverDescription') || 'استرجاع محفظة باستخدام العبارة السرية'
    },
    {
      id: 'email',
      title: t('recoveryHub.recoverEmailTitle'),
      subtitle: t('recoveryHub.recoverEmailSubtitle'),
      icon: '📧',
      screen: 'EmailRestore' as any,
      color: '#8b5cf6', // Purple
      description: t('recoveryHub.emailDescription') || 'استرجاع المحفظة من النسخة الاحتياطية عبر البريد الإلكتروني'
    }
  ];

  const toggleLanguage = async () => {
    if (isChangingLang) return;
    try {
      setIsChangingLang(true);
      const newLang = currentLang === 'ar' ? 'en' : 'ar';
      await SecureStore.setItemAsync('app_lang', newLang);
      await i18n.changeLanguage(newLang);
      
      if (newLang === 'ar') {
        I18nManager.allowRTL(true);
        I18nManager.forceRTL(true);
      } else {
        I18nManager.allowRTL(false);
        I18nManager.forceRTL(false);
      }
      setCurrentLang(newLang);
      navigation.replace('RecoveryHub' as never);
    } catch (error) {
      console.error('Error changing language:', error);
    } finally {
      setIsChangingLang(false);
    }
  };

  const toggleTheme = () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* 🚀 Header المحسَّن */}
      <View style={[styles.header, { 
        flexDirection: rtl ? 'row-reverse' : 'row',
        backgroundColor: colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }]}>
        
        {/* زر الثيم */}
        <TouchableOpacity 
          onPress={toggleTheme}
          style={[styles.headerButton, { 
            backgroundColor: colors.card, 
            borderColor: colors.border 
          }]}
        >
          <Sun size={24} color={colors.primary} />
        </TouchableOpacity>
        
        {/* العنوان المركزي */}
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('recoveryHub.title')}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {t('recoveryHub.welcome') || 'مرحباً بك في محفظة العملات'}
          </Text>
        </View>
        
        {/* زر اللغة */}
        <TouchableOpacity 
          onPress={toggleLanguage}
          disabled={isChangingLang}
          style={[styles.headerButton, { 
            backgroundColor: colors.card, 
            borderColor: colors.border,
            opacity: isChangingLang ? 0.5 : 1
          }]}
        >
          <Globe size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* المحتوى الرئيسي */}
      <ScrollView 
        contentContainerStyle={[styles.container, { paddingBottom: 30 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 🚀 العنوان الرئيسي والفرعي بتصميم أنيق */}
        <Text style={[styles.mainTitle, { 
          color: colors.text, 
          textAlign: rtl ? 'right' : 'left',
          marginTop: 24
        }]}>
          {t('recoveryHub.chooseMethod')}
        </Text>
        
        <Text style={[styles.mainSubtitle, { 
          color: colors.textMuted, 
          textAlign: rtl ? 'right' : 'left',
          marginBottom: 30
        }]}>
          {t('recoveryHub.accessHint')}
        </Text>

        {/* الأزرار / البطاقات */}
        <View style={styles.buttonsContainer}>
          {buttons.map((button) => (
            <TouchableOpacity
              key={button.id}
              style={[styles.button, { 
                backgroundColor: colors.card,
                borderColor: button.color,
                flexDirection: rtl ? 'row-reverse' : 'row',
              }]}
              onPress={() => navigation.navigate(button.screen)}
            >
              {/* 🚀 أيقونة أكبر وأكثر بروزاً */}
              <View style={[styles.buttonIconContainer, { backgroundColor: button.color + '25' }]}>
                <Text style={styles.buttonIcon}>{button.icon}</Text>
              </View>
              
              <View style={[styles.buttonTextContainer, { marginHorizontal: 16 }]}>
                <Text style={[styles.buttonTitle, { 
                  color: colors.text,
                  textAlign: rtl ? 'right' : 'left'
                }]}>
                  {button.title}
                </Text>
                <Text style={[styles.buttonDescription, { 
                  color: colors.textMuted,
                  textAlign: rtl ? 'right' : 'left',
                  marginTop: 4
                }]}>
                  {button.description}
                </Text>
              </View>
              
              {/* أيقونة السهم */}
              <ChevronRight 
                size={24} 
                color={colors.textMuted} 
                style={rtl ? { transform: [{ rotate: '180deg' }] } : {}}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* 🚀 ملاحظة الأمان بتصميم عصري وداكن */}
        <View style={[styles.infoBox, { 
          backgroundColor: colors.card,
          borderColor: colors.danger,
          borderWidth: 1
        }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            {t('recoveryHub.securityNote') || 'ملاحظة أمنية'}
          </Text>
          <Text style={[styles.infoText, { 
            color: colors.textMuted, 
            textAlign: rtl ? 'right' : 'left',
            direction: rtl ? 'rtl' : 'ltr'
          }]}>
            {t('recoveryHub.securityMessage') || '• احفظ عبارة الاسترجاع في مكان آمن\n• لا تشاركها مع أحد\n• أنت المسؤول الوحيد عن أموالك'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // 🚀 تصميم Header جديد
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitleContainer: {
    flex: 1, 
    alignItems: 'center',
    marginHorizontal: 10,
  },
  headerTitle: {
    fontWeight: '900', 
    fontSize: 18,
    textAlign: 'center'
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  
  // 🚀 عناوين الشاشة الرئيسية
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  mainSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.8,
  },
  
  // 🚀 تصميم أزرار الخيارات (البطاقات)
  buttonsContainer: {
    gap: 12,
    marginBottom: 30,
  },
  button: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonIconContainer: {
    width: 55,
    height: 55,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    fontSize: 26,
  },
  buttonTextContainer: {
    flex: 1, 
    justifyContent: 'center'
  },
  buttonTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  buttonDescription: {
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
  },
  
  // 🚀 تصميم ملاحظة الأمان
  infoBox: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
    color: '#EF4444', 
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});