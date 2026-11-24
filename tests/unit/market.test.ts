import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { signature, similarity, words, SIGNATURE_SIZE } from '@shared/fingerprint'
import { authorsText, modelLabel } from '@shared/market'

const lecture = (topic: string, n: number) =>
  Array.from({ length: n }, (_, i) => `In ${topic} the ${i}th idea builds on the one before it, and the lecture works an example through step by step.`).join(' ')

describe('week fingerprints', () => {
  it('is too unsure to say anything about very little text', () => {
    expect(signature(['Week 1 slides'])).toBeNull()
  })

  it('matches the same material, even reworded a little, and not a different lecture', () => {
    const a = signature([lecture('thermodynamics', 60)])!
    expect(a).toHaveLength(SIGNATURE_SIZE)
    // The same text read again, with page markers and different case: identical.
    expect(similarity(a, signature([`[page 1]\n${lecture('thermodynamics', 60).toUpperCase()}`])!)).toBe(1)
    // Split across two files.
    const half = lecture('thermodynamics', 60).split('. ')
    expect(similarity(a, signature([half.slice(0, 30).join('. '), half.slice(30).join('. ')])!)).toBeGreaterThan(0.85)
    // A few lines changed.
    expect(similarity(a, signature([lecture('thermodynamics', 60) + ' ' + lecture('entropy', 6)])!)).toBeGreaterThan(0.6)
    // A different lecture.
    expect(similarity(a, signature([lecture('electromagnetism', 60).replace(/idea/g, 'law')])!)).toBeLessThan(0.2)
  })

  it('ignores accents and punctuation', () => {
    expect(words('Café, naïve—résumé! [page 3] x')).toEqual(['cafe', 'naive', 'resume'])
  })

  it('names who published a course', () => {
    expect(authorsText(['alex'])).toBe('alex')
    expect(authorsText(['alex', 'sam'])).toBe('alex and sam')
    expect(authorsText(['alex', 'sam', 'kim'])).toBe('alex, sam and kim')
    expect(authorsText(['alex', 'sam', 'kim', 'lee', 'pat'])).toBe('alex, sam and 3 others')
  })

  it('labels models', () => {
    expect(modelLabel({ model: 'opus', effort: 'high' })).toBe('opus · high')
    expect(modelLabel({ model: 'gpt-oss:120b', effort: null, provider: 'ollama' })).toBe('gpt-oss:120b (Ollama)')
  })
})

let dir: string
let svc: typeof import('../../src/main/services/course')
let share: typeof import('../../src/main/services/weekShare')
let getDb: typeof import('../../src/main/db').getDb
let closeDb: () => void

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sw-market-'))
  process.env.STUDYWISE_DATA_DIR = dir
  const db = await import('../../src/main/db')
  closeDb = db.closeDb
  getDb = db.getDb
  db.openDb(join(dir, 't.db'))
  const { seedPresets } = await import('../../src/main/ai/presets')
  seedPresets()
  svc = await import('../../src/main/services/course')
  share = await import('../../src/main/services/weekShare')
})
afterAll(() => {
  closeDb?.()
  rmSync(dir, { recursive: true, force: true })
})

const ctx = () => ({ signal: new AbortController().signal, progress: () => {}, delta: () => {}, meta: () => {} })
const PDF = resolve('tests/fixtures/photoelectric-lecture.pdf')

describe('publishing a week (mock AI)', () => {
  it('records the model and effort, puts them and a fingerprint in the shared week, and reuses identical slides when merging', async () => {
    const course = svc.createCourse({ name: 'Quantum 101', level: 'first-year physics' })
    const w1 = svc.addWeek(course.id)
    await svc.addFiles(w1.id, [PDF])
    await svc.planWeek(w1.id, ctx())
    const [t1] = svc.listTopics(course.id)
    await svc.writeTopic(t1.id, ctx())

    const week = getDb().prepare('SELECT planned_with FROM weeks WHERE id = ?').get(w1.id) as { planned_with: string }
    const planned = JSON.parse(week.planned_with)
    expect(planned.model).toBeTruthy()
    expect(planned.provider).toBe('claude')
    expect('effort' in planned).toBe(true)
    const topic = getDb().prepare('SELECT written_with FROM topics WHERE id = ?').get(t1.id) as { written_with: string }
    expect(JSON.parse(topic.written_with).standard.model).toBeTruthy()

    // The same fingerprint every time, and it matches the file's own.
    const fp = await svc.weekFingerprint(w1.id)
    expect(fp.hashes).toHaveLength(1)
    expect(fp.sig).toHaveLength(SIGNATURE_SIZE)

    const file = join(dir, 'w1.studyweek')
    await share.exportWeek(w1.id, file)
    const json = JSON.parse(await (await JSZip.loadAsync(readFileSync(file))).file('week.json')!.async('string'))
    expect(json.fingerprint).toEqual(fp)
    expect(json.week.planned_with).toBe(week.planned_with)
    expect(json.topics.find((t: { id: string }) => t.id === t1.id).written_with).toBe(topic.written_with)

    // Into a new course: who made it comes along.
    const r = await share.importWeek(file, { newCourse: true })
    const imported = getDb().prepare('SELECT planned_with FROM weeks WHERE id = ?').get(r.weekId) as { planned_with: string }
    expect(imported.planned_with).toBe(week.planned_with)

    // Into a week of yours that already has the same PDF: yours is used, not a copy.
    const mine = svc.createCourse({ name: 'My physics', level: '' })
    const w = svc.addWeek(mine.id)
    await svc.addFiles(w.id, [PDF])
    await share.importWeek(file, { weekId: w.id })
    const files = svc.getCourse(mine.id).weeks[0].files
    expect(files).toHaveLength(1)
    const merged = svc.listTopics(mine.id).filter((t) => t.status === 'ready')
    const figures = merged.flatMap((t) => t.content!.sections.map((s) => s.figure).filter(Boolean))
    for (const f of figures) expect(f!.fileId).toBe(files[0].id)
  })
})

describe('publishing automatically', () => {
  it('waits for the week’s topics, publishes once, and never touches weeks with someone else’s work', async () => {
    const market = await import('../../src/main/services/market')
    const repo = await import('../../src/main/db/repo')
    const { setSecret } = await import('../../src/main/secrets')
    const jobs = await import('../../src/main/jobs')
    const course = svc.createCourse({ name: 'Auto 101', level: '' })
    const w = svc.addWeek(course.id)
    await svc.addFiles(w.id, [PDF])
    await svc.planWeek(w.id, ctx())
    const [t1] = svc.listTopics(course.id)
    await svc.writeTopic(t1.id, ctx())

    // Off by default.
    market.queueAutoPublish(w.id)
    expect(market.pendingAutoPublish()).toEqual([])
    // On, but no marketplace connected: nothing.
    repo.setSetting('market.autoPublish', true)
    market.queueAutoPublish(w.id)
    expect(market.pendingAutoPublish()).toEqual([])

    // (Zipping needs real timers, so the shared week goes in first.)
    const file = join(dir, 'auto.studyweek')
    await share.exportWeek(w.id, file)
    const into = svc.addWeek(course.id, 'Week 2')
    await share.importWeek(file, { weekId: into.id })

    repo.setSetting('market.url', 'http://localhost:1')
    setSecret('secret.marketKey', 'swm_test')
    vi.useFakeTimers()
    try {
      // Several topics finishing: one publish, after the last.
      market.queueAutoPublish(w.id)
      market.queueAutoPublish(w.id)
      expect(market.pendingAutoPublish()).toEqual([w.id])
      // Another topic still writing when the wait is over: not yet.
      getDb().prepare("UPDATE topics SET status = 'writing' WHERE id != ? AND week_id = ?").run(t1.id, w.id)
      const before = jobs.listJobs().length
      vi.advanceTimersByTime(market.AUTO_PUBLISH_DELAY_MS)
      expect(market.pendingAutoPublish()).toEqual([])
      expect(jobs.listJobs().length).toBe(before)
      getDb().prepare("UPDATE topics SET status = 'planned' WHERE status = 'writing' AND week_id = ?").run(w.id)

      // A shared week merged in: it's someone else's work now, so never automatic.
      market.queueAutoPublish(into.id)
      expect(market.pendingAutoPublish()).toEqual([])
    } finally {
      vi.useRealTimers()
      repo.setSetting('market.autoPublish', false)
      setSecret('secret.marketKey', null)
    }
  })
})
