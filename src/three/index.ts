// Entry point of the lazily loaded 3D bundle (exposed as window.__solar3d).
import { lattice } from './lattice.ts';
import { cell } from './cell.ts';

export function mount(name: 'lattice' | 'doping' | 'cell', el: HTMLElement) {
  if (name === 'cell') cell(el);
  else lattice(el, name);
}
