// Short random ids for anything that ends up encoded in a printed QR code (administration and
// student ids — see geometry.ts's sheetCode). A full uuid() per id would make that QR's payload
// ~73 characters, pushing it to a QR version dense enough that real-world scan compression
// (see scanPdf's failure mode this was built to fix: MRC-compressed "scan to PDF" output often
// only resolves fine bilevel detail at ~75-150dpi even when the page nominally scanned higher)
// can't resolve individual modules reliably. A short id keeps the payload — and so the QR
// version and module count — small, which is the single biggest lever on real-world scan
// robustness. Collision risk at this scale (one teacher's classes) is negligible.
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function shortId(length = 8): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(length))
    return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
  }
  // Fallback for any non-browser render pass — not cryptographically strong, but this is a
  // display/lookup id, not a secret.
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}
