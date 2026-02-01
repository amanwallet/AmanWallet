import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import * as Updates from "expo-updates";

/**
 * يفحص وجود تحديث OTA عند بدء التشغيل:
 * - إذا وُجد تحديث: ينزّله ويعيد تشغيل التطبيق تلقائيًا.
 * - إذا لم يوجد أو حدث خطأ: يكمل تشغيل التطبيق كالمعتاد.
 * ملاحظة: لا يعمل داخل Expo Go (يلزم Development/Production build).
 */
export default function UpdateGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync(); // إعادة تشغيل تلقائي
          return;
        }
      } catch (e) {
        console.warn("OTA check failed:", e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ marginTop: 8, color: "#fff" }}>جاري التحقق من وجود تحديث…</Text>
      </View>
    );
  }

  return <>{children}</>;
}
