'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'

// ── Tray / physics constants ──────────────────────────────────────────────────

const TRAY_W = 5.0           // world-units wide
const TRAY_D = 3.2           // world-units deep
const WALL_H = 0.65          // wall height
const WALL_T = 0.18          // wall thickness
const DIE_HALF = 0.32        // half-side of each die cube  (full = 0.64 wu)
const GRAVITY = -28
const LINEAR_DAMPING = 0.22
const ANGULAR_DAMPING = 0.32
const SETTLE_VEL = 0.06      // linear velocity threshold
const SETTLE_ANG = 0.08      // angular velocity threshold
const SETTLE_HOLD = 55       // consecutive frames below threshold before "settled"
const MAX_SETTLE_MS = 5500   // hard timeout: report results even if still moving

// ── Die face assignments ──────────────────────────────────────────────────────
//
// THREE.BoxGeometry face material order: +X, -X, +Y, -Y, +Z, -Z
// We map each THREE face to a die-face value so that:
//   +Y (material 2) = face 1  (one pip on top at rest)
//   -Y (material 3) = face 6
//   +Z (material 4) = face 2
//   -Z (material 5) = face 5
//   +X (material 0) = face 3
//   -X (material 1) = face 4
const THREE_FACE_VALUE = [3, 4, 1, 6, 2, 5] as const

// Local-space face normals for face-up detection
const LOCAL_NORMALS: [number, number, number, number][] = [
  [ 0,  1,  0,  1],  // +Y → face 1
  [ 0, -1,  0,  6],  // -Y → face 6
  [ 0,  0,  1,  2],  // +Z → face 2
  [ 0,  0, -1,  5],  // -Z → face 5
  [ 1,  0,  0,  3],  // +X → face 3
  [-1,  0,  0,  4],  // -X → face 4
]

// ── Pip texture generation ────────────────────────────────────────────────────

const PIP_SLOTS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

let _pipTextures: THREE.CanvasTexture[] | null = null

function getPipTextures(): THREE.CanvasTexture[] {
  if (_pipTextures) return _pipTextures
  _pipTextures = [1, 2, 3, 4, 5, 6].map(value => {
    const S = 128
    const c = document.createElement('canvas')
    c.width = S
    c.height = S
    const ctx = c.getContext('2d')!

    // Background
    ctx.fillStyle = '#FAFAFA'
    ctx.fillRect(0, 0, S, S)

    // Border
    ctx.strokeStyle = '#CBD5E1'
    ctx.lineWidth = 3
    ctx.strokeRect(2, 2, S - 4, S - 4)

    // Pips
    ctx.fillStyle = '#1E293B'
    const margin = 20
    const cell = (S - margin * 2) / 3
    const r = 9
    for (const idx of (PIP_SLOTS[value] ?? [])) {
      const col = idx % 3
      const row = Math.floor(idx / 3)
      ctx.beginPath()
      ctx.arc(margin + col * cell + cell / 2, margin + row * cell + cell / 2, r, 0, Math.PI * 2)
      ctx.fill()
    }

    return new THREE.CanvasTexture(c)
  })
  return _pipTextures
}

// ── Face-up detection ─────────────────────────────────────────────────────────

function getFaceUp(body: CANNON.Body): number {
  let best = -Infinity
  let bestVal = 1
  const q = body.quaternion
  const worldNormal = new CANNON.Vec3()
  for (const [lx, ly, lz, v] of LOCAL_NORMALS) {
    q.vmult(new CANNON.Vec3(lx, ly, lz), worldNormal)
    if (worldNormal.y > best) {
      best = worldNormal.y
      bestVal = v
    }
  }
  return bestVal
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface D6CanvasProps {
  diceCount: number
  rollKey: number
  onResults: (values: number[]) => void
}

export function D6Canvas({ diceCount, rollKey, onResults }: D6CanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null)

  // Keep callback + diceCount in refs so effects don't need them as deps
  const onResultsRef = useRef(onResults)
  useEffect(() => { onResultsRef.current = onResults })
  const diceCountRef = useRef(diceCount)
  useEffect(() => { diceCountRef.current = diceCount })

  // Three / Cannon objects
  const worldRef    = useRef<CANNON.World | null>(null)
  const sceneRef    = useRef<THREE.Scene | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const rafRef      = useRef<number | null>(null)

  // Per-roll state
  const diceBodiesRef   = useRef<CANNON.Body[]>([])
  const diceMeshesRef   = useRef<THREE.Mesh[]>([])
  const settleCountRef  = useRef(0)
  const settledRef      = useRef(false)
  const maxTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track previous rollKey so we distinguish mount from roll
  const prevRollKeyRef  = useRef<number | null>(null)

  // ── One-time scene setup ──────────────────────────────────────────────────

  useEffect(() => {
    const container = mountRef.current
    if (!container) return
    const W = container.clientWidth  || 400
    const H = container.clientHeight || 220

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0xF1F5F9)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera  — angled top-down view
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100)
    camera.position.set(0, 7.2, 3.8)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.65))
    const dir = new THREE.DirectionalLight(0xffffff, 1.1)
    dir.position.set(3, 8, 4)
    dir.castShadow = true
    dir.shadow.mapSize.set(1024, 1024)
    dir.shadow.camera.near = 0.1
    dir.shadow.camera.far  = 30
    dir.shadow.camera.left   = -7
    dir.shadow.camera.right  =  7
    dir.shadow.camera.top    =  6
    dir.shadow.camera.bottom = -6
    scene.add(dir)

    // ── Tray visuals ────────────────────────────────────────────────────────

    // Green felt floor
    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(TRAY_W, 0.08, TRAY_D),
      new THREE.MeshLambertMaterial({ color: 0x1B6B3A }),
    )
    floorMesh.position.y = -0.04
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    // Dark wood walls
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x2D3748 })
    const wallDefs: { size: [number, number, number]; pos: [number, number, number] }[] = [
      { size: [TRAY_W + WALL_T * 2, WALL_H, WALL_T], pos: [0,               WALL_H / 2, -(TRAY_D / 2 + WALL_T / 2)] },
      { size: [TRAY_W + WALL_T * 2, WALL_H, WALL_T], pos: [0,               WALL_H / 2,   TRAY_D / 2 + WALL_T / 2] },
      { size: [WALL_T, WALL_H, TRAY_D],              pos: [-(TRAY_W / 2 + WALL_T / 2), WALL_H / 2, 0] },
      { size: [WALL_T, WALL_H, TRAY_D],              pos: [  TRAY_W / 2 + WALL_T / 2,  WALL_H / 2, 0] },
    ]
    wallDefs.forEach(({ size, pos }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMat)
      m.position.set(...pos)
      m.receiveShadow = true
      scene.add(m)
    })

    // ── Physics world ────────────────────────────────────────────────────────

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) })
    world.broadphase = new CANNON.SAPBroadphase(world)
    world.allowSleep = true
    worldRef.current = world

    // Contact materials for realistic bouncing
    const diceMat  = new CANNON.Material('dice')
    const floorMat = new CANNON.Material('floor')
    const wallMat2 = new CANNON.Material('wall')
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat,  floorMat, { restitution: 0.42, friction: 0.35 }))
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat,  wallMat2, { restitution: 0.38, friction: 0.3  }))
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat,  diceMat,  { restitution: 0.30, friction: 0.25 }))

    // Static floor body
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(TRAY_W / 2, 0.04, TRAY_D / 2)),
      position: new CANNON.Vec3(0, -0.04, 0),
      material: floorMat,
    })
    world.addBody(floorBody)

    // Static wall bodies
    const physWalls: { half: [number, number, number]; pos: [number, number, number] }[] = [
      { half: [(TRAY_W + WALL_T * 2) / 2, WALL_H / 2, WALL_T / 2], pos: [0,               WALL_H / 2, -(TRAY_D / 2 + WALL_T / 2)] },
      { half: [(TRAY_W + WALL_T * 2) / 2, WALL_H / 2, WALL_T / 2], pos: [0,               WALL_H / 2,   TRAY_D / 2 + WALL_T / 2] },
      { half: [WALL_T / 2, WALL_H / 2, TRAY_D / 2],                pos: [-(TRAY_W / 2 + WALL_T / 2), WALL_H / 2, 0] },
      { half: [WALL_T / 2, WALL_H / 2, TRAY_D / 2],                pos: [  TRAY_W / 2 + WALL_T / 2,  WALL_H / 2, 0] },
    ]
    physWalls.forEach(({ half, pos }) => {
      world.addBody(new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(...half)),
        position: new CANNON.Vec3(...pos),
        material: wallMat2,
      }))
    })

    // ── Render / physics loop ────────────────────────────────────────────────

    const fixedStep = 1 / 60
    let lastTime = performance.now()

    function animate(now: number) {
      rafRef.current = requestAnimationFrame(animate)
      const dt = Math.min((now - lastTime) / 1000, 1 / 30)
      lastTime = now

      world.step(fixedStep, dt, 3)

      // Sync meshes → bodies
      const bodies = diceBodiesRef.current
      const meshes = diceMeshesRef.current
      for (let i = 0; i < bodies.length; i++) {
        if (!meshes[i]) continue
        const b = bodies[i]
        meshes[i].position.set(b.position.x, b.position.y, b.position.z)
        meshes[i].quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
      }

      // Settle detection — only for dynamic bodies (mass > 0)
      if (!settledRef.current && bodies.length > 0 && bodies[0].mass > 0) {
        const allStill = bodies.every(b =>
          b.velocity.length() < SETTLE_VEL && b.angularVelocity.length() < SETTLE_ANG,
        )
        if (allStill) {
          settleCountRef.current++
          if (settleCountRef.current >= SETTLE_HOLD) {
            settledRef.current = true
            if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null }
            onResultsRef.current(bodies.map(getFaceUp))
          }
        } else {
          settleCountRef.current = 0
        }
      }

      renderer.render(scene, camera)
    }
    rafRef.current = requestAnimationFrame(animate)

    // Resize observer
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(container)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current)
      ro.disconnect()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, []) // mount only

  // ── Create / reset dice whenever rollKey changes ───────────────────────────

  useEffect(() => {
    const world = worldRef.current
    const scene = sceneRef.current
    if (!world || !scene) return

    const isMount = prevRollKeyRef.current === null
    prevRollKeyRef.current = rollKey

    // Remove previous dice
    diceBodiesRef.current.forEach(b => world.removeBody(b))
    diceMeshesRef.current.forEach(m => {
      m.geometry.dispose()
      if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose())
      else (m.material as THREE.Material).dispose()
      scene.remove(m)
    })
    diceBodiesRef.current = []
    diceMeshesRef.current = []
    settleCountRef.current = 0
    settledRef.current = false
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null }

    const count = diceCountRef.current
    if (count === 0) return

    const isRolling = !isMount  // on mount: idle; on rollKey increment: roll

    const textures = getPipTextures()
    const newBodies: CANNON.Body[] = []
    const newMeshes: THREE.Mesh[] = []

    const diceMat = new CANNON.Material('dice')
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)

    for (let i = 0; i < count; i++) {
      // ── Mesh ──────────────────────────────────────────────────────────────
      const geo = new THREE.BoxGeometry(DIE_HALF * 2, DIE_HALF * 2, DIE_HALF * 2)
      const mats = THREE_FACE_VALUE.map(v =>
        new THREE.MeshPhongMaterial({ map: textures[v - 1], shininess: 55 }),
      )
      const mesh = new THREE.Mesh(geo, mats)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      newMeshes.push(mesh)

      // ── Physics body ──────────────────────────────────────────────────────
      let x: number, y: number, z: number

      if (isRolling) {
        // Staggered drop positions — scatter within the inner tray area
        x = (Math.random() - 0.5) * (TRAY_W * 0.65)
        z = (Math.random() - 0.5) * (TRAY_D * 0.55)
        y = 1.6 + i * 0.5 + Math.random() * 0.6
      } else {
        // Idle: neat grid, resting on the felt
        const col = i % cols
        const row = Math.floor(i / cols)
        x = (col - (cols - 1) / 2) * (DIE_HALF * 2.8)
        z = (row - (rows - 1) / 2) * (DIE_HALF * 2.8)
        y = DIE_HALF
      }

      const body = new CANNON.Body({
        mass:           isRolling ? 1 : 0,
        shape:          new CANNON.Box(new CANNON.Vec3(DIE_HALF, DIE_HALF, DIE_HALF)),
        position:       new CANNON.Vec3(x, y, z),
        linearDamping:  LINEAR_DAMPING,
        angularDamping: ANGULAR_DAMPING,
        material:       diceMat,
      })

      if (isRolling) {
        body.angularVelocity.set(
          (Math.random() - 0.5) * 32,
          (Math.random() - 0.5) * 32,
          (Math.random() - 0.5) * 32,
        )
        body.velocity.set(
          (Math.random() - 0.5) * 3.5,
          -0.8,
          (Math.random() - 0.5) * 3.5,
        )
      }

      world.addBody(body)
      newBodies.push(body)
    }

    diceBodiesRef.current = newBodies
    diceMeshesRef.current = newMeshes

    // Max-settle safety timer
    if (isRolling && count > 0) {
      maxTimerRef.current = setTimeout(() => {
        if (!settledRef.current) {
          settledRef.current = true
          onResultsRef.current(newBodies.map(getFaceUp))
        }
      }, MAX_SETTLE_MS)
    }
  }, [rollKey]) // diceCount accessed via ref — intentional

  return (
    <div
      ref={mountRef}
      className="w-full rounded-xl overflow-hidden"
      style={{ height: 220 }}
    />
  )
}
