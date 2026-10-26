// Lazy entry for the real-time craft scenes. This module ships in the main
// bundle and imports nothing from three.js: the renderer runtime is fetched
// with a dynamic import only after first paint (hero, on idle) or when a craft
// mount approaches the viewport. Under prefers-reduced-motion nothing loads and
// the finished stills stay in place.
import type { SceneName } from '../scenes';

type EngineModule = typeof import('./engine');

let enginePromise: Promise<EngineModule> | null = null;
let observer: IntersectionObserver | null = null;
let viewObserver: IntersectionObserver | null = null;
let idleHandle: number | null = null;

export function loadEngine(): Promise<EngineModule> {
  enginePromise ??= import('./engine');
  return enginePromise;
}

function supportsRealtime(): boolean {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) return true;
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

function startMount(mount: HTMLElement, priority: number): void {
  const name = mount.dataset.scene as SceneName;
  loadEngine()
    .then((engine) => engine.ensureScene(name, mount, priority))
    .catch(() => {
      // The still fallback stays visible; the page remains complete.
    });
}

function boot(): void {
  const mounts = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'));
  const hero = mounts.find((mount) => mount.dataset.scene === 'hero-extraction');
  const craft = mounts.filter((mount) => mount !== hero);

  // Hero: after the still has painted, on idle.
  if (hero) {
    const startHero = () => {
      idleHandle = null;
      startMount(hero, 2);
    };
    const afterPaint = () => {
      if ('requestIdleCallback' in window) idleHandle = window.requestIdleCallback(startHero, { timeout: 1500 });
      else idleHandle = globalThis.setTimeout(startHero, 300) as unknown as number;
    };
    if (document.readyState === 'complete') requestAnimationFrame(() => requestAnimationFrame(afterPaint));
    else window.addEventListener('load', () => requestAnimationFrame(afterPaint), { once: true });
  }

  // Craft chapters: preload when a mount comes within 30% of a viewport, and
  // promote it to the front of the start queue once it is actually in view.
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer?.unobserve(entry.target);
        startMount(entry.target as HTMLElement, 0);
      }
    },
    { rootMargin: '30% 0px 30% 0px' },
  );
  viewObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      viewObserver?.unobserve(entry.target);
      startMount(entry.target as HTMLElement, 1);
    }
  });
  craft.forEach((mount) => {
    observer?.observe(mount);
    viewObserver?.observe(mount);
  });
}

function teardown(): void {
  observer?.disconnect();
  observer = null;
  viewObserver?.disconnect();
  viewObserver = null;
  if (idleHandle !== null) {
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleHandle);
    window.clearTimeout(idleHandle);
    idleHandle = null;
  }
  enginePromise?.then((engine) => engine.disposeAll()).catch(() => undefined);
}

export function initRealtimeScenes(motionPreference: MediaQueryList): void {
  const realtime = supportsRealtime();
  const apply = () => {
    if (motionPreference.matches || !realtime) teardown();
    else if (!observer) boot();
  };
  motionPreference.addEventListener('change', apply);
  apply();

  if (import.meta.env.MODE === 'test') {
    import('./testHooks').then((hooks) => hooks.installTestHooks()).catch((error) => console.error(error));
  }
}
