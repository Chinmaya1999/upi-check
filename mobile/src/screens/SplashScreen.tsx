import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const RINGS = [0, 1, 2];

function Ring({ index, reduce }: { index: number; reduce: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withDelay(300 + index * 450, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false));
  }, [reduce, index, t]);
  const s = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0, 0.2, 1], [0, 0.35, 0]), transform: [{ scale: interpolate(t.value, [0, 1], [0.8, 2.6]) }] }));
  return <Animated.View style={[{ position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: '#12B886' }, s]} />;
}

/** Pulsing rings → coin drops in → wordmark → progress bar → fade out. ~2.2s, ~0.4s with reduced motion. */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const logo = useSharedValue(0);
  const text = useSharedValue(0);
  const bar = useSharedValue(0);
  const out = useSharedValue(1);

  useEffect(() => {
    if (reduce) {
      logo.value = 1; text.value = 1; bar.value = 1;
      out.value = withDelay(400, withTiming(0, { duration: 150 }, (f) => { if (f) runOnJS(onDone)(); }));
      return;
    }
    logo.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.back(1.6)) });
    text.value = withDelay(600, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    bar.value = withDelay(500, withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) }));
    out.value = withDelay(2000, withTiming(0, { duration: 300 }, (f) => { if (f) runOnJS(onDone)(); }));
  }, [reduce, logo, text, bar, out, onDone]);

  const coin = useAnimatedStyle(() => ({
    opacity: logo.value,
    transform: [{ translateY: interpolate(logo.value, [0, 1], [-60, 0]) }, { scale: interpolate(logo.value, [0, 1], [0.5, 1]) }, { rotateY: `${interpolate(logo.value, [0, 1], [180, 0])}deg` }],
  }));
  const textS = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: interpolate(text.value, [0, 1], [18, 0]) }] }));
  const barS = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));
  const rootS = useAnimatedStyle(() => ({ opacity: out.value }));

  return (
    <Animated.View style={[{ flex: 1 }, rootS]} accessibilityLabel="Paisa. Every rupee, understood.">
      <LinearGradient colors={['#070C16', '#101827', '#0B3B38']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
          {RINGS.map((i) => <Ring key={i} index={i} reduce={reduce} />)}
          <Animated.View style={[{ width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', shadowColor: '#12B886', shadowOpacity: 0.6, shadowRadius: 24, elevation: 14 }, coin]}>
            <LinearGradient colors={['#3DDBA9', '#12B886', '#0A8F68']} style={{ width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)' }}>
              <Text style={{ color: '#06241C', fontSize: 62, fontWeight: '900', marginTop: -4 }}>₹</Text>
            </LinearGradient>
          </Animated.View>
        </View>
        <Animated.View style={[{ alignItems: 'center', marginTop: 44 }, textS]}>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1.5 }}>Paisa</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, marginTop: 8, letterSpacing: 0.4 }}>Every rupee, understood.</Text>
        </Animated.View>
        <View style={{ position: 'absolute', bottom: 72, width: 120, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
          <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: '#12B886' }, barS]} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
