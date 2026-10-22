import * as THREE from 'three';

// Procedural bottlenose dolphin: lathed body with counter-shaded vertex colours,
// extruded fins and a pivoting tail stock that beats up and down.
const TOP = new THREE.Color('#3f7fb8');
const BELLY = new THREE.Color('#e9f6fb');

function shade(geometry: THREE.BufferGeometry, mixSharp = 2.5): void {
  geometry.computeVertexNormals();
  const n = geometry.getAttribute('normal');
  const colors = new Float32Array(n.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    const t = THREE.MathUtils.clamp(0.5 - n.getY(i) * mixSharp * 0.5 + 0.15, 0, 1);
    c.copy(TOP).lerp(BELLY, t * t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function lathe(profile: [number, number][], length: number, segments = 28): THREE.BufferGeometry {
  const pts = profile.map(([t, r]) => new THREE.Vector2(Math.max(r, 0.001), length * (0.5 - t)));
  const g = new THREE.LatheGeometry(pts.reverse(), segments);
  g.rotateX(-Math.PI / 2); // axis along z, nose toward -z
  g.scale(0.82, 0.92, 1);
  return g;
}

function finShape(points: [number, number][], depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 3) {
    shape.bezierCurveTo(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], points[i + 2][0], points[i + 2][1]);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export class DolphinModel {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly flukes = new THREE.Group();
  private readonly finL: THREE.Mesh;
  private readonly finR: THREE.Mesh;

  constructor() {
    const L = 2.5;
    const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.02 });
    const finMat = new THREE.MeshStandardMaterial({ color: '#3a76ad', roughness: 0.4 });

    const bodyGeo = lathe(
      [
        [0, 0.035], [0.03, 0.07], [0.08, 0.085], [0.12, 0.1], [0.16, 0.19], [0.22, 0.25],
        [0.32, 0.3], [0.45, 0.31], [0.58, 0.27], [0.7, 0.2], [0.8, 0.13], [0.82, 0.12],
      ],
      L,
    );
    shade(bodyGeo);
    const bodyMesh = new THREE.Mesh(bodyGeo, skin);
    this.body.add(bodyMesh);

    // Eyes with a little highlight: friendly, readable from behind-ish.
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#12202b', roughness: 0.2 });
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), eyeMat);
      eye.position.set(side * 0.17, 0.05, -L * 0.5 + 0.47);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), glintMat);
      glint.position.set(side * 0.025, 0.02, -0.02);
      eye.add(glint);
      this.body.add(eye);
    }

    // Dorsal fin (swept back).
    const dorsal = new THREE.Mesh(
      finShape([[0, 0], [0.12, 0.2], [0.3, 0.42], [0.46, 0.46], [0.36, 0.34], [0.38, 0.12], [0.6, 0]], 0.05),
      finMat,
    );
    dorsal.rotation.y = Math.PI / 2;
    dorsal.position.set(0, 0.22, 0.05);
    this.body.add(dorsal);

    const pect = finShape([[0, 0], [0.1, -0.05], [0.3, -0.16], [0.42, -0.2], [0.3, -0.06], [0.2, 0.04], [0, 0.06]], 0.03);
    this.finL = new THREE.Mesh(pect, finMat);
    this.finL.rotation.set(Math.PI / 2, 0, Math.PI + 0.5);
    this.finL.position.set(-0.2, -0.13, -0.32);
    this.finR = new THREE.Mesh(pect, finMat);
    this.finR.rotation.set(Math.PI / 2, Math.PI, Math.PI + 0.5);
    this.finR.position.set(0.2, -0.13, -0.32);
    this.finR.scale.z = -1;
    this.body.add(this.finL, this.finR);

    // Tail stock pivots at the rear of the body.
    this.tail.position.z = L * 0.32;
    const stock = lathe([[0, 0.13], [0.4, 0.09], [0.8, 0.05], [1, 0.035]], 0.62, 20);
    stock.translate(0, 0, 0.31);
    shade(stock);
    this.tail.add(new THREE.Mesh(stock, skin));
    this.flukes.position.z = 0.6;
    const flukeGeo = finShape([[0, -0.05], [0.25, -0.05], [0.42, 0.05], [0.5, 0.25], [0.3, 0.2], [0.15, 0.12], [0, 0.18]], 0.035);
    for (const side of [-1, 1]) {
      const f = new THREE.Mesh(flukeGeo, finMat);
      f.rotation.x = -Math.PI / 2;
      f.scale.x = side;
      this.flukes.add(f);
    }
    this.tail.add(this.flukes);
    this.body.add(this.tail);

    this.group.add(this.body);
    this.body.rotation.order = 'YXZ';
  }

  /** Orientation: yaw (heading + spin), pitch (nose up +), roll. */
  pose(yaw: number, pitch: number, roll: number, tailPhase: number, airborne: boolean): void {
    this.body.rotation.set(pitch, yaw, roll, 'YXZ');
    const beat = Math.sin(tailPhase) * (airborne ? 0.12 : 0.32);
    this.tail.rotation.x = beat;
    this.flukes.rotation.x = beat * 0.9;
    const finFlap = airborne ? 0.35 : Math.sin(tailPhase * 0.5) * 0.08;
    this.finL.rotation.y = finFlap;
    this.finR.rotation.y = Math.PI - finFlap;
  }
}
