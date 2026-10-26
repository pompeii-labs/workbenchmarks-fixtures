import * as THREE from 'three/webgpu';
import { float, atan, color, max, mix, normalize, positionWorld, smoothstep, oneMinus, abs, asin, clamp } from 'three/tsl';
import type { Node } from 'three/webgpu';

// One analytic studio environment, used twice: the liquid samples it directly
// for its mirror reflection, and a PMREM bake of the same function lights the
// porcelain, saucer and table. Behind and above the cup there is a tall window
// with mullions; its reflection on the liquid is what makes every wave legible.
// Directions are world space; -z is away from the camera.

type N3 = Node<'vec3'>;

const softBox = (x: Node<'float'>, lo: number, hi: number, soft: number) =>
  smoothstep(lo - soft, lo + soft, x).mul(oneMinus(smoothstep(hi - soft, hi + soft, x)));

export const studioEnv = (dirIn: N3) => {
  const dir = normalize(dirIn);
  const el = asin(clamp(dir.y, -1, 1));
  const az = atan(dir.x, dir.z.negate()); // 0 = straight behind the cup

  // Room: dim warm walls, darker floor.
  const up = smoothstep(-0.25, 0.9, dir.y);
  const room = mix(color('#070504'), color('#241a14'), up).mul(0.45);

  // Window: daylight, slightly cool, with a cross of mullions.
  const win = softBox(az, -0.5, 0.12, 0.03).mul(softBox(el, 0.7, 1.1, 0.03));
  const mullionV = oneMinus(smoothstep(0.012, 0.026, abs(az.add(0.19))));
  const mullionH = oneMinus(smoothstep(0.012, 0.026, abs(el.sub(0.9))));
  const frame = max(mullionV, mullionH);
  // Gentle gradient inside the glass: brighter toward the top (sky).
  // Outside: a darker band of trees/buildings low in the glass, bright sky
  // above, with an uneven skyline so reflections have something to bend.
  const skyline = el.sub(0.8).sub(az.mul(5.0).sin().mul(0.025)).sub(az.mul(13.0).sin().mul(0.012));
  const outside = mix(color('#5d6157').mul(0.45), color('#eef0f0'), smoothstep(-0.015, 0.02, skyline));
  const glass = outside.mul(mix(float(4.2), float(6.5), smoothstep(0.8, 1.1, el)));
  const windowCol = glass.mul(oneMinus(frame.mul(0.93)));

  // Small warm bounce card low on the camera side, so porcelain has a fill.
  const card = softBox(az.abs(), 2.35, 3.2, 0.2).mul(softBox(el, 0.02, 0.42, 0.12));
  const cardCol = color('#ffd9b0').mul(1.1);

  return room.add(windowCol.mul(win)).add(cardCol.mul(card));
};

/** Bake the studio environment into a PMREM for the PBR materials. */
export function bakeEnvironment(renderer: THREE.WebGPURenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  mat.colorNode = studioEnv(positionWorld);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat);
  envScene.add(sphere);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.0, 0.1, 50);
  pmrem.dispose();
  sphere.geometry.dispose();
  mat.dispose();
  return target.texture;
}

export const KEY_LIGHT_DIR = new THREE.Vector3(-0.42, 0.78, -0.46).normalize();
