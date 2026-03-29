'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { getStringValues } from '@/lib/gridHelpers'
import { getFrequencyTable } from '@/lib/statistics'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'

interface PieChartProps {
  colId: string | null
}

export function PieChart({ colId }: PieChartProps) {
  const { grid } = useStore()
  const { hideAxisTitles } = useGraphCardContext()
  const col = grid.columns.find(c => c.id === colId)

  const freqTable = useMemo(() => {
    if (!colId) return []
    const values = getStringValues(grid, colId).filter(v => v.trim())
    return getFrequencyTable(values).slice(0, 20)
  }, [grid, colId])

  if (!colId || !col) {
    return <EmptyState icon="🥧" title="Drop a categorical variable" description="Drag a categorical variable to see a pie chart of frequencies." />
  }

  if (freqTable.length === 0) {
    return <EmptyState icon="🥧" title="No data" description="No non-empty values found in this column." />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={[{
            type: 'pie',
            labels: freqTable.map(r => r.value),
            values: freqTable.map(r => r.count),
            marker: { colors: ABRA_COLORS },
            textinfo: 'label+percent',
            hovertemplate: '%{label}: %{value} (%{percent})<extra></extra>',
            textfont: { size: 12 },
            hole: 0,
          }]}
          layout={{
            showlegend: freqTable.length <= 8,
            legend: { orientation: 'v', x: 1, y: 0.5 },
            margin: hideAxisTitles
              ? { t: 8, r: 16, b: 8, l: 16 }
              : { t: 16, r: 120, b: 16, l: 16 },
          }}
          title={hideAxisTitles ? undefined : col.name}
        />
      </div>
    </div>
  )
}
