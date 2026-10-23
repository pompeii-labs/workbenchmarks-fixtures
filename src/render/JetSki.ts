import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface SkiLivery {
  /** hull band, cowl stripe, helmet, bar pod */
  accent: string;
  /** rider vest */
  vest: string;
}

function hullShape(scale = 1): THREE.Shape {
  const s = new THREE.Shape();
  const w = 0.58 * scale;
  s.moveTo(0, 1.7 * scale);
  s.quadraticCurveTo(w * 0.95, 1.25 * scale, w, 0.25 * scale);
  s.lineTo(w * 0.92, -1.25 * scale);
  s.quadraticCurveTo(w * 0.85, -1.42 * scale, w * 0.6, -1.42 * scale);
  s.lineTo(-w * 0.6, -1.42 * scale);
  s.quadraticCurveTo(-w * 0.85, -1.42 * scale, -w * 0.92, -1.25 * scale);
  s.lineTo(-w, 0.25 * scale);
  s.quadraticCurveTo(-w * 0.95, 1.25 * scale, 0, 1.7 * scale);
  return s;
}

function extrudeHull(scale: number, depth: number, bevel: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(hullShape(scale), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 14,
  });
  // shape Y (length) -> -Z (forward), extrusion -> +Y (up)
  g.rotateX(-Math.PI / 2);
  return g;
}

export class JetSki {
  readonly root = new THREE.Group();
  readonly attitude = new THREE.Group();
  readonly bars = new THREE.Group();
  readonly rider = new THREE.Group();
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(livery: SkiLivery = { accent: '#ec4a36', vest: '#ffc21a' }) {
    const white = this.mat(new THREE.MeshPhysicalMaterial({ color: '#f3f5f7', roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
    const coral = this.mat(new THREE.MeshPhysicalMaterial({ color: livery.accent, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
    const yellow = this.mat(new THREE.MeshStandardMaterial({ color: '#ffc21a', roughness: 0.45 }));
    const vest = livery.vest === '#ffc21a' ? yellow : this.mat(new THREE.MeshStandardMaterial({ color: livery.vest, roughness: 0.5 }));
    const navy = this.mat(new THREE.MeshStandardMaterial({ color: '#1b2433', roughness: 0.7 }));
    const black = this.mat(new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.55, metalness: 0.2 }));
    const chrome = this.mat(new THREE.MeshStandardMaterial({ color: '#c9d2da', roughness: 0.2, metalness: 0.9 }));
    const glass = this.mat(new THREE.MeshPhysicalMaterial({ color: '#7fb6d9', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.55 }));
    const skin = this.mat(new THREE.MeshStandardMaterial({ color: '#c98d64', roughness: 0.7 }));
    const suit = this.mat(new THREE.MeshStandardMaterial({ color: '#25324a', roughness: 0.8 }));

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.attitude) => {
      this.geometries.push(geo);
      const m = new THREE.Mesh(geo, mat);
      parent.add(m);
      return m;
    };

    // Lower hull: coral V-bottom band
    const lower = add(extrudeHull(0.92, 0.2, 0.12), coral);
    lower.position.y = -0.28;
    // Upper deck: white
    const deck = add(extrudeHull(1, 0.18, 0.1), white);
    deck.position.y = -0.02;
    // Yellow pin stripe between them
    const stripe = add(extrudeHull(1.015, 0.03, 0.01), yellow);
    stripe.position.y = -0.06;
    // Rubbing strake / keel under the bow
    const keel = add(new THREE.BoxGeometry(0.1, 0.12, 2.4), black);
    keel.position.set(0, -0.38, -0.1);

    // Front cowl / hood
    const cowlGeo = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const cowl = add(cowlGeo, white);
    cowl.scale.set(0.48, 0.3, 0.85);
    cowl.position.set(0, 0.28, -0.75);
    const cowlStripe = add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), coral);
    cowlStripe.scale.set(0.2, 0.31, 0.8);
    cowlStripe.position.set(0, 0.29, -0.78);
    // Windscreen
    const screen = add(new THREE.PlaneGeometry(0.62, 0.28), glass);
    screen.position.set(0, 0.62, -0.62);
    screen.rotation.x = -0.9;

    // Seat
    const seatGeo = new THREE.CapsuleGeometry(0.22, 1.05, 6, 14);
    seatGeo.rotateX(Math.PI / 2);
    const seat = add(seatGeo, navy);
    seat.scale.set(1.25, 1, 1);
    seat.position.set(0, 0.42, 0.45);
    // Rear deck footwells
    const well = add(new THREE.BoxGeometry(1.05, 0.06, 1.3), black);
    well.position.set(0, 0.2, 0.35);
    // Jet nozzle
    const nozzleGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.3, 14, 1, true);
    nozzleGeo.rotateX(Math.PI / 2);
    const nozzle = add(nozzleGeo, chrome);
    nozzle.position.set(0, -0.22, 1.48);
    // Side sponsons
    for (const side of [-1, 1]) {
      const sp = add(new THREE.BoxGeometry(0.06, 0.1, 0.7), black);
      sp.position.set(side * 0.55, -0.22, 1.05);
    }

    // Handlebars (rotate with steer about the column)
    this.bars.position.set(0, 0.6, -0.4);
    this.attitude.add(this.bars);
    const column = add(new THREE.CylinderGeometry(0.06, 0.08, 0.32, 10), black, this.bars);
    column.position.y = 0.08;
    column.rotation.x = 0.4;
    const barGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.84, 10);
    barGeo.rotateZ(Math.PI / 2);
    const bar = add(barGeo, chrome, this.bars);
    bar.position.set(0, 0.22, 0.06);
    for (const side of [-1, 1]) {
      const gripGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10);
      gripGeo.rotateZ(Math.PI / 2);
      const grip = add(gripGeo, black, this.bars);
      grip.position.set(side * 0.38, 0.22, 0.06);
    }
    const pod = add(new THREE.BoxGeometry(0.26, 0.08, 0.14), coral, this.bars);
    pod.position.set(0, 0.25, 0.0);

    // Rider
    this.rider.position.set(0, 0.5, 0.45);
    this.attitude.add(this.rider);
    for (const side of [-1, 1]) {
      const thigh = add(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), suit, this.rider);
      thigh.position.set(side * 0.2, 0.12, -0.12);
      thigh.rotation.x = Math.PI / 2 - 0.3;
      const shin = add(new THREE.CapsuleGeometry(0.085, 0.42, 4, 8), suit, this.rider);
      shin.position.set(side * 0.3, -0.12, -0.34);
      shin.rotation.x = 0.35;
      const boot = add(new THREE.BoxGeometry(0.14, 0.1, 0.26), black, this.rider);
      boot.position.set(side * 0.32, -0.32, -0.42);
    }
    const torso = add(new THREE.CapsuleGeometry(0.22, 0.42, 6, 12), vest, this.rider);
    torso.position.set(0, 0.55, -0.05);
    torso.rotation.x = -0.45;
    torso.scale.set(1.1, 1, 0.85);
    const vestBand = add(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 14), navy, this.rider);
    vestBand.position.set(0, 0.5, -0.03);
    vestBand.rotation.x = -0.45;
    vestBand.scale.set(1.1, 1, 0.85);
    for (const side of [-1, 1]) {
      const upper = add(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), suit, this.rider);
      upper.position.set(side * 0.3, 0.7, -0.3);
      upper.rotation.set(-1.05, 0, side * 0.25);
      const fore = add(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), skin, this.rider);
      fore.position.set(side * 0.36, 0.55, -0.6);
      fore.rotation.set(-1.5, 0, side * 0.1);
    }
    const neck = add(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), skin, this.rider);
    neck.position.set(0, 0.86, -0.22);
    const helmet = add(new THREE.SphereGeometry(0.17, 18, 14), coral, this.rider);
    helmet.position.set(0, 1.0, -0.27);
    const helmetStripe = add(new THREE.SphereGeometry(0.172, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), white, this.rider);
    helmetStripe.position.copy(helmet.position);
    helmetStripe.scale.set(0.35, 1, 1);
    const visor = add(new THREE.SphereGeometry(0.15, 16, 10, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.35, Math.PI * 0.3), black, this.rider);
    visor.position.set(0, 0.99, -0.3);
    visor.rotation.y = Math.PI;

    this.root.add(this.attitude);
    // Fewer draw calls: merge the static parts of each animated group by material.
    for (const g of [this.attitude, this.bars, this.rider]) this.mergeGroup(g);
  }

  private mergeGroup(group: THREE.Object3D): void {
    const byMat = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of [...group.children]) {
      if (!(c instanceof THREE.Mesh)) continue;
      const list = byMat.get(c.material as THREE.Material) ?? [];
      list.push(c);
      byMat.set(c.material as THREE.Material, list);
    }
    for (const [mat, meshes] of byMat) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((m) => {
        m.updateMatrix();
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        return g;
      });
      const merged = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      if (!merged) continue;
      for (const m of meshes) group.remove(m);
      this.geometries.push(merged);
      group.add(new THREE.Mesh(merged, mat));
    }
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  /**
   * Visuals follow the sim. roll > 0 leans right; three's +Z rotation leans
   * left for a -Z facing model, hence the minus sign.
   */
  apply(
    x: number, y: number, z: number, heading: number, pitch: number, roll: number,
    steer: number, airborne: boolean, wipeT: number, time: number,
  ): void {
    this.root.position.set(x, y + 0.32, z);
    this.root.rotation.set(0, heading, 0);
    this.attitude.rotation.set(pitch, 0, -roll, 'YXZ');
    // Steer right turns the bars clockwise from above (negative yaw).
    this.bars.rotation.y = -steer * 0.45;
    // Rider shifts weight into the turn and crouches/extends in the air.
    const crouch = airborne ? 0.08 : Math.sin(time * 9) * 0.01;
    this.rider.position.set(steer * 0.08, 0.5 + crouch, 0.45);
    this.rider.rotation.set(airborne ? -0.12 : 0, 0, -steer * 0.22);
    if (wipeT > 0) {
      // Rider thrown clear of the ski in an arc during a wipeout.
      const k = 1 - wipeT;
      this.rider.position.set(Math.sin(k * 3) * 1.3, 0.5 + Math.sin(Math.min(1, k * 1.6) * Math.PI) * 1.6 - k * 0.8, 0.45 + k * 2.4);
      this.rider.rotation.set(k * 6, 0, k * 3);
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
