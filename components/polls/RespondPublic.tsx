'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getMyResponse, listPublicPolls } from '@/lib/polls/storage'
import { Poll } from '@/lib/polls/types'
import { AnswerForm } from './AnswerForm'
import { PollsError, PollsLoading } from './PollsStatus'

interface RespondPublicProps {
  onSeeResults: (pollId: string) => void
}

export function RespondPublic({ onSeeResults }: RespondPublicProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [polls, setPolls] = useState<Poll[]>([])
  const [myResponses, setMyResponses] = useState<Set<string>>(new Set())
  const [answering, setAnswering] = useState<Poll | null>(null)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const list = await listPublicPolls()
        if (cancelled) return
        setPolls(list)
        if (user) {
          const checks = await Promise.all(list.map(p => getMyResponse(p.id, user.uid)))
          if (cancelled) return
          setMyResponses(new Set(list.filter((_, i) => checks[i]).map(p => p.id)))
        }
        setError(null)
      } catch {
        if (!cancelled) setError("Couldn't load public polls. Try refreshing.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    refresh()
    return () => { cancelled = true }
  }, [user])

  if (loading) return <PollsLoading />
  if (error) return <PollsError message={error} />

  if (answering) {
    return (
      <div className="max-w-xl mx-auto py-6 px-4 space-y-4">
        <button onClick={() => setAnswering(null)} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
          ← Back to public polls
        </button>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--color-border)] font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            {answering.category ? `${answering.category} · ` : ''}{answering.title}
          </div>
          <div className="p-5">
            <AnswerForm poll={answering} onDone={() => onSeeResults(answering.id)} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-5">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Browse polls</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">Approved polls, open to any signed-in user. One response each.</p>
      </div>

      {polls.length === 0 && (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-6 text-center">
          No public polls yet.
        </div>
      )}

      <div className="space-y-2">
        {polls.map(p => {
          const answered = myResponses.has(p.id)
          return (
            <div key={p.id} className="flex items-center gap-3 border border-[var(--color-border)] rounded-xl bg-white px-4 py-3.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--color-text)]">{p.title}</div>
                <div className="font-mono text-[11.5px] text-[var(--color-muted)] mt-0.5">
                  {p.category || 'General'} · {p.responseCount} response{p.responseCount === 1 ? '' : 's'}
                  {answered && <span className="text-[var(--color-accent-strong)]"> · you answered</span>}
                </div>
              </div>
              <button
                onClick={() => (answered ? onSeeResults(p.id) : setAnswering(p))}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  answered ? 'bg-[var(--color-panel)] text-[var(--color-text)]' : 'bg-[var(--color-accent)] text-white hover:brightness-105'
                }`}
              >
                {answered ? 'See results' : 'Answer'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="text-xs text-[var(--color-muted)] bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg p-3.5">
        Anyone can create a public poll, but nothing appears here until it clears moderation.
      </div>
    </div>
  )
}
