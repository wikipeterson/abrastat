'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { linearRegression } from '@/lib/statistics'
import { getNumericPairs } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { DropZone } from '../DropZone'
import { EmptyState } from '@/components/ui/EmptyState'
import jStat from 'jstat'

const jS = jStat as unknown as {
  studentt: { cdf: (x: number, df: number) => number; inv: (p: number, df: number) => number }
}

interface RegressionCardProps {
  cardId: string
  config: { xColId: string | null; yColId: string | null; groupColId: string | null }
  onClearZone: (zone: string) => void
  onAssignZone: (zone: 'x' | 'y' | 'group', colId: string) => boolean
  onRemove: () => void
  hideHeader?: boolean
}

type AltHyp = 'less' | 'two' | 'greater'

function fmt(n: number): string {
  return parseFloat(n.toPrecision(4)).toLocaleString()
}

function fmtP(p: number): string {
  if (p < 0.001) return '<.001'
  return p.toFixed(3)
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

export function RegressionCard({ cardId, config, onClearZone, onAssignZone, onRemove, hideHeader }: RegressionCardProps) {
  const { grid, exploreCards, addLinkedGraphCard } = useStore()

  const [showInference, setShowInference] = useState(false)
  const [nullValue, setNullValue] = useState('0')
  const [altHyp, setAltHyp] = useState<AltHyp>('two')
  const [confLevel, setConfLevel] = useState(95)
  const [confInput, setConfInput] = useState('95')

  function handleNativeDrop(zone: 'x' | 'y' | 'group') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return
      e.preventDefault()
      onAssignZone(zone, colId)
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

  // Slope inference derived quantities — recompute whenever inputs change
  const slopeInf = useMemo(() => {
    if (!primary || primary.n < 3 || groupCol) return null
    const n = primary.n
    const ssRes = primary.residuals.reduce((s, r) => s + r * r, 0)
    const ser = Math.sqrt(ssRes / (n - 2))               // residual SE (df-corrected)
    const xbar = primary.xs.reduce((s, x) => s + x, 0) / n
    const ssX = primary.xs.reduce((s, x) => s + (x - xbar) ** 2, 0)
    if (ssX === 0) return null
    const se = ser / Math.sqrt(ssX)                       // SE of slope
    const df = n - 2
    const c = isFinite(parseFloat(nullValue)) ? parseFloat(nullValue) : 0
    const t = (primary.slope - c) / se
    let p = altHyp === 'two'
      ? 2 * (1 - jS.studentt.cdf(Math.abs(t), df))
      : altHyp === 'greater'
        ? 1 - jS.studentt.cdf(t, df)
        : jS.studentt.cdf(t, df)
    p = Math.max(0, Math.min(1, p))
    const tStar = jS.studentt.inv(1 - (1 - confLevel / 100) / 2, df)
    const ciLo = primary.slope - tStar * se
    const ciHi = primary.slope + tStar * se
    const ciExcludes = c < ciLo || c > ciHi
    return { se, t, df, p, tStar, ciLo, ciHi, ciExcludes, c }
  }, [primary, groupCol, nullValue, altHyp, confLevel])

  const inferenceAvailable = !!slopeInf

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

    // Compact one-row stat strip used when inference section is open
    const compactStrip = primary && !groupCol ? (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-mono">
        {[
          { label: 'r', value: primary.r.toFixed(4) },
          { label: 'r²', value: primary.r2.toFixed(4) },
          { label: 'slope', value: fmt(primary.slope) },
          { label: 'intercept', value: fmt(primary.intercept) },
          { label: 'n', value: String(primary.n) },
          { label: 'RMSE', value: fmt(primary.rmse) },
        ].map((item, i) => (
          <span key={item.label} className="flex items-center gap-1">
            {i > 0 && <span className="text-[var(--color-border)] mr-1.5">·</span>}
            <span className="text-[var(--color-muted)]">{item.label}</span>
            <span className="font-semibold text-[var(--color-text)]">{item.value}</span>
          </span>
        ))}
      </div>
    ) : null

    // Full 6-tile grid used when inference is hidden
    const fullTiles = (
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
          <div key={item.label} className="bg-[var(--color-bg)] rounded-xl p-3 text-center">
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
    )

    // Inference section
    const inferenceSection = showInference && slopeInf ? (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">

        {/* Header row */}
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-[var(--color-border)] flex-wrap gap-y-2">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            Inference for the slope · β₁
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted)] font-mono">Confidence</span>
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
              {([90, 95, 99] as const).map((lvl, i) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => { setConfLevel(lvl); setConfInput(String(lvl)) }}
                  className={`px-2.5 py-1 font-mono font-semibold transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${confLevel === lvl && String(lvl) === confInput ? 'bg-[var(--color-accent-strong)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]'}`}
                >
                  {lvl}%
                </button>
              ))}
            </div>
            <input
              type="number" min={50} max={99.9} step={0.1}
              value={confInput}
              onChange={e => {
                const raw = e.target.value
                setConfInput(raw)
                const v = parseFloat(raw)
                if (isFinite(v) && v >= 50 && v <= 99.9) setConfLevel(v)
              }}
              className="w-16 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>
        </div>

        {/* Hypotheses */}
        <div className="px-3.5 py-2.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-[var(--color-text)] whitespace-nowrap">
                H<sub>0</sub> : β₁ =
              </span>
              <input
                type="number" step="any"
                value={nullValue}
                onChange={e => setNullValue(e.target.value)}
                className="w-20 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-center font-mono text-sm font-semibold text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-[var(--color-muted)] whitespace-nowrap">
                H<sub>a</sub> : β₁
              </span>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-sm font-mono">
                {(['less', 'two', 'greater'] as AltHyp[]).map((alt, i) => (
                  <button
                    key={alt}
                    type="button"
                    onClick={() => setAltHyp(alt)}
                    className={`px-2.5 py-1 font-semibold transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${altHyp === alt ? 'bg-[var(--color-accent-strong)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]'}`}
                  >
                    {alt === 'less' ? '<' : alt === 'two' ? '≠' : '>'}
                  </button>
                ))}
              </div>
              <span className="font-mono text-sm font-semibold text-[var(--color-muted)]">
                {isFinite(parseFloat(nullValue)) ? parseFloat(nullValue).toString() : '?'}
              </span>
            </div>
          </div>
        </div>

        {/* Test-stat strip */}
        <div className="grid grid-cols-4 divide-x divide-[var(--color-border)] border-b border-[var(--color-border)]">
          {[
            { label: 'SE', value: slopeInf.se.toFixed(4) },
            { label: 't', value: slopeInf.t.toFixed(3) },
            { label: 'df', value: String(slopeInf.df) },
            { label: 'p', value: fmtP(slopeInf.p), highlight: true },
          ].map(cell => (
            <div key={cell.label} className="flex flex-col items-center justify-center py-2.5 px-2">
              <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)] mb-1">
                {cell.label}
              </div>
              <div className={`font-mono tabular-nums font-bold text-base leading-tight ${cell.highlight ? 'text-[var(--color-accent-strong)]' : 'text-[var(--color-text)]'}`}>
                {cell.value}
              </div>
            </div>
          ))}
        </div>

        {/* CI bar */}
        <div className="px-3.5 py-3">
          <div className="font-mono font-bold text-[var(--color-gold)] text-sm">
            {confLevel}% CI for slope &nbsp;→&nbsp; {slopeInf.ciLo.toFixed(3)} to {slopeInf.ciHi.toFixed(3)}
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted)] leading-snug">
            {slopeInf.ciExcludes
              ? `Interval excludes ${slopeInf.c} → evidence the slope ≠ ${slopeInf.c}.`
              : `Interval contains ${slopeInf.c} → not enough evidence the slope ≠ ${slopeInf.c}.`}
          </div>
        </div>

      </div>
    ) : null

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
          {inferenceAvailable && (
            <button
              type="button"
              onClick={() => setShowInference(v => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showInference
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
              }`}
            >
              Slope Inference
            </button>
          )}
        </div>

        <div className="bg-[var(--color-accent-light)] rounded-xl px-4 py-3">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-1">
            {groupCol ? 'Separate Regression Equations' : 'Regression Equation'}
          </div>
          {groupCol ? (
            <div className="space-y-2">
              {regressions.map(regression => (
                <div key={regression.label} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: regression.color }} />
                    <span className="font-serif italic font-semibold text-[var(--color-text)] truncate">{regression.label}</span>
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

        {showInference && !groupCol ? compactStrip : fullTiles}

        {inferenceSection}
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
            onAssign={colId => onAssignZone('x', colId)}
            allowedTypes={['numeric']}
          />
        </div>
        <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('y')}>
          <DropZone
            id={`${cardId}:y`}
            label="Response Variable"
            hint="numeric variable"
            assignedCol={yCol}
            onClear={() => onClearZone('y')}
            onAssign={colId => onAssignZone('y', colId)}
            allowedTypes={['numeric']}
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
          onAssign={colId => onAssignZone('group', colId)}
          allowedTypes={['categorical']}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {content}
      </div>
    </div>
  )

  if (hideHeader) return inner

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-mono font-semibold text-[var(--color-muted)] uppercase tracking-wide">Regression</span>
        <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors text-xl leading-none">×</button>
      </div>
      <div className="p-4 min-h-[420px]">
        {inner}
      </div>
    </div>
  )
}
