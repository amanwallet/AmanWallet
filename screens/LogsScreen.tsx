// LogsScreen.tsx - مبسط
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// استيراد المسجل المبسط
import { logger, TransactionLog } from '../log-utils';

export default function LogsScreen() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all');

  // جلب السجلات
  const fetchLogs = async () => {
    try {
      setLoading(true);
      const transactionLogs = await logger.getLogs(100);
      setLogs(transactionLogs);
    } catch (error) {
      console.error('خطأ في جلب السجلات:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // تصفية السجلات
  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'sent') return log.type === 'TRANSACTION_SENT';
    if (filter === 'received') return log.type === 'TRANSACTION_RECEIVED';
    return true;
  });

  // عرض عنصر المعاملة
  const renderLogItem = ({ item }: { item: TransactionLog }) => (
    <TouchableOpacity
      style={styles.logItem}
      onPress={() => {
        Alert.alert(
          item.type === 'TRANSACTION_SENT' ? 'معاملة مرسلة' : 'معاملة مستلمة',
          `${item.details.amount} ${item.details.currency}\n${new Date(item.timestamp).toLocaleString('ar-SA')}`,
          [{ text: 'موافق', style: 'default' }]
        );
      }}
    >
      <View style={[
        styles.iconContainer,
        { backgroundColor: item.type === 'TRANSACTION_SENT' ? '#FEE2E2' : '#D1FAE5' }
      ]}>
        <Ionicons 
          name={item.type === 'TRANSACTION_SENT' ? 'arrow-up' : 'arrow-down'} 
          size={20} 
          color={item.type === 'TRANSACTION_SENT' ? '#DC2626' : '#059669'} 
        />
      </View>
      
      <View style={styles.logContent}>
        <Text style={styles.logType}>
          {item.type === 'TRANSACTION_SENT' ? 'إرسال' : 'استقبال'}
        </Text>
        <Text style={styles.logAmount}>
          {item.details.amount} {item.details.currency}
        </Text>
        <Text style={styles.logTime}>
          {new Date(item.timestamp).toLocaleTimeString('ar-SA')}
        </Text>
      </View>
      
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>جاري تحميل السجلات...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* عنوان الشاشة */}
      <View style={styles.header}>
        <Text style={styles.title}>سجلات المعاملات</Text>
        <Text style={styles.subtitle}>آخر 100 معاملة</Text>
      </View>

      {/* أزرار التصفية */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            الكل ({logs.length})
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'sent' && styles.filterBtnActive]}
          onPress={() => setFilter('sent')}
        >
          <Text style={[styles.filterText, filter === 'sent' && styles.filterTextActive]}>
            مرسلة ({logs.filter(l => l.type === 'TRANSACTION_SENT').length})
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'received' && styles.filterBtnActive]}
          onPress={() => setFilter('received')}
        >
          <Text style={[styles.filterText, filter === 'received' && styles.filterTextActive]}>
            مستلمة ({logs.filter(l => l.type === 'TRANSACTION_RECEIVED').length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* قائمة المعاملات */}
      <FlatList
        data={filteredLogs}
        renderItem={renderLogItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="swap-horizontal" size={60} color="#6B7280" />
            <Text style={styles.emptyText}>لا توجد معاملات</Text>
            <Text style={styles.emptySubtext}>سيظهر هنا أي إرسال أو استقبال تقوم به</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1a2f',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1a2f',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
  },
  header: {
    padding: 20,
    backgroundColor: '#1a2a3a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3a4a',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
  },
  filterBar: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#1a2a3a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3a4a',
  },
  filterBtn: {
    flex: 1,
    padding: 10,
    marginHorizontal: 5,
    backgroundColor: '#2a3a4a',
    borderRadius: 8,
    alignItems: 'center',
  },
  filterBtnActive: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#1a2a3a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3a4a',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  logContent: {
    flex: 1,
  },
  logType: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logAmount: {
    color: '#D1D5DB',
    fontSize: 14,
    marginTop: 2,
  },
  logTime: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 18,
    marginTop: 20,
  },
  emptySubtext: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 5,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});