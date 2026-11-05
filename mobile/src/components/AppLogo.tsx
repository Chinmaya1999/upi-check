import React from 'react';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

// Same geometry as scripts/gen-icon.py (1024 grid) so the splash logo and the launcher icon are one mark.
const pt = (deg: number) => [512 + 300 * Math.cos((deg * Math.PI) / 180), 512 + 300 * Math.sin((deg * Math.PI) / 180)] as const;
const [rx0, ry0] = pt(-15), [rx1, ry1] = pt(290), [sx, sy] = pt(-42);
const RING = `M ${rx0} ${ry0} A 300 300 0 1 1 ${rx1} ${ry1}`;
const BARS = ['M 392 392 H 632', 'M 392 462 H 632'];
const BOWL = 'M 392 392 H 520 A 74 74 0 0 1 520 540 H 412';
const LEG = 'M 452 540 L 618 676';
const L = { ring: 1700, bar: 260, bowl: 420, leg: 240 };

/**
 * The Paisa mark: gradient coin ring, ₹, spark. `draw` (0→1) strokes it on, `pop` (0→1) fires the spark.
 * Pass static 1s for a finished logo.
 */
export function AppLogo({ size, draw, pop }: { size: number; draw: SharedValue<number>; pop: SharedValue<number> }) {
  const ring = useAnimatedProps(() => ({ strokeDashoffset: L.ring * (1 - Math.min(1, draw.value * 1.25)) }));
  const bar0 = useAnimatedProps(() => ({ strokeDashoffset: L.bar * (1 - Math.max(0, Math.min(1, (draw.value - 0.35) * 3))) }));
  const bar1 = useAnimatedProps(() => ({ strokeDashoffset: L.bar * (1 - Math.max(0, Math.min(1, (draw.value - 0.45) * 3))) }));
  const bowl = useAnimatedProps(() => ({ strokeDashoffset: L.bowl * (1 - Math.max(0, Math.min(1, (draw.value - 0.5) * 2.6))) }));
  const leg = useAnimatedProps(() => ({ strokeDashoffset: L.leg * (1 - Math.max(0, Math.min(1, (draw.value - 0.7) * 3.4))) }));
  const spark = useAnimatedProps(() => ({ r: 30 * pop.value, opacity: pop.value }));
  const halo = useAnimatedProps(() => ({ r: 62 * pop.value, opacity: 0.35 * pop.value }));
  const g = { stroke: 'url(#glyph)', strokeWidth: 46, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="ring" x1="0.1" y1="0" x2="0.9" y2="1"><Stop offset="0" stopColor="#3DDBA9" /><Stop offset="0.5" stopColor="#74C0FC" /><Stop offset="1" stopColor="#845EF7" /></LinearGradient>
        <LinearGradient id="glyph" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#FFFFFF" /><Stop offset="1" stopColor="#CFE4FF" /></LinearGradient>
      </Defs>
      <APath d={RING} stroke="url(#ring)" strokeWidth={36} strokeLinecap="round" fill="none" strokeDasharray={`${L.ring} ${L.ring}`} animatedProps={ring} />
      <APath d={BARS[0]} {...g} strokeDasharray={`${L.bar} ${L.bar}`} animatedProps={bar0} />
      <APath d={BARS[1]} {...g} strokeDasharray={`${L.bar} ${L.bar}`} animatedProps={bar1} />
      <APath d={BOWL} {...g} strokeDasharray={`${L.bowl} ${L.bowl}`} animatedProps={bowl} />
      <APath d={LEG} {...g} strokeDasharray={`${L.leg} ${L.leg}`} animatedProps={leg} />
      <ACircle cx={sx} cy={sy} fill="#3DDBA9" animatedProps={halo} />
      <ACircle cx={sx} cy={sy} fill="#FFFFFF" animatedProps={spark} />
    </Svg>
  );
}
