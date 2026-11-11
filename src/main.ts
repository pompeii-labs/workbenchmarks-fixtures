import { hero } from './hero';
import { spectrumChart, budgetChart, sqChart, depthChart } from './charts';
import { photonWidget, ladderWidget, dopingSketch, timelineWidget } from './widgets';
import { junctionSim } from './junction';
import { ivFigure } from './iv';
import { onVisible } from './util';
import type * as Scenes from './three/index';

type ScenesAPI = typeof Scenes;
declare global { interface Window { SolarThree?: ScenesAPI } }

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;

function safe(name: string, fn: () => void) {
  try { fn(); } catch (e) { console.error(`[${name}]`, e); }
}

// Lazily load the three.js scenes only when a 3D figure approaches the viewport.
let scenesPromise: Promise<ScenesAPI> | null = null;
function loadScenes(): Promise<ScenesAPI> {
  if (scenesPromise) return scenesPromise;
  if (import.meta.env.DEV) {
    scenesPromise = import('./three/index');
  } else {
    scenesPromise = new Promise((resolve, reject) => {
      if (window.SolarThree) return resolve(window.SolarThree);
      const s = document.createElement('script');
      s.src = new URL('assets/scenes3d.js', document.baseURI).href;
      s.async = true;
      s.onload = () => (window.SolarThree ? resolve(window.SolarThree) : reject(new Error('3D bundle missing')));
      s.onerror = () => reject(new Error('Could not load 3D bundle'));
      document.head.appendChild(s);
    });
  }
  return scenesPromise;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function mount3D(stage: HTMLElement, run: (api: ScenesAPI) => void) {
  let started = false;
  const io = onVisible(stage, (v) => {
    if (!v || started) return;
    started = true; io.disconnect();
    if (!webglAvailable()) {
      stage.querySelector('.stage-placeholder')!.innerHTML = '<span>This 3D figure needs WebGL, which this browser has turned off.</span>';
      return;
    }
    loadScenes().then((api) => {
      stage.querySelector('.stage-placeholder')?.remove();
      run(api);
    }).catch((e) => {
      console.error(e);
      stage.querySelector('.stage-placeholder')!.innerHTML = '<span>The 3D figure could not be loaded.</span>';
    });
  }, '400px');
}

function rail() {
  const nav = $('.rail');
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.rail-steps a'));
  const now = $('.rail-now');
  const bar = $('.rail-progress span');
  const heroEl = $('.hero');
  const chapters = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'));
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('show', y > heroEl.offsetHeight * 0.6);
    const doc = document.documentElement;
    bar.style.width = `${Math.min(100, (y / (doc.scrollHeight - innerHeight)) * 100)}%`;
    let idx = -1;
    chapters.forEach((c, i) => { if (c.getBoundingClientRect().top < innerHeight * 0.4) idx = i; });
    links.forEach((a, i) => { a.classList.toggle('active', i === idx); a.classList.toggle('done', i < idx); });
    now.textContent = idx >= 0 ? `${idx + 1} / ${chapters.length} · ${links[idx].textContent}` : '';
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
}

function reveal() {
  const els = document.querySelectorAll('.chapter h2, .fig');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach((el) => { el.classList.add('reveal'); io.observe(el); });
}

function init() {
  safe('hero', () => hero($('.hero-canvas')));
  safe('rail', rail);
  safe('spectrum', () => spectrumChart($('[data-chart="spectrum"]'), $('[data-readout="spectrum"]')));
  safe('photon', () => photonWidget($('[data-widget="photon"]')));
  safe('ladder', () => ladderWidget($('[data-widget="ladder"]')));
  safe('budget', () => budgetChart($('[data-chart="budget"]'), $('#gap-slider'), $('[data-out="gap"]'), $('[data-chips="materials"]'), $('[data-bars="budget"]')));
  safe('sq', () => sqChart($('[data-chart="sq"]')));
  safe('doping', () => dopingSketch($('[data-widget="doping"]')));
  safe('junction', () => junctionSim($('[data-sim="junction"]'), $('[data-readout="junction"]'), $('#fig-junction .controls')));
  safe('depth', () => depthChart($('[data-chart="depth"]'), $('[data-readout="depth"]')));
  safe('iv', () => ivFigure($('#fig-iv')));
  safe('timeline', () => timelineWidget($('[data-widget="timeline"]')));
  safe('lattice', () => mount3D($('[data-three="lattice"]'), (api) => api.mountLattice($('[data-three="lattice"]'), $('[data-controls="lattice"]'), $('[data-status="lattice"]'))));
  safe('cell3d', () => mount3D($('[data-three="cell"]'), (api) => api.mountCell($('[data-three="cell"]'), $('#explode'), $('[data-layers="cell"]'), $('[data-layer-info="cell"]'))));
  safe('reveal', reveal);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
