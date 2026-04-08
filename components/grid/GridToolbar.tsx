'use client'

import { useState } from 'react'
import { Plus, Columns, ArrowDownToLine, Database, Share2, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { ImportPanel } from '@/components/import/ImportPanel'
import { DataOperationsModal } from './DataOperationsModal'
import { useAuth } from '@/components/auth/AuthProvider'

export function GridToolbar({ onShare }: { onShare?: () => void }) {
  const { addRow, addColumn, activeFilters, setRowFilters } = useStore()
  const { isGuest } = useAuth()
  const [showImport, setShowImport] = useState(false)
  const [showData, setShowData] = useState(false)

  return (
    <>
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-center gap-1 px-2 py-1.5 whitespace-nowrap">
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
              onClick={() => setShowData(true)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--color-text)] hover:bg-slate-100 transition-colors"
            >
              <Database size={14} /> Data
            </button>
            <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
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

        {/* Filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 pb-1.5 flex-wrap">
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
      </div>

      <ImportPanel open={showImport} onClose={() => setShowImport(false)} />
      <DataOperationsModal
        open={showData}
        onClose={() => setShowData(false)}
        defaultSection={activeFilters.length > 0 ? 'filter' : 'computed'}
      />
    </>
  )
}
