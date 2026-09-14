// Orchestrates the whole reader: render → binarize → locate fiducials/affine/orientation →
// decode QR → identify student → sample every bubble row → decide → score. Everything runs
// client-side; nothing here touches a server. See the phase-2 plan (§03 in the spec) for the
// stage-by-stage rationale — this file just wires those stages together per page.

import { applyAffine, AffineTransform } from './fiducials'
import {
  bubbleCenterIn, BUBBLE_DIAMETER_IN, DEFAULT_GRIDIN_DIGITS, GRIDIN_SYMBOLS,
  gridinBandTopIn, gridinBlockOriginIn, gridinBubbleCenterIn, gridinColumnCenterXIn,
  VERSION_SYMBOLS, versionBubbleCenterIn,
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
import { listVersionGroup } from './versions'
import { shortId } from './id'
import { AnswerValue, DecisionLogEntry, RedPenAssessment, RedPenResponse, RedPenResult, RedPenUnmatchedSheet } from './types'

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
  /** The subset of unmatchedPages that still read cleanly (fiducials located, so every bubble
   *  was actually scored) — just missing a student to attach the result to. Persisted so a
   *  teacher can assign them later instead of the scan being a dead end; see
   *  components/redpen/ResultsView.tsx's AssignUnmatchedModal. */
  unmatchedSheets: RedPenUnmatchedSheet[]
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

  // Multi-version: both versions share one printed shape (same bubble positions), so geometry
  // below is still derived once, from `assessment` (the administration's primary/Version-A key)
  // — only which version's answerKey a page's given answers get scored against varies, decided
  // per page by its own FORM bubble (see the page loop below), never by which student it is.
  const versionGroup = assessment.versionGroupId ? await listVersionGroup(userId, assessment.versionGroupId) : null
  const versionsByLabel = new Map((versionGroup ?? []).map(v => [v.versionLabel, v]))

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
  const unmatchedSheets: RedPenUnmatchedSheet[] = []

  // Reads every bubble row and every grid-in block against an already-located transform and
  // scores the result — the one thing a matched page and an unmatched-but-readable page (QR
  // unreadable, or decoded to a student id not in this roster) both need. Doesn't require
  // knowing who the student is: `studentId` is only used to tag log entries, and is omitted from
  // a log entry entirely (not set to `undefined`) when there isn't one yet, since these entries
  // sometimes get persisted via RedPenUnmatchedSheet.logEntries and Firestore rejects explicit
  // `undefined` field values.
  function readPage(
    gray: Uint8ClampedArray, width: number, height: number, transform: AffineTransform,
    pageNum: number, studentId: string | undefined, scoreAgainst: RedPenAssessment,
  ): { score: number; maxScore: number; responses: RedPenResponse[]; sheetLog: DecisionLogEntry[] } {
    const given = new Map<number, AnswerValue | null>()
    const sheetLog: DecisionLogEntry[] = []

    columns.forEach((rows, col) => {
      rows.forEach((row, rowIndex) => {
        const key = assessment!.answerKey.find(e => e.n === row.n)
        const expectMultiple = Array.isArray(key?.answer)

        const fills = row.letters.map((letter, letterIndex) => {
          const centerIn = bubbleCenterIn(col as 0 | 1, rowIndex, letterIndex)
          const centerPx = applyAffine(transform, centerIn)
          const fill = sampleBubbleFill(gray, width, height, centerPx, BUBBLE_DIAMETER_IN * DPI)
          return { letter, fill }
        })

        const decision = expectMultiple ? decideMultiple(fills) : decideSingle(fills)
        given.set(row.n, decision.given)
        if (decision.log) {
          const entry: DecisionLogEntry = {
            administrationId, page: pageNum, n: row.n,
            ...(studentId ? { studentId } : {}),
            tag: decision.log.tag, detail: decision.log.detail,
          }
          sheetLog.push(entry)
          log.push(entry)
        }
      })
    })

    gridinList.forEach((entry, blockIndex) => {
      const digits = entry.digits ?? DEFAULT_GRIDIN_DIGITS
      const origin = gridinBlockOriginIn(blockIndex, maxGridinDigits, gridinBandTop)

      const signXIn = gridinColumnCenterXIn(origin, 0)
      const signCenterPx = applyAffine(transform, gridinBubbleCenterIn(origin, signXIn, 0))
      const signFill = sampleBubbleFill(gray, width, height, signCenterPx, BUBBLE_DIAMETER_IN * DPI)
      const negative = decideBinary(signFill)

      let assembled = ''
      let stopped = false
      for (let col = 1; col <= digits; col++) {
        if (stopped) break
        const colXIn = gridinColumnCenterXIn(origin, col)
        const fills = GRIDIN_SYMBOLS.map(symbol => {
          const centerIn = gridinBubbleCenterIn(origin, colXIn, GRIDIN_SYMBOLS.indexOf(symbol))
          const centerPx = applyAffine(transform, centerIn)
          const fill = sampleBubbleFill(gray, width, height, centerPx, BUBBLE_DIAMETER_IN * DPI)
          return { letter: symbol, fill }
        })
        const decision = decideSingle(fills)
        if (decision.log) {
          const logEntry: DecisionLogEntry = {
            administrationId, page: pageNum, n: entry.n,
            ...(studentId ? { studentId } : {}),
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

    const { score, maxScore, responses } = scoreAssessment(scoreAgainst, given)
    return { score, maxScore, responses, sheetLog }
  }

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

    // FORM (multi-version) bubble — resolved before identity, since it doesn't depend on it: a
    // page's version is decided by what the student bubbled, never by who they are. Skipped
    // entirely (zero added cost) for an ordinary single-version administration.
    let scoreAgainst = assessment
    let versionLog: DecisionLogEntry | undefined
    if (versionGroup && versionGroup.length > 0) {
      const vFills = VERSION_SYMBOLS.map(symbol => {
        const centerIn = versionBubbleCenterIn(VERSION_SYMBOLS.indexOf(symbol))
        const centerPx = applyAffine(fid.transform, centerIn)
        const fill = sampleBubbleFill(gray, imageData.width, imageData.height, centerPx, BUBBLE_DIAMETER_IN * DPI)
        return { letter: symbol, fill }
      })
      const decision = decideSingle(vFills)
      const resolved = typeof decision.given === 'string' ? versionsByLabel.get(decision.given) : undefined
      console.log(`[redpen scan] page ${pageNum}: FORM bubble ${decision.given ?? '(blank)'} → ${resolved ? resolved.versionLabel : `defaulting to ${assessment.versionLabel ?? 'A'}`}`)
      if (resolved) {
        scoreAgainst = resolved
      } else {
        versionLog = {
          administrationId, page: pageNum, tag: 'NO_VERSION',
          detail: decision.given
            ? `Bubbled form "${decision.given}" doesn't match a known version — scored against Version ${assessment.versionLabel ?? 'A'} by default. Check the scan and correct it if this was actually the other version.`
            : `No form letter bubbled in — scored against Version ${assessment.versionLabel ?? 'A'} by default. Check the scan and correct it if this was actually the other version.`,
        }
        log.push(versionLog)
      }
    }

    const decoded = decodeSheetCode(imageData)
    console.log(`[redpen scan] page ${pageNum}: QR decode ${decoded ? `OK — ${decoded.administrationId}:${decoded.studentId}` : 'FAILED'}`)
    if (!decoded) {
      // The QR itself didn't decode, but fiducials did — every bubble position is still known,
      // so the page is scored and held for the teacher to assign a student to later rather than
      // dropped outright.
      log.push({ administrationId, page: pageNum, tag: 'NO_QR', detail: "Couldn't read the QR code on this page." })
      unmatchedPages.push(pageNum)
      const { score, maxScore, responses, sheetLog } = readPage(gray, imageData.width, imageData.height, fid.transform, pageNum, undefined, scoreAgainst)
      unmatchedSheets.push({
        id: shortId(), administrationId, page: pageNum,
        reason: "QR code on this page couldn't be read — assign it to a student to finish grading it.",
        score, maxScore, responses, logEntries: versionLog ? [versionLog, ...sheetLog] : sheetLog,
        ...(scoreAgainst.id !== assessment.id ? { assessmentId: scoreAgainst.id } : {}),
      })
      continue
    }
    if (decoded.administrationId !== administrationId) {
      // Not a read failure — the QR decoded fine, it's just for a different assessment/section
      // scan than the one open right now (an old printed sheet, or the wrong PDF uploaded). It
      // belongs to a different assessment's own scoring, not this one, so it isn't read here.
      log.push({ administrationId, page: pageNum, tag: 'WRONG_ADMIN', detail: "This sheet is from a different assessment or section — it wasn't scored here." })
      unmatchedPages.push(pageNum)
      continue
    }
    const student = students.find(s => s.id === decoded.studentId)
    if (!student) {
      // The QR decoded fine and it's the right administration — just no matching roster entry
      // (a typo'd/edited student id, or a student removed after the sheet was printed). Fiducials
      // are good, so this is scored and held the same way an unreadable QR is.
      log.push({ administrationId, page: pageNum, tag: 'NO_QR', detail: `No student with id ${decoded.studentId} in this class.` })
      unmatchedPages.push(pageNum)
      const { score, maxScore, responses, sheetLog } = readPage(gray, imageData.width, imageData.height, fid.transform, pageNum, undefined, scoreAgainst)
      unmatchedSheets.push({
        id: shortId(), administrationId, page: pageNum,
        reason: `Scanned student id "${decoded.studentId}" doesn't match anyone in this class — assign it to a student to finish grading it.`,
        score, maxScore, responses, logEntries: versionLog ? [versionLog, ...sheetLog] : sheetLog,
        ...(scoreAgainst.id !== assessment.id ? { assessmentId: scoreAgainst.id } : {}),
      })
      continue
    }

    const { score, maxScore, responses, sheetLog } = readPage(gray, imageData.width, imageData.height, fid.transform, pageNum, student.id, scoreAgainst)
    results.push({
      studentId: student.id, administrationId, score, maxScore, responses,
      flagged: !!versionLog || sheetLog.length > 0, logEntries: versionLog ? [versionLog, ...sheetLog] : sheetLog,
      ...(scoreAgainst.id !== assessment.id ? { assessmentId: scoreAgainst.id } : {}),
    })
  }

  return { results, log, unmatchedPages, unmatchedSheets, totalPages: pages.length }
}
