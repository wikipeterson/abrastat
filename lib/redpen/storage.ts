// Phase-1 persistence: plain localStorage, one key per collection. Read/write both swallow
// errors the same way app/workspace/page.tsx's public-dataset cache does (private browsing,
// quota, corrupted JSON should degrade to "empty" rather than crash the app). This is the
// intended swap point for Firestore later (spec §07: "Firebase last") — callers only ever
// import the functions below, never the storage keys.

import { shortId } from './id'
import {
  DecisionLogEntry, RedPenAdministration, RedPenAssessment, RedPenResult, RedPenSection, RedPenStudent,
} from './types'

const KEYS = {
  assessments: 'abrastat.redpen.assessments',
  sections: 'abrastat.redpen.sections',
  students: 'abrastat.redpen.students',
  administrations: 'abrastat.redpen.administrations',
  results: 'abrastat.redpen.results',
  decisionLog: 'abrastat.redpen.decisionLog',
} as const

function readList<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeList<T>(key: string, items: T[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // Ignore write failures (quota, private browsing) — same tolerance as the dataset cache.
  }
}

// ── Assessments ──────────────────────────────────────────────────────────

export function listAssessments(): RedPenAssessment[] {
  return readList<RedPenAssessment>(KEYS.assessments)
}

export function getAssessment(id: string): RedPenAssessment | null {
  return listAssessments().find(a => a.id === id) ?? null
}

export function saveAssessment(assessment: RedPenAssessment) {
  const all = listAssessments()
  const idx = all.findIndex(a => a.id === assessment.id)
  if (idx === -1) all.push(assessment)
  else all[idx] = assessment
  writeList(KEYS.assessments, all)
}

export function deleteAssessment(id: string) {
  writeList(KEYS.assessments, listAssessments().filter(a => a.id !== id))
}

// ── Sections & students (the roster) ────────────────────────────────────

export function listSections(): RedPenSection[] {
  return readList<RedPenSection>(KEYS.sections)
}

export function saveSection(section: RedPenSection) {
  const all = listSections()
  const idx = all.findIndex(s => s.id === section.id)
  if (idx === -1) all.push(section)
  else all[idx] = section
  writeList(KEYS.sections, all)
}

export function listStudents(sectionId?: string): RedPenStudent[] {
  const all = readList<RedPenStudent>(KEYS.students)
  return sectionId ? all.filter(s => s.sectionId === sectionId) : all
}

export function saveStudent(student: RedPenStudent) {
  const all = readList<RedPenStudent>(KEYS.students)
  const idx = all.findIndex(s => s.id === student.id)
  if (idx === -1) all.push(student)
  else all[idx] = student
  writeList(KEYS.students, all)
}

export function deleteStudent(id: string) {
  writeList(KEYS.students, readList<RedPenStudent>(KEYS.students).filter(s => s.id !== id))
}

// ── Administrations (an assessment given to a class) ────────────────────

export function listAdministrations(assessmentId?: string): RedPenAdministration[] {
  const all = readList<RedPenAdministration>(KEYS.administrations)
  return assessmentId ? all.filter(a => a.assessmentId === assessmentId) : all
}

export function getAdministration(id: string): RedPenAdministration | null {
  return readList<RedPenAdministration>(KEYS.administrations).find(a => a.id === id) ?? null
}

export function saveAdministration(admin: RedPenAdministration) {
  const all = readList<RedPenAdministration>(KEYS.administrations)
  const idx = all.findIndex(a => a.id === admin.id)
  if (idx === -1) all.push(admin)
  else all[idx] = admin
  writeList(KEYS.administrations, all)
}

export function createAdministration(assessmentId: string, sectionId: string): RedPenAdministration {
  const admin: RedPenAdministration = {
    id: shortId(), // short — this id is encoded in every printed sheet's QR code, see id.ts
    assessmentId,
    sectionId,
    date: new Date().toISOString().slice(0, 10),
    status: 'sheets-ready',
  }
  saveAdministration(admin)
  return admin
}

// ── Results & the scan decision log (administrations/{id}/results/{studentId} per spec §05b) ──

function resultKey(administrationId: string, studentId: string): string {
  return `${administrationId}:${studentId}`
}

export function listResults(administrationId: string): RedPenResult[] {
  return readList<RedPenResult>(KEYS.results).filter(r => r.administrationId === administrationId)
}

export function getResult(administrationId: string, studentId: string): RedPenResult | null {
  return readList<RedPenResult>(KEYS.results)
    .find(r => resultKey(r.administrationId, r.studentId) === resultKey(administrationId, studentId)) ?? null
}

export function saveResult(result: RedPenResult) {
  const all = readList<RedPenResult>(KEYS.results)
  const key = resultKey(result.administrationId, result.studentId)
  const idx = all.findIndex(r => resultKey(r.administrationId, r.studentId) === key)
  if (idx === -1) all.push(result)
  else all[idx] = result
  writeList(KEYS.results, all)
}

/**
 * Merges a scan run's log entries into an administration's log. A rescan is often partial —
 * a student who was absent the first time, or one sheet you're redoing after fixing something
 * — so this only replaces entries belonging to students this run actually produced results
 * for (plus any sheet-level entries with no student, which every run supersedes since those
 * can't be meaningfully matched across separate uploads). Everyone else's prior entries are
 * left alone; scanning three sheets never wipes the other twenty-eight students' log history.
 */
export function saveDecisionLog(administrationId: string, entries: DecisionLogEntry[]) {
  const studentIdsInRun = new Set(entries.map(e => e.studentId).filter((id): id is string => !!id))
  const kept = readList<DecisionLogEntry>(KEYS.decisionLog).filter(e => {
    if (e.administrationId !== administrationId) return true
    return !!e.studentId && !studentIdsInRun.has(e.studentId)
  })
  writeList(KEYS.decisionLog, [...kept, ...entries])
}

export function getDecisionLog(administrationId: string): DecisionLogEntry[] {
  return readList<DecisionLogEntry>(KEYS.decisionLog).filter(e => e.administrationId === administrationId)
}
