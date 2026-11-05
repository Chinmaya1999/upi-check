import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { AppLogo } from '../components/AppLogo';

const WORD = 'Paisa'.split('');

function Orb({ size, color, style, dx, dy, ms, reduce }: { size: number; color: string; style: object; dx: number; dy: number; ms: number; reduce: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { if (!reduce) t.value = withRepeat(withSequence(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: ms, easing: Easing.inOut(Easing.sin) })), -1); }, [reduce, ms, t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: dx * t.value }, { translateY: dy * t.value }, { scale: 1 + 0.2 * t.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, a]} />;
}

function Letter({ ch, i, reduce }: { ch: string; i: number; reduce: boolean }) {
  const v = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce) v.value = withDelay(1250 + i * 80, withSpring(1, { damping: 11, stiffness: 140 })); }, [reduce, i, v]);
  const s = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 1.6), transform: [{ translateY: interpolate(v.value, [0, 1], [34, 0]) }, { scale: interpolate(v.value, [0, 1], [0.6, 1]) }] }));
  return <Animated.Text style={[{ color: '#fff', fontSize: 46, fontWeight: '800', letterSpacing: -1.5 }, s]}>{ch}</Animated.Text>;
}

/** Midnight aurora → logo strokes itself on → spark pops with a shockwave → wordmark springs in → fade. ~2.9s (0.5s with reduced motion). */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const draw = useSharedValue(reduce ? 1 : 0);
  const pop = useSharedValue(reduce ? 1 : 0);
  const wave = useSharedValue(0);
  const tag = useSharedValue(reduce ? 1 : 0);
  const bar = useSharedValue(0);
  const out = useSharedValue(1);

  useEffect(() => {
    if (reduce) { out.value = withDelay(500, withTiming(0, { duration: 150 }, (f) => { if (f) runOnJS(onDone)(); })); return; }
    draw.value = withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.cubic) });
    pop.value = withDelay(1050, withSpring(1, { damping: 7, stiffness: 150 }));
    wave.value = withDelay(1100, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
    tag.value = withDelay(1750, withTiming(1, { duration: 600 }));
    bar.value = withDelay(300, withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.cubic) }));
    out.value = withDelay(2650, withTiming(0, { duration: 320 }, (f) => { if (f) runOnJS(onDone)(); }));
  }, [reduce, draw, pop, wave, tag, bar, out, onDone]);

  const logoS = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(draw.value, [0, 1], [0.86, 1]) }, { rotate: `${interpolate(draw.value, [0, 1], [-12, 0])}deg` }] }));
  const waveS = useAnimatedStyle(() => ({ opacity: interpolate(wave.value, [0, 0.15, 1], [0, 0.5, 0]), transform: [{ scale: interpolate(wave.value, [0, 1], [0.7, 2.6]) }] }));
  const tagS = useAnimatedStyle(() => ({ opacity: tag.value, transform: [{ translateY: interpolate(tag.value, [0, 1], [10, 0]) }] }));
  const barS = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));
  const rootS = useAnimatedStyle(() => ({ opacity: out.value }));

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: '#070B16' }, rootS]} accessibilityLabel="Paisa. Every rupee, understood.">
      <LinearGradient colors={['#070B16', '#0B1630', '#071E2B']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Orb size={380} color="rgba(61,219,169,0.16)" style={{ left: -140, bottom: -100 }} dx={50} dy={-40} ms={4200} reduce={reduce} />
        <Orb size={340} color="rgba(132,94,247,0.2)" style={{ right: -120, top: -80 }} dx={-40} dy={50} ms={5200} reduce={reduce} />
        <Orb size={200} color="rgba(116,192,252,0.12)" style={{ right: 30, bottom: 150 }} dx={-24} dy={-30} ms={3600} reduce={reduce} />

        <View style={{ width: 190, height: 190, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 2, borderColor: '#3DDBA9' }, waveS]} />
          <Animated.View style={logoS}><AppLogo size={190} draw={draw} pop={pop} /></Animated.View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 26 }}>{WORD.map((c, i) => <Letter key={i} ch={c} i={i} reduce={reduce} />)}</View>
        <Animated.Text style={[{ color: 'rgba(255,255,255,0.62)', fontSize: 15, marginTop: 8, letterSpacing: 1.2 }, tagS]}>EVERY RUPEE, UNDERSTOOD</Animated.Text>

        <View style={{ position: 'absolute', bottom: 76, width: 132, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: '#3DDBA9' }, barS]} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
