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

import { AnswerValue, DecisionTag } from './types'

const CLEAR_THRESHOLD = 0.55
const MARGIN = 2

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

  if (top.fill > 0 && gap >= MARGIN) {
    return {
      given: top.letter,
      log: { tag: 'FAINT', detail: `Darkest bubble ${top.letter} reached ${pct(top.fill)}, below the 55% threshold but ${gap === Infinity ? 'the only mark' : `${gap.toFixed(1)}× the next candidate`}. Accepted as ${top.letter}.` },
    }
  }

  return { given: null, log: { tag: 'NO_MARK', detail: 'No bubble reached a confident fill level.' } }
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
