// Locates the 4 corner fiducials on a binarized scanned page, works out the sheet's
// orientation from which physical corner turns out to hold the round mark, and solves the
// affine transform (canonical page-inches → scan pixels) from the 3 square corners. Everything
// downstream (bubbleRead.ts, qrRead.ts) works in pixel space reached only through this
// transform — spec §03: "every bubble centre is arithmetic once corners are located."

import { fiducialCenterIn, FIDUCIAL_SIZE_IN } from './geometry'

export interface Point { x: number; y: number }

export interface AffineTransform {
  a: number; b: number; c: number; d: number; e: number; f: number
}

/** inches → pixels: [x'] = [a b][x] + [e]   [y'] = [c d][y] + [f] */
export function applyAffine(t: AffineTransform, p: Point): Point {
  return { x: t.a * p.x + t.b * p.y + t.e, y: t.c * p.x + t.d * p.y + t.f }
}

/** Solves the unique affine transform mapping 3 canonical points to 3 pixel points. Throws if
 *  the 3 canonical points are collinear (they never are here — 3 corners of a rectangle). */
function solveAffine3Point(canonical: [Point, Point, Point], pixel: [Point, Point, Point]): AffineTransform {
  const [p1, p2, p3] = canonical
  // Coefficient matrix shared by both the x-row and y-row systems (see module comment in
  // scanPipeline.ts for the derivation): [Px Py 1] * [a;b;e] = [Qx], same for [c;d;f] with Qy.
  const det = p1.x * (p2.y - p3.y) - p1.y * (p2.x - p3.x) + (p2.x * p3.y - p3.x * p2.y)
  if (Math.abs(det) < 1e-9) throw new Error('Fiducial points are collinear — cannot solve affine transform.')

  // x and y each satisfy their own [Px Py 1]·[coeffs] = [Q] system with this same coefficient
  // matrix (only the right-hand side differs), so solve both by Cramer's rule.
  function solveRow(q1: number, q2: number, q3: number): [number, number, number] {
    const a = (q1 * (p2.y - p3.y) - p1.y * (q2 - q3) + (q2 * p3.y - q3 * p2.y)) / det
    const b = (p1.x * (q2 - q3) - q1 * (p2.x - p3.x) + (p2.x * q3 - p3.x * q2)) / det
    const c = (p1.x * (p2.y * q3 - p3.y * q2) - p1.y * (p2.x * q3 - p3.x * q2) + (p2.x * p3.y - p3.x * p2.y) * q1) / det
    return [a, b, c]
  }

  const [a, b, e] = solveRow(pixel[0].x, pixel[1].x, pixel[2].x)
  const [c, d, f] = solveRow(pixel[0].y, pixel[1].y, pixel[2].y)
  return { a, b, c, d, e, f }
}

interface Blob {
  centroid: Point
  /** darkPixelCount / nominal-fiducial-pixel-area — ≈1 for a filled square, ≈0.785 (π/4) for a
   *  filled circle of the same nominal size, robust to a search window padded larger than the
   *  mark itself. */
  fillRatio: number
}

/** Centroid + fill ratio of dark pixels within a square window around `expectedPx`, sized to
 *  the fiducial plus a slop margin for realistic print/scan misalignment. Returns null if the
 *  window has essentially no dark pixels (missing/clipped fiducial). */
function findBlob(binary: Uint8Array, width: number, height: number, expectedPx: Point, fiducialPx: number, slopPx: number): Blob | null {
  const half = fiducialPx / 2 + slopPx
  const x0 = Math.max(0, Math.round(expectedPx.x - half))
  const x1 = Math.min(width - 1, Math.round(expectedPx.x + half))
  const y0 = Math.max(0, Math.round(expectedPx.y - half))
  const y1 = Math.min(height - 1, Math.round(expectedPx.y + half))

  let count = 0
  let sumX = 0
  let sumY = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (binary[y * width + x]) {
        count++
        sumX += x
        sumY += y
      }
    }
  }
  if (count < 4) return null

  const nominalArea = fiducialPx * fiducialPx
  return { centroid: { x: sumX / count, y: sumY / count }, fillRatio: count / nominalArea }
}

export type Orientation = 'normal' | 'rotated180' | 'mirroredH' | 'mirroredV'

export type LocateFiducialsResult =
  | { ok: true; transform: AffineTransform; orientation: Orientation }
  | { ok: false; reason: string }

/**
 * Finds all 4 corner fiducials, works out orientation from wherever the round one actually
 * turns up, and solves the affine transform from the 3 squares (relabeled to their canonical
 * roles per that orientation). `dpi` must match the resolution the page was rendered at.
 */
export function locateFiducials(binary: Uint8Array, width: number, height: number, dpi: number): LocateFiducialsResult {
  const fiducialPx = FIDUCIAL_SIZE_IN * dpi
  const slopPx = 0.15 * dpi

  const corners: Record<'tl' | 'tr' | 'bl' | 'br', Blob | null> = {
    tl: findBlob(binary, width, height, scale(fiducialCenterIn('tl'), dpi), fiducialPx, slopPx),
    tr: findBlob(binary, width, height, scale(fiducialCenterIn('tr'), dpi), fiducialPx, slopPx),
    bl: findBlob(binary, width, height, scale(fiducialCenterIn('bl'), dpi), fiducialPx, slopPx),
    br: findBlob(binary, width, height, scale(fiducialCenterIn('br'), dpi), fiducialPx, slopPx),
  }

  const missing = (Object.keys(corners) as (keyof typeof corners)[]).filter(k => !corners[k])
  if (missing.length > 0) {
    return { ok: false, reason: `Couldn't find a fiducial mark at: ${missing.join(', ')}.` }
  }
  const found = corners as Record<'tl' | 'tr' | 'bl' | 'br', Blob>

  // Whichever physical corner has the clearly lowest fill ratio is the round one.
  const entries = Object.entries(found) as [keyof typeof found, Blob][]
  const roundest = entries.reduce((min, e) => e[1].fillRatio < min[1].fillRatio ? e : min)
  const physicalRoundCorner = roundest[0]

  // Wherever the round mark physically landed tells us the orientation, and thus which
  // physical corner holds each canonical square role (see module comment above).
  let orientation: Orientation
  let roleOf: Record<'tl' | 'tr' | 'bl', keyof typeof found>
  switch (physicalRoundCorner) {
    case 'br': orientation = 'normal'; roleOf = { tl: 'tl', tr: 'tr', bl: 'bl' }; break
    case 'tl': orientation = 'rotated180'; roleOf = { tl: 'br', tr: 'bl', bl: 'tr' }; break
    case 'bl': orientation = 'mirroredH'; roleOf = { tl: 'tr', tr: 'tl', bl: 'br' }; break
    case 'tr': orientation = 'mirroredV'; roleOf = { tl: 'bl', tr: 'br', bl: 'tl' }; break
  }

  const canonical: [Point, Point, Point] = [fiducialCenterIn('tl'), fiducialCenterIn('tr'), fiducialCenterIn('bl')]
  const pixel: [Point, Point, Point] = [
    found[roleOf.tl].centroid, found[roleOf.tr].centroid, found[roleOf.bl].centroid,
  ]

  return { ok: true, transform: solveAffine3Point(canonical, pixel), orientation }
}

function scale(p: Point, dpi: number): Point {
  return { x: p.x * dpi, y: p.y * dpi }
}
