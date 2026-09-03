// Firestore persistence — flat top-level collections, each document scoped by an `ownerId`
// field (the signed-in teacher's uid), matching lib/firestore.ts's existing `datasets`
// convention (see fetchMyDatasets) rather than the original design spec's nested-subcollection
// sketch. Security is enforced by Firestore rules matching `ownerId == request.auth.uid` (see
// the RedPen Firestore migration plan for the exact rule text) — this file only ever queries
// with an explicit `where('ownerId', '==', userId)`, since an unfiltered query against a
// per-document ownerId rule is rejected outright rather than silently filtered.
//
// Every list/query stays a single equality filter on `ownerId`; anything more specific
// (by section, by administration, ...) is filtered client-side after the fetch rather than
// adding a composite index — fine at one teacher's data scale, and it means nobody ever has to
// go click an "create this index" link in the Firebase console to make RedPen work.

import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { shortId } from './id'
import { RedPenAdministration, RedPenAssessment, RedPenResult, RedPenSection, RedPenStudent } from './types'

const COLLECTIONS = {
  assessments: 'redpenAssessments',
  sections: 'redpenSections',
  students: 'redpenStudents',
  administrations: 'redpenAdministrations',
  results: 'redpenResults',
} as const

async function listOwned<T>(collectionName: string, userId: string): Promise<T[]> {
  const snap = await getDocs(query(collection(db, collectionName), where('ownerId', '==', userId)))
  return snap.docs.map(d => d.data() as T)
}

// ── Assessments ──────────────────────────────────────────────────────────

export async function listAssessments(userId: string): Promise<RedPenAssessment[]> {
  return listOwned<RedPenAssessment>(COLLECTIONS.assessments, userId)
}

export async function getAssessment(id: string): Promise<RedPenAssessment | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.assessments, id))
  return snap.exists() ? (snap.data() as RedPenAssessment) : null
}

export async function saveAssessment(userId: string, assessment: RedPenAssessment): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.assessments, assessment.id), { ...assessment, ownerId: userId })
}

export async function deleteAssessment(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.assessments, id))
}

// ── Sections & students (the roster) ────────────────────────────────────

export async function listSections(userId: string): Promise<RedPenSection[]> {
  return listOwned<RedPenSection>(COLLECTIONS.sections, userId)
}

export async function saveSection(userId: string, section: RedPenSection): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.sections, section.id), { ...section, ownerId: userId })
}

/** Firestore has no cascading delete, and a section's students/administrations/results have no
 *  meaning without it — so this cleans up everything that hangs off the section, not just the
 *  section doc itself. Results first (they reference an administration that's about to go). */
export async function deleteSection(userId: string, sectionId: string): Promise<void> {
  const [students, allAdministrations] = await Promise.all([
    listStudents(userId, sectionId),
    listAdministrations(userId),
  ])
  const administrations = allAdministrations.filter(a => a.sectionId === sectionId)

  for (const admin of administrations) {
    const results = await listResults(userId, admin.id)
    await Promise.all(results.map(r => deleteDoc(doc(db, COLLECTIONS.results, resultDocId(r.administrationId, r.studentId)))))
  }

  await Promise.all([
    ...administrations.map(a => deleteDoc(doc(db, COLLECTIONS.administrations, a.id))),
    ...students.map(s => deleteDoc(doc(db, COLLECTIONS.students, s.id))),
  ])
  await deleteDoc(doc(db, COLLECTIONS.sections, sectionId))
}

export async function listStudents(userId: string, sectionId?: string): Promise<RedPenStudent[]> {
  const all = await listOwned<RedPenStudent>(COLLECTIONS.students, userId)
  return sectionId ? all.filter(s => s.sectionId === sectionId) : all
}

export async function saveStudent(userId: string, student: RedPenStudent): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.students, student.id), { ...student, ownerId: userId })
}

export async function deleteStudent(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.students, id))
}

// ── Administrations (an assessment given to a class) ────────────────────

export async function listAdministrations(userId: string, assessmentId?: string): Promise<RedPenAdministration[]> {
  const all = await listOwned<RedPenAdministration>(COLLECTIONS.administrations, userId)
  return assessmentId ? all.filter(a => a.assessmentId === assessmentId) : all
}

export async function getAdministration(id: string): Promise<RedPenAdministration | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.administrations, id))
  return snap.exists() ? (snap.data() as RedPenAdministration) : null
}

export async function saveAdministration(userId: string, admin: RedPenAdministration): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.administrations, admin.id), { ...admin, ownerId: userId })
}

export async function createAdministration(
  userId: string, assessmentId: string, sectionId: string,
): Promise<RedPenAdministration> {
  const admin: RedPenAdministration = {
    id: shortId(), // short — this id is encoded in every printed sheet's QR code, see id.ts
    assessmentId,
    sectionId,
    date: new Date().toISOString().slice(0, 10),
    status: 'sheets-ready',
  }
  await saveAdministration(userId, admin)
  return admin
}

// ── Results (administration x student, upserted whole on every (re)scan) ────────────────────

function resultDocId(administrationId: string, studentId: string): string {
  return `${administrationId}_${studentId}`
}

export async function listResults(userId: string, administrationId: string): Promise<RedPenResult[]> {
  const all = await listOwned<RedPenResult>(COLLECTIONS.results, userId)
  return all.filter(r => r.administrationId === administrationId)
}

export async function getResult(userId: string, administrationId: string, studentId: string): Promise<RedPenResult | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.results, resultDocId(administrationId, studentId)))
  return snap.exists() ? (snap.data() as RedPenResult) : null
}

/** Whole-document upsert, keyed by administration+student — a rescan of one student (e.g. a
 *  makeup for someone absent the first time) only ever touches that student's own document,
 *  never anyone else's. */
export async function saveResult(userId: string, result: RedPenResult): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.results, resultDocId(result.administrationId, result.studentId)), { ...result, ownerId: userId })
}
