import React, { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatINR, summarizeDay, summarizeDayByApp, type PaymentApp } from '@upi/core';
import { useTheme, space } from '../theme';
import { useStore } from '../data/store';
import { Card, Tap } from '../components/ui';
import { SyncCard } from '../components/SyncCard';

const APP_LABEL: Record<PaymentApp, string> = { gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', bhim: 'BHIM', bank_app: 'Bank app', unknown: 'Bank / other' };

const dayLabel = (k: string) => new Date(`${k}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Per-day debit / credit, split by the payment app that made the payment. */
export function DailyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { txns } = useStore();
  const [open, setOpen] = useState<string | null>(null);

  const days = useMemo(() => {
    const keys = [...new Set(txns.map((t) => t.dayKey))].sort().reverse();
    return keys.map((k) => ({ key: k, sum: summarizeDay(txns, k), apps: summarizeDayByApp(txns, k) }));
  }, [txns]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={days}
      keyExtractor={(d) => d.key}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: 120, paddingHorizontal: space.lg, gap: space.md }}
      ListHeaderComponent={
        <View style={{ gap: space.md, marginBottom: space.sm }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>Daily</Text>
          <SyncCard />
        </View>
      }
      ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>No transactions yet. Tap “Allow SMS & sync”.</Text>}
      renderItem={({ item: d }) => (
        <Card style={{ gap: 10 }}>
          <Tap onPress={() => setOpen(open === d.key ? null : d.key)} label={`Day ${dayLabel(d.key)}`}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{dayLabel(d.key)}</Text>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Debit</Text>
                <Text style={{ color: colors.expense, fontSize: 18, fontWeight: '800' }}>{formatINR(d.sum.grossExpensePaise)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Credit</Text>
                <Text style={{ color: colors.income, fontSize: 18, fontWeight: '800' }}>{formatINR(d.sum.incomePaise + d.sum.refundPaise)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Txns</Text>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{d.sum.count}</Text>
              </View>
            </View>
          </Tap>
          {open === d.key && d.apps.map((a) => (
            <View key={a.app} style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ flex: 1.2, color: colors.text, fontWeight: '600' }}>{APP_LABEL[a.app]}</Text>
              <Text style={{ flex: 1, color: colors.expense, fontWeight: '700' }}>−{formatINR(a.debitPaise)}</Text>
              <Text style={{ flex: 1, color: colors.income, fontWeight: '700' }}>+{formatINR(a.creditPaise)}</Text>
            </View>
          ))}
        </Card>
      )}
    />
  );
}
