import './styles/main.css';
import { initHeroRibbon } from './viz/heroRibbon';
import { initPhotonTuner } from './viz/photonTuner';
import { initSpectrumChart } from './viz/spectrumChart';
import { initPnJunctionSim } from './viz/pnJunctionSim';
import { initIvLab } from './viz/ivLab';
import { initEnergyWaterfall } from './viz/energyWaterfall';

function initScrollNavigation(): void {
  const progressEl = document.getElementById('reading-progress');
  const navLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.chapter-nav a[data-chapter]')
  );
  const chapters = navLinks
    .map((a) => document.getElementById(a.dataset.chapter || ''))
    .filter((el): el is HTMLElement => el !== null);

  const onScroll = () => {
    const docEl = document.documentElement;
    const maxScroll = Math.max(1, docEl.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100));
    if (progressEl) {
      progressEl.style.width = `${pct.toFixed(1)}%`;
    }

    const triggerY = window.scrollY + window.innerHeight * 0.28;
    let activeId = chapters[0]?.id ?? '';
    for (const ch of chapters) {
      if (ch.offsetTop <= triggerY) {
        activeId = ch.id;
      }
    }
    for (const link of navLinks) {
      link.classList.toggle('active', link.dataset.chapter === activeId);
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function scheduleThreeScenesAfterFirstPaint(): void {
  let started = false;
  const load3D = () => {
    if (started) return;
    started = true;

    if (__SOLAR_STATIC_BUILD__) {
      if (window.__Solar3D) {
        window.__Solar3D.initAll();
        return;
      }
      const script = document.createElement('script');
      script.src = './assets/three-scenes.js';
      script.async = true;
      script.onload = () => {
        window.__Solar3D?.initAll();
      };
      document.body.appendChild(script);
    } else {
      import('./three/initThreeScenes').then((mod) => {
        mod.initAllThreeScenes();
      });
    }
  };

  // Defer 3D engine download until after First Paint so initial payload stays tiny (<90 KB)
  requestAnimationFrame(() => {
    setTimeout(load3D, 80);
  });
}

function boot(): void {
  initScrollNavigation();
  initHeroRibbon();
  initPhotonTuner();
  initSpectrumChart();
  initPnJunctionSim();
  initIvLab();
  initEnergyWaterfall();
  scheduleThreeScenesAfterFirstPaint();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
