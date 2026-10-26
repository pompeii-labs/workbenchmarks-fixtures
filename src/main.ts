import { App } from './app/App';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Missing #scene canvas.');

const fail = (message: string) => {
  document.body.classList.add('failed');
  const el = document.querySelector('#loader-text');
  if (el) el.textContent = message;
};

App.create(canvas)
  .then((app) => {
    app.start();
    requestAnimationFrame(() => document.body.classList.add('ready'));
    if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
  })
  .catch((error: unknown) => {
    console.error(error);
    fail('This browser cannot render the scene (WebGPU or WebGL2 is required).');
  });
