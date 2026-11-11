// The whole solar cell as an exploded 3D sandwich with an external circuit.
import {
  AmbientLight, AdditiveBlending, BoxGeometry, CatmullRomCurve3, Color, DirectionalLight, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PointLight, Raycaster, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3, CylinderGeometry,
} from 'three';
import { Stage } from './stage.ts';

interface Layer {
  id: string; name: string; color: number; chip: string; thickness: number; text: string;
  group: Group; mats: MeshStandardMaterial[]; baseY: number;
}

const SIZE = 4; // cell is SIZE x SIZE
const DEFS = [
  { id: 'back', name: 'Back contact', color: 0x9aa3b2, chip: '#9aa3b2', thickness: 0.1,
    text: 'A sheet of aluminium covering the whole back. Electrons returning from the wire enter here and fill the waiting holes. It also acts as a mirror, sending unabsorbed light back up through the silicon for a second chance.' },
  { id: 'p', name: 'p-type silicon', color: 0x8a3352, chip: '#e0567a', thickness: 0.95,
    text: 'The body of the cell: boron-doped silicon about 0.15 mm thick. Most of the light is absorbed here. Each freed electron must wander to the junction before it meets a hole, which is why the silicon has to be extraordinarily pure.' },
  { id: 'junction', name: 'The junction', color: 0xffffff, chip: '#ffffff', thickness: 0.03,
    text: 'The surface where n-type meets p-type, and the heart of the device. The built-in electric field here sends electrons up and holes down. Every other layer exists to feed light to it or carry charge away from it.' },
  { id: 'n', name: 'n-type silicon', color: 0x2f5fc4, chip: '#5b8def', thickness: 0.2,
    text: 'A skin of phosphorus-doped silicon, in reality less than a thousandth of a millimetre thick. Electrons swept up through the junction gather here and slide sideways towards the nearest metal finger.' },
  { id: 'arc', name: 'Anti-reflection coating', color: 0x14246b, chip: '#2a3fa8', thickness: 0.05,
    text: 'Bare silicon is shiny: it bounces back about a third of the light. A film of silicon nitride about 75 millionths of a millimetre thick, on a surface etched into microscopic pyramids, cuts that to a few percent. It is why solar cells look dark blue.' },
  { id: 'grid', name: 'Silver contacts', color: 0xdfe5ee, chip: '#dfe5ee', thickness: 0.05,
    text: 'Fine silver "fingers" collect electrons from the surface and feed them into thicker busbars. Metal blocks light, so the lines are kept as thin as printing allows and cover only a few percent of the face.' },
  { id: 'circuit', name: 'Wire and lamp', color: 0x4cc9f0, chip: '#4cc9f0', thickness: 0,
    text: 'The outside world. Electrons leave from the front contacts, give up their energy in the lamp, and return to the back. Inside the wire the electrons themselves only crawl; what travels fast is the push, like water in a full hose.' },
];
const INTRO = 'Select a layer from the list, or click it in the model, to see what it is for.';

export function cell(host: HTMLElement) {
  const stage = new Stage(host, {
    className: 'tall', distance: 11.5, azimuth: 0.62, polar: 1.02, target: [0.7, 1.0, 0], fov: 32,
    minPolar: 0.3, maxPolar: 1.7, fit: (a) => Math.max(1, 1.02 / a),
  });
  stage.label('A three-dimensional model of a solar cell: silver grid, blue anti-reflection coating, thin n-type layer, junction, thick p-type layer, and metal back contact, connected by a wire to a lamp. Photons fall on the cell and electrons circulate through the wire.');
  const { scene } = stage;
  scene.add(new AmbientLight(0xffffff, 1.0));
  const key = new DirectionalLight(0xfff1d6, 2.4); key.position.set(-3, 8, 5); scene.add(key);
  const rim = new DirectionalLight(0x88aaff, 0.9); rim.position.set(5, 2, -6); scene.add(rim);

  let sun = 1, explode = 0.35;
  let selected: string | null = null;

  // ── Layers ──
  const layers: Layer[] = [];
  let yAcc = 0;
  for (const d of DEFS) {
    const group = new Group();
    const mats: MeshStandardMaterial[] = [];
    const mat = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]) => { const m = new MeshStandardMaterial({ transparent: true, ...o }); mats.push(m); return m; };
    if (d.id === 'grid') {
      const silver = mat({ color: d.color, metalness: 0.25, roughness: 0.35 });
      for (let i = 0; i < 13; i++) {
        const f = new Mesh(new BoxGeometry(0.045, d.thickness, SIZE), silver);
        f.position.set(-SIZE / 2 + ((i + 0.5) / 13) * SIZE, d.thickness / 2, 0); group.add(f);
      }
      for (const z of [-0.9, 0.9]) {
        const b = new Mesh(new BoxGeometry(SIZE, d.thickness * 1.3, 0.16), silver);
        b.position.set(0, d.thickness * 0.65, z); group.add(b);
      }
    } else if (d.id === 'circuit') {
      // built below
    } else {
      const m = d.id === 'junction'
        ? mat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, opacity: 0.9 })
        : d.id === 'arc' ? mat({ color: d.color, metalness: 0.3, roughness: 0.18, opacity: 0.92 })
        : d.id === 'back' ? mat({ color: d.color, metalness: 0.2, roughness: 0.5 })
        : mat({ color: d.color, roughness: 0.55, metalness: 0.05 });
      const box = new Mesh(new BoxGeometry(SIZE, d.thickness, SIZE), m);
      box.position.y = d.thickness / 2; group.add(box);
    }
    group.traverse((o) => { o.userData.layer = d.id; });
    scene.add(group);
    layers.push({ ...d, group, mats, baseY: yAcc });
    yAcc += d.thickness;
  }
  const L = (id: string) => layers.find((l) => l.id === id)!;
  const order = ['back', 'p', 'junction', 'n', 'arc', 'grid'];
  const layerY = (id: string) => L(id).baseY + order.indexOf(id) * explode * 0.5;
  const topY = () => layerY('grid') + 0.05;

  // ── Circuit ──
  const circuit = L('circuit');
  const wireMat = new MeshStandardMaterial({ color: 0x7a859c, roughness: 0.5, metalness: 0.2, transparent: true });
  circuit.mats.push(wireMat);
  let wire: Mesh | null = null;
  let curve = new CatmullRomCurve3([new Vector3(), new Vector3(1, 0, 0)]);
  const lampPos = new Vector3(SIZE / 2 + 1.6, 0.6, 0.9);
  const lampMat = new MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffc04a, emissiveIntensity: 1, transparent: true, opacity: 0.95 });
  circuit.mats.push(lampMat);
  const lamp = new Mesh(new SphereGeometry(0.3, 24, 16), lampMat);
  const lampBase = new Mesh(new CylinderGeometry(0.14, 0.14, 0.22, 16), wireMat);
  lampBase.position.y = -0.36; lamp.add(lampBase);
  const lampGlow = new Mesh(new SphereGeometry(0.5, 24, 16), new MeshBasicMaterial({ color: 0xffc04a, transparent: true, opacity: 0.2, depthWrite: false, blending: AdditiveBlending }));
  lamp.add(lampGlow);
  const lampLight = new PointLight(0xffc04a, 0, 6); lamp.add(lampLight);
  circuit.group.add(lamp);
  const wireElectrons: Mesh[] = [];
  const eMat = new MeshBasicMaterial({ color: 0x4cc9f0, transparent: true });
  for (let i = 0; i < 22; i++) {
    const e = new Mesh(new SphereGeometry(0.055, 10, 8), eMat);
    circuit.group.add(e); wireElectrons.push(e);
  }
  function layout() {
    for (const id of order) L(id).group.position.y = layerY(id);
    const yT = topY() + 0.02, yB = layerY('back') + 0.05;
    const x = SIZE / 2, z = 0.9;
    lampPos.set(x + 1.6, (yT + yB) / 2 + 0.3, z);
    lamp.position.copy(lampPos);
    // Electrons run: front busbar -> out -> down through the lamp -> back contact.
    curve = new CatmullRomCurve3([
      new Vector3(x - 0.05, yT, z), new Vector3(x + 0.7, yT, z), new Vector3(x + 1.5, yT - 0.1, z),
      new Vector3(x + 1.6, lampPos.y + 0.3, z), new Vector3(x + 1.6, lampPos.y - 0.45, z),
      new Vector3(x + 1.5, yB + 0.1, z), new Vector3(x + 0.7, yB, z), new Vector3(x - 0.05, yB, z),
    ], false, 'catmullrom', 0.2);
    if (wire) { circuit.group.remove(wire); wire.geometry.dispose(); }
    wire = new Mesh(new TubeGeometry(curve, 80, 0.035, 8), wireMat);
    wire.userData.layer = 'circuit';
    circuit.group.add(wire);
    circuit.group.traverse((o) => { o.userData.layer = 'circuit'; });
  }

  // ── Photons and carriers ──
  const photonMat = new MeshBasicMaterial({ color: 0xffb938, transparent: true, opacity: 0.95 });
  const dir = new Vector3(0.28, -1, -0.12).normalize();
  interface Ph { mesh: Mesh; target: Vector3; face: boolean; alive: boolean }
  const photons: Ph[] = [];
  const upV = new Vector3(0, 1, 0);
  for (let i = 0; i < 26; i++) {
    const mesh = new Mesh(new CylinderGeometry(0.008, 0.028, 0.42, 6), photonMat);
    mesh.quaternion.setFromUnitVectors(upV, dir.clone().negate());
    mesh.visible = false; scene.add(mesh);
    photons.push({ mesh, target: new Vector3(), face: false, alive: false });
  }
  interface Car { mesh: Mesh; kind: 'e' | 'h'; t: number; from: Vector3; alive: boolean }
  const carriers: Car[] = [];
  const holeMat = new MeshBasicMaterial({ color: 0xff6b81 });
  for (let i = 0; i < 24; i++) {
    const kind = i % 2 ? 'h' : 'e';
    const mesh = kind === 'e' ? new Mesh(new SphereGeometry(0.06, 10, 8), eMat) : new Mesh(new TorusGeometry(0.06, 0.018, 8, 20), holeMat);
    mesh.visible = false; scene.add(mesh);
    carriers.push({ mesh, kind, t: 0, from: new Vector3(), alive: false });
  }
  let spawnTimer = 0;
  const FACE_Z = SIZE / 2 + 0.03;
  function spawnPhoton() {
    const p = photons.find((q) => !q.alive); if (!p) return;
    p.face = Math.random() < 0.45;
    const x = -SIZE / 2 + 0.2 + Math.random() * (SIZE - 0.4);
    if (p.face) {
      // Absorbed where we can see it: on the cut front face, at a depth inside the p-layer.
      const pl = L('p');
      const depth = Math.min(0.9, -Math.log(1 - Math.random()) * 0.3);
      p.target.set(x, layerY('p') + pl.thickness * (1 - depth), FACE_Z);
    } else {
      p.target.set(x, layerY('arc') + 0.05, -SIZE / 2 + 0.2 + Math.random() * (SIZE - 0.4));
    }
    p.mesh.position.copy(p.target).addScaledVector(dir, -(5 + Math.random() * 2));
    p.alive = true; p.mesh.visible = true;
  }
  function spawnPair(at: Vector3) {
    for (const kind of ['e', 'h'] as const) {
      const c = carriers.find((q) => !q.alive && q.kind === kind); if (!c) continue;
      c.alive = true; c.t = 0; c.from.copy(at); c.mesh.visible = true; c.mesh.position.copy(at);
    }
  }

  // ── Selection ──
  const info = document.createElement('div'); info.className = 'layer-info'; info.setAttribute('aria-live', 'polite');
  const chips = document.createElement('div'); chips.className = 'layers'; chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Layers of the cell');
  const chipEls = new Map<string, HTMLButtonElement>();
  function select(id: string | null) {
    selected = id === selected ? null : id;
    for (const l of layers) {
      const dimmed = selected != null && l.id !== selected;
      for (const m of l.mats) { m.opacity = dimmed ? 0.16 : (m.userData.base as number); m.depthWrite = !dimmed; }
      chipEls.get(l.id)!.setAttribute('aria-pressed', String(l.id === selected));
    }
    const l = selected ? L(selected) : null;
    info.innerHTML = l
      ? `<span class="chip" style="background:${l.chip}"></span><h4>${l.name}</h4><p>${l.text}</p>`
      : `<span class="chip" style="background:var(--line-2)"></span><h4>A solar cell, layer by layer</h4><p>${INTRO}</p>`;
  }
  for (const l of [...layers].reverse()) {
    for (const m of l.mats) m.userData.base = m.opacity;
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = `<i style="background:${l.chip}"></i>${l.name}`;
    b.addEventListener('click', () => { stage.touched = true; select(l.id); });
    chipEls.set(l.id, b); chips.append(b);
  }
  const ray = new Raycaster();
  stage.onTap = (x, y) => {
    ray.setFromCamera(new Vector2(x, y), stage.camera);
    const hit = ray.intersectObjects(layers.map((l) => l.group), true).find((h) => h.object.userData.layer);
    if (hit) select(hit.object.userData.layer as string);
  };

  // ── Controls ──
  const controls = document.createElement('div'); controls.className = 'controls';
  const mkSlider = (label: string, value: number, fmt: (v: number) => string, on: (v: number) => void, thumb: string) => {
    const id = `c3-${label.replace(/\W/g, '')}`;
    const wrap = document.createElement('div'); wrap.className = 'slider';
    wrap.innerHTML = `<label for="${id}">${label}</label><output for="${id}">${fmt(value)}</output><input id="${id}" type="range" min="0" max="1" step="0.01" value="${value}" style="--thumb:${thumb}">`;
    const input = wrap.querySelector('input')!, out = wrap.querySelector('output')!;
    input.addEventListener('input', () => { out.textContent = fmt(+input.value); on(+input.value); });
    return wrap;
  };
  controls.append(
    mkSlider('Pull the layers apart', explode, (v) => (v < 0.05 ? 'assembled' : v > 0.8 ? 'fully apart' : 'apart'), (v) => { explode = v; layout(); }, 'var(--text)'),
    mkSlider('Sunlight', sun, (v) => (v === 0 ? 'dark' : `${Math.round(v * 100)}%`), (v) => { sun = v; }, 'var(--photon)'));
  host.append(controls, chips, info);
  layout();
  select(null);

  let flow = 0, glow = 1;
  const tmp = new Vector3();
  stage.onFrame = (dt) => {
    // Photons
    spawnTimer -= dt * sun;
    while (spawnTimer <= 0 && sun > 0) { spawnTimer += 0.075; spawnPhoton(); }
    for (const p of photons) {
      if (!p.alive) continue;
      p.mesh.position.addScaledVector(dir, dt * 6.5);
      if (p.mesh.position.y <= p.target.y) {
        p.alive = false; p.mesh.visible = false;
        if (p.face) spawnPair(p.target);
      }
    }
    // Freed carriers on the cut face: electron up to the n-layer, hole down to the back.
    const yN = layerY('n') + 0.1, yBk = layerY('back') + 0.1;
    for (const c of carriers) {
      if (!c.alive) continue;
      c.t += dt / 1.3;
      const u = Math.min(1, c.t);
      const wob = Math.sin(c.t * 14 + c.from.x * 9) * 0.09 * (1 - u);
      c.mesh.position.set(c.from.x + wob, c.from.y + ((c.kind === 'e' ? yN : yBk) - c.from.y) * u * u, FACE_Z + 0.02);
      if (c.kind === 'h') c.mesh.quaternion.copy(stage.camera.quaternion);
      if (c.t >= 1.15) { c.alive = false; c.mesh.visible = false; }
    }
    // Circuit: the current is proportional to the light.
    flow = (flow + dt * 0.12 * sun) % 1;
    wireElectrons.forEach((e, i) => { curve.getPointAt((i / wireElectrons.length + flow / 1) % 1 * 0.999, tmp); e.position.copy(tmp); });
    glow += (sun - glow) * Math.min(1, dt * 4);
    const dimmed = selected != null && selected !== 'circuit';
    lampMat.emissiveIntensity = 0.05 + 1.6 * glow;
    lampGlow.scale.setScalar(0.6 + 0.6 * glow);
    (lampGlow.material as MeshBasicMaterial).opacity = (dimmed ? 0.04 : 0.16) * glow;
    lampLight.intensity = 4 * glow;
    eMat.opacity = dimmed ? 0.3 : 1;
    void Color;
  };
}
