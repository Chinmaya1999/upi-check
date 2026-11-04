import * as SQLite from 'expo-sqlite';
import type { Transaction } from '@upi/core';

let dbp: Promise<SQLite.SQLiteDatabase> | null = null;

function open() {
  dbp ??= SQLite.openDatabaseAsync('paisa.db').then(async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS txns (
        id TEXT PRIMARY KEY,
        day_key TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS txns_day_idx ON txns (day_key);
      CREATE INDEX IF NOT EXISTS txns_fp_idx ON txns (fingerprint);
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);
    return db;
  });
  return dbp;
}

export async function loadAll(): Promise<Transaction[]> {
  const db = await open();
  const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM txns');
  return rows.map((r) => JSON.parse(r.json) as Transaction);
}

export async function upsertMany(txns: Transaction[]): Promise<void> {
  const db = await open();
  await db.withTransactionAsync(async () => {
    for (const t of txns) {
      await db.runAsync(
        'INSERT OR REPLACE INTO txns (id, day_key, occurred_at, fingerprint, json) VALUES (?, ?, ?, ?, ?)',
        [t.id, t.dayKey, t.occurredAt, t.fingerprint, JSON.stringify(t)],
      );
    }
  });
}

export async function clearAll(): Promise<void> {
  const db = await open();
  await db.execAsync('DELETE FROM txns; DELETE FROM meta;');
}

export async function getMeta(k: string): Promise<string | null> {
  const db = await open();
  return (await db.getFirstAsync<{ v: string }>('SELECT v FROM meta WHERE k = ?', [k]))?.v ?? null;
}
export async function setMeta(k: string, v: string): Promise<void> {
  const db = await open();
  await db.runAsync('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', [k, v]);
}

export async function deleteMany(ids: string[]): Promise<void> {
  const db = await open();
  await db.withTransactionAsync(async () => { for (const id of ids) await db.runAsync('DELETE FROM txns WHERE id = ?', [id]); });
}
export async function clearTxns(): Promise<void> {
  const db = await open();
  await db.execAsync('DELETE FROM txns;');
}
