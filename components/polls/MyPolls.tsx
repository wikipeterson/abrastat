'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { closePoll, listMyPolls } from '@/lib/polls/storage'
import { Poll, PollStatus } from '@/lib/polls/types'
import { PollsError, PollsLoading } from './PollsStatus'

interface MyPollsProps {
  onEdit: (pollId: string) => void
  onResults: (pollId: string) => void
}

const STATUS_LABEL: Record<PollStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  published: 'Open',
  rejected: 'Not approved',
  closed: 'Closed',
}

export function MyPolls({ onEdit, onResults }: MyPollsProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [polls, setPolls] = useState<Poll[]>([])
  const [closingId, setClosingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function refresh(uid: string) {
    try {
      const list = await listMyPolls(uid)
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setPolls(list)
      setError(null)
    } catch {
      setError("Couldn't load your polls. Try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    refresh(user.uid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  if (!user) return <PollsError message="Sign in to see your polls." />
  if (loading) return <PollsLoading />
  if (error) return <PollsError message={error} />

  async function copyLink(p: Poll) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = `${origin}/p/${p.mode === 'class' ? p.classCode : p.id}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(p.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* clipboard access can fail silently (permissions, insecure context) */ }
  }

  async function handleClose(p: Poll) {
    if (!user) return
    setClosingId(p.id)
    try {
      await closePoll(p.id)
      await refresh(user.uid)
    } finally {
      setClosingId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-5">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">My polls</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Everything you&apos;ve created — class and public. Copy a share link, close an open poll, or view results and export.
        </p>
      </div>

      {polls.length === 0 && (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-6 text-center">
          You haven&apos;t created a poll yet.
        </div>
      )}

      <div className="space-y-2">
        {polls.map(p => (
          <div
            key={p.id}
            className="flex items-center gap-3 border border-[var(--color-border)] rounded-xl bg-white px-4 py-3.5"
            style={{ borderLeftWidth: 4, borderLeftColor: p.mode === 'class' ? 'var(--color-gold)' : 'var(--color-accent)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: p.mode === 'class' ? 'var(--color-gold)' : 'var(--color-accent)' }}
                />
                {p.title}
              </div>
              <div className="font-mono text-[11.5px] text-[var(--color-muted)] mt-0.5">
                {p.mode === 'class' ? 'Class' : 'Public'} · {STATUS_LABEL[p.status]} · {p.responseCount} response{p.responseCount === 1 ? '' : 's'}
              </div>
            </div>
            {p.status === 'pending_review' ? (
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded bg-[var(--color-gold-light)] text-[var(--color-gold-text)] whitespace-nowrap">
                Pending
              </span>
            ) : p.status === 'rejected' ? (
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded bg-[var(--color-danger-light)] text-[var(--color-danger)] whitespace-nowrap">
                Not approved
              </span>
            ) : (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => onEdit(p.id)} className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]">
                  Edit
                </button>
                <button onClick={() => copyLink(p)} className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]">
                  {copiedId === p.id ? 'Copied' : 'Copy link'}
                </button>
                {p.status === 'published' && (
                  <button
                    onClick={() => handleClose(p)}
                    disabled={closingId === p.id}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--color-danger-light)] text-[var(--color-danger)] disabled:opacity-50"
                  >
                    {closingId === p.id ? 'Closing…' : 'Close'}
                  </button>
                )}
                <button onClick={() => onResults(p.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white">
                  Results
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
