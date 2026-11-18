// Performance + correctness probe. Drives the real app in headless Chromium.
// This is test tooling, NOT application code, so it may read window.__marketQA.
import { chromium } from 'playwright-core';

const URL = process.env.PROBE_URL || 'http://localhost:5173/';
const EXE = process.env.CHROME_PATH || '/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell';
const MODE = process.env.PROBE_MODE || 'perf'; // perf | correctness | quick

setTimeout(() => { console.error('PROBE WATCHDOG: forcing exit'); process.exit(3); }, 120000).unref?.();

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-gpu', '--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const logs = [];
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('tr[data-symbol]', { timeout: 60000 });

// Install a frame/long-task recorder in the page.
await page.evaluate(() => {
  window.__probe = { frames: [], longtasks: [], recording: false };
  const rec = window.__probe;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (rec.recording) rec.longtasks.push({ start: e.startTime, dur: e.duration });
  }).observe({ entryTypes: ['longtask'] });
  let last = performance.now();
  function loop(now) {
    if (rec.recording) rec.frames.push(now - last);
    last = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});

async function startRec() {
  await page.evaluate(() => { const r = window.__probe; r.frames = []; r.longtasks = []; r.recording = true; });
}
async function stopRec() {
  return page.evaluate(() => {
    const r = window.__probe; r.recording = false;
    const f = r.frames.slice();
    const sum = f.reduce((a, b) => a + b, 0);
    const sorted = f.slice().sort((a, b) => a - b);
    const pct = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
    return {
      frames: f.length,
      seconds: sum / 1000,
      fps: f.length / (sum / 1000),
      avgMs: sum / f.length,
      p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: sorted[sorted.length - 1] || 0,
      longtasks: r.longtasks.length,
      longtaskTotalMs: r.longtasks.reduce((a, b) => a + b.dur, 0),
      longtaskMaxMs: r.longtasks.reduce((a, b) => Math.max(a, b.dur), 0),
    };
  });
}

const qa = () => page.evaluate(() => {
  const q = window.__marketQA;
  return { seq: q.seq, delivered: q.delivered, backlog: q.backlog };
});

const result = { mode: MODE, url: URL };

if (MODE === 'perf' || MODE === 'quick') {
  // Let the feed reach steady state.
  await page.waitForTimeout(2500);
  const before = await qa();
  await startRec();
  const DURATION = MODE === 'quick' ? 2000 : 5000;
  await page.waitForTimeout(DURATION);
  const idle = await stopRec();
  const after = await qa();

  // Scroll while the feed runs.
  await startRec();
  await page.evaluate(async () => {
    const el = document.querySelector('.grid-scroll');
    const max = el.scrollHeight - el.clientHeight;
    for (let i = 0; i <= 20; i++) {
      el.scrollTop = (max * i) / 20;
      await new Promise((r) => setTimeout(r, 60));
    }
    el.scrollTop = 0;
  });
  const scroll = await stopRec();

  // Sort while the feed runs: click a numeric header, measure time to ordered DOM.
  const sortLatency = await page.evaluate(async () => {
    const th = document.querySelector('th[data-field="last"]');
    const t0 = performance.now();
    th.click();
    let guard = 0;
    while (th.getAttribute('aria-sort') !== 'descending' && guard++ < 400) await new Promise((r) => setTimeout(r, 5));
    const t1 = performance.now();
    return { clickToAriaMs: t1 - t0 };
  });
  await startRec();
  await page.waitForTimeout(MODE === 'quick' ? 1500 : 3000);
  const sorting = await stopRec();
  const afterSort = await qa();

  result.perf = { idle, scroll, sorting, sortLatency, feed: { before, after, afterSort } };
  result.perf.feedDrainRate = (after.delivered - before.delivered) / (idle.seconds || 1);
}

if (MODE === 'correctness') {
  // Pause the feed so truth is stable, then compare every visible cell to truth.
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__marketQA.pause());
  await page.waitForTimeout(600); // let last batch land + flashes settle

  const check = await page.evaluate(() => {
    const q = window.__marketQA;
    const rows = [...document.querySelectorAll('tr[data-symbol]')];
    const fields = q.fields;
    let cells = 0, mismatch = 0; const examples = [];
    const symbols = new Set();
    for (const tr of rows) {
      const sym = tr.getAttribute('data-symbol');
      symbols.add(sym);
      const rowIdx = Number(sym.replace('SYM', ''));
      for (const td of tr.querySelectorAll('td[data-field]')) {
        const f = td.getAttribute('data-field');
        const truth = q.truth(rowIdx, f);
        const shown = parseFloat(td.textContent);
        cells++;
        if (Math.abs(shown - truth) > 0.005) { mismatch++; if (examples.length < 8) examples.push({ sym, f, shown, truth }); }
      }
    }
    return { rowCount: rows.length, uniqueSymbols: symbols.size, cells, mismatch, examples };
  });
  result.correctness = check;

  // Flash check: resume, wait a moment, pause, see if recently-changed cells carry flash class.
  const flash = await page.evaluate(async () => {
    const q = window.__marketQA;
    q.resume();
    await new Promise((r) => setTimeout(r, 300));
    q.pause();
    await new Promise((r) => setTimeout(r, 50));
    const now = performance.now();
    let flashing = 0, correctDir = 0, checked = 0;
    for (const tr of document.querySelectorAll('tr[data-symbol]')) {
      const rowIdx = Number(tr.getAttribute('data-symbol').replace('SYM', ''));
      for (const td of tr.querySelectorAll('td[data-field]')) {
        const f = td.getAttribute('data-field');
        const rec = q.recent(rowIdx, f);
        if (now - rec.changedAt < 350) {
          checked++;
          const up = td.classList.contains('flash-up');
          const down = td.classList.contains('flash-down');
          if (up || down) flashing++;
          const expectUp = rec.value > rec.previous;
          if ((expectUp && up) || (!expectUp && down)) correctDir++;
        }
      }
    }
    return { checked, flashing, correctDir };
  });
  result.flash = flash;

  // Sort correctness: descending then ascending, verify order of a numeric field.
  const sortCheck = await page.evaluate(async () => {
    const q = window.__marketQA;
    q.resume();
    const th = document.querySelector('th[data-field="bid"]');
    th.click(); // desc
    await new Promise((r) => setTimeout(r, 400));
    const readOrder = () => [...document.querySelectorAll('tr[data-symbol]')].slice(0, 40)
      .map((tr) => Number(tr.querySelector('td[data-field="bid"]').textContent));
    const desc = readOrder();
    const descOk = desc.every((v, i) => i === 0 || desc[i - 1] >= v);
    th.click(); // asc
    await new Promise((r) => setTimeout(r, 400));
    const asc = readOrder();
    const ascOk = asc.every((v, i) => i === 0 || asc[i - 1] <= v);
    const aria = th.getAttribute('aria-sort');
    q.pause();
    return { descOk, ascOk, ariaAfterAsc: aria, descSample: desc.slice(0, 5), ascSample: asc.slice(0, 5) };
  });
  result.sort = sortCheck;

  // Filter correctness.
  const filterCheck = await page.evaluate(async () => {
    const input = document.querySelector('input[name="filter"]');
    const setVal = (v) => {
      const proto = Object.getPrototypeOf(input);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal('SYM01');
    await new Promise((r) => setTimeout(r, 300));
    const rows = [...document.querySelectorAll('tr[data-symbol]')];
    const allMatch = rows.every((tr) => tr.getAttribute('data-symbol').toLowerCase().includes('sym01'));
    const count = rows.length;
    setVal('');
    await new Promise((r) => setTimeout(r, 300));
    const restored = document.querySelectorAll('tr[data-symbol]').length;
    return { allMatch, count, restored };
  });
  result.filter = filterCheck;

  // Reachability: scroll to bottom, confirm last instrument present.
  const reach = await page.evaluate(async () => {
    const el = document.querySelector('.grid-scroll');
    el.scrollTop = el.scrollHeight;
    await new Promise((r) => setTimeout(r, 300));
    const syms = [...document.querySelectorAll('tr[data-symbol]')].map((t) => t.getAttribute('data-symbol'));
    return { hasLast: syms.includes('SYM4999'), bottomSample: syms.slice(-3), scrollHeight: el.scrollHeight };
  });
  result.reach = reach;
}

result.logs = logs.slice(0, 40);
console.log(JSON.stringify(result, null, 2));
await browser.close();