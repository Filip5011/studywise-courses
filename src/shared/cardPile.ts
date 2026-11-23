// The key-term cards in a course topic: how the pile moves as you rate cards.

/** A rating: 1 red ("Didn't know"), 2 yellow ("Sort of"), 3 green ("Knew it"). */
export type PileRating = 1 | 2 | 3

/** A card is done once you've said "Knew it" this many times. */
export const GREENS_TO_PASS = 2
/** "Didn't know" brings the card back after this many other cards. */
export const RED_GAP = 3

/**
 * Where a card goes after you rate it, and whether it's done. Red ("Didn't
 * know") comes back after RED_GAP cards; yellow ("Sort of") goes to the back;
 * green ("Knew it") goes to the back too, and a card's second green finishes
 * it. Greens always count, whatever colours came before.
 */
export function nextPile(queue: number[], greens: Record<number, number>, r: PileRating): { queue: number[]; greens: Record<number, number>; done: boolean } {
  const [idx, ...rest] = queue
  if (r === 3) {
    const g = (greens[idx] ?? 0) + 1
    const done = g >= GREENS_TO_PASS
    return { queue: done ? rest : [...rest, idx], greens: { ...greens, [idx]: g }, done }
  }
  if (r === 1) return { queue: [...rest.slice(0, RED_GAP), idx, ...rest.slice(RED_GAP)], greens, done: false }
  return { queue: [...rest, idx], greens, done: false }
}

