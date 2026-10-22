import './styles.css';
import { Game } from './game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');
const game = new Game(canvas);
game.start();
