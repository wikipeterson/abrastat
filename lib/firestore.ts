import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
  Timestamp,
} from 'firebase/firestore'
import { User } from 'firebase/auth'
import { v4 as uuid } from 'uuid'
import { db } from './firebase'
import { ColumnMeta, DatasetMeta, DatasetVariableInfo, GridState } from '@/types'

function gridToStorable(grid: GridState) {
  return {
    columns: grid.columns,
    rows: grid.rows,
  }
}

export async function saveDataset(
  user: User,
  name: string,
  description: string,
  emoji: string,
  isPublic: boolean,
  grid: GridState,
  extras?: {
    tags?: string[]
    source?: string
    sourceUrl?: string
    citation?: string
    notes?: string
    variableInfo?: DatasetVariableInfo[]
  }
): Promise<string> {
  const ref = doc(collection(db, 'datasets'))
  const now = Timestamp.now()
  await setDoc(ref, {
    id: ref.id,
    ownerId: user.uid,
    ownerName: user.displayName ?? '',
    ownerPhotoURL: user.photoURL ?? '',
    name,
    description,
    emoji,
    isPublic,
    rowCount: grid.rows.length,
    columnCount: grid.columns.length,
    tags: extras?.tags ?? [],
    source: extras?.source ?? '',
    sourceUrl: extras?.sourceUrl ?? '',
    citation: extras?.citation ?? '',
    notes: extras?.notes ?? '',
    variableInfo: extras?.variableInfo ?? [],
    createdAt: now,
    updatedAt: now,
    ...gridToStorable(grid),
  })
  return ref.id
}

export async function loadDataset(datasetId: string): Promise<{ meta: DatasetMeta; grid: GridState }> {
  const snap = await getDoc(doc(db, 'datasets', datasetId))
  if (!snap.exists()) throw new Error('Dataset not found.')
  const data = snap.data()
  const meta: DatasetMeta = {
    id: data.id,
    ownerId: data.ownerId,
    ownerName: data.ownerName,
    ownerPhotoURL: data.ownerPhotoURL,
    name: data.name,
    description: data.description,
    emoji: data.emoji,
    isPublic: data.isPublic,
    rowCount: data.rowCount,
    columnCount: data.columnCount,
    columns: data.columns,
    tags: data.tags ?? [],
    source: data.source ?? '',
    sourceUrl: data.sourceUrl ?? '',
    citation: data.citation ?? '',
    notes: data.notes ?? '',
    variableInfo: data.variableInfo ?? [],
    createdAt: (data.createdAt as Timestamp).toDate(),
    updatedAt: (data.updatedAt as Timestamp).toDate(),
  }
  const columnsWithIds = (data.columns as (ColumnMeta & { id?: string })[]).map(c => ({
    id: c.id ?? uuid(),
    name: c.name,
    type: c.type,
  }))
  const grid: GridState = { columns: columnsWithIds, rows: data.rows ?? [] }
  return { meta, grid }
}

export async function updateDatasetMeta(
  datasetId: string,
  updates: Partial<Pick<DatasetMeta, 'name' | 'description' | 'emoji' | 'isPublic' | 'tags' | 'source' | 'sourceUrl' | 'citation' | 'notes' | 'variableInfo'>>
): Promise<void> {
  await updateDoc(doc(db, 'datasets', datasetId), { ...updates, updatedAt: Timestamp.now() })
}

export async function updateDatasetRows(datasetId: string, grid: GridState): Promise<void> {
  await updateDoc(doc(db, 'datasets', datasetId), {
    ...gridToStorable(grid),
    rowCount: grid.rows.length,
    columnCount: grid.columns.length,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteDataset(datasetId: string): Promise<void> {
  await deleteDoc(doc(db, 'datasets', datasetId))
}

export function subscribeToMyDatasets(
  userId: string,
  callback: (datasets: DatasetMeta[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'datasets'),
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc')
  )
  return onSnapshot(q, snap => {
    const datasets = snap.docs.map(d => {
      const data = d.data()
      return {
        ...data,
        createdAt: (data.createdAt as Timestamp).toDate(),
        updatedAt: (data.updatedAt as Timestamp).toDate(),
      } as DatasetMeta
    })
    callback(datasets)
  }, error => {
    onError?.(error)
  })
}

export function subscribeToPublicDatasets(
  callback: (datasets: DatasetMeta[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'datasets'),
    where('isPublic', '==', true),
    orderBy('updatedAt', 'desc'),
    limit(100)
  )
  return onSnapshot(q, snap => {
    const datasets = snap.docs.map(d => {
      const data = d.data()
      return {
        ...data,
        createdAt: (data.createdAt as Timestamp).toDate(),
        updatedAt: (data.updatedAt as Timestamp).toDate(),
      } as DatasetMeta
    })
    callback(datasets)
  }, error => {
    onError?.(error)
  })
}

export async function upsertUser(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  const now = Timestamp.now()
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: now,
      lastLoginAt: now,
    })
  } else {
    await updateDoc(ref, { lastLoginAt: now })
  }
}
