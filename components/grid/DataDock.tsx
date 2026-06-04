'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Columns, ArrowDownToLine, Database, Share2, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useStore } from '@/lib/store'
import { DataGrid } from './DataGrid'
import { ImportPanel } from '@/components/import/ImportPanel'
import { DataOperationsModal } from './DataOperationsModal'
import { useAuth } from '@/components/auth/AuthProvider'

const COLLAPSED_KEY = 'abrastat.dock.collapsed'
const HEIGHT_KEY = 'abrastat.dock.height'
const DEFAULT_HEIGHT = 340
const MIN_HEIGHT = 120

export function DataDock({ onShare }: { onShare?: () => void }) {
  const { addRow, addColumn, activeFilters, setRowFilters, grid, activeDatasetName } = useStore()
  const { isGuest } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [showImport, setShowImport] = useState(false)
  const [showData, setShowData] = useState(false)
  const heightRef = useRef(DEFAULT_HEIGHT)

  useEffect(() => {
    const storedCollapsed = localStorage.getItem(COLLAPSED_KEY)
    if (storedCollapsed !== null) setCollapsed(storedCollapsed === 'true')
    const storedHeight = localStorage.getItem(HEIGHT_KEY)
    if (storedHeight !== null) {
      const h = Number(storedHeight)
      setHeight(h)
      heightRef.current = h
    } else {
      const h = Math.max(MIN_HEIGHT, Math.min(window.innerHeight * 0.70, Math.round(window.innerHeight * 0.38)))
      setHeight(h)
      heightRef.current = h
    }
  }, [])

  useEffect(() => { heightRef.current = height }, [height])

  const filledRowCount = grid.rows.filter(row => Object.values(row).some(v => String(v).trim())).length
  const columnCount = grid.columns.length

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, String(next))
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = heightRef.current

    function onMove(ev: PointerEvent) {
      const maxH = window.innerHeight * 0.70
      const next = Math.min(maxH, Math.max(MIN_HEIGHT, startHeight - (ev.clientY - startY)))
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
      className="flex-shrink-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex flex-col"
      style={{
        height: collapsed ? 40 : height,
        boxShadow: '0 -8px 24px -16px rgba(8,38,33,0.25)',
      }}
    >
      {/* Resize handle — drag upward to expand */}
      {!collapsed && (
        <div
          onPointerDown={startResize}
          className="h-1.5 flex-shrink-0 cursor-ns-resize hover:bg-[var(--color-accent-light)] transition-colors"
        />
      )}

      {/* Header bar */}
      <div className="h-10 flex-shrink-0 flex items-center gap-2 px-3 overflow-x-auto">
        <button
          onClick={toggleCollapsed}
          className="flex-shrink-0 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          aria-label={collapsed ? 'Expand data dock' : 'Collapse data dock'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
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
          {filledRowCount} × {columnCount}
        </span>

        <div className="flex-1 min-w-4" />

        <div className="flex-shrink-0 flex items-center gap-0.5 whitespace-nowrap">
          <button
            onClick={() => addRow()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <Plus size={13} /> Row
          </button>
          <button
            onClick={() => addColumn()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <Columns size={13} /> Variable
          </button>
          <button
            onClick={() => setShowData(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <Database size={13} /> Data
          </button>
          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <ArrowDownToLine size={13} /> Import
          </button>
          {!isGuest && onShare && (
            <button
              onClick={onShare}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
            >
              <Share2 size={13} /> Share
            </button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {!collapsed && (
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
