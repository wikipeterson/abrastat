'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { linearRegression } from '@/lib/statistics'
import { getNumericPairs } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { DropZone } from '../DropZone'
import { EmptyState } from '@/components/ui/EmptyState'

interface RegressionCardProps {
  cardId: string
  config: { xColId: string | null; yColId: string | null; groupColId: string | null }
  onClearZone: (zone: string) => void
  onRemove: () => void
  hideHeader?: boolean
}

function fmt(n: number): string {
  return parseFloat(n.toPrecision(4)).toLocaleString()
}

type RegressionSummary = {
  label: string
  xs: number[]
  ys: number[]
  slope: number
  intercept: number
  interceptSign: string
  r: number
  r2: number
  residuals: number[]
  rmse: number
  n: number
  color: string
}

export function RegressionCard({ cardId, config, onClearZone, onRemove, hideHeader }: RegressionCardProps) {
  const { grid, exploreCards, addLinkedGraphCard } = useStore()

  function handleNativeDrop(zone: 'x' | 'y' | 'group') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return
      e.preventDefault()
      const current = useStore.getState().exploreCards.find(c => c.id === cardId)
      if (!current || current.config.type !== 'regression') return
      const droppedCol = grid.columns.find(c => c.id === colId)
      if (!droppedCol) return
      if ((zone === 'x' || zone === 'y') && droppedCol.type !== 'numeric') return
      if (zone === 'group' && droppedCol.type !== 'categorical') return
      useStore.getState().updateExploreCard(cardId, {
        config: {
          ...current.config,
          ...(zone === 'x' ? { xColId: colId } : zone === 'y' ? { yColId: colId } : { groupColId: colId }),
        },
      })
    }
  }

  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const xCol = config.xColId ? (grid.columns.find(c => c.id === config.xColId) ?? null) : null
  const yCol = config.yColId ? (grid.columns.find(c => c.id === config.yColId) ?? null) : null
  const groupCol = config.groupColId ? (grid.columns.find(c => c.id === config.groupColId) ?? null) : null
  const currentCard = exploreCards.find(card => card.id === cardId) ?? null

  const paired = useMemo(() => {
    if (!config.xColId || !config.yColId) return { xs: [] as number[], ys: [] as number[] }
    const pairs = getNumericPairs(grid, config.xColId, config.yColId)
    return { xs: pairs.map(p => p[0]), ys: pairs.map(p => p[1]) }
  }, [grid, config.xColId, config.yColId])

  const regressions = useMemo<RegressionSummary[]>(() => {
    if (!xCol || !yCol || xCol.type !== 'numeric' || yCol.type !== 'numeric') return []

    if (!groupCol) {
      if (paired.xs.length < 2) return []
      const { slope, intercept, r } = linearRegression(paired.xs, paired.ys)
      const fitted = paired.xs.map(x => slope * x + intercept)
      const residuals = paired.ys.map((y, i) => y - fitted[i])
      const ssRes = residuals.reduce((sum, r0) => sum + r0 ** 2, 0)
      return [{
        label: 'Overall',
        xs: paired.xs,
        ys: paired.ys,
        slope,
        intercept,
        interceptSign: intercept >= 0 ? '+' : '−',
        r,
        r2: r * r,
        residuals,
        rmse: Math.sqrt(ssRes / paired.xs.length),
        n: paired.xs.length,
        color: ABRA_COLORS[0],
      }]
    }

    if (groupCol.type !== 'categorical' || !config.xColId || !config.yColId || !config.groupColId) return []

    const groups = new Map<string, { xs: number[]; ys: number[] }>()
    for (const row of grid.rows) {
      const rawX = row[config.xColId]
      const rawY = row[config.yColId]
      const rawGroup = row[config.groupColId]
      if (rawX === '' || rawX == null || rawY === '' || rawY == null || rawGroup === '' || rawGroup == null) continue
      const x = Number(rawX)
      const y = Number(rawY)
      const label = String(rawGroup).trim()
      if (!isFinite(x) || !isFinite(y) || !label) continue
      const bucket = groups.get(label) ?? { xs: [], ys: [] }
      bucket.xs.push(x)
      bucket.ys.push(y)
      groups.set(label, bucket)
    }

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, values]) => values.xs.length >= 2)
      .map(([label, values], index) => {
        const { slope, intercept, r } = linearRegression(values.xs, values.ys)
        const fitted = values.xs.map(x => slope * x + intercept)
        const residuals = values.ys.map((y, i) => y - fitted[i])
        const ssRes = residuals.reduce((sum, r0) => sum + r0 ** 2, 0)
        return {
          label,
          xs: values.xs,
          ys: values.ys,
          slope,
          intercept,
          interceptSign: intercept >= 0 ? '+' : '−',
          r,
          r2: r * r,
          residuals,
          rmse: Math.sqrt(ssRes / values.xs.length),
          n: values.xs.length,
          color: ABRA_COLORS[index % ABRA_COLORS.length],
        }
      })
  }, [config.groupColId, config.xColId, config.yColId, grid.rows, groupCol, paired.xs, paired.ys, xCol, yCol])

  const primary = regressions[0] ?? null

  const content = (() => {
    if (!xCol || !yCol) {
      return <EmptyState icon="📉" title="Drop two numeric variables" description="Choose an Explanatory Variable and a Response Variable to fit a linear model." />
    }
    if (xCol.type !== 'numeric' || yCol.type !== 'numeric') {
      return <EmptyState icon="📉" title="Numeric variables only" description="Regression requires both Explanatory and Response variables to be numeric." />
    }
    if (groupCol && groupCol.type !== 'categorical') {
      return <EmptyState icon="📉" title="Categorical groups only" description="The optional Group variable must be categorical to run separate regressions." />
    }
    if (!regressions.length) {
      return <EmptyState icon="📉" title="Not enough paired data" description="Need at least two rows with valid values in both variables." />
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (!xCol || !yCol) return
              addLinkedGraphCard(
                {
                  type: 'graph',
                  xColId: xCol.id,
                  yColId: yCol.id,
                  groupColId: groupCol?.id ?? null,
                  chartType: 'scatter',
                },
                { x: (currentCard?.x ?? 40) + (currentCard?.width ?? 400) + 40, y: currentCard?.y ?? 40 },
              )
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            Graph Card
          </button>
          <button
            type="button"
            onClick={() => {
              if (!xCol || !regressions.length) return
              addLinkedGraphCard(
                {
                  type: 'graph',
                  xColId: null,
                  yColId: null,
                  groupColId: null,
                  chartType: 'scatter',
                  manualScatter: {
                    xName: xCol.name,
                    yName: 'Residual',
                    points: regressions.flatMap(regression =>
                      regression.xs.map((x, index) => ({
                        x,
                        y: regression.residuals[index],
                        group: groupCol ? regression.label : undefined,
                        color: regression.color,
                      })),
                    ),
                  },
                },
                { x: (currentCard?.x ?? 40) + (currentCard?.width ?? 400) + 40, y: (currentCard?.y ?? 40) + 80 },
              )
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            Residual Plot
          </button>
        </div>

        <div className="bg-[var(--color-accent-light)] rounded-xl px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-1">
            {groupCol ? 'Separate Regression Equations' : 'Regression Equation'}
          </div>
          {groupCol ? (
            <div className="space-y-2">
              {regressions.map(regression => (
                <div key={regression.label} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: regression.color }} />
                    <span className="font-semibold text-[var(--color-text)] truncate">{regression.label}</span>
                  </div>
                  <div className="font-mono text-[var(--color-text)] text-right">
                    {yCol.name}&#770; = {fmt(regression.slope)}{xCol.name} {regression.interceptSign} {fmt(Math.abs(regression.intercept))}
                  </div>
                </div>
              ))}
            </div>
          ) : primary ? (
            <div className="font-mono text-lg font-semibold text-[var(--color-text)]">
              {yCol.name}&#770; = {fmt(primary.slope)}{xCol.name} {primary.interceptSign} {fmt(Math.abs(primary.intercept))}
            </div>
          ) : null}
        </div>

        <div className={`grid gap-3 ${groupCol ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'}`}>
          {(groupCol ? regressions.map(regression => ({
            key: regression.label,
            label: regression.label,
            value: `r = ${regression.r.toFixed(4)}`,
            sub: `r² = ${regression.r2.toFixed(4)} • n = ${regression.n} • RMSE = ${fmt(regression.rmse)}`,
            color: regression.color,
          })) : primary ? [
            { key: 'r', label: 'r', value: primary.r.toFixed(4), sub: 'correlation' },
            { key: 'r2', label: 'r²', value: primary.r2.toFixed(4), sub: `${(primary.r2 * 100).toFixed(1)}% explained` },
            { key: 'slope', label: 'Slope', value: fmt(primary.slope), sub: `per +1 ${xCol.name}` },
            { key: 'intercept', label: 'Intercept', value: fmt(primary.intercept), sub: `when ${xCol.name} = 0` },
            { key: 'n', label: 'n', value: String(primary.n), sub: 'paired rows' },
            { key: 'rmse', label: 'RMSE', value: fmt(primary.rmse), sub: 'typical prediction error' },
          ] : []).map(item => (
            <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
              {groupCol && 'color' in item ? (
                <div className="flex items-center justify-center gap-2 text-xs text-[var(--color-muted)] mb-0.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ) : (
                <div className="text-xs text-[var(--color-muted)] mb-0.5">{item.label}</div>
              )}
              <div className="font-mono font-semibold text-[var(--color-text)] text-base">{item.value}</div>
              <div className="text-[10px] text-[var(--color-muted)] mt-0.5 leading-tight">{item.sub}</div>
            </div>
          ))}
        </div>

      </div>
    )
  })()

  const inner = (
    <div className="h-full flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('x')}>
          <DropZone
            id={`${cardId}:x`}
            label="Explanatory Variable"
            hint="numeric variable"
            assignedCol={xCol}
            onClear={() => onClearZone('x')}
          />
        </div>
        <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('y')}>
          <DropZone
            id={`${cardId}:y`}
            label="Response Variable"
            hint="numeric variable"
            assignedCol={yCol}
            onClear={() => onClearZone('y')}
          />
        </div>
      </div>

      <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('group')}>
        <DropZone
          id={`${cardId}:group`}
          label="Group Variable (Optional)"
          hint="categorical variable"
          assignedCol={groupCol}
          onClear={() => onClearZone('group')}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {content}
      </div>
    </div>
  )

  if (hideHeader) return inner

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Regression</span>
        <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
      </div>
      <div className="p-4 min-h-[420px]">
        {inner}
      </div>
    </div>
  )
}
