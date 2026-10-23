import * as THREE from "three";
import "./style.css";
import { WAVES, waterAt, createRider, stepRider } from "./physics.js";

const $ = (id) => document.getElementById(id);
const canvas = $("ocean");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch {
  $("error").hidden = false;
  $("loading").hidden = true;
  throw new Error("WebGL is unavailable.");
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x92cbd0, 0.0015);
const camera = new THREE.PerspectiveCamera(
  58,
  innerWidth / innerHeight,
  0.2,
  2600,
);
scene.add(new THREE.HemisphereLight(0xd6f2ff, 0x3a8a91, 2.8));
const sun = new THREE.DirectionalLight(0xffedcf, 3.5);
sun.position.set(-150, 220, -220);
scene.add(sun);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2200, 32, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { sunDirection: { value: sun.position.clone().normalize() } },
    vertexShader: `varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDirection; uniform vec3 sunDirection;
    void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.0);
      vec3 color=mix(vec3(.77,.89,.87),vec3(.23,.65,.79),pow(h,.42));
      float s=max(dot(d,sunDirection),0.0);
      color+=vec3(1.,.79,.43)*pow(s,12.)*.23;
      color=mix(color,vec3(1.,.94,.76),smoothstep(.99925,.99965,s));
      float cloud=sin(d.x*26.+sin(d.z*19.)*2.)*sin(d.z*32.+d.x*7.);
      float band=smoothstep(.13,.19,h)*(1.-smoothstep(.28,.38,h));
      color=mix(color,vec3(.93,.97,.94),smoothstep(.43,.85,cloud)*band*.22);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }),
);
scene.add(sky);

const waveGLSL = WAVES.map(
  (w) => `{
  float p = ${w.k} * (${w.x} * world.x + ${w.z} * world.z) - uTime * ${w.speed};
  h += ${w.amplitude} * sin(p);
  dx += ${w.amplitude * w.k * w.x} * cos(p);
  dz += ${w.amplitude * w.k * w.z} * cos(p);
}`,
).join("\n");
const oceanMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uSun: { value: sun.position.clone().normalize() },
    uFog: { value: new THREE.Color(0x92cbd0) },
  },
  vertexShader: `uniform float uTime; varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
    void main(){vec3 world=(modelMatrix*vec4(position,1.)).xyz;float h=0.;float dx=0.;float dz=0.;
      ${waveGLSL}
      world.y=h;vWorld=world;vNormal=normalize(vec3(-dx,1.,-dz));vHeight=h;
      gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
    }`,
  fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform vec3 uFog;
    varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
    void main(){
      vec2 p=vWorld.xz;
      float fine=noise(p*2.+vec2(uTime*.35,uTime*.18));
      float fine2=noise(p*4.5-vec2(uTime*.21,0.));
      vec3 normal=normalize(vNormal+vec3((fine-.5)*.13,0.,(fine2-.5)*.13));
      vec3 view=normalize(cameraPosition-vWorld);
      float fresnel=pow(1.-max(dot(view,normal),0.),3.);
      float sunLight=max(dot(normal,uSun),0.);
      vec3 deep=vec3(.008,.14,.19);vec3 shallow=vec3(.015,.36,.35);
      vec3 color=mix(deep,shallow,smoothstep(-2.,2.7,vHeight)*.66+.18);
      color*=.72+sunLight*.37;
      color=mix(color,vec3(.37,.64,.68),fresnel*.57);
      vec3 halfV=normalize(uSun+view);
      float spec=pow(max(dot(normal,halfV),0.),180.);
      color+=vec3(1.,.91,.69)*spec*2.8;
      float crest=smoothstep(1.5,2.6,vHeight);
      float foam=smoothstep(.55,.78,noise(p*1.2+uTime*.3))*crest*.32;
      color=mix(color,vec3(.72,.93,.88),foam);
      float distanceToCamera=length(cameraPosition-vWorld);
      float fog=1.-exp(-distanceToCamera*.00135);
      color=mix(color,uFog,fog);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const oceanGeometry = new THREE.PlaneGeometry(1500, 1500, 220, 220);
oceanGeometry.rotateX(-Math.PI / 2);
// Spend vertices on the nearby chop, not on the distant horizon.
const oceanVertices = oceanGeometry.attributes.position;
for (let i = 0; i < oceanVertices.count; i++) {
  const x = oceanVertices.getX(i) / 750,
    z = oceanVertices.getZ(i) / 750;
  oceanVertices.setX(i, Math.sign(x) * Math.pow(Math.abs(x), 1.6) * 750);
  oceanVertices.setZ(i, Math.sign(z) * Math.pow(Math.abs(z), 1.6) * 750);
}
const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
ocean.frustumCulled = false;
scene.add(ocean);
// Low-detail outer strips keep the water continuous all the way to the haze.
for (const [width, depth, x, z] of [
  [9000, 3750, 0, -2625],
  [9000, 3750, 0, 2625],
  [3750, 1500, -2625, 0],
  [3750, 1500, 2625, 0],
]) {
  const geometry = new THREE.PlaneGeometry(width, depth, 32, 16);
  geometry.rotateX(-Math.PI / 2);
  const distantWater = new THREE.Mesh(geometry, oceanMaterial);
  distantWater.position.set(x, 0, z);
  distantWater.frustumCulled = false;
  ocean.add(distantWater);
}

// Seeded scenery stays reproducible and never gets in the playable water.
let seed = 19;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x777c60,
  roughness: 0.95,
  flatShading: true,
});
const greenMaterial = new THREE.MeshStandardMaterial({
  color: 0x3c715b,
  roughness: 1,
  flatShading: true,
});
const sandMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8c9a1,
  roughness: 1,
});
const islands = new THREE.Group();
for (let i = 0; i < 15; i++) {
  const island = new THREE.Group();
  const side = i % 2 ? -1 : 1;
  island.position.set(side * (340 + random() * 300), -5, 80 - i * 140);
  const scale = 20 + random() * 45;
  const beach = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 8),
    sandMaterial,
  );
  beach.scale.set(scale * 1.5, 7, scale * 1.05);
  island.add(beach);
  for (let j = 0; j < 5; j++) {
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      j < 2 ? rockMaterial : greenMaterial,
    );
    const height = scale * (0.5 + random() * 0.9);
    rock.position.set(
      (random() - 0.5) * scale * 1.2,
      height * 0.25,
      (random() - 0.5) * scale * 0.6,
    );
    rock.scale.set(
      scale * (0.5 + random() * 0.6),
      height,
      scale * (0.4 + random() * 0.5),
    );
    rock.rotation.y = random() * 6;
    island.add(rock);
  }
  islands.add(island);
}
scene.add(islands);

function material(color, roughness = 0.45, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const coral = material(0xff5431, 0.3, 0.18);
const cream = material(0xffe9b2, 0.32);
const navy = material(0x102d3a, 0.6);
const black = material(0x131f26, 0.75);
const silver = material(0xb8cbd0, 0.25, 0.6);
const teal = material(0x30a6a4, 0.7);
const skin = material(0xd99f76, 0.8);
const white = material(0xfffcf2, 0.38);

function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function box(parent, mat, size, pos) {
  // Small bevels come from layered hull pieces; hard edges keep the art crisp.
  return mesh(new THREE.BoxGeometry(...size), mat, parent, ...pos);
}
function cylinderBetween(parent, a, b, radius, mat, radiusTop = radius) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const m = mesh(
    new THREE.CylinderGeometry(radiusTop, radius, start.distanceTo(end), 10),
    mat,
    parent,
  );
  m.position.copy(start).add(end).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    end.sub(start).normalize(),
  );
  return m;
}

const ski = new THREE.Group();
function makeHull(mat, y, width, depth, length) {
  const outline = new THREE.Shape();
  outline.moveTo(0, -2.55 * length);
  outline.bezierCurveTo(
    0.4 * width,
    -2.5 * length,
    0.96 * width,
    -1.15 * length,
    0.96 * width,
    0.45 * length,
  );
  outline.lineTo(0.73 * width, 1.8 * length);
  outline.quadraticCurveTo(0, 2.05 * length, -0.73 * width, 1.8 * length);
  outline.lineTo(-0.96 * width, 0.45 * length);
  outline.bezierCurveTo(
    -0.96 * width,
    -1.15 * length,
    -0.4 * width,
    -2.5 * length,
    0,
    -2.55 * length,
  );
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 12,
  });
  geometry.rotateX(Math.PI / 2);
  return mesh(geometry, mat, ski, 0, y, 0);
}
makeHull(navy, 0.12, 0.91, 0.37, 1);
makeHull(cream, 0.32, 1, 0.2, 1);
makeHull(coral, 0.48, 0.88, 0.19, 0.96);
box(ski, navy, [1.5, 0.09, 0.45], [0, 0.5, 1.5]);
const seat = mesh(
  new THREE.CapsuleGeometry(0.36, 1.45, 5, 12),
  black,
  ski,
  0,
  0.72,
  0.35,
);
seat.rotation.x = Math.PI / 2;
seat.scale.x = 1.1;
const cowling = mesh(
  new THREE.SphereGeometry(1, 20, 12),
  coral,
  ski,
  0,
  0.58,
  -1.2,
);
cowling.scale.set(0.68, 0.49, 0.83);
const windscreen = mesh(
  new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  material(0x254651, 0.17, 0.5),
  ski,
  0,
  0.9,
  -1.28,
);
windscreen.scale.set(0.49, 0.28, 0.4);
cylinderBetween(ski, [0, 0.65, -0.8], [0, 1.2, -0.93], 0.07, silver);
cylinderBetween(ski, [-0.62, 1.2, -0.95], [0.62, 1.2, -0.95], 0.055, black);
for (const side of [-1, 1]) {
  box(ski, black, [0.25, 0.065, 1.6], [side * 0.7, 0.52, 0.35]);
  const stripe = box(ski, cream, [0.035, 0.12, 1.2], [side * 0.91, 0.22, 0.1]);
  stripe.rotation.x = -0.06;
  cylinderBetween(
    ski,
    [side * 0.45, 1.2, -0.95],
    [side * 0.68, 1.2, -0.95],
    0.075,
    navy,
  );
}
const nozzle = mesh(
  new THREE.CylinderGeometry(0.15, 0.2, 0.28, 12),
  black,
  ski,
  0,
  -0.05,
  1.96,
);
nozzle.rotation.x = Math.PI / 2;
// A compact, leaning rider silhouette makes steering readable at speed.
const riderBody = new THREE.Group();
ski.add(riderBody);
const hips = mesh(
  new THREE.SphereGeometry(0.36, 12, 8),
  navy,
  riderBody,
  0,
  1.1,
  0.3,
);
hips.scale.set(1, 0.8, 1.3);
const torso = box(riderBody, teal, [0.7, 0.82, 0.44], [0, 1.62, -0.02]);
torso.rotation.x = -0.26;
box(riderBody, navy, [0.54, 0.5, 0.075], [0, 1.66, 0.26]);
for (const side of [-1, 1]) {
  box(riderBody, cream, [0.055, 0.62, 0.07], [side * 0.23, 1.68, 0.3]);
  cylinderBetween(
    riderBody,
    [side * 0.25, 1.13, 0.24],
    [side * 0.49, 0.82, -0.18],
    0.17,
    navy,
  );
  cylinderBetween(
    riderBody,
    [side * 0.49, 0.82, -0.18],
    [side * 0.62, 0.61, 0.48],
    0.125,
    skin,
  );
  box(riderBody, black, [0.25, 0.16, 0.46], [side * 0.62, 0.58, 0.46]);
  cylinderBetween(
    riderBody,
    [side * 0.35, 1.9, -0.15],
    [side * 0.53, 1.56, -0.47],
    0.12,
    skin,
  );
  cylinderBetween(
    riderBody,
    [side * 0.53, 1.56, -0.47],
    [side * 0.54, 1.22, -0.94],
    0.095,
    skin,
  );
  mesh(
    new THREE.SphereGeometry(0.105, 8, 6),
    black,
    riderBody,
    side * 0.54,
    1.22,
    -0.94,
  );
}
const helmet = mesh(
  new THREE.SphereGeometry(0.31, 20, 14),
  white,
  riderBody,
  0,
  2.19,
  -0.25,
);
helmet.scale.set(0.9, 1.07, 1);
mesh(
  new THREE.SphereGeometry(0.315, 16, 10, Math.PI, Math.PI, 0.75, 1.05),
  navy,
  riderBody,
  0,
  2.22,
  -0.25,
);
box(riderBody, coral, [0.08, 0.035, 0.52], [0, 2.51, -0.25]);
scene.add(ski);

const gateMaterial = material(0x52daee, 0.35, 0.25);
const gateLight = new THREE.MeshBasicMaterial({ color: 0xa7ffff });
const gateGroups = [];
function positionGate(g, index) {
  const z = -85 - index * 135;
  const x = Math.sin(index * 0.82) * 61 + Math.sin(index * 1.7) * 12;
  g.position.set(x, 0, z);
  g.userData.index = index;
  g.userData.passed = false;
}
for (let i = 0; i < 9; i++) {
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const buoy = new THREE.Group();
    buoy.position.x = side * 11;
    mesh(
      new THREE.CylinderGeometry(0.62, 1.0, 1.8, 12),
      gateMaterial,
      buoy,
      0,
      0.35,
      0,
    );
    mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 0.22, 12),
      white,
      buoy,
      0,
      0.92,
      0,
    );
    cylinderBetween(buoy, [0, 1, 0], [0, 5.4, 0], 0.055, white);
    const flag = mesh(
      new THREE.PlaneGeometry(1.5, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xdfffaa, side: THREE.DoubleSide }),
      buoy,
      side * 0.75,
      4.9,
      0,
    );
    flag.rotation.z = side * -0.08;
    mesh(new THREE.SphereGeometry(0.15, 8, 6), gateLight, buoy, 0, 5.5, 0);
    gate.add(buoy);
  }
  const line = mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 22, 6),
    new THREE.MeshBasicMaterial({
      color: 0xb6fffa,
      transparent: true,
      opacity: 0.48,
    }),
    gate,
    0,
    4.5,
    0,
  );
  line.rotation.z = Math.PI / 2;
  // Chevron suspended over each gate marks the optional route.
  cylinderBetween(gate, [-0.7, 6.8, 0], [0, 6.25, 0], 0.07, gateLight);
  cylinderBetween(gate, [0, 6.25, 0], [0.7, 6.8, 0], 0.07, gateLight);
  positionGate(gate, i);
  gateGroups.push(gate);
  scene.add(gate);
}

const particleCount = 1500;
const particlePositions = new Float32Array(particleCount * 3);
const particleSizes = new Float32Array(particleCount);
const particleAlpha = new Float32Array(particleCount);
const particleVelocity = new Float32Array(particleCount * 3);
const particleLife = new Float32Array(particleCount);
const particleMaxLife = new Float32Array(particleCount);
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(particlePositions, 3).setUsage(
    THREE.DynamicDrawUsage,
  ),
);
particleGeometry.setAttribute(
  "aSize",
  new THREE.BufferAttribute(particleSizes, 1).setUsage(THREE.DynamicDrawUsage),
);
particleGeometry.setAttribute(
  "aAlpha",
  new THREE.BufferAttribute(particleAlpha, 1).setUsage(THREE.DynamicDrawUsage),
);
const spray = new THREE.Points(
  particleGeometry,
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: innerHeight * renderer.getPixelRatio() } },
    vertexShader: `attribute float aSize;attribute float aAlpha;uniform float uScale;varying float vAlpha;
    void main(){vAlpha=aAlpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(aSize*uScale/-p.z,0.,65.);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.89,.99,1.,vAlpha*(1.-smoothstep(.1,.5,d)));}`,
  }),
);
spray.frustumCulled = false;
scene.add(spray);
let particleCursor = 0;
function emit(x, y, z, vx, vy, vz, size, life) {
  const i = particleCursor++ % particleCount,
    k = i * 3;
  particlePositions[k] = x;
  particlePositions[k + 1] = y;
  particlePositions[k + 2] = z;
  particleVelocity[k] = vx;
  particleVelocity[k + 1] = vy;
  particleVelocity[k + 2] = vz;
  particleSizes[i] = size;
  particleLife[i] = life;
  particleMaxLife[i] = life;
}
const wakeSamples = [];
const wakeCount = 150;
const wakePositions = new Float32Array(wakeCount * 2 * 3);
const wakeUV = new Float32Array(wakeCount * 2 * 2);
const wakeAges = new Float32Array(wakeCount * 2);
const wakeIndices = [];
for (let i = 0; i < wakeCount - 1; i++) {
  const n = i * 2;
  wakeIndices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
}
const wakeGeometry = new THREE.BufferGeometry();
wakeGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(wakePositions, 3).setUsage(THREE.DynamicDrawUsage),
);
wakeGeometry.setAttribute("uv", new THREE.BufferAttribute(wakeUV, 2));
wakeGeometry.setAttribute("aAge", new THREE.BufferAttribute(wakeAges, 1));
wakeGeometry.setIndex(wakeIndices);
wakeGeometry.index.setUsage(THREE.DynamicDrawUsage);
const wake = new THREE.Mesh(
  wakeGeometry,
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `attribute float aAge;varying vec2 vUv;varying float vAge;void main(){vUv=uv;vAge=aAge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vAge;void main(){float edge=abs(vUv.x-.5)*2.;float lines=pow(sin(edge*15.+vUv.y*12.)*.5+.5,3.);float a=(.18+lines*.32)*smoothstep(1.,.75,edge)*max(0.,1.-vAge/6.);a*=smoothstep(0.,.15,vAge);gl_FragColor=vec4(.76,.96,.94,a);}`,
  }),
);
wake.frustumCulled = false;
scene.add(wake);
let wakeTimer = 0;

// Procedural audio is local, lightweight, and only starts after a gesture.
let audioContext, engineOscillator, engineGain, waterGain, audioFilter;
let soundOn = false;
function prepareAudio() {
  if (audioContext) {
    audioContext.resume().catch(() => {});
    return;
  }
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    engineOscillator = audioContext.createOscillator();
    engineOscillator.type = "sawtooth";
    engineGain = audioContext.createGain();
    engineGain.gain.value = 0;
    audioFilter = audioContext.createBiquadFilter();
    audioFilter.type = "lowpass";
    audioFilter.frequency.value = 280;
    engineOscillator
      .connect(audioFilter)
      .connect(engineGain)
      .connect(audioContext.destination);
    engineOscillator.start();
    const buffer = audioContext.createBuffer(
      1,
      audioContext.sampleRate * 3,
      audioContext.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1100;
    filter.Q.value = 0.4;
    waterGain = audioContext.createGain();
    waterGain.gain.value = 0;
    source.connect(filter).connect(waterGain).connect(audioContext.destination);
    source.start();
  } catch {
    soundOn = false;
  }
}
function toggleSound() {
  prepareAudio();
  soundOn = !soundOn && !!audioContext;
  $("sound-button").setAttribute(
    "aria-label",
    soundOn ? "Turn sound off" : "Turn sound on",
  );
  $("sound-icon").innerHTML = soundOn
    ? '<path d="M11 5 6 9H3v6h3l5 4V5ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>'
    : '<path d="M11 5 6 9H3v6h3l5 4V5ZM16 9l6 6m0-6-6 6"/>';
}
function splashSound(amount) {
  if (!soundOn || !audioContext) return;
  const now = audioContext.currentTime;
  waterGain.gain.cancelScheduledValues(now);
  waterGain.gain.setValueAtTime(Math.min(0.32, amount * 0.018), now);
  waterGain.gain.exponentialRampToValueAtTime(0.03, now + 0.7);
}

let rider = createRider();
let started = false,
  paused = false,
  time = 0,
  lastTimestamp = 0,
  accumulator = 0;
let landingKick = 0,
  toastTime = 0,
  airDisplayTime = 0,
  hudTimer = 0;
const input = {
  gas: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
};
const keys = new Set();
const touch = new Set();
let touchMode = matchMedia("(pointer: coarse)").matches;
if (touchMode)
  document.querySelector(".intro-controls").innerHTML =
    "<span>HOLD GAS TO DRIVE</span><span>HIT SWELLS TO FLY</span>";
const cameraTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const forward = new THREE.Vector3();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function clearInput() {
  keys.clear();
  touch.clear();
  for (const key in input) input[key] = false;
  document
    .querySelectorAll("[data-control]")
    .forEach((button) => button.classList.remove("pressed"));
}
function readInput() {
  input.gas = keys.has("KeyW") || keys.has("ArrowUp") || touch.has("gas");
  input.brake = keys.has("KeyS") || keys.has("ArrowDown") || touch.has("brake");
  input.left = keys.has("KeyA") || keys.has("ArrowLeft") || touch.has("left");
  input.right =
    keys.has("KeyD") || keys.has("ArrowRight") || touch.has("right");
  input.boost = keys.has("Space") || touch.has("boost");
}
function notify(text) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  toastTime = 2.8;
}
function startGame() {
  if (started) return;
  started = true;
  $("intro").hidden = true;
  $("scene-label").hidden = true;
  $("intro-footer").hidden = true;
  $("hud").hidden = false;
  $("pause-button").disabled = false;
  $("touch-controls").hidden = !touchMode;
  prepareAudio();
  camera.position.set(rider.x + 1, rider.y + 6.5, rider.z + 13);
  lookTarget.set(rider.x, rider.y + 1, rider.z - 8);
  notify(
    touchMode
      ? "HOLD GAS. FIND A SWELL. SEND IT."
      : "HOLD W TO OPEN IT UP. SPACE FOR A LITTLE EXTRA.",
  );
  $("start-button").blur();
}
function setPaused(value) {
  if (!started) return;
  paused = value;
  $("pause-overlay").hidden = !paused;
  $("pause-button").setAttribute(
    "aria-label",
    paused ? "Resume game" : "Pause game",
  );
  document.querySelector(".topbar").inert = paused;
  $("hud").inert = paused;
  $("touch-controls").inert = paused;
  clearInput();
  if (paused) $("resume-button").focus();
  else $("resume-button").blur();
}
function resetPosition(fresh = false) {
  const old = rider;
  rider = createRider();
  if (!fresh) {
    rider.score = old.score;
    rider.bestAir = old.bestAir;
    rider.gates = old.gates;
  }
  gateGroups.forEach((g, i) => positionGate(g, i));
  wakeSamples.length = 0;
  particleLife.fill(0);
  landingKick = 0;
  airDisplayTime = 0;
  $("air-callout").classList.remove("active");
  rider.y = waterAt(rider.x, rider.z, time).height + 0.58;
  camera.position.set(rider.x + 1, rider.y + 6.5, rider.z + 13);
  lookTarget.set(rider.x, rider.y + 1, rider.z - 8);
  notify(
    fresh
      ? "FRESH WATER. FRESH START."
      : "BACK IN THE BLUE. YOUR SESSION IS SAFE.",
  );
}
$("start-button").addEventListener("click", startGame);
$("pause-button").addEventListener("click", () => setPaused(!paused));
$("resume-button").addEventListener("click", () => setPaused(false));
$("restart-button").addEventListener("click", () => {
  resetPosition(true);
  setPaused(false);
});
$("reset-button").addEventListener("click", () => resetPosition());
$("sound-button").addEventListener("click", toggleSound);
const gameKeys = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
];
window.addEventListener("keydown", (event) => {
  if (paused && event.code === "Tab") {
    event.preventDefault();
    (document.activeElement === $("resume-button")
      ? $("restart-button")
      : $("resume-button")
    ).focus();
    return;
  }
  if (
    event.target instanceof HTMLButtonElement &&
    (event.code === "Space" || event.code === "Enter") &&
    (!started || paused)
  )
    return;
  if (gameKeys.includes(event.code) && started) event.preventDefault();
  if (event.repeat) return;
  if (event.code === "KeyM") toggleSound();
  if (event.code === "KeyP" || event.code === "Escape") setPaused(!paused);
  if (event.code === "KeyR" && started && !paused) resetPosition();
  if (started && !paused) keys.add(event.code);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  clearInput();
  if (started && !paused) setPaused(true);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && started) setPaused(true);
});
document.querySelectorAll("[data-control]").forEach((button) => {
  const release = (event) => {
    event.preventDefault();
    touch.delete(button.dataset.control);
    button.classList.remove("pressed");
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (paused) return;
    button.setPointerCapture(event.pointerId);
    touch.add(button.dataset.control);
    button.classList.add("pressed");
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

function landing(event) {
  landingKick = Math.min(1, event.impact / 17);
  airDisplayTime = 2;
  $("air-label").textContent =
    event.height > 7 ? "ABSOLUTELY SENT" : "CLEAN LANDING";
  $("air-height").innerHTML = `${event.height.toFixed(1)}<small>M</small>`;
  $("air-detail").textContent =
    `+${event.points} / ${event.duration.toFixed(1)} SECONDS OF FREEDOM`;
  splashSound(event.impact);
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2,
      power = 3 + Math.random() * event.impact * 0.7;
    emit(
      rider.x + Math.cos(a),
      rider.y - 0.3,
      rider.z + Math.sin(a),
      Math.cos(a) * power,
      2 + Math.random() * 7,
      Math.sin(a) * power,
      0.15 + Math.random() * 0.45,
      0.65 + Math.random() * 1.0,
    );
  }
}
function updateParticles(dt) {
  if (!rider.air && started && rider.speed > 2) {
    const amount = Math.ceil(rider.speed * dt * (rider.boosting ? 13 : 8));
    const sin = Math.sin(rider.heading),
      cos = Math.cos(rider.heading);
    for (let i = 0; i < amount; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const spread = (2 + Math.random() * 4) * Math.min(rider.speed / 20, 1.5);
      const back = 2 + Math.random() * 2;
      emit(
        rider.x + sin * 1.3 + cos * side * 0.7,
        rider.y - 0.25,
        rider.z + cos * 1.3 - sin * side * 0.7,
        sin * back + cos * side * spread,
        1 + Math.random() * rider.speed * 0.11,
        cos * back - sin * side * spread,
        0.1 + Math.random() * 0.25,
        0.5 + Math.random() * 0.8,
      );
    }
  }
  for (let i = 0; i < particleCount; i++) {
    const k = i * 3;
    if (particleLife[i] > 0) {
      particleLife[i] -= dt;
      particleVelocity[k + 1] -= 9.8 * dt;
      particlePositions[k] += particleVelocity[k] * dt;
      particlePositions[k + 1] += particleVelocity[k + 1] * dt;
      particlePositions[k + 2] += particleVelocity[k + 2] * dt;
      particleAlpha[i] =
        Math.max(0, particleLife[i] / particleMaxLife[i]) * 0.85;
    } else particleAlpha[i] = 0;
  }
  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.aSize.needsUpdate = true;
  particleGeometry.attributes.aAlpha.needsUpdate = true;
}
function updateWake(dt) {
  wakeTimer += dt;
  if (started && !rider.air && rider.speed > 3 && wakeTimer > 0.045) {
    wakeSamples.unshift({
      x: rider.x + Math.sin(rider.heading) * 2,
      z: rider.z + Math.cos(rider.heading) * 2,
      h: rider.heading,
      t: time,
    });
    if (wakeSamples.length > wakeCount) wakeSamples.pop();
    wakeTimer = 0;
  }
  while (wakeSamples.length && time - wakeSamples.at(-1).t > 6)
    wakeSamples.pop();
  for (let i = 0; i < wakeSamples.length; i++) {
    const p = wakeSamples[i],
      age = time - p.t;
    if (i > 0) {
      const n = (i - 1) * 2,
        offset = (i - 1) * 6;
      // Preserve old foam without drawing a ribbon across a jump or a stop.
      if (wakeSamples[i - 1].t - p.t > 0.18)
        wakeGeometry.index.array.fill(n, offset, offset + 6);
      else
        wakeGeometry.index.array.set(
          [n, n + 1, n + 2, n + 1, n + 3, n + 2],
          offset,
        );
    }
    const width = 0.8 + age * 2.3;
    for (let side = 0; side < 2; side++) {
      const idx = i * 2 + side,
        s = side ? 1 : -1;
      const x = p.x + Math.cos(p.h) * width * s,
        z = p.z - Math.sin(p.h) * width * s;
      wakePositions[idx * 3] = x;
      wakePositions[idx * 3 + 1] = waterAt(x, z, time).height + 0.065;
      wakePositions[idx * 3 + 2] = z;
      wakeUV[idx * 2] = side;
      wakeUV[idx * 2 + 1] = p.t * 3;
      wakeAges[idx] = age;
    }
  }
  wakeGeometry.setDrawRange(0, Math.max(0, wakeSamples.length - 1) * 6);
  wakeGeometry.attributes.position.needsUpdate = true;
  wakeGeometry.attributes.uv.needsUpdate = true;
  wakeGeometry.attributes.aAge.needsUpdate = true;
  wakeGeometry.index.needsUpdate = true;
}
function updateGates(previousX, previousZ) {
  for (const gate of gateGroups) {
    gate.position.y =
      waterAt(gate.position.x, gate.position.z, time).height * 0.55;
    gate.rotation.z = Math.sin(time * 1.5 + gate.userData.index) * 0.025;
    const gz = gate.position.z;
    if (
      !gate.userData.passed &&
      (previousZ - gz) * (rider.z - gz) <= 0 &&
      previousZ !== rider.z
    ) {
      const mix = (gz - previousZ) / (rider.z - previousZ);
      const crossX = previousX + (rider.x - previousX) * mix;
      if (Math.abs(crossX - gate.position.x) < 10) {
        gate.userData.passed = true;
        rider.gates++;
        rider.score += 500;
        rider.boost = Math.min(1, rider.boost + 0.3);
        notify("NICE LINE. +500 / BOOST TOPPED UP");
        splashSound(4);
      }
    }
    if (rider.z < gz - 100)
      positionGate(gate, gate.userData.index + gateGroups.length);
  }
  const next = gateGroups
    .filter((g) => !g.userData.passed && g.position.z < rider.z + 10)
    .sort((a, b) => b.position.z - a.position.z)[0];
  if (next) {
    const distance = Math.round(
      Math.hypot(next.position.x - rider.x, next.position.z - rider.z),
    );
    $("objective-text").textContent =
      distance < 1500
        ? `Next blue gate ${distance} m / the rest is up to you.`
        : "The ocean is yours. R to return to the gates.";
  }
}
function updateHUD() {
  $("speed").textContent = Math.round(rider.speed * 3.6);
  $("speed-status").textContent = rider.air
    ? "AIRBORNE"
    : rider.boosting
      ? "FULL SEND"
      : rider.speed > 22
        ? "ON PLANE"
        : rider.speed > 2
          ? "CRUISING"
          : "IDLE";
  $("score").textContent = String(rider.score).padStart(5, "0");
  $("best-air").textContent = rider.bestAir.toFixed(1);
  $("gates").textContent = String(rider.gates).padStart(2, "0");
  $("boost-fill").style.width = `${rider.boost * 100}%`;
  $("boost-fill").parentElement.classList.toggle("boosting", rider.boosting);
  $("boost-percent").textContent = `${Math.round(rider.boost * 100)}%`;
  if (rider.air) {
    $("air-callout").classList.add("active");
    $("air-label").textContent = rider.boosting ? "FULL SEND" : "OFF THE CLOCK";
    $("air-height").innerHTML =
      `${Math.max(0, rider.y - waterAt(rider.x, rider.z, time).height - 0.58).toFixed(1)}<small>M</small>`;
    $("air-detail").textContent = "LESS SEA. MORE SKY.";
  } else if (airDisplayTime <= 0) $("air-callout").classList.remove("active");
}

function updateCamera(dt) {
  const f = forward.set(-Math.sin(rider.heading), 0, -Math.cos(rider.heading));
  if (!started) {
    const t = time * 0.12;
    // A three-quarter view leaves the left side clear for the title.
    const portrait = innerWidth / innerHeight < 0.8;
    camera.position.set(
      rider.x - (portrait ? 8 : 10) + Math.sin(t) * 1.5,
      5.7,
      rider.z + 12,
    );
    desiredLook.set(
      rider.x + (portrait ? 1 : -5.8),
      portrait ? 4 : 0.7,
      rider.z - 4,
    );
    camera.lookAt(desiredLook);
    return;
  }
  const speedFraction = rider.speed / 46;
  const sea = waterAt(rider.x, rider.z, time).height;
  const height = Math.max(sea + 5.2, rider.y + 3.6);
  cameraTarget.set(
    rider.x - f.x * (9.5 + speedFraction * 1.8),
    height + speedFraction * 0.4,
    rider.z - f.z * (9.5 + speedFraction * 1.8),
  );
  camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 4));
  // Prevent the chase camera dipping through a crest during a landing.
  camera.position.y = Math.max(
    camera.position.y,
    waterAt(camera.position.x, camera.position.z, time).height + 2,
  );
  desiredLook.set(
    rider.x + f.x * 12,
    rider.y + 1.3 - landingKick * 0.7,
    rider.z + f.z * 12,
  );
  lookTarget.lerp(desiredLook, 1 - Math.exp(-dt * 5));
  if (!reducedMotion)
    camera.position.y += Math.sin(time * 37) * landingKick * 0.045;
  camera.lookAt(lookTarget);
  const fov =
    58 + (reducedMotion ? 0 : speedFraction * 9 + (rider.boosting ? 4 : 0));
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}
function updateAudio() {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const audible = soundOn && started && !paused;
  engineGain.gain.setTargetAtTime(
    audible ? 0.018 + rider.speed * 0.0012 : 0,
    now,
    0.12,
  );
  engineOscillator.frequency.setTargetAtTime(
    35 + rider.speed * 2.1 + (rider.air ? 20 : 0),
    now,
    0.08,
  );
  audioFilter.frequency.setTargetAtTime(180 + rider.speed * 13, now, 0.1);
  if (landingKick < 0.2)
    waterGain.gain.setTargetAtTime(
      audible ? 0.015 + rider.speed * 0.0022 : 0,
      now,
      0.2,
    );
  if (!audible) waterGain.gain.setTargetAtTime(0, now, 0.08);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  spray.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio();
  touchMode = matchMedia("(pointer: coarse)").matches;
  if (started) $("touch-controls").hidden = !touchMode;
}
window.addEventListener("resize", resize);
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  if (started) setPaused(true);
  $("error").hidden = false;
  $("error").querySelector("h2").textContent = "The graphics took a breather.";
  $("error").querySelector("p").textContent =
    "Please reload the page to get back on the water.";
});

function frame(timestamp) {
  requestAnimationFrame(frame);
  const dt = Math.min((timestamp - (lastTimestamp || timestamp)) / 1000, 0.05);
  lastTimestamp = timestamp;
  if (!paused) {
    time += dt;
    if (started) {
      readInput();
      accumulator += dt;
      const oldX = rider.x,
        oldZ = rider.z;
      while (accumulator >= 1 / 120) {
        const events = stepRider(rider, input, 1 / 120, time - accumulator);
        for (const event of events) {
          if (event.type === "land") landing(event);
          if (event.type === "launch") airDisplayTime = 0;
        }
        accumulator -= 1 / 120;
      }
      updateGates(oldX, oldZ);
      landingKick = Math.max(0, landingKick - dt * 2.6);
      airDisplayTime -= dt;
      toastTime -= dt;
      if (toastTime <= 0) $("toast").classList.remove("visible");
      hudTimer += dt;
      if (hudTimer > 0.07) {
        updateHUD();
        hudTimer = 0;
      }
    } else {
      rider.y = waterAt(rider.x, rider.z, time).height + 0.58;
      const water = waterAt(rider.x, rider.z, time);
      rider.pitch = -Math.atan(water.dz) * 0.7;
      rider.bank = Math.sin(time * 0.8) * 0.035;
      gateGroups.forEach((g) => {
        g.position.y = waterAt(g.position.x, g.position.z, time).height * 0.55;
      });
    }
    ski.position.set(rider.x, rider.y - 0.18 - landingKick * 0.13, rider.z);
    ski.rotation.set(rider.pitch, rider.heading, rider.bank, "YXZ");
    riderBody.rotation.z = rider.bank * -0.35;
    riderBody.rotation.x = rider.boosting ? -0.1 : 0;
    updateParticles(dt);
    updateWake(dt);
    oceanMaterial.uniforms.uTime.value = time;
    ocean.position.x = Math.round(rider.x / 50) * 50;
    ocean.position.z = Math.round(rider.z / 50) * 50;
    // Recycle the remote coastline without placing obstacles in the freeride area.
    for (const island of islands.children) {
      if (island.position.z - rider.z > 400) island.position.z -= 2100;
      if (island.position.z - rider.z < -1800) island.position.z += 2100;
    }
    sky.position.copy(camera.position);
    updateCamera(dt);
  }
  updateAudio();
  renderer.render(scene, camera);
}

rider.y = waterAt(rider.x, rider.z, 0).height + 0.58;
ski.position.set(rider.x, rider.y, rider.z);
updateCamera(1);
renderer.compile(scene, camera);
requestAnimationFrame(frame);
$("loading").classList.add("finished");
setTimeout(() => {
  $("loading").hidden = true;
}, 650);

// Read-only state for browser smoke tests and embedding diagnostics.
window.__WAKE_RUN__ = {
  get state() {
    return { ...rider, started, paused, time, soundOn };
  },
  get renderer() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  },
};
