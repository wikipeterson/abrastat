'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { NewPoll } from './NewPoll'
import { PollsBrowse } from './PollsBrowse'
import { AnswerForm } from './AnswerForm'
import { ModerationQueue } from './ModerationQueue'
import { PollResults } from './PollResults'
import { Poll } from '@/lib/polls/types'

type View =
  | { screen: 'browse' }
  | { screen: 'create' }
  | { screen: 'editPoll'; pollId: string }
  | { screen: 'answer'; poll: Poll }
  | { screen: 'results'; pollId: string }
  | { screen: 'moderate' }

interface PollsHubProps {
  /** Which screen to land on — set by which sidebar entry got clicked (Library's "Polls" vs.
   *  the Teacher-only "Create Poll"). Everything else is reached by navigating within this
   *  component, so this only matters on first mount. */
  initialView: 'browse' | 'create'
  onChromeChange?: (chrome: { title: string; onBack: () => void } | null) => void
  /** Wired straight to the workspace's existing handleOpenDataset — Send-to-Lab first persists
   *  a real dataset (lib/firestore.ts's saveDataset), then hands off to the same "open a dataset
   *  from the library" path any other dataset already uses. */
  onSendToLab: (datasetId: string) => void
}

const TITLES: Record<Exclude<View['screen'], 'browse'>, string> = {
  create: 'New poll',
  editPoll: 'Edit poll',
  answer: 'Answer poll',
  results: 'Results',
  moderate: 'Moderation queue',
}

export function PollsHub({ initialView, onChromeChange, onSendToLab }: PollsHubProps) {
  const [view, setView] = useState<View>({ screen: initialView })
  const { user, isGuest } = useAuth()
  // Polls' data lives in Firestore under the signed-in user's uid, and every response is keyed
  // by uid too (one-per-account) — a guest/anonymous session's uid isn't durable and the handoff
  // spec is explicit that every respondent is a real signed-in account, so treat guest the same
  // as signed-out here, same as RedPen does.
  const needsSignIn = !user || isGuest

  useEffect(() => {
    if (!onChromeChange) return
    if (view.screen === 'browse') { onChromeChange(null); return }
    onChromeChange({ title: TITLES[view.screen], onBack: () => setView({ screen: 'browse' }) })
    return () => onChromeChange(null)
  }, [onChromeChange, view])

  if (needsSignIn) return <SignInNotice />

  if (view.screen === 'browse') {
    return (
      <PollsBrowse
        onAnswer={poll => setView({ screen: 'answer', poll })}
        onResults={pollId => setView({ screen: 'results', pollId })}
        onEdit={pollId => setView({ screen: 'editPoll', pollId })}
        onModerate={() => setView({ screen: 'moderate' })}
      />
    )
  }
  if (view.screen === 'create') {
    return <NewPoll draft={null} onSaved={() => setView({ screen: 'browse' })} />
  }
  if (view.screen === 'editPoll') {
    return <NewPoll draft={{ pollId: view.pollId }} onSaved={() => setView({ screen: 'browse' })} />
  }
  if (view.screen === 'answer') {
    return (
      <AnswerScreen
        poll={view.poll}
        // Public: answering routes straight into results (matches PollsBrowse's own "you
        // answered → See results" rule). Class: no results shortcut at all, per the handoff —
        // AnswerScreen just shows a thank-you and stays put.
        onSubmittedPublic={() => setView({ screen: 'results', pollId: view.poll.id })}
      />
    )
  }
  if (view.screen === 'moderate') {
    return <ModerationQueue />
  }
  return <PollResults pollId={view.pollId} onSendToLab={onSendToLab} />
}

function AnswerScreen({ poll, onSubmittedPublic }: { poll: Poll; onSubmittedPublic: () => void }) {
  const [done, setDone] = useState(false)

  function handleDone() {
    if (poll.mode === 'public') { onSubmittedPublic(); return }
    setDone(true)
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--color-border)] font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
          {poll.mode === 'public' && poll.category ? `${poll.category} · ` : ''}{poll.title}
        </div>
        <div className="p-5">
          {done ? (
            <div className="text-sm text-[var(--color-accent-strong)] bg-[var(--color-accent-light)] rounded-lg p-4 text-center font-medium">
              Thanks — your response was recorded.
            </div>
          ) : (
            <AnswerForm poll={poll} onDone={handleDone} />
          )}
        </div>
      </div>
    </div>
  )
}

function SignInNotice() {
  return (
    <div className="max-w-xl mx-auto py-16 text-center space-y-2">
      <div className="font-serif italic text-xl font-semibold text-[var(--color-text)]">Sign in to use Polls</div>
      <div className="text-sm text-[var(--color-muted)]">
        Polls are tied to your account — one response per person and your own polls both need a real
        sign-in, so sign in with Google from the account menu to get started.
      </div>
    </div>
  )
}
