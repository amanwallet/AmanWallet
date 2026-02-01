// ThemeProvider.tsx — ملف معدل لدعم الثيمات المتعددة
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type Mode = 'system' | 'light' | 'dark' | 'green' | 'blue' | 'purple';

type ThemeCtxValue = {
  mode: Mode;                         // تفضيل المستخدم الحالي
  resolved: 'light' | 'dark' | 'green' | 'blue' | 'purple'; // الثيم الفعلي
  colors: {
    bg: string;                       // خلفية عامة للشاشة
    card: string;                     // خلفية البطاقات
    text: string;                     // نص أساسي
    textMuted: string;                // نص ثانوي
    border: string;                   // حدود/فواصل
    primary: string;                  // لون أساسي للأزرار
    danger: string;                   // لون تحذيري (حذف)
  };
  setMode: (m: Mode) => Promise<void>; // لتغيير الثيم + الحفظ
};

const ThemeContext = createContext<ThemeCtxValue | null>(null);

const palette = {
  light: {
    bg: '#f0f4f8',           // أزرق فاتح جداً
    card: '#e3eaf2',         // أزرق فاتح للبطاقات
    text: '#1a365d',         // أزرق غامق للنص
    textMuted: '#4a5568',    // رمادي أزرق للنص الثانوي
    border: '#cbd5e0',       // أزرق فاتح للحدود
    primary: '#2b6cb0',      // أزرق متوسط
    danger: '#c53030',
  },
  dark: {
    bg: '#1a202c',           // أزرق داكن جداً
    card: '#2d3748',         // أزرق غامق للبطاقات
    text: '#e2e8f0',         // أبيض مائل للأزرق للنص
    textMuted: '#a0aec0',    // رمادي أزرق فاتح
    border: '#4a5568',       // أزرق متوسط للحدود
    primary: '#4299e1',      // أزرق فاتح جميل
    danger: '#fc8181',
  },
  green: {
    bg: '#f0fff4',           // أخضر فاتح
    card: '#e6ffed',         // أخضر فاتح للبطاقات
    text: '#22543d',         // أخضر غامق
    textMuted: '#68d391',    // أخضر متوسط
    border: '#9ae6b4',       // أخضر فاتح للحدود
    primary: '#38a169',      // أخضر جميل
    danger: '#e53e3e',
  },
  blue: {
    bg: '#ebf8ff',           // أزرق فاتح
    card: '#bee3f8',         // أزرق فاتح للبطاقات
    text: '#2a4365',         // أزرق غامق
    textMuted: '#4299e1',    // أزرق متوسط
    border: '#90cdf4',       // أزرق فاتح للحدود
    primary: '#3182ce',      // أزرق جميل
    danger: '#e53e3e',
  },
  purple: {
    bg: '#faf5ff',           // بنفسجي فاتح
    card: '#e9d8fd',         // بنفسجي فاتح للبطاقات
    text: '#44337a',         // بنفسجي غامق
    textMuted: '#9f7aea',    // بنفسجي متوسط
    border: '#d6bcfa',       // بنفسجي فاتح للحدود
    primary: '#805ad5',      // بنفسجي جميل
    danger: '#e53e3e',
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<Mode>('system');
  const [scheme, setScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());

  // راقب تغيّر وضع النظام
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setScheme(colorScheme));
    return () => sub.remove();
  }, []);

  // حمّل التفضيل المحفوظ
  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync('app_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system' || saved === 'green' || saved === 'blue' || saved === 'purple') {
        setModeState(saved as Mode);
      }
    })();
  }, []);

  const resolved = useMemo(() => {
    if (mode === 'system') {
      return scheme === 'dark' ? 'dark' : 'light';
    }
    return mode;
  }, [mode, scheme]);

  const colors = palette[resolved];

  const value = useMemo<ThemeCtxValue>(
    () => ({
      mode,
      resolved,
      colors,
      setMode: async (m: Mode) => {
        setModeState(m);
        await SecureStore.setItemAsync('app_theme', m); // حفظ التفضيل
      },
    }),
    [mode, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
};