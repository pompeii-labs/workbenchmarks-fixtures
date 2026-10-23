import * as THREE from 'three';
import { COURSE_LENGTH, GATES, RAMPS, courseAt, rampBaseY, rampProfile, type Ramp } from '../sim/course';
import { waveHeight } from '../sim/waves';

const PYLON_H = 4.4;
const BANNER_Y = 8.2;

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  if (c) draw(c);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface MarkerSpot {
  x: number;
  z: number;
}

/**
 * Race course visuals: tall inflatable gate pylons, a checkered start/finish
 * banner, buoy lines that mark the turns, floating kicker ramps, and a light
 * bar + beacons on the gate you need next.
 */
export class Course {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly pylonBody: THREE.InstancedMesh;
  private readonly pylonBand: THREE.InstancedMesh;
  private readonly markers: THREE.InstancedMesh;
  private readonly markerSpots: MarkerSpot[] = [];
  private readonly ramps: { r: Ramp; g: THREE.Group }[] = [];
  private readonly startBanner: THREE.Group;
  private readonly nextBar: THREE.Mesh;
  private readonly beacons: THREE.Mesh[] = [];
  private readonly nextMat: THREE.MeshBasicMaterial;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly bannerMat: THREE.MeshStandardMaterial;
  private readonly dummy = new THREE.Object3D();

  constructor() {
    // ---- gate pylons (instanced: 2 per gate)
    const n = GATES.length * 2;
    const bodyGeo = new THREE.CylinderGeometry(0.75, 1.15, PYLON_H, 18, 1);
    bodyGeo.translate(0, PYLON_H / 2 - 0.4, 0);
    const bandGeo = new THREE.CylinderGeometry(0.82, 0.9, 0.55, 18, 1, true);
    bandGeo.translate(0, PYLON_H * 0.62, 0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 });
    const bandMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, side: THREE.DoubleSide });
    this.pylonBody = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    this.pylonBand = new THREE.InstancedMesh(bandGeo, bandMat, n);
    const orange = new THREE.Color('#ff5f14');
    const white = new THREE.Color('#f4f6f8');
    const ink = new THREE.Color('#1a1d22');
    for (const g of GATES) {
      for (let k = 0; k < 2; k += 1) {
        const i = g.index * 2 + k;
        this.pylonBody.setColorAt(i, g.start ? white : orange);
        this.pylonBand.setColorAt(i, g.start ? ink : white);
      }
    }
    this.pylonBody.frustumCulled = false;
    this.pylonBand.frustumCulled = false;
    this.group.add(this.pylonBody, this.pylonBand);
    this.disposables.push(bodyGeo, bandGeo, bodyMat, bandMat);

    // ---- start / finish banner
    const startTex = canvasTexture(1024, 96, (c) => {
      const sq = 24;
      for (let y = 0; y < 96; y += sq) {
        for (let x = 0; x < 1024; x += sq) {
          c.fillStyle = ((x + y) / sq) % 2 === 0 ? '#111' : '#f4f4f4';
          c.fillRect(x, y, sq, sq);
        }
      }
      c.fillStyle = '#ff5f14';
      c.fillRect(300, 8, 424, 80);
      c.fillStyle = '#fff';
      c.font = 'italic 900 58px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('START · FINISH', 512, 50);
    });
    const g0 = GATES[0];
    const bannerGeo = new THREE.PlaneGeometry(g0.halfWidth * 2 - 1.2, 1.7);
    this.bannerMat = new THREE.MeshStandardMaterial({ map: startTex, side: THREE.DoubleSide, roughness: 0.7, transparent: true });
    const bannerMat = this.bannerMat;
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    // High enough that the chase camera rides under it; faces riders on approach.
    banner.position.y = BANNER_Y;
    banner.rotation.y = Math.PI;
    this.startBanner = new THREE.Group();
    this.startBanner.add(banner);
    const mastGeo = new THREE.CylinderGeometry(0.12, 0.12, BANNER_Y - PYLON_H + 1.6, 8);
    mastGeo.translate(0, (BANNER_Y + PYLON_H - 1.6) / 2 + 0.4, 0);
    const mastMat = new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.4, metalness: 0.3 });
    for (const sg of [-1, 1]) {
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.x = sg * (g0.halfWidth - 0.6);
      this.startBanner.add(mast);
    }
    this.disposables.push(mastGeo, mastMat);
    this.startBanner.position.set(g0.x, 0, g0.z);
    this.startBanner.rotation.y = Math.atan2(g0.tx, g0.tz);
    this.group.add(this.startBanner);
    this.disposables.push(startTex, bannerGeo, bannerMat);

    // ---- next-gate light bar + beacons
    const barGeo = new THREE.BoxGeometry(1, 0.32, 0.32);
    this.nextMat = new THREE.MeshBasicMaterial({ color: '#7dffcf', toneMapped: false });
    this.nextBar = new THREE.Mesh(barGeo, this.nextMat);
    this.group.add(this.nextBar);
    const beaconGeo = new THREE.CylinderGeometry(0.3, 0.5, 34, 12, 1, true);
    beaconGeo.translate(0, 17 + PYLON_H - 0.4, 0);
    this.beaconMat = new THREE.MeshBasicMaterial({
      color: '#22d98f',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    for (let k = 0; k < 2; k += 1) {
      const b = new THREE.Mesh(beaconGeo, this.beaconMat);
      this.beacons.push(b);
      this.group.add(b);
    }
    this.disposables.push(barGeo, this.nextMat, beaconGeo, this.beaconMat);

    // ---- turn marker buoys: only where the course bends, so straights stay open water
    const spacing = 16;
    for (let a = 0; a < COURSE_LENGTH; a += spacing) {
      const p0 = courseAt(a - 10);
      const p1 = courseAt(a + 10);
      const bend = Math.abs(Math.atan2(p0.tx * p1.tz - p0.tz * p1.tx, p0.tx * p1.tx + p0.tz * p1.tz));
      if (bend < 0.2) continue;
      const nearGate = GATES.some((g) => {
        const d = Math.abs(((a - g.arc + COURSE_LENGTH * 1.5) % COURSE_LENGTH) - COURSE_LENGTH / 2);
        return d < 14;
      });
      if (nearGate) continue;
      const p = courseAt(a);
      for (const sg of [-1, 1]) {
        this.markerSpots.push({ x: p.x + -p.tz * 14.5 * sg, z: p.z + p.tx * 14.5 * sg });
      }
    }
    const markerGeo = new THREE.SphereGeometry(0.55, 14, 10);
    const markerMat = new THREE.MeshStandardMaterial({ color: '#ffd21f', roughness: 0.45, emissive: '#5a3c00', emissiveIntensity: 0.3 });
    this.markers = new THREE.InstancedMesh(markerGeo, markerMat, Math.max(1, this.markerSpots.length));
    this.markers.frustumCulled = false;
    this.group.add(this.markers);
    this.disposables.push(markerGeo, markerMat);

    // ---- ramps
    const deckTex = canvasTexture(256, 512, (c) => {
      c.fillStyle = '#f2f4f5';
      c.fillRect(0, 0, 256, 512);
      c.fillStyle = '#ff5f14';
      for (let y = 40; y < 512; y += 110) {
        c.beginPath();
        c.moveTo(28, y + 60);
        c.lineTo(128, y);
        c.lineTo(228, y + 60);
        c.lineTo(228, y + 92);
        c.lineTo(128, y + 32);
        c.lineTo(28, y + 92);
        c.closePath();
        c.fill();
      }
      c.fillStyle = '#1e6fd0';
      c.fillRect(0, 0, 18, 512);
      c.fillRect(238, 0, 18, 512);
      c.fillStyle = '#ffd21f';
      c.fillRect(0, 0, 256, 22);
    });
    const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.55 });
    const sideMat = new THREE.MeshStandardMaterial({ color: '#1e6fd0', roughness: 0.5, side: THREE.DoubleSide });
    const floatMat = new THREE.MeshStandardMaterial({ color: '#2b3440', roughness: 0.7 });
    const flagMat = new THREE.MeshStandardMaterial({ color: '#ffd21f', roughness: 0.6, side: THREE.DoubleSide });
    this.disposables.push(deckTex, deckMat, sideMat, floatMat, flagMat);
    for (const r of RAMPS) {
      const g = this.buildRamp(r, deckMat, sideMat, floatMat, flagMat);
      this.ramps.push({ r, g });
      this.group.add(g);
    }
  }

  private buildRamp(r: Ramp, deckMat: THREE.Material, sideMat: THREE.Material, floatMat: THREE.Material, flagMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const seg = 16;
    const w = r.halfWidth;
    // Deck: grid along u (local +Z), across x.
    const deck = new THREE.PlaneGeometry(w * 2, r.len, 1, seg);
    // Plane is XY; map plane y (-len/2..len/2) to u and lift by profile.
    const pos = deck.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const u = pos.getY(i) + r.len / 2;
      pos.setXYZ(i, x, rampProfile(r, u), u);
    }
    deck.computeVertexNormals();
    // Plane faces +Z before the remap; the remap turns its front face upward only if winding is correct.
    const deckMesh = new THREE.Mesh(deck, deckMat);
    deckMat.side = THREE.DoubleSide;
    g.add(deckMesh);
    // Side skirts down to the float line.
    for (const sg of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.9);
      for (let k = 0; k <= seg; k += 1) {
        const u = (k / seg) * r.len;
        shape.lineTo(u, rampProfile(r, u));
      }
      shape.lineTo(r.len, -0.9);
      shape.closePath();
      const sideGeo = new THREE.ShapeGeometry(shape);
      // shape (x=u, y=height) -> local (z=u, y)
      sideGeo.rotateY(-Math.PI / 2);
      sideGeo.translate(sg * w, 0, 0);
      g.add(new THREE.Mesh(sideGeo, sideMat));
      this.disposables.push(sideGeo);
    }
    // Lip face
    const lipH = r.height + 0.9;
    const lipGeo = new THREE.PlaneGeometry(w * 2, lipH);
    lipGeo.translate(0, r.height - lipH / 2, r.len);
    g.add(new THREE.Mesh(lipGeo, sideMat));
    // Pontoon floats
    const floatGeo = new THREE.BoxGeometry(w * 2 + 0.6, 0.7, r.len + 1.2);
    floatGeo.translate(0, -0.55, r.len / 2);
    g.add(new THREE.Mesh(floatGeo, floatMat));
    // Flags on the lip corners so the kicker reads from distance.
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6);
    poleGeo.translate(0, 1.1, 0);
    const flagGeo = new THREE.PlaneGeometry(0.9, 0.55);
    flagGeo.translate(-0.45, 1.9, 0);
    for (const sg of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, floatMat);
      pole.position.set(sg * (w + 0.15), r.height, r.len);
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.copy(pole.position);
      flag.rotation.y = Math.PI / 2;
      g.add(pole, flag);
    }
    this.disposables.push(deck, lipGeo, floatGeo, poleGeo, flagGeo);
    g.position.set(r.x, 0, r.z);
    g.rotation.y = Math.atan2(r.dx, r.dz);
    return g;
  }

  update(t: number, nextGate: number, raceStarted: boolean, camera: THREE.Vector3, showGuide: boolean): void {
    // Pylons bob with the water.
    for (const g of GATES) {
      for (let k = 0; k < 2; k += 1) {
        const sg = k === 0 ? -1 : 1;
        const x = g.x + -g.tz * g.halfWidth * sg;
        const z = g.z + g.tx * g.halfWidth * sg;
        const y = waveHeight(x, z, t) * 0.8;
        const tx = (waveHeight(x + 1, z, t) - waveHeight(x - 1, z, t)) * 0.25;
        const tz = (waveHeight(x, z + 1, t) - waveHeight(x, z - 1, t)) * 0.25;
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(tz, 0, -tx);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.pylonBody.setMatrixAt(g.index * 2 + k, this.dummy.matrix);
        this.pylonBand.setMatrixAt(g.index * 2 + k, this.dummy.matrix);
      }
    }
    this.pylonBody.instanceMatrix.needsUpdate = true;
    this.pylonBand.instanceMatrix.needsUpdate = true;
    const g0 = GATES[0];
    this.startBanner.position.y = waveHeight(g0.x, g0.z, t) * 0.6;
    // Fade the banner if the camera gets close (big air through the start).
    const dCam = Math.hypot(camera.x - g0.x, camera.y - this.startBanner.position.y - BANNER_Y, camera.z - g0.z);
    this.bannerMat.opacity = Math.max(0.15, Math.min(1, (dCam - 4) / 8));

    for (let i = 0; i < this.markerSpots.length; i += 1) {
      const m = this.markerSpots[i];
      this.dummy.position.set(m.x, waveHeight(m.x, m.z, t) - 0.05, m.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.markers.setMatrixAt(i, this.dummy.matrix);
    }
    this.markers.instanceMatrix.needsUpdate = true;

    for (const { r, g } of this.ramps) g.position.y = rampBaseY(r, t);

    // Highlight the gate you need next.
    const ng = GATES[nextGate];
    const cy = waveHeight(ng.x, ng.z, t) * 0.7;
    this.nextBar.position.set(ng.x, cy + PYLON_H + (ng.start ? 0.05 : -0.2), ng.z);
    this.nextBar.rotation.y = Math.atan2(ng.tx, ng.tz);
    this.nextBar.scale.set(ng.halfWidth * 2, 1, 1);
    this.nextBar.visible = !ng.start || raceStarted;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    this.nextMat.color.setRGB(0.45 + pulse * 0.3, 1, 0.78 + pulse * 0.1);
    this.beaconMat.opacity = 0.16 + pulse * 0.1;
    for (const b of this.beacons) b.visible = showGuide;
    if (!showGuide) this.nextBar.visible = false;
    for (let k = 0; k < 2; k += 1) {
      const sg = k === 0 ? -1 : 1;
      const x = ng.x + -ng.tz * ng.halfWidth * sg;
      const z = ng.z + ng.tx * ng.halfWidth * sg;
      this.beacons[k].position.set(x, waveHeight(x, z, t) * 0.8, z);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.pylonBody.dispose();
    this.pylonBand.dispose();
    this.markers.dispose();
  }
}
