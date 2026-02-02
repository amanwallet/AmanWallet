// currencies/TokenTemplate.tsx - الإصدار النهائي (بدون سجلات وإشعارات)
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, Alert, Share,
  Animated, ActivityIndicator, Keyboard, ScrollView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../ThemeProvider";
import { useTranslation } from "react-i18next";
import QRCode from "react-native-qrcode-svg";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";
import { captureRef } from "react-native-view-shot";

/* ============ helpers ============ */
const cardShadow = (mode: "light" | "dark") =>
  mode === "dark"
    ? { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 }
    : { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 };

const BINANCE_PAIR: Record<string, string> = {
  USDC:"USDCUSDT", BTC:"BTCUSDT", ETH:"ETHUSDT", BNB:"BNBUSDT", ADA:"ADAUSDT", SOL:"SOLUSDT",
  MATIC:"MATICUSDT", XRP:"XRPUSDT", LINK:"LINKUSDT", ARB:"ARBUSDT", TON:"TONUSDT",
  TRX:"TRXUSDT", DOGE:"DOGEUSDT", SHIB:"SHIBUSDT", LTC:"LTCUSDT", BCH:"BCHUSDT",
  DOT:"DOTUSDT", AVAX:"AVAXUSDT", ATOM:"ATOMUSDT", NEAR:"NEARUSDT",
  FIL:"FILUSDT", ETC:"ETCUSDT", APT:"APTUSDT", SUI:"SUIUSDT", OP:"OPUSDT",
  USDT:"USDTUSDT"
};

const COINBASE_PAIR: Record<string, string> = {
  USDC:"USDC-USD", BTC:"BTC-USD", ETH:"ETH-USD", ADA:"ADA-USD", SOL:"SOL-USD",
  MATIC:"MATIC-USD", XRP:"XRP-USD", LINK:"LINK-USD", 
  USDT:"USDT-USD", TON:"TON-USD", TRX:"TRX-USD", DOGE:"DOGE-USD",
  LTC:"LTC-USD", BCH:"BCH-USD", DOT:"DOT-USD", AVAX:"AVAX-USD",
  ATOM:"ATOM-USD", FIL:"FIL-USD", ETC:"ETC-USD", NEAR:"NEAR-USD", SUI:"SUI-USD"
};

/* ============ price function ============ */
async function getPriceUSD(symbol: string): Promise<number | null> {
  const S = symbol.toUpperCase();

  const bp = BINANCE_PAIR[S];
  if (bp) try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${bp}`);
    if (r.ok) { const j = await r.json(); const p = Number(j?.price); if (isFinite(p)) return p; }
  } catch {}

  const cp = COINBASE_PAIR[S];
  if (cp) try {
    const r = await fetch(`https://api.exchange.coinbase.com/products/${cp}/ticker`);
    if (r.ok) { const j = await r.json(); const bid = +j?.bid, ask = +j?.ask; const mid = isFinite(bid)&&isFinite(ask)?(bid+ask)/2:+j?.price; if (isFinite(mid)) return mid; }
  } catch {}

  if (["USDT","USDC"].includes(S)) return 1;
  return null;
}

interface Props {
  title: string;
  symbol: string;
  balance: string;
  address?: string;
  networkFee?: string;
  recipient?: string;
  amount?: string;
  pin: string;
  sending?: boolean;
  onBack: () => void;
  onRefresh?: () => void;
  onRecipientChange: (text: string) => void;
  onAmountChange: (text: string) => void;
  onPinChange: (text: string) => void;
  onSendAll: () => void;
  onSend?: () => Promise<void>;
  onSendWithResult?: () => Promise<{ txHash?: string; fee?: string; explorerUrl?: string }>;
  onAfterSend?: (txHash?: string) => void;
}

export default function TokenTemplate(p: Props) {
  const { colors, resolved } = useTheme();
  const { t, i18n } = useTranslation();
  const rtl = (i18n.resolvedLanguage || i18n.language || "ar").startsWith("ar");

  const {
    title, symbol, balance, address, networkFee,
    recipient, amount, pin, sending, onBack, onRefresh,
    onRecipientChange, onAmountChange, onPinChange, onSendAll,
    onSend, onSendWithResult, onAfterSend
  } = p;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [usdPrice, setUsdPrice] = useState<number | null>(null);
  const [kbShown, setKbShown] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [recvOpen, setRecvOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facing, setFacing] = useState<"back"|"front">("back");
  const [permission, requestPermission] = useCameraPermissions();
  const pinInputRef = useRef<TextInput>(null);

  const amountNum = useMemo(() => {
    const v = parseFloat((amount || "0").replace(",", "."));
    return isFinite(v) ? v : 0;
  }, [amount]);
  
  const approxUSD = useMemo(() => (usdPrice ? amountNum * usdPrice : null), [amountNum, usdPrice]);

  useEffect(() => { 
    Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }).start(); 
  }, []);

  // جلب السعر
  useEffect(() => {
    (async () => { 
      setUsdPrice(null); 
      const p = await getPriceUSD(symbol); 
      setUsdPrice(p); 
    })();
  }, [symbol]);

  // تحديث السعر كل دقيقة
  useEffect(() => {
    const id = setInterval(() => { 
      getPriceUSD(symbol).then(setUsdPrice); 
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [symbol]);

  // طلب إذن الكاميرا عند فتح نافذة الإرسال (تحسين تجربة المستخدم)
  useEffect(() => {
    if (sendOpen && !permission?.granted) {
      requestPermission();
    }
  }, [sendOpen]);

  useEffect(() => {
    const sh = Keyboard.addListener("keyboardDidShow", () => setKbShown(true));
    const hd = Keyboard.addListener("keyboardDidHide", () => setKbShown(false));
    return () => { sh.remove(); hd.remove(); };
  }, []);

  const onPinDigits = (t: string) => onPinChange((t||"").replace(/[^\d]/g,"").slice(0,6));

  /* ===== مشاركة العنوان ===== */
  const qrRef = useRef<any>(null);
  const shareAddressOrQr = async () => {
    try {
      if (!address || !qrRef.current) return;
      const uri = await captureRef(qrRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { 
          mimeType: "image/png", 
          dialogTitle: rtl ? "مشاركة رمز الاستلام" : "Share address QR" 
        });
        return;
      }
      await Share.share({ 
        title: rtl ? "عنوان الاستلام" : "Receive address", 
        message: address 
      });
    } catch { 
      Alert.alert(
        rtl ? "خطأ" : "Error", 
        rtl ? "تعذّرت المشاركة" : "Share failed"
      ); 
    }
  };

  /* ===== دالة فتح الماسح الضوئي - نسخة سريعة ===== */
  const openScanner = () => {
    setScanOpen(true);      // ✅ فتح فوري بدون انتظار
    setTorchOn(false);
    setFacing("back");
  };

  // دالة عرض رسالة نجاح
  const showToast = (message: string) => {
    Alert.alert("", message, [{ text: "OK" }]);
  };

  const handleSend = async () => {
    try {
      const trimmedRecipient = recipient?.trim() || "";
      const trimmedAmount = amount?.trim() || "";
      
      if (!trimmedRecipient || !trimmedAmount || Number(trimmedAmount) <= 0 || pin.length !== 6) {
        Alert.alert(
          rtl ? "تنبيه" : "Warning", 
          rtl ? "رجاءً أدخل العنوان والمبلغ و PIN صحيح." : "Please enter address, amount, and valid PIN."
        );
        return;
      }
      
      showToast(rtl ? "بدأ الإرسال" : "Sending started");

      if (onSendWithResult) {
        const res = await onSendWithResult();
        const txHash = res?.txHash;
        if (txHash) { 
          showToast(rtl ? "✅ تم إرسال المعاملة بنجاح" : "✅ Transaction sent successfully"); 
          onAfterSend?.(txHash); 
        } else { 
          showToast(rtl ? "✅ تم إرسال المعاملة - بانتظار التأكيد" : "✅ Transaction sent - awaiting confirmation"); 
          onAfterSend?.(); 
        }
      } else if (onSend) {
        await onSend(); 
        showToast(rtl ? "✅ تم إرسال المعاملة بنجاح" : "✅ Transaction sent successfully"); 
        onAfterSend?.();
      }
      
      setSendOpen(false);
    } catch (e: any) { 
      Alert.alert(
        rtl ? "خطأ" : "Error", 
        e?.message ?? (rtl ? "فشل إرسال المعاملة" : "Transaction failed")
      ); 
    }
  };

  const priceNow = usdPrice;
  const priceChange = priceNow ? ((priceNow - 1) / 1 * 100) : 0;
  const isPricePositive = priceChange >= 0;

  return (
    <Animated.View style={{ flex: 1, backgroundColor: colors.bg, opacity: fadeAnim }}>
      <KeyboardAvoidingView 
        behavior={Platform.select({ ios: "padding", android: undefined })} 
        style={{ flex: 1 }} 
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {/* الهيدر */}
        <View style={[
          styles.header, 
          { 
            backgroundColor: colors.bg, 
            borderBottomColor: colors.border + "20", 
            paddingTop: 48, 
            paddingBottom: 12 
          }
        ]}>
          <TouchableOpacity 
            onPress={onBack} 
            style={[
              styles.headBtn, 
              { 
                backgroundColor: colors.card, 
                paddingVertical: 10 
              }
            ]} 
            hitSlop={10}
          >
            <Ionicons 
              name={rtl ? "arrow-forward" : "arrow-back"} 
              size={22} 
              color={colors.primary} 
            />
          </TouchableOpacity>
          
          <View style={styles.titleContainer}>
            <Text style={[
              styles.title, 
              { 
                color: colors.text, 
                fontSize: 20 
              }
            ]} 
            numberOfLines={1}
            >
              {title}
            </Text>
            <Text style={[
              styles.subtitle, 
              { 
                color: colors.textMuted, 
                fontSize: 13 
              }
            ]}>
              {symbol}
            </Text>
          </View>
          
          <TouchableOpacity 
            onPress={onRefresh} 
            style={[
              styles.headBtn, 
              { 
                backgroundColor: colors.card, 
                paddingVertical: 10 
              }
            ]} 
            disabled={!onRefresh} 
            hitSlop={10}
          >
            <Ionicons 
              name="refresh" 
              size={20} 
              color={onRefresh ? colors.primary : colors.textMuted} 
            />
          </TouchableOpacity>
        </View>

        {/* البطاقة الرئيسية - الرصيد والسعر */}
        {!kbShown && (
          <View style={[
            styles.balanceCard, 
            { 
              backgroundColor: colors.card, 
              padding: 20 
            }, 
            cardShadow(resolved)
          ]}>
            <View style={styles.balanceHeader}>
              <Text style={[
                styles.balanceLabel, 
                { 
                  color: colors.textMuted, 
                  fontSize: 14 
                }
              ]}>
                {t("token.balance")}
              </Text>
              <View style={[
                styles.balanceBadge, 
                { 
                  backgroundColor: "#14F19922" 
                }
              ]}>
                <Text style={[
                  styles.balanceBadgeText, 
                  { 
                    color: "#14F199", 
                    fontSize: 14 
                  }
                ]}>
                  {symbol}
                </Text>
              </View>
            </View>
            
            {/* الرصيد */}
            <Text style={[
              styles.balanceAmount, 
              { 
                color: colors.text, 
                fontSize: 32,
                marginVertical: 8 
              }
            ]}>
              {Number(balance || "0").toFixed(6)}
            </Text>
            
            {/* السعر - تصميم مكبر وواضح */}
            <View style={styles.priceContainer}>
              {priceNow == null ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <View style={styles.priceDisplay}>
                  <Text style={[
                    styles.priceText, 
                    { 
                      color: colors.text, 
                      fontSize: 24 
                    }
                  ]}>
                    ${Number(priceNow).toFixed(6)}
                  </Text>
                  <View style={[
                    styles.priceChangeBadge, 
                    { 
                      backgroundColor: isPricePositive ? "#22c55e20" : "#ef444420" 
                    }
                  ]}>
                    <Text style={[
                      styles.priceChangeText, 
                      { 
                        color: isPricePositive ? "#22c55e" : "#ef4444" 
                      }
                    ]}>
                      {isPricePositive ? "+" : ""}{priceChange.toFixed(4)}%
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* رسوم الشبكة */}
            {!!networkFee && (
              <View style={styles.feeContainer}>
                <Ionicons name="flash-outline" size={14} color="#f59e0b" />
                <Text style={[
                  styles.feeText, 
                  { 
                    color: "#f59e0b", 
                    fontSize: 13 
                  }
                ]}>
                  {t("token.fee")}: {networkFee}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* أزرار سريعة - إرسال واستلام */}
        {!kbShown && (
          <View style={styles.quickRow}>
            <TouchableOpacity 
              style={[
                styles.action, 
                { 
                  borderColor: colors.border + "66", 
                  backgroundColor: colors.card 
                }
              ]} 
              onPress={() => setSendOpen(true)}
            >
              <Ionicons name="arrow-up-outline" size={24} color={colors.primary} />
              <Text style={[
                styles.actionText, 
                { 
                  color: colors.text 
                }
              ]}>
                {rtl ? "إرسال" : "Send"}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.action, 
                { 
                  borderColor: colors.border + "66", 
                  backgroundColor: colors.card 
                }
              ]} 
              onPress={() => setRecvOpen(true)}
            >
              <Ionicons name="arrow-down-outline" size={24} color={colors.primary} />
              <Text style={[
                styles.actionText, 
                { 
                  color: colors.text 
                }
              ]}>
                {rtl ? "استلام" : "Receive"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* نافذة الاستلام */}
        <Modal 
          visible={recvOpen} 
          transparent 
          animationType="slide" 
          onRequestClose={() => setRecvOpen(false)}
        >
          <View style={styles.sheetWrap}>
            <View style={[
              styles.sheet, 
              { 
                backgroundColor: colors.card 
              }
            ]}>
              <View style={styles.sheetHead}>
                <Text style={[
                  styles.sheetTitle, 
                  { 
                    color: colors.text 
                  }
                ]}>
                  {rtl ? `استلام ${symbol}` : `Receive ${symbol}`}
                </Text>
                <TouchableOpacity onPress={() => setRecvOpen(false)}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              
              <View ref={qrRef} style={[
                styles.qrCard, 
                { 
                  backgroundColor: "#ffffff" 
                }
              ]}>
                <QRCode value={address || "-"} size={180} />
              </View>
              
              <Text style={[
                styles.addr, 
                { 
                  color: colors.text 
                }
              ]} 
              numberOfLines={2}
              >
                {address || "-"}
              </Text>
              
              <View style={styles.sheetRow}>
                <TouchableOpacity 
                  onPress={async () => { 
                    await Clipboard.setStringAsync(address || ""); 
                    showToast(rtl ? "نُسخ العنوان" : "Address copied"); 
                  }} 
                  style={[
                    styles.sheetBtn, 
                    { 
                      borderColor: colors.border 
                    }
                  ]}
                >
                  <Ionicons name="copy-outline" size={18} color={colors.text} />
                  <Text style={[
                    styles.sheetBtnText, 
                    { 
                      color: colors.text 
                    }
                  ]}>
                    {rtl ? "نسخ" : "Copy"}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  onPress={shareAddressOrQr} 
                  style={[
                    styles.sheetBtn, 
                    { 
                      borderColor: colors.border 
                    }
                  ]}
                >
                  <Ionicons name="share-outline" size={18} color={colors.text} />
                  <Text style={[
                    styles.sheetBtnText, 
                    { 
                      color: colors.text 
                    }
                  ]}>
                    {rtl ? "مشاركة" : "Share"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* نافذة الإرسال */}
        <Modal 
          visible={sendOpen} 
          animationType="slide" 
          transparent={false} 
          presentationStyle="fullScreen" 
          statusBarTranslucent 
          onRequestClose={() => setSendOpen(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"} 
            style={{ flex: 1, backgroundColor: colors.bg }} 
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0} 
          >
            <View style={{
              paddingTop: 48, 
              paddingHorizontal: 16, 
              paddingBottom: 12, 
              flexDirection: "row", 
              alignItems: "center", 
              justifyContent: "space-between", 
              backgroundColor: colors.bg 
            }}>
              <Text style={{ 
                color: colors.text, 
                fontWeight: "900", 
                fontSize: 20 
              }}>
                {rtl ? `إرسال ${symbol}` : `Send ${symbol}`}
              </Text>
              <TouchableOpacity onPress={() => setSendOpen(false)}>
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              keyboardShouldPersistTaps="handled" 
              contentContainerStyle={{ 
                paddingHorizontal: 16, 
                paddingBottom: 28 
              }}
            >
              {/* العنوان */}
              <Text style={[
                styles.inputLabel, 
                { 
                  color: colors.text 
                }
              ]}>
                {rtl ? "العنوان" : "Address"}
              </Text>
              <View style={styles.recipientRow}>
                <TextInput
                  style={[
                    styles.input, 
                    { 
                      borderColor: colors.border, 
                      backgroundColor: colors.card, 
                      color: colors.text, 
                      textAlign: rtl ? "right" : "left", 
                      minHeight: 60, 
                      fontSize: 17, 
                      flex: 1, 
                      paddingEnd: rtl ? 14 : 0, 
                      paddingStart: rtl ? 0 : 14,
                    }
                  ]}
                  placeholder={rtl ? "أدخل العنوان..." : "Enter address..."}
                  placeholderTextColor={colors.textMuted}
                  value={recipient}
                  onChangeText={onRecipientChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
                <TouchableOpacity 
                  onPress={openScanner} 
                  style={[
                    styles.scanBtn, 
                    { 
                      backgroundColor: colors.primary, 
                      height: 60, 
                      minWidth: 50, 
                      paddingHorizontal: 10 
                    }
                  ]}
                >
                  <Ionicons name="qr-code-outline" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={async () => { 
                    const txt = await Clipboard.getStringAsync(); 
                    if (txt) onRecipientChange(txt); 
                  }} 
                  style={[
                    styles.scanBtn, 
                    { 
                      backgroundColor: colors.primary + "22", 
                      height: 60, 
                      minWidth: 50, 
                      paddingHorizontal: 10 
                    }
                  ]}
                >
                  <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {/* المبلغ */}
              <View style={{ marginTop: 16 }}>
                <View style={styles.amountHeader}>
                  <Text style={[
                    styles.inputLabel, 
                    { 
                      color: colors.text 
                    }
                  ]}>
                    {rtl ? "المبلغ" : "Amount"} ({symbol})
                  </Text>
                  <TouchableOpacity onPress={onSendAll} style={styles.sendAllBtn}>
                    <Text style={[
                      styles.sendAllText, 
                      { 
                        color: colors.primary 
                      }
                    ]}>
                      {rtl ? "إرسال الكل" : "Send all"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[
                    styles.input, 
                    { 
                      borderColor: colors.border, 
                      backgroundColor: colors.card, 
                      color: colors.text, 
                      textAlign: rtl ? "right" : "left", 
                      minHeight: 60, 
                      fontSize: 20 
                    }
                  ]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  value={amount}
                  onChangeText={onAmountChange}
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.hintRow}>
                  <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
                  <Text style={[
                    styles.hintText, 
                    { 
                      color: colors.textMuted 
                    }
                  ]}>
                    {usdPrice == null ? 
                      (rtl ? "≈ لا يوجد سعر متاح الآن" : "≈ no price available")
                      : `≈ $${(((usdPrice || 0) * (parseFloat(amount||"0")||0))).toFixed(2)}  (${(amount||"0")} ${symbol} × $${(usdPrice||0).toFixed(4)})`
                    }
                  </Text>
                </View>
              </View>

              {/* الرقم السري */}
              <View style={{ marginTop: 16 }}>
                <Text style={[
                  styles.inputLabel, 
                  { 
                    color: colors.text 
                  }
                ]}>
                  {rtl ? "الرقم السري" : "PIN"}
                </Text>
                <TouchableOpacity 
                  activeOpacity={0.9} 
                  onPress={() => pinInputRef.current?.focus()} 
                  style={[
                    styles.pinBox, 
                    { 
                      borderColor: colors.border, 
                      backgroundColor: colors.card, 
                      height: 56 
                    }
                  ]}
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View 
                      key={i} 
                      style={[
                        styles.pinDot, 
                        i < pin.length ? styles.pinDotFilled : styles.pinDotEmpty, 
                        { 
                          backgroundColor: i < pin.length ? colors.text : "transparent", 
                          borderColor: colors.border 
                        }
                      ]} 
                    />
                  ))}
                </TouchableOpacity>
                <TextInput 
                  ref={pinInputRef} 
                  value={pin} 
                  onChangeText={(t) => onPinDigits(t)} 
                  keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"} 
                  maxLength={6} 
                  textContentType="oneTimeCode" 
                  caretHidden 
                  style={styles.hiddenInput} 
                />
              </View>

              {/* زر الإرسال */}
              <TouchableOpacity 
                onPress={handleSend} 
                disabled={sending} 
                style={[
                  styles.fabSend, 
                  { 
                    marginTop: 22, 
                    height: 60, 
                    borderRadius: 16, 
                    opacity: sending ? 0.85 : 1, 
                    backgroundColor: colors.primary 
                  }
                ]}
              >
                <Ionicons name="send-outline" size={20} color="#fff" />
                <Text style={styles.fabSendText}>
                  {sending ? 
                    (rtl ? "جاري الإرسال..." : "Sending...") : 
                    (rtl ? "إرسال" : "Send")
                  }
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>

        {/* الماسح الضوئي - النسخة المحسنة */}
        <Modal
          visible={scanOpen}
          animationType="slide"
          onRequestClose={() => setScanOpen(false)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <View style={[
              styles.scanHeader,
              { flexDirection: rtl ? "row-reverse" : "row" }
            ]}>
              <Text style={styles.scanTitle}>
                {rtl ? "امسح رمز QR" : "Scan QR"}
              </Text>
              <TouchableOpacity onPress={() => setScanOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScannerBody
              rtl={rtl}
              permission={permission}
              requestPermission={requestPermission}
              facing={facing}
              torchOn={torchOn}
              setTorchOn={setTorchOn}
              setFacing={setFacing}
              onScan={(data) => {
                const cleaned = normalizeRecipientFromQr(data);
                if (cleaned) onRecipientChange(cleaned);
                setScanOpen(false);
              }}
            />
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

/* ============ مكون المسح الضوئي المنفصل ============ */
function ScannerBody(props: {
  rtl: boolean;
  permission: { granted?: boolean; canAskAgain?: boolean } | null;
  requestPermission: () => Promise<{ granted: boolean }>;
  facing: "back" | "front";
  torchOn: boolean;
  setTorchOn: (v: boolean) => void;
  setFacing: (v: "back" | "front") => void;
  onScan: (data: string) => void;
}) {
  const {
    rtl, permission, requestPermission,
    facing, torchOn, setTorchOn, setFacing, onScan
  } = props;

  const granted = !!permission?.granted;
  const canAskAgain = permission?.canAskAgain !== false;

  const [asking, setAsking] = React.useState(false);
  const scanLock = React.useRef(false);

  // ✅ اطلب الإذن داخل المودال مباشرة (بدون ما يعلّق زر QR)
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!granted && canAskAgain && !asking) {
        setAsking(true);
        try {
          await requestPermission();
        } finally {
          if (mounted) setAsking(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [granted, canAskAgain]);

  if (!permission) {
    return (
      <View style={styles.permissionDenied}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.permissionText}>
          {rtl ? "جاري التحقق من صلاحيات الكاميرا..." : "Checking camera permissions..."}
        </Text>
      </View>
    );
  }

  if (!granted) {
    return (
      <View style={styles.permissionDenied}>
        <Ionicons name="camera-off-outline" size={64} color="#fff" />
        <Text style={styles.permissionText}>
          {rtl ? "لا يوجد إذن للكاميرا" : "No camera permission"}
        </Text>

        {asking && <ActivityIndicator color="#fff" style={{ marginTop: 14 }} />}

        {canAskAgain && !asking && (
          <TouchableOpacity
            onPress={() => requestPermission()}
            style={{
              marginTop: 16,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: "#2F7CF6",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {rtl ? "السماح بالكاميرا" : "Allow Camera"}
            </Text>
          </TouchableOpacity>
        )}

        {!canAskAgain && (
          <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 10, textAlign: "center" }}>
            {rtl ? "فعّل إذن الكاميرا من إعدادات الجهاز ثم ارجع للتطبيق." : "Enable camera permission from Settings, then come back."}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        facing={facing}
        torch={torchOn ? "on" : "off"}
        // ✅ لا تزيد types حتى لا يثقل
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          // ✅ يمنع المسح المتكرر
          if (scanLock.current) return;
          scanLock.current = true;

          try {
            onScan(data || "");
          } finally {
            setTimeout(() => { scanLock.current = false; }, 800);
          }
        }}
      />

      {/* أزرار التحكم في الكاميرا */}
      <View style={{
        position: "absolute",
        bottom: 18,
        left: 16,
        right: 16,
        flexDirection: "row",
        gap: 10
      }}>
        <TouchableOpacity
          onPress={() => setTorchOn(!torchOn)}
          style={{
            flex: 1,
            backgroundColor: "rgba(255,255,255,0.12)",
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8
          }}
        >
          <Ionicons name={torchOn ? "flash" : "flash-outline"} size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800" }}>
            {rtl ? (torchOn ? "الفلاش: تشغيل" : "الفلاش: إيقاف") : (torchOn ? "Flash: On" : "Flash: Off")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFacing(facing === "back" ? "front" : "back")}
          style={{
            flex: 1,
            backgroundColor: "rgba(255,255,255,0.12)",
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8
          }}
        >
          <Ionicons name="camera-reverse-outline" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800" }}>
            {rtl ? "تبديل الكاميرا" : "Flip Camera"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function normalizeRecipientFromQr(input: string) {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";

  // ethereum:0x... / solana:... / tron:...
  const parts = trimmed.split(":");
  const last = parts.length > 1 ? parts[parts.length - 1] : trimmed;

  // remove query params
  const noQuery = last.split("?")[0];
  return noQuery.trim();
}

/* ============ الأنماط ============ */
const styles = StyleSheet.create({
  header: { 
    paddingHorizontal: 16, 
    alignItems: "center", 
    justifyContent: "space-between", 
    flexDirection: "row", 
    borderBottomWidth: 1 
  },
  headBtn: { 
    paddingHorizontal: 12, 
    borderRadius: 12, 
    alignItems: "center", 
    justifyContent: "center" 
  },
  titleContainer: { 
    alignItems: "center", 
    flex: 1, 
    marginHorizontal: 8 
  },
  title: { 
    fontWeight: "800", 
    marginBottom: 2 
  },
  subtitle: { 
    fontWeight: "600", 
    opacity: 0.7 
  },

  balanceCard: { 
    borderRadius: 16, 
    marginHorizontal: 14, 
    marginTop: 12, 
    marginBottom: 14, 
    alignItems: "center" 
  },
  balanceHeader: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    width: "100%", 
    marginBottom: 4, 
    paddingHorizontal: 4 
  },
  balanceLabel: { 
    fontWeight: "600" 
  },
  balanceBadge: { 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 12 
  },
  balanceBadgeText: { 
    fontWeight: "800" 
  },
  balanceAmount: { 
    fontWeight: "800" 
  },
  
  priceContainer: {
    alignItems: "center",
    marginTop: 8
  },
  priceDisplay: {
    alignItems: "center",
    gap: 8
  },
  priceText: {
    fontWeight: "900",
  },
  priceChangeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8
  },
  priceChangeText: {
    fontWeight: "800",
    fontSize: 12
  },

  feeContainer: { 
    flexDirection: "row", 
    alignItems: "center", 
    marginTop: 12 
  },
  feeText: { 
    fontWeight: "700", 
    marginLeft: 4 
  },

  quickRow: { 
    flexDirection: "row", 
    gap: 10, 
    marginHorizontal: 16, 
    marginTop: 18, 
    marginBottom: 16 
  },
  action: { 
    flex: 1, 
    alignItems: "center", 
    paddingVertical: 16, 
    borderRadius: 14, 
    borderWidth: 1, 
    flexDirection: "row", 
    justifyContent: "center", 
    gap: 8 
  },
  actionText: { 
    fontWeight: "800", 
    fontSize: 16 
  },

  inputLabel: { 
    fontWeight: "700", 
    marginTop: 6, 
    marginBottom: 6 
  },
  recipientRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8 
  },
  input: { 
    borderWidth: 1, 
    borderRadius: 12, 
    paddingHorizontal: 14, 
    fontWeight: "600", 
    paddingVertical: 10 
  },
  scanBtn: { 
    paddingHorizontal: 12, 
    borderRadius: 12, 
    alignItems: "center", 
    justifyContent: "center", 
    minWidth: 52 
  },

  amountHeader: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center" 
  },
  sendAllBtn: { 
    paddingHorizontal: 10, 
    paddingVertical: 6 
  },
  sendAllText: { 
    fontSize: 13, 
    fontWeight: "800" 
  },
  hintRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 6, 
    marginTop: 6 
  },
  hintText: { 
    fontWeight: "600" 
  },

  pinBox: { 
    borderWidth: 1, 
    borderRadius: 14, 
    paddingHorizontal: 16, 
    alignItems: "center", 
    justifyContent: "space-between", 
    flexDirection: "row" 
  },
  pinDot: { 
    width: 12, 
    height: 12, 
    borderRadius: 6, 
    borderWidth: 2 
  },
  pinDotFilled: { },
  pinDotEmpty: { 
    backgroundColor: "transparent" 
  },
  hiddenInput: { 
    position: "absolute", 
    opacity: 0, 
    height: 0, 
    width: 0 
  },

  sheetWrap: { 
    flex: 1, 
    backgroundColor: "rgba(0,0,0,0.4)", 
    justifyContent: "flex-end" 
  },
  sheet: { 
    borderTopLeftRadius: 16, 
    borderTopRightRadius: 16, 
    padding: 16, 
    maxHeight: "90%" 
  },
  sheetHead: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    marginBottom: 6 
  },
  sheetTitle: { 
    fontWeight: "900", 
    fontSize: 18 
  },
  qrCard: { 
    padding: 12, 
    borderRadius: 14, 
    marginTop: 8, 
    marginBottom: 10, 
    alignSelf: "center" 
  },
  addr: { 
    textAlign: "center", 
    fontWeight: "700", 
    marginBottom: 10 
  },
  sheetRow: { 
    flexDirection: "row", 
    gap: 10 
  },
  sheetBtn: { 
    flex: 1, 
    paddingVertical: 12, 
    alignItems: "center", 
    borderRadius: 12, 
    borderWidth: 1, 
    flexDirection: "row", 
    justifyContent: "center", 
    gap: 6 
  },
  sheetBtnText: { 
    fontWeight: "800" 
  },

  scanHeader: { 
    paddingTop: 48, 
    paddingHorizontal: 16, 
    paddingBottom: 12, 
    alignItems: "center", 
    justifyContent: "space-between", 
    backgroundColor: "#000" 
  },
  scanTitle: { 
    color: "#fff", 
    fontWeight: "800", 
    fontSize: 18 
  },
  closeBtn: { 
    padding: 4 
  },
  permissionDenied: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center" 
  },
  permissionText: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "700", 
    marginTop: 10 
  },

  fabSend: { 
    borderRadius: 14, 
    paddingVertical: 14, 
    alignItems: "center", 
    justifyContent: "center", 
    flexDirection: "row", 
    gap: 10 
  },
  fabSendText: { 
    color: "#fff", 
    fontWeight: "900", 
    fontSize: 18 
  },
});