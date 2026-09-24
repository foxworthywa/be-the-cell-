// Browser checks for the tiered screens and the level pattern of the teaching-first redesign
// (docs/PROLOGUE.md §5, §1.4; §10.2 BZ-6 and the browser side of TI-1, TI-2), called by tools/ui-check.js.
//
//   TI-L1  the lab opens in Simple mode: tier 4 readouts only (no gene chips, lin/log, window row, spending
//          bar, generation or doubling time), the single simple graph, every lever kept (7 dials, the medium,
//          the drugs one tap away); 360 × 740 and 1280 × 800
//   TI-L2  "All controls" (Medium panel on a phone, status strip on a laptop) restores the full M1 lab, is kept
//          in btc.ui.v1 and logged (ui_mode); the same commands in both modes (TI-2); ?lab=1&all=1 opens it
//   TI-W   a level in the new pattern (the stub level of tests/fixtures/level-watch-stub.js, injected into the
//          page): the tier-1 watch screen (two big counters, Off/On, no tab bar, status pause/clock/speed, then
//          the energy bar from its step), readout introductions once, a guess sheet never marked, the act by the
//          real switch, a state gate that stops the real loop at its tick; then the tier-3 run (three counters,
//          the simple graph with its target, no graph options), the HUD goal chip keeping its words at 480 px,
//          Explain feedback without a cross, and a BTC2 code with P as NA
//   TI-O   an older level (1.4) says so on its task card and keeps the full lab screen
//
// Every screen: no console errors, no request off the origin, no horizontal or vertical page scroll, and
// (touch) every visible button, radio, tab and chip ≥ 44 × 44. Screenshots go to test-artifacts/tiers/.
'use strict';
const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'level-watch-stub.js');
const paint = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const L = (page, fn, ...a) => page.evaluate(([f, args]) => window.__btc.app.test.level[f](...args), [fn, a]);
const WT = (page, fn, ...a) => page.evaluate(([f, args]) => window.__btc.app.test.level.watch[f](...args), [fn, a]);

async function open(browser, port, vp, query, opts) {
  const o = opts || {};
  const touch = o.touch !== false;
  const context = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [], offsite = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (!u.startsWith('http://localhost:' + port + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) { offsite.push(u); return route.abort(); }
    return route.continue();
  });
  await page.goto('http://localhost:' + port + '/' + query);
  await page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test);
  await paint(page);
  return { page, context, errors, offsite, touch, tag: vp.join('x') };
}

/** Page scroll, overflow past the viewport, and (touch) small targets. */
async function problems(page, touch) {
  return page.evaluate((checkTargets) => {
    const out = [];
    const d = document.documentElement;
    if (d.scrollWidth > innerWidth) out.push('horizontal scroll ' + (d.scrollWidth - innerWidth) + ' px');
    if (d.scrollHeight > innerHeight) out.push('page scrolls vertically ' + (d.scrollHeight - innerHeight) + ' px');
    for (const el of document.querySelectorAll('#app *, #sheets *, .guide *')) {
      if (el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > innerWidth + 0.5) { out.push('overflow: ' + (el.id || el.className || el.tagName) + ' to ' + Math.round(r.right)); break; }
    }
    if (checkTargets) {
      for (const el of document.querySelectorAll('button, [role=radio], [role=tab], [role=switch], .chip')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || el.closest('[hidden]')) continue;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none') continue;
        if (r.width < 43.5 || r.height < 43.5) out.push('small target ' + (el.getAttribute('data-action') || el.getAttribute('data-key') || el.className || el.tagName) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
      }
    }
    return out;
  }, touch);
}

/** What a lab screen shows: the readouts and options of §5.3, and the levers it exposes. */
function labState() {
  const vis = (sel) => Array.from(document.querySelectorAll(sel)).some((el) => (el.offsetParent !== null || getComputedStyle(el).position === 'fixed') && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
  const app = window.__btc.app;
  return {
    mode: app.ui.labMode, tier: app.tierUI ? app.tierUI.tier : 'all',
    chips: vis('.chip-row .chip'), linLog: vis('.lin-log'), window: vis('.window-row .seg-group'), spend: vis('.spend-bar') || vis('.plot.spend'),
    generation: vis('.st-gen'), doubling: vis('.st-growth'), energy: vis('.st-atp'), growthWord: vis('.st-growth-word'), sugar: vis('.st-sugar'),
    simpleGraph: !!document.querySelector('.sg-figure'), counters: document.querySelectorAll('.focusbar [data-counter]').length,
    dialCards: Array.from(document.querySelectorAll('.gene-card')).filter((c) => c.querySelectorAll('.seg').length === 6).length,
    mediumRows: Array.from(document.querySelectorAll('#pane-medium .ctl-row[data-row]')).map((r) => r.getAttribute('data-row') + ':' + r.querySelectorAll('.seg').length),
    graphTab: (document.querySelector('.tab[data-tab="graphs"] span') || {}).textContent || '',
    stored: (() => { try { return JSON.parse(localStorage.getItem('btc.ui.v1') || '{}').labMode || null; } catch (e) { return 'error'; } })(),
  };
}

async function run(browser, port, OUT, check) {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const screens = [];
  const shotter = (s, probs) => async (name) => {
    await paint(s.page);
    await s.page.waitForTimeout(80);
    const f = `${name}-${s.tag}.png`;
    await s.page.screenshot({ path: path.join(OUT, f) });
    screens.push(f);
    for (const p of await problems(s.page, s.touch)) probs.push(name + ': ' + p);
  };
  const finish = (s, id, probs) => {
    check(id + ' ' + s.tag + ' layout (no scroll, no overflow' + (s.touch ? ', targets ≥ 44 px' : '') + ')', probs.length === 0, probs.slice(0, 6).join(' | '));
    check(id + ' ' + s.tag + ' no console errors, no request leaves the origin', s.errors.length === 0 && s.offsite.length === 0, s.errors.concat(s.offsite).join(' | '));
  };
  const tap = async (page, sel) => { await page.locator(sel).first().click(); await paint(page); };

  // --- TI-L1, TI-L2: the lab's Simple and All controls modes ------------------------------------------
  for (const [vp, touch] of [[[360, 740], true], [[1280, 800], false]]) {
    const s = await open(browser, port, vp, '?test=1&seed=1&lab=1', { touch });
    const probs = [], shot = shotter(s, probs), page = s.page;
    await page.evaluate(() => window.__btc.app.test.runTicks(600));
    const compact = vp[0] < 600;
    await shot('lab-simple-cell');
    if (compact) { await tap(page, '[data-tab="genes"]:visible'); await shot('lab-simple-genes'); await tap(page, '[data-tab="medium"]:visible'); await shot('lab-simple-medium'); }
    if (compact) { await tap(page, '[data-tab="graphs"]:visible'); await shot('lab-simple-graph'); }
    const simple = await page.evaluate(labState);
    check('TI-L1 ' + s.tag + ' the lab opens in Simple mode (tier 4): no gene chips, lin/log, window row, spending bar, generation or doubling time',
      simple.mode === 'simple' && simple.tier === 4 && !simple.chips && !simple.linLog && !simple.window && !simple.spend && !simple.generation && !simple.doubling,
      JSON.stringify(simple));
    check('TI-L1 ' + s.tag + ' Simple shows ATP, growth and sugar in words, two big counters and the single simple graph' + (compact ? ' (tab "Graph")' : ''),
      simple.energy && simple.growthWord && simple.sugar && simple.counters === 2 && simple.simpleGraph && (!compact || simple.graphTab === 'Graph'), JSON.stringify(simple));
    // Every lever stays: seven dials, the three medium rows, the drugs one tap away.
    await tap(page, '[data-tab="medium"]:visible');
    const foldShown = await page.locator('[data-action="drugs-fold"]').count();
    if (foldShown) { await tap(page, '[data-action="drugs-fold"]'); await shot('lab-simple-drugs'); }
    const leversSimple = await page.evaluate(() => ({
      dials: Array.from(document.querySelectorAll('.gene-card')).map((c) => c.getAttribute('data-gene') + ':' + c.querySelectorAll('.seg').length).sort(),
      rows: Array.from(document.querySelectorAll('#pane-medium [data-row]')).map((r) => r.getAttribute('data-row') + ':' + r.querySelectorAll('.seg').length).sort(),
    }));
    // All controls: the switch in the Medium panel (phone) or the status strip (laptop).
    await tap(page, compact ? '.pane-lab-switch' : '.st-lab-switch');
    await page.evaluate(() => window.__btc.app.test.runTicks(1));
    if (compact) { await tap(page, '[data-tab="cell"]:visible'); await shot('lab-all-cell'); await tap(page, '[data-tab="graphs"]:visible'); }
    const all = await page.evaluate(labState);
    if (compact) { await shot('lab-all-graphs'); await tap(page, '[data-tab="medium"]:visible'); }
    else await shot('lab-all');
    const leversAll = await page.evaluate(() => ({
      dials: Array.from(document.querySelectorAll('.gene-card')).map((c) => c.getAttribute('data-gene') + ':' + c.querySelectorAll('.seg').length).sort(),
      rows: Array.from(document.querySelectorAll('#pane-medium [data-row]')).map((r) => r.getAttribute('data-row') + ':' + r.querySelectorAll('.seg').length).sort(),
    }));
    const tel = await page.evaluate(() => window.__btc.app.tel.all().filter((e) => e.type === 'ui_mode').map((e) => e.d.mode));
    check('TI-L2 ' + s.tag + ' "All controls" restores the full lab (chips, lin/log, window, spending bar, generation, doubling), kept in btc.ui.v1 and logged',
      all.mode === 'all' && all.tier === 'all' && all.chips && all.linLog && all.window && all.spend && all.generation && all.doubling && all.stored === 'all' && tel.indexOf('all') >= 0,
      JSON.stringify(all) + ' ' + JSON.stringify(tel));
    check('TI-L2 ' + s.tag + ' Simple and All controls expose the same levers (TI-2): 7 dials of 6 settings, 3 medium rows, 2 drugs',
      JSON.stringify(leversSimple) === JSON.stringify(leversAll) && leversAll.dials.length === 7 && leversAll.dials.every((d) => /:6$/.test(d)) && leversAll.rows.length === 5,
      JSON.stringify(leversSimple) + ' / ' + JSON.stringify(leversAll));
    await tap(page, compact ? '.pane-lab-switch' : '.st-lab-switch');
    const back = await page.evaluate(labState);
    check('TI-L2 ' + s.tag + ' the switch goes back to Simple', back.mode === 'simple' && back.tier === 4 && !back.chips && back.stored === 'simple', JSON.stringify(back));
    finish(s, 'TI-L', probs);
    await s.context.close();
  }
  {
    const s = await open(browser, port, [360, 740], '?test=1&seed=1&lab=1&all=1');
    const st = await s.page.evaluate(labState);
    check('TI-L2 ?lab=1&all=1 opens the lab with All controls', st.mode === 'all' && st.tier === 'all' && st.stored === 'all', JSON.stringify(st));
    await s.context.close();
  }

  // --- TI-W: a level in the new pattern: watch (tier 1), run (tier 3), Explain, the code --------------
  for (const [vp, touch] of [[[360, 740], true], [[1280, 800], false], [[480, 800], true]]) {
    const s = await open(browser, port, vp, '?test=1&seed=1', { touch });
    const probs = [], shot = shotter(s, probs), page = s.page;
    const full = vp[0] !== 480;
    await page.addScriptTag({ path: FIXTURE });
    await page.evaluate(() => { const t = window.__btc.app.test.level; t.add('W'); t.open('W', 3); });
    await L(page, 'next');                                 // the intro's one line
    await paint(page);
    const w0 = await page.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).some((el) => (el.offsetParent !== null || getComputedStyle(el).position === 'fixed') && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
      const app = window.__btc.app;
      return { phase: app.test.level.phase(), tier: app.tierUI && app.tierUI.tier, tabbar: vis('#tabbar'), row2: vis('.st-row2 .st-atp'), gen: vis('.st-gen'),
        counters: Array.from(document.querySelectorAll('.focusbar [data-counter]')).map((e) => e.getAttribute('data-counter')),
        onoff: document.querySelectorAll('.tb-ctrl .seg').length, guide: vis('.guide'), ring: vis('.guide-ring') };
    });
    check('TI-W ' + s.tag + ' watch at tier 1: two big counters, Off/On, no tab bar, status with pause, clock and speed only; the guide introduces a counter with a ring',
      w0.phase === 'watch' && w0.tier === 1 && !w0.row2 && !w0.gen && JSON.stringify(w0.counters) === '["mRNA","protein"]' && w0.onoff === 2 && w0.guide && w0.ring
        && (vp[0] > 600 || !w0.tabbar), JSON.stringify(w0));
    if (full) await shot('watch-intro');
    // The introductions, then the steps up to the guess.
    const introsSeen = [];
    for (let i = 0; i < 12; i++) {
      const k = await page.evaluate(() => { const b = document.querySelector('.guide'); return b && !b.hidden ? b.getAttribute('data-key') : null; });
      if (await page.locator('[data-action="guess-see"]').count()) break;
      if (k && k.indexOf('intro:') === 0) introsSeen.push(k.slice(6));
      if (k === 'intro:status.energy' && full) await shot('watch-energy');
      await tap(page, '.guide [data-action="intro-next"], .guide [data-action="watch-next"]');
    }
    const stored = await page.evaluate(() => Object.keys(window.__btc.app.progress.data.introduced || {}).sort());
    check('TI-W ' + s.tag + ' each readout is introduced once, with its sentence, when it appears (the energy bar at its step)',
      JSON.stringify(introsSeen) === JSON.stringify(['counter.mRNA', 'counter.protein', 'status.energy']) && JSON.stringify(stored) === JSON.stringify(['counter.mRNA', 'counter.protein', 'status.energy']),
      JSON.stringify(introsSeen) + ' ' + JSON.stringify(stored));
    if (full) await shot('watch-guess');
    const g = await page.evaluate(() => ({
      see: document.querySelector('[data-action="guess-see"]').disabled, options: document.querySelectorAll('.lv-guess .lv-option').length,
      halted: window.__btc.app.test.level.runner().halted(), marks: document.querySelectorAll('.lv-guess .is-wrong, .lv-guess .is-right, .lv-guess .lv-mark').length,
    }));
    await tap(page, '.lv-guess .lv-option[data-option="1"]');
    await tap(page, '[data-action="guess-see"]');
    check('TI-W ' + s.tag + ' the guess: "See what happens" waits for a pick, the cell waits for the guess, nothing is marked',
      g.see === true && g.options === 4 && g.halted && g.marks === 0, JSON.stringify(g));
    const act = await WT(page, 'info');
    if (full) await shot('watch-act');
    await tap(page, '.tb-ctrl .seg[data-key="on"]');
    const until = await WT(page, 'info');
    check('TI-W ' + s.tag + ' the act is the student\'s: the step waits for the real switch, then for the model',
      act.id === 'w4' && act.stage === 'act' && until.id === 'w5' && until.stage === 'until', JSON.stringify([act.stage, until.id, until.stage]));
    // The real loop stops at the gate: Run in the guide, at 1 s = 1 min.
    await page.evaluate(() => window.__btc.app.setSpeed(60));
    await tap(page, '.guide [data-action="watch-run"]');
    await page.waitForFunction(() => { const i = window.__btc.app.test.level.watch.info(); return i && i.stage !== 'until'; }, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await paint(page);
    const gate = await page.evaluate(() => {
      const app = window.__btc.app, r = app.test.level.runner();
      return { running: app.loop.running, tick: app.cell.tick, gateTick: r.watch.gateTick['w5:until'], info: r.watchInfo(), play: document.querySelector('.play').disabled,
        counter: document.querySelector('[data-counter="mRNA"] .tb-num').textContent, model: app.cell.observe().geneById.ptsG.mRNA,
        ring: (() => { const e = document.querySelector('.guide-ring'); if (!e || e.hidden) return null; const a = e.getBoundingClientRect(), b = document.querySelector('[data-counter="mRNA"]').getBoundingClientRect(); return a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom; })() };
    });
    check('TI-W ' + s.tag + ' on the real loop the run stops at the gate\'s tick, the counter shows it; the line, its cause and a ring on the mRNA counter; Run waits for Next',
      !gate.running && gate.tick === gate.gateTick && gate.info.id === 'w5' && !!gate.info.cause && gate.play && gate.ring === true
        && gate.model >= 1 && gate.counter === String(gate.model), JSON.stringify(gate).slice(0, 400));
    await shot('watch-gate');
    // The rest of the watch by the test hooks, then the task card and the run.
    await page.evaluate(() => {
      const T = window.__btc.app.test.level;
      for (let i = 0; i < 100; i++) {
        const info = T.watch.info();
        if (!info || info.done) break;
        if (info.stage === 'guess') T.watch.guess('cause');
        else if (info.waiting) T.watch.untilGate(40000);
        else if (info.stage === 'act') document.querySelector('.tb-ctrl .seg[data-key="on"]').click();
        else T.watch.next();
      }
    });
    await paint(page);
    const phaseAfter = await L(page, 'phase');
    if (full) await shot('task');
    const older = await page.locator('.lv-older').count();
    check('TI-W ' + s.tag + ' the watch completes into the task card (no "older version" note on a level in the new pattern)', phaseAfter === 'task' && older === 0, phaseAfter);
    await L(page, 'next');
    await paint(page);
    for (let i = 0; i < 4; i++) { if (await page.locator('.guide:not([hidden]) [data-action="intro-next"]').count()) await tap(page, '.guide:not([hidden]) [data-action="intro-next"]'); }
    await tap(page, '.tb-ctrl .seg[data-key="on"]');
    await L(page, 'runTicks', 600);
    await paint(page);
    const run = await page.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).some((el) => (el.offsetParent !== null || getComputedStyle(el).position === 'fixed') && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
      const app = window.__btc.app, g = document.querySelector('.hud-goal').getBoundingClientRect();
      return { tier: app.tierUI && app.tierUI.tier, counters: Array.from(document.querySelectorAll('.focusbar [data-counter]')).map((e) => e.getAttribute('data-counter')),
        hud: Math.round(document.getElementById('hud').getBoundingClientRect().height), goalW: Math.round(g.width), goal: document.querySelector('.hud-goal-text').textContent,
        stage: Math.round(document.getElementById('stage').getBoundingClientRect().height), gen: vis('.st-gen'), doubling: vis('.st-growth'), energy: vis('.st-atp') };
    });
    check('TI-W ' + s.tag + ' the run at tier 3: three counters, a 44 px HUD, energy but no generation or doubling time; the canvas ≥ 220 px',
      run.tier === 3 && JSON.stringify(run.counters) === '["mRNA","made","protein"]' && run.hud === 44 && !run.gen && !run.doubling && run.energy && run.stage >= 220, JSON.stringify(run));
    if (vp[0] >= 400 && vp[0] < 600) {
      check('TI-W ' + s.tag + ' the HUD goal chip keeps its long form and room (not squeezed by the timer and counter)', run.goalW >= 200 && /transporters/.test(run.goal), JSON.stringify(run));
    }
    await shot('run');
    if (vp[0] < 1000) await tap(page, '[data-tab="graphs"]:visible');
    for (let i = 0; i < 4; i++) { if (await page.locator('.guide:not([hidden]) [data-action="intro-next"]').count()) await tap(page, '.guide:not([hidden]) [data-action="intro-next"]'); }
    const graph = await page.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).some((el) => (el.offsetParent !== null || getComputedStyle(el).position === 'fixed') && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
      return { simple: vis('.sg-figure'), chips: vis('.chip-row'), linLog: vis('.lin-log'), window: vis('.window-row'), spend: vis('.plot.spend'), key: (document.querySelector('.sg-keys') || {}).textContent || '',
        introduced: Object.keys(window.__btc.app.progress.data.introduced || {}).sort() };
    });
    check('TI-W ' + s.tag + ' one simple graph with its target line and no graph options; its readouts introduced when shown',
      graph.simple && !graph.chips && !graph.linLog && !graph.window && !graph.spend && /target 1500/.test(graph.key)
        && ['counter.made', 'graph.protein', 'graph.target'].every((x) => graph.introduced.indexOf(x) >= 0), JSON.stringify(graph));
    if (full) await shot('run-graph');
    if (full) {
      // To the end, the result, and Explain: a wrong first tap shows what actually happens, without a cross.
      await L(page, 'runToEnd');
      for (let i = 0; i < 10 && (await L(page, 'phase')) !== 'debrief'; i++) await L(page, 'next');
      await paint(page);
      await tap(page, '.lv-option[data-option="1"]');
      const ex = await page.evaluate(() => {
        const t = document.querySelector('.lv-option[data-option="1"]').textContent;
        return { actually: /Here is what actually happens:/.test(t), pick: /Pick another\./.test(t), cross: /✗|Not quite/.test(document.querySelector('.sheet').textContent) };
      });
      await shot('explain');
      await tap(page, '.lv-option[data-option="0"]');
      const yes = await page.evaluate(() => /^Yes\. /.test(document.querySelector('.lv-option[data-option="0"] .lv-fb').textContent));
      check('TI-W ' + s.tag + ' Explain: "Here is what actually happens" and "Pick another." for a wrong tap, "Yes." for the right one, no cross',
        ex.actually && ex.pick && !ex.cross && yes, JSON.stringify(ex) + ' yes ' + yes);
      await L(page, 'next');
      for (let i = 0; i < 12 && (await L(page, 'phase')) !== 'complete'; i++) await L(page, 'next');
      await paint(page);
      const code = await L(page, 'code');
      const dec = await page.evaluate((c) => window.__btc.BTC.code.decode(c), code);
      await shot('complete');
      const lines = await page.evaluate(() => Array.from(document.querySelectorAll('.lv-score p')).map((p) => p.textContent));
      check('TI-W ' + s.tag + ' the code is BTC2 with P as NA; the total counts goal, efficiency and Explain only',
        dec.ok && dec.format === 2 && dec.P === null && dec.total === Math.round(45 * dec.G + 25 * dec.G * dec.E / 100 + 30 * dec.D[0] / dec.D[1]) && !lines.some((l) => /Prediction/.test(l)),
        code + ' ' + JSON.stringify(lines));
    }
    finish(s, 'TI-W', probs);
    await s.context.close();
  }

  // --- TI-O: an older level keeps the full lab and says so ------------------------------------------
  {
    const s = await open(browser, port, [360, 740], '?test=1&seed=1');
    const probs = [], shot = shotter(s, probs), page = s.page;
    await L(page, 'open', '1.4', 5);
    for (let i = 0; i < 8 && (await L(page, 'phase')) === 'intro'; i++) await L(page, 'next');
    await paint(page);
    const t = await page.evaluate(() => ({ phase: window.__btc.app.test.level.phase(), note: (document.querySelector('.lv-older') || {}).textContent || '', tier: window.__btc.app.tierUI }));
    await shot('older-task');
    check('TI-O 1.4 (not yet in the new pattern) says so on its task card and keeps the full lab screen',
      t.phase === 'task' && /older version/.test(t.note) && t.tier === null, JSON.stringify(t));
    finish(s, 'TI-O', probs);
    await s.context.close();
  }
  return screens;
}

module.exports = { run };

if (require.main === module) {
  // node tools/ui-check-tiers.js [--out dir]: these checks alone, on a fresh build (node build.js first).
  const { createServer } = require('../serve.js');
  const pw = (() => { try { return require('/opt/node22/lib/node_modules/playwright'); } catch (e) { return require('playwright'); } })();
  const argOut = process.argv.indexOf('--out');
  const OUT = argOut >= 0 ? path.resolve(process.argv[argOut + 1]) : path.join(__dirname, '..', 'test-artifacts', 'tiers');
  const results = [];
  const check = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'pass ' : 'FAIL ') + id + (ok || !detail ? '' : ': ' + detail)); };
  (async () => {
    const server = createServer(path.join(__dirname, '..', 'dist')).listen(0);
    const browser = await pw.chromium.launch();
    try { await run(browser, server.address().port, OUT, check); } finally { await browser.close(); server.close(); }
    const failed = results.filter((x) => !x.ok).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed; screenshots in ' + OUT);
    if (failed) process.exitCode = 1;
  })().catch((e) => { console.error(e); process.exit(1); });
}
