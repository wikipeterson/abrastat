'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  bubbleCenterIn, BUBBLE_DIAMETER_IN, BUBBLE_OUTLINE_GREY, CONTENT_ORIGIN_IN, CONTENT_WIDTH_IN,
  fiducialCenterIn, FIDUCIAL_SIZE_IN, HEADER_BLOCK_HEIGHT_IN,
  NUMBER_COL_WIDTH_IN, PAGE_HEIGHT_IN, PAGE_WIDTH_IN, qrRegionIn, rowLabelCenterIn, sheetCode,
} from '@/lib/redpen/geometry'
import { bubbleRows, splitIntoColumns } from '@/lib/redpen/layout'
import { getAdministration, listSections, listStudents, saveAdministration } from '@/lib/redpen/storage'
import { getAssessment } from '@/lib/redpen/storage'
import { RedPenAdministration, RedPenAssessment, RedPenSection, RedPenStudent } from '@/lib/redpen/types'
import { useAuth } from '@/components/auth/AuthProvider'
import { RedPenError, RedPenLoading } from './RedPenStatus'

// Sheet pages are the one deliberate exception to the app's --color-* token system: fiducials
// and bubble outlines must be literal black/grey for scan contrast (spec §02), not whatever
// the active palette happens to be. Don't "fix" these to use tokens.
const INK = '#000'

interface SheetPrintViewProps {
  administrationId: string
  onDone: () => void
}

/** Renders a QR code for `value` into a small canvas. Degrades to plain text if the qrcode
 *  package isn't installed yet, so a missing/failed dependency never blocks printing sheets. */
function SheetQr({ value, sizeIn }: { value: string; sizeIn: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('qrcode')
      .then(QRCode => {
        if (cancelled || !canvasRef.current) return
        // 'H' (~30% damage-tolerant, vs the default 'M's ~15%) — a real printed-and-handled
        // sheet gets pen marks, smudges, and scan compression artifacts near the QR, not just
        // low resolution. The short id payload (see lib/redpen/id.ts) leaves enough headroom
        // that 'H' doesn't meaningfully grow the module count.
        return QRCode.toCanvas(canvasRef.current, value, { margin: 0, width: 300, errorCorrectionLevel: 'H' })
      })
      .then(() => {
        if (cancelled || !canvasRef.current) return
        // qrcode's canvas renderer sets canvas.style.width/height to match the pixel buffer
        // (300px) after drawing, clobbering the physical size below — reassert it every time.
        canvasRef.current.style.width = `${sizeIn}in`
        canvasRef.current.style.height = `${sizeIn}in`
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [value, sizeIn])

  if (failed) {
    return (
      <div
        style={{ width: `${sizeIn}in`, height: `${sizeIn}in`, border: `1px solid ${INK}`, fontSize: '6pt', fontFamily: 'monospace' }}
        className="flex items-center justify-center text-center break-all p-0.5"
      >
        {value}
      </div>
    )
  }
  return <canvas ref={canvasRef} style={{ width: `${sizeIn}in`, height: `${sizeIn}in` }} />
}

// Every element below is positioned absolutely from exact inch math (lib/redpen/geometry.ts),
// not organic CSS flow — the scan reader can only compute where things are on a scanned image
// from fixed numbers, so print and read have to agree on those numbers exactly rather than
// "however the browser happened to lay out this text."

function Fiducials() {
  const square = (corner: 'tl' | 'tr' | 'bl') => {
    const c = fiducialCenterIn(corner)
    return (
      <div
        key={corner}
        style={{
          position: 'absolute', left: `${c.x - FIDUCIAL_SIZE_IN / 2}in`, top: `${c.y - FIDUCIAL_SIZE_IN / 2}in`,
          width: `${FIDUCIAL_SIZE_IN}in`, height: `${FIDUCIAL_SIZE_IN}in`, background: INK,
        }}
      />
    )
  }
  const circleCenter = fiducialCenterIn('br')
  return (
    <>
      {square('tl')}
      {square('tr')}
      {square('bl')}
      <div
        style={{
          position: 'absolute', left: `${circleCenter.x - FIDUCIAL_SIZE_IN / 2}in`, top: `${circleCenter.y - FIDUCIAL_SIZE_IN / 2}in`,
          width: `${FIDUCIAL_SIZE_IN}in`, height: `${FIDUCIAL_SIZE_IN}in`, background: INK, borderRadius: '50%',
        }}
      />
    </>
  )
}

function BubbleGrid({ assessment }: { assessment: RedPenAssessment }) {
  const { colA, colB } = splitIntoColumns(bubbleRows(assessment))
  const columns = [colA, colB] as const

  return (
    <>
      {columns.map((rows, col) => rows.map((row, rowIndex) => {
        const labelCenter = rowLabelCenterIn(col as 0 | 1, rowIndex)
        return (
          <div key={row.n}>
            <div
              style={{
                position: 'absolute', left: `${labelCenter.x - NUMBER_COL_WIDTH_IN / 2}in`,
                top: `${labelCenter.y - BUBBLE_DIAMETER_IN / 2}in`, width: `${NUMBER_COL_WIDTH_IN - 0.04}in`,
                height: `${BUBBLE_DIAMETER_IN}in`, textAlign: 'right', fontFamily: 'monospace', fontSize: '9pt',
                lineHeight: `${BUBBLE_DIAMETER_IN}in`,
              }}
            >
              {row.n}
            </div>
            {row.letters.map((L, letterIndex) => {
              const c = bubbleCenterIn(col as 0 | 1, rowIndex, letterIndex)
              return (
                <div
                  key={L}
                  style={{
                    position: 'absolute', left: `${c.x - BUBBLE_DIAMETER_IN / 2}in`, top: `${c.y - BUBBLE_DIAMETER_IN / 2}in`,
                    width: `${BUBBLE_DIAMETER_IN}in`, height: `${BUBBLE_DIAMETER_IN}in`, borderRadius: '50%',
                    border: `1pt solid ${BUBBLE_OUTLINE_GREY}`, fontFamily: 'monospace', fontSize: '7pt', color: '#999',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {L}
                </div>
              )
            })}
          </div>
        )
      }))}
    </>
  )
}

function StudentSheet({
  assessment, student, sectionLabel, administrationId, date,
}: {
  assessment: RedPenAssessment; student: RedPenStudent; sectionLabel: string; administrationId: string; date: string
}) {
  const code = sheetCode(administrationId, student.id)

  return (
    <div
      style={{
        width: `${PAGE_WIDTH_IN}in`, height: `${PAGE_HEIGHT_IN}in`, position: 'relative',
        breakAfter: 'page', background: '#fff', color: INK, fontFamily: 'sans-serif',
      }}
    >
      <Fiducials />

      {/* Fixed-height box — text is clipped to it, never allowed to push the QR/bubble rows below. */}
      <div
        style={{
          position: 'absolute', left: `${CONTENT_ORIGIN_IN}in`, top: `${CONTENT_ORIGIN_IN}in`,
          width: `${CONTENT_WIDTH_IN}in`, height: `${HEADER_BLOCK_HEIGHT_IN}in`, overflow: 'hidden',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: `1.5pt solid ${INK}`, paddingBottom: '8px',
        }}
      >
        <div>
          <div style={{ fontSize: '13pt', fontWeight: 600 }}>{assessment.title}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '8pt', marginTop: '2px' }}>
            {sectionLabel.toUpperCase()} · {date}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12pt', fontWeight: 600 }}>{student.name}</div>
        </div>
      </div>

      {(() => {
        const qr = qrRegionIn()
        return (
          <>
            {/* Absolute, not flex-centered — the reader crops exactly this canonical region
                (via lib/redpen/geometry.ts's qrRegionIn), so its position can't depend on
                however flexbox happened to center it. */}
            <div style={{ position: 'absolute', left: `${qr.x}in`, top: `${qr.y}in` }}>
              <SheetQr value={code} sizeIn={qr.size} />
            </div>
            <div
              style={{
                position: 'absolute', left: `${qr.x + qr.size + 0.1}in`, top: `${qr.y}in`,
                width: `${CONTENT_WIDTH_IN - qr.size - 0.1}in`, height: `${qr.size}in`, overflow: 'hidden',
                fontFamily: 'monospace', fontSize: '7pt', color: '#666', display: 'flex', alignItems: 'center',
              }}
            >
              {code}
            </div>
          </>
        )
      })()}

      <BubbleGrid assessment={assessment} />

      <div style={{ position: 'absolute', left: `${CONTENT_ORIGIN_IN}in`, right: `${CONTENT_ORIGIN_IN}in`, bottom: `${CONTENT_ORIGIN_IN}in`, fontFamily: 'monospace', fontSize: '7pt', color: '#666', textAlign: 'center' }}>
        FILL COMPLETELY IN PENCIL · DO NOT FOLD OR STAPLE
      </div>
    </div>
  )
}

interface Loaded {
  admin: RedPenAdministration
  assessment: RedPenAssessment
  section: RedPenSection | null
  students: RedPenStudent[]
}

export function SheetPrintView({ administrationId, onDone }: SheetPrintViewProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function run() {
      try {
        const admin = await getAdministration(administrationId)
        if (!admin) { if (!cancelled) setError("Couldn't find that administration."); return }
        const [assessment, sections, students] = await Promise.all([
          getAssessment(admin.assessmentId), listSections(user!.uid), listStudents(user!.uid, admin.sectionId),
        ])
        if (!assessment) { if (!cancelled) setError("Couldn't find that assessment."); return }
        if (!cancelled) setLoaded({ admin, assessment, section: sections.find(s => s.id === admin.sectionId) ?? null, students })
      } catch {
        if (!cancelled) setError("Couldn't load this sheet. Try refreshing the page.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [administrationId, user])

  async function handlePrint() {
    if (!loaded || !user) return
    if (loaded.admin.status !== 'printed') {
      const admin = { ...loaded.admin, status: 'printed' as const }
      await saveAdministration(user.uid, admin)
      setLoaded({ ...loaded, admin })
    }
    window.print()
  }

  if (!user) return <RedPenError message="Sign in to print sheets." />
  if (loading) return <RedPenLoading />
  if (error) return <RedPenError message={error} />
  if (!loaded) return null
  const { admin, assessment, section, students } = loaded

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Print sheets</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {assessment.title} · {section?.label ?? 'Unknown section'} · <span className="font-mono">{students.length}</span> students
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="px-5 py-2.5 rounded-lg bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-125 transition-all whitespace-nowrap"
        >
          Print all {students.length} →
        </button>
      </div>

      <div className="bg-[var(--color-text)] text-[var(--color-bg)] rounded-lg p-5">
        <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-gold)] mb-2.5">
          Print settings that matter
        </div>
        <div className="font-mono text-xs leading-loose">
          <div>scale · 100% (never &quot;fit to page&quot;)</div>
          <div>margins · none / borderless off</div>
          <div>duplex · off — one side per student</div>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-6 text-center">
          {section?.label ?? 'This section'} has no students yet — add some under Manage Sections first.
        </div>
      ) : (
        <div className="border border-[var(--color-border)] rounded-lg overflow-auto bg-[#ddd] p-6 flex justify-center">
          {/* On-screen preview of the first sheet, at a scaled-down but still exact aspect ratio. */}
          <div style={{ transform: 'scale(0.55)', transformOrigin: 'top center' }}>
            <div style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
              <StudentSheet assessment={assessment} student={students[0]} sectionLabel={section?.label ?? ''} administrationId={administrationId} date={admin.date} />
            </div>
          </div>
        </div>
      )}

      {typeof document !== 'undefined' && createPortal(
        // Portaled directly onto <body>, outside the app shell entirely (which hides itself
        // with print:hidden — see app/workspace/page.tsx). That's what keeps this from being
        // caught up in the app shell's own layout/pagination when printing, and `hidden
        // print:block` keeps it invisible during normal on-screen browsing.
        <div id="redpen-print-root" className="hidden print:block">
          {students.map(student => (
            <StudentSheet
              key={student.id}
              assessment={assessment}
              student={student}
              sectionLabel={section?.label ?? ''}
              administrationId={administrationId}
              date={admin.date}
            />
          ))}
        </div>,
        document.body,
      )}

      <button onClick={onDone} className="text-sm font-medium text-[var(--color-accent-strong)] hover:underline">
        ← Back to assessments
      </button>
    </div>
  )
}
