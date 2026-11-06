import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, space } from '../theme';
import { useStore } from '../data/store';
import { Card, Tap } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { setAvatarLocal } from '../data/avatar';
import { EditProfile } from './EditProfile';
import { FeedbackModal } from './FeedbackModal';
import { SyncCard } from '../components/SyncCard';
import { clearProfile, saveProfile, type Profile } from '../data/session';
import * as api from '../data/api';
import { API_URL } from '../config';
import { secureScreenEnabled, setSecureScreen, ensureNotifyPermission, lockScreenCardEnabled, paymentNotificationsEnabled, setLockScreenCard, setPaymentNotifications } from '../data/inbox';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginLeft: 6 }}>{title.toUpperCase()}</Text>
      <Card style={{ paddingVertical: 4, paddingHorizontal: 0 }}>{children}</Card>
    </View>
  );
}
/** One settings row: tinted icon, title, optional one-line hint, and a switch / chevron / value on the right. */
function Row({ icon, tint, title, sub, right, onPress, danger, first }: { icon: string; tint?: string; title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean; first?: boolean }) {
  const { colors } = useTheme();
    const c = danger ? colors.expense : (tint ?? colors.brand);
    const inner = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon as never} size={19} color={c} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: danger ? colors.expense : colors.text, fontWeight: '600', fontSize: 15.5 }}>{title}</Text>
          {!!sub && <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 17 }}>{sub}</Text>}
        </View>
        {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
      </View>
    );
    return onPress ? <Tap onPress={onPress} label={title}>{inner}</Tap> : inner;
}

export function ProfileScreen({ profile, onProfile, onSignOut }: { profile: Profile; onProfile: (p: Profile) => void; onSignOut: () => void }) {
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { reset, txns, server, pushToServer } = useStore();
  const [editing, setEditing] = useState(false);
  const [sources, setSources] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [secure, setSecure] = useState(true);
  const [lockCard, setLockCard] = useState(false);
  const [payNotif, setPayNotif] = useState(true);
  useEffect(() => { secureScreenEnabled().then(setSecure).catch(() => {}); lockScreenCardEnabled().then(setLockCard).catch(() => {}); paymentNotificationsEnabled().then(setPayNotif).catch(() => {}); }, []);

  const wipe = () => Alert.alert('Delete account and all data?', 'This permanently removes your account, every transaction on the server, and everything on this phone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.deleteAccount(); } catch (e) {
        if ((e as api.ApiError).status !== 401) { Alert.alert('Could not delete', (e as Error).message); return; }
      }
      await api.clearToken(); setAvatarLocal(null); await reset(); await clearProfile(); onSignOut();
    } },
  ]);

  const signOut = async () => {
    const ok = await pushToServer(); // never leave unsynced data behind
    if (!ok && !(await new Promise<boolean>((res) => Alert.alert('Backup failed', 'Some data could not be uploaded and will be lost if you sign out. Sign out anyway?', [
      { text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: 'Sign out', style: 'destructive', onPress: () => res(true) }])))) return;
    try { await api.logout(); } catch { /* token is dropped locally either way */ }
    await api.clearToken(); setAvatarLocal(null); await reset(); await clearProfile(); onSignOut();
  };


  const backup = server.state === 'error' ? (server.offline ? 'Offline — will back up later' : 'Backup failed') : server.state === 'syncing' ? 'Backing up…' : server.at ? `Backed up ${new Date(server.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Signed in';
  const backupColor = server.state === 'error' ? colors.expense : colors.income;

  const toggle = (v: boolean, label: string, on: (b: boolean) => void) => <Switch value={v} trackColor={{ true: colors.brand }} accessibilityLabel={label} onValueChange={on} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: 130, paddingHorizontal: space.lg, gap: space.xl }}>
      <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>Profile</Text>

      <Card style={{ gap: 16 }}>
        <Tap onPress={() => setEditing(true)} label="Edit profile">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Avatar name={profile.name} size={72} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1}>{profile.name.trim().replace(/(^|\s)(\S)/g, (_, sp: string, c: string) => sp + c.toUpperCase())}</Text>
              <Text style={{ color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{profile.email ?? profile.contact}</Text>
              {!!profile.phone && <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 1 }}>{profile.phone}</Text>}
            </View>
            <Ionicons name="create-outline" size={22} color={colors.brand} />
          </View>
        </Tap>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 12 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{txns.length}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>transactions</Text>
          </View>
          <View style={{ flex: 1.4, backgroundColor: colors.bg, borderRadius: 14, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: backupColor }} /><Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{backup}</Text></View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>account backup</Text>
          </View>
        </View>
      </Card>
      <EditProfile visible={editing} profile={profile} onClose={() => setEditing(false)} onProfile={onProfile} />

      <Section title="Account">
        <Row first icon="person" title="Edit profile" sub="Name, photo and mobile number" onPress={() => setEditing(true)} />
        <Row icon="mail" tint="#3B82F6" title="Email & password" sub={profile.email ?? 'Add an email to recover your account'} onPress={() => setEditing(true)} />
      </Section>

      <Section title="Appearance">
        <View style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, padding: 4 }}>
            {(['system', 'light', 'dark'] as const).map((m) => {
              const on = mode === m;
              return (
                <View key={m} style={{ flex: 1 }}>
                  <Tap onPress={() => setMode(m)} label={`${m} theme`} style={{ height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.brand : 'transparent' }}>
                    <Text style={{ color: on ? colors.onBrand : colors.text, fontWeight: '700', textTransform: 'capitalize' }}>{m}</Text>
                  </Tap>
                </View>
              );
            })}
          </View>
        </View>
      </Section>

      <Section title="Notifications">
        <Row first icon="notifications" tint="#F59E0B" title="Payment alerts" sub="A colourful heads-up when a payment is detected" right={toggle(payNotif, 'Payment notifications', async (v) => { setPayNotif(v); if (v) await ensureNotifyPermission(); setPaymentNotifications(v); })} />
        <Row icon="lock-closed" tint="#8B5CF6" title="Spend on lock screen" sub="Shows today's spend to anyone holding your phone" right={toggle(lockCard, 'Show spend on lock screen', async (v) => { setLockCard(v); if (v) await ensureNotifyPermission(); setLockScreenCard(v); })} />
      </Section>

      <Section title="Privacy & security">
        <Row first icon="finger-print" tint="#10B981" title="Biometric lock" sub="Ask for fingerprint or face when opening" right={toggle(profile.biometricLock, 'Biometric lock', async (v) => { const p = { ...profile, biometricLock: v }; await saveProfile(p); onProfile(p); })} />
        <Row icon="eye-off" tint="#6366F1" title="Hide in recents & screenshots" sub="Keeps balances out of the app switcher" right={toggle(secure, 'Hide app in recents and block screenshots', (v) => { setSecure(v); setSecureScreen(v); })} />
        <Row icon="phone-portrait" tint="#EF4444" title="Sign out of all devices" sub="Use this if a phone is lost or stolen" onPress={() => Alert.alert('Sign out everywhere?', 'Every phone signed in to your account, including this one, will be logged out.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out all', style: 'destructive', onPress: async () => {
            try { await api.logoutAll(); } catch (e) { Alert.alert('Could not sign out', (e as Error).message); return; }
            await api.clearToken(); setAvatarLocal(null); await reset(); await clearProfile(); onSignOut();
          } }])} />
      </Section>

      <Section title="Data & backup">
        <Row first icon="phone-portrait-outline" tint="#0EA5E9" title="Live data from this phone" sub="Bank SMS and payment-app access" onPress={() => setSources(!sources)} right={<Ionicons name={sources ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />} />
        {sources && <View style={{ padding: 12 }}><SyncCard /></View>}
        <Row icon="cloud-upload" tint="#14B8A6" title="Back up now" sub={backup} onPress={() => { pushToServer(); }} />
        <Row icon="apps" tint="#64748B" title="Home-screen widgets" sub="Long-press your home screen → Widgets → Paisa" />
      </Section>

      <Section title="Help">
        <Row first icon="chatbubble-ellipses" tint="#EC4899" title="Send feedback" sub="Ideas, problems or praise — we read every message" onPress={() => setFeedback(true)} />
        <Row icon="shield-checkmark" tint="#64748B" title="Privacy policy" onPress={() => Linking.openURL(`${API_URL}/privacy`).catch(() => {})} />
      </Section>
      <FeedbackModal visible={feedback} onClose={() => setFeedback(false)} />

      <Section title="Session">
        <Row first icon="log-out" tint="#64748B" title="Sign out" onPress={signOut} />
        <Row icon="trash" danger title="Delete account & all data" sub="Permanent. Removes everything from this phone and the server" onPress={wipe} />
      </Section>

      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>Paisa 0.6 · Made in India 🇮🇳</Text>
    </ScrollView>
  );
}
