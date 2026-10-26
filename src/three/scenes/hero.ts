// Scene 1, hero extraction: a slow physically timed shot on loop while the hero
// is visible. Scroll only guides a restrained camera move from the portafilter
// toward the cup. After the crema has settled and held, the served cup glides
// out on its saucer, a fresh one slides in, and the portafilter re-engages.
import * as THREE from 'three/webgpu';
import { mix, oneMinus, smoothstep, length, vec2 } from 'three/tsl';
import type { CraftScene } from '../types';
import { cameraBackdrop, col, disc, lerp, ringLine, sceneClock, smooth } from '../kit';
import { addBarLights, createCupSet, createExtractionRig, setCupPhase } from '../extraction';

export const HERO_CYCLE = 27;

/** Extraction phase for a time within the cycle. */
export function heroPhase(c: number): number {
  if (c < 1.8) return 0;
  if (c < 4.2) return lerp(0, 0.04, (c - 1.8) / 2.4); // preinfusion: pressure builds, nothing flows
  if (c < 6.8) return lerp(0.04, 0.12, (c - 4.2) / 2.6); // first dark drops
  if (c < 17.5) return lerp(0.12, 0.7, (c - 6.8) / 10.7);
  if (c < 20.5) return lerp(0.7, 0.9, (c - 17.5) / 3);
  if (c < 23) return lerp(0.9, 1, (c - 20.5) / 2.5);
  return 1;
}

export function create(): CraftScene {
  const clock = sceneClock();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  scene.add(camera);

  const backdrop = cameraBackdrop(camera, (p) => {
    const base = col('#7a2d20');
    const vignette = smoothstep(0.2, 0.95, length(p.sub(vec2(0.05, -0.05))));
    let c = mix(col('#8e3828'), base, vignette);
    c = mix(c, col('#9b4130'), disc(p, 0.28, 0.2, 0.33, 0.003).mul(0.85));
    const arcs = ringLine(p, -0.55, -0.5, 0.62).add(ringLine(p, -0.55, -0.5, 0.74)).add(ringLine(p, 0.6, 0.62, 0.5));
    c = mix(c, col('#d8a07a'), arcs.mul(0.32));
    return c.mul(oneMinus(vignette.mul(0.18)));
  });

  addBarLights(scene);
  const cupTone = '#e6dac6';
  const active = createCupSet(clock, cupTone, '#d8cab3');
  const served = createCupSet(clock, cupTone, '#d8cab3');
  scene.add(active.group, served.group);
  active.group.rotation.y = served.group.rotation.y = -0.55;

  const rig = createExtractionRig(clock, { cupRimY: 0.6 + 5.29, spoutGap: 3.4 });
  rig.portafilter.root.rotation.y = Math.PI * 0.82;
  scene.add(rig.root);

  const look = new THREE.Vector3();
  let aspect = 1;
  let scroll = 0;

  const placeCamera = () => {
    const t = smooth(0, 1, scroll);
    const fit = aspect < 1 ? 1 / aspect : 1;
    const distance = lerp(54, 44, t) * Math.pow(fit, 0.9);
    const elevation = THREE.MathUtils.degToRad(lerp(34, 42, t));
    const azimuth = THREE.MathUtils.degToRad(lerp(-24, -10, t));
    look.set(lerp(0.4, 0.2, t), lerp(7.6, 5.0, t), 0);
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
    autoplay: true,
    environmentIntensity: 0.5,
    resize(next) {
      aspect = next;
      camera.aspect = next;
      camera.updateProjectionMatrix();
      backdrop.fit(next);
      placeCamera();
    },
    update(progress, time, dt) {
      clock.value = time;
      scroll = progress;
      placeCamera();
      const c = ((time % HERO_CYCLE) + HERO_CYCLE) % HERO_CYCLE;
      const swap = smooth(24.2, 26.6, c);
      const inSwap = c >= 24.2;
      // Re-engage: a short twist into the group head at the start of each cycle.
      const twist = 1 - smooth(0.1, 1.6, c);
      rig.portafilter.body.rotation.y = -0.42 * twist;
      rig.portafilter.body.position.y = -0.35 * twist;

      const e = inSwap ? 0 : heroPhase(c);
      active.group.position.x = inSwap ? lerp(-26, 0, swap) : 0;
      active.group.position.z = inSwap ? lerp(6, 0, swap) : 0;
      served.group.visible = inSwap;
      served.group.position.x = lerp(0, 28, swap);
      served.group.position.z = lerp(0, 4, swap);
      if (inSwap) setCupPhase(served, 1, dt);
      rig.setPhase(e, time, dt, active);
    },
    isLive: () => true,
  };
}
