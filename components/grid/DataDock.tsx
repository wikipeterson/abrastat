'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowDownToLine, Database, X, ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { DataGrid } from './DataGrid'
import { ImportPanel } from '@/components/import/ImportPanel'
import { DataOperationsModal } from './DataOperationsModal'

const STATE_KEY = 'abrastat.dock.state'
const HEIGHT_KEY = 'abrastat.dock.height'
const DEFAULT_HEIGHT = 340
const MIN_HEIGHT = 120

type DockState = 'collapsed' | 'default' | 'maximized'

export function DataDock() {
  const { activeFilters, setRowFilters, grid, activeDatasetName, exploreCards } = useStore()
  const [dockState, setDockState] = useState<DockState>('default')
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [showImport, setShowImport] = useState(false)
  const [showData, setShowData] = useState(false)
  const heightRef = useRef(DEFAULT_HEIGHT)
  const prevExpandedRef = useRef<'default' | 'maximized'>('default')
  const prevCardCountRef = useRef<number | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)

  const nonDataGridCards = exploreCards.filter(c => c.config.type !== 'data-grid')

  // Initialize from localStorage; start maximized when no cards exist
  useEffect(() => {
    const storedHeight = localStorage.getItem(HEIGHT_KEY)
    if (storedHeight !== null) {
      const h = Number(storedHeight)
      setHeight(h)
      heightRef.current = h
    } else {
      const h = Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.38))
      setHeight(h)
      heightRef.current = h
    }

    const storedState = localStorage.getItem(STATE_KEY) as DockState | null
    if (storedState === 'collapsed' || storedState === 'default' || storedState === 'maximized') {
      setDockState(storedState)
      if (storedState !== 'collapsed') prevExpandedRef.current = storedState
    } else if (nonDataGridCards.length === 0) {
      setDockState('maximized')
      prevExpandedRef.current = 'maximized'
    }

    prevCardCountRef.current = nonDataGridCards.length
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 0 → 1 card: drop dock to default so the new card is visible
  useEffect(() => {
    if (prevCardCountRef.current === null) {
      prevCardCountRef.current = nonDataGridCards.length
      return
    }
    const prev = prevCardCountRef.current
    const curr = nonDataGridCards.length
    prevCardCountRef.current = curr
    if (prev === 0 && curr === 1) {
      setDockState('default')
      prevExpandedRef.current = 'default'
      localStorage.setItem(STATE_KEY, 'default')
    }
  }, [nonDataGridCards.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { heightRef.current = height }, [height])

  const filledRowCount = grid.rows.filter(row => Object.values(row).some(v => String(v).trim())).length
  const columnCount = grid.columns.length

  function getMaxHeight() {
    if (typeof window === 'undefined') return DEFAULT_HEIGHT
    return (dockRef.current?.parentElement?.offsetHeight ?? window.innerHeight) - 72
  }

  function getDisplayHeight() {
    if (dockState === 'collapsed') return 40
    if (dockState === 'maximized') return getMaxHeight()
    return height
  }

  function toggleCollapsed() {
    if (dockState === 'collapsed') {
      const next = prevExpandedRef.current
      setDockState(next)
      localStorage.setItem(STATE_KEY, next)
    } else {
      prevExpandedRef.current = dockState === 'maximized' ? 'maximized' : 'default'
      setDockState('collapsed')
      localStorage.setItem(STATE_KEY, 'collapsed')
    }
  }

  function toggleMaximized() {
    if (dockState === 'maximized') {
      setDockState('default')
      prevExpandedRef.current = 'default'
      localStorage.setItem(STATE_KEY, 'default')
    } else if (dockState === 'default') {
      setDockState('maximized')
      prevExpandedRef.current = 'maximized'
      localStorage.setItem(STATE_KEY, 'maximized')
    }
  }

  function startResize(e: React.PointerEvent) {
    if (dockState !== 'default') return
    e.preventDefault()
    const startY = e.clientY
    const startHeight = heightRef.current

    function onMove(ev: PointerEvent) {
      const next = Math.min(getMaxHeight(), Math.max(MIN_HEIGHT, startHeight - (ev.clientY - startY)))
      heightRef.current = next
      setHeight(next)
    }

    function onUp() {
      localStorage.setItem(HEIGHT_KEY, String(heightRef.current))
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={dockRef}
      className="flex-shrink-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex flex-col"
      style={{
        height: getDisplayHeight(),
        boxShadow: '0 -8px 24px -16px rgba(8,38,33,0.25)',
        transition: 'height 220ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Resize handle — only in default state, double-click to maximize */}
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

        {activeDatasetName ? (
          <span className="text-sm font-medium text-[var(--color-text)] truncate max-w-[200px]">
            {activeDatasetName}
          </span>
        ) : null}

        <span className="flex-shrink-0 text-xs text-[var(--color-muted)] whitespace-nowrap">
          {columnCount} variable{columnCount === 1 ? '' : 's'}, {filledRowCount} case{filledRowCount === 1 ? '' : 's'}
        </span>

        <div className="flex-1 min-w-4" />

        <div className="flex-shrink-0 flex items-center gap-0.5 whitespace-nowrap">
          <button
            onClick={() => setShowData(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <Database size={13} /> Transform
          </button>
          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <ArrowDownToLine size={13} /> Import
          </button>
          {dockState !== 'collapsed' && (
            <button
              onClick={toggleMaximized}
              className="ml-1 p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-slate-100 transition-colors"
              aria-label={dockState === 'maximized' ? 'Restore dock' : 'Maximize dock'}
            >
              {dockState === 'maximized' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded body */}
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
              <button
                onClick={() => setRowFilters([])}
                className="text-[11px] text-[var(--color-muted)] hover:text-red-500 ml-1"
              >
                Clear all
              </button>
              <button
                onClick={() => setShowData(true)}
                className="text-[11px] text-[var(--color-accent)] hover:underline ml-1"
              >
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
