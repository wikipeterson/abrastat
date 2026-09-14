'use client'

// Owns the whole "New assessment" flow — how many versions, then (per version) Import from
// Claude or Build manually — so RedPenHub doesn't have to thread version context through its own
// view-state union across three previously-separate screens. Replaces what used to be RedPenHub's
// inline 'newChoice'/'import'/(fresh)'build' states; editing an *existing* assessment still goes
// straight to AssessmentBuilder via RedPenHub's own 'build' screen, unaffected by this file.

import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { NewAssessmentChoice } from './NewAssessmentChoice'
import { ImportAssessment } from './ImportAssessment'
import { AssessmentBuilder, BuilderDraft } from './AssessmentBuilder'
import { RedPenAssessment } from '@/lib/redpen/types'

interface NewAssessmentFlowProps {
  onSaved: () => void
}

type VersionCount = 1 | 2

interface VersionCtx {
  groupId?: string
  label?: 'A' | 'B'
  titleDefault?: string
}

type Step =
  | { kind: 'count' }
  | { kind: 'choice'; ctx: VersionCtx; count: VersionCount }
  | { kind: 'import'; ctx: VersionCtx; count: VersionCount }
  | { kind: 'build'; ctx: VersionCtx; count: VersionCount; draft: BuilderDraft | null }

export function NewAssessmentFlow({ onSaved }: NewAssessmentFlowProps) {
  const [step, setStep] = useState<Step>({ kind: 'count' })

  if (step.kind === 'count') {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)] mb-1">New assessment</h2>
        <p className="text-sm text-[var(--color-muted)] mb-8">
          How many versions? Give each version its own answer key — the printed sheet is
          identical either way, and the student bubbles in which one they were actually handed,
          so the scan sorts itself to the right key automatically.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setStep({ kind: 'choice', ctx: {}, count: 1 })}
            className="text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 hover:border-[var(--color-accent)] transition-colors"
          >
            <div className="text-lg font-semibold text-[var(--color-text)] mb-2">1 version</div>
            <div className="text-sm text-[var(--color-muted)] leading-relaxed">
              The ordinary case — one answer key, given to a whole section.
            </div>
          </button>
          <button
            onClick={() => setStep({ kind: 'choice', ctx: { groupId: uuid(), label: 'A' }, count: 2 })}
            className="text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 hover:border-[var(--color-accent)] transition-colors"
          >
            <div className="text-lg font-semibold text-[var(--color-text)] mb-2">2 versions (A / B)</div>
            <div className="text-sm text-[var(--color-muted)] leading-relaxed">
              Two independently-keyed forms — same question/choice count and layout, different
              correct answers. Deters copying without a test generator.
            </div>
          </button>
        </div>
      </div>
    )
  }

  const { ctx, count } = step

  function handleSaved(assessment: RedPenAssessment) {
    if (count === 2 && ctx.label === 'A') {
      setStep({ kind: 'choice', ctx: { groupId: ctx.groupId, label: 'B', titleDefault: assessment.title }, count: 2 })
      return
    }
    onSaved()
  }

  return (
    <div>
      {count === 2 && <VersionBanner label={ctx.label!} />}
      {step.kind === 'choice' && (
        <NewAssessmentChoice
          onImport={() => setStep({ kind: 'import', ctx, count })}
          onBuildManually={() => setStep({ kind: 'build', ctx, count, draft: null })}
        />
      )}
      {step.kind === 'import' && (
        <ImportAssessment onImported={draft => setStep({ kind: 'build', ctx, count, draft })} />
      )}
      {step.kind === 'build' && (
        <AssessmentBuilder
          draft={step.draft}
          versionGroupId={ctx.groupId}
          versionLabel={ctx.label}
          titleOverride={ctx.titleDefault}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

function VersionBanner({ label }: { label: 'A' | 'B' }) {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-4">
      <div className="inline-block font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent-strong)]">
        Version {label} — {label === 'A' ? 'first key' : 'second key'}
      </div>
    </div>
  )
}
