// Compares what the reader decided against the answer key and produces a score. Iterates over
// bubbleRows(assessment) — the same source of truth SheetPrintView prints from and scanPipeline
// samples from — so a question never gets scored unless it actually had a bubble on the sheet.

import { bubbleRows } from './layout'
import { AnswerValue, RedPenAssessment, RedPenResponse } from './types'

function answersMatch(given: AnswerValue, key: AnswerValue): boolean {
  if (Array.isArray(key)) {
    if (!Array.isArray(given)) return false
    if (given.length !== key.length) return false
    const g = new Set(given)
    return key.every(letter => g.has(letter))
  }
  return given === key
}

export interface ScoreResult {
  score: number
  maxScore: number
  responses: RedPenResponse[]
}

/** `given` maps question number → what the reader decided (or null if nothing confident). A
 *  bubble row with no matching answerKey entry (sheets printed before the key was finished)
 *  still gets a response row for visibility, but never counts toward maxScore. */
export function scoreAssessment(assessment: RedPenAssessment, given: Map<number, AnswerValue | null>): ScoreResult {
  const responses: RedPenResponse[] = []
  let score = 0
  let maxScore = 0

  for (const row of bubbleRows(assessment)) {
    const key = assessment.answerKey.find(e => e.n === row.n)
    const g = given.get(row.n) ?? null
    if (!key) {
      responses.push({ n: row.n, given: g, correct: false })
      continue
    }
    const correct = g !== null && answersMatch(g, key.answer)
    maxScore += key.points
    if (correct) score += key.points
    responses.push({ n: row.n, given: g, correct })
  }

  return { score, maxScore, responses }
}
