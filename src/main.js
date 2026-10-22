import * as THREE from 'three'
import './style.css'

/* ============================================================
   NEON PINBALL — a small 3D pinball table
   Physics is a tight custom 2D solver on the playfield plane
   (x = left/right, z = up/down the table, +z toward the player).
   Three.js handles all rendering on top of it.
   ============================================================ */

// ---------- tuning ----------
const TABLE = { W: 8.7, top: -9.65, bottom: 9.6, laneX: 3.55, laneRight: 4.35 }
const BALL_R = 0.28
const GRAVITY = 19.5          // pulls ball toward the player (+z)
const MAX_SPEED = 36
const FLIP_REST = 0.55, FLIP_ACTIVE = -0.42, FLIP_LEN = 1.38, FLIP_R = 0.17
const BALLS_PER_GAME = 3
const LS_HIGH = 'neon-pinball-highscore'
const LS_MUTE = 'neon-pinball-muted'

// ---------- tiny audio synth (no assets) ----------
const AudioFX = (() => {
  let ctx = null, muted = localStorage.getItem(LS_MUTE) === '1'
  const ac = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  function tone(freq, dur = 0.08, type = 'square', vol = 0.12, slideTo = null, delay = 0) {
    if (muted) return
    try {
      const a = ac(), t = a.currentTime + delay
      const o = a.createOscillator(), g = a.createGain()
      o.type = type; o.frequency.setValueAtTime(freq, t)
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02)
    } catch { /* audio unavailable */ }
  }
  function noise(dur = 0.05, vol = 0.1, delay = 0) {
    if (muted) return
    try {
      const a = ac(), t = a.currentTime + delay
      const len = Math.max(1, (a.sampleRate * dur) | 0)
      const buf = a.createBuffer(1, len, a.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
      const s = a.createBufferSource(); s.buffer = buf
      const g = a.createGain(); g.gain.value = vol
      const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200
      s.connect(f).connect(g).connect(a.destination); s.start(t)
    } catch { /* ignore */ }
  }
  return {
    get muted() { return muted },
    toggleMute() { muted = !muted; localStorage.setItem(LS_MUTE, muted ? '1' : '0'); return muted },
    unlock() { if (!muted) ac() },
    flipper() { noise(0.04, 0.10); tone(180, 0.05, 'square', 0.05, 90) },
    bumper(i = 0) { tone([740, 880, 660][i % 3], 0.09, 'square', 0.14, 320); noise(0.03, 0.06) },
    sling() { tone(300, 0.07, 'sawtooth', 0.10, 140) },
    target() { tone(1180, 0.10, 'square', 0.12, 590); tone(1760, 0.12, 'square', 0.08, 880, 0.05) },
    rollover() { tone(1320, 0.07, 'sine', 0.13); tone(1980, 0.09, 'sine', 0.10, null, 0.05) },
    spinner() { tone(1560 + Math.random() * 400, 0.03, 'sine', 0.05) },
    launch(p = 1) { noise(0.18, 0.12); tone(140, 0.25, 'sawtooth', 0.10, 140 + 500 * p) },
    drain() { tone(520, 0.45, 'sawtooth', 0.12, 70) },
    save() { tone(660, 0.09, 'square', 0.12); tone(990, 0.14, 'square', 0.12, null, 0.09) },
    laneComplete() { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.12, 'square', 0.11, null, i * 0.07)) },
    gameOver() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, null, i * 0.16)) },
    fanfare() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.11, null, i * 0.1)) },
    nudge() { noise(0.06, 0.09) },
  }
})()

// ---------- DOM ----------
const $ = (id) => document.getElementById(id)
const el = {
  score: $('score'), high: $('highscore'), ball: $('ball'), lanes: $('lanes'),
  mult: $('multiplier'), msg: $('message'), gameover: $('gameover'),
  finalScore: $('final-score'), newHigh: $('new-high'), paused: $('paused'),
  ballsave: $('ballsave-pill'), app: $('app'),
}
const fmt = (n) => n.toLocaleString('en-US')

// ---------- game state ----------
const state = {
  mode: 'plunger', // plunger | play | gameover
  paused: false,
  score: 0, high: +(localStorage.getItem(LS_HIGH) || 0),
  ballNum: 0, multiplier: 1,
  lanesLit: [false, false, false],
  ballSaveUntil: 0, charge: 0, charging: false,
  drainTimer: null, lastLaneCompleteAt: 0,
}
el.high.textContent = fmt(state.high)

function setMessage(t) { el.msg.textContent = t }
function updateHUD() {
  el.score.textContent = fmt(state.score)
  el.high.textContent = fmt(state.high)
  el.ball.textContent = state.ballNum > 0 ? Math.min(state.ballNum, BALLS_PER_GAME) : '–'
  el.mult.textContent = state.multiplier
  el.lanes.textContent = state.lanesLit.map((l) => (l ? '●' : '○')).join(' ')
  el.ballsave.hidden = !(state.mode === 'play' && performance.now() < state.ballSaveUntil)
}

function popup(worldPos, text, big = false) {
  const v = worldPos.clone().project(camera)
  if (v.z > 1) return
  const d = document.createElement('div')
  d.className = 'popup' + (big ? ' big' : '')
  d.textContent = text
  d.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'
  d.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px'
  el.app.appendChild(d)
  setTimeout(() => d.remove(), 850)
}

function addScore(base, worldPos, label = '') {
  const pts = base * state.multiplier
  state.score += pts
  if (state.score > state.high) {
    state.high = state.score
    localStorage.setItem(LS_HIGH, String(state.high))
  }
  if (worldPos) popup(worldPos, `+${fmt(pts)}${label ? ' ' + label : ''}`, base >= 1000)
  updateHUD()
}

// ---------- three setup ----------
const canvas = $('game')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05030f)
scene.fog = new THREE.Fog(0x05030f, 34, 60)

const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.1, 120)
camera.position.set(0, 19.6, 16.8)
camera.lookAt(0, 0, 0.1)

scene.add(new THREE.AmbientLight(0x8899ff, 0.55))
const key = new THREE.DirectionalLight(0xffffff, 1.6)
key.position.set(6, 14, 6)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
key.shadow.camera.left = -9; key.shadow.camera.right = 9
key.shadow.camera.top = 12; key.shadow.camera.bottom = -12
key.shadow.camera.far = 40; key.shadow.bias = -0.0004
scene.add(key)
const pinkGlow = new THREE.PointLight(0xf472b6, 60, 30); pinkGlow.position.set(0, 4, -6); scene.add(pinkGlow)
const cyanGlow = new THREE.PointLight(0x22d3ee, 40, 26); cyanGlow.position.set(0, 3, 7); scene.add(cyanGlow)
const flashLight = new THREE.PointLight(0xffffff, 0, 9); flashLight.position.y = 1.6; scene.add(flashLight)

// starfield backdrop
{
  const n = 500, pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70
    pos[i * 3 + 1] = Math.random() * 26 - 6
    pos[i * 3 + 2] = -18 - Math.random() * 30
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.14, transparent: true, opacity: 0.8 })))
}

// ---------- materials ----------
const MAT = {
  cabinet: new THREE.MeshStandardMaterial({ color: 0x111633, roughness: 0.5, metalness: 0.35 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x9be8ff, roughness: 0.25, metalness: 0.85, emissive: 0x164e63 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x1e2a52, roughness: 0.45, metalness: 0.4 }),
  post: new THREE.MeshStandardMaterial({ color: 0xd7dde8, roughness: 0.3, metalness: 0.8 }),
  flipper: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, emissive: 0x222222 }),
  flipperTip: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }),
  ball: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.12, metalness: 0.95 }),
}

// ---------- playfield texture (painted canvas) ----------
function makePlayfieldTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 2048
  const x = c.getContext('2d')
  const px = (wx) => (wx / TABLE.W + 0.5) * c.width
  const pz = (wz) => (wz - TABLE.top) / (TABLE.bottom - TABLE.top) * c.height
  const grad = x.createLinearGradient(0, 0, 0, c.height)
  grad.addColorStop(0, '#171044'); grad.addColorStop(0.55, '#0d1440'); grad.addColorStop(1, '#081a3a')
  x.fillStyle = grad; x.fillRect(0, 0, c.width, c.height)
  // grid
  x.strokeStyle = 'rgba(56,189,248,0.13)'; x.lineWidth = 2
  for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, c.height); x.stroke() }
  for (let i = 0; i <= 32; i++) { x.beginPath(); x.moveTo(0, i * 64); x.lineTo(c.width, i * 64); x.stroke() }
  // shooter lane
  x.fillStyle = 'rgba(34,211,238,0.10)'; x.fillRect(px(TABLE.laneX), 0, px(TABLE.laneRight) - px(TABLE.laneX), c.height)
  x.strokeStyle = 'rgba(251,191,36,0.75)'; x.lineWidth = 5; x.setLineDash([26, 18])
  x.beginPath(); x.moveTo(px(3.95), pz(8.6)); x.lineTo(px(3.95), pz(-6)); x.stroke(); x.setLineDash([])
  // bumper halos
  for (const [bx, bz, col] of [[-1.6, -5.4, '#f472b6'], [1.3, -5.9, '#22d3ee'], [0, -3.8, '#fbbf24']]) {
    const r = (0.95 / TABLE.W) * c.width
    const rg = x.createRadialGradient(px(bx), pz(bz), 4, px(bx), pz(bz), r)
    rg.addColorStop(0, col + '55'); rg.addColorStop(1, col + '00')
    x.fillStyle = rg; x.beginPath(); x.arc(px(bx), pz(bz), r, 0, 7); x.fill()
    x.strokeStyle = col + 'aa'; x.lineWidth = 4; x.beginPath(); x.arc(px(bx), pz(bz), r * 0.72, 0, 7); x.stroke()
  }
  // centre art + text
  x.save(); x.translate(px(0), pz(-0.6)); x.rotate(0)
  x.font = '900 92px system-ui, sans-serif'; x.textAlign = 'center'
  x.fillStyle = 'rgba(244,114,182,0.85)'; x.shadowColor = '#f472b6'; x.shadowBlur = 34
  x.fillText('NEON', 0, -30); x.fillText('PINBALL', 0, 66)
  x.shadowBlur = 0; x.font = '700 30px system-ui'; x.fillStyle = 'rgba(147,197,253,0.9)'
  x.fillText('★  LIGHT  ALL  3  LANES  ★', 0, 140)
  x.restore()
  // arrows toward flippers
  x.fillStyle = 'rgba(34,211,238,0.5)'
  for (const s of [-1, 1]) {
    x.beginPath()
    x.moveTo(px(s * 2.2), pz(5.4)); x.lineTo(px(s * 2.9), pz(5.4)); x.lineTo(px(s * 2.55), pz(6.3))
    x.closePath(); x.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------- collision world ----------
const segments = [] // {ax,az,bx,bz, rest, kick, kind, data}
const circles = []  // {x,z,r, rest, kind, data, cooldownUntil}
function addSeg(ax, az, bx, bz, opts = {}) {
  const s = { ax, az, bx, bz, rest: opts.rest ?? 0.45, kick: opts.kick ?? 0, kind: opts.kind ?? 'wall', data: opts.data ?? null, cooldownUntil: 0 }
  segments.push(s); return s
}
function addCircle(x, z, r, opts = {}) {
  const c = { x, z, r, rest: opts.rest ?? 0.5, kind: opts.kind ?? 'post', data: opts.data ?? null, cooldownUntil: 0 }
  circles.push(c); return c
}

// outer walls + curved top (polyline arc)
const topArc = []
for (let i = 0; i <= 10; i++) {
  const t = i / 10, ang = Math.PI * t // 0..PI across the top
  topArc.push([Math.cos(ang) * 4.35, -6.4 - Math.sin(ang) * 3.3])
}
addSeg(-4.35, -6.4, -4.35, 9.6); addSeg(4.35, -6.4, 4.35, 9.6)
for (let i = 0; i < topArc.length - 1; i++) addSeg(topArc[i][0], topArc[i][1], topArc[i + 1][0], topArc[i + 1][1])
// shooter-lane divider (ball passes over its tip once launched past z < -6.8)
addSeg(TABLE.laneX, -6.8, TABLE.laneX, 5.0)
addCircle(TABLE.laneX, -6.8, 0.13, { kind: 'post' })
// lane bottom (plunger plate) + lower walls either side of the drain
addSeg(TABLE.laneX, 9.45, TABLE.laneRight, 9.45, { kind: 'wall' })
// inlane / outlane funnels to the flippers
addSeg(-4.35, 4.6, -2.5, 7.45); addSeg(-2.5, 7.45, -1.53, 7.78)   // left guide
addSeg(TABLE.laneX, 5.0, 2.5, 7.45); addSeg(2.5, 7.45, 1.53, 7.78) // right guide
addCircle(-2.5, 7.45, 0.14); addCircle(2.5, 7.45, 0.14)
// slingshot triangles
function slingshot(side) { // side: -1 left, +1 right (kept clear of the shooter lane at x=3.55)
  const x0 = side * 3.28, x1 = side * 1.95
  addSeg(x0, 1.7, x0, 3.6)
  addSeg(x0, 3.6, x1, 4.1)
  addSeg(x1, 4.1, x0, 1.7, { kind: 'sling', kick: 8.5, rest: 0.2, data: { side } })
}
slingshot(-1); slingshot(1)
// posts
addCircle(-3.4, 0.6, 0.16); addCircle(3.3, 0.6, 0.16)
// standup targets
const targetDefs = [
  { x: -3.15, z: -1.6, name: 'TARGET' }, { x: 3.05, z: -1.6, name: 'TARGET' }, { x: 0, z: -2.2, name: 'TARGET' },
]

// ---------- three scene: table ----------
const tableGroup = new THREE.Group(); scene.add(tableGroup)
{
  const play = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.W, TABLE.bottom - TABLE.top),
    new THREE.MeshStandardMaterial({ map: makePlayfieldTexture(), roughness: 0.55, metalness: 0.15 })
  )
  play.rotation.x = -Math.PI / 2; play.position.set(0, 0, (TABLE.top + TABLE.bottom) / 2)
  play.receiveShadow = true; tableGroup.add(play)

  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(TABLE.W + 1.3, 0.9, TABLE.bottom - TABLE.top + 1.3), MAT.cabinet)
  cabinet.position.set(0, -0.52, (TABLE.top + TABLE.bottom) / 2); cabinet.receiveShadow = true; tableGroup.add(cabinet)

  // chrome rails following the outer walls + top arc (in travel order)
  const railPts = [new THREE.Vector3(4.35, 0, 9.6), new THREE.Vector3(4.35, 0, -6.4),
    ...topArc.slice(1).map(([x, z]) => new THREE.Vector3(x, 0, z)),
    new THREE.Vector3(-4.35, 0, 9.6)]
  const rail = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, false, 'catmullrom', 0.12), 140, 0.14, 10),
    MAT.rail
  )
  rail.position.y = 0.55; rail.castShadow = true; tableGroup.add(rail)
}
function wallMesh(ax, az, bx, bz, h = 0.5, mat = MAT.wall, y = null) {
  const len = Math.hypot(bx - ax, bz - az)
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.16), mat)
  m.position.set((ax + bx) / 2, y ?? h / 2, (az + bz) / 2)
  m.rotation.y = -Math.atan2(bz - az, bx - ax)
  m.castShadow = true; m.receiveShadow = true
  tableGroup.add(m); return m
}
// visible inner walls (physics segments that deserve a body)
wallMesh(TABLE.laneX, -6.8, TABLE.laneX, 5.0, 0.55)
wallMesh(-4.35, 4.6, -2.5, 7.45, 0.45); wallMesh(-2.5, 7.45, -1.53, 7.78, 0.45)
wallMesh(TABLE.laneX, 5.0, 2.5, 7.45, 0.45); wallMesh(2.5, 7.45, 1.53, 7.78, 0.45)
wallMesh(-3.28, 1.7, -3.28, 3.6, 0.5); wallMesh(-3.28, 3.6, -1.95, 4.1, 0.5); wallMesh(-1.95, 4.1, -3.28, 1.7, 0.5)
wallMesh(3.28, 1.7, 3.28, 3.6, 0.5); wallMesh(3.28, 3.6, 1.95, 4.1, 0.5); wallMesh(1.95, 4.1, 3.28, 1.7, 0.5)
function postMesh(x, z, r = 0.14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, 0.62, 20), MAT.post)
  m.position.set(x, 0.31, z); m.castShadow = true; tableGroup.add(m); return m
}
for (const c of circles) if (c.kind === 'post') postMesh(c.x, c.z, c.r)

// ---------- bumpers ----------
const bumperColors = [0xf472b6, 0x22d3ee, 0xfbbf24]
const bumperDefs = [
  { x: -1.6, z: -5.4 }, { x: 1.3, z: -5.9 }, { x: 0, z: -3.8 },
]
const bumpers = bumperDefs.map((d, i) => {
  const col = bumperColors[i]
  const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.3 })
  const grp = new THREE.Group(); grp.position.set(d.x, 0, d.z)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.42, 28), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.3 }))
  base.position.y = 0.21; base.castShadow = true; grp.add(base)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), mat)
  cap.scale.y = 0.62; cap.position.y = 0.52; cap.castShadow = true; grp.add(cap)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.045, 10, 36), mat)
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; grp.add(ring)
  tableGroup.add(grp)
  const c = addCircle(d.x, d.z, 0.64, { kind: 'bumper', rest: 0.4, data: { i } })
  return { ...d, mat, cap, collider: c, flash: 0 }
})

// ---------- rollover lanes (N·E·O lights in the 3D scene too) ----------
const laneDefs = [{ x: -2.2, z: -7.9, label: 'N' }, { x: 0, z: -8.35, label: 'E' }, { x: 2.2, z: -7.9, label: 'O' }]
const laneSensors = laneDefs.map((d, i) => {
  const mat = new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0xfbbf24, emissiveIntensity: 0.06, roughness: 0.4 })
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24), mat)
  disc.position.set(d.x, 0.03, d.z); tableGroup.add(disc)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 28), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.35 }))
  ring.rotation.x = Math.PI / 2; ring.position.set(d.x, 0.05, d.z); tableGroup.add(ring)
  return { ...d, i, mat, cooldownUntil: 0 }
})
// inlane sensors
const inlaneSensors = [
  { x: -2.95, z: 6.1, cooldownUntil: 0 }, { x: 2.95, z: 6.1, cooldownUntil: 0 },
]

// ---------- standup targets ----------
const targets = targetDefs.map((d) => {
  const mat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xeab308, emissiveIntensity: 0.5, roughness: 0.35 })
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.18), mat)
  m.position.set(d.x, 0.4, d.z); m.castShadow = true; tableGroup.add(m)
  const c = addCircle(d.x, d.z, 0.34, { kind: 'target', rest: 0.35, data: { mat } })
  return { ...d, mat, collider: c, flash: 0 }
})

// ---------- spinner at the top of the shooter lane ----------
const spinner = { x: 3.95, z: -6.2, angle: 0, vel: 0, lastSide: 0 }
{
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.1), MAT.post)
  frame.position.set(3.6, 0.57, spinner.z); tableGroup.add(frame)
  const frame2 = frame.clone(); frame2.position.x = 4.3; tableGroup.add(frame2)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xf472b6, emissive: 0xec4899, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3 }))
  blade.name = 'spinner-blade'; blade.position.set(spinner.x, 0.58, spinner.z); blade.castShadow = true
  tableGroup.add(blade); spinner.mesh = blade
}

// ---------- flippers ----------
function makeFlipper(side) { // side -1 = left, +1 = right (pivot x just inside the guides)
  const px = side * 1.48, pz = 7.95
  const grp = new THREE.Group(); grp.position.set(px, 0.24, pz)
  // capsule extends along local +x for both flippers; the group rotation
  // (rotation.y = -angle) maps +x onto the physics direction pivot -> tip
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(FLIP_R, FLIP_LEN - FLIP_R, 6, 14), MAT.flipper)
  body.rotation.z = Math.PI / 2; body.position.x = FLIP_LEN / 2
  body.castShadow = true; grp.add(body)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(FLIP_R * 1.02, 16, 12), MAT.flipperTip)
  tip.position.x = FLIP_LEN; grp.add(tip)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 20), MAT.post)
  grp.add(hub)
  tableGroup.add(grp)
  const rest = side < 0 ? FLIP_REST : Math.PI - FLIP_REST
  return {
    side, px, pz, grp, pressed: false,
    restAngle: rest, activeAngle: side < 0 ? FLIP_ACTIVE : Math.PI - FLIP_ACTIVE,
    angle: rest, prevAngle: rest, angVel: 0,
  }
}
const flippers = [makeFlipper(-1), makeFlipper(1)]

// ---------- plunger ----------
const plunger = { charge: 0 }
let plungerRod, plungerSpring
{
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 1.7), MAT.cabinet)
  housing.position.set(3.95, 0.25, 9.9); tableGroup.add(housing)
  plungerRod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 12), MAT.post)
  plungerRod.rotation.x = Math.PI / 2; plungerRod.position.set(3.95, 0.32, 9.5); tableGroup.add(plungerRod)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), MAT.flipperTip)
  knob.position.z = 0.8; plungerRod.add(knob)
  const pts = []
  for (let i = 0; i <= 90; i++) {
    const t = i / 90, a = t * Math.PI * 14
    pts.push(new THREE.Vector3(3.95 + Math.cos(a) * 0.15, 0.32 + Math.sin(a) * 0.15, 8.55 + t * 0.8))
  }
  plungerSpring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.035, 6), MAT.post)
  tableGroup.add(plungerSpring)
}

// ---------- ball ----------
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 20), MAT.ball)
ballMesh.castShadow = true; scene.add(ballMesh)
const ball = { x: 3.95, z: 8.7, vx: 0, vz: 0, visible: true }
function placeBallMesh() {
  ballMesh.position.set(ball.x, BALL_R + 0.02, ball.z)
  ballMesh.rotation.x += ball.vz * 0.016 / BALL_R
  ballMesh.rotation.z -= ball.vx * 0.016 / BALL_R
}

// ---------- game flow ----------
function serveBall() {
  state.ballNum++
  if (state.ballNum > BALLS_PER_GAME) return gameOver()
  ball.x = 3.95; ball.z = 8.7; ball.vx = 0; ball.vz = 0
  ballMesh.visible = true
  state.mode = 'plunger'; state.charge = 0; state.charging = false
  state.ballSaveUntil = 0
  setMessage(`Ball ${state.ballNum} — hold SPACE, release to launch`)
  updateHUD()
}
function startGame() {
  state.score = 0; state.ballNum = 0; state.multiplier = 1
  state.lanesLit = [false, false, false]
  laneSensors.forEach((s) => (s.mat.emissiveIntensity = 0.06))
  el.gameover.hidden = true
  serveBall()
}
function gameOver() {
  state.mode = 'gameover'
  ballMesh.visible = false
  const isHigh = state.score >= state.high && state.score > 0
  el.finalScore.textContent = fmt(state.score)
  el.newHigh.hidden = !isHigh
  el.gameover.hidden = false
  setMessage('Game over')
  if (isHigh && state.score > 0) { AudioFX.fanfare() } else { AudioFX.gameOver() }
  updateHUD()
}
function drain() {
  AudioFX.drain()
  const now = performance.now()
  if (now < state.ballSaveUntil && state.mode === 'play') {
    AudioFX.save()
    setMessage('BALL SAVED — relaunch!')
    popup(new THREE.Vector3(ball.x, 1, ball.z), 'BALL SAVE!', true)
    state.ballNum-- // serveBall() re-increments
    serveBall()
    return
  }
  ballMesh.visible = false
  state.mode = 'draining'
  setMessage(state.ballNum >= BALLS_PER_GAME ? 'Last ball drained…' : 'Drained!')
  setTimeout(() => { ballMesh.visible = true; serveBall() }, 900)
}

// ---------- scoring events ----------
function onBumper(b, nx, nz) {
  const now = performance.now()
  if (now < b.collider.cooldownUntil) return
  b.collider.cooldownUntil = now + 70
  b.flash = 1
  flashLight.color.setHex(bumperColors[b.collider.data.i])
  flashLight.position.set(b.x, 1.6, b.z)
  flashLight.intensity = 26
  AudioFX.bumper(b.collider.data.i)
  addScore(100, new THREE.Vector3(b.x, 1, b.z))
  // pop the ball out a touch harder for that snappy feel
  ball.vx += nx * 2.2; ball.vz += nz * 2.2
}
function onTarget(t) {
  const now = performance.now()
  if (now < t.collider.cooldownUntil) return
  t.collider.cooldownUntil = now + 250
  t.flash = 1
  AudioFX.target()
  addScore(150, new THREE.Vector3(t.x, 1, t.z), 'TARGET')
}
function onSling(seg, nx, nz) {
  const now = performance.now()
  if (now < seg.cooldownUntil) return
  seg.cooldownUntil = now + 160
  AudioFX.sling()
  addScore(50, new THREE.Vector3(ball.x, 1, ball.z))
  ball.vx += nx * 1.5; ball.vz += nz * 1.5
}
function onLane(sensor) {
  const now = performance.now()
  if (now < sensor.cooldownUntil) return
  sensor.cooldownUntil = now + 600
  AudioFX.rollover()
  if (!state.lanesLit[sensor.i]) {
    state.lanesLit[sensor.i] = true
    sensor.mat.emissiveIntensity = 1.4
    addScore(250, new THREE.Vector3(sensor.x, 1, sensor.z), 'LANE ' + sensor.label)
    if (state.lanesLit.every(Boolean)) {
      state.lanesLit = [false, false, false]
      laneSensors.forEach((s) => (s.mat.emissiveIntensity = 0.06))
      state.multiplier = Math.min(5, state.multiplier + 1)
      addScore(5000 / state.multiplier, new THREE.Vector3(0, 1, -6), 'LANES! BONUS ×' + state.multiplier)
      AudioFX.laneComplete()
    }
  } else {
    addScore(250, new THREE.Vector3(sensor.x, 1, sensor.z))
  }
  updateHUD()
}

// ---------- physics ----------
function collideSegments(px, pz) {
  for (const s of segments) {
    const dx = s.bx - s.ax, dz = s.bz - s.az
    const len2 = dx * dx + dz * dz
    let t = len2 ? ((px - s.ax) * dx + (pz - s.az) * dz) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const cx = s.ax + dx * t, cz = s.az + dz * t
    let nx = px - cx, nz = pz - cz
    const d = Math.hypot(nx, nz)
    if (d >= BALL_R || d === 0) continue
    nx /= d; nz /= d
    ball.x = cx + nx * BALL_R; ball.z = cz + nz * BALL_R
    const vn = ball.vx * nx + ball.vz * nz
    if (vn < 0) {
      ball.vx -= (1 + s.rest) * vn * nx
      ball.vz -= (1 + s.rest) * vn * nz
      if (s.kick) {
        const power = s.kick * (0.4 + Math.min(1, Math.abs(vn) / 8))
        ball.vx += nx * power; ball.vz += nz * power
        if (s.kind === 'sling') onSling(s, nx, nz)
      }
    }
  }
}
function collideCircles() {
  for (const c of circles) {
    let nx = ball.x - c.x, nz = ball.z - c.z
    const rr = BALL_R + c.r
    const d2 = nx * nx + nz * nz
    if (d2 >= rr * rr || d2 === 0) continue
    const d = Math.sqrt(d2); nx /= d; nz /= d
    ball.x = c.x + nx * rr; ball.z = c.z + nz * rr
    const vn = ball.vx * nx + ball.vz * nz
    if (vn < 0) {
      const rest = c.kind === 'bumper' ? 0.55 : c.rest
      ball.vx -= (1 + rest) * vn * nx
      ball.vz -= (1 + rest) * vn * nz
      if (c.kind === 'bumper') {
        ball.vx += nx * 7.5; ball.vz += nz * 7.5
        onBumper(bumpers[c.data.i], nx, nz)
      } else if (c.kind === 'target') {
        onTarget(targets.find((t) => t.collider === c))
      }
    }
  }
}
function collideFlippers(dt) {
  for (const f of flippers) {
    // capsule segment: pivot -> tip
    const tx = f.px + Math.cos(f.angle) * FLIP_LEN
    const tz = f.pz + Math.sin(f.angle) * FLIP_LEN
    const dx = tx - f.px, dz = tz - f.pz
    const len2 = dx * dx + dz * dz
    let t = ((ball.x - f.px) * dx + (ball.z - f.pz) * dz) / len2
    t = Math.max(0, Math.min(1, t))
    const cx = f.px + dx * t, cz = f.pz + dz * t
    let nx = ball.x - cx, nz = ball.z - cz
    const rr = BALL_R + FLIP_R
    const d = Math.hypot(nx, nz)
    if (d >= rr || d === 0) continue
    nx /= d; nz /= d
    ball.x = cx + nx * rr; ball.z = cz + nz * rr
    // surface velocity from angular motion: v = ω × r  →  ω·(-rz, rx)
    const rx = cx - f.px, rz = cz - f.pz
    const svx = f.angVel * -rz, svz = f.angVel * rx
    const rvx = ball.vx - svx, rvz = ball.vz - svz
    const vn = rvx * nx + rvz * nz
    if (vn < 0) {
      const rest = 0.25
      let nvx = rvx - (1 + rest) * vn * nx
      let nvz = rvz - (1 + rest) * vn * nz
      // tangential grip: keep most of the tangential relative motion
      ball.vx = nvx + svx; ball.vz = nvz + svz
    }
    // active stroke: give the ball the blade's tip velocity along its
    // outward normal — always up-table (−z), stronger near the tip.
    const swinging = f.side < 0 ? f.angVel < -0.5 : f.angVel > 0.5
    if (swinging && ball.vz > -6) {
      const strength = Math.min(1, Math.abs(f.angVel) / 15) * (0.55 + 0.75 * t)
      const speed = Math.max(Math.hypot(ball.vx, ball.vz), 7) + 10 * strength
      ball.vx = Math.cos(f.angle) * (speed * 0.34) + nx * speed * 0.22
      ball.vz = -Math.abs(Math.sin(f.angle)) * speed * 0.94
    }
  }
}
function stepPhysics(dt) {
  // substep so a fast ball can't tunnel through thin walls
  const speed = Math.hypot(ball.vx, ball.vz)
  const steps = Math.max(1, Math.min(8, Math.ceil((speed * dt) / (BALL_R * 0.45))))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    ball.vz += GRAVITY * h
    // gentle rolling resistance
    ball.vx *= (1 - 0.06 * h); ball.vz *= (1 - 0.06 * h)
    const sp = Math.hypot(ball.vx, ball.vz)
    if (sp > MAX_SPEED) { ball.vx *= MAX_SPEED / sp; ball.vz *= MAX_SPEED / sp }
    ball.x += ball.vx * h; ball.z += ball.vz * h
    collideSegments(ball.x, ball.z)
    collideCircles()
    collideFlippers(h)
  }
  // spinner: ball crossing the lane gate spins it and scores ticks
  const side = ball.z - spinner.z
  if (Math.abs(ball.x - spinner.x) < 0.45 && spinner.lastSide !== 0 && Math.sign(side) !== Math.sign(spinner.lastSide) && side !== 0) {
    spinner.vel += ball.vz * 0.9
    for (let k = 0; k < 3; k++) { addScore(10, null); }
    AudioFX.spinner()
  }
  if (side !== 0) spinner.lastSide = side
  // rollover + inlane sensors
  for (const s of laneSensors) {
    if (Math.hypot(ball.x - s.x, ball.z - s.z) < 0.5) onLane(s)
  }
  for (const s of inlaneSensors) {
    const now = performance.now()
    if (now > s.cooldownUntil && Math.hypot(ball.x - s.x, ball.z - s.z) < 0.5) {
      s.cooldownUntil = now + 900
      AudioFX.rollover()
      addScore(100, new THREE.Vector3(s.x, 1, s.z), 'INLANE')
    }
  }
  // drain (anywhere along the bottom except the shooter lane)
  if (ball.z > 9.35 && ball.x < TABLE.laneX) drain()
  // ball settled back into the shooter lane → let the player plunge again
  if (state.mode === 'play' && ball.x > TABLE.laneX + 0.1 && ball.z > 8.2 && Math.hypot(ball.vx, ball.vz) < 1.2) {
    state.mode = 'plunger'
    ball.x = 3.95; ball.vx = 0; ball.vz = 0
    setMessage('Back in the lane — SPACE to relaunch')
  }
}

// ---------- flipper animation ----------
function updateFlippers(dt) {
  for (const f of flippers) {
    f.prevAngle = f.angle
    const target = f.pressed ? f.activeAngle : f.restAngle
    const rate = f.pressed ? 26 : 15 // rad/s — snappy up, quick return
    const diff = target - f.angle
    const step = Math.sign(diff) * Math.min(Math.abs(diff), rate * dt)
    f.angle += step
    f.angVel = dt > 0 ? step / dt : 0
    f.grp.rotation.y = -f.angle
    if (f.pressed && f.prevAngle === f.restAngle && step !== 0) AudioFX.flipper()
  }
}

// ---------- input ----------
const keys = {}
function setFlipper(side, down) {
  const f = flippers[side < 0 ? 0 : 1]
  if (down && !f.pressed) AudioFX.unlock()
  f.pressed = down
}
function startCharge() {
  if (state.mode !== 'plunger' || state.paused) return
  AudioFX.unlock()
  state.charging = true; state.charge = 0
}
function releasePlunger() {
  if (!state.charging) return
  state.charging = false
  if (state.mode !== 'plunger') return
  const p = state.charge
  const power = 16 + 21 * p
  ball.vz = -power; ball.vx = 0; ball.z = 8.7
  state.mode = 'play'
  state.ballSaveUntil = performance.now() + 9000
  AudioFX.launch(p)
  setMessage(p > 0.92 ? 'Full power!' : 'Ball in play')
  state.charge = 0
  updateHUD()
}
function nudge() {
  if (state.mode !== 'play' || state.paused) return
  ball.vx += (Math.random() * 2 - 1) * 1.4
  ball.vz -= 1.1
  AudioFX.nudge()
  tableGroup.position.x = (Math.random() - 0.5) * 0.08
  setTimeout(() => (tableGroup.position.x = 0), 70)
}
function togglePause() {
  if (state.mode === 'gameover') return
  state.paused = !state.paused
  el.paused.hidden = !state.paused
}
addEventListener('keydown', (e) => {
  if (e.repeat) { if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); return }
  keys[e.code] = true
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': setFlipper(-1, true); e.preventDefault(); break
    case 'ArrowRight': case 'KeyD': setFlipper(1, true); e.preventDefault(); break
    case 'Space': startCharge(); e.preventDefault(); break
    case 'ArrowUp': case 'KeyW': case 'KeyT': nudge(); e.preventDefault(); break
    case 'KeyM': setMessage(AudioFX.toggleMute() ? 'Sound off' : 'Sound on'); break
    case 'KeyP': togglePause(); break
    case 'Enter': if (state.mode === 'gameover') startGame(); break
  }
})
addEventListener('keyup', (e) => {
  keys[e.code] = false
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': setFlipper(-1, false); break
    case 'ArrowRight': case 'KeyD': setFlipper(1, false); break
    case 'Space': releasePlunger(); e.preventDefault(); break
  }
})
// touch controls
function bindHold(id, down, up) {
  const n = $(id)
  const on = (e) => { e.preventDefault(); down() }
  const off = (e) => { e.preventDefault(); up && up() }
  n.addEventListener('pointerdown', on)
  n.addEventListener('pointerup', off); n.addEventListener('pointerleave', off); n.addEventListener('pointercancel', off)
}
bindHold('btn-left', () => setFlipper(-1, true), () => setFlipper(-1, false))
bindHold('btn-right', () => setFlipper(1, true), () => setFlipper(1, false))
bindHold('btn-launch', startCharge, releasePlunger)
$('play-again').addEventListener('click', startGame)
canvas.addEventListener('pointerdown', () => AudioFX.unlock())

// ---------- main loop ----------
const clock = new THREE.Clock()
let hudTick = 0
function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 1 / 30)

  if (!state.paused) {
    // plunger charge: 0→1 in ~1.1s, then holds with a pulse
    if (state.charging && state.mode === 'plunger') {
      state.charge = Math.min(1, state.charge + dt / 1.1)
      setMessage(`Plunger power ${Math.round(state.charge * 100)}% — release!`)
    }
  const springTravel = 0.45 * Math.min(1, state.charge * 1.6)
  plungerSpring.scale.z = 1 - state.charge * 0.55
  plungerSpring.position.z = state.charge * 0.15
  plungerRod.position.z = 9.5 + state.charge * 0.45
  plungerRod.scale.y = 1 - state.charge * 0.3

    updateFlippers(dt)

    if (state.mode === 'play') stepPhysics(dt)
    else if (state.mode === 'plunger') {
      ball.z = 8.7 + springTravel
      ball.x = 3.95
    }

    // spinner decay + bumper/target flash decay
    spinner.vel *= (1 - 1.6 * dt)
    spinner.angle += spinner.vel * dt
    if (spinner.mesh) spinner.mesh.rotation.x = spinner.angle
    for (const b of bumpers) {
      if (b.flash > 0) { b.flash = Math.max(0, b.flash - dt * 5); }
      b.mat.emissiveIntensity = 0.55 + b.flash * 2.6
      const s = 1 + b.flash * 0.12; b.cap.scale.set(s, 0.62 * s, s)
    }
    for (const t of targets) {
      if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 4)
      t.mat.emissiveIntensity = 0.5 + t.flash * 2.2
    }
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260)
    pinkGlow.intensity = 55 + Math.sin(performance.now() * 0.0016) * 14

    hudTick += dt
    if (hudTick > 0.25) { hudTick = 0; updateHUD() }
  }

  placeBallMesh()
  renderer.render(scene, camera)
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// ---------- go ----------
startGame()
animate()
updateHUD()

// small handle for automated checks / debugging
window.__pinball = {
  state, ball, flippers,
  startGame, serveBall,
  launch(power = 1) {
    if (state.mode !== 'plunger') return false
    state.charge = power; state.charging = true; releasePlunger(); return true
  },
  flip(side, down) { setFlipper(side, down) },
}
