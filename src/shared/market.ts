// The course marketplace: weeks people have generated and published, grouped
// into courses, so others can add them instead of generating their own. The
// server is a separate site (studywise-market); these are the shapes its API
// returns.

import type { ModelChoice } from './types'

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
  /** The week's place in the author's course (1 = their first week). */
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
  author: string
  weekCount: number
  topicCount: number
  cardCount: number
  /** Every model its topics were written with, most used first. */
  models: MarketModel[]
  downloads: number
  updatedAt: string
  mine: boolean
}

export interface MarketCourseFull extends MarketCourse {
  weeks: MarketWeek[]
}

/** A published week made from (nearly) the same material as one of yours. */
export interface MarketMatch {
  week: MarketWeek
  course: { id: string; name: string; author: string }
  /** How much of the material is the same, 0–1. */
  score: number
  /** How many of your files are byte-for-byte the same as theirs. */
  sameFiles: number
}

export interface MarketStatus {
  url: string
  hasKey: boolean
}

export type MarketSort = 'recent' | 'popular'

/** "opus · high", "sonnet", "gpt-oss:120b (Ollama) · high". */
export function modelLabel(m: { model: string; effort?: string | null; provider?: string | null }): string {
  const name = m.provider === 'ollama' ? `${m.model} (Ollama)` : m.model
  return m.effort ? `${name} · ${m.effort}` : name
}
