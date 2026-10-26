import './styles.css';

const root = document.documentElement;
const params = new URLSearchParams(location.search);
const posterMode = params.has('poster'); // used by scripts/posters.mjs to render stills
const stillT = params.has('t') ? parseFloat(params.get('t')) : null;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

const story = document.getElementById('story');
const chapters = [...document.querySelectorAll('.chapter')];
const stage = document.getElementById('stage');
const bar = document.querySelector('.bar');
const host = document.getElementById('canvas-host');
const posterPic = document.getElementById('poster');

if (posterMode) root.classList.add('is-poster');

// ---------- scroll -> story time ----------
// t runs 0..4.x: integer k means chapter k is at the top of the viewport.
let starts = [];
function measure() {
  const y0 = window.scrollY;
  starts = chapters.map((c) => c.getBoundingClientRect().top + y0);
}
function storyTime() {
  const y = window.scrollY;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (y >= starts[i]) {
      const next = i < chapters.length - 1 ? starts[i + 1] : starts[i] + chapters[i].offsetHeight;
      return Math.min(i + (y - starts[i]) / (next - starts[i]), chapters.length - 0.0001);
    }
  }
  return 0;
}

// ---------- still posters (reduced motion / no WebGL) ----------
const POSTERS = ['hero', 'crema', 'vapore', 'disegno', 'servito'];
let currentPoster = 'hero';
function setPoster(i) {
  const name = POSTERS[Math.max(0, Math.min(POSTERS.length - 1, i))];
  if (name === currentPoster) return;
  currentPoster = name;
  posterPic.querySelector('source').srcset = `/posters/${name}-portrait.webp`;
  posterPic.querySelector('img').src = `/posters/${name}-landscape.webp`;
}

// ---------- chapter highlight + bar ----------
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) e.target.classList.toggle('is-on', e.isIntersecting);
  },
  { rootMargin: '-35% 0px -35% 0px' }
);
chapters.forEach((c) => io.observe(c));

let stageVisible = true;
const storyIo = new IntersectionObserver(([e]) => {
  stageVisible = e.isIntersecting;
  stage.classList.toggle('is-hidden', !stageVisible);
  if (scene) scene.setActive(stageVisible && !document.hidden);
});
storyIo.observe(story);

let scene = null;
let mode = 'still';

function onScroll() {
  bar.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.5);
  const t = storyTime();
  if (mode === 'still') setPoster(Math.round(t - 0.25));
  else if (scene) scene.setTarget(t);
}

measure();
window.addEventListener('resize', () => { measure(); onScroll(); }, { passive: true });
window.addEventListener('scroll', onScroll, { passive: true });
document.addEventListener('visibilitychange', () => scene && scene.setActive(stageVisible && !document.hidden));
onScroll();

// ---------- boot the live scene after first paint ----------
function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

async function startLive() {
  if (scene || !webglOk()) return;
  mode = 'live';
  const { createScene } = await import('./scene.js');
  scene = createScene(host, { still: stillT, poster: posterMode });
  scene.setTarget(stillT ?? storyTime(), true);
  scene.setActive(stageVisible && !document.hidden);
  scene.onFirstFrame(() => {
    root.classList.add('is-live');
    window.__sceneReady = true;
  });
}

function stopLive() {
  if (!scene) return;
  scene.dispose();
  scene = null;
  mode = 'still';
  root.classList.remove('is-live');
  currentPoster = '';
  onScroll();
}

function decide() {
  if (reduced.matches && !posterMode) {
    root.classList.add('is-still');
    stopLive();
  } else {
    root.classList.remove('is-still');
    const go = () => startLive();
    if (posterMode) go();
    else if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 600 });
    else setTimeout(go, 200);
  }
}
reduced.addEventListener?.('change', decide);
if (document.readyState === 'complete') decide();
else window.addEventListener('load', decide, { once: true });
