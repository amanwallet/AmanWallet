// locales/i18n.ts - تحسين تهيئة اللغة
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { I18nManager } from "react-native";
import * as SecureStore from 'expo-secure-store';

import ar from "./ar.json";
import en from "./en.json";

// دالة تحميل اللغة المحفوظة
async function getSavedLanguage(): Promise<string> {
  try {
    const savedLang = await SecureStore.getItemAsync('app_lang');
    if (savedLang === 'ar' || savedLang === 'en') {
      return savedLang;
    }
  } catch (error) {
    console.error('Error loading saved language:', error);
  }
  
  // اللغة الافتراضية حسب جهاز المستخدم
  const deviceLang = (() => {
    if (typeof navigator !== 'undefined') {
      const lang = navigator.language || (navigator as any).userLanguage;
      if (lang && lang.startsWith('ar')) return 'ar';
      if (lang && lang.startsWith('en')) return 'en';
    }
    return 'ar'; // الافتراضي عربي
  })();
  
  return deviceLang;
}

// تهيئة i18next مع اللغة المحفوظة
async function initializeI18n() {
  const savedLang = await getSavedLanguage();
  
  // 🔥 تعديل مهم: RTL دائماً مهما كانت اللغة
  // هذا يحافظ على نفس الترتيب العربي حتى مع الإنجليزية
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true); // RTL دائماً
  
  await i18n.use(initReactI18next).init({
    compatibilityJSON: "v4",
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: savedLang,
    fallbackLng: "ar",
    supportedLngs: ["ar", "en"],
    interpolation: {
      escapeValue: false,
    },
    returnEmptyString: false,
    returnNull: false,
  });
  
  return savedLang;
}

// 🔥 دالة عامة لتغيير اللغة في كل التطبيق
export const changeAppLanguage = async (lng: 'ar' | 'en') => {
  try {
    // 1. حفظ اللغة
    await SecureStore.setItemAsync('app_lang', lng);
    
    // 2. تغيير اللغة في i18next (النصوص فقط)
    await i18n.changeLanguage(lng);
    
    // 3. 🔥 تعديل مهم: RTL يبقى دائماً ولا يتغير
    // لا نغير إعدادات RTL أبداً، نتركها كما هي (RTL)
    
    // 4. إرجاع نجاح العملية
    return true;
  } catch (error) {
    console.error('Error changing app language:', error);
    return false;
  }
};

// تهيئة i18n
initializeI18n().catch(console.error);

export default i18n;