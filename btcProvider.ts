// btcProvider.ts — FINAL (Hermes-safe, Buffer signer fix)
import * as bitcoin from 'bitcoinjs-lib';
import Abe from "./Abe";

import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import { Buffer } from 'buffer';
import { PRICE_PROVIDERS } from "./providers";
bitcoin.initEccLib(ecc);
export const ECP = ECPairFactory(ecc);

export type Utxo = {
  txid: string;
  vout: number;
  value: number; // satoshis
  status?: { confirmed: boolean; block_height?: number };
};

const NET = bitcoin.networks.bitcoin;
const BS = Abe.btcBlockstream();

// ---------- helpers ----------
async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json() as Promise<T>;
}
async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}
async function postText(url: string, body: string): Promise<string> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=>'')}`);
  return r.text();
}

// ---------- API ----------
export function wifToKeyPair(wif: string): {
  keyPair: ReturnType<typeof ECP.fromWIF>;
  address: string;
} {
  const keyPair = ECP.fromWIF(wif, NET);
  const pubkeyBuf = Buffer.from(keyPair.publicKey);
  const { address } = bitcoin.payments.p2pkh({ pubkey: pubkeyBuf, network: NET });
  if (!address) throw new Error('Failed to derive P2PKH address from WIF');
  return { keyPair, address };
}

export async function getUtxos(address: string): Promise<Utxo[]> {
  return await fetchJson<Utxo[]>(`${BS}/address/${address}/utxo`);
}

export async function getPriceUSD(): Promise<number> {
  try {
    const j = await fetchJson<any>(PRICE_PROVIDERS.coingecko.btcUsd);
    const p = j?.bitcoin?.usd;
    if (p == null) throw new Error('price missing');
    return Number(p);
  } catch {
    const j = await fetchJson<any>(PRICE_PROVIDERS.coindesk.btcUsd);
    return Number(j?.bpi?.USD?.rate_float || String(j?.bpi?.USD?.rate || '0').replace(/,/g, ''));
  }
}

// حوّل ECPair إلى Signer يقبلّه bitcoinjs-lib
function toSigner(kp: ReturnType<typeof ECP.fromWIF>) {
  const pub = Buffer.from(kp.publicKey);
  return {
    publicKey: pub,
    sign: (hash: Buffer) => Buffer.from(kp.sign(hash)),
  };
}

export async function sendBTC(params: {
  wif: string;
  fromAddress: string;
  toAddress: string;
  amountSats: number;
  feeRateSatPerVb: number;
}): Promise<{ txid: string; fee: number; change?: number }> {
  const { wif, fromAddress, toAddress, amountSats, feeRateSatPerVb } = params;

  if (!amountSats || amountSats <= 0) throw new Error('Invalid amount');
  if (!/^(bc1|[13])[a-zA-Z0-9]{25,}$/i.test(toAddress)) throw new Error('Invalid recipient address');

  const { keyPair } = wifToKeyPair(wif);
  const signer = toSigner(keyPair);

  const utxos = await getUtxos(fromAddress);
  if (!utxos.length) throw new Error('No UTXOs available');

  const estVBytes = (ins: number, outs: number) => Math.ceil(ins * 148 + outs * 34 + 10);

  const psbt = new bitcoin.Psbt({ network: NET });
  let selected = 0;
  let neededFee = 0;

  for (const u of utxos) {
    if ((u?.value ?? 0) <= 0) continue;
    const rawHex = await fetchText(`${BS}/tx/${u.txid}/hex`);
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      nonWitnessUtxo: Buffer.from(rawHex, 'hex'),
    });
    selected += u.value;

    neededFee = Math.ceil(estVBytes(psbt.inputCount, 2) * Math.max(1, Math.floor(feeRateSatPerVb || 1)));
    if (selected >= amountSats + neededFee) break;
  }

  if (selected < amountSats + neededFee) throw new Error('Insufficient funds');

  psbt.addOutput({ address: toAddress, value: amountSats });

  const dust = 546;
  const change = selected - amountSats - neededFee;
  if (change >= dust) {
    psbt.addOutput({ address: fromAddress, value: change });
  } else {
    neededFee += change;
  }

  for (let i = 0; i < psbt.inputCount; i++) psbt.signInput(i, signer as any);
  psbt.finalizeAllInputs();

  const txHex = psbt.extractTransaction().toHex();
  const txid = await postText(`${BS}/tx`, txHex);

  return { txid, fee: neededFee, change: change >= dust ? change : 0 };
}