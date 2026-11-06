import React, { useMemo, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES, addDays, categoryBreakdown, dayKeyOf, formatINR, summarizeRange } from '@upi/core';
import { space, useTheme } from '../theme';
import { useStore } from '../data/store';
import { PERIODS, PERIOD_LABEL, periodRange, weekStart, type Period } from '../data/budgets';
import { buildReport, toCsv, toHtml, toText } from '../data/reports';
import { saveReportFile } from '../data/inbox';
import { Card, Eyebrow, Tap } from './ui';
import { Donut, ShareBar, TrendChart, type Point } from './Viz';
import { AnimatedAmount } from './AnimatedAmount';

const short = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function AnalyticsHeader() {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const { txns, now } = useStore();
  const [period, setPeriod] = useState<Period>('week');
  const [busy, setBusy] = useState<string | null>(null);

  const report = useMemo(() => buildReport(txns, period, now), [txns, period, now]);
  const trend = useMemo<Point[]>(() => {
    const today = dayKeyOf(now);
    const out: Point[] = [];
    if (period === 'day') for (let i = 13; i >= 0; i--) { const k = addDays(today, -i); const s = summarizeRange(txns, k, k); out.push({ label: short(k).split(' ')[0]!, a: s.expensePaise, b: s.incomePaise }); }
    if (period === 'week') for (let i = 7; i >= 0; i--) { const f = addDays(weekStart(today), -7 * i); const s = summarizeRange(txns, f, addDays(f, 6)); out.push({ label: short(f), a: s.expensePaise, b: s.incomePaise }); }
    if (period === 'month') for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
      const f = d.toISOString().slice(0, 10), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      const s = summarizeRange(txns, f, t); out.push({ label: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), a: s.expensePaise, b: s.incomePaise });
    }
    return out;
  }, [txns, period, now]);
  const cats = useMemo(() => {
    const { from, to } = periodRange(period, now);
    const list = categoryBreakdown(txns, from, to);
    const total = list.reduce((s, c) => s + c.paise, 0) || 1;
    return list.slice(0, 6).map((c) => { const meta = CATEGORIES.find((x) => x.id === c.categoryId); return { ...c, label: meta?.label ?? c.categoryId, color: meta?.color ?? '#ADB5BD', icon: meta?.icon ?? 'ellipse', pct: Math.round((c.paise / total) * 100) }; });
  }, [txns, period, now]);

  const save = async (kind: 'csv' | 'html') => {
    setBusy(kind);
    try {
      const where = kind === 'csv'
        ? await saveReportFile(`${report.fileBase}.csv`, toCsv(report), 'text/csv')
        : await saveReportFile(`${report.fileBase}.html`, toHtml(report), 'text/html');
      Alert.alert('Report saved ✅', `${where}\n\nFind it in your Files app under Downloads → Paisa.${kind === 'html' ? '\nOpen it in a browser and choose Print → Save as PDF.' : ''}`);
    } catch (e) { Alert.alert('Could not save report', (e as Error).message); } finally { setBusy(null); }
  };
  const enter = (i: number) => (reduce ? undefined : FadeInDown.delay(60 + i * 80).duration(450));
  const net = report.net;

  return (
    <View style={{ gap: space.lg, marginBottom: space.sm }}>
      <View>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>Analytics</Text>
        <Text style={{ color: colors.textMuted, marginTop: 2 }}>Where your money goes, and comes from.</Text>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: 16, padding: 4 }}>
        {PERIODS.map((p) => (
          <View key={p} style={{ flex: 1 }}>
            <Tap onPress={() => setPeriod(p)} label={PERIOD_LABEL[p]} style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: period === p ? colors.card : 'transparent' }}>
              <Text style={{ color: period === p ? colors.text : colors.textMuted, fontWeight: '800', fontSize: 14 }}>{PERIOD_LABEL[p]}</Text>
            </Tap>
          </View>
        ))}
      </View>

      <Animated.View entering={enter(0)} style={{ flexDirection: 'row', gap: space.md }}>
        <Card style={{ flex: 1, padding: space.md + 2 }}>
          <Eyebrow>Spent</Eyebrow>
          <AnimatedAmount paise={report.spent} style={{ color: colors.expense, fontSize: 20, fontWeight: '800', marginTop: 6 }} />
        </Card>
        <Card style={{ flex: 1, padding: space.md + 2 }}>
          <Eyebrow>Received</Eyebrow>
          <AnimatedAmount paise={report.received} style={{ color: colors.income, fontSize: 20, fontWeight: '800', marginTop: 6 }} />
        </Card>
        <Card style={{ flex: 1, padding: space.md + 2 }}>
          <Eyebrow>Net</Eyebrow>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color: net < 0 ? colors.expense : colors.income, fontSize: 20, fontWeight: '800', marginTop: 6 }}>{net < 0 ? '−' : '+'}{formatINR(Math.abs(net))}</Text>
        </Card>
      </Animated.View>

      <Animated.View entering={enter(1)}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
            <Eyebrow>{period === 'day' ? 'Last 14 days' : period === 'week' ? 'Last 8 weeks' : 'Last 6 months'}</Eyebrow>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.expense }} /><Text style={{ color: colors.textMuted, fontSize: 11.5 }}>Spent</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.income }} /><Text style={{ color: colors.textMuted, fontSize: 11.5 }}>Received</Text></View>
            </View>
          </View>
          <TrendChart data={trend} />
        </Card>
      </Animated.View>

      <Animated.View entering={enter(2)}>
        <Card style={{ gap: space.md }}>
          <Eyebrow>Spending by category</Eyebrow>
          {cats.length === 0 ? <Text style={{ color: colors.textMuted }}>No spending in this period.</Text> : (
            <>
              <View style={{ alignItems: 'center' }}>
                <Donut slices={cats.map((c) => ({ color: c.color, value: c.paise }))}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>Total</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{formatINR(report.spent)}</Text>
                </Donut>
              </View>
              {cats.map((c, i) => (
                <View key={c.categoryId} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: c.color + '26', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={c.icon as never} size={16} color={c.color} /></View>
                    <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{c.label}</Text>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color: colors.text, fontWeight: '800' }}>{formatINR(c.paise)}</Text>
                    <Text style={{ color: colors.textMuted, width: 38, textAlign: 'right', fontSize: 12 }}>{c.pct}%</Text>
                  </View>
                  <ShareBar pct={c.pct} color={c.color} delay={i * 90} />
                </View>
              ))}
            </>
          )}
        </Card>
      </Animated.View>

      <Animated.View entering={enter(3)}>
        <Card style={{ gap: space.md }}>
          <View>
            <Eyebrow>Download report</Eyebrow>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>{report.title} · {report.count} transactions of spend and credit.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([['csv', 'document-text', 'Spreadsheet (CSV)'], ['html', 'print', 'Printable / PDF']] as const).map(([k, icon, label]) => (
              <View key={k} style={{ flex: 1 }}>
                <Tap onPress={() => save(k)} disabled={!!busy || report.count === 0} label={`Download ${label}`}
                  style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: colors.brand + '1F', borderWidth: 1, borderColor: colors.brand + '55' }}>
                  <Ionicons name={icon} size={22} color={colors.brand} />
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{busy === k ? 'Saving…' : label}</Text>
                </Tap>
              </View>
            ))}
          </View>
          <Tap onPress={() => Share.share({ message: toText(report), title: report.title })} label="Share summary"
            style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 }}>
            <Ionicons name="share-social" size={18} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontWeight: '700' }}>Share summary</Text>
          </Tap>
        </Card>
      </Animated.View>

      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: space.sm }}>Day by day</Text>
    </View>
  );
}
