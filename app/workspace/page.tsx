'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Header } from '@/components/layout/Header'
import { ExploreCanvas } from '@/components/explore/ExploreCanvas'
import { SaveDatasetModal } from '@/components/library/SaveDatasetModal'
import { ShareDatasetModal } from '@/components/library/ShareDatasetModal'
import { DatasetCard } from '@/components/library/DatasetCard'
import { DatasetListSkeleton } from '@/components/ui/Skeleton'
import { GameHub } from '@/components/games/GameHub'
import { useAuth } from '@/components/auth/AuthProvider'
import { fetchMyDatasets, fetchPublicDatasets, deleteDataset, loadDataset } from '@/lib/firestore'
import { SAMPLE_DATASETS, getSampleDatasetById, getSampleDatasetId } from '@/lib/sampleData'
import { useStore } from '@/lib/store'
import { CardConfig } from '@/lib/exploreTypes'
import { DatasetMeta } from '@/types'
import { exportGridAsCsv, exportGridAsXlsx } from '@/lib/datasetExport'
import { canAccessPuzzleWeek } from '@/lib/featureFlags'

interface CardOption {
  type: CardConfig['type']
  icon: string
  label: string
}

type WorkspaceMode = 'library' | 'lab'
type LibrarySection = 'all' | 'mine' | 'games' | 'applets' | 'polls' | 'logic-puzzles'
type SortKey = 'newest' | 'oldest' | 'name' | 'rows'

const SIDEBAR_WIDTH_CLASS = 'md:w-48'
const LOGIC_PUZZLES_URL = 'https://puzzleweek.abrastat.com/puzzleweek/bonus'

const EXPLORE_CARD_OPTIONS: CardOption[] = [
  { type: 'graph',      icon: '📈', label: 'Graph' },
  { type: 'summary',    icon: '📊', label: 'Summary Statistics' },
  { type: 'table',      icon: '⊞',  label: 'Two-Way Table' },
  { type: 'regression', icon: '📉', label: 'Regression' },
  { type: 'regression-by-eye', icon: '✏️', label: 'Regression by Eye' },
]

const PROBABILITY_CARD_OPTIONS: CardOption[] = [
  { type: 'distribution',    icon: '🔔', label: 'Distribution Calculators' },
  { type: 'compare-normals', icon: '⚖️', label: 'Compare Normals' },
]

const INFERENCE_CARD_OPTIONS: CardOption[] = [
  { type: 'means',                   icon: '📐', label: 'Means' },
  { type: 'proportions',             icon: '⚖️', label: 'Proportions' },
  { type: 'one-prop-randomization',  icon: '🎯', label: 'One-Proportion Randomization Test' },
  { type: 'two-mean-randomization',  icon: '📏', label: 'Two-Mean Randomization Test' },
  { type: 'two-prop-randomization',  icon: '🎲', label: 'Two-Prop Randomization Test' },
]

const BASE_LIBRARY_ITEMS: { id: Exclude<LibrarySection, 'logic-puzzles'>; label: string; soon?: boolean }[] = [
  { id: 'all', label: 'Public Datasets' },
  { id: 'mine', label: 'My Datasets' },
  { id: 'games', label: 'Games' },
  { id: 'applets', label: 'Applets' },
  { id: 'polls', label: 'Polls', soon: true },
]

const PUBLIC_DATASET_CACHE_KEY = 'abrastat.publicDatasets.v1'
const PUBLIC_DATASET_CACHE_TS_KEY = 'abrastat.publicDatasets.v1.ts'
const PUBLIC_DATASET_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const WORKSPACE_INTRO_DISMISSED_KEY = 'abrastat.workspaceIntro.dismissed'

function serializeDatasetMeta(dataset: DatasetMeta) {
  return {
    ...dataset,
    createdAt: dataset.createdAt.toISOString(),
    updatedAt: dataset.updatedAt.toISOString(),
  }
}

function deserializeDatasetMeta(value: unknown): DatasetMeta | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (typeof data.id !== 'string' || typeof data.name !== 'string') return null
  return {
    id: data.id,
    ownerId: String(data.ownerId ?? ''),
    ownerName: String(data.ownerName ?? ''),
    ownerPhotoURL: typeof data.ownerPhotoURL === 'string' ? data.ownerPhotoURL : '',
    name: data.name,
    description: String(data.description ?? ''),
    emoji: String(data.emoji ?? ''),
    isPublic: Boolean(data.isPublic),
    rowCount: Number(data.rowCount ?? 0),
    columnCount: Number(data.columnCount ?? 0),
    columns: Array.isArray(data.columns) ? data.columns as DatasetMeta['columns'] : [],
    tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    source: String(data.source ?? ''),
    sourceUrl: String(data.sourceUrl ?? ''),
    citation: String(data.citation ?? ''),
    notes: String(data.notes ?? ''),
    variableInfo: Array.isArray(data.variableInfo) ? data.variableInfo as DatasetMeta['variableInfo'] : [],
    createdAt: new Date(String(data.createdAt ?? '')),
    updatedAt: new Date(String(data.updatedAt ?? '')),
  }
}

function readCachedPublicDatasets(): DatasetMeta[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PUBLIC_DATASET_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(deserializeDatasetMeta)
      .filter((dataset): dataset is DatasetMeta => !!dataset && !Number.isNaN(dataset.updatedAt.getTime()))
  } catch {
    return []
  }
}

function writeCachedPublicDatasets(datasets: DatasetMeta[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      PUBLIC_DATASET_CACHE_KEY,
      JSON.stringify(datasets.map(serializeDatasetMeta)),
    )
    window.localStorage.setItem(PUBLIC_DATASET_CACHE_TS_KEY, String(Date.now()))
  } catch {
    // Ignore cache write failures.
  }
}

function isPublicDatasetCacheFresh(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const ts = Number(window.localStorage.getItem(PUBLIC_DATASET_CACHE_TS_KEY) ?? '0')
    return Date.now() - ts < PUBLIC_DATASET_CACHE_TTL_MS
  } catch {
    return false
  }
}

function invalidatePublicDatasetCache() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(PUBLIC_DATASET_CACHE_TS_KEY)
  } catch {
    // ignore
  }
}

function upsertCachedPublicDataset(dataset: DatasetMeta) {
  if (!dataset.isPublic) return
  const next = [dataset, ...readCachedPublicDatasets().filter(existing => existing.id !== dataset.id)]
  writeCachedPublicDatasets(next.slice(0, 100))
}

function sampleDatasetToMeta(sample: (typeof SAMPLE_DATASETS)[number]): DatasetMeta {
  const now = new Date('2024-01-01T00:00:00Z')
  return {
    id: getSampleDatasetId(sample),
    ownerId: 'abrastat',
    ownerName: 'Demo',
    ownerPhotoURL: '',
    name: sample.name,
    description: sample.description ?? '',
    emoji: sample.emoji,
    isPublic: true,
    rowCount: sample.grid.rows.length,
    columnCount: sample.grid.columns.length,
    columns: sample.grid.columns.map(col => ({ name: col.name, type: col.type })),
    tags: sample.tags ?? [],
    source: sample.source ?? '',
    sourceUrl: sample.sourceUrl ?? '',
    citation: sample.citation ?? '',
    notes: sample.notes ?? '',
    variableInfo: sample.variableInfo ?? [],
    createdAt: now,
    updatedAt: now,
  }
}

function GroupedAddCardMenu({
  onAdd,
  highlight = false,
  className = '',
}: {
  onAdd: (type: CardConfig['type']) => void
  highlight?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const groups = [
    { id: 'explore',     label: 'Explore',     options: EXPLORE_CARD_OPTIONS },
    { id: 'probability', label: 'Probability', options: PROBABILITY_CARD_OPTIONS },
    { id: 'inference',   label: 'Inference',   options: INFERENCE_CARD_OPTIONS },
  ]

  return (
    <div className={`relative z-[60] ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all min-w-[132px] ${
          open
            ? 'bg-[var(--color-text)] text-white'
            : 'bg-[var(--color-accent)] text-white hover:brightness-105'
        } ${highlight ? 'shadow-[0_0_0_4px_rgba(214,245,242,0.95)]' : ''}`}
      >
        <span className="flex items-center gap-1.5">
          <Plus size={14} />
          <span>Add Card</span>
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-[70] bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden min-w-[260px]">
            {groups.map(group => (
              <div key={group.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {group.label}
                </div>
                <div className="pb-2">
                  {group.options.map(option => (
                    <button
                      key={option.type}
                      onClick={() => { onAdd(option.type); setOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-accent-light)] text-left transition-colors"
                    >
                      <span className="text-base leading-none">{option.icon}</span>
                      <span className="text-sm font-medium text-[var(--color-text)]">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function VariableSidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { grid, selectedColumnIds, toggleColumnSelection } = useStore()

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={onClose} />
      )}

      <aside className={`
        flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col
        md:relative ${SIDEBAR_WIDTH_CLASS} md:translate-x-0 md:z-auto
        fixed inset-y-0 left-0 z-30 w-56 transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Variables</div>
          <button onClick={onClose} className="md:hidden text-[var(--color-muted)] text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {grid.columns.map(col => {
            const isSelected = selectedColumnIds.includes(col.id)
            const isNumeric = col.type === 'numeric'
            return (
              <div
                key={col.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', col.id)
                  e.dataTransfer.effectAllowed = 'copy'
                  const el = e.currentTarget as HTMLElement
                  window.setTimeout(() => { el.style.opacity = '0.25' }, 0)
                }}
                onDragEnd={e => {
                  (e.currentTarget as HTMLElement).style.opacity = ''
                }}
                onClick={() => toggleColumnSelection(col.id)}
                title="Click to select for stats"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-gold-light)] text-[#5A3A00] ring-2 ring-inset ring-[var(--color-gold)]'
                    : isNumeric
                      ? 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
                      : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                }`}
              >
                <span className={`text-[10px] font-mono font-bold flex-shrink-0 ${isSelected ? 'opacity-70' : 'opacity-50'}`}>
                  {isNumeric ? '#' : 'A'}
                </span>
                <span className="truncate flex-1">{col.name}</span>
              </div>
            )
          })}
        </div>

        {selectedColumnIds.length > 0 && (
          <div className="px-3 py-2 border-t border-[var(--color-border)]">
            <button
              onClick={() => selectedColumnIds.forEach(id => toggleColumnSelection(id))}
              className="text-xs text-[var(--color-muted)] hover:underline block"
            >
              Clear selection
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

function LibrarySidebar({
  open,
  onClose,
  section,
  items,
  onSectionChange,
}: {
  open: boolean
  onClose: () => void
  section: LibrarySection
  items: { id: LibrarySection; label: string; soon?: boolean }[]
  onSectionChange: (section: LibrarySection) => void
}) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={onClose} />
      )}

      <aside className={`
        flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col
        md:relative ${SIDEBAR_WIDTH_CLASS} md:translate-x-0 md:z-auto
        fixed inset-y-0 left-0 z-30 w-60 transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Library</div>
          <button onClick={onClose} className="md:hidden text-[var(--color-muted)] text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => {
                if (item.soon) return
                onSectionChange(item.id)
                onClose()
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                section === item.id
                  ? 'bg-[var(--color-accent)] text-white'
                  : item.soon
                    ? 'text-[var(--color-border)] cursor-default'
                    : 'text-[var(--color-text)] hover:bg-slate-100'
              }`}
            >
              <span>{item.label}</span>
              {item.soon && (
                <span className="ml-2 text-[10px] uppercase tracking-wide">Soon</span>
              )}
            </button>
          ))}
        </div>
      </aside>
    </>
  )
}

function DatasetsBrowser({
  scope,
  onOpenDataset,
  onExportDataset,
}: {
  scope: 'all' | 'mine'
  onOpenDataset: (id: string) => Promise<void>
  onExportDataset: (dataset: DatasetMeta, format: 'csv' | 'xlsx') => Promise<void>
}) {
  const { user, isGuest } = useAuth()
  const [publicDatasets, setPublicDatasets] = useState<DatasetMeta[]>(() => readCachedPublicDatasets())
  const [myDatasets, setMyDatasets] = useState<DatasetMeta[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [loading, setLoading] = useState(process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH !== 'true')

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true') return

    const cached = readCachedPublicDatasets()
    if (isPublicDatasetCacheFresh() && cached.length > 0) {
      setPublicDatasets(cached)
      setLoading(false)
    } else {
      fetchPublicDatasets()
        .then(data => {
          setPublicDatasets(data)
          writeCachedPublicDatasets(data)
          setLoading(false)
        })
        .catch(() => {
          setPublicDatasets(cached)
          setLoading(false)
        })
    }

    if (user && !isGuest) {
      fetchMyDatasets(user.uid)
        .then(setMyDatasets)
        .catch(() => setMyDatasets([]))
    } else {
      setMyDatasets([])
    }
  }, [user, isGuest])

  async function handleDelete(id: string) {
    await deleteDataset(id)
    setConfirmDelete(null)
  }

  const datasets = scope === 'all' ? publicDatasets : myDatasets
  const builtInDatasets = useMemo(() => (scope === 'all' ? SAMPLE_DATASETS.map(sampleDatasetToMeta) : []), [scope])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const matchesQuery = (d: DatasetMeta) =>
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q) ||
      d.source?.toLowerCase().includes(q) ||
      d.tags?.some(tag => tag.toLowerCase().includes(q))
    const sortItems = (items: DatasetMeta[]) => [...items].sort((a, b) => {
      if (sort === 'newest') return b.updatedAt.getTime() - a.updatedAt.getTime()
      if (sort === 'oldest') return a.updatedAt.getTime() - b.updatedAt.getTime()
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'rows') return b.rowCount - a.rowCount
      return 0
    })

    const demoItems = sortItems(builtInDatasets.filter(matchesQuery))
    const publicItems = sortItems(datasets.filter(matchesQuery))
    return [...demoItems, ...publicItems]
  }, [builtInDatasets, datasets, search, sort])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search datasets…"
            className="flex-1 min-w-0 w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-white"
          />
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm bg-white">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A–Z</option>
            <option value="rows">Most rows</option>
          </select>
        </div>

        {loading ? (
          <DatasetListSkeleton />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-muted)]">
            {search ? 'No datasets match your search.' : 'No datasets yet. Add sample datasets or start a new one.'}
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] divide-y divide-[var(--color-border)]">
            {filtered.map(dataset => (
              <DatasetCard
                key={dataset.id}
                dataset={dataset}
                currentUserId={user?.uid}
                onOpen={onOpenDataset}
                onExport={onExportDataset}
                onDelete={id => setConfirmDelete(id)}
                view="list"
              />
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
    </div>
  )
}

function PollsPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="max-w-xl text-center space-y-2">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Polls</h2>
        <p className="text-[var(--color-muted)]">
          Polls will live here in the library shell. For now, this section is still being built.
        </p>
      </div>
    </div>
  )
}

function AppletsBrowser() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Applets</h2>
          <p className="text-[var(--color-muted)]">
            Standalone interactive tools you can open directly.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Link
            href="/applets/dice-roller"
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl leading-none">🎲</div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-[var(--color-text)]">Dice Roller</div>
                <p className="text-sm text-[var(--color-muted)] max-w-md">
                  Roll d6, d10, and d100 with fast batches and linked results.
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white whitespace-nowrap">
              Open
            </span>
          </Link>

          <Link
            href="/applets/coin-flipper"
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl leading-none">🔀</div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-[var(--color-text)]">Coin Flipper</div>
                <p className="text-sm text-[var(--color-muted)] max-w-md">
                  Simulate groups of coin flips and graph the distribution of heads or percent heads.
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white whitespace-nowrap">
              Open
            </span>
          </Link>

          <Link
            href="/applets/random-number-generator"
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl leading-none">🎛️</div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-[var(--color-text)]">Random Number Generator</div>
                <p className="text-sm text-[var(--color-muted)] max-w-md">
                  Generate random integers in a chosen range, one at a time or in batches.
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white whitespace-nowrap">
              Open
            </span>
          </Link>

          <Link
            href="/applets/spinner"
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl leading-none">🎡</div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-[var(--color-text)]">Spinner</div>
                <p className="text-sm text-[var(--color-muted)] max-w-md">
                  Prize-wheel randomizer for probability demonstrations and classroom activities.
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white whitespace-nowrap">
              Open
            </span>
          </Link>

          <Link
            href="/applets/galton-board"
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl leading-none">🟢</div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-[var(--color-text)]">Galton Board</div>
                <p className="text-sm text-[var(--color-muted)] max-w-md">
                  Drop balls through pegs and watch the distribution build bin by bin.
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white whitespace-nowrap">
              Open
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function UnsavedGuard({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
        <h3 className="font-semibold text-[var(--color-text)] mb-2">Unsaved changes</h3>
        <p className="text-sm text-[var(--color-muted)] mb-4">You have unsaved changes. Starting a new dataset will discard them.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-slate-100">Keep editing</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm bg-red-500 text-white font-medium">Discard & continue</button>
        </div>
      </div>
    </div>
  )
}

function WorkspaceIntroModal({
  onClose,
}: {
  onClose: (dontShowAgain: boolean) => void
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose(dontShowAgain)} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full">
        <h3 className="font-semibold text-[var(--color-text)] mb-2">Welcome to AbraStat</h3>
        <div className="space-y-4 text-sm text-[var(--color-muted)]">
          <div>
            <div className="font-semibold text-[var(--color-text)] mb-1">Library</div>
            <p>Browse public datasets, open your own saved datasets, and launch games or applets.</p>
          </div>
          <div>
            <div className="font-semibold text-[var(--color-text)] mb-1">Lab</div>
            <p>Upload or build a dataset, add cards, make graphs, run statistics, and explore data interactively.</p>
          </div>
        </div>
        <label className="mt-5 flex items-center gap-2 text-sm text-[var(--color-muted)] select-none">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={e => setDontShowAgain(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
          />
          <span>Don’t show again</span>
        </label>
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => onClose(dontShowAgain)}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium hover:brightness-105"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function WorkspaceContent() {
  const searchParams = useSearchParams()
  const initialMode = searchParams.get('mode') === 'library' ? 'library' : 'lab'
  const initialLibrarySection = (() => {
    const section = searchParams.get('section')
    return section === 'all' || section === 'mine' || section === 'games' || section === 'applets' || section === 'polls'
      ? section
      : 'all'
  })()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const [shareDatasetId, setShareDatasetId] = useState<string | null>(null)
  const [shareIsPublic, setShareIsPublic] = useState(false)
  const [mode, setMode] = useState<WorkspaceMode>(initialMode)
  const [librarySection, setLibrarySection] = useState<LibrarySection>(initialLibrarySection)
  const [gameChrome, setGameChrome] = useState<{ title: string; onBack: () => void } | null>(null)
  const { isDirty, clearGrid, activeDatasetId, activeDatasetName, addExploreCard, exploreCards, setGrid, setActiveDatasetId, setActiveDatasetName } = useStore()
  const hasOnlyDataGrid = exploreCards.every(card => card.config.type === 'data-grid')
  const { user } = useAuth()
  const showPuzzleWeek = canAccessPuzzleWeek(user)
  const libraryItems: { id: LibrarySection; label: string; soon?: boolean }[] = showPuzzleWeek
    ? [...BASE_LIBRARY_ITEMS, { id: 'logic-puzzles', label: 'Logic Puzzles' }]
    : BASE_LIBRARY_ITEMS

  useEffect(() => {
    if (librarySection === 'logic-puzzles' && !showPuzzleWeek) {
      setLibrarySection('all')
    }
  }, [librarySection, showPuzzleWeek])

  useEffect(() => {
    if (mode === 'library' && librarySection === 'logic-puzzles' && showPuzzleWeek) {
      window.location.href = LOGIC_PUZZLES_URL
    }
  }, [librarySection, mode, showPuzzleWeek])

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    try {
      if (window.localStorage.getItem(WORKSPACE_INTRO_DISMISSED_KEY) !== 'true') {
        setShowIntro(true)
      }
    } catch {
      setShowIntro(true)
    }
  }, [])

  function handleCloseIntro(dontShowAgain: boolean) {
    if (dontShowAgain) {
      try {
        window.localStorage.setItem(WORKSPACE_INTRO_DISMISSED_KEY, 'true')
      } catch {
        // ignore localStorage failures
      }
    }
    setShowIntro(false)
  }

  function handleNewDataset() {
    if (isDirty) {
      setConfirmNew(true)
      return
    }
    clearGrid()
    setMode('lab')
  }

  function handleModeChange(nextMode: string) {
    const resolvedMode = nextMode === 'library' ? 'library' : 'lab'
    if (resolvedMode !== 'library') {
      setGameChrome(null)
    }
    setMode(resolvedMode)
    setSidebarOpen(false)
  }

  function handleLibrarySectionChange(nextSection: LibrarySection) {
    if (nextSection === 'logic-puzzles') {
      window.location.href = LOGIC_PUZZLES_URL
      return
    }
    setLibrarySection(nextSection)
  }

  function handleSaveClick() {
    setShowSave(true)
  }

  function handleShareClick() {
    if (activeDatasetId) {
      setShareDatasetId(activeDatasetId)
      setShareIsPublic(false)
      setShowShare(true)
    } else {
      setShowSave(true)
    }
  }

  function handleSaved(id: string, isPublic: boolean) {
    setShareDatasetId(id)
    setShareIsPublic(isPublic)
    setShowShare(true)
    if (isPublic) {
      invalidatePublicDatasetCache()
      void loadDataset(id).then(({ meta }) => {
        upsertCachedPublicDataset(meta)
      }).catch(() => {
        // Ignore cache warm failures.
      })
    }
  }

  async function handleOpenDataset(id: string) {
    if (id.startsWith('sample:')) {
      const sample = getSampleDatasetById(id)
      if (!sample) return
      setGrid(sample.grid)
      setActiveDatasetId(null)
      setActiveDatasetName(sample.name)
      setMode('lab')
      setSidebarOpen(false)
      return
    }

    try {
      const { meta, grid } = await loadDataset(id)
      setGrid(grid)
      setActiveDatasetId(id)
      setActiveDatasetName(meta.name)
      setMode('lab')
      setSidebarOpen(false)
    } catch {
      alert('Could not load this dataset.')
    }
  }

  async function handleExportDataset(dataset: DatasetMeta, format: 'csv' | 'xlsx') {
    try {
      if (dataset.id.startsWith('sample:')) {
        const sample = getSampleDatasetById(dataset.id)
        if (!sample) throw new Error('Sample dataset not found.')
        if (format === 'csv') exportGridAsCsv(sample.grid, sample.name)
        else await exportGridAsXlsx(sample.grid, sample.name)
        return
      }

      const { grid, meta } = await loadDataset(dataset.id)
      if (format === 'csv') exportGridAsCsv(grid, meta.name)
      else await exportGridAsXlsx(grid, meta.name)
    } catch {
      alert('Could not export this dataset.')
    }
  }

  function renderLibraryContent() {
    if (librarySection === 'all' || librarySection === 'mine') {
      return (
        <DatasetsBrowser
          scope={librarySection}
          onOpenDataset={handleOpenDataset}
          onExportDataset={handleExportDataset}
        />
      )
    }
    if (librarySection === 'games') {
      return <GameHub onChromeChange={setGameChrome} />
    }
    if (librarySection === 'applets') {
      return <AppletsBrowser />
    }
    return <PollsPlaceholder />
  }

  const libraryHeaderActions = mode === 'library' && (librarySection === 'all' || librarySection === 'mine')
    ? (
      <div className="flex items-center gap-2">
        <button
          onClick={handleNewDataset}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:brightness-105 transition-all"
        >
          + New Dataset
        </button>
      </div>
    )
    : undefined

  return (
    <div className="flex flex-col h-screen">
      <Header
        onNew={mode === 'lab' ? handleNewDataset : undefined}
        onSave={mode === 'lab' ? handleSaveClick : undefined}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        datasetName={mode === 'lab' ? activeDatasetName : undefined}
        centerTitle={mode === 'library' && librarySection === 'games' ? gameChrome?.title ?? null : null}
        leadingNav={
          mode === 'library' && librarySection === 'games' && gameChrome
            ? (
              <button
                onClick={gameChrome.onBack}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-slate-100 transition-colors"
              >
                Back
              </button>
            )
            : undefined
        }
        modeTabs={[
          { id: 'library', label: 'Library' },
          { id: 'lab', label: 'Lab' },
        ]}
        activeModeId={mode}
        onModeChange={handleModeChange}
        labActions={mode === 'lab' ? <GroupedAddCardMenu onAdd={type => addExploreCard(type)} highlight={hasOnlyDataGrid} /> : libraryHeaderActions}
        showSave={mode === 'lab'}
        showHomeLink={false}
      />

      <div className="flex flex-1 min-h-0">
        {mode === 'lab' ? (
          <VariableSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        ) : (
          <LibrarySidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            section={librarySection}
            items={libraryItems}
            onSectionChange={handleLibrarySectionChange}
          />
        )}

        <div className={`flex-1 min-h-0 flex flex-col bg-[var(--color-bg)] ${mode === 'lab' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {mode === 'lab' ? (
            <ExploreCanvas onShareDataset={handleShareClick} />
          ) : (
            renderLibraryContent()
          )}
        </div>
      </div>

      {confirmNew && (
        <UnsavedGuard
          onConfirm={() => { clearGrid(); setConfirmNew(false); setMode('lab') }}
          onCancel={() => setConfirmNew(false)}
        />
      )}

      {showIntro && <WorkspaceIntroModal onClose={handleCloseIntro} />}

      <SaveDatasetModal open={showSave} onClose={() => setShowSave(false)} onSaved={handleSaved} />
      {shareDatasetId && (
        <ShareDatasetModal
          open={showShare}
          onClose={() => setShowShare(false)}
          datasetId={shareDatasetId}
          initialIsPublic={shareIsPublic}
          onVisibilityChange={(datasetId, isPublic) => {
            setShareIsPublic(isPublic)
            invalidatePublicDatasetCache()
            if (!isPublic) return
            void loadDataset(datasetId).then(({ meta }) => {
              upsertCachedPublicDataset(meta)
            }).catch(() => {
              // Ignore cache warm failures.
            })
          }}
        />
      )}
    </div>
  )
}

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <WorkspaceContent />
    </ProtectedRoute>
  )
}
