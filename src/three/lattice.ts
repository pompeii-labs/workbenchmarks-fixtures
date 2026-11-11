// The silicon crystal (diamond cubic), with bond electrons, a free electron,
// a hopping hole, and optional phosphorus / boron dopant.
import {
  AmbientLight, Color, CylinderGeometry, DirectionalLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, Fog, Quaternion, SphereGeometry, TorusGeometry, Vector3, Group,
} from 'three';
import { Stage } from './stage.ts';

const BASIS: [number, number, number][] = [
  [0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0],
  [0.25, 0.25, 0.25], [0.25, 0.75, 0.75], [0.75, 0.25, 0.75], [0.75, 0.75, 0.25],
];
const N = 2; // unit cells per side
const ELECTRON = 0x4cc9f0, HOLE = 0xff6b81;

interface Bond { a: number; b: number; e: [Vector3, Vector3]; filled: [boolean, boolean] }

function button(text: string, cls = 'btn') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.textContent = text;
  return b;
}

export function lattice(host: HTMLElement, variant: 'lattice' | 'doping') {
  const stage = new Stage(host, { distance: 5.6, azimuth: 0.5, polar: 1.15, fit: (a) => Math.max(1, 1.05 / a) });
  stage.label('A rotating three-dimensional model of the silicon crystal. Every atom is bonded to four neighbours arranged like the corners of a tetrahedron.');
  const { scene } = stage;
  scene.fog = new Fog(0x0d1220, 4.4, 8.2);
  scene.add(new AmbientLight(0xffffff, 0.9));
  const sun = new DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
  const fill = new DirectionalLight(0x88aaff, 0.8); fill.position.set(-4, -2, -3); scene.add(fill);
  const root = new Group(); root.position.set(-N / 2, -N / 2, -N / 2); scene.add(root);

  // Atoms
  const atoms: Vector3[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) for (const b of BASIS) {
    const p = new Vector3(i + b[0], j + b[1], k + b[2]);
    if (p.x > N + 1e-6 || p.y > N + 1e-6 || p.z > N + 1e-6) continue;
    const key = `${p.x},${p.y},${p.z}`;
    if (!seen.has(key)) { seen.add(key); atoms.push(p); }
  }
  const centre = new Vector3(N / 2, N / 2, N / 2);
  let centreAtom = 0;
  atoms.forEach((p, i) => { if (p.distanceTo(centre) < atoms[centreAtom].distanceTo(centre)) centreAtom = i; });

  const bonds: Bond[] = [];
  const bondLen = Math.sqrt(3) / 4;
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
    if (Math.abs(atoms[i].distanceTo(atoms[j]) - bondLen) < 0.01) {
      // Two electrons per bond, drawn side by side across the bond's midpoint.
      const mid = atoms[i].clone().add(atoms[j]).multiplyScalar(0.5);
      const dir = atoms[j].clone().sub(atoms[i]).normalize();
      const side = new Vector3(0.3, 1, 0.2).cross(dir).normalize().multiplyScalar(0.04);
      bonds.push({ a: i, b: j, e: [mid.clone().add(side), mid.clone().sub(side)], filled: [true, true] });
    }
  }
  const neighbours = bonds.map((b, i) => bonds.map((o, j) => (j !== i && (o.a === b.a || o.a === b.b || o.b === b.a || o.b === b.b) ? j : -1)).filter((j) => j >= 0));

  const dummy = new Object3D();
  const atomMesh = new InstancedMesh(new SphereGeometry(0.085, 24, 16), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.25 }), atoms.length);
  const grey = new Color(0xb4bdcf);
  const setAtom = (i: number, scale: number, color: Color) => {
    dummy.position.copy(atoms[i]); dummy.scale.setScalar(scale); dummy.quaternion.identity(); dummy.updateMatrix();
    atomMesh.setMatrixAt(i, dummy.matrix); atomMesh.setColorAt(i, color);
  };
  atoms.forEach((_, i) => setAtom(i, 1, grey));
  root.add(atomMesh);

  const bondMesh = new InstancedMesh(new CylinderGeometry(0.02, 0.02, 1, 8), new MeshStandardMaterial({ color: 0x55607a, roughness: 0.6, transparent: true, opacity: 0.75 }), bonds.length);
  const up = new Vector3(0, 1, 0), q = new Quaternion();
  bonds.forEach((b, i) => {
    const A = atoms[b.a], B = atoms[b.b];
    dummy.position.copy(A).add(B).multiplyScalar(0.5);
    q.setFromUnitVectors(up, B.clone().sub(A).normalize());
    dummy.quaternion.copy(q); dummy.scale.set(1, bondLen, 1); dummy.updateMatrix();
    bondMesh.setMatrixAt(i, dummy.matrix);
  });
  root.add(bondMesh);

  const eMesh = new InstancedMesh(new SphereGeometry(0.023, 12, 8), new MeshBasicMaterial({ color: 0x3aa6cc }), bonds.length * 2);
  const m4 = new Matrix4();
  const placeE = (bond: number, slot: number, pos: Vector3 | null) => {
    if (pos) m4.makeTranslation(pos.x, pos.y, pos.z); else m4.makeScale(0, 0, 0);
    eMesh.setMatrixAt(bond * 2 + slot, m4); eMesh.instanceMatrix.needsUpdate = true;
  };
  const refreshE = () => bonds.forEach((b, i) => { placeE(i, 0, b.filled[0] ? b.e[0] : null); placeE(i, 1, b.filled[1] ? b.e[1] : null); });
  root.add(eMesh);

  // Free electron and hole markers
  const free = new Mesh(new SphereGeometry(0.075, 16, 12), new MeshBasicMaterial({ color: 0x7fe3ff, fog: false }));
  const halo = new Mesh(new SphereGeometry(0.15, 16, 12), new MeshBasicMaterial({ color: ELECTRON, transparent: true, opacity: 0.3, depthWrite: false, fog: false }));
  free.add(halo); free.visible = false; root.add(free);
  const hole = new Mesh(new TorusGeometry(0.075, 0.02, 8, 24), new MeshBasicMaterial({ color: HOLE, fog: false, depthTest: false }));
  hole.visible = false; hole.renderOrder = 5; root.add(hole);
  const photon = new Mesh(new SphereGeometry(0.06, 12, 8), new MeshBasicMaterial({ color: 0xffb938 }));
  const pTail = new Mesh(new CylinderGeometry(0.004, 0.035, 0.7, 8), new MeshBasicMaterial({ color: 0xffb938, transparent: true, opacity: 0.6 }));
  pTail.position.y = 0.38; photon.add(pTail); photon.visible = false; root.add(photon);

  // State
  let holeAt: { bond: number; slot: number } | null = null;
  let hop: { from: number; slot: number; t: number } | null = null;
  let hopTimer = 0;
  let freeTarget = new Vector3();
  let shot: { t: number; bond: number; from: Vector3 } | null = null;
  const randomPoint = () => new Vector3(0.15 + Math.random() * (N - 0.3), 0.15 + Math.random() * (N - 0.3), 0.15 + Math.random() * (N - 0.3));

  function clear() {
    bonds.forEach((b) => { b.filled = [true, true]; });
    atoms.forEach((_, i) => setAtom(i, 1, grey));
    atomMesh.instanceMatrix.needsUpdate = true; if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true;
    holeAt = null; hop = null; shot = null;
    free.visible = hole.visible = photon.visible = false;
    refreshE();
  }
  function makeHole(bond: number, slot: number) {
    bonds[bond].filled[slot] = false; holeAt = { bond, slot };
    hole.position.copy(bonds[bond].e[slot]); hole.visible = true; hopTimer = 0.9; refreshE();
  }
  function freeElectron(at: Vector3) { free.position.copy(at); free.visible = true; freeTarget = randomPoint(); }
  const centreBond = () => bonds.findIndex((b) => b.a === centreAtom || b.b === centreAtom);

  // UI
  let onHit: () => void = () => {};
  const status = document.createElement('p');
  status.className = 'status'; status.setAttribute('aria-live', 'polite');
  const controls = document.createElement('div'); controls.className = 'controls';
  host.append(controls, status);

  if (variant === 'lattice') {
    const fire = button('Hit it with a photon', 'btn primary'), reset = button('Reset');
    controls.append(fire, reset);
    const idle = '<b>Pure silicon.</b> Every electron is tied up in a bond between two atoms. Nothing is free to carry a current.';
    status.innerHTML = idle;
    fire.addEventListener('click', () => {
      clear();
      const bond = centreBond();
      shot = { t: 0, bond, from: bonds[bond].e[0].clone().add(new Vector3(0.6, 2.6, 0.9)) };
      photon.visible = true;
      status.innerHTML = '<b>A photon arrives…</b>';
    });
    reset.addEventListener('click', () => { clear(); status.innerHTML = idle; });
    onHit = () => { status.innerHTML = '<b>One electron is free, and one hole is left behind.</b> The <span class="t-electron">electron</span> drifts between the atoms. The <span class="t-hole">hole</span> moves when a neighbouring bond electron hops into it.'; };
  } else {
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Dopant');
    const bP = button('Add phosphorus', ''), bB = button('Add boron', ''), b0 = button('Pure', '');
    seg.append(bP, bB, b0); controls.append(seg);
    const set = (mode: 'P' | 'B' | '0') => {
      clear();
      bP.setAttribute('aria-pressed', String(mode === 'P')); bB.setAttribute('aria-pressed', String(mode === 'B')); b0.setAttribute('aria-pressed', String(mode === '0'));
      if (mode === 'P') {
        setAtom(centreAtom, 1.35, new Color(0x6f9bff));
        freeElectron(atoms[centreAtom].clone().add(new Vector3(0.15, 0.1, 0)));
        status.innerHTML = '<b>n-type.</b> The blue atom is phosphorus. Four of its five outer electrons make the usual bonds; the fifth is spare and <span class="t-electron">wanders freely</span>. The phosphorus atom left behind is fixed in place and positively charged.';
      } else if (mode === 'B') {
        setAtom(centreAtom, 1.35, new Color(0xff7f9c));
        makeHole(centreBond(), 0);
        status.innerHTML = '<b>p-type.</b> The pink atom is boron. With only three outer electrons, it leaves one bond short. Neighbouring electrons hop in to fill the gap, so the <span class="t-hole">hole</span> wanders away, leaving the boron atom fixed and negatively charged.';
      } else {
        status.innerHTML = '<b>Pure silicon</b>, for comparison: no spare electrons and no holes.';
      }
      atomMesh.instanceMatrix.needsUpdate = true; if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true;
    };
    bP.addEventListener('click', () => set('P')); bB.addEventListener('click', () => set('B')); b0.addEventListener('click', () => set('0'));
    set('P');
  }

  const tmp = new Vector3();
  stage.onFrame = (dt, t) => {
    if (shot) {
      shot.t += dt / 0.7;
      const to = bonds[shot.bond].e[0];
      photon.position.lerpVectors(shot.from, to, Math.min(1, shot.t));
      photon.quaternion.setFromUnitVectors(up, tmp.copy(shot.from).sub(to).normalize());
      if (shot.t >= 1) {
        photon.visible = false;
        makeHole(shot.bond, 0); freeElectron(to);
        shot = null; onHit();
      }
    }
    if (free.visible) {
      tmp.copy(freeTarget).sub(free.position);
      const d = tmp.length();
      if (d < 0.08) freeTarget = randomPoint();
      else free.position.addScaledVector(tmp, Math.min(1, (0.75 * dt) / d));
      halo.scale.setScalar(1 + 0.15 * Math.sin(t * 5));
    }
    if (holeAt) {
      hole.quaternion.copy(stage.camera.quaternion);
      if (hop) {
        hop.t += dt / 0.35;
        const src = bonds[hop.from].e[hop.slot], dst = bonds[holeAt.bond].e[holeAt.slot];
        const u = Math.min(1, hop.t);
        placeE(hop.from, hop.slot, tmp.lerpVectors(src, dst, u));
        hole.position.lerpVectors(dst, src, u);
        if (u >= 1) {
          bonds[holeAt.bond].filled[holeAt.slot] = true;
          bonds[hop.from].filled[hop.slot] = false;
          holeAt = { bond: hop.from, slot: hop.slot };
          hop = null; refreshE(); hopTimer = 0.55 + Math.random() * 0.5;
        }
      } else if ((hopTimer -= dt) <= 0) {
        // Prefer bonds well inside the drawn crystal so the hole stays in view.
        const opts = neighbours[holeAt.bond].filter((j) => bonds[j].filled[0] && bonds[j].filled[1]);
        const inner = opts.filter((j) => bonds[j].e[0].distanceTo(centre) < 0.95);
        const pick = (inner.length ? inner : opts)[Math.floor(Math.random() * (inner.length || opts.length))];
        if (pick != null) hop = { from: pick, slot: Math.random() < 0.5 ? 0 : 1, t: 0 };
      }
    }
  };
  refreshE();
}
