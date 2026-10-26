import * as THREE from 'three/webgpu';

export type RendererBackend = 'webgpu' | 'webgl2';

// WebGPU first. Without a WebGPU adapter the renderer falls back to its WebGL2
// backend and compiles the same TSL materials to GLSL. `?backend=webgl` forces
// the fallback so the gate can compare both paths.
export async function createRenderer(canvas: HTMLCanvasElement): Promise<THREE.WebGPURenderer> {
  const forceWebGL = new URLSearchParams(window.location.search).get('backend') === 'webgl';
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    forceWebGL,
  });
  // Backend selection is async; render() before init() warns and drops frames.
  await renderer.init();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function rendererBackend(renderer: THREE.WebGPURenderer): RendererBackend {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
}

export function resizeRenderer(
  renderer: THREE.WebGPURenderer,
  camera: THREE.PerspectiveCamera,
  maxDpr = 2,
): boolean {
  const canvas = renderer.domElement;
  const width = Math.max(1, Math.floor(canvas.clientWidth));
  const height = Math.max(1, Math.floor(canvas.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const bufferWidth = Math.floor(width * dpr);
  const bufferHeight = Math.floor(height * dpr);
  const needsResize = canvas.width !== bufferWidth || canvas.height !== bufferHeight;

  if (needsResize) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return needsResize;
}

// Renders one frame into an offscreen target and reads it back as RGBA bytes.
// Headless Chromium rasterizes WebGPU but cannot present it to a canvas, so
// screenshots of the WebGPU path come out blank; this readback is the WebGPU
// evidence. Output is linear (no tone mapping or sRGB encode) with rows top
// down on both backends: WebGL2 reads bottom-up, so its rows are flipped here.
export async function readFrame(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): Promise<{ width: number; height: number; backend: RendererBackend; rgba: string }> {
  const target = new THREE.RenderTarget(width, height);
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const raw = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)) as Uint8Array;
    const backend = rendererBackend(renderer);
    const pixels = backend === 'webgpu' ? raw : new Uint8Array(raw.length);
    if (backend !== 'webgpu') {
      const row = width * 4;
      for (let y = 0; y < height; y += 1) pixels.set(raw.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
    }
    let binary = '';
    for (let i = 0; i < pixels.length; i += 0x8000) {
      binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
    }
    return { width, height, backend, rgba: btoa(binary) };
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
  }
}
