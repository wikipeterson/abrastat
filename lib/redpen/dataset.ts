// Turns an assessment's results into a Lab-shaped GridState — one row per student, mirroring
// lib/polls/dataset.ts's buildGridFromPoll exactly (same "Send to the Lab" pattern). One column
// per question (0/1, whether that student got it right) is included alongside score/percent so
// question-level correctness is explorable in the Lab too, not just the overall score.

import { ColumnType, GridColumn, GridState } from '@/types'
import { RedPenAssessment, RedPenResult, RedPenStudent } from './types'

export function buildGridFromResults(
  assessment: RedPenAssessment, students: RedPenStudent[], results: RedPenResult[],
  /** False for a multi-version assessment: a "Q5" column can't honestly mean one thing once
   *  different sheets in the same export were scored against different versions' Q5. */
  includeQuestionColumns = true,
): GridState {
  const columns: GridColumn[] = [
    { id: 'student', name: 'Student', type: 'categorical' as ColumnType },
    { id: 'score', name: 'Score', type: 'numeric' as ColumnType },
    { id: 'percent', name: 'Percent', type: 'numeric' as ColumnType },
    ...(includeQuestionColumns
      ? assessment.answerKey
        .slice()
        .sort((a, b) => a.n - b.n)
        .map(key => ({ id: `q${key.n}`, name: `Q${key.n}`, type: 'numeric' as ColumnType }))
      : []),
  ]

  const rows = results.map(r => {
    const student = students.find(s => s.id === r.studentId)
    const pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0
    const row: Record<string, string | number> = {
      student: student?.name ?? r.studentId,
      score: r.score,
      percent: pct,
    }
    if (includeQuestionColumns) {
      for (const resp of r.responses) row[`q${resp.n}`] = resp.correct ? 1 : 0
    }
    return row
  })

  return { columns, rows }
}
