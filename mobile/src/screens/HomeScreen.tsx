import { Avatar } from '../components/Avatar';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { contrastOn, formatINR, type Dashboard } from '@upi/core';
import { useTheme, space } from '../theme';
import { useStore } from '../data/store';
import { Button, Card, Eyebrow, Skeleton, Tap, TxnShell } from '../components/ui';
import { SyncCard } from '../components/SyncCard';
import { ExpenseBanner } from '../components/ExpenseBanner';
import { AnimatedAmount } from '../components/AnimatedAmount';
import { BudgetRing, DailyBars } from '../components/Charts';
import { BudgetStrip } from '../components/BudgetStrip';
import { Insights } from '../components/Insights';
import { TransactionRow } from '../components/TransactionRow';
import type { Profile } from '../data/session';
import { FestivalBanner, FestivalOverlay } from '../components/Festival';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
};
/** "chinmaya kumar" -> "Chinmaya Kumar" (first letter of every word upper-case). */
const capitalize = (s: string) => s.trim().replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());

export function HomeScreen({ profile, onAdd, onSeeAll }: { profile: Profile; onAdd: () => void; onSeeAll: () => void }) {
  const { colors, motion, festival } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion() || motion.enterMs === 0;
  const { ready, txns, dashboard: d, refresh, error, server } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const onRefresh = useCallback(async () => { setRefreshing(true); await refresh(); setRefreshing(false); }, [refresh]);
  const enter = (i: number) => (reduce ? undefined : FadeInDown.delay(120 + i * motion.staggerMs).duration(motion.enterMs));

  return (
    <View style={{ flex: 1 }}>
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
          <Avatar name={profile.name} size={42} />
        </View>
      </View>

      {festival ? <FestivalBanner festival={festival} /> : null}

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
        <HomeBody d={d} onSeeAll={onSeeAll} enter={enter} />
      )}
    </ScrollView>
    {festival ? <FestivalOverlay festival={festival} /> : null}
    </View>
  );
}

type EnterFn = (i: number) => ReturnType<typeof FadeInDown.delay> | undefined;
/** Staggered entrance wrapper. Declared at module level so React keeps it mounted across re-renders. */
function A({ i, enter, children }: { i: number; enter: EnterFn; children: React.ReactNode }) {
  return <Animated.View entering={enter(i)}>{children}</Animated.View>;
}

/** The Home screen below the greeting. Its *structure* depends on the active design (classic, bento, minimal, compact, focus). */
function HomeBody({ d, onSeeAll, enter }: { d: Dashboard; onSeeAll: () => void; enter: EnterFn }) {
  const { colors, design } = useTheme();
  const net = d.today.netPaise;
  const netText = `${net < 0 ? '−' : '+'}${formatINR(Math.abs(net))}`;
  const netColor = net < 0 ? colors.expense : colors.income;
  const fit = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.65 } as const;

  const incomeCard = (
    <Card style={{ flex: 1, padding: space.md + 2 }}>
      <Eyebrow>Income today</Eyebrow>
      <AnimatedAmount paise={d.today.incomePaise} style={{ color: colors.income, fontSize: 22, fontWeight: '800', marginTop: 6 }} />
    </Card>
  );
  const netCard = (
    <Card style={{ flex: 1, padding: space.md + 2 }}>
      <Eyebrow>Net cash flow</Eyebrow>
      <Text {...fit} style={{ color: netColor, fontSize: 22, fontWeight: '800', marginTop: 6 }}>{netText}</Text>
    </Card>
  );
  const budgetNote = d.budget ? (
    <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: space.md, lineHeight: 19 }}>
      {d.budget.remainingPaise >= 0
        ? `${formatINR(d.budget.remainingPaise)} of ${formatINR(d.budget.monthlyPaise)} left · about ${formatINR(d.budget.safeDailyPaise)}/day for ${d.budget.daysLeft} days`
        : `You're ${formatINR(-d.budget.remainingPaise)} over your ${formatINR(d.budget.monthlyPaise)} budget`}
    </Text>
  ) : (
    <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: space.md }}>Set a monthly budget to track what's left.</Text>
  );
  const monthCard = (
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
      {budgetNote}
    </Card>
  );
  const chartCard = (
    <Card>
      <Eyebrow>Daily expenses · last 7 days</Eyebrow>
      <View style={{ marginTop: space.md }}><DailyBars days={d.last7Days} /></View>
    </Card>
  );
  const liveCard = (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="phone-portrait-outline" size={20} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Live from your phone</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 18 }}>Read from your bank SMS and payment-app notifications.</Text>
      </View>
      {(d.pendingCount > 0 || d.reviewCount > 0) && <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 12 }}>{d.reviewCount} to review</Text>}
    </Card>
  );
  const recent = (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Recent</Text>
        <Tap onPress={onSeeAll} label="See all transactions"><Text style={{ color: colors.brand, fontWeight: '700' }}>See all</Text></Tap>
      </View>
      <View>
        {d.recent.map((t, i) => (
          <TxnShell key={t.id} index={i} count={d.recent.length}><TransactionRow t={t} index={i} showDate /></TxnShell>
        ))}
      </View>
    </View>
  );

  // ── Bento: a mosaic of tiles with different sizes; the month tile is filled with the accent colour.
  if (design.home === 'bento') {
    const on = contrastOn(colors.brand);
    return (
      <>
        <ExpenseBanner d={d} />
        <A enter={enter} i={0}><BudgetStrip /></A>
        <A enter={enter} i={0}><Insights /></A>
        <A enter={enter} i={1}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Card style={{ flex: 1.25, backgroundColor: colors.brand, justifyContent: 'space-between', minHeight: 150 }}>
              <Text style={{ color: on, opacity: 0.75, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>THIS MONTH</Text>
              <View>
                <Text style={{ color: on, opacity: 0.75, fontSize: 12 }}>Spent</Text>
                <Text {...fit} style={{ color: on, fontSize: 26, fontWeight: '800' }}>{formatINR(d.month.expensePaise)}</Text>
                <Text style={{ color: on, opacity: 0.75, fontSize: 12, marginTop: 6 }}>Received</Text>
                <Text {...fit} style={{ color: on, fontSize: 18, fontWeight: '800' }}>{formatINR(d.month.incomePaise)}</Text>
              </View>
            </Card>
            <View style={{ flex: 1, gap: space.md }}>{incomeCard}{netCard}</View>
          </View>
        </A>
        <A enter={enter} i={2}>{chartCard}</A>
        <A enter={enter} i={3}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {d.budget ? (
              <Card style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <BudgetRing pct={d.budget.usedPct} size={92}><Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{d.budget.usedPct}%</Text></BudgetRing>
                <Eyebrow>Budget</Eyebrow>
              </Card>
            ) : null}
            <Card style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
              <Ionicons name="phone-portrait-outline" size={22} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: '700' }}>Live from phone</Text>
              <Text style={{ color: d.reviewCount ? colors.warning : colors.textMuted, fontSize: 12.5 }}>{d.reviewCount ? `${d.reviewCount} to review` : 'All reviewed'}</Text>
            </Card>
          </View>
        </A>
        <A enter={enter} i={4}>{recent}</A>
      </>
    );
  }

  // ── Minimal: no boxes at all. Big type, one quiet line of numbers, a bare chart, plain rows.
  if (design.home === 'minimal') {
    const cell = (label: string, value: string, color: string) => (
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, letterSpacing: 0.6 }}>{label.toUpperCase()}</Text>
        <Text {...fit} style={{ color, fontSize: 18, fontWeight: '700', marginTop: 3 }}>{value}</Text>
      </View>
    );
    return (
      <>
        <ExpenseBanner d={d} />
        <A enter={enter} i={0}>
          <View style={{ flexDirection: 'row', gap: space.lg, paddingVertical: space.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
            {cell('Income today', formatINR(d.today.incomePaise), colors.income)}
            {cell('Net', netText, netColor)}
            {cell('This month', formatINR(d.month.expensePaise), colors.text)}
          </View>
        </A>
        <A enter={enter} i={1}><BudgetStrip /></A>
        <A enter={enter} i={1}><Insights /></A>
        <A enter={enter} i={2}>
          <View>
            <Eyebrow>Last 7 days</Eyebrow>
            <View style={{ marginTop: space.md }}><DailyBars days={d.last7Days} /></View>
          </View>
        </A>
        <A enter={enter} i={3}>{recent}</A>
      </>
    );
  }

  // ── Compact: one dense summary card instead of several, then the list.
  if (design.home === 'compact') {
    const col = (label: string, value: string, color: string, last?: boolean) => (
      <View style={{ flex: 1, paddingLeft: space.sm, borderLeftWidth: last === undefined ? 0 : 1, borderLeftColor: colors.border }}>
        <Text style={{ color: colors.textMuted, fontSize: 10.5, letterSpacing: 0.6 }}>{label}</Text>
        <Text {...fit} style={{ color, fontSize: 15, fontWeight: '800', marginTop: 2 }}>{value}</Text>
      </View>
    );
    return (
      <>
        <A enter={enter} i={0}>
          <Card>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>SPENT TODAY</Text>
            <AnimatedAmount paise={d.today.expensePaise} style={{ color: colors.text, fontSize: 36, fontWeight: '800', letterSpacing: -0.5, marginVertical: 2 }} />
            <View style={{ flexDirection: 'row', marginTop: space.md }}>
              {col('INCOME', formatINR(d.today.incomePaise), colors.income)}
              {col('NET', netText, netColor, false)}
              {col('MONTH SPENT', formatINR(d.month.expensePaise), colors.expense, false)}
              {col('MONTH IN', formatINR(d.month.incomePaise), colors.income, false)}
            </View>
          </Card>
        </A>
        <A enter={enter} i={1}><BudgetStrip /></A>
        <A enter={enter} i={1}><Insights /></A>
        <A enter={enter} i={2}>{chartCard}</A>
        <A enter={enter} i={3}>{recent}</A>
      </>
    );
  }

  // ── Focus: a single large ring in the middle of the screen.
  if (design.home === 'focus') {
    const pct = d.budget ? d.budget.usedPct : d.yesterday.expensePaise > 0 ? Math.min(100, Math.round((d.today.expensePaise / d.yesterday.expensePaise) * 100)) : 0;
    return (
      <>
        <A enter={enter} i={0}>
          <View style={{ alignItems: 'center', paddingVertical: space.lg, gap: space.md }}>
            <BudgetRing pct={pct} size={230}>
              <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>{d.today.expensePaise === 0 ? 'No spending today' : 'You spent'}</Text>
              <AnimatedAmount paise={d.today.expensePaise} style={{ color: colors.text, fontSize: 36, fontWeight: '800', letterSpacing: -1 }} />
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{d.budget ? `${d.budget.usedPct}% of monthly budget` : 'today'}</Text>
            </BudgetRing>
            {d.changeVsYesterdayPct !== null && d.changeVsYesterdayPct !== 0 ? (
              <Text style={{ color: d.changeVsYesterdayPct > 0 ? colors.expense : colors.income, fontWeight: '700' }}>
                {Math.abs(d.changeVsYesterdayPct)}% {d.changeVsYesterdayPct > 0 ? 'more' : 'less'} than yesterday
              </Text>
            ) : null}
          </View>
        </A>
        <A enter={enter} i={1}>
          <Card style={{ flexDirection: 'row' }}>
            {[['Income today', formatINR(d.today.incomePaise), colors.income], ['Net today', netText, netColor], ['This month', formatINR(d.month.expensePaise), colors.text]].map(([k, v, c]) => (
              <View key={k} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{k}</Text>
                <Text {...fit} style={{ color: c, fontSize: 16, fontWeight: '800', marginTop: 3 }}>{v}</Text>
              </View>
            ))}
          </Card>
        </A>
        <A enter={enter} i={2}><Insights /></A>
        <A enter={enter} i={2}>{chartCard}</A>
        <A enter={enter} i={3}>{recent}</A>
      </>
    );
  }

  // ── Classic (and the default for any unknown value): banner, two small cards, month card, chart, list.
  return (
    <>
      <ExpenseBanner d={d} />
      <A enter={enter} i={0}><BudgetStrip /></A>
        <A enter={enter} i={0}><Insights /></A>
      <Animated.View entering={enter(0)} style={{ flexDirection: 'row', gap: space.md }}>{incomeCard}{netCard}</Animated.View>
      <A enter={enter} i={1}>{monthCard}</A>
      <A enter={enter} i={2}>{chartCard}</A>
      <A enter={enter} i={3}>{liveCard}</A>
      {recent}
    </>
  );
}
