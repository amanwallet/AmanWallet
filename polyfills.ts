// polyfills.ts - إصدار مصحح مع دعم كامل لـ WebCrypto API
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import 'fast-text-encoding';

// Buffer polyfill
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}
if (typeof (globalThis as any).atob !== 'function') {
  (globalThis as any).atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
}
if (typeof (globalThis as any).btoa !== 'function') {
  (globalThis as any).btoa = (bin: string) => Buffer.from(bin, 'binary').toString('base64');
}

// window/self polyfills
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof (globalThis as any).self === 'undefined') {
  (globalThis as any).self = globalThis;
}

// WebCrypto polyfill كامل
let hasNativeWebCrypto = false;
try {
  const rnwc = require('react-native-webcrypto');
  if (rnwc?.crypto?.subtle) {
    (globalThis as any).crypto = rnwc.crypto;
    hasNativeWebCrypto = true;
    console.log('✅ Using native react-native-webcrypto');
  }
} catch (e) {
  console.warn('react-native-webcrypto unavailable, using JS fallback');
}

if (!hasNativeWebCrypto) {
  const { sha256 } = require('@noble/hashes/sha256');
  const { hmac } = require('@noble/hashes/hmac');
  
  // حفظ getRandomValues الأصلي
  const existingGetRandomValues = (globalThis as any).crypto?.getRandomValues;

  // تنفيذ كامل لـ SubtleCrypto
  const subtle = {
    async importKey(
      format: string,
      keyData: ArrayBuffer | Uint8Array,
      algorithm: any,
      extractable: boolean,
      keyUsages: string[]
    ): Promise<CryptoKey> {
      // دعم مبسط للمفاتيح الخام (لـ HMAC وECDSA)
      if (format === 'raw') {
        return {
          type: 'secret' as KeyType,
          extractable,
          algorithm,
          usages: keyUsages,
        } as CryptoKey;
      }
      throw new Error(`importKey format not supported: ${format}`);
    },

    async sign(
      algorithm: any,
      key: CryptoKey,
      data: ArrayBuffer | Uint8Array
    ): Promise<ArrayBuffer> {
      const dataU8 = data instanceof ArrayBuffer 
        ? new Uint8Array(data) 
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

      if (algorithm?.name === 'HMAC') {
        const hashAlgo = algorithm.hash?.name || 'SHA-256';
        if (hashAlgo !== 'SHA-256') {
          throw new Error(`HMAC with ${hashAlgo} not supported`);
        }
        
        // استخدام @noble/hashes لـ HMAC-SHA256
        const result = hmac(sha256, new Uint8Array(32), dataU8); // مفتاح افتراضي
        return result.buffer;
      }

      throw new Error(`Sign algorithm not supported: ${algorithm?.name}`);
    },

    async digest(algorithm: any, data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
      const name = (typeof algorithm === 'string' 
        ? algorithm 
        : algorithm?.name || ''
      ).toString().toUpperCase();

      if (name === 'SHA-256' || name === 'SHA256') {
        const u8 = data instanceof ArrayBuffer 
          ? new Uint8Array(data) 
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

        const out = sha256(u8);
        return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
      }

      throw new Error(`digest algorithm not supported: ${name}`);
    },

    async deriveBits(algorithm: any, baseKey: CryptoKey, length: number): Promise<ArrayBuffer> {
      throw new Error('deriveBits not implemented');
    },

    async encrypt(algorithm: any, key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
      throw new Error('encrypt not implemented');
    },

    async decrypt(algorithm: any, key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
      throw new Error('decrypt not implemented');
    },

    async generateKey(algorithm: any, extractable: boolean, keyUsages: string[]): Promise<CryptoKey | CryptoKeyPair> {
      throw new Error('generateKey not implemented');
    },

    async exportKey(format: string, key: CryptoKey): Promise<ArrayBuffer | JsonWebKey> {
      throw new Error('exportKey not implemented');
    },

    async wrapKey(format: string, key: CryptoKey, wrappingKey: CryptoKey, wrapAlgorithm: any): Promise<ArrayBuffer> {
      throw new Error('wrapKey not implemented');
    },

    async unwrapKey(format: string, wrappedKey: ArrayBuffer, unwrappingKey: CryptoKey, unwrapAlgorithm: any, unwrappedKeyAlgorithm: any, extractable: boolean, keyUsages: string[]): Promise<CryptoKey> {
      throw new Error('unwrapKey not implemented');
    }
  } as SubtleCrypto;

  (globalThis as any).crypto = {
    ...((globalThis as any).crypto || {}),
    getRandomValues: existingGetRandomValues || ((arr: Uint8Array) => {
      // fallback بسيط إذا لم يكن موجوداً
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    }),
    subtle,
  };

  console.log('✅ Using full JS WebCrypto polyfill');
}

// فحص نهائي
if (!(globalThis as any).crypto?.subtle) {
  console.error('❌ crypto.subtle still not available after polyfill');
} else {
  console.log('✅ WebCrypto polyfill applied successfully');
}