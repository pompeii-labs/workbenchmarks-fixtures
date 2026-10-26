import * as THREE from 'three/webgpu';
import { Fn, color, float, mix, mx_fractal_noise_float, positionWorld, smoothstep, oneMinus, vec3, length, fract, abs, sin } from 'three/tsl';

// Porcelain cup, saucer and a dark walnut table. Cup-local y = 0 is the rest
// surface of the liquid; inner wall radius is 1 there. Everything is lathed
// from authored profiles: no downloaded assets.

export const SAUCER_TOP = 0.085; // world y of the saucer well
export const CUP_BOTTOM_LOCAL = -0.625;
export const SURFACE_Y = SAUCER_TOP - CUP_BOTTOM_LOCAL; // world y of the liquid rest surface
export const RIM_HEIGHT = 0.22; // inner rim above the rest surface

function lathe(points: [number, number][], samples: number, segments: number): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(samples).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  const g = new THREE.LatheGeometry(pts, segments);
  return g;
}

export function createPorcelain(envIntensity = 1): THREE.MeshPhysicalNodeMaterial {
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: '#f4f0ea',
    roughness: 0.32,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: envIntensity,
  });
  return m;
}

export function createCup(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  // Profile runs from the inner bottom centre, up the inner wall, over the
  // lip, down the outside to the foot and back to the axis.
  const profile: [number, number][] = [
    [0.0, -0.46],
    [0.42, -0.45],
    [0.7, -0.39],
    [0.87, -0.27],
    [0.955, -0.12],
    [0.99, 0.0],
    [1.012, 0.1],
    [1.034, 0.19],
    [1.052, 0.226],
    [1.075, 0.238],
    [1.098, 0.232],
    [1.112, 0.212],
    [1.114, 0.17],
    [1.102, 0.05],
    [1.065, -0.14],
    [0.985, -0.33],
    [0.85, -0.49],
    [0.68, -0.575],
    [0.6, -0.6],
    [0.575, -0.625],
    [0.45, -0.628],
    [0.0, -0.6],
  ];
  const body = new THREE.Mesh(lathe(profile.slice().reverse(), 150, 112), material);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.02, 0.11, 0),
    new THREE.Vector3(1.22, 0.15, 0),
    new THREE.Vector3(1.43, 0.08, 0),
    new THREE.Vector3(1.5, -0.08, 0),
    new THREE.Vector3(1.4, -0.24, 0),
    new THREE.Vector3(1.18, -0.33, 0),
    new THREE.Vector3(0.94, -0.34, 0),
  ]);
  const handleGeo = new THREE.TubeGeometry(handleCurve, 56, 0.062, 14, false);
  handleGeo.scale(1, 1, 0.82); // slightly flattened ear
  const handle = new THREE.Mesh(handleGeo, material);
  handle.castShadow = true;
  handle.receiveShadow = true;
  const handlePivot = new THREE.Group();
  handlePivot.add(handle);
  handlePivot.rotation.y = -0.62; // toward the camera, on the right
  group.add(handlePivot);

  group.position.y = SURFACE_Y;
  return group;
}

export function createSaucer(material: THREE.Material): THREE.Mesh {
  const profile: [number, number][] = [
    [0.0, SAUCER_TOP],
    [0.62, SAUCER_TOP],
    [0.74, SAUCER_TOP + 0.004],
    [0.86, SAUCER_TOP + 0.02],
    [1.25, 0.135],
    [1.62, 0.19],
    [1.86, 0.238],
    [1.93, 0.252],
    [1.965, 0.245],
    [1.96, 0.226],
    [1.86, 0.2],
    [1.5, 0.13],
    [1.08, 0.06],
    [0.9, 0.03],
    [0.86, 0.004],
    [0.8, 0.0],
    [0.74, 0.012],
    [0.0, 0.03],
  ];
  const mesh = new THREE.Mesh(lathe(profile.slice().reverse(), 90, 112), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createTable(): THREE.Mesh {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0, envMapIntensity: 0.12 });
  m.colorNode = Fn(() => {
    const p = positionWorld.xz;
    // Walnut: long grain along x, warped rings, fine pores.
    const warp = mx_fractal_noise_float(vec3(p.x.mul(0.18), p.y.mul(1.1), 3.7), 3);
    const rings = fract(p.y.mul(2.6).add(warp.mul(2.2)));
    const ringBand = smoothstep(0.0, 0.18, rings).mul(oneMinus(smoothstep(0.55, 1.0, rings)));
    const pores = mx_fractal_noise_float(vec3(p.x.mul(1.2), p.y.mul(38), 1.3), 2).mul(0.5).add(0.5);
    const streak = abs(sin(p.y.mul(17).add(warp.mul(6)))).mul(0.12);
    const base = mix(color('#0f0805'), color('#2a170c'), ringBand.mul(0.7).add(streak));
    const toned = base.mul(pores.mul(0.35).add(0.75));
    // Product-shot falloff into darkness away from the cup.
    const fall = oneMinus(smoothstep(1.8, 6.0, length(p.sub(vec3(0, 0, 0.6).xz))));
    return toned.mul(fall.mul(0.95).add(0.05));
  })();
  m.roughnessNode = float(0.62);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
