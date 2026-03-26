'use client'

import { useState } from 'react'
import { Plus, Columns, Upload, FunctionSquare } from 'lucide-react'
import { useStore } from '@/lib/store'
import { ImportPanel } from '@/components/import/ImportPanel'
import { ComputedColumnModal } from './ComputedColumnModal'

export function GridToolbar() {
  const { grid, addRow, addColumn } = useStore()
  const [showImport, setShowImport] = useState(false)
  const [showComputed, setShowComputed] = useState(false)

  const rowCount = grid.rows.filter(r => Object.values(r).some(v => String(v).trim())).length
  const colCount = grid.columns.length

  return (
    <>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => addRow()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <Plus size={14} /> Row
          </button>
          <button
            onClick={() => addColumn()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <Columns size={14} /> New Variable
          </button>
          <button
            onClick={() => setShowComputed(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <FunctionSquare size={14} /> Compute
          </button>
        </div>

        <div className="w-px h-4 bg-[var(--color-border)] mx-1" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
          >
            <Upload size={14} /> Import
          </button>
        </div>

        <div className="ml-auto text-xs text-[var(--color-muted)]">
          {rowCount} rows × {colCount} cols
        </div>
      </div>

      <ImportPanel open={showImport} onClose={() => setShowImport(false)} />
      <ComputedColumnModal open={showComputed} onClose={() => setShowComputed(false)} />
    </>
  )
}
