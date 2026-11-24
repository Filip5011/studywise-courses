// Talking to the course marketplace: a site (studywise-market) where people
// publish weeks they've generated, so others can add them instead of spending
// their own tokens. You give the app the site's address and an API key made
// on the site's account page; the key is kept encrypted, like the Ollama key.

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSetting, setSetting } from '../db/repo'
import { getSecret, setSecret } from '../secrets'
import { getDb } from '../db'
import { weekFingerprint } from './course'
import { weekZip } from './weekShare'
import type { JobContext } from '../jobs'
import type { MarketCourse, MarketCourseFull, MarketMatch, MarketSort, MarketStatus, MarketWeek } from '@shared/market'

const URL_SETTING = 'market.url'
const KEY_SETTING = 'secret.marketKey' as const
/** Which marketplace week each of your weeks was published as: {localWeekId: remoteWeekId}. */
const PUBLISHED_SETTING = 'market.published'
const TIMEOUT_MS = 30_000
/** The "already made" check runs before planning, so it mustn't hold planning up for long. */
const SIMILAR_TIMEOUT_MS = 8_000

export function marketUrl(): string {
  return getSetting<string>(URL_SETTING, '').trim().replace(/\/+$/, '')
}

export function marketStatus(): MarketStatus {
  return { url: marketUrl(), hasKey: !!getSecret(KEY_SETTING) }
}

const isReady = () => !!marketUrl() && !!getSecret(KEY_SETTING)

/** https only, except a server on this computer while developing. */
export function cleanUrl(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    throw new Error('That isn’t a web address. It looks like https://courses.example.com')
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error('The marketplace address has to start with https://')
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** Save the address and key (a null key keeps the one you have), then check them. */
export async function configure(input: { url: string; key?: string | null }): Promise<{ user: string }> {
  setSetting(URL_SETTING, cleanUrl(input.url))
  if (input.key !== undefined && input.key !== null) setSecret(KEY_SETTING, input.key)
  return test()
}

export function disconnect(): void {
  setSecret(KEY_SETTING, null)
}

/** Who the key belongs to. */
export async function test(): Promise<{ user: string }> {
  const r = await request<{ user: { name: string } }>('/api/app/me')
  return { user: r.user.name }
}

class MarketError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function send(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const url = marketUrl()
  const key = getSecret(KEY_SETTING)
  if (!url) throw new MarketError('Add the marketplace’s address in Settings → Marketplace first.', 0)
  if (!key) throw new MarketError(`Make an API key on ${url} (Account → API keys) and paste it in Settings → Marketplace.`, 0)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${url}${path}`, { ...init, signal: ctrl.signal, headers: { ...init.headers, authorization: `Bearer ${key}`, 'user-agent': 'Studywise' } })
  } catch (e) {
    throw new MarketError(ctrl.signal.aborted ? 'The marketplace took too long to answer.' : `Couldn’t reach the marketplace at ${url}. ${(e as Error).message}`, 0)
  } finally {
    clearTimeout(timer)
  }
  if (res.ok) return res
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  if (res.status === 401) throw new MarketError(`The marketplace didn’t accept your API key. Make a new one on ${url} and paste it in Settings → Marketplace.`, 401)
  throw new MarketError(body?.error || `The marketplace answered ${res.status}.`, res.status)
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  return (await (await send(path, init)).json()) as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export async function listCourses(input: { q?: string; sort?: MarketSort } = {}): Promise<MarketCourse[]> {
  const qs = new URLSearchParams()
  if (input.q?.trim()) qs.set('q', input.q.trim())
  if (input.sort) qs.set('sort', input.sort)
  return (await request<{ courses: MarketCourse[] }>(`/api/courses?${qs}`)).courses
}

export async function getCourse(id: string): Promise<MarketCourseFull> {
  return (await request<{ course: MarketCourseFull }>(`/api/courses/${encodeURIComponent(id)}`)).course
}

export async function mine(): Promise<(MarketWeek & { courseName: string })[]> {
  return (await request<{ weeks: (MarketWeek & { courseName: string })[] }>('/api/mine')).weeks
}

const published = () => getSetting<Record<string, string>>(PUBLISHED_SETTING, {})

/** Which of your weeks are on the marketplace: {localWeekId: remoteWeekId}. */
export const publishedWeeks = published

/**
 * Publish a week (its topics, cards, slides and transcripts). Publishing the
 * same week again replaces what you published before.
 */
export async function publish(weekId: string): Promise<{ week: MarketWeek; replaced: boolean }> {
  const written = getDb().prepare("SELECT COUNT(*) n FROM topics WHERE week_id = ? AND status = 'ready'").get(weekId) as { n: number }
  if (!written.n) throw new Error('Write at least one of this week’s topics before publishing it.')
  const { bytes } = await weekZip(weekId)
  const before = published()[weekId]
  const post = (replace?: string) =>
    request<{ week: MarketWeek }>(`/api/weeks${replace ? `?replace=${encodeURIComponent(replace)}` : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(bytes),
      timeoutMs: 10 * 60_000
    })
  let r: { week: MarketWeek }
  let replaced = !!before
  try {
    r = await post(before)
  } catch (e) {
    // Deleted on the site since: publish it as new.
    if (!(before && e instanceof MarketError && e.status === 404)) throw e
    r = await post()
    replaced = false
  }
  setSetting(PUBLISHED_SETTING, { ...published(), [weekId]: r.week.id })
  return { week: r.week, replaced }
}

/** Weeks with at least one written topic, in course and week order: everything that can be published (or just one course's). */
export function publishableWeeks(courseId?: string): { weekId: string; course: string; label: string }[] {
  return getDb()
    .prepare(
      `SELECT w.id weekId, c.name course, w.label label FROM weeks w JOIN courses c ON c.id = w.course_id
       WHERE EXISTS (SELECT 1 FROM topics t WHERE t.week_id = w.id AND t.status = 'ready') ${courseId ? 'AND c.id = ?' : ''}
       ORDER BY c.name COLLATE NOCASE, w.position`
    )
    .all(...(courseId ? [courseId] : [])) as { weekId: string; course: string; label: string }[]
}

/** Publish several weeks one after another. One failing doesn't stop the rest. */
export async function publishMany(weeks: { weekId: string; course: string; label: string }[], ctx: JobContext): Promise<{ published: number; failed: string[] }> {
  const failed: string[] = []
  let published = 0
  for (const [i, w] of weeks.entries()) {
    if (ctx.signal.aborted) throw new Error('Cancelled')
    const name = `${w.course} · ${w.label}`
    ctx.progress(`Publishing ${i + 1} of ${weeks.length}: ${name}`)
    ctx.live?.({ stage: `Publishing ${name}…`, percent: i / weeks.length })
    try {
      await publish(w.weekId)
      published++
    } catch (e) {
      failed.push(`${name}: ${(e as Error).message}`)
    }
  }
  if (!published && failed.length) throw new Error(failed[0])
  ctx.progress(`Published ${published} week${published === 1 ? '' : 's'}${failed.length ? `; ${failed.length} didn’t go: ${failed.join('; ')}` : ''}`)
  return { published, failed }
}

export async function remove(remoteWeekId: string): Promise<void> {
  await request(`/api/weeks/${encodeURIComponent(remoteWeekId)}`, { method: 'DELETE' })
  setSetting(PUBLISHED_SETTING, Object.fromEntries(Object.entries(published()).filter(([, v]) => v !== remoteWeekId)))
}

/** Download a published week to a temporary .studyweek file, to import like a shared week. */
export async function download(remoteWeekId: string): Promise<string> {
  const res = await send(`/api/weeks/${encodeURIComponent(remoteWeekId)}/file`, { timeoutMs: 10 * 60_000 })
  const dir = join(tmpdir(), 'studywise-market')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${remoteWeekId.replace(/[^\w-]/g, '')}.studyweek`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

/**
 * Published weeks made from (nearly) the same material as this week, before
 * you spend tokens planning it. Never throws: no marketplace, no key, or the
 * site being down all just mean no warning.
 */
export async function similar(weekId: string): Promise<MarketMatch[]> {
  if (!isReady()) return []
  try {
    const fp = await weekFingerprint(weekId)
    if (!fp.sig && !fp.hashes.length) return []
    const own = published()[weekId]
    const r = await request<{ matches: MarketMatch[] }>('/api/similar', { ...json(fp), timeoutMs: SIMILAR_TIMEOUT_MS })
    // Only other people's weeks: your own published ones came from your courses already.
    return r.matches.filter((m) => m.week.id !== own && !m.week.mine)
  } catch {
    return []
  }
}
