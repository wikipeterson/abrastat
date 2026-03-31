'use client'

import { useState } from 'react'
import { Plus, Columns, ArrowDownToLine, FunctionSquare, Share2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { ImportPanel } from '@/components/import/ImportPanel'
import { ComputedColumnModal } from './ComputedColumnModal'
import { useAuth } from '@/components/auth/AuthProvider'

export function GridToolbar({ onShare }: { onShare?: () => void }) {
  const { addRow, addColumn } = useStore()
  const { isGuest } = useAuth()
  const [showImport, setShowImport] = useState(false)
  const [showComputed, setShowComputed] = useState(false)

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
            <ArrowDownToLine size={14} /> Import
          </button>
          {!isGuest && onShare && (
            <button
              onClick={onShare}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
            >
              <Share2 size={14} /> Share
            </button>
          )}
        </div>
      </div>

      <ImportPanel open={showImport} onClose={() => setShowImport(false)} />
      <ComputedColumnModal open={showComputed} onClose={() => setShowComputed(false)} />
    </>
  )
}
