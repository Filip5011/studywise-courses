import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { nextPile } from '@shared/cardPile'
import { moveAnswer, reshuffleQuestion, type CourseQuestion } from '@shared/course'
import { reshuffleLearnQuestion, type LearnQuestion } from '@shared/questions'

let dir: string
let svc: typeof import('../../src/main/services/course')
let repo: typeof import('../../src/main/db/repo')
let ai: typeof import('../../src/main/ai')
let closeDb: () => void

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sw-levels-'))
  process.env.STUDYWISE_DATA_DIR = dir
  const db = await import('../../src/main/db')
  closeDb = db.closeDb
  db.openDb(join(dir, 't.db'))
  const { seedPresets } = await import('../../src/main/ai/presets')
  seedPresets()
  repo = await import('../../src/main/db/repo')
  svc = await import('../../src/main/services/course')
  ai = await import('../../src/main/ai')
})
afterAll(() => {
  closeDb?.()
  rmSync(dir, { recursive: true, force: true })
})

const ctx = () => ({ signal: new AbortController().signal, progress: () => {}, delta: () => {}, meta: () => {} })

describe('key-term card pile', () => {
  it('red comes back after 3 cards, yellow goes to the back', () => {
    expect(nextPile([0, 1, 2, 3, 4], {}, 1).queue).toEqual([1, 2, 3, 0, 4])
    expect(nextPile([0, 1], {}, 1).queue).toEqual([1, 0])
    expect(nextPile([0, 1, 2, 3, 4], {}, 2).queue).toEqual([1, 2, 3, 4, 0])
  })
  it('needs two greens, and greens count whatever came before', () => {
    let p = nextPile([0, 1], {}, 3)
    expect(p).toMatchObject({ queue: [1, 0], done: false, greens: { 0: 1 } })
    p = nextPile([0, 1], p.greens, 1) // red after a green keeps the green
    expect(p.greens[0]).toBe(1)
    p = nextPile([0], p.greens, 3)
    expect(p).toMatchObject({ queue: [], done: true })
  })
})

describe('answers in new places on a retry', () => {
  it('always moves the right option, and keeps it right', () => {
    for (let i = 0; i < 50; i++) {
      const opts = ['a', 'b', 'c', 'd']
      const m = moveAnswer(opts, 2)
      expect(m.answer).not.toBe(2)
      expect(m.options[m.answer]).toBe('c')
    }
    const q: CourseQuestion = { type: 'mcq', q: 'Q?', options: ['w', 'x', 'y', 'z'], answer: 0, hint: '', why: '' }
    const r = reshuffleQuestion(q) as Extract<CourseQuestion, { type: 'mcq' }>
    expect(r.options[r.answer]).toBe('w')
    expect(r.answer).not.toBe(0)
  })
  it('reshuffles Learn questions with a new id', () => {
    const q: LearnQuestion = { id: 'q1', type: 'multiple_choice', card_id: 'c', card_ids: ['c'], cached: false, payload: { question: 'Q?', options: ['a', 'b', 'c', 'd'], correct_index: 1 } }
    const r = reshuffleLearnQuestion(q, 'retry1') as Extract<LearnQuestion, { type: 'multiple_choice' }>
    expect(r.id).not.toBe(q.id)
    expect(r.payload.options[r.payload.correct_index]).toBe('b')
    expect(r.payload.correct_index).not.toBe(1)
    // Same seed, same order: stable across re-renders.
    expect(reshuffleLearnQuestion(q, 'retry1')).toEqual(r)
  })
})

describe('levels of detail, course notes, priority instructions (mock AI)', () => {
  it('keeps every level written, with its own progress, and the recall cards', async () => {
    const course = svc.createCourse({ name: 'Optics', level: 'first-year' })
    const w = svc.addWeek(course.id)
    await svc.addFiles(w.id, [resolve('tests/fixtures/photoelectric-lecture.pdf')])
    await svc.planWeek(w.id, ctx())
    const [t] = svc.listTopics(course.id)

    await svc.writeTopic(t.id, ctx())
    let topic = svc.getTopic(t.id)
    expect(topic).toMatchObject({ level: 'standard', levels: ['standard'], status: 'ready' })
    const cards = topic.card_count
    expect(cards).toBeGreaterThan(0)
    svc.saveProgress(t.id, { ...topic.progress, section: 1, answered: 3, correct: 2 })

    // Another level: shown afterwards, standard kept with its progress, cards unchanged.
    await svc.writeTopic(t.id, ctx(), '', ['quick'])
    topic = svc.getTopic(t.id)
    expect(topic).toMatchObject({ level: 'quick', levels: ['standard', 'quick'], card_count: cards })
    expect(topic.progress.answered).toBe(0)

    topic = await svc.setTopicLevel(t.id, 'standard')
    expect(topic.level).toBe('standard')
    expect(topic.progress).toMatchObject({ section: 1, answered: 3, correct: 2 })
    expect(topic.levels).toEqual(['standard', 'quick'])
    await expect(svc.setTopicLevel(t.id, 'deep')).rejects.toThrow(/written/)

    // Two levels in one go: the first is shown, both are kept.
    const [, t2] = svc.listTopics(course.id)
    if (t2) {
      await svc.writeTopic(t2.id, ctx(), '', ['deep', 'standard'])
      expect(svc.getTopic(t2.id)).toMatchObject({ level: 'standard', levels: ['standard', 'deep'] })
    }
  }, 60_000)

  it('asks for the level of detail, and puts typed instructions first', () => {
    expect(svc.levelInstructions('standard')).toBe('')
    expect(svc.levelInstructions('quick')).toMatch(/QUICK REVISION/)
    expect(svc.levelInstructions('deep')).toMatch(/IN-DEPTH/)
    expect(svc.priorityInstructions('  ')).toBe('')
    expect(svc.priorityInstructions('Skip lecture 2')).toMatch(/take priority[\s\S]*Skip lecture 2/)
  })

  it('puts the course note into every prompt for the course', () => {
    const course = svc.createCourse({ name: 'C Programming', level: 'second-year' })
    const w = svc.addWeek(course.id)
    const deckId = svc.ensureWeekDeck(w.id)
    const before = ai.renderPrompt({ task: 'course_outline', vars: { module: 'C', files: 'x.pdf', instructions: '' }, deckId })
    expect(before.prompt).not.toMatch(/note about this course/)
    svc.setCourseNote(course.id, 'This course is coding heavy, in C.')
    for (const task of ['course_outline', 'course_topic', 'course_mark'] as const) {
      expect(ai.renderPrompt({ task, vars: {}, deckId }).prompt).toMatch(/note about this course[\s\S]*coding heavy, in C/)
    }
    expect(svc.getCourse(course.id).note).toBe('This course is coding heavy, in C.')
    // Another deck gets nothing.
    const other = repo.createDeck({ name: 'Loose' }).id
    expect(ai.renderPrompt({ task: 'course_outline', vars: {}, deckId: other }).prompt).not.toMatch(/coding heavy/)
  })
})

describe('time studied', () => {
  it('adds up per day and shows on the home stats', () => {
    const at = new Date()
    repo.addStudyTime(90, at)
    repo.addStudyTime(30, at)
    repo.addStudyTime(5000, at) // capped per call
    const s = repo.homeStats(at)
    expect(s.time.today).toBe(720)
    expect(s.time.week).toBe(720)
    expect(s.time.total).toBe(720)
    expect(s.days).toHaveLength(7)
    expect(s.days[6].seconds).toBe(720)
    expect(s.streak).toBe(1)
    expect(s.topics.total).toBeGreaterThan(0)
  })
})
