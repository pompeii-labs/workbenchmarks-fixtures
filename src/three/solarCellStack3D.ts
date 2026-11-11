import * as THREE from 'three';
import { attachSphericalOrbit, createWebGLRendererSafe } from './orbitHelper';

interface LayerSpec {
  id: string;
  title: string;
  thicknessNote: string;
  swatch: string;
  baseY: number;
  explodeOffsetY: number;
  description: string;
}

const LAYERS: LayerSpec[] = [
  {
    id: 'glass',
    title: '1. Tempered Glass & EVA',
    thicknessNote: '3.2 mm protective shield',
    swatch: '#bae6fd',
    baseY: 0.72,
    explodeOffsetY: 2.35,
    description:
      'Low-iron tempered glass and UV-stable EVA polymer seal the fragile silicon wafer against hail, rain, wind, and humidity for 30+ years while transmitting >97% of sunlight.',
  },
  {
    id: 'grid',
    title: '2. Silver Fingers & Busbars',
    thicknessNote: '~35 µm wide (<3% shade)',
    swatch: '#f8fafc',
    baseY: 0.50,
    explodeOffsetY: 1.48,
    description:
      'Hair-thin silver “fingers” collect electrons every ~1.5 mm so they don’t get bogged down by sheet resistance in the ultra-thin N-layer, funneling current onto thicker busbars.',
  },
  {
    id: 'arc',
    title: '3. Indigo SiNx + Micro-Pyramids',
    thicknessNote: '75 nm film on 5 µm pyramids',
    swatch: '#4f46e5',
    baseY: 0.34,
    explodeOffsetY: 0.72,
    description:
      'Etched 3D <111> pyramids bounce reflected rays downward into neighboring faces, while a 75 nm silicon nitride quarter-wave film cancels reflections—giving panels their deep indigo hue!',
  },
  {
    id: 'emitter',
    title: '4. N-Emitter & P–N Junction',
    thicknessNote: '~0.3 µm top skin',
    swatch: '#38bdf8',
    baseY: 0.14,
    explodeOffsetY: 0.05,
    description:
      'Phosphorus-doped N-type top skin sitting right beneath the pyramids. Its built-in electric field sweeps light-freed electrons upward toward the silver fingers.',
  },
  {
    id: 'base',
    title: '5. P-Type Silicon Wafer Base',
    thicknessNote: '~160 µm crystalline wafer',
    swatch: '#fb7185',
    baseY: -0.32,
    explodeOffsetY: -0.78,
    description:
      'Boron-doped crystalline silicon bulk—thick enough to give weakly absorbed red and near-infrared photons a long path to create electron-hole pairs.',
  },
  {
    id: 'perc',
    title: '6. PERC Rear Mirror & Contact',
    thicknessNote: 'AlOx passivation + Al back',
    swatch: '#94a3b8',
    baseY: -0.82,
    explodeOffsetY: -1.78,
    description:
      'A rear dielectric mirror bounces unabsorbed infrared light back up through the wafer for a second chance and heals surface defects, while tiny laser-opened slots collect holes (+).',
  },
];

export function initSolarCellStack3D(): void {
  const mount = document.getElementById('cell-3d-mount');
  if (!mount) return;

  let explodeFactor = 0.45; // Start partially exploded so 3D depth is immediately clear!
  let selectedLayerIdx = 2; // Default highlight: Indigo SiNx + Micro-Pyramids
  let liveRays = true;

  mount.innerHTML = `
    <div class="scene3d-shell">
      <div class="scene3d-viewport" id="cell3d-vp">
        <div class="scene3d-overlay-top">
          <div class="scene3d-tag" id="cell3d-tag">PERC Monocrystalline Silicon Architecture</div>
          <button type="button" class="stage-btn active-gold" id="cell3d-flow-btn" style="pointer-events:auto;">
            Sunlight &amp; e&minus; Flow: ON
          </button>
        </div>
      </div>

      <div class="scene3d-sidebar">
        <div class="ctrl-group" style="flex:0 0 auto;">
          <div class="ctrl-label-row">
            <span class="sidebar-section-label" style="margin:0;">Explode 3D Layers</span>
            <span class="ctrl-val" id="cell3d-exp-val">45%</span>
          </div>
          <input type="range" id="cell3d-exp-slider" min="0" max="100" step="1" value="45" aria-label="Explode 3D solar cell layers" />
        </div>

        <div>
          <div class="sidebar-section-label">Click Layer to Inspect</div>
          <div class="layer-list" id="cell3d-layers">
            ${LAYERS.map(
              (l, idx) => `
                <button type="button" class="layer-btn ${idx === selectedLayerIdx ? 'active' : ''}" data-idx="${idx}">
                  <span>${l.title}</span>
                  <span class="layer-swatch" style="background:${l.swatch};"></span>
                </button>
              `
            ).join('')}
          </div>
        </div>

        <div class="inspector-box" id="cell3d-inspector"></div>
      </div>
    </div>
  `;

  const vp = mount.querySelector('#cell3d-vp') as HTMLElement;
  const expSlider = mount.querySelector('#cell3d-exp-slider') as HTMLInputElement;
  const expVal = mount.querySelector('#cell3d-exp-val') as HTMLElement;
  const flowBtn = mount.querySelector('#cell3d-flow-btn') as HTMLButtonElement;
  const layerBtns = Array.from(mount.querySelectorAll('#cell3d-layers button')) as HTMLButtonElement[];
  const inspector = mount.querySelector('#cell3d-inspector') as HTMLElement;

  const renderer = createWebGLRendererSafe(vp);
  if (!renderer) {
    vp.innerHTML =
      '<div class="loading-3d">WebGL is disabled in this browser environment.</div>';
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const orbit = attachSphericalOrbit(vp, camera, {
    initialTheta: 0.68,
    initialPhi: 1.08,
    initialRadius: 8.6,
    minRadius: 5.2,
    maxRadius: 14,
    autoRotateSpeed: 0.11,
  });

  // Balanced multi-directional lighting so metallic silver, glass, and indigo pyramids shine
  scene.add(new THREE.AmbientLight(0xe2e8f0, 0.8));
  const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.65);
  sunLight.position.set(5, 10, 6);
  scene.add(sunLight);
  const fillLight = new THREE.DirectionalLight(0x6366f1, 0.75);
  fillLight.position.set(-7, 3, -5);
  scene.add(fillLight);

  const slabW = 3.6;
  const slabD = 3.6;
  const layerGroups: THREE.Group[] = [];
  const pickableMeshes: { mesh: THREE.Object3D; layerIdx: number }[] = [];

  const registerPickable = (obj: THREE.Object3D, layerIdx: number) => {
    pickableMeshes.push({ mesh: obj, layerIdx });
  };

  // Layer 0: Tempered Low-Iron Glass
  {
    const g = new THREE.Group();
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.05,
      reflectivity: 0.8,
    });
    const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.14, slabD), glassMat);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(glassMesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.65 })
    );
    g.add(glassMesh, edges);
    registerPickable(glassMesh, 0);
    scene.add(g);
    layerGroups.push(g);
  }

  // Layer 1: Silver Front Grid (Fingers + 2 Busbars)
  {
    const g = new THREE.Group();
    const silverMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.88,
    });

    // 2 main busbars along Z
    for (const bx of [-0.95, 0.95]) {
      const bus = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, slabD * 0.96), silverMat);
      bus.position.set(bx, 0, 0);
      g.add(bus);
      registerPickable(bus, 1);
    }

    // 11 fine silver fingers running perpendicular along X
    for (let f = -5; f <= 5; f++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(slabW * 0.94, 0.032, 0.028), silverMat);
      finger.position.set(0, -0.01, f * 0.31);
      g.add(finger);
      registerPickable(finger, 1);
    }
    scene.add(g);
    layerGroups.push(g);
  }

  // Layer 2: Indigo SiNx Anti-Reflective Coating + 3D <111> Micro-Pyramids!
  {
    const g = new THREE.Group();
    const indigoMat = new THREE.MeshStandardMaterial({
      color: 0x312e81,
      emissive: 0x1e1b4b,
      emissiveIntensity: 0.45,
      roughness: 0.32,
      metalness: 0.28,
    });

    const baseSheet = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.05, slabD), indigoMat);
    baseSheet.position.y = -0.05;
    g.add(baseSheet);
    registerPickable(baseSheet, 2);

    // InstancedMesh of crisp 4-sided square pyramids across the entire wafer top!
    const gridN = 12;
    const pyrSize = slabW / gridN;
    const pyrGeo = new THREE.ConeGeometry(pyrSize * 0.69, 0.19, 4);
    pyrGeo.rotateY(Math.PI / 4); // align square base with wafer axes!
    const inst = new THREE.InstancedMesh(pyrGeo, indigoMat, gridN * gridN);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let ix = 0; ix < gridN; ix++) {
      for (let iz = 0; iz < gridN; iz++) {
        dummy.position.set(
          -slabW / 2 + pyrSize * (ix + 0.5),
          0.065,
          -slabD / 2 + pyrSize * (iz + 0.5)
        );
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    registerPickable(inst, 2);

    scene.add(g);
    layerGroups.push(g);
  }

  // Layer 3: Ultra-Thin N-Type Emitter + Glowing Depletion Plane
  {
    const g = new THREE.Group();
    const emitterMesh = new THREE.Mesh(
      new THREE.BoxGeometry(slabW, 0.09, slabD),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.45,
        roughness: 0.35,
      })
    );
    const depSheet = new THREE.Mesh(
      new THREE.BoxGeometry(slabW * 1.004, 0.035, slabD * 1.004),
      new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.72,
      })
    );
    depSheet.position.y = -0.055;
    g.add(emitterMesh, depSheet);
    registerPickable(emitterMesh, 3);
    scene.add(g);
    layerGroups.push(g);
  }

  // Layer 4: Thick P-Type Silicon Wafer Base
  {
    const g = new THREE.Group();
    const pBaseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(slabW, 0.62, slabD),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: 0x4c1d2f,
        emissiveIntensity: 0.28,
        roughness: 0.42,
        metalness: 0.32,
      })
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(pBaseMesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.4 })
    );
    g.add(pBaseMesh, edges);
    registerPickable(pBaseMesh, 4);
    scene.add(g);
    layerGroups.push(g);
  }

  // Layer 5: PERC Rear Dielectric Mirror + Laser Contact Vias + Aluminum Backplate
  {
    const g = new THREE.Group();
    const mirrorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(slabW, 0.06, slabD),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.25,
        roughness: 0.12,
        metalness: 0.75,
      })
    );
    mirrorMesh.position.y = 0.08;

    const alBackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(slabW, 0.11, slabD),
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.35,
        metalness: 0.78,
      })
    );
    alBackMesh.position.y = -0.02;

    g.add(mirrorMesh, alBackMesh);
    registerPickable(mirrorMesh, 5);
    registerPickable(alBackMesh, 5);
    scene.add(g);
    layerGroups.push(g);
  }

  // Highlight wireframe box around currently selected layer
  const highlightRing = new THREE.Mesh(
    new THREE.BoxGeometry(slabW + 0.14, 0.22, slabD + 0.14),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    })
  );
  scene.add(highlightRing);

  // =========================================================================
  // LIVE 3D SUNLIGHT PHOTONS & LATERAL FINGER ELECTRON COLLECTION PARTICLES
  // =========================================================================
  const flowGroup = new THREE.Group();
  scene.add(flowGroup);

  interface PhotonRayParticle {
    mesh: THREE.Mesh;
    wavelengthType: 'blue' | 'red' | 'ir';
    x: number;
    z: number;
    phase: number;
    speed: number;
  }

  const rayParticles: PhotonRayParticle[] = [];
  const pGeo = new THREE.SphereGeometry(0.065, 12, 10);
  for (let i = 0; i < 18; i++) {
    const wType: 'blue' | 'red' | 'ir' = i % 3 === 0 ? 'blue' : i % 3 === 1 ? 'red' : 'ir';
    const col = wType === 'blue' ? 0x60a5fa : wType === 'red' ? 0xfbbf24 : 0xf87171;
    const mesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: col }));
    flowGroup.add(mesh);
    rayParticles.push({
      mesh,
      wavelengthType: wType,
      x: (Math.random() - 0.5) * (slabW * 0.78),
      z: (Math.random() - 0.5) * (slabD * 0.78),
      phase: Math.random(),
      speed: 0.34 + Math.random() * 0.15,
    });
  }

  // Collected electrons streaming laterally into silver fingers -> busbar!
  const collectorElectrons: {
    mesh: THREE.Mesh;
    fingerZ: number;
    busX: number;
    startX: number;
    phase: number;
  }[] = [];
  const eGeo = new THREE.SphereGeometry(0.055, 12, 10);
  const eMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(eGeo, eMat);
    flowGroup.add(mesh);
    const fIdx = (i % 7) - 3;
    const busX = i % 2 === 0 ? -0.95 : 0.95;
    collectorElectrons.push({
      mesh,
      fingerZ: fIdx * 0.31,
      busX,
      startX: busX + (Math.random() - 0.5) * 1.3,
      phase: Math.random(),
    });
  }

  const updateInspector = () => {
    const spec = LAYERS[selectedLayerIdx];
    inspector.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.25rem;">
        <h4 style="margin:0;color:${spec.swatch};">${spec.title}</h4>
        <span style="font-family:var(--font-mono);font-size:0.72rem;color:#94a3b8;">${spec.thicknessNote}</span>
      </div>
      <p>${spec.description}</p>
    `;
    layerBtns.forEach((b, idx) => b.classList.toggle('active', idx === selectedLayerIdx));
  };

  expSlider.addEventListener('input', () => {
    explodeFactor = Number(expSlider.value) / 100;
    expVal.textContent = `${expSlider.value}%`;
  });

  flowBtn.addEventListener('click', () => {
    liveRays = !liveRays;
    flowGroup.visible = liveRays;
    flowBtn.textContent = liveRays ? 'Sunlight & e⁻ Flow: ON' : 'Sunlight & e⁻ Flow: OFF';
    flowBtn.classList.toggle('active-gold', liveRays);
  });

  layerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedLayerIdx = Number(btn.dataset.idx);
      updateInspector();
    });
  });

  // Direct 3D Raycast click selection on layers
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let downPos = { x: 0, y: 0 };

  vp.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  vp.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return;
    const rect = vp.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(
      pickableMeshes.map((p) => p.mesh),
      false
    );
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      const found = pickableMeshes.find((p) => p.mesh === hitObj);
      if (found) {
        selectedLayerIdx = found.layerIdx;
        updateInspector();
      }
    }
  });

  updateInspector();

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

    orbit.update(dt);

    // Smoothly position each 3D layer according to explodeFactor
    layerGroups.forEach((grp, idx) => {
      const spec = LAYERS[idx];
      const targetY = spec.baseY + (spec.explodeOffsetY - spec.baseY) * explodeFactor;
      grp.position.y += (targetY - grp.position.y) * (1 - Math.exp(-12 * dt));
    });

    // Sync selection wireframe ring to selected layer
    const selGrp = layerGroups[selectedLayerIdx];
    highlightRing.position.y = selGrp.position.y;
    const ringH = selectedLayerIdx === 4 ? 0.68 : 0.24;
    highlightRing.scale.set(1, ringH / 0.22, 1);

    // Animate 3D photon absorption & electron collection along fingers/busbars
    if (liveRays) {
      const topSkyY = layerGroups[0].position.y + 1.35;
      const emitterY = layerGroups[3].position.y;
      const pBaseY = layerGroups[4].position.y;
      const rearMirrorY = layerGroups[5].position.y + 0.08;
      const gridY = layerGroups[1].position.y + 0.02;

      for (const rp of rayParticles) {
        rp.phase = (rp.phase + dt * rp.speed) % 1;
        const u = rp.phase;

        if (rp.wavelengthType === 'blue') {
          // Blue absorbs quickly right at the top N-emitter!
          const y = topSkyY + (emitterY - topSkyY) * Math.min(1, u * 1.35);
          rp.mesh.position.set(rp.x, y, rp.z);
          rp.mesh.visible = u < 0.74;
        } else if (rp.wavelengthType === 'red') {
          // Red penetrates deep into the thick P-type base before absorbing!
          const y = topSkyY + (pBaseY - 0.15 - topSkyY) * Math.min(1, u * 1.25);
          rp.mesh.position.set(rp.x, y, rp.z);
          rp.mesh.visible = u < 0.8;
        } else {
          // Near-IR penetrates all the way to the PERC rear mirror and bounces back up!
          if (u < 0.62) {
            const v = u / 0.62;
            rp.mesh.position.set(rp.x, topSkyY + (rearMirrorY - topSkyY) * v, rp.z);
          } else {
            const v = (u - 0.62) / 0.38;
            rp.mesh.position.set(rp.x + v * 0.25, rearMirrorY + (pBaseY - rearMirrorY) * v, rp.z);
          }
          rp.mesh.visible = true;
        }
      }

      for (const ce of collectorElectrons) {
        ce.phase = (ce.phase + dt * 0.48) % 1;
        const u = ce.phase;
        if (u < 0.3) {
          // Rise from emitter up to finger
          const v = u / 0.3;
          ce.mesh.position.set(ce.startX, emitterY + (gridY - emitterY) * v, ce.fingerZ);
        } else if (u < 0.68) {
          // Zip laterally along fine silver finger to busbar!
          const v = (u - 0.3) / 0.38;
          ce.mesh.position.set(ce.startX + (ce.busX - ce.startX) * v, gridY, ce.fingerZ);
        } else {
          // Race along busbar toward front edge of wafer!
          const v = (u - 0.68) / 0.32;
          ce.mesh.position.set(ce.busX, gridY + 0.03, ce.fingerZ + (slabD * 0.48 - ce.fingerZ) * v);
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
