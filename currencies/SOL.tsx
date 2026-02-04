// Solana Mainnet — returns signature as txHash
import React, { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import bs58 from "bs58";
import nacl from "tweetnacl";
import TokenTemplate from "./TokenTemplate";
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { solanaRpc, EXPLORER_TX } from "../providers";

// ✅ استيراد دالة verifyPin
import { verifyPin } from "../screens/pinAuth";

const RPC_URL = solanaRpc();
const MIN_FEE_SOL = 0.000005;

const solAddressFromSecret = (solSecretB58: string): string => {
  const raw = bs58.decode(solSecretB58);
  if (raw.length === 64) return bs58.encode(raw.slice(32));
  if (raw.length === 32) return bs58.encode(nacl.sign.keyPair.fromSeed(raw).publicKey);
  throw new Error("Invalid Solana secret length");
};

export default function SOL({ navigation }: any) {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0.000000");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [secretB58, setSecretB58] = useState<string | null>(null);

  const connection = useMemo(() => new Connection(RPC_URL, "confirmed"), []);
  useEffect(() => { init(); }, []);

  const init = async () => {
    const secret = await SecureStore.getItemAsync("sol_secret");
    if (!secret) { Alert.alert("Solana", "الرجاء إنشاء مفاتيح سولانا أولًا."); return; }
    try {
      const addr = solAddressFromSecret(secret);
      setSecretB58(secret);
      setAddress(addr);
      await refresh(addr);
    } catch (e: any) {
      Alert.alert("خطأ", e?.message || "مفتاح سولانا غير صالح.");
    }
  };

  const refresh = async (addrOverride?: string) => {
    try {
      const addr = addrOverride || address;
      if (!addr) return;
      const lamports = await connection.getBalance(new PublicKey(addr));
      setBalance((lamports / LAMPORTS_PER_SOL).toFixed(6));
    } catch { setBalance("0.000000"); }
  };

  const copy = async () => { if (!address) return; await Clipboard.setStringAsync(address); Alert.alert("تم النسخ", "تم نسخ عنوان Solana"); };
  const sendAll = () => { const bal = parseFloat(balance || "0"); const max = Math.max(bal - MIN_FEE_SOL, 0); setAmount(max.toFixed(6)); };

  const onSendWithResult = async () => {
    // ✅ التعديل: استخدام verifyPin بدلاً من المقارنة المباشرة
    const ok = await verifyPin(pin);
    if (!ok) throw new Error("الرقم السري غير صحيح.");
    
    if (!secretB58) throw new Error("لا يوجد مفتاح سولانا محفوظ.");
    const secretRaw = bs58.decode(secretB58);
    const sender = Keypair.fromSecretKey(secretRaw);
    const fromPubkey = sender.publicKey;
    const toPubkey = new PublicKey(recipient.trim());
    const lamports = Math.floor(Number(amount) * LAMPORTS_PER_SOL);

    setSending(true);
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: fromPubkey })
        .add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));
      tx.sign(sender);
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      setAmount(""); setRecipient(""); setPin("");
      await refresh();
      return { txHash: sig, explorerUrl: EXPLORER_TX.solana(sig) };
    } finally { setSending(false); }
  };

  return (
    <TokenTemplate
      title="Solana"
      symbol="SOL"
      network="Solana Mainnet"
      balance={balance}
      address={address}
      networkFee={`~${MIN_FEE_SOL.toFixed(6)} SOL`}
      badgeColor="#14F195"
      badgeBg="#14F19522"
      recipient={recipient}
      amount={amount}
      pin={pin}
      sending={sending}
      onBack={() => navigation.goBack()}
      onRefresh={() => refresh()}
      onCopy={copy}
      onRecipientChange={setRecipient}
      onAmountChange={setAmount}
      onPinChange={setPin}
      onSendAll={sendAll}
      onSendWithResult={onSendWithResult}
    />
  );
}