// Turns a poll + its responses into a Lab-shaped GridState — one column per question, one row
// per respondent. Shared by CSV export (lib/datasetExport.ts's exportGridAsCsv) and "Send to the
// Lab" (lib/firestore.ts's saveDataset), so a poll's export and its Lab dataset are always built
// from the exact same columns.

import { ColumnType, GridColumn, GridState } from '@/types'
import { Poll, PollResponse } from './types'

export function buildGridFromPoll(poll: Poll, responses: PollResponse[]): GridState {
  const columns: GridColumn[] = poll.questions.map((q, i) => ({
    id: q.id,
    name: q.prompt.trim() || `Question ${i + 1}`,
    type: (q.type === 'numeric' ? 'numeric' : 'categorical') as ColumnType,
  }))

  const rows = responses.map(response => {
    const row: Record<string, string | number> = {}
    for (const q of poll.questions) {
      const value = response.answers[q.id]
      if (value !== undefined) row[q.id] = value
    }
    return row
  })

  return { columns, rows }
}
