// Print-exact sheet geometry (spec §02). Every value is in inches unless noted, and every
// component that lays out a printed sheet must consume these constants rather than
// re-deriving them — the whole point of a fixed geometry is that a future scan-reader pass
// can compute bubble centers arithmetically once the corner fiducials are located, with no
// separate bubble-finding pass.

export const PAGE_WIDTH_IN = 8.5
export const PAGE_HEIGHT_IN = 11

/** Filled squares at three corners + filled circle at the fourth, inset from the trim edge. */
export const FIDUCIAL_SIZE_IN = 0.22
export const FIDUCIAL_INSET_IN = 0.35

/** Nothing important may sit closer to the edge than this (printer margin drift, ADF skew). */
export const SAFE_MARGIN_IN = FIDUCIAL_INSET_IN

/** Bubble grid: fixed pitch so every bubble center is arithmetic once corners are located. */
export const BUBBLE_PITCH_IN = 0.26
export const BUBBLE_DIAMETER_IN = 0.17
/** 1pt outline at 60% grey so the outline itself never trips the fill threshold. */
export const BUBBLE_OUTLINE_PT = 1
export const BUBBLE_OUTLINE_GREY = 'rgba(0,0,0,0.6)'

/** ID/sheet-code strip (used only if falling back to the bar-strip instead of the QR code). */
export const BARCODE_BAR_WIDTH_IN = 0.07
export const BARCODE_BAR_HEIGHT_IN = 0.19

// ── Absolute layout, in canonical page-inches (origin = page top-left, same frame the
// fiducials live in) ──────────────────────────────────────────────────────────────────────
//
// The scan reader has no way to measure organic text flow on a scanned image — it can only
// compute where things are from fixed numbers. So every region between the fiducial inset and
// the first bubble row is a FIXED-HEIGHT box (rendered with overflow:hidden, however much text
// it actually holds), not auto-height CSS flow, and every bubble center below that is pure
// arithmetic from these constants. SheetPrintView and scanPipeline both import this file
// instead of each defining their own copy — that agreement is the entire point.

/** Printable content starts this far from each edge (inside the fiducial inset). */
export const CONTENT_ORIGIN_IN = FIDUCIAL_INSET_IN + 0.15

/** Fixed-height header box (title/section/date/name) — text is clipped to this box, never
 *  allowed to push the rows below it around. */
export const HEADER_BLOCK_HEIGHT_IN = 0.62
/** Fixed-height box for the QR code + sheet-code text. */
export const ID_BLOCK_HEIGHT_IN = 0.82
/** The QR code itself, within the ID block. Printed larger than the payload strictly needs —
 *  real "scan to PDF" output is often Mixed-Raster-Content compressed (a high-res bilevel mask
 *  recolored from much lower-res color layers, ~75-150dpi in practice), which blurs fine
 *  bilevel detail well below the mask's nominal resolution. Physical module size is the lever
 *  that survives that degradation; see id.ts for the matching short-payload-id side of this. */
export const QR_SIZE_IN = 0.7

/** Y offset (from CONTENT_ORIGIN_IN) where the bubble grid's first row begins. */
export const BUBBLE_GRID_TOP_IN = HEADER_BLOCK_HEIGHT_IN + ID_BLOCK_HEIGHT_IN

/** Canonical page-inch top-left + size of the QR code — an explicit position (not "wherever
 *  flexbox centers it") so the reader can crop to exactly where the printer put it. Centered
 *  vertically within the ID block, flush left. */
export function qrRegionIn(): { x: number; y: number; size: number } {
  return {
    x: CONTENT_ORIGIN_IN,
    y: CONTENT_ORIGIN_IN + HEADER_BLOCK_HEIGHT_IN + (ID_BLOCK_HEIGHT_IN - QR_SIZE_IN) / 2,
    size: QR_SIZE_IN,
  }
}

/** Space reserved for the "01" question-number label before a row's first bubble. */
export const NUMBER_COL_WIDTH_IN = 0.24
/** Gap between the two printed columns of questions. */
export const COLUMN_GAP_IN = 0.3

export const CONTENT_WIDTH_IN = PAGE_WIDTH_IN - 2 * CONTENT_ORIGIN_IN
export const COLUMN_WIDTH_IN = (CONTENT_WIDTH_IN - COLUMN_GAP_IN) / 2

/** Canonical page-inch position of a fiducial's CENTER — the actual affine reference points. */
export function fiducialCenterIn(corner: 'tl' | 'tr' | 'bl' | 'br'): { x: number; y: number } {
  const half = FIDUCIAL_SIZE_IN / 2
  const left = FIDUCIAL_INSET_IN + half
  const right = PAGE_WIDTH_IN - FIDUCIAL_INSET_IN - half
  const top = FIDUCIAL_INSET_IN + half
  const bottom = PAGE_HEIGHT_IN - FIDUCIAL_INSET_IN - half
  switch (corner) {
    case 'tl': return { x: left, y: top }
    case 'tr': return { x: right, y: top }
    case 'bl': return { x: left, y: bottom }
    case 'br': return { x: right, y: bottom }
  }
}

/** Left edge of column 0 (left) or 1 (right), in canonical page-inches. */
export function columnLeftIn(col: 0 | 1): number {
  return CONTENT_ORIGIN_IN + col * (COLUMN_WIDTH_IN + COLUMN_GAP_IN)
}

/** Vertical center of a bubble row, 0-indexed within its column, in canonical page-inches. */
export function rowCenterYIn(row: number): number {
  return CONTENT_ORIGIN_IN + BUBBLE_GRID_TOP_IN + row * BUBBLE_PITCH_IN + BUBBLE_PITCH_IN / 2
}

/** How many rows fit in one printed column before the bubble grid runs into `usableBottomIn` —
 *  computed from the real layout constants above, not a guessed number, so it can't silently
 *  drift out of sync if this file's geometry ever changes. Takes the usable bottom as a
 *  parameter (rather than always the footer) so a grid-in band's reserved height can shrink it. */
function maxRowsPerColumnAbove(usableBottomIn: number): number {
  let row = 0
  while (rowCenterYIn(row) + BUBBLE_DIAMETER_IN / 2 < usableBottomIn) row++
  return row
}

/** The largest question count the builder should ever allow — past this, bubble rows run off
 *  the physical page (and, since the scan reader computes positions from this same geometry,
 *  those questions would read back as blank for every student with no visible error). Two
 *  columns per sheet, rounded down to a clean step-of-5 with a small safety margin rather than
 *  the exact computed limit, so ordinary print-driver rounding can't tip it over — plus however
 *  many grid-in questions are already on the sheet, since those consume a question *number* but
 *  not MC-grid space (they live in their own band below it, see gridinBandHeightIn). */
export function maxQuestionsPerSheet(gridinBlockCount: number, maxGridinDigits: number): number {
  const footerTopIn = PAGE_HEIGHT_IN - CONTENT_ORIGIN_IN - 0.15
  const bandHeight = gridinBandHeightIn(gridinBlockCount, maxGridinDigits)
  const usableBottomIn = footerTopIn - (bandHeight > 0 ? bandHeight + GRIDIN_ROW_GAP_IN : 0)
  const mcRows = Math.max(0, maxRowsPerColumnAbove(usableBottomIn))
  const maxMcQuestions = Math.floor((mcRows * 2) / 5) * 5
  return maxMcQuestions + gridinBlockCount
}

// ── Grid-in questions: a sign column + one column per digit, each an 11-bubble stack
// (0-9 and a decimal point) with a write-in box above it — the classic SAT layout. Laid out in
// its own band below the MC grid, wrapping left-to-right; every grid-in block on one sheet
// shares the widest digit count among this assessment's grid-in questions (a shorter question
// just doesn't use its block's rightmost columns) so blocks line up in a clean grid instead of
// a ragged one. ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_GRIDIN_DIGITS = 4
export const GRIDIN_SYMBOLS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.']
/** The single shared sign bubble in front of the digit columns — blank means positive. */
export const GRIDIN_SIGN_SYMBOL = '−'
export const GRIDIN_COL_WIDTH_IN = BUBBLE_PITCH_IN
export const GRIDIN_WRITE_BOX_HEIGHT_IN = 0.28
export const GRIDIN_LABEL_HEIGHT_IN = 0.16
export const GRIDIN_BLOCK_GAP_IN = 0.24
export const GRIDIN_ROW_GAP_IN = 0.2
export const GRIDIN_BLOCK_HEIGHT_IN = GRIDIN_LABEL_HEIGHT_IN + GRIDIN_WRITE_BOX_HEIGHT_IN + GRIDIN_SYMBOLS.length * BUBBLE_PITCH_IN

/** Sign column + one column per digit. */
export function gridinBlockWidthIn(maxDigits: number): number {
  return (1 + maxDigits) * GRIDIN_COL_WIDTH_IN
}

export function gridinBlocksPerRow(maxDigits: number): number {
  const w = gridinBlockWidthIn(maxDigits)
  return Math.max(1, Math.floor((CONTENT_WIDTH_IN + GRIDIN_BLOCK_GAP_IN) / (w + GRIDIN_BLOCK_GAP_IN)))
}

/** Total vertical space the grid-in band needs, however many rows of blocks that wraps into. */
export function gridinBandHeightIn(blockCount: number, maxDigits: number): number {
  if (blockCount === 0) return 0
  const rows = Math.ceil(blockCount / gridinBlocksPerRow(maxDigits))
  return rows * GRIDIN_BLOCK_HEIGHT_IN + (rows - 1) * GRIDIN_ROW_GAP_IN
}

/** Y position (canonical page-inches) where the grid-in band starts — right after however many
 *  MC rows this assessment's bubble grid actually uses (not the theoretical page maximum), so
 *  print and scanPipeline agree exactly and a sheet with few MC questions doesn't waste vertical
 *  space before its grid-in band. `mcRowCount` is the taller of the two MC columns' row counts
 *  (0 if the assessment has no MC questions at all). */
export function gridinBandTopIn(mcRowCount: number): number {
  return CONTENT_ORIGIN_IN + BUBBLE_GRID_TOP_IN + mcRowCount * BUBBLE_PITCH_IN + GRIDIN_ROW_GAP_IN
}

/** Canonical page-inch top-left of the Nth grid-in block (0-indexed), given the band starts at
 *  `bandTopIn` (typically right after the MC grid's own reserved space). */
export function gridinBlockOriginIn(index: number, maxDigits: number, bandTopIn: number): { x: number; y: number } {
  const perRow = gridinBlocksPerRow(maxDigits)
  const row = Math.floor(index / perRow)
  const col = index % perRow
  const w = gridinBlockWidthIn(maxDigits)
  return {
    x: CONTENT_ORIGIN_IN + col * (w + GRIDIN_BLOCK_GAP_IN),
    y: bandTopIn + row * (GRIDIN_BLOCK_HEIGHT_IN + GRIDIN_ROW_GAP_IN),
  }
}

/** Canonical page-inch center of one column's write-in box / bubble stack. `colIndex` is
 *  0-indexed: 0 is the sign column, 1..maxDigits are the digit columns. */
export function gridinColumnCenterXIn(blockOrigin: { x: number }, colIndex: number): number {
  return blockOrigin.x + colIndex * GRIDIN_COL_WIDTH_IN + GRIDIN_COL_WIDTH_IN / 2
}

/** Canonical page-inch center of one symbol bubble within a column. `symbolIndex` is 0-indexed
 *  into GRIDIN_SYMBOLS for a digit column, or 0 for the sign column's single bubble. */
export function gridinBubbleCenterIn(blockOrigin: { y: number }, colCenterXIn: number, symbolIndex: number): { x: number; y: number } {
  const y = blockOrigin.y + GRIDIN_LABEL_HEIGHT_IN + GRIDIN_WRITE_BOX_HEIGHT_IN + symbolIndex * BUBBLE_PITCH_IN + BUBBLE_PITCH_IN / 2
  return { x: colCenterXIn, y }
}

/** Canonical page-inch position of the question-number label's center for a row. */
export function rowLabelCenterIn(col: 0 | 1, row: number): { x: number; y: number } {
  return { x: columnLeftIn(col) + NUMBER_COL_WIDTH_IN / 2, y: rowCenterYIn(row) }
}

/** Canonical page-inch position of one bubble's CENTER. `col` is 0 (left) or 1 (right); `row`
 *  is 0-indexed within that column; `letterIndex` is 0-indexed (A=0, B=1, ...). */
export function bubbleCenterIn(col: 0 | 1, row: number, letterIndex: number): { x: number; y: number } {
  const x = columnLeftIn(col) + NUMBER_COL_WIDTH_IN + letterIndex * BUBBLE_PITCH_IN + BUBBLE_PITCH_IN / 2
  return { x, y: rowCenterYIn(row) }
}

/**
 * Per-student sheet code the scan pipeline will read to identify a sheet (spec §05) —
 * administrationId + studentId, so results survive sheets getting shuffled in the ADF and
 * need no name-matching. Kept short and delimited so it round-trips through a QR payload
 * and is still legible if someone has to type it in by hand.
 */
export function sheetCode(administrationId: string, studentId: string): string {
  return `${administrationId}:${studentId}`
}
