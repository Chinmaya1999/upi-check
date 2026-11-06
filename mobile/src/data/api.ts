import * as SecureStore from 'expo-secure-store';
import type { Transaction } from '@upi/core';
import { API_URL } from '../config';

const TOKEN_KEY = 'paisa.token.v1';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export const getToken = async () => { try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t);
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) { const t = await getToken(); if (t) headers.Authorization = `Bearer ${t}`; }
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    } catch {
      throw new ApiError("Can't reach the Paisa server. Check your internet connection and try again.", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Server error (${res.status})`, res.status);
    return data as T;
  } finally { clearTimeout(timer); }
}

export interface AuthUser { id: string; name: string; contact: string; email: string | null; phone: string | null; emailVerified: boolean; avatar: string | null }
export interface AuthResult { token: string; user: AuthUser }
export interface OtpSent { ok: true; email: string; expiresInSec: number }

// Sign-up: details + emailed code → account is only created when the code is verified.
export const registerStart = (name: string, email: string, phone: string, password: string) => call<OtpSent>('POST', '/auth/register/start', { name, email, phone: phone || undefined, password }, false);
export const registerResend = (email: string) => call<OtpSent>('POST', '/auth/register/resend', { email }, false);
export const registerVerify = (email: string, otp: string) => call<AuthResult>('POST', '/auth/register/verify', { email, otp }, false);
export const login = (contact: string, password: string) => call<AuthResult>('POST', '/auth/login', { contact, password }, false);
export const forgotPassword = (email: string) => call<OtpSent>('POST', '/auth/forgot', { email }, false);
export const resetPassword = (email: string, otp: string, password: string) => call<{ ok: true }>('POST', '/auth/reset', { email, otp, password }, false);
export const sendFeedback = (f: { category: string; rating: number | null; message: string; appVersion: string; device: string }) => call<{ ok: true }>('POST', '/feedback', f);
export const logoutAll = () => call<{ ok: true }>('POST', '/me/logout-all');
export const logout = () => call<{ ok: true }>('POST', '/auth/logout');
export const deleteAccount = () => call<{ ok: true }>('DELETE', '/me');
export const me = () => call<{ user: AuthUser; transactionCount: number }>('GET', '/me');

// Profile
export const updateProfile = (patch: { name?: string; phone?: string }) => call<{ user: AuthUser }>('PATCH', '/me', patch);
export const changeEmailStart = (email: string) => call<OtpSent>('POST', '/me/email/start', { email });
export const changeEmailVerify = (otp: string) => call<{ user: AuthUser }>('POST', '/me/email/verify', { otp });
export const changePassword = (current: string, next: string) => call<{ ok: true }>('POST', '/me/password', { current, next });
export const setAvatar = (image: string) => call<{ user: AuthUser }>('PUT', '/me/avatar', { image });
export const removeAvatar = () => call<{ user: AuthUser }>('DELETE', '/me/avatar');

const CHUNK = 500;
/** Raw SMS / notification text stays on the phone: keep the audit trail (source, time) but drop the payload. */
const redact = (t: Transaction): Transaction => ({ ...t, originals: t.originals.map((o) => (o.source === 'sms' || o.source === 'notification' ? { ...o, payload: null } : o)) });
/** Idempotent upsert of every transaction (server keeps one row per id), plus explicit deletions. */
export async function pushTransactions(txns: Transaction[], deleteIds: string[] = []): Promise<void> {
  for (let i = 0; i < Math.max(txns.length, 1); i += CHUNK) {
    const last = i + CHUNK >= txns.length;
    await call('POST', '/transactions/sync', { transactions: txns.slice(i, i + CHUNK).map(redact), deleteIds: last ? deleteIds.slice(0, 1000) : [] });
  }
}
export const pullTransactions = () => call<{ total: number; transactions: Transaction[] }>('GET', '/transactions?limit=20000');
