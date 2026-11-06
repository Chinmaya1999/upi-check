import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, space, radius } from '../theme';
import { Button, Tap } from '../components/ui';
import { biometricsAvailable, saveProfile, validateContact, validateEmail, validatePhoneOptional, type Profile } from '../data/session';
import { setAvatarLocal } from '../data/avatar';
import * as api from '../data/api';
import { useStore } from '../data/store';

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const RESEND_SEC = 45;

/** One-time-code box: big, centred, numeric; autofills from the SMS/clipboard suggestion where the OS offers it. */
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  return (
    <TextInput value={value} onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" placeholderTextColor={colors.textMuted}
      keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="one-time-code" accessibilityLabel="6-digit code" autoFocus
      style={{ backgroundColor: colors.card, borderRadius: radius.md, height: 64, textAlign: 'center', color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 12,
        borderWidth: 1.5, borderColor: value.length === 6 ? colors.brand : colors.border }} />
  );
}

export function AuthForm({ initial, onDone, onBack }: { initial: 'login' | 'register'; onDone: (p: Profile) => void; onBack?: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { pullFromServer, pushToServer } = useStore();
  const [mode, setMode] = useState<Mode>(initial);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [show, setShow] = useState(false);
  const [otp, setOtp] = useState('');
  const [bio, setBio] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState<Record<string, string | undefined>>({});
  useEffect(() => { biometricsAvailable().then((ok) => { setBioOk(ok); setBio(ok); }).catch(() => setBioOk(false)); }, []);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const go = (m: Mode) => { setMode(m); setErr({}); setFormErr(null); setOtp(''); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setFormErr(null);
    try { await fn(); } catch (ex) { setFormErr((ex as Error).message); } finally { setBusy(false); }
  };

  /** Token + profile saved, server data pulled, local data pushed — then into the app. */
  const finish = async (r: api.AuthResult) => {
    await api.setToken(r.token);
    setAvatarLocal(r.user.avatar);
    const p: Profile = { name: r.user.name, contact: r.user.contact, email: r.user.email, phone: r.user.phone, biometricLock: bio && bioOk, createdAt: new Date().toISOString() };
    await saveProfile(p);
    try { await pullFromServer(); await pushToServer(); } catch { /* shown in Profile; the account itself is fine */ }
    onDone(p);
  };

  const doLogin = () => {
    const e = { login: validateContact(login) ?? undefined, password: password ? undefined : 'Enter your password' };
    setErr(e); if (e.login || e.password) return;
    run(async () => finish(await api.login(login.trim(), password)));
  };
  const doRegister = () => {
    const e = {
      name: name.trim().length < 2 ? 'Enter your name' : undefined,
      email: validateEmail(email) ?? undefined,
      phone: validatePhoneOptional(phone) ?? undefined,
      password: password.length < 8 ? 'Use at least 8 characters' : undefined,
    };
    setErr(e); if (Object.values(e).some(Boolean)) return;
    run(async () => { await api.registerStart(name.trim(), email.trim(), phone.trim(), password); setWait(RESEND_SEC); setNotice(null); go('verify'); });
  };
  const doVerify = () => {
    if (otp.length !== 6) { setErr({ otp: 'Enter the 6-digit code' }); return; }
    run(async () => finish(await api.registerVerify(email.trim(), otp)));
  };
  const doResend = () => run(async () => {
    await (mode === 'verify' ? api.registerResend(email.trim()) : api.forgotPassword(email.trim()));
    setWait(RESEND_SEC); setNotice('A new code is on its way.');
  });
  const doForgot = () => {
    const e = validateEmail(email); setErr({ email: e ?? undefined }); if (e) return;
    run(async () => { await api.forgotPassword(email.trim()); setWait(RESEND_SEC); setNotice(null); go('reset'); });
  };
  const doReset = () => {
    const e = { otp: otp.length === 6 ? undefined : 'Enter the 6-digit code', password: password.length < 8 ? 'Use at least 8 characters' : undefined, password2: password2 !== password ? 'Passwords don’t match' : undefined };
    setErr(e); if (e.otp || e.password || e.password2) return;
    run(async () => {
      await api.resetPassword(email.trim(), otp, password);
      setLogin(email.trim()); setPassword(''); setPassword2(''); go('login'); setNotice('Password updated. Log in with your new password.');
    });
  };

  const input = (bad?: string) => ({
    backgroundColor: colors.card, borderRadius: radius.md, height: 54, paddingHorizontal: 16, color: colors.text, fontSize: 16,
    borderWidth: 1.5, borderColor: bad ? colors.expense : colors.border,
  });
  const field = (label: string, node: React.ReactNode, e?: string, hint?: string) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
      {node}
      {!!e && <Text style={{ color: colors.expense, fontSize: 13 }}>{e}</Text>}
      {!e && !!hint && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{hint}</Text>}
    </View>
  );
  const pwField = (label: string, v: string, set: (s: string) => void, e?: string, ph = 'At least 8 characters') => field(label, (
    <View>
      <TextInput value={v} onChangeText={set} placeholder={ph} placeholderTextColor={colors.textMuted} style={{ ...input(e), paddingRight: 48 }} accessibilityLabel={label} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} />
      <Tap onPress={() => setShow(!show)} label={show ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 6, top: 0, height: 54, width: 42, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
      </Tap>
    </View>
  ), e);

  const head: Record<Mode, [string, string]> = {
    login: ['Welcome back', 'Log in to restore your transactions on this phone.'],
    register: ['Create your account', 'Your account backs up your transactions to the Paisa server so you can restore them on a new phone.'],
    verify: ['Check your email', `We sent a 6-digit code to ${email.trim().toLowerCase()}. Enter it to finish creating your account.`],
    forgot: ['Forgot password?', 'Enter your account email and we’ll send a code to reset your password.'],
    reset: ['Reset password', `Enter the code we sent to ${email.trim().toLowerCase()} and choose a new password.`],
  };
  const resendRow = (
    <Tap onPress={wait > 0 || busy ? undefined : doResend} label="Resend code" disabled={wait > 0 || busy} style={{ alignItems: 'center', paddingVertical: 6 }}>
      <Text style={{ color: wait > 0 ? colors.textMuted : colors.brand, fontWeight: '700' }}>{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</Text>
    </Tap>
  );
  const link = (t: string, m: Mode) => (
    <Tap onPress={() => go(m)} label={t} style={{ alignItems: 'center', paddingVertical: 8 }}><Text style={{ color: colors.brand, fontWeight: '700' }}>{t}</Text></Tap>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24, paddingHorizontal: space.xl, gap: space.lg, flexGrow: 1 }}>
        <Animated.View key={mode} entering={reduce ? undefined : FadeIn.duration(350)} style={{ gap: space.lg }}>
          {(mode === 'verify' || mode === 'forgot' || mode === 'reset') && (
            <Tap onPress={() => go(mode === 'verify' ? 'register' : 'login')} label="Back" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </Tap>
          )}
          {(mode === 'verify' || mode === 'reset') && (
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.brand + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={mode === 'verify' ? 'mail-open' : 'key'} size={30} color={colors.brand} />
            </View>
          )}
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.7 }}>{head[mode][0]}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>{head[mode][1]}</Text>
          {!!notice && <View style={{ backgroundColor: colors.income + '22', borderRadius: radius.md, padding: 12 }}><Text style={{ color: colors.income, fontWeight: '600' }} accessibilityLiveRegion="polite">{notice}</Text></View>}

          {mode === 'register' && <>
            {field('Name', <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.textMuted} style={input(err.name)} accessibilityLabel="Name" autoCapitalize="words" />, err.name)}
            {field('Email', <TextInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor={colors.textMuted} style={input(err.email)} accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />, err.email, 'We’ll email a code to verify it.')}
            {field('Mobile number (optional)', <TextInput value={phone} onChangeText={setPhone} placeholder="98765 43210" placeholderTextColor={colors.textMuted} style={input(err.phone)} accessibilityLabel="Mobile number, optional" keyboardType="phone-pad" maxLength={14} />, err.phone)}
            {pwField('Password', password, setPassword, err.password)}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 12, opacity: bioOk ? 1 : 0.55 }}>
              <Ionicons name="finger-print" size={26} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Biometric lock</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{bioOk ? 'Ask for fingerprint / face when opening the app' : 'Not available — no biometrics enrolled on this device'}</Text>
              </View>
              <Switch value={bio && bioOk} onValueChange={setBio} disabled={!bioOk} trackColor={{ true: colors.brand }} accessibilityLabel="Enable biometric lock" />
            </View>
          </>}

          {mode === 'login' && <>
            {field('Email or mobile number', <TextInput value={login} onChangeText={setLogin} placeholder="you@email.com or 98765 43210" placeholderTextColor={colors.textMuted} style={input(err.login)} accessibilityLabel="Email or mobile number" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />, err.login)}
            {pwField('Password', password, setPassword, err.password, 'Your password')}
            <Tap onPress={() => { setEmail(login.includes('@') ? login : email); go('forgot'); }} label="Forgot password?" style={{ alignSelf: 'flex-end' }}>
              <Text style={{ color: colors.brand, fontWeight: '700' }}>Forgot password?</Text>
            </Tap>
          </>}

          {mode === 'verify' && <>
            <OtpInput value={otp} onChange={(v) => { setOtp(v); setErr({}); }} />
            {!!err.otp && <Text style={{ color: colors.expense, fontSize: 13 }}>{err.otp}</Text>}
            {resendRow}
            <Text style={{ color: colors.textMuted, fontSize: 12.5, textAlign: 'center' }}>Can’t find it? Check your spam folder. The code is valid for 10 minutes.</Text>
          </>}

          {mode === 'forgot' && field('Email', <TextInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor={colors.textMuted} style={input(err.email)} accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoFocus />, err.email)}

          {mode === 'reset' && <>
            <OtpInput value={otp} onChange={(v) => { setOtp(v); setErr({}); }} />
            {!!err.otp && <Text style={{ color: colors.expense, fontSize: 13 }}>{err.otp}</Text>}
            {pwField('New password', password, setPassword, err.password)}
            {pwField('Confirm new password', password2, setPassword2, err.password2, 'Repeat the password')}
            {resendRow}
          </>}
        </Animated.View>
        <View style={{ flex: 1 }} />
        {!!formErr && <Text style={{ color: colors.expense, fontSize: 14, textAlign: 'center' }} accessibilityLiveRegion="polite">{formErr}</Text>}
        {mode === 'login' && <><Button title={busy ? 'Please wait…' : 'Log in'} disabled={busy} onPress={doLogin} />{link('Create a new account', 'register')}</>}
        {mode === 'register' && <><Button title={busy ? 'Sending code…' : 'Send verification code'} disabled={busy} onPress={doRegister} />{link('I already have an account', 'login')}</>}
        {mode === 'verify' && <Button title={busy ? 'Verifying…' : 'Verify & create account'} disabled={busy || otp.length !== 6} onPress={doVerify} />}
        {mode === 'forgot' && <><Button title={busy ? 'Sending code…' : 'Send reset code'} disabled={busy} onPress={doForgot} />{link('Back to log in', 'login')}</>}
        {mode === 'reset' && <Button title={busy ? 'Updating…' : 'Update password'} disabled={busy} onPress={doReset} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
