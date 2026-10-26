// The espresso extraction rig shared by the hero and the espresso chapter:
// portafilter with twin spouts, two necking streams, hanging and falling drops,
// and a cup whose crema develops with one extraction phase e (0..1):
//   0.00-0.12 locked in, first drops gather and fall
//   0.12-0.70 twin streams develop, dark and slow to balanced amber
//   0.70-0.90 flow lightens and thins, level reaches its final height
//   0.90-1.00 streams break from the spouts, crema closes, bubbles dissipate
// Everything except the stream oscillation and ripple travel is a pure function
// of e, so scrolling backward retraces the same physical states.
import * as THREE from 'three/webgpu';
import {
  N,
  buildCup,
  buildPortafilter,
  buildSaucer,
  ceramicMaterial,
  contactShadow,
  createEspressoSurface,
  createStream,
  handleMaterial,
  lerp,
  range,
  smooth,
  steelMaterial,
} from './kit';

export interface CupSet {
  group: THREE.Group;
  surface: ReturnType<typeof createEspressoSurface>;
  innerRadiusAt: (y: number) => number;
  baseY: number; // cup bottom inside, world-relative to group
  fullY: number;
  ambientSwirl: number;
}

export function createCupSet(clock: N, tone: string, saucerTone: string, scale = 1): CupSet {
  const group = new THREE.Group();
  const saucer = buildSaucer(ceramicMaterial(saucerTone, 0.34), scale);
  group.add(saucer.mesh);
  const cup = buildCup(ceramicMaterial(tone, 0.3), scale);
  cup.group.position.y = saucer.topY;
  group.add(cup.group);
  const shadow = contactShadow(7.6 * scale, 0.5);
  shadow.position.y = 0.02;
  group.add(shadow);
  const surface = createEspressoSurface(clock);
  cup.group.add(surface.mesh);
  return {
    group,
    surface,
    innerRadiusAt: cup.innerRadiusAt,
    baseY: cup.bottomY + 0.05,
    fullY: 4.0 * scale,
    ambientSwirl: 0,
  };
}

/** Pose the cup's liquid for extraction phase e. */
export function setCupPhase(set: CupSet, e: number, dt: number, impacts?: [THREE.Vector2, THREE.Vector2]) {
  const s = set.surface;
  // Steady flow: the level rises almost linearly, easing as the shot thins.
  const u = range(0.12, 0.92, e);
  const fill = (1 - Math.pow(1 - u, 1.6)) * 0.97 + range(0.04, 0.12, e) * 0.03;
  const y = lerp(set.baseY, set.fullY, fill);
  const r = Math.max(0.05, set.innerRadiusAt(y) - 0.01);
  s.place(y, r);
  s.mesh.visible = e > 0.05;
  const flow = smooth(0.12, 0.2, e) * (1 - smooth(0.88, 0.955, e));
  s.flow.value = flow * (0.7 + 0.3 * (1 - smooth(0.7, 0.9, e)));
  s.crema.value = Math.min(1, smooth(0.12, 0.55, e) * 0.82 + smooth(0.6, 0.97, e) * 0.18);
  s.settle.value = smooth(0.9, 1.0, e);
  s.level.value = smooth(0.15, 0.4, e);
  set.ambientSwirl += dt * (0.15 + flow * 0.5);
  s.swirl.value = e * 1.1 + set.ambientSwirl * 0.25;
  if (impacts) {
    s.impactA.value.set(impacts[0].x / r, impacts[0].y / r);
    s.impactB.value.set(impacts[1].x / r, impacts[1].y / r);
  }
}

export interface ExtractionRig {
  root: THREE.Group;
  portafilter: ReturnType<typeof buildPortafilter>;
  /** Pose streams and drops for phase e, landing on `cup` (null hides them). */
  setPhase(e: number, clock: number, dt: number, cup: CupSet | null): void;
}

export function createExtractionRig(clockNode: N, opts: { spoutGap?: number; cupRimY: number }): ExtractionRig {
  const root = new THREE.Group();
  const steel = steelMaterial();
  const dark = handleMaterial();
  const pf = buildPortafilter(steel, dark);
  pf.root.position.y = opts.cupRimY + (opts.spoutGap ?? 3.2) + 4.72;
  root.add(pf.root);

  const streams = [0, 1].map((i) => {
    const stream = createStream(clockNode, { dark: '#3a1607', light: '#c98a3e' }, i * 3.1);
    root.add(stream.mesh);
    return stream;
  });

  const dropMaterial = new THREE.MeshStandardNodeMaterial({ color: '#4a1f0b', roughness: 0.1 });
  dropMaterial.emissive = new THREE.Color('#2a1206');
  const dropGeometry = new THREE.SphereGeometry(1, 16, 12);
  const drops = [0, 1].map(() => {
    const hanging = new THREE.Mesh(dropGeometry, dropMaterial);
    const falling = new THREE.Mesh(dropGeometry, dropMaterial);
    root.add(hanging, falling);
    return { hanging, falling };
  });

  const tipWorld = new THREE.Vector3();
  const land = new THREE.Vector3();
  const cupLocal = new THREE.Vector3();
  const impacts: [THREE.Vector2, THREE.Vector2] = [new THREE.Vector2(), new THREE.Vector2()];

  return {
    root,
    portafilter: pf,
    setPhase(e, clock, dt, cup) {
      root.updateMatrixWorld(true);
      const surfaceY = cup ? cup.surface.mesh.getWorldPosition(land).y : 0;
      const flowR = 0.075 + 0.14 * smooth(0.12, 0.32, e) - 0.1 * smooth(0.7, 0.9, e);
      const head = Math.pow(range(0.12, 0.17, e), 1.6);
      const tail = Math.pow(range(0.895, 0.955, e), 1.6);
      for (let i = 0; i < 2; i += 1) {
        const stream = streams[i];
        pf.tips[i].getWorldPosition(tipWorld);
        land.set(tipWorld.x, cup ? surfaceY : tipWorld.y - 8, tipWorld.z);
        stream.set(tipWorld, land);
        stream.head.value = head;
        stream.tail.value = tail;
        stream.radius.value = flowR * (1 + 0.04 * Math.sin(clock * 5.1 + i * 2));
        stream.amber.value = smooth(0.12, 0.7, e) * 0.62 + smooth(0.7, 0.92, e) * 0.38;
        stream.tiger.value = 0.15 + 0.75 * smooth(0.2, 0.42, e) * (1 - smooth(0.74, 0.9, e));
        stream.wobble.value = 0.012 + 0.03 * smooth(0.15, 0.4, e) * (1 - smooth(0.8, 0.95, e));
        stream.mesh.visible = cup !== null && head > 0 && tail < 1;

        if (cup) {
          cupLocal.copy(land);
          cup.surface.mesh.parent!.worldToLocal(cupLocal);
          // Surface disc local y maps to -z after its rotation.
          impacts[i].set(cupLocal.x, -cupLocal.z);
        }

        // Drops: two gather and fall before the stream, one last drip after it breaks.
        const d = drops[i];
        const fallLen = Math.max(0.1, tipWorld.y - surfaceY);
        let hang = 0;
        let fallT = -1;
        let size = 0.17;
        if (e < 0.125 && e > 0.03) {
          const u = ((e - 0.03) / 0.045 + i * 0.37) % 1;
          if (u < 0.78) hang = Math.pow(u / 0.78, 0.7);
          else fallT = (u - 0.78) / 0.22;
          if (e > 0.115) hang *= 1 - range(0.115, 0.125, e);
        } else if (e > 0.94 && e < 1) {
          const u = range(0.94 + i * 0.012, 0.995, e);
          size = 0.12;
          if (u < 0.7) hang = Math.pow(u / 0.7, 0.8) * 0.8;
          else fallT = (u - 0.7) / 0.3;
        }
        d.hanging.visible = hang > 0.02 && cup !== null;
        const hs = size * (0.45 + 0.75 * hang);
        d.hanging.scale.set(hs, hs * (1 + hang * 0.45), hs);
        d.hanging.position.set(tipWorld.x, tipWorld.y - hs * (0.6 + hang * 0.7), tipWorld.z);
        d.falling.visible = fallT >= 0 && fallT < 1 && cup !== null;
        if (d.falling.visible) {
          d.falling.scale.set(size * 0.95, size * 1.5, size * 0.95);
          d.falling.position.set(tipWorld.x, tipWorld.y - 0.3 - fallT * fallT * fallLen, tipWorld.z);
        }
      }
      if (cup) setCupPhase(cup, e, dt, impacts);
    },
  };
}

export function addBarLights(scene: THREE.Scene, warmth = '#ffe7cc', key = 1.35) {
  scene.add(new THREE.HemisphereLight('#fff3e6', '#3a1a10', 0.3));
  const keyLight = new THREE.DirectionalLight(warmth, key);
  keyLight.position.set(-22, 34, 26);
  scene.add(keyLight);
  const rim = new THREE.DirectionalLight('#ffc49a', 0.9);
  rim.position.set(18, 12, -22);
  scene.add(rim);
  return { keyLight, rim };
}
