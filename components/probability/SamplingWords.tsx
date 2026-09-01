'use client'

import { useState, useCallback, useRef } from 'react'
import { GETTYSBURG, POP_MEAN, POP_SIZE, type GbWord } from '@/lib/gettysburg'

// ── constants ────────────────────────────────────────────────────────────────

const SAMPLE_SIZES = [5, 20, 50]
const X_MIN = 1.0
const X_MAX = 9.0
const BIN_WIDTH = 0.1
const DOT_R = 3        // SVG dot radius
const DOT_SLOT = 7     // height occupied by one stacked dot
const SVG_W = 560
const SVG_H = 215
const MT = 28          // margin top (for pop-mean label)
const MB = 48          // margin bottom (axis labels)
const ML = 10
const MR = 10
const DAH = SVG_H - MT - MB   // dot area height = 139
const PW  = SVG_W - ML - MR   // plot width = 540

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
      className="rounded-2xl border overflow-hidden shadow-sm"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div className="px-4 py-2.5 border-b flex items-baseline justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <span
            className="font-semibold text-sm"
            style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text)' }}
          >
            Random samples of {size} words
          </span>
          <span className="ml-2 text-xs" style={{ color: 'var(--color-muted)' }}>
            Each dot is one sample mean.
          </span>
        </div>
        <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
          {means.length > 0 ? `${means.length.toLocaleString()} samples` : ''}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex items-center justify-center py-8 px-6">
          <p
            className="text-sm text-center"
            style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-muted)' }}
          >
            Run some random samples to see where the sample means land.
          </p>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ width: '100%', display: 'block' }}
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
              <circle key={i} cx={c.cx} cy={c.cy} r={DOT_R} fill="var(--color-accent)" opacity={0.7} />
            ))}
          </g>

          {/* highlight dot (on top, with pop animation) */}
          {circles.filter(c => c.hl).map(c => (
            <circle key={`hl-${highlightKey}`} cx={c.cx} cy={c.cy} r={DOT_R} fill="var(--color-gold)" opacity={1}>
              <animate attributeName="r" values="0;5;3" dur="0.35s" fill="freeze" />
              <animate attributeName="opacity" values="0;1;1" dur="0.35s" fill="freeze" />
            </circle>
          ))}

          {/* population mean reference line */}
          <line
            x1={popX} y1={MT - 2} x2={popX} y2={MT + DAH}
            stroke="var(--color-gold)" strokeWidth={1.5} strokeDasharray="4,2"
          />
          <text
            x={popX} y={MT - 8}
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--color-gold-text)', fontWeight: 600 }}
          >
            Population mean = {POP_MEAN}
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
                  x={tx} y={MT + DAH + 15}
                  textAnchor="middle"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--color-muted)' }}
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
            style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fill: 'var(--color-muted)' }}
          >
            average word length (letters)
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
  size: number
}

export function SamplingWords() {
  const [activeSizes, setActiveSizes] = useState<Set<number>>(new Set([5, 20, 50]))
  const [results, setResults] = useState<Record<number, number[]>>({ 5: [], 20: [], 50: [] })
  const [spotlightSize, setSpotlightSize] = useState(5)
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
      if (!activeSizes.has(size)) continue
      const sample = drawSample(size)
      const m = meanOf(sample)
      newResults[size] = [...(newResults[size] ?? []), m]
      if (size === spotlightSize) spotSample = sample
    }

    if (spotSample) {
      const sm = meanOf(spotSample)
      setLastSample({ words: spotSample, mean: sm, size: spotlightSize })
      setHl(sm, newKey)
    }

    setResults(newResults)
  }, [results, activeSizes, spotlightSize, highlightKey, setHl])

  const handleDrawMany = useCallback((n: number) => {
    setLastSample(null)
    setHighlightMean(null)
    const newResults = { ...results }
    for (const size of SAMPLE_SIZES) {
      if (!activeSizes.has(size)) continue
      const acc: number[] = []
      for (let i = 0; i < n; i++) {
        acc.push(meanOf(drawSample(size)))
      }
      newResults[size] = [...(newResults[size] ?? []), ...acc]
    }
    setResults(newResults)
  }, [results, activeSizes])

  const handleReset = useCallback(() => {
    setResults({ 5: [], 20: [], 50: [] })
    setLastSample(null)
    setHighlightMean(null)
  }, [])

  const toggleSize = useCallback((size: number) => {
    setActiveSizes(prev => {
      if (prev.has(size) && prev.size === 1) return prev
      const next = new Set(prev)
      if (next.has(size)) {
        next.delete(size)
        if (spotlightSize === size) {
          setSpotlightSize([...next][0])
        }
      } else {
        next.add(size)
      }
      return next
    })
  }, [spotlightSize])

  const activeSizesSorted = SAMPLE_SIZES.filter(s => activeSizes.has(s))
  const totalLabel = hasSims
    ? `${totalSamples.toLocaleString()} random sample${totalSamples !== 1 ? 's' : ''} for each active size`
    : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className="rounded-2xl border overflow-hidden shadow-sm"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text)' }}
          >
            Sampling Words
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--color-muted)' }}>
            How does sample size affect the precision of a sample mean?
          </p>
        </div>
        <div className="px-6 py-4" style={{ background: 'var(--color-bg)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>
            The Gettysburg Address has{' '}
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{POP_SIZE}</span>{' '}
            words. Treat the words as a population and repeatedly take random samples. Each dot below
            represents the average word length in one random sample.
          </p>
        </div>
      </div>

      {/* Main: controls left, dot plots right */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: '260px 1fr' }}>

        {/* ── Left column: controls ── */}
        <div className="space-y-3">

          {/* Sample size chips */}
          <div
            className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}
              >
                Sample sizes
              </p>
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {SAMPLE_SIZES.map(s => {
                const active = activeSizes.has(s)
                return (
                  <button
                    key={s}
                    onClick={() => toggleSize(s)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: active ? 'var(--color-accent)' : 'var(--color-bg)',
                      color: active ? 'white' : 'var(--color-muted)',
                      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      cursor: 'pointer',
                    }}
                    aria-pressed={active}
                  >
                    n = {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Simulation controls */}
          <div
            className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}
              >
                Draw samples
              </p>
            </div>
            <div className="px-4 py-3 space-y-2">
              <button
                onClick={handleDrawOne}
                disabled={activeSizes.size === 0}
                className="w-full px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: 'var(--color-accent)',
                  color: 'white',
                  cursor: activeSizes.size > 0 ? 'pointer' : 'not-allowed',
                  opacity: activeSizes.size > 0 ? 1 : 0.5,
                }}
              >
                Draw 1 sample
              </button>
              <div className="flex gap-2">
                {[10, 100, 1000].map(n => (
                  <button
                    key={n}
                    onClick={() => handleDrawMany(n)}
                    disabled={activeSizes.size === 0}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                      cursor: activeSizes.size > 0 ? 'pointer' : 'not-allowed',
                      opacity: activeSizes.size > 0 ? 1 : 0.5,
                    }}
                  >
                    {n.toLocaleString()}
                  </button>
                ))}
              </div>
              <button
                onClick={handleReset}
                className="w-full py-1.5 rounded-lg text-xs font-medium transition-all"
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
                <p
                  className="text-xs text-center pt-1"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}
                >
                  {totalLabel}
                </p>
              )}
            </div>
          </div>

          {/* Spotlight selector (shown when 2+ sizes active) */}
          {activeSizes.size > 1 && (
            <div
              className="rounded-2xl border overflow-hidden shadow-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <p
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}
                >
                  Show words for
                </p>
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {activeSizesSorted.map(s => (
                  <button
                    key={s}
                    onClick={() => setSpotlightSize(s)}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      background: spotlightSize === s ? 'var(--color-gold-light)' : 'var(--color-bg)',
                      color: spotlightSize === s ? 'var(--color-gold-text)' : 'var(--color-muted)',
                      border: `1px solid ${spotlightSize === s ? 'var(--color-gold)' : 'var(--color-border)'}`,
                      fontWeight: spotlightSize === s ? 600 : 400,
                      cursor: 'pointer',
                    }}
                    aria-pressed={spotlightSize === s}
                  >
                    n = {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Last sample detail */}
          {lastSample && (
            <div
              className="rounded-2xl border overflow-hidden shadow-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <p
                  className="text-xs font-semibold"
                  style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text)' }}
                >
                  Sample of {lastSample.size} words
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th className="px-3 py-1.5 text-left font-semibold" style={{ color: 'var(--color-muted)' }}>ID</th>
                      <th className="px-3 py-1.5 text-left font-semibold" style={{ color: 'var(--color-muted)' }}>Word</th>
                      <th className="px-3 py-1.5 text-right font-semibold" style={{ color: 'var(--color-muted)' }}>Letters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastSample.words.map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid var(--color-bg)' }}>
                        <td className="px-3 py-1" style={{ color: 'var(--color-muted)' }}>{w.id}</td>
                        <td className="px-3 py-1" style={{ color: 'var(--color-text)' }}>{w.word}</td>
                        <td className="px-3 py-1 text-right font-bold" style={{ color: 'var(--color-accent-strong)' }}>{w.letters}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="px-4 py-2.5 border-t"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
              >
                <p className="text-xs" style={{ color: 'var(--color-text)' }}>
                  Sample mean ={' '}
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-gold-text)' }}>
                    {lastSample.mean.toFixed(2)}
                  </span>{' '}
                  letters
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: dot plots ── */}
        <div className="space-y-3">
          {activeSizesSorted.map(size => (
            <DotPlot
              key={size}
              size={size}
              means={results[size] ?? []}
              highlightMean={size === spotlightSize ? highlightMean : null}
              highlightKey={highlightKey}
            />
          ))}
          {activeSizes.size === 0 && (
            <div
              className="rounded-2xl border flex items-center justify-center py-12"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                Select at least one sample size to begin.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary card */}
      {hasSims && (
        <div
          className="rounded-2xl border overflow-hidden shadow-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <h2
              className="text-base font-semibold"
              style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text)' }}
            >
              What do you notice?
            </h2>
          </div>
          <div className="px-6 py-4 space-y-2" style={{ background: 'var(--color-bg)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>
              All of the distributions are centered near the population mean. The larger samples produce
              means that are closer together.
            </p>
            {activeSizes.size >= 2 && (
              <p className="text-sm" style={{ color: 'var(--color-text)' }}>
                This is why larger random samples give more precise estimates of a population mean.
                <span className="ml-1 italic" style={{ color: 'var(--color-muted)' }}>
                  Precision means that repeated sample means are closer together.
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Population view */}
      <div
        className="rounded-2xl border overflow-hidden shadow-sm"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <button
          onClick={() => setShowPopulation(v => !v)}
          className="w-full px-6 py-3 flex items-center justify-between text-left"
          style={{ background: 'var(--color-bg)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            View the population of {POP_SIZE} words
          </span>
          <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>
            {showPopulation ? '▲ hide' : '▼ show'}
          </span>
        </button>

        {showPopulation && (
          <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
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
            <div
              className="px-4 py-2 border-t text-right"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
            >
              <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                Population mean = {POP_MEAN} letters &nbsp;·&nbsp; {POP_SIZE} words
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
