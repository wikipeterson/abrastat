'use client'

import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useStore } from '@/lib/store'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { computeSummary, getFrequencyTable } from '@/lib/statistics'
import { NumericStatsTable, NumericTableRow, CategoricalStatCard } from '@/components/stats/StatCard'
import { SummaryCardConfig } from '@/lib/exploreTypes'
import { DropZone } from '../DropZone'
import { EmptyState } from '@/components/ui/EmptyState'

interface SummaryCardProps {
  cardId: string
  config: SummaryCardConfig
  onClearZone: (zone: string) => void
  onRemove: () => void
  hideHeader?: boolean
}

function MultiVarDropZone({ id, varCols, onClearVar }: {
  id: string
  varCols: { id: string; name: string; type: string }[]
  onClearVar: (colId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-1">Variable</div>
      <div
        ref={setNodeRef}
        className={`min-h-[2.25rem] flex flex-wrap gap-1 p-1.5 rounded-lg border transition-colors ${
          isOver
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
            : varCols.length === 0
              ? 'border-dashed border-[var(--color-border)] bg-slate-50'
              : 'border-[var(--color-border)] bg-slate-50'
        }`}
      >
        {varCols.length === 0 ? (
          <span className="text-xs text-[var(--color-muted)] self-center px-1">drop variables here</span>
        ) : (
          varCols.map(col => (
            <span
              key={col.id}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                col.type === 'numeric'
                  ? 'bg-teal-100 text-teal-800 border border-teal-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <span className="font-mono opacity-60">{col.type === 'numeric' ? '#' : 'A'}</span>
              {col.name}
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onClearVar(col.id)}
                className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
              >×</button>
            </span>
          ))
        )}
      </div>
    </div>
  )
}

export function SummaryCard({ cardId, config, onClearZone, onRemove, hideHeader }: SummaryCardProps) {
  const { grid } = useStore()

  const varCols = config.variableColIds
    .map(id => grid.columns.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c != null)

  const groupCol = config.groupColId ? (grid.columns.find(c => c.id === config.groupColId) ?? null) : null

  const content = useMemo(() => {
    if (varCols.length === 0) return null

    const numericCols = varCols.filter(c => c.type === 'numeric')
    const categoricalCols = varCols.filter(c => c.type === 'categorical')

    const parts: React.ReactNode[] = []

    if (numericCols.length > 0) {
      let rows: NumericTableRow[]
      if (groupCol) {
        const groups = getStringValues(grid, groupCol.id)
        const uniqueGroups = [...new Set(groups)].filter(Boolean).sort()
        rows = numericCols.flatMap(col =>
          uniqueGroups.map(group => ({
            label: numericCols.length > 1 ? `${col.name} | ${group}` : group,
            summary: computeSummary(
              getNumericValues(grid, col.id).filter((_, i) => groups[i] === group),
              col.name,
            ),
          }))
        )
      } else {
        rows = numericCols.map(col => ({
          label: numericCols.length > 1 ? col.name : null,
          summary: computeSummary(getNumericValues(grid, col.id), col.name),
        }))
      }
      parts.push(
        <NumericStatsTable
          key="numeric"
          colName={numericCols.length === 1 ? numericCols[0].name : 'Variable'}
          rows={rows}
          groupColName={groupCol?.name}
          rowLabelHeader={numericCols.length > 1 ? 'Variable' : undefined}
        />
      )
    }

    for (const col of categoricalCols) {
      const values = getStringValues(grid, col.id).filter(v => v.trim())
      parts.push(<CategoricalStatCard key={col.id} column={col.name} rows={getFrequencyTable(values)} />)
    }

    return parts
  }, [grid, varCols, groupCol])

  return (
    <div className={hideHeader ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden'}>
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Summary Stats</span>
          <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
        </div>
      )}

      <div className={hideHeader ? 'space-y-3' : 'p-4 space-y-3'}>
        <div className="flex gap-2">
          <MultiVarDropZone
            id={`${cardId}:variable`}
            varCols={varCols}
            onClearVar={colId => onClearZone(`variable:${colId}`)}
          />
          <div className="w-40 flex-shrink-0">
            <DropZone id={`${cardId}:group`} label="Group by" hint="categorical (optional)"
              assignedCol={groupCol} onClear={() => onClearZone('group')} />
          </div>
        </div>

        {varCols.length === 0 ? (
          <EmptyState icon="📊" title="Drop a variable above" description="Drag any variable from the sidebar to see its statistics." />
        ) : content}
      </div>
    </div>
  )
}
