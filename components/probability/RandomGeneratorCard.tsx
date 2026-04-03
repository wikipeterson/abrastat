'use client'

import { useMemo, useState } from 'react'

function randomInteger(minValue: number, maxValue: number): number {
  const min = Math.ceil(Math.min(minValue, maxValue))
  const max = Math.floor(Math.max(minValue, maxValue))
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function RandomGeneratorCard() {
  const [minValue, setMinValue] = useState(1)
  const [maxValue, setMaxValue] = useState(10)
  const [count, setCount] = useState(10)
  const [results, setResults] = useState<number[]>([])

  const normalizedMin = Math.min(minValue, maxValue)
  const normalizedMax = Math.max(minValue, maxValue)

  const summary = useMemo(() => {
    if (results.length === 0) {
      return {
        total: 0,
        min: '—',
        max: '—',
        mean: '—',
      }
    }

    const total = results.length
    const observedMin = Math.min(...results)
    const observedMax = Math.max(...results)
    const mean = (results.reduce((sum, value) => sum + value, 0) / total).toFixed(2)

    return {
      total,
      min: observedMin,
      max: observedMax,
      mean,
    }
  }, [results])

  function generate() {
    const next = Array.from({ length: count }, () => randomInteger(normalizedMin, normalizedMax))
    setResults(prev => [...prev, ...next])
  }

  function reset() {
    setResults([])
  }

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_auto_auto] sm:items-end">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Minimum</span>
            <input
              type="number"
              value={minValue}
              onChange={e => setMinValue(Number(e.target.value) || 0)}
              className="w-28 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Maximum</span>
            <input
              type="number"
              value={maxValue}
              onChange={e => setMaxValue(Number(e.target.value) || 0)}
              className="w-28 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">How Many</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
              className="w-28 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generate}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Generate {count}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-[var(--color-text)]">Output</div>
              <div className="text-xs text-[var(--color-muted)]">
                Random integers from {normalizedMin} to {normalizedMax}
              </div>
            </div>
            <div className="text-sm text-[var(--color-muted)]">
              Mean: <span className="font-semibold text-[var(--color-text)]">{summary.mean}</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3 min-h-[140px]">
            {results.length === 0 ? (
              <div className="text-sm text-[var(--color-muted)]">
                No random numbers yet. Set a range and generate values.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {results.map((value, index) => (
                  <span
                    key={`${value}-${index}`}
                    className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 border border-teal-100"
                  >
                    {value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
