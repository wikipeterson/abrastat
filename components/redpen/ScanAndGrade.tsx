'use client'

import { useEffect, useRef, useState } from 'react'
import { scanPdf, ScanOutcome } from '@/lib/redpen/scanPipeline'
import {
  getAdministration, getAssessment, listSections, listStudents, saveAdministration, saveResult,
} from '@/lib/redpen/storage'
import { RedPenAdministration, RedPenAssessment, RedPenSection, RedPenStudent } from '@/lib/redpen/types'
import { useAuth } from '@/components/auth/AuthProvider'
import { RedPenError, RedPenLoading } from './RedPenStatus'

interface ScanAndGradeProps {
  administrationId: string
  onGraded: () => void
}

interface Loaded {
  admin: RedPenAdministration
  assessment: RedPenAssessment
  section: RedPenSection | null
  students: RedPenStudent[]
}

type State =
  | { phase: 'idle' }
  | { phase: 'scanning'; page: number; totalPages: number }
  | { phase: 'error'; message: string }
  | { phase: 'done'; outcome: ScanOutcome }

export function ScanAndGrade({ administrationId, onGraded }: ScanAndGradeProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [state, setState] = useState<State>({ phase: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Captured straight from pdf.js, before any of the reader's own processing — ground truth
  // for "what did the browser actually render from this PDF," independent of whatever tool
  // (Preview, sips, the scanner's own viewer) a screenshot came from.
  const renderedPagesRef = useRef<Map<number, ImageData>>(new Map())

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function run() {
      try {
        const admin = await getAdministration(administrationId)
        if (!admin) { if (!cancelled) setLoadError("Couldn't find that administration."); return }
        const [assessment, sections, students] = await Promise.all([
          getAssessment(admin.assessmentId), listSections(user!.uid), listStudents(user!.uid, admin.sectionId),
        ])
        if (!assessment) { if (!cancelled) setLoadError("Couldn't find that assessment."); return }
        if (!cancelled) setLoaded({ admin, assessment, section: sections.find(s => s.id === admin.sectionId) ?? null, students })
      } catch {
        if (!cancelled) setLoadError("Couldn't load this administration. Try refreshing the page.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [administrationId, user])

  async function handleFile(file: File) {
    if (!loaded || !user) return
    setState({ phase: 'scanning', page: 0, totalPages: 0 })
    renderedPagesRef.current = new Map()
    try {
      const outcome = await scanPdf(
        user.uid, file, administrationId,
        p => setState({ phase: 'scanning', page: p.page, totalPages: p.totalPages }),
        (page, imageData) => renderedPagesRef.current.set(page, imageData),
      )
      await Promise.all(outcome.results.map(r => saveResult(user.uid, r)))
      // Only advance to "graded" once something was actually graded — otherwise a failed scan
      // (e.g. every sheet unreadable) would lock the Assessments list into routing to an empty
      // Results screen instead of letting the teacher retry from here.
      if (outcome.results.length > 0 && loaded.admin.status !== 'graded') {
        const admin = { ...loaded.admin, status: 'graded' as const }
        await saveAdministration(user.uid, admin)
        setLoaded({ ...loaded, admin })
      }
      setState({ phase: 'done', outcome })
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  if (!user) return <RedPenError message="Sign in to scan and grade." />
  if (loading) return <RedPenLoading />
  if (loadError) return <RedPenError message={loadError} />
  if (!loaded) return null
  const { assessment, section, students } = loaded

  const identifiedIds = new Set(state.phase === 'done' ? state.outcome.results.map(r => r.studentId) : [])
  const missingStudents = students.filter(s => !identifiedIds.has(s.id))

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Scan and grade</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {assessment.title} · {section?.label ?? 'Unknown class'} · drop the multi-page PDF straight off
          the printer. Every sheet is decided automatically; the log tells you what it decided and why.
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-8">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {state.phase === 'idle' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="text-sm text-[var(--color-muted)]">Upload the scanned PDF for this class.</div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all"
            >
              Choose PDF
            </button>
          </div>
        )}
        {state.phase === 'scanning' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
            <div className="font-mono text-xs text-[var(--color-muted)]">
              {state.totalPages > 0 ? `Reading page ${state.page} of ${state.totalPages}...` : 'Rendering PDF...'}
            </div>
          </div>
        )}
        {state.phase === 'error' && (
          <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-4">
            {state.message}
          </div>
        )}
        {state.phase === 'done' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs text-[var(--color-accent-strong)]">
                {state.outcome.results.length} / {state.outcome.totalPages} sheets identified and scored
              </div>
              <button
                onClick={onGraded}
                className="px-4 py-2 rounded-lg bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-125 transition-all"
              >
                View results →
              </button>
            </div>
            {missingStudents.length > 0 && (
              <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-3.5">
                No sheet was matched for: {missingStudents.map(s => s.name).join(', ')}.
                <div className="mt-2">
                  <button onClick={() => downloadRenderedPages(renderedPagesRef.current)} className="font-medium hover:underline">
                    Download what was rendered from each page (debug) →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {state.phase === 'done' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_90px_60px] gap-4 px-5 py-3 border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
              <div>Student</div><div>Score</div><div></div>
            </div>
            {state.outcome.results.map(r => {
              const student = students.find(s => s.id === r.studentId)
              return (
                <div key={r.studentId} className="grid grid-cols-[1fr_90px_60px] gap-4 items-center px-5 py-2.5 border-b border-[var(--color-panel)] last:border-b-0">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${r.flagged ? 'bg-[var(--color-gold)]' : 'bg-[var(--color-accent)]'}`} />
                    <div className="text-sm font-medium text-[var(--color-text)]">{student?.name ?? r.studentId}</div>
                  </div>
                  <div className="font-mono text-sm">{r.score}/{r.maxScore}</div>
                  <div className="font-mono text-xs text-[var(--color-muted)]">{r.flagged ? 'review' : ''}</div>
                </div>
              )
            })}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Decision log</div>
              <button
                onClick={() => exportLog(administrationId, state.outcome.log)}
                className="text-xs font-medium text-[var(--color-accent-strong)] hover:underline"
              >
                Export
              </button>
            </div>
            <div className="text-sm text-[var(--color-muted)] mb-3">
              {state.outcome.log.length} of {state.outcome.results.length * assessment.questionCount} bubbles needed a judgment call.
            </div>
            {state.outcome.log.length === 0 ? (
              <div className="text-sm text-[var(--color-muted)]">Nothing ambiguous — every sheet read cleanly.</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                {state.outcome.log.map((entry, i) => {
                  const student = students.find(s => s.id === entry.studentId)
                  return (
                    <div key={i} className="py-3 border-t border-[var(--color-panel)] first:border-t-0">
                      <div className="flex justify-between gap-2 mb-0.5">
                        <div className="font-mono text-[11px] text-[var(--color-danger)]">{entry.tag}</div>
                        <div className="font-mono text-[11px] text-[var(--color-muted)]">
                          p.{entry.page}{entry.n ? ` · Q${entry.n}` : ''}{student ? ` · ${student.name}` : ''}
                        </div>
                      </div>
                      <div className="text-sm text-[var(--color-text)]">{entry.detail}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function downloadRenderedPages(pages: Map<number, ImageData>) {
  pages.forEach((imageData, page) => {
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(imageData, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `redpen-rendered-page-${page}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  })
}

function exportLog(administrationId: string, log: ScanOutcome['log']) {
  const lines = log.map(e => `p.${e.page}\t${e.n ?? ''}\t${e.studentId ?? ''}\t${e.tag}\t${e.detail}`)
  const blob = new Blob([`page\tquestion\tstudent\ttag\tdetail\n${lines.join('\n')}`], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `redpen-decision-log-${administrationId}.tsv`
  a.click()
  URL.revokeObjectURL(url)
}
