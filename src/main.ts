import { App } from './app';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const media = window.matchMedia('(prefers-reduced-motion: reduce)');

function hideLoader() {
  document.body.classList.add('ready');
}

function fail(err: unknown) {
  const el = document.querySelector('#loader p');
  if (el) el.textContent = 'This act needs WebGL, which is not available in this browser.';
  console.error(err);
}

try {
  const app = new App(canvas, { reducedMotion: media.matches, onFirstFrame: hideLoader });
  media.addEventListener('change', (e) => app.setReducedMotion(e.matches));
  app.start();

  if (import.meta.env.VITE_TEST_HOOKS) {
    import('./testHooks').then((m) => m.installTestHooks(app));
  }
} catch (err) {
  fail(err);
}
