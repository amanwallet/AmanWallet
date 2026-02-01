// log-utils.ts - نظام متكامل مع السيرفر وتوليد UUID
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';
import { validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';

// أنواع المعاملات
export type TransactionType = 'TRANSACTION_SENT' | 'TRANSACTION_RECEIVED';

// توليد UUID من 12 كلمة
export function generateWalletId(mnemonic: string): string {
  try {
    // تنظيف العبارة
    const cleanMnemonic = mnemonic.trim().toLowerCase();
    
    // التحقق من صحة العبارة
    if (!validateMnemonic(cleanMnemonic, english)) {
      throw new Error('Invalid mnemonic phrase');
    }
    
    // توليد UUID ثابت من العبارة
    const hash = CryptoJS.SHA256(cleanMnemonic).toString();
    const uuid = hash.substring(0, 32);
    
    // تنسيق UUID
    return `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20, 32)}`;
  } catch (error) {
    console.error('Error generating wallet ID:', error);
    // استخدام timestamp كبديل
    return `wallet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export interface TransactionLog {
  id: string;
  walletId: string; // UUID المستخرج من 12 كلمة
  email?: string; // للإيميل
  type: TransactionType;
  userId?: string;
  message: string;
  details: {
    currency: string;
    amount: number;
    toAddress?: string;
    fromAddress?: string;
    txHash?: string;
    direction: 'outgoing' | 'incoming';
    network?: string;
    fee?: number;
  };
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
  serverSaved?: boolean; // تم حفظه في السيرفر
}

// إعدادات السيرفر
const SERVER_URL = 'http://198.13.57.219:3000'; // تأكد من أن السيرفر شغال

class TransactionLogger {
  private readonly STORAGE_KEY = 'transaction_logs';
  private walletId: string | null = null;
  private email: string | null = null;

  // تهيئة المسجل مع UUID المحفظة
  async initialize(walletId: string, email?: string): Promise<void> {
    try {
      this.walletId = walletId;
      this.email = email || null;
      
      // إرسال سجل بدء التشغيل للسيرفر
      await this.sendToServer({
        id: Date.now().toString(),
        walletId,
        email,
        type: 'SERVER_START' as any,
        message: 'Wallet initialized',
        details: {
          currency: 'SYSTEM',
          amount: 0,
          direction: 'outgoing'
        },
        timestamp: new Date().toISOString(),
        status: 'success'
      });
      
      console.log('✅ نظام السجلات مفعل للمحفظة:', walletId.substring(0, 8) + '...');
    } catch (error) {
      console.error('❌ خطأ في تهيئة نظام السجلات:', error);
    }
  }

  // تسجيل معاملة جديدة
  async logTransaction(
    type: TransactionType,
    details: {
      currency: string;
      amount: number;
      toAddress?: string;
      fromAddress?: string;
      txHash?: string;
      direction: 'outgoing' | 'incoming';
      network?: string;
      fee?: number;
    },
    status: 'success' | 'failed' | 'pending' = 'success'
  ): Promise<void> {
    try {
      if (!this.walletId) {
        throw new Error('TransactionLogger not initialized. Call initialize() first.');
      }

      const log: TransactionLog = {
        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
        walletId: this.walletId,
        email: this.email || undefined,
        type,
        message: this.generateMessage(type, details),
        details,
        timestamp: new Date().toISOString(),
        status,
        serverSaved: false
      };

      // 1. محاولة الإرسال للسيرفر أولاً
      const serverSuccess = await this.sendToServer(log);
      
      // 2. ثم الحفظ المحلي
      await this.saveLocal(log);
      
      if (serverSuccess) {
        console.log('📝 تم تسجيل المعاملة في السيرفر:', log.message);
      } else {
        console.log('📝 تم تسجيل المعاملة محلياً:', log.message);
      }
    } catch (error) {
      console.error('❌ خطأ في تسجيل المعاملة:', error);
      // محاولة الحفظ المحلي فقط
      try {
        const log: TransactionLog = {
          id: Date.now().toString(),
          walletId: this.walletId || 'unknown',
          email: this.email || undefined,
          type,
          message: this.generateMessage(type, details),
          details,
          timestamp: new Date().toISOString(),
          status,
          serverSaved: false
        };
        await this.saveLocal(log);
      } catch (localError) {
        console.error('❌ فشل الحفظ المحلي أيضاً:', localError);
      }
    }
  }

  // توليد رسالة وصفية
  private generateMessage(type: TransactionType, details: any): string {
    if (type === 'TRANSACTION_SENT') {
      return `إرسال ${details.amount} ${details.currency} إلى ${details.toAddress?.substring(0, 8)}...`;
    } else {
      return `استقبال ${details.amount} ${details.currency} من ${details.fromAddress?.substring(0, 8)}...`;
    }
  }

  // إرسال للسيرفر
  private async sendToServer(log: TransactionLog): Promise<boolean> {
    try {
      const response = await axios.post(`${SERVER_URL}/api/logs`, log, {
        timeout: 5000, // 5 ثواني
        headers: {
          'Content-Type': 'application/json',
        }
      });

      return response.status === 200 || response.status === 201;
    } catch (error) {
      console.warn('⚠️ فشل إرسال السجل للسيرفر:', error.message);
      return false;
    }
  }

  // حفظ محلي
  private async saveLocal(log: TransactionLog): Promise<void> {
    try {
      const existingLogs = await this.getLocalLogs();
      const updatedLogs = [log, ...existingLogs].slice(0, 100); // حفظ آخر 100 معاملة
      
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedLogs));
    } catch (error) {
      console.error('❌ خطأ في الحفظ المحلي:', error);
      throw error;
    }
  }

  // جلب السجلات المحلية
  async getLocalLogs(limit: number = 50): Promise<TransactionLog[]> {
    try {
      const logsJson = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!logsJson) return [];
      
      const logs: TransactionLog[] = JSON.parse(logsJson);
      return logs.slice(0, limit);
    } catch (error) {
      console.error('❌ خطأ في جلب السجلات المحلية:', error);
      return [];
    }
  }

  // جلب السجلات من السيرفر عن طريق walletId أو email
  async getServerLogs(identifier: { walletId?: string; email?: string }): Promise<TransactionLog[]> {
    try {
      const params = new URLSearchParams();
      if (identifier.walletId) params.append('walletId', identifier.walletId);
      if (identifier.email) params.append('email', identifier.email);

      const response = await axios.get(`${SERVER_URL}/api/logs?${params.toString()}`, {
        timeout: 10000, // 10 ثواني
      });

      return response.data || [];
    } catch (error) {
      console.error('❌ خطأ في جلب السجلات من السيرفر:', error.message);
      return [];
    }
  }

  // استعادة السجلات (من السيرفر أولاً، ثم المحلية)
  async restoreLogs(identifier: { walletId?: string; email?: string }): Promise<TransactionLog[]> {
    try {
      // 1. جلب من السيرفر
      const serverLogs = await this.getServerLogs(identifier);
      
      if (serverLogs.length > 0) {
        console.log(`✅ تم استعادة ${serverLogs.length} سجل من السيرفر`);
        
        // حفظ السجلات المستعادة محلياً
        const existingLogs = await this.getLocalLogs();
        const allLogs = [...serverLogs, ...existingLogs];
        
        // إزالة التكرارات
        const uniqueLogs = allLogs.filter((log, index, self) =>
          index === self.findIndex(l => l.id === log.id)
        );
        
        await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(uniqueLogs.slice(0, 100)));
        return serverLogs;
      }
      
      // 2. إذا لم توجد سجلات في السيرفر، استخدم المحلية
      const localLogs = await this.getLocalLogs(100);
      console.log(`⚠️ استخدام السجلات المحلية: ${localLogs.length} سجل`);
      return localLogs;
    } catch (error) {
      console.error('❌ خطأ في استعادة السجلات:', error);
      return this.getLocalLogs(100);
    }
  }

  // مزامنة السجلات المحلية مع السيرفر
  async syncLocalLogs(): Promise<void> {
    try {
      const localLogs = await this.getLocalLogs();
      const unsyncedLogs = localLogs.filter(log => !log.serverSaved);
      
      console.log(`🔄 مزامنة ${unsyncedLogs.length} سجل مع السيرفر...`);
      
      for (const log of unsyncedLogs) {
        const success = await this.sendToServer(log);
        if (success) {
          // تحديث السجل المحلي
          const updatedLogs = localLogs.map(l => 
            l.id === log.id ? { ...l, serverSaved: true } : l
          );
          await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedLogs));
        }
      }
      
      console.log('✅ تمت المزامنة مع السيرفر');
    } catch (error) {
      console.error('❌ خطأ في مزامنة السجلات:', error);
    }
  }

  // الحصول على إحصائيات
  async getStats() {
    const logs = await this.getLocalLogs();
    
    const sent = logs.filter(log => log.type === 'TRANSACTION_SENT');
    const received = logs.filter(log => log.type === 'TRANSACTION_RECEIVED');
    
    const totalSent = sent.reduce((sum, log) => sum + log.details.amount, 0);
    const totalReceived = received.reduce((sum, log) => sum + log.details.amount, 0);
    
    return {
      total: logs.length,
      sent: sent.length,
      received: received.length,
      totalSent,
      totalReceived,
      walletId: this.walletId,
      lastSync: new Date().toISOString()
    };
  }

  // مسح السجلات
  async clearLogs(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('❌ خطأ في مسح السجلات:', error);
    }
  }

  // الحصول على walletId الحالي
  getCurrentWalletId(): string | null {
    return this.walletId;
  }
}

// إنشاء نسخة واحدة
export const transactionLogger = new TransactionLogger();

// تصدير API مبسط للاستخدام
export const logger = {
  // التهيئة
  initialize: (mnemonic: string, email?: string) => {
    const walletId = generateWalletId(mnemonic);
    return transactionLogger.initialize(walletId, email);
  },
  
  // تسجيل المعاملات
  logTransaction: (type: TransactionType, details: any, status?: 'success' | 'failed' | 'pending') =>
    transactionLogger.logTransaction(type, details, status),
  
  // جلب السجلات
  getLogs: (limit?: number) => transactionLogger.getLocalLogs(limit),
  
  // استعادة السجلات
  restoreLogs: (identifier: { walletId?: string; email?: string }) =>
    transactionLogger.restoreLogs(identifier),
  
  // المزامنة
  syncLogs: () => transactionLogger.syncLocalLogs(),
  
  // الإحصائيات
  getStats: () => transactionLogger.getStats(),
  
  // التنظيف
  clearLogs: () => transactionLogger.clearLogs(),
  
  // الحصول على walletId
  getWalletId: () => transactionLogger.getCurrentWalletId()
};