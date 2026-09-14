// Single source of truth for "which question numbers get a bubble row, in what two-column
// arrangement, with which letters." Both SheetPrintView (drawing bubbles) and scanPipeline
// (reading them) call this — the whole premise of the fixed geometry in geometry.ts is that
// print and read agree on bubble positions arithmetically, which only holds if they also agree
// on which questions HAVE a bubble row in the first place. A question is skipped here if it's
// listed unscorable (free-response, no bubble on the sheet) or its key entry is a grid-in
// (those get their own band via gridinEntries below, not an MC row) — everything else gets a row.

import { AnswerEntry, RedPenAssessment } from './types'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export interface BubbleRow {
  n: number
  letters: string[]
}

export function bubbleRows(assessment: RedPenAssessment): BubbleRow[] {
  const unscorable = new Set(assessment.unscorable.map(u => u.n))
  const gridin = new Set(
    assessment.answerKey.filter(e => e.type === 'gridin').map(e => e.n),
  )
  const letters = LETTERS.slice(0, assessment.choiceCount)

  const rows: BubbleRow[] = []
  for (let n = 1; n <= assessment.questionCount; n++) {
    if (unscorable.has(n) || gridin.has(n)) continue
    rows.push({ n, letters })
  }
  return rows
}

/** Splits bubble rows into the sheet's two printed columns, same left/right balance the
 *  printed page and the reader must agree on (first half left, remainder right). */
export function splitIntoColumns(rows: BubbleRow[]): { colA: BubbleRow[]; colB: BubbleRow[] } {
  const half = Math.ceil(rows.length / 2)
  return { colA: rows.slice(0, half), colB: rows.slice(half) }
}

/** The grid-in questions on this sheet, in question-number order — a sibling to bubbleRows()
 *  for the sign+digit-column band instead of the MC grid. SheetPrintView, scanPipeline, and the
 *  builder's page-capacity check all call this rather than filtering answerKey themselves. */
export function gridinEntries(assessment: RedPenAssessment): AnswerEntry[] {
  return assessment.answerKey
    .filter(e => e.type === 'gridin')
    .sort((a, b) => a.n - b.n)
}
