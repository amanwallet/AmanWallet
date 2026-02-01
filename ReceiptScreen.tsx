// ReceiptScreen.tsx
import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform, ScrollView } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useTheme } from "./ThemeProvider";
import { TxLog } from "./useTxLogger";
import { useTranslation } from "react-i18next";

export default function ReceiptScreen() {
  const { colors, resolved } = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const log: TxLog = route.params?.log;

  const { t, i18n } = useTranslation();
  const rtl = i18n.language?.startsWith("ar");

  useEffect(() => {
    nav.setOptions({ title: t("receipt.title", "إيصال العملية") });
  }, [nav, t, i18n.language]);

  const statusText = useMemo(() => {
    switch (log?.status) {
      case "confirmed":
        return t("receipt.status.confirmed", "تم التأكيد");
      case "broadcasted":
        return t("receipt.status.broadcasted", "تم البث");
      case "started":
        return t("receipt.status.started", "قيد الإرسال");
      case "failed":
      default:
        return t("receipt.status.failed", "فشلت");
    }
  }, [log?.status, t, i18n.language]);

  // فلترة (Ankr) من اسم الشبكة عند العرض
  const networkClean = log?.network?.replace(/\s*\(Ankr\)/i, "");

  const Row = ({ label, value }: { label: string; value?: string }) => (
    <View
      style={[
        styles.row,
        { borderColor: colors.border, flexDirection: rtl ? "row-reverse" : "row" },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: colors.text, textAlign: rtl ? "right" : "left" },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.value,
          { color: colors.text, textAlign: rtl ? "left" : "right", flex: 1 },
        ]}
        selectable
        numberOfLines={2}
      >
        {value || "—"}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text
        style={[
          styles.h1,
          { color: colors.text, textAlign: rtl ? "right" : "left" },
        ]}
      >
        {t("receipt.title", "إيصال العملية")}
      </Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            shadowOpacity: resolved === "dark" ? 0 : 0.05,
          },
        ]}
      >
        <Row label={t("receipt.labels.status", "الحالة")} value={statusText} />
        <Row label={t("receipt.labels.token", "العملة")} value={log?.token} />
        <Row label={t("receipt.labels.network", "الشبكة")} value={networkClean} />
        <Row label={t("receipt.labels.amount", "المبلغ")} value={log?.amount} />
        <Row label={t("receipt.labels.from", "من")} value={log?.from} />
        <Row label={t("receipt.labels.to", "إلى")} value={log?.to} />
        <Row label={t("receipt.labels.txid", "TxID")} value={log?.txid || log?.tempId} />
        <Row label={t("receipt.labels.fee", "الرسوم")} value={log?.fee} />
        <Row
          label={t("receipt.labels.time", "الوقت")}
          value={new Date(log?.ts || Date.now()).toLocaleString()}
        />

        {!!log?.explorerUrl && (
          <TouchableOpacity
            onPress={() => Linking.openURL(log.explorerUrl!)}
            style={[styles.btn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.btnTxt}>{t("receipt.viewOnExplorer", "عرض على المستكشف")}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => nav.goBack()}
          style={[styles.btn, { backgroundColor: "#475569" }]}
        >
          <Text style={styles.btnTxt}>{t("receipt.back", "رجوع")}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: "900", marginBottom: 10 },
  card: {
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    ...Platform.select({ android: { elevation: 1 } }),
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  label: { fontWeight: "800", marginBottom: 4, fontSize: 13, minWidth: 90 },
  value: { fontSize: 14 },
  btn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnTxt: { color: "#fff", fontWeight: "900" },
});
