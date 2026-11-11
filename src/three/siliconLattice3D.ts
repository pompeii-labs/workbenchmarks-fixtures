import * as THREE from 'three';
import { attachSphericalOrbit, createWebGLRendererSafe } from './orbitHelper';

type DopingMode = 'intrinsic' | 'ntype' | 'ptype';
type PhotonType = 'ir' | 'red' | 'blue';

interface BondRecord {
  aIdx: number;
  bIdx: number;
  mid: THREE.Vector3;
  dir: THREE.Vector3;
  electronMeshes: [THREE.Mesh, THREE.Mesh];
}

export function initSiliconLattice3D(): void {
  const mount = document.getElementById('lattice-3d-mount');
  if (!mount) return;

  let dopingMode: DopingMode = 'intrinsic';

  mount.innerHTML = `
    <div class="scene3d-shell">
      <div class="scene3d-viewport" id="lat3d-vp">
        <div class="scene3d-overlay-top">
          <div class="scene3d-tag" id="lat3d-badge">Pure Silicon &middot; 4 Valence Bonds per Atom</div>
          <div class="scene3d-tag" id="lat3d-event" style="color:#fde68a;display:none;"></div>
        </div>
      </div>

      <div class="scene3d-sidebar">
        <div>
          <div class="sidebar-section-label">1. Choose Crystal Composition</div>
          <div class="layer-list" id="lat3d-modes">
            <button type="button" class="layer-btn active" data-mode="intrinsic">
              <span><strong>Pure Silicon (Si)</strong> &middot; 4 outer e&minus;</span>
              <span class="layer-swatch" style="background:#94a3b8;"></span>
            </button>
            <button type="button" class="layer-btn" data-mode="ntype">
              <span><strong>N-Type (+Phosphorus)</strong> &middot; 5 outer e&minus;</span>
              <span class="layer-swatch" style="background:#38bdf8;"></span>
            </button>
            <button type="button" class="layer-btn" data-mode="ptype">
              <span><strong>P-Type (+Boron)</strong> &middot; 3 outer e&minus;</span>
              <span class="layer-swatch" style="background:#fb7185;"></span>
            </button>
          </div>
        </div>

        <div>
          <div class="sidebar-section-label">2. Fire a Photon at a Covalent Bond</div>
          <div class="btn-group" id="lat3d-photons">
            <button type="button" class="stage-btn" data-p="ir">Infrared (0.8 eV)</button>
            <button type="button" class="stage-btn active-gold" data-p="red">Red (1.8 eV)</button>
            <button type="button" class="stage-btn" data-p="blue">Blue (2.8 eV)</button>
          </div>
        </div>

        <div class="inspector-box" id="lat3d-info">
          <h4>Pure (Intrinsic) Silicon</h4>
          <p>
            Every silicon atom shares its 4 outer electrons in four tetrahedral covalent bonds
            (109.5&deg; apart). All seats are locked—until a photon with &ge;1.12 eV knocks an
            electron loose!
          </p>
        </div>
      </div>
    </div>
  `;

  const vp = mount.querySelector('#lat3d-vp') as HTMLElement;
  const badge = mount.querySelector('#lat3d-badge') as HTMLElement;
  const eventTag = mount.querySelector('#lat3d-event') as HTMLElement;
  const infoBox = mount.querySelector('#lat3d-info') as HTMLElement;
  const modeBtns = Array.from(mount.querySelectorAll('#lat3d-modes button')) as HTMLButtonElement[];
  const photonBtns = Array.from(mount.querySelectorAll('#lat3d-photons button')) as HTMLButtonElement[];

  const renderer = createWebGLRendererSafe(vp);
  if (!renderer) {
    vp.innerHTML =
      '<div class="loading-3d">WebGL is disabled in this browser environment.</div>';
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const orbit = attachSphericalOrbit(vp, camera, {
    initialTheta: 0.62,
    initialPhi: 1.16,
    initialRadius: 8.5,
    minRadius: 5.0,
    maxRadius: 13,
    autoRotateSpeed: 0.18,
  });

  // Crisp studio lighting
  scene.add(new THREE.AmbientLight(0xdbeafe, 0.75));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(6, 9, 7);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
  rimLight.position.set(-7, -4, -6);
  scene.add(rimLight);

  // =========================================================================
  // BUILD TRUE DIAMOND-CUBIC TETRAHEDRAL SILICON CLUSTER
  // Centered on interior tetrahedral site (0.25, 0.25, 0.25) shifted to origin (0,0,0)!
  // =========================================================================
  const latticeScale = 3.55;
  const fccBasis = [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ];

  const rawSites: THREE.Vector3[] = [];
  const centerShift = new THREE.Vector3(0.25, 0.25, 0.25);

  for (let ix = -1; ix <= 1; ix++) {
    for (let iy = -1; iy <= 1; iy++) {
      for (let iz = -1; iz <= 1; iz++) {
        for (const b of fccBasis) {
          // Sublattice A
          const pA = new THREE.Vector3(ix + b[0], iy + b[1], iz + b[2]).sub(centerShift);
          if (pA.length() <= 0.92) rawSites.push(pA.multiplyScalar(latticeScale));
          // Sublattice B offset by (1/4, 1/4, 1/4)
          const pB = new THREE.Vector3(
            ix + b[0] + 0.25,
            iy + b[1] + 0.25,
            iz + b[2] + 0.25
          ).sub(centerShift);
          if (pB.length() <= 0.92) rawSites.push(pB.multiplyScalar(latticeScale));
        }
      }
    }
  }

  // Deduplicate sites & place the exact (0,0,0) central atom at index 0
  const atomBasePositions: THREE.Vector3[] = [];
  for (const p of rawSites) {
    if (!atomBasePositions.some((q) => q.distanceTo(p) < 0.05)) {
      atomBasePositions.push(p);
    }
  }
  atomBasePositions.sort((a, b) => a.length() - b.length()); // index 0 is exact (0,0,0)!

  const crystalGroup = new THREE.Group();
  scene.add(crystalGroup);

  const siMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.28,
    metalness: 0.35,
  });
  const dopantNMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x0369a1,
    emissiveIntensity: 0.55,
    roughness: 0.2,
    metalness: 0.25,
  });
  const dopantPMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0x9f1239,
    emissiveIntensity: 0.55,
    roughness: 0.2,
    metalness: 0.25,
  });

  const atomGeo = new THREE.SphereGeometry(0.27, 24, 20);
  const centerAtomGeo = new THREE.SphereGeometry(0.33, 28, 24);
  const atomMeshes: THREE.Mesh[] = atomBasePositions.map((pos, idx) => {
    const mesh = new THREE.Mesh(idx === 0 ? centerAtomGeo : atomGeo, idx === 0 ? siMat.clone() : siMat);
    mesh.position.copy(pos);
    crystalGroup.add(mesh);
    return mesh;
  });

  // Nearest-neighbor bond length in diamond-cubic is (sqrt(3)/4) * latticeScale
  const nnDist = (Math.sqrt(3) / 4) * latticeScale;
  const bondGeo = new THREE.CylinderGeometry(0.058, 0.058, 1, 12);
  const bondMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.45,
    metalness: 0.15,
    transparent: true,
    opacity: 0.82,
  });

  const valenceElecGeo = new THREE.SphereGeometry(0.075, 14, 12);
  const valenceElecMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
  });

  const bonds: BondRecord[] = [];
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < atomBasePositions.length; i++) {
    for (let j = i + 1; j < atomBasePositions.length; j++) {
      const pA = atomBasePositions[i];
      const pB = atomBasePositions[j];
      const dist = pA.distanceTo(pB);
      if (Math.abs(dist - nnDist) < 0.12) {
        const mid = pA.clone().add(pB).multiplyScalar(0.5);
        const dir = pB.clone().sub(pA).normalize();

        const cyl = new THREE.Mesh(bondGeo, bondMat);
        cyl.position.copy(mid);
        cyl.scale.set(1, dist, 1);
        cyl.quaternion.setFromUnitVectors(upVec, dir);
        crystalGroup.add(cyl);

        // Two shared covalent valence electrons per bond
        const perp = new THREE.Vector3(dir.y, -dir.x, 0.3).normalize().cross(dir).normalize();
        const e1 = new THREE.Mesh(valenceElecGeo, valenceElecMat);
        const e2 = new THREE.Mesh(valenceElecGeo, valenceElecMat);
        e1.position.copy(mid).addScaledVector(perp, 0.11).addScaledVector(dir, -0.14);
        e2.position.copy(mid).addScaledVector(perp, -0.11).addScaledVector(dir, 0.14);
        crystalGroup.add(e1, e2);

        bonds.push({ aIdx: i, bIdx: j, mid, dir, electronMeshes: [e1, e2] });
      }
    }
  }

  // Roaming 5th donor electron (for N-type Phosphorus)
  const donorElectron = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 18, 16),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.95,
    })
  );
  donorElectron.visible = false;
  crystalGroup.add(donorElectron);

  // Roaming acceptor hole torus (for P-type Boron)
  const acceptorHole = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.038, 12, 24),
    new THREE.MeshStandardMaterial({
      color: 0xfb7185,
      emissive: 0xf43f5e,
      emissiveIntensity: 0.95,
    })
  );
  acceptorHole.visible = false;
  crystalGroup.add(acceptorHole);

  // Dynamic Photon + Photo-generated Free Electron/Hole State
  const photonOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 18, 16),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  photonOrb.visible = false;
  crystalGroup.add(photonOrb);

  const photoElectron = donorElectron.clone();
  photoElectron.visible = false;
  crystalGroup.add(photoElectron);

  const photoHole = acceptorHole.clone();
  photoHole.visible = false;
  crystalGroup.add(photoHole);

  const shockRing = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.26, 28),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    })
  );
  shockRing.visible = false;
  crystalGroup.add(shockRing);

  let heatShake = 0;
  let activeShot: {
    type: PhotonType;
    phase: number; // 0 -> 1 incoming, 1 -> 4 roaming/passing
    startPos: THREE.Vector3;
    hitPos: THREE.Vector3;
    endPos: THREE.Vector3;
    targetBond: BondRecord;
  } | null = null;

  const targetBond = bonds.find((b) => b.aIdx === 0) ?? bonds[0];

  const triggerPhoton = (pType: PhotonType) => {
    const startPos = new THREE.Vector3(-4.2, 2.3, 2.6);
    const hitPos = targetBond.mid.clone();
    const endPos = hitPos.clone().add(hitPos.clone().sub(startPos).normalize().multiplyScalar(4.8));

    activeShot = {
      type: pType,
      phase: 0,
      startPos,
      hitPos,
      endPos,
      targetBond,
    };

    const col = pType === 'ir' ? 0xf87171 : pType === 'red' ? 0xfbbf24 : 0x60a5fa;
    (photonOrb.material as THREE.MeshBasicMaterial).color.setHex(col);
    (shockRing.material as THREE.MeshBasicMaterial).color.setHex(
      pType === 'blue' ? 0xfb923c : 0xfbbf24
    );

    photonBtns.forEach((b) => {
      b.classList.toggle('active-gold', b.dataset.p === pType);
    });

    eventTag.style.display = 'block';
    if (pType === 'ir') {
      eventTag.textContent = '0.8 eV Infrared < 1.12 eV: Passes straight through!';
      eventTag.style.color = '#fca5a5';
    } else if (pType === 'red') {
      eventTag.textContent = '1.8 eV Red ≥ 1.12 eV: Bond broken → Free e⁻ + Hole!';
      eventTag.style.color = '#6ee7b7';
    } else {
      eventTag.textContent = '2.8 eV Blue: Bond broken + 1.68 eV shakes lattice as heat!';
      eventTag.style.color = '#fdba74';
    }
  };

  const applyDopingMode = (m: DopingMode) => {
    dopingMode = m;
    // Restore any hidden bond electron
    bonds.forEach((b) => {
      b.electronMeshes[0].visible = true;
      b.electronMeshes[1].visible = true;
    });

    if (m === 'intrinsic') {
      atomMeshes[0].material = siMat;
      donorElectron.visible = false;
      acceptorHole.visible = false;
      badge.innerHTML = 'Pure Silicon &middot; 4 Locked Valence Electrons per Atom';
      infoBox.innerHTML = `
        <h4>Pure (Intrinsic) Silicon</h4>
        <p>
          Every silicon atom has 4 outer electrons shared neatly with 4 tetrahedral neighbors.
          Nothing flows in the dark—and when light frees an electron-hole pair here, they wander
          randomly and soon recombine.
        </p>
      `;
    } else if (m === 'ntype') {
      atomMeshes[0].material = dopantNMat;
      donorElectron.visible = true;
      acceptorHole.visible = false;
      badge.innerHTML = 'N-Type Silicon &middot; Center Phosphorus (P⁺) + Mobile 5th e⁻';
      infoBox.innerHTML = `
        <h4 style="color:#7dd3fc;">N-Type: Phosphorus Dopant (5 Outer e⁻)</h4>
        <p>
          Swap 1 silicon atom in a million for <strong>Phosphorus</strong>. Four electrons lock into
          crystal bonds; the <strong>5th electron</strong> has no bond seat and roams freely, leaving
          a locked positive <span style="font-family:var(--font-mono)">P⁺</span> core behind!
        </p>
      `;
    } else {
      atomMeshes[0].material = dopantPMat;
      donorElectron.visible = false;
      acceptorHole.visible = true;
      // Hide one bond electron next to boron to show the missing electron seat!
      targetBond.electronMeshes[0].visible = false;
      badge.innerHTML = 'P-Type Silicon &middot; Center Boron (B⁻) + Hopping Hole';
      infoBox.innerHTML = `
        <h4 style="color:#fda4af;">P-Type: Boron Dopant (3 Outer e⁻)</h4>
        <p>
          Swap a silicon atom for <strong>Boron</strong> (only 3 outer electrons). One covalent bond
          is missing an electron—creating a mobile <strong>hole</strong> that neighbors hop into,
          leaving a locked negative <span style="font-family:var(--font-mono)">B⁻</span> core!
        </p>
      `;
    }

    modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  };

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => applyDopingMode(btn.dataset.mode as DopingMode));
  });

  photonBtns.forEach((btn) => {
    btn.addEventListener('click', () => triggerPhoton(btn.dataset.p as PhotonType));
  });

  // Resize & visibility-gated render loop
  const syncSize = () => {
    const w = vp.clientWidth;
    const h = vp.clientHeight;
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  const ro = new ResizeObserver(syncSize);
  ro.observe(vp);
  syncSize();

  let visible = false;
  let rafId = 0;
  let prevMs = performance.now();

  const animate = (nowMs: number) => {
    if (!visible) return;
    const dt = Math.min(0.05, (nowMs - prevMs) * 0.001);
    prevMs = nowMs;
    const t = nowMs * 0.001;

    orbit.update(dt);

    // Thermal vibration of crystal atoms (subtle room-temp + extra shake after Blue photon!)
    heatShake = Math.max(0, heatShake - dt * 0.65);
    const vibAmp = 0.008 + heatShake * 0.075;
    atomMeshes.forEach((mesh, i) => {
      const base = atomBasePositions[i];
      mesh.position.set(
        base.x + Math.sin(t * 19 + i * 1.7) * vibAmp,
        base.y + Math.cos(t * 17 + i * 2.3) * vibAmp,
        base.z + Math.sin(t * 21 + i * 3.1) * vibAmp
      );
    });

    // Roaming 5th electron in N-Type mode
    if (dopingMode === 'ntype') {
      donorElectron.position.set(
        Math.cos(t * 1.9) * 1.45 + Math.sin(t * 0.7) * 0.5,
        Math.sin(t * 1.5) * 1.25,
        Math.sin(t * 1.9) * 1.45
      );
    }

    // Hopping hole from bond midpoint to bond midpoint in P-Type mode
    if (dopingMode === 'ptype' && bonds.length > 4) {
      const hopFloat = (t * 0.95) % bonds.length;
      const bA = bonds[Math.floor(hopFloat)];
      const bB = bonds[(Math.floor(hopFloat) + 1) % bonds.length];
      const u = hopFloat - Math.floor(hopFloat);
      const smooth = u * u * (3 - 2 * u);
      acceptorHole.position.lerpVectors(bA.mid, bB.mid, smooth);
      acceptorHole.lookAt(camera.position);
    }

    // Active Photon Shot animation
    if (activeShot) {
      activeShot.phase += dt * 1.15;
      const p = activeShot.phase;

      if (activeShot.type === 'ir') {
        // Passes straight through the entire crystal!
        photonOrb.visible = p < 2.0;
        photoElectron.visible = false;
        photoHole.visible = false;
        shockRing.visible = false;
        if (p < 2.0) {
          photonOrb.position.lerpVectors(activeShot.startPos, activeShot.endPos, p / 2.0);
        } else {
          activeShot = null;
        }
      } else {
        if (p < 0.85) {
          // Incoming photon
          photonOrb.visible = true;
          photoElectron.visible = false;
          photoHole.visible = false;
          shockRing.visible = false;
          photonOrb.position.lerpVectors(activeShot.startPos, activeShot.hitPos, p / 0.85);
        } else if (p < 3.6) {
          // Impact! Bond electron freed + hole left behind!
          photonOrb.visible = false;
          if (p - dt * 1.15 < 0.85 && activeShot.type === 'blue') {
            heatShake = 1.0;
          }
          const post = p - 0.85;
          activeShot.targetBond.electronMeshes[1].visible = false;

          // Expanding shock ring right after impact
          if (post < 0.8) {
            shockRing.visible = true;
            shockRing.position.copy(activeShot.hitPos);
            shockRing.lookAt(camera.position);
            const s = 1 + post * 5.5;
            shockRing.scale.set(s, s, s);
            (shockRing.material as THREE.MeshBasicMaterial).opacity = 1 - post / 0.8;
          } else {
            shockRing.visible = false;
          }

          // Electron wanders out then returns to recombine (showing why a P-N junction is needed!)
          const wanderEnv = Math.sin((post / 2.75) * Math.PI);
          photoElectron.visible = true;
          photoElectron.position.set(
            activeShot.hitPos.x + Math.cos(post * 3.4) * 1.8 * wanderEnv,
            activeShot.hitPos.y + Math.sin(post * 2.7) * 1.5 * wanderEnv + 0.4 * wanderEnv,
            activeShot.hitPos.z + Math.sin(post * 3.1) * 1.6 * wanderEnv
          );

          photoHole.visible = true;
          photoHole.position.copy(activeShot.hitPos);
          photoHole.lookAt(camera.position);
        } else {
          // Recombined!
          photoElectron.visible = false;
          photoHole.visible = false;
          shockRing.visible = false;
          activeShot.targetBond.electronMeshes[1].visible = true;
          activeShot = null;
        }
      }
    }

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  };

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) {
        prevMs = performance.now();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(animate);
      } else {
        cancelAnimationFrame(rafId);
      }
    },
    { rootMargin: '200px' }
  );
  io.observe(vp);
}
