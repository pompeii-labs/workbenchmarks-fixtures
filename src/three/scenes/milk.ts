// Scene 3, milk texture: an open steel pitcher seen from above at a slight
// angle, the steam wand entering from the upper left. Progress drives one
// physical sequence, and steam, bubbles, and gloss are all keyed to it:
//   0.00-0.15 cold still milk, the pitcher lifts to the wand, first wisp
//   0.15-0.55 tip near the surface: a vortex forms, air enters, fine bubbles
//   0.55-0.85 tip sinks: air stops, foam folds through, steam thickens
//   0.85-1.00 the vortex relaxes into a glossy spiral at 55°C
import * as THREE from 'three/webgpu';
import { atan, exp, float, log, mix, mx_noise_float, mx_worley_noise_float, oneMinus, sin, smoothstep, uniform, vec2 } from 'three/tsl';
import type { CraftScene } from '../types';
import {
  N,
  buildPitcher,
  cameraBackdrop,
  col,
  contactShadow,
  createSteam,
  disc,
  len,
  lerp,
  liquidSurface,
  range,
  ringLine,
  sceneClock,
  smooth,
  steelMaterial,
} from '../kit';
import { addBarLights } from '../extraction';

export function create(): CraftScene {
  const clock = sceneClock();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  scene.add(camera);

  const backdrop = cameraBackdrop(camera, (p) => {
    let c: N = mix(col('#bfc1ab'), col('#a9ad96'), smoothstep(0.15, 0.95, len(p)));
    c = mix(c, col('#8f3828'), disc(p, 0.28, 0.22, 0.3, 0.003));
    const arcs: N = ringLine(p, -0.7, -0.2, 0.45).add(ringLine(p, -0.7, -0.2, 0.55));
    return mix(c, col('#f4f1e6'), arcs.mul(0.35));
  });
  addBarLights(scene, '#fff4e6', 1.25);

  const steel = steelMaterial('#d2d0c8', 0.22);
  const pitcher = buildPitcher(steel);
  const rig = new THREE.Group();
  rig.add(pitcher.group);
  pitcher.group.rotation.y = -0.35; // spout to the right and slightly toward the viewer
  const shadow = contactShadow(7, 0.42, '#3b3f30');
  shadow.position.y = 0.02;
  rig.add(shadow);
  scene.add(rig);

  // Steam wand: a bent tube from the machine, upper left, into the milk.
  const wand = new THREE.Group();
  const tubeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-13, 26, -9),
    new THREE.Vector3(-7.5, 16, -4.6),
    new THREE.Vector3(-2.8, 8.4, -1.0),
    new THREE.Vector3(-1.6, 5.4, -0.2),
  ]);
  wand.add(new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, 48, 0.42, 16, false), steel));
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.36, 1.1, 16), steel);
  const tipDir = tubeCurve.getTangent(1);
  tip.position.copy(tubeCurve.getPoint(1)).addScaledVector(tipDir, 0.5);
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipDir.clone().negate());
  wand.add(tip);
  const tipEnd = tubeCurve.getPoint(1).clone().addScaledVector(tipDir, 1.0);
  scene.add(wand);

  // Milk surface with vortex, microfoam, and gloss.
  const air = uniform(0); // air being drawn in (stretch)
  const bubbles = uniform(0);
  const fold = uniform(0);
  const gloss = uniform(0);
  const energy = uniform(0);
  const spin = uniform(0);
  const tremor = uniform(0);
  const warm = uniform(0);
  const centre = uniform(new THREE.Vector2(-0.12, 0.06));

  const surface = liquidSurface((radius) => {
    const height = (p: N) => {
      const d: N = p.sub(centre);
      const r: N = len(d).mul(radius);
      const dip: N = exp(r.mul(r).mul(-0.32)).mul(-0.42).mul(energy);
      const pr: N = p.mul(radius);
      const shake: N = sin(pr.x.mul(3.1).add(clock.mul(13))).mul(sin(pr.y.mul(2.7).sub(clock.mul(11)))).mul(0.035).mul(tremor);
      const men: N = smoothstep(0.84, 1.0, len(p)).mul(0.08);
      const ang: N = atan(d.y, d.x);
      const arms: N = sin(ang.mul(2).add(log(r.add(0.4)).mul(3.2)).sub(spin)).mul(0.05).mul(energy.add(gloss.mul(0.8))).mul(smoothstep(0.3, 2.0, r));
      return dip.add(shake).add(men).add(arms);
    };
    const paint = (p: N) => {
      const d: N = p.sub(centre);
      const r: N = len(d);
      const ang: N = atan(d.y, d.x);
      const coldMilk = col('#a3a6a1');
      const warmMilk = col('#b3a994');
      let c: N = mix(coldMilk, warmMilk, warm);
      // Spiral shading: the vortex lines that close into a smooth finish.
      const spiral: N = sin(ang.add(log(r.add(0.08)).mul(3.6)).sub(spin)).mul(0.5).add(0.5);
      c = mix(c, c.mul(0.74), spiral.mul(energy.mul(0.6).add(gloss.mul(0.3))).mul(smoothstep(0.03, 0.4, r)));
      // Fine, sparse bubbles while air goes in; folded away afterwards.
      const sw: N = vec2(ang.sub(spin.mul(0.6)).mul(1.8), r.mul(9));
      const w: N = mx_worley_noise_float(sw.mul(3.2).add(1.7));
      const sparse: N = smoothstep(0.1, 0.55, mx_noise_float(sw.mul(0.9).add(4.2)));
      const ringB: N = smoothstep(0.05, 0.09, w).mul(oneMinus(smoothstep(0.09, 0.14, w)));
      const coreB: N = oneMinus(smoothstep(0.02, 0.07, w));
      const mask: N = sparse.mul(bubbles);
      c = mix(c, c.mul(0.78), coreB.mul(mask).mul(0.6));
      c = mix(c, col('#ffffff'), ringB.mul(mask).mul(0.85));
      // Faint coffee-steel reflection darkening at the wall.
      c = mix(c, c.mul(0.86), smoothstep(0.86, 1.0, len(p)));
      return c;
    };
    return { height, paint, roughness: mix(float(0.5), float(0.1), gloss), clearcoat: 0.9 };
  });
  pitcher.group.add(surface.mesh);

  const steam = createSteam(clock, 46, { spread: 2.2, rise: 2.6, size: 2.6 });
  scene.add(steam.mesh);
  const purge = createSteam(clock, 12, { spread: 0.25, rise: 3.8, size: 1.3 });
  scene.add(purge.mesh);
  const steamOrigin = new THREE.Vector3();
  const tipWorld = new THREE.Vector3();

  const look = new THREE.Vector3(0.2, 7.2, 0);
  let aspect = 1;
  let progress = 0;
  let spinAcc = 0;
  const placeCamera = () => {
    const t = smooth(0, 1, progress);
    const fit = aspect < 1.05 ? 1 : 1 + (aspect - 1.05) * 0.1;
    const distance = lerp(42, 37, t) * fit;
    const elevation = THREE.MathUtils.degToRad(lerp(40, 46, t));
    const azimuth = THREE.MathUtils.degToRad(lerp(8, 0, t));
    camera.position.set(
      look.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      look.y + Math.sin(elevation) * distance,
      look.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    camera.lookAt(look);
  };

  return {
    scene,
    camera,
    environmentIntensity: 0.55,
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
      // Pitcher height relative to the fixed wand: lift to engage, ride the
      // tip near the surface to stretch, sink it to fold, lower away to finish.
      const engage = smooth(0.02, 0.13, p);
      const stretch = smooth(0.15, 0.22, p) * (1 - smooth(0.52, 0.6, p));
      const sink = smooth(0.55, 0.64, p);
      const away = smooth(0.9, 1.0, p);
      rig.position.y = lerp(-3.2, 0, engage) - 0.25 * stretch + 0.55 * sink - 2.6 * away;
      rig.position.x = lerp(0.4, 0, engage);

      // Volume grows as air folds in; stops growing once the tip sinks.
      const level = lerp(4.6, 6.0, smooth(0.16, 0.6, p));
      surface.place(level, pitcher.innerRadiusAt(level) - 0.02);
      const vortex = smooth(0.13, 0.3, p) * (1 - 0.65 * smooth(0.82, 1.0, p));
      energy.value = vortex;
      air.value = stretch;
      tremor.value = stretch * 0.9 + 0.15 * vortex * (1 - away);
      bubbles.value = smooth(0.18, 0.4, p) * (1 - smooth(0.55, 0.85, p)) * 0.95 + 0.04;
      fold.value = smooth(0.55, 0.85, p);
      gloss.value = smooth(0.55, 0.95, p);
      warm.value = smooth(0.1, 0.9, p);
      spinAcc += dt * (0.4 + vortex * 2.6);
      spin.value = p * 9 + spinAcc;

      // Steam from the warming milk, keyed to the same progress.
      surface.mesh.getWorldPosition(steamOrigin);
      steamOrigin.y += 0.6;
      steamOrigin.x -= 1.4;
      const heat = smooth(0.12, 0.85, p);
      const amount = range(0.08, 0.2, p) * (0.35 + 0.65 * heat) * (1 - 0.25 * away);
      steam.update(time, camera, steamOrigin, amount, heat);
      // Purge wisp from the wand tip before it enters the milk.
      tipWorld.copy(tipEnd);
      const purgeAmount = (1 - smooth(0.06, 0.13, p)) * 0.9 + away * 0.6;
      purge.update(time * 1.4, camera, tipWorld, purgeAmount, 0.3);
    },
    isLive: (p) => p > 0.01,
  };
}
