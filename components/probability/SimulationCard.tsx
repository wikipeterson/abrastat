'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { SimulationCardConfig } from '@/lib/exploreTypes'

function clampProbability(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

function clampPositiveInt(value: number, max = 10000) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(max, Math.floor(value)))
}

function flipGroup(probabilityHeads: number, flipsPerGroup: number) {
  const flips: number[] = Array.from(
    { length: flipsPerGroup },
    () => (Math.random() < probabilityHeads ? 1 : 0),
  )
  const heads = flips.reduce((sum, value) => sum + value, 0)
  return { flips, heads }
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-base font-semibold text-[var(--color-text)]">{value}</div>
    </div>
  )
}

interface SimulationCardProps {
  cardId: string
  config: SimulationCardConfig
}

export function SimulationCard({ cardId, config }: SimulationCardProps) {
  const exploreCards = useStore(s => s.exploreCards)
  const addSimResultsCard = useStore(s => s.addSimResultsCard)
  const updateExploreCard = useStore(s => s.updateExploreCard)
  const pushSimResult = useStore(s => s.pushSimResult)
  const pushSimResultsBatch = useStore(s => s.pushSimResultsBatch)
  const clearSimResults = useStore(s => s.clearSimResults)

  const [probabilityHeads, setProbabilityHeads] = useState(0.5)
  const [flipsPerGroup, setFlipsPerGroup] = useState(100)
  const [groupCount, setGroupCount] = useState(1000)
  const [history, setHistory] = useState<number[][]>([])

  const linkedResultsCardId = config.linkedResultsCardId ?? null
  const linkedResultsCard = linkedResultsCardId
    ? exploreCards.find(card => card.id === linkedResultsCardId && card.config.type === 'sim-results')
    : null

  const range = useMemo(
    () => ({ minValue: 0, maxValue: flipsPerGroup }),
    [flipsPerGroup],
  )

  const recentHeads = history.map(group => group.reduce((sum, value) => sum + value, 0))
  const totalGroups = history.length
  const lastHeads = recentHeads.at(-1) ?? '—'
  const meanHeads = recentHeads.length
    ? (recentHeads.reduce((sum, value) => sum + value, 0) / recentHeads.length).toFixed(2)
    : '—'

  useEffect(() => {
    if (!linkedResultsCard || linkedResultsCard.config.type !== 'sim-results') return
    const cfg = linkedResultsCard.config
    if (
      cfg.minValue === range.minValue &&
      cfg.maxValue === range.maxValue &&
      cfg.valueLabel === 'Heads'
    ) return

    updateExploreCard(linkedResultsCard.id, {
      config: {
        ...cfg,
        minValue: range.minValue,
        maxValue: range.maxValue,
        valueLabel: 'Heads',
      },
    })
  }, [linkedResultsCard, range.maxValue, range.minValue, updateExploreCard])

  function ensureResultsCard() {
    if (linkedResultsCardId && linkedResultsCard) return linkedResultsCardId

    const myCard = exploreCards.find(card => card.id === cardId)
    const position = myCard
      ? { x: myCard.x + myCard.width + 40, y: myCard.y }
      : { x: 700, y: 20 }

    const newId = addSimResultsCard(
      cardId,
      'sum',
      position,
      'Coin Flip Simulator',
      range,
      'Heads',
    )
    if (history.length > 0) {
      pushSimResultsBatch(newId, history)
    }
    updateExploreCard(cardId, {
      config: {
        ...config,
        linkedResultsCardId: newId,
      },
    })
    return newId
  }

  function simulateOneGroup() {
    const outcome = flipGroup(probabilityHeads, flipsPerGroup)
    setHistory(prev => [...prev, outcome.flips])

    if (linkedResultsCardId) {
      pushSimResult(linkedResultsCardId, outcome.flips)
    }
  }

  function simulateManyGroups() {
    const groups = Array.from({ length: groupCount }, () => flipGroup(probabilityHeads, flipsPerGroup))
    setHistory(prev => [...prev, ...groups.map(group => group.flips)])

    if (linkedResultsCardId) {
      pushSimResultsBatch(linkedResultsCardId, groups.map(group => group.flips))
    }
  }

  function reset() {
    setHistory([])
    if (linkedResultsCardId) {
      clearSimResults(linkedResultsCardId)
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Probability of Heads</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={probabilityHeads}
              onChange={e => setProbabilityHeads(clampProbability(Number(e.target.value)))}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Flips per Group</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={flipsPerGroup}
              onChange={e => setFlipsPerGroup(clampPositiveInt(Number(e.target.value), 10000))}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Number of Groups</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={groupCount}
              onChange={e => setGroupCount(clampPositiveInt(Number(e.target.value), 10000))}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={simulateOneGroup}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Flip One Group
          </button>
          <button
            type="button"
            onClick={simulateManyGroups}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-slate-50"
          >
            Run {groupCount} Groups
          </button>
          <button
            type="button"
            onClick={ensureResultsCard}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-slate-50"
          >
            Graph Results
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <StatPill label="Last Heads" value={lastHeads} />
          <StatPill label="Groups Run" value={totalGroups} />
          <StatPill label="Mean Heads" value={meanHeads} />
          <StatPill label="Expected Heads" value={(probabilityHeads * flipsPerGroup).toFixed(2)} />
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-[var(--color-text)]">Recent Group Results</div>
              <div className="text-xs text-[var(--color-muted)]">
                Each value is the number of heads in {flipsPerGroup} flips.
              </div>
            </div>
            <div className="text-sm text-[var(--color-muted)]">
              p(Heads): <span className="font-semibold text-[var(--color-text)]">{probabilityHeads.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3 min-h-[120px]">
            {recentHeads.length === 0 ? (
              <div className="text-sm text-[var(--color-muted)]">
                No groups simulated yet. Set the head probability and run one or more groups.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recentHeads.slice(-60).map((value, index) => (
                  <span
                    key={`${value}-${recentHeads.length - 60 + index}`}
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
