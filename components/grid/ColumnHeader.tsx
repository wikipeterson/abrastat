'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { GridColumn } from '@/types'
import { useStore } from '@/lib/store'

interface ColumnHeaderProps {
  column: GridColumn
  colIndex: number
}

export function ColumnHeader({ column, colIndex }: ColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(column.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const { renameColumn, setColumnType, addColumn, deleteColumn } = useStore()

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renaming])

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  function commitRename() {
    const name = draft.trim()
    if (name && name !== column.name) renameColumn(column.id, name)
    else setDraft(column.name)
    setRenaming(false)
  }

  const isNumeric = column.type === 'numeric'

  return (
    <div className="relative flex items-center h-8 px-2 gap-1 bg-[var(--color-grid-header)] text-white text-xs font-medium border-r border-slate-600 select-none">
      {/* Drag-to-reorder grip — visual affordance only; drag is handled by the DataGrid wrapper */}
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
          onClick={() => { setDraft(column.name); setRenaming(true) }}
        >
          {column.name}
        </span>
      )}

      {column.computedFormula ? (
        <span
          className="text-[10px] px-1 rounded font-bold bg-amber-500 text-white"
          title={`Computed: ${column.computedFormula}`}
        >
          ƒ
        </span>
      ) : (
        <span
          onClick={() => setColumnType(column.id, isNumeric ? 'categorical' : 'numeric')}
          className={`text-[10px] px-1 rounded cursor-pointer font-bold ${isNumeric ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-500 text-slate-200'}`}
          title={isNumeric ? 'Numeric — click to toggle' : 'Categorical — click to toggle'}
        >
          {isNumeric ? '#' : 'A'}
        </span>
      )}

      <button onClick={() => setMenuOpen(v => !v)} className="opacity-60 hover:opacity-100">
        <ChevronDown size={12} />
      </button>

      {menuOpen && (
        <div ref={menuRef} className="absolute top-full left-0 z-50 mt-0.5 w-44 bg-white rounded-lg shadow-lg border border-[var(--color-border)] py-1 text-[var(--color-text)] text-xs">
          {[
            { label: 'Rename', action: () => { setDraft(column.name); setRenaming(true) } },
            { label: 'Insert column left', action: () => addColumn(colIndex - 1) },
            { label: 'Insert column right', action: () => addColumn(colIndex) },
            { label: 'Delete column', action: () => deleteColumn(column.id), danger: true },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => { item.action(); setMenuOpen(false) }}
              className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${item.danger ? 'text-red-500' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
