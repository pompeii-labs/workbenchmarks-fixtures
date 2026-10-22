import * as THREE from 'three';

// Procedural dolphin: lathe body with a countershaded vertex-color gradient,
// swept fins and flukes. Nose points to -z. The tail group flexes for swimming.
export class DolphinModel {
  readonly group = new THREE.Group(); // positioned/oriented by the game
  private readonly tail = new THREE.Group();
  private readonly flukes = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;

  constructor() {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.38,
      metalness: 0.05,
      emissive: new THREE.Color('#2a5f80'),
      emissiveIntensity: 0.3,
    });
    const top = new THREE.Color('#3f6f9e');
    const mid = new THREE.Color('#79a7cf');
    const belly = new THREE.Color('#f2ece4');

    // Body profile along the length (radius at t from nose to tail stock).
    const profile: THREE.Vector2[] = [];
    const len = 2.6;
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let r: number;
      if (t < 0.1) r = 0.07 + t * 0.6; // rostrum
      else if (t < 0.18) r = 0.13 + (t - 0.1) * 3.2; // melon
      else r = 0.39 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.05) / 1.0)), 0.75) + 0.02;
      if (t > 0.72) r *= 1 - (t - 0.72) * 2.2;
      profile.push(new THREE.Vector2(Math.max(0.035, r), t * len));
    }
    profile[0].x = 0.001;
    const bodyGeo = new THREE.LatheGeometry(profile, 20);
    bodyGeo.rotateX(Math.PI / 2); // nose at z=0, tail toward +z
    bodyGeo.translate(0, 0, -len * 0.42);
    // Flatten a touch and add countershading.
    const pos = bodyGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      pos.setY(i, y * 0.92);
      pos.setX(i, x * 0.94);
      const n = y / (Math.hypot(x, y) + 1e-5);
      if (n > 0.1) c.copy(mid).lerp(top, Math.min(1, (n - 0.1) / 0.6));
      else c.copy(mid).lerp(belly, Math.min(1, (0.1 - n) / 0.45));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    bodyGeo.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeo, this.material);
    this.group.add(body);

    const finMat = new THREE.MeshStandardMaterial({ color: '#4f7fb0', roughness: 0.42, emissive: '#1d4766', side: THREE.DoubleSide });
    // Dorsal fin: swept-back curved triangle, extruded thin.
    const dorsal = new THREE.Shape();
    dorsal.moveTo(0, 0);
    dorsal.quadraticCurveTo(0.12, 0.32, 0.42, 0.48);
    dorsal.quadraticCurveTo(0.3, 0.2, 0.5, 0);
    dorsal.lineTo(0, 0);
    const dorsalGeo = new THREE.ExtrudeGeometry(dorsal, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    dorsalGeo.rotateY(-Math.PI / 2);
    dorsalGeo.translate(0.025, 0.3, 0.05);
    this.group.add(new THREE.Mesh(dorsalGeo, finMat));

    // Pectoral flippers.
    const flip = new THREE.Shape();
    flip.moveTo(0, 0);
    flip.quadraticCurveTo(0.2, -0.05, 0.5, -0.32);
    flip.quadraticCurveTo(0.22, -0.12, 0.0, -0.16);
    flip.lineTo(0, 0);
    const flipGeo = new THREE.ExtrudeGeometry(flip, { depth: 0.03, bevelEnabled: false });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(flipGeo, finMat);
      m.rotation.order = 'ZXY';
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -0.55 * side;
      m.scale.x = side;
      m.position.set(side * 0.24, -0.2, -0.38);
      this.group.add(m);
    }

    // Tail stock + flukes.
    this.tail.position.set(0, 0, len * 0.58 - 0.08);
    this.group.add(this.tail);
    this.flukes.position.set(0, 0, 0.12);
    this.tail.add(this.flukes);
    const fluke = new THREE.Shape();
    fluke.moveTo(0, 0);
    fluke.quadraticCurveTo(0.2, 0.06, 0.52, 0.32);
    fluke.quadraticCurveTo(0.3, 0.32, 0.08, 0.28);
    fluke.quadraticCurveTo(0.03, 0.2, 0, 0.2);
    fluke.lineTo(0, 0);
    const flukeGeo = new THREE.ExtrudeGeometry(fluke, { depth: 0.03, bevelEnabled: false });
    flukeGeo.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(flukeGeo, finMat);
      m.scale.x = side;
      m.position.y = 0.015;
      this.flukes.add(m);
    }

    // Eyes.
    const eyeGeo = new THREE.SphereGeometry(0.04, 10, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#141822', roughness: 0.15 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.2, 0.06, -0.62);
      this.group.add(eye);
    }
  }

  animate(phase: number, airborne: boolean): void {
    const amp = airborne ? 0.12 : 0.32;
    this.tail.rotation.x = Math.sin(phase) * amp * 0.5;
    this.flukes.rotation.x = Math.sin(phase - 0.9) * amp;
  }

  setUnderwater(depth: number): void {
    // A soft cyan glow keeps the dolphin readable through the water surface.
    this.material.emissiveIntensity = 0.3 + Math.min(0.7, Math.max(0, depth) * 0.3);
  }
}
