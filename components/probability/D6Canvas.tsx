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
const SETTLE_VEL  = 0.04
const SETTLE_ANG  = 0.05
const SETTLE_HOLD = 24   // ~0.4 s at 60 fps
const MAX_SETTLE  = 5500 // ms hard timeout
const LINEUP_DURATION = 420

// Die face colours matching the palette
const DIE_COLOR = '#FAFAFA'
const DIE_EDGE_COLOR = '#CBD5E1'
const DIE_TEXT_COLOR = '#000000'
const DIE_MATERIAL_COLOR = '#FFFFFF'
const DIE_EMISSIVE_COLOR = '#F8FAFC'

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

// ── Textures ──────────────────────────────────────────────────────────────────

let _d6Textures: THREE.CanvasTexture[] | null = null

function getD6Textures(): THREE.CanvasTexture[] {
  if (_d6Textures) return _d6Textures
  _d6Textures = [1,2,3,4,5,6].map(v => {
    const S = 128
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')!
    ctx.fillStyle = DIE_COLOR
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = DIE_EDGE_COLOR
    ctx.lineWidth = 3
    ctx.strokeRect(2, 2, S-4, S-4)
    ctx.fillStyle = DIE_TEXT_COLOR
    ctx.font = 'bold 72px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(v), S/2, S/2)
    return new THREE.CanvasTexture(c)
  })
  return _d6Textures
}

function makeColorFaceTexture(label: string): THREE.CanvasTexture {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = DIE_COLOR
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = DIE_EDGE_COLOR
  ctx.lineWidth = 3
  ctx.strokeRect(2, 2, S-4, S-4)
  ctx.fillStyle = 'rgba(30,41,59,0.55)'
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, S/2, S/2)
  return new THREE.CanvasTexture(c)
}

function makeResultTexture(value: number): THREE.CanvasTexture {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = DIE_COLOR
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = DIE_EDGE_COLOR
  ctx.lineWidth = 3
  ctx.strokeRect(2, 2, S-4, S-4)
  ctx.fillStyle = DIE_TEXT_COLOR
  ctx.font = `bold ${value >= 100 ? 44 : value >= 10 ? 58 : 72}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(value), S/2, S/2)
  return new THREE.CanvasTexture(c)
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

// ── Per-die state ─────────────────────────────────────────────────────────────

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
  lineupStartPos: THREE.Vector3
  lineupStartQuat: THREE.Quaternion
  lineupTargetPos: THREE.Vector3
  lineupTargetQuat: THREE.Quaternion
}

function keepDieInsideTray(body: CANNON.Body) {
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

  if (body.position.y < DIE_HALF) {
    body.position.y = DIE_HALF
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface D6CanvasHandle {
  addDie: (id: string, sides: number) => void
  removeDie: (id: string) => void
  rollAll: () => void
  clearAll: () => void
}

export interface D6CanvasProps {
  onDieSettled: (id: string, value: number) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export const D6Canvas = forwardRef<D6CanvasHandle, D6CanvasProps>(
  function D6Canvas({ onDieSettled }, ref) {
    const mountRef     = useRef<HTMLDivElement>(null)
    const onSettledRef = useRef(onDieSettled)
    useEffect(() => { onSettledRef.current = onDieSettled })

    // Three / Cannon singletons
    const worldRef    = useRef<CANNON.World | null>(null)
    const sceneRef    = useRef<THREE.Scene | null>(null)
    const cameraRef   = useRef<THREE.OrthographicCamera | null>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const rafRef      = useRef<number | null>(null)
    const diceMatRef  = useRef<CANNON.Material | null>(null)
    const lineupRef   = useRef<{ active: boolean; completed: boolean; startAt: number }>({ active: false, completed: false, startAt: 0 })

    const dieEntriesRef = useRef<DieEntry[]>([])

    function clearSettleTimer(entry: DieEntry) {
      if (entry.maxTimer) {
        clearTimeout(entry.maxTimer)
        entry.maxTimer = null
      }
    }

    function assignSlotPositions() {
      const cols = Math.max(1, Math.floor((TRAY_W - 1.2) / 1.1))
      const startX = -((cols - 1) * 0.55)
      const startZ = -(Math.floor(Math.max(0, dieEntriesRef.current.length - 1) / cols) * 0.55) / 2
      dieEntriesRef.current.forEach((entry, index) => {
        entry.slotIndex = index
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = startX + col * 1.1
        const z = startZ + row * 1.1
        entry.body.position.set(x, DIE_HALF, z)
        entry.body.velocity.set(0, 0, 0)
        entry.body.angularVelocity.set(0, 0, 0)
        entry.body.quaternion.set(0, 0, 0, 1)
        entry.body.sleep()
        entry.mesh.position.set(x, DIE_HALF, z)
        entry.mesh.quaternion.set(0, 0, 0, 1)
        entry.settled = false
        entry.settleCount = 0
        entry.resultValue = null
        clearSettleTimer(entry)
      })
    }

    function restoreD6FaceMaps(entry: DieEntry) {
      const mats = entry.mesh.material as THREE.MeshPhongMaterial[]
      const tex = getD6Textures()
      D6_FACE_VALUES.forEach((value, index) => {
        mats[index].map = tex[value - 1]
        mats[index].needsUpdate = true
      })
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
        entry.lineupTargetPos.set(baseX + col * gapX, DIE_HALF, baseZ - row * gapZ)
        entry.lineupTargetQuat.identity()
      })

      lineupRef.current = { active: true, completed: false, startAt: now }
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
        const oldTex = mats[2].map
        mats[2].map = makeResultTexture(result)
        mats[2].needsUpdate = true
        oldTex?.dispose()
      } else {
        result = entry.precomputedResult
        // Reveal result on the +Y face (material index 2)
        const mats = entry.mesh.material as THREE.MeshPhongMaterial[]
        const oldTex = mats[2].map
        mats[2].map = makeResultTexture(result)
        mats[2].needsUpdate = true
        oldTex?.dispose()
      }

      // Fully freeze the body so it does not visibly shimmy after settling.
      entry.body.velocity.set(0, 0, 0)
      entry.body.angularVelocity.set(0, 0, 0)
      entry.body.force.set(0, 0, 0)
      entry.body.torque.set(0, 0, 0)
      entry.body.position.y = DIE_HALF
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
      const trW = TRAY_W + WALL_T * 2 + 0.6   // total visible world width
      const trH = TRAY_D + WALL_T * 2 + 0.6
      const aspect = w / h
      let hW: number, hH: number
      if (aspect >= trW / trH) {
        // canvas wider → fit height, extend sides
        hH = trH / 2
        hW = hH * aspect
      } else {
        // canvas taller → fit width, extend top/bottom
        hW = trW / 2
        hH = hW / aspect
      }
      cam.left   = -hW
      cam.right  =  hW
      cam.top    =  hH
      cam.bottom = -hH
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

      // Orthographic camera — straight above, +Z = bottom of screen
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
      cam.position.set(0, 20, 0)
      cam.lookAt(0, 0, 0)
      cam.up.set(0, 0, -1)   // −Z is screen-up (so back wall is at screen top)
      cameraRef.current = cam
      fitCamera(W, H)

      // Lighting  — overhead directional + ambient for flat top-down look
      scene.add(new THREE.AmbientLight(0xffffff, 1.15))
      const dir = new THREE.DirectionalLight(0xffffff, 1.05)
      dir.position.set(1.6, 10, 2.5)
      dir.castShadow = true
      dir.shadow.mapSize.set(1024, 1024)
      dir.shadow.camera.near = 0.1
      dir.shadow.camera.far  = 50
      dir.shadow.camera.left = dir.shadow.camera.bottom = -8
      dir.shadow.camera.right = dir.shadow.camera.top   =  8
      dir.shadow.bias = -0.0001
      scene.add(dir)

      // ── Tray visuals ──────────────────────────────────────────────────────

      // Green felt floor
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(TRAY_W, 0.06, TRAY_D),
        new THREE.MeshLambertMaterial({ color: 0x0D4F49 }),
      )
      floor.position.y = -0.03
      floor.receiveShadow = true
      scene.add(floor)

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
          // Sync mesh → body
          const b = entry.body
          if (!lineupRef.current.active && !lineupRef.current.completed) {
            keepDieInsideTray(b)
            entry.mesh.position.set(b.position.x, b.position.y, b.position.z)
            entry.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)

            // Per-die settle detection
            if (!entry.settled) {
              if (b.velocity.length() < SETTLE_VEL && b.angularVelocity.length() < SETTLE_ANG) {
                entry.settleCount++
                if (entry.settleCount >= SETTLE_HOLD) settleEntry(entry)
              } else {
                entry.settleCount = 0
              }
            }
          }
        }

        if (!lineupRef.current.active && !lineupRef.current.completed && dieEntriesRef.current.length > 0 && dieEntriesRef.current.every(entry => entry.settled)) {
          startLineup(now)
        }

        if (lineupRef.current.active) {
          const t = Math.min(1, (now - lineupRef.current.startAt) / LINEUP_DURATION)
          const eased = 1 - Math.pow(1 - t, 3)
          for (const entry of dieEntriesRef.current) {
            entry.mesh.position.lerpVectors(entry.lineupStartPos, entry.lineupTargetPos, eased)
            entry.mesh.quaternion.copy(entry.lineupStartQuat).slerp(entry.lineupTargetQuat, eased)
          }
          if (t >= 1) {
            lineupRef.current.active = false
            lineupRef.current.completed = true
            for (const entry of dieEntriesRef.current) {
              entry.mesh.position.copy(entry.lineupTargetPos)
              entry.mesh.quaternion.copy(entry.lineupTargetQuat)
            }
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

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        ro.disconnect()
        renderer.dispose()
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
        // Clear all die timers
        dieEntriesRef.current.forEach(e => { if (e.maxTimer) clearTimeout(e.maxTimer) })
      }
    }, []) // mount only

    // ── Imperative API ────────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      addDie(id: string, sides: number) {
        const world = worldRef.current
        const scene = sceneRef.current
        if (!world || !scene) return

        const isD6    = sides === 6
        const precomputed = isD6 ? -1 : Math.floor(Math.random() * sides) + 1

        // ── Mesh ────────────────────────────────────────────────────────────
        let materials: THREE.MeshPhongMaterial[]
        if (isD6) {
          const tex = getD6Textures()
          materials = D6_FACE_VALUES.map(v => new THREE.MeshPhongMaterial({
            map: tex[v-1],
            color: DIE_MATERIAL_COLOR,
            emissive: DIE_EMISSIVE_COLOR,
            emissiveIntensity: 0.18,
            shininess: 40,
          }))
        } else {
          const label = `d${sides}`
          // Side faces: colored label; top face (+Y, index 2) starts the same and updates on settle
          const sideTex = makeColorFaceTexture(label)
          materials = Array.from({ length: 6 }, () =>
            new THREE.MeshPhongMaterial({
              map: sideTex,
              color: DIE_MATERIAL_COLOR,
              emissive: DIE_EMISSIVE_COLOR,
              emissiveIntensity: 0.18,
              shininess: 32,
            }),
          )
        }

        const geo  = new THREE.BoxGeometry(DIE_HALF*2, DIE_HALF*2, DIE_HALF*2)
        const mesh = new THREE.Mesh(geo, materials)
        mesh.castShadow = true
        mesh.receiveShadow = true
        scene.add(mesh)

        const body = new CANNON.Body({
          mass:           1,
          shape:          new CANNON.Box(new CANNON.Vec3(DIE_HALF, DIE_HALF, DIE_HALF)),
          position:       new CANNON.Vec3(0, DIE_HALF, 0),
          linearDamping:  LINEAR_DAMPING,
          angularDamping: ANGULAR_DAMPING,
          material:       diceMatRef.current ?? undefined,
        })
        world.addBody(body)

        const entry: DieEntry = {
          id, sides, precomputedResult: precomputed,
          body, mesh, slotIndex: dieEntriesRef.current.length, settled: false, settleCount: 0,
          maxTimer: null,
          resultValue: null,
          lineupStartPos: new THREE.Vector3(),
          lineupStartQuat: new THREE.Quaternion(),
          lineupTargetPos: new THREE.Vector3(),
          lineupTargetQuat: new THREE.Quaternion(),
        }
        dieEntriesRef.current.push(entry)
        assignSlotPositions()
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
        }
        scene.remove(entry.mesh)
        dieEntriesRef.current.splice(idx, 1)
        assignSlotPositions()
      },

      rollAll() {
        const world = worldRef.current
        if (!world || dieEntriesRef.current.length === 0) return
        lineupRef.current.active = false
        lineupRef.current.completed = false

        const innerX = TRAY_W / 2 - DIE_HALF - 0.18
        const innerZ = TRAY_D / 2 - DIE_HALF - 0.18
        const launchSpacing = DIE_HALF * 2 + 0.12
        const maxRows = Math.max(1, Math.floor((innerZ * 2) / launchSpacing))
        const rows = Math.min(dieEntriesRef.current.length, maxRows)
        const batchBoost = Math.min(8, Math.max(0, dieEntriesRef.current.length - 1) * 0.34)

        for (const [index, entry] of dieEntriesRef.current.entries()) {
          entry.settled = false
          entry.settleCount = 0
          entry.resultValue = null
          clearSettleTimer(entry)

          // Re-randomise result for non-d6 dice
          if (entry.sides !== 6) {
            entry.precomputedResult = Math.floor(Math.random() * entry.sides) + 1
            // Reset +Y face back to label texture so old result is hidden while rolling
            const mats = entry.mesh.material as THREE.MeshPhongMaterial[]
            const oldTex = mats[2].map
            mats[2].map = makeColorFaceTexture(`d${entry.sides}`)
            mats[2].needsUpdate = true
            oldTex?.dispose()
          } else {
            restoreD6FaceMaps(entry)
          }

          const row = index % rows
          const col = Math.floor(index / rows)
          const sx = innerX - col * launchSpacing * 0.95
          const sz = -innerZ + row * launchSpacing
          const vx = -(25 + batchBoost + Math.random() * 7.8)
          const vy = 1.8 + Math.random() * 2.4
          const vz = 9.5 + Math.random() * 4.8

          // Wake up body and apply strong upper-right diagonal launch
          entry.body.wakeUp()
          entry.body.position.set(sx, DIE_HALF + 0.04, sz)
          entry.body.quaternion.set(0, 0, 0, 1)
          entry.body.velocity.set(vx, vy, vz)
          entry.body.angularVelocity.set(
            (Math.random() - 0.5) * 74,
            (Math.random() - 0.5) * 58,
            (Math.random() - 0.5) * 74,
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
        for (const entry of dieEntriesRef.current) {
          clearSettleTimer(entry)
          world.removeBody(entry.body)
          entry.mesh.geometry.dispose()
          if (Array.isArray(entry.mesh.material)) {
            ;(entry.mesh.material as THREE.MeshPhongMaterial[]).forEach(m => { m.map?.dispose(); m.dispose() })
          }
          scene.remove(entry.mesh)
        }
        dieEntriesRef.current = []
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
