import type * as THREE from 'three/webgpu';

export interface CraftScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The hero runs its own extraction loop while active. */
  autoplay?: boolean;
  environmentIntensity?: number;
  /** Follow the mount's content box. */
  resize(aspect: number): void;
  /** progress: eased scroll progress 0..1; clock: scene seconds; dt: scaled step. */
  update(progress: number, clock: number, dt: number): void;
  /** True while the liquid is visibly moving at this progress (ambient frames are worth drawing). */
  isLive(progress: number): boolean;
  dispose?(): void;
}
