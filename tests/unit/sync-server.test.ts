import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { migrate } from '../../src/main/db/migrations'
import { deviceId, syncWith, type SqlDb } from '../../src/main/sync/engine'
import { SyncClient, baseUrl, type HttpFn } from '../../src/main/sync/client'

let dir: string
let server: typeof import('../../src/main/sync/server')
let repo: typeof import('../../src/main/db/repo')
let closeDb: () => void
const PORT = 47000 + Math.floor(Math.random() * 900)
const events: unknown[] = []

const http: HttpFn = async ({ method, url, headers, body, timeoutMs }) => {
  const res = await fetch(url, { method, headers, body: body as string | undefined, signal: AbortSignal.timeout(timeoutMs ?? 30000) })
  const buf = new Uint8Array(await res.arrayBuffer())
  return { status: res.status, json: async () => JSON.parse(new TextDecoder().decode(buf)), bytes: async () => buf }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sw-syncsrv-'))
  process.env.STUDYWISE_DATA_DIR = dir
  const db = await import('../../src/main/db')
  closeDb = db.closeDb
  db.openDb(join(dir, 't.db'))
  repo = await import('../../src/main/db/repo')
  const paths = await import('../../src/main/paths')
  mkdirSync(paths.paths.attachments, { recursive: true })
  server = await import('../../src/main/sync/server')
  server.configureSyncServer({
    rpc: async (channel, input, stream) => {
      if (channel !== 'explain.run') return { ok: false, error: 'nope' }
      stream((input as { streamId: string }).streamId, 'Hello ')
      stream((input as { streamId: string }).streamId, 'phone')
      return { ok: true, data: { text: 'Hello phone' } }
    },
    onSynced: (n) => events.push(n)
  })
  repo.setSetting('sync.port', PORT)
})
afterAll(async () => {
  await server?.stopSyncServer()
  closeDb?.()
  rmSync(dir, { recursive: true, force: true })
})

describe('desktop sync server', () => {
  it('pairs with a code, syncs both ways over HTTP, forwards AI calls and serves files', async () => {
    const deck = repo.createDeck({ name: 'Biology' })
    repo.createCards([{ deck_id: deck.id, front: 'Mitochondria', back: 'Powerhouse' } as never])

    const st = await server.setSyncEnabled(true)
    expect(st.running).toBe(true)

    const phone = new Database(':memory:')
    phone.pragma('foreign_keys = ON')
    migrate(phone)
    const phoneId = deviceId(phone as unknown as SqlDb)

    const anon = new SyncClient(baseUrl(`127.0.0.1:${PORT}`), http)
    expect((await anon.hello()).app).toBe('studywise')
    // Pairing is closed until the desktop opens it; a wrong code fails.
    await expect(anon.pair('000000', phoneId, 'Pixel')).rejects.toThrow(/Pairing isn’t open/)
    const code = server.newPairCode().pairCode!
    await expect(anon.pair(code === '111111' ? '222222' : '111111', phoneId, 'Pixel')).rejects.toThrow(/doesn’t match/)
    const paired = await anon.pair(code, phoneId, 'Pixel')
    expect(paired.desktopId).toBe(server.syncStatus().deviceId)
    expect(server.syncStatus().devices.map((d) => d.name)).toEqual(['Pixel'])
    // The code works once.
    expect(server.syncStatus().pairCode).toBeNull()

    // Without the token, nothing.
    await expect(new SyncClient(anon.base, http, 'bogus').transport().pull(0)).rejects.toThrow(/isn’t paired/)

    const r1 = await syncWith(phone as unknown as SqlDb, paired.desktopId, anon.transport())
    expect(r1.received).toBe(2)
    expect(phone.prepare('SELECT front FROM cards').all()).toEqual([{ front: 'Mitochondria' }])

    phone.prepare("UPDATE cards SET back = 'Makes ATP'").run()
    const r2 = await syncWith(phone as unknown as SqlDb, paired.desktopId, anon.transport())
    expect(r2).toEqual({ sent: 1, received: 0 })
    expect(repo.listCards(deck.id)[0].back).toBe('Makes ATP')
    expect(events).toContain(1)

    // AI runs on the desktop; its streamed text comes through /events.
    const { next } = await anon.events(-1)
    const rpc = await anon.rpc('explain.run', { streamId: 's1' })
    expect(rpc).toEqual({ ok: true, data: { text: 'Hello phone' } })
    const ev = await anon.events(next)
    expect(ev.events.map((e) => e.ev)).toEqual([
      { type: 'ai:delta', streamId: 's1', text: 'Hello ' },
      { type: 'ai:delta', streamId: 's1', text: 'phone' }
    ])
    expect((await anon.rpc('app.backup', {})).ok).toBe(false)

    // Attachments both ways, and nothing outside them.
    const { paths } = await import('../../src/main/paths')
    writeFileSync(join(paths.attachments, 'a.png'), 'PNGDATA')
    expect(new TextDecoder().decode((await anon.getFile('studywise-file://attachments/a.png'))!)).toBe('PNGDATA')
    expect(await anon.getFile('studywise-file://../t.db')).toBeNull()
    expect(await anon.putFile('studywise-file://attachments/b.png', new TextEncoder().encode('FROMPHONE'))).toBe(true)
    expect(readFileSync(join(paths.attachments, 'b.png'), 'utf8')).toBe('FROMPHONE')

    // Guessing codes cancels pairing.
    const other = new SyncClient(anon.base, http)
    const real = server.newPairCode().pairCode!
    const wrong = real === '000000' ? '000001' : '000000'
    for (let i = 0; i < 4; i++) await expect(other.pair(wrong, 'x', 'Guess')).rejects.toThrow(/doesn’t match/)
    await expect(other.pair(wrong, 'x', 'Guess')).rejects.toThrow(/Too many wrong codes/)
    await expect(other.pair(real, 'x', 'Guess')).rejects.toThrow(/Pairing isn’t open/)

    // Unpairing locks it out.
    server.unpair(phoneId)
    await expect(anon.transport().pull(0)).rejects.toThrow(/isn’t paired/)
  })
})
