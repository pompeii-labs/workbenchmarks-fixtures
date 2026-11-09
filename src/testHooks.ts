import type { App } from './app';
import { measureAt, slipAt } from './measure';
import { createChoreography, STILL_TIME, BEAT, PIN_CYCLE, FLIGHT, G } from './motion';

/** Test-build-only hooks. Never bundled into the production build. */
export function installTestHooks(app: App) {
  const publish = () => {
    const info = app.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: app.frame,
      t: app.t,
      paused: app.paused,
      reducedMotion: app.reducedMotion,
      camera: { az: app.az, el: app.el },
      act: {
        distance: app.pose.distance,
        wheelAngle: app.pose.wheelAngle,
        speed: app.pose.speed,
        pitch: app.pose.pitch,
        pinsInHand: app.pose.pins.filter((p) => p.inHand !== 0).length,
      },
      constants: { BEAT, PIN_CYCLE, FLIGHT, G },
      probe: { ...app.pelican.probe },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: app.canvas.clientWidth,
        clientHeight: app.canvas.clientHeight,
        width: app.canvas.width,
        height: app.canvas.height,
        dpr: app.renderer.getPixelRatio(),
      },
    };
  };
  const renderNow = () => {
    app.step(0);
    app.placeCamera();
    app.renderer.render(app.scene, app.camera);
    publish();
  };
  const origStep = app.step.bind(app);
  app.step = (dt: number) => {
    origStep(dt);
    publish();
  };

  const states: Record<string, () => void> = {
    // Mid-act, three-quarter front view.
    'active-play': () => {
      app.setReducedMotion(false);
      app.t = 31.37;
      app.az = 0.7;
      app.el = 0.2;
    },
    // Side view: pedals, cranks, legs and the end-over-end spin read best here.
    'side-view': () => {
      app.setReducedMotion(false);
      app.t = 12.9;
      app.az = 1.45;
      app.el = 0.12;
    },
    // The prefers-reduced-motion still frame.
    'reduced-motion': () => {
      app.setReducedMotion(true);
      app.az = 1.0;
      app.el = 0.16;
    },
  };

  window.__THREE_GAME_TEST_HOOKS__ = {
    seed: (value: number) => {
      app.choreo = createChoreography(value);
      app.applyTime(app.t);
      renderNow();
    },
    setState: (name: string) => {
      const s = states[name];
      if (!s) throw new Error(`Unknown state: ${name}`);
      s();
      app.applyTime(app.t);
      renderNow();
      return { state: name };
    },
    setPausedForScreenshot: (paused: boolean) => {
      app.paused = paused;
      renderNow();
    },
    setReducedMotion: (on: boolean) => {
      app.setReducedMotion(on);
      renderNow();
    },
    hideDebugUi: () => {
      /* no debug UI exists */
    },
    setTimeScale: (n: number) => {
      app.timeScale = n;
    },
    setRenderScale: (s: number) => {
      app.renderScale = s;
      renderNow();
    },
    setTime: (t: number) => {
      app.t = t;
      app.applyTime(t);
      renderNow();
      return app.t;
    },
    setCamera: (az: number, el: number) => {
      app.az = az;
      app.el = el;
      renderNow();
    },
    slipAt: (t: number) => slipAt(app, t),
    measureAt: (t: number) => measureAt(app, t),
    stillTime: () => STILL_TIME,
    diagnostics: () => {
      publish();
      return window.__THREE_GAME_DIAGNOSTICS__;
    },
  } as unknown as Record<string, (...args: never[]) => unknown>;
  publish();
}
