// StudySmarter plain-text card format:
//   question/#*#/answer
//   #
//   question/#*#/answer
// A line that is exactly "#" separates cards. "#" anywhere else is content.

export const SEP = '/#*#/'

export interface ParsedCard {
  front: string
  back: string
  required_points: number | null
  kind: 'regular' | 'cloze'
  cloze_answers: string[]
  /** Raw text of the block, for warnings */
  raw: string
  /** True if the block had no separator */
  missingSeparator: boolean
}

export interface ParseResult {
  cards: ParsedCard[]
  /** Text of a trailing block that looked cut off (dropped from cards) */
  truncatedTail: string | null
}

const BLANK_RE = /_{3,}/g

export function stripCodeFences(text: string): string {
  const t = text.replace(/\r\n?/g, '\n')
  const lines = t.split('\n')
  const isFence = (l: string) => /^\s*```/.test(l)
  const first = lines.findIndex(isFence)
  if (first === -1) return t
  let last = -1
  for (let i = lines.length - 1; i > first; i--) if (isFence(lines[i])) {
    last = i
    break
  }
  // Take what's inside the outer fence, as long as no cards sit outside it
  // (prose like "Here are your cards:" is dropped). An unclosed fence means
  // the reply was cut off: keep everything after the opening line.
  const before = lines.slice(0, first).join('\n')
  const after = last === -1 ? '' : lines.slice(last + 1).join('\n')
  if (before.includes(SEP) || after.includes(SEP)) return t
  return lines.slice(first + 1, last === -1 ? undefined : last).join('\n')
}

export function parseRequiredPoints(question: string): number | null {
  const m = question.trim().match(/\((\d{1,2})\)\s*$/)
  return m ? Number(m[1]) : null
}

export function countBlanks(question: string): number {
  return (question.match(BLANK_RE) ?? []).length
}

/**
 * A question whose answer is a list says how many points it wants: "(2)" for
 * two bullets. Adds a missing count and fixes a wrong one. Fill-in-the-blank
 * questions (___) never get one, and a one-line answer is left alone.
 */
export function withPointCount(front: string, back: string): string {
  if (countBlanks(front) > 0) return front
  const n = bulletItems(back).length
  if (n < 2) return front
  const base = front.trim().replace(/\s*\(\d{1,2}\)\s*$/, '')
  return `${base} (${n})`
}

/** Lines starting with "- " (ignoring indentation) */
export function bulletItems(answer: string): string[] {
  return answer
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-•*]\s+/.test(l))
    .map((l) => l.replace(/^[-•*]\s+/, '').trim())
}

function trimBlock(s: string): string {
  return s.replace(/^\s*\n/, '').replace(/\s+$/, '').trim()
}

export function parseStudySmarterText(input: string, opts: { detectTruncation?: boolean } = {}): ParseResult {
  const text = stripCodeFences(input)
  const blocks: string[] = []
  let cur: string[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '#') {
      blocks.push(cur.join('\n'))
      cur = []
    } else cur.push(line)
  }
  blocks.push(cur.join('\n'))

  const nonEmpty = blocks.filter((b) => b.trim().length > 0)
  let truncatedTail: string | null = null
  if (opts.detectTruncation && nonEmpty.length > 0) {
    const last = nonEmpty[nonEmpty.length - 1]
    if (looksTruncated(last)) {
      truncatedTail = last
      nonEmpty.pop()
    }
  }

  const cards = nonEmpty.map((raw): ParsedCard => {
    const idx = raw.indexOf(SEP)
    const missingSeparator = idx === -1
    const front = trimBlock(missingSeparator ? raw : raw.slice(0, idx))
    const back = missingSeparator ? '' : trimBlock(raw.slice(idx + SEP.length))
    const blanks = countBlanks(front)
    const kind = blanks > 0 ? 'cloze' : 'regular'
    let cloze_answers: string[] = []
    if (kind === 'cloze') {
      const bullets = bulletItems(back)
      cloze_answers = bullets.length > 0 ? bullets : back ? [back.trim()] : []
    }
    return {
      front,
      back,
      required_points: kind === 'cloze' ? null : parseRequiredPoints(front),
      kind,
      cloze_answers,
      raw,
      missingSeparator
    }
  })
  return { cards, truncatedTail }
}

/** A last block is "cut off" if it has no separator, an empty answer, or a
 * bullet count below its (n). */
export function looksTruncated(block: string): boolean {
  const idx = block.indexOf(SEP)
  if (idx === -1) return true
  const front = block.slice(0, idx).trim()
  const back = block.slice(idx + SEP.length).trim()
  if (!back) return true
  const n = parseRequiredPoints(front)
  if (n !== null && countBlanks(front) === 0) {
    const bullets = bulletItems(back).length
    if (bullets < n) return true
  }
  return false
}

export interface CardLike {
  front: string
  back: string
  kind?: string
  cloze_answers?: string[]
}

export function serializeCard(c: CardLike): string {
  let back = c.back
  if (c.kind === 'cloze' && c.cloze_answers && c.cloze_answers.length > 0 && !back.trim()) {
    back = c.cloze_answers.length === 1 ? c.cloze_answers[0] : c.cloze_answers.map((a) => `- ${a}`).join('\n\n')
  }
  return `${c.front.trim()}${SEP}${back.trim()}`
}

export function serializeStudySmarterText(cards: CardLike[]): string {
  return cards.map(serializeCard).join('\n#\n') + '\n'
}

export type WarningCode = 'points_mismatch' | 'cloze_count' | 'cloze_has_points' | 'empty_side' | 'duplicate' | 'missing_separator'
export interface CardWarning {
  index: number
  code: WarningCode
  message: string
}

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}_ ]/gu, '').trim()
}

export function validateCards(cards: { front: string; back: string; missingSeparator?: boolean }[]): CardWarning[] {
  const out: CardWarning[] = []
  const seen = new Map<string, number>()
  cards.forEach((c, index) => {
    if (c.missingSeparator) out.push({ index, code: 'missing_separator', message: 'Missing "/#*#/" between question and answer' })
    if (!c.front.trim() || !c.back.trim()) out.push({ index, code: 'empty_side', message: c.front.trim() ? 'Answer is empty' : 'Question is empty' })
    const blanks = countBlanks(c.front)
    const n = parseRequiredPoints(c.front)
    const bullets = bulletItems(c.back).length
    if (blanks > 0) {
      if (n !== null) out.push({ index, code: 'cloze_has_points', message: 'Fill-in-the-blank questions should not have a (n) number' })
      const answers = bullets > 0 ? bullets : c.back.trim() ? 1 : 0
      if (answers !== blanks) out.push({ index, code: 'cloze_count', message: `${blanks} blank${blanks === 1 ? '' : 's'} but ${answers} answer${answers === 1 ? '' : 's'}` })
    } else if (n !== null && n !== bullets) {
      out.push({ index, code: 'points_mismatch', message: `Question says (${n}) but the answer has ${bullets} bullet${bullets === 1 ? '' : 's'}` })
    } else if (n === null && bullets > 1) {
      out.push({ index, code: 'points_mismatch', message: `Answer has ${bullets} bullets but the question has no (${bullets})` })
    }
    const key = normalizeQuestion(c.front)
    if (key) {
      if (seen.has(key)) out.push({ index, code: 'duplicate', message: `Duplicate of card ${seen.get(key)! + 1}` })
      else seen.set(key, index)
    }
  })
  return out
}

export function dedupeCards<T extends { front: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((c) => normalizeQuestion(c.front)))
  const out: T[] = []
  for (const c of incoming) {
    const k = normalizeQuestion(c.front)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out
}
