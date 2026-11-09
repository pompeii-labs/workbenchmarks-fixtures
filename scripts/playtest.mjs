// tgplaytest runner v1, written by `tgplaytest init`. Do not edit it: init
// rewrites it on upgrade. Put checks in scripts/playtest/<section>.mjs and
// run them through the gate: `tgcheck . --next --playtest scripts/playtest.mjs
// [--only a,b]`.
//
// Each file in scripts/playtest/ is one section: it exports `name` (defaults
// to the file name), optional `viewport` and `mobile`, and a default async
// function that receives { page, check, state, until, hooks, metric }.
// Every section gets a fresh page with the game sped up through the
// setTimeScale/setRenderScale test hooks. TG_ONLY (from `tgcheck --only`)
// runs only the named sections. Prints PASS/FAIL/SKIP lines, writes
// artifacts/playtest-metrics.json, and exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.TG_URL;
if (!BASE) {
    console.error('TG_URL is not set: run this through `tgcheck --playtest`.');
    process.exit(2);
}
const ONLY = (process.env.TG_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const TIME_SCALE = Number(process.env.TG_TIME_SCALE ?? 3);
const RENDER_SCALE = Number(process.env.TG_RENDER_SCALE ?? 0.5);
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'playtest');

const results = {
    runner: 'tgplaytest@1',
    timeScale: TIME_SCALE,
    renderScale: RENDER_SCALE,
    hooks: { setTimeScale: null, setRenderScale: null },
    sections: {},
    checks: [],
};
let failures = 0;

const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort()
    : [];
if (!files.length) {
    console.error(`No sections in ${DIR}. Add one file per section.`);
    process.exit(2);
}

const browser = await chromium.launch({ channel: 'chromium' });
try {
    for (const file of files) {
        const mod = await import(path.join(DIR, file));
        const name = mod.name ?? path.basename(file, '.mjs');
        if (ONLY.length && !ONLY.includes(name)) {
            console.log(`SKIP ${name}`);
            continue;
        }
        const started = Date.now();
        const section = { file, pass: 0, fail: 0, metrics: {} };
        results.sections[name] = section;
        const context = await browser.newContext({
            viewport: mod.viewport ?? (mod.mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }),
            ...(mod.mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
        });
        const page = await context.newPage();
        const check = (label, ok, detail = '') => {
            const line = `${ok ? 'PASS' : 'FAIL'} ${name}: ${label}${!ok && detail ? ` (${detail})` : ''}`;
            console.log(line);
            results.checks.push({ section: name, label, ok: Boolean(ok), detail: String(detail) });
            ok ? section.pass++ : (section.fail++, failures++);
        };
        // Diagnostics and DOM are read in one evaluate so they describe the same frame.
        const state = (fn) =>
            page.evaluate((src) => {
                const diag = window.__THREE_GAME_DIAGNOSTICS__;
                return src ? new Function('diag', `return (${src})(diag)`)(diag) : diag;
            }, fn ? fn.toString() : null);
        const until = (predicate, timeout = 15000, arg) =>
            page.waitForFunction(predicate, arg, { timeout, polling: 'raf' });
        const hooks = (fn, ...args) =>
            page.evaluate(
                ([src, a]) => new Function('h', 'args', `return (${src})(h, ...args)`)(window.__THREE_GAME_TEST_HOOKS__, a),
                [fn.toString(), args]
            );
        const metric = (key, value) => {
            section.metrics[key] = value;
        };
        try {
            await page.goto(BASE);
            await page.waitForFunction(() => window.__THREE_GAME_TEST_HOOKS__ && window.__THREE_GAME_DIAGNOSTICS__, null, { timeout: 20000 });
            const speed = await page.evaluate(
                ([t, r]) => {
                    const h = window.__THREE_GAME_TEST_HOOKS__;
                    const out = { timeScale: typeof h.setTimeScale === 'function', renderScale: typeof h.setRenderScale === 'function' };
                    if (out.timeScale) h.setTimeScale(t);
                    if (out.renderScale) h.setRenderScale(r);
                    return out;
                },
                [TIME_SCALE, RENDER_SCALE]
            );
            results.hooks.setTimeScale = (results.hooks.setTimeScale ?? true) && speed.timeScale;
            results.hooks.setRenderScale = (results.hooks.setRenderScale ?? true) && speed.renderScale;
            if (!speed.timeScale || !speed.renderScale) {
                console.log(`WARN ${name}: game lacks ${[!speed.timeScale && 'setTimeScale', !speed.renderScale && 'setRenderScale'].filter(Boolean).join(' and ')}; tgcheck fails until both exist`);
            }
            await mod.default({ page, check, state, until, hooks, metric });
        } catch (error) {
            check('section ran to completion', false, String(error?.message ?? error).split('\n')[0]);
        } finally {
            section.seconds = Math.round((Date.now() - started) / 1000);
            console.log(`SECTION ${name}: ${section.pass} passed, ${section.fail} failed, ${section.seconds}s`);
            await context.close();
        }
    }
} finally {
    await browser.close();
}

fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/playtest-metrics.json', JSON.stringify(results, null, 2) + '\n');
const total = results.checks.length;
console.log(`${total - failures}/${total} checks passed${ONLY.length ? ` (partial: ${ONLY.join(',')})` : ''}`);
process.exit(failures ? 1 : 0);
