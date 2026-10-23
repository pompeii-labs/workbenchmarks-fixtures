import * as THREE from "three";
import { RAMPS } from "./course.js";
import { waveHeight, rampSurfaceHeight, RAMP_APRON_LENGTH } from "./physics.js";

export function createRamps(scene) {
  const orange = new THREE.MeshStandardMaterial({ color: 0xf15b35, roughness: 0.55 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff8dd, roughness: 0.65 });
  const navy = new THREE.MeshStandardMaterial({
    color: 0x183b42, roughness: 0.6,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const apronMaterial = orange.clone();
  apronMaterial.side = THREE.DoubleSide;
  return RAMPS.map((ramp) => {
    const { x, z, heading, width, length, height } = ramp;
    const group = new THREE.Group();
    group.name = "floating-ramp";
    group.position.set(x, waveHeight(x, z, 0), z);
    group.rotation.y = heading;
    const wedge = new THREE.Shape();
    // Shape x maps to local z; its top runs from rear waterline to raised lip.
    wedge.moveTo(-length / 2, -0.3);
    wedge.lineTo(length / 2, -0.3);
    wedge.lineTo(length / 2, 0);
    wedge.lineTo(-length / 2, height);
    wedge.closePath();
    const geometry = new THREE.ExtrudeGeometry(wedge, {
      depth: width, bevelEnabled: false, steps: 1,
    });
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(width / 2, 0, 0);
    group.add(new THREE.Mesh(geometry, orange));

    const deck = new THREE.Group();
    deck.position.y = height / 2;
    deck.rotation.x = Math.atan(height / length);
    const deckLength = Math.hypot(length, height);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(width, deckLength), navy);
    top.rotation.x = -Math.PI / 2;
    deck.add(top);
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, deckLength), cream);
      stripe.position.set(side * (width / 2 - 0.3), 0.025, 0);
      deck.add(stripe);
    }
    for (let i = 0; i < 3; i++) {
      const chevron = new THREE.Shape();
      chevron.moveTo(-width * 0.3, 0.9);
      chevron.lineTo(0, -0.5);
      chevron.lineTo(width * 0.3, 0.9);
      chevron.lineTo(width * 0.3, 0.25);
      chevron.lineTo(0, -1.15);
      chevron.lineTo(-width * 0.3, 0.25);
      chevron.closePath();
      const mark = new THREE.Mesh(new THREE.ShapeGeometry(chevron), cream);
      mark.rotation.set(-Math.PI / 2, 0, Math.PI);
      mark.position.set(0, 0.035, deckLength * (0.27 - i * 0.25));
      deck.add(mark);
    }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.45), orange);
    lip.position.set(0, 0.04, -deckLength / 2 + 0.225);
    deck.add(lip);
    group.add(deck);

    const apronGeometry = new THREE.PlaneGeometry(
      width, RAMP_APRON_LENGTH, Math.ceil(width * 4), RAMP_APRON_LENGTH * 4,
    );
    apronGeometry.rotateX(-Math.PI / 2);
    apronGeometry.translate(0, 0, length / 2 + RAMP_APRON_LENGTH / 2);
    const apron = new THREE.Mesh(apronGeometry, apronMaterial);
    apron.name = "ramp-apron";
    const apronPositions = apronGeometry.attributes.position;
    apronPositions.setUsage(THREE.DynamicDrawUsage);
    group.add(apron);

    for (const side of [-1, 1]) {
      const pontoon = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, length - 1.3, 4, 10), navy);
      pontoon.rotation.x = Math.PI / 2;
      pontoon.position.set(side * (width / 2 + 0.25), -0.25, 0);
      group.add(pontoon);
      for (const fraction of [-0.35, 0, 0.35]) {
        const supportHeight = height * (0.5 - fraction) + 0.25;
        const support = new THREE.Mesh(new THREE.BoxGeometry(0.24, supportHeight, 0.32), cream);
        support.position.set(side * (width / 2 + 0.1), supportHeight / 2 - 0.25, length * fraction);
        group.add(support);
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 0.42), orange);
        band.position.set(side * (width / 2 + 0.25), 0.26, length * fraction);
        group.add(band);
      }
    }
    scene.add(group);
    const sin = Math.sin(heading), cos = Math.cos(heading);
    function update(time) {
      const base = waveHeight(x, z, time);
      group.position.y = base;
      for (let i = 0; i < apronPositions.count; i++) {
        const localX = apronPositions.getX(i), localZ = apronPositions.getZ(i);
        const worldX = x + cos * localX + sin * localZ;
        const worldZ = z - sin * localX + cos * localZ;
        apronPositions.setY(i, rampSurfaceHeight(ramp, worldX, worldZ, time) - base);
      }
      apronPositions.needsUpdate = true;
      apronGeometry.computeVertexNormals();
      apronGeometry.computeBoundingSphere();
    }
    update(0);
    return { group, ramp, update };
  });
}
