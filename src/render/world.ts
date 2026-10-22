import * as THREE from 'three';
import { swellGlsl } from '../sim/waves';
import { BOUNDS } from '../sim/sim';

const HORIZON = new THREE.Color('#ffd7b0');
const SUN_DIR = new THREE.Vector3(-0.35, 0.32, -0.88).normalize();

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class World {
  readonly group = new THREE.Group();
  private readonly water: THREE.Mesh;
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly sky: THREE.Mesh;
  private readonly floor: THREE.Mesh;
  private readonly tiles: { group: THREE.Group; index: number }[] = [];
  private readonly clouds = new THREE.Group();
  private readonly buoys: THREE.InstancedMesh;
  private readonly kit: Record<string, THREE.BufferGeometry> = {};
  private readonly mats: Record<string, THREE.Material> = {};
  private static readonly TILE = 90;
  private readonly tmp = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    scene.background = HORIZON.clone();
    scene.fog = new THREE.Fog(HORIZON.clone(), 70, 260);

    const hemi = new THREE.HemisphereLight('#ffe9d2', '#2f8f9a', 1.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffd49a', 2.6);
    sun.position.copy(SUN_DIR).multiplyScalar(50);
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#9fd8ff', 0.6);
    fill.position.set(20, 15, 30);
    scene.add(fill);

    // Sky dome with a warm golden-hour gradient and sun glow.
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { sunDir: { value: SUN_DIR } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
        fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
          void main(){
            float y = clamp(vDir.y, -0.2, 1.0);
            vec3 top = vec3(0.36, 0.66, 0.92);
            vec3 mid = vec3(0.98, 0.78, 0.70);
            vec3 hor = vec3(1.0, 0.84, 0.66);
            vec3 col = mix(hor, mid, smoothstep(0.0, 0.12, y));
            col = mix(col, top, smoothstep(0.1, 0.6, y));
            float s = max(dot(normalize(vDir), sunDir), 0.0);
            col += vec3(1.0, 0.72, 0.42) * pow(s, 12.0) * 0.55;
            col += vec3(1.0, 0.93, 0.8) * smoothstep(0.9975, 0.9985, s);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    // Sandy sea floor glimpsed through the water.
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: '#e8d5a6', roughness: 1 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -9.5;
    this.group.add(this.floor);

    // Water: displaced grid that follows the dolphin, same swell sum as the sim.
    const geo = new THREE.PlaneGeometry(240, 240, 150, 150);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uSun: { value: SUN_DIR },
          uShoreX: { value: BOUNDS.maxX + 9 },
        },
      ]),
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormal2;
        varying float vH;
        #include <fog_pars_vertex>
        ${swellGlsl()}
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 s = swellSample(wp.xz, uTime);
          wp.y += s.x;
          vH = s.x;
          vNormal2 = normalize(vec3(-s.y, 1.0, -s.z));
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform vec3 uSun;
        uniform float uTime;
        uniform float uShoreX;
        varying vec3 vWorld;
        varying vec3 vNormal2;
        varying float vH;
        #include <fog_pars_fragment>
        float n2(vec2 p){ return sin(p.x*1.7+sin(p.y*1.3))*sin(p.y*1.9+sin(p.x*1.1)); }
        void main(){
          vec3 N = normalize(vNormal2 + vec3(n2(vWorld.xz*0.9+uTime*0.6), 0.0, n2(vWorld.zx*0.8-uTime*0.5))*0.06);
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          vec3 deep = vec3(0.0, 0.30, 0.50);
          vec3 shallow = vec3(0.05, 0.66, 0.70);
          float shore = smoothstep(uShoreX - 22.0, uShoreX, vWorld.x);
          vec3 col = mix(deep, shallow, clamp(0.4 + vH*0.3 + shore*0.6, 0.0, 1.0));
          col = mix(col, vec3(1.0, 0.80, 0.62), fres*0.35);
          vec3 H = normalize(uSun + V);
          float spec = pow(max(dot(N, H), 0.0), 120.0);
          col += vec3(1.0, 0.85, 0.6) * spec * 1.4;
          float foam = smoothstep(1.25, 1.6, vH + n2(vWorld.xz*1.6+uTime)*0.15) * 0.7;
          foam += smoothstep(uShoreX - 3.0, uShoreX + 0.5, vWorld.x) * (0.6 + 0.4*n2(vWorld.xz*2.0+uTime*2.0));
          col = mix(col, vec3(0.98, 0.98, 0.95), clamp(foam, 0.0, 0.85));
          float alpha = clamp(0.74 + fres*0.25 + foam*0.3, 0.0, 0.97);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.renderOrder = 2;
    this.water.frustumCulled = false;
    this.group.add(this.water);

    this.buildKit();
    for (let i = 0; i < 4; i++) {
      const tile = { group: new THREE.Group(), index: Number.NaN };
      this.tiles.push(tile);
      this.group.add(tile.group);
    }

    // Boundary buoys along both edges of the play lane.
    this.buoys = new THREE.InstancedMesh(this.kit.buoy, this.mats.buoy, 40);
    this.buoys.frustumCulled = false;
    this.group.add(this.buoys);

    this.buildClouds();
    this.group.add(this.clouds);
    scene.add(this.group);
  }

  private buildKit(): void {
    const k = this.kit;
    const m = this.mats;
    m.sand = new THREE.MeshStandardMaterial({ color: '#f3dcab', roughness: 1 });
    m.grass = new THREE.MeshStandardMaterial({ color: '#7fc27a', roughness: 0.95, flatShading: true });
    m.hill = new THREE.MeshStandardMaterial({ color: '#5aa873', roughness: 1, flatShading: true });
    m.trunk = new THREE.MeshStandardMaterial({ color: '#a77b52', roughness: 0.9, flatShading: true });
    m.leaf = new THREE.MeshStandardMaterial({ color: '#3fae6a', roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
    m.rock = new THREE.MeshStandardMaterial({ color: '#9b9289', roughness: 0.95, flatShading: true });
    m.roof = new THREE.MeshStandardMaterial({ color: '#e0644f', roughness: 0.8, flatShading: true });
    m.roofB = new THREE.MeshStandardMaterial({ color: '#3d8fc4', roughness: 0.8, flatShading: true });
    m.window = new THREE.MeshBasicMaterial({ color: '#ffd98a' });
    m.lightW = new THREE.MeshStandardMaterial({ color: '#fbf4ea', roughness: 0.8 });
    m.lightR = new THREE.MeshStandardMaterial({ color: '#e5574a', roughness: 0.8 });
    m.lamp = new THREE.MeshBasicMaterial({ color: '#fff1b8' });
    m.buoy = new THREE.MeshStandardMaterial({ color: '#ff6b4a', roughness: 0.6 });
    m.cloud = new THREE.MeshStandardMaterial({ color: '#fff4ea', roughness: 1, emissive: '#ffe6d6', emissiveIntensity: 0.75, fog: false });
    m.island = new THREE.MeshStandardMaterial({ color: '#7fa7a0', roughness: 1, flatShading: true });
    const houseColors = ['#fff3dc', '#ffd9c7', '#d8f0e6', '#fde7a8', '#e3e0ff'];
    houseColors.forEach((c, i) => {
      m[`wall${i}`] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
    });

    const sand = new THREE.PlaneGeometry(14, World.TILE, 6, 12);
    sand.rotateX(-Math.PI / 2);
    const sp = sand.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      sp.setY(i, (x + 7) * 0.12 - 0.5);
    }
    sand.computeVertexNormals();
    k.sand = sand;
    k.grass = new THREE.BoxGeometry(30, 2, World.TILE);
    k.hill = new THREE.IcosahedronGeometry(1, 1);
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 5, 6, 4);
    const tp = trunk.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i) + 2.5;
      tp.setX(i, tp.getX(i) + (y * y) * 0.03);
    }
    trunk.translate(0, 2.5, 0);
    trunk.computeVertexNormals();
    k.trunk = trunk;
    // Palm frond: a drooping tapered strip.
    const frond = new THREE.PlaneGeometry(2.6, 0.7, 6, 1);
    const fp = frond.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i) + 1.3;
      const taper = 1 - x / 2.8;
      fp.setXYZ(i, x, -x * x * 0.12, fp.getY(i) * taper);
    }
    frond.computeVertexNormals();
    k.frond = frond;
    k.rock = new THREE.DodecahedronGeometry(1, 0);
    k.wall = new THREE.BoxGeometry(3, 2.2, 3);
    const roof = new THREE.ConeGeometry(2.5, 1.5, 4);
    roof.rotateY(Math.PI / 4);
    k.roof = roof;
    k.window = new THREE.PlaneGeometry(0.6, 0.6);
    k.tower = new THREE.CylinderGeometry(0.9, 1.3, 2.4, 14);
    k.lamp = new THREE.CylinderGeometry(0.7, 0.7, 0.9, 12);
    k.cap = new THREE.ConeGeometry(1.0, 0.9, 12);
    const buoy = new THREE.SphereGeometry(0.45, 10, 8);
    k.buoy = buoy;
    k.cloud = new THREE.IcosahedronGeometry(1, 2);
  }

  private buildTile(tile: { group: THREE.Group; index: number }, index: number): void {
    const g = tile.group;
    g.clear();
    tile.index = index;
    const k = this.kit;
    const m = this.mats;
    const L = World.TILE;
    const shoreX = BOUNDS.maxX + 9;
    g.position.set(0, 0, -index * L);

    const sand = new THREE.Mesh(k.sand, m.sand);
    sand.position.set(shoreX + 7, 0, 0);
    g.add(sand);
    const grass = new THREE.Mesh(k.grass, m.grass);
    grass.position.set(shoreX + 14 + 15, 0.2, 0);
    g.add(grass);

    let r = index * 13.37;
    const rnd = () => hash((r += 1.618));

    for (let i = 0; i < 5; i++) {
      const hill = new THREE.Mesh(k.hill, m.hill);
      const s = 9 + rnd() * 10;
      hill.scale.set(s * 1.3, s * (0.5 + rnd() * 0.4), s);
      hill.position.set(shoreX + 34 + rnd() * 20, 0, -L / 2 + i * (L / 5) + rnd() * 8);
      g.add(hill);
    }

    for (let i = 0; i < 7; i++) {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(k.trunk, m.trunk);
      palm.add(trunk);
      for (let f = 0; f < 7; f++) {
        const fr = new THREE.Mesh(k.frond, m.leaf);
        fr.position.set(0.75, 5, 0);
        fr.rotation.set(0, (f / 7) * Math.PI * 2, 0.25);
        palm.add(fr);
      }
      const s = 0.8 + rnd() * 0.5;
      palm.scale.setScalar(s);
      palm.rotation.y = rnd() * Math.PI * 2;
      palm.position.set(shoreX + 6 + rnd() * 8, 0.3, -L / 2 + rnd() * L);
      g.add(palm);
    }

    for (let i = 0; i < 4; i++) {
      const rock = new THREE.Mesh(k.rock, m.rock);
      const s = 0.6 + rnd() * 1.4;
      rock.scale.set(s * 1.4, s, s);
      rock.rotation.set(rnd() * 3, rnd() * 3, 0);
      rock.position.set(shoreX - 1 + rnd() * 3, -0.2, -L / 2 + rnd() * L);
      g.add(rock);
    }

    const houses = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < houses; i++) {
      const house = new THREE.Group();
      const wall = new THREE.Mesh(k.wall, m[`wall${Math.floor(rnd() * 5)}`]);
      wall.position.y = 1.1;
      house.add(wall);
      const roof = new THREE.Mesh(k.roof, rnd() > 0.5 ? m.roof : m.roofB);
      roof.position.y = 2.95;
      house.add(roof);
      for (const wz of [-0.7, 0.7]) {
        const w = new THREE.Mesh(k.window, m.window);
        w.position.set(-1.51, 1.2, wz);
        w.rotation.y = -Math.PI / 2;
        house.add(w);
      }
      const s = 1 + rnd() * 0.4;
      house.scale.setScalar(s);
      house.position.set(shoreX + 16 + rnd() * 6, 1.2, -L / 2 + (i + 0.5) * (L / houses) + (rnd() - 0.5) * 10);
      house.rotation.y = (rnd() - 0.5) * 0.4;
      g.add(house);
    }

    if (index % 3 === 1) {
      const lh = new THREE.Group();
      for (let b = 0; b < 4; b++) {
        const band = new THREE.Mesh(k.tower, b % 2 ? m.lightR : m.lightW);
        band.scale.set(1 - b * 0.08, 1, 1 - b * 0.08);
        band.position.y = 1.2 + b * 2.4;
        lh.add(band);
      }
      const lamp = new THREE.Mesh(k.lamp, m.lamp);
      lamp.position.y = 10.3;
      lh.add(lamp);
      const cap = new THREE.Mesh(k.cap, m.lightR);
      cap.position.y = 11.2;
      lh.add(cap);
      const base = new THREE.Mesh(k.rock, m.rock);
      base.scale.set(3, 1.2, 3);
      lh.add(base);
      lh.position.set(shoreX + 2, 0.4, 0);
      g.add(lh);
    }

    // Distant islands on the open-sea side.
    if (index % 2 === 0) {
      const isl = new THREE.Mesh(k.hill, m.island);
      const s = 14 + rnd() * 12;
      isl.scale.set(s * 2, s * 0.45, s);
      isl.position.set(-150 - rnd() * 40, -2, rnd() * L);
      g.add(isl);
    }
  }

  private buildClouds(): void {
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      const puffs = 4 + Math.floor(hash(i * 3.1) * 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(this.kit.cloud, this.mats.cloud);
        const s = 5 + hash(i * 7 + p) * 6;
        puff.scale.set(s * 1.4, s * 0.8, s);
        puff.position.set(p * 6 - puffs * 3, hash(p * 1.3 + i) * 3, hash(p + i * 2.2) * 4);
        c.add(puff);
      }
      const a = (i / 9) * Math.PI * 1.6 - Math.PI * 0.3;
      c.position.set(Math.sin(a) * 240 - 40, 75 + hash(i) * 40, -Math.cos(a) * 240);
      this.clouds.add(c);
    }
  }

  update(focusX: number, focusZ: number, time: number, cameraPos: THREE.Vector3): void {
    this.waterMat.uniforms.uTime.value = time;
    const cell = 240 / 150;
    this.water.position.set(Math.round(focusX / cell) * cell, 0, Math.round((focusZ - 60) / cell) * cell);
    this.floor.position.x = focusX;
    this.floor.position.z = focusZ - 60;
    this.sky.position.copy(cameraPos);
    this.clouds.position.set(cameraPos.x * 0.9, 0, cameraPos.z * 0.9);

    // Recycle coast tiles: one behind, three ahead.
    const base = Math.floor(-focusZ / World.TILE + 0.5) - 1;
    const wanted = [base, base + 1, base + 2, base + 3];
    const free = this.tiles.filter((t) => !wanted.includes(t.index));
    for (const idx of wanted) {
      if (!this.tiles.some((t) => t.index === idx)) {
        const t = free.pop();
        if (t) this.buildTile(t, idx);
      }
    }

    // Buoys bob on the swell along both lane edges.
    const spacing = 14;
    const startZ = Math.floor(focusZ / spacing) * spacing + 3 * spacing;
    for (let i = 0; i < 20; i++) {
      const z = startZ - i * spacing;
      for (let side = 0; side < 2; side++) {
        const x = side === 0 ? BOUNDS.minX - 1 : BOUNDS.maxX + 1;
        let h = 0;
        h = Math.sin(z * 0.2 + time * 1.4 + side) * 0.3;
        this.tmp.position.set(x, h + 0.1, z);
        this.tmp.scale.set(1, 1.2, 1);
        this.tmp.updateMatrix();
        this.buoys.setMatrixAt(i * 2 + side, this.tmp.matrix);
      }
    }
    this.buoys.instanceMatrix.needsUpdate = true;
  }
}
