'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowDownToLine, Database, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useStore } from '@/lib/store'
import { DataGrid } from './DataGrid'
import { ImportPanel } from '@/components/import/ImportPanel'
import { DataOperationsModal } from './DataOperationsModal'

export type DockState = 'collapsed' | 'half' | 'full'

const HEAD = 42
const STATE_KEY = 'abrastat.dock.state'
const HEIGHT_KEY = 'abrastat.dock.height'

export function computeSnaps() {
  const avail = window.innerHeight - 72
  return {
    collapsed: HEAD,
    half: Math.round(avail * 0.46),
    full: avail,
  }
}

interface DataDockProps {
  state: DockState
  setState: (s: DockState) => void
  height: number
  setHeight: (h: number) => void
  upperRef?: React.RefObject<HTMLDivElement | null>
}

export function DataDock({ state, setState, height, setHeight, upperRef }: DataDockProps) {
  const { activeFilters, setRowFilters, grid, activeDatasetName } = useStore()
  const [showImport, setShowImport] = useState(false)
  const [showData, setShowData] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [gripHover, setGripHover] = useState(false)

  const dockRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)
  const heightRef = useRef(height)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { heightRef.current = height }, [height])

  const filledRowCount = grid.rows.filter(row => Object.values(row).some(v => String(v).trim())).length
  const columnCount = grid.columns.length

  const applyState = useCallback((st: DockState, animate = true) => {
    const snaps = computeSnaps()
    const h = snaps[st]
    const dockEl = dockRef.current
    const upperEl = upperRef?.current

    if (dockEl) {
      if (animate) dockEl.style.transition = 'height 220ms cubic-bezier(0.4, 0, 0.2, 1)'
      dockEl.style.height = h + 'px'
    }
    if (upperEl) {
      upperEl.style.display = st === 'full' ? 'none' : ''
    }

    setState(st)
    setHeight(h)
    localStorage.setItem(STATE_KEY, st)
    if (st === 'half') localStorage.setItem(HEIGHT_KEY, String(h))
  }, [setState, setHeight, upperRef])

  // Window resize: recompute snaps, re-apply current state
  useEffect(() => {
    function onResize() {
      applyState(stateRef.current, false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [applyState])

  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    const dockEl = dockRef.current
    if (!dockEl) return
    const el = dockEl
    setIsDragging(true)
    el.style.transition = 'none'

    const startY = e.clientY
    const startH = heightRef.current

    function onMove(ev: PointerEvent) {
      const snaps = computeSnaps()
      let h = Math.min(snaps.full, Math.max(HEAD, startH - (ev.clientY - startY)))

      // Magnetism: snap points within 26px attract the handle
      for (const pt of [snaps.collapsed, snaps.half, snaps.full]) {
        if (Math.abs(h - pt) < 26) {
          h = pt + (h - pt) * 0.25
        }
      }

      el.style.height = h + 'px'
      heightRef.current = h

      // Live-hide/show upper region when near full
      const upperEl = upperRef?.current
      if (upperEl) {
        upperEl.style.display = h >= snaps.full - 4 ? 'none' : ''
      }
    }

    function onUp() {
      setIsDragging(false)
      const snaps = computeSnaps()
      const h = heightRef.current
      const pts: DockState[] = ['collapsed', 'half', 'full']
      const best = pts.reduce<DockState>((prev, cur) =>
        Math.abs(snaps[cur] - h) < Math.abs(snaps[prev] - h) ? cur : prev
      , 'collapsed')
      applyState(best)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function handleDoubleClick() {
    const cycle: DockState[] = ['collapsed', 'half', 'full']
    const idx = cycle.indexOf(state)
    applyState(cycle[(idx + 1) % 3])
  }

  const gripWidth = isDragging ? 72 : gripHover ? 60 : 46
  const gripBg = isDragging || gripHover ? 'var(--color-accent)' : 'var(--color-border)'

  return (
    <div
      ref={dockRef}
      className="flex-shrink-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex flex-col relative"
      style={{
        height,
        boxShadow: '0 -8px 24px -16px rgba(8,38,33,0.25)',
        transition: isDragging ? 'none' : 'height 220ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Grab handle — straddles the top edge */}
      <div
        onPointerDown={startDrag}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setGripHover(true)}
        onMouseLeave={() => setGripHover(false)}
        className="absolute left-0 right-0 flex items-center justify-center cursor-ns-resize z-[5]"
        style={{ top: 0, height: 14, transform: 'translateY(-50%)' }}
      >
        <div
          style={{
            width: gripWidth,
            height: 4,
            borderRadius: 2,
            backgroundColor: gripBg,
            transition: isDragging ? 'none' : 'width 120ms ease, background-color 120ms ease',
          }}
        />
      </div>

      {/* Header bar — always visible */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 overflow-x-auto" style={{ height: HEAD }}>
        <button
          onClick={() => applyState(state === 'collapsed' ? 'half' : 'collapsed')}
          className="flex-shrink-0 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          aria-label={state === 'collapsed' ? 'Expand data dock' : 'Collapse data dock'}
        >
          {state === 'collapsed' ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
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
      {state !== 'collapsed' && (
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
