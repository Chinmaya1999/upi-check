import React, { useMemo, useState } from 'react';
import { FlatList, SectionList, Text, TextInput, View } from 'react-native';
import Animated, { FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addDays, dayKeyOf, formatINR, type Transaction } from '@upi/core';
import { weekStart } from '../data/budgets';
import { useTheme, space, radius } from '../theme';
import { useStore } from '../data/store';
import { Card, Tap, TxnShell } from '../components/ui';
import { TransactionRow } from '../components/TransactionRow';
import { BankBadge } from '../components/BankBadge';
import { TxnDetail } from '../components/TxnDetail';
import { bankOf, type Bank } from '../data/banks';

type Filter = 'all' | 'debit' | 'credit';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'debit', label: 'Debit' }, { id: 'credit', label: 'Credit' }];

const counted = (t: Transaction) => t.status === 'confirmed' && t.kind !== 'reversal' && t.kind !== 'self_transfer';
const dayTitle = (k: string) => {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const yest = new Date(Date.now() + 330 * 60_000 - 864e5).toISOString().slice(0, 10);
  if (k === today) return 'Today';
  if (k === yest) return 'Yesterday';
  return new Date(`${k}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const sum = (list: Transaction[]) => list.filter(counted).reduce((a, t) => (t.direction === 'debit' ? { ...a, d: a.d + t.amountPaise } : { ...a, c: a.c + t.amountPaise }), { d: 0, c: 0 });

type Range = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'lastmonth' | 'pick';
const RANGES: { id: Range; label: string }[] = [
  { id: 'all', label: 'All time' }, { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }, { id: 'lastmonth', label: 'Last month' }, { id: 'pick', label: 'Pick a day' },
];
function rangeBounds(r: Range, now: Date, day: string | null): { from: string; to: string } | null {
  const today = dayKeyOf(now);
  if (r === 'today') return { from: today, to: today };
  if (r === 'yesterday') { const y = addDays(today, -1); return { from: y, to: y }; }
  if (r === 'week') return { from: weekStart(today), to: today };
  if (r === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (r === 'lastmonth') { const first = `${today.slice(0, 7)}-01`; const to = addDays(first, -1); return { from: `${to.slice(0, 7)}-01`, to }; }
  if (r === 'pick' && day) return { from: day, to: day };
  return null;
}

interface BankCard { bank: Bank; list: Transaction[]; d: number; c: number; last: string }

export function TransactionsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { txns: allTxns, ready, now, removeTxn } = useStore();
  const [range, setRange] = useState<Range>('all');
  const [day, setDay] = useState<string | null>(null);
  const bounds = rangeBounds(range, now, day);
  const txns = useMemo(() => (bounds ? allTxns.filter((t) => t.dayKey >= bounds.from && t.dayKey <= bounds.to) : allTxns), [allTxns, bounds?.from, bounds?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => { const have = new Set(allTxns.map((t) => t.dayKey)); const today = dayKeyOf(now); return Array.from({ length: 45 }, (_, i) => { const k = addDays(today, -i); return { k, has: have.has(k) }; }); }, [allTxns, now]);
  const [filter, setFilter] = useState<Filter>('all');
  const [bankId, setBankId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Transaction | null>(null);

  const banks = useMemo<BankCard[]>(() => {
    const m = new Map<string, BankCard>();
    for (const t of txns) {
      const b = bankOf(t);
      const c = m.get(b.id) ?? { bank: b, list: [], d: 0, c: 0, last: '' };
      c.list.push(t); m.set(b.id, c);
    }
    return [...m.values()].map((c) => { const s = sum(c.list); return { ...c, d: s.d, c: s.c, last: c.list.reduce((a, t) => (t.occurredAt > a ? t.occurredAt : a), '') }; })
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [txns]);
  const selected = banks.find((b) => b.bank.id === bankId) ?? null;

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = txns
      .filter((t) => !selected || bankOf(t).id === selected.bank.id)
      .filter((t) => filter === 'all' || t.direction === filter)
      .filter((t) => !needle || t.merchant.toLowerCase().includes(needle) || (t.reference ?? '').includes(needle) || t.narration.toLowerCase().includes(needle) || bankOf(t).name.toLowerCase().includes(needle))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const days = new Map<string, Transaction[]>();
    for (const t of rows) (days.get(t.dayKey) ?? days.set(t.dayKey, []).get(t.dayKey)!).push(t);
    return { rows, data: [...days].map(([k, list]) => ({ key: k, title: dayTitle(k), data: list, ...sum(list) })) };
  }, [txns, selected, filter, q]);
  const tot = sum(sections.rows);

  const bankStrip = (
    <View style={{ marginHorizontal: -space.lg }}>
      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={[{ all: true } as never, ...banks]} keyExtractor={(b: BankCard | { all: true }, i) => ('all' in b ? 'all' : b.bank.id) + i}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: 12, paddingVertical: 6 }}
        renderItem={({ item, index }: { item: BankCard | { all: true }; index: number }) => {
          const isAll = 'all' in item;
          const on = isAll ? !selected : selected?.bank.id === item.bank.id;
          const c = isAll ? null : item;
          return (
            <Animated.View entering={reduce ? undefined : FadeInRight.delay(index * 70).duration(380)}>
              <Tap onPress={() => setBankId(isAll ? null : item.bank.id)} label={isAll ? 'All banks' : item.bank.name}
                style={{ width: 196, padding: 14, borderRadius: 22, gap: 10, backgroundColor: on ? (c ? c.bank.bg : colors.chipOn) : colors.card, borderWidth: on ? 0 : 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {c ? <BankBadge bank={on ? { ...c.bank, bg: 'rgba(255,255,255,0.22)' } : c.bank} size={38} /> : (
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: on ? 'rgba(255,255,255,0.2)' : colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="apps" size={19} color={on ? '#fff' : colors.text} /></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: on ? '#fff' : colors.text, fontWeight: '800', fontSize: 13.5 }}>{c ? c.bank.name.replace(/ (Payments )?Bank$/, '') : 'All banks'}</Text>
                    <Text style={{ color: on ? 'rgba(255,255,255,0.75)' : colors.textMuted, fontSize: 11.5 }}>{c ? (c.bank.last4 ? `A/c ••${c.bank.last4}` : 'Account') : `${banks.length} accounts`}</Text>
                  </View>
                </View>
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: on ? 'rgba(255,255,255,0.7)' : colors.textMuted, fontSize: 10.5, letterSpacing: 0.4 }}>DEBIT</Text>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1, color: on ? '#fff' : colors.expense, fontWeight: '800', fontSize: 14.5 }}>{formatINR(c ? c.d : sum(txns).d)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: on ? 'rgba(255,255,255,0.7)' : colors.textMuted, fontSize: 10.5, letterSpacing: 0.4 }}>CREDIT</Text>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1, color: on ? '#fff' : colors.income, fontWeight: '800', fontSize: 14.5 }}>{formatINR(c ? c.c : sum(txns).c)}</Text>
                  </View>
                </View>
                <Text style={{ color: on ? 'rgba(255,255,255,0.8)' : colors.textMuted, fontSize: 11.5, fontWeight: '600' }}>{c ? c.list.length : txns.length} transactions</Text>
              </Tap>
            </Animated.View>
          );
        }}
      />
    </View>
  );

  const header = (
    <View style={{ gap: space.md, paddingTop: insets.top + space.md, paddingBottom: space.sm, backgroundColor: colors.bg }}>
      <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>Transactions</Text>
      {banks.length > 0 && bankStrip}
      <View style={{ marginHorizontal: -space.lg }}>
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={RANGES} keyExtractor={(x) => x.id} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 8 }}
          renderItem={({ item }) => {
            const on = range === item.id;
            return (
              <Tap onPress={() => { setRange(item.id); if (item.id !== 'pick') setDay(null); }} label={`Date: ${item.label}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: on ? colors.brand : colors.card, borderWidth: on ? 0 : 1, borderColor: colors.border }}>
                {item.id === 'pick' && <Ionicons name="calendar" size={14} color={on ? colors.onBrand : colors.textMuted} />}
                <Text style={{ color: on ? colors.onBrand : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{item.id === 'pick' && day ? dayTitle(day) : item.label}</Text>
              </Tap>
            );
          }} />
        {range === 'pick' && (
          <FlatList horizontal showsHorizontalScrollIndicator={false} inverted={false} data={days} keyExtractor={(d) => d.k} style={{ marginTop: 10 }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 8 }}
            renderItem={({ item }) => {
              const on = day === item.k;
              const d = new Date(`${item.k}T12:00:00Z`);
              return (
                <Tap onPress={() => setDay(item.k)} label={`Show ${item.k}`}
                  style={{ width: 54, paddingVertical: 10, borderRadius: 16, alignItems: 'center', gap: 2, backgroundColor: on ? colors.chipOn : colors.card, opacity: item.has || on ? 1 : 0.45 }}>
                  <Text style={{ color: on ? colors.onChip : colors.textMuted, fontSize: 11, fontWeight: '600' }}>{d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}</Text>
                  <Text style={{ color: on ? colors.onChip : colors.text, fontSize: 18, fontWeight: '800' }}>{d.getUTCDate()}</Text>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: item.has ? (on ? colors.onChip : colors.brand) : 'transparent' }} />
                </Tap>
              );
            }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, height: 48 }}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search merchant, bank or reference" placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search transactions" style={{ flex: 1, color: colors.text, fontSize: 15 }} autoCorrect={false} />
        {!!q && <Tap onPress={() => setQ('')} label="Clear search"><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Tap>}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <Tap key={f.id} onPress={() => setFilter(f.id)} label={`Show ${f.label}`}
              style={{ paddingHorizontal: 18, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: on ? colors.chipOn : colors.card }}>
              <Text style={{ color: on ? colors.onChip : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{f.label}</Text>
            </Tap>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 18, padding: 14 }}>
        {[['Transactions', String(sections.rows.length), colors.text, 0.7], ['Debit', formatINR(tot.d), colors.expense, 1.2], ['Credit', formatINR(tot.c), colors.income, 1.2]].map(([k, v, col, flex]) => (
          <View key={String(k)} style={{ flex: flex as number, paddingRight: 6 }}>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11.5 }}>{k}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color: col as string, fontSize: 17, fontWeight: '800', marginTop: 2 }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={sections.data}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 130 }}
        ListHeaderComponent={header}
        ListEmptyComponent={ready ? (
          <Card style={{ alignItems: 'center', marginTop: space.lg }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{allTxns.length ? 'Nothing matches' : 'No transactions yet'}</Text>
            <Text style={{ color: colors.textMuted, marginTop: 4 }}>{allTxns.length ? 'Try a different date, bank, filter or search.' : 'Allow SMS access from the Home tab to load your bank alerts.'}</Text>
          </Card>
        ) : undefined}
        renderSectionHeader={({ section: s }) => (
          <View style={{ backgroundColor: colors.bg, paddingTop: space.md, paddingBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.text, fontWeight: '800', fontSize: 14.5 }}>{s.title}</Text>
            <Text style={{ color: colors.expense, fontWeight: '700', fontSize: 12.5 }}>−{formatINR(s.d)}</Text>
            <Text style={{ color: colors.income, fontWeight: '700', fontSize: 12.5, marginLeft: 10 }}>+{formatINR(s.c)}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <TxnShell index={index} count={section.data.length}>
            <TransactionRow t={item} index={index} onPress={setOpen} />
          </TxnShell>
        )}
      />
      <TxnDetail t={open} onClose={() => setOpen(null)} onDelete={open?.sources.length === 1 && open.sources[0] === 'manual' ? async () => { await removeTxn(open.id); setOpen(null); } : undefined} />
    </View>
  );
}
