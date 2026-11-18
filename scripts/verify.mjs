import { chromium } from 'playwright-core';

const URL = process.env.PROBE_URL || 'http://localhost:5173/';
const EXE = process.env.CHROME_PATH || '/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('tr[data-symbol]', { timeout: 60000 });
await page.waitForTimeout(1200);

const out = {};
const ROW_H = 27;

// Phase A: default order, paused. Verify reachability + values across the scroll range.
await page.evaluate(() => window.__marketQA.pause());
await page.waitForTimeout(500);

out.defaultOrder = await page.evaluate(async (ROW_H) => {
  const q = window.__marketQA;
  const el = document.querySelector('.grid-scroll');
  const settle = () => new Promise((r) => setTimeout(r, 50));
  const count = document.querySelector('.count').textContent;
  const results = { count, positions: [], valueMismatch: 0, cellsChecked: 0, orderOk: true };
  const max = el.scrollHeight - el.clientHeight;
  const fracs = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
  for (const f of fracs) {
    el.scrollTop = max * f;
    el.dispatchEvent(new Event('scroll'));
    await settle();
    const trs = [...document.querySelectorAll('tr[data-symbol]')];
    const idxs = trs.map((t) => Number(t.getAttribute('data-symbol').replace('SYM', '')));
    let consecutive = true;
    for (let i = 1; i < idxs.length; i++) if (idxs[i] !== idxs[i - 1] + 1) consecutive = false;
    if (!consecutive) results.orderOk = false;
    for (const tr of trs) {
      const r = Number(tr.getAttribute('data-symbol').replace('SYM', ''));
      for (const td of tr.querySelectorAll('td[data-field]')) {
        const truth = q.truth(r, td.getAttribute('data-field'));
        const shown = parseFloat(td.textContent);
        results.cellsChecked++;
        if (Math.abs(shown - truth) > 0.005) results.valueMismatch++;
      }
    }
    results.positions.push({ frac: f, first: idxs[0], last: idxs[idxs.length - 1], n: idxs.length, consecutive });
  }
  el.scrollTop = max;
  el.dispatchEvent(new Event('scroll'));
  await settle();
  const bottom = [...document.querySelectorAll('tr[data-symbol]')].map((t) => t.getAttribute('data-symbol'));
  results.hasLast = bottom.includes('SYM4999');
  results.bottomTail = bottom.slice(-3);
  el.scrollTop = 0;
  el.dispatchEvent(new Event('scroll'));
  await settle();
  const top = [...document.querySelectorAll('tr[data-symbol]')].map((t) => t.getAttribute('data-symbol'));
  results.hasFirst = top.includes('SYM0000');
  return results;
}, ROW_H);

// Phase A2: sample arbitrary row indices, scroll each into view, confirm present + correct.
out.spotCheck = await page.evaluate(async (ROW_H) => {
  const q = window.__marketQA;
  const el = document.querySelector('.grid-scroll');
  const settle = () => new Promise((r) => setTimeout(r, 50));
  const idxs = [0, 1, 42, 500, 1234, 2500, 3333, 4000, 4998, 4999];
  let missing = 0, wrongVal = 0;
  for (const r of idxs) {
    el.scrollTop = Math.max(0, r * ROW_H - 100);
    el.dispatchEvent(new Event('scroll'));
    await settle();
    const tr = document.querySelector(`tr[data-symbol="SYM${String(r).padStart(4, '0')}"]`);
    if (!tr) { missing++; continue; }
    const td = tr.querySelector('td[data-field="last"]');
    const truth = q.truth(r, 'last');
    if (Math.abs(parseFloat(td.textContent) - truth) > 0.005) wrongVal++;
  }
  return { sampled: idxs.length, missing, wrongVal };
}, ROW_H);

// Phase B: flash on visible cells.
out.flash = await page.evaluate(async () => {
  const q = window.__marketQA;
  const el = document.querySelector('.grid-scroll');
  el.scrollTop = 0; el.dispatchEvent(new Event('scroll'));
  q.resume();
  await new Promise((r) => setTimeout(r, 300));
  q.pause();
  await new Promise((r) => setTimeout(r, 60));
  const now = performance.now();
  let checked = 0, flashing = 0, correctDir = 0;
  for (const tr of document.querySelectorAll('tr[data-symbol]')) {
    const r = Number(tr.getAttribute('data-symbol').replace('SYM', ''));
    for (const td of tr.querySelectorAll('td[data-field]')) {
      const rec = q.recent(r, td.getAttribute('data-field'));
      if (now - rec.changedAt < 350) {
        checked++;
        const up = td.classList.contains('flash-up'), down = td.classList.contains('flash-down');
        if (up || down) flashing++;
        if ((rec.value > rec.previous && up) || (rec.value <= rec.previous && down)) correctDir++;
      }
    }
  }
  return { checked, flashing, correctDir };
});

// Phase C: sort desc/asc + aria + live order.
out.sort = await page.evaluate(async () => {
  const q = window.__marketQA;
  q.resume();
  const el = document.querySelector('.grid-scroll');
  el.scrollTop = 0; el.dispatchEvent(new Event('scroll'));
  const th = document.querySelector('th[data-field="bid"]');
  const readTop = () => [...document.querySelectorAll('tr[data-symbol]')].slice(0, 30).map((t) => parseFloat(t.querySelector('td[data-field="bid"]').textContent));
  th.click();
  await new Promise((r) => setTimeout(r, 350));
  const desc = readTop();
  const descOk = desc.every((v, i) => i === 0 || desc[i - 1] >= v);
  const ariaDesc = th.getAttribute('aria-sort');
  th.click();
  await new Promise((r) => setTimeout(r, 350));
  const asc = readTop();
  const ascOk = asc.every((v, i) => i === 0 || asc[i - 1] <= v);
  const ariaAsc = th.getAttribute('aria-sort');
  // live: wait, ensure still sorted asc
  await new Promise((r) => setTimeout(r, 500));
  const asc2 = readTop();
  const liveOk = asc2.every((v, i) => i === 0 || asc2[i - 1] <= v);
  q.pause();
  return { descOk, ascOk, liveOk, ariaDesc, ariaAsc };
});

// Phase D: filter count + matching.
out.filter = await page.evaluate(async () => {
  const input = document.querySelector('input[name="filter"]');
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
  const set = (v) => { setter.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); };
  set('SYM01');
  await new Promise((r) => setTimeout(r, 300));
  const countText = document.querySelector('.count').textContent;
  const rows = [...document.querySelectorAll('tr[data-symbol]')];
  const allMatch = rows.length > 0 && rows.every((t) => t.getAttribute('data-symbol').toLowerCase().includes('sym01'));
  set('sYm01'); // case-insensitive
  await new Promise((r) => setTimeout(r, 200));
  const caseCount = document.querySelector('.count').textContent;
  set('');
  await new Promise((r) => setTimeout(r, 300));
  const restored = document.querySelector('.count').textContent;
  return { countText, allMatch, caseCount, restored };
});

out.errors = errors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(0);