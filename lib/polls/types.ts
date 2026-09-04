// Polls data model. Backed by Firestore (lib/polls/storage.ts) — flat top-level collections
// scoped by an `ownerId` field, matching lib/firestore.ts's `datasets` convention and
// lib/redpen/types.ts's precedent, rather than the design handoff's nested sketch. `ownerId` on
// Poll and `userId` on PollResponse are storage.ts-facing identity fields, not UI concerns.

export type PollMode = 'class' | 'public'
export type PollStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'closed'
export type QuestionType = 'categorical' | 'numeric'

export interface PollQuestion {
  id: string
  prompt: string
  type: QuestionType
  /** categorical only */
  choices?: string[]
  /** numeric only — response validation */
  min?: number
  max?: number
  decimals?: number
}

export interface Poll {
  id: string
  ownerId: string
  ownerName: string
  mode: PollMode
  title: string
  /** class mode only — 4 uppercase letters, unique only among other currently-published class polls */
  classCode?: string
  /** public mode only */
  category?: string
  status: PollStatus
  questions: PollQuestion[]
  /** Denormalized so the response cap can be checked without a count query; kept in sync by the
   *  transaction in storage.ts's submitResponse. */
  responseCount: number
  createdAt: string
  updatedAt: string
}

export interface PollResponse {
  pollId: string
  userId: string
  /** questionId -> the respondent's value (a choice string for categorical, a number for numeric) */
  answers: Record<string, string | number>
  submittedAt: string
}

export const POLL_RESPONSE_CAP = 1000
