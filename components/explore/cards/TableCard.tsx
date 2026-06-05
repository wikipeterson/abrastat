'use client'

import { useStore } from '@/lib/store'
import { getStringValues } from '@/lib/gridHelpers'
import { TwoWayTableCard } from '@/components/stats/StatCard'
import { TableOutputCardConfig } from '@/lib/exploreTypes'
import { DropZone } from '../DropZone'
import { EmptyState } from '@/components/ui/EmptyState'

interface TableCardProps {
  cardId: string
  config: TableOutputCardConfig
  onClearZone: (zone: string) => void
  onAssignZone: (zone: 'rows' | 'cols', colId: string) => boolean
  onRemove: () => void
  hideHeader?: boolean
}

export function TableCard({ cardId, config, onClearZone, onAssignZone, onRemove, hideHeader }: TableCardProps) {
  const { grid } = useStore()
  const manualTable = config.manualTable ?? null

  const rowsCol = !manualTable && config.rowsColId ? (grid.columns.find(c => c.id === config.rowsColId) ?? null) : null
  const colsCol = !manualTable && config.colsColId ? (grid.columns.find(c => c.id === config.colsColId) ?? null) : null

  return (
    <div className={hideHeader ? '' : 'bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] overflow-hidden'}>
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Two-Way Table</span>
          <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
        </div>
      )}

      <div className={hideHeader ? 'space-y-3' : 'p-4 space-y-3'}>
        {!manualTable && (
        <div className="grid grid-cols-2 gap-2">
          <DropZone id={`${cardId}:rows`} label="Rows" hint="categorical variable"
            assignedCol={rowsCol} onClear={() => onClearZone('rows')} onAssign={colId => onAssignZone('rows', colId)} allowedTypes={['categorical']} />
          <DropZone id={`${cardId}:cols`} label="Columns" hint="categorical variable"
            assignedCol={colsCol} onClear={() => onClearZone('cols')} onAssign={colId => onAssignZone('cols', colId)} allowedTypes={['categorical']} />
        </div>
        )}

        {manualTable ? (
          <TwoWayTableCard manualTable={manualTable} />
        ) : rowsCol && colsCol ? (
          <TwoWayTableCard
            colAName={rowsCol.name}
            colBName={colsCol.name}
            colAValues={getStringValues(grid, rowsCol.id).filter(v => v.trim())}
            colBValues={getStringValues(grid, colsCol.id).filter(v => v.trim())}
          />
        ) : (
          <EmptyState icon="🔢" title="Drop two variables above" description="Assign a variable to Rows and another to Columns to build a two-way table." />
        )}
      </div>
    </div>
  )
}
