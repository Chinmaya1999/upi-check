import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useStore } from '../data/store';
import { hasSmsPermission, inboxAvailable, notificationAccessEnabled, openNotificationAccess, requestSmsPermission } from '../data/inbox';
import { Button, Card, Eyebrow } from './ui';

/** Where real data comes from: bank SMS (history) and UPI-app notifications (per-app attribution). */
export function SyncCard() {
  const { colors } = useTheme();
  const { syncDevice, lastSync, isDemo } = useStore();
  const [sms, setSms] = useState(false);
  const [ntf, setNtf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const check = useCallback(async () => { setSms(await hasSmsPermission()); setNtf(await notificationAccessEnabled()); }, []);
  useEffect(() => { check(); }, [check]);

  const sync = async () => {
    setBusy(true);
    try {
      if (!(await hasSmsPermission()) && !(await requestSmsPermission())) { setMsg('SMS permission is needed to read your bank alerts.'); return; }
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
      {!ntf && <Button title="Enable app tagging" variant="ghost" onPress={() => openNotificationAccess()} />}
      <Button title={busy ? 'Syncing…' : sms ? 'Sync now' : 'Allow SMS & sync'} disabled={busy} onPress={sync} />
      {!!msg && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{msg}</Text>}
      <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
        {lastSync ? `Last sync ${new Date(lastSync).toLocaleString()}` : 'Not synced yet'}{isDemo ? ' · showing sample data until the first sync' : ''}. Your inbox isn’t uploaded — only the parsed transactions (amount, time, merchant) are backed up to your account. We can’t read other apps’ history pages — Android doesn’t allow it.
      </Text>
    </Card>
  );
}
