// App.tsx - الإصدار المحدث مع إضافة USDT_BEP20
import "./polyfills";
import "./locales/i18n";
import React, { useState, useEffect } from "react";
import { StatusBar, View, Pressable, Text } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as SecureStore from 'expo-secure-store';

import { ThemeProvider } from "./ThemeProvider";
import UpdateGate from "./UpdateGate";

// الشاشات الرئيسية
import HomeScreen from "./screens/HomeScreen";
import Settings from "./screens/Settings";
import EnterPinScreen from "./screens/EnterPinScreen";
import SetPinScreen from "./screens/SetPinScreen";
import PinEntryScreen from "./screens/PinEntryScreen";
import ReceiptScreen from "./ReceiptScreen";

// الشاشات الجديدة للاستعادة
import RecoveryHubScreen from "./screens/RecoveryHubScreen";
import CreateWalletScreen from "./screens/CreateWalletScreen";
import EmailRestoreScreen from "./screens/EmailRestoreScreen";

// العملات الأساسية
import BTC from "./currencies/BTC";
import ETH from "./currencies/ETH";
import BNB from "./currencies/BNB";
import MATIC from "./currencies/MATIC";
import SOL from "./currencies/SOL";
import TRX from "./currencies/TRX";
import SUI from "./currencies/SUI";

// العملات المستقرة
import USDC from "./currencies/USDC";
import USDC_ERC20 from "./currencies/USDC_ERC20";
import USDT from "./currencies/USDT";
import USDT_ERC20 from "./currencies/USDT_ERC20";
import USDT_TRX from "./currencies/USDT_TRX";
import USDT_BEP20 from "./currencies/USDT_BEP20"; // تمت الإضافة

// العملات الأخرى
import SHIB from "./currencies/SHIB";
import ARB from "./currencies/ARB";
import ARB_ETH from "./currencies/ARB_ETH";
import ETH_ARB from "./currencies/ETH_ARB";
import XRP from "./currencies/XRP";
import LINK from "./currencies/LINK";

// العملات المضافة حديثاً
import LIGHT_BEP20 from "./currencies/LIGHT_BEP20";
import SOMI_ERC20 from "./currencies/SOMI_ERC20";
import SOMI_BASE from "./currencies/SOMI_BASE";
import ETH_BASE from "./currencies/ETH_BASE";
import ASTER_BEP20 from "./currencies/ASTER_BEP20";

export type RootStackParamList = {
  // شاشات المصادقة
  SetPin: undefined;
  EnterPin: undefined;
  PinEntry: { mnemonic: string; mode: 'create' | 'restore' | 'email-restore' };
  Home: undefined;
  Settings: undefined;
  Receipt: undefined;

  // الشاشات الجديدة للاستعادة
  RecoveryHub: undefined;
  CreateWallet: undefined;
  EmailRestore: undefined;

  // شاشات العملات المشفرة
  BTC: undefined;
  ETH: undefined;
  BNB: undefined;
  MATIC: undefined;
  SOL: undefined;
  TRX: undefined;
  SUI: undefined;
  
  // العملات المستقرة
  USDC: undefined;
  USDC_ERC20: undefined;
  USDT: undefined;
  USDT_ERC20: undefined;
  USDT_TRX: undefined;
  USDT_BEP20: undefined; // تمت الإضافة
  
  // العملات الأخرى
  SHIB: undefined;
  ARB: undefined;
  ARB_ETH: undefined;
  ETH_ARB: undefined;
  XRP: undefined;
  LINK: undefined;
  
  // العملات المضافة حديثاً
  LIGHT_BEP20: undefined;
  SOMI_ERC20: undefined;
  SOMI_BASE: undefined;
  ETH_BASE: undefined;
  ASTER_BEP20: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

// دوال التحقق من وجود المحفظة (نفس الدوال المستخدمة في EnterPinScreen)
async function hasStoredWallet(): Promise<boolean> {
  const evmPk = await SecureStore.getItemAsync('privateKey');
  return !!evmPk;
}

async function hasSavedPin(): Promise<boolean> {
  const pin = await SecureStore.getItemAsync('wallet_pin');
  return !!pin && pin.length > 0;
}

function RootNavigator() {
  const { t } = useTranslation();
  const [isReady, setIsReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>("EnterPin");

  useEffect(() => {
    const checkWalletState = async () => {
      try {
        const [hasWallet, hasPin] = await Promise.all([
          hasStoredWallet(),
          hasSavedPin()
        ]);
        
        // إذا كانت المحفظة والPIN موجودين → إدخال PIN
        // إذا لم تكن المحفظة موجودة → شاشة الاستعادة
        if (hasWallet && hasPin) {
          setInitialRoute("EnterPin");
        } else {
          setInitialRoute("RecoveryHub");
        }
      } catch (error) {
        console.error('Error checking wallet state:', error);
        setInitialRoute("RecoveryHub"); // في حالة الخطأ، اذهب للاستعادة
      } finally {
        setIsReady(true);
      }
    };

    checkWalletState();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f1a2f', justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="wallet-outline" size={48} color="#3b82f6" />
        <Text style={{ color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' }}>
          {t('loading', 'جاري التحميل...')}
        </Text>
      </View>
    );
  }

  return (
    <Stack.Navigator initialRouteName={initialRoute}>
      {/* شاشات المصادقة */}
      <Stack.Screen name="EnterPin" component={EnterPinScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SetPin" component={SetPinScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PinEntry" component={PinEntryScreen} options={{ headerShown: false }} />

      {/* الشاشات الجديدة للاستعادة */}
      <Stack.Screen 
        name="RecoveryHub" 
        component={RecoveryHubScreen} 
        options={{ 
          headerShown: false,
          title: t("recovery.hub", "استعادة المحفظة")
        }} 
      />
      <Stack.Screen 
        name="CreateWallet" 
        component={CreateWalletScreen} 
        options={{ 
          headerShown: false,
          title: t("create.wallet", "إنشاء محفظة جديدة")
        }} 
      />
      <Stack.Screen 
        name="EmailRestore" 
        component={EmailRestoreScreen} 
        options={{ 
          headerShown: false,
          title: t("email.restore", "استرجاع بالإيميل")
        }} 
      />

      {/* الشاشة الرئيسية */}
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: t("home.title", "الرئيسية"),
          headerStyle: { backgroundColor: "#000" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "800" },
          headerTitleAlign: "center",
          headerLeft: () => (
            <Pressable onPress={() => navigation.navigate("Settings")} style={{ marginLeft: 10, padding: 6 }}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ marginRight: 10 }}>
              {/* تم إزالة زر الإشعارات */}
            </View>
          ),
        })}
      />

      {/* شاشات الإعدادات والوصول */}
      <Stack.Screen name="Settings" component={Settings} options={{ headerStyle: { backgroundColor: "#000" }, headerTintColor: "#fff", headerTitleStyle: { fontWeight: "800" }, headerTitleAlign: "center" }} />
      <Stack.Screen name="Receipt" component={ReceiptScreen} options={{ headerStyle: { backgroundColor: "#000" }, headerTintColor: "#fff", headerTitleStyle: { fontWeight: "800" }, headerTitleAlign: "center" }} />

      {/* العملات الأساسية */}
      <Stack.Screen name="BTC" component={BTC} options={{ headerShown: false }} />
      <Stack.Screen name="ETH" component={ETH} options={{ headerShown: false }} />
      <Stack.Screen name="BNB" component={BNB} options={{ headerShown: false }} />
      <Stack.Screen name="MATIC" component={MATIC} options={{ headerShown: false }} />
      <Stack.Screen name="SOL" component={SOL} options={{ headerShown: false }} />
      <Stack.Screen name="TRX" component={TRX} options={{ headerShown: false }} />
      <Stack.Screen name="SUI" component={SUI} options={{ headerShown: false }} />

      {/* العملات المستقرة */}
      <Stack.Screen name="USDC" component={USDC} options={{ headerShown: false }} />
      <Stack.Screen name="USDC_ERC20" component={USDC_ERC20} options={{ headerShown: false }} />
      <Stack.Screen name="USDT" component={USDT} options={{ headerShown: false }} />
      <Stack.Screen name="USDT_ERC20" component={USDT_ERC20} options={{ headerShown: false }} />
      <Stack.Screen name="USDT_TRX" component={USDT_TRX} options={{ headerShown: false }} />
      <Stack.Screen name="USDT_BEP20" component={USDT_BEP20} options={{ headerShown: false }} />

      {/* العملات الأخرى */}
      <Stack.Screen name="SHIB" component={SHIB} options={{ headerShown: false }} />
      <Stack.Screen name="ARB" component={ARB} options={{ headerShown: false }} />
      <Stack.Screen name="ARB_ETH" component={ARB_ETH} options={{ headerShown: false }} />
      <Stack.Screen name="ETH_ARB" component={ETH_ARB} options={{ headerShown: false }} />
      <Stack.Screen name="XRP" component={XRP} options={{ headerShown: false }} />
      <Stack.Screen name="LINK" component={LINK} options={{ headerShown: false }} />

      {/* العملات المضافة حديثاً */}
      <Stack.Screen name="LIGHT_BEP20" component={LIGHT_BEP20} options={{ headerShown: false }} />
      <Stack.Screen name="SOMI_ERC20" component={SOMI_ERC20} options={{ headerShown: false }} />
      <Stack.Screen name="SOMI_BASE" component={SOMI_BASE} options={{ headerShown: false }} />
      <Stack.Screen name="ETH_BASE" component={ETH_BASE} options={{ headerShown: false }} />
      <Stack.Screen name="ASTER_BEP20" component={ASTER_BEP20} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <UpdateGate>
      <ThemeProvider>
        <NavigationContainer theme={DarkTheme}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          <RootNavigator />
        </NavigationContainer>
      </ThemeProvider>
    </UpdateGate>
  );
}