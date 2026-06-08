'use client'

import { useMemo, useState } from 'react'
import jStat from 'jstat'
import { PlotlyChart } from '@/components/charts/PlotlyChart'

// ── jStat shim ────────────────────────────────────────────────────────────────

const jS = jStat as unknown as {
  normal: {
    pdf: (x: number, m: number, s: number) => number
    cdf: (x: number, m: number, s: number) => number
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLOR_A     = '#0EA5A0'               // teal  — Distribution A
const COLOR_B     = '#F59E0B'               // amber — Distribution B
const COLOR_D     = '#6366F1'               // indigo — Difference
const SHADE_D     = 'rgba(99,102,241,0.22)' // indigo fill for shaded region

type ProbMode = 'gt' | 'dgt' | 'dlt' | 'between'

const PROB_MODES: { value: ProbMode; label: string }[] = [
  { value: 'gt',      label: 'P(A > B)' },
  { value: 'dgt',     label: 'P(A − B > c)' },
  { value: 'dlt',     label: 'P(A − B < c)' },
  { value: 'between', label: 'P(lower < A − B < upper)' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalCdf(x: number, mu: number, sigma: number): number {
  try { return jS.normal.cdf(x, mu, sigma) } catch { return 0 }
}

function normalPdf(x: number, mu: number, sigma: number): number {
  try { return jS.normal.pdf(x, mu, sigma) } catch { return 0 }
}

function linspace(lo: number, hi: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(lo + (hi - lo) * (i / (n - 1)))
  return out
}

function safeNum(s: string, fb: number): number {
  const n = parseFloat(s); return isFinite(n) ? n : fb
}

function safeSd(s: string, fb = 1): number {
  const n = parseFloat(s); return n > 0 && isFinite(n) ? n : fb
}

function fmt(n: number, d = 4): string {
  return Number(n.toFixed(d)).toString()
}

// ── Shared numeric input ──────────────────────────────────────────────────────

function NInput({
  label, value, onChange, min,
}: { label: string; value: string; onChange: (v: string) => void; min?: string }) {
  return (
    <label className="flex items-center gap-1.5 select-none">
      <span className="text-xs text-[var(--color-muted)] font-medium whitespace-nowrap">{label}</span>
      <input
        type="number" value={value} min={min} step="any"
        onChange={e => onChange(e.target.value)}
        className="w-full min-w-0 px-1.5 py-0.5 rounded border border-[var(--color-border)] text-sm
                   text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]
                   focus:ring-1 focus:ring-[var(--color-accent-light)]"
      />
    </label>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CompareNormalsCard() {
  // Distribution A
  const [nameA, setNameA] = useState('A')
  const [muAStr, setMuAStr] = useState('100')
  const [sdAStr, setSdAStr] = useState('15')

  // Distribution B
  const [nameB, setNameB] = useState('B')
  const [muBStr, setMuBStr] = useState('90')
  const [sdBStr, setSdBStr] = useState('10')

  // Probability controls
  const [mode,  setMode]  = useState<ProbMode>('gt')
  const [cStr,  setCStr]  = useState('0')
  const [loStr, setLoStr] = useState('0')
  const [hiStr, setHiStr] = useState('10')

  // ── Validated parameters ──────────────────────────────────────────────────
  const muA = safeNum(muAStr, 100)
  const sdA = safeSd(sdAStr, 15)
  const muB = safeNum(muBStr, 90)
  const sdB = safeSd(sdBStr, 10)

  // D = A − B  (independent normals)
  const muD = muA - muB
  const sdD = Math.sqrt(sdA ** 2 + sdB ** 2)

  const lblA = nameA || 'A'
  const lblB = nameB || 'B'

  // ── Probability calculation ───────────────────────────────────────────────
  const calc = useMemo(() => {
    const c  = safeNum(cStr,  0)
    const lo = safeNum(loStr, 0)
    const hi = safeNum(hiStr, 10)
    let prob = 0
    let zScores: string[] = []
    let shadeLo = -Infinity
    let shadeHi =  Infinity
    let threshLabel = ''

    switch (mode) {
      case 'gt': {
        // P(A > B) = P(D > 0)
        const z = (0 - muD) / sdD
        prob = 1 - normalCdf(0, muD, sdD)
        zScores = [`z = (0 − ${fmt(muD, 3)}) / ${fmt(sdD, 3)} = ${fmt(z)}`]
        shadeLo = 0
        threshLabel = `P(${lblA} > ${lblB})`
        break
      }
      case 'dgt': {
        const z = (c - muD) / sdD
        prob = 1 - normalCdf(c, muD, sdD)
        zScores = [`z = (${fmt(c, 3)} − ${fmt(muD, 3)}) / ${fmt(sdD, 3)} = ${fmt(z)}`]
        shadeLo = c
        threshLabel = `P(D > ${fmt(c, 3)})`
        break
      }
      case 'dlt': {
        const z = (c - muD) / sdD
        prob = normalCdf(c, muD, sdD)
        zScores = [`z = (${fmt(c, 3)} − ${fmt(muD, 3)}) / ${fmt(sdD, 3)} = ${fmt(z)}`]
        shadeHi = c
        threshLabel = `P(D < ${fmt(c, 3)})`
        break
      }
      case 'between': {
        const zL = (lo - muD) / sdD
        const zH = (hi - muD) / sdD
        prob = normalCdf(hi, muD, sdD) - normalCdf(lo, muD, sdD)
        zScores = [
          `z₁ = (${fmt(lo, 3)} − ${fmt(muD, 3)}) / ${fmt(sdD, 3)} = ${fmt(zL)}`,
          `z₂ = (${fmt(hi, 3)} − ${fmt(muD, 3)}) / ${fmt(sdD, 3)} = ${fmt(zH)}`,
        ]
        shadeLo = lo
        shadeHi = hi
        threshLabel = `P(${fmt(lo, 3)} < D < ${fmt(hi, 3)})`
        break
      }
    }

    return { prob: Math.max(0, Math.min(1, prob)), zScores, shadeLo, shadeHi, threshLabel }
  }, [mode, cStr, loStr, hiStr, muD, sdD, lblA, lblB])

  // ── Chart: individual distributions overlaid ──────────────────────────────
  const indivData = useMemo(() => {
    const xMin = Math.min(muA - 4.5 * sdA, muB - 4.5 * sdB)
    const xMax = Math.max(muA + 4.5 * sdA, muB + 4.5 * sdB)
    const xs = linspace(xMin, xMax, 320)
    return [
      {
        type: 'scatter' as const, mode: 'lines' as const,
        name: lblA,
        x: xs, y: xs.map(x => normalPdf(x, muA, sdA)),
        line: { color: COLOR_A, width: 2.5 },
        fill: 'tozeroy' as const, fillcolor: COLOR_A + '18',
      },
      {
        type: 'scatter' as const, mode: 'lines' as const,
        name: lblB,
        x: xs, y: xs.map(x => normalPdf(x, muB, sdB)),
        line: { color: COLOR_B, width: 2.5 },
        fill: 'tozeroy' as const, fillcolor: COLOR_B + '18',
      },
    ]
  }, [muA, sdA, muB, sdB, lblA, lblB])

  // ── Chart: difference distribution with shaded region ────────────────────
  const diffData = useMemo(() => {
    const xMin = muD - 4.5 * sdD
    const xMax = muD + 4.5 * sdD
    const xs = linspace(xMin, xMax, 320)
    const { shadeLo, shadeHi } = calc

    // Shaded polygon (fill: toself)
    const sxs = xs.filter(x => x >= shadeLo && x <= shadeHi)
    const shadeTrace = sxs.length > 1
      ? {
          type: 'scatter' as const, mode: 'none' as const,
          x: [sxs[0], ...sxs, sxs[sxs.length - 1]],
          y: [0, ...sxs.map(x => normalPdf(x, muD, sdD)), 0],
          fill: 'toself' as const, fillcolor: SHADE_D,
          line: { color: 'transparent' as const },
          hoverinfo: 'skip' as const, showlegend: false,
        }
      : null

    const curveTrace = {
      type: 'scatter' as const, mode: 'lines' as const,
      name: `${lblA} − ${lblB}`,
      x: xs, y: xs.map(x => normalPdf(x, muD, sdD)),
      line: { color: COLOR_D, width: 2.5 },
      showlegend: false,
    }

    return [shadeTrace, curveTrace].filter(Boolean)
  }, [muD, sdD, calc, lblA, lblB])

  // Dashed vertical line(s) in the difference chart
  const diffShapes = useMemo(() => {
    const c  = safeNum(cStr,  0)
    const lo = safeNum(loStr, 0)
    const hi = safeNum(hiStr, 10)
    const mkLine = (x: number) => ({
      type: 'line', x0: x, x1: x, y0: 0, y1: 1, yref: 'paper',
      line: { color: '#1E293B', width: 1.5, dash: 'dash' },
    })
    if (mode === 'gt')      return [mkLine(0)]
    if (mode === 'dgt')     return [mkLine(c)]
    if (mode === 'dlt')     return [mkLine(c)]
    if (mode === 'between') return [mkLine(lo), mkLine(hi)]
    return []
  }, [mode, cStr, loStr, hiStr])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col gap-0 overflow-hidden">
      <div className="flex flex-col md:flex-row gap-3 p-3 h-full overflow-y-auto">

        {/* ── Left: inputs ──────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-full md:w-56 flex flex-col gap-2.5">

          {/* Distribution A */}
          <div className="rounded-xl border border-[var(--color-border)] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLOR_A }} />
              <input
                value={nameA} onChange={e => setNameA(e.target.value)}
                className="text-sm font-bold text-[var(--color-text)] bg-transparent border-b border-dashed
                           border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NInput label="μ" value={muAStr} onChange={setMuAStr} />
              <NInput label="σ" value={sdAStr} onChange={setSdAStr} min="0.001" />
            </div>
            <p className="text-[10px] text-[var(--color-muted)] font-mono">
              N({fmt(muA, 2)}, {fmt(sdA, 2)})
            </p>
          </div>

          {/* Distribution B */}
          <div className="rounded-xl border border-[var(--color-border)] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLOR_B }} />
              <input
                value={nameB} onChange={e => setNameB(e.target.value)}
                className="text-sm font-bold text-[var(--color-text)] bg-transparent border-b border-dashed
                           border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NInput label="μ" value={muBStr} onChange={setMuBStr} />
              <NInput label="σ" value={sdBStr} onChange={setSdBStr} min="0.001" />
            </div>
            <p className="text-[10px] text-[var(--color-muted)] font-mono">
              N({fmt(muB, 2)}, {fmt(sdB, 2)})
            </p>
          </div>

          {/* Derived: D = A − B */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLOR_D }} />
              <span className="text-sm font-bold text-[var(--color-text)]">{lblA} − {lblB}</span>
            </div>
            <div className="text-[10px] text-[var(--color-muted)] font-mono space-y-0.5 leading-relaxed">
              <div>μ<sub>D</sub> = {fmt(muA,2)} − {fmt(muB,2)} = <b className="text-[var(--color-text)]">{fmt(muD,4)}</b></div>
              <div>σ<sub>D</sub> = √({fmt(sdA,2)}²+{fmt(sdB,2)}²) = <b className="text-[var(--color-text)]">{fmt(sdD,4)}</b></div>
            </div>
            <p className="text-[10px] text-[var(--color-muted)] font-mono">
              D ~ N({fmt(muD,3)}, {fmt(sdD,3)})
            </p>
          </div>

          {/* Probability controls */}
          <div className="rounded-xl border border-[var(--color-border)] p-3 space-y-2.5">
            <div className="text-xs font-mono font-bold uppercase tracking-wide text-[var(--color-muted)]">Probability</div>

            <select
              value={mode} onChange={e => setMode(e.target.value as ProbMode)}
              className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs bg-white
                         text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
            >
              {PROB_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            {(mode === 'dgt' || mode === 'dlt') && (
              <NInput label="c =" value={cStr} onChange={setCStr} />
            )}
            {mode === 'between' && (
              <div className="space-y-1.5">
                <NInput label="lower" value={loStr} onChange={setLoStr} />
                <NInput label="upper" value={hiStr} onChange={setHiStr} />
              </div>
            )}

            {/* z-score(s) */}
            {calc.zScores.length > 0 && (
              <div className="text-[10px] text-[var(--color-muted)] font-mono space-y-0.5 break-all">
                {calc.zScores.map((z, i) => <div key={i}>{z}</div>)}
              </div>
            )}

            {/* Result */}
            <div className="rounded-lg bg-[var(--color-accent-light)] border border-[var(--color-accent)]/30
                            px-3 py-2 text-center">
              <div className="text-[10px] text-[var(--color-accent)] font-medium mb-0.5">
                {calc.threshLabel}
              </div>
              <div className="text-2xl font-mono tabular-nums font-black text-[var(--color-text)]">
                {calc.prob.toFixed(4)}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: charts ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">

          {/* Individual distributions */}
          <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
            <div className="text-[10px] text-[var(--color-muted)] font-medium mb-0.5 ml-1">
              Individual Distributions
            </div>
            <PlotlyChart
              data={indivData as never[]}
              layout={{
                showlegend: true,
                legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.18, font: { size: 11 } },
                xaxis: { zeroline: false, title: { text: 'Value', font: { size: 11 } } },
                yaxis: { zeroline: false, showticklabels: false, showgrid: false },
                margin: { t: 6, r: 14, b: 46, l: 14 },
              }}
              height={200}
              mode="fixed"
            />
          </div>

          {/* Difference distribution */}
          <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
            <div className="text-[10px] text-[var(--color-muted)] font-medium mb-0.5 ml-1">
              Difference Distribution &nbsp;
              <span className="font-mono" style={{ color: COLOR_D }}>
                D = {lblA} − {lblB}
              </span>
              &nbsp;· shaded area = {calc.prob.toFixed(4)}
            </div>
            <PlotlyChart
              data={diffData as never[]}
              layout={{
                showlegend: false,
                xaxis: {
                  zeroline: true, zerolinecolor: '#CBD5E1', zerolinewidth: 1.5,
                  title: { text: `${lblA} − ${lblB}`, font: { size: 11 } },
                },
                yaxis: { zeroline: false, showticklabels: false, showgrid: false },
                shapes: diffShapes as never[],
                margin: { t: 6, r: 14, b: 46, l: 14 },
              }}
              height={200}
              mode="fixed"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
