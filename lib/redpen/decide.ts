// Per-question decision rule (spec §03). The spec's one-sentence rule and its own worked log
// example don't quite agree at the edges — worth spelling out here rather than picking one
// silently:
//   "fill above 55% is a mark... if two clear it, take the darker when the gap is at least 2x,
//   otherwise score it wrong and log it"
// literally only calls for a log entry when two answers clear 55% AND the gap is under 2x. But
// the spec's own example log row is "B at 88%, D at 34%. Gap exceeds 2x, so B was taken. Marked
// for your review" — D at 34% never cleared 55% at all, yet it's still logged, with the exact
// "gap exceeds 2x" framing the rule reserves for the two-cleared case. Read together, the
// intent is broader than the single sentence: ANY time a second candidate is within 2x of the
// top one is worth a teacher's eyes, whether or not it individually cleared the threshold —
// that's the actual accountability signal (a light second mark, partial erasure, or genuine
// double-bubble). So DOUBLE fires whenever the top-two gap is under 2x, regardless of whether
// the runner-up cleared 55% on its own; withholding the answer entirely (scoring it wrong) is
// reserved for when two answers both clear 55% and are that close — a true "can't tell which
// was intended," not just "worth a second look."
//
// Calibration note (first real class scan, 2026-09): a real pencil-marked, copier-scanned sheet
// never got anywhere near 55% — genuine marks landed at 19-50%, unmarked bubbles at 6-11% (see
// the two real sheets inspected when two students' clearly-correct answers scored blank). The
// ratio-based FAINT rescue below correctly saved almost every row on those sheets (a top fill
// 2x+ its nearest competitor is accepted even below 55%), but the two genuine misses shared one
// signature: a *ratio* right at the 2x cutoff (1.74-1.96x) despite an absolute gap of 8-10
// points — comfortably clear of the ~5-point noise floor's own variance. A ratio is just a noisy
// statistic at these low absolute levels (20% vs 10% is 2.0x; the same 20% mark vs 11% of
// background noise is only 1.8x) — an absolute-point gap is the more stable one down here, so
// it's a second, independent way to earn the same FAINT rescue rather than a replacement for the
// ratio test (which stays what a real ambiguous double-mark — both candidates dark and close
// together — actually fails).
//
// Flagging-volume note (same real class scan): with every genuine mark landing at 19-50%, every
// single row on both sheets came in below CLEAR_THRESHOLD and got FAINT-logged — technically
// correct (all 40 were rescued and scored right), but it meant the teacher had to review every
// row on every paper just to find nothing wrong. A gap that clears the rescue thresholds above
// by a wide margin isn't the same kind of "worth a second look" as one that barely clears them —
// CONFIDENT_* below is a second, higher bar: past it, skip the log entirely (same as the
// above-CLEAR_THRESHOLD branch already does when its own gap is wide). On the two real sheets
// this cut flagged rows from 20/20 to well under half each, while still flagging every row that
// was genuinely close to the rescue floor.

import { AnswerValue, DecisionTag } from './types'

const CLEAR_THRESHOLD = 0.55
const MARGIN = 2
const MIN_FAINT_GAP = 0.08
const CONFIDENT_MARGIN = 3
const CONFIDENT_FAINT_GAP = 0.15

export interface BubbleFill {
  letter: string
  fill: number
}

export interface Decision {
  given: AnswerValue | null
  log?: { tag: DecisionTag; detail: string }
}

function pct(f: number): string {
  return `${Math.round(f * 100)}%`
}

/** Single-answer question: exactly one letter, or none. */
export function decideSingle(fills: BubbleFill[]): Decision {
  const sorted = [...fills].sort((a, b) => b.fill - a.fill)
  const top = sorted[0]
  const second = sorted[1] ?? { letter: '', fill: 0 }
  const gap = second.fill > 0 ? top.fill / second.fill : Infinity

  if (top.fill >= CLEAR_THRESHOLD) {
    if (second.fill >= CLEAR_THRESHOLD && gap < MARGIN) {
      return {
        given: null,
        log: { tag: 'DOUBLE', detail: `${top.letter} at ${pct(top.fill)}, ${second.letter} at ${pct(second.fill)}. Gap under 2×, too close to call — scored wrong.` },
      }
    }
    if (gap < MARGIN) {
      return {
        given: top.letter,
        log: { tag: 'DOUBLE', detail: `${top.letter} at ${pct(top.fill)}, ${second.letter} at ${pct(second.fill)}. Gap under 2× — accepted ${top.letter}, worth a second look.` },
      }
    }
    return { given: top.letter }
  }

  const absoluteGap = top.fill - second.fill
  if (top.fill > 0 && (gap >= CONFIDENT_MARGIN || absoluteGap >= CONFIDENT_FAINT_GAP)) {
    // Wide enough margin, even below 55%, that it's not worth a teacher's time — same as the
    // above-threshold branch already does for its own wide-margin case.
    return { given: top.letter }
  }
  if (top.fill > 0 && (gap >= MARGIN || absoluteGap >= MIN_FAINT_GAP)) {
    const margin = gap >= MARGIN
      ? (gap === Infinity ? 'the only mark' : `${gap.toFixed(1)}× the next candidate`)
      : `${pct(absoluteGap)} clear of the next candidate (${pct(second.fill)}) — ratio alone was only ${gap.toFixed(2)}×, too noisy to trust at this fill level`
    return {
      given: top.letter,
      log: { tag: 'FAINT', detail: `Darkest bubble ${top.letter} reached ${pct(top.fill)}, below the 55% threshold but ${margin}. Accepted as ${top.letter}.` },
    }
  }

  // Include the actual numbers here (unlike the branches above, this one used to just say "no
  // bubble reached a confident fill level" with no way to tell a truly blank row from one that
  // just missed the rescue thresholds above — exactly the visibility gap that made the first
  // real miscalibration harder to diagnose than it needed to be).
  const detail = top.fill > 0
    ? `Darkest bubble ${top.letter} reached only ${pct(top.fill)}, ${gap.toFixed(2)}× the next candidate (${second.letter} at ${pct(second.fill)}) — neither the ratio nor the absolute gap cleared the rescue thresholds.`
    : 'No bubble had any measurable fill at all.'
  return { given: null, log: { tag: 'NO_MARK', detail } }
}

/** Multi-answer question (key's answer is an array): every bubble that clears 55% is part of
 *  the given set — multiple marks are expected here, not a conflict. */
export function decideMultiple(fills: BubbleFill[]): Decision {
  const given = fills.filter(f => f.fill >= CLEAR_THRESHOLD).map(f => f.letter)
  if (given.length === 0) {
    return { given: null, log: { tag: 'NO_MARK', detail: 'No bubble reached a confident fill level.' } }
  }
  // Always an array here (even a single mark) — scoring compares this against the key's
  // array-typed answer set-wise, and a bare string would fail that comparison by shape alone.
  return { given }
}
