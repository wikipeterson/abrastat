'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

type Phase = 'shuffling' | 'selecting' | 'revealed'
type Liquid = 'milk' | 'tea'
type CupState = 'correct-milk' | 'wrong-tea' | 'missed-milk' | 'correct-tea'

const SCORES = [0, 2, 4, 6, 8]

function generateArrangement(): Liquid[] {
  const arr: Liquid[] = ['milk', 'milk', 'milk', 'milk', 'tea', 'tea', 'tea', 'tea']
  for (let i = 7; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function scoreGuess(arrangement: Liquid[], selected: Set<number>): { total: number; milkCorrect: number } {
  let total = 0
  let milkCorrect = 0
  for (let i = 0; i < 8; i++) {
    const guessed = selected.has(i)
    const isMilk = arrangement[i] === 'milk'
    if (guessed === isMilk) total++
    if (guessed && isMilk) milkCorrect++
  }
  return { total, milkCorrect }
}

function runSimBatch(n: number): Record<number, number> {
  const counts: Record<number, number> = { 0: 0, 2: 0, 4: 0, 6: 0, 8: 0 }
  for (let t = 0; t < n; t++) {
    const arr = generateArrangement()
    const idxs = [0, 1, 2, 3, 4, 5, 6, 7]
    for (let i = 7; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idxs[i], idxs[j]] = [idxs[j], idxs[i]]
    }
    const guess = new Set(idxs.slice(0, 4))
    const { total } = scoreGuess(arr, guess)
    counts[total] = (counts[total] || 0) + 1
  }
  return counts
}

function ScoreChart({
  simCounts,
  totalSims,
  studentScore,
}: {
  simCounts: Record<number, number>
  totalSims: number
  studentScore: number | null
}) {
  if (totalSims === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl text-center px-6 py-10"
        style={{ background: 'var(--color-bg)', minHeight: 160 }}
      >
        <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-muted)', fontSize: 14 }}>
          Run 10 or more simulated guests to see the pattern of random guesses.
        </p>
      </div>
    )
  }

  const W = 560
  const H = 280
  const marginTop = 44
  const marginBottom = 88
  const marginLeft = 16
  const marginRight = 16
  const barAreaH = H - marginTop - marginBottom
  const barAreaW = W - marginLeft - marginRight
  const slotW = barAreaW / 5
  const barW = slotW * 0.58
  const maxCount = Math.max(...SCORES.map(s => simCounts[s] || 0), 1)

  const bh = (count: number) => {
    const h = (count / maxCount) * barAreaH
    return count > 0 ? Math.max(h, 4) : 0
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 300 }} role="img" aria-label="Bar chart of simulation results">
      {SCORES.map((score, i) => {
        const count = simCounts[score] || 0
        const pct = (count / totalSims) * 100
        const barX = marginLeft + i * slotW + (slotW - barW) / 2
        const barH = bh(count)
        const barY = marginTop + barAreaH - barH
        const midX = barX + barW / 2
        const isStudent = studentScore === score

        return (
          <g key={score}>
            {/* bar */}
            <rect
              x={barX}
              y={barY}
              width={barW}
              height={barH}
              rx={4}
              fill={isStudent ? 'var(--color-accent)' : 'var(--color-accent-light)'}
              stroke={isStudent ? 'var(--color-accent-strong)' : 'var(--color-accent)'}
              strokeWidth={isStudent ? 2 : 1}
            />

            {/* percentage above bar */}
            {count > 0 && (
              <text
                x={midX}
                y={barY - 5}
                textAnchor="middle"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--color-muted)' }}
              >
                {pct.toFixed(1)}%
              </text>
            )}

            {/* Your trial marker */}
            {isStudent && studentScore !== null && (
              <>
                <line
                  x1={midX}
                  y1={marginTop - 30}
                  x2={midX}
                  y2={barY - 14}
                  stroke="var(--color-gold)"
                  strokeWidth={2}
                  strokeDasharray="3,2"
                />
                <text
                  x={midX}
                  y={marginTop - 34}
                  textAnchor="middle"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fill: 'var(--color-gold-text)', fontWeight: 600 }}
                >
                  Your trial
                </text>
              </>
            )}

            {/* baseline labels */}
            <text
              x={midX}
              y={marginTop + barAreaH + 18}
              textAnchor="middle"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fill: 'var(--color-text)', fontWeight: 700 }}
            >
              {score}
            </text>
            <text
              x={midX}
              y={marginTop + barAreaH + 33}
              textAnchor="middle"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fill: 'var(--color-muted)' }}
            >
              correct
            </text>
            <text
              x={midX}
              y={marginTop + barAreaH + 52}
              textAnchor="middle"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--color-muted)' }}
            >
              {count.toLocaleString()} of {totalSims.toLocaleString()}
            </text>
          </g>
        )
      })}

      {/* baseline */}
      <line
        x1={marginLeft}
        y1={marginTop + barAreaH}
        x2={W - marginRight}
        y2={marginTop + barAreaH}
        stroke="var(--color-border)"
        strokeWidth={1}
      />
    </svg>
  )
}

export function LadyTastingTea() {
  const [phase, setPhase] = useState<Phase>('shuffling')
  const [arrangement, setArrangement] = useState<Liquid[]>(() => generateArrangement())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [studentScore, setStudentScore] = useState<number | null>(null)
  const [studentMilkCorrect, setStudentMilkCorrect] = useState<number | null>(null)
  const [simCounts, setSimCounts] = useState<Record<number, number>>({ 0: 0, 2: 0, 4: 0, 6: 0, 8: 0 })
  const [totalSims, setTotalSims] = useState(0)
  const [shuffleOffsets, setShuffleOffsets] = useState<Array<{ x: number; y: number; rotate: number }>>(
    () => Array(8).fill(null).map(() => ({ x: 0, y: 0, rotate: 0 }))
  )
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([])

  const startNewService = useCallback(() => {
    timerRefs.current.forEach(clearTimeout)
    timerRefs.current = []

    setArrangement(generateArrangement())
    setSelected(new Set())
    setStudentScore(null)
    setStudentMilkCorrect(null)
    setPhase('shuffling')

    setShuffleOffsets(
      Array(8).fill(null).map(() => ({
        x: (Math.random() - 0.5) * 220,
        y: (Math.random() - 0.5) * 70,
        rotate: (Math.random() - 0.5) * 28,
      }))
    )

    timerRefs.current.push(
      setTimeout(() => {
        setShuffleOffsets(Array(8).fill(null).map(() => ({ x: 0, y: 0, rotate: 0 })))
      }, 550)
    )

    timerRefs.current.push(
      setTimeout(() => {
        setPhase('selecting')
      }, 1150)
    )
  }, [])

  useEffect(() => {
    startNewService()
    return () => { timerRefs.current.forEach(clearTimeout) }
  }, [startNewService])

  const toggleCup = useCallback(
    (i: number) => {
      if (phase !== 'selecting') return
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(i)) {
          next.delete(i)
        } else if (next.size < 4) {
          next.add(i)
        }
        return next
      })
    },
    [phase]
  )

  const reveal = useCallback(() => {
    const { total, milkCorrect } = scoreGuess(arrangement, selected)
    setStudentScore(total)
    setStudentMilkCorrect(milkCorrect)
    setPhase('revealed')
    setSimCounts(prev => ({ ...prev, [total]: (prev[total] || 0) + 1 }))
    setTotalSims(prev => prev + 1)
  }, [arrangement, selected])

  const addSims = useCallback((n: number) => {
    const newCounts = runSimBatch(n)
    setSimCounts(prev => {
      const next = { ...prev }
      for (const score of SCORES) {
        next[score] = (next[score] || 0) + (newCounts[score] || 0)
      }
      return next
    })
    setTotalSims(prev => prev + n)
  }, [])

  const resetSims = useCallback(() => {
    setSimCounts({ 0: 0, 2: 0, 4: 0, 6: 0, 8: 0 })
    setTotalSims(0)
  }, [])

  const getCupState = (i: number): CupState | null => {
    if (phase !== 'revealed') return null
    const guessed = selected.has(i)
    const isMilk = arrangement[i] === 'milk'
    if (guessed && isMilk) return 'correct-milk'
    if (guessed && !isMilk) return 'wrong-tea'
    if (!guessed && isMilk) return 'missed-milk'
    return 'correct-tea'
  }

  const summaryText = (): string | null => {
    if (totalSims === 0) return null
    const targetScore =
      studentScore !== null
        ? studentScore
        : SCORES.reduce((best, s) => ((simCounts[s] || 0) > (simCounts[best] || 0) ? s : best), 0)
    const count = simCounts[targetScore] || 0
    const pct = ((count / totalSims) * 100).toFixed(1)
    return `In these simulations, random guests got ${targetScore} of 8 cups correct ${pct}% of the time.`
  }

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
            Lady Tasting Tea
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--color-muted)' }}>
            Can you tell whether the milk or tea was poured first?
          </p>
        </div>
        <div className="px-6 py-4" style={{ background: 'var(--color-bg)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>
            Eight cups were prepared. In four, milk was poured first; in the other four, tea was poured first.
            Choose the four cups you think had milk poured first.
          </p>
        </div>
      </div>

      {/* Two-column layout: tea service left, simulation right */}
      <div className="grid grid-cols-2 gap-4 items-start">

      {/* Tea service */}
      <div
        className="rounded-2xl border overflow-hidden shadow-sm"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="px-4 py-5">
          {/* Cup row */}
          <div
            className="flex justify-center gap-1.5"
            style={{ overflow: 'visible', minHeight: 120 }}
          >
            {Array(8)
              .fill(null)
              .map((_, i) => {
                const cupState = getCupState(i)
                const isSelected = selected.has(i)
                const canToggle =
                  phase === 'selecting' && (isSelected || selected.size < 4)

                let ringColor = 'transparent'
                let bgColor = 'transparent'
                let labelContent: React.ReactNode = null

                if (phase === 'selecting' && isSelected) {
                  ringColor = 'var(--color-accent)'
                  bgColor = 'var(--color-accent-light)'
                } else if (cupState === 'correct-milk') {
                  ringColor = 'var(--color-accent)'
                  bgColor = 'var(--color-accent-light)'
                } else if (cupState === 'wrong-tea') {
                  ringColor = 'var(--color-danger)'
                  bgColor = 'var(--color-danger-light)'
                } else if (cupState === 'missed-milk') {
                  ringColor = 'var(--color-gold)'
                  bgColor = 'var(--color-gold-light)'
                } else if (cupState === 'correct-tea') {
                  ringColor = 'var(--color-border)'
                  bgColor = 'var(--color-bg)'
                }

                if (phase === 'selecting') {
                  labelContent = isSelected ? (
                    <span style={{ color: 'var(--color-accent-strong)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500 }}>
                      Chosen as<br />milk first
                    </span>
                  ) : null
                } else if (cupState === 'correct-milk') {
                  labelContent = (
                    <span style={{ color: 'var(--color-accent-strong)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600 }}>
                      Correct ✓
                    </span>
                  )
                } else if (cupState === 'wrong-tea') {
                  labelContent = (
                    <span style={{ color: 'var(--color-danger)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600 }}>
                      Incorrect ✗
                    </span>
                  )
                } else if (cupState === 'missed-milk') {
                  labelContent = (
                    <span style={{ color: 'var(--color-gold-text)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600 }}>
                      Missed
                    </span>
                  )
                } else if (cupState === 'correct-tea') {
                  labelContent = (
                    <span style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', fontSize: 11 }}>
                      Tea ✓
                    </span>
                  )
                }

                const badgeContent =
                  (phase === 'selecting' && isSelected) || cupState === 'correct-milk'
                    ? '✓'
                    : cupState === 'wrong-tea'
                    ? '✗'
                    : cupState === 'missed-milk'
                    ? '!'
                    : null

                const badgeBg =
                  cupState === 'wrong-tea'
                    ? 'var(--color-danger)'
                    : cupState === 'missed-milk'
                    ? 'var(--color-gold)'
                    : 'var(--color-accent)'

                return (
                  <div
                    key={i}
                    className="flex flex-col items-center flex-shrink-0"
                    style={{ width: 60 }}
                  >
                    {/* Label above (revealed only) */}
                    <div
                      className="text-center mb-1"
                      style={{ minHeight: 18, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                    >
                      {phase === 'revealed' && (
                        <span style={{ color: arrangement[i] === 'milk' ? 'var(--color-accent-strong)' : 'var(--color-text)' }}>
                          {arrangement[i] === 'milk' ? 'Milk' : 'Tea'}
                        </span>
                      )}
                    </div>

                    {/* Cup button */}
                    <button
                      onClick={() => toggleCup(i)}
                      disabled={phase === 'revealed' || phase === 'shuffling' || (!canToggle)}
                      aria-label={`Cup ${i + 1}, ${isSelected ? 'selected as milk first' : 'not selected as milk first'}`}
                      className="relative rounded-xl p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-colors"
                      style={{
                        cursor: phase === 'selecting' && canToggle ? 'pointer' : phase === 'selecting' ? 'not-allowed' : 'default',
                        background: bgColor,
                        outline: `2px solid ${ringColor}`,
                        outlineOffset: 2,
                        opacity: phase === 'selecting' && !canToggle ? 0.45 : 1,
                        transform: `translate(${shuffleOffsets[i]?.x ?? 0}px, ${shuffleOffsets[i]?.y ?? 0}px) rotate(${shuffleOffsets[i]?.rotate ?? 0}deg)`,
                        transition: 'transform 500ms ease-in-out, background 200ms, outline-color 200ms',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/applets/lady-tasting-tea/teacup.png"
                        alt={`Cup ${i + 1}`}
                        width={52}
                        height={46}
                        draggable={false}
                        style={{ display: 'block', userSelect: 'none' }}
                      />

                      {badgeContent && (
                        <div
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white font-bold"
                          style={{ background: badgeBg, fontSize: 11 }}
                          aria-hidden="true"
                        >
                          {badgeContent}
                        </div>
                      )}
                    </button>

                    {/* Label below */}
                    <div className="mt-1 text-center leading-tight" style={{ minHeight: 32, fontSize: 11 }}>
                      {labelContent}
                    </div>
                  </div>
                )
              })}
          </div>

          {/* Controls below cups */}
          <div className="mt-4 flex flex-col items-center gap-3">
            {phase === 'shuffling' && (
              <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-muted)', fontSize: 14 }}>
                Preparing the cups…
              </p>
            )}

            {phase === 'selecting' && (
              <>
                <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)', fontSize: 14 }}>
                  <strong>{selected.size}</strong> of <strong>4</strong> cups selected
                </p>
                <button
                  onClick={reveal}
                  disabled={selected.size !== 4}
                  className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: selected.size === 4 ? 'var(--color-accent)' : 'var(--color-border)',
                    color: selected.size === 4 ? 'white' : 'var(--color-muted)',
                    cursor: selected.size === 4 ? 'pointer' : 'not-allowed',
                  }}
                >
                  Reveal the tea service
                </button>
              </>
            )}

            {phase === 'revealed' && (
              <div className="text-center space-y-1.5">
                <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                  You classified{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{studentScore}</span>{' '}
                  of{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>8</span>{' '}
                  cups correctly.
                </p>
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                  You correctly identified{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)', fontWeight: 600 }}>{studentMilkCorrect}</span>{' '}
                  of the{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)', fontWeight: 600 }}>4</span>{' '}
                  milk-first cups.
                </p>
                <button
                  onClick={startNewService}
                  className="mt-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{ background: 'var(--color-accent)', color: 'white', cursor: 'pointer' }}
                >
                  New Tea Service
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Simulation */}
      <div
        className="rounded-2xl border overflow-hidden shadow-sm"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text)' }}
          >
            What happens when guests guess randomly?
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
            Each simulated guest randomly chooses four of the eight cups as milk-first.
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {[10, 100, 1000].map(n => (
              <button
                key={n}
                onClick={() => addSims(n)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  fontFamily: 'var(--font-sans)',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  ;(e.target as HTMLButtonElement).style.background = 'var(--color-accent-light)'
                  ;(e.target as HTMLButtonElement).style.borderColor = 'var(--color-accent)'
                }}
                onMouseLeave={e => {
                  ;(e.target as HTMLButtonElement).style.background = 'var(--color-bg)'
                  ;(e.target as HTMLButtonElement).style.borderColor = 'var(--color-border)'
                }}
              >
                {n.toLocaleString()} trials
              </button>
            ))}
            <button
              onClick={resetSims}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                color: 'var(--color-danger)',
                border: '1px solid var(--color-danger-light)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              Reset simulations
            </button>
            {totalSims > 0 && (
              <span
                className="ml-1 text-sm"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}
              >
                {totalSims.toLocaleString()} total
              </span>
            )}
          </div>

          {/* Chart */}
          <ScoreChart simCounts={simCounts} totalSims={totalSims} studentScore={studentScore} />

          {/* Summary */}
          {totalSims > 0 && (
            <p
              className="text-sm"
              style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-muted)' }}
            >
              {summaryText()}
            </p>
          )}
        </div>
      </div>

      </div> {/* end two-column grid */}
    </div>
  )
}
