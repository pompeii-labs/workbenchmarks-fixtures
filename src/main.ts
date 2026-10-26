import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import './style.css';

import arrowDown from '@phosphor-icons/core/regular/arrow-down.svg?raw';
import arrowUpRight from '@phosphor-icons/core/regular/arrow-up-right.svg?raw';
import clock from '@phosphor-icons/core/regular/clock.svg?raw';
import coffee from '@phosphor-icons/core/regular/coffee.svg?raw';
import mapPin from '@phosphor-icons/core/regular/map-pin.svg?raw';
import { initSceneStory } from './scenes';

const icons: Record<string, string> = {
  'arrow-down': arrowDown,
  'arrow-up-right': arrowUpRight,
  clock,
  coffee,
  'map-pin': mapPin,
};

document.querySelectorAll<HTMLElement>('[data-icon]').forEach((element) => {
  const name = element.dataset.icon;
  if (name && icons[name]) {
    element.innerHTML = icons[name];
  }
});

const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealElements = document.querySelectorAll<HTMLElement>('[data-reveal]');

if (motionPreference.matches || !('IntersectionObserver' in window)) {
  revealElements.forEach((element) => element.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  );
  revealElements.forEach((element) => revealObserver.observe(element));
}

const menuToggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const mobileMenu = document.querySelector<HTMLElement>('[data-mobile-menu]');
let menuOpen = false;

function setMenu(open: boolean, restoreFocus = true): void {
  if (!menuToggle || !mobileMenu || menuOpen === open) return;
  menuOpen = open;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  mobileMenu.setAttribute('aria-hidden', String(!open));
  mobileMenu.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);

  if (open) {
    requestAnimationFrame(() => {
      if (menuOpen) mobileMenu.querySelector<HTMLAnchorElement>('a')?.focus();
    });
  } else if (restoreFocus) {
    menuToggle.focus();
  }
}

menuToggle?.addEventListener('click', () => setMenu(!menuOpen));
mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false, false)));

document.addEventListener('keydown', (event) => {
  if (!menuOpen || !mobileMenu || !menuToggle) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    setMenu(false);
    return;
  }
  if (event.key !== 'Tab') return;

  const links = Array.from(mobileMenu.querySelectorAll<HTMLAnchorElement>('a'));
  const focusable = [menuToggle, ...links];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => {
  if (event.matches) setMenu(false, false);
});

type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const openingHours: Record<DayIndex, { open: number; close: number }> = {
  0: { open: 8 * 60, close: 13 * 60 },
  1: { open: 7 * 60 + 30, close: 18 * 60 },
  2: { open: 7 * 60 + 30, close: 18 * 60 },
  3: { open: 7 * 60 + 30, close: 18 * 60 },
  4: { open: 7 * 60 + 30, close: 18 * 60 },
  5: { open: 7 * 60 + 30, close: 18 * 60 },
  6: { open: 8 * 60, close: 19 * 60 },
};
const dayIndexes: Record<string, DayIndex> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

function updateOpeningStatus(): void {
  const status = document.querySelector<HTMLElement>('[data-open-status]');
  if (!status) return;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
  const day = dayIndexes[weekday];
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 12);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const time = hour * 60 + minute;
  const today = openingHours[day];
  let message = '';
  let isOpen = false;

  if (time >= today.open && time < today.close) {
    isOpen = true;
    message = `Open now · until ${formatTime(today.close)}`;
  } else if (time < today.open) {
    message = `Closed now · opens today at ${formatTime(today.open)}`;
  } else {
    const nextDay = ((day + 1) % 7) as DayIndex;
    message = `Closed now · opens ${dayNames[nextDay]} at ${formatTime(openingHours[nextDay].open)}`;
  }

  status.textContent = message;
  const note = status.closest<HTMLElement>('.hours-note');
  if (note) note.dataset.state = isOpen ? 'open' : 'closed';
}

updateOpeningStatus();
initSceneStory(motionPreference);
