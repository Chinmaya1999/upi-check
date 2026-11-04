import React, { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatINR, type Transaction } from '@upi/core';
import { useTheme, space, radius } from '../theme';
import { useStore } from '../data/store';
import { Card, Tap } from '../components/ui';
import { TransactionRow } from '../components/TransactionRow';

type Filter = 'all' | 'debit' | 'credit' | 'upi' | 'bank_transfer' | 'pending' | 'review';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'debit', label: 'Debit' }, { id: 'credit', label: 'Credit' },
  { id: 'upi', label: 'UPI' }, { id: 'bank_transfer', label: 'Bank transfer' }, { id: 'pending', label: 'Pending' }, { id: 'review', label: 'Needs review' },
];

const match = (t: Transaction, f: Filter) =>
  f === 'all' ? true : f === 'debit' || f === 'credit' ? t.direction === f : f === 'pending' ? t.status === 'pending'
  : f === 'review' ? t.needsReview : t.channel === f;

export function TransactionsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { txns, ready } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txns
      .filter((t) => match(t, filter))
      // merchant OR transaction reference
      .filter((t) => !needle || t.merchant.toLowerCase().includes(needle) || (t.reference ?? '').includes(needle) || t.narration.toLowerCase().includes(needle))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [txns, filter, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.md }}>
      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>Transactions</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, height: 48 }}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={q} onChangeText={setQ} placeholder="Search merchant or reference" placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search transactions" style={{ flex: 1, color: colors.text, fontSize: 15 }} autoCorrect={false}
          />
          {!!q && <Tap onPress={() => setQ('')} label="Clear search"><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Tap>}
        </View>
      </View>
      <View style={{ height: 52 }}>
        <FlatList
          horizontal showsHorizontalScrollIndicator={false} data={FILTERS} keyExtractor={(f) => f.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: 8, alignItems: 'center' }}
          renderItem={({ item }) => {
            const on = filter === item.id;
            return (
              <Tap onPress={() => setFilter(item.id)} label={`Filter ${item.label}`}
                style={{ paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: on ? colors.chipOn : colors.card }}>
                <Text style={{ color: on ? colors.onChip : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{item.label}</Text>
              </Tap>
            );
          }}
        />
      </View>
      <FlatList
        data={rows} keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 120 }}
        ListHeaderComponent={<Text style={{ color: colors.textMuted, fontSize: 12.5, marginBottom: 6 }}>{rows.length} transaction{rows.length === 1 ? '' : 's'}</Text>}
        ListEmptyComponent={ready ? (
          <Card style={{ alignItems: 'center', marginTop: space.lg }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{txns.length ? 'Nothing matches' : 'No transactions yet'}</Text>
            <Text style={{ color: colors.textMuted, marginTop: 4 }}>{txns.length ? 'Try a different filter or search.' : 'Add one from the Home tab.'}</Text>
          </Card>
        ) : undefined}
        renderItem={({ item, index }) => (
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <TransactionRow t={item} index={index} showDate />
          </View>
        )}
      />
    </View>
  );
}
