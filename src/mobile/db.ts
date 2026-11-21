// The phone's version of src/main/db/index.ts (swapped in by vite.mobile.config.ts).
// Same exports, backed by sql.js; the whole database is saved to IndexedDB a
// moment after each write, and when the app goes to the background.

import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { migrate } from '../main/db/migrations'
import { SqliteDb } from './sqljs'
import { idb } from './idb'

let db: SqliteDb | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false
let saving: Promise<void> | null = null
const writeListeners = new Set<() => void>()

/** Called (debounced by the caller) after anything writes to the database. */
export function onWrite(fn: () => void): () => void {
  writeListeners.add(fn)
  return () => writeListeners.delete(fn)
}

function touched(): void {
  dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 1500)
  for (const l of writeListeners) l()
}

function applyPragmas(d: SqliteDb): void {
  d.raw.exec('PRAGMA foreign_keys = ON')
}

export async function initMobileDb(): Promise<SqliteDb> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl, useOldExtensionFunctions: false } as unknown as Parameters<typeof initSqlJs>[0])
  const saved = await idb.get<Uint8Array>('kv', 'db')
  const raw = saved ? new SQL.Database(saved) : new SQL.Database()
  db = new SqliteDb(raw, touched)
  applyPragmas(db)
  migrate(db as never)
  await saveNow(true)
  return db
}

/** Writes the database to storage if anything changed (never mid-transaction). */
export async function saveNow(force = false): Promise<void> {
  if (saving) await saving
  if (!db || (!dirty && !force)) return
  if (db.inTransaction) {
    touched()
    return
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  dirty = false
  // export() closes and reopens the database, which resets pragmas.
  const bytes = db.raw.export()
  applyPragmas(db)
  saving = idb.set('kv', 'db', bytes).finally(() => (saving = null))
  await saving
}

export function openDb(): SqliteDb {
  if (!db) throw new Error('Database not open')
  return db
}

export function getDb(): SqliteDb {
  if (!db) throw new Error('Database not open')
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

export async function wipeDb(): Promise<void> {
  closeDb()
  await idb.del('kv', 'db')
}

export const uid = (): string => crypto.randomUUID()
export const now = (): string => new Date().toISOString()

export function json<T>(s: string | null | undefined, fallback: T): T {
  if (s == null) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
