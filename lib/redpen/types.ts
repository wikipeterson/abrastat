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

/** A single uppercase letter — 'A' or 'B' today, but the type stays a plain string rather than a
 *  union so a future third version doesn't need a type change everywhere it's threaded through. */
export type VersionLabel = string

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
  /** Multi-version only: two assessment docs sharing a versionGroupId *are* the two versions —
   *  same printed shape (question/choice counts, per-question type), different correct answers.
   *  Both absent on an ordinary single-version assessment. See lib/redpen/versions.ts. */
  versionGroupId?: string
  versionLabel?: VersionLabel
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

export type DecisionTag = 'FAINT' | 'DOUBLE' | 'ERASURE' | 'NO_MARK' | 'NO_QR' | 'NO_FIDUCIALS' | 'WRONG_ADMIN' | 'NO_VERSION'

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
  /** Multi-version only: which assessment (of the administration's version group) this sheet was
   *  actually scored against, decided by its own FORM bubble at scan time — not necessarily the
   *  administration's own `assessmentId`. Absent for an ordinary single-version result, where the
   *  administration's assessmentId is the whole story. */
  assessmentId?: string
}

/** A page that read cleanly (fiducials located, so every bubble position is known) but couldn't
 *  be tied to a student — QR didn't decode, or decoded to a student id not in this roster. Same
 *  shape as RedPenResult minus studentId, plus enough to find the page again (`page`) and explain
 *  why it's here (`reason`). Kept around so a teacher can assign it after the fact instead of the
 *  scan being a dead end — see components/redpen/ResultsView.tsx's AssignUnmatchedModal. */
export interface RedPenUnmatchedSheet {
  id: string
  administrationId: string
  page: number
  reason: string
  score: number
  maxScore: number
  responses: RedPenResponse[]
  logEntries: DecisionLogEntry[]
  /** Same meaning as RedPenResult.assessmentId — which version this page's FORM bubble resolved
   *  to, carried through once it's assigned to a student. */
  assessmentId?: string
}
