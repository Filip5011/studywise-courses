// sql.js (SQLite compiled to WebAssembly) behind the slice of better-sqlite3's
// API the desktop code uses, so the same repo/services code runs on the phone.

import type { Database as SqlJsDatabase, SqlValue } from 'sql.js'

type Params = unknown[]

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !(v instanceof Uint8Array) && !Array.isArray(v)
}

function toSql(v: unknown): SqlValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number' || typeof v === 'string' || v instanceof Uint8Array) return v
  return String(v)
}

/** better-sqlite3 binds `@id` from `{ id }`; sql.js wants the prefix in the key. */
function bindArgs(args: Params): SqlValue[] | Record<string, SqlValue> {
  if (args.length === 1 && isPlainObject(args[0])) {
    const out: Record<string, SqlValue> = {}
    for (const [k, v] of Object.entries(args[0])) {
      const val = toSql(v)
      out[`@${k}`] = val
      out[`:${k}`] = val
      out[`$${k}`] = val
    }
    return out
  }
  const flat = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args
  return flat.map(toSql)
}

const READ_ONLY = /^\s*(SELECT|PRAGMA\s+(table_info|foreign_key_list|foreign_key_check|user_version\s*$)|WITH\s)/i

export class Statement {
  constructor(
    private readonly owner: SqliteDb,
    private readonly sql: string
  ) {}

  private withStmt<T>(args: Params, fn: (s: ReturnType<SqlJsDatabase['prepare']>) => T): T {
    const s = this.owner.raw.prepare(this.sql)
    try {
      const b = bindArgs(args)
      if (Array.isArray(b) ? b.length : Object.keys(b).length) s.bind(b)
      return fn(s)
    } finally {
      s.free()
      if (!READ_ONLY.test(this.sql)) this.owner.touched()
    }
  }

  get(...args: Params): Record<string, unknown> | undefined {
    return this.withStmt(args, (s) => (s.step() ? (s.getAsObject() as Record<string, unknown>) : undefined))
  }

  all(...args: Params): Record<string, unknown>[] {
    return this.withStmt(args, (s) => {
      const rows: Record<string, unknown>[] = []
      while (s.step()) rows.push(s.getAsObject() as Record<string, unknown>)
      return rows
    })
  }

  run(...args: Params): { changes: number; lastInsertRowid: number } {
    this.withStmt(args, (s) => {
      while (s.step()) {
        /* run to completion */
      }
    })
    const changes = this.owner.raw.getRowsModified()
    const id = this.owner.raw.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0]
    return { changes, lastInsertRowid: Number(id ?? 0) }
  }
}

export class SqliteDb {
  private depth = 0

  constructor(
    public raw: SqlJsDatabase,
    private readonly onWrite: () => void
  ) {}

  get inTransaction(): boolean {
    return this.depth > 0
  }

  touched(): void {
    this.onWrite()
  }

  prepare(sql: string): Statement {
    return new Statement(this, sql)
  }

  exec(sql: string): this {
    this.raw.exec(sql)
    if (!READ_ONLY.test(sql)) this.onWrite()
    return this
  }

  pragma(source: string, opts?: { simple?: boolean }): unknown {
    const rows = this.prepare(`PRAGMA ${source}`).all()
    if (opts?.simple) return rows[0] ? Object.values(rows[0])[0] : undefined
    return rows
  }

  /** Like better-sqlite3: returns a function that runs `fn` in a transaction (nested ones use savepoints). */
  transaction<F extends (...args: never[]) => unknown>(fn: F): F {
    return ((...args: Parameters<F>) => {
      const name = `sp${this.depth}`
      this.raw.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`)
      this.depth++
      try {
        const r = fn(...args)
        this.depth--
        this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`)
        this.onWrite()
        return r
      } catch (e) {
        this.depth--
        if (this.depth === 0) this.raw.exec('ROLLBACK')
        else this.raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`)
        throw e
      }
    }) as F
  }

  close(): void {
    this.raw.close()
  }
}
