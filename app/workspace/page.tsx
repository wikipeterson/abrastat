'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Header } from '@/components/layout/Header'
import { ExploreCanvas } from '@/components/explore/ExploreCanvas'
import { SaveDatasetModal } from '@/components/library/SaveDatasetModal'
import { ShareDatasetModal } from '@/components/library/ShareDatasetModal'
import { useStore } from '@/lib/store'
import { CardConfig } from '@/lib/exploreTypes'

// ─── Card option definitions ──────────────────────────────────────────────────

interface CardOption {
  type: CardConfig['type']
  icon: string
  label: string
}

const EXPLORE_CARD_OPTIONS: CardOption[] = [
  { type: 'graph',      icon: '📈', label: 'Graph' },
  { type: 'summary',    icon: '📊', label: 'Summary Statistics' },
  { type: 'table',      icon: '⊞',  label: 'Two-Way Table' },
  { type: 'regression', icon: '📉', label: 'Regression' },
]

const PROBABILITY_CARD_OPTIONS: CardOption[] = [
  { type: 'distribution', icon: '🔔', label: 'Distribution' },
  { type: 'generator',    icon: '🎛️', label: 'Random Generator' },
  { type: 'dice-roller',  icon: '🎲', label: 'Dice Roller' },
  { type: 'simulation',   icon: '🔀', label: 'Simulation' },
]

const INFERENCE_CARD_OPTIONS: CardOption[] = [
  { type: 'means',        icon: '📐', label: 'Means' },
  { type: 'testinterval', icon: '⚖️',  label: 'Test / Interval' },
]

// ─── Grouped Add Card menu ────────────────────────────────────────────────────

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
          <div className="absolute right-0 top-full mt-2 z-[70] bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden min-w-[260px]">
            {groups.map(group => (
              <div key={group.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {group.label}
                </div>
                <div className="pb-2">
                  {group.options.map(o => (
                    <button
                      key={o.type}
                      onClick={() => { onAdd(o.type); setOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
                    >
                      <span className="text-base leading-none">{o.icon}</span>
                      <span className="text-sm font-medium text-[var(--color-text)]">{o.label}</span>
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

// ─── Column sidebar ────────────────────────────────────────────────────────────

function ColumnSidebar({
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
        md:relative md:w-48 md:translate-x-0 md:z-auto
        fixed inset-y-0 left-0 z-30 w-56 transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Variables</div>
          </div>
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
                className={`
                  flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium
                  cursor-pointer select-none transition-colors
                  ${isSelected
                    ? isNumeric
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-slate-600 text-white'
                    : isNumeric
                      ? 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
                      : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                  }
                `}
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

// ─── Unsaved changes guard ─────────────────────────────────────────────────────

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

// ─── Main workspace ───────────────────────────────────────────────────────────

function WorkspaceContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareDatasetId, setShareDatasetId] = useState<string | null>(null)
  const [shareIsPublic, setShareIsPublic] = useState(false)
  const { isDirty, clearGrid, activeDatasetId, activeDatasetName, addExploreCard, exploreCards } = useStore()
  const hasOnlyDataGrid = exploreCards.every(card => card.config.type === 'data-grid')

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

  function handleNewDataset() {
    if (isDirty) {
      setConfirmNew(true)
    } else {
      clearGrid()
    }
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
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        onNew={handleNewDataset}
        onSave={handleSaveClick}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        datasetName={activeDatasetName}
        labActions={<GroupedAddCardMenu onAdd={type => addExploreCard(type)} highlight={hasOnlyDataGrid} />}
      />

      <div className="flex flex-1 min-h-0">
        <ColumnSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <ExploreCanvas onShareDataset={handleShareClick} />
        </div>
      </div>

      {confirmNew && (
        <UnsavedGuard
          onConfirm={() => { clearGrid(); setConfirmNew(false) }}
          onCancel={() => setConfirmNew(false)}
        />
      )}

      <SaveDatasetModal open={showSave} onClose={() => setShowSave(false)} onSaved={handleSaved} />
      {shareDatasetId && (
        <ShareDatasetModal
          open={showShare}
          onClose={() => setShowShare(false)}
          datasetId={shareDatasetId}
          initialIsPublic={shareIsPublic}
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
