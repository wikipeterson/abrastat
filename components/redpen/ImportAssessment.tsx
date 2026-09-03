'use client'

import { useState } from 'react'
import { buildImportPromptText, ParsedMarksheet, parseMarksheetV1 } from '@/lib/redpen/schema'
import { BuilderDraft } from './AssessmentBuilder'

const PROMPT_TEXT = buildImportPromptText()
const PROMPT_LINES = PROMPT_TEXT.split('\n')

interface ImportAssessmentProps {
  onImported: (draft: BuilderDraft) => void
}

type Result =
  | { ok: true; data: ParsedMarksheet; warnings: string[] }
  | { ok: false; errors: string[] }

export function ImportAssessment({ onImported }: ImportAssessmentProps) {
  const [pasteVal, setPasteVal] = useState('')
  const [copied, setCopied] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  function handleCopy() {
    navigator.clipboard.writeText(PROMPT_TEXT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSubmit() {
    setResult(parseMarksheetV1(pasteVal))
  }

  const gridinCount = result?.ok ? result.data.questions.filter(q => q.type === 'gridin').length : 0
  const totalPoints = result?.ok ? result.data.questions.reduce((sum, q) => sum + q.points, 0) : 0
  const topics = result?.ok
    ? Array.from(new Set(result.data.questions.map(q => q.topic).filter((t): t is string => !!t)))
    : []

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)] mb-2">
          Import an assessment
        </h2>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">
          Drop the full text or a PDF of your assessment into Claude, or your favorite alternative LLM, and
          ask it to work out the answers — check them against your own key. Then copy the instructions
          below and paste them in, so it returns those answers in a format this app can read.
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            Ask for the answers in this format
          </div>
          <button
            onClick={handleCopy}
            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-[var(--color-accent)] text-[var(--color-accent-strong)] hover:bg-[var(--color-accent-light)] transition-colors"
          >
            {copied ? 'Copied ✓' : 'Copy instructions'}
          </button>
        </div>
        <div className="font-mono text-xs leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap">
          {PROMPT_LINES.map((line, i) => <div key={i}>{line || ' '}</div>)}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-3">
          Paste what it returns here
        </div>
        <textarea
          value={pasteVal}
          onChange={e => { setPasteVal(e.target.value); setResult(null) }}
          placeholder="Paste the JSON Claude gave you..."
          className="w-full min-h-[180px] font-mono text-xs leading-relaxed text-[var(--color-text)] border border-[var(--color-border)] bg-[var(--color-panel)] rounded-lg p-3.5 resize-y"
        />
        <button
          onClick={handleSubmit}
          className="mt-3.5 px-5 py-2.5 rounded-lg bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-125 transition-all"
        >
          Submit
        </button>

        {result && !result.ok && (
          <div className="mt-3.5 text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-3.5 space-y-1">
            {result.errors.map((err, i) => <div key={i}>{err}</div>)}
          </div>
        )}

        <div className="mt-3 text-xs text-[var(--color-muted)] leading-relaxed">
          This prepopulates a new assessment with Claude&apos;s answers already entered. You&apos;ll land in the same
          question-by-question editor used for building one manually, so you can review or fix anything
          before it&apos;s final.
        </div>
      </div>

      {result && result.ok && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            What was understood
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="text-[var(--color-muted)]">Title</div>
            <div className="text-[var(--color-text)] font-medium">{result.data.title || <em className="text-[var(--color-muted)]">not set yet</em>}</div>
            <div className="text-[var(--color-muted)]">Questions</div>
            <div className="font-mono">{result.data.questions.length} scorable · {result.data.choiceCount} choices</div>
            {gridinCount > 0 && (
              <>
                <div className="text-[var(--color-muted)]">Grid-in</div>
                <div className="font-mono">{gridinCount} question{gridinCount === 1 ? '' : 's'}</div>
              </>
            )}
            <div className="text-[var(--color-muted)]">Total points</div>
            <div className="font-mono">{totalPoints}</div>
            {topics.length > 0 && (
              <>
                <div className="text-[var(--color-muted)]">Topics found</div>
                <div>{topics.join(', ')}</div>
              </>
            )}
            {result.data.unscorable.length > 0 && (
              <>
                <div className="text-[var(--color-muted)]">Unscorable</div>
                <div>{result.data.unscorable.map(u => `Q${u.n} — ${u.reason}`).join('; ')}</div>
              </>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="text-sm text-[var(--color-gold-text)] bg-[var(--color-gold-light)] rounded-lg p-3.5 space-y-1">
              {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          <button
            onClick={() => onImported({ parsed: result.data })}
            className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all"
          >
            Continue to editor →
          </button>
        </div>
      )}
    </div>
  )
}
