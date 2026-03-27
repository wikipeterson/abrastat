'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Header } from '@/components/layout/Header'
import { DataGrid } from '@/components/grid/DataGrid'
import { GridToolbar } from '@/components/grid/GridToolbar'
import { ExploreCanvas } from '@/components/explore/ExploreCanvas'
import { GameHub } from '@/components/games/GameHub'
import { useStore } from '@/lib/store'

type Tab = 'data' | 'explore' | 'more'

function ColumnSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { grid, selectedColumnIds, toggleColumnSelection } = useStore()

  return (
    <>
      {/* Mobile overlay */}
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
          <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Variables</span>
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
                  // Directly manipulate DOM style — more reliable than React state
                  // during a drag (avoids re-render timing issues with drag ghost capture)
                  const el = e.currentTarget as HTMLElement
                  window.setTimeout(() => { el.style.opacity = '0.25' }, 0)
                }}
                onDragEnd={e => {
                  (e.currentTarget as HTMLElement).style.opacity = ''
                }}
                onClick={() => toggleColumnSelection(col.id)}
                title="Drag to Statistics or Charts · click to select for stats"
                className={`
                  flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium
                  cursor-grab active:cursor-grabbing select-none transition-colors
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

function WorkspaceTabs({ active, onChange, onToggleSidebar, datasetName }: { active: Tab; onChange: (t: Tab) => void; onToggleSidebar: () => void; datasetName: string }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'data',    label: 'Data'    },
    { id: 'explore', label: 'Explore' },
    { id: 'more',    label: 'More'    },
  ]
  return (
    <div className="flex items-center border-b border-[var(--color-border)] bg-white flex-shrink-0">
      {active !== 'explore' && (
        <button
          onClick={onToggleSidebar}
          className="md:hidden px-3 py-3 text-[var(--color-muted)] hover:text-[var(--color-text)]"
          aria-label="Toggle column sidebar"
        >
          ☰
        </button>
      )}
      {datasetName && (
        <span className="font-display italic font-semibold text-[var(--color-text)] px-3 pr-4 border-r border-[var(--color-border)] mr-1 text-sm hidden sm:block">
          {datasetName}
        </span>
      )}
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${active === t.id ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
        >
          {t.label}
        </button>
      ))}
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

function WorkspaceContent() {
  const [tab, setTab] = useState<Tab>('data')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const { isDirty, clearGrid, activeDatasetName } = useStore()

  // Warn on browser back/refresh
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

  return (
    <div className="flex flex-col h-screen">
      <Header onNew={handleNewDataset} />
      <div className="flex flex-1 min-h-0">
        {tab !== 'explore' && (
          <ColumnSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}
        <div className="flex-1 flex flex-col min-h-0">
          <WorkspaceTabs
            active={tab}
            onChange={setTab}
            onToggleSidebar={() => setSidebarOpen(v => !v)}
            datasetName={activeDatasetName}
          />
          {tab === 'data' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <GridToolbar />
              <div className="flex-1 overflow-auto p-2">
                <DataGrid />
              </div>
            </div>
          )}
          {tab === 'explore' && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <ExploreCanvas />
            </div>
          )}
          {tab === 'more' && (
            <div className="flex-1 overflow-auto bg-[var(--color-bg)]">
              <GameHub />
            </div>
          )}
        </div>
      </div>

      {confirmNew && (
        <UnsavedGuard
          onConfirm={() => { clearGrid(); setConfirmNew(false) }}
          onCancel={() => setConfirmNew(false)}
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
