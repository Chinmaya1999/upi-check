import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Phase 1 session is DEVICE-LOCAL: a profile in the secure keystore, no server,
 * no password. Phase 2 swaps this for the NestJS /auth endpoints behind the same shape.
 */
export interface Profile { name: string; contact: string; biometricLock: boolean; createdAt: string }
const KEY = 'paisa.profile.v1';

export async function loadProfile(): Promise<Profile | null> {
  try { const v = await SecureStore.getItemAsync(KEY); return v ? (JSON.parse(v) as Profile) : null; } catch { return null; }
}
export const saveProfile = (p: Profile) => SecureStore.setItemAsync(KEY, JSON.stringify(p));
export const clearProfile = () => SecureStore.deleteItemAsync(KEY);

export async function biometricsAvailable(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}
export async function unlock(): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Paisa', cancelLabel: 'Cancel' });
  return r.success;
}

export function validateContact(v: string): string | null {
  const s = v.trim();
  if (/^[6-9]\d{9}$/.test(s)) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return null;
  return 'Enter a valid 10-digit mobile number or email';
}
