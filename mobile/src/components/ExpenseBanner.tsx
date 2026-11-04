import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatINR, type Dashboard } from '@upi/core';
import { AnimatedAmount } from './AnimatedAmount';
import { radius } from '../theme';

/** The hero banner: "You spent ₹X today." Every number is derived from stored transactions. */
export function ExpenseBanner({ d }: { d: Dashboard }) {
  const reduce = useReducedMotion();
  const spent = d.today.expensePaise;
  const pct = d.changeVsYesterdayPct;
  const up = (pct ?? 0) > 0;

  const compare =
    pct === null
      ? d.yesterday.expensePaise === 0 ? 'No spending yesterday to compare' : ''
      : pct === 0 ? 'Same as yesterday'
      : `${Math.abs(pct)}% ${up ? 'more' : 'less'} than yesterday`;

  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.duration(600).springify().damping(16)}>
      <LinearGradient colors={['#101827', '#16324A', '#0E6B55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.lg + 4, padding: 22, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(18,184,134,0.18)' }} />
        <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '600' }}>
          {spent === 0 ? 'No spending today' : 'You spent'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
          <AnimatedAmount paise={spent} style={{ color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }} />
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 18, fontWeight: '600', marginLeft: 8 }}>today.</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {!!compare && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99 }}>
              {pct !== null && pct !== 0 && <Ionicons name={up ? 'trending-up' : 'trending-down'} size={15} color={up ? '#FFA8A8' : '#63E6BE'} />}
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }}>{compare}</Text>
            </View>
          )}
          {d.budget && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99 }}>
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }}>
                {d.budget.remainingPaise >= 0 ? `${formatINR(d.budget.remainingPaise)} left this month` : `${formatINR(-d.budget.remainingPaise)} over budget`}
              </Text>
            </View>
          )}
        </View>
        {d.today.pendingDebitPaise > 0 && (
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 12 }}>
            + {formatINR(d.today.pendingDebitPaise)} pending, not included above
          </Text>
        )}
      </LinearGradient>
    </Animated.View>
  );
}
