'use client'

import { useMemo } from 'react'
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

export function SummaryCard({ cardId, config, onClearZone, onRemove, hideHeader }: SummaryCardProps) {
  const { grid } = useStore()

  const varCol = config.variableColId ? (grid.columns.find(c => c.id === config.variableColId) ?? null) : null
  const groupCol = config.groupColId ? (grid.columns.find(c => c.id === config.groupColId) ?? null) : null

  const content = useMemo(() => {
    if (!varCol) return null

    if (varCol.type === 'numeric') {
      let rows: NumericTableRow[]
      if (groupCol) {
        const allValues = getNumericValues(grid, varCol.id)
        const groups = getStringValues(grid, groupCol.id)
        const uniqueGroups = [...new Set(groups)].filter(Boolean).sort()
        rows = uniqueGroups.map(group => ({
          label: group,
          summary: computeSummary(allValues.filter((_, i) => groups[i] === group), varCol.name),
        }))
      } else {
        rows = [{ label: null, summary: computeSummary(getNumericValues(grid, varCol.id), varCol.name) }]
      }
      return (
        <NumericStatsTable
          colName={varCol.name}
          rows={rows}
          groupColName={groupCol?.name}
        />
      )
    } else {
      const values = getStringValues(grid, varCol.id).filter(v => v.trim())
      return <CategoricalStatCard column={varCol.name} rows={getFrequencyTable(values)} />
    }
  }, [grid, varCol, groupCol])

  return (
    <div className={hideHeader ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden'}>
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Summary Stats</span>
          <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
        </div>
      )}

      <div className={hideHeader ? 'space-y-3' : 'p-4 space-y-3'}>
        <div className="grid grid-cols-2 gap-2">
          <DropZone id={`${cardId}:variable`} label="Variable" hint="any variable"
            assignedCol={varCol} onClear={() => onClearZone('variable')} />
          <DropZone id={`${cardId}:group`} label="Group by" hint="categorical (optional)"
            assignedCol={groupCol} onClear={() => onClearZone('group')} />
        </div>

        {!varCol ? (
          <EmptyState icon="📊" title="Drop a variable above" description="Drag any variable from the sidebar to see its statistics." />
        ) : content}
      </div>
    </div>
  )
}

