import { LiquidSim, SIM_DT } from '../sim/LiquidSim';

// Scripted cursor paths that put the liquid into named, reproducible states.
// They drive the simulation through the same command interface as the real
// pointer, at 60 samples per second, so a state is exactly what a user's
// gesture would have produced.

export const sceneStates = ['calm', 'wake', 'reflect', 'settled', 'still'] as const;
export type SceneState = (typeof sceneStates)[number];

type Path = (t: number) => { x: number; y: number };

function drive(sim: LiquidSim, path: Path, duration: number): void {
  const frame = 1 / 60;
  let acc = 0;
  for (let t = 0; t <= duration + 1e-9; t += frame) {
    const p = path(Math.min(1, t / duration));
    sim.command({ x: p.x, y: p.y, active: true });
    acc += frame;
    const n = Math.floor(acc / SIM_DT);
    acc -= n * SIM_DT;
    sim.advance(n);
  }
  sim.command({ x: 0, y: 0, active: false });
}

function wait(sim: LiquidSim, seconds: number): void {
  sim.advance(Math.round(seconds / SIM_DT));
}

// A quick S-swipe from the left rim across the cup, toward the front right.
const swipe: Path = (t) => {
  const e = t * t * (3 - 2 * t);
  return { x: -0.85 + 1.6 * e, y: -0.35 + 0.55 * e + 0.28 * Math.sin(e * Math.PI * 2) };
};

// A slow spiral stir, the gesture behind the reduced-motion still.
const spiral: Path = (t) => {
  const a = 0.6 + t * Math.PI * 2.6;
  const r = 0.62 - 0.38 * t;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
};

export function runStroke(sim: LiquidSim, state: SceneState): void {
  switch (state) {
    case 'calm':
      return;
    case 'wake':
      drive(sim, swipe, 0.42);
      wait(sim, 0.12);
      return;
    case 'reflect':
      drive(sim, swipe, 0.42);
      wait(sim, 0.95);
      return;
    case 'settled':
      drive(sim, swipe, 0.42);
      wait(sim, 5.0);
      return;
    case 'still':
      drive(sim, spiral, 2.4);
      wait(sim, 0.9);
      return;
  }
}
