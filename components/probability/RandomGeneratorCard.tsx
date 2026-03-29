'use client'

import { useState } from 'react'

type GeneratorMode = 'coin' | 'die'
type CoinFace = 'Heads' | 'Tails'

function randomCoin(): CoinFace {
  return Math.random() < 0.5 ? 'Heads' : 'Tails'
}

function randomDie(): number {
  return 1 + Math.floor(Math.random() * 6)
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-base font-semibold text-[var(--color-text)]">{value}</div>
    </div>
  )
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-text)]">{label}</span>
        <span className="font-mono text-[var(--color-muted)]">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function RandomGeneratorCard() {
  const [mode, setMode] = useState<GeneratorMode>('coin')
  const [trials, setTrials] = useState(10)
  const [coinHistory, setCoinHistory] = useState<CoinFace[]>([])
  const [dieHistory, setDieHistory] = useState<number[]>([])

  const lastCoin = coinHistory[coinHistory.length - 1] ?? null
  const lastDie = dieHistory[dieHistory.length - 1] ?? null

  const heads = coinHistory.filter(v => v === 'Heads').length
  const tails = coinHistory.length - heads
  const dieCounts = [1, 2, 3, 4, 5, 6].map(face => ({
    face,
    count: dieHistory.filter(v => v === face).length,
  }))
  const dieMax = Math.max(0, ...dieCounts.map(d => d.count))

  function runSingle() {
    if (mode === 'coin') {
      setCoinHistory(prev => [...prev, randomCoin()])
      return
    }
    setDieHistory(prev => [...prev, randomDie()])
  }

  function runMany() {
    if (mode === 'coin') {
      const next = Array.from({ length: trials }, () => randomCoin())
      setCoinHistory(prev => [...prev, ...next])
      return
    }
    const next = Array.from({ length: trials }, () => randomDie())
    setDieHistory(prev => [...prev, ...next])
  }

  function reset() {
    if (mode === 'coin') {
      setCoinHistory([])
      return
    }
    setDieHistory([])
  }

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-[var(--color-border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('coin')}
              className={`px-4 py-2 text-sm font-medium ${mode === 'coin' ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-text)] hover:bg-slate-50'}`}
            >
              Coin Flip
            </button>
            <button
              type="button"
              onClick={() => setMode('die')}
              className={`px-4 py-2 text-sm font-medium border-l border-[var(--color-border)] ${mode === 'die' ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-text)] hover:bg-slate-50'}`}
            >
              Dice Roll
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <span>Trials</span>
            <input
              type="number"
              min={1}
              max={500}
              value={trials}
              onChange={e => setTrials(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runSingle}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {mode === 'coin' ? 'Flip Once' : 'Roll Once'}
          </button>
          <button
            type="button"
            onClick={runMany}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-slate-50"
          >
            Run {trials}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

        {mode === 'coin' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatPill label="Last Flip" value={lastCoin ?? '—'} />
              <StatPill label="Heads" value={heads} />
              <StatPill label="Tails" value={tails} />
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-[var(--color-text)]">Tally</div>
              <div className="space-y-3">
                <BarRow label="Heads" value={heads} max={Math.max(heads, tails)} />
                <BarRow label="Tails" value={tails} max={Math.max(heads, tails)} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-[var(--color-text)]">Recent Flips</div>
              <div className="flex flex-wrap gap-2">
                {coinHistory.length === 0 ? (
                  <span className="text-sm text-[var(--color-muted)]">No flips yet</span>
                ) : (
                  coinHistory.slice(-24).map((flip, i) => (
                    <span
                      key={`${flip}-${coinHistory.length - 24 + i}`}
                      className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 border border-teal-100"
                    >
                      {flip}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatPill label="Last Roll" value={lastDie ?? '—'} />
              <StatPill label="Total Rolls" value={dieHistory.length} />
              <StatPill
                label="Mean"
                value={dieHistory.length ? (dieHistory.reduce((sum, v) => sum + v, 0) / dieHistory.length).toFixed(2) : '—'}
              />
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-[var(--color-text)]">Frequency by Face</div>
              <div className="space-y-3">
                {dieCounts.map(({ face, count }) => (
                  <BarRow key={face} label={`Face ${face}`} value={count} max={dieMax} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-[var(--color-text)]">Recent Rolls</div>
              <div className="flex flex-wrap gap-2">
                {dieHistory.length === 0 ? (
                  <span className="text-sm text-[var(--color-muted)]">No rolls yet</span>
                ) : (
                  dieHistory.slice(-30).map((roll, i) => (
                    <span
                      key={`${roll}-${dieHistory.length - 30 + i}`}
                      className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 border border-teal-100"
                    >
                      {roll}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
