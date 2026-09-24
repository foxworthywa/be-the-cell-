// Browser checks for the lab (LAB_UI §11.2), run by hand before a student test
// and before each release; not part of npm test or CI.
//
//   node build.js && node tools/ui-check.js [--out <dir>]
//
// Uses the globally installed Playwright (never "playwright install") and
// Chromium. Serves dist/ with serve.js, except P11, which opens dist/index.html
// by file://. Every interactive check uses ?test=1&seed=1&lab=1 (the app opens on the level list otherwise,
// LEVELS §5.11) and drives time with
// app.test.runTicks(n), so results do not depend on machine speed.
// Screenshots (for human review, no pixel diff) go to test-artifacts/screens/.
'use strict';
const fs = require('fs');
const path = require('path');
const { createServer } = require('../serve.js');

function loadPlaywright() {
  try { return require('/opt/node22/lib/node_modules/playwright'); } catch (e) { /* fall through */ }
  try { return require('playwright'); } catch (e) { return null; }
}

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const outArg = process.argv.indexOf('--out');
const OUT = outArg >= 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'test-artifacts', 'screens');

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok: !!ok, detail });
  console.log((ok ? 'pass ' : 'FAIL ') + id + (detail ? ': ' + detail : ''));
}

const paint = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const T = (page, n) => page.evaluate((k) => window.__btc.app.test.runTicks(k), n);
const nums = (s) => (s.match(/[\d,]+/g) || []).map((x) => Number(x.replace(/,/g, '')));

async function openPage(browser, port, vp, opts) {
  const o = opts || {};
  const touch = o.touch !== false;
  const context = await browser.newContext({
    viewport: { width: vp[0], height: vp[1] }, isMobile: touch, hasTouch: touch, deviceScaleFactor: o.dpr || 2,
  });
  const page = await context.newPage();
  const errors = [], offsite = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (!u.startsWith('http://localhost:' + port + '/') && !u.startsWith('data:') && !u.startsWith('file:')) {
      offsite.push(u); return route.abort();
    }
    return route.continue();
  });
  await page.goto((o.url || 'http://localhost:' + port + '/') + (o.query || '?test=1&seed=1&lab=1'));
  await page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test);
  await paint(page);
  return { page, context, errors, offsite };
}

async function tapTab(page, tab) {
  await page.locator('[data-tab="' + tab + '"]:visible').first().click();
  await paint(page);
}

/** Every visible button, radio, tab and chip is at least 44 × 44 CSS px (P2). */
async function smallTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, [role=radio], [role=tab], .chip')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('[hidden]')) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (r.width < 43.5 || r.height < 43.5) bad.push((el.getAttribute('data-key') || el.getAttribute('data-tab') || el.className || el.tagName) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    }
    return bad;
  });
}

async function overflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    let widest = 0, culprit = '';
    for (const el of document.querySelectorAll('#app *')) {
      if (el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > window.innerWidth + 0.5 && r.right > widest) { widest = r.right; culprit = el.id || el.className; }
    }
    return { sw: d.scrollWidth, sh: d.scrollHeight, w: window.innerWidth, h: window.innerHeight, culprit, widest: Math.round(widest) };
  });
}

async function layoutShots(browser, port, name, vp, opts) {
  const { page, context, errors, offsite } = await openPage(browser, port, vp, opts);
  const layout = await page.evaluate(() => document.body.getAttribute('data-layout'));
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-tab]')).filter((b) => b.offsetParent).map((b) => b.getAttribute('data-tab')));
  const shots = [];
  let worstW = 0, worstH = 0, small = [];
  const list = tabs.length ? tabs : [''];
  for (const tab of list) {
    if (tab) await tapTab(page, tab);
    const f = `${name}-${vp[0]}x${vp[1]}${tab ? '-' + tab : ''}.png`;
    await page.screenshot({ path: path.join(OUT, f) });
    shots.push(f);
    const o = await overflow(page);
    worstW = Math.max(worstW, o.sw - o.w); worstH = Math.max(worstH, o.sh - o.h);
    if (o.sw > o.w) console.log('  overflow on ' + tab + ': ' + o.culprit + ' to ' + o.widest);
    if (opts && opts.touch !== false) small = small.concat((await smallTargets(page)).map((s) => tab + ':' + s));
  }
  return { page, context, errors, offsite, layout, shots, worstW, worstH, small };
}

async function main() {
  const pw = loadPlaywright();
  if (!pw) { console.log('skipped: playwright not installed'); return; }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('Run "node build.js" first.'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const server = createServer(DIST).listen(0);
  const port = server.address().port;
  const browser = await pw.chromium.launch();
  try {
    // P1 / P2: phone portrait, every tab.
    let r = await layoutShots(browser, port, 'P1', [360, 740]);
    check('P1 360×740 layout', r.layout === 'compact', r.layout);
    check('P1 no console errors', r.errors.length === 0, r.errors.join(' | '));
    check('P1 no request leaves the origin', r.offsite.length === 0, r.offsite.join(' '));
    check('P1 no horizontal scroll on any tab', r.worstW <= 0, 'excess ' + r.worstW + ' px');
    check('P1 page does not scroll vertically', r.worstH <= 0, 'excess ' + r.worstH + ' px');
    check('P2 touch targets ≥ 44×44', r.small.length === 0, r.small.slice(0, 8).join(', '));
    await r.context.close();

    // P1b: iPhone SE Safari tab (short screen).
    r = await layoutShots(browser, port, 'P1b', [375, 553]);
    await tapTab(r.page, 'cell');
    const p1b = await r.page.evaluate(() => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      const legend = document.getElementById('legend-short');
      const row2 = document.querySelector('.fb-row2').getBoundingClientRect();
      const wrap = document.getElementById('stage-wrap').getBoundingClientRect();
      const leg = document.getElementById('legend').getBoundingClientRect();
      return { stageH: stage.height, short: document.body.hasAttribute('data-short'), legendLines: Math.round(legend.getBoundingClientRect().height / 17),
        row2Bottom: row2.bottom, row2H: row2.height, vh: window.innerHeight, legendBottom: Math.round(leg.bottom), wrapBottom: Math.round(wrap.bottom) };
    });
    check('P1b no console errors', r.errors.length === 0, r.errors.join(' | '));
    check('P1b no horizontal scroll', r.worstW <= 0, 'excess ' + r.worstW);
    check('P1b document does not scroll vertically', r.worstH <= 0, 'excess ' + r.worstH);
    check('P1b cell canvas ≥ 220 px tall', p1b.stageH >= 220, Math.round(p1b.stageH) + ' px');
    check('P1b legend is one line', p1b.short && p1b.legendLines <= 1, 'lines ' + p1b.legendLines);
    check('P1b the legend and Key button are not clipped by the narrator', p1b.legendBottom <= p1b.wrapBottom, JSON.stringify(p1b));
    check('P1b focus-bar promoter row fully visible', p1b.row2H >= 48 && p1b.row2Bottom <= p1b.vh, JSON.stringify(p1b));
    check('P2 (375×553) touch targets ≥ 44×44', r.small.length === 0, r.small.slice(0, 8).join(', '));
    await r.context.close();

    // P16: the other layouts.
    for (const [vp, want, touch] of [[[740, 360], 'split', true], [[768, 1024], 'stack', true], [[1280, 800], 'wide', false]]) {
      r = await layoutShots(browser, port, 'P16', vp, { touch });
      if (want === 'wide') {
        await T(r.page, 1800);
        await r.page.screenshot({ path: path.join(OUT, 'P16-1280x800-after-30min.png') });
      }
      check(`P16 ${vp.join('×')} is ${want}`, r.layout === want, r.layout);
      check(`P16 ${vp.join('×')} no overflow`, r.worstW <= 0 && r.worstH <= 0, `excess ${r.worstW}×${r.worstH}`);
      check(`P16 ${vp.join('×')} no console errors`, r.errors.length === 0, r.errors.join(' | '));
      await r.context.close();
    }

    // P3: gene on (Genes tab) → mRNA rises, then protein.
    let s = await openPage(browser, port, [360, 740]);
    let page = s.page;
    await tapTab(page, 'genes');
    await page.locator('[data-gene="fliC"] .seg[data-key="4"]').click();
    await T(page, 90);
    const cardM = async () => { const t = await page.locator('[data-gene="fliC"] .count-m').textContent(); const n = nums(t); return n[0] + n[1]; };
    const cardP = async () => nums(await page.locator('[data-gene="fliC"] .count-p').textContent())[0];
    const m90 = await cardM();
    check('P3 fliC mRNA (mature + being made) > 0 within 90 s', m90 > 0, 'mRNA ' + m90);
    await T(page, 600);
    const p1 = await cardP();
    await T(page, 300);
    const p2 = await cardP();
    check('P3 fliC protein > 0 and rising', p1 > 0 && p2 > p1, p1 + ' → ' + p2);
    const cvs = await page.evaluate(() => __btc.app.test.cellViewStats());
    check('P3 cell view draws fliC mRNA', cvs.mRNA.fliC > 0, 'glyphs ' + cvs.mRNA.fliC);
    await page.screenshot({ path: path.join(OUT, 'P3-genes-fliC-on.png') });

    // Task check: rifampicin → mRNA falls (keeps the P3 cell).
    await tapTab(page, 'medium');
    const mBefore = await page.evaluate(() => { const g = __btc.cell.observe().geneById; return Object.values(g).reduce((a, x) => a + x.mRNA, 0); });
    await page.locator('[data-drug="rifampicin"] .seg[data-key="full"]').click();
    await T(page, 600);
    const mAfter = await page.evaluate(() => { const g = __btc.cell.observe().geneById; return Object.values(g).reduce((a, x) => a + x.mRNA, 0); });
    const rifKey = await page.evaluate(() => __btc.app.test.narratorKey());
    check('Rifampicin full → total mRNA falls within 10 sim-min', mAfter < mBefore * 0.3, mBefore + ' → ' + mAfter + ' (narrator ' + rifKey + ')');
    await tapTab(page, 'cell');
    await page.screenshot({ path: path.join(OUT, 'rifampicin-cell.png') });
    await tapTab(page, 'graphs');
    await page.screenshot({ path: path.join(OUT, 'rifampicin-graphs.png') });
    check('P3/rif no console errors', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();

    // P3b: gene on without leaving the Cell tab.
    s = await openPage(browser, port, [360, 740]);
    page = s.page;
    await page.locator('.fb-row1').click();
    await page.locator('.picker-row[data-gene="fliC"]').click();
    await paint(page);
    await page.locator('.fb-row2 .seg[data-key="4"]').click();
    await paint(page);
    const pend = await page.locator('.fb-row2 .seg[data-key="4"]').getAttribute('class');
    await T(page, 1);
    const solid = await page.locator('.fb-row2 .seg[data-key="4"]').getAttribute('class');
    check('P3b segment pending, then solid after one tick', /is-pending/.test(pend) && /is-on/.test(solid) && !/is-pending/.test(solid), pend + ' / ' + solid);
    await T(page, 90);
    const cv3 = await page.evaluate(() => __btc.app.test.cellViewStats());
    const fbText = await page.locator('.fb-counts').textContent();
    const fbN = nums(fbText);
    check('P3b fliC mRNA drawn and in the focus bar', cv3.mRNA.fliC + cv3.nascent.fliC > 0 && fbN[0] + fbN[1] > 0, fbText);
    const cardLevel = await page.evaluate(() => document.querySelector('[data-gene="fliC"] .seg.is-on').getAttribute('data-key'));
    check('P3b Genes card shows level 4 (shared state)', cardLevel === '4', cardLevel);
    const stillCell = await page.evaluate(() => __btc.app.tab);
    check('P3b the tab never changed', stillCell === 'cell', stillCell);
    await T(page, 600);
    await page.screenshot({ path: path.join(OUT, 'P3b-cell-fliC-x4.png') });

    // P4: remove glucose → starvation (continues on this cell).
    await tapTab(page, 'medium');
    await page.locator('[data-row="glucose"] .seg[data-key="none"]').click();
    await T(page, 30);
    const k4 = await page.evaluate(() => __btc.app.test.narratorKey());
    const word = await page.locator('.atp-word').textContent();
    check('P4 narrator: no sugar', k4 === 'starve.nosugar', k4);
    // Engine 1.1: a starving cell keeps a little charge (E ≈ 0.1–0.2), so the gauge reads "low", not "very low".
    check('P4 ATP gauge word is "low"', word === 'low', word);
    await T(page, 120);
    const growth = await page.locator('.st-growth-text').textContent();
    check('P4 growth reads "not growing"', growth === 'not growing', growth);
    await tapTab(page, 'cell');
    const cv4 = await page.evaluate(() => __btc.app.test.cellViewStats());
    check('P4 ADP glyphs ≥ 15 and ATP ≤ ¼ of ADP', cv4.ADP >= 15 && cv4.ATP <= cv4.ADP / 4, 'ADP ' + cv4.ADP + ', ATP ' + cv4.ATP);
    await page.waitForTimeout(1600);
    await paint(page);
    await page.screenshot({ path: path.join(OUT, 'P4-starved-cell.png') });

    // P8: Start over → Same cell again equals a fresh cell.
    await tapTab(page, 'medium');
    await page.locator('.actions .btn').first().click();
    await page.locator('[data-choice="same"]').click();
    await paint(page);
    const same = await page.evaluate(() => {
      const B = __btc.BTC, c = __btc.cell;
      return { got: c.hash(), want: new B.Cell({ seed: 1, strain: 'm1-lab', start: 'steady', medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0, oxygen: false } }).hash(), running: __btc.app.loop.running };
    });
    check('P8 same cell again equals a fresh cell', same.got === same.want && !same.running, JSON.stringify(same));
    check('P3b/P4/P8 no console errors', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();

    // P9: ≥ 10 UI taps interleaved with ticks; the run replays exactly.
    s = await openPage(browser, port, [360, 740]);
    page = s.page;
    const taps = [
      ['genes', '[data-gene="lacY"] .seg[data-key="1"]'], ['genes', '[data-gene="lacZ"] .seg[data-key="2"]'],
      ['cell', '.fb-row2 .seg[data-key="0.5"]'], ['medium', '[data-row="lactose"] .seg[data-key="present"]'],
      ['medium', '[data-row="aminoAcids"] .seg[data-key="present"]'], ['genes', '[data-gene="aaImp"] .seg[data-key="1"]'],
      ['medium', '[data-drug="chloramphenicol"] .seg[data-key="low"]'], ['medium', '[data-drug="chloramphenicol"] .seg[data-key="off"]'],
      ['medium', '[data-row="glucose"] .seg[data-key="low"]'], ['cell', '.fb-row2 .seg[data-key="2"]'],
      ['genes', '[data-gene="fliC"] .seg[data-key="1"]'], ['genes', '[data-gene="fliC"] .seg[data-key="off"]'],
    ];
    for (const [tab, sel] of taps) {
      await tapTab(page, tab);
      await page.locator(sel).click();
      await T(page, 97);
    }
    const ver = await page.evaluate(() => __btc.BTC.replay.verify(__btc.cell.runRecord()));
    check('P9 replay of 12 UI taps verifies', ver.ok === true, JSON.stringify(ver).slice(0, 200));
    await tapTab(page, 'graphs');
    await page.screenshot({ path: path.join(OUT, 'P9-graphs-after-taps.png') });

    // P7: pause and speed (loose real-time check).
    await tapTab(page, 'cell');
    const t0 = await page.evaluate(() => __btc.cell.tick);
    await page.waitForTimeout(1500);
    const t1 = await page.evaluate(() => __btc.cell.tick);
    check('P7 paused: tick unchanged over 1.5 s', t0 === t1, t0 + ' → ' + t1);
    await page.evaluate(() => __btc.app.test.setSpeed(60));
    await page.locator('.play').click();
    const a = await page.evaluate(() => __btc.cell.tick);
    await page.waitForTimeout(2000);
    const b = await page.evaluate(() => __btc.cell.tick);
    await page.locator('.play').click();
    const rate = (b - a) / 2;
    check('P7 running at 1 s = 1 min: 60 ± 20 ticks per real second', rate >= 40 && rate <= 80, rate.toFixed(1) + ' ticks/s');
    await page.locator('.speed-chip').click();
    const labels = await page.locator('.speed-row .speed-label').allTextContents();
    check('P7 speed sheet shows the 5 labels', JSON.stringify(labels) === JSON.stringify(['1 s = 1 s', '1 s = 10 s', '1 s = 1 min', '1 s = 10 min', '1 s = 1 h']), labels.join(' | '));
    await page.screenshot({ path: path.join(OUT, 'P7-speed-sheet.png') });
    await page.keyboard.press('Escape');
    await page.locator('#legend').click();
    await page.screenshot({ path: path.join(OUT, 'key-sheet.png') });
    await page.keyboard.press('Escape');
    check('P7/P9 no console errors', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();

    // C3: a command still waiting in a saved cell shows as pending after a reload (autosave is off under ?test=1).
    {
      const ctx3 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const pg = await ctx3.newPage();
      const errs3 = [];
      pg.on('pageerror', (e) => errs3.push(e.message));
      await pg.goto('http://localhost:' + port + '/?seed=1&reset=1&lab=1');
      await pg.waitForFunction(() => window.__btc && window.__btc.app);
      await pg.goto('http://localhost:' + port + '/?seed=1&lab=1');
      await pg.waitForFunction(() => window.__btc && window.__btc.app);
      await paint(pg);
      await pg.locator('[data-tab="medium"]:visible').first().click();
      await pg.locator('[data-row="glucose"] .seg[data-key="none"]').click();
      await paint(pg);
      await pg.reload();
      await pg.waitForFunction(() => window.__btc && window.__btc.app);
      await paint(pg);
      await pg.locator('[data-tab="medium"]:visible').first().click();
      const c3 = await pg.evaluate(() => ({
        pending: __btc.cell.pending.length,
        marks: document.querySelectorAll('[data-row="glucose"] .seg.is-pending').length,
        markKey: (document.querySelector('[data-row="glucose"] .seg.is-pending') || { getAttribute: () => null }).getAttribute('data-key'),
        running: __btc.app.loop.running,
      }));
      check('C3 a pending command survives a reload and its control shows it pending', c3.pending === 1 && c3.marks === 1 && c3.markKey === 'none' && !c3.running, JSON.stringify(c3));
      check('C3 no page errors', errs3.length === 0, errs3.join(' | '));
      await ctx3.close();
    }

    // P11: the single file from file://, desktop, no service worker.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('file://' + path.join(DIST, 'index.html') + '?test=1&seed=1&lab=1');
    await page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test);
    const p11 = await page.evaluate(async () => {
      __btc.app.test.runTicks(100);
      const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations().catch(() => []) : [];
      return { tick: __btc.cell.tick, regs: regs.length, drawn: __btc.app.test.cellViewStats().total };
    });
    check('P11 file:// renders, runs 100 ticks, no service worker, no errors', p11.tick === 100 && p11.regs === 0 && p11.drawn > 0 && errs.length === 0,
      JSON.stringify(p11) + ' ' + errs.join(' | '));
    await page.screenshot({ path: path.join(OUT, 'P11-file.png') });
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${OUT}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
