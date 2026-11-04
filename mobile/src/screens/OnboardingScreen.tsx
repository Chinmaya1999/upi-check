import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, space, radius } from '../theme';
import { Button } from '../components/ui';
import { LandingScreen } from './LandingScreen';
import { biometricsAvailable, saveProfile, validateContact, type Profile } from '../data/session';
import * as api from '../data/api';
import { useStore } from '../data/store';

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
  const { pullFromServer, pushToServer } = useStore();
  const [landed, setLanded] = useState(startAtForm);
  const [step, setStep] = useState(startAtForm ? 3 : 0); // 0..2 info, 3 account form
  const [mode, setMode] = useState<'register' | 'login'>(startAtForm ? 'login' : 'register');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [bio, setBio] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  const [err, setErr] = useState<{ name?: string; contact?: string; password?: string }>({});
  useEffect(() => { biometricsAvailable().then(setBioOk).catch(() => setBioOk(false)); }, []);

  const submit = async () => {
    const reg = mode === 'register';
    const e = {
      name: reg && name.trim().length < 2 ? 'Enter your name' : undefined,
      contact: validateContact(contact) ?? undefined,
      password: password.length < 8 ? 'Use at least 8 characters' : undefined,
    };
    setErr(e); setFormErr(null);
    if (e.name || e.contact || e.password) return;
    setBusy(true);
    try {
      const r = reg ? await api.register(name.trim(), contact.trim(), password) : await api.login(contact.trim(), password);
      await api.setToken(r.token);
      const p: Profile = { name: r.user.name, contact: r.user.contact, biometricLock: bio && bioOk, createdAt: new Date().toISOString() };
      await saveProfile(p);
      // Bring down anything already on the account, then back up what's on this phone.
      try { await pullFromServer(); await pushToServer(); } catch { /* shown in Profile; the account itself is created */ }
      onDone(p);
    } catch (ex) {
      setFormErr((ex as Error).message);
    } finally { setBusy(false); }
  };

  const input = (bad?: string) => ({
    backgroundColor: colors.card, borderRadius: radius.md, height: 54, paddingHorizontal: 16, color: colors.text, fontSize: 16,
    borderWidth: 1.5, borderColor: bad ? colors.expense : colors.border,
  });

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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, paddingHorizontal: space.xl, gap: space.lg, flexGrow: 1 }}>
        <Animated.View entering={reduce ? undefined : FadeIn.duration(400)} style={{ gap: space.lg }}>
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.7 }}>{mode === 'register' ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
            {mode === 'register' ? 'Your account backs up your transactions to the Paisa server so you can restore them on a new phone.' : 'Log in to restore your transactions on this phone.'}
          </Text>
          {mode === 'register' && <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.textMuted} style={input(err.name)} accessibilityLabel="Name" autoCapitalize="words" />
            {!!err.name && <Text style={{ color: colors.expense, fontSize: 13 }}>{err.name}</Text>}
          </View>}
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Mobile number or email</Text>
            <TextInput value={contact} onChangeText={setContact} placeholder="98765 43210 or you@email.com" placeholderTextColor={colors.textMuted} style={input(err.contact)} accessibilityLabel="Mobile number or email" autoCapitalize="none" keyboardType="email-address" />
            {!!err.contact && <Text style={{ color: colors.expense, fontSize: 13 }}>{err.contact}</Text>}
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Password</Text>
            <TextInput value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor={colors.textMuted} style={input(err.password)} accessibilityLabel="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} />
            {!!err.password && <Text style={{ color: colors.expense, fontSize: 13 }}>{err.password}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 12, opacity: bioOk ? 1 : 0.55 }}>
            <Ionicons name="finger-print" size={26} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Biometric lock</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{bioOk ? 'Ask for fingerprint / face when opening the app' : 'Not available — no biometrics enrolled on this device'}</Text>
            </View>
            <Switch value={bio && bioOk} onValueChange={setBio} disabled={!bioOk} trackColor={{ true: colors.brand }} accessibilityLabel="Enable biometric lock" />
          </View>
        </Animated.View>
        <View style={{ flex: 1 }} />
        {!!formErr && <Text style={{ color: colors.expense, fontSize: 14, textAlign: 'center' }} accessibilityLiveRegion="polite">{formErr}</Text>}
        <Button title={busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'} disabled={busy} onPress={submit} />
        <Button title={mode === 'register' ? 'I already have an account' : 'Create a new account'} variant="ghost" disabled={busy}
          onPress={() => { setMode(mode === 'register' ? 'login' : 'register'); setErr({}); setFormErr(null); }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
