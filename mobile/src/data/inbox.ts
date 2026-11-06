import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { SMS_ENABLED } from '../config';
import { parseAppNotification, parseBankSms, parseMessagingNotification, type AppNotification, type RawTransaction, type SmsMessage } from '@upi/core';

interface Native {
  readSms(sinceMs: number, limit: number): Promise<SmsMessage[]>;
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): void;
  drainNotifications(): Promise<AppNotification[]>;
  updateWidget(todayDebit: number, todayCredit: number, monthDebit: number, weekDebit: number, budgetPct: number, budgetLabel: string, dayKey: string): void;
  setWidgetFestival(greeting: string, particles: string, accent: string): void;
  notify(title: string, body: string, id: number, sound: boolean, level: string): void;
  setPaymentNotifications(enabled: boolean): void;
  isPaymentNotificationsEnabled(): Promise<boolean>;
  saveReport(name: string, content: string, mime: string): Promise<string>;
  setLockScreenCard(enabled: boolean): void;
  isLockScreenCardEnabled(): Promise<boolean>;
  setSecureScreen(enabled: boolean): void;
  isSecureScreen(): Promise<boolean>;
}
const native: Native | undefined = Platform.OS === 'android' ? NativeModules.PaisaInbox : undefined;

export const inboxAvailable = !!native;

export async function hasSmsPermission(): Promise<boolean> {
  return SMS_ENABLED && Platform.OS === 'android' && (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS));
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!SMS_ENABLED || Platform.OS !== 'android') return false;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Read bank SMS',
    message: 'Paisa reads debit/credit alerts from your bank SMS on this device to build your daily spend. Messages never leave your phone and OTPs are ignored.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  if (r === PermissionsAndroid.RESULTS.GRANTED) await ensureReceiveSms();
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

/** Lets the widgets and lock-screen card update the instant a bank SMS arrives, even with the app closed.
 *  Same permission group as READ_SMS, so Android grants it without another dialog. */
export async function ensureReceiveSms(): Promise<void> {
  if (!SMS_ENABLED || Platform.OS !== 'android') return;
  const p = PermissionsAndroid.PERMISSIONS.RECEIVE_SMS;
  if (!(await PermissionsAndroid.check(p))) await PermissionsAndroid.request(p);
}

export const setSecureScreen = (on: boolean) => native?.setSecureScreen(on);
export const secureScreenEnabled = () => native?.isSecureScreen() ?? Promise.resolve(true);
export const setLockScreenCard = (on: boolean) => native?.setLockScreenCard(on);
export const lockScreenCardEnabled = () => native?.isLockScreenCardEnabled() ?? Promise.resolve(false);

export const notificationAccessEnabled = () => native?.isNotificationAccessEnabled() ?? Promise.resolve(false);
export const openNotificationAccess = () => native?.openNotificationAccessSettings();

export interface InboxBatch { sms: RawTransaction[]; notifications: RawTransaction[]; scannedSms: number; newestSmsAt: number }

/** Reads everything new since [sinceMs] and converts it to RawTransactions. Parsing is pure (see @upi/core). */
export async function readInbox(sinceMs: number): Promise<InboxBatch> {
  if (!native) return { sms: [], notifications: [], scannedSms: 0, newestSmsAt: sinceMs };
  const msgs = (await hasSmsPermission()) ? await native.readSms(sinceMs, 20000) : [];
  const sms = msgs.map(parseBankSms).filter((x): x is RawTransaction => !!x);
  const notifs = (await notificationAccessEnabled()) ? await native.drainNotifications() : [];
  // Payment/bank apps, plus (direct build) bank messages that reached the SMS app as RCS and never hit the SMS inbox.
  const notifications = notifs
    .map((n) => parseAppNotification(n) ?? (SMS_ENABLED ? parseMessagingNotification(n) : null))
    .filter((x): x is RawTransaction => !!x);
  return { sms, notifications, scannedSms: msgs.length, newestSmsAt: msgs.reduce((m, s) => Math.max(m, s.date), sinceMs) };
}

/** Pushes the headline numbers to the Android home-screen widget (no-op elsewhere). */
export function pushWidget(todayDebitPaise: number, todayCreditPaise: number, monthDebitPaise: number, weekDebitPaise: number, budgetPct: number | null, budgetLabel: string, dayKey: string) {
  native?.updateWidget(todayDebitPaise, todayCreditPaise, monthDebitPaise, weekDebitPaise, budgetPct ?? -1, budgetLabel, dayKey);
}

/** Tells the home-screen widgets which festival (if any) is live, so they show the animated festive strip. */
export function pushWidgetFestival(f: { greeting: string; particles: string[]; accent: string } | null) {
  try { native?.setWidgetFestival?.(f ? f.greeting : '', f ? f.particles.join(',') : '', f ? f.accent : ''); } catch { /* widgets are optional */ }
}

/** Android 13+ needs a runtime grant before any notification shows. */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (Number(Platform.Version) < 33) return true;
  const perm = 'android.permission.POST_NOTIFICATIONS' as const;
  if (await PermissionsAndroid.check(perm)) return true;
  return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
}
export async function notificationsAllowed(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return Number(Platform.Version) < 33 || PermissionsAndroid.check('android.permission.POST_NOTIFICATIONS' as const);
}
export const postNotification = (title: string, body: string, id: number, sound: boolean, level: 'warn' | 'over' | 'info' = 'info') => native?.notify(title, body, id, sound, level);
export const setPaymentNotifications = (on: boolean) => native?.setPaymentNotifications(on);
export const paymentNotificationsEnabled = () => native?.isPaymentNotificationsEnabled() ?? Promise.resolve(false);
export const saveReportFile = (name: string, content: string, mime: string) => native ? native.saveReport(name, content, mime) : Promise.reject(new Error('Saving files needs the Android app'));
