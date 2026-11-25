import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { NOTE_LEVELS, NOTE_LEVEL_INFO, unreviewedSections } from '@shared/course'

let dir: string
let svc: typeof import('../../src/main/services/course')
let closeDb: () => void

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sw-addnotes-'))
  process.env.STUDYWISE_DATA_DIR = dir
  const db = await import('../../src/main/db')
  closeDb = db.closeDb
  db.openDb(join(dir, 't.db'))
  const { seedPresets } = await import('../../src/main/ai/presets')
  seedPresets()
  svc = await import('../../src/main/services/course')
})
afterAll(() => {
  closeDb?.()
  rmSync(dir, { recursive: true, force: true })
})

const ctx = () => ({ signal: new AbortController().signal, progress: () => {}, delta: () => {}, meta: () => {} })

describe('explain it like I’m 12 (mock AI)', () => {
  it('is a level you can write, with its own instructions, kept alongside the others', async () => {
    expect(NOTE_LEVELS).toContain('simple')
    expect(NOTE_LEVEL_INFO.simple.label).toBe('Explain it like I’m 12')
    expect(svc.levelInstructions('simple')).toMatch(/12-year-old/)
    expect(svc.levelInstructions('simple')).toMatch(/example/)

    const course = svc.createCourse({ name: 'Simple optics', level: 'first-year' })
    const w = svc.addWeek(course.id)
    await svc.addFiles(w.id, [resolve('tests/fixtures/photoelectric-lecture.pdf')])
    await svc.planWeek(w.id, ctx())
    const [t] = svc.listTopics(course.id)
    await svc.writeTopic(t.id, ctx())
    await svc.writeTopic(t.id, ctx(), '', ['simple'], true)
    expect(svc.getTopic(t.id)).toMatchObject({ level: 'standard', levels: ['standard', 'simple'] })
    expect((await svc.setTopicLevel(t.id, 'simple')).level).toBe('simple')
  }, 60_000)
})

describe('adding new notes to a week (mock AI)', () => {
  it('adds new sections after the ones you reviewed, plans new topics, and keeps your progress', async () => {
    const share = await import('../../src/main/services/weekShare')
    const course = svc.createCourse({ name: 'Optics notes', level: 'first-year' })
    const w = svc.addWeek(course.id)
    await svc.addFiles(w.id, [resolve('tests/fixtures/photoelectric-lecture.pdf')])
    await svc.planWeek(w.id, ctx())
    const [t, t2] = svc.listTopics(course.id)
    // Written at two levels, and finished (with a test score).
    await svc.writeTopic(t.id, ctx(), '', ['standard', 'quick'])
    const before = svc.getTopic(t.id)
    const oldSections = before.content!.sections
    const cardsBefore = before.card_count
    svc.saveProgress(t.id, { ...before.progress, section: oldSections.length, done: true, answered: 6, correct: 5, checkScore: 4, checkTotal: 5 })
    const plannedBefore = svc.getTopic(t2.id).plan.sections.length

    // New notes, as a pasted file.
    const notes = join(dir, 'Notes added today.md')
    writeFileSync(notes, 'Stopping voltage: the voltage that just stops the fastest photoelectrons. Photon momentum is p = h / wavelength.')
    const fresh = (await svc.addFiles(w.id, [notes])).filter((f) => f.name.startsWith('Notes added'))
    const r = await svc.addNotesToWeek(w.id, fresh.map((f) => f.id), ctx())
    expect(r).toMatchObject({ sections: 1, updated: 1, topics: 1 })
    expect(r.summary).toMatch(/stopping voltage/i)

    const after = svc.getTopic(t.id)
    // What you'd already studied is exactly as it was; the new section comes after it, marked.
    expect(after.content!.sections.slice(0, oldSections.length)).toEqual(oldSections)
    expect(after.content!.sections).toHaveLength(oldSections.length + 1)
    const added = after.content!.sections[oldSections.length]
    expect(added.heading).toBe('What is stopping voltage?')
    expect(added.added).toBeTruthy()
    expect(after.content!.check.length).toBe(before.content!.check.length + 1)
    // Opened up again at the new section, with the scores kept.
    expect(after.progress).toMatchObject({ done: false, section: oldSections.length, answered: 6, checkScore: 4 })
    expect(unreviewedSections(after)).toEqual([oldSections.length])
    expect(unreviewedSections(before)).toEqual([])
    // One new recall card, shared by both levels.
    expect(after.card_count).toBe(cardsBefore + 1)
    expect(after.status).toBe('ready')
    expect(after.levels).toEqual(['standard', 'quick'])
    const quick = await svc.setTopicLevel(t.id, 'quick')
    expect(quick.content!.sections.at(-1)!.added).toBeTruthy()
    expect(quick.content!.sections.at(-1)!.cards?.[0]?.id).toBe(added.cards?.[0]?.id)
    await svc.setTopicLevel(t.id, 'standard')

    // A topic not written yet just plans the new section; nothing else changes.
    expect(svc.getTopic(t2.id).plan.sections.length).toBe(plannedBefore)
    // The new topic is planned at the end of the week, marked as added.
    const topics = svc.listTopics(course.id).filter((x) => x.week_id === w.id)
    const last = topics.at(-1)!
    expect(last).toMatchObject({ status: 'planned' })
    expect(last.plan.title).toBe('Photon momentum')
    expect(last.plan.added).toBeTruthy()
    expect(last.plan.needs).toEqual([t.key])

    // Studying the new section marks it reviewed.
    svc.saveProgress(t.id, { ...after.progress, section: oldSections.length + 1, done: true })
    expect(unreviewedSections(svc.getTopic(t.id))).toEqual([])

    // Shared or published, it's an ordinary section.
    const { json } = await share.weekZip(w.id)
    const row = json.topics.find((x) => x.id === t.id)!
    expect(JSON.stringify(row.content)).not.toContain('"added"')
    expect(JSON.stringify(row.versions)).not.toContain('"added"')
    expect(String(json.topics.find((x) => x.id === last.id)!.plan)).not.toContain('"added"')
  }, 60_000)

  it('needs a planned week, and new files', async () => {
    const course = svc.createCourse({ name: 'Empty notes', level: '' })
    const w = svc.addWeek(course.id)
    const notes = join(dir, 'more.md')
    writeFileSync(notes, 'Something new.')
    const [f] = await svc.addFiles(w.id, [notes])
    await expect(svc.addNotesToWeek(w.id, [f.id], ctx())).rejects.toThrow(/Plan/)
    await expect(svc.addNotesToWeek(w.id, ['nope'], ctx())).rejects.toThrow(/None of those/)
  })
})
