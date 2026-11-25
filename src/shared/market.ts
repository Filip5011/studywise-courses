// The course marketplace: weeks people have generated and published, grouped
// into courses, so others can add them instead of generating their own.
// Courses belong to nobody: everyone's weeks for a course with the same name
// are in the same course. Each week belongs to whoever published it. The
// server is a separate site (studywise-server); these are the shapes its API
// returns.

import type { ModelChoice } from './types'
import { weekNumber } from './course'

/** A model and effort, and how many topics (or levels of a topic) were written with it. */
export interface MarketModel {
  model: string
  effort: string | null
  provider: string | null
  count: number
}

export interface MarketTopic {
  title: string
  goal: string
  sections: string[]
  /** Levels of detail it's written at (standard, revision, deep); empty if only planned. */
  levels: string[]
}

export interface MarketWeek {
  id: string
  courseId: string
  label: string
  /** The week's place in its author's own course (1 = their first week). */
  number: number
  author: string
  topics: MarketTopic[]
  topicCount: number
  writtenCount: number
  cardCount: number
  files: { name: string; size: number }[]
  /** Size of the download in bytes. */
  size: number
  plannedWith: ModelChoice | null
  writtenWith: MarketModel[]
  downloads: number
  createdAt: string
  updatedAt: string
  mine: boolean
}

export interface MarketCourse {
  id: string
  name: string
  module: string
  level: string
  /** Everyone who has published a week of it, most weeks first. */
  authors: string[]
  weekCount: number
  topicCount: number
  cardCount: number
  /** Every model its topics were written with, most used first. */
  models: MarketModel[]
  downloads: number
  updatedAt: string
  /** You've published a week of it. */
  mine: boolean
}

export interface MarketCourseFull extends MarketCourse {
  weeks: MarketWeek[]
}

/** A published week made from (nearly) the same material as one of yours. */
export interface MarketMatch {
  week: MarketWeek
  course: { id: string; name: string }
  /** How much of the material is the same, 0–1. */
  score: number
  /** How many of your files are byte-for-byte the same as theirs. */
  sameFiles: number
  /** The same week number of what looks like the same course (by name), whatever the slides. */
  sameWeek: boolean
}

/** A marketplace week you already have on this device: you added it here, or published it from here. */
export interface MarketCopy {
  weekId: string
  courseId: string
  course: string
  week: string
  how: 'added' | 'published'
  /** When you added it (null for one you published). */
  at: string | null
}

export interface MarketStatus {
  url: string
  hasKey: boolean
}

/** Settings: publish your weeks as their topics are written. */
export const AUTO_PUBLISH_SETTING = 'market.autoPublish'
/** Weeks that hold someone else's work (a shared or marketplace week went into them): never published automatically. */
export const IMPORTED_WEEKS_SETTING = 'market.importedWeeks'

export type MarketSort = 'recent' | 'popular'

/** "alex", "alex and sam", "alex, sam and 3 others". */
export function authorsText(shown: string[]): string {
  if (shown.length <= 2) return shown.join(' and ')
  if (shown.length === 3) return `${shown[0]}, ${shown[1]} and ${shown[2]}`
  return `${shown[0]}, ${shown[1]} and ${shown.length - 2} others`
}

/**
 * A course's weeks grouped by week number, in order, so everyone's version of
 * week 3 sits together. In each group the most downloaded version comes
 * first, then the most recently updated.
 */
export function weeksByNumber<W extends Pick<MarketWeek, 'number' | 'downloads' | 'updatedAt'>>(weeks: W[]): { number: number; versions: W[] }[] {
  const groups = new Map<number, W[]>()
  for (const w of weeks) groups.set(w.number, [...(groups.get(w.number) ?? []), w])
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, versions]) => ({
      number,
      versions: versions.sort((a, b) => b.downloads - a.downloads || b.updatedAt.localeCompare(a.updatedAt))
    }))
}

/** "opus · high", "sonnet", "gpt-oss:120b (Ollama) · high". */
export function modelLabel(m: { model: string; effort?: string | null; provider?: string | null }): string {
  const name = m.provider === 'ollama' ? `${m.model} (Ollama)` : m.model
  return m.effort ? `${name} · ${m.effort}` : name
}

// ---------------------------------------------------------------------------
// Downloading a whole course (or the weeks of it you don't have)

/** Every week of a course, or only the weeks your course doesn't have yet. */
export type AddMode = 'all' | 'missing'

/** One marketplace week to add, and where it goes. */
export interface AddItem {
  week: MarketWeek
  /** A blank week of yours with the same number, which it fills; null to add it as a new week. */
  into: { id: string; label: string } | null
}

/** Weeks are the same week when they have the same number ("Week 3", "W3"), or failing that the same label. */
export function weekKey(label: string): string {
  const n = weekNumber(label)
  return n === null ? `label:${label.trim().toLowerCase()}` : `n:${n}`
}

/**
 * Which of a marketplace course's weeks to add to one of your courses (none
 * yet for a new course). One version of each week: where several people
 * published the same week, the one already in your course, else yours, else
 * the most written, most downloaded, newest. A week already added to that
 * course from the marketplace is always skipped; with 'missing', so is any
 * week the course already has with topics in it (made by you or anyone). A
 * blank week of yours with the same number is filled rather than added again.
 */
export function planAdd(
  remote: MarketWeek[],
  local: { id: string; label: string; topics: number }[],
  have: Record<string, { courseId: string }>,
  courseId: string | null,
  mode: AddMode
): { items: AddItem[]; skipped: number } {
  const inCourse = (w: MarketWeek) => !!courseId && have[w.id]?.courseId === courseId
  const groups = new Map<string, MarketWeek[]>()
  for (const w of remote) groups.set(weekKey(w.label), [...(groups.get(weekKey(w.label)) ?? []), w])
  const items: AddItem[] = []
  let skipped = 0
  for (const [key, ws] of groups) {
    const [best] = [...ws].sort(
      (a, b) =>
        Number(inCourse(b)) - Number(inCourse(a)) ||
        Number(b.mine) - Number(a.mine) ||
        b.writtenCount - a.writtenCount ||
        b.downloads - a.downloads ||
        b.updatedAt.localeCompare(a.updatedAt)
    )
    const same = local.filter((l) => weekKey(l.label) === key)
    if (inCourse(best) || (mode === 'missing' && same.some((l) => l.topics > 0))) {
      skipped++
      continue
    }
    const blank = same.find((l) => l.topics === 0)
    items.push({ week: best, into: blank ? { id: blank.id, label: blank.label } : null })
  }
  const order = (w: MarketWeek) => weekNumber(w.label) ?? w.number
  items.sort((a, b) => order(a.week) - order(b.week) || a.week.label.localeCompare(b.week.label))
  return { items, skipped }
}

/** "COMP23311", "CS 1001": capitals then digits, as module codes are written. */
const moduleCode = (s: string) => s.match(/\b([A-Z]{2,6})\s?(\d{3,6}[A-Z]?)\b/)?.slice(1).join('') ?? null
const bareName = (s: string) =>
  s
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** The same course under (maybe) different names: the same module code when both have one, otherwise the same name without brackets, punctuation or case. */
export function sameCourse(a: { name: string; module?: string }, b: { name: string; module?: string }): boolean {
  const ca = moduleCode(a.module || a.name) ?? moduleCode(a.name)
  const cb = moduleCode(b.module || b.name) ?? moduleCode(b.name)
  if (ca && cb) return ca === cb
  return bareName(a.name) === bareName(b.name)
}
