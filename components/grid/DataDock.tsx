'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowDownToLine, Database, X, ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { DataGrid } from './DataGrid'
import { ImportPanel } from '@/components/import/ImportPanel'
import { DataOperationsModal } from './DataOperationsModal'

export type DockState = 'collapsed' | 'default' | 'maximized'

const HEIGHT_KEY = 'abrastat.dock.height'
const MIN_HEIGHT = 120

interface DataDockProps {
  dockState: DockState
  onStateChange: (s: DockState) => void
}

export function DataDock({ dockState, onStateChange }: DataDockProps) {
  const { activeFilters, setRowFilters, grid, activeDatasetName } = useStore()
  const [savedHeight, setSavedHeight] = useState(340)
  const [isResizing, setIsResizing] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showData, setShowData] = useState(false)
  const savedHeightRef = useRef(340)
  // remembers which expanded state to restore to when un-collapsing
  const prevExpandedRef = useRef<'default' | 'maximized'>('default')

  useEffect(() => {
    const stored = localStorage.getItem(HEIGHT_KEY)
    if (stored !== null) {
      const h = Number(stored)
      setSavedHeight(h)
      savedHeightRef.current = h
    } else {
      const h = Math.max(MIN_HEIGHT, Math.round((window.innerHeight - 72) * 0.4))
      setSavedHeight(h)
      savedHeightRef.current = h
    }
  }, [])

  useEffect(() => { savedHeightRef.current = savedHeight }, [savedHeight])

  // Track the last non-collapsed state so the chevron can restore correctly
  useEffect(() => {
    if (dockState !== 'collapsed') prevExpandedRef.current = dockState
  }, [dockState])

  const filledRowCount = grid.rows.filter(row => Object.values(row).some(v => String(v).trim())).length
  const columnCount = grid.columns.length

  function getDockHeight(): number | string {
    if (dockState === 'collapsed') return 40
    if (dockState === 'maximized') return 'calc(100vh - 4.5rem)'
    return savedHeight
  }

  function toggleCollapsed() {
    if (dockState === 'collapsed') {
      onStateChange(prevExpandedRef.current)
    } else {
      onStateChange('collapsed')
    }
  }

  function toggleMaximized() {
    if (dockState === 'maximized') {
      onStateChange('default')
    } else if (dockState === 'default') {
      onStateChange('maximized')
    }
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startH = savedHeightRef.current
    const maxH = window.innerHeight - 72

    function onMove(ev: PointerEvent) {
      const next = Math.min(maxH, Math.max(MIN_HEIGHT, startH - (ev.clientY - startY)))
      savedHeightRef.current = next
      setSavedHeight(next)
    }

    function onUp() {
      setIsResizing(false)
      localStorage.setItem(HEIGHT_KEY, String(savedHeightRef.current))
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className="flex-shrink-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex flex-col"
      style={{
        height: getDockHeight(),
        boxShadow: '0 -8px 24px -16px rgba(8,38,33,0.25)',
        transition: isResizing ? 'none' : 'height 220ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Resize handle — only active in default state; double-click toggles maximized */}
      <div
        onPointerDown={dockState === 'default' ? startResize : undefined}
        onDoubleClick={dockState !== 'collapsed' ? toggleMaximized : undefined}
        className={`h-1.5 flex-shrink-0 transition-colors ${
          dockState === 'default'
            ? 'cursor-ns-resize hover:bg-[var(--color-accent-light)]'
            : 'cursor-default'
        }`}
      />

      {/* Header bar — always visible */}
      <div className="h-10 flex-shrink-0 flex items-center gap-2 px-3 overflow-x-auto">
        {/* Left group */}
        <button
          onClick={toggleCollapsed}
          className="flex-shrink-0 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          aria-label={dockState === 'collapsed' ? 'Expand data dock' : 'Collapse data dock'}
        >
          {dockState === 'collapsed' ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-widest bg-[var(--color-grid-header)] text-white">
          DATA
        </span>

        {activeDatasetName && (
          <span className="text-sm font-medium text-[var(--color-text)] truncate max-w-[200px]">
            {activeDatasetName}
          </span>
        )}

        <span className="flex-shrink-0 text-xs text-[var(--color-muted)] whitespace-nowrap">
          {columnCount} variable{columnCount === 1 ? '' : 's'}, {filledRowCount} case{filledRowCount === 1 ? '' : 's'}
        </span>

        <div className="flex-1 min-w-4" />

        {/* Right group */}
        {dockState !== 'collapsed' && (
          <button
            onClick={toggleMaximized}
            className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-slate-100 transition-colors flex-shrink-0"
            aria-label={dockState === 'maximized' ? 'Restore dock' : 'Maximize dock'}
          >
            {dockState === 'maximized' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}

        <button
          onClick={() => setShowData(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors flex-shrink-0"
        >
          <Database size={13} /> Transform
        </button>

        <div className="w-px h-4 bg-[var(--color-border)] flex-shrink-0" />

        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors flex-shrink-0"
        >
          <ArrowDownToLine size={13} /> Import
        </button>
      </div>

      {/* Grid body */}
      {dockState !== 'collapsed' && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap border-b border-[var(--color-border)]">
              <span className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mr-0.5">Filters:</span>
              {activeFilters.map(f => {
                const label = f.op === 'between'
                  ? `${f.colName} between ${f.value} and ${f.value2 ?? '?'}`
                  : `${f.colName} ${f.op} ${f.value}`
                return (
                  <span
                    key={f.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-accent)]/30"
                  >
                    {label}
                    <button
                      onClick={() => setRowFilters(activeFilters.filter(x => x.id !== f.id))}
                      className="hover:text-teal-800 ml-0.5"
                      aria-label="Remove filter"
                    >
                      <X size={10} />
                    </button>
                  </span>
                )
              })}
              <button onClick={() => setRowFilters([])} className="text-[11px] text-[var(--color-muted)] hover:text-red-500 ml-1">
                Clear all
              </button>
              <button onClick={() => setShowData(true)} className="text-[11px] text-[var(--color-accent)] hover:underline ml-1">
                Edit filters
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <DataGrid fillHeight />
          </div>
        </div>
      )}

      <ImportPanel open={showImport} onClose={() => setShowImport(false)} />
      <DataOperationsModal
        open={showData}
        onClose={() => setShowData(false)}
        defaultSection={activeFilters.length > 0 ? 'filter' : 'computed'}
      />
    </div>
  )
}
