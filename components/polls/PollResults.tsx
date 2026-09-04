'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { saveDataset } from '@/lib/firestore'
import { exportGridAsCsv } from '@/lib/datasetExport'
import { buildGridFromPoll } from '@/lib/polls/dataset'
import { aggregateCategorical, aggregateNumeric } from '@/lib/polls/results'
import { closePoll, getPoll, listResponses } from '@/lib/polls/storage'
import { Poll, PollQuestion, PollResponse, PollStatus } from '@/lib/polls/types'
import { PollsError, PollsLoading } from './PollsStatus'

interface PollResultsProps {
  pollId: string
  onSendToLab: (datasetId: string) => void
}

const STATUS_LABEL: Record<PollStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  published: 'Open',
  rejected: 'Not approved',
  closed: 'Closed',
}

export function PollResults({ pollId, onSendToLab }: PollResultsProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [poll, setPoll] = useState<Poll | null>(null)
  const [responses, setResponses] = useState<PollResponse[]>([])
  const [closing, setClosing] = useState(false)
  const [sending, setSending] = useState(false)

  async function refresh() {
    try {
      const p = await getPoll(pollId)
      if (!p) { setError("Couldn't find that poll."); return }
      const r = await listResponses(pollId)
      setPoll(p)
      setResponses(r)
      setError(null)
    } catch {
      setError("Couldn't load results — either this poll doesn't allow you to view them yet, or something went wrong. Try refreshing.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId])

  if (loading) return <PollsLoading />
  if (error) return <PollsError message={error} />
  if (!poll) return null

  const isOwner = user?.uid === poll.ownerId

  async function handleClose() {
    if (!poll) return
    setClosing(true)
    try {
      await closePoll(poll.id)
      await refresh()
    } finally {
      setClosing(false)
    }
  }

  function handleExportCsv() {
    if (!poll) return
    exportGridAsCsv(buildGridFromPoll(poll, responses), poll.title)
  }

  async function handleSendToLab() {
    if (!poll || !user) return
    setSending(true)
    try {
      const grid = buildGridFromPoll(poll, responses)
      const id = await saveDataset(user, poll.title, `Responses to "${poll.title}" from AbraStat Polls.`, '📊', false, grid)
      onSendToLab(id)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Results &amp; export</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {poll.title} · live while the poll is open — export includes every question as columns in one dataset for the Lab.
        </p>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        <StatBox label="Respondents" value={String(responses.length)} />
        <StatBox label="Status" value={STATUS_LABEL[poll.status]} tone={poll.status === 'published' ? 'accent' : 'muted'} />
        {isOwner && poll.status === 'published' && (
          <button
            onClick={handleClose}
            disabled={closing}
            className="ml-auto px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors disabled:opacity-50"
          >
            {closing ? 'Closing…' : 'Close poll'}
          </button>
        )}
      </div>
      {poll.status === 'closed' && (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg p-3.5">
          Poll closed — no further responses accepted. Dataset is frozen and ready to export.
        </div>
      )}

      <div className="space-y-4">
        {poll.questions.map((q, i) => (
          <QuestionResultCard key={q.id} index={i} question={q} responses={responses} />
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleExportCsv}
          disabled={responses.length === 0}
          className="px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors disabled:opacity-50"
        >
          ⬇ Export CSV
        </button>
        <button
          onClick={handleSendToLab}
          disabled={responses.length === 0 || sending}
          className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all disabled:opacity-50"
        >
          {sending ? 'Sending…' : '→ Send to the Lab'}
        </button>
      </div>
    </div>
  )
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'muted' }) {
  const color = tone === 'accent' ? 'text-[var(--color-accent)]' : tone === 'muted' ? 'text-[var(--color-muted)]' : 'text-[var(--color-gold)]'
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`font-mono text-lg font-bold ${color}`}>{value}</div>
    </div>
  )
}

function QuestionResultCard({ index, question, responses }: { index: number; question: PollQuestion; responses: PollResponse[] }) {
  const answeredCount = responses.filter(r => r.answers[question.id] !== undefined).length
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[var(--color-border)] font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
        Q{index + 1} · {question.prompt}
      </div>
      <div className="p-5">
        {answeredCount === 0 ? (
          <div className="text-sm text-[var(--color-muted)] text-center py-6">No responses yet.</div>
        ) : question.type === 'categorical' ? (
          <CategoricalChart question={question} responses={responses} />
        ) : (
          <NumericChart question={question} responses={responses} />
        )}
      </div>
    </div>
  )
}

function CategoricalChart({ question, responses }: { question: PollQuestion; responses: PollResponse[] }) {
  const tallies = aggregateCategorical(question, responses)
  const maxCount = Math.max(1, ...tallies.map(t => t.count))
  return (
    <div className="space-y-2.5">
      {tallies.map(t => (
        <div key={t.choice} className="grid grid-cols-[110px_1fr_46px] items-center gap-2.5">
          <div className="text-sm font-semibold text-[var(--color-text)] truncate" title={t.choice}>{t.choice}</div>
          <div className="h-6 rounded bg-[var(--color-panel)] overflow-hidden">
            <div
              className="h-full rounded"
              style={{ width: `${(t.count / maxCount) * 100}%`, background: t.count === maxCount && t.count > 0 ? 'var(--color-gold)' : 'var(--color-accent)' }}
            />
          </div>
          <div className="font-mono text-sm font-bold text-right">{t.count}</div>
        </div>
      ))}
    </div>
  )
}

function NumericChart({ question, responses }: { question: PollQuestion; responses: PollResponse[] }) {
  const summary = aggregateNumeric(question, responses)
  const showEvery = Math.max(1, Math.ceil(summary.buckets.length / 14))
  return (
    <div>
      <div className="flex items-end gap-1 h-32 border-b-2 border-[var(--color-border)] pb-1 mb-1 px-1 overflow-x-auto">
        {summary.buckets.map(b => (
          <div key={b.start} className="flex-1 min-w-[7px] flex flex-col-reverse items-center gap-1">
            {Array.from({ length: b.count }, (_, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: summary.median !== null && b.start <= summary.median && summary.median <= b.end ? 'var(--color-gold)' : 'var(--color-accent)' }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-1 px-1 mb-4">
        {summary.buckets.map((b, i) => (
          <div key={b.start} className="flex-1 min-w-[7px] text-center font-mono text-[10px] text-[var(--color-muted)]">
            {i % showEvery === 0 ? (b.start === b.end ? b.start : `${b.start}–${b.end}`) : ''}
          </div>
        ))}
      </div>
      <div className="flex gap-6">
        <StatBox label="Mean" value={summary.mean !== null ? summary.mean.toFixed(1) : '—'} />
        <StatBox label="Median" value={summary.median !== null ? String(summary.median) : '—'} />
        <StatBox label="Range" value={summary.min !== null ? `${summary.min}–${summary.max}` : '—'} />
      </div>
    </div>
  )
}
