import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

export interface Point { label: string; a: number; b?: number } // a = spent, b = received (any unit)

/** Smooth curve through points (Catmull-Rom → cubic Bézier). */
function curve(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Spent (red) vs received (green) trend: smooth lines that draw themselves in, with a soft gradient under the spend line. */
export function TrendChart({ data, height = 170 }: { data: Point[]; height?: number }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const W = 320, H = height, padT = 14, padB = 4;
  const max = Math.max(1, ...data.flatMap((p) => [p.a, p.b ?? 0]));
  const xy = (k: 'a' | 'b') => data.map((p, i) => ({ x: data.length === 1 ? W / 2 : (i / (data.length - 1)) * W, y: padT + (1 - (p[k] ?? 0) / max) * (H - padT - padB) }));
  const A = xy('a'), B = xy('b');
  const dA = useMemo(() => curve(A), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const dB = useMemo(() => curve(B), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = dA ? `${dA} L ${W} ${H} L 0 ${H} Z` : '';
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { p.value = reduce ? 1 : 0; p.value = reduce ? 1 : withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }); }, [data, reduce, p]);
  const LEN = 2400;
  const lineA = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - p.value) }));
  const lineB = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - p.value) }));
  const area = useAnimatedProps(() => ({ opacity: p.value }));
  const dotsOp = useAnimatedProps(() => ({ opacity: p.value }));
  const last = A[A.length - 1];
  const step = Math.ceil(data.length / 6);
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={colors.expense} stopOpacity="0.35" /><Stop offset="1" stopColor={colors.expense} stopOpacity="0" /></LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75].map((g) => <Path key={g} d={`M 0 ${padT + g * (H - padT - padB)} L ${W} ${padT + g * (H - padT - padB)}`} stroke={colors.border} strokeWidth={1} strokeDasharray="3 6" />)}
        {fill ? <APath d={fill} fill="url(#gA)" animatedProps={area} /> : null}
        {data.some((d) => d.b) && dB ? <APath d={dB} stroke={colors.income} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${LEN} ${LEN}`} animatedProps={lineB} /> : null}
        {dA ? <APath d={dA} stroke={colors.expense} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeDasharray={`${LEN} ${LEN}`} animatedProps={lineA} /> : null}
        {last ? <G><ACircle cx={last.x} cy={last.y} r={9} fill={colors.expense} opacity={0.18} animatedProps={dotsOp} /><ACircle cx={last.x} cy={last.y} r={4.5} fill={colors.expense} stroke={colors.card} strokeWidth={2} animatedProps={dotsOp} /></G> : null}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        {data.map((d, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: colors.textMuted, opacity: i % step === 0 || i === data.length - 1 ? 1 : 0 }} numberOfLines={1}>{d.label}</Text>)}
      </View>
    </View>
  );
}

function Seg({ cx, cy, r, stroke, len, offset, color, delay }: { cx: number; cy: number; r: number; stroke: number; len: number; offset: number; color: string; delay: number }) {
  const reduce = useReducedMotion();
  const C = 2 * Math.PI * r;
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { p.value = reduce ? 1 : withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })); }, [reduce, delay, p]);
  const props = useAnimatedProps(() => ({ strokeDasharray: `${Math.max(len * p.value - 2.5, 0.01)} ${C}` }));
  return <ACircle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDashoffset={-offset} animatedProps={props} />;
}

/** Category donut. Slices sweep in one after another. */
export function Donut({ slices, size = 150, children }: { slices: { color: string; value: number }[]; size?: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const stroke = 20, r = (size - stroke) / 2, C = 2 * Math.PI * r, total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.cardAlt} strokeWidth={stroke} fill="none" />
        {slices.map((s, i) => { const len = (s.value / total) * C, off = acc; acc += len; return <Seg key={i} cx={size / 2} cy={size / 2} r={r} stroke={stroke} len={len} offset={off} color={s.color} delay={i * 110} />; })}
      </Svg>
      {children}
    </View>
  );
}

/** Horizontal share bar that grows in. */
export function ShareBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? pct : 0);
  useEffect(() => { p.value = reduce ? pct : withDelay(delay, withTiming(pct, { duration: 800, easing: Easing.out(Easing.cubic) })); }, [pct, reduce, delay, p]);
  const st = useAnimatedStyle(() => ({ width: `${p.value}%` }));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: color }, st]} />
    </View>
  );
}
