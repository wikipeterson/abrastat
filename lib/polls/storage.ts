// Firestore persistence — flat top-level collections (`polls`, `pollResponses`), matching
// lib/firestore.ts's `datasets` convention and lib/redpen/storage.ts's precedent rather than the
// design handoff's nested sketch. Security is enforced by Firestore rules (see the Polls build
// plan for the exact rule text) — every query here is written so a matching security rule can
// prove every possible result is readable (Firestore rejects a whole query outright, not just
// the unreadable documents in it, if it can't prove that) — so list queries filter on exactly
// the fields the rule branch they're relying on also checks, even where that means more
// equality filters than strictly needed for the app logic. Pure-equality multi-field queries
// like these don't need a composite index (only a range filter or a differently-ordered field
// would), so nobody has to go click a "create this index" link in the Firebase console.

import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, query, runTransaction, setDoc, updateDoc, where,
} from 'firebase/firestore'
import { v4 as uuid } from 'uuid'
import { db } from '../firebase'
import { generateClassCode, isValidCodeFormat, normalizeCode } from './code'
import { POLL_RESPONSE_CAP, Poll, PollMode, PollQuestion, PollResponse } from './types'

const COLLECTIONS = {
  polls: 'polls',
  responses: 'pollResponses',
} as const

function responseDocId(pollId: string, userId: string): string {
  return `${pollId}_${userId}`
}

// ── Class codes ──────────────────────────────────────────────────────────

async function isClassCodeAvailable(code: string): Promise<boolean> {
  const q = query(
    collection(db, COLLECTIONS.polls),
    where('mode', '==', 'class'),
    where('classCode', '==', code),
    where('status', '==', 'published'),
  )
  const snap = await getDocs(q)
  return snap.empty
}

// ── Polls ────────────────────────────────────────────────────────────────

export async function listMyPolls(userId: string): Promise<Poll[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.polls), where('ownerId', '==', userId)))
  return snap.docs.map(d => d.data() as Poll)
}

export async function listPublicPolls(): Promise<Poll[]> {
  const q = query(collection(db, COLLECTIONS.polls), where('mode', '==', 'public'), where('status', '==', 'published'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as Poll)
}

/** Moderator-only in practice — the security rule only allows reading a `pending_review` doc
 *  when the requester's auth email is the hard-coded moderator address, so this query simply
 *  returns empty (not an error) for anyone else rather than needing a client-side gate to be
 *  the only thing protecting it. */
export async function listPendingPolls(): Promise<Poll[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.polls), where('status', '==', 'pending_review')))
  return snap.docs.map(d => d.data() as Poll)
}

export async function getPoll(id: string): Promise<Poll | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.polls, id))
  return snap.exists() ? (snap.data() as Poll) : null
}

/** Looks up by code regardless of status (published/closed/etc.) so the "enter a class code"
 *  screen can tell a closed poll apart from a code that was never valid, rather than showing
 *  the same generic error for both. */
export async function getPollByClassCode(rawCode: string): Promise<Poll | null> {
  const code = normalizeCode(rawCode)
  if (!isValidCodeFormat(code)) return null
  const q = query(collection(db, COLLECTIONS.polls), where('mode', '==', 'class'), where('classCode', '==', code))
  const snap = await getDocs(q)
  return snap.empty ? null : (snap.docs[0].data() as Poll)
}

export interface CreatePollInput {
  mode: PollMode
  title: string
  category?: string
  questions: PollQuestion[]
  /** Hand-picked by the teacher on the create form; auto-generated if omitted. */
  classCode?: string
}

export async function createPoll(userId: string, ownerName: string, input: CreatePollInput): Promise<Poll> {
  const now = new Date().toISOString()

  let classCode: string | undefined
  if (input.mode === 'class') {
    if (input.classCode) {
      classCode = normalizeCode(input.classCode)
      if (!isValidCodeFormat(classCode)) throw new Error('Class code must be exactly 4 letters.')
      if (!(await isClassCodeAvailable(classCode))) {
        throw new Error('That class code is already in use by an open poll — try another.')
      }
    } else {
      classCode = generateClassCode()
      let attempts = 0
      while (!(await isClassCodeAvailable(classCode)) && attempts < 25) {
        classCode = generateClassCode()
        attempts++
      }
    }
  }

  const poll: Poll = {
    id: uuid(),
    ownerId: userId,
    ownerName,
    mode: input.mode,
    title: input.title,
    status: input.mode === 'class' ? 'published' : 'pending_review',
    questions: input.questions,
    responseCount: 0,
    createdAt: now,
    updatedAt: now,
    ...(classCode ? { classCode } : {}),
    ...(input.mode === 'public' && input.category ? { category: input.category } : {}),
  }
  await setDoc(doc(db, COLLECTIONS.polls, poll.id), poll)
  return poll
}

export interface UpdatePollInput {
  title: string
  category?: string
  questions: PollQuestion[]
  classCode?: string
}

/** Creators can edit any field, any time — no lock once responses exist (per the handoff's
 *  explicit decision). Mode itself isn't editable after creation: switching class↔public would
 *  mean re-deriving moderation state and a code/category that may not exist yet, and nothing in
 *  the handoff calls for that — a poll that needs the other mode is cheap to just recreate. */
export async function updatePoll(id: string, current: Poll, input: UpdatePollInput): Promise<void> {
  const updates: Record<string, unknown> = {
    title: input.title,
    questions: input.questions,
    updatedAt: new Date().toISOString(),
  }
  if (current.mode === 'class') {
    const code = input.classCode ? normalizeCode(input.classCode) : current.classCode
    if (code && code !== current.classCode) {
      if (!isValidCodeFormat(code)) throw new Error('Class code must be exactly 4 letters.')
      if (!(await isClassCodeAvailable(code))) throw new Error('That class code is already in use by an open poll — try another.')
    }
    updates.classCode = code
  } else {
    updates.category = input.category ?? ''
  }
  await updateDoc(doc(db, COLLECTIONS.polls, id), updates)
}

export async function closePoll(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.polls, id), { status: 'closed', updatedAt: new Date().toISOString() })
}

export async function approvePoll(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.polls, id), { status: 'published', updatedAt: new Date().toISOString() })
}

export async function rejectPoll(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.polls, id), { status: 'rejected', updatedAt: new Date().toISOString() })
}

export async function deletePoll(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.polls, id))
}

// ── Responses ────────────────────────────────────────────────────────────

export async function getMyResponse(pollId: string, userId: string): Promise<PollResponse | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.responses, responseDocId(pollId, userId)))
  return snap.exists() ? (snap.data() as PollResponse) : null
}

/** Owner/moderator only, per the security rule — used by the Results screen to compute live
 *  aggregates from raw responses (fine to read the whole set client-side at the 1,000-response
 *  cap; no separate aggregation collection needed). */
export async function listResponses(pollId: string): Promise<PollResponse[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.responses), where('pollId', '==', pollId)))
  return snap.docs.map(d => d.data() as PollResponse)
}

export type SubmitResponseResult = { ok: true } | { ok: false; error: string }

/** Atomically enforces both the response cap and one-response-per-account: the response doc's
 *  id is deterministic (`${pollId}_${userId}`), and the security rule only allows *creating*
 *  that path, never updating it — so a resubmission is a denied "update" from the rule's
 *  perspective, not something this function has to check for itself. The cap and "still open"
 *  checks re-read the poll inside the transaction (not trusting the possibly-stale `poll` the
 *  caller passed in) so two respondents racing the last open slot can't both get through. */
export async function submitResponse(
  poll: Poll, userId: string, answers: Record<string, string | number>,
): Promise<SubmitResponseResult> {
  const pollRef = doc(db, COLLECTIONS.polls, poll.id)
  const responseRef = doc(db, COLLECTIONS.responses, responseDocId(poll.id, userId))
  try {
    await runTransaction(db, async tx => {
      const pollSnap = await tx.get(pollRef)
      if (!pollSnap.exists()) throw new Error('POLL_GONE')
      const current = pollSnap.data() as Poll
      if (current.status !== 'published') throw new Error('POLL_CLOSED')
      if (current.responseCount >= POLL_RESPONSE_CAP) throw new Error('POLL_FULL')
      const response: PollResponse = { pollId: poll.id, userId, answers, submittedAt: new Date().toISOString() }
      tx.set(responseRef, response)
      tx.update(pollRef, { responseCount: increment(1) })
    })
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message === 'POLL_CLOSED') return { ok: false, error: 'This poll has closed and is no longer accepting responses.' }
    if (message === 'POLL_FULL') return { ok: false, error: 'This poll has reached its 1,000-response limit.' }
    if (message === 'POLL_GONE') return { ok: false, error: "This poll doesn't exist anymore." }
    // Most likely cause left: the security rule denied it because a response for this
    // (poll, user) pair already exists — a resubmission is an "update" under the create-only
    // rule, which fails as a permission error rather than a distinct thrown reason.
    return { ok: false, error: "You've already responded to this poll." }
  }
}
