// USDT_TRX.tsx — إضافة حاجز رصيد TRX ≥ 25 قبل أي إرسال + الحفاظ على التقدير المسبق
import React, { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import TokenTemplate from "./TokenTemplate";
import {
  tronTrc20BalanceOf,
  normalizeTronAddress,
  sendTrc20Auto,
  privateKeyToTronAddress,
  tronGetTrxBalance,
  SUN_PER_TRX
} from "../tronHub";

const SYMBOL = "USDT";
const KEY_ADDR = "tron_address";
const KEY_PIN  = "wallet_pin";
const KEY_PK   = "tron_privateKey";

// عقد USDT (TRC20) الرسمي على TRON
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// 🔐 الحد الأدنى الإلزامي لرصيد TRX قبل إرسال USDT
const MIN_TRX_REQUIRED_FOR_USDT = 25;

// ===== أدوات تحويل مبالغ USDT (6 منازل عشرية) =====
function toUnits(amountStr: string): bigint {
  if (!amountStr || amountStr.trim() === "") return 0n;
  const s = amountStr.trim();
  const [intPart, fracPart = ""] = s.split(".");
  const integer = BigInt(intPart || "0");
  const fraction = fracPart.padEnd(6, "0").slice(0, 6);
  const fractional = BigInt(fraction || "0");
  return integer * 1_000_000n + fractional;
}
function fromUnits(units: bigint): string {
  if (units === 0n) return "0.000000";
  const integer = units / 1_000_000n;
  const fractional = units % 1_000_000n;
  const fractionalStr = fractional.toString().padStart(6, "0");
  return `${integer}.${fractionalStr}`;
}
const fmt = (n: number, d = 6) => n.toFixed(d);

// ===== رسائل أخطاء مفهومة =====
function humanizeTronError(err: any): string {
  const raw = (err?.message || err?.toString?.() || "").toUpperCase();
  if (raw.includes("OUT_OF_ENERGY") || raw.includes("NOT ENOUGH ENERGY")) {
    return "❌ الطاقة (Energy) غير كافية. الرجاء شحن TRX أو زيادة الطاقة عبر Staking.";
  }
  if (raw.includes("BANDWIDTH")) {
    return "❌ عرض الحزمة (Bandwidth) غير كافٍ. الرجاء توفير TRX أكثر أو الانتظار حتى يتجدد.";
  }
  if (raw.includes("FEE LIMIT") || raw.includes("INSUFFICIENT_FEE")) {
    return "❌ حدّ الرسوم غير كافٍ. الرجاء توفير TRX أكثر لتغطية رسوم الشبكة.";
  }
  if (raw.includes("ILLEGAL ADDRESS") || raw.includes("INVALID ADDRESS")) {
    return "❌ عنوان المستلم غير صالح. الرجاء التحقق من العنوان (يبدأ بـ T...).";
  }
  return err?.message || "فشل الإرسال. تعذر إتمام المعاملة.";
}

// ===== تقدير تلقائي قبل البث =====
async function preflightEstimateTrc20Transfer(
  contractAddr: string,
  fromAddrBase58: string,
  toAddrBase58: string,
  amountUnits: bigint
): Promise<{
  ok: boolean;
  reason?: string;
  neededSun?: number;
  trxBalanceSun?: number;
  details?: {
    energyUsed: number;
    energyAvailable: number;
    energyPriceSun: number;
    bandwidthBytes: number;
    freeBandwidth: number;
    bandwidthPriceSun: number;
  };
}> {
  try {
    // @ts-ignore
    const tronWeb = (global as any)?.tronWeb || (global as any)?.TRONWEB || (global as any)?.tronweb;
    if (!tronWeb) {
      return {
        ok: false,
        reason: "تعذر إجراء تقدير تلقائي للرسوم. الرجاء التأكد من توفر TRX كافٍ قبل الإرسال.",
      };
    }

    const params = await tronWeb.trx.getChainParameters();
    const getEnergyFee =
      params?.find((p: any) => p?.key === "getEnergyFee")?.value ?? 0; // SUN لكل Energy
    const bandwidthPriceSun = 1; // SUN/byte عند نفاد المجاني

    const res = await tronWeb.trx.getAccountResources(fromAddrBase58);
    const energyLimit = Number(res?.EnergyLimit || 0);
    const energyUsed  = Number(res?.EnergyUsed  || 0);
    const energyAvailable = Math.max(0, energyLimit - energyUsed);

    const freeNetLimit = Number(res?.freeNetLimit || 0);
    const freeNetUsed  = Number(res?.freeNetUsed  || 0);
    const netLimit     = Number(res?.NetLimit     || 0);
    const netUsed      = Number(res?.NetUsed      || 0);
    const freeBandwidth = Math.max(0, (freeNetLimit - freeNetUsed) + (netLimit - netUsed));

    const abiSelector = "transfer(address,uint256)";
    const toHexAddr = tronWeb.address.toHex(toAddrBase58);
    const amountHex = tronWeb.toHex(amountUnits.toString());

    const trigger = await tronWeb.transactionBuilder.triggerSmartContract(
      tronWeb.address.toHex(contractAddr),
      abiSelector,
      { feeLimit: 100_000_000 }, // 100 TRX حد أقصى للتقدير فقط
      [
        { type: "address", value: toHexAddr },
        { type: "uint256", value: amountHex },
      ],
      tronWeb.address.toHex(fromAddrBase58),
    );

    const estEnergy = Number(trigger?.energy_used ?? trigger?.constant_result?.energy_used ?? 0);
    const rawHex = trigger?.transaction?.raw_data_hex || "";
    const txBytes = Math.ceil((rawHex.length || 0) / 2);

    const missingEnergy = Math.max(0, estEnergy - energyAvailable);
    const energyCostSun = missingEnergy * Number(getEnergyFee || 0);

    const missingBandwidth = Math.max(0, txBytes - freeBandwidth);
    const bandwidthCostSun = missingBandwidth * bandwidthPriceSun;

    const totalNeededSun = energyCostSun + bandwidthCostSun;

    const balSunBN = await tronGetTrxBalance(fromAddrBase58);
    const balSun = Number(balSunBN);

    const ok = balSun >= totalNeededSun;

    return {
      ok,
      reason: ok
        ? undefined
        : `لا يوجد TRX كافٍ لتغطية الرسوم المتوقعة.\n` +
          `المطلوب ≈ ${(totalNeededSun / SUN_PER_TRX).toFixed(6)} TRX، المتاح: ${(balSun / SUN_PER_TRX).toFixed(6)} TRX.`,
      neededSun: totalNeededSun,
      trxBalanceSun: balSun,
      details: {
        energyUsed: estEnergy,
        energyAvailable,
        energyPriceSun: Number(getEnergyFee || 0),
        bandwidthBytes: txBytes,
        freeBandwidth,
        bandwidthPriceSun,
      },
    };
  } catch {
    return {
      ok: false,
      reason: "تعذر إجراء التقدير المسبق للرسوم (محاكاة الشبكة فشلت). الرجاء التأكد من وجود TRX كافٍ ثم أعد المحاولة.",
    };
  }
}

export default function USDT_TRON({ navigation }: any) {
  const [balance, setBalance] = useState("0.000000");
  const [address, setAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try {
      setLoading(true);
      const addr = (await SecureStore.getItemAsync(KEY_ADDR)) || "";
      setAddress(addr);

      if (!addr) {
        setBalance("0.000000");
        return;
      }

      // رصيد USDT
      const normalizedAddr = normalizeTronAddress(addr);
      const usdtBalance = await tronTrc20BalanceOf(USDT_CONTRACT, normalizedAddr);
      setBalance(fromUnits(usdtBalance));
    } catch (e: any) {
      console.error("❌ فشل تحديث رصيد USDT:", e?.message || e);
      setBalance("0.000000");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      if (!address) return;
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(address);
      alert("📋 تم نسخ العنوان");
    } catch (e: any) {
      console.error("❌ فشل النسخ:", e.message);
    }
  };

  const getPkEnsured = async (): Promise<string> => {
    const pk = await SecureStore.getItemAsync(KEY_PK);
    const addr = await SecureStore.getItemAsync(KEY_ADDR);
    if (!pk || !addr) throw new Error("لا يوجد مفتاح/عنوان TRON محفوظ");
    const expected = privateKeyToTronAddress(pk);
    if (expected !== addr) throw new Error("المفتاح الخاص لا يطابق العنوان المخزن");
    return pk;
  };

  const verifyPin = async (): Promise<boolean> => {
    const savedPin = await SecureStore.getItemAsync(KEY_PIN);
    return (savedPin || "") === pin;
  };

  const onSendWithResult = async () => {
    try {
      if (!await verifyPin()) throw new Error("الرقم السري غير صحيح");
      const pk = await getPkEnsured();

      const toAddress = recipient.trim();
      const sendAmount = amount.trim();
      if (!toAddress) throw new Error("الرجاء إدخال عنوان المستلم");
      if (!sendAmount || sendAmount === "0") throw new Error("الرجاء إدخال المبلغ");

      const units = toUnits(sendAmount);
      if (units <= 0n) throw new Error("الرجاء إدخال مبلغ صحيح");

      // تحقق من رصيد USDT
      const currentBalance = toUnits(balance);
      if (units > currentBalance) throw new Error(`الرصيد غير كافٍ. لديك ${balance} USDT`);

      setSending(true);

      const from = normalizeTronAddress(address);
      const to   = normalizeTronAddress(toAddress);

      // ✅ حاجز فوري: يمنع الإرسال إذا كان رصيد TRX أقل من 25 TRX
      const trxBalSun = await tronGetTrxBalance(from);
      const trxBal = Number(trxBalSun) / SUN_PER_TRX;
      if (trxBal < MIN_TRX_REQUIRED_FOR_USDT) {
        throw new Error(
          `❌ لا يمكن الإرسال: يجب توفر ${MIN_TRX_REQUIRED_FOR_USDT} TRX على الأقل لتغطية رسوم الشبكة.\n` +
          `رصيدك الحالي: ${trxBal.toFixed(6)} TRX. الرجاء شحن TRX ثم أعد المحاولة.`
        );
      }

      // ✅ بعد الحاجز، نكمل التقدير المسبق لمنع أي حرق غير متوقع
      const pre = await preflightEstimateTrc20Transfer(USDT_CONTRACT, from, to, units);
      if (!pre.ok) {
        const extra =
          pre?.neededSun != null && pre?.trxBalanceSun != null
            ? `\nالمطلوب ≈ ${(pre.neededSun / SUN_PER_TRX).toFixed(6)} TRX — المتاح: ${(pre.trxBalanceSun / SUN_PER_TRX).toFixed(6)} TRX.`
            : "";
        throw new Error(
          (pre.reason || "TRX غير كافٍ لتغطية الرسوم المتوقعة.") +
          "\nالرجاء شحن المحفظة بـ TRX ثم أعد المحاولة." + extra
        );
      }

      // ✅ المحاكاة ناجحة: نرسل فعليًا الآن
      await sendTrc20Auto(USDT_CONTRACT, from, to, units, pk.replace(/^0x/, ""));
      alert("✅ تم إرسال USDT بنجاح!");
      setAmount(""); setPin(""); setRecipient("");
      await refresh();

    } catch (e: any) {
      const msg = humanizeTronError(e);
      console.error("❌ فشل إرسال USDT:", e);
      alert(msg);
    } finally {
      setSending(false);
    }
  };

  const handleSendAll = () => {
    if (balance && balance !== "0.000000") setAmount(balance);
  };

  return (
    <TokenTemplate
      title="TRON — USDT (TRC20)"
      symbol={SYMBOL}
      balance={balance}
      address={address}
      amountLabel="(USDT)"
      recipient={recipient}
      amount={amount}
      pin={pin}
      sending={sending}
      loading={loading}
      onBack={() => navigation.goBack?.()}
      onRefresh={refresh}
      onCopy={copy}
      onRecipientChange={setRecipient}
      onAmountChange={setAmount}
      onPinChange={setPin}
      onSendAll={handleSendAll}
      onSendWithResult={onSendWithResult}
    />
  );
}