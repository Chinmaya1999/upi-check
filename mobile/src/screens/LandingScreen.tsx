import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const FEATURES = [
  { icon: 'pie-chart', label: 'Smart insights' },
  { icon: 'wallet', label: 'Budgets & goals' },
  { icon: 'shield-checkmark', label: 'Private by design' },
] as const;

/** First screen new users see: hero, live-looking preview card, feature chips, one clear CTA. */
export function LandingScreen({ onStart }: { onStart: () => void }) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const enter = (d: number) => (reduce ? undefined : FadeInDown.delay(d).duration(550).springify().damping(16));

  return (
    <LinearGradient colors={['#070C16', '#101827', '#0B3B38']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
      <View style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: '#12B886', opacity: 0.16 }} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>
        <Animated.View entering={enter(0)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <LinearGradient colors={['#3DDBA9', '#12B886']} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#06241C', fontSize: 22, fontWeight: '900' }}>₹</Text>
          </LinearGradient>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>Paisa</Text>
        </Animated.View>

        <Animated.View entering={enter(120)} style={{ marginTop: 36 }}>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1.4, lineHeight: 46 }}>Know where{'\n'}every <Text style={{ color: '#3DDBA9' }}>rupee</Text> goes.</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16.5, lineHeight: 25, marginTop: 14 }}>
            Track UPI spends, income and budgets in one calm, private place.
          </Text>
        </Animated.View>

        <Animated.View entering={reduce ? undefined : FadeInUp.delay(300).duration(650).springify().damping(15)} style={{ marginTop: 32, transform: [{ rotate: '-2deg' }] }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderRadius: 24, padding: 20 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Spent this month</Text>
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 4 }}>₹18,420</Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 14, overflow: 'hidden' }}>
              <LinearGradient colors={['#3DDBA9', '#12B886']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: '62%', height: 8, borderRadius: 4 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>62% of ₹30,000 budget</Text>
              <Text style={{ color: '#3DDBA9', fontSize: 12, fontWeight: '700' }}>On track</Text>
            </View>
            {[['Swiggy', 'Food', '−₹349', '#F06565'], ['Salary', 'Income', '+₹52,000', '#3DDBA9']].map(([n, c, a, col]) => (
              <View key={n} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={n === 'Swiggy' ? 'restaurant' : 'cash'} size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{n}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{c}</Text>
                </View>
                <Text style={{ color: col, fontWeight: '800' }}>{a}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={enter(500)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 28 }}>
          {FEATURES.map((f) => (
            <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(18,184,134,0.16)' }}>
              <Ionicons name={f.icon} size={15} color="#3DDBA9" />
              <Text style={{ color: '#CFF7E8', fontSize: 13, fontWeight: '600' }}>{f.label}</Text>
            </View>
          ))}
        </Animated.View>

        <View style={{ flex: 1, minHeight: 28 }} />
        <Animated.View entering={enter(650)}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onStart(); }}
            accessibilityRole="button" accessibilityLabel="Get started"
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
          >
            <LinearGradient colors={['#3DDBA9', '#12B886']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: '#04130E', fontSize: 17, fontWeight: '800' }}>Get started</Text>
              <Ionicons name="arrow-forward" size={20} color="#04130E" />
            </LinearGradient>
          </Pressable>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5, textAlign: 'center', marginTop: 14 }}>Your data stays on this device. No UPI PIN, ever.</Text>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}
