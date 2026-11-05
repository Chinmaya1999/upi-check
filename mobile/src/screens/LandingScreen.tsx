import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeInUp, LinearTransition, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppLogo } from '../components/AppLogo';
import { BankBadge } from '../components/BankBadge';
import type { Bank } from '../data/banks';

const bank = (id: string, name: string, short: string, bg: string): Bank => ({ id, name, short, bg, fg: '#fff', last4: null });
const FEED = [
  { bank: bank('airtel', 'Airtel Payments Bank', 'a', '#E40000'), who: 'Swiggy', time: '1:42 PM', amt: '−₹349', debit: true },
  { bank: bank('hdfc', 'HDFC Bank', 'H', '#004C8F'), who: 'Salary credit', time: '10:05 AM', amt: '+₹52,000', debit: false },
  { bank: bank('sbi', 'State Bank of India', 'SBI', '#1C74D0'), who: 'Metro recharge', time: '9:18 AM', amt: '−₹200', debit: true },
  { bank: bank('icici', 'ICICI Bank', 'i', '#F37E20'), who: 'Amazon', time: 'Yesterday', amt: '−₹1,299', debit: true },
  { bank: bank('axis', 'Axis Bank', 'A', '#97144D'), who: 'Rent received', time: 'Yesterday', amt: '+₹8,500', debit: false },
];
const FEATURES = [
  { icon: 'notifications', title: 'Budget alerts', text: 'Daily, weekly, monthly limits. A sound the second you cross one.', c: ['#F59F00', '#FF6B6B'] },
  { icon: 'business', title: 'Bank-wise view', text: 'Every bank and account, with debit, credit and exact times.', c: ['#339AF0', '#845EF7'] },
  { icon: 'stats-chart', title: 'Live charts', text: 'Trends, categories and cash-flow that draw themselves.', c: ['#12B886', '#15AABF'] },
  { icon: 'download', title: 'Reports', text: 'Download daily, weekly or monthly spend & credit reports.', c: ['#CC5DE8', '#5C7CFA'] },
] as const;

function Orb({ size, color, style, dx, dy, ms, reduce }: { size: number; color: string; style: object; dx: number; dy: number; ms: number; reduce: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { if (!reduce) t.value = withRepeat(withSequence(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: ms, easing: Easing.inOut(Easing.sin) })), -1); }, [reduce, ms, t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: dx * t.value }, { translateY: dy * t.value }, { scale: 1 + 0.2 * t.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, a]} />;
}

function Word({ w, i, color, reduce }: { w: string; i: number; color?: string; reduce: boolean }) {
  const v = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { if (!reduce) v.value = withDelay(250 + i * 140, withSpring(1, { damping: 12, stiffness: 120 })); }, [reduce, i, v]);
  const s = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 1.5), transform: [{ translateY: interpolate(v.value, [0, 1], [30, 0]) }] }));
  return <Animated.Text style={[{ color: color ?? '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1.6, lineHeight: 50 }, s]}>{w} </Animated.Text>;
}

/** The CTA: gradient button with a light sweep that glides across every few seconds. */
function ShimmerCta({ onPress }: { onPress: () => void }) {
  const reduce = useReducedMotion();
  const x = useSharedValue(-1);
  useEffect(() => { if (!reduce) x.value = withRepeat(withSequence(withDelay(900, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) })), withTiming(-1, { duration: 0 })), -1); }, [reduce, x]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(x.value, [-1, 1], [-120, 360]) }, { skewX: '-20deg' }] }));
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPress(); }} accessibilityRole="button" accessibilityLabel="Get started"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <LinearGradient colors={['#3DDBA9', '#12B886', '#0FA3A0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, overflow: 'hidden', shadowColor: '#12B886', shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 12 }}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, width: 70, backgroundColor: 'rgba(255,255,255,0.35)' }, sweep]} />
        <Text style={{ color: '#04130E', fontSize: 18, fontWeight: '800' }}>Get started</Text>
        <Ionicons name="arrow-forward" size={21} color="#04130E" />
      </LinearGradient>
    </Pressable>
  );
}

/** First screen: aurora backdrop, word-by-word headline, a live-feeling bank feed, feature cards, shimmering CTA. */
export function LandingScreen({ onStart }: { onStart: () => void }) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const one = useSharedValue(1);
  const [n, setN] = useState(3);
  useEffect(() => { if (reduce) return; const id = setInterval(() => setN((v) => v + 1), 2400); return () => clearInterval(id); }, [reduce]);
  const visible = [0, 1, 2].map((k) => ({ ...FEED[(n - k) % FEED.length]!, key: n - k }));
  const enter = (d: number) => (reduce ? undefined : FadeInDown.delay(d).duration(600).springify().damping(16));

  return (
    <View style={{ flex: 1, backgroundColor: '#070B16' }}>
      <LinearGradient colors={['#070B16', '#0B1630', '#071E2B']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <Orb size={360} color="rgba(61,219,169,0.16)" style={{ left: -150, top: 380 }} dx={60} dy={-40} ms={4800} reduce={reduce} />
      <Orb size={320} color="rgba(132,94,247,0.2)" style={{ right: -130, top: -60 }} dx={-40} dy={60} ms={5600} reduce={reduce} />
      <Orb size={180} color="rgba(116,192,252,0.14)" style={{ right: 10, top: 520 }} dx={-24} dy={-30} ms={3800} reduce={reduce} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 22, paddingBottom: 170 }}>
        <Animated.View entering={enter(0)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24 }}>
          <AppLogo size={44} draw={one} pop={one} />
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.6 }}>Paisa</Text>
        </Animated.View>

        <View style={{ paddingHorizontal: 24, marginTop: 34 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['Know', 'where'].map((w, i) => <Word key={w} w={w} i={i} reduce={reduce} />)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Word w="every" i={2} reduce={reduce} /><Word w="rupee" i={3} color="#3DDBA9" reduce={reduce} /><Word w="goes." i={4} reduce={reduce} />
          </View>
          <Animated.Text entering={enter(900)} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 17, lineHeight: 26, marginTop: 14 }}>
            Your bank SMS, turned into a calm, private money dashboard. Every bank. Every debit. Every credit.
          </Animated.Text>
        </View>

        <Animated.View entering={reduce ? undefined : FadeInUp.delay(500).duration(700).springify().damping(15)} style={{ marginHorizontal: 20, marginTop: 30 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderRadius: 28, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3DDBA9' }} />
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: '700', letterSpacing: 0.8 }}>LIVE FROM YOUR BANK SMS · EXAMPLE</Text>
            </View>
            <View style={{ height: 3 * 62 }}>
              {visible.map((r, k) => (
                <Animated.View key={r.key} layout={reduce ? undefined : LinearTransition.springify().damping(18)} entering={reduce ? undefined : FadeInDown.duration(450)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 62, opacity: 1 - k * 0.22 }}>
                  <BankBadge bank={r.bank} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{r.who}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{r.time} · {r.bank.name.replace(/ (Payments )?Bank$/, '')}</Text>
                  </View>
                  <Text style={{ color: r.debit ? '#FF8787' : '#3DDBA9', fontWeight: '800', fontSize: 16 }}>{r.amt}</Text>
                </Animated.View>
              ))}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={enter(1100)} style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 28, paddingHorizontal: 20 }}>
          {[['30+', 'banks'], ['100%', 'on your phone'], ['₹0', 'to use']].map(([a, b]) => (
            <View key={b} style={{ alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{a}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5 }}>{b}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={reduce ? undefined : FadeIn.delay(1300).duration(600)} style={{ marginTop: 30 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {FEATURES.map((f) => (
              <View key={f.title} style={{ width: 210, padding: 18, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', gap: 10 }}>
                <LinearGradient colors={[f.c[0], f.c[1]]} style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={f.icon} size={23} color="#fff" />
                </LinearGradient>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{f.title}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 13.5, lineHeight: 20 }}>{f.text}</Text>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      </ScrollView>

      <LinearGradient colors={['rgba(7,11,22,0)', 'rgba(7,11,22,0.95)', '#070B16']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 40, paddingHorizontal: 22, paddingBottom: insets.bottom + 16 }}>
        <Animated.View entering={enter(1500)}>
          <ShimmerCta onPress={onStart} />
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5, textAlign: 'center', marginTop: 12 }}>Your data stays on this device. No UPI PIN, ever.</Text>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}
