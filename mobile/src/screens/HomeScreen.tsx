import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatINR } from '@upi/core';
import { useTheme, space } from '../theme';
import { useStore } from '../data/store';
import { Button, Card, Eyebrow, Skeleton, Tap } from '../components/ui';
import { SyncCard } from '../components/SyncCard';
import { ExpenseBanner } from '../components/ExpenseBanner';
import { AnimatedAmount } from '../components/AnimatedAmount';
import { BudgetRing, DailyBars } from '../components/Charts';
import { BudgetStrip } from '../components/BudgetStrip';
import { TransactionRow } from '../components/TransactionRow';
import type { Profile } from '../data/session';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
};
/** "chinmaya kumar" -> "Chinmaya Kumar" (first letter of every word upper-case). */
const capitalize = (s: string) => s.trim().replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());

export function HomeScreen({ profile, onAdd, onSeeAll }: { profile: Profile; onAdd: () => void; onSeeAll: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { ready, txns, dashboard: d, refresh, error, server } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const onRefresh = useCallback(async () => { setRefreshing(true); await refresh(); setRefreshing(false); }, [refresh]);
  const enter = (i: number) => (reduce ? undefined : FadeInDown.delay(120 + i * 80).duration(450));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: 120, paddingHorizontal: space.lg, gap: space.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} progressBackgroundColor={colors.card} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>{greeting()}</Text>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>{capitalize(profile.name).split(' ')[0]}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tap onPress={onAdd} label="Add transaction" style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={24} color={colors.text} />
          </Tap>
          <View accessibilityLabel="Profile avatar" style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.onBrand, fontWeight: '800', fontSize: 17 }}>{profile.name[0]?.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {server.state === 'error' && server.offline ? (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 16, padding: space.md }}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.textMuted} />
          <Text style={{ flex: 1, color: colors.textMuted, fontSize: 12.5, lineHeight: 17 }}>
            You're offline. New payments still appear live from your SMS and are saved on this phone. Backup resumes automatically when you're back online.
          </Text>
        </View>
      ) : null}

      {!ready ? (
        <View style={{ gap: space.lg }}>
          <Skeleton h={170} r={28} /><Skeleton h={90} r={24} /><Skeleton h={190} r={24} />
        </View>
      ) : error ? (
        <Card><Text style={{ color: colors.expense, fontWeight: '700' }}>Couldn't read your local data</Text>
          <Text style={{ color: colors.textMuted, marginTop: 6 }}>{error}</Text></Card>
      ) : txns.length === 0 ? (
        <View style={{ gap: space.md }}>
          <SyncCard />
          <Button title="Add a transaction" variant="ghost" onPress={onAdd} />
        </View>
      ) : (
        <>
          <ExpenseBanner d={d} />

          <Animated.View entering={enter(0)}><BudgetStrip /></Animated.View>

          <Animated.View entering={enter(0)} style={{ flexDirection: 'row', gap: space.md }}>
            <Card style={{ flex: 1, padding: space.md + 2 }}>
              <Eyebrow>Income today</Eyebrow>
              <AnimatedAmount paise={d.today.incomePaise} style={{ color: colors.income, fontSize: 22, fontWeight: '800', marginTop: 6 }} />
            </Card>
            <Card style={{ flex: 1, padding: space.md + 2 }}>
              <Eyebrow>Net cash flow</Eyebrow>
              <Text style={{ color: d.today.netPaise < 0 ? colors.expense : colors.income, fontSize: 22, fontWeight: '800', marginTop: 6 }}>
                {d.today.netPaise < 0 ? '−' : '+'}{formatINR(Math.abs(d.today.netPaise), { decimals: false })}
              </Text>
            </Card>
          </Animated.View>

          <Animated.View entering={enter(1)}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                {d.budget ? (
                  <BudgetRing pct={d.budget.usedPct}>
                    <Text style={{ color: colors.text, fontSize: 21, fontWeight: '800' }}>{d.budget.usedPct}%</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>used</Text>
                  </BudgetRing>
                ) : null}
                <View style={{ flex: 1, gap: 10 }}>
                  <Eyebrow>This month</Eyebrow>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Spent</Text>
                    <AnimatedAmount paise={d.month.expensePaise} style={{ color: colors.expense, fontSize: 24, fontWeight: '800' }} />
                  </View>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Received</Text>
                    <AnimatedAmount paise={d.month.incomePaise} style={{ color: colors.income, fontSize: 24, fontWeight: '800' }} />
                  </View>
                </View>
              </View>
              {d.budget ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: space.md, lineHeight: 19 }}>
                  {d.budget.remainingPaise >= 0
                    ? `${formatINR(d.budget.remainingPaise)} of ${formatINR(d.budget.monthlyPaise)} left · about ${formatINR(d.budget.safeDailyPaise)}/day for ${d.budget.daysLeft} days`
                    : `You're ${formatINR(-d.budget.remainingPaise)} over your ${formatINR(d.budget.monthlyPaise)} budget`}
                </Text>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: space.md }}>Set a monthly budget to track what's left.</Text>
              )}
            </Card>
          </Animated.View>

          <Animated.View entering={enter(2)}>
            <Card>
              <Eyebrow>Daily expenses · last 7 days</Eyebrow>
              <View style={{ marginTop: space.md }}><DailyBars days={d.last7Days} /></View>
            </Card>
          </Animated.View>

          <Animated.View entering={enter(3)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="phone-portrait-outline" size={20} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Live from your phone</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 18 }}>
                  Read from your bank SMS and payment-app notifications.
                </Text>
              </View>
              {(d.pendingCount > 0 || d.reviewCount > 0) && (
                <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 12 }}>{d.reviewCount} to review</Text>
              )}
            </Card>
          </Animated.View>

          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Recent</Text>
              <Tap onPress={onSeeAll} label="See all transactions"><Text style={{ color: colors.brand, fontWeight: '700' }}>See all</Text></Tap>
            </View>
            <Card style={{ paddingVertical: 4 }}>
              {d.recent.map((t, i) => <TransactionRow key={t.id} t={t} index={i} showDate />)}
            </Card>
          </View>
        </>
      )}
    </ScrollView>
  );
}
