import * as THREE from 'three';
import { AXLE_HEIGHT } from './motion.js';

const sphere = new THREE.SphereGeometry(1, 24, 16);
const axis = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const featherMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide });

export const materials = {
  ivory: new THREE.MeshStandardMaterial({ color: '#f5f1df', roughness: 0.72 }),
  feather: new THREE.MeshStandardMaterial({ color: '#e6e6d7', roughness: 0.85 }),
  cream: new THREE.MeshStandardMaterial({ color: '#fff9e8', roughness: 0.6 }),
  charcoal: new THREE.MeshStandardMaterial({ color: '#344747', roughness: 0.78 }),
  bill: new THREE.MeshStandardMaterial({ color: '#efa637', roughness: 0.42 }),
  pouch: new THREE.MeshStandardMaterial({ color: '#e5a15e', roughness: 0.8 }),
  billLine: new THREE.MeshStandardMaterial({ color: '#b87435', roughness: 0.7 }),
  orange: new THREE.MeshStandardMaterial({ color: '#df8734', roughness: 0.6 }),
  web: new THREE.MeshStandardMaterial({ color: '#e8a94d', roughness: 0.75, side: THREE.DoubleSide }),
  eyeRing: new THREE.MeshStandardMaterial({ color: '#bdc9b2', roughness: 0.6 }),
  eye: new THREE.MeshStandardMaterial({ color: '#152e31', roughness: 0.13 }),
  teal: new THREE.MeshStandardMaterial({ color: '#235a58', roughness: 0.27, metalness: 0.45 }),
  brass: new THREE.MeshStandardMaterial({ color: '#c2a36a', roughness: 0.33, metalness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#b8c9c2', roughness: 0.28, metalness: 0.82 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#273c3b', roughness: 0.93 }),
  sidewall: new THREE.MeshStandardMaterial({ color: '#b9ad8e', roughness: 0.93 }),
  leather: new THREE.MeshStandardMaterial({ color: '#8a4f36', roughness: 0.7 }),
  pin: new THREE.MeshStandardMaterial({ color: '#fff5dc', roughness: 0.24, metalness: 0.04 }),
  red: new THREE.MeshStandardMaterial({ color: '#c9533b', roughness: 0.3 }),
};

export function mesh(geometry, material, parent) {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = true;
  object.receiveShadow = true;
  parent?.add(object);
  return object;
}

export function ellipsoid(parent, material, position, scale) {
  const object = mesh(sphere, material, parent);
  object.position.set(...position);
  object.scale.set(...scale);
  return object;
}

export function rod(parent, material, start, end, radius = 0.03, endRadius = radius) {
  const object = mesh(new THREE.CylinderGeometry(endRadius, radius, 1, 12), material, parent);
  connect(object, start, end);
  return object;
}

export function connect(object, start, end) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  direction.subVectors(b, a);
  object.position.copy(a).add(b).multiplyScalar(0.5);
  object.scale.y = direction.length();
  object.quaternion.setFromUnitVectors(axis, direction.normalize());
}

function jointBetween(start, end, upperLength, lowerLength, bend) {
  const along = end.clone().sub(start);
  const distance = along.length();
  along.normalize();
  const a = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - a ** 2));
  const outward = new THREE.Vector3(...bend);
  outward.addScaledVector(along, -outward.dot(along)).normalize();
  return start.clone().addScaledVector(along, a).addScaledVector(outward, height);
}

export function tube(parent, material, points, radius = 0.02, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve, segments, radius, 8, false), material, parent);
}

function closedSurface(positions, indices, radialSegments) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  const average = new THREE.Vector3();
  // Coincident wrap vertices need shared normals to avoid a lighting seam.
  for (let first = 0; first < normals.count; first += radialSegments + 1) {
    const last = first + radialSegments;
    average.set(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
    normals.setXYZ(first, average.x, average.y, average.z);
    normals.setXYZ(last, average.x, average.y, average.z);
  }
  return geometry;
}

function organicTube(parent, material, points, radii) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(64, false);
  const positions = [], indices = [];
  for (let i = 0; i <= 64; i++) {
    const u = i / 64;
    const point = curve.getPointAt(u);
    const at = u * (radii.length - 1);
    const low = Math.floor(at);
    const r = THREE.MathUtils.lerp(radii[low], radii[Math.min(low + 1, radii.length - 1)], at - low);
    for (let j = 0; j <= 24; j++) {
      const a = j / 24 * Math.PI * 2;
      const p = point.clone().addScaledVector(frames.normals[i], r * Math.cos(a)).addScaledVector(frames.binormals[i], r * Math.sin(a));
      positions.push(p.x, p.y, p.z);
      if (i < 64 && j < 24) {
        const k = i * 25 + j;
        indices.push(k, k + 25, k + 1, k + 1, k + 25, k + 26);
      }
    }
  }
  const geometry = closedSurface(positions, indices, 24);
  return mesh(geometry, material, parent);
}

// Flattened, softly ridged feathers, rather than a collection of spherical fingers.
function feather(parent, length, width, dark = false) {
  const positions = [], indices = [], colors = [];
  const pale = new THREE.Color('#f3f0df');
  const tip = new THREE.Color('#354848');
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const w = width * Math.pow(Math.sin(Math.PI * t), 0.65);
    for (let j = 0; j <= 8; j++) {
      const a = j / 8 * Math.PI * 2;
      positions.push(w * Math.cos(a), -length * t, 0.045 * Math.sin(Math.PI * t) * Math.sin(a) + 0.09 * t * t);
      const color = dark && t > 0.58 ? tip : pale;
      colors.push(color.r, color.g, color.b);
      if (i < 16 && j < 8) {
        const k = i * 9 + j;
        indices.push(k, k + 1, k + 9, k + 1, k + 10, k + 9);
      }
    }
  }
  const geometry = closedSurface(positions, indices, 8);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return mesh(geometry, featherMaterial, parent);
}

function billShape(parent, material, sections) {
  const positions = [], indices = [];
  const curve = new THREE.CatmullRomCurve3(sections.map((s) => new THREE.Vector3(s[0], s[1], s[2])));
  // Section values encode z, center-y, width; height is interpolated separately.
  for (let i = 0; i <= 48; i++) {
    const u = i / 48;
    const p = curve.getPoint(u);
    const hAt = u * (sections.length - 1);
    const n = Math.floor(hAt);
    const h = THREE.MathUtils.lerp(sections[n][3], sections[Math.min(n + 1, sections.length - 1)][3], hAt - n);
    for (let j = 0; j <= 32; j++) {
      const a = j / 32 * Math.PI * 2;
      positions.push(p.z * Math.cos(a), p.y + h * Math.sin(a), p.x);
      if (i < 48 && j < 32) {
        const k = i * 33 + j;
        indices.push(k, k + 1, k + 33, k + 1, k + 34, k + 33);
      }
    }
  }
  const geometry = closedSurface(positions, indices, 32);
  return mesh(geometry, material, parent);
}

export function createPelican(parent) {
  const bird = new THREE.Group();
  parent.add(bird);
  const bodyGeometry = new THREE.SphereGeometry(1, 40, 28);
  const vertices = bodyGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    vertices.setXYZ(i, x * .81 * (1 - .16 * y), y * .99, z * .79 + .16 * (1 - y * y));
  }
  bodyGeometry.computeVertexNormals();
  mesh(bodyGeometry, materials.ivory, bird).position.set(0, 3.08, -.12);
  for (let i = 0; i < 7; i++) {
    const f = feather(bird, 0.67 + 0.07 * Math.cos(i), 0.13, i < 2 || i > 4);
    f.position.set((i - 3) * 0.11, 2.79, -0.72);
    f.rotation.set(1.04, 0, (i - 3) * -0.13);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const f = feather(bird, 0.6, 0.12);
      f.position.set(side * (0.59 + 0.02 * i), 3.25 - i * 0.11, -0.28);
      f.rotation.set(0.18, side * 0.4, side * 0.18);
    }
  }
  const neck = new THREE.Group();
  neck.position.set(0, 3.5, 0.12);
  bird.add(neck);
  organicTube(neck, materials.ivory,
    [[0, -0.3, 0.03], [0, 0.06, 0.02], [0, 0.46, -0.16], [0, 0.87, -0.10], [0, 1.12, 0.16], [0, 1.19, 0.38]],
    [0.32, 0.25, 0.18, 0.175, 0.21, 0.24]);
  const head = new THREE.Group();
  head.position.set(0, 1.18, 0.39);
  neck.add(head);
  ellipsoid(head, materials.cream, [0, 0.04, -0.04], [0.285, 0.30, 0.39]);
  billShape(head, materials.pouch, [
    [0.17, -0.10, 0.18, 0.07], [0.42, -0.25, 0.25, 0.23],
    [0.75, -0.29, 0.235, 0.25], [1.12, -0.22, 0.17, 0.17],
    [1.48, -0.095, 0.074, 0.065], [1.70, -0.035, 0.006, 0.008],
  ]);
  billShape(head, materials.bill, [
    [0.17, 0.01, 0.20, 0.075], [0.43, 0.005, 0.235, 0.075],
    [0.85, -0.005, 0.19, 0.055], [1.24, -0.012, 0.12, 0.045],
    [1.56, -0.018, 0.052, 0.045], [1.73, -0.06, 0.006, 0.015],
  ]);
  for (const side of [-1, 1]) {
    tube(head, materials.billLine, [[side * .205, -.035, .24], [side * .231, -.054, .47], [side * .184, -.057, .86], [side * .105, -.055, 1.29], [side * .02, -.059, 1.67]], 0.009);
    tube(head, materials.orange, [[side * .16, -.18, .31], [side * .21, -.39, .62], [side * .15, -.37, .99], [side * .07, -.17, 1.43]], .006);
    ellipsoid(head, materials.eyeRing, [side * .258, .108, .08], [.032, .10, .11]);
    ellipsoid(head, materials.eye, [side * .282, .117, .102], [.028, .061, .066]);
    ellipsoid(head, materials.cream, [side * .304, .139, .129], [.007, .015, .015]);
    const brow = ellipsoid(head, materials.ivory, [side * .245, .202, .066], [.055, .042, .14]);
    brow.rotation.x = -.12;
    ellipsoid(head, materials.billLine, [side * .16, .055, .4], [.026, .012, .065]);
  }
  for (let i = 0; i < 3; i++) {
    const tuft = feather(head, .30 + i * .035, .065);
    tuft.position.set((i - 1) * .07, .255, -.14);
    tuft.rotation.set(2.15, 0, (i - 1) * -.12);
  }
  const wings = [-1, 1].map((side) => {
    const shoulder = ellipsoid(bird, materials.ivory, [side * .64, 3.39, -.08], [.30, .40, .35]);
    const upper = new THREE.Group();
    const lower = new THREE.Group();
    bird.add(upper, lower);
    ellipsoid(upper, materials.ivory, [0, .5, 0], [.22, .63, .16]);
    for (let i = 0; i < 5; i++) {
      const f = feather(upper, .48 + i * .035, .13, false);
      f.position.set(side * .08, .15 + i * .17, -.015);
      f.rotation.z = side * (.60 + i * .06);
    }
    ellipsoid(lower, materials.cream, [0, .5, 0], [.13, .56, .12]);
    for (let i = 0; i < 7; i++) {
      const f = feather(lower, .68 - i * .042, .105, true);
      f.position.set(side * .02, .08 + i * .14, -.045);
      f.rotation.z = side * (.54 + i * .13);
    }
    const wrist = new THREE.Group();
    bird.add(wrist);
    ellipsoid(wrist, materials.cream, [0, -.06, 0], [.12, .13, .13]);
    for (let i = 0; i < 3; i++) {
      tube(wrist, materials.ivory, [[side * (.08 - i * .05), -.09, -.02], [side * (.14 - i * .045), .01, .08], [side * (.08 - i * .04), .085, .07]], .024, 12);
    }
    return { side, shoulder, upper, lower, wrist };
  });
  return { bird, neck, head, wings };
}

export function poseWing(wing, hand) {
  const { side, upper, lower, wrist } = wing;
  const shoulder = new THREE.Vector3(side * .65, 3.4, -.06);
  const target = new THREE.Vector3(hand.x, hand.y, hand.z);
  const elbow = jointBetween(shoulder, target, .86, 1.02, [side * .45, -.6, -.2]);
  for (const [object, from, to] of [[upper, shoulder, elbow], [lower, elbow, target]]) {
    direction.subVectors(to, from);
    object.position.copy(from);
    object.scale.y = direction.length();
    object.quaternion.setFromUnitVectors(axis, direction.normalize());
  }
  wrist.position.copy(target);
  wrist.rotation.z = -side * .22;
}

function foot(parent) {
  const group = new THREE.Group();
  parent.add(group);
  const shape = new THREE.Shape();
  shape.moveTo(-.09, -.13);
  shape.quadraticCurveTo(-.14, .00, -.25, .27);
  shape.quadraticCurveTo(-.26, .32, -.20, .33);
  shape.lineTo(-.075, .28);
  shape.quadraticCurveTo(0, .42, .045, .39);
  shape.lineTo(.12, .29);
  shape.quadraticCurveTo(.29, .34, .27, .26);
  shape.lineTo(.10, -.11);
  shape.quadraticCurveTo(0, -.19, -.09, -.13);
  const web = mesh(new THREE.ExtrudeGeometry(shape, { depth: .043, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .022, bevelThickness: .015, curveSegments: 8 }), materials.web, group);
  web.rotation.x = Math.PI / 2;
  for (const [x, z] of [[-.22, .29], [.02, .36], [.24, .28]]) {
    tube(group, materials.orange, [[0, .045, -.09], [x * .4, .015, .1], [x, .005, z]], .016, 12);
  }
  return group;
}

export function createUnicycle(parent) {
  const wheel = new THREE.Group();
  wheel.position.y = AXLE_HEIGHT;
  parent.add(wheel);
  const tire = mesh(new THREE.TorusGeometry(.685, .075, 16, 80), materials.rubber, wheel);
  tire.rotation.y = Math.PI / 2;
  for (const side of [-1, 1]) {
    const wall = mesh(new THREE.TorusGeometry(.678, .033, 12, 80), materials.sidewall, wheel);
    wall.rotation.y = Math.PI / 2;
    wall.position.x = side * .053;
    const rim = mesh(new THREE.TorusGeometry(.627, .026, 10, 80), materials.chrome, wheel);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = side * .035;
  }
  rod(wheel, materials.brass, [-.16, 0, 0], [.16, 0, 0], .10);
  const spokes = new THREE.InstancedMesh(new THREE.CylinderGeometry(.008, .008, 1, 6), materials.chrome, 28);
  spokes.castShadow = true;
  spokes.receiveShadow = true;
  wheel.add(spokes);
  const spoke = new THREE.Object3D();
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    const b = a + (i % 2 ? .17 : -.17);
    connect(spoke, [i % 2 ? -.065 : .065, .075 * Math.cos(b), .075 * Math.sin(b)], [0, .622 * Math.cos(a), .622 * Math.sin(a)]);
    spoke.updateMatrix();
    spokes.setMatrixAt(i, spoke.matrix);
  }
  // A valve and alternating spoke lacing make the wheel's rotation legible.
  rod(wheel, materials.brass, [0, .57, 0], [0, .63, 0], .017);
  const frame = new THREE.Group();
  frame.position.y = AXLE_HEIGHT;
  parent.add(frame);
  for (const side of [-1, 1]) {
    tube(frame, materials.teal, [[side * .13, 0, 0], [side * .18, .44, 0], [side * .16, .82, 0], [0, .99, 0]], .045);
    ellipsoid(frame, materials.brass, [side * .145, 0, 0], [.05, .09, .09]);
  }
  rod(frame, materials.chrome, [0, .93, 0], [0, 1.34, 0], .043);
  rod(frame, materials.brass, [0, .96, 0], [0, 1.03, 0], .063);
  ellipsoid(frame, materials.leather, [0, 1.38, 0], [.25, .085, .35]);
  const cranks = [-1, 1].map((side) => {
    const crank = rod(parent, materials.brass, [0, 0, 0], [0, 1, 0], .029);
    const pedal = mesh(new THREE.BoxGeometry(.24, .065, .19), materials.rubber, parent);
    const footMesh = foot(parent);
    const thigh = ellipsoid(parent, materials.ivory, [0, 0, 0], [.185, 1, .19]);
    const shin = rod(parent, materials.orange, [0, 0, 0], [0, 1, 0], .045, .056);
    const joint = ellipsoid(parent, materials.orange, [0, 0, 0], [.062, .075, .068]);
    return { side, crank, pedal, foot: footMesh, thigh, shin, joint };
  });
  return { wheel, frame, cranks };
}

export function poseLegs(cycle, angle, pitch, roll) {
  cycle.wheel.rotation.x = angle;
  for (const leg of cycle.cranks) {
    const { side, crank, pedal, foot, thigh, shin, joint } = leg;
    const phase = angle + (side === -1 ? Math.PI : 0);
    const y = AXLE_HEIGHT + .28 * Math.cos(phase);
    const z = .28 * Math.sin(phase);
    const x = side * .32;
    connect(crank, [side * .17, AXLE_HEIGHT, 0], [side * .24, y, z]);
    pedal.position.set(x, y, z);
    pedal.rotation.set(-pitch, 0, -roll, 'XYZ');
    foot.position.set(x, y + .09, z - .015);
    foot.rotation.set(-pitch, side * .12, -roll, 'XYZ');
    const hip = [side * .37, 2.45, -.08];
    const ankle = [x, y + .12, z - .09];
    const knee = jointBetween(new THREE.Vector3(...hip), new THREE.Vector3(...ankle), .8, 1.05, [side * .1, 0, -1]).toArray();
    connect(thigh, hip, knee);
    thigh.scale.y *= .60;
    connect(shin, knee, ankle);
    joint.position.set(...knee);
  }
}

export function createPin(parent) {
  const pin = new THREE.Group();
  parent.add(pin);
  const points = [
    [0, -.48], [.105, -.48], [.15, -.45], [.185, -.36], [.19, -.24],
    [.17, -.1], [.125, .04], [.085, .17], [.073, .28], [.085, .36],
    [.12, .41], [.128, .47], [.10, .53], [.055, .565], [0, .575],
  ];
  const curve = new THREE.SplineCurve(points.map((p) => new THREE.Vector2(...p)));
  mesh(new THREE.LatheGeometry(curve.getPoints(64), 32), materials.pin, pin);
  for (const [y, r] of [[.223, .078], [.294, .076]]) {
    mesh(new THREE.CylinderGeometry(r, r + .002, .037, 32), materials.red, pin).position.y = y;
  }
  return pin;
}
