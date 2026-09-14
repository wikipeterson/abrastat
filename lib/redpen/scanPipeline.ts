// Orchestrates the whole reader: render → binarize → locate fiducials/affine/orientation →
// decode QR → identify student → sample every bubble row → decide → score. Everything runs
// client-side; nothing here touches a server. See the phase-2 plan (§03 in the spec) for the
// stage-by-stage rationale — this file just wires those stages together per page.

import { applyAffine } from './fiducials'
import {
  bubbleCenterIn, BUBBLE_DIAMETER_IN, DEFAULT_GRIDIN_DIGITS, GRIDIN_SYMBOLS,
  gridinBandTopIn, gridinBlockOriginIn, gridinBubbleCenterIn, gridinColumnCenterXIn,
} from './geometry'
import { bubbleRows, gridinEntries, splitIntoColumns } from './layout'
import { locateFiducials } from './fiducials'
import { binarize, otsuThreshold, toGrayscale } from './otsu'
import { decideBinary, decideMultiple, decideSingle } from './decide'
import { sampleBubbleFill } from './bubbleRead'
import { decodeSheetCode } from './qrRead'
import { scoreAssessment } from './scoring'
import { renderPdfPages } from './pdfRender'
import { getAdministration, getAssessment, listStudents } from './storage'
import { AnswerValue, DecisionLogEntry, RedPenResult } from './types'

const DPI = 200

export interface ScanProgress {
  page: number
  totalPages: number
}

export interface ScanOutcome {
  results: RedPenResult[]
  log: DecisionLogEntry[]
  /** Pages that couldn't be matched to a student at all (missing fiducials, unreadable QR, QR
   *  from a different administration, or an unknown student id). */
  unmatchedPages: number[]
  totalPages: number
}

export async function scanPdf(
  userId: string,
  file: File,
  administrationId: string,
  onProgress?: (p: ScanProgress) => void,
  /** Fires with each page's rendered ImageData right after pdf.js produces it — before any
   *  processing. Lets the UI offer a "download what was actually rendered" debug affordance,
   *  which is closer to ground truth than eyeballing the PDF in an unrelated renderer. */
  onPageImage?: (page: number, imageData: ImageData) => void,
): Promise<ScanOutcome> {
  const admin = await getAdministration(administrationId)
  if (!admin) throw new Error('Administration not found.')
  const assessment = await getAssessment(admin.assessmentId)
  if (!assessment) throw new Error('Assessment not found.')
  const students = await listStudents(userId, admin.sectionId)

  const { colA, colB } = splitIntoColumns(bubbleRows(assessment))
  const columns = [colA, colB] as const

  // Grid-in layout is derived the exact same way SheetPrintView derives it, so a bubble the
  // reader samples always lands on the bubble the printer actually drew there.
  const gridinList = gridinEntries(assessment)
  const maxGridinDigits = Math.max(0, ...gridinList.map(e => e.digits ?? DEFAULT_GRIDIN_DIGITS))
  const gridinBandTop = gridinBandTopIn(colA.length)

  const pages = await renderPdfPages(file, DPI, (page, totalPages) => onProgress?.({ page, totalPages }))

  const log: DecisionLogEntry[] = []
  const results: RedPenResult[] = []
  const unmatchedPages: number[] = []

  for (const { page: pageNum, imageData } of pages) {
    onPageImage?.(pageNum, imageData)
    // Deliberate, always-on diagnostics for this reader — there's no server to log to, and this
    // is the fastest way to see what a real scan actually did (dimensions, threshold, fiducial
    // fit, QR result) without instrumenting the UI further.
    console.log(`[redpen scan] page ${pageNum}: ${imageData.width}x${imageData.height}px`)

    const gray = toGrayscale(imageData.data)
    const threshold = otsuThreshold(gray)
    const binary = binarize(gray, threshold)
    console.log(`[redpen scan] page ${pageNum}: otsu threshold ${threshold}/255`)

    const fid = locateFiducials(binary, imageData.width, imageData.height, DPI)
    if (!fid.ok) {
      console.log(`[redpen scan] page ${pageNum}: fiducials FAILED — ${fid.reason}`)
      log.push({ administrationId, page: pageNum, tag: 'NO_FIDUCIALS', detail: fid.reason })
      unmatchedPages.push(pageNum)
      continue
    }
    console.log(`[redpen scan] page ${pageNum}: fiducials ok, orientation ${fid.orientation}, transform`, fid.transform)

    const decoded = decodeSheetCode(imageData)
    console.log(`[redpen scan] page ${pageNum}: QR decode ${decoded ? `OK — ${decoded.administrationId}:${decoded.studentId}` : 'FAILED'}`)
    if (!decoded) {
      log.push({ administrationId, page: pageNum, tag: 'NO_QR', detail: "Couldn't read the QR code on this page." })
      unmatchedPages.push(pageNum)
      continue
    }
    if (decoded.administrationId !== administrationId) {
      // Not a read failure — the QR decoded fine, it's just for a different assessment/section
      // scan than the one open right now (an old printed sheet, or the wrong PDF uploaded).
      log.push({ administrationId, page: pageNum, tag: 'WRONG_ADMIN', detail: "This sheet is from a different assessment or section — it wasn't scored here." })
      unmatchedPages.push(pageNum)
      continue
    }
    const student = students.find(s => s.id === decoded.studentId)
    if (!student) {
      log.push({ administrationId, page: pageNum, tag: 'NO_QR', detail: `No student with id ${decoded.studentId} in this class.` })
      unmatchedPages.push(pageNum)
      continue
    }

    const given = new Map<number, AnswerValue | null>()
    // This sheet's own entries, kept separately from the shared `log` (which the UI shows in
    // full right after the scan) so they can be attached to just this student's RedPenResult —
    // that's what makes a later rescan of one student only ever touch that student's own record.
    const sheetLog: DecisionLogEntry[] = []

    columns.forEach((rows, col) => {
      rows.forEach((row, rowIndex) => {
        const key = assessment.answerKey.find(e => e.n === row.n)
        const expectMultiple = Array.isArray(key?.answer)

        const fills = row.letters.map((letter, letterIndex) => {
          const centerIn = bubbleCenterIn(col as 0 | 1, rowIndex, letterIndex)
          const centerPx = applyAffine(fid.transform, centerIn)
          const fill = sampleBubbleFill(gray, imageData.width, imageData.height, centerPx, BUBBLE_DIAMETER_IN * DPI)
          return { letter, fill }
        })

        const decision = expectMultiple ? decideMultiple(fills) : decideSingle(fills)
        given.set(row.n, decision.given)
        if (decision.log) {
          const entry: DecisionLogEntry = {
            administrationId, page: pageNum, n: row.n, studentId: student.id,
            tag: decision.log.tag, detail: decision.log.detail,
          }
          sheetLog.push(entry)
          log.push(entry)
        }
      })
    })

    // Grid-in: sign bubble (a plain threshold check, see decide.ts's decideBinary — there's no
    // runner-up bubble in that "row" to compare against) then each digit column read the exact
    // same way an MC row is (decideSingle over that column's 11 symbol candidates), assembled
    // left-to-right and stopping at the first blank column (students left-justify their answer,
    // per the printed instruction — see SheetPrintView.tsx).
    gridinList.forEach((entry, blockIndex) => {
      const digits = entry.digits ?? DEFAULT_GRIDIN_DIGITS
      const origin = gridinBlockOriginIn(blockIndex, maxGridinDigits, gridinBandTop)

      const signXIn = gridinColumnCenterXIn(origin, 0)
      const signCenterPx = applyAffine(fid.transform, gridinBubbleCenterIn(origin, signXIn, 0))
      const signFill = sampleBubbleFill(gray, imageData.width, imageData.height, signCenterPx, BUBBLE_DIAMETER_IN * DPI)
      const negative = decideBinary(signFill)

      let assembled = ''
      let stopped = false
      for (let col = 1; col <= digits; col++) {
        if (stopped) break
        const colXIn = gridinColumnCenterXIn(origin, col)
        const fills = GRIDIN_SYMBOLS.map(symbol => {
          const centerIn = gridinBubbleCenterIn(origin, colXIn, GRIDIN_SYMBOLS.indexOf(symbol))
          const centerPx = applyAffine(fid.transform, centerIn)
          const fill = sampleBubbleFill(gray, imageData.width, imageData.height, centerPx, BUBBLE_DIAMETER_IN * DPI)
          return { letter: symbol, fill }
        })
        const decision = decideSingle(fills)
        if (decision.log) {
          const logEntry: DecisionLogEntry = {
            administrationId, page: pageNum, n: entry.n, studentId: student.id,
            tag: decision.log.tag, detail: `Digit ${col} of ${digits}: ${decision.log.detail}`,
          }
          sheetLog.push(logEntry)
          log.push(logEntry)
        }
        if (decision.given === null) { stopped = true; break }
        assembled += decision.given as string
      }

      given.set(entry.n, assembled === '' ? null : `${negative ? '-' : ''}${assembled}`)
    })

    const { score, maxScore, responses } = scoreAssessment(assessment, given)
    results.push({
      studentId: student.id, administrationId, score, maxScore, responses,
      flagged: sheetLog.length > 0, logEntries: sheetLog,
    })
  }

  return { results, log, unmatchedPages, totalPages: pages.length }
}
