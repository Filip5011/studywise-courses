// A week's material as a short signature, so the marketplace can tell when
// someone is about to plan a week from slides another person already turned
// into a course, without the slides themselves ever being sent.
//
// MinHash over five-word shingles: two weeks' signatures agree in about the
// same share of positions as their shingle sets overlap (Jaccard). Re-exported
// slides, a transcript with a few words changed or a lecture split into two
// PDFs still match closely. The marketplace server only compares signatures,
// so this file is the one place the hashing is defined; changing it means
// bumping FINGERPRINT_VERSION so old and new signatures aren't compared.

export const FINGERPRINT_VERSION = 1
export const SIGNATURE_SIZE = 128
const SHINGLE = 5
/** Fewer words than this and any match is chance. */
const MIN_WORDS = 40

/** Lowercase words, without the [page N] markers PDFs are read with. */
export function words(text: string): string[] {
  return text
    .replace(/\[page \d+\]/gi, ' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
}

/** FNV-1a, 32-bit. */
function fnv(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Fixed per-position multipliers and offsets (odd, so each is a bijection on 32 bits). */
const SEEDS = (() => {
  let x = 0x9e3779b9
  const next = () => {
    // xorshift32
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return x >>> 0
  }
  return Array.from({ length: SIGNATURE_SIZE }, () => ({ a: next() | 1, b: next() }))
})()

/**
 * The signature of a week's texts (all its files together), or null when
 * there's too little text to say anything (scanned slides, a few pictures).
 */
export function signature(texts: string[]): number[] | null {
  const w = texts.flatMap(words)
  if (w.length < MIN_WORDS) return null
  const sig = new Array<number>(SIGNATURE_SIZE).fill(0xffffffff)
  const seen = new Set<number>()
  for (let i = 0; i + SHINGLE <= w.length; i++) {
    const h = fnv(w.slice(i, i + SHINGLE).join(' '))
    if (seen.has(h)) continue
    seen.add(h)
    for (let k = 0; k < SIGNATURE_SIZE; k++) {
      const v = (Math.imul(SEEDS[k].a, h) + SEEDS[k].b) >>> 0
      if (v < sig[k]) sig[k] = v
    }
  }
  return sig
}

/** Roughly how much of two weeks' material is the same, 0–1. */
export function similarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== SIGNATURE_SIZE || b.length !== SIGNATURE_SIZE) return 0
  let same = 0
  for (let i = 0; i < SIGNATURE_SIZE; i++) if (a[i] === b[i]) same++
  return same / SIGNATURE_SIZE
}

/** What's sent to the marketplace about a week's material. */
export interface WeekFingerprint {
  v: number
  /** MinHash of all the week's text, or null when it has too little. */
  sig: number[] | null
  /** sha256 of each source file, so identical slides match even with no text layer. */
  hashes: string[]
}
