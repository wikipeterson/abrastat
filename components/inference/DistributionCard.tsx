'use client'

import { useMemo, useState } from 'react'
import jStat from 'jstat'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { DistributionPreFill } from '@/lib/exploreTypes'

type DistType = 'normal' | 't' | 'chi2' | 'binomial' | 'geometric'
type CalcDirection = 'le' | 'ge' | 'between'

const isContinuous = (d: DistType) => d !== 'binomial' && d !== 'geometric'

const jS = jStat as unknown as {
  normal: { pdf: (x: number, m: number, s: number) => number; cdf: (x: number, m: number, s: number) => number; inv: (p: number, m: number, s: number) => number }
  studentt: { pdf: (x: number, df: number) => number; cdf: (x: number, df: number) => number; inv: (p: number, df: number) => number }
  chisquare: { pdf: (x: number, df: number) => number; cdf: (x: number, df: number) => number; inv: (p: number, df: number) => number }
  binomial: { pdf: (k: number, n: number, p: number) => number; cdf: (k: number, n: number, p: number) => number }
}

function getPdf(dist: DistType, x: number, params: number[]): number {
  try {
    switch (dist) {
      case 'normal': return jS.normal.pdf(x, params[0], params[1])
      case 't': return jS.studentt.pdf(x, params[0])
      case 'chi2': return x <= 0 ? 0 : jS.chisquare.pdf(x, params[0])
      case 'binomial': return jS.binomial.pdf(Math.round(x), params[0], params[1])
      case 'geometric': {
        const k = Math.round(x)
        return k >= 1 ? params[0] * Math.pow(1 - params[0], k - 1) : 0
      }
    }
  } catch {
    return 0
  }
}

function getCdf(dist: DistType, x: number, params: number[]): number {
  try {
    switch (dist) {
      case 'normal': return jS.normal.cdf(x, params[0], params[1])
      case 't': return jS.studentt.cdf(x, params[0])
      case 'chi2': return x <= 0 ? 0 : jS.chisquare.cdf(x, params[0])
      case 'binomial': return jS.binomial.cdf(Math.floor(x), params[0], params[1])
      case 'geometric': {
        const k = Math.floor(x)
        return k < 1 ? 0 : 1 - Math.pow(1 - params[0], k)
      }
    }
  } catch {
    return 0
  }
}

function getInv(dist: DistType, p: number, params: number[]): number {
  try {
    switch (dist) {
      case 'normal': return jS.normal.inv(p, params[0], params[1])
      case 't': return jS.studentt.inv(p, params[0])
      case 'chi2': return jS.chisquare.inv(p, params[0])
      default: return NaN
    }
  } catch {
    return NaN
  }
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
    case 'binomial':
      return [0, params[0]]
    case 'geometric': {
      const p = params[0]
      return [1, Math.min(Math.ceil(6 / p), 40)]
    }
  }
}

function NumInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 'any',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  min?: number
  max?: number
  step?: string | number
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

interface DistributionCardProps {
  preFill?: DistributionPreFill
}

export function DistributionCard({ preFill }: DistributionCardProps) {
  const [dist, setDist] = useState<DistType>(preFill?.dist ?? 'normal')

  const [mean, setMean] = useState(String(preFill?.mean ?? 0))
  const [sd, setSd] = useState(String(preFill?.sd ?? 1))
  const [df, setDf] = useState(String(preFill?.df ?? 10))
  const [binN, setBinN] = useState('20')
  const [binP, setBinP] = useState('0.5')
  const [geoP, setGeoP] = useState('0.3')

  const initialDirection: CalcDirection =
    preFill?.areaTail === 'between' ? 'between' : preFill?.areaTail === 'right' ? 'ge' : 'le'
  const initialBound = preFill?.bound !== undefined ? String(preFill.bound) : dist === 'chi2' ? '1' : '0'
  const [direction, setDirection] = useState<CalcDirection>(initialDirection)
  const [bound, setBound] = useState(initialBound)
  const [lower, setLower] = useState('0')
  const [upper, setUpper] = useState(preFill?.areaTail === 'between' && preFill?.bound !== undefined ? String(preFill.bound) : '1')
  const [probability, setProbability] = useState('0.5')
  const [lastEdited, setLastEdited] = useState<'bound' | 'probability' | 'between'>(
    preFill?.areaTail === 'between' ? 'between' : 'bound',
  )

  const [preFillDismissed, setPreFillDismissed] = useState(false)
  const showBasedOn = !!preFill && !preFillDismissed

  function handleDistChange(next: DistType) {
    setDist(next)
    if (next === 'chi2' && direction === 'le') setDirection('ge')
  }

  const params = useMemo((): number[] => {
    switch (dist) {
      case 'normal':
        return [parseFloat(mean) || 0, Math.max(parseFloat(sd) || 1, 0.001)]
      case 't':
        return [Math.max(parseFloat(df) || 1, 0.5)]
      case 'chi2':
        return [Math.max(parseFloat(df) || 1, 0.1)]
      case 'binomial':
        return [Math.max(Math.floor(parseFloat(binN)) || 1, 1), Math.min(1, Math.max(0, parseFloat(binP) || 0.5))]
      case 'geometric':
        return [Math.min(1, Math.max(0.001, parseFloat(geoP) || 0.3))]
    }
  }, [dist, mean, sd, df, binN, binP, geoP])

  const boundVal = parseFloat(bound) || 0
  const lowerVal = parseFloat(lower) || 0
  const upperVal = parseFloat(upper) || 1
  const probabilityVal = Math.min(0.999999, Math.max(0.000001, parseFloat(probability) || 0.5))

  const computed = useMemo(() => {
    if (direction === 'between') {
      const p = isContinuous(dist)
        ? getCdf(dist, upperVal, params) - getCdf(dist, lowerVal, params)
        : getCdf(dist, Math.floor(upperVal), params) - getCdf(dist, Math.ceil(lowerVal) - 1, params)
      return {
        probability: isFinite(p) ? Math.max(0, Math.min(1, p)) : null as number | null,
        bound: null as number | null,
        shadeMin: lowerVal,
        shadeMax: upperVal,
      }
    }

    if (lastEdited === 'probability' && isContinuous(dist)) {
      const nextBound = direction === 'le'
        ? getInv(dist, probabilityVal, params)
        : getInv(dist, 1 - probabilityVal, params)
      return {
        probability: isFinite(nextBound) ? probabilityVal : null,
        bound: isFinite(nextBound) ? nextBound : null,
        shadeMin: direction === 'ge' && isFinite(nextBound) ? nextBound : null,
        shadeMax: direction === 'le' && isFinite(nextBound) ? nextBound : null,
      }
    }

    const p = direction === 'le'
      ? getCdf(dist, boundVal, params)
      : 1 - getCdf(dist, boundVal, params)
    return {
      probability: isFinite(p) ? Math.max(0, Math.min(1, p)) : null,
      bound: boundVal,
      shadeMin: direction === 'ge' ? boundVal : null,
      shadeMax: direction === 'le' ? boundVal : null,
    }
  }, [dist, params, direction, boundVal, lowerVal, upperVal, probabilityVal, lastEdited])

  const probabilityDisplay = computed.probability === null ? '' : String(Number(computed.probability.toFixed(8)))
  const boundDisplay = computed.bound === null ? '' : String(Number(computed.bound.toFixed(6)))

  const chartTraces = useMemo(() => {
    const [xMin, xMax] = getXRange(dist, params)

    if (isContinuous(dist)) {
      const N = 300
      const xs = Array.from({ length: N + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / N)
      const ys = xs.map(x => getPdf(dist, x, params))

      let sMin = computed.shadeMin ?? xMin
      let sMax = computed.shadeMax ?? xMax
      if (direction === 'between') {
        sMin = lowerVal
        sMax = upperVal
      }

      const shadeXs = xs.filter(x => x >= sMin && x <= sMax)
      const shadeYs = shadeXs.map(x => getPdf(dist, x, params))

      return [
        {
          type: 'scatter' as const,
          mode: 'none' as const,
          x: shadeXs.length > 1 ? [shadeXs[0], ...shadeXs, shadeXs.at(-1)] : [],
          y: shadeXs.length > 1 ? [0, ...shadeYs, 0] : [],
          fill: 'toself' as const,
          fillcolor: ABRA_COLORS[0] + '30',
          line: { color: 'transparent' as const },
          hoverinfo: 'skip' as const,
          showlegend: false,
        },
        {
          type: 'scatter' as const,
          mode: 'lines' as const,
          x: xs,
          y: ys,
          line: { color: ABRA_COLORS[0], width: 2.5 },
          hoverinfo: 'skip' as const,
          showlegend: false,
        },
      ]
    }

    const kMin = Math.ceil(xMin)
    const kMax = Math.floor(xMax)
    const ks = Array.from({ length: kMax - kMin + 1 }, (_, i) => kMin + i)
    const ps = ks.map(k => getPdf(dist, k, params))

    const inShade = (k: number) => {
      if (direction === 'between') return k >= Math.ceil(lowerVal) && k <= Math.floor(upperVal)
      if (direction === 'le') return k <= Math.floor(boundVal)
      return k >= Math.ceil(boundVal)
    }

    return [{
      type: 'bar' as const,
      x: ks,
      y: ps,
      marker: {
        color: ks.map(k => (inShade(k) ? ABRA_COLORS[0] : '#CBD5E1')),
        line: { color: 'white', width: 1 },
      },
      hovertemplate: 'k = %{x}<br>P(X = %{x}) = %{y:.4f}<extra></extra>',
      showlegend: false,
    }]
  }, [dist, params, direction, boundVal, lowerVal, upperVal, computed.shadeMin, computed.shadeMax])

  const DISTS: { id: DistType; label: string }[] = [
    { id: 'normal', label: 'Normal' },
    { id: 't', label: 't' },
    { id: 'chi2', label: 'χ²' },
    { id: 'binomial', label: 'Binomial' },
    { id: 'geometric', label: 'Geometric' },
  ]

  const canInverse = isContinuous(dist) && direction !== 'between'

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
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

      <div className="flex-shrink-0 flex items-center gap-1 flex-wrap">
        {DISTS.map(item => (
          <button
            key={item.id}
            onClick={() => handleDistChange(item.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              dist === item.id
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

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

      <div className="flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-slate-50 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-lg sm:text-2xl font-serif text-[var(--color-text)]">
          <span>P(</span>
          {direction === 'between' ? (
            <>
              <input
                type="number"
                value={lower}
                onChange={e => {
                  setLower(e.target.value)
                  setLastEdited('between')
                }}
                step="any"
                className="w-24 rounded border border-[var(--color-border)] bg-white px-2 py-1 text-base font-sans"
              />
              <span>≤ X ≤</span>
              <input
                type="number"
                value={upper}
                onChange={e => {
                  setUpper(e.target.value)
                  setLastEdited('between')
                }}
                step="any"
                className="w-24 rounded border border-[var(--color-border)] bg-white px-2 py-1 text-base font-sans"
              />
            </>
          ) : (
            <>
              <span>X</span>
              <select
                value={direction}
                onChange={e => {
                  const next = e.target.value as CalcDirection
                  if (next === 'ge') setBound(lower)
                  if (next === 'le') setBound(upper)
                  setDirection(next)
                }}
                className="rounded border border-[var(--color-border)] bg-white px-2 py-1 text-base font-sans"
              >
                <option value="le">≤</option>
                <option value="ge">≥</option>
                <option value="between">between</option>
              </select>
              <input
                type="number"
                value={lastEdited === 'probability' && computed.bound !== null ? boundDisplay : bound}
                onChange={e => {
                  setBound(e.target.value)
                  setLastEdited('bound')
                }}
                step="any"
                className="w-28 rounded border border-[var(--color-border)] bg-white px-2 py-1 text-base font-sans"
              />
            </>
          )}
          <span>) =</span>
          <input
            type="number"
            value={
              direction === 'between'
                ? probabilityDisplay
                : lastEdited === 'bound'
                  ? probabilityDisplay
                  : probability
            }
            onChange={e => {
              if (!canInverse) return
              setProbability(e.target.value)
              setLastEdited('probability')
            }}
            readOnly={!canInverse}
            step="any"
            className={`w-32 rounded border border-[var(--color-border)] px-2 py-1 text-base font-sans ${
              !canInverse ? 'bg-slate-100 text-[var(--color-muted)]' : 'bg-white'
            }`}
          />
          <button
            type="button"
            onClick={() => {
              if (direction === 'between') {
                setProbability(probabilityDisplay)
                return
              }
              if (lastEdited === 'probability' && computed.bound !== null) {
                setBound(boundDisplay)
              } else {
                setProbability(probabilityDisplay)
              }
            }}
            className="ml-0 sm:ml-3 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Compute
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <PlotlyChart
          data={chartTraces as never[]}
          layout={{
            xaxis: { zeroline: false, showgrid: true },
            yaxis: { zeroline: false, showticklabels: false, showgrid: false },
            showlegend: false,
            margin: { t: 8, r: 16, b: 36, l: 16 },
            bargap: 0.1,
          }}
        />
      </div>

      <div className="flex-shrink-0 text-center py-2 px-4 bg-slate-50 rounded-xl border border-[var(--color-border)]">
        <span className="text-sm font-mono font-semibold text-[var(--color-text)]">
          {direction === 'between'
            ? `P(${lower} ≤ X ≤ ${upper}) = ${probabilityDisplay || '—'}`
            : direction === 'le'
              ? `P(X ≤ ${lastEdited === 'probability' ? boundDisplay || bound : bound}) = ${lastEdited === 'probability' ? probability : probabilityDisplay || '—'}`
              : `P(X ≥ ${lastEdited === 'probability' ? boundDisplay || bound : bound}) = ${lastEdited === 'probability' ? probability : probabilityDisplay || '—'}`}
        </span>
      </div>
    </div>
  )
}
