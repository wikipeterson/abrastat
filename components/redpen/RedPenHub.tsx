'use client'

import { useEffect, useState } from 'react'
import { AboutRedPen } from './AboutRedPen'
import { AssessmentsList } from './AssessmentsList'
import { ManageClasses } from './ManageClasses'
import { NewAssessmentChoice } from './NewAssessmentChoice'
import { ImportAssessment } from './ImportAssessment'
import { AssessmentBuilder, BuilderDraft } from './AssessmentBuilder'
import { SheetPrintView } from './SheetPrintView'
import { ScanAndGrade } from './ScanAndGrade'
import { ResultsView } from './ResultsView'
import { useAuth } from '@/components/auth/AuthProvider'

type TopTab = 'about' | 'assessments' | 'manageClasses'

type View =
  | { screen: 'about' }
  | { screen: 'assessments' }
  | { screen: 'manageClasses' }
  | { screen: 'newChoice' }
  | { screen: 'import' }
  | { screen: 'build'; draft: BuilderDraft | null }
  | { screen: 'sheets'; administrationId: string }
  | { screen: 'scan'; administrationId: string }
  | { screen: 'results'; administrationId: string }

const TOP_TABS: { id: TopTab; label: string }[] = [
  { id: 'about', label: 'About RedPen' },
  { id: 'assessments', label: 'Assessments' },
  { id: 'manageClasses', label: 'Manage Classes' },
]

interface RedPenHubProps {
  onChromeChange?: (chrome: { title: string; onBack: () => void } | null) => void
}

export function RedPenHub({ onChromeChange }: RedPenHubProps) {
  const [view, setView] = useState<View>({ screen: 'about' })
  const { user, isGuest } = useAuth()
  // RedPen's data lives in Firestore under the signed-in teacher's uid (lib/redpen/storage.ts)
  // — a guest/anonymous session has a uid too, but it's not durable (cleared cookies or a
  // different browser loses it entirely), so treat it the same as signed-out here rather than
  // let someone build a roster that's gone tomorrow. "About RedPen" stays visible either way —
  // it's static and describes what signing in gets you.
  const needsSignIn = !user || isGuest

  useEffect(() => {
    if (!onChromeChange) return
    if (view.screen === 'about' || view.screen === 'assessments' || view.screen === 'manageClasses') {
      onChromeChange(null)
      return
    }
    const titles: Record<Exclude<View['screen'], TopTab>, string> = {
      newChoice: 'New assessment',
      import: 'Import an assessment',
      build: 'Build the assessment',
      sheets: 'Print sheets',
      scan: 'Scan and grade',
      results: 'Results',
    }
    onChromeChange({ title: titles[view.screen], onBack: () => setView({ screen: 'assessments' }) })
    return () => onChromeChange(null)
  }, [onChromeChange, view])

  if (view.screen === 'about' || view.screen === 'assessments' || view.screen === 'manageClasses') {
    return (
      <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {TOP_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setView({ screen: tab.id })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view.screen === tab.id
                  ? 'border-[var(--color-accent)] text-[var(--color-text)]'
                  : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {view.screen === 'about' && <AboutRedPen onGetStarted={() => setView({ screen: 'newChoice' })} />}
        {view.screen !== 'about' && needsSignIn && <SignInNotice />}
        {view.screen === 'assessments' && !needsSignIn && (
          <AssessmentsList
            onNewAssessment={() => setView({ screen: 'newChoice' })}
            onOpenAdministration={(administrationId, screen) => setView({ screen, administrationId })}
            onEditAssessment={assessmentId => setView({ screen: 'build', draft: { assessmentId } })}
          />
        )}
        {view.screen === 'manageClasses' && !needsSignIn && <ManageClasses />}
      </div>
    )
  }

  if (needsSignIn) return <SignInNotice />

  if (view.screen === 'newChoice') {
    return (
      <NewAssessmentChoice
        onImport={() => setView({ screen: 'import' })}
        onBuildManually={() => setView({ screen: 'build', draft: null })}
      />
    )
  }

  if (view.screen === 'import') {
    return (
      <ImportAssessment
        onImported={draft => setView({ screen: 'build', draft })}
      />
    )
  }

  if (view.screen === 'build') {
    return (
      <AssessmentBuilder
        draft={view.draft}
        onSaved={() => setView({ screen: 'assessments' })}
      />
    )
  }

  if (view.screen === 'sheets') {
    return (
      <SheetPrintView
        administrationId={view.administrationId}
        onDone={() => setView({ screen: 'assessments' })}
      />
    )
  }

  if (view.screen === 'scan') {
    return (
      <ScanAndGrade
        administrationId={view.administrationId}
        onGraded={() => setView({ screen: 'results', administrationId: view.administrationId })}
      />
    )
  }

  return <ResultsView administrationId={view.administrationId} />
}

function SignInNotice() {
  return (
    <div className="max-w-xl mx-auto py-16 text-center space-y-2">
      <div className="font-serif italic text-xl font-semibold text-[var(--color-text)]">Sign in to use RedPen</div>
      <div className="text-sm text-[var(--color-muted)]">
        Your assessments, roster, and results are saved to your account — a guest session doesn&apos;t persist
        anywhere, so sign in with Google from the account menu to get started.
      </div>
    </div>
  )
}
