'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { SimulationCardConfig } from '@/lib/exploreTypes'

const COIN_CSS = `
@keyframes coin-flat-spin {
  0%   { transform: scaleX(1)    rotateZ(0deg)  }
  12%  { transform: scaleX(0.06) rotateZ(3deg)  }
  25%  { transform: scaleX(1)    rotateZ(-2deg) }
  37%  { transform: scaleX(0.06) rotateZ(2deg)  }
  50%  { transform: scaleX(1)    rotateZ(-1deg) }
  62%  { transform: scaleX(0.06) rotateZ(3deg)  }
  75%  { transform: scaleX(1)    rotateZ(-2deg) }
  87%  { transform: scaleX(0.06) rotateZ(1deg)  }
  100% { transform: scaleX(1)    rotateZ(0deg)  }
}
`

type CoinFace = 'heads' | 'tails'

function FlipCoin({
  face,
  size,
  spinning = false,
  spinDelay = 0,
}: {
  face: CoinFace
  size: number
  spinning?: boolean
  spinDelay?: number
}) {
  const isHeads = face === 'heads'
  const rimSize = Math.max(1, Math.round(size * 0.055))
  const iconSize = Math.round(size * (isHeads ? 0.52 : 0.46))
  const neutralBackground = 'linear-gradient(90deg, #0EA5A0 0%, #47CFC8 48%, #D7E2EE 52%, #A7B6C8 100%)'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        position: 'relative',
        flexShrink: 0,
        animation: spinning ? 'coin-flat-spin 0.22s linear infinite' : 'none',
        animationDelay: spinning ? `${spinDelay}ms` : '0ms',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
          background: spinning
            ? neutralBackground
            : isHeads
              ? 'radial-gradient(circle at 36% 33%, #5CE0DB, #0EA5A0 52%, #097B76)'
              : 'radial-gradient(circle at 36% 33%, #F1F5F9, #CBD5E1 52%, #94A3B8)',
          border: `${rimSize}px solid ${spinning ? '#5E7085' : isHeads ? '#0A6663' : '#7C8FA1'}`,
          boxShadow: spinning
            ? `0 ${Math.round(size * 0.07)}px ${Math.round(size * 0.18)}px rgba(22,52,76,0.18), inset 0 1px 2px rgba(255,255,255,0.24)`
            : isHeads
              ? `0 ${Math.round(size * 0.07)}px ${Math.round(size * 0.18)}px rgba(0,80,76,0.30), inset 0 1px 2px rgba(255,255,255,0.28)`
              : `0 ${Math.round(size * 0.07)}px ${Math.round(size * 0.18)}px rgba(0,0,0,0.18), inset 0 1px 2px rgba(255,255,255,0.40)`,
        }}
      >
        <div style={{
          position: 'absolute',
          top: '6%',
          left: '14%',
          width: '38%',
          height: '30%',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.24)',
          transform: 'rotate(-22deg)',
          pointerEvents: 'none',
        }} />
        {!spinning && (
          <div style={{ position: 'relative', zIndex: 1 }}>
            {isHeads ? (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
                <polyline
                  points="3.5,12 9,18.5 20.5,6"
                  stroke="white"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
                <line x1="6" y1="6" x2="18" y2="18" stroke="#3D5166" strokeWidth="2.8" strokeLinecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" stroke="#3D5166" strokeWidth="2.8" strokeLinecap="round" />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function getCoinLayout(n: number) {
  const size =
    n <= 12 ? 72 :
    n <= 20 ? 60 :
    n <= 35 ? 48 :
    n <= 55 ? 38 :
    n <= 90 ? 30 :
    n <= 160 ? 22 :
    16
  const gap = Math.max(3, Math.round(size * 0.10))
  const perRow = Math.max(1, Math.floor(860 / (size + gap)))
  return { size, gap, perRow }
}

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
  const [probabilityHeads, setProbabilityHeads] = useState(0.5)
  const [flipsPerGroup, setFlipsPerGroup] = useState(100)
  const [history, setHistory] = useState<number[][]>([])
  const [displayFlips, setDisplayFlips] = useState<number[]>([])
  const [isSpinning, setIsSpinning] = useState(false)
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recentHeads = history.map(group => group.reduce((sum, value) => sum + value, 0))
  const totalGroups = history.length
  const lastHeads = recentHeads.at(-1) ?? '—'
  const lastFlips = history.at(-1) ?? []
  const visibleFlips = isSpinning
    ? Array.from({ length: flipsPerGroup }, () => 1)
    : (displayFlips.length ? displayFlips : lastFlips)
  const visibleHeads = isSpinning ? null : visibleFlips.reduce((sum, value) => sum + value, 0)
  const { size: coinSize, gap: coinGap, perRow } = useMemo(
    () => getCoinLayout(flipsPerGroup),
    [flipsPerGroup],
  )
  const spinDelays = useMemo(
    () => Array.from({ length: flipsPerGroup }, (_, i) => Math.round((i / Math.max(1, flipsPerGroup)) * 220)),
    [flipsPerGroup],
  )

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current)
    }
  }, [])

  function simulateOneGroup() {
    const outcome = flipGroup(probabilityHeads, flipsPerGroup)
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current)
    setIsSpinning(true)
    setDisplayFlips([])
    spinTimerRef.current = setTimeout(() => {
      setDisplayFlips(outcome.flips)
      setIsSpinning(false)
      setHistory(prev => [...prev, outcome.flips])
    }, 700)
  }

  function reset() {
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current)
    setHistory([])
    setDisplayFlips([])
    setIsSpinning(false)
  }

  return (
    <div className="h-full overflow-auto">
      <style>{COIN_CSS}</style>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <span className="text-sm font-medium text-[var(--color-text)]">Number of Coins</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={flipsPerGroup}
              onChange={e => setFlipsPerGroup(clampPositiveInt(Number(e.target.value), 10000))}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </label>

        </div>

        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={simulateOneGroup}
            disabled={isSpinning}
            className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Flip Coins
          </button>
          <button
            type="button"
            onClick={reset}
            className="shrink-0 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatPill label="Last Heads" value={lastHeads} />
          <StatPill label="Groups Run" value={totalGroups} />
          <StatPill label="Expected Heads" value={(probabilityHeads * flipsPerGroup).toFixed(2)} />
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-[var(--color-text)]">Latest Group Flip</div>
              <div className="text-xs text-[var(--color-muted)]">
                {isSpinning
                  ? `Flipping ${flipsPerGroup} coin${flipsPerGroup !== 1 ? 's' : ''}...`
                  : `Showing the latest group of ${flipsPerGroup} flip${flipsPerGroup !== 1 ? 's' : ''}.`}
              </div>
            </div>
            <div className="text-sm text-[var(--color-muted)]">
              p(Heads): <span className="font-semibold text-[var(--color-text)]">{probabilityHeads.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3 min-h-[120px]">
            {history.length === 0 && !isSpinning ? (
              <div className="text-sm text-[var(--color-muted)]">
                No groups simulated yet. Set the head probability and run one or more groups.
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className="flex flex-wrap items-start"
                  style={{ gap: coinGap }}
                >
                  {visibleFlips.map((value, index) => (
                    <FlipCoin
                      key={`${index}-${isSpinning ? 'spin' : value}`}
                      face={(value ? 'heads' : 'tails')}
                      size={coinSize}
                      spinning={isSpinning}
                      spinDelay={spinDelays[index] ?? 0}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
                  <span>Heads: <span className="font-semibold text-[var(--color-text)]">{visibleHeads ?? '—'}</span></span>
                  <span>Tails: <span className="font-semibold text-[var(--color-text)]">{visibleHeads === null ? '—' : visibleFlips.length - visibleHeads}</span></span>
                  <span>Rows: <span className="font-semibold text-[var(--color-text)]">{Math.max(1, Math.ceil(flipsPerGroup / perRow))}</span></span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
