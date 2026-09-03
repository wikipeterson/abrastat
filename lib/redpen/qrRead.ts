// Decodes the sheet-identifying QR code (spec §05's per-student sheet code, printed via
// qrRegionIn in geometry.ts).
//
// This used to crop tightly to the QR's affine-mapped position before decoding, on the theory
// that a smaller image is faster and safer than letting jsQR loose on the whole page. In
// practice that was actively harmful: against a real scanned page, jsQR decoded the QR
// instantly and correctly when given the *entire* page, but failed on a crop sized to just
// contain the QR plus generous padding — and the failure wasn't even a clean function of crop
// size (a few padding fractions in between worked, others didn't). jsQR's scanline-based
// detector apparently wants more surrounding context than a "just enough" crop provides, in a
// way that isn't worth chasing a magic constant for. Decoding the full page is simpler, was
// proven reliable, and a single jsQR pass over one rendered page is fast enough that there's no
// real cost to skipping the optimization.

import jsQR from 'jsqr'

export interface DecodedSheetCode {
  administrationId: string
  studentId: string
}

/** Inverse of geometry.ts's sheetCode(administrationId, studentId). */
function parseSheetCode(text: string): DecodedSheetCode | null {
  const parts = text.split(':')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { administrationId: parts[0], studentId: parts[1] }
}

export function decodeSheetCode(
  page: { data: Uint8ClampedArray; width: number; height: number },
): DecodedSheetCode | null {
  const result = jsQR(page.data, page.width, page.height, { inversionAttempts: 'attemptBoth' })
  if (!result) return null
  return parseSheetCode(result.data)
}
