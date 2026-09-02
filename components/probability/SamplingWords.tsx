'use client'

import { useState, useCallback, useRef } from 'react'
import { GETTYSBURG, POP_MEAN, POP_SIZE, type GbWord } from '@/lib/gettysburg'

// ── constants ────────────────────────────────────────────────────────────────

const SAMPLE_SIZES = [5, 20, 50]
const X_MIN = 1.0
const X_MAX = 9.0
const BIN_WIDTH = 0.15
const DOT_R = 3
const DOT_SLOT = 7

// SVG viewBox — wider panels since plots stack vertically in a flex-1 right column
const SVG_W = 520
const SVG_H = 130
const MT = 18   // margin top (pop-mean label)
const MB = 34   // margin bottom (axis)
const ML = 8
const MR = 8
const DAH = SVG_H - MT - MB   // dot area height = 107
const PW  = SVG_W - ML - MR   // plot width = 504

// ── helpers ──────────────────────────────────────────────────────────────────

function xScale(v: number): number {
  return ML + ((v - X_MIN) / (X_MAX - X_MIN)) * PW
}

function binOf(v: number): number {
  return Math.round(v / BIN_WIDTH) * BIN_WIDTH
}

function drawSample(n: number): GbWord[] {
  const copy = GETTYSBURG.slice()
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i))
    const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
  }
  return copy.slice(0, n)
}

function meanOf(words: GbWord[]): number {
  return words.reduce((s, w) => s + w.letters, 0) / words.length
}

// ── DotPlot ──────────────────────────────────────────────────────────────────

function DotPlot({
  size,
  means,
  highlightMean,
  highlightKey,
}: {
  size: number
  means: number[]
  highlightMean: number | null
  highlightKey: number
}) {
  const bins = new Map<number, number>()
  for (const m of means) {
    const b = binOf(m)
    bins.set(b, (bins.get(b) ?? 0) + 1)
  }

  const hlBin = highlightMean !== null ? binOf(highlightMean) : null

  type Dot = { cx: number; cy: number; hl: boolean }
  const circles: Dot[] = []
  for (const [bv, count] of bins.entries()) {
    const cx = xScale(bv)
    const isHlBin = hlBin !== null && Math.abs(bv - hlBin) < 0.001
    for (let i = 0; i < count; i++) {
      const cy = MT + DAH - DOT_R - i * DOT_SLOT
      if (cy < MT) break
      circles.push({ cx, cy, hl: isHlBin && i === count - 1 })
    }
  }

  const popX = xScale(POP_MEAN)
  const ticks = [2, 3, 4, 5, 6, 7, 8]
  const isEmpty = means.length === 0

  return (
    <div
      className="rounded-2xl border overflow-hidden shadow-sm flex flex-col"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      {/* panel header */}
      <div className="px-3 py-2 border-b flex items-baseline justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <span
          className="font-semibold text-sm"
          style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text)' }}
        >
          n = {size} words
        </span>
        {means.length > 0 && (
          <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
            {means.length.toLocaleString()} samples
          </span>
        )}
      </div>

      {/* dot plot or empty state */}
      {isEmpty ? (
        <div className="flex items-center justify-center py-6 px-3 flex-1">
          <p
            className="text-xs text-center"
            style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-muted)' }}
          >
            Run samples to see where the means land.
          </p>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ width: '100%' }}
          role="img"
          aria-label={`Dot plot of sample means for n=${size}`}
        >
          <defs>
            <clipPath id={`sw-clip-${size}`}>
              <rect x={ML} y={MT} width={PW} height={DAH} />
            </clipPath>
          </defs>

          {/* regular dots */}
          <g clipPath={`url(#sw-clip-${size})`}>
            {circles.filter(c => !c.hl).map((c, i) => (
              <circle key={i} cx={c.cx} cy={c.cy} r={DOT_R} fill="var(--color-accent)" opacity={0.72} />
            ))}
          </g>

          {/* highlight dot */}
          {circles.filter(c => c.hl).map(c => (
            <circle key={`hl-${highlightKey}`} cx={c.cx} cy={c.cy} r={DOT_R} fill="var(--color-gold)" opacity={1}>
              <animate attributeName="r" values="0;5;3" dur="0.35s" fill="freeze" />
              <animate attributeName="opacity" values="0;1;1" dur="0.35s" fill="freeze" />
            </circle>
          ))}

          {/* population mean reference line */}
          <line x1={popX} y1={MT - 2} x2={popX} y2={MT + DAH} stroke="var(--color-gold)" strokeWidth={1.5} strokeDasharray="4,2" />
          <text
            x={popX} y={MT - 6}
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--color-gold-text)', fontWeight: 600 }}
          >
            {POP_MEAN}
          </text>

          {/* baseline */}
          <line x1={ML} y1={MT + DAH} x2={SVG_W - MR} y2={MT + DAH} stroke="var(--color-border)" strokeWidth={1} />

          {/* ticks + labels */}
          {ticks.map(t => {
            const tx = xScale(t)
            return (
              <g key={t}>
                <line x1={tx} y1={MT + DAH} x2={tx} y2={MT + DAH + 4} stroke="var(--color-border)" strokeWidth={1} />
                <text
                  x={tx} y={MT + DAH + 14}
                  textAnchor="middle"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--color-muted)' }}
                >
                  {t}
                </text>
              </g>
            )
          })}

          {/* axis label */}
          <text
            x={SVG_W / 2} y={SVG_H - 4}
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 9, fill: 'var(--color-muted)' }}
          >
            avg word length (letters)
          </text>
        </svg>
      )}
    </div>
  )
}

// ── SamplingWords ─────────────────────────────────────────────────────────────

interface LastSample {
  words: GbWord[]
  mean: number
}

export function SamplingWords() {
  const [results, setResults] = useState<Record<number, number[]>>({ 5: [], 20: [], 50: [] })
  const [lastSample, setLastSample] = useState<LastSample | null>(null)
  const [highlightMean, setHighlightMean] = useState<number | null>(null)
  const [highlightKey, setHighlightKey] = useState(0)
  const [showPopulation, setShowPopulation] = useState(false)
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalSamples = Math.max(...SAMPLE_SIZES.map(s => results[s]?.length ?? 0))
  const hasSims = totalSamples > 0

  const setHl = useCallback((mean: number, key: number) => {
    if (hlTimer.current) clearTimeout(hlTimer.current)
    setHighlightMean(mean)
    setHighlightKey(key)
    hlTimer.current = setTimeout(() => setHighlightMean(null), 900)
  }, [])

  const handleDrawOne = useCallback(() => {
    const newKey = highlightKey + 1
    const newResults = { ...results }
    let spotSample: GbWord[] | null = null

    for (const size of SAMPLE_SIZES) {
      const sample = drawSample(size)
      const m = meanOf(sample)
      newResults[size] = [...(newResults[size] ?? []), m]
      if (size === SAMPLE_SIZES[0]) spotSample = sample
    }

    if (spotSample) {
      const sm = meanOf(spotSample)
      setLastSample({ words: spotSample, mean: sm })
      setHl(sm, newKey)
    }

    setResults(newResults)
  }, [results, highlightKey, setHl])

  const handleDrawMany = useCallback((n: number) => {
    setLastSample(null)
    setHighlightMean(null)
    const newResults = { ...results }
    for (const size of SAMPLE_SIZES) {
      const acc: number[] = []
      for (let i = 0; i < n; i++) acc.push(meanOf(drawSample(size)))
      newResults[size] = [...(newResults[size] ?? []), ...acc]
    }
    setResults(newResults)
  }, [results])

  const handleReset = useCallback(() => {
    setResults({ 5: [], 20: [], 50: [] })
    setLastSample(null)
    setHighlightMean(null)
  }, [])

  const totalLabel = hasSims
    ? `${totalSamples.toLocaleString()} sample${totalSamples !== 1 ? 's' : ''} per size`
    : null

  return (
    <div className="space-y-3">

      {/* Two-column layout: left = header + controls, right = stacked dot plots */}
      <div className="grid gap-3 items-start" style={{ gridTemplateColumns: '236px 1fr' }}>

        {/* ── Left column ── */}
        <div className="flex flex-col gap-3">

          {/* Header card */}
          <div
            className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h1
                className="text-lg font-semibold"
                style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text)' }}
              >
                Sampling Words
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                How does sample size affect the precision of a sample mean?
              </p>
            </div>
            <div className="px-4 py-3" style={{ background: 'var(--color-bg)' }}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>
                The Gettysburg Address has{' '}
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{POP_SIZE}</span>{' '}
                words. Treat the words as a population and repeatedly take random samples. Each dot
                represents the average word length in one random sample.
              </p>
            </div>
          </div>

          {/* Controls card */}
          <div
            className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div className="px-4 py-3 flex flex-col gap-2.5">
              <button
                onClick={handleDrawOne}
                className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-left"
                style={{ background: 'var(--color-accent)', color: 'white', cursor: 'pointer' }}
              >
                Draw 1 sample
              </button>

              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Draw</span>
                {[10].map(n => (
                  <button
                    key={n}
                    onClick={() => handleDrawMany(n)}
                    className="flex-1 px-2 py-2 rounded-lg text-sm font-semibold"
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {n.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    color: 'var(--color-danger)',
                    border: '1px solid var(--color-danger-light)',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
                {totalLabel && (
                  <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                    {totalLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Sample detail */}
            {lastSample && (
              <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                <p className="text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  n = {SAMPLE_SIZES[0]} words
                </p>
                <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th className="pb-1 text-left font-semibold" style={{ color: 'var(--color-muted)' }}>ID</th>
                      <th className="pb-1 text-left font-semibold" style={{ color: 'var(--color-muted)' }}>Word</th>
                      <th className="pb-1 text-right font-semibold" style={{ color: 'var(--color-muted)' }}>Len</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastSample.words.map(w => (
                      <tr key={w.id}>
                        <td className="py-0.5" style={{ color: 'var(--color-muted)' }}>{w.id}</td>
                        <td className="py-0.5 pr-1" style={{ color: 'var(--color-text)' }}>{w.word}</td>
                        <td className="py-0.5 text-right font-bold" style={{ color: 'var(--color-accent-strong)' }}>{w.letters}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs mt-2" style={{ color: 'var(--color-text)' }}>
                  Mean ={' '}
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-gold-text)', fontSize: 15 }}>
                    {lastSample.mean.toFixed(2)}
                  </span>{' '}
                  letters
                </p>
              </div>
            )}
          </div>

          {/* Summary (appears once there are sims, lives in left column) */}
          {hasSims && (
            <div
              className="rounded-2xl border overflow-hidden shadow-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <div className="px-4 py-3" style={{ background: 'var(--color-bg)' }}>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>
                  All three distributions center near the population mean.
                  Larger samples produce means that cluster more tightly — this is
                  <em style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}> precision</em>:
                  repeated sample means are closer together when n is large.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* ── Right column: three dot plots stacked vertically ── */}
        <div className="flex flex-col gap-3">
          {SAMPLE_SIZES.map(size => (
            <DotPlot
              key={size}
              size={size}
              means={results[size] ?? []}
              highlightMean={size === SAMPLE_SIZES[0] ? highlightMean : null}
              highlightKey={highlightKey}
            />
          ))}
        </div>

      </div>

      {/* Population view (full width, below grid) */}
      <div
        className="rounded-2xl border overflow-hidden shadow-sm"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <button
          onClick={() => setShowPopulation(v => !v)}
          className="w-full px-5 py-2.5 flex items-center justify-between text-left"
          style={{ background: 'var(--color-bg)', cursor: 'pointer' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            View the population of {POP_SIZE} words
          </span>
          <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>
            {showPopulation ? '▲ hide' : '▼ show'}
          </span>
        </button>

        {showPopulation && (
          <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                <thead className="sticky top-0" style={{ background: 'var(--color-bg)' }}>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th className="px-4 py-2 text-left font-semibold" style={{ color: 'var(--color-muted)' }}>ID</th>
                    <th className="px-4 py-2 text-left font-semibold" style={{ color: 'var(--color-muted)' }}>Word</th>
                    <th className="px-4 py-2 text-right font-semibold" style={{ color: 'var(--color-muted)' }}>Letters</th>
                  </tr>
                </thead>
                <tbody>
                  {GETTYSBURG.map(w => (
                    <tr key={w.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td className="px-4 py-1" style={{ color: 'var(--color-muted)' }}>{w.id}</td>
                      <td className="px-4 py-1" style={{ color: 'var(--color-text)' }}>{w.word}</td>
                      <td className="px-4 py-1 text-right font-semibold" style={{ color: 'var(--color-accent-strong)' }}>{w.letters}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t text-right" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
              <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                Population mean = {POP_MEAN} letters · {POP_SIZE} words
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
