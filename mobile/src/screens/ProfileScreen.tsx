import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, space } from '../theme';
import { useStore } from '../data/store';
import { Button, Card, Eyebrow } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { setAvatarLocal } from '../data/avatar';
import { EditProfile } from './EditProfile';
import { FeedbackModal } from './FeedbackModal';
import { SyncCard } from '../components/SyncCard';
import { clearProfile, saveProfile, type Profile } from '../data/session';
import * as api from '../data/api';
import { secureScreenEnabled, setSecureScreen, ensureNotifyPermission, lockScreenCardEnabled, paymentNotificationsEnabled, setLockScreenCard, setPaymentNotifications } from '../data/inbox';

export function ProfileScreen({ profile, onProfile, onSignOut }: { profile: Profile; onProfile: (p: Profile) => void; onSignOut: () => void }) {
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { reset, txns, server, pushToServer } = useStore();
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [secure, setSecure] = useState(true);
  const [lockCard, setLockCard] = useState(false);
  const [payNotif, setPayNotif] = useState(true);
  useEffect(() => { secureScreenEnabled().then(setSecure).catch(() => {}); lockScreenCardEnabled().then(setLockCard).catch(() => {}); paymentNotificationsEnabled().then(setPayNotif).catch(() => {}); }, []);

  const row = (icon: string, title: string, sub: string, right?: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <Ionicons name={icon as never} size={22} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 1 }}>{sub}</Text>
      </View>
      {right}
    </View>
  );

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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: 120, paddingHorizontal: space.lg, gap: space.lg }}>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>Profile</Text>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={profile.name} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{profile.name.trim().replace(/(^|\s)(\S)/g, (_, sp: string, c: string) => sp + c.toUpperCase())}</Text>
            <Text style={{ color: colors.textMuted }} numberOfLines={1}>{profile.email ?? profile.contact}</Text>
            {!!profile.phone && <Text style={{ color: colors.textMuted, fontSize: 13 }}>{profile.phone}</Text>}
          </View>
        </View>
        <Button title="Edit profile" variant="ghost" onPress={() => setEditing(true)} />
      </Card>
      <EditProfile visible={editing} profile={profile} onClose={() => setEditing(false)} onProfile={onProfile} />

      <Card>
        <Eyebrow>Appearance</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {(['system', 'light', 'dark'] as const).map((m) => (
            <View key={m} style={{ flex: 1 }}>
              <Button title={m[0]!.toUpperCase() + m.slice(1)} variant={mode === m ? 'primary' : 'ghost'} onPress={() => setMode(m)} />
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Eyebrow>Widgets & lock screen</Eyebrow>
        {row('lock-closed', 'Show spend on lock screen', 'Shows today\'s spend to anyone who picks up your locked phone — off by default',
          <Switch value={lockCard} trackColor={{ true: colors.brand }} accessibilityLabel="Show spend on lock screen"
            onValueChange={async (v) => { setLockCard(v); if (v) await ensureNotifyPermission(); setLockScreenCard(v); }} />)}
        {row('notifications', 'Payment notifications', 'A colourful "₹30 spent" / "₹500 received" alert the moment a payment is detected',
          <Switch value={payNotif} trackColor={{ true: colors.brand }} accessibilityLabel="Payment notifications"
            onValueChange={async (v) => { setPayNotif(v); if (v) await ensureNotifyPermission(); setPaymentNotifications(v); }} />)}
        {row('apps', 'Home-screen widgets', 'Long-press your home screen → Widgets → Paisa. Pick the small (2×1) or large (4×2) one.')}
      </Card>

      <Card>
        <Eyebrow>Security & privacy</Eyebrow>
        {row('finger-print', 'Biometric lock', 'Require fingerprint / face on launch',
          <Switch value={profile.biometricLock} trackColor={{ true: colors.brand }} accessibilityLabel="Biometric lock"
            onValueChange={async (v) => { const p = { ...profile, biometricLock: v }; await saveProfile(p); onProfile(p); }} />)}
        {row('eye-off', 'Hide app in recents & block screenshots', 'Hides balances from the app switcher, screenshots and screen recording',
          <Switch value={secure} trackColor={{ true: colors.brand }} accessibilityLabel="Hide app in recents and block screenshots"
            onValueChange={(v) => { setSecure(v); setSecureScreen(v); }} />)}
        {row('shield-checkmark', 'Data on this device', `${txns.length} transactions stored locally in SQLite`)}
        {row('ban', 'Never collected', 'UPI PIN, OTP, bank passwords, payment-app logins')}
      </Card>

      <SyncCard />

      <Card style={{ gap: 10 }}>
        <Eyebrow>Account backup</Eyebrow>
        {row('cloud-done', server.state === 'error' ? (server.offline ? 'Offline — saved on this phone' : 'Backup failed') : server.state === 'syncing' ? 'Backing up…' : server.at ? 'Backed up' : 'Signed in',
          server.state === 'error' ? (server.offline ? 'Everything is stored locally and will back up automatically when you\'re online again.' : (server.message ?? '')) : server.at ? `Last backup ${new Date(server.at).toLocaleTimeString()}` : 'Transactions are saved to your account after every sync.')}
        <Button title="Back up now" variant="ghost" onPress={() => { pushToServer(); }} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
        <Button title="Sign out of all devices" variant="ghost" onPress={() => Alert.alert('Sign out everywhere?', 'Every phone signed in to your account, including this one, will be logged out. Use this if a phone is lost or stolen.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out all', style: 'destructive', onPress: async () => {
            try { await api.logoutAll(); } catch (e) { Alert.alert('Could not sign out', (e as Error).message); return; }
            await api.clearToken(); setAvatarLocal(null); await reset(); await clearProfile(); onSignOut();
          } }])} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Eyebrow>Help us improve</Eyebrow>
        {row('chatbubble-ellipses', 'Send feedback', 'Tell us what\'s working, what\'s not, or what you\'d love to see next. We read every message.')}
        <Button title="Write feedback" variant="ghost" onPress={() => setFeedback(true)} />
      </Card>
      <FeedbackModal visible={feedback} onClose={() => setFeedback(false)} />

      <Card style={{ gap: 10 }}>
        <Eyebrow>Data</Eyebrow>
        <Button title="Delete all my data" variant="ghost" onPress={wipe} />
      </Card>
      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>Paisa 0.6</Text>
    </ScrollView>
  );
}
