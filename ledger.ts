// ledger.ts
// مسؤول كامل عن: تفعيل/إيقاف سجل الحركات + تسجيل وارد/صادر + ملخص + حفظ/قراءة
// ضع هذا الملف في جذر المشروع بجانب App.tsx و package.json

import * as FileSystem from "expo-file-system";

/** أنواع أساسية */
export type CurrencyCode =
  | "BTC" | "ETH" | "BNB" | "MATIC" | "SOL" | "USDT" | "USDC" | "XRP"
  | string;

export type Direction = "in" | "out";

export interface Transaction {
  id: string;                 // مُولّد تلقائياً
  currency: CurrencyCode;
  amount: number;             // قيمة موجبة
  direction: Direction;       // in = وارد, out = صادر
  timestamp: number;          // Date.now()
  from?: string;              // لمن جاء (إن كان وارد)
  to?: string;                // إلى من خرج (إن كان صادر)
  txHash?: string;
  fee?: number;
  note?: string;
}

/** حالة السجل المخزّنة */
interface LedgerState {
  enabled: boolean;           // زر السجلات (سري) في الإعدادات
  transactions: Transaction[]; 
  version: 1;
}

/** مسارات التخزين داخل جهاز المستخدم */
const DIR = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
const JSON_PATH = `${DIR}ledger_state.json`;   // تخزين بنية السجل (تشغيل + العمليات)
const TXT_PATH = `${DIR}ledger_summary.txt`;   // آخر ملخّص نصي محفوظ

/** أداة تنسيق بسيطة */
const DATE_FMT = (ms: number) =>
  new Date(ms).toISOString().replace("T", " ").replace(".000Z", "Z");
const fmt = (n: number) =>
  (Math.abs(n) >= 1 ? n.toFixed(6) : n.toPrecision(6)).replace(/\.?0+$/, "");

/** Singleton للسيطرة على السجل */
class Ledger {
  private state: LedgerState = { enabled: false, transactions: [], version: 1 };
  private loaded = false;

  /** تحميل من التخزين (مرّة واحدة تلقائياً عند أول استخدام) */
  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const exists = await FileSystem.getInfoAsync(JSON_PATH);
      if (exists.exists) {
        const data = await FileSystem.readAsStringAsync(JSON_PATH, { encoding: FileSystem.EncodingType.UTF8 });
        const parsed = JSON.parse(data) as LedgerState;
        if (parsed && parsed.version === 1 && Array.isArray(parsed.transactions)) {
          this.state = parsed;
        }
      }
    } catch (e) {
      // تجاهل الأخطاء، نبدأ بحالة افتراضية
    } finally {
      this.loaded = true;
    }
  }

  /** حفظ الحالة كاملة (تشغيل + عمليات) */
  private async persist() {
    const payload = JSON.stringify(this.state);
    await FileSystem.writeAsStringAsync(JSON_PATH, payload, { encoding: FileSystem.EncodingType.UTF8 });
  }

  /** تفعيل/إيقاف زر السجلات (يُربط بزر سري في شاشة الإعدادات) */
  async setEnabled(value: boolean) {
    await this.ensureLoaded();
    this.state.enabled = value;
    await this.persist();
  }

  /** حالة الزر */
  async isEnabled(): Promise<boolean> {
    await this.ensureLoaded();
    return this.state.enabled;
  }

  /** تفريغ جميع السجلات */
  async clear() {
    await this.ensureLoaded();
    this.state.transactions = [];
    await this.persist();
  }

  /** تسجيل حركة: وارد */
  async logIn(params: Omit<Transaction, "id" | "direction" | "timestamp"> & { amount: number; currency: CurrencyCode; note?: string }) {
    await this.ensureLoaded();
    if (!this.state.enabled) return; // إن كان الزر مُعطّل لا نسجّل
    const tx: Transaction = {
      id: generateId(),
      currency: params.currency,
      amount: Math.abs(params.amount),
      direction: "in",
      timestamp: Date.now(),
      from: params.from,
      to: params.to,
      txHash: params.txHash,
      fee: params.fee,
      note: params.note,
    };
    this.state.transactions.unshift(tx);
    await this.persist();
  }

  /** تسجيل حركة: صادر */
  async logOut(params: Omit<Transaction, "id" | "direction" | "timestamp"> & { amount: number; currency: CurrencyCode; note?: string }) {
    await this.ensureLoaded();
    if (!this.state.enabled) return;
    const tx: Transaction = {
      id: generateId(),
      currency: params.currency,
      amount: Math.abs(params.amount),
      direction: "out",
      timestamp: Date.now(),
      from: params.from,
      to: params.to,
      txHash: params.txHash,
      fee: params.fee,
      note: params.note,
    };
    this.state.transactions.unshift(tx);
    await this.persist();
  }

  /** إرجاع جميع الحركات (أحدث أولاً) */
  async getAll(): Promise<Transaction[]> {
    await this.ensureLoaded();
    return [...this.state.transactions];
  }

  /** بناء ملخص نصي (يمرَّر له أرصدة اختيارياً) */
  async buildSummary(options?: {
    balances?: Record<CurrencyCode, number>;
    title?: string;
    latest?: number; // كم سطر من أحدث الحركات (افتراضي 10)
  }): Promise<string> {
    await this.ensureLoaded();
    const { balances = {}, title = "Ledger Summary", latest = 10 } = options || {};
    const txs = [...this.state.transactions]; // هي أصلاً أحدث أولاً

    // تجميع وارد/صادر لكل عملة
    const agg: Record<CurrencyCode, { inTotal: number; outTotal: number; net: number; countIn: number; countOut: number }> = {};
    for (const t of txs) {
      const a = (agg[t.currency] ||= { inTotal: 0, outTotal: 0, net: 0, countIn: 0, countOut: 0 });
      if (t.direction === "in") {
        a.inTotal += t.amount; a.net += t.amount; a.countIn += 1;
      } else {
        a.outTotal += t.amount; a.net -= t.amount; a.countOut += 1;
      }
    }

    const header =
      `=== ${title} ===\n` +
      `Generated: ${DATE_FMT(Date.now())}\n` +
      `Logging: ${this.state.enabled ? "ON" : "OFF"}\n` +
      `Total Tx: ${txs.length}\n`;

    const balanceLines: string[] = [];
    const balanceKeys = Object.keys(balances);
    if (balanceKeys.length) {
      balanceLines.push("\n-- Balances --");
      for (const ccy of balanceKeys.sort()) balanceLines.push(`${ccy}: ${fmt(balances[ccy])}`);
    }

    const aggLines: string[] = [];
    const currencies = Object.keys(agg);
    if (currencies.length) {
      aggLines.push("\n-- Totals (by currency) --");
      for (const ccy of currencies.sort()) {
        const a = agg[ccy];
        aggLines.push(`${ccy}: IN ${fmt(a.inTotal)} (${a.countIn}) | OUT ${fmt(a.outTotal)} (${a.countOut}) | NET ${fmt(a.net)}`);
      }
    }

    const N = Math.min(latest, txs.length);
    const recentLines: string[] = [];
    if (N > 0) {
      recentLines.push(`\n-- Latest ${N} --`);
      for (let i = 0; i < N; i++) {
        const t = txs[i];
        const sign = t.direction === "in" ? "+" : "-";
        const who = t.direction === "in" ? (t.from ? `from ${t.from}` : "") : (t.to ? `to ${t.to}` : "");
        const fee = t.fee ? ` fee:${fmt(t.fee)}` : "";
        const note = t.note ? ` • ${t.note}` : "";
        recentLines.push(
          `[${DATE_FMT(t.timestamp)}] ${t.currency} ${sign}${fmt(t.amount)} ${who}${fee}${note} ${t.txHash ? "• " + t.txHash : ""}`.trim()
        );
      }
    }

    return [header, ...balanceLines, ...aggLines, ...recentLines, ""].join("\n");
  }

  /** حفظ الملخّص كنص + إرجاع المسار */
  async saveSummaryToFile(summaryText: string, filename = "ledger_summary.txt"): Promise<string> {
    const path = DIR + filename;
    await FileSystem.writeAsStringAsync(path, summaryText, { encoding: FileSystem.EncodingType.UTF8 });
    return path;
  }
}

/** مُعرّف بسيط */
function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** مثيل واحد مُصدّر للاستعمال في أي مكان */
const ledger = new Ledger();
export default ledger;

/* ===================== طريقة الربط المقترحة (ملحوظات فقط — لا تعديل إجباري) =====================

1) زر سري في الإعدادات (Settings):
   - عند الضغط المطوّل 3 ثوانٍ على عنصر معيّن، فعّل/أوقف التسجيل:
     const enabled = await ledger.isEnabled();
     await ledger.setEnabled(!enabled);

2) تسجيل وارد:
   await ledger.logIn({ currency: "BTC", amount: 0.05, from: "bc1q...", txHash: "0xabc", note: "Deposit" });

3) تسجيل صادر:
   await ledger.logOut({ currency: "USDT", amount: 100, to: "0xRecipient", fee: 0.2, note: "Transfer" });

4) إنشاء ملخص وعرضه/حفظه:
   const text = await ledger.buildSummary({
     balances: { BTC: 0.12345678, USDT: 250.5 },
     title: "My Ledger",
     latest: 15
   });
   const path = await ledger.saveSummaryToFile(text); // يرجّع المسار الكامل

5) قراءة كل العمليات (إن احتجت شاشة عرض):
   const all = await ledger.getAll();

6) تفريغ السجل:
   await ledger.clear();

=============================================================================================== */