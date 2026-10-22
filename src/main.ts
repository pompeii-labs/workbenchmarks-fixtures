import './styles.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

const game = new Game(canvas);

if (import.meta.env.MODE === 'test') {
  const { installTestHooks } = await import('./testHooks');
  installTestHooks(game);
}

game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
