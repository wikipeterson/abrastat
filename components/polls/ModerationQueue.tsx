'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { isPollsModerator } from '@/lib/featureFlags'
import { approvePoll, listPendingPolls, rejectPoll } from '@/lib/polls/storage'
import { Poll } from '@/lib/polls/types'
import { PollsError, PollsLoading } from './PollsStatus'

/** Gated client-side (hides the screen/nav item for everyone else) and — the enforcement that
 *  actually matters — by the Firestore security rule, which only allows reading a
 *  `pending_review` poll doc, or flipping its status, when the request's auth email matches
 *  POLLS_MODERATOR_EMAIL exactly. A non-moderator who somehow reaches this component gets an
 *  empty queue and denied writes, not real access. */
export function ModerationQueue() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [polls, setPolls] = useState<Poll[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  async function refresh() {
    try {
      const list = await listPendingPolls()
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      setPolls(list)
      setError(null)
    } catch {
      setError("Couldn't load the moderation queue.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  if (!isPollsModerator(user)) return <PollsError message="This screen is only visible to the moderator." />
  if (loading) return <PollsLoading />
  if (error) return <PollsError message={error} />

  async function handleDecision(poll: Poll, decision: 'approve' | 'reject') {
    setBusyId(poll.id)
    try {
      if (decision === 'approve') await approvePoll(poll.id)
      else await rejectPoll(poll.id)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-5">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Moderation queue</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Public directory submissions land here; class-code polls skip this entirely since they aren&apos;t discoverable.
          Each creator sees their own poll&apos;s status under My Polls, not this queue.
        </p>
      </div>

      {polls.length === 0 && (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-6 text-center">
          Nothing waiting for review.
        </div>
      )}

      <div className="space-y-2">
        {polls.map(p => (
          <div key={p.id} className="flex items-center gap-3 border border-[var(--color-border)] rounded-xl bg-white px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--color-text)]">{p.title}</div>
              <div className="font-mono text-[11.5px] text-[var(--color-muted)] mt-0.5">
                submitted by {p.ownerName || 'a user'} · {p.category || 'General'} · {p.questions.length} question{p.questions.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleDecision(p, 'reject')}
                disabled={busyId === p.id}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--color-danger-light)] text-[var(--color-danger)] disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => handleDecision(p, 'approve')}
                disabled={busyId === p.id}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-50"
              >
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
