import { initSiliconLattice3D } from './siliconLattice3D';
import { initSolarCellStack3D } from './solarCellStack3D';

let initialized = false;

export function initAllThreeScenes(): void {
  if (initialized) return;
  initialized = true;
  initSiliconLattice3D();
  initSolarCellStack3D();
}
