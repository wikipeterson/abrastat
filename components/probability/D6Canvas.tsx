'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'

// ── Constants ─────────────────────────────────────────────────────────────────

const TRAY_W   = 10.5  // world units wide
const TRAY_D   = 5.9   // world units deep (rectangular tray)
const WALL_H   = 2.1   // wall height (contain higher-energy launches)
const WALL_T   = 0.3   // wall thickness
const DIE_HALF = 0.42  // half-side of die cube  (full = 0.84 wu)
const GRAVITY  = -32

const LINEAR_DAMPING  = 0.28
const ANGULAR_DAMPING = 0.38
const MAX_SETTLE  = 5500   // ms hard timeout
const LINEUP_READY_VEL = 2.0   // lineup fires even while dice are barely rolling
const LINEUP_READY_ANG = 2.0

const HELD_ZONE_Z       = 4.15  // world Z of held-die center (past front wall)
const HELD_ZONE_FLOOR_D = 1.65  // depth of held zone floor slab
const HELD_ZONE_END_Z   = 5.2   // camera bottom extent when held zone is active
const ZONE_ANIM_MS      = 300   // ms for hold/unhold transition

// Die face colours matching the palette
const DIE_COLOR = '#0D4F49'
const DIE_EDGE_COLOR = '#1A8C80'
const DIE_TEXT_COLOR = '#FFFFFF'
const DIE_MATERIAL_COLOR = '#FFFFFF'
const DIE_EMISSIVE_COLOR = '#0B2422'
const DIE_SPECULAR_COLOR = '#D6F5F2'

// ── d6 face mapping ───────────────────────────────────────────────────────────
// THREE.BoxGeometry face material order: +X −X +Y −Y +Z −Z
// Values assigned per face:
const D6_FACE_VALUES = [3, 4, 1, 6, 2, 5] as const

// Local-space face normals → die value
const D6_LOCAL_NORMALS: [number, number, number, number][] = [
  [ 0,  1,  0, 1], [ 0, -1,  0, 6],
  [ 0,  0,  1, 2], [ 0,  0, -1, 5],
  [ 1,  0,  0, 3], [-1,  0,  0, 4],
]

const CUBE_VERTICES = [
  new CANNON.Vec3(-DIE_HALF, -DIE_HALF, -DIE_HALF),
  new CANNON.Vec3( DIE_HALF, -DIE_HALF, -DIE_HALF),
  new CANNON.Vec3(-DIE_HALF,  DIE_HALF, -DIE_HALF),
  new CANNON.Vec3( DIE_HALF,  DIE_HALF, -DIE_HALF),
  new CANNON.Vec3(-DIE_HALF, -DIE_HALF,  DIE_HALF),
  new CANNON.Vec3( DIE_HALF, -DIE_HALF,  DIE_HALF),
  new CANNON.Vec3(-DIE_HALF,  DIE_HALF,  DIE_HALF),
  new CANNON.Vec3( DIE_HALF,  DIE_HALF,  DIE_HALF),
]

interface PolyFaceDef {
  value: number
  normal: CANNON.Vec3
}

// ── Textures ──────────────────────────────────────────────────────────────────

let _d6Textures: THREE.CanvasTexture[] | null = null
let _feltTexture: THREE.CanvasTexture | null = null

function finalizeTexture(tex: THREE.CanvasTexture) {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

function getD6Textures(): THREE.CanvasTexture[] {
  if (_d6Textures) return _d6Textures
  _d6Textures = [1,2,3,4,5,6].map(v => {
    const S = 192
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')!
    ctx.fillStyle = DIE_COLOR
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = DIE_EDGE_COLOR
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, S - 4, S - 4)
    ctx.fillStyle = DIE_TEXT_COLOR
    ctx.font = '900 110px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255,255,255,0.4)'
    ctx.shadowBlur = 8
    ctx.fillText(String(v), S/2, S/2)
    return finalizeTexture(new THREE.CanvasTexture(c))
  })
  return _d6Textures
}

function getFeltTexture(): THREE.CanvasTexture {
  if (_feltTexture) return _feltTexture

  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!

  // Base teal felt tone
  ctx.fillStyle = '#2EC4B6'
  ctx.fillRect(0, 0, S, S)

  // Soft mottled fabric variation
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 0.5 + Math.random() * 1.4
    const alpha = 0.015 + Math.random() * 0.02
    ctx.fillStyle = `rgba(255,255,255,${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 4800; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 0.5 + Math.random() * 1.5
    const alpha = 0.012 + Math.random() * 0.018
    ctx.fillStyle = `rgba(0,0,0,${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Soft directional nap, but without visible stripe repetition.
  ctx.save()
  ctx.globalAlpha = 0.018
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.rotate((-16 * Math.PI) / 180)
  for (let y = -S; y < S * 1.5; y += 15) {
    ctx.beginPath()
    ctx.moveTo(-S, y)
    ctx.lineTo(S * 1.5, y)
    ctx.stroke()
  }
  ctx.restore()

  // Subtle broad mottling to break up any remaining uniformity.
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 80 + Math.random() * 150
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,255,255,${0.015 + Math.random() * 0.015})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.repeat.set(1, 1)
  return (_feltTexture = finalizeTexture(tex))
}

function makeColorFaceTexture(label: string): THREE.CanvasTexture {
  const S = 192
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = DIE_COLOR
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = DIE_EDGE_COLOR
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, S - 4, S - 4)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = 'bold 42px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, S/2, S/2)
  return finalizeTexture(new THREE.CanvasTexture(c))
}

function makeResultTexture(value: number): THREE.CanvasTexture {
  const S = 192
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = DIE_COLOR
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = DIE_EDGE_COLOR
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, S - 4, S - 4)
  ctx.fillStyle = DIE_TEXT_COLOR
  ctx.font = `900 ${value >= 100 ? 64 : value >= 10 ? 88 : 110}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(255,255,255,0.4)'
  ctx.shadowBlur = 8
  ctx.fillText(String(value), S/2, S/2)
  return finalizeTexture(new THREE.CanvasTexture(c))
}

// ── Face-up detection (d6 only) ───────────────────────────────────────────────

function getD6FaceUp(body: CANNON.Body): number {
  let best = -Infinity, bestVal = 1
  const q = body.quaternion
  const w = new CANNON.Vec3()
  for (const [lx, ly, lz, v] of D6_LOCAL_NORMALS) {
    q.vmult(new CANNON.Vec3(lx, ly, lz), w)
    if (w.y > best) { best = w.y; bestVal = v }
  }
  return bestVal
}

function snapD6BodyToNearestFace(body: CANNON.Body) {
  const current = new THREE.Quaternion(
    body.quaternion.x,
    body.quaternion.y,
    body.quaternion.z,
    body.quaternion.w,
  )
  const worldUp = new THREE.Vector3(0, 1, 0)
  const faceUp = getD6FaceUp(body)
  const localNormalTuple = D6_LOCAL_NORMALS.find(([, , , value]) => value === faceUp)
  if (!localNormalTuple) return

  const localUp = new THREE.Vector3(localNormalTuple[0], localNormalTuple[1], localNormalTuple[2])
  const base = new THREE.Quaternion().setFromUnitVectors(localUp, worldUp)

  let best = base
  let bestScore = -Infinity
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const yaw = new THREE.Quaternion().setFromAxisAngle(worldUp, angle)
    const candidate = yaw.multiply(base.clone())
    const score = Math.abs(candidate.dot(current))
    if (score > bestScore) {
      bestScore = score
      best = candidate.clone()
    }
  }

  body.quaternion.set(best.x, best.y, best.z, best.w)
  body.angularVelocity.set(0, 0, 0)
}

// ── Non-d6 geometry / physics helpers ────────────────────────────────────────

// Build a cannon-es ConvexPolyhedron from any Three.js BufferGeometry.
// Deduplicates vertices so shared edges collapse to single points.
function buildConvexFromGeo(geo: THREE.BufferGeometry): CANNON.ConvexPolyhedron {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const index = geo.index
  const seen = new Map<string, number>()
  const uniqueVerts: CANNON.Vec3[] = []
  const remap: number[] = []

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`
    if (!seen.has(key)) { seen.set(key, uniqueVerts.length); uniqueVerts.push(new CANNON.Vec3(x, y, z)) }
    remap.push(seen.get(key)!)
  }

  const faces: number[][] = []
  if (index) {
    for (let i = 0; i < index.count; i += 3)
      faces.push([remap[index.getX(i)], remap[index.getX(i+1)], remap[index.getX(i+2)]])
  } else {
    for (let i = 0; i < pos.count; i += 3)
      faces.push([remap[i], remap[i+1], remap[i+2]])
  }

  return new CANNON.ConvexPolyhedron({ vertices: uniqueVerts, faces })
}

function makeExplicitD10Geometry(r: number): {
  geo: THREE.BufferGeometry
  faceDefs: PolyFaceDef[]
} {
  const top = new THREE.Vector3(0, r, 0)
  const bottom = new THREE.Vector3(0, -r, 0)
  const ring: THREE.Vector3[] = []
  const ringRadius = r * 0.82
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    ring.push(new THREE.Vector3(
      Math.cos(a) * ringRadius,
      0,
      Math.sin(a) * ringRadius,
    ))
  }

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const groups: { start: number; count: number; materialIndex: number }[] = []
  const faceDefs: PolyFaceDef[] = []
  const faceValues = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9]

  function addFace(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, materialIndex: number) {
    const ab = new THREE.Vector3().subVectors(b, a)
    const ac = new THREE.Vector3().subVectors(c, a)
    const normal = new THREE.Vector3().crossVectors(ab, ac).normalize()
    positions.push(
      a.x, a.y, a.z,
      b.x, b.y, b.z,
      c.x, c.y, c.z,
    )
    for (let i = 0; i < 3; i++) normals.push(normal.x, normal.y, normal.z)
    uvs.push(0.5, 0.1, 0.14, 0.9, 0.86, 0.9)
    groups.push({ start: positions.length / 3 - 3, count: 3, materialIndex })
    faceDefs.push({
      value: faceValues[materialIndex],
      normal: new CANNON.Vec3(normal.x, normal.y, normal.z),
    })
  }

  for (let i = 0; i < 5; i++) {
    addFace(top, ring[i], ring[(i + 1) % 5], i)
  }
  for (let i = 0; i < 5; i++) {
    addFace(bottom, ring[(i + 1) % 5], ring[i], 5 + i)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  groups.forEach(group => geo.addGroup(group.start, group.count, group.materialIndex))
  return { geo, faceDefs }
}

// Pentagonal trapezohedron — the correct d10 shape (10 kite-shaped faces, 12 vertices).
// Upper kites neighbour the top pole (odd values 1,3,5,7,9).
// Lower kites neighbour the bottom pole (even values 2,4,6,8,10).
function makeD10TrapezohedronGeometry(r: number): {
  geo: THREE.BufferGeometry
  faceDefs: PolyFaceDef[]
} {
  const n = 5
  const hPole  = r * 0.94  // pole height
  const yUpper =  r * 0.18 // upper equatorial ring Y
  const yLower = -r * 0.18 // lower equatorial ring Y
  const rEq    =  r * 0.84 // equatorial radius

  const top    = new THREE.Vector3(0,  hPole, 0)
  const bottom = new THREE.Vector3(0, -hPole, 0)
  const upper: THREE.Vector3[] = []
  const lower: THREE.Vector3[] = []

  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    upper.push(new THREE.Vector3(rEq * Math.cos(a), yUpper, rEq * Math.sin(a)))
  }
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2
    lower.push(new THREE.Vector3(rEq * Math.cos(a), yLower, rEq * Math.sin(a)))
  }

  // Standard d10 arrangement: odd on upper kites, even on lower (10 instead of 0)
  const upperValues = [9, 7, 5, 3, 1]
  const lowerValues = [8, 6, 4, 2, 10]

  const positions: number[] = []
  const normals:   number[] = []
  const uvs:       number[] = []
  const faceDefs: PolyFaceDef[] = []

  // Upper kite i = (top, lower[i], upper[i], upper[(i+1)%n])
  // Correct CCW winding from outside: tri1=(top, lower[i], upper[i])  tri2=(top, upper[(i+1)%n], lower[i])
  for (let i = 0; i < n; i++) {
    const a = top, b = lower[i], c = upper[i], d = upper[(i + 1) % n]
    const norm = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a),
      )
      .normalize()

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)   // tri 1
    for (let k = 0; k < 3; k++) normals.push(norm.x, norm.y, norm.z)
    uvs.push(0.5, 0.07, 0.07, 0.9, 0.9, 0.9)

    positions.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z)   // tri 2
    for (let k = 0; k < 3; k++) normals.push(norm.x, norm.y, norm.z)
    uvs.push(0.5, 0.07, 0.9, 0.9, 0.07, 0.9)

    faceDefs.push({ value: upperValues[i], normal: new CANNON.Vec3(norm.x, norm.y, norm.z) })
  }

  // Lower kite i = (bottom, lower[i], upper[(i+1)%n], lower[(i+1)%n])
  // Correct CCW winding from outside: tri1=(bottom, lower[i], upper[(i+1)%n])  tri2=(bottom, upper[(i+1)%n], lower[(i+1)%n])
  for (let i = 0; i < n; i++) {
    const a = bottom, b = lower[i], c = upper[(i + 1) % n], d = lower[(i + 1) % n]
    const norm = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a),
      )
      .normalize()

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)   // tri 1
    for (let k = 0; k < 3; k++) normals.push(norm.x, norm.y, norm.z)
    uvs.push(0.5, 0.93, 0.07, 0.1, 0.9, 0.1)

    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)   // tri 2
    for (let k = 0; k < 3; k++) normals.push(norm.x, norm.y, norm.z)
    uvs.push(0.5, 0.93, 0.9, 0.1, 0.07, 0.1)

    faceDefs.push({ value: lowerValues[i], normal: new CANNON.Vec3(norm.x, norm.y, norm.z) })
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3))
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,       2))

  return { geo, faceDefs }
}

// Returns the geometry and matching ConvexPolyhedron physics shape for each die type.
// d6 is handled separately (BoxGeometry + CANNON.Box) — this is for non-d6 only.
function getNonD6DieShapes(sides: number): {
  geo: THREE.BufferGeometry
  physicsShape: CANNON.ConvexPolyhedron
  faceDefs: PolyFaceDef[]
} {
  const r = DIE_HALF * 1.08
  let geo: THREE.BufferGeometry
  let faceDefs: PolyFaceDef[] = []

  switch (sides) {
    case 4:
      geo = new THREE.TetrahedronGeometry(r * 1.22, 0)
      break
    case 8:
      geo = new THREE.OctahedronGeometry(r * 1.08, 0)
      break
    case 10: {
      // Use the correct pentagonal trapezohedron shape
      const t = makeD10TrapezohedronGeometry(r * 1.08)
      geo = t.geo
      faceDefs = t.faceDefs
      break
    }
    case 12:
      geo = new THREE.DodecahedronGeometry(r * 1.02, 0)
      break
    case 20:
      geo = new THREE.IcosahedronGeometry(r * 1.06, 0)
      break
    default: {
      const explicit = makeExplicitD10Geometry(r * 1.08)
      geo = explicit.geo
      faceDefs = explicit.faceDefs
      break
    }
  }

  const physicsShape = buildConvexFromGeo(geo)
  return { geo, physicsShape, faceDefs }
}

function getPolyFaceUp(body: CANNON.Body, faceDefs: PolyFaceDef[]): number {
  if (faceDefs.length === 0) return 1
  const worldN = new CANNON.Vec3()
  let bestDot = -Infinity
  let bestValue = faceDefs[0].value
  for (const face of faceDefs) {
    body.quaternion.vmult(face.normal, worldN)
    if (worldN.y > bestDot) {
      bestDot = worldN.y
      bestValue = face.value
    }
  }
  return bestValue
}

// Snap a non-d6 physics body so the logical face most-aligned with world +Y faces up exactly.
function snapPolyhedronFaceUp(body: CANNON.Body, faceDefs: PolyFaceDef[]) {
  if (faceDefs.length === 0) return
  const worldN = new CANNON.Vec3()
  let bestDot = -Infinity
  let bestFace = faceDefs[0]
  for (const face of faceDefs) {
    body.quaternion.vmult(face.normal, worldN)
    if (worldN.y > bestDot) {
      bestDot = worldN.y
      bestFace = face
    }
  }

  const current   = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
  const worldUp   = new THREE.Vector3(0, 1, 0)
  const localUp   = new THREE.Vector3(bestFace.normal.x, bestFace.normal.y, bestFace.normal.z)
  const base      = new THREE.Quaternion().setFromUnitVectors(localUp, worldUp)

  let best = base, bestScore = -Infinity
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const candidate = new THREE.Quaternion().setFromAxisAngle(worldUp, angle).multiply(base.clone())
    const score = Math.abs(candidate.dot(current))
    if (score > bestScore) { bestScore = score; best = candidate.clone() }
  }

  body.quaternion.set(best.x, best.y, best.z, best.w)
  body.angularVelocity.set(0, 0, 0)
}

// ── Per-die state ─────────────────────────────────────────────────────────────

interface ZoneAnim {
  fromPos: THREE.Vector3
  fromQuat: THREE.Quaternion
  toPos: THREE.Vector3
  toQuat: THREE.Quaternion
  startAt: number
  duration: number
}

interface DieEntry {
  id: string
  sides: number
  precomputedResult: number   // used for non-d6; -1 for d6 (physics determines)
  body: CANNON.Body
  mesh: THREE.Mesh
  slotIndex: number
  settled: boolean
  settleCount: number
  maxTimer: ReturnType<typeof setTimeout> | null
  resultValue: number | null
  resultTexture?: THREE.CanvasTexture  // tracks dynamically-created result texture for safe disposal
  zone: 'tray' | 'held'
  zoneAnim?: ZoneAnim
  faceDefs: PolyFaceDef[]     // logical numbered faces for d10 and future d100
  supportVertices: CANNON.Vec3[]
  lineupStartPos: THREE.Vector3
  lineupStartQuat: THREE.Quaternion
  lineupTargetPos: THREE.Vector3
  lineupTargetQuat: THREE.Quaternion
}

function getSupportHeight(
  vertices: CANNON.Vec3[],
  quaternion: CANNON.Quaternion,
): number {
  if (vertices.length === 0) return DIE_HALF
  const worldV = new CANNON.Vec3()
  let minY = Infinity
  for (const vertex of vertices) {
    quaternion.vmult(vertex, worldV)
    minY = Math.min(minY, worldV.y)
  }
  return -minY
}

function threeQuatToCannon(quat: THREE.Quaternion) {
  return new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w)
}

function computeHeldSlotX(idx: number, total: number): number {
  const gap = 1.05
  return -(total - 1) * gap / 2 + idx * gap
}

function keepDieInsideTray(entry: DieEntry) {
  const body = entry.body
  const limitX = TRAY_W / 2 - DIE_HALF - 0.08
  const limitZ = TRAY_D / 2 - DIE_HALF - 0.08

  if (body.position.x > limitX) {
    body.position.x = limitX
    body.velocity.x = -Math.abs(body.velocity.x) * 0.55
  } else if (body.position.x < -limitX) {
    body.position.x = -limitX
    body.velocity.x = Math.abs(body.velocity.x) * 0.55
  }

  if (body.position.z > limitZ) {
    body.position.z = limitZ
    body.velocity.z = -Math.abs(body.velocity.z) * 0.55
  } else if (body.position.z < -limitZ) {
    body.position.z = -limitZ
    body.velocity.z = Math.abs(body.velocity.z) * 0.55
  }

  if (entry.sides === 6) {
    if (body.position.y < DIE_HALF) {
      body.position.y = DIE_HALF
    }
  } else {
    const supportHeight = getSupportHeight(entry.supportVertices, body.quaternion)
    if (body.position.y < supportHeight) {
      body.position.y = supportHeight
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface D6CanvasHandle {
  addDie: (id: string, sides: number, initialValue?: number) => void
  removeDie: (id: string) => void
  rollAll: () => void
  rollSome: (idsToRoll: string[]) => void
  clearAll: () => void
  stageAll: () => void
  setDieZone: (id: string, zone: 'tray' | 'held') => void
}

export interface D6CanvasProps {
  onDieSettled: (id: string, value: number) => void
  onDieClick?: (id: string) => void
  onLineupComplete?: () => void
  tuning?: DiceTuning
  disableLineup?: boolean
  enableHeldZone?: boolean
}

export interface DiceTuning {
  launchSpeed: number
  launchSpread: number
  launchSpin: number
  settleVelocity: number
  settleAngular: number
  settleHoldFrames: number
  lineupDelayMs: number
  lineupDurationMs: number
}

export const DEFAULT_DICE_TUNING: DiceTuning = {
  launchSpeed: 25,
  launchSpread: 7.8,
  launchSpin: 74,
  settleVelocity: 0.35,
  settleAngular: 0.4,
  settleHoldFrames: 4,
  lineupDelayMs: 180,
  lineupDurationMs: 420,
}

// ── Component ─────────────────────────────────────────────────────────────────

export const D6Canvas = forwardRef<D6CanvasHandle, D6CanvasProps>(
  function D6Canvas({ onDieSettled, onDieClick, onLineupComplete, tuning, disableLineup, enableHeldZone }, ref) {
    const mountRef        = useRef<HTMLDivElement>(null)
    const onSettledRef    = useRef(onDieSettled)
    const onDieClickRef   = useRef(onDieClick)
    const onLineupCompleteRef = useRef(onLineupComplete)
    const tuningRef       = useRef<DiceTuning>({ ...DEFAULT_DICE_TUNING, ...tuning })
    const disableLineupRef = useRef(disableLineup ?? false)
    const enableHeldZoneRef = useRef(enableHeldZone ?? false)
    useEffect(() => { enableHeldZoneRef.current = enableHeldZone ?? false }, [enableHeldZone])
    useEffect(() => { onSettledRef.current = onDieSettled })
    useEffect(() => { onDieClickRef.current = onDieClick }, [onDieClick])
    useEffect(() => { onLineupCompleteRef.current = onLineupComplete }, [onLineupComplete])
    useEffect(() => { tuningRef.current = { ...DEFAULT_DICE_TUNING, ...tuning } }, [tuning])
    useEffect(() => { disableLineupRef.current = disableLineup ?? false }, [disableLineup])

    // Three / Cannon singletons
    const worldRef    = useRef<CANNON.World | null>(null)
    const sceneRef    = useRef<THREE.Scene | null>(null)
    const cameraRef   = useRef<THREE.OrthographicCamera | null>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const rafRef      = useRef<number | null>(null)
    const diceMatRef  = useRef<CANNON.Material | null>(null)
    const lineupRef   = useRef<{
      active: boolean
      completed: boolean
      startAt: number
      readyAt: number | null
    }>({ active: false, completed: false, startAt: 0, readyAt: null })

    const dieEntriesRef = useRef<DieEntry[]>([])

    function clearSettleTimer(entry: DieEntry) {
      if (entry.maxTimer) {
        clearTimeout(entry.maxTimer)
        entry.maxTimer = null
      }
    }

    // Place a single newly-added die at its staging slot; never moves existing dice.
    function stageDieAtSlot(entry: DieEntry, slotIndex: number) {
      const cols = Math.max(1, Math.floor((TRAY_W - 1.2) / 1.1))
      const startX = -TRAY_W / 2 + DIE_HALF + 0.5
      const startZ = -TRAY_D / 2 + DIE_HALF + 0.45
      const col = slotIndex % cols
      const row = Math.floor(slotIndex / cols)
      const x = startX + col * 1.1
      const z = startZ + row * 1.1
      entry.slotIndex = slotIndex
      if (entry.sides === 6) {
        entry.body.position.set(x, DIE_HALF, z)
        entry.body.quaternion.set(0, 0, 0, 1)
      } else {
        entry.body.quaternion.set(0, 0, 0, 1)
        entry.body.position.set(x, getSupportHeight(entry.supportVertices, entry.body.quaternion), z)
      }
      entry.body.velocity.set(0, 0, 0)
      entry.body.angularVelocity.set(0, 0, 0)
      entry.body.sleep()
      entry.mesh.position.set(x, entry.sides === 6 ? DIE_HALF : entry.body.position.y, z)
      entry.mesh.quaternion.set(0, 0, 0, 1)
    }

function restoreD6FaceMaps(entry: DieEntry) {
      const mats = entry.mesh.material as THREE.MeshPhongMaterial[]
      const tex = getD6Textures()
      D6_FACE_VALUES.forEach((value, index) => {
        mats[index].map = tex[value - 1]
        mats[index].needsUpdate = true
      })
}

function showD6ResultOnTop(entry: DieEntry, result: number) {
  const mats = entry.mesh.material as THREE.MeshPhongMaterial[]
  restoreD6FaceMaps(entry)
  mats[2].map = makeResultTexture(result)
  mats[2].needsUpdate = true
}

    function startLineup(now: number) {
      if (lineupRef.current.active || dieEntriesRef.current.length === 0) return

      const perRow = Math.max(1, Math.floor((TRAY_W - 1.2) / 1.05))
      const baseX = -TRAY_W / 2 + DIE_HALF + 0.5
      const baseZ = TRAY_D / 2 - DIE_HALF - 0.45
      const gapX = DIE_HALF * 2 + 0.22
      const gapZ = DIE_HALF * 2 + 0.24

      dieEntriesRef.current.forEach((entry, index) => {
        const col = index % perRow
        const row = Math.floor(index / perRow)
        entry.lineupStartPos.copy(entry.mesh.position)
        entry.lineupStartQuat.copy(entry.mesh.quaternion)
        const targetX = baseX + col * gapX
        const targetZ = baseZ - row * gapZ
        // d6: always show result face up (identity = face-1 up)
        // non-d6: hold the snapped-face-up orientation from settleEntry
        if (entry.sides === 6) {
          entry.lineupTargetQuat.identity()
        } else {
          entry.lineupTargetQuat.copy(entry.mesh.quaternion)
        }
        if (entry.sides === 6) {
          entry.lineupTargetPos.set(targetX, DIE_HALF, targetZ)
        } else {
          const supportHeight = getSupportHeight(
            entry.supportVertices,
            threeQuatToCannon(entry.lineupTargetQuat),
          )
          entry.lineupTargetPos.set(targetX, supportHeight, targetZ)
        }
      })

      lineupRef.current = { active: true, completed: false, startAt: now, readyAt: null }
    }

    // ── Settle a die ─────────────────────────────────────────────────────────

    function settleEntry(entry: DieEntry) {
      if (entry.settled) return
      entry.settled = true
      if (entry.maxTimer) { clearTimeout(entry.maxTimer); entry.maxTimer = null }

      let result: number
      if (entry.sides === 6) {
        snapD6BodyToNearestFace(entry.body)
        result = getD6FaceUp(entry.body)
        const mats = entry.mesh.material as THREE.MeshPhongMaterial[]
        entry.resultTexture?.dispose()
        const resultTex = makeResultTexture(result)
        mats[2].map = resultTex
        mats[2].needsUpdate = true
        entry.resultTexture = resultTex
      } else if (entry.sides === 10) {
        snapPolyhedronFaceUp(entry.body, entry.faceDefs)
        result = getPolyFaceUp(entry.body, entry.faceDefs)
        const mat = entry.mesh.material as THREE.MeshPhongMaterial
        const oldTex = mat.map
        mat.map = makeResultTexture(result)
        mat.needsUpdate = true
        oldTex?.dispose()
      } else {
        result = entry.precomputedResult
        if (entry.faceDefs.length > 0) {
          snapPolyhedronFaceUp(entry.body, entry.faceDefs)
        }
        // Single material — swap to result texture (shows on all faces)
        const mat = entry.mesh.material as THREE.MeshPhongMaterial
        const oldTex = mat.map
        mat.map = makeResultTexture(result)
        mat.needsUpdate = true
        oldTex?.dispose()
      }

      // Fully freeze the body so it does not visibly shimmy after settling.
      entry.body.velocity.set(0, 0, 0)
      entry.body.angularVelocity.set(0, 0, 0)
      entry.body.force.set(0, 0, 0)
      entry.body.torque.set(0, 0, 0)
      entry.body.position.y = entry.sides === 6
        ? DIE_HALF
        : getSupportHeight(entry.supportVertices, entry.body.quaternion)
      entry.body.sleep()
      entry.resultValue = result

      entry.mesh.position.set(entry.body.position.x, entry.body.position.y, entry.body.position.z)
      entry.mesh.quaternion.set(
        entry.body.quaternion.x,
        entry.body.quaternion.y,
        entry.body.quaternion.z,
        entry.body.quaternion.w,
      )

      onSettledRef.current(entry.id, result)
    }

    // ── Orthographic frustum helper ───────────────────────────────────────────

    function fitCamera(w: number, h: number) {
      const cam = cameraRef.current
      if (!cam) return
      const trW = TRAY_W + WALL_T * 2 + 0.6
      const topExtent    = TRAY_D / 2 + WALL_T + 0.3   // world Z shown above center
      const bottomExtent = enableHeldZoneRef.current
        ? HELD_ZONE_END_Z + 0.25               // world Z shown below center (held zone)
        : topExtent
      const trH = topExtent + bottomExtent
      const aspect = w / h
      let hW: number, top: number, bottom: number
      if (aspect >= trW / trH) {
        // canvas wider than needed → fit height, extend sides
        top    = topExtent
        bottom = bottomExtent
        hW     = (trH * aspect) / 2
      } else {
        // canvas taller → fit width, scale height proportionally
        hW     = trW / 2
        const scale = (trW / aspect) / trH
        top    = topExtent * scale
        bottom = bottomExtent * scale
      }
      cam.left   = -hW
      cam.right  =  hW
      cam.top    =  top
      cam.bottom = -bottom
      cam.updateProjectionMatrix()
    }

    // ── One-time scene setup ──────────────────────────────────────────────────

    useEffect(() => {
      const container = mountRef.current
      if (!container) return
      const W = container.clientWidth  || 350
      const H = container.clientHeight || 350

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(W, H)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.setClearColor(0xF8FAFC)
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer

      // Scene
      const scene = new THREE.Scene()
      sceneRef.current = scene
      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()

      // Orthographic camera — straight above, +Z = bottom of screen
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
      cam.position.set(0, 20, 0)
      cam.lookAt(0, 0, 0)
      cam.up.set(0, 0, -1)   // −Z is screen-up (so back wall is at screen top)
      cameraRef.current = cam
      fitCamera(W, H)

      // Lighting — bright ambient for legibility plus a glossier key light.
      scene.add(new THREE.AmbientLight(0xffffff, 1.15))
      const hemi = new THREE.HemisphereLight(0xffffff, 0xc7f3ee, 0.52)
      scene.add(hemi)
      const dir = new THREE.DirectionalLight(0xffffff, 1.28)
      dir.position.set(2.8, 6.8, 4.6)
      dir.castShadow = true
      dir.shadow.mapSize.set(1024, 1024)
      dir.shadow.camera.near = 0.1
      dir.shadow.camera.far  = 50
      dir.shadow.camera.left = dir.shadow.camera.bottom = -8
      dir.shadow.camera.right = dir.shadow.camera.top   =  8
      dir.shadow.bias = -0.00005
      scene.add(dir)

      // ── Tray visuals ──────────────────────────────────────────────────────

      // Green felt floor
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(TRAY_W, 0.06, TRAY_D),
        new THREE.MeshLambertMaterial({
          color: 0xffffff,
          map: getFeltTexture(),
        }),
      )
      floor.position.y = -0.03
      floor.receiveShadow = true
      scene.add(floor)

      // ── Held zone (Yacht) ─────────────────────────────────────────────────
      if (enableHeldZone) {
        // Extended floor for the held area (slightly warmer felt tone)
        const heldFloorMat = new THREE.MeshLambertMaterial({ color: 0x28B5A8, map: getFeltTexture() })
        const heldFloor = new THREE.Mesh(
          new THREE.BoxGeometry(TRAY_W, 0.06, HELD_ZONE_FLOOR_D),
          heldFloorMat,
        )
        heldFloor.position.set(0, -0.03, TRAY_D / 2 + WALL_T + 0.1 + HELD_ZONE_FLOOR_D / 2)
        heldFloor.receiveShadow = true
        scene.add(heldFloor)

        // Thin separator rail between tray and held zone
        const railMat = new THREE.MeshLambertMaterial({ color: 0x1A3A34 })
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(TRAY_W + WALL_T * 2, 0.12, 0.1),
          railMat,
        )
        rail.position.set(0, 0.06, TRAY_D / 2 + WALL_T + 0.05)
        scene.add(rail)
      }

      // Dark-wood walls
      const wallMat = new THREE.MeshLambertMaterial({ color: 0x2D3748 })
      const wallDefs: { size: [number,number,number]; pos: [number,number,number] }[] = [
        { size:[TRAY_W+WALL_T*2, WALL_H, WALL_T], pos:[0,            WALL_H/2, -(TRAY_D/2+WALL_T/2)] },
        { size:[TRAY_W+WALL_T*2, WALL_H, WALL_T], pos:[0,            WALL_H/2,   TRAY_D/2+WALL_T/2] },
        { size:[WALL_T, WALL_H, TRAY_D],          pos:[-(TRAY_W/2+WALL_T/2), WALL_H/2, 0] },
        { size:[WALL_T, WALL_H, TRAY_D],          pos:[  TRAY_W/2+WALL_T/2,  WALL_H/2, 0] },
      ]
      wallDefs.forEach(({ size, pos }) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMat)
        m.position.set(...pos)
        m.receiveShadow = true
        scene.add(m)
      })

      // ── Physics ───────────────────────────────────────────────────────────

      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      world.allowSleep = true
      worldRef.current = world

      const diceMat  = new CANNON.Material('dice')
      const floorMat = new CANNON.Material('floor')
      const wallPhysMat = new CANNON.Material('wall')
      diceMatRef.current = diceMat

      world.addContactMaterial(new CANNON.ContactMaterial(diceMat, floorMat,    { restitution: 0.4,  friction: 0.35 }))
      world.addContactMaterial(new CANNON.ContactMaterial(diceMat, wallPhysMat, { restitution: 0.45, friction: 0.25 }))
      world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat,     { restitution: 0.3,  friction: 0.25 }))

      world.addBody(new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(TRAY_W/2, 0.03, TRAY_D/2)),
        position: new CANNON.Vec3(0, -0.03, 0),
        material: floorMat,
      }))

      const physWalls: { half:[number,number,number]; pos:[number,number,number] }[] = [
        { half:[(TRAY_W+WALL_T*2)/2, WALL_H/2, WALL_T/2], pos:[0, WALL_H/2, -(TRAY_D/2+WALL_T/2)] },
        { half:[(TRAY_W+WALL_T*2)/2, WALL_H/2, WALL_T/2], pos:[0, WALL_H/2,   TRAY_D/2+WALL_T/2] },
        { half:[WALL_T/2, WALL_H/2, TRAY_D/2],            pos:[-(TRAY_W/2+WALL_T/2), WALL_H/2, 0] },
        { half:[WALL_T/2, WALL_H/2, TRAY_D/2],            pos:[  TRAY_W/2+WALL_T/2,  WALL_H/2, 0] },
      ]
      physWalls.forEach(({ half, pos }) => {
        world.addBody(new CANNON.Body({
          mass: 0,
          shape: new CANNON.Box(new CANNON.Vec3(...half)),
          position: new CANNON.Vec3(...pos),
          material: wallPhysMat,
        }))
      })

      // ── Render / physics loop ─────────────────────────────────────────────

      const fixedStep = 1 / 60
      let lastTime = performance.now()

      function animate(now: number) {
        rafRef.current = requestAnimationFrame(animate)
        const dt = Math.min((now - lastTime) / 1000, 1/30)
        lastTime = now

        world.step(fixedStep, dt, 3)

        for (const entry of dieEntriesRef.current) {
          // Zone animation (hold/unhold): takes priority over physics sync
          if (entry.zoneAnim) {
            const za = entry.zoneAnim
            const t = Math.min(1, (now - za.startAt) / za.duration)
            const eased = 1 - Math.pow(1 - t, 3)
            entry.mesh.position.lerpVectors(za.fromPos, za.toPos, eased)
            entry.mesh.quaternion.copy(za.fromQuat).slerp(za.toQuat, eased)
            // Keep sleeping body in sync so physics starts from correct position
            const mp = entry.mesh.position
            const mq = entry.mesh.quaternion
            entry.body.position.set(mp.x, mp.y, mp.z)
            entry.body.quaternion.set(mq.x, mq.y, mq.z, mq.w)
            if (t >= 1) {
              entry.mesh.position.copy(za.toPos)
              entry.mesh.quaternion.copy(za.toQuat)
              entry.body.position.set(za.toPos.x, za.toPos.y, za.toPos.z)
              entry.body.quaternion.set(za.toQuat.x, za.toQuat.y, za.toQuat.z, za.toQuat.w)
              entry.zoneAnim = undefined
            }
            continue
          }

          // Normal physics sync
          const b = entry.body
          if (!lineupRef.current.active && !lineupRef.current.completed) {
            if (entry.zone !== 'held') keepDieInsideTray(entry)
            entry.mesh.position.set(b.position.x, b.position.y, b.position.z)
            entry.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)

            // Per-die settle detection
            if (!entry.settled) {
              if (b.sleepState === CANNON.Body.SLEEPING) {
                settleEntry(entry)
              } else if (
                b.velocity.length() < tuningRef.current.settleVelocity &&
                b.angularVelocity.length() < tuningRef.current.settleAngular
              ) {
                entry.settleCount++
                if (entry.settleCount >= tuningRef.current.settleHoldFrames) settleEntry(entry)
              } else {
                entry.settleCount = 0
              }
            }
          }
        }

        if (!lineupRef.current.active && !lineupRef.current.completed && dieEntriesRef.current.length > 0 && !disableLineupRef.current) {
          const allReadyForLineup = dieEntriesRef.current.every(entry => {
            if (entry.settled) return true
            const body = entry.body
            return (
              body.sleepState === CANNON.Body.SLEEPING ||
              (body.velocity.length() < LINEUP_READY_VEL &&
                body.angularVelocity.length() < LINEUP_READY_ANG)
            )
          })

          if (allReadyForLineup) {
            if (lineupRef.current.readyAt === null) {
              lineupRef.current.readyAt = now
            }

            if (now - lineupRef.current.readyAt >= tuningRef.current.lineupDelayMs) {
              for (const entry of dieEntriesRef.current) {
                if (!entry.settled) settleEntry(entry)
              }
              startLineup(now)
            }
          } else {
            lineupRef.current.readyAt = null
          }
        }

        if (lineupRef.current.active && !disableLineupRef.current) {
          const t = Math.min(1, (now - lineupRef.current.startAt) / tuningRef.current.lineupDurationMs)
          const eased = 1 - Math.pow(1 - t, 3)
          for (const entry of dieEntriesRef.current) {
            entry.mesh.position.lerpVectors(entry.lineupStartPos, entry.lineupTargetPos, eased)
            entry.mesh.quaternion.copy(entry.lineupStartQuat).slerp(entry.lineupTargetQuat, eased)
          }
          if (t >= 1) {
            lineupRef.current.active = false
            lineupRef.current.completed = true
            lineupRef.current.readyAt = null
            for (const entry of dieEntriesRef.current) {
              entry.mesh.position.copy(entry.lineupTargetPos)
              entry.mesh.quaternion.copy(entry.lineupTargetQuat)
            }
            onLineupCompleteRef.current?.()
          }
        }

        renderer.render(scene, cam)
      }
      rafRef.current = requestAnimationFrame(animate)

      // ── Resize ────────────────────────────────────────────────────────────

      const ro = new ResizeObserver(() => {
        const w = container.clientWidth
        const h = container.clientHeight
        if (!w || !h) return
        renderer.setSize(w, h)
        fitCamera(w, h)
      })
      ro.observe(container)

      function handlePointerDown(event: PointerEvent) {
        if (!onDieClickRef.current) return
        const rect = renderer.domElement.getBoundingClientRect()
        if (!rect.width || !rect.height) return

        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
        raycaster.setFromCamera(pointer, cam)

        const meshes = dieEntriesRef.current.map(entry => entry.mesh)
        const hits = raycaster.intersectObjects(meshes, false)
        if (hits.length === 0) return

        const mesh = hits[0].object
        const entry = dieEntriesRef.current.find(die => die.mesh === mesh)
        if (!entry) return
        onDieClickRef.current(entry.id)
      }

      renderer.domElement.addEventListener('pointerdown', handlePointerDown)

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        ro.disconnect()
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
        renderer.dispose()
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
        // Clear all die timers
        dieEntriesRef.current.forEach(e => { if (e.maxTimer) clearTimeout(e.maxTimer) })
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // mount only — enableHeldZone is intentionally snapshotted at mount

    // ── Imperative API ────────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      addDie(id: string, sides: number, initialValue?: number) {
        const world = worldRef.current
        const scene = sceneRef.current
        if (!world || !scene) return

        const isD6    = sides === 6
        const isD10   = sides === 10
        const precomputed = (isD6 || isD10) ? -1 : Math.floor(Math.random() * sides) + 1

        // ── Mesh + Physics shape ─────────────────────────────────────────────
        let geo: THREE.BufferGeometry
        let meshMaterial: THREE.MeshPhongMaterial | THREE.MeshPhongMaterial[]
        let physicsShape: CANNON.Shape
        let faceDefs: PolyFaceDef[] = []
        let supportVertices: CANNON.Vec3[] = CUBE_VERTICES

        if (isD6) {
          geo = new THREE.BoxGeometry(DIE_HALF*2, DIE_HALF*2, DIE_HALF*2)
          physicsShape = new CANNON.Box(new CANNON.Vec3(DIE_HALF, DIE_HALF, DIE_HALF))
          const tex = getD6Textures()
          meshMaterial = D6_FACE_VALUES.map(v => new THREE.MeshPhongMaterial({
            map: tex[v-1],
            color: DIE_MATERIAL_COLOR,
            emissive: DIE_EMISSIVE_COLOR,
            emissiveIntensity: 0.24,
            specular: new THREE.Color(DIE_SPECULAR_COLOR),
            shininess: 68,
            reflectivity: 0.9,
          }))
        } else {
          const { geo: pGeo, physicsShape: convex, faceDefs: logicalFaces } = getNonD6DieShapes(sides)
          geo = pGeo
          physicsShape = convex
          faceDefs = logicalFaces
          supportVertices = convex.vertices

          meshMaterial = new THREE.MeshPhongMaterial({
            map: makeColorFaceTexture(`d${sides}`),
            color: DIE_MATERIAL_COLOR,
            emissive: DIE_EMISSIVE_COLOR,
            emissiveIntensity: 0.24,
            specular: new THREE.Color(DIE_SPECULAR_COLOR),
            shininess: 60,
            reflectivity: 0.88,
          })
        }

        const mesh = new THREE.Mesh(geo, meshMaterial)
        mesh.castShadow = true
        mesh.receiveShadow = true
        scene.add(mesh)

        const body = new CANNON.Body({
          mass:            1,
          shape:           physicsShape,
          position:        new CANNON.Vec3(0, DIE_HALF, 0),
          linearDamping:   LINEAR_DAMPING,
          angularDamping:  ANGULAR_DAMPING,
          material:        diceMatRef.current ?? undefined,
          sleepSpeedLimit: 0.5,
          sleepTimeLimit:  0.1,
        })
        world.addBody(body)

        const slotIndex = dieEntriesRef.current.length
        const entry: DieEntry = {
          id, sides, precomputedResult: precomputed,
          body, mesh, slotIndex, settled: false, settleCount: 0,
          maxTimer: null,
          resultValue: null,
          zone: 'tray' as const,
          zoneAnim: undefined,
          faceDefs,
          supportVertices,
          lineupStartPos: new THREE.Vector3(),
          lineupStartQuat: new THREE.Quaternion(),
          lineupTargetPos: new THREE.Vector3(),
          lineupTargetQuat: new THREE.Quaternion(),
        }
        dieEntriesRef.current.push(entry)
        lineupRef.current.active = false
        lineupRef.current.completed = false
        lineupRef.current.readyAt = null
        stageDieAtSlot(entry, slotIndex)
        if (initialValue !== undefined && sides === 6) {
          entry.settled = true
          entry.resultValue = initialValue
          showD6ResultOnTop(entry, initialValue)
        }
      },

      removeDie(id: string) {
        const world = worldRef.current
        const scene = sceneRef.current
        if (!world || !scene) return
        const idx = dieEntriesRef.current.findIndex(e => e.id === id)
        if (idx === -1) return
        const entry = dieEntriesRef.current[idx]
        clearSettleTimer(entry)
        world.removeBody(entry.body)
        entry.mesh.geometry.dispose()
        if (Array.isArray(entry.mesh.material)) {
          ;(entry.mesh.material as THREE.MeshPhongMaterial[]).forEach(m => { m.map?.dispose(); m.dispose() })
        } else {
          const material = entry.mesh.material as THREE.MeshPhongMaterial
          material.map?.dispose()
          material.dispose()
        }
        scene.remove(entry.mesh)
        dieEntriesRef.current.splice(idx, 1)
        lineupRef.current.active = false
        lineupRef.current.completed = false
        lineupRef.current.readyAt = null
        dieEntriesRef.current.forEach((remaining, index) => {
          stageDieAtSlot(remaining, index)
        })
      },

      rollSome(idsToRoll: string[]) {
        const world = worldRef.current
        if (!world || dieEntriesRef.current.length === 0 || idsToRoll.length === 0) return
        lineupRef.current.active = false
        lineupRef.current.completed = false
        lineupRef.current.readyAt = null

        const innerX = TRAY_W / 2 - DIE_HALF - 0.18
        const innerZ = TRAY_D / 2 - DIE_HALF - 0.18
        const launchSpacing = DIE_HALF * 2 + 0.12
        const maxRows = Math.max(1, Math.floor((innerZ * 2) / launchSpacing))
        const toRoll = dieEntriesRef.current.filter(e => idsToRoll.includes(e.id))
        const rows = Math.min(toRoll.length, maxRows)
        const batchBoost = Math.min(8, Math.max(0, toRoll.length - 1) * 0.34)
        const liveTuning = tuningRef.current

        for (const [index, entry] of toRoll.entries()) {
          entry.settled = false
          entry.settleCount = 0
          entry.resultValue = null
          clearSettleTimer(entry)

          if (entry.sides !== 6 && entry.sides !== 10) {
            entry.precomputedResult = Math.floor(Math.random() * entry.sides) + 1
            const mat = entry.mesh.material as THREE.MeshPhongMaterial
            const oldTex = mat.map
            mat.map = makeColorFaceTexture(`d${entry.sides}`)
            mat.needsUpdate = true
            oldTex?.dispose()
          } else if (entry.sides === 10) {
            const mat = entry.mesh.material as THREE.MeshPhongMaterial
            const oldTex = mat.map
            mat.map = makeColorFaceTexture('d10')
            mat.needsUpdate = true
            oldTex?.dispose()
          } else if (entry.sides === 6) {
            restoreD6FaceMaps(entry)
          }

          const row = index % rows
          const col = Math.floor(index / rows)
          const sx = innerX - col * launchSpacing * 0.95
          const sz = -innerZ + row * launchSpacing
          const vx = -(liveTuning.launchSpeed + batchBoost + Math.random() * liveTuning.launchSpread)
          const vy = 1.8 + Math.random() * 2.4
          const vz = 9.5 + Math.random() * 4.8

          entry.body.wakeUp()
          entry.body.position.set(sx, DIE_HALF + 0.04, sz)
          entry.body.quaternion.set(0, 0, 0, 1)
          entry.body.velocity.set(vx, vy, vz)
          entry.body.angularVelocity.set(
            (Math.random() - 0.5) * liveTuning.launchSpin,
            (Math.random() - 0.5) * (liveTuning.launchSpin * 0.78),
            (Math.random() - 0.5) * liveTuning.launchSpin,
          )

          const entryId = entry.id
          entry.maxTimer = setTimeout(() => {
            const e = dieEntriesRef.current.find(x => x.id === entryId)
            if (e) settleEntry(e)
          }, MAX_SETTLE)
        }
      },

      rollAll() {
        const world = worldRef.current
        if (!world || dieEntriesRef.current.length === 0) return
        lineupRef.current.active = false
        lineupRef.current.completed = false
        lineupRef.current.readyAt = null

        const innerX = TRAY_W / 2 - DIE_HALF - 0.18
        const innerZ = TRAY_D / 2 - DIE_HALF - 0.18
        const launchSpacing = DIE_HALF * 2 + 0.12
        const maxRows = Math.max(1, Math.floor((innerZ * 2) / launchSpacing))
        const rows = Math.min(dieEntriesRef.current.length, maxRows)
        const batchBoost = Math.min(8, Math.max(0, dieEntriesRef.current.length - 1) * 0.34)
        const liveTuning = tuningRef.current

        for (const [index, entry] of dieEntriesRef.current.entries()) {
          entry.settled = false
          entry.settleCount = 0
          entry.resultValue = null
          clearSettleTimer(entry)

          // Re-randomise result for non-d6 dice
          if (entry.sides !== 6 && entry.sides !== 10) {
            entry.precomputedResult = Math.floor(Math.random() * entry.sides) + 1
            // Single material — swap back to label so result is hidden while rolling
            const mat = entry.mesh.material as THREE.MeshPhongMaterial
            const oldTex = mat.map
            mat.map = makeColorFaceTexture(`d${entry.sides}`)
            mat.needsUpdate = true
            oldTex?.dispose()
          } else if (entry.sides === 10) {
            // Single material — swap back to label so result is hidden while rolling
            const mat = entry.mesh.material as THREE.MeshPhongMaterial
            const oldTex = mat.map
            mat.map = makeColorFaceTexture('d10')
            mat.needsUpdate = true
            oldTex?.dispose()
          } else if (entry.sides === 6) {
            restoreD6FaceMaps(entry)
          }

          const row = index % rows
          const col = Math.floor(index / rows)
          const sx = innerX - col * launchSpacing * 0.95
          const sz = -innerZ + row * launchSpacing
          const vx = -(liveTuning.launchSpeed + batchBoost + Math.random() * liveTuning.launchSpread)
          const vy = 1.8 + Math.random() * 2.4
          const vz = 9.5 + Math.random() * 4.8

          // Wake up body and apply strong upper-right diagonal launch
          entry.body.wakeUp()
          entry.body.position.set(sx, DIE_HALF + 0.04, sz)
          entry.body.quaternion.set(0, 0, 0, 1)
          entry.body.velocity.set(vx, vy, vz)
          entry.body.angularVelocity.set(
            (Math.random() - 0.5) * liveTuning.launchSpin,
            (Math.random() - 0.5) * (liveTuning.launchSpin * 0.78),
            (Math.random() - 0.5) * liveTuning.launchSpin,
          )

          // Set new max-settle timer
          const entryId = entry.id
          entry.maxTimer = setTimeout(() => {
            const e = dieEntriesRef.current.find(x => x.id === entryId)
            if (e) settleEntry(e)
          }, MAX_SETTLE)
        }
      },

      clearAll() {
        const world = worldRef.current
        const scene = sceneRef.current
        if (!world || !scene) return
        lineupRef.current.active = false
        lineupRef.current.completed = false
        lineupRef.current.readyAt = null
        for (const entry of dieEntriesRef.current) {
          clearSettleTimer(entry)
          world.removeBody(entry.body)
          entry.mesh.geometry.dispose()
          if (Array.isArray(entry.mesh.material)) {
            ;(entry.mesh.material as THREE.MeshPhongMaterial[]).forEach(m => { m.map?.dispose(); m.dispose() })
          } else {
            const material = entry.mesh.material as THREE.MeshPhongMaterial
            material.map?.dispose()
            material.dispose()
          }
          scene.remove(entry.mesh)
        }
        dieEntriesRef.current = []
      },

      stageAll() {
        for (let i = 0; i < dieEntriesRef.current.length; i++) {
          const entry = dieEntriesRef.current[i]
          clearSettleTimer(entry)
          entry.resultTexture?.dispose()
          entry.resultTexture = undefined
          entry.resultValue = null
          entry.settled = true
          entry.settleCount = 0
          entry.zone = 'tray'
          entry.zoneAnim = undefined
          if (entry.sides === 6) restoreD6FaceMaps(entry)
          stageDieAtSlot(entry, i)
        }
        lineupRef.current.active = false
        lineupRef.current.completed = false
        lineupRef.current.readyAt = null
      },

      setDieZone(id: string, zone: 'tray' | 'held') {
        if (!enableHeldZoneRef.current) return
        const entry = dieEntriesRef.current.find(e => e.id === id)
        if (!entry || entry.zone === zone) return

        const now = performance.now()

        // Freeze the body so physics doesn't fight the animation
        entry.body.velocity.set(0, 0, 0)
        entry.body.angularVelocity.set(0, 0, 0)
        entry.body.sleep()
        entry.settled = true
        entry.zone = zone

        // ── Compute target position for this die ──────────────────────────
        let toPos: THREE.Vector3
        const toQuat = new THREE.Quaternion()  // identity = face-up

        if (zone === 'held') {
          const heldEntries = dieEntriesRef.current.filter(e => e.zone === 'held')
          const slotIdx = heldEntries.findIndex(e => e.id === id)
          const total   = heldEntries.length
          toPos = new THREE.Vector3(computeHeldSlotX(slotIdx, total), DIE_HALF, HELD_ZONE_Z)

          // Shuffle other held dice to their new centered positions
          heldEntries.forEach((he, idx) => {
            if (he.id === id) return
            const nx = computeHeldSlotX(idx, total)
            if (Math.abs(he.mesh.position.x - nx) < 0.01 && Math.abs(he.mesh.position.z - HELD_ZONE_Z) < 0.01) return
            he.zoneAnim = {
              fromPos: he.mesh.position.clone(),
              fromQuat: he.mesh.quaternion.clone(),
              toPos: new THREE.Vector3(nx, DIE_HALF, HELD_ZONE_Z),
              toQuat: new THREE.Quaternion(),
              startAt: now,
              duration: ZONE_ANIM_MS,
            }
          })
        } else {
          // Return to original tray slot
          const cols = Math.max(1, Math.floor((TRAY_W - 1.2) / 1.1))
          const startX = -TRAY_W / 2 + DIE_HALF + 0.5
          const startZ = -TRAY_D / 2 + DIE_HALF + 0.45
          const col = entry.slotIndex % cols
          const row = Math.floor(entry.slotIndex / cols)
          toPos = new THREE.Vector3(startX + col * 1.1, DIE_HALF, startZ + row * 1.1)

          // Re-center remaining held dice
          const heldEntries = dieEntriesRef.current.filter(e => e.zone === 'held')
          const total = heldEntries.length
          heldEntries.forEach((he, idx) => {
            const nx = computeHeldSlotX(idx, total)
            if (Math.abs(he.mesh.position.x - nx) < 0.01 && Math.abs(he.mesh.position.z - HELD_ZONE_Z) < 0.01) return
            he.zoneAnim = {
              fromPos: he.mesh.position.clone(),
              fromQuat: he.mesh.quaternion.clone(),
              toPos: new THREE.Vector3(nx, DIE_HALF, HELD_ZONE_Z),
              toQuat: new THREE.Quaternion(),
              startAt: now,
              duration: ZONE_ANIM_MS,
            }
          })
        }

        entry.zoneAnim = {
          fromPos: entry.mesh.position.clone(),
          fromQuat: entry.mesh.quaternion.clone(),
          toPos,
          toQuat,
          startAt: now,
          duration: ZONE_ANIM_MS,
        }
      },
    }))

    return (
      <div
        ref={mountRef}
        className="w-full h-full"
      />
    )
  },
)
