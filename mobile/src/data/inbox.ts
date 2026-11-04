import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { parseAppNotification, parseBankSms, type AppNotification, type RawTransaction, type SmsMessage } from '@upi/core';

interface Native {
  readSms(sinceMs: number, limit: number): Promise<SmsMessage[]>;
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): void;
  drainNotifications(): Promise<AppNotification[]>;
  updateWidget(todayDebit: number, todayCredit: number, monthDebit: number, budgetPct: number, dayKey: string): void;
}
const native: Native | undefined = Platform.OS === 'android' ? NativeModules.PaisaInbox : undefined;

export const inboxAvailable = !!native;

export async function hasSmsPermission(): Promise<boolean> {
  return Platform.OS === 'android' && (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS));
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Read bank SMS',
    message: 'Paisa reads debit/credit alerts from your bank SMS on this device to build your daily spend. Messages never leave your phone and OTPs are ignored.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export const notificationAccessEnabled = () => native?.isNotificationAccessEnabled() ?? Promise.resolve(false);
export const openNotificationAccess = () => native?.openNotificationAccessSettings();

export interface InboxBatch { sms: RawTransaction[]; notifications: RawTransaction[]; scannedSms: number; newestSmsAt: number }

/** Reads everything new since [sinceMs] and converts it to RawTransactions. Parsing is pure (see @upi/core). */
export async function readInbox(sinceMs: number): Promise<InboxBatch> {
  if (!native) return { sms: [], notifications: [], scannedSms: 0, newestSmsAt: sinceMs };
  const msgs = (await hasSmsPermission()) ? await native.readSms(sinceMs, 20000) : [];
  const sms = msgs.map(parseBankSms).filter((x): x is RawTransaction => !!x);
  const notifs = (await notificationAccessEnabled()) ? await native.drainNotifications() : [];
  const notifications = notifs.map(parseAppNotification).filter((x): x is RawTransaction => !!x);
  return { sms, notifications, scannedSms: msgs.length, newestSmsAt: msgs.reduce((m, s) => Math.max(m, s.date), sinceMs) };
}

/** Pushes the headline numbers to the Android home-screen widget (no-op elsewhere). */
export function pushWidget(todayDebitPaise: number, todayCreditPaise: number, monthDebitPaise: number, budgetPct: number | null, dayKey: string) {
  native?.updateWidget(todayDebitPaise, todayCreditPaise, monthDebitPaise, budgetPct ?? -1, dayKey);
}
