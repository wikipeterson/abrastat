'use client'

import { useState, useMemo } from 'react'
import jStat from 'jstat'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { DistributionPreFill } from '@/lib/exploreTypes'

// ─── Types ────────────────────────────────────────────────────────────────────

type DistType = 'normal' | 't' | 'chi2' | 'binomial' | 'geometric'
type CalcMode = 'area' | 'inverse'
type AreaTail = 'left' | 'between' | 'right'
type InverseTail = 'left' | 'two' | 'right'

const isContinuous = (d: DistType) => d !== 'binomial' && d !== 'geometric'

// ─── jStat type shim ──────────────────────────────────────────────────────────

const jS = jStat as unknown as {
  normal:    { pdf: (x: number, m: number, s: number) => number; cdf: (x: number, m: number, s: number) => number; inv: (p: number, m: number, s: number) => number }
  studentt:  { pdf: (x: number, df: number) => number; cdf: (x: number, df: number) => number; inv: (p: number, df: number) => number }
  chisquare: { pdf: (x: number, df: number) => number; cdf: (x: number, df: number) => number; inv: (p: number, df: number) => number }
  binomial:  { pdf: (k: number, n: number, p: number) => number; cdf: (k: number, n: number, p: number) => number }
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function getPdf(dist: DistType, x: number, params: number[]): number {
  try {
    switch (dist) {
      case 'normal':    return jS.normal.pdf(x, params[0], params[1])
      case 't':         return jS.studentt.pdf(x, params[0])
      case 'chi2':      return x <= 0 ? 0 : jS.chisquare.pdf(x, params[0])
      case 'binomial':  return jS.binomial.pdf(Math.round(x), params[0], params[1])
      case 'geometric': { const k = Math.round(x); return k >= 1 ? params[0] * Math.pow(1 - params[0], k - 1) : 0 }
    }
  } catch { return 0 }
}

function getCdf(dist: DistType, x: number, params: number[]): number {
  try {
    switch (dist) {
      case 'normal':    return jS.normal.cdf(x, params[0], params[1])
      case 't':         return jS.studentt.cdf(x, params[0])
      case 'chi2':      return x <= 0 ? 0 : jS.chisquare.cdf(x, params[0])
      case 'binomial':  return jS.binomial.cdf(Math.floor(x), params[0], params[1])
      case 'geometric': { const k = Math.floor(x); return k < 1 ? 0 : 1 - Math.pow(1 - params[0], k) }
    }
  } catch { return 0 }
}

function getInv(dist: DistType, p: number, params: number[]): number {
  try {
    switch (dist) {
      case 'normal':    return jS.normal.inv(p, params[0], params[1])
      case 't':         return jS.studentt.inv(p, params[0])
      case 'chi2':      return jS.chisquare.inv(p, params[0])
      default:          return NaN
    }
  } catch { return NaN }
}

function getXRange(dist: DistType, params: number[]): [number, number] {
  switch (dist) {
    case 'normal': {
      const [mu, sigma] = params
      return [mu - 4.5 * sigma, mu + 4.5 * sigma]
    }
    case 't': {
      const df = params[0]
      const spread = df > 2 ? Math.sqrt(df / (df - 2)) : 5
      return [-Math.max(4, 3.5 * spread), Math.max(4, 3.5 * spread)]
    }
    case 'chi2': {
      const df = params[0]
      const start = df < 2 ? 0.05 : 0
      return [start, Math.max(df + 4 * Math.sqrt(2 * df), df * 2.5, 8)]
    }
    case 'binomial': return [0, params[0]]
    case 'geometric': {
      const p = params[0]
      return [1, Math.min(Math.ceil(6 / p), 40)]
    }
  }
}

function computeArea(dist: DistType, params: number[], tail: AreaTail, lower: number, upper: number): number {
  switch (tail) {
    case 'left':    return getCdf(dist, upper, params)
    case 'right':   return 1 - getCdf(dist, lower, params)
    case 'between':
      if (isContinuous(dist)) return getCdf(dist, upper, params) - getCdf(dist, lower, params)
      // discrete: inclusive on both ends
      return getCdf(dist, Math.floor(upper), params) - getCdf(dist, Math.ceil(lower) - 1, params)
  }
}

// ─── Inline number input ──────────────────────────────────────────────────────

function NumInput({ label, value, onChange, min, max, step = 'any' }: {
  label: string; value: string; onChange: (v: string) => void
  min?: number; max?: number; step?: string | number
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm select-none">
      <span className="text-[var(--color-muted)] font-medium whitespace-nowrap">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(e.target.value)}
        className="w-16 px-2 py-0.5 rounded border border-[var(--color-border)] text-sm text-[var(--color-text)]
          focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-light)]"
      />
    </label>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DistributionCardProps {
  preFill?: DistributionPreFill
}

export function DistributionCard({ preFill }: DistributionCardProps) {
  // Distribution
  const [dist, setDist] = useState<DistType>(preFill?.dist ?? 'normal')

  // Parameters
  const [mean, setMean]   = useState(String(preFill?.mean ?? 0))
  const [sd, setSd]       = useState(String(preFill?.sd ?? 1))
  const [df, setDf]       = useState(String(preFill?.df ?? 10))
  const [binN, setBinN]   = useState('20')
  const [binP, setBinP]   = useState('0.5')
  const [geoP, setGeoP]   = useState('0.3')

  // Calc mode
  const [calcMode, setCalcMode]   = useState<CalcMode>(preFill?.calcMode ?? 'area')
  const [areaTail, setAreaTail]   = useState<AreaTail>(preFill?.areaTail ?? (preFill?.dist === 'chi2' ? 'right' : 'left'))
  const [invTail, setInvTail]     = useState<InverseTail>('two')

  // Bounds
  const defaultLower = preFill?.bound !== undefined && preFill?.areaTail === 'right' ? String(preFill.bound) : '0'
  const defaultUpper = preFill?.bound !== undefined && preFill?.areaTail !== 'right' ? String(preFill.bound) : '1'
  const [lower, setLower] = useState(defaultLower)
  const [upper, setUpper] = useState(defaultUpper)
  const [invP, setInvP]   = useState('0.95')

  // "Based on" chip — dismiss to go manual
  const [preFillDismissed, setPreFillDismissed] = useState(false)
  const showBasedOn = !!preFill && !preFillDismissed

  function handleDistChange(d: DistType) {
    setDist(d)
    if (d === 'chi2' && areaTail === 'left') setAreaTail('right')
  }

  // Parse parameters
  const params = useMemo((): number[] => {
    switch (dist) {
      case 'normal':    return [parseFloat(mean) || 0, Math.max(parseFloat(sd) || 1, 0.001)]
      case 't':         return [Math.max(parseFloat(df) || 1, 0.5)]
      case 'chi2':      return [Math.max(parseFloat(df) || 1, 0.1)]
      case 'binomial':  return [Math.max(Math.floor(parseFloat(binN)) || 1, 1), Math.min(1, Math.max(0, parseFloat(binP) || 0.5))]
      case 'geometric': return [Math.min(1, Math.max(0.001, parseFloat(geoP) || 0.3))]
    }
  }, [dist, mean, sd, df, binN, binP, geoP])

  const lowerVal = parseFloat(lower) || 0
  const upperVal = parseFloat(upper) || 1
  const invPVal  = Math.min(0.9999, Math.max(0.0001, parseFloat(invP) || 0.95))

  // ─── Result ──────────────────────────────────────────────────────────────────

  const result = useMemo(() => {
    if (calcMode === 'area') {
      const p = computeArea(dist, params, areaTail, lowerVal, upperVal)
      return isFinite(p) ? Math.max(0, Math.min(1, p)) : null
    }
    if (!isContinuous(dist)) return null
    const critP = invTail === 'left' ? invPVal : invTail === 'right' ? 1 - invPVal : (1 + invPVal) / 2
    const cv = getInv(dist, critP, params)
    return isFinite(cv) ? cv : null
  }, [dist, params, calcMode, areaTail, invTail, lowerVal, upperVal, invPVal])

  // ─── Chart ───────────────────────────────────────────────────────────────────

  const chartTraces = useMemo(() => {
    const [xMin, xMax] = getXRange(dist, params)

    if (isContinuous(dist)) {
      const N = 300
      const xs = Array.from({ length: N + 1 }, (_, i) => xMin + (xMax - xMin) * i / N)
      const ys = xs.map(x => getPdf(dist, x, params))

      // Shade bounds
      let sMin = xMin, sMax = xMax
      if (calcMode === 'area') {
        if (areaTail === 'left')    sMax = upperVal
        if (areaTail === 'right')   sMin = lowerVal
        if (areaTail === 'between') { sMin = lowerVal; sMax = upperVal }
      } else if (result !== null) {
        if (invTail === 'left')  sMax = result
        if (invTail === 'right') sMin = result
        if (invTail === 'two')   {
          // For normal distribution, shade symmetric around mean; otherwise shade from ±result
          const center = dist === 'normal' ? params[0] : 0
          sMin = center - Math.abs(result - center)
          sMax = center + Math.abs(result - center)
        }
      }

      const shadeXs = xs.filter(x => x >= sMin && x <= sMax)
      const shadeYs = shadeXs.map(x => getPdf(dist, x, params))

      return [
        {
          type: 'scatter' as const, mode: 'none' as const,
          x: shadeXs.length > 1 ? [shadeXs[0], ...shadeXs, shadeXs.at(-1)] : [],
          y: shadeXs.length > 1 ? [0, ...shadeYs, 0] : [],
          fill: 'toself' as const,
          fillcolor: ABRA_COLORS[0] + '30',
          line: { color: 'transparent' as const },
          hoverinfo: 'skip' as const,
          showlegend: false,
        },
        {
          type: 'scatter' as const, mode: 'lines' as const,
          x: xs, y: ys,
          line: { color: ABRA_COLORS[0], width: 2.5 },
          hoverinfo: 'skip' as const,
          showlegend: false,
        },
      ]
    }

    // Discrete bar chart
    const kMin = Math.ceil(xMin), kMax = Math.floor(xMax)
    const ks = Array.from({ length: kMax - kMin + 1 }, (_, i) => kMin + i)
    const ps = ks.map(k => getPdf(dist, k, params))

    const inShade = (k: number) => {
      if (calcMode !== 'area') return false
      const lo = Math.ceil(lowerVal), hi = Math.floor(upperVal)
      if (areaTail === 'left')    return k <= Math.floor(upperVal)
      if (areaTail === 'right')   return k >= Math.ceil(lowerVal)
      return k >= lo && k <= hi
    }

    return [{
      type: 'bar' as const,
      x: ks, y: ps,
      marker: {
        color: ks.map(k => inShade(k) ? ABRA_COLORS[0] : '#CBD5E1'),
        line: { color: 'white', width: 1 },
      },
      hovertemplate: 'k = %{x}<br>P(X = %{x}) = %{y:.4f}<extra></extra>',
      showlegend: false,
    }]
  }, [dist, params, calcMode, areaTail, invTail, lowerVal, upperVal, result])

  // ─── Result label ─────────────────────────────────────────────────────────────

  const resultLabel = useMemo(() => {
    if (result === null) return null
    if (calcMode === 'area') {
      const pStr = result.toFixed(4)
      if (areaTail === 'left')    return `P(X ≤ ${upper}) = ${pStr}`
      if (areaTail === 'right')   return `P(X ≥ ${lower}) = ${pStr}`
      return `P(${lower} ≤ X ≤ ${upper}) = ${pStr}`
    }
    const cvStr = Math.abs(result).toFixed(4)
    const sym = dist === 'normal' ? 'z' : dist === 't' ? 't' : 'χ²'
    if (invTail === 'two') return `${sym}* = ±${cvStr}`
    return `${sym} = ${result.toFixed(4)}`
  }, [result, calcMode, areaTail, invTail, lower, upper, dist])

  // ─── Render ───────────────────────────────────────────────────────────────────

  const DISTS: { id: DistType; label: string }[] = [
    { id: 'normal',    label: 'Normal'    },
    { id: 't',         label: 't'         },
    { id: 'chi2',      label: 'χ²'        },
    { id: 'binomial',  label: 'Binomial'  },
    { id: 'geometric', label: 'Geometric' },
  ]

  const AREA_TAILS: { id: AreaTail; label: string }[] = [
    { id: 'left',    label: 'Left tail'  },
    { id: 'between', label: 'Between'    },
    { id: 'right',   label: 'Right tail' },
  ]

  const INV_TAILS: { id: InverseTail; label: string }[] = [
    { id: 'left',  label: 'Left'       },
    { id: 'two',   label: 'Two-tailed' },
    { id: 'right', label: 'Right'      },
  ]

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">

      {/* Based on chip */}
      {showBasedOn && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[var(--color-accent-light)] border border-[var(--color-accent)]/30 rounded-lg text-xs">
          <span className="text-[var(--color-accent)] font-medium">Based on: {preFill!.sourceLabel}</span>
          <button
            onClick={() => setPreFillDismissed(true)}
            className="ml-auto text-[var(--color-accent)] opacity-60 hover:opacity-100 leading-none text-sm"
            title="Clear pre-fill and enter manually"
          >
            ×
          </button>
        </div>
      )}

      {/* Distribution selector */}
      <div className="flex-shrink-0 flex items-center gap-1 flex-wrap">
        {DISTS.map(d => (
          <button
            key={d.id}
            onClick={() => handleDistChange(d.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              dist === d.id
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-slate-300'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Parameters */}
      <div className="flex-shrink-0 flex items-center gap-4 flex-wrap">
        {dist === 'normal' && (
          <>
            <NumInput label="μ =" value={mean} onChange={setMean} step={0.1} />
            <NumInput label="σ =" value={sd} onChange={setSd} min={0.001} step={0.1} />
          </>
        )}
        {(dist === 't' || dist === 'chi2') && (
          <NumInput label="df =" value={df} onChange={setDf} min={0.5} step={1} />
        )}
        {dist === 'binomial' && (
          <>
            <NumInput label="n =" value={binN} onChange={setBinN} min={1} step={1} />
            <NumInput label="p =" value={binP} onChange={setBinP} min={0} max={1} step={0.01} />
          </>
        )}
        {dist === 'geometric' && (
          <NumInput label="p =" value={geoP} onChange={setGeoP} min={0.001} max={1} step={0.01} />
        )}
      </div>

      {/* Calc mode toggle — continuous only */}
      {isContinuous(dist) && (
        <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {(['area', 'inverse'] as CalcMode[]).map(m => (
              <button
                key={m}
                onClick={() => setCalcMode(m)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  calcMode === m
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {m === 'area' ? 'Probability' : 'Inverse'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Area mode controls */}
      {calcMode === 'area' && (
        <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {AREA_TAILS.map(t => (
              <button
                key={t.id}
                onClick={() => setAreaTail(t.id)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors border-r border-[var(--color-border)] last:border-0 ${
                  areaTail === t.id
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {(areaTail === 'between' || areaTail === 'right') && (
            <NumInput label="a =" value={lower} onChange={setLower} step={0.01} />
          )}
          {(areaTail === 'between' || areaTail === 'left') && (
            <NumInput label="b =" value={upper} onChange={setUpper} step={0.01} />
          )}
        </div>
      )}

      {/* Inverse mode controls */}
      {calcMode === 'inverse' && isContinuous(dist) && (
        <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {INV_TAILS.map(t => (
              <button
                key={t.id}
                onClick={() => setInvTail(t.id)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors border-r border-[var(--color-border)] last:border-0 ${
                  invTail === t.id
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <NumInput label="Area =" value={invP} onChange={setInvP} min={0.0001} max={0.9999} step={0.01} />
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <PlotlyChart
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={chartTraces as any}
          layout={{
            xaxis: { zeroline: false, showgrid: true },
            yaxis: { zeroline: false, showticklabels: false, showgrid: false },
            showlegend: false,
            margin: { t: 8, r: 16, b: 36, l: 16 },
            bargap: 0.1,
          }}
        />
      </div>

      {/* Result */}
      {resultLabel && (
        <div className="flex-shrink-0 text-center py-2 px-4 bg-slate-50 rounded-xl border border-[var(--color-border)]">
          <span className="text-sm font-mono font-semibold text-[var(--color-text)]">{resultLabel}</span>
        </div>
      )}
    </div>
  )
}
