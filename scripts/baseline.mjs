// Baseline probe: tolerant of a fully blocked page main thread.
// Uses CDP Performance metrics (browser-side counters) + raced evaluates.
import { chromium } from 'playwright-core';

const URL = process.env.PROBE_URL || 'http://localhost:5173/';
const EXE = process.env.CHROME_PATH || '/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell';

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');

const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const race = (p, ms, label) => Promise.race([p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, err: String(e) })), new Promise((r) => setTimeout(() => r({ ok: false, err: `${label} timed out after ${ms}ms (main thread blocked)` }), ms))]);

const out = {};
const tLoad = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
out.firstRow = await race(page.waitForSelector('tr[data-symbol]', { timeout: 60000 }), 60000, 'waitForSelector');
out.timeToFirstRowMs = Date.now() - tLoad;

const m0 = await metrics();
const w0 = Date.now();
await new Promise((r) => setTimeout(r, 8000)); // wall-clock observation window
const m1 = await metrics();
const wall = (Date.now() - w0) / 1000;
out.mainThread = {
  wallSeconds: wall,
  taskSeconds: +(m1.TaskDuration - m0.TaskDuration).toFixed(2),
  scriptSeconds: +(m1.ScriptDuration - m0.ScriptDuration).toFixed(2),
  layoutSeconds: +(m1.LayoutDuration - m0.LayoutDuration).toFixed(2),
  styleSeconds: +(m1.RecalcStyleDuration - m0.RecalcStyleDuration).toFixed(2),
  busyFraction: +((m1.TaskDuration - m0.TaskDuration) / wall).toFixed(3),
  nodes: m1.Nodes,
};

out.ping = await race(page.evaluate(() => 1 + 1), 8000, 'evaluate(1+1)');
out.state = await race(page.evaluate(() => {
  const q = window.__marketQA;
  return { rows: document.querySelectorAll('tr[data-symbol]').length, seq: q.seq, delivered: q.delivered, backlog: q.backlog };
}), 8000, 'evaluate(state)');

console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(0);