import * as THREE from 'three';
import { waveGLSL, waveHeight, SHORE_X } from './waves.js';

export const PALETTE = {
  skyTop: new THREE.Color('#3f8fe0'),
  skyMid: new THREE.Color('#8cc4f0'),
  horizon: new THREE.Color('#ffd6b0'),
  sun: new THREE.Color('#fff0c8'),
  deep: new THREE.Color('#05608f'),
  crest: new THREE.Color('#12b5c9'),
  shallow: new THREE.Color('#5fe3cf'),
  foam: new THREE.Color('#ffffff'),
};

export const SUN_DIR = new THREE.Vector3(0.55, 0.28, -1).normalize();
const FOG_NEAR = 120;
const FOG_FAR = 420;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: PALETTE.skyTop },
      uMid: { value: PALETTE.skyMid },
      uHorizon: { value: PALETTE.horizon },
      uSun: { value: PALETTE.sun },
      uSunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, y));
        col = mix(col, uTop, smoothstep(0.15, 0.7, y));
        col = mix(col, uHorizon * 1.02, smoothstep(0.0, -0.1, y));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.45 + pow(s, 6.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

function makeOcean() {
  const SIZE = 520;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 260, 260);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: PALETTE.deep },
    uCrest: { value: PALETTE.crest },
    uShallow: { value: PALETTE.shallow },
    uFoam: { value: PALETTE.foam },
    uTop: { value: PALETTE.skyMid },
    uHorizon: { value: PALETTE.horizon },
    uSun: { value: PALETTE.sun },
    uSunDir: { value: SUN_DIR },
    uFogNear: { value: FOG_NEAR },
    uFogFar: { value: FOG_FAR },
    uShoreX: { value: SHORE_X },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying float vH;
      ${waveGLSL}
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float e = 0.35;
        float h = waveH(wp.xz, uTime);
        float hx = waveH(wp.xz + vec2(e, 0.0), uTime);
        float hz = waveH(wp.xz + vec2(0.0, e), uTime);
        vN = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
        wp.y = h; vH = h; vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFogNear, uFogFar, uShoreX;
      uniform vec3 uDeep, uCrest, uShallow, uFoam, uTop, uHorizon, uSun, uSunDir;
      varying vec3 vWorld; varying vec3 vN; varying float vH;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main(){
        vec2 p = vWorld.xz; float t = uTime;
        float dist = length(cameraPosition - vWorld);
        float detail = 1.0 - smoothstep(30.0, 160.0, dist);
        vec3 n = vN;
        n.x += (sin(p.x*1.7 + p.y*0.6 + t*2.3)*0.06 + sin(p.x*3.1 - p.y*2.3 + t*3.1)*0.04 + sin(-p.x*0.9 + p.y*4.3 + t*2.7)*0.03) * detail;
        n.z += (sin(p.y*1.9 - p.x*0.7 + t*2.1)*0.06 + sin(p.y*3.7 + p.x*1.3 + t*3.4)*0.04 + sin(p.y*0.8 + p.x*3.9 - t*2.2)*0.03) * detail;
        n = normalize(n);
        vec3 V = normalize(cameraPosition - vWorld);
        float ndv = max(dot(n, V), 0.0);
        float fres = 0.03 + 0.5 * pow(1.0 - ndv, 5.0);

        float shore = smoothstep(uShoreX + 34.0, uShoreX + 2.0, vWorld.x);
        vec3 base = mix(uDeep, uCrest, clamp(vH * 0.3 + 0.35, 0.0, 1.0));
        base = mix(base, uShallow, shore * 0.85);
        // fake subsurface glow on the sun-facing backs of swells
        base += uCrest * 0.35 * max(0.0, vH) * pow(max(dot(-V, uSunDir), 0.0), 2.0);

        vec3 R = reflect(-V, n);
        vec3 sky = mix(uHorizon, uTop, smoothstep(0.0, 0.35, R.y));
        vec3 col = mix(base, sky, fres);
        float spec = pow(max(dot(R, uSunDir), 0.0), 400.0) * 3.0 + pow(max(dot(R, uSunDir), 0.0), 30.0) * 0.08;
        col += uSun * spec;

        // foam: on crests, plus the wash where waves meet the sand
        float nz = noise(p * 0.45 + vec2(t * 0.3, -t * 0.2)) * 0.6 + noise(p * 1.7 - t * 0.4) * 0.4;
        float crestFoam = smoothstep(2.0, 2.5, vH + nz * 0.6) * 0.65 * (0.4 + 0.6 * detail);
        float wash = smoothstep(uShoreX + 7.0, uShoreX + 1.0, vWorld.x) * smoothstep(0.35, 0.65, nz + 0.25 * sin(vWorld.x * 0.8 + t * 1.3));
        float foam = max(crestFoam, wash);
        col = mix(col, uFoam, foam);

        float fogF = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uHorizon, fogF);
        float alpha = mix(0.78, 1.0, max(max(fres * 1.5, foam), fogF));
        alpha = mix(alpha, 0.6, shore * (1.0 - foam));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.step = SIZE / 260;
  return mesh;
}

function makeBeach() {
  // A long strip, uniform along Z so it can simply slide with the player.
  const W = 260, Lz = 900;
  const geo = new THREE.PlaneGeometry(W, Lz, 130, 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const wet = new THREE.Color('#d9b980'), sand = new THREE.Color('#f7dfae'), grass = new THREE.Color('#8fd16f'), deep = new THREE.Color('#5aa860');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (SHORE_X + 10 - W / 2); // world x
    const d = SHORE_X - x; // distance inland
    let y = d * 0.11;
    if (d > 26) y += (d - 26) * 0.12;
    if (d > 60) y += (d - 60) * 0.25;
    pos.setX(i, x);
    pos.setY(i, y);
    if (d < 4) c.copy(wet).lerp(sand, Math.max(0, d / 4));
    else if (d < 26) c.copy(sand);
    else c.copy(sand).lerp(grass, Math.min(1, (d - 26) / 5)).lerp(deep, Math.max(0, Math.min(1, (d - 40) / 60)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
}

export function beachHeight(x) {
  const d = SHORE_X - x;
  let y = d * 0.11;
  if (d > 26) y += (d - 26) * 0.12;
  if (d > 60) y += (d - 60) * 0.25;
  return y;
}

const M = {
  trunk: new THREE.MeshStandardMaterial({ color: '#9a6b45', roughness: 0.9 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#3fb85a', roughness: 0.7, side: THREE.DoubleSide }),
  leaf2: new THREE.MeshStandardMaterial({ color: '#61cf5f', roughness: 0.7, side: THREE.DoubleSide }),
  roof: ['#e8586a', '#f08a4b', '#4a8fd8', '#7a5cc9', '#2fa79a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
  wall: ['#fff4e0', '#ffd6e0', '#ffe9a8', '#cdf2e6', '#d4e8ff'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })),
  window: new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb84a', emissiveIntensity: 0.8 }),
  rock: new THREE.MeshStandardMaterial({ color: '#8d8a99', roughness: 0.9, flatShading: true }),
  white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
  red: new THREE.MeshStandardMaterial({ color: '#ef4d5a', roughness: 0.6 }),
  hill: new THREE.MeshStandardMaterial({ color: '#6cbf62', roughness: 1, flatShading: true }),
  umbrella: ['#ff6f91', '#ffc75f', '#4fc3f7', '#9bde7e'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide })),
  sail: new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.7, side: THREE.DoubleSide }),
  hull: new THREE.MeshStandardMaterial({ color: '#c2563f', roughness: 0.7 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffd35a', emissive: '#ff9f1a', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.2 }),
};

function palm() {
  const g = new THREE.Group();
  const h = rand(7, 11);
  const lean = rand(-0.35, 0.35);
  const segs = 6;
  let x = 0, y = 0;
  let top;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - t * 0.07, 0.26 - t * 0.07, h / segs + 0.05, 7), M.trunk);
    const nx = Math.sin(lean) * h * (t + 1 / segs) ** 2 * 0.5;
    s.position.set((x + nx) / 2, y + h / segs / 2, 0);
    s.rotation.z = -(nx - x) / (h / segs);
    g.add(s);
    x = nx; y += h / segs;
  }
  top = new THREE.Vector3(x, y, 0);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.2, 4, 1, true), i % 2 ? M.leaf : M.leaf2);
    leaf.scale.set(1, 1, 0.18);
    leaf.geometry.translate(0, 2.1, 0);
    leaf.position.copy(top);
    leaf.rotation.set(0, (i / n) * Math.PI * 2 + rand(-0.2, 0.2), 0);
    leaf.rotateX(1.2 + rand(-0.15, 0.25));
    g.add(leaf);
  }
  const coco = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), M.trunk);
  coco.position.copy(top).add(new THREE.Vector3(0.2, -0.3, 0.1));
  g.add(coco);
  return g;
}

function hut() {
  const g = new THREE.Group();
  const w = rand(4, 6), d = rand(4, 5), h = rand(3, 4);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pick(M.wall));
  wall.position.y = h / 2;
  g.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.82, 2.4, 4), pick(M.roof));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 1.2;
  g.add(roof);
  for (const z of [-d / 4, d / 4]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), M.window);
    win.position.set(w / 2 + 0.01, h * 0.55, z);
    win.rotation.y = Math.PI / 2;
    g.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), M.roof[2]);
  door.position.set(w / 2 + 0.01, 0.85, 0);
  door.rotation.y = Math.PI / 2;
  g.add(door);
  g.rotation.y = rand(-0.3, 0.3);
  return g;
}

function umbrella() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), M.white);
  pole.position.y = 1.2;
  g.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8, 1, true), pick(M.umbrella));
  top.position.y = 2.4;
  g.add(top);
  g.rotation.z = rand(-0.15, 0.15);
  return g;
}

function lighthouse() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const r0 = 1.8 - i * 0.16, r1 = 1.8 - (i + 1) * 0.16;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 2.6, 14), i % 2 ? M.red : M.white);
    s.position.y = i * 2.6 + 1.3;
    g.add(s);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 10), M.window);
  lamp.position.y = 16.2;
  g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.3, 10), M.red);
  cap.position.y = 17.4;
  g.add(cap);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.25, depthWrite: false }));
  glow.position.y = 16.2;
  g.add(glow);
  return g;
}

function rock() {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1, 2.6), 0), M.rock);
  m.scale.set(1, rand(0.5, 0.9), rand(0.8, 1.3));
  m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  return m;
}

function hill() {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(25, 45), 1), M.hill);
  m.scale.set(1, rand(0.3, 0.5), rand(1, 1.6));
  return m;
}

function boat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 5), M.hull);
  hull.position.y = 0.2;
  g.add(hull);
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(0, 6); sh.lineTo(0, 0.2); sh.lineTo(3.2, 0.2); sh.lineTo(0, 6);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.sail);
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0, 0.7, 1.4);
  g.add(sail);
  return g;
}

function buoy() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.2, 10), M.red);
  g.add(b);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.3, 10), M.white);
  band.position.y = 0.2;
  g.add(band);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), M.window);
  light.position.y = 0.8;
  g.add(light);
  return g;
}

function cloud() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#fff6f0', fog: false });
  const mat2 = new THREE.MeshBasicMaterial({ color: '#ffe3d6', fog: false });
  const n = 5 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(rand(8, 16), 10, 8), i % 3 ? mat : mat2);
    s.position.set(rand(-22, 22), rand(-3, 6), rand(-8, 8));
    s.scale.y = 0.65;
    g.add(s);
  }
  return g;
}

export function createWorld(scene) {
  const sky = makeSky();
  scene.add(sky);
  const ocean = makeOcean();
  scene.add(ocean);
  const beach = makeBeach();
  scene.add(beach);

  const SPAN = 760;
  const items = []; // { obj, z, x, y, kind }
  const add = (obj, x, z, yOff = 0, kind = 'static') => {
    obj.position.set(x, 0, z);
    scene.add(obj);
    const it = { obj, x, z, yOff, kind, phase: Math.random() * 10 };
    items.push(it);
    return it;
  };
  const along = () => rand(-SPAN / 2, SPAN / 2);

  for (let i = 0; i < 55; i++) add(palm(), SHORE_X - rand(6, 30), along());
  for (let i = 0; i < 20; i++) add(hut(), SHORE_X - rand(22, 34), along());
  for (let i = 0; i < 16; i++) add(umbrella(), SHORE_X - rand(4, 16), along());
  for (let i = 0; i < 22; i++) add(rock(), SHORE_X + rand(-3, 5), along(), -0.5);
  for (let i = 0; i < 18; i++) add(hill(), SHORE_X - rand(120, 190), along(), -14);
  add(lighthouse(), SHORE_X - 8, -200);
  add(lighthouse(), SHORE_X - 10, 180);
  for (let i = 0; i < 10; i++) add(boat(), rand(110, 260), along(), 0, 'float');
  for (let i = 0; i < 14; i++) add(buoy(), rand(-35, 70), along(), -0.2, 'float');
  for (const it of items) if (it.kind === 'static') it.obj.position.y = beachHeight(it.x) + it.yOff;

  // Golden hoops hang above the water: fly through them mid-jump for a bonus.
  const hoops = [];
  const hoopGeo = new THREE.TorusGeometry(2.4, 0.22, 10, 32);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(hoopGeo, M.gold);
    const it = add(m, rand(-30, 60), along(), 0, 'hoop');
    it.height = rand(4, 10);
    it.taken = false;
    hoops.push(it);
  }

  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const c = cloud();
    const a = rand(-Math.PI, Math.PI);
    const r = rand(500, 700);
    c.position.set(Math.cos(a) * r, rand(70, 190), Math.sin(a) * r);
    c.lookAt(0, c.position.y, 0);
    clouds.add(c);
  }
  scene.add(clouds);

  function update(t, player, camera) {
    ocean.material.uniforms.uTime.value = t;
    const step = ocean.userData.step;
    ocean.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
    sky.position.copy(camera.position);
    clouds.position.set(camera.position.x, 0, camera.position.z);
    clouds.rotation.y = t * 0.002;
    beach.position.z = player.z;

    for (const it of items) {
      let moved = false;
      while (it.z - player.z > SPAN / 2) { it.z -= SPAN; moved = true; }
      while (it.z - player.z < -SPAN / 2) { it.z += SPAN; moved = true; }
      if (moved && it.kind === 'hoop') {
        it.x = rand(-30, 60); it.height = rand(4, 10); it.taken = false; it.obj.visible = true; it.obj.scale.setScalar(1);
      }
      it.obj.position.z = it.z;
      it.obj.position.x = it.x;
      if (it.kind === 'float') {
        it.obj.position.y = waveHeight(it.x, it.z, t) + it.yOff;
        it.obj.rotation.z = Math.sin(t * 1.3 + it.phase) * 0.12;
        it.obj.rotation.x = Math.cos(t * 1.1 + it.phase) * 0.1;
      } else if (it.kind === 'hoop') {
        it.obj.position.y = it.height + Math.sin(t * 1.5 + it.phase) * 0.3;
        it.obj.rotation.y = Math.sin(t * 0.7 + it.phase) * 0.25;
        if (it.taken) {
          const s = Math.max(0, it.obj.scale.x - 0.05);
          it.obj.scale.setScalar(s);
          if (s === 0) it.obj.visible = false;
        }
      }
    }
  }

  return { update, hoops };
}
