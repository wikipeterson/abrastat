'use client'

import { useEffect, useRef, useCallback } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const SIZE = 70           // cube side length in px
const HALF = SIZE / 2
const TOTAL_MS = 1500     // total roll duration
const TUMBLE_MS = 950     // transition from tumble → settle at this timestamp
const SETTLE_LERP = 0.09  // lerp factor per frame during settle phase (at 60fps)

// Standard d6 face assignments for CSS cube faces:
//   top=1, bottom=6, front=2, back=5, right=3, left=4
//
// Target Euler rotations (x, y, z in degrees) that bring each face value
// to the viewer-visible top (+Y world direction after applying ZYX Euler).
// A slight Y offset (10°) gives each landing a natural look.
const TARGET: Record<number, { x: number; y: number; z: number }> = {
  1: { x:   0, y:  10, z:   0 },
  2: { x: -90, y:  10, z:   0 },
  3: { x:   0, y:  10, z:  90 },
  4: { x:   0, y:  10, z: -90 },
  5: { x:  90, y:  10, z:   0 },
  6: { x: 180, y:  10, z:   0 },
}

// ── Pip layouts (9-slot grid, row-major) ──────────────────────────────────────
// Positions: [0 1 2 / 3 4 5 / 6 7 8]

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

// ── Face component ────────────────────────────────────────────────────────────

function FacePips({ value, style }: { value: number; style: React.CSSProperties }) {
  const pip = PIPS[value] ?? []
  return (
    <div
      style={{
        position: 'absolute',
        width: SIZE,
        height: SIZE,
        boxSizing: 'border-box',
        backgroundColor: '#FAFAFA',
        border: '2px solid #d1d5db',
        borderRadius: 10,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        padding: 8,
        gap: 2,
        backfaceVisibility: 'hidden',
        ...style,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          style={{
            borderRadius: '50%',
            backgroundColor: pip.includes(i) ? '#0D4F49' : 'transparent',
            width: '100%',
            height: '100%',
          }}
        />
      ))}
    </div>
  )
}

// ── CSS 3D Cube ───────────────────────────────────────────────────────────────

const FACE_TRANSFORMS: { value: number; transform: string }[] = [
  { value: 1, transform: `rotateX(-90deg) translateZ(${HALF}px)` },  // top
  { value: 6, transform: `rotateX( 90deg) translateZ(${HALF}px)` },  // bottom
  { value: 2, transform: `translateZ(${HALF}px)` },                   // front
  { value: 5, transform: `rotateY(180deg) translateZ(${HALF}px)` },   // back
  { value: 3, transform: `rotateY( 90deg) translateZ(${HALF}px)` },   // right
  { value: 4, transform: `rotateY(-90deg) translateZ(${HALF}px)` },   // left
]

// ── Main D6Canvas component ───────────────────────────────────────────────────

interface D6CanvasProps {
  /** 1–6 target face value to land on */
  targetFace: number | null
  /** Increment to trigger a new roll animation */
  rollKey: number
  onSettled?: () => void
}

export function D6Canvas({ targetFace, rollKey, onSettled }: D6CanvasProps) {
  const cubeRef = useRef<HTMLDivElement>(null)

  // Rotation state tracked in refs to avoid re-render overhead
  const rotX   = useRef(20)
  const rotY   = useRef(0)
  const rotZ   = useRef(0)
  const velX   = useRef(0)
  const velY   = useRef(0)
  const velZ   = useRef(0)
  const rafId  = useRef<number | null>(null)
  const startT = useRef<number | null>(null)
  const settled = useRef(false)
  // Keep targetFace in a ref so the animation loop always reads the latest value
  // without needing it as a dependency (avoids restarting animation on face change)
  const targetFaceRef = useRef(targetFace)
  useEffect(() => { targetFaceRef.current = targetFace })
  const onSettledRef = useRef(onSettled)
  useEffect(() => { onSettledRef.current = onSettled })

  const applyTransform = useCallback(() => {
    if (cubeRef.current) {
      cubeRef.current.style.transform =
        `rotateX(${rotX.current}deg) rotateY(${rotY.current}deg) rotateZ(${rotZ.current}deg)`
    }
  }, [])

  // Cancel any running animation
  const cancelAnim = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    startT.current = null
    settled.current = false
  }, [])

  // Trigger a new roll whenever rollKey increments
  useEffect(() => {
    if (rollKey === 0) return  // initial mount — don't animate
    cancelAnim()

    // Capture target at roll start (guaranteed non-null when rollKey increments)
    const face = targetFaceRef.current
    if (face === null) return
    const target = TARGET[face]

    velX.current = (Math.random() < 0.5 ? 1 : -1) * (380 + Math.random() * 220)
    velY.current = (Math.random() < 0.5 ? 1 : -1) * (300 + Math.random() * 200)
    velZ.current = (Math.random() < 0.5 ? 1 : -1) * (200 + Math.random() * 180)
    settled.current = false

    function tick(now: number) {
      if (startT.current === null) startT.current = now
      const elapsed = now - startT.current

      if (elapsed < TUMBLE_MS) {
        // ── Tumble phase: apply velocity with decay ──────────────────────────
        const dt = 1 / 60
        const damping = 0.93
        velX.current *= damping
        velY.current *= damping
        velZ.current *= damping
        rotX.current += velX.current * dt
        rotY.current += velY.current * dt
        rotZ.current += velZ.current * dt
        applyTransform()
        rafId.current = requestAnimationFrame(tick)
      } else if (elapsed < TOTAL_MS) {
        // ── Settle phase: lerp toward target orientation ─────────────────────
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t

        const normalize = (cur: number, tgt: number) => {
          const diff = ((tgt - cur) % 360 + 540) % 360 - 180
          return cur + diff
        }
        rotX.current = lerp(rotX.current, normalize(rotX.current, target.x), SETTLE_LERP)
        rotY.current = lerp(rotY.current, normalize(rotY.current, target.y), SETTLE_LERP)
        rotZ.current = lerp(rotZ.current, normalize(rotZ.current, target.z), SETTLE_LERP)
        applyTransform()
        rafId.current = requestAnimationFrame(tick)
      } else {
        // ── Snap to exact target ─────────────────────────────────────────────
        rotX.current = target.x
        rotY.current = target.y
        rotZ.current = target.z
        applyTransform()
        rafId.current = null
        if (!settled.current) {
          settled.current = true
          onSettledRef.current?.()
        }
      }
    }

    rafId.current = requestAnimationFrame(tick)
    return cancelAnim
  }, [rollKey, cancelAnim, applyTransform])

  // On mount: set initial display orientation (face 1 on top, slight tilt)
  useEffect(() => {
    rotX.current = -20
    rotY.current = 20
    rotZ.current = 0
    applyTransform()
    return () => { cancelAnim() }
  }, [applyTransform, cancelAnim])

  return (
    <div
      style={{
        width: SIZE * 2.4,
        height: SIZE * 2.0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: 420,
      }}
    >
      <div
        style={{
          width: SIZE,
          height: SIZE,
          position: 'relative',
          transformStyle: 'preserve-3d',
        }}
        ref={cubeRef}
      >
        {FACE_TRANSFORMS.map(({ value, transform }) => (
          <FacePips
            key={value}
            value={value}
            style={{ transform }}
          />
        ))}
      </div>
    </div>
  )
}
