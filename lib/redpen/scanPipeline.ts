// Orchestrates the whole reader: render → binarize → locate fiducials/affine/orientation →
// decode QR → identify student → sample every bubble row → decide → score. Everything runs
// client-side; nothing here touches a server. See the phase-2 plan (§03 in the spec) for the
// stage-by-stage rationale — this file just wires those stages together per page.

import { applyAffine } from './fiducials'
import { bubbleCenterIn, BUBBLE_DIAMETER_IN } from './geometry'
import { bubbleRows, splitIntoColumns } from './layout'
import { locateFiducials } from './fiducials'
import { binarize, otsuThreshold, toGrayscale } from './otsu'
import { decideMultiple, decideSingle } from './decide'
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

    const { score, maxScore, responses } = scoreAssessment(assessment, given)
    results.push({
      studentId: student.id, administrationId, score, maxScore, responses,
      flagged: sheetLog.length > 0, logEntries: sheetLog,
    })
  }

  return { results, log, unmatchedPages, totalPages: pages.length }
}
