// Loads the three.js bundle on demand (as a classic script, so it also works
// from file://) and mounts a scene into a figure.
import { h, whenNear } from '../lib.ts';

export type SceneName = 'lattice' | 'doping' | 'cell';
interface Scenes { mount(name: SceneName, el: HTMLElement): void }

let pending: Promise<Scenes> | null = null;

function load(): Promise<Scenes> {
  if (pending) return pending;
  pending = new Promise<Scenes>((resolve, reject) => {
    const main = document.querySelector<HTMLScriptElement>('script[src*="main.js"]');
    const src = main ? main.src.replace(/main\.js.*$/, 'scene3d.js') : './assets/scene3d.js';
    const tag = h('script', { src, async: true });
    tag.onload = () => {
      const api = (window as unknown as { __solar3d?: Scenes }).__solar3d;
      if (api) resolve(api); else reject(new Error('3D bundle did not initialise'));
    };
    tag.onerror = () => reject(new Error('3D bundle failed to load'));
    document.head.append(tag);
  });
  return pending;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export function mount3d(el: HTMLElement, name: SceneName) {
  const placeholder = h('div', { class: 'stage' }, h('div', { class: 'stage-msg' }, 'Loading the 3D model…'));
  el.append(placeholder);
  const fail = (why: string) => {
    placeholder.firstElementChild!.textContent =
      `${why} The 3D model can't be shown here, but the text around it tells the same story.`;
  };
  whenNear(el, () => {
    if (!webglAvailable()) { fail('This browser has 3D graphics (WebGL) switched off.'); return; }
    load().then((api) => {
      try {
        placeholder.remove();
        api.mount(name, el);
      } catch (err) {
        console.error(err);
        el.replaceChildren(placeholder);
        fail('Something went wrong starting 3D graphics.');
      }
    }, (err) => { console.error(err); fail('The 3D code could not be loaded.'); });
  }, '1200px');
}
