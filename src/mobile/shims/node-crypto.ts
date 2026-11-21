// node:crypto, as far as the shared desktop code needs it on the phone.
export const randomUUID = (): string => crypto.randomUUID()

export function randomBytes(n: number): Uint8Array & { toString(enc?: string): string } {
  const b = crypto.getRandomValues(new Uint8Array(n)) as Uint8Array & { toString(enc?: string): string }
  b.toString = () => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return b
}

export const randomInt = (min: number, max?: number): number => {
  const [lo, hi] = max === undefined ? [0, min] : [min, max]
  return lo + Math.floor(Math.random() * (hi - lo))
}

/** Not cryptographic: only used to tell prompt versions apart. */
export function createHash(_alg: string) {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  return {
    update(s: string | Uint8Array) {
      const str = typeof s === 'string' ? s : new TextDecoder().decode(s)
      for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193) >>> 0
        h2 = Math.imul(h2 ^ str.charCodeAt(i), 0x5bd1e995) >>> 0
      }
      return this
    },
    digest: (_enc?: string) => h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
  }
}
export default { randomUUID, randomBytes, randomInt, createHash }
