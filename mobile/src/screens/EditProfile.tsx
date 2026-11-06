import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTheme, space, radius } from '../theme';
import { Button, Card, Eyebrow, Tap } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { saveProfile, validateEmail, validatePhoneOptional, type Profile } from '../data/session';
import { setAvatarLocal, useAvatar } from '../data/avatar';
import * as api from '../data/api';

/** Edit name / phone / email (re-verified by code) / photo / password. */
export function EditProfile({ visible, profile, onClose, onProfile }: { visible: boolean; profile: Profile; onClose: () => void; onProfile: (p: Profile) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const avatar = useAvatar();
  const [user, setUser] = useState<api.AuthUser | null>(null);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [emailStep, setEmailStep] = useState<'idle' | 'code'>('idle');
  const [otp, setOtp] = useState('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const apply = async (u: api.AuthUser) => {
    setUser(u);
    const p: Profile = { ...profile, name: u.name, contact: u.contact, email: u.email, phone: u.phone };
    await saveProfile(p); onProfile(p);
  };
  useEffect(() => {
    if (!visible) return;
    setMsg(null); setEmailStep('idle'); setOtp(''); setNewEmail(''); setCur(''); setNext('');
    api.me().then(async (r) => { setName(r.user.name); setPhone(r.user.phone ?? ''); setAvatarLocal(r.user.avatar); await apply(r.user); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const run = async (key: string, okText: string, fn: () => Promise<void>) => {
    setBusy(key); setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, t: okText }); } catch (e) { setMsg({ ok: false, t: (e as Error).message }); } finally { setBusy(null); }
  };

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    await run('photo', 'Photo updated.', async () => {
      const out = await ImageManipulator.manipulateAsync(r.assets[0]!.uri, [{ resize: { width: 256, height: 256 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      const res = await api.setAvatar(`data:image/jpeg;base64,${out.base64}`);
      setAvatarLocal(res.user.avatar);
    });
  };
  const dropPhoto = () => run('photo', 'Photo removed.', async () => { const r = await api.removeAvatar(); setAvatarLocal(r.user.avatar); });

  const saveDetails = () => {
    const pe = validatePhoneOptional(phone);
    if (name.trim().length < 2) return setMsg({ ok: false, t: 'Enter your name' });
    if (pe) return setMsg({ ok: false, t: pe });
    run('save', 'Profile saved.', async () => { const r = await api.updateProfile({ name: name.trim(), phone: phone.trim() }); await apply(r.user); });
  };
  const sendEmailCode = () => {
    const e = validateEmail(newEmail); if (e) return setMsg({ ok: false, t: e });
    run('email', `Code sent to ${newEmail.trim().toLowerCase()}.`, async () => { await api.changeEmailStart(newEmail.trim()); setEmailStep('code'); });
  };
  const confirmEmail = () => run('email', 'Email updated.', async () => { const r = await api.changeEmailVerify(otp); await apply(r.user); setEmailStep('idle'); setOtp(''); setNewEmail(''); });
  const savePassword = () => {
    if (next.length < 8) return setMsg({ ok: false, t: 'New password must be at least 8 characters' });
    run('pw', 'Password changed.', async () => { await api.changePassword(cur, next); setCur(''); setNext(''); });
  };

  const input = { backgroundColor: colors.bg, borderRadius: radius.md, height: 50, paddingHorizontal: 14, color: colors.text, fontSize: 16, borderWidth: 1.5, borderColor: colors.border } as const;
  const label = (t: string) => <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>{t}</Text>;
  const hasEmail = !!user?.email;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 8, paddingHorizontal: space.lg, paddingBottom: 8, gap: 12 }}>
          <Tap onPress={onClose} label="Close" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Tap>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>Edit profile</Text>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 40, gap: space.lg }}>
          {!!msg && <View style={{ backgroundColor: (msg.ok ? colors.income : colors.expense) + '22', borderRadius: radius.md, padding: 12 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: msg.ok ? colors.income : colors.expense, fontWeight: '600' }}>{msg.t}</Text></View>}

          <Card style={{ alignItems: 'center', gap: 14 }}>
            <Tap onPress={pickPhoto} label="Change profile photo">
              <View>
                <Avatar name={name || profile.name} size={104} />
                <View style={{ position: 'absolute', right: 0, bottom: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand, borderWidth: 3, borderColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="camera" size={16} color={colors.onBrand} />
                </View>
              </View>
            </Tap>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <View style={{ flex: 1 }}><Button title={busy === 'photo' ? 'Uploading…' : avatar ? 'Change photo' : 'Add photo'} variant="ghost" disabled={busy === 'photo'} onPress={pickPhoto} /></View>
              {!!avatar && <View style={{ flex: 1 }}><Button title="Remove" variant="ghost" disabled={busy === 'photo'} onPress={dropPhoto} /></View>}
            </View>
          </Card>

          <Card>
            <Eyebrow>Details</Eyebrow>
            <View style={{ marginTop: 12 }}>{label('Name')}<TextInput value={name} onChangeText={setName} style={input} autoCapitalize="words" accessibilityLabel="Name" placeholderTextColor={colors.textMuted} /></View>
            <View style={{ marginTop: 14 }}>{label('Mobile number (optional)')}<TextInput value={phone} onChangeText={setPhone} style={input} keyboardType="phone-pad" maxLength={14} placeholder="98765 43210" accessibilityLabel="Mobile number" placeholderTextColor={colors.textMuted} /></View>
            <View style={{ marginTop: 16 }}><Button title={busy === 'save' ? 'Saving…' : 'Save changes'} disabled={busy === 'save'} onPress={saveDetails} /></View>
          </Card>

          <Card>
            <Eyebrow>Email</Eyebrow>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Ionicons name={hasEmail ? 'checkmark-circle' : 'alert-circle'} size={20} color={hasEmail ? colors.income : colors.warning} />
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{user?.email ?? profile.email ?? 'No email added yet'}</Text>
            </View>
            {!hasEmail && <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 6 }}>Add an email so you can reset your password if you forget it.</Text>}
            <View style={{ marginTop: 14 }}>
              {label(hasEmail ? 'Change email' : 'Add email')}
              <TextInput value={newEmail} onChangeText={setNewEmail} style={input} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="new@email.com" accessibilityLabel="New email" placeholderTextColor={colors.textMuted} editable={emailStep === 'idle'} />
            </View>
            {emailStep === 'code' && <View style={{ marginTop: 14 }}>
              {label('6-digit code sent to the new address')}
              <TextInput value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))} style={{ ...input, textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 8 }} keyboardType="number-pad" maxLength={6} accessibilityLabel="Email verification code" autoFocus />
            </View>}
            <View style={{ marginTop: 16, gap: 8 }}>
              {emailStep === 'idle'
                ? <Button title={busy === 'email' ? 'Sending…' : 'Send verification code'} variant="ghost" disabled={busy === 'email' || !newEmail} onPress={sendEmailCode} />
                : <><Button title={busy === 'email' ? 'Verifying…' : 'Verify email'} disabled={busy === 'email' || otp.length !== 6} onPress={confirmEmail} />
                    <Button title="Use a different email" variant="ghost" onPress={() => { setEmailStep('idle'); setOtp(''); }} /></>}
            </View>
          </Card>

          <Card>
            <Eyebrow>Change password</Eyebrow>
            <View style={{ marginTop: 12 }}>{label('Current password')}<TextInput value={cur} onChangeText={setCur} style={input} secureTextEntry autoCapitalize="none" accessibilityLabel="Current password" placeholderTextColor={colors.textMuted} /></View>
            <View style={{ marginTop: 14 }}>{label('New password')}<TextInput value={next} onChangeText={setNext} style={input} secureTextEntry autoCapitalize="none" placeholder="At least 8 characters" accessibilityLabel="New password" placeholderTextColor={colors.textMuted} /></View>
            <View style={{ marginTop: 16 }}><Button title={busy === 'pw' ? 'Updating…' : 'Update password'} variant="ghost" disabled={busy === 'pw' || !cur || !next} onPress={savePassword} /></View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
