// index.ts — حمّل الـ polyfills أولاً قبل أي شيء آخر
import './polyfills';

import { registerRootComponent } from 'expo';
import App from './App';

// للتشخيص الاختياري — يطبع OK إذا كان WebCrypto جاهز
// (globalThis as any).crypto?.subtle
//   ? console.log('✅ WebCrypto ready: crypto.subtle متاح')
//   : console.warn('⚠️ crypto.subtle غير متاح!');

// Expo: يسجّل App كنقطة البداية (Android/iOS)
registerRootComponent(App);
