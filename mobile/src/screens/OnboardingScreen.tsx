import React, { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, space } from '../theme';
import { Button } from '../components/ui';
import { LandingScreen } from './LandingScreen';
import type { Profile } from '../data/session';
import { AuthForm } from './AuthForm';

const PAGES = [
  { icon: 'pie-chart', title: 'All your money, one view', body: 'Daily income and spending across every bank and UPI app, calculated from real transactions — not guesses.' },
  { icon: 'shield-checkmark', title: 'You stay in control', body: 'We only read data you consent to: bank data through RBI’s Account Aggregator framework, statements you import, and alerts you allow. Revoke any time.' },
  { icon: 'lock-closed', title: 'What we never ask for', body: 'Never your UPI PIN, OTP, bank password, or payment-app login. We don’t read other apps’ private data or use Accessibility scraping.' },
] as const;

export function OnboardingScreen({ onDone, startAtForm = false }: { onDone: (p: Profile) => void; startAtForm?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [landed, setLanded] = useState(startAtForm);
  const [step, setStep] = useState(startAtForm ? 3 : 0); // 0..2 info, 3 account form
  if (!landed) return <LandingScreen onStart={() => setLanded(true)} />;

  if (step < 3) {
    const p = PAGES[step]!;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, paddingHorizontal: space.xl }}>
        <Animated.View key={step} entering={reduce ? undefined : FadeInRight.duration(400)} style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: colors.brand + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={p.icon as never} size={40} color={colors.brand} />
          </View>
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.8, lineHeight: 38 }}>{p.title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 16.5, lineHeight: 25 }}>{p.body}</Text>
        </Animated.View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
          {PAGES.map((_, i) => <View key={i} style={{ height: 6, width: i === step ? 26 : 6, borderRadius: 3, backgroundColor: i === step ? colors.brand : colors.border }} />)}
        </View>
        <Button title={step === 2 ? 'Get started' : 'Continue'} onPress={() => setStep(step + 1)} />
      </View>
    );
  }

  return <AuthForm initial={startAtForm ? 'login' : 'register'} onDone={onDone} />;
}
