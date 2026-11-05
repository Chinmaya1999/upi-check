import React from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, space } from '../theme';
import { useStore } from '../data/store';
import { Button, Card, Eyebrow } from '../components/ui';
import { SyncCard } from '../components/SyncCard';
import { clearProfile, saveProfile, type Profile } from '../data/session';
import * as api from '../data/api';

export function ProfileScreen({ profile, onProfile, onSignOut }: { profile: Profile; onProfile: (p: Profile) => void; onSignOut: () => void }) {
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { reset, txns, server, pushToServer } = useStore();

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
      await api.clearToken(); await reset(); await clearProfile(); onSignOut();
    } },
  ]);

  const signOut = async () => {
    const ok = await pushToServer(); // never leave unsynced data behind
    if (!ok && !(await new Promise<boolean>((res) => Alert.alert('Backup failed', 'Some data could not be uploaded and will be lost if you sign out. Sign out anyway?', [
      { text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: 'Sign out', style: 'destructive', onPress: () => res(true) }])))) return;
    try { await api.logout(); } catch { /* token is dropped locally either way */ }
    await api.clearToken(); await reset(); await clearProfile(); onSignOut();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: 120, paddingHorizontal: space.lg, gap: space.lg }}>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>Profile</Text>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.onBrand, fontSize: 24, fontWeight: '800' }}>{profile.name[0]?.toUpperCase()}</Text>
        </View>
        <View><Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{profile.name}</Text><Text style={{ color: colors.textMuted }}>{profile.contact}</Text></View>
      </Card>

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
        <Eyebrow>Security & privacy</Eyebrow>
        {row('finger-print', 'Biometric lock', 'Require fingerprint / face on launch',
          <Switch value={profile.biometricLock} trackColor={{ true: colors.brand }} accessibilityLabel="Biometric lock"
            onValueChange={async (v) => { const p = { ...profile, biometricLock: v }; await saveProfile(p); onProfile(p); }} />)}
        {row('shield-checkmark', 'Data on this device', `${txns.length} transactions stored locally in SQLite`)}
        {row('ban', 'Never collected', 'UPI PIN, OTP, bank passwords, payment-app logins')}
      </Card>

      <SyncCard />

      <Card style={{ gap: 10 }}>
        <Eyebrow>Account backup</Eyebrow>
        {row('cloud-done', server.state === 'error' ? 'Backup failed' : server.state === 'syncing' ? 'Backing up…' : server.at ? 'Backed up' : 'Signed in',
          server.state === 'error' ? (server.message ?? '') : server.at ? `Last backup ${new Date(server.at).toLocaleTimeString()}` : 'Transactions are saved to your account after every sync.')}
        <Button title="Back up now" variant="ghost" onPress={() => { pushToServer(); }} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Eyebrow>Data</Eyebrow>
        <Button title="Delete all my data" variant="ghost" onPress={wipe} />
      </Card>
      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>Paisa 0.1.0 · Phase 1</Text>
    </ScrollView>
  );
}
