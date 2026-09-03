// RedPen data model. Backed by Firestore (lib/redpen/storage.ts) — flat top-level collections
// scoped by an `ownerId` field, matching lib/firestore.ts's existing `datasets` convention
// rather than the original design spec's nested subcollection sketch. These interfaces are the
// app-facing shape; `ownerId` is a storage.ts-only concern, not part of any type here.

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

export type DecisionTag = 'FAINT' | 'DOUBLE' | 'ERASURE' | 'NO_MARK' | 'NO_QR' | 'NO_FIDUCIALS' | 'WRONG_ADMIN'

export interface DecisionLogEntry {
  administrationId: string
  page: number
  /** Omitted for a sheet-level problem (e.g. NO_QR, NO_FIDUCIALS) rather than one question. */
  n?: number
  studentId?: string
  tag: DecisionTag
  detail: string
}

export interface RedPenResult {
  studentId: string
  administrationId: string
  score: number
  maxScore: number
  responses: RedPenResponse[]
  /** True if any question on this sheet needed a judgment call — mirrors logEntries.length > 0. */
  flagged: boolean
  /** This student's own decision-log entries from the scan that produced this result. Sheet-
   *  level failures (NO_QR/NO_FIDUCIALS) have no student to attach to and aren't persisted here
   *  or anywhere — they're shown once, in-memory, right after the scan that produced them. */
  logEntries: DecisionLogEntry[]
}
