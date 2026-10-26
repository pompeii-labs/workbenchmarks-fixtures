import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Object3D, Vector3, Vector2, Color,
  LatheGeometry, CylinderGeometry, CircleGeometry, BoxGeometry, TorusGeometry, TubeGeometry,
  CatmullRomCurve3, BufferGeometry, BufferAttribute, Points,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, ShaderMaterial,
  DirectionalLight, HemisphereLight, PMREMGenerator, CanvasTexture,
  ACESFilmicToneMapping, SRGBColorSpace, DoubleSide, Quaternion, Euler,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  streamVert, streamFrag, cupVert, cupFrag, milkFrag, steamVert, steamFrag,
} from './shaders.js';

// ---------- small math ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lin = (a, b, x) => clamp01((x - a) / (b - a));
const smooth = (a, b, x) => { const s = lin(a, b, x); return s * s * (3 - 2 * s); };
const mix = (a, b, k) => a + (b - a) * k;
const bump = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x));

// ---------- dimensions (scene units ~ decimetres) ----------
const SAUCER_TOP = 0.06;
const CUP_IN0 = SAUCER_TOP + 0.07; // inside bottom of the cup
const CUP_RIM = SAUCER_TOP + 0.74;
const cupInnerR = (h) => 0.3 + 0.26 * Math.pow(clamp01(h), 0.75); // h: 0 bottom .. 1 rim
const PITCHER_H = 1.25;
const pitcherR = (h) => 0.5 + 0.03 * Math.sin(Math.PI * h * 0.9) - 0.09 * h * h;
const SPOUT_Y = 1.52;

// Camera keyframes along story time. Positions are relative to world; tgt is look-at.
const KEYS = [
  { t: 0.0, pos: [1.2, 2.95, 3.3], tgt: [0, 1.0, 0] },
  { t: 0.85, pos: [0.7, 2.45, 2.2], tgt: [0, 0.75, 0] },
  { t: 1.45, pos: [0.05, 2.75, 1.05], tgt: [0, 0.55, 0.02] },
  { t: 2.0, pos: [4.1, 2.3, 3.9], tgt: [2.4, 1.0, 0.2] },
  { t: 2.6, pos: [3.3, 3.2, 2.5], tgt: [2.45, 0.9, 0.15] },
  { t: 3.15, pos: [0.3, 2.7, 2.5], tgt: [0, 0.6, -0.1] },
  { t: 3.85, pos: [0.1, 2.75, 2.0], tgt: [0, 0.55, 0.0] },
  { t: 4.45, pos: [1.9, 1.7, 3.6], tgt: [0.6, 0.55, 0] },
];

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(c);
  return tex;
}

function stream(core, edge, radius, seed, milk = 0) {
  const geo = new CylinderGeometry(1, 1, 1, 18, 80, true);
  geo.translate(0, -0.5, 0);
  const mat = new ShaderMaterial({
    vertexShader: streamVert,
    fragmentShader: streamFrag,
    uniforms: {
      uTime: { value: 0 }, uLen: { value: 1 }, uR: { value: radius }, uSeed: { value: seed },
      uHead: { value: 1 }, uTail: { value: 0 }, uWobble: { value: 0.3 }, uMilk: { value: milk },
      uCore: { value: new Color(...core) }, uEdge: { value: new Color(...edge) },
    },
  });
  const m = new Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

function steam(count, size, rise, spread) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 4));
  const mat = new ShaderMaterial({
    vertexShader: steamVert,
    fragmentShader: steamFrag,
    uniforms: {
      uTime: { value: 0 }, uPx: { value: 500 }, uIntensity: { value: 0 },
      uRise: { value: rise }, uSpread: { value: spread }, uSize: { value: size },
    },
    transparent: true,
    depthWrite: false,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 10;
  return pts;
}

export function createScene(host, { still = null, poster = false } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: poster });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  envScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });

  pmrem.dispose();

  const camera = new PerspectiveCamera(32, 1, 0.1, 60);

  // ---------- light ----------
  const key = new DirectionalLight(0xffe2c0, 2.0);
  key.position.set(-3, 5, 3);
  scene.add(key);
  const rim = new DirectionalLight(0xffb27a, 1.6);
  rim.position.set(3, 2.5, -4);
  scene.add(rim);
  scene.add(new HemisphereLight(0xfff1e0, 0x2a1810, 0.25));

  // ---------- counter: dark Vesuvian basalt fading into the page ----------
  const counterAlpha = radialTexture([[0, '#fff'], [0.45, '#fff'], [1, '#000']]);
  const counter = new Mesh(
    new CircleGeometry(7, 64),
    new MeshStandardMaterial({ color: 0x0d0a08, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.08, alphaMap: counterAlpha, transparent: true, depthWrite: false })
  );
  counter.rotation.x = -Math.PI / 2;
  counter.position.x = 1.2;
  counter.renderOrder = -2;
  scene.add(counter);

  const shadowTex = radialTexture([[0, 'rgba(0,0,0,0.85)'], [0.5, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
  const blob = (r) => {
    const m = new Mesh(new CircleGeometry(r, 48), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.003;
    m.renderOrder = -1;
    return m;
  };
  const cupShadow = blob(1.35);
  scene.add(cupShadow);

  // ---------- cup + saucer, Pompeian red glaze outside, plaster cream inside ----------
  const red = new MeshPhysicalMaterial({ color: 0x7a1d10, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.25 });
  const cream = new MeshPhysicalMaterial({ color: 0xf1e7d6, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1, side: DoubleSide, envMapIntensity: 0.3 });

  const cupGroup = new Group();
  scene.add(cupGroup);

  const saucerPts = [
    [0, 0], [0.42, 0], [0.48, 0.015], [0.6, 0.035], [0.84, 0.065], [0.96, 0.1], [0.985, 0.112],
    [0.97, 0.118], [0.86, 0.092], [0.62, 0.068], [0.44, SAUCER_TOP], [0, SAUCER_TOP],
  ].map(([x, y]) => new Vector2(x, y));
  const saucerMat = new MeshPhysicalMaterial({ color: 0x5e160c, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.3 });
  const saucer = new Mesh(new LatheGeometry(saucerPts, 96), saucerMat);
  cupGroup.add(saucer);

  const outerPts = [];
  outerPts.push(new Vector2(0, SAUCER_TOP), new Vector2(0.24, SAUCER_TOP), new Vector2(0.265, SAUCER_TOP + 0.02));
  for (let i = 1; i <= 16; i++) {
    const h = i / 16;
    const y = mix(SAUCER_TOP + 0.04, CUP_RIM, h);
    outerPts.push(new Vector2(cupInnerR(h) + 0.045 - 0.015 * h, y));
  }
  outerPts.push(new Vector2(cupInnerR(1) + 0.022, CUP_RIM + 0.012));
  const cupOuter = new Mesh(new LatheGeometry(outerPts, 96), red);
  const innerPts = [new Vector2(cupInnerR(1) + 0.022, CUP_RIM + 0.012), new Vector2(cupInnerR(1), CUP_RIM)];
  for (let i = 15; i >= 0; i--) {
    const h = i / 16;
    innerPts.push(new Vector2(cupInnerR(h), mix(CUP_IN0, CUP_RIM, h)));
  }
  innerPts.push(new Vector2(0, CUP_IN0));
  const cupInner = new Mesh(new LatheGeometry(innerPts, 96), cream);
  // lathe winds the "inside" outward; flip so normals face the viewer looking in
  cupInner.geometry.scale(1, 1, 1);
  const handle = new Mesh(new TorusGeometry(0.17, 0.04, 14, 40, Math.PI * 1.1), red);
  handle.position.set(cupInnerR(0.5) + 0.09, SAUCER_TOP + 0.4, 0);
  handle.rotation.z = -Math.PI * 0.575;
  const cupBody = new Group();
  cupBody.add(cupOuter, cupInner, handle);
  cupBody.rotation.y = -0.55;
  cupGroup.add(cupBody);

  // the drink surface
  const cupUniforms = {
    uTime: { value: 0 }, uPour: { value: 1 }, uSettle: { value: 0 }, uMilk: { value: 0 },
    uLeaf: { value: 0 }, uHeadArt: { value: 0 }, uPull: { value: 0 }, uFlow: { value: 0 }, uDone: { value: 0 },
    uImpact: { value: new Vector2(0, 0) }, uMilkImpact: { value: new Vector2(0, 0.4) },
    uCam: { value: new Vector3() },
  };
  const surface = new Mesh(
    new CircleGeometry(1, 96),
    new ShaderMaterial({ vertexShader: cupVert, fragmentShader: cupFrag, uniforms: cupUniforms })
  );
  surface.rotation.x = -Math.PI / 2;
  cupGroup.add(surface);

  // ---------- espresso machine: group head, portafilter, red enamel body ----------
  const chrome = new MeshStandardMaterial({ color: 0xd9d4cc, metalness: 1, roughness: 0.16, envMapIntensity: 0.8 });
  const darkMetal = new MeshStandardMaterial({ color: 0x3a3430, metalness: 0.9, roughness: 0.35 });
  const wood = new MeshStandardMaterial({ color: 0x3b2216, roughness: 0.55, envMapIntensity: 0.3 });
  const brass = new MeshStandardMaterial({ color: 0xc8963e, metalness: 1, roughness: 0.3 });
  const enamel = new MeshPhysicalMaterial({ color: 0x7e2014, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 0.3 });

  const machine = new Group();
  scene.add(machine);
  const body = new Mesh(new BoxGeometry(3.4, 1.1, 1.3), enamel);
  body.position.set(0, 2.85, -0.45);
  const trim = new Mesh(new BoxGeometry(3.42, 0.06, 1.32), brass);
  trim.position.set(0, 2.32, -0.45);
  const group = new Mesh(new CylinderGeometry(0.42, 0.46, 0.34, 48), chrome);
  group.position.set(0, 2.12, 0);
  const basket = new Mesh(new CylinderGeometry(0.37, 0.34, 0.2, 48), chrome);
  basket.position.set(0, 1.85, 0);
  const lugRing = new Mesh(new TorusGeometry(0.37, 0.025, 8, 48), darkMetal);
  lugRing.rotation.x = Math.PI / 2;
  lugRing.position.set(0, 1.94, 0);
  const spoutBlock = new Mesh(new BoxGeometry(0.22, 0.08, 0.1), chrome);
  spoutBlock.position.set(0, 1.71, 0);
  machine.add(body, trim, group, basket, lugRing, spoutBlock);
  for (const sx of [-0.065, 0.065]) {
    const sp = new Mesh(new CylinderGeometry(0.022, 0.03, 0.16, 16), chrome);
    sp.position.set(sx, SPOUT_Y + 0.08, 0);
    machine.add(sp);
  }
  const arm = new Group();
  const neck = new Mesh(new CylinderGeometry(0.06, 0.07, 0.34, 20), chrome);
  neck.rotation.x = Math.PI / 2;
  neck.position.set(0, 0, 0.5);
  const grip = new Mesh(new CylinderGeometry(0.075, 0.09, 0.85, 24), wood);
  grip.rotation.x = Math.PI / 2;
  grip.position.set(0, 0, 1.08);
  const cap = new Mesh(new CylinderGeometry(0.075, 0.075, 0.03, 24), brass);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(0, 0, 1.52);
  arm.add(neck, grip, cap);
  arm.position.set(0, 1.85, 0);
  arm.rotation.y = 0.6;
  machine.add(arm);

  const espressoA = stream([0.16, 0.07, 0.02], [0.78, 0.43, 0.14], 0.024, 1.3);
  const espressoB = stream([0.16, 0.07, 0.02], [0.78, 0.43, 0.14], 0.024, 4.1);
  espressoA.position.set(-0.065, SPOUT_Y, 0);
  espressoB.position.set(0.065, SPOUT_Y, 0);
  machine.add(espressoA, espressoB);

  // ---------- milk pitcher with a pulled spout ----------
  const pitcher = new Group();
  scene.add(pitcher);
  const pPts = [];
  pPts.push(new Vector2(0, 0.005));
  pPts.push(new Vector2(pitcherR(0) - 0.03, 0.005));
  for (let i = 0; i <= 24; i++) {
    const h = i / 24;
    pPts.push(new Vector2(pitcherR(h), 0.02 + h * (PITCHER_H - 0.02)));
  }
  const pGeo = new LatheGeometry(pPts, 96);
  {
    const pos = pGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let a = Math.atan2(z, x);
      let d = Math.abs(Math.abs(a) - Math.PI); // distance from the -x direction
      const w = Math.exp(-((d / 0.38) ** 2)) * Math.pow(clamp01((y - 0.8) / (PITCHER_H - 0.8)), 2.2);
      pos.setXYZ(i, x - w * 0.24, y + w * 0.07, z * (1 - 0.35 * w));
    }
    pGeo.computeVertexNormals();
  }
  const steel = new MeshStandardMaterial({ color: 0xcfcac3, metalness: 1, roughness: 0.2, side: DoubleSide, envMapIntensity: 0.6 });
  const pitcherBody = new Mesh(pGeo, steel);
  const pHandle = new Mesh(
    new TubeGeometry(new CatmullRomCurve3([
      new Vector3(0.4, 1.12, 0), new Vector3(0.66, 1.08, 0), new Vector3(0.74, 0.78, 0), new Vector3(0.6, 0.42, 0), new Vector3(0.47, 0.32, 0),
    ]), 32, 0.045, 10, false),
    steel
  );
  pitcher.add(pitcherBody, pHandle);
  const spoutTip = new Object3D();
  spoutTip.position.set(-pitcherR(1) - 0.24, PITCHER_H + 0.07, 0);
  pitcher.add(spoutTip);
  const milkUniforms = {
    uTime: { value: 0 }, uSteam: { value: 0 }, uStretch: { value: 0 }, uWand: { value: new Vector2(0.25, -0.15) }, uCam: { value: new Vector3() },
  };
  const milk = new Mesh(
    new CircleGeometry(1, 64),
    new ShaderMaterial({ vertexShader: cupVert, fragmentShader: milkFrag, uniforms: milkUniforms })
  );
  milk.rotation.x = -Math.PI / 2;
  pitcher.add(milk);
  const pitcherShadow = blob(1.0);
  scene.add(pitcherShadow);

  const REST = new Vector3(2.5, 0, 0.2);
  const REST_ROT_Y = Math.PI / 2;
  pitcher.position.copy(REST);
  pitcher.rotation.y = REST_ROT_Y;

  const milkStream = stream([0.99, 0.97, 0.93], [0.86, 0.83, 0.78], 0.034, 2.2, 1);
  milkStream.material.uniforms.uWobble.value = 0.6;
  scene.add(milkStream);

  // ---------- steam wand ----------
  const wand = new Group();
  const wandTipLocal = new Vector3(REST.x + 0.14, 0.72, REST.z - 0.12);
  const wandTube = new Mesh(
    new TubeGeometry(new CatmullRomCurve3([
      new Vector3(REST.x - 0.7, 3.4, -0.5), new Vector3(REST.x - 0.55, 2.4, -0.4), new Vector3(REST.x - 0.1, 1.7, -0.25), wandTipLocal,
    ]), 48, 0.035, 12, false),
    chrome
  );
  const knuckle = new Mesh(new CylinderGeometry(0.06, 0.06, 0.12, 16), chrome);
  knuckle.position.set(REST.x - 0.7, 3.3, -0.5);
  wand.add(wandTube, knuckle);
  scene.add(wand);

  // ---------- steam ----------
  const wandSteam = steam(160, 0.5, 1.6, 0.3);
  scene.add(wandSteam);
  const cupSteam = steam(90, 0.45, 1.1, 0.16);
  scene.add(cupSteam);

  // per-material reflection strength: chrome needs the room, glaze only a hint of it
  scene.traverse((o) => {
    const m = o.material;
    if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) { m.envMap = envTex; m.needsUpdate = true; }
  });

  // ---------- state ----------
  let target = still ?? 0;
  let t = target;
  let time = still != null ? 7.35 : 0;
  let active = false;
  let raf = 0;
  let last = performance.now();
  let firstCb = null;
  let drewFirst = false;
  let dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 2 : 1.6);
  let slowFrames = 0;
  let W = 1, H = 1;

  const camPos = new Vector3(), camTgt = new Vector3(), tmpA = new Vector3(), tmpB = new Vector3();
  const spoutWorld = new Vector3();
  const qTmp = new Quaternion();
  const eTmp = new Euler();

  function resize() {
    W = host.clientWidth || window.innerWidth;
    H = host.clientHeight || window.innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // keep the subject clear of the copy: right of it on desktop, above it on phones
    const portrait = W / H < 0.9;
    if (portrait) camera.setViewOffset(W, H, 0, H * 0.24, W, H);
    else if (W > 720) camera.setViewOffset(W, H, -W * 0.17, 0, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const px = (H * dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    wandSteam.material.uniforms.uPx.value = px;
    cupSteam.material.uniforms.uPx.value = px;
  }
  resize();
  const ro = new ResizeObserver(() => { resize(); if (!active) render(); });
  ro.observe(host);

  function cameraAt(tt) {
    let i = 0;
    while (i < KEYS.length - 2 && tt > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = smooth(a.t, b.t, tt);
    camPos.set(mix(a.pos[0], b.pos[0], k), mix(a.pos[1], b.pos[1], k), mix(a.pos[2], b.pos[2], k));
    camTgt.set(mix(a.tgt[0], b.tgt[0], k), mix(a.tgt[1], b.tgt[1], k), mix(a.tgt[2], b.tgt[2], k));
    // phones are tall and narrow: back the camera off so the cup still fits
    const aspect = W / H;
    const back = aspect < 1 ? Math.min(1.9, 1 + (1 - aspect) * 1.25) : 1;
    tmpA.subVectors(camPos, camTgt).multiplyScalar(back);
    camPos.addVectors(camTgt, tmpA);
  }

  function update() {
    const T = t;
    cameraAt(T);
    // gentle handheld breathing so stills never look frozen
    camPos.x += Math.sin(time * 0.35) * 0.03;
    camPos.y += Math.sin(time * 0.27) * 0.02;
    camera.position.copy(camPos);
    camera.lookAt(camTgt);

    // ---- I. extraction: two streams, the cup fills with scroll ----
    const espressoLevel = mix(0.22, 0.4, smooth(0.0, 1.05, T));
    const cutoff = smooth(0.78, 1.15, T); // the pour blondes, thins, then breaks
    const art = lin(3.12, 3.92, T);
    const cupLevel = espressoLevel + 0.52 * smooth(0.0, 0.8, art);
    const surfY = mix(CUP_IN0, CUP_RIM, cupLevel);
    const surfR = cupInnerR(cupLevel) - 0.004;
    surface.position.y = surfY;
    surface.scale.setScalar(surfR);

    machine.position.y = 2.8 * smooth(1.08, 1.55, T);
    for (const s of [espressoA, espressoB]) {
      const u = s.material.uniforms;
      u.uTime.value = time;
      u.uLen.value = SPOUT_Y - surfY + 0.02;
      u.uTail.value = cutoff * 1.05;
      u.uHead.value = 1;
      u.uR.value = 0.024 * (1 - 0.45 * smooth(0.5, 0.95, T));
      s.visible = cutoff < 0.99;
    }

    // ---- II. crema settles ----
    cupUniforms.uTime.value = time;
    cupUniforms.uPour.value = 1 - cutoff;
    cupUniforms.uSettle.value = smooth(0.95, 1.85, T);
    cupUniforms.uCam.value.copy(camera.position);

    // ---- III. steaming ----
    const steamOn = bump(1.85, 2.1, 2.8, 3.0, T);
    const stretch = smooth(2.0, 2.85, T);
    wand.position.y = 3.2 * (1 - smooth(1.55, 2.0, T)) + 3.2 * smooth(2.85, 3.1, T);
    wand.visible = wand.position.y < 3.1;
    milkUniforms.uTime.value = time;
    milkUniforms.uSteam.value = steamOn;
    milkUniforms.uStretch.value = stretch;
    milkUniforms.uCam.value.copy(camera.position);

    // ---- IV. the pour: pitcher swings over the cup, spout traces the rosetta ----
    const b = smooth(2.88, 3.14, T);
    const back = smooth(3.95, 4.3, T);
    let sx = 0, sy = 1.25, sz = -0.05, flow = 0;
    if (art < 0.25) { const k = art / 0.25; sy = mix(1.3, 1.05, k); sz = mix(-0.05, 0.25, k); flow = 1; }
    else if (art < 0.75) { const k = (art - 0.25) / 0.5; sx = 0.035 * Math.sin(k * 44); sy = 1.0; sz = mix(0.3, -0.21, k); flow = 0.85; }
    else if (art < 0.85) { sy = 1.0; sz = -0.27; flow = 0.7; }
    else { const k = (art - 0.85) / 0.15; sy = mix(1.02, 1.22, k); sz = mix(-0.27, 0.42, k); flow = mix(0.55, 0.25, k); }
    const tilt = mix(0.95, 1.3, art);
    eTmp.set(0, REST_ROT_Y, tilt);
    qTmp.setFromEuler(eTmp);
    tmpB.copy(spoutTip.position).applyQuaternion(qTmp);
    const pourPos = tmpA.set(sx, sy, sz).sub(tmpB);
    const bb = b * (1 - back);
    pitcher.position.lerpVectors(REST, pourPos, bb);
    pitcher.position.y += Math.sin(Math.PI * bb) * 0.35;
    pitcher.rotation.set(0, REST_ROT_Y, tilt * bb);
    const pLevel = mix(0.5, 0.68, stretch) * (1 - 0.55 * art);
    milk.position.y = 0.02 + pLevel * (PITCHER_H - 0.02);
    milk.scale.setScalar(pitcherR(pLevel) - 0.01);
    milk.visible = bb < 0.05;
    pitcherShadow.position.set(pitcher.position.x, 0.003, pitcher.position.z);
    pitcherShadow.material.opacity = 1 - smooth(0.0, 0.3, bb);

    pitcher.updateMatrixWorld(true);
    spoutTip.getWorldPosition(spoutWorld);
    const pouring = b > 0.98 && art > 0 && art < 1 && back < 0.01;
    const head = smooth(0, 0.05, art);
    const tail = smooth(0.95, 1.0, art);
    milkStream.visible = pouring;
    if (pouring) {
      milkStream.position.copy(spoutWorld);
      const mu = milkStream.material.uniforms;
      mu.uTime.value = time;
      mu.uLen.value = Math.max(0.05, spoutWorld.y - surfY);
      mu.uR.value = 0.036 * (0.55 + 0.45 * flow);
      mu.uHead.value = head;
      mu.uTail.value = tail;
    }
    const cr = surfR;
    cupUniforms.uMilkImpact.value.set(spoutWorld.x / cr, -spoutWorld.z / cr);
    cupUniforms.uFlow.value = pouring ? flow * head * (1 - tail) : 0;
    cupUniforms.uMilk.value = smooth(0.03, 0.28, art);
    cupUniforms.uLeaf.value = lin(0.25, 0.75, art);
    cupUniforms.uHeadArt.value = smooth(0.75, 0.85, art);
    cupUniforms.uPull.value = smooth(0.85, 1.0, art);

    // ---- steam everywhere it should be ----
    wandSteam.position.set(REST.x, PITCHER_H + 0.05, REST.z);
    wandSteam.material.uniforms.uTime.value = time;
    wandSteam.material.uniforms.uIntensity.value = steamOn * (0.6 + 0.4 * Math.sin(time * 5.0) ** 2);
    cupSteam.position.set(0, surfY + 0.02, 0);
    cupSteam.material.uniforms.uTime.value = time * 0.8;
    cupSteam.material.uniforms.uIntensity.value = 0.5 * (1 - smooth(1.2, 1.6, T)) + 0.7 * smooth(3.9, 4.3, T);
    cupSteam.visible = cupSteam.material.uniforms.uIntensity.value > 0.01;
    wandSteam.visible = steamOn > 0.01;
  }

  function render() {
    update();
    renderer.render(scene, camera);
    if (!drewFirst) {
      drewFirst = true;
      if (firstCb) requestAnimationFrame(() => firstCb && firstCb());
    }
  }

  function loop(now) {
    raf = 0;
    if (!active) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    // critically-damped-ish follow: scroll feels weighty, never laggy
    t += (target - t) * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(target - t) < 1e-4) t = target;
    render();
    // adaptive resolution for slower phones
    if (dt > 0.028) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 40 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); slowFrames = 0; resize(); }
    raf = requestAnimationFrame(loop);
  }

  return {
    setTarget(v, jump = false) {
      target = still ?? v;
      if (jump) t = target;
    },
    setActive(on) {
      if (still != null) { render(); return; }
      if (on === active) return;
      active = on;
      if (on) { last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    onFirstFrame(cb) {
      firstCb = cb;
      if (drewFirst) requestAnimationFrame(cb);
    },
    dispose() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      envTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
