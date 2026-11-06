import { useSyncExternalStore } from 'react';
import * as db from './db';

/** The profile photo (small JPEG data-URL). Source of truth is the server; this is a local cache shared by every screen. */
let current: string | null = null;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setAvatarLocal(uri: string | null) {
  current = uri; loaded = true; emit();
  db.setMeta('avatar', uri ?? '').catch(() => {});
}

async function load() {
  if (loaded) return;
  loaded = true;
  try { const v = await db.getMeta('avatar'); if (v) { current = v; emit(); } } catch { /* no cache yet */ }
}

export function useAvatar(): string | null {
  return useSyncExternalStore(
    (f) => { subs.add(f); load(); return () => { subs.delete(f); }; },
    () => current,
  );
}
