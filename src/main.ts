import { hero } from './figs/hero.ts';
import { journey } from './figs/journey.ts';
import { spectrum } from './figs/spectrum.ts';
import { gap } from './figs/gap.ts';
import { budget } from './figs/budget.ts';
import { junction } from './figs/junction.ts';
import { iv } from './figs/iv.ts';
import { panel } from './figs/panel.ts';
import { mount3d } from './figs/three-loader.ts';
import { whenNear } from './lib.ts';

function body(id: string): HTMLElement {
  return document.querySelector(`#${id} .fig-body`) as HTMLElement;
}

function safely(name: string, fn: () => void) {
  try { fn(); } catch (err) {
    console.error(`[figure:${name}]`, err);
    const b = document.querySelector(`#fig-${name} .fig-body`);
    if (b && !b.childElementCount) b.textContent = 'This diagram could not be drawn in your browser.';
  }
}

function init() {
  safely('hero', () => hero(document.getElementById('hero-canvas') as HTMLCanvasElement));
  // Light-weight figures are built just before they scroll into view.
  const figs: [string, (el: HTMLElement) => void][] = [
    ['journey', journey], ['spectrum', spectrum], ['gap', gap], ['budget', budget],
    ['junction', junction], ['iv', iv], ['panel', panel],
  ];
  for (const [name, build] of figs) {
    const el = body(`fig-${name}`);
    let built = false;
    const run = () => { if (!built) { built = true; safely(name, () => build(el)); } };
    whenNear(el, run, '900px');
    // They are cheap, so build the rest shortly after first paint too: the page
    // then has its final height before anyone jumps around with the chapter links.
    window.setTimeout(run, 1200);
  }
  // 3D figures share one lazily loaded bundle.
  mount3d(body('fig-lattice'), 'lattice');
  mount3d(body('fig-doping'), 'doping');
  mount3d(body('fig-cell'), 'cell');
  chrome();
}

/** Top bar: appears after the hero, shows reading progress and current chapter. */
function chrome() {
  const bar = document.getElementById('topbar')!;
  const prog = document.getElementById('progress-bar')!;
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.chapters a'));
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')!) as HTMLElement);
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY, vh = window.innerHeight;
    bar.classList.toggle('show', y > vh * 0.6);
    const max = document.documentElement.scrollHeight - vh;
    prog.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    let current = -1;
    sections.forEach((sec, i) => { if (sec.getBoundingClientRect().top < vh * 0.4) current = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === current));
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
