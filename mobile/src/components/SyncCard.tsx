import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useStore } from '../data/store';
import { hasSmsPermission, inboxAvailable, notificationAccessEnabled, openNotificationAccess, requestSmsPermission } from '../data/inbox';
import { Button, Card, Eyebrow } from './ui';

/** Where real data comes from: bank SMS (history) and UPI-app notifications (per-app attribution). */
export function SyncCard() {
  const { colors } = useTheme();
  const { syncDevice, lastSync } = useStore();
  const [sms, setSms] = useState(false);
  const [ntf, setNtf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const check = useCallback(async () => { setSms(await hasSmsPermission()); setNtf(await notificationAccessEnabled()); }, []);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { check(); }, [check]);

  // Coming back from system settings: re-check, and start reading transactions as soon as SMS access was granted.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (st) => {
      if (st !== 'active') return;
      const had = sms;
      await check();
      if (!had && (await hasSmsPermission())) { setBlocked(false); sync(); }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sms, check]);

  const sync = async () => {
    setBusy(true);
    try {
      if (!(await hasSmsPermission()) && !(await requestSmsPermission())) {
        // Sideloaded APKs get "restricted settings": Android silently denies SMS/notification access until allowed in App info.
        setBlocked(true);
        setMsg('Android blocked SMS access for this installed app. Open App info → ⋮ (top right) → “Allow restricted settings”, then Permissions → SMS → Allow, and come back.');
        return;
      }
      setBlocked(false);
      const r = await syncDevice();
      setMsg(r.message);
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(false); check(); }
  };

  if (!inboxAvailable) return null;
  const row = (ok: boolean, title: string, sub: string) => (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={ok ? colors.income : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{sub}</Text>
      </View>
    </View>
  );
  return (
    <Card style={{ gap: 12 }}>
      <Eyebrow>Live data from this phone</Eyebrow>
      {row(sms, 'Bank SMS', sms ? 'Reading debit/credit alerts. OTPs are ignored.' : 'Reads past + new debit/credit alerts from your banks.')}
      {row(ntf, 'Payment-app notifications', ntf ? 'GPay, PhonePe, Paytm, BHIM payments are tagged by app.' : 'Tags each payment with the app you used (from now on).')}
      {!ntf && <Button title="Enable app tagging" variant="ghost" onPress={() => { setBlocked(true); openNotificationAccess(); }} />}
      {blocked && <Button title="Open app settings" variant="ghost" onPress={() => Linking.openSettings()} />}
      <Button title={busy ? 'Syncing…' : sms ? 'Sync now' : 'Allow SMS & sync'} disabled={busy} onPress={sync} />
      {!!msg && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{msg}</Text>}
      <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
        {lastSync ? `Last sync ${new Date(lastSync).toLocaleString()}` : 'Not synced yet'}. Your inbox isn’t uploaded — only the parsed transactions (amount, time, merchant) are backed up to your account. We can’t read other apps’ history pages — Android doesn’t allow it.
      </Text>
    </Card>
  );
}
