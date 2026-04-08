'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { GridColumn } from '@/types'
import { useStore } from '@/lib/store'
import { RecodeModal } from './RecodeModal'

interface ColumnHeaderProps {
  column: GridColumn
  colIndex: number
  onResizeStart?: (e: React.PointerEvent, colId: string) => void
}

type MenuMode = 'closed' | 'main' | 'sort-asc' | 'sort-desc' | 'delete-confirm'

export function ColumnHeader({ column, colIndex, onResizeStart }: ColumnHeaderProps) {
  const [menuMode, setMenuMode] = useState<MenuMode>('closed')
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(column.name)
  const [zError, setZError] = useState<string | null>(null)
  const [showRecode, setShowRecode] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const { renameColumn, setColumnType, addColumn, deleteColumn, sortRows, addZScoreColumn, selectedColumnIds } = useStore()

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renaming])

  useEffect(() => {
    if (menuMode === 'closed') return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuMode('closed')
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuMode])

  function commitRename() {
    const name = draft.trim()
    if (name && name !== column.name) renameColumn(column.id, name)
    else setDraft(column.name)
    setRenaming(false)
  }

  function handleRightClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuMode('main')
  }

  function handleZScore() {
    const { error } = addZScoreColumn(column.id)
    setMenuMode('closed')
    if (error) {
      setZError(error)
      setTimeout(() => setZError(null), 4000)
    }
  }

  function applySort(direction: 'asc' | 'desc', scope: 'table' | 'column' | 'selected') {
    sortRows(column.id, direction, scope, selectedColumnIds)
    setMenuMode('closed')
  }

  const isNumeric = column.type === 'numeric'

  return (
    <>
      <div
        className="relative flex items-center h-8 px-2 gap-1 bg-[var(--color-grid-header)] text-white text-xs font-medium border-r border-slate-600 select-none"
        onContextMenu={handleRightClick}
      >
        <span className="flex-shrink-0 text-slate-500 opacity-0 group-hover/col:opacity-60 transition-opacity cursor-grab text-[11px] leading-none" aria-hidden>⠿</span>

        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(column.name); setRenaming(false) } }}
            className="flex-1 bg-transparent text-white text-xs outline-none border-b border-white"
          />
        ) : (
          <span
            className="flex-1 truncate cursor-pointer"
            onDoubleClick={() => { setDraft(column.name); setRenaming(true) }}
          >
            {column.name}
          </span>
        )}

        {column.computedFormula ? (
          <span className="text-[10px] px-1 rounded font-bold bg-amber-500 text-white" title={`Computed: ${column.computedFormula}`}>ƒ</span>
        ) : (
          <span
            onClick={() => setColumnType(column.id, isNumeric ? 'categorical' : 'numeric')}
            className={`text-[10px] px-1 rounded cursor-pointer font-bold ${isNumeric ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-500 text-slate-200'}`}
            title={isNumeric ? 'Numeric — click to toggle' : 'Categorical — click to toggle'}
          >
            {isNumeric ? '#' : 'A'}
          </span>
        )}

        <button
          type="button"
          draggable={false}
          onMouseDown={e => {
            e.stopPropagation()
          }}
          onPointerDown={e => {
            e.stopPropagation()
          }}
          onClick={e => {
            e.stopPropagation()
            if (menuMode === 'closed') {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              setMenuPos({ x: rect.right - 188, y: rect.bottom + 4 })
              setMenuMode('main')
            } else {
              setMenuMode('closed')
            }
          }}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          title="Variable menu"
          aria-label={`Open menu for ${column.name}`}
        >
          <ChevronDown size={12} />
        </button>

        {/* Dropdown menu */}
        {menuMode !== 'closed' && (
          <div
            ref={menuRef}
            className="fixed z-[100] bg-white rounded-lg shadow-lg border border-[var(--color-border)] py-1 text-[var(--color-text)] text-xs"
            style={{ minWidth: 188, left: menuPos?.x ?? 0, top: menuPos?.y ?? 0 }}
          >

            {/* Main menu */}
            {menuMode === 'main' && (
              <>
                <button onClick={() => { setDraft(column.name); setRenaming(true); setMenuMode('closed') }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50">
                  Rename
                </button>
                <div className="h-px bg-[var(--color-border)] my-1" />
                <button onClick={() => setMenuMode('sort-asc')} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between">
                  Sort Ascending <ChevronRight size={12} className="text-slate-400" />
                </button>
                <button onClick={() => setMenuMode('sort-desc')} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between">
                  Sort Descending <ChevronRight size={12} className="text-slate-400" />
                </button>
                {isNumeric && (
                  <>
                    <div className="h-px bg-[var(--color-border)] my-1" />
                    <button onClick={handleZScore} className="w-full text-left px-3 py-1.5 hover:bg-slate-50">
                      Create Z-Score Variable
                    </button>
                    <button onClick={() => { setMenuMode('closed'); setShowRecode(true) }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50">
                      Recode into Categories
                    </button>
                  </>
                )}
                <div className="h-px bg-[var(--color-border)] my-1" />
                <button onClick={() => addColumn(colIndex - 1)} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-[var(--color-muted)]">
                  Insert column left
                </button>
                <button onClick={() => addColumn(colIndex)} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-[var(--color-muted)]">
                  Insert column right
                </button>
                <div className="h-px bg-[var(--color-border)] my-1" />
                <button onClick={() => setMenuMode('delete-confirm')} className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-500">
                  Delete column…
                </button>
              </>
            )}

            {/* Sort scope sub-panel */}
            {(menuMode === 'sort-asc' || menuMode === 'sort-desc') && (
              <>
                <div className="px-3 py-1.5 font-semibold text-[var(--color-muted)] text-[10px] uppercase tracking-wide">
                  {menuMode === 'sort-asc' ? 'Sort Ascending' : 'Sort Descending'}
                </div>
                <button onClick={() => applySort(menuMode === 'sort-asc' ? 'asc' : 'desc', 'table')} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-accent)]" />
                  <span>
                    <span className="font-medium block">Entire Table</span>
                    <span className="text-[var(--color-muted)] text-[10px]">Recommended — sorts all rows together</span>
                  </span>
                </button>
                {selectedColumnIds.length > 0 && (
                  <button onClick={() => applySort(menuMode === 'sort-asc' ? 'asc' : 'desc', 'selected')} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-start gap-2">
                    <span className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 border-slate-400" />
                    <span>
                      <span className="font-medium block">Selected Columns</span>
                      <span className="text-[var(--color-muted)] text-[10px]">Sorts this + {selectedColumnIds.length} selected column{selectedColumnIds.length !== 1 ? 's' : ''} together</span>
                    </span>
                  </button>
                )}
                <button onClick={() => applySort(menuMode === 'sort-asc' ? 'asc' : 'desc', 'column')} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 border-slate-400" />
                  <span>
                    <span className="font-medium block">This Column Only</span>
                    <span className="text-[var(--color-muted)] text-[10px]">⚠️ Detaches values from other columns</span>
                  </span>
                </button>
                <div className="h-px bg-[var(--color-border)] my-1" />
                <button onClick={() => setMenuMode('main')} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-[var(--color-muted)]">
                  ← Back
                </button>
              </>
            )}

            {/* Delete confirm sub-panel */}
            {menuMode === 'delete-confirm' && (
              <div className="px-3 py-2">
                <p className="font-medium text-[var(--color-text)] mb-1">Delete &ldquo;{column.name}&rdquo;?</p>
                <p className="text-[var(--color-muted)] text-[10px] mb-3 leading-relaxed">
                  This will permanently remove the column and all its data. Any Lab cards using this variable will lose their binding.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMenuMode('main')}
                    className="flex-1 px-2 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-slate-50 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { deleteColumn(column.id); setMenuMode('closed') }}
                    className="flex-1 px-2 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 text-xs font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Z-score error toast */}
        {zError && (
          <div className="absolute top-full left-0 z-50 mt-1 w-56 bg-red-600 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg">
            {zError}
          </div>
        )}

        {/* Resize handle */}
        <div
          onPointerDown={e => { e.stopPropagation(); onResizeStart?.(e, column.id) }}
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize opacity-0 hover:opacity-100 group-hover/col:opacity-100 transition-opacity"
          title="Resize column"
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-white/70" />
        </div>
      </div>

      {showRecode && (
        <RecodeModal column={column} onClose={() => setShowRecode(false)} />
      )}
    </>
  )
}
