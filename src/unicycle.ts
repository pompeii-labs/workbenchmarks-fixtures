import * as THREE from 'three';
import { CRANK_L, PEDAL_X, SEAT_H, WHEEL_R, PIN_GRIP } from './motion';
import { mergeInto } from './rig';

export const PEDAL_TOP = 0.014; // pedal top surface above the spindle

export class Unicycle {
  /** Pivot at the axle; rotate x for fore-aft lean, z for sideways lean. */
  readonly frame = new THREE.Group();
  /** Spins about x with the wheel; carries spokes and cranks (direct drive). */
  readonly wheel = new THREE.Group();
  readonly pedals: THREE.Group[] = [];
  /** Material point on the tyre for the slip probe (wheel-local). */
  readonly seatTop = new THREE.Vector3(0, SEAT_H - WHEEL_R, 0);

  constructor() {
    const tyre = new THREE.MeshStandardMaterial({ color: '#1d1c1f', roughness: 0.85 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.22, metalness: 1.0 });
    const paint = new THREE.MeshStandardMaterial({ color: '#c8202c', roughness: 0.32, metalness: 0.25 });
    const gold = new THREE.MeshStandardMaterial({ color: '#e7b443', roughness: 0.3, metalness: 0.8 });
    const saddle = new THREE.MeshStandardMaterial({ color: '#2a1714', roughness: 0.55 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.7 });

    this.frame.position.y = WHEEL_R;
    this.frame.add(this.wheel);

    const tyreGeo = new THREE.TorusGeometry(WHEEL_R - 0.021, 0.021, 14, 64);
    tyreGeo.rotateY(Math.PI / 2);
    this.wheel.add(new THREE.Mesh(tyreGeo, tyre));
    const rimGeo = new THREE.TorusGeometry(WHEEL_R - 0.044, 0.009, 8, 64);
    rimGeo.rotateY(Math.PI / 2);
    this.wheel.add(new THREE.Mesh(rimGeo, chrome));
    // Painted rim stripes so the spin reads clearly.
    for (let i = 0; i < 4; i++) {
      const arc = new THREE.TorusGeometry(WHEEL_R - 0.043, 0.0105, 6, 10, Math.PI / 5);
      arc.rotateZ((i * Math.PI) / 2);
      arc.rotateY(Math.PI / 2);
      this.wheel.add(new THREE.Mesh(arc, i % 2 ? gold : paint));
    }
    // Spokes.
    const spokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 20; i++) {
      const g = new THREE.CylinderGeometry(0.0022, 0.0022, WHEEL_R - 0.05, 4);
      g.translate(0, (WHEEL_R - 0.05) / 2, 0);
      g.rotateZ(i % 2 ? 0.03 : -0.03);
      g.translate(i % 2 ? 0.02 : -0.02, 0, 0);
      g.rotateX((i / 20) * Math.PI * 2);
      spokes.push(g);
    }
    this.wheel.add(new THREE.Mesh(mergeInto(spokes), chrome));
    const hub = new THREE.CylinderGeometry(0.022, 0.022, 0.07, 16);
    hub.rotateZ(Math.PI / 2);
    this.wheel.add(new THREE.Mesh(hub, chrome));

    // Cranks at opposite angles, then pedals that the feet keep level.
    for (const side of [-1, 1]) {
      const crank = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, CRANK_L + 0.02), chrome);
      const dir = side === -1 ? 1 : -1; // right crank forward at angle 0, left crank back
      crank.position.set(side * 0.055, 0, (dir * CRANK_L) / 2);
      this.wheel.add(crank);
      const pedal = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.06), rubber);
      body.position.set(side * 0.01, PEDAL_TOP - 0.01, 0);
      pedal.add(body);
      const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 6), chrome);
      spindle.rotation.z = Math.PI / 2;
      pedal.add(spindle);
      pedal.position.set(side * PEDAL_X, 0, dir * CRANK_L);
      this.wheel.add(pedal);
      this.pedals.push(pedal);
    }

    // Fork, crown, seat post, saddle.
    const top = SEAT_H - WHEEL_R;
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, WHEEL_R + 0.04, 10), paint);
      leg.position.set(side * 0.042, (WHEEL_R + 0.04) / 2, 0);
      this.frame.add(leg);
      const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), chrome);
      bearing.rotation.z = Math.PI / 2;
      bearing.position.set(side * 0.042, 0, 0);
      this.frame.add(bearing);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.04), paint);
    crown.position.y = WHEEL_R + 0.045;
    this.frame.add(crown);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, top - WHEEL_R - 0.04, 10), chrome);
    post.position.y = (top + WHEEL_R + 0.04) / 2 - 0.02;
    this.frame.add(post);
    const seatGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    seatGeo.scale(0.07, 0.03, 0.13);
    const seat = new THREE.Mesh(seatGeo, saddle);
    seat.position.y = top - 0.028;
    this.frame.add(seat);
    const seatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.012, 20), gold);
    seatBase.scale.z = 1.8;
    seatBase.position.y = top - 0.032;
    this.frame.add(seatBase);

    this.frame.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
}

/** Bowling pin. Origin at the centre of mass; +Y toward the head; the neck is the grip. */
export function createPin(): THREE.Mesh {
  const H = 0.3;
  const comY = 0.112;
  const neckY = comY + PIN_GRIP;
  const prof: [number, number][] = [
    [0.0, 0.0],
    [0.03, 0.0],
    [0.036, 0.008],
    [0.05, 0.04],
    [0.058, 0.08],
    [0.058, 0.11],
    [0.05, 0.145],
    [0.035, 0.18],
    [0.022, neckY - 0.01],
    [0.0205, neckY + 0.008],
    [0.026, 0.24],
    [0.031, 0.262],
    [0.028, 0.282],
    [0.017, 0.296],
    [0.0, H],
  ];
  // Densify around the stripe edges so the colour bands are crisp.
  const stripes: [number, number][] = [
    [0.19, 0.2],
    [0.205, 0.215],
  ];
  const ys = new Set<number>(prof.map((p) => p[1]));
  for (const [a, b] of stripes) for (const y of [a - 0.0005, a, b, b + 0.0005]) ys.add(y);
  const sorted = [...ys].sort((a, b) => a - b);
  const radiusAt = (y: number) => {
    for (let i = 1; i < prof.length; i++) {
      if (y <= prof[i][1]) {
        const [r0, y0] = prof[i - 1];
        const [r1, y1] = prof[i];
        const k = (y - y0) / Math.max(1e-6, y1 - y0);
        const s = k * k * (3 - 2 * k);
        return r0 + (r1 - r0) * (0.5 * k + 0.5 * s);
      }
    }
    return 0;
  };
  // Smoother silhouette: sample more points between profile keys.
  const fine: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    fine.push(sorted[i]);
    const gap = sorted[i + 1] - sorted[i];
    const n = Math.floor(gap / 0.008);
    for (let k = 1; k < n; k++) fine.push(sorted[i] + (gap * k) / n);
  }
  fine.push(H);
  const pts = fine.map((y) => new THREE.Vector2(radiusAt(y), y - comY));
  const geo = new THREE.LatheGeometry(pts, 28);
  const white = new THREE.Color('#f7f4ee');
  const red = new THREE.Color('#c41d2a');
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) + comY;
    const inStripe = stripes.some(([a, b]) => y >= a - 1e-4 && y <= b + 1e-4);
    const c = inStripe ? red : white;
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
