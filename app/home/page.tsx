'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutList, LayoutGrid } from 'lucide-react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Header } from '@/components/layout/Header'
import { DatasetCard } from '@/components/library/DatasetCard'
import { DatasetListSkeleton } from '@/components/ui/Skeleton'
import { GameHub } from '@/components/games/GameHub'
import { useAuth } from '@/components/auth/AuthProvider'
import { subscribeToMyDatasets, subscribeToPublicDatasets, deleteDataset, loadDataset, saveDataset } from '@/lib/firestore'
import { useStore } from '@/lib/store'
import { DatasetMeta } from '@/types'
import { SAMPLE_DATASETS } from '@/lib/sampleData'

type HomeTab = 'datasets' | 'lab' | 'games' | 'polls'
type LibraryTab = 'all' | 'mine'
type SortKey = 'newest' | 'oldest' | 'name' | 'rows'

function DatasetsSection() {
  const { user } = useAuth()
  const router = useRouter()
  const setGrid = useStore(s => s.setGrid)
  const setActiveDatasetId = useStore(s => s.setActiveDatasetId)
  const setActiveDatasetName = useStore(s => s.setActiveDatasetName)
  const clearGrid = useStore(s => s.clearGrid)

  const [tab, setTab] = useState<LibraryTab>('all')
  const [publicDatasets, setPublicDatasets] = useState<DatasetMeta[]>([])
  const [myDatasets, setMyDatasets] = useState<DatasetMeta[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [view, setView] = useState<'list' | 'card'>('list')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  async function handleSeedSamples() {
    if (!user) return
    setSeeding(true)
    try {
      for (const s of SAMPLE_DATASETS) {
        await saveDataset(user, s.name, s.description ?? '', s.emoji, true, s.grid, {
          tags: s.tags,
          source: s.source,
          sourceUrl: s.sourceUrl,
          citation: s.citation,
          notes: s.notes,
          variableInfo: s.variableInfo,
        })
      }
    } finally {
      setSeeding(false)
    }
  }

  useEffect(() => {
    if (!user) return
    if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true') {
      setLoading(false)
      return
    }
    const unsub1 = subscribeToPublicDatasets(data => { setPublicDatasets(data); setLoading(false) })
    const unsub2 = subscribeToMyDatasets(user.uid, setMyDatasets)
    return () => { unsub1(); unsub2() }
  }, [user])

  const datasets = tab === 'all' ? publicDatasets : myDatasets

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = datasets.filter(d =>
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q) ||
      d.source?.toLowerCase().includes(q) ||
      d.tags?.some(tag => tag.toLowerCase().includes(q))
    )
    result = [...result].sort((a, b) => {
      if (sort === 'newest') return b.updatedAt.getTime() - a.updatedAt.getTime()
      if (sort === 'oldest') return a.updatedAt.getTime() - b.updatedAt.getTime()
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'rows') return b.rowCount - a.rowCount
      return 0
    })
    return result
  }, [datasets, search, sort])

  async function handleOpen(id: string) {
    try {
      const { meta, grid } = await loadDataset(id)
      setGrid(grid)
      setActiveDatasetId(id)
      setActiveDatasetName(meta.name)
      router.push('/workspace')
    } catch {
      alert('Could not load this dataset.')
    }
  }

  async function handleDelete(id: string) {
    await deleteDataset(id)
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-[var(--color-border)] flex-1">
          {([{ id: 'all' as LibraryTab, label: 'All Datasets' }, { id: 'mine' as LibraryTab, label: 'My Datasets' }]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={handleSeedSamples}
            disabled={seeding}
            className="px-3 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] rounded-lg transition-colors disabled:opacity-50"
          >
            {seeding ? 'Adding…' : '+ Sample Datasets'}
          </button>
          <button
            onClick={() => { clearGrid(); router.push('/workspace') }}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium"
          >
            + New Dataset
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search datasets…"
          className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-white"
        />
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm bg-white">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name A–Z</option>
          <option value="rows">Most rows</option>
        </select>
        <div className="flex border border-[var(--color-border)] rounded-lg overflow-hidden">
          <button onClick={() => setView('list')} className={`p-2 ${view === 'list' ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-muted)]'}`}><LayoutList size={16} /></button>
          <button onClick={() => setView('card')} className={`p-2 ${view === 'card' ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-muted)]'}`}><LayoutGrid size={16} /></button>
        </div>
      </div>

      {loading ? (
        <DatasetListSkeleton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--color-muted)]">
          {search ? 'No datasets match your search.' : 'No datasets yet. Click "+ Sample Datasets" to get started.'}
        </div>
      ) : view === 'card' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filtered.map(d => (
            <DatasetCard key={d.id} dataset={d} currentUserId={user?.uid} onOpen={handleOpen} onDelete={id => setConfirmDelete(id)} view="card" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-[var(--color-border)]">
          {filtered.map(d => (
            <DatasetCard key={d.id} dataset={d} currentUserId={user?.uid} onOpen={handleOpen} onDelete={id => setConfirmDelete(id)} view="list" />
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-[var(--color-text)] mb-2">Delete dataset?</h3>
            <p className="text-sm text-[var(--color-muted)] mb-4">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-slate-100">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 rounded-lg text-sm bg-red-500 text-white font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const HOME_TABS: { id: HomeTab; label: string; soon?: boolean }[] = [
  { id: 'datasets', label: 'Datasets' },
  { id: 'lab',      label: 'Lab' },
  { id: 'games',    label: 'Games' },
  { id: 'polls',    label: 'Polls', soon: true },
]

function HomeContent() {
  const [tab, setTab] = useState<HomeTab>('datasets')
  const router = useRouter()
  const clearGrid = useStore(s => s.clearGrid)

  function handleTopTabClick(tabId: HomeTab, soon?: boolean) {
    if (soon) return
    if (tabId === 'lab') {
      clearGrid()
      router.push('/workspace')
      return
    }
    setTab(tabId)
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Top-level section tabs */}
      <div className="border-b border-[var(--color-border)] bg-white flex-shrink-0">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-1">
          {HOME_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => handleTopTabClick(t.id, t.soon)}
              disabled={t.soon}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : t.soon
                    ? 'border-transparent text-[var(--color-border)] cursor-default'
                    : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {t.label}
              {t.soon && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">
                  soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        {tab === 'datasets' && (
          <div className="max-w-5xl mx-auto w-full px-4 py-6">
            <DatasetsSection />
          </div>
        )}
        {tab === 'games' && <GameHub />}
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <div className="flex h-screen flex-col">
        <Header showSave={false} showHomeLink={false} />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <HomeContent />
        </div>
      </div>
    </ProtectedRoute>
  )
}
