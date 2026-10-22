import './styles.css';
import { Game } from './game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas, 1);

if (__TEST_HOOKS__) {
  const { installTestHooks } = await import('./testHooks');
  installTestHooks(game);
}

game.run();
requestAnimationFrame(() => {
  requestAnimationFrame(() => document.getElementById('loading')?.classList.add('done'));
});
