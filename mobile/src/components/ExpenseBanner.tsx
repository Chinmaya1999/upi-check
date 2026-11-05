import React from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatINR, type Dashboard } from '@upi/core';
import { AnimatedAmount } from './AnimatedAmount';
import { radius } from '../theme';

/** A soft glowing orb that drifts slowly — gives the hero a living, aurora feel. */
function Orb({ size, color, style, dx, dy, ms }: { size: number; color: string; style: object; dx: number; dy: number; ms: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  React.useEffect(() => { if (!reduce) t.value = withRepeat(withSequence(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: ms, easing: Easing.inOut(Easing.sin) })), -1); }, [reduce, ms, t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: dx * t.value }, { translateY: dy * t.value }, { scale: 1 + 0.15 * t.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, a]} />;
}

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
      <LinearGradient colors={['#0B1224', '#1B2F6B', '#0E7C66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.lg + 4, padding: 22, overflow: 'hidden' }}>
        <Orb size={190} color="rgba(61,219,169,0.22)" style={{ right: -60, top: -60 }} dx={-26} dy={22} ms={4200} />
        <Orb size={140} color="rgba(132,94,247,0.28)" style={{ left: -40, bottom: -50 }} dx={30} dy={-18} ms={5200} />
        <Orb size={70} color="rgba(116,192,252,0.22)" style={{ right: 60, bottom: 20 }} dx={-14} dy={-20} ms={3600} />
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
