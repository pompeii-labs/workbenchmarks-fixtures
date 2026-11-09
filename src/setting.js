// The circus ring: sawdust, striped curb, tiered seats, big-top canvas,
// strings of bulbs. All textures are drawn on canvases at start-up.
import * as THREE from 'three';
import { canvasTexture } from './geom.js';

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildSetting(scene, maxAniso) {
  const RING_R = 3.3;

  // sawdust
  const sawdust = canvasTexture(512, 512, (g, w, h) => {
    const r = rand(7);
    g.fillStyle = '#b88a55';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const l = 40 + r() * 40;
      g.fillStyle = `hsla(${28 + r() * 12},${35 + r() * 25}%,${l}%,${0.25 + r() * 0.35})`;
      const x = r() * w,
        y = r() * h;
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI);
      g.fillRect(-2 - r() * 3, -0.6, 4 + r() * 6, 1.2 + r());
      g.restore();
    }
  });
  sawdust.wrapS = sawdust.wrapT = THREE.RepeatWrapping;
  sawdust.repeat.set(5, 5);
  sawdust.anisotropy = maxAniso;
  const ringFloor = new THREE.Mesh(
    new THREE.CircleGeometry(RING_R, 96),
    new THREE.MeshStandardMaterial({ map: sawdust, roughness: 0.95, color: 0xffffff }),
  );
  ringFloor.rotation.x = -Math.PI / 2;
  ringFloor.receiveShadow = true;
  scene.add(ringFloor);

  // a faint worn track where the pelican rides
  const track = new THREE.Mesh(
    new THREE.RingGeometry(1.88, 2.12, 128),
    new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 1, transparent: true, opacity: 0.35 }),
  );
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.002;
  track.receiveShadow = true;
  scene.add(track);

  // outer floor
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(RING_R, 40, 96),
    new THREE.MeshStandardMaterial({ color: 0x2a1712, roughness: 0.9 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.001;
  outer.receiveShadow = true;
  scene.add(outer);

  // striped ring curb
  const red = new THREE.MeshStandardMaterial({ color: 0xb3172a, roughness: 0.45 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1e6cc, roughness: 0.5 });
  const SEG = 28;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2;
    const a1 = ((i + 1) / SEG) * Math.PI * 2;
    const sh = new THREE.Shape();
    const ri = RING_R,
      ro = RING_R + 0.32;
    sh.absarc(0, 0, ro, a0, a1, false);
    sh.absarc(0, 0, ri, a1, a0, true);
    const geo = new THREE.ExtrudeGeometry(sh, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.025,
      bevelSegments: 3,
      curveSegments: 6,
    });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, i % 2 ? red : cream);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  // gold trim on the curb top
  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(RING_R + 0.16, 0.018, 8, 160),
    new THREE.MeshStandardMaterial({ color: 0xd9a63a, metalness: 0.8, roughness: 0.3 }),
  );
  trim.rotation.x = -Math.PI / 2;
  trim.position.y = 0.4;
  scene.add(trim);

  // tiered seating
  const tiers = [];
  let r0 = 6.5,
    y0 = 0;
  tiers.push(new THREE.Vector2(r0, -0.01));
  for (let i = 0; i < 7; i++) {
    tiers.push(new THREE.Vector2(r0, y0 + 0.45));
    r0 += 0.85;
    y0 += 0.45;
    tiers.push(new THREE.Vector2(r0, y0));
  }
  tiers.push(new THREE.Vector2(r0 + 0.01, 0));
  const seats = new THREE.Mesh(
    new THREE.LatheGeometry(tiers, 96),
    new THREE.MeshStandardMaterial({ color: 0x4a1620, roughness: 0.8, side: THREE.DoubleSide }),
  );
  seats.receiveShadow = true;
  scene.add(seats);

  // a dim, attentive audience: simple silhouettes on each tier
  const r = rand(11);
  const people = [];
  for (let i = 0; i < 7; i++) {
    const rr = 6.5 + 0.85 * i + 0.45;
    const yy = 0.45 * (i + 1);
    const n = Math.floor(rr * 7);
    for (let j = 0; j < n; j++) {
      if (r() < 0.22) continue;
      const a = ((j + r() * 0.5) / n) * Math.PI * 2;
      people.push([rr * Math.cos(a), yy, rr * Math.sin(a), 0.85 + r() * 0.3]);
    }
  }
  const torsoGeo = new THREE.CapsuleGeometry(0.16, 0.3, 4, 8);
  torsoGeo.translate(0, 0.32, 0);
  const headGeo = new THREE.SphereGeometry(0.11, 10, 8);
  headGeo.translate(0, 0.72, 0);
  const torsos = new THREE.InstancedMesh(torsoGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), people.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x1e1612, roughness: 0.9 }), people.length);
  const mtx = new THREE.Matrix4();
  const col = new THREE.Color();
  people.forEach(([x, y, z, s], i) => {
    mtx.makeScale(s, s, s).setPosition(x, y, z);
    torsos.setMatrixAt(i, mtx);
    heads.setMatrixAt(i, mtx);
    col.setHSL(r(), 0.3, 0.025 + r() * 0.035);
    torsos.setColorAt(i, col);
  });
  scene.add(torsos, heads);

  // big-top canvas: stripes on wall and roof
  const stripes = canvasTexture(1024, 64, (g, w, h) => {
    const n = 32;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#7d1a24' : '#d8c8a8';
      g.fillRect((i / n) * w, 0, w / n + 1, h);
    }
  });
  const wallMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.95, side: THREE.BackSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 7, 96, 1, true), wallMat);
  wall.position.y = 3.5;
  scene.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(14, 9, 96, 1, true), wallMat);
  roof.position.y = 7 + 4.5;
  scene.add(roof);

  // strings of bulbs hanging from the apex
  const glow = canvasTexture(64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,240,200,1)');
    grd.addColorStop(0.25, 'rgba(255,200,120,0.6)');
    grd.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
  const pts = [];
  const STR = 16,
    PER = 22;
  for (let s = 0; s < STR; s++) {
    const a = (s / STR) * Math.PI * 2;
    const A = new THREE.Vector3(0, 14.5, 0);
    const B = new THREE.Vector3(13.2 * Math.cos(a), 6.6, 13.2 * Math.sin(a));
    for (let i = 1; i < PER; i++) {
      const u = i / PER;
      const p = A.clone().lerp(B, u);
      p.y -= 2.2 * Math.sin(Math.PI * u);
      pts.push(p.x, p.y, p.z);
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const bulbs = new THREE.Points(
    bg,
    new THREE.PointsMaterial({
      map: glow,
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  scene.add(bulbs);

  // ---- lights
  scene.add(new THREE.HemisphereLight(0xb8a890, 0x5a3a24, 0.7));

  // house lights: a soft glow over the seats and canvas
  const house = new THREE.PointLight(0xffc890, 9, 0, 1.2);
  house.position.set(0, 9, 0);
  scene.add(house);

  // overhead wash over the ring
  const wash = new THREE.SpotLight(0xffe2c0, 260, 0, 0.42, 0.7, 2);
  wash.position.set(0, 13, 0);
  wash.target.position.set(0, 0, 0);
  scene.add(wash, wash.target);

  // coloured accents on the canvas
  const accA = new THREE.SpotLight(0xff3d7a, 300, 0, 0.5, 0.8, 2);
  accA.position.set(6, 9, -9);
  accA.target.position.set(-6, 3, 9);
  const accB = new THREE.SpotLight(0x3dc8ff, 260, 0, 0.5, 0.8, 2);
  accB.position.set(-7, 9, -6);
  accB.target.position.set(8, 2, 8);
  scene.add(accA, accA.target, accB, accB.target);

  // the follow spot: shadow-casting key light that tracks the performer
  const spot = new THREE.SpotLight(0xfff1dc, 750, 0, 0.17, 0.45, 2);
  spot.position.set(-7, 11, 6);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.camera.near = 6;
  spot.shadow.camera.far = 25;
  scene.add(spot, spot.target);

  scene.fog = new THREE.Fog(0x160c10, 20, 50);
  scene.background = new THREE.Color(0x160c10);

  return { spot };
}
