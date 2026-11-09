// The setting: a small circus ring under a striped tent, lit by a follow spot.
import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Deterministic noise so the still frame is the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export const RING_R = 4.6;

export function buildStage(scene) {
  scene.background = new THREE.Color(0x150a12);
  scene.fog = new THREE.Fog(0x150a12, 16, 42);

  // ---- sawdust floor --------------------------------------------------------
  const sand = canvasTexture(256, 256, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = '#c9a56d';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const v = r();
      g.fillStyle = v > 0.5 ? `rgba(255,236,190,${0.05 + r() * 0.12})` : `rgba(96,62,28,${0.05 + r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 1.5);
    }
  });
  sand.wrapS = sand.wrapT = THREE.RepeatWrapping;
  sand.repeat.set(7, 7);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(RING_R, 72),
    new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Faint tyre track where the act has been circling.
  const track = new THREE.Mesh(
    new THREE.RingGeometry(3.2 - 0.05, 3.2 + 0.05, 96),
    new THREE.MeshBasicMaterial({ color: 0x5b3a1c, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.004;
  scene.add(track);

  // Dark boards outside the ring.
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(RING_R, 30, 72),
    new THREE.MeshStandardMaterial({ color: 0x2a1620, roughness: 0.95 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.002;
  outer.receiveShadow = true;
  scene.add(outer);

  // ---- ring curb: red and cream blocks -------------------------------------
  const profile = [
    [RING_R - 0.02, 0],
    [RING_R, 0.3],
    [RING_R + 0.06, 0.36],
    [RING_R + 0.3, 0.36],
    [RING_R + 0.36, 0.3],
    [RING_R + 0.4, 0],
  ]
    .reverse() // wind the profile so the faces point outward
    .map(([x, y]) => new THREE.Vector2(x, y));
  const N = 32;
  const red = new THREE.MeshStandardMaterial({ color: 0xb3202a, roughness: 0.55 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1e2c0, roughness: 0.6 });
  for (let i = 0; i < 2; i++) {
    for (let k = i; k < N; k += 2) {
      const geo = new THREE.LatheGeometry(profile, 5, (k / N) * Math.PI * 2, (Math.PI * 2) / N);
      const m = new THREE.Mesh(geo, i ? cream : red);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // ---- tent: striped wall and roof -----------------------------------------
  const stripes = canvasTexture(512, 256, (g, w, h) => {
    const n = 16;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#e9d7b4' : '#8f1d2c';
      g.fillRect((i * w) / n, 0, w / n + 1, h);
    }
    const sh = g.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(10,0,10,0.75)');
    sh.addColorStop(0.55, 'rgba(10,0,10,0.25)');
    sh.addColorStop(1, 'rgba(10,0,10,0.6)');
    g.fillStyle = sh;
    g.fillRect(0, 0, w, h);
  });
  stripes.wrapS = THREE.RepeatWrapping;
  stripes.repeat.set(3, 1);
  const TENT_R = 17;
  const WALL_H = 6.5;
  const tentMat = new THREE.MeshStandardMaterial({
    map: stripes,
    side: THREE.BackSide,
    roughness: 1,
    emissive: 0xffffff,
    emissiveMap: stripes,
    emissiveIntensity: 0.22, // the canvas glows a little, as if lit from the far side
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(TENT_R, TENT_R, WALL_H, 64, 1, true), tentMat);
  wall.position.y = WALL_H / 2;
  scene.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(TENT_R, 7, 64, 1, true), tentMat);
  roof.position.y = WALL_H + 3.5;
  scene.add(roof);

  // ---- a string of warm bulbs around the tent --------------------------------
  const BULBS = 72;
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd58a, fog: false }),
    BULBS,
  );
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < BULBS; i++) {
    const a = (i / BULBS) * Math.PI * 2;
    const sag = 0.35 * Math.abs(Math.sin(a * 9));
    m4.makeTranslation(Math.cos(a) * (TENT_R - 0.6), WALL_H - 0.5 - sag, Math.sin(a) * (TENT_R - 0.6));
    bulbs.setMatrixAt(i, m4);
  }
  scene.add(bulbs);

  // ---- lighting ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xffe3c4, 0x4a2a3a, 1.0));

  // Follow spot: the key light and the only shadow caster.
  const spot = new THREE.SpotLight(0xfff1dc, 260, 30, 0.3, 0.55, 1.6);
  spot.position.set(0, 10.5, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 4;
  spot.shadow.camera.far = 16;
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.015;
  scene.add(spot, spot.target);

  // Cool rim from behind and a warm fill, to keep the white bird modelled.
  const rim = new THREE.DirectionalLight(0x8fb4ff, 0.9);
  const fill = new THREE.DirectionalLight(0xffc08a, 0.55);
  scene.add(rim, rim.target, fill, fill.target);

  const _p = new THREE.Vector3();
  return {
    /** Aim the lights at the act. `p` is on the ground under the rider. */
    aim(p) {
      spot.target.position.set(p.x, 1.0, p.z);
      // Keep the spot a little to the inside so shadows fall outward.
      _p.set(p.x, 0, p.z).multiplyScalar(0.25);
      spot.position.set(_p.x, 10.5, _p.z);
      rim.position.set(p.x * 0.2 - p.z * 0.6, 5, p.z * 0.2 + p.x * 0.6);
      rim.target.position.set(p.x, 1.2, p.z);
      fill.position.set(p.x * 2.2, 3.5, p.z * 2.2);
      fill.target.position.set(p.x, 1.2, p.z);
    },
  };
}
