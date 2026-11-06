import React, { useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { Festival } from '@upi/core';

/** One floating emoji. Its path depends on the festival's motion: fall, rise, twinkle, float, burst or sway. */
function Particle({ ch, i, motion, w, h, still, alpha }: { ch: string; i: number; motion: Festival['motion']; w: number; h: number; still: boolean; alpha: number }) {
  const t = useSharedValue(still ? 0.5 : 0);
  const dur = 5200 + ((i * 731) % 3200);
  useEffect(() => {
    if (still) { t.value = 0.5; return; }
    t.value = withDelay((i * 610) % 4200, withRepeat(withTiming(1, { duration: dur, easing: motion === 'burst' ? Easing.out(Easing.quad) : Easing.linear }), -1, false));
  }, [still, dur, i, motion, t]);
  const baseX = (((i * 37 + 11) % 92) / 100) * w;
  const baseY = (((i * 53 + 7) % 78) / 100) * h;
  const size = 15 + ((i * 7) % 13);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    let x = baseX, y = baseY, o = 1, s = 1, r = 0;
    if (motion === 'fall') { y = -30 + p * (h + 60); x = baseX + Math.sin(p * 12.5 + i) * 12; r = p * 240; o = interpolate(p, [0, 0.1, 0.85, 1], [0, 0.95, 0.95, 0]); }
    else if (motion === 'rise') { y = h - p * (h + 40); x = baseX + Math.sin(p * 9 + i) * 8; s = 0.7 + p * 0.5; o = interpolate(p, [0, 0.15, 0.8, 1], [0, 0.95, 0.9, 0]); }
    else if (motion === 'twinkle') { s = interpolate(p, [0, 0.5, 1], [0.3, 1.25, 0.3]); o = interpolate(p, [0, 0.5, 1], [0, 1, 0]); }
    else if (motion === 'float') { y = h - p * (h + 40); x = baseX + Math.sin(p * 9.4 + i) * 18; o = interpolate(p, [0, 0.15, 0.8, 1], [0, 0.9, 0.9, 0]); }
    else if (motion === 'burst') { s = interpolate(p, [0, 0.3, 1], [0.1, 1, 1.8]); o = interpolate(p, [0, 0.2, 1], [0, 1, 0]); }
    else { y = h - p * (h + 40) * 0.9; x = baseX + Math.sin(p * 9 + i) * 14; r = Math.sin(p * 12 + i) * 18; o = interpolate(p, [0, 0.15, 0.8, 1], [0, 0.95, 0.9, 0]); }
    return { opacity: o * alpha, transform: [{ translateX: x }, { translateY: y }, { scale: s }, { rotate: `${r}deg` }] };
  });
  return <Animated.Text allowFontScaling={false} style={[{ position: 'absolute', left: 0, top: 0, fontSize: size }, style]}>{ch}</Animated.Text>;
}

/** Particles over a region. Measures itself, so it works for the banner and for the whole screen. */
export function FestivalParticles({ festival, count, alpha = 1 }: { festival: Festival; count: number; alpha?: number }) {
  const reduce = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  return (
    <View pointerEvents="none" onLayout={onLayout} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {box.w > 0 && Array.from({ length: count }, (_, i) => (
        <Particle key={i} i={i} ch={festival.particles[i % festival.particles.length]!} motion={festival.motion} w={box.w} h={box.h} still={reduce} alpha={alpha} />
      ))}
    </View>
  );
}

function Light({ color, i, still }: { color: string; i: number; still: boolean }) {
  const o = useSharedValue(still ? 0.9 : 0.35);
  useEffect(() => {
    if (still) return;
    o.value = withDelay((i * 230) % 1800, withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.3, { duration: 800 })), -1, false));
  }, [still, i, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.85 + o.value * 0.3 }] }));
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: color, shadowColor: color, shadowOpacity: 1, shadowRadius: 6, elevation: 4 }, a]} />;
}

/** The festive hero card at the top of Home: gradient, twinkling string lights, floating emoji and a greeting. */
export function FestivalBanner({ festival }: { festival: Festival }) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withSequence(withTiming(1.14, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) })), -1, false);
  }, [reduce, pulse]);
  const emoji = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <View accessible accessibilityLabel={`${festival.greeting} ${festival.tagline}`} style={{ borderRadius: 26, overflow: 'hidden', minHeight: 132 }}>
      <LinearGradient colors={festival.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <FestivalParticles festival={festival} count={10} alpha={0.75} />
      {festival.lights.length > 0 && (
        <View pointerEvents="none" style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, paddingHorizontal: 6 }}>
          {Array.from({ length: 14 }, (_, i) => <Light key={i} i={i} color={festival.lights[i % festival.lights.length]!} still={reduce} />)}
        </View>
      )}
      <View style={{ padding: 18, paddingTop: festival.lights.length ? 12 : 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Animated.Text allowFontScaling={false} style={[{ fontSize: 52 }, emoji]}>{festival.emoji}</Animated.Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: festival.text, fontSize: 23, fontWeight: '800', letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>{festival.greeting}</Text>
          <Text style={{ color: festival.text, opacity: 0.95, fontSize: 13.5, lineHeight: 19, marginTop: 3, textShadowColor: 'rgba(0,0,0,0.2)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } }}>{festival.tagline}</Text>
        </View>
      </View>
    </View>
  );
}

/** A few drifting emoji over the whole Home screen, behind touches. */
export function FestivalOverlay({ festival }: { festival: Festival }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}><FestivalParticles festival={festival} count={5} alpha={0.32} /></View>;
}
