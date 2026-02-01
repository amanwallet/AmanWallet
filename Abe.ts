// Abe.ts — مفتاح مركزي واحد وروابط مبنية منه - مُحدّث بعد إزالة SEI و XLM

// ====== المفتاح المركزي (غيره من هنا فقط لاحقًا) ======
export const ANKR_KEY =
  "c0957e2db83eb4412d4d6087773b7f943fdd1a40c545bd9aa6014658b117e745";

// ====== قواعد عناوين أنكر ======
const ANKR_BASES = {
  multichain: "https://rpc.ankr.com/multichain",
  stellar: "https://rpc.ankr.com/premium-http/stellar_horizon",
  tron: "https://rpc.ankr.com/premium-http/tron",
  xrpl_ws: "wss://rpc.ankr.com/xrp_mainnet/ws",
};

// ====== روابط مبنية من نفس المفتاح ======
export const ANKR_RPC = {
  multichain: `${ANKR_BASES.multichain}/${ANKR_KEY}`,
  stellar: `${ANKR_BASES.stellar}/${ANKR_KEY}`,
  tron: `${ANKR_BASES.tron}/${ANKR_KEY}`,
  evmKey: ANKR_KEY, // يبقى موجود للاستيراد المباشر لو احتجته
};

// ====== قالب EVM (نفس المفتاح، الشبكة تتغير) ======
const EVM_TEMPLATE = `https://rpc.ankr.com/{network}/${ANKR_KEY}`;

// ====== خرائط معرفات شبكات EVM ======
const EVM_ID_MAP: Record<string, string> = {
  "1": "eth",
  eth: "eth",
  "137": "polygon",
  polygon: "polygon",
  "56": "bsc",
  bsc: "bsc",
  "42161": "arbitrum",
  arbitrum: "arbitrum",
  "8453": "base",
  base: "base",
  // تم إزالة SEI و SUI من الدعم
  sui: "sui",
};

function buildEvmUrl(idOrName: string): string | undefined {
  const token = EVM_ID_MAP[idOrName] || EVM_ID_MAP[String(idOrName)];
  if (!token) return undefined;
  return EVM_TEMPLATE.replace("{network}", token);
}

// ====== مزوّدات غير EVM ======
const NON_EVM = {
  tronRest: "https://api.trongrid.io",
  solanaRpc: "https://api.mainnet-beta.solana.com",

  // Blockbook base (يدعم /api/v2/...)
  btcBlockbook: "https://btc1.trezor.io",
  btcBlockstream: "https://blockstream.info/api",

  xrplWss: `${ANKR_BASES.xrpl_ws}/${ANKR_KEY}`,
  // تم إزالة stellarHorizon من الدعم
};

// ====== واجهة الاستخدام ======
export const Abe = {
  getRpc(identifier: number | string): string {
    const key = String(identifier).toLowerCase();

    // === خاص بـ ANKR
    if (key === "multichain" || key === "ankr" || key === "ankr_multi")
      return ANKR_RPC.multichain;
    // تم إزالة دعم Stellar و XRPL
    if (key === "xrpl" || key === "xrp") return NON_EVM.xrplWss;

    // === BTC aliases
    if (key === "btc_blockbook" || key === "blockbook" || key === "bitcoin_blockbook")
      return NON_EVM.btcBlockbook;
    if (key === "btc_blockstream" || key === "blockstream" || key === "bitcoin_blockstream")
      return NON_EVM.btcBlockstream;

    // === Non-EVM
    if (key === "tron") return NON_EVM.tronRest;
    if (key === "solana") return NON_EVM.solanaRpc;
    if (key === "btc" || key === "bitcoin") return NON_EVM.btcBlockbook;

    // === EVM عبر القالب
    const evm = buildEvmUrl(key) || buildEvmUrl(String(identifier));
    if (evm) return evm;

    throw new Error(`Abe: لا يوجد RPC مضبوط لـ "${identifier}".`);
  },

  // Helpers اختيارية
  tronRest(): string {
    return NON_EVM.tronRest;
  },
  solanaRpc(): string {
    return NON_EVM.solanaRpc;
  },
  btcBlockbook(): string {
    return NON_EVM.btcBlockbook;
  },
  btcBlockstream(): string {
    return NON_EVM.btcBlockstream;
  },
  btcApi(): string {
    return NON_EVM.btcBlockbook;
  },
  xrplWss(): string {
    return NON_EVM.xrplWss;
  },
  // تم إزالة stellarHorizon helper
};

// تصدير مباشر إن احتجته
export const { multichain, tron } = ANKR_RPC;

export default Abe;