'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { loadDataset } from '@/lib/firestore'
import { getSampleDatasetById } from '@/lib/sampleData'
import { useStore } from '@/lib/store'

type Status = 'loading' | 'error' | 'guest' | 'done'

function normalizeDatasetId(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default function ShareLinkPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const { loading: authLoading, isGuest } = useAuth()
  const router = useRouter()
  const setGrid = useStore(s => s.setGrid)
  const setActiveDatasetId = useStore(s => s.setActiveDatasetId)
  const setActiveDatasetName = useStore(s => s.setActiveDatasetName)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (authLoading) return

    const normalizedDatasetId = normalizeDatasetId(datasetId)

    if (normalizedDatasetId.startsWith('sample:')) {
      const sample = getSampleDatasetById(normalizedDatasetId)
      if (!sample) {
        setErrorMsg('Sample dataset not found.')
        setStatus('error')
        return
      }

      setGrid(sample.grid)
      setActiveDatasetId(null)
      setActiveDatasetName(`${sample.name} (Copy)`)
      setStatus('done')
      router.replace('/workspace')
      return
    }

    if (isGuest) {
      setStatus('guest')
      return
    }

    loadDataset(normalizedDatasetId)
      .then(({ meta, grid }) => {
        // Load as a working copy — activeDatasetId stays null so
        // any subsequent Save creates a brand-new record.
        setGrid(grid)
        setActiveDatasetId(null)
        setActiveDatasetName(`${meta.name} (Copy)`)
        setStatus('done')
        router.replace('/workspace')
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Could not load dataset.'
        setErrorMsg(msg)
        setStatus('error')
      })
  }, [authLoading, isGuest, datasetId, router, setGrid, setActiveDatasetId, setActiveDatasetName])

  if (status === 'guest') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h2 className="font-semibold text-[var(--color-text)]">Create a free account to open this dataset</h2>
          <p className="text-sm text-[var(--color-muted)]">
            A guest session can&apos;t open shared datasets — sign in (or create a free account) to get your own copy.
          </p>
          <button
            onClick={() => { window.location.href = '/' }}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h2 className="font-semibold text-[var(--color-text)]">Dataset unavailable</h2>
          <p className="text-sm text-[var(--color-muted)]">
            {errorMsg || 'This dataset doesn\'t exist or you don\'t have access to it.'}
          </p>
          <button
            onClick={() => router.replace('/home')}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium"
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
        <p className="text-sm text-[var(--color-muted)]">Loading dataset…</p>
      </div>
    </div>
  )
}
