// Scene 4, latte art: nearly overhead, a steel pitcher pours from the upper
// left into golden crema. The rosetta is not an image: it is a field built from
// the pour itself. Each wiggle of the pour point pushes a new milk front out
// of the crema, older fronts are pushed outward and stay separated by thin
// crema lines, and the final draw-through drags every line into a chevron.
//   0.00-0.28 high thin pour; milk dives, crema turns and lightens, no pattern
//   0.28-0.76 low wide pour; leaves surface from the base upward
//   0.76-0.90 a small heart, then a lift and a narrow draw-through
//   0.90-1.00 the pour stops, impact rings decay, a glossy settled cup
import * as THREE from 'three/webgpu';
import { abs, exp, float, max, mix, positionLocal, mx_fractal_noise_float, mx_noise_float, mx_worley_noise_float, oneMinus, sin, smoothstep, step, uniform, vec2, vec3 } from 'three/tsl';
import type { CraftScene } from '../types';
import {
  N,
  buildCup,
  buildPitcher,
  buildSaucer,
  cameraBackdrop,
  ceramicMaterial,
  col,
  contactShadow,
  createSteam,
  createStream,
  len,
  lerp,
  liquidSurface,
  range,
  ringLine,
  rotate2,
  sceneClock,
  smooth,
  steelMaterial,
} from '../kit';
import { addBarLights } from '../extraction';

const LEAVES = 8;
const LEAF_START = 0.3;
const LEAF_SPAN = 0.4; // last leaf is born at LEAF_START + LEAF_SPAN * (LEAVES-1)/LEAVES
const leafCentre = (k: number) => 0.13 - k * 0.074;
const leafRadius = (k: number) => 0.5 - k * 0.054;
const leafBirth = (k: number) => LEAF_START + (k * LEAF_SPAN) / LEAVES;
const HEART_S = -0.5;
const DRAW_FROM = -0.62;
const DRAW_TO = 0.8;

/** Pour point (x, s) on the unit surface for progress p; s points away from the pitcher. */
function pourPoint(p: number): [number, number] {
  if (p < 0.28) return [0.02 * Math.sin(p * 40), 0.02];
  if (p < 0.72) {
    const u = range(LEAF_START - 0.02, 0.72, p);
    const s = lerp(leafCentre(0) + 0.02, leafCentre(LEAVES - 1) - 0.01, u);
    // One side-to-side wiggle per leaf.
    const x = 0.075 * Math.sin(u * Math.PI * 2 * LEAVES * 0.5 * 2) * (1 - 0.5 * u);
    return [x, s];
  }
  if (p < 0.8) return [0, lerp(leafCentre(LEAVES - 1) - 0.01, HEART_S, smooth(0.72, 0.77, p))];
  if (p < 0.9) return [0, lerp(HEART_S, DRAW_TO, smooth(0.8, 0.9, p))];
  return [0, DRAW_TO];
}

export function create(): CraftScene {
  const clock = sceneClock();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
  scene.add(camera);
  const backdrop = cameraBackdrop(camera, (p) => {
    const c: N = mix(col('#232120'), col('#191817'), smoothstep(0.2, 0.9, len(p)));
    return mix(c, col('#6b4a3a'), ringLine(p, 0.62, -0.55, 0.5).mul(0.5));
  });
  addBarLights(scene, '#fff1df', 1.15);

  // Oxblood round table.
  const tableMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0 });
  const table = new THREE.Mesh(new THREE.CircleGeometry(17.5, 128), tableMat);
  // Worn lime-washed oxblood: a slow mottling, darker toward the rim.
  {
    const tp: N = positionLocal.xy;
    const wear: N = mx_fractal_noise_float(tp.mul(0.12), 2, 2.0, 0.5);
    const edge: N = smoothstep(11, 17.5, len(tp));
    tableMat.colorNode = mix(mix(col('#7a2a1d'), col('#873325'), smoothstep(-0.4, 0.5, wear)), col('#5a1d14'), edge.mul(0.6));
  }
  table.rotation.x = -Math.PI / 2;
  scene.add(table);
  const tableEdge = new THREE.Mesh(new THREE.RingGeometry(16.4, 16.5, 128), new THREE.MeshBasicNodeMaterial({ color: '#a0503c', toneMapped: false }));
  tableEdge.rotation.x = -Math.PI / 2;
  tableEdge.position.y = 0.01;
  scene.add(tableEdge);

  const cupGroup = new THREE.Group();
  const saucer = buildSaucer(ceramicMaterial('#d6c8b0', 0.34), 1.3);
  cupGroup.add(saucer.mesh);
  const cup = buildCup(ceramicMaterial('#ddd0bb', 0.3), 1.28, 1.12);
  cup.group.position.y = saucer.topY;
  cupGroup.add(cup.group);
  const shadow = contactShadow(10.5, 0.55, '#2a0c07');
  shadow.position.y = 0.03;
  cupGroup.add(shadow);
  scene.add(cupGroup);

  // Spoon resting on the saucer, upper right.
  const spoonMat = steelMaterial('#cfcbc2', 0.2);
  const spoon = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 12), spoonMat);
  bowl.scale.set(1, 0.25, 0.65);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6, 10), spoonMat);
  stem.rotation.z = Math.PI / 2;
  stem.position.x = -3.6;
  spoon.add(bowl, stem);
  spoon.position.set(6.4, saucer.topY * 1.0 + 0.55, -3.6);
  spoon.rotation.y = 2.4;
  cupGroup.add(spoon);

  // --------------------------------------------------------- latte surface
  const pour = uniform(new THREE.Vector2(0, 0)); // (x, s) on the unit surface
  const pourStrength = uniform(0);
  const pourWidth = uniform(0.1);
  const dive = uniform(0); // milk mixing under the crema in the first phase
  const turn = uniform(0);
  const disturb = uniform(1);
  const drawFront = uniform(DRAW_FROM);
  const drawAmount = uniform(0);
  const heart = uniform(0);
  const leafR = Array.from({ length: LEAVES }, () => uniform(0));

  const surface = liquidSurface((radius) => {
    const toXS = (p: N): N => vec2(p.x, p.y.negate());
    const height = (p: N) => {
      const xs = toXS(p);
      const d: N = len(xs.sub(pour)).mul(radius);
      const rings: N = sin(d.mul(7).sub(clock.mul(11))).mul(exp(d.mul(-0.55))).mul(0.018).mul(disturb);
      const dimple: N = exp(d.mul(d).mul(-1.2)).mul(-0.09).mul(pourStrength);
      const men: N = smoothstep(0.86, 1.0, len(p)).mul(0.08);
      return rings.add(dimple).add(men);
    };
    const pattern = (p: N): [N, N] => {
      const xs = toXS(p);
      // Draw-through drags the centre of every front toward the far side.
      const behind: N = oneMinus(smoothstep(drawFront.sub(0.03), drawFront.add(0.01), xs.y));
      const pull: N = exp(xs.x.mul(xs.x).mul(-260)).mul(0.085).mul(drawAmount).mul(behind);
      const q: N = vec2(xs.x, xs.y.sub(pull));
      let white: N = float(0);
      let halo: N = float(0);
      let lines: N = float(0);
      let prevInside: N = float(0);
      for (let k = 0; k < LEAVES; k += 1) {
        const wig = (k % 2 === 0 ? 1 : -1) * 0.018;
        const dv: N = vec2(q.x.sub(wig).div(1.22), q.y.sub(leafCentre(k)));
        const d: N = len(dv);
        const R: N = leafR[k];
        const inside: N = oneMinus(smoothstep(R.sub(0.012), R.add(0.006), d)).mul(step(0.001, R));
        white = max(white, inside);
        halo = max(halo, oneMinus(smoothstep(R, R.add(0.06), d)).mul(step(0.001, R)));
        if (k > 0) {
          // A thin crema line where this front meets the previous one, tapering toward its tips.
          const facing: N = dv.y.div(d.add(1e-4));
          const fan: N = smoothstep(-0.62, -0.05, facing);
          const wline: N = mix(float(0.004), float(0.013), fan);
          const ring: N = oneMinus(smoothstep(wline.mul(0.4), wline, abs(d.sub(R))));
          lines = max(lines, ring.mul(prevInside).mul(fan).mul(step(0.001, R)));
        }
        prevInside = inside;
      }
      // Small heart poured last at the near end.
      const hd: N = len(vec2(q.x.div(1.1), q.y.sub(HEART_S)));
      const heartIn: N = oneMinus(smoothstep(heart.mul(0.13).sub(0.01), heart.mul(0.13).add(0.006), hd)).mul(step(0.001, heart));
      white = max(white, heartIn);
      // The stem: a narrow white line where the draw-through has passed.
      const stemW: N = oneMinus(smoothstep(0.006, 0.014, abs(xs.x)));
      const stemOn: N = smoothstep(DRAW_FROM, DRAW_FROM + 0.04, xs.y).mul(behind).mul(drawAmount);
      const stemMask: N = stemW.mul(stemOn);
      lines = lines.mul(oneMinus(stemMask));
      white = max(white.mul(oneMinus(lines)), stemMask);
      return [white, halo];
    };
    const paint = (p: N) => {
      const r: N = len(p);
      const q: N = rotate2(p, turn.mul(oneMinus(r).mul(0.8).add(0.2)));
      const mott: N = mx_fractal_noise_float(vec3(q.mul(3.4), clock.mul(0.03)), 2, 2.0, 0.5);
      const golden = col('#9c5a24');
      const deep = col('#6d3414');
      const light = col('#c98f52');
      let c: N = mix(golden.mul(0.86), mix(golden, light, 0.45), smoothstep(-0.4, 0.55, mott));
      // Milk diving under the crema lightens and smooths it.
      c = mix(c, col('#c9905a'), dive.mul(0.5));
      c = mix(c, deep, smoothstep(0.74, 1.0, r).mul(0.55));
      // Halo of lighter crema where milk is just beneath the surface.
      const [white, halo] = pattern(p);
      c = mix(c, light, halo.mul(oneMinus(white)).mul(0.35));
      const milk: N = mix(col('#e6dccb'), col('#d9c7aa'), smoothstep(-0.3, 0.6, mott).mul(0.6));
      c = mix(c, milk, white);
      // A few small bubbles at the edge, fewer once settled.
      const w: N = mx_worley_noise_float(q.mul(30).add(3.3));
      const bRing: N = smoothstep(0.05, 0.08, w).mul(oneMinus(smoothstep(0.08, 0.12, w)));
      const bMask: N = smoothstep(0.78, 0.97, r).mul(smoothstep(0.2, 0.6, mx_noise_float(q.mul(5).add(1.0))));
      c = mix(c, light.mul(1.2), bRing.mul(bMask).mul(oneMinus(white)).mul(0.5));
      return c;
    };
    return { height, paint, roughness: mix(float(0.2), float(0.34), disturb), clearcoat: 0.85 };
  });
  cup.group.add(surface.mesh);

  // --------------------------------------------------------- pitcher and stream
  const pitcherMat = steelMaterial('#d0cdc5', 0.22);
  const pitcher = buildPitcher(pitcherMat, 0.82);
  const pivot = new THREE.Group();
  pitcher.group.position.copy(pitcher.spoutTip.position).negate();
  pivot.add(pitcher.group);
  pivot.rotation.order = 'YZX';
  scene.add(pivot);

  const stream = createStream(clock, { dark: '#efe5d3', light: '#fbf6ec', stripe: false }, 1.3);
  scene.add(stream.mesh);

  const steam = createSteam(clock, 18, { spread: 3.2, rise: 2.0, size: 3.0 });
  scene.add(steam.mesh);

  const look = new THREE.Vector3(-1.2, 4, 0.4);
  const surfaceWorld = new THREE.Vector3();
  const landing = new THREE.Vector3();
  const tipWorld = new THREE.Vector3();
  const steamOrigin = new THREE.Vector3();
  let aspect = 1;
  let progress = 0;
  let turnAcc = 0;

  const placeCamera = () => {
    const t = smooth(0, 1, progress);
    const fit = aspect < 1 ? 1 / aspect : aspect > 1.1 ? 1 + (aspect - 1.1) * 0.05 : 1;
    const distance = lerp(58, 52, t) * Math.pow(fit, 0.8);
    const elevation = THREE.MathUtils.degToRad(lerp(68, 76, t));
    const azimuth = THREE.MathUtils.degToRad(lerp(-6, 0, t));
    const target = look.clone().lerp(new THREE.Vector3(0, 4, 0.6), t);
    camera.position.set(
      target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      target.y + Math.sin(elevation) * distance,
      target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
  };

  return {
    scene,
    camera,
    environmentIntensity: 0.45,
    resize(next) {
      aspect = next;
      camera.aspect = next;
      camera.updateProjectionMatrix();
      backdrop.fit(next);
      placeCamera();
    },
    update(p, time, dt) {
      clock.value = time;
      progress = p;
      placeCamera();

      // Fill: the cup starts with the shot and rises with the pour.
      const fill = lerp(0.42, 0.94, smooth(0.0, 0.9, p));
      const y = lerp(cup.bottomY + 0.1, cup.rimY - 0.35, fill);
      const R = cup.innerRadiusAt(y) - 0.02;
      surface.place(y, R);

      // Leaves: each front surfaces at its birth and keeps being pushed outward until the heart.
      for (let k = 0; k < LEAVES; k += 1) {
        const g = smooth(leafBirth(k), leafBirth(k) + 0.07, p);
        const push = 0.62 + 0.38 * smooth(leafBirth(k), 0.78, p);
        leafR[k].value = g > 0 ? leafRadius(k) * Math.sqrt(g) * push : 0;
      }
      heart.value = smooth(0.74, 0.8, p);
      drawFront.value = lerp(DRAW_FROM, DRAW_TO, smooth(0.8, 0.9, p));
      drawAmount.value = smooth(0.8, 0.84, p);
      dive.value = smooth(0.02, 0.28, p);
      const flowing = range(0.0, 0.03, p) * (1 - smooth(0.895, 0.93, p));
      pourStrength.value = flowing * (p < 0.28 ? 0.6 : p < 0.8 ? 1 : 0.5);
      disturb.value = Math.max(0.05, 1 - smooth(0.9, 1.0, p)) * (0.4 + 0.6 * flowing);
      turnAcc += dt * 0.3 * flowing;
      turn.value = smooth(0, 0.3, p) * 2.4 + turnAcc;

      const [px, ps] = pourPoint(p);
      pour.value.set(px, ps);
      pourWidth.value = p < 0.28 ? 0.05 : 0.11;

      // Pour point in world space (disc local y = -s).
      surface.mesh.getWorldPosition(surfaceWorld);
      landing.set(surfaceWorld.x + px * R * 1.0, surfaceWorld.y, surfaceWorld.z + ps * R);
      // Spout height: high to dive, low to surface, a lift to draw, away to finish.
      const high = 1 - smooth(0.24, 0.32, p);
      const draw = smooth(0.78, 0.82, p);
      const done = smooth(0.9, 1.0, p);
      const h = lerp(1.4, 7.5, high) + 1.2 * draw * (1 - done) + 9 * done;
      const exit = 16 * done * done;
      pivot.position.set(landing.x - 0.9 - 0.6 * high - exit, landing.y + h, landing.z - 0.9 - 0.6 * high - exit);
      const tilt = lerp(0.95, 1.38, smooth(0.0, 0.88, p)) - 0.55 * done;
      pivot.rotation.set(0, -Math.PI / 4 - 0.0, -tilt);
      // Keep the spout over the pour: offset the pivot by the tip's own offset.
      pivot.updateMatrixWorld(true);
      pitcher.spoutTip.getWorldPosition(tipWorld);
      const tail = Math.pow(range(0.89, 0.935, p), 1.5);
      stream.set(tipWorld, landing);
      stream.head.value = Math.pow(range(0.0, 0.025, p), 1.4);
      stream.tail.value = tail;
      stream.radius.value = p < 0.28 ? 0.2 : p < 0.76 ? 0.34 : 0.2;
      stream.amber.value = 0.5;
      stream.wobble.value = 0.01;
      stream.mesh.visible = tail < 1 && p > 0;

      steamOrigin.copy(surfaceWorld);
      steamOrigin.y += 0.8;
      steam.update(time, camera, steamOrigin, 0.55, 0.35);
    },
    isLive: (p) => p > 0.0 && p < 0.99,
  };
}
