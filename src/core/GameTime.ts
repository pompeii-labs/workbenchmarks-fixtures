import { uniform } from 'three/tsl';

// Shader time owned by the game, not the renderer. TSL's built-in `time` runs
// on the renderer's own clock, so it ignores pause, setTimeScale, reduced
// motion, and seeded captures. Animate materials from this uniform instead;
// Game advances it with the simulation's elapsed time.
export const gameTime = uniform(0);
