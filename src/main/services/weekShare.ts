// Sharing one week of a course: a friend writes the week (and spends the
// tokens), sends the .studyweek file, and you import it into your own course
// (or a new one) without generating anything.
//
// The file is a zip:
//   week.json   the week, its files' details, its topics (notes, questions,
//               flashcards) and its recall cards; no progress or reviews
//   files/...   the week's source files (slides, transcripts), which topics
//               need for their figures and for writing a topic again
//
// Importing gives everything new ids, so importing twice gives two copies. Slide
// figures aren't in the file: they're rendered again from the PDFs when shown.

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'
import JSZip from 'jszip'
import { getDb, now } from '../db'
import { paths } from '../paths'
import { safeFileName } from '../library'
import { addWeek, createCourse, ensureWeekDeck, fixTopicCardCounts, getCourse, refreshDormancy, syncTopicNote } from './course'

export const WEEK_EXT = 'studyweek'
const FORMAT = 1

type Row = Record<string, unknown>

interface WeekJson {
  app: 'studywise-courses'
  kind: 'week'
  format: number
  exportedAt: string
  course: { name: string; module: string; level: string }
  week: Row
  files: Row[]
  topics: Row[]
  cards: Row[]
}

export interface WeekPreview {
  course: string
  week: string
  topics: number
  written: number
  cards: number
  files: string[]
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const zipPath = (p: string) => p.split(sep).join('/')

export const weekFileName = (course: string, week: string) => `${safeFileName(`${course} - ${week}`)}.${WEEK_EXT}`
export const isWeekFile = (f: string) => basename(f).toLowerCase().endsWith(`.${WEEK_EXT}`)

export async function exportWeek(weekId: string, file: string): Promise<WeekPreview> {
  const d = getDb()
  const week = d.prepare('SELECT * FROM weeks WHERE id = ?').get(weekId) as Row | undefined
  if (!week) throw new Error('Week not found')
  const course = d.prepare('SELECT * FROM courses WHERE id = ?').get(week.course_id) as Row
  const courseDir = join(paths.courses, String(course.id))
  const files = (d.prepare('SELECT * FROM course_files WHERE week_id = ? ORDER BY position').all(weekId) as Row[]).map((f) => ({ ...f, path: zipPath(relative(courseDir, String(f.path))) }))
  // Your progress and the link to your own copy of the notes stay with you.
  const topics = (d.prepare('SELECT * FROM topics WHERE week_id = ? ORDER BY position').all(weekId) as Row[]).map((t) => ({ ...t, progress: '{}', note_id: null }))
  const cards = week.deck_id ? (d.prepare('SELECT * FROM cards WHERE deck_id = ?').all(week.deck_id) as Row[]) : []
  const json: WeekJson = {
    app: 'studywise-courses',
    kind: 'week',
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    course: { name: String(course.name), module: String(course.module ?? ''), level: String(course.level ?? '') },
    week: { ...week, deck_id: null },
    files,
    topics,
    cards
  }
  const zip = new JSZip()
  zip.file('week.json', JSON.stringify(json), { compression: 'DEFLATE' })
  for (const f of files) {
    const full = join(courseDir, String(f.path))
    if (existsSync(full)) zip.file(`files/${f.path}`, readFileSync(full))
  }
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' }))
  return previewOf(json)
}

function previewOf(j: WeekJson): WeekPreview {
  return {
    course: j.course.name,
    week: String(j.week.label),
    topics: j.topics.length,
    written: j.topics.filter((t) => t.status === 'ready').length,
    cards: j.cards.length,
    files: j.files.map((f) => String(f.name))
  }
}

async function readWeek(file: string): Promise<{ zip: JSZip; json: WeekJson }> {
  const zip = await JSZip.loadAsync(readFileSync(file))
  const entry = zip.file('week.json')
  if (!entry) throw new Error('This isn’t a shared Studywise week.')
  const json = JSON.parse(await entry.async('string')) as WeekJson
  if (json.app !== 'studywise-courses' || json.kind !== 'week' || !json.week) throw new Error('This isn’t a shared Studywise week.')
  if (json.format > FORMAT) throw new Error('This week was shared from a newer version of Studywise. Update the app, then import it again.')
  return { zip, json }
}

/** What's in a shared week, for the import dialog. */
export async function previewWeek(file: string): Promise<WeekPreview> {
  return previewOf((await readWeek(file)).json)
}

/**
 * Adds a shared week to one of your courses (as its next week), or to a new
 * course named like the sender's. Returns where it went.
 */
export async function importWeek(file: string, target: { courseId: string } | { newCourse: true }): Promise<{ courseId: string; weekId: string; topics: number; cards: number }> {
  const { zip, json } = await readWeek(file)
  const d = getDb()

  const courseId =
    'courseId' in target
      ? target.courseId
      : (() => {
          const c = createCourse({ name: json.course.name || 'Shared course', level: json.course.level })
          if (json.course.module) d.prepare('UPDATE courses SET module = ? WHERE id = ?').run(json.course.module, c.id)
          return c.id
        })()
  const course = getCourse(courseId)

  // The week lands at the end of your course, under its own label (numbered if you already have one by that name).
  const labels = new Set(course.weeks.map((w) => w.label.toLowerCase()))
  let label = String(json.week.label || 'Shared week')
  for (let n = 2; labels.has(label.toLowerCase()); n++) label = `${json.week.label} (${n})`
  const week = addWeek(courseId, label)
  const status = json.week.status === 'planning' ? 'error' : String(json.week.status ?? 'empty')
  d.prepare('UPDATE weeks SET status = ?, error = ?, outline = ? WHERE id = ?').run(status, status === 'error' ? 'Planning was interrupted. Plan it again.' : (json.week.error ?? null), json.week.outline ?? null, week.id)

  // New ids for everything in the file, and the sender's course and week become yours.
  const remap = new Map<string, string>([
    [String(json.week.course_id).toLowerCase(), courseId],
    [String(json.week.id).toLowerCase(), week.id]
  ])
  for (const r of [...json.files, ...json.topics, ...json.cards]) if (typeof r.id === 'string') remap.set(r.id.toLowerCase(), randomUUID())
  const swap = (s: string) => s.replace(UUID, (m) => remap.get(m.toLowerCase()) ?? m)

  // Topic keys follow the week's position here (w3t1 becomes w5t1 as your week 5).
  const oldNo = String(json.topics[0]?.key ?? '').match(/^w(\d+)t/)?.[1]
  const newNo = String(week.position + 1)
  const rekey = (s: string) => (oldNo ? s.replace(new RegExp(`"w${oldNo}(t\\d+)"`, 'g'), `"w${newNo}$1"`) : s)

  const files = JSON.parse(swap(JSON.stringify(json.files))) as Row[]
  const topics = JSON.parse(rekey(swap(JSON.stringify(json.topics)))) as Row[]
  const cards = JSON.parse(swap(JSON.stringify(json.cards))) as Row[]
  if (oldNo) for (const t of topics) t.key = String(t.key).replace(new RegExp(`^w${oldNo}t`), `w${newNo}t`)

  // Files go in your course's folder; a name you already have gets a number, and topics follow the rename.
  const taken = new Set(course.weeks.flatMap((w) => w.files.map((f) => f.name.toLowerCase())))
  const renamed = new Map<string, string>()
  const dir = join(paths.courses, courseId, 'files')
  mkdirSync(dir, { recursive: true })
  const fileRows: { row: Row; from: string; to: string }[] = []
  for (const f of files) {
    const orig = safeFileName(String(f.name))
    let name = orig
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${basename(orig, extname(orig))} (${n})${extname(orig)}`
    taken.add(name.toLowerCase())
    if (name !== f.name) renamed.set(String(f.name), name)
    const from = `files/${String(f.path)}`
    fileRows.push({ row: { ...f, name, course_id: courseId, week_id: week.id, path: join(dir, name) }, from, to: join(dir, name) })
  }
  for (const t of topics) {
    if (!renamed.size || typeof t.plan !== 'string') continue
    const plan = JSON.parse(t.plan) as { sources?: { file: string }[] }
    for (const s of plan.sources ?? []) if (renamed.has(s.file)) s.file = renamed.get(s.file)!
    t.plan = JSON.stringify(plan)
  }

  const columns = (t: string) => new Set((d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name))
  const insert = (t: string, rows: Row[]) => {
    const have = columns(t)
    for (const r of rows) {
      const keys = Object.keys(r).filter((k) => have.has(k))
      d.prepare(`INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`).run(Object.fromEntries(keys.map((k) => [k, r[k]])))
    }
  }
  const deckId = ensureWeekDeck(week.id)
  const t = now()
  d.transaction(() => {
    insert('course_files', fileRows.map((f) => f.row))
    insert(
      'topics',
      topics.map((tp) => ({
        ...tp,
        course_id: courseId,
        week_id: week.id,
        // Anything mid-write when it was shared isn't being written here.
        ...(tp.status === 'writing' ? { status: 'error', error: 'Interrupted. Write it again.' } : {}),
        progress: '{}',
        note_id: null,
        updated_at: t
      }))
    )
    insert('cards', cards.map((c) => ({ ...c, deck_id: deckId })))
  })()

  for (const f of fileRows) {
    const entry = zip.file(f.from)
    if (entry) writeFileSync(f.to, await entry.async('nodebuffer'))
  }
  // Cards shared from an older version may lack their (n) point counts.
  fixTopicCardCounts()
  // Nothing in a shared week has been studied here yet, so its cards wait until you do.
  for (const tp of topics) refreshDormancy(String(tp.id))
  // Each written topic gets its notes in your notes, like one you wrote yourself.
  for (const tp of topics) if (tp.status === 'ready') await syncTopicNote(String(tp.id)).catch(() => null)
  d.prepare('UPDATE courses SET updated_at = ? WHERE id = ?').run(t, courseId)
  return { courseId, weekId: week.id, topics: topics.length, cards: cards.length }
}
