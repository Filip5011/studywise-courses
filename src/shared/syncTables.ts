// Which tables sync between the desktop app and the phone app, and how each
// row is identified. Everything else (settings, prompts, AI logs, caches) stays
// on the device it was made on.
//
// Every write to a synced table is recorded in sync_log by a trigger, so no
// other code has to know about syncing. A row's key is its primary-key columns
// joined with \x1f.

export interface SyncTable {
  name: string
  /** Columns that identify a row on every device. */
  pk: string[]
  /** Append-only tables whose own id is a local counter (it isn't copied). */
  localId?: string
}

export const SYNC_TABLES: SyncTable[] = [
  { name: 'folders', pk: ['id'] },
  { name: 'decks', pk: ['id'] },
  { name: 'notes', pk: ['id'] },
  { name: 'cards', pk: ['id'] },
  { name: 'note_decks', pk: ['note_id', 'deck_id'] },
  { name: 'review_state', pk: ['card_id'] },
  { name: 'review_log', pk: ['card_id', 'at', 'source'], localId: 'id' },
  { name: 'learn_sessions', pk: ['id'] },
  { name: 'answer_attempts', pk: ['id'] },
  { name: 'courses', pk: ['id'] },
  { name: 'weeks', pk: ['id'] },
  { name: 'course_files', pk: ['id'] },
  { name: 'topics', pk: ['id'] }
]

export const KEY_SEP = '\x1f'

export const syncTable = (name: string): SyncTable | undefined => SYNC_TABLES.find((t) => t.name === name)

const keyExpr = (t: SyncTable, row: 'NEW' | 'OLD') => t.pk.map((c) => `${row}.${c}`).join(` || char(31) || `)

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`
const NOT_APPLYING = `(SELECT value FROM sync_meta WHERE key = 'applying') = '0'`
const DEVICE = `(SELECT value FROM sync_meta WHERE key = 'device_id')`
const NEXT_SEQ = `(SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_log)`

// Update-then-insert rather than INSERT OR REPLACE: a trigger fired by a
// foreign-key action can't use its own conflict policy. Updating also keeps
// seq strictly increasing (a peer's cursor never skips a change).
function logRow(t: SyncTable, row: 'NEW' | 'OLD', deleted: 0 | 1): string {
  const key = keyExpr(t, row)
  const match = `tbl = '${t.name}' AND pk = ${key}`
  return (
    `UPDATE sync_log SET seq = ${NEXT_SEQ}, at = ${NOW}, deleted = ${deleted}, origin = ${DEVICE} WHERE ${match}; ` +
    `INSERT INTO sync_log (tbl, pk, seq, at, deleted, origin) SELECT '${t.name}', ${key}, ${NEXT_SEQ}, ${NOW}, ${deleted}, ${DEVICE} WHERE NOT EXISTS (SELECT 1 FROM sync_log WHERE ${match});`
  )
}

/** The triggers that record local writes. Writes made while applying another device's changes aren't recorded. */
export function syncTriggersSql(): string {
  return SYNC_TABLES.map(
    (t) => `
  CREATE TRIGGER sync_${t.name}_ins AFTER INSERT ON ${t.name} WHEN ${NOT_APPLYING} BEGIN ${logRow(t, 'NEW', 0)} END;
  CREATE TRIGGER sync_${t.name}_upd AFTER UPDATE ON ${t.name} WHEN ${NOT_APPLYING} BEGIN ${logRow(t, 'NEW', 0)} END;
  CREATE TRIGGER sync_${t.name}_del AFTER DELETE ON ${t.name} WHEN ${NOT_APPLYING} BEGIN ${logRow(t, 'OLD', 1)} END;`
  ).join('\n')
}

export const SYNC_SCHEMA_SQL = `
  CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO sync_meta VALUES ('device_id', lower(hex(randomblob(16)))), ('applying', '0'), ('backfilled', '0');
  CREATE TABLE sync_log (
    tbl TEXT NOT NULL,
    pk TEXT NOT NULL,
    seq INTEGER NOT NULL,
    at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    origin TEXT NOT NULL,
    PRIMARY KEY (tbl, pk)
  );
  CREATE INDEX sync_log_seq ON sync_log(seq);
  CREATE TABLE sync_peers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT,
    address TEXT,
    sent_seq INTEGER NOT NULL DEFAULT 0,
    got_seq INTEGER NOT NULL DEFAULT 0,
    last_sync TEXT,
    created_at TEXT NOT NULL
  );
  ${syncTriggersSql()}
`
