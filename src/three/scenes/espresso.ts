// Scene 2, espresso chapter: a closer, analytical view of the same extraction,
// scrubbed directly by chapter progress on a terracotta cup and warm plaster.
import * as THREE from 'three/webgpu';
import { mix, smoothstep, length, vec2, oneMinus } from 'three/tsl';
import type { CraftScene } from '../types';
import { cameraBackdrop, col, disc, lerp, ringLine, sceneClock, smooth } from '../kit';
import { addBarLights, createCupSet, createExtractionRig } from '../extraction';

export function create(): CraftScene {
  const clock = sceneClock();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 400);
  scene.add(camera);

  const backdrop = cameraBackdrop(camera, (p) => {
    let c = mix(col('#e2cfb2'), col('#d5bf9e'), smoothstep(0.1, 0.9, length(p)));
    // Folded plaster corners, as in the still.
    const corner = smoothstep(0.0, 0.004, p.y.sub(p.x).sub(0.62)).add(smoothstep(0.0, 0.004, p.x.sub(p.y).sub(0.62)));
    c = mix(c, col('#cbb18c'), corner.min(1).mul(0.8));
    const arcs = ringLine(p, -0.75, 0.1, 0.42).add(ringLine(p, -0.75, 0.1, 0.52)).add(ringLine(p, 0.85, -0.4, 0.5));
    c = mix(c, col('#9a7653'), arcs.mul(0.3));
    c = mix(c, col('#8e3828'), disc(p, 0.37, 0.37, 0.012, 0.002));
    return c.mul(oneMinus(smoothstep(0.35, 0.9, length(p.sub(vec2(0, 0.1)))).mul(0.08)));
  });

  addBarLights(scene, '#fff0dc', 1.3);
  const cup = createCupSet(clock, '#a94a30', '#ddcfb8');
  cup.group.rotation.y = -0.25;
  scene.add(cup.group);

  const rig = createExtractionRig(clock, { cupRimY: 0.6 + 5.29, spoutGap: 3.0 });
  rig.portafilter.root.rotation.y = 0.5;
  scene.add(rig.root);

  const look = new THREE.Vector3();
  let aspect = 1;
  let progress = 0;
  const placeCamera = () => {
    const t = smooth(0, 1, progress);
    const fit = aspect < 1.05 ? 1 : 1 + (aspect - 1.05) * 0.12;
    const distance = lerp(50, 43, t) * fit;
    const elevation = THREE.MathUtils.degToRad(lerp(34, 40, t));
    const azimuth = THREE.MathUtils.degToRad(lerp(6, -4, t));
    look.set(1.0, lerp(7.0, 5.6, t), 0);
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
    environmentIntensity: 0.5,
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
      rig.setPhase(p, time, dt, cup);
    },
    isLive: (p) => p > 0.025 && p < 0.985,
  };
}
