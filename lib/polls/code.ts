// Class-code generation. Only needs to be unique among currently-published class polls (see
// storage.ts's createPoll), not globally or permanently, so 26^4 ≈ 457,000 combinations is
// plenty — collisions get regenerated on the rare hit rather than needing a bigger alphabet.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function generateClassCode(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(4))
    return Array.from(bytes, b => LETTERS[b % LETTERS.length]).join('')
  }
  let out = ''
  for (let i = 0; i < 4; i++) out += LETTERS[Math.floor(Math.random() * LETTERS.length)]
  return out
}

export function isValidCodeFormat(code: string): boolean {
  return /^[A-Z]{4}$/.test(code)
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}
