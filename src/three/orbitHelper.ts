import * as THREE from 'three';

export interface SphericalOrbitOptions {
  initialTheta?: number;
  initialPhi?: number;
  initialRadius?: number;
  minRadius?: number;
  maxRadius?: number;
  target?: THREE.Vector3;
  autoRotateSpeed?: number;
}

export interface SphericalOrbitController {
  update: (dt: number) => void;
  setAngles: (theta: number, phi: number, radius?: number) => void;
  dispose: () => void;
}

export function createWebGLRendererSafe(container: HTMLElement): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);
    return renderer;
  } catch {
    return null;
  }
}

export function attachSphericalOrbit(
  domEl: HTMLElement,
  camera: THREE.PerspectiveCamera,
  opts: SphericalOrbitOptions = {}
): SphericalOrbitController {
  let targetTheta = opts.initialTheta ?? 0.65;
  let targetPhi = opts.initialPhi ?? 1.12;
  let targetRadius = opts.initialRadius ?? 7.5;

  let curTheta = targetTheta;
  let curPhi = targetPhi;
  let curRadius = targetRadius;

  const minR = opts.minRadius ?? 4.2;
  const maxR = opts.maxRadius ?? 13.5;
  const lookTarget = opts.target ? opts.target.clone() : new THREE.Vector3(0, 0, 0);
  const autoSpeed = opts.autoRotateSpeed ?? 0.14;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let userInteractedRecently = 0;

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    userInteractedRecently = 4.0;
    try {
      domEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic events without active pointerId
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    userInteractedRecently = 4.0;

    targetTheta -= dx * 0.0085;
    targetPhi = Math.max(0.28, Math.min(Math.PI - 0.32, targetPhi - dy * 0.0075));
  };

  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    try {
      domEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onWheel = (e: WheelEvent) => {
    // Only zoom when pointer is intentionally scrolling inside desktop viewport with ctrl or small step
    e.preventDefault();
    userInteractedRecently = 4.0;
    targetRadius = Math.max(minR, Math.min(maxR, targetRadius + e.deltaY * 0.005));
  };

  domEl.addEventListener('pointerdown', onPointerDown);
  domEl.addEventListener('pointermove', onPointerMove);
  domEl.addEventListener('pointerup', onPointerUp);
  domEl.addEventListener('pointercancel', onPointerUp);
  domEl.addEventListener('wheel', onWheel, { passive: false });

  const applyCamera = () => {
    const sinPhi = Math.sin(curPhi);
    camera.position.set(
      lookTarget.x + curRadius * sinPhi * Math.sin(curTheta),
      lookTarget.y + curRadius * Math.cos(curPhi),
      lookTarget.z + curRadius * sinPhi * Math.cos(curTheta)
    );
    camera.lookAt(lookTarget);
  };

  applyCamera();

  return {
    update: (dt: number) => {
      if (!dragging) {
        if (userInteractedRecently > 0) {
          userInteractedRecently = Math.max(0, userInteractedRecently - dt);
        } else {
          targetTheta += autoSpeed * dt;
        }
      }
      const damp = 1 - Math.exp(-9 * dt);
      curTheta += (targetTheta - curTheta) * damp;
      curPhi += (targetPhi - curPhi) * damp;
      curRadius += (targetRadius - curRadius) * damp;
      applyCamera();
    },
    setAngles: (theta: number, phi: number, radius?: number) => {
      targetTheta = theta;
      targetPhi = phi;
      if (radius !== undefined) targetRadius = radius;
      userInteractedRecently = 3.5;
    },
    dispose: () => {
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointercancel', onPointerUp);
      domEl.removeEventListener('wheel', onWheel);
    },
  };
}
