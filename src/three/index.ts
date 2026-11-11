// three.js scenes, loaded lazily: the silicon crystal and the exploded solar cell.
import * as THREE from 'three';

const SI_GAP_NM = 1107;

// ---------------------------------------------------------------- shared helpers
function wlColor(nm: number): THREE.Color {
  let r = 0, g = 0, b = 0;
  if (nm > 780) return new THREE.Color(0.75, 0.18, 0.3);
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

function spriteTexture(kind: 'glow' | 'ring'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  if (kind === 'glow') {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  } else {
    x.strokeStyle = '#fff'; x.lineWidth = 14; x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Stage {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; pivot: THREE.Group;
  el: HTMLElement; visible: () => boolean; userActive: () => boolean;
}

function makeStage(el: HTMLElement, opts: { fov?: number; camPos: THREE.Vector3; target?: THREE.Vector3; onFrame: (dt: number, t: number) => void; autoRotate?: number; tilt?: [number, number] }): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 40, 1, 0.1, 100);
  camera.position.copy(opts.camPos);
  camera.lookAt(opts.target ?? new THREE.Vector3());
  const pivot = new THREE.Group();
  scene.add(pivot);

  const hint = document.createElement('div');
  hint.className = 'stage-hint';
  hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Swipe sideways to turn' : 'Drag to turn';
  el.appendChild(hint);

  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the subject framed on tall (phone) stages
    camera.fov = (opts.fov ?? 40) * (w / h < 1.1 ? 1.25 : 1);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(el);
  resize();

  // drag to rotate (horizontal drags on touch; vertical is left for page scrolling)
  let dragging = false, lx = 0, ly = 0, lastInput = -1e9;
  const [tMin, tMax] = opts.tilt ?? [-0.9, 0.9];
  el.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; lastInput = performance.now(); });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    pivot.rotation.y += dx * 0.008;
    if (e.pointerType === 'mouse') pivot.rotation.x = Math.min(tMax, Math.max(tMin, pivot.rotation.x + dy * 0.006));
    lastInput = performance.now();
    hint.style.opacity = '0';
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('pointerleave', end);

  let visible = false, raf = 0, last = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loop = (t: number) => {
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
    if (!dragging && !reduce && opts.autoRotate && performance.now() - lastInput > 3000) pivot.rotation.y += dt * opts.autoRotate;
    opts.onFrame(dt, t / 1000);
    renderer.render(scene, camera);
    if (visible) raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver((es) => {
    for (const e of es) {
      if (e.isIntersecting && !visible) { visible = true; last = 0; raf = requestAnimationFrame(loop); }
      else if (!e.isIntersecting && visible) { visible = false; cancelAnimationFrame(raf); }
    }
  }, { rootMargin: '50px' }).observe(el);

  return { renderer, scene, camera, pivot, el, visible: () => visible, userActive: () => dragging };
}

function makeLabel(el: HTMLElement, text: string) {
  const d = document.createElement('div');
  d.className = 'stage-label'; d.textContent = text; d.style.opacity = '0';
  el.appendChild(d);
  return d;
}
function placeLabel(lab: HTMLElement, world: THREE.Vector3, st: Stage, show: boolean) {
  const v = world.clone().project(st.camera);
  const w = st.el.clientWidth, h = st.el.clientHeight;
  lab.style.left = `${((v.x + 1) / 2) * w}px`;
  lab.style.top = `${((1 - v.y) / 2) * h}px`;
  lab.style.opacity = show && v.z < 1 ? '1' : '0';
}

// ---------------------------------------------------------------- silicon lattice
export function mountLattice(el: HTMLElement, controls: HTMLElement, status: HTMLElement) {
  const S = 2.3; // scene units per lattice constant
  const N = 2;
  const pts: THREE.Vector3[] = [];
  const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
  const seen = new Set<string>();
  const fcc = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]];
  for (let i = -1; i <= N; i++) for (let j = -1; j <= N; j++) for (let k = -1; k <= N; k++)
    for (const b of fcc) for (const o of [0, 0.25]) {
      const v = new THREE.Vector3(i + b[0] + o, j + b[1] + o, k + b[2] + o);
      if (v.x < -1e-6 || v.y < -1e-6 || v.z < -1e-6 || v.x > N + 1e-6 || v.y > N + 1e-6 || v.z > N + 1e-6) continue;
      const kk = key(v); if (seen.has(kk)) continue; seen.add(kk); pts.push(v);
    }
  const bondLen = Math.sqrt(3) / 4;
  let bonds: [number, number][] = [];
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++)
    if (Math.abs(pts[a].distanceTo(pts[b]) - bondLen) < 1e-3) bonds.push([a, b]);
  // drop atoms with a single bond (corner stragglers), then rebuild
  const deg = new Array(pts.length).fill(0);
  bonds.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  const keepIdx = pts.map((_, i) => i).filter((i) => deg[i] >= 2);
  const remap = new Map(keepIdx.map((o, n) => [o, n]));
  const atoms = keepIdx.map((i) => pts[i].clone().subScalar(N / 2).multiplyScalar(S));
  bonds = bonds.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!]);

  const st = makeStage(el, { camPos: new THREE.Vector3(0, 0.6, 9.2), onFrame: (dt, t) => frame(dt, t), autoRotate: 0.12 });
  st.pivot.rotation.set(0.35, 0.6, 0);
  const { scene, pivot } = st;
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2238, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(4, 6, 8); scene.add(dl);

  const atomGeo = new THREE.SphereGeometry(0.2, 24, 16);
  const atomMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.35, metalness: 0.35 });
  const atomMesh = new THREE.InstancedMesh(atomGeo, atomMat, atoms.length);
  const m4 = new THREE.Matrix4();
  atoms.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); atomMesh.setMatrixAt(i, m4); });
  pivot.add(atomMesh);

  const bondGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 10, 1, true);
  const bondMat = new THREE.MeshStandardMaterial({ color: 0x5d6680, roughness: 0.6 });
  const bondMesh = new THREE.InstancedMesh(bondGeo, bondMat, bonds.length);
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  bonds.forEach(([a, b], i) => {
    const A = atoms[a], B = atoms[b];
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const dir = B.clone().sub(A); const len = dir.length(); dir.normalize();
    q.setFromUnitVectors(up, dir); sc.set(1, len, 1);
    m4.compose(mid, q, sc); bondMesh.setMatrixAt(i, m4);
  });
  pivot.add(bondMesh);

  // two bonding electrons per bond
  const slotPos = (bi: number, s: number) => { const [a, b] = bonds[bi]; return atoms[a].clone().lerp(atoms[b], s === 0 ? 0.36 : 0.64); };
  const elGeo = new THREE.SphereGeometry(0.075, 14, 10);
  const elMat = new THREE.MeshStandardMaterial({ color: 0x4f86ff, emissive: 0x2050d0, emissiveIntensity: 0.9, roughness: 0.3 });
  const elMesh = new THREE.InstancedMesh(elGeo, elMat, bonds.length * 2);
  const slotOn: boolean[] = new Array(bonds.length * 2).fill(true);
  const slotOverride = new Map<number, THREE.Vector3>(); // slots temporarily animated
  const writeSlot = (k: number) => {
    const p = slotOverride.get(k) ?? slotPos(k >> 1, k & 1);
    m4.compose(p, q.identity(), sc.setScalar(slotOn[k] || slotOverride.has(k) ? 1 : 0));
    elMesh.setMatrixAt(k, m4);
  };
  for (let k = 0; k < bonds.length * 2; k++) writeSlot(k);
  pivot.add(elMesh);

  const glowTex = spriteTexture('glow'), ringTex = spriteTexture('ring');
  const neighbours = bonds.map(([a, b]) => bonds.map((bb, j) => j).filter((j) => { const [c, d] = bonds[j]; return (c === a || c === b || d === a || d === b); }));

  // event objects
  interface Pair {
    stage: 'in' | 'pass' | 'free' | 'recombine' | 'done'; t: number; nm: number; hot: number;
    start: THREE.Vector3; target: THREE.Vector3; end: THREE.Vector3; bond: number; holeSlot: number;
    photon: THREE.Line; head: THREE.Sprite; e?: THREE.Group; hole?: THREE.Sprite; flash?: THREE.Sprite;
    pos: THREE.Vector3; vel: THREE.Vector3; hopT: number; hop?: { from: number; to: number; t: number };
  }
  const pairs: Pair[] = [];
  const sparks: { s: THREE.Sprite; t: number; v: THREE.Vector3 }[] = [];
  const box = atoms.reduce((b, p) => b.expandByPoint(p), new THREE.Box3());
  const labE = makeLabel(el, 'free electron');
  const labH = makeLabel(el, 'hole');
  const labP = makeLabel(el, 'photon');

  const say = (s: string) => { status.textContent = s; };

  const fire = (nm: number) => {
    // remove finished
    for (let i = pairs.length - 1; i >= 0; i--) if (pairs[i].stage === 'done') pairs.splice(i, 1);
    if (pairs.filter((p) => p.stage !== 'done').length >= 3) { say('The crystal is busy. Wait a moment for a pair to recombine.'); return; }
    const used = new Set(pairs.map((p) => p.bond));
    const centre = new THREE.Vector3();
    const cands = bonds.map((_, i) => i).filter((i) => !used.has(i)).sort((a, b) => slotPos(a, 0).distanceTo(centre) - slotPos(b, 0).distanceTo(centre)).slice(0, 12);
    const bond = cands[(Math.random() * cands.length) | 0];
    const holeSlot = bond * 2 + ((Math.random() * 2) | 0);
    const target = slotPos(bond, holeSlot & 1);
    // photon comes from the viewer's upper right, in crystal coordinates
    const dirWorld = new THREE.Vector3(0.55, 0.45, 1).normalize();
    const inv = pivot.quaternion.clone().invert();
    const dir = dirWorld.applyQuaternion(inv);
    const start = target.clone().addScaledVector(dir, 9);
    const end = target.clone().addScaledVector(dir, -9);
    const col = wlColor(Math.min(nm, 800));
    const geo = new THREE.BufferGeometry().setFromPoints(new Array(60).fill(0).map(() => new THREE.Vector3()));
    const photon = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true }));
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    head.scale.setScalar(0.45);
    pivot.add(photon, head);
    const absorbed = nm < SI_GAP_NM;
    const eV = 1239.84 / nm;
    pairs.push({ stage: absorbed ? 'in' : 'pass', t: 0, nm, hot: Math.max(0, eV - 1.12), start, target, end, bond, holeSlot, photon, head, pos: target.clone(), vel: new THREE.Vector3(), hopT: 0 });
    if (!absorbed) say(`An infrared photon carries only ${eV.toFixed(2)} eV, less than the 1.12 eV needed to break a bond. It passes straight through. To this light, silicon is transparent.`);
    else say(`A ${nm < 500 ? 'blue' : 'red'} photon (${eV.toFixed(2)} eV) is on its way in…`);
  };

  controls.querySelectorAll<HTMLButtonElement>('[data-fire]').forEach((b) => b.addEventListener('click', () => fire(+b.dataset.fire!)));

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const photonPts = (p: Pair, head: THREE.Vector3, dir: THREE.Vector3) => {
    const arr = (p.photon.geometry.attributes.position as THREE.BufferAttribute);
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    if (side.lengthSq() < 0.1) side.set(1, 0, 0);
    const lam = p.nm / 900;
    for (let i = 0; i < 60; i++) {
      const s = (i / 59) * 2.2;
      const env = Math.sin((Math.PI * i) / 59);
      tmp.copy(head).addScaledVector(dir, -s).addScaledVector(side, 0.16 * env * Math.sin((2 * Math.PI * s) / lam + p.t * 20));
      arr.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    arr.needsUpdate = true;
    p.head.position.copy(head);
  };

  const spark = (at: THREE.Vector3, color: number, speed = 0.8) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(at); s.scale.setScalar(0.35);
    pivot.add(s);
    sparks.push({ s, t: 0, v: new THREE.Vector3().randomDirection().multiplyScalar(speed) });
  };

  const disposeObj = (o: THREE.Object3D) => { pivot.remove(o); o.traverse((c) => { const m = c as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); }); };

  let anyE: Pair | undefined;
  const frame = (dt: number, t: number) => {
    anyE = undefined;
    for (const p of pairs) {
      p.t += dt;
      if (p.stage === 'in' || p.stage === 'pass') {
        const dur = 1.0;
        const k = Math.min(1, p.t / dur);
        const dir = tmp2.copy(p.target).sub(p.start).normalize();
        const head = p.start.clone().lerp(p.target, k);
        if (p.stage === 'pass' && k >= 1) {
          const k2 = Math.min(1, (p.t - dur) / dur);
          head.copy(p.target).lerp(p.end, k2);
          if (k2 >= 1) { disposeObj(p.photon); disposeObj(p.head); p.stage = 'done'; continue; }
        }
        photonPts(p, head, dir);
        if (p.stage === 'in' && k >= 1) {
          // absorption: break the bond
          disposeObj(p.photon); disposeObj(p.head);
          slotOn[p.holeSlot] = false; writeSlot(p.holeSlot); elMesh.instanceMatrix.needsUpdate = true;
          const e = new THREE.Group();
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9cc0ff }));
          const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4f86ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          g.scale.setScalar(0.9); e.add(core, g); e.position.copy(p.target);
          const hole = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0xff5c95, transparent: true, depthWrite: false }));
          hole.scale.setScalar(0.32); hole.position.copy(p.target);
          const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3c0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          flash.position.copy(p.target);
          pivot.add(e, hole, flash);
          p.e = e; p.hole = hole; p.flash = flash;
          const speed = 1.0 + p.hot * 2.4;
          p.vel.randomDirection().multiplyScalar(speed);
          p.stage = 'free'; p.t = 0; p.hopT = 0.9;
          say(p.hot > 1
            ? `Absorbed! The blue photon brings ${(p.hot + 1.12).toFixed(1)} eV, far more than the 1.12 eV needed. The electron shoots off, then quickly slows as it shakes the crystal. The orange sparks are that surplus turning into heat. Meanwhile the hole (pink ring) moves as neighbouring electrons hop in.`
            : `Absorbed! The photon breaks a bond: one electron is now free (blue glow), and it leaves behind a hole (pink ring). The photon's extra ${p.hot.toFixed(1)} eV is shed as heat (orange sparks). Watch the hole move as neighbouring electrons hop into it.`);
        }
      }
      if (p.stage === 'free' || p.stage === 'recombine') {
        const e = p.e!, hole = p.hole!;
        if (p.flash) { const k = p.t / 0.5; p.flash.scale.setScalar(0.3 + 3 * k); (p.flash.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k); if (k >= 1) { disposeObj(p.flash); p.flash = undefined; } }
        if (p.stage === 'free') {
          // thermalisation: speed relaxes toward a slow thermal wander, giving off heat
          const target = 0.7;
          const sp = p.vel.length();
          const nsp = target + (sp - target) * Math.exp(-dt / 0.45);
          if (sp - target > 0.4 && Math.random() < dt * 30) spark(p.pos, 0xff9a3c, 0.6);
          p.vel.multiplyScalar(nsp / sp);
          if (Math.random() < dt * 2.2) p.vel.applyAxisAngle(tmp.randomDirection(), 0.6 + Math.random());
          p.pos.addScaledVector(p.vel, dt);
          for (const ax of ['x', 'y', 'z'] as const) {
            if (p.pos[ax] < box.min[ax]) { p.pos[ax] = box.min[ax]; p.vel[ax] *= -1; }
            if (p.pos[ax] > box.max[ax]) { p.pos[ax] = box.max[ax]; p.vel[ax] *= -1; }
          }
          if (p.t > 9) { p.stage = 'recombine'; p.t = 0; say('Without anything to keep them apart, the electron and a hole find each other…'); }
        } else {
          const goal = slotPos(p.holeSlot >> 1, p.holeSlot & 1);
          tmp.copy(goal).sub(p.pos);
          const d = tmp.length();
          p.pos.addScaledVector(tmp.normalize(), Math.min(d, dt * 1.6));
          if (d < 0.05) {
            slotOn[p.holeSlot] = true; writeSlot(p.holeSlot); elMesh.instanceMatrix.needsUpdate = true;
            for (let i = 0; i < 10; i++) spark(goal, 0xffb36b, 1.2);
            disposeObj(e); disposeObj(hole); p.stage = 'done';
            say('Recombined. The electron dropped back into a bond and its energy became heat (and a little light). Without a junction to pull them apart, every pair ends like this.');
            continue;
          }
        }
        e.position.copy(p.pos);
        // hole hopping: a neighbouring bonded electron jumps into the hole
        if (!p.hop) {
          p.hopT -= dt;
          if (p.hopT <= 0 && p.stage === 'free') {
            const nb = neighbours[p.holeSlot >> 1].filter((j) => j !== p.holeSlot >> 1);
            const busy = new Set(pairs.filter((o) => o !== p && o.stage !== 'done').map((o) => o.holeSlot >> 1));
            const opts = nb.filter((j) => !busy.has(j) && slotPos(j, 0).length() < 3.2);
            if (opts.length) {
              const j = opts[(Math.random() * opts.length) | 0];
              const from = j * 2 + ((Math.random() * 2) | 0);
              if (slotOn[from]) p.hop = { from, to: p.holeSlot, t: 0 };
            }
            p.hopT = 1.3;
          }
        } else {
          p.hop.t += dt / 0.45;
          const k = Math.min(1, p.hop.t);
          const a = slotPos(p.hop.from >> 1, p.hop.from & 1), b = slotPos(p.hop.to >> 1, p.hop.to & 1);
          slotOn[p.hop.from] = false;
          slotOverride.set(p.hop.from, a.clone().lerp(b, k * k * (3 - 2 * k)));
          writeSlot(p.hop.from);
          hole.position.copy(b).lerp(a, k * k * (3 - 2 * k));
          if (k >= 1) {
            slotOverride.delete(p.hop.from);
            slotOn[p.hop.to] = true; writeSlot(p.hop.to);
            writeSlot(p.hop.from);
            p.holeSlot = p.hop.from; p.hop = undefined;
          }
          elMesh.instanceMatrix.needsUpdate = true;
        }
        hole.material.rotation = t;
        anyE = p;
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.t += dt;
      s.s.position.addScaledVector(s.v, dt);
      (s.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - s.t / 0.7);
      if (s.t > 0.7) { disposeObj(s.s); sparks.splice(i, 1); }
    }
    // labels
    const inFlight = pairs.find((p) => (p.stage === 'in' || p.stage === 'pass'));
    if (inFlight) placeLabel(labP, inFlight.head.getWorldPosition(tmp), st, true); else labP.style.opacity = '0';
    if (anyE && anyE.e && anyE.hole) {
      placeLabel(labE, anyE.e.getWorldPosition(tmp), st, true);
      placeLabel(labH, anyE.hole.getWorldPosition(tmp), st, true);
    } else { labE.style.opacity = '0'; labH.style.opacity = '0'; }
  };
}

// ---------------------------------------------------------------- exploded solar cell
interface LayerDef { id: string; name: string; color: number; swatch: string; info: string; meta: string }
const LAYERS: LayerDef[] = [
  { id: 'metal', name: 'Front contacts', color: 0xd7dbe0, swatch: '#d7dbe0', meta: 'Fingers ~20–40 µm wide · a few % of the surface',
    info: 'Thin printed silver lines called <em>fingers</em> collect electrons from the n-type layer, and wider <em>busbars</em> gather them up. They are kept narrow because metal casts a shadow.' },
  { id: 'arc', name: 'Anti-reflection coating', color: 0x1d3fae, swatch: '#1d3fae', meta: 'Silicon nitride · about 75 nm thick',
    info: 'Bare silicon reflects more than 30% of sunlight. A film far thinner than a wavelength of light makes reflections from its top and bottom surfaces cancel, so more light gets in. It gives cells their deep blue colour, and it also heals surface defects where pairs would recombine.' },
  { id: 'emitter', name: 'Textured n-type layer', color: 0x4d7fe0, swatch: '#4d7fe0', meta: 'Pyramids 1–5 µm tall · phosphorus-doped layer ~0.3–0.5 µm',
    info: 'The surface is etched into microscopic pyramids. Light that bounces off one pyramid usually hits another, and light that gets in is bent to a slant, so it travels further inside. The top fraction of a micrometre is doped with phosphorus, making it n-type.' },
  { id: 'junction', name: 'p–n junction', color: 0xffd25a, swatch: '#ffd25a', meta: 'Less than 1 µm below the surface · field region ~1 µm wide',
    info: 'Where the n-type layer meets the p-type wafer. Its built-in field is the one-way street from chapter 6: electrons are swept up to the front, and holes are pushed down into the wafer.' },
  { id: 'base', name: 'p-type wafer', color: 0x6a5488, swatch: '#6a5488', meta: 'About 0.15–0.18 mm thick · boron or gallium doped',
    info: 'The bulk of the cell, where most photons are absorbed. The freed electrons must wander up to the junction, which works only because the crystal is extremely pure and they survive long enough to make the trip.' },
  { id: 'rear', name: 'Rear contact & mirror', color: 0xa4a9b0, swatch: '#a4a9b0', meta: 'Aluminium · ~10–30 µm',
    info: 'Collects holes and acts as a mirror, sending unabsorbed light back up for a second pass. Many modern cells add a thin passivating film between the silicon and the metal, with contact only through tiny openings, so fewer pairs are lost at the back.' },
];

export function mountCell(el: HTMLElement, explode: HTMLInputElement, list: HTMLElement, info: HTMLElement) {
  const st = makeStage(el, { camPos: new THREE.Vector3(6.2, 5.2, 7.2), target: new THREE.Vector3(0, 0.6, 0), fov: 36, onFrame: (dt, t) => frame(dt, t), autoRotate: 0.08, tilt: [-0.35, 0.5] });
  const { scene, pivot } = st;
  st.camera.lookAt(0, 0.8, 0);
  scene.add(new THREE.HemisphereLight(0xe8eeff, 0x302838, 1.5));
  const dl = new THREE.DirectionalLight(0xffffff, 2.6); dl.position.set(3, 8, 5); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0x9fb4ff, 0.8); dl2.position.set(-5, 2, -4); scene.add(dl2);

  const Wd = 4;
  const groups: Record<string, THREE.Group> = {};
  const mats: Record<string, THREE.MeshStandardMaterial[]> = {};
  const add = (id: string, mesh: THREE.Mesh | THREE.InstancedMesh) => { groups[id].add(mesh); (mats[id] ||= []).push(mesh.material as THREE.MeshStandardMaterial); mesh.userData.layer = id; };
  for (const L of LAYERS) { groups[L.id] = new THREE.Group(); pivot.add(groups[L.id]); }
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra });

  // metal: fingers + busbars
  const metalMat = std(0xd7dbe0, { metalness: 0.85, roughness: 0.3 });
  const nF = 11;
  for (let i = 0; i < nF; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.05, 0.035), metalMat);
    m.position.set(0, 0, -Wd / 2 + ((i + 0.5) / nF) * Wd); add('metal', m);
  }
  for (const x of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, Wd), metalMat); m.position.set(x, 0.01, 0); add('metal', m); }
  // anti-reflection coating
  add('arc', new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.035, Wd), std(0x1d3fae, { transparent: true, opacity: 0.62, roughness: 0.15, metalness: 0.2 })));
  // emitter slab + pyramids
  const em = new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.14, Wd), std(0x4d7fe0)); add('emitter', em);
  const nP = 16, pr = Wd / nP / 2;
  const pyr = new THREE.InstancedMesh(new THREE.ConeGeometry(pr * Math.SQRT2, pr * 1.3, 4, 1), std(0x5b8cec, { roughness: 0.4, flatShading: true }), nP * nP);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  for (let i = 0; i < nP; i++) for (let j = 0; j < nP; j++) {
    m4.compose(new THREE.Vector3(-Wd / 2 + (i + 0.5) * 2 * pr, 0.07 + pr * 0.65, -Wd / 2 + (j + 0.5) * 2 * pr), qq, new THREE.Vector3(1, 1, 1));
    pyr.setMatrixAt(i * nP + j, m4);
  }
  add('emitter', pyr);
  // junction
  add('junction', new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.03, Wd), std(0xffd25a, { emissive: 0xffb020, emissiveIntensity: 0.65, transparent: true, opacity: 0.85 })));
  // base
  add('base', new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.9, Wd), std(0x6a5488, { roughness: 0.7 })));
  // rear
  add('rear', new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.09, Wd), std(0xa4a9b0, { metalness: 0.7, roughness: 0.45 })));

  // compact stack heights (centre y) and explode offsets
  const compact: Record<string, number> = { rear: -0.495, base: 0, junction: 0.465, emitter: 0.55, arc: 0.66, metal: 0.7 };
  const spread: Record<string, number> = { rear: -0.7, base: 0, junction: 0.75, emitter: 1.45, arc: 2.15, metal: 2.85 };

  // light rays falling onto the cell
  const rays: { line: THREE.Line; t: number; x: number; z: number; c: THREE.Color }[] = [];
  const glowTex = spriteTexture('glow');
  for (let i = 0; i < 7; i++) {
    const c = wlColor([450, 520, 580, 620, 660, 700, 480][i]);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -0.9, 0)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
    pivot.add(line);
    rays.push({ line, t: Math.random(), x: (Math.random() - 0.5) * 3.2, z: (Math.random() - 0.5) * 3.2, c });
  }
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0 }));
  pivot.add(sunGlow);

  // labels and list
  const labels: Record<string, HTMLElement> = {};
  list.innerHTML = '';
  let selected = 'junction';
  const btns: Record<string, HTMLButtonElement> = {};
  LAYERS.forEach((L, i) => {
    labels[L.id] = makeLabel(el, L.name);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<i style="background:${L.swatch}"></i>${i + 1}. ${L.name}`;
    b.addEventListener('click', () => select(L.id));
    li.appendChild(b); list.appendChild(li); btns[L.id] = b;
  });
  const select = (id: string) => {
    selected = id;
    const L = LAYERS.find((l) => l.id === id)!;
    info.innerHTML = `<h4>${L.name}</h4>${L.info}<div class="meta">${L.meta}</div>`;
    for (const k in btns) btns[k].classList.toggle('on', k === id);
    for (const k in mats) for (const m of mats[k]) {
      if (k === 'junction') continue;
      m.emissive.setHex(k === id ? 0x2a3a66 : 0x000000);
      m.emissiveIntensity = k === id ? 0.55 : 0;
    }
  };
  select(selected);

  // click / tap on a layer in the 3D view
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = { x: 0, y: 0 };
  el.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, st.camera);
    const hits = ray.intersectObjects(pivot.children, true).filter((h) => h.object.userData.layer);
    if (hits.length) select(hits[0].object.userData.layer);
  });

  let ex = +explode.value, exTarget = ex;
  explode.addEventListener('input', () => { exTarget = +explode.value; });
  const tmp = new THREE.Vector3();

  const frame = (dt: number, _t: number) => {
    ex += (exTarget - ex) * Math.min(1, dt * 10);
    for (const L of LAYERS) groups[L.id].position.y = compact[L.id] + (spread[L.id] - compact[L.id]) * ex;
    const top = groups.metal.position.y + 0.1;
    sunGlow.position.set(0, top + 3.2, 0); sunGlow.scale.setScalar(0);
    for (const r of rays) {
      r.t += dt * 0.55;
      if (r.t > 1) { r.t = 0; r.x = (Math.random() - 0.5) * 3.2; r.z = (Math.random() - 0.5) * 3.2; }
      // light falls through the front layers and is absorbed in the wafer
      const y0 = top + 2.6, y1 = groups.base.position.y + 0.1 - Math.random() * 0.0;
      const yh = y0 + (y1 - y0) * r.t;
      const pos = r.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, r.x, yh + 0.7, r.z); pos.setXYZ(1, r.x, yh, r.z); pos.needsUpdate = true;
      (r.line.material as THREE.LineBasicMaterial).opacity = r.t > 0.85 ? (1 - r.t) / 0.15 : 0.9;
    }
    const narrow = el.clientWidth < 520;
    for (const L of LAYERS) {
      const g = groups[L.id];
      tmp.set(Wd / 2, 0, Wd / 2);
      g.localToWorld(tmp);
      placeLabel(labels[L.id], tmp, st, (narrow ? L.id === selected : ex > 0.35 || L.id === selected));
      labels[L.id].style.fontWeight = L.id === selected ? '700' : '400';
    }
  };
}
