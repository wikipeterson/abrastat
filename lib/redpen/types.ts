// RedPen data model. Shapes mirror the intended Firestore layout (assessments/{id},
// sections/{sectionId}/students/{studentId}, administrations/{id}) so that swapping the
// storage layer (lib/redpen/storage.ts) for Firestore later is a storage-only change —
// nothing here should need to change for that migration.

export type AnswerValue = string | string[]

export interface AnswerEntry {
  n: number
  answer: AnswerValue
  points: number
  type?: 'mc' | 'gridin'
  topic?: string
  /** grid-in only: number of digit boxes on the printed sheet */
  digits?: number
}

export interface UnscorableEntry {
  n: number
  reason: string
}

export interface RedPenAssessment {
  id: string
  title: string
  questionCount: number
  choiceCount: number
  answerKey: AnswerEntry[]
  unscorable: UnscorableEntry[]
  createdAt: string
}

export interface RedPenSection {
  id: string
  label: string
}

export interface RedPenStudent {
  id: string
  sectionId: string
  name: string
}

export type AdministrationStatus = 'sheets-ready' | 'printed' | 'graded'

export interface RedPenAdministration {
  id: string
  assessmentId: string
  sectionId: string
  date: string
  status: AdministrationStatus
}

export interface RedPenResponse {
  n: number
  /** What the reader decided was marked; null if nothing cleared the fill threshold. */
  given: AnswerValue | null
  correct: boolean
}

export interface RedPenResult {
  studentId: string
  administrationId: string
  score: number
  maxScore: number
  responses: RedPenResponse[]
  /** True if any question on this sheet needed a judgment call (see DecisionLogEntry). */
  flagged: boolean
}

export type DecisionTag = 'FAINT' | 'DOUBLE' | 'ERASURE' | 'NO_MARK' | 'NO_QR' | 'NO_FIDUCIALS'

export interface DecisionLogEntry {
  administrationId: string
  page: number
  /** Omitted for a sheet-level problem (e.g. NO_QR, NO_FIDUCIALS) rather than one question. */
  n?: number
  studentId?: string
  tag: DecisionTag
  detail: string
}
