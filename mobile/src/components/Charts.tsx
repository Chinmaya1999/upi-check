import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Rect } from 'react-native-svg';
import { formatINR, type DaySummary } from '@upi/core';
import { useTheme } from '../theme';

const ARect = Animated.createAnimatedComponent(Rect);
const ACircle = Animated.createAnimatedComponent(Circle);

function Bar({ x, w, h, maxH, delay, color, today }: { x: number; w: number; h: number; maxH: number; delay: number; color: string; today: boolean }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce) p.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })); }, [reduce, delay, p]);
  const props = useAnimatedProps(() => ({ y: maxH - Math.max(h, 3) * p.value, height: Math.max(h, 3) * p.value }));
  return <ARect x={x} width={w} rx={w / 2.8} fill={color} opacity={today ? 1 : 0.55} animatedProps={props} />;
}

/** Last-7-days expense bars. Heights come straight from the day summaries. */
export function DailyBars({ days }: { days: DaySummary[] }) {
  const { colors } = useTheme();
  const H = 120, W = 300, n = days.length, gap = 14, bw = (W - gap * (n - 1)) / n;
  const max = Math.max(...days.map((d) => d.expensePaise), 1);
  const label = days.map((d) => `${d.dayKey.slice(8)}: ${formatINR(d.expensePaise)}`).join(', ');
  return (
    <View accessible accessibilityLabel={`Daily expenses, last 7 days. ${label}`}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {days.map((d, i) => (
          <Bar key={d.dayKey} x={i * (bw + gap)} w={bw} h={(d.expensePaise / max) * (H - 6)} maxH={H}
            delay={i * 70} color={colors.expense} today={i === n - 1} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {days.map((d, i) => (
          <Text key={d.dayKey} style={{ width: `${100 / n}%`, textAlign: 'center', fontSize: 11, color: i === n - 1 ? colors.text : colors.textMuted, fontWeight: i === n - 1 ? '700' : '500' }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(`${d.dayKey}T12:00:00Z`).getUTCDay()]}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Circular budget progress. Turns amber at 80% and red when over budget. */
export function BudgetRing({ pct, size = 108, children }: { pct: number; size?: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const stroke = 11, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const p = useSharedValue(reduce ? Math.min(pct, 100) : 0);
  useEffect(() => { p.value = reduce ? Math.min(pct, 100) : withTiming(Math.min(pct, 100), { duration: 1000, easing: Easing.out(Easing.cubic) }); }, [pct, reduce, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - p.value / 100) }));
  const color = pct >= 100 ? colors.expense : pct >= 80 ? colors.warning : colors.income;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.cardAlt} strokeWidth={stroke} fill="none" />
        <ACircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${C} ${C}`} animatedProps={props} />
      </Svg>
      {children}
    </View>
  );
}
