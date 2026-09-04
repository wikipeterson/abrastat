'use client'

// Poll share links (lib/polls/storage.ts's ShareLinkCard builds these): /p/JQFP for a class poll
// (the 4-letter code doubles as the URL token) or /p/<poll-id> for a public poll. Resolving which
// kind a token is stays purely format-based (4 uppercase letters vs. anything else) rather than
// trying both lookups, since a poll id is a full uuid and can never collide with that shape.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AnswerForm } from '@/components/polls/AnswerForm'
import { isValidCodeFormat, normalizeCode } from '@/lib/polls/code'
import { getPoll, getPollByClassCode } from '@/lib/polls/storage'
import { Poll } from '@/lib/polls/types'

export default function SharedPollPage() {
  return (
    <ProtectedRoute>
      <SharedPollContent />
    </ProtectedRoute>
  )
}

function SharedPollContent() {
  const params = useParams<{ token: string }>()
  const token = decodeURIComponent(params.token ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [poll, setPoll] = useState<Poll | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      try {
        const normalized = normalizeCode(token)
        const found = isValidCodeFormat(normalized) ? await getPollByClassCode(normalized) : await getPoll(token)
        if (cancelled) return
        if (!found) { setError("This link doesn't match a poll."); return }
        setPoll(found)
      } catch {
        if (!cancelled) setError("Couldn't load this poll. Try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    resolve()
    return () => { cancelled = true }
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-xl space-y-4">
        <div className="text-center">
          <Link href="/workspace?mode=library&section=polls" className="font-serif italic text-lg font-semibold text-[var(--color-text)]">
            AbraStat · Polls
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-4 text-center">{error}</div>
        ) : poll ? (
          <PollCard poll={poll} done={done} onDone={() => setDone(true)} />
        ) : null}
      </div>
    </div>
  )
}

function PollCard({ poll, done, onDone }: { poll: Poll; done: boolean; onDone: () => void }) {
  if (poll.status === 'pending_review') {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center space-y-2">
        <div className="font-serif italic text-xl font-semibold text-[var(--color-text)]">{poll.title}</div>
        <p className="text-sm text-[var(--color-muted)]">This poll is still pending review and isn&apos;t answerable yet.</p>
      </div>
    )
  }
  if (poll.status === 'rejected') {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center">
        <p className="text-sm text-[var(--color-muted)]">This poll isn&apos;t available.</p>
      </div>
    )
  }
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[var(--color-border)] font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
        {poll.mode === 'public' && poll.category ? `${poll.category} · ` : ''}{poll.title}
      </div>
      <div className="p-5">
        {done ? (
          <div className="text-sm text-[var(--color-accent-strong)] bg-[var(--color-accent-light)] rounded-lg p-4 text-center font-medium">
            You&apos;ve responded to this poll.
          </div>
        ) : (
          <AnswerForm poll={poll} onDone={onDone} />
        )}
      </div>
    </div>
  )
}
