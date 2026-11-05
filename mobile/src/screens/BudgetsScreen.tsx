import React, { useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatINR } from '@upi/core';
import { space, useTheme } from '../theme';
import { useStore } from '../data/store';
import { PERIODS, PERIOD_LABEL, statuses, type BudgetStatus, type Period } from '../data/budgets';
import { Button, Card, Eyebrow, Tap } from '../components/ui';
import { BudgetRing } from '../components/Charts';
import { AnimatedAmount } from '../components/AnimatedAmount';

const META: Record<Period, { icon: string; sub: string; tint: [string, string]; hint: string }> = {
  day: { icon: 'sunny', sub: 'Resets every midnight', tint: ['#F59F00', '#FF6B6B'], hint: '500' },
  week: { icon: 'calendar', sub: 'Monday to Sunday', tint: ['#339AF0', '#845EF7'], hint: '3000' },
  month: { icon: 'moon', sub: 'Resets on the 1st', tint: ['#12B886', '#15AABF'], hint: '10000' },
};

function LimitCard({ s, index }: { s: BudgetStatus; index: number }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const { setLimit } = useStore();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const m = META[s.period];
  const over = s.pct !== null && s.pct > 100;
  const save = async () => {
    const n = Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100);
    if (!n || n < 100) { Alert.alert('Enter an amount', 'Type the limit in rupees, e.g. ' + m.hint); return; }
    await setLimit(s.period, n);
    setEditing(false); setText('');
  };
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(80 + index * 90).duration(500).springify().damping(16)}>
      <Card style={{ gap: space.md, overflow: 'hidden', borderWidth: over ? 1.5 : 0, borderColor: colors.expense }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LinearGradient colors={m.tint} style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={m.icon as never} size={22} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{PERIOD_LABEL[s.period]} budget</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{m.sub}</Text>
          </View>
          {s.limit ? <Tap onPress={() => { setEditing(!editing); setText(String(s.limit! / 100)); }} label="Edit budget"><Ionicons name="create-outline" size={22} color={colors.textMuted} /></Tap> : null}
        </View>

        {s.limit && !editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <BudgetRing pct={s.pct ?? 0} size={104}>
              <Text style={{ color: over ? colors.expense : colors.text, fontSize: 20, fontWeight: '800' }}>{s.pct}%</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>used</Text>
            </BudgetRing>
            <View style={{ flex: 1, gap: 8 }}>
              <View><Text style={{ color: colors.textMuted, fontSize: 12 }}>Spent</Text><AnimatedAmount paise={s.spent} style={{ color: over ? colors.expense : colors.text, fontSize: 22, fontWeight: '800' }} /></View>
              <Text style={{ color: over ? colors.expense : colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                {over ? `${formatINR(s.spent - s.limit, { decimals: false })} over your ${formatINR(s.limit, { decimals: false })} limit` : `${formatINR(s.left!, { decimals: false })} left of ${formatINR(s.limit, { decimals: false })}`}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: 14, paddingHorizontal: 14 }}>
              <Text style={{ color: colors.textMuted, fontSize: 20, fontWeight: '700' }}>₹</Text>
              <TextInput value={text} onChangeText={setText} keyboardType="numeric" placeholder={`e.g. ${m.hint}`} placeholderTextColor={colors.textMuted}
                accessibilityLabel={`${PERIOD_LABEL[s.period]} budget in rupees`} style={{ flex: 1, color: colors.text, fontSize: 20, fontWeight: '700', paddingVertical: 14, paddingHorizontal: 8 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button title={s.limit ? 'Save' : 'Set budget'} onPress={save} /></View>
              {s.limit ? (
                <>
                  <View style={{ flex: 1 }}><Button title="Remove" variant="ghost" onPress={async () => { await setLimit(s.period, null); setEditing(false); }} /></View>
                </>
              ) : null}
            </View>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

export function BudgetsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { txns, limits, now, prefs, setPrefs, notifs, clearNotifs, testAlert } = useStore();
  const st = statuses(txns, limits, now);

  const test = async () => {
    const ok = await testAlert();
    if (!ok) Alert.alert('Notifications are off', 'Allow notifications for Paisa in Android settings to get budget alerts.');
  };
  const toggle = (icon: string, title: string, sub: string, key: 'alerts' | 'sound' | 'warnAt80') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <Ionicons name={icon as never} size={22} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 1 }}>{sub}</Text>
      </View>
      <Switch value={prefs[key]} trackColor={{ true: colors.brand }} accessibilityLabel={title} onValueChange={(v) => setPrefs({ [key]: v })} />
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: 130, paddingHorizontal: space.lg, gap: space.lg }}>
      <View>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>Budgets</Text>
        <Text style={{ color: colors.textMuted, marginTop: 2 }}>Set limits. We’ll buzz you the moment you cross one.</Text>
      </View>

      {st.map((s, i) => <LimitCard key={s.period + (s.limit ?? 0)} s={s} index={i} />)}

      <Card>
        <Eyebrow>Notifications</Eyebrow>
        {toggle('notifications', 'Budget alerts', 'Notify me when a budget is exceeded', 'alerts')}
        {toggle('volume-high', 'Alert sound', 'Play a sound with every alert', 'sound')}
        {toggle('speedometer', 'Early warning at 80%', 'Heads-up before you cross the limit', 'warnAt80')}
        <View style={{ marginTop: 6 }}><Button title="Send a test alert" variant="ghost" onPress={test} /></View>
      </Card>

      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow>Alert history</Eyebrow>
          {notifs.length > 0 && <Tap onPress={clearNotifs} label="Clear history"><Text style={{ color: colors.brand, fontWeight: '700' }}>Clear</Text></Tap>}
        </View>
        {notifs.length === 0 ? (
          <Text style={{ color: colors.textMuted, paddingVertical: 12 }}>No alerts yet. They show up here when a budget is crossed.</Text>
        ) : notifs.map((n) => (
          <View key={n.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: (n.level === 'over' ? colors.expense : colors.warning) + '26', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={n.level === 'over' ? 'alert-circle' : 'speedometer'} size={19} color={n.level === 'over' ? colors.expense : colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{n.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 18 }}>{n.body}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{new Date(n.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
