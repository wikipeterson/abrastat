'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { isPollsModerator } from '@/lib/featureFlags'
import { NewPoll } from './NewPoll'
import { RespondClass } from './RespondClass'
import { RespondPublic } from './RespondPublic'
import { MyPolls } from './MyPolls'
import { ModerationQueue } from './ModerationQueue'
import { PollResults } from './PollResults'

type TabScreen = 'new' | 'respondClass' | 'respondPublic' | 'myPolls' | 'moderate'

type View =
  | { screen: 'new' }
  | { screen: 'respondClass' }
  | { screen: 'respondPublic' }
  | { screen: 'myPolls' }
  | { screen: 'moderate' }
  | { screen: 'editPoll'; pollId: string }
  | { screen: 'results'; pollId: string }

interface PollsHubProps {
  onChromeChange?: (chrome: { title: string; onBack: () => void } | null) => void
  /** Wired straight to the workspace's existing handleOpenDataset — Send-to-Lab first persists
   *  a real dataset (lib/firestore.ts's saveDataset), then hands off to the same "open a dataset
   *  from the library" path any other dataset already uses. */
  onSendToLab: (datasetId: string) => void
}

/** A tab-row screen — rendered inline in the tab layout, no back chrome. Editing an existing
 *  poll and viewing results are their own screens (chrome + back), same split RedPenHub draws
 *  between its tab row (about/assessments/manageSections) and its standalone screens — kept as
 *  distinct View members (`editPoll` vs. the tab row's `new`) rather than one `new` screen with
 *  a nullable draft, so this stays a clean discriminated union TS can narrow on `screen` alone. */
function isTabScreen(view: View): view is Extract<View, { screen: TabScreen }> {
  return view.screen === 'new' || view.screen === 'respondClass' || view.screen === 'respondPublic'
    || view.screen === 'myPolls' || view.screen === 'moderate'
}

export function PollsHub({ onChromeChange, onSendToLab }: PollsHubProps) {
  const [view, setView] = useState<View>({ screen: 'new' })
  const { user, isGuest } = useAuth()
  // Polls' data lives in Firestore under the signed-in user's uid, and every response is keyed
  // by uid too (one-per-account) — a guest/anonymous session's uid isn't durable and the handoff
  // spec is explicit that every respondent is a real signed-in account, so treat guest the same
  // as signed-out here, same as RedPen does.
  const needsSignIn = !user || isGuest
  const moderator = isPollsModerator(user)

  const tabs: { id: TabScreen; label: string }[] = [
    { id: 'new', label: 'New poll' },
    { id: 'respondClass', label: 'Enter a class code' },
    { id: 'respondPublic', label: 'Public polls' },
    { id: 'myPolls', label: 'My polls' },
    ...(moderator ? [{ id: 'moderate' as const, label: 'Moderation queue' }] : []),
  ]

  useEffect(() => {
    if (!onChromeChange) return
    if (isTabScreen(view)) { onChromeChange(null); return }
    const title = view.screen === 'editPoll' ? 'Edit poll' : 'Results'
    onChromeChange({ title, onBack: () => setView({ screen: 'myPolls' }) })
    return () => onChromeChange(null)
  }, [onChromeChange, view])

  if (isTabScreen(view)) {
    return (
      <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
        <div className="flex gap-1 border-b border-[var(--color-border)] flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setView({ screen: tab.id })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                view.screen === tab.id
                  ? 'border-[var(--color-accent)] text-[var(--color-text)]'
                  : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {needsSignIn ? (
          <SignInNotice />
        ) : (
          <>
            {view.screen === 'new' && (
              <NewPoll draft={null} onSaved={() => setView({ screen: 'myPolls' })} />
            )}
            {view.screen === 'respondClass' && <RespondClass />}
            {view.screen === 'respondPublic' && (
              <RespondPublic onSeeResults={pollId => setView({ screen: 'results', pollId })} />
            )}
            {view.screen === 'myPolls' && (
              <MyPolls
                onEdit={pollId => setView({ screen: 'editPoll', pollId })}
                onResults={pollId => setView({ screen: 'results', pollId })}
              />
            )}
            {view.screen === 'moderate' && <ModerationQueue />}
          </>
        )}
      </div>
    )
  }

  if (needsSignIn) return <SignInNotice />

  if (view.screen === 'editPoll') {
    return <NewPoll draft={{ pollId: view.pollId }} onSaved={() => setView({ screen: 'myPolls' })} />
  }

  return <PollResults pollId={view.pollId} onSendToLab={onSendToLab} />
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
