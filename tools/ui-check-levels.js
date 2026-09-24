// Browser checks for the levels (LEVELS.md §12.2, LV-1, LV-3, LV-4, LV-5, LV-6, LV-7, LV-8, LV-9,
// and the published codes page), called by tools/ui-check.js. The Prologue (LV-2) gets its
// checks with its own build step.
//
// Every level screen is checked at 360 × 740 (touch) and most at 1280 × 800 (no touch): no
// console errors, no request off the origin, no horizontal scroll, the document does not
// scroll vertically, and (touch) every visible button, radio, tab and chip is ≥ 44 × 44.
// Screenshots go to <levels dir> (test-artifacts/levels/ unless --levels-out is given).
'use strict';
const path = require('path');

const paint = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const L = (page, fn, ...a) => page.evaluate(([f, args]) => window.__btc.app.test.level[f](...args), [fn, a]);
const R = (page, expr) => page.evaluate(new Function('return (' + expr + ');'));

async function openLevel(browser, port, vp, query, opts) {
  const o = opts || {};
  const touch = o.touch !== false;
  const context = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
  if (o.permissions) await context.grantPermissions(o.permissions);
  if (o.init) await context.addInitScript(o.init);
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

/** Horizontal overflow of the page, the app or a sheet; vertical scroll of the document. */
async function layoutProblems(page, touch) {
  return page.evaluate((checkTargets) => {
    const out = [];
    const d = document.documentElement;
    if (d.scrollWidth > innerWidth) out.push('horizontal scroll ' + (d.scrollWidth - innerWidth) + ' px');
    if (d.scrollHeight > innerHeight) out.push('page scrolls vertically ' + (d.scrollHeight - innerHeight) + ' px');
    for (const el of document.querySelectorAll('#app *, #sheets *, #home *')) {
      if (el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      // Content inside a scrolling box (the Genes and Graphs panes, a sheet body) may extend past it; the page may not.
      if (r.right > innerWidth + 0.5 && !el.closest('.table-wrap')) { out.push('overflow: ' + (el.id || el.className || el.tagName) + ' to ' + Math.round(r.right)); break; }
    }
    if (checkTargets) {
      for (const el of document.querySelectorAll('button, [role=radio], [role=tab], .chip')) {
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

async function run(browser, port, OUT, check) {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const screens = [];
  /** Screenshot + layout checks for one screen; problems are collected per level. */
  const shotter = (s, level, problems) => async (name) => {
    await paint(s.page);
    await s.page.waitForTimeout(120);
    const f = `${level}-${s.tag}-${String(screens.length + 1).padStart(2, '0')}-${name}.png`;
    await s.page.screenshot({ path: path.join(OUT, f) });
    screens.push(f);
    for (const p of await layoutProblems(s.page, s.touch)) problems.push(name + ': ' + p);
  };
  const finish = (s, id, problems) => {
    check(id + ' ' + s.tag + ' layout (no scroll, no overflow' + (s.touch ? ', targets ≥ 44 px' : '') + ')', problems.length === 0, problems.slice(0, 6).join(' | '));
    check(id + ' ' + s.tag + ' no console errors, no request leaves the origin', s.errors.length === 0 && s.offsite.length === 0, s.errors.concat(s.offsite).join(' | '));
  };

  // --- LV-1: home ---------------------------------------------------------------------------------
  {
    const s = await openLevel(browser, port, [360, 740], '?test=1&seed=1');
    const probs = [];
    const shot = shotter(s, 'home', probs);
    const rows = await s.page.evaluate(() => Array.from(document.querySelectorAll('.level-row')).map((b) => b.getAttribute('data-level')));
    const order = ['P', '1.1', '1.2', '1.4', '1.7'];
    check('LV-1 home lists the Prologue, 1.1, 1.2, 1.4 and 1.7 in order', order.every((id) => rows.indexOf(id) >= 0) && order.every((id, k) => k === 0 || rows.indexOf(order[k - 1]) < rows.indexOf(id)), rows.join(', '));
    await shot('home');
    await s.page.locator('[data-action="lab"]').click();
    await paint(s.page);
    const scr = await R(s.page, "window.__btc.app.screen + '/' + document.body.getAttribute('data-surface')");
    check('LV-1 Free-play lab opens the lab', scr === 'lab/app', scr);
    finish(s, 'LV-1', probs);
    await s.context.close();
    const s2 = await openLevel(browser, port, [360, 740], '?test=1&seed=1&lab=1');
    check('LV-1 ?lab=1 opens the lab', (await R(s2.page, 'window.__btc.app.screen')) === 'lab');
    await s2.context.close();
  }

  // --- LV-4: level 1.2 ------------------------------------------------------------------------------
  for (const vp of [[360, 740], [1280, 800]]) {
    const touch = vp[0] < 1000;
    const s = await openLevel(browser, port, vp, '?test=1&seed=1&level=1.2', { touch });
    const page = s.page, probs = [];
    const shot = shotter(s, '1.2', probs);
    await shot('story');
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await shot('task');
    await L(page, 'next');
    await shot('predict-expert-number');
    await L(page, 'answer', 'ppm', 21);
    // The sketch: Done disabled before full coverage; a scripted stroke with touch (or the mouse on a laptop).
    const done = page.locator('[data-action="sketch-done"]');
    const disabled0 = await done.isDisabled();
    const box = await page.locator('.sketch-canvas').first().boundingBox();
    const map = await page.evaluate(() => { const p = window.__btc.app.views.levelUI.sketch.plot; return { x0: p.x0, x1: p.x1, y0: p.ymap.y0, y1: p.ymap.y1 }; });
    const X = (min) => box.x + map.x0 + (min / 20) * (map.x1 - map.x0);
    const Y = (n) => box.y + map.y1 - (n / 2000) * (map.y1 - map.y0);
    const curve = (m) => (m < 0.8 ? 5 : m < 6 ? 5 + (m - 0.8) * 90 : 473 + 700 * (1 - Math.exp(-(m - 6) / 3.5)));
    const cdp = touch ? await s.context.newCDPSession(page) : null;
    const stroke = async (from, to) => {
      const n = 30;
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: X(from), y: Y(curve(from)) }] });
        for (let i = 1; i <= n; i++) { const m = from + ((to - from) * i) / n; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: X(m), y: Y(curve(m)) }] }); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(X(from), Y(curve(from)));
        await page.mouse.down();
        for (let i = 1; i <= n; i++) { const m = from + ((to - from) * i) / n; await page.mouse.move(X(m), Y(curve(m))); }
        await page.mouse.up();
      }
    };
    await stroke(0, 11);
    const disabledPartial = await done.isDisabled();
    await shot('sketch-partial');
    await stroke(11, 20);
    const enabledFull = !(await done.isDisabled());
    await shot('sketch-drawn');
    check('LV-4 ' + s.tag + ' sketch: Done disabled until the drawing spans the graph', disabled0 && disabledPartial && enabledFull,
      [disabled0, disabledPartial, enabledFull].join('/'));
    await done.click();
    await paint(page);
    const demo = await R(page, "{ phase: window.__btc.app.test.level.phase(), overlay: !!window.__btc.app.views.graphs.plots.find((p) => p.spec.key === 'protein').plot.overlay, tab: window.__btc.app.tab }");
    check('LV-4 ' + s.tag + ' the demo runs with the sketch over the Protein plot', demo.phase === 'demo' && demo.overlay, JSON.stringify(demo));
    await L(page, 'runTicks', 540);
    if (touch) await shot('demo-running');
    await L(page, 'runTicks', 800);
    const demoEnd = await R(page, "{ done: window.__btc.app.test.level.runner().demo.done, tick: window.__btc.cell.tick, sheet: !!document.querySelector('[data-action=\"demo-continue\"]'), features: document.querySelectorAll('.lv-features li').length }");
    check('LV-4 ' + s.tag + ' the demo stops at 20 min and shows the sketch against it, feature by feature', demoEnd.done && demoEnd.tick === 1200 && demoEnd.sheet && demoEnd.features === 4, JSON.stringify(demoEnd));
    await shot('demo-result');
    await page.locator('[data-action="demo-continue"]').click();
    await paint(page);
    // The run: the HUD with the mRNA counter; the reference play through the Genes tab.
    const hud = await page.evaluate(() => ({ h: document.getElementById('hud').getBoundingClientRect().height, stage: document.getElementById('stage').getBoundingClientRect().height, counter: document.querySelector('.hud-counter').textContent }));
    check('LV-4 ' + s.tag + ' run: 44 px HUD with the mRNA counter; canvas ≥ 220 px', hud.h === 44 && /\d+ \/ \d+/.test(hud.counter) && (!touch || hud.stage >= 220), JSON.stringify(hud));
    if (touch) await page.locator('[data-tab="genes"]:visible').first().click();
    await page.locator('[data-gene="lacY"] .seg[data-key="4"]').click();
    await L(page, 'runTicks', 1);
    for (let i = 0; i < 200; i++) {
      await L(page, 'runTicks', 10);
      if (await R(page, "(() => { const g = window.__btc.cell.observe().geneById.lacY, T = window.__btc.app.test.level.runner().variant.T; return g.protein + 15 * g.mRNA + 20 * g.nascent >= 1.1 * T; })()")) break;
    }
    await page.locator('[data-gene="lacY"] .seg[data-key="off"]').click();
    if (touch) await page.locator('[data-tab="cell"]:visible').first().click();
    await L(page, 'runTicks', 60);
    await shot('run-hud');
    const D = await R(page, 'window.__btc.app.test.level.runner().variant.D');
    await L(page, 'runTicks', D * 60 + 30 - (await R(page, 'window.__btc.cell.tick')));
    const settle = await page.evaluate(() => ({ goal: document.querySelector('.hud-goal-text').textContent, locked: Array.from(document.querySelectorAll('[data-gene="lacY"] .seg, .fb-row2 .seg')).every((b) => b.disabled), key: window.__btc.app.test.narratorKey() }));
    check('LV-4 ' + s.tag + ' settle after D: the dial is locked and the HUD says the deadline passed', /Deadline passed/.test(settle.goal) && settle.locked, JSON.stringify(settle));
    await shot('settle');
    await L(page, 'runToEnd');
    await L(page, 'next');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await L(page, 'next');
    await shot('result');
    await page.evaluate(() => { const b = document.querySelector('.sheet-body'); b.scrollTop = b.scrollHeight; });
    await shot('result-sketch-overlay');
    const hasChart = await R(page, "!!document.querySelector('.lv-sketch-chart canvas')");
    check('LV-4 ' + s.tag + ' result shows the sketch over the test run', hasChart);
    await L(page, 'next');
    await L(page, 'answer', 'l12.d1', 1);
    await shot('debrief-wrong');
    await L(page, 'answer', 'l12.d1', 'ok'); await L(page, 'next');
    await L(page, 'answer', 'l12.d2', 'ok'); await L(page, 'next');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await L(page, 'next');
    await shot('echo');
    await L(page, 'next');
    await shot('echo-cards');
    await L(page, 'next');
    await shot('complete');
    const code = await L(page, 'code');
    const dec = await page.evaluate((c) => window.__btc.BTC.code.decode(c), code);
    check('LV-4 ' + s.tag + ' complete with a valid code', !!dec.ok && dec.level === '12' && dec.G === 1, code);
    finish(s, 'LV-4', probs);
    await s.context.close();
  }

  // --- LV-9: 375 × 553, the 1.2 run keeps its canvas ----------------------------------------------------
  {
    const s = await openLevel(browser, port, [375, 553], '?test=1&seed=1&level=1.2&v=000C1S');
    const page = s.page, probs = [];
    const shot = shotter(s, '1.2', probs);
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await L(page, 'next');
    await L(page, 'answer', 'ppm', 20);
    await shot('sketch-short');
    const sk = await R(page, "window.__btc.BTC.levelConstants.l12.demoMean[window.__btc.app.test.level.runner().variant.tOff].map((y, m) => [m, y])");
    await L(page, 'sketch', sk);
    await L(page, 'runTicks', 1300);
    await shot('demo-result-short');
    await page.locator('[data-action="demo-continue"]').click();
    await paint(page);
    await L(page, 'runTicks', 30);
    const m = await page.evaluate(() => ({ stage: document.getElementById('stage').getBoundingClientRect().height, hud: document.getElementById('hud').getBoundingClientRect().height }));
    check('LV-9 375×553 1.2 run: canvas ≥ 220 px with the 44 px HUD', m.stage >= 220 && m.hud === 44, JSON.stringify(m));
    await shot('run-short');
    finish(s, 'LV-9', probs);
    await s.context.close();
  }

  // --- LV-5: level 1.4 ------------------------------------------------------------------------------
  for (const vp of [[360, 740], [1280, 800]]) {
    const touch = vp[0] < 1000;
    const s = await openLevel(browser, port, vp, '?test=1&seed=1&level=1.4', { touch });
    const page = s.page, probs = [];
    const shot = shotter(s, '1.4', probs);
    await shot('story');
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await shot('task');
    await L(page, 'next');
    await shot('predict-p1');
    await L(page, 'answer', 'p1', 'ok');
    await shot('predict-expert-number');
    const v = await R(page, 'window.__btc.app.test.level.runner().variant');
    await L(page, 'answer', 'ss', v.S1);
    // The reference play: ×4, then the target setting once the mRNA already made will carry the count into the band.
    if (touch) await page.locator('[data-tab="genes"]:visible').first().click();
    await page.locator('[data-gene="lacY"] .seg[data-key="4"]').click();
    if (touch) await page.locator('[data-tab="cell"]:visible').first().click();
    await L(page, 'runTicks', 1);
    for (let i = 0; i < 300; i++) {
      await L(page, 'runTicks', 5);
      if (await R(page, "(() => { const g = window.__btc.cell.observe().geneById.lacY, v = window.__btc.app.test.level.runner().variant; return g.protein + 15 * g.mRNA + 20 * g.nascent >= (v.lo + v.hi) / 2; })()")) break;
    }
    if (touch) await page.locator('[data-tab="genes"]:visible').first().click();
    await page.locator('[data-gene="lacY"] .seg[data-key="' + v.targetLevel + '"]').click();
    if (touch) await page.locator('[data-tab="cell"]:visible').first().click();
    await L(page, 'runTicks', 600);
    // Real time for a moment, so the "cut up" markers are drawn.
    await page.locator('.play').click();
    await page.waitForTimeout(900);
    await page.locator('.play').click();
    const g = await page.evaluate(() => ({
      gauge: !!document.querySelector('.hud-bar.is-gauge:not([hidden])'), band: parseFloat(document.querySelector('.hud-gauge-band').style.width),
      text: document.querySelector('.hud-goal-text').textContent, cut: window.__btc.app.views.cellView.cutGene,
    }));
    check('LV-5 ' + s.tag + ' band gauge and hold progress in the HUD; LacY "cut up" markers', g.gauge && g.band > 5 && /\/15|of 15/.test(g.text) && g.cut === 4, JSON.stringify(g));
    await shot('run-band');
    if (touch) { await page.locator('[data-tab="graphs"]:visible').first().click(); await shot('run-graphs-band'); await page.locator('[data-tab="cell"]:visible').first().click(); }
    await L(page, 'runToEnd');
    const goal = await R(page, 'window.__btc.app.test.level.runner().goal');
    await L(page, 'next');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await L(page, 'next');
    await shot('result');
    await L(page, 'next');
    await shot('predict2');
    await L(page, 'answer', 'p2', 'ok');
    const ep = await R(page, "{ phase: window.__btc.app.test.level.phase(), button: !!document.querySelector('[data-action=\"epilogue-start\"]') }");
    await shot('epilogue');
    await page.locator('[data-action="epilogue-start"]').click();
    await page.waitForTimeout(700);
    const off = await R(page, "window.__btc.cell.observe().geneById.lacY.level");
    await L(page, 'runToEnd');
    const epEnd = await R(page, "{ done: window.__btc.app.test.level.runner().epilogue.done, hud: document.querySelector('.hud-goal-text').textContent }");
    check('LV-5 ' + s.tag + ' epilogue after p2: "Switch LacY off" switches it off, 12 min run, then Continue',
      goal && ep.phase === 'epilogue' && ep.button && off === 'off' && epEnd.done && /Continue/.test(epEnd.hud), JSON.stringify({ goal, ep, off, epEnd }));
    if (touch) { await page.locator('[data-tab="graphs"]:visible').first().click(); await shot('epilogue-graphs'); await page.locator('[data-tab="cell"]:visible').first().click(); }
    await L(page, 'next');
    await L(page, 'answer', 'l14.d1', 'ok'); await L(page, 'next');
    await L(page, 'answer', 'l14.d2', 2);
    await shot('debrief-wrong');
    await L(page, 'answer', 'l14.d2', 'ok'); await L(page, 'next');
    await shot('echo');
    await L(page, 'next'); await L(page, 'next');
    await shot('complete');
    const code = await L(page, 'code');
    const dec = await page.evaluate((c) => window.__btc.BTC.code.decode(c), code);
    check('LV-5 ' + s.tag + ' complete with a valid code', !!dec.ok && dec.level === '14', code);
    finish(s, 'LV-5', probs);
    await s.context.close();
  }

  // --- LV-3: level 1.1 ------------------------------------------------------------------------------
  const CAND = ['ptsG', 'aaImp', 'lacY', 'lacZ', 'fliC', 'araE'];
  for (const vp of [[360, 740], [1280, 800]]) {
    const touch = vp[0] < 1000;
    const s = await openLevel(browser, port, vp, '?test=1&seed=1&level=1.1', { touch });
    const page = s.page, probs = [];
    const shot = shotter(s, '1.1', probs);
    await shot('story');
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await shot('task');
    await L(page, 'next');
    await shot('predict-p1');
    await L(page, 'answer', 'p1', 'ok');
    await L(page, 'answer', 'p2', 'ok');
    if (touch) await page.locator('[data-tab="genes"]:visible').first().click();
    // Six cards lettered A–F in display order, all "Unknown", and no gene's name anywhere in the pane.
    const cards = await page.evaluate((cand) => {
      const els = Array.from(document.querySelectorAll('#pane-genes .gene-card'));
      const text = document.getElementById('pane-genes').textContent;
      const names = cand.map((id) => window.__btc.BTC.content.genes[id].name).concat(['LacY', 'LacZ', 'PtsG']);
      return { letters: els.map((e) => e.getAttribute('data-letter')).join(''), unknown: els.filter((e) => /Unknown/.test(e.textContent)).length,
        leaks: names.filter((n) => text.includes(n)) };
    }, CAND);
    check('LV-3 ' + s.tag + ' six candidates, lettered A–F, jobs Unknown, no names shown', cards.letters === 'ABCDEF' && cards.unknown === 6 && cards.leaks.length === 0, JSON.stringify(cards));
    await shot('genes-hidden');
    await page.locator('[data-gene="ptsG"] .seg[data-key="2"]').click();
    if (touch) await page.locator('[data-tab="cell"]:visible').first().click();
    await L(page, 'runTicks', 240);
    const hud = await page.evaluate(() => ({ h: Math.round(document.getElementById('hud').getBoundingClientRect().height), stage: Math.round(document.querySelector('#stage').getBoundingClientRect().height),
      counter: document.querySelector('.hud-counter').textContent }));
    check('LV-3 ' + s.tag + ' run: 44 px HUD with the experiment counter; canvas ≥ 220 px', hud.h === 44 && /1 \/ 3|Experiments 1/.test(hud.counter) && (!touch || hud.stage >= 220), JSON.stringify(hud));
    await shot('run');
    for (let i = 0; i < 200 && !(await R(page, '!!window.__btc.app.test.level.runner().run.monitor.save().revealed.ptsG')); i++) await L(page, 'runTicks', 10);
    // The narrator's hold is real time: let it pass, then one more tick.
    await page.waitForTimeout(1700);
    await L(page, 'runTicks', 1);
    await page.waitForTimeout(400);
    const rev = await page.evaluate(() => {
      const card = document.querySelector('[data-gene="ptsG"]');
      const toast = document.getElementById('toast');
      return { key: window.__btc.app.test.shownKey(), narr: document.getElementById('narrator-text').textContent,
        toast: toast && !toast.hidden ? toast.textContent : '', card: card ? card.textContent : '' };
    });
    const named = await R(page, "window.__btc.BTC.content.genes.ptsG.name");
    check('LV-3 ' + s.tag + ' the transporter\'s job is seen: its narrator line, a toast with its letter, and its name on the card',
      rev.key === 'l11.revealGlucose' && /glucose transporter/i.test(rev.narr) && /is now named/.test(rev.toast) && (!touch || true), JSON.stringify(rev));
    if (touch) {
      await page.locator('[data-tab="genes"]:visible').first().click();
      const card = await page.evaluate(() => document.querySelector('#pane-genes [data-gene="ptsG"]').textContent);
      check('LV-3 ' + s.tag + ' the revealed card carries the name and says why', card.includes(named) && /Named after what its protein did/.test(card), card.slice(0, 160));
      await shot('genes-revealed');
      await page.locator('[data-tab="cell"]:visible').first().click();
    }
    await shot('reveal');
    await L(page, 'runToEnd');
    await shot('goal');
    await L(page, 'next');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await L(page, 'next');
    await shot('result');
    await L(page, 'next');
    await L(page, 'answer', 'l11.d1', 1);
    await shot('debrief-wrong');
    await L(page, 'answer', 'l11.d1', 'ok'); await L(page, 'next');
    await L(page, 'answer', 'l11.d2', 'ok'); await L(page, 'next');
    await shot('echo');
    await L(page, 'next'); await L(page, 'next');
    await shot('complete');
    const lines = await page.evaluate(() => document.querySelector('.sheet-body').textContent);
    const code = await L(page, 'code');
    const dec = await page.evaluate((c) => window.__btc.BTC.code.decode(c), code);
    check('LV-3 ' + s.tag + ' complete: every candidate named with its letter, and a valid code', !!dec.ok && dec.level === '11' && dec.G === 1 && /A[:\s·–-]/.test(lines) && lines.includes(named), code);
    finish(s, 'LV-3', probs);
    await s.context.close();
  }

  // --- LV-6: level 1.7 ------------------------------------------------------------------------------
  for (const vp of [[360, 740], [375, 553], [1280, 800]]) {
    const touch = vp[0] < 1000, full = vp[1] !== 553;
    const s = await openLevel(browser, port, vp, '?test=1&seed=1&level=1.7', { touch });
    const page = s.page, probs = [];
    const shot = shotter(s, '1.7', probs);
    if (full) await shot('story');
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    if (full) await shot('task');
    await L(page, 'next');
    const rows = await R(page, 'window.__btc.app.test.level.runner().variant.rows');
    const tt0 = await page.evaluate(() => ({ cards: document.querySelectorAll('.tt-card').length, expert: document.querySelectorAll('.tt-card.is-expert').length,
      lock: document.querySelector('.lv-sticky [data-primary]').disabled }));
    await shot('predict-table');
    const ans = { wt: { glc: 0, lac: 1 }, dlacI: { glc: 1, lac: 1 }, Oc: { glc: 1, lac: 1 }, Is: { glc: 0, lac: 0 } };
    for (const r of rows) for (const c of ['glc', 'lac']) await page.locator('.tt-card[data-row="' + r + '"] [data-col="' + c + '"][data-value="' + ans[r][c] + '"]').click();
    const lockOk = await page.evaluate(() => !document.querySelector('.lv-sticky [data-primary]').disabled);
    check('LV-6 ' + s.tag + ' truth table: three Core strains and one Expert, Lock in only once the Core cells are set', tt0.cards === 4 && tt0.expert === 1 && tt0.lock && lockOk, JSON.stringify(tt0));
    if (full) await shot('predict-table-filled');
    await page.locator('.lv-sticky [data-primary]').click();
    await L(page, 'answer', 'crp', 'ok');
    const d0 = await page.evaluate(() => ({ phase: window.__btc.app.test.level.phase(), summary: (document.querySelector('.dz-summary') || {}).textContent || '',
      parts: document.querySelectorAll('[data-part]').length }));
    await shot('design');
    await page.locator('[data-part="lac.promoter"]').click();
    if (full) await shot('design-open');
    await page.locator('.dz-option[data-value="1"]').click();
    await page.locator('[data-part="lac.operator"]').click();
    await page.locator('.dz-option[data-value="true"]').click();
    await page.locator('[data-part="lacI.allele"]').click();
    await page.locator('.dz-option[data-value="wt"]').click();
    await page.locator('[data-part="lac.crpSite"]').click();
    await page.locator('.dz-option[data-value="true"]').click();
    const d1 = await page.evaluate(() => (document.querySelector('.dz-summary') || {}).textContent || '');
    await page.locator('[data-action="design-run"]').click();
    if (full) await shot('design-confirm');
    await page.locator('[data-action="design-confirm"]').click();
    const design = await R(page, 'window.__btc.cell.observe().lac.design');
    check('LV-6 ' + s.tag + ' designer: starts as the Commander\'s design, edits show in the summary, Run confirms, the cell runs the design',
      d0.phase === 'design' && d0.parts === 5 && /operator absent/.test(d0.summary) && /operator present/.test(d1) && /CRP site present/.test(d1) &&
      design.lac.operator === true && design.lacI.allele === 'wt' && design.lac.promoter === 1, JSON.stringify({ d0, d1, design }));
    if (full) await shot('on-run');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await L(page, 'next');
    await L(page, 'runTicks', 120);
    const run = await page.evaluate(() => ({
      h: Math.round(document.getElementById('hud').getBoundingClientRect().height), stage: Math.round(document.querySelector('#stage').getBoundingClientRect().height),
      counter: document.querySelector('.hud-counter').textContent, action: !!document.querySelector('.hud-action:not([hidden])'),
      inset: !!document.querySelector('#lac-inset:not([hidden]) svg'),
    }));
    // Under 400 px the "No controls" chip gives its place to "To the end" (LEVELS §16).
    check('LV-6 ' + s.tag + ' run: 44 px HUD, "No controls" (wide), Run to the end, the lac region drawn; canvas ≥ 220 px',
      run.h === 44 && (vp[0] < 400 || /No controls/.test(run.counter)) && run.action && run.inset && (!touch || run.stage >= 220), JSON.stringify(run));
    await shot('run');
    if (touch && full) {
      await page.locator('[data-tab="genes"]:visible').first().click();
      const ro = await page.evaluate(() => ({ cards: document.querySelectorAll('#pane-genes .gene-card').length, segs: document.querySelectorAll('#pane-genes .seg:not([disabled])').length }));
      check('LV-6 ' + s.tag + ' Genes: the four lac genes, read-only', ro.cards === 4 && ro.segs === 0, JSON.stringify(ro));
      await shot('genes');
      await page.locator('[data-tab="graphs"]:visible').first().click();
      await shot('graphs-bands');
      await page.locator('[data-tab="cell"]:visible').first().click();
    }
    if (!full) { finish(s, 'LV-6', probs); await s.context.close(); continue; }
    await page.locator('.hud-action').click();
    await page.waitForFunction(() => !window.__btc.app.ff, null, { timeout: 60000 });
    const end = await page.evaluate(() => ({ goal: window.__btc.app.test.level.runner().goal, hud: document.querySelector('.hud-goal-text').textContent,
      tick: window.__btc.cell.tick }));
    await shot('run-end');
    await L(page, 'next');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await L(page, 'next');
    await page.waitForFunction(() => document.querySelectorAll('.lv-eff.lv-sub').length === 3, null, { timeout: 30000 });
    const res = await page.evaluate(() => ({ bars: Array.from(document.querySelectorAll('.lv-eff.lv-sub')).map((b) => b.getAttribute('data-bar')).join(','),
      chart: !!document.querySelector('.lv-sketch-chart canvas') }));
    check('LV-6 ' + s.tag + ' Run to the end reaches the end; the result shows growth, waste and lag against par, and the chart',
      end.goal && /Continue/.test(end.hud) && res.bars === 'growth,waste,lag' && res.chart, JSON.stringify({ end, res }));
    await shot('result');
    await L(page, 'next');
    await L(page, 'answer', 'l17.d1', 2);
    await shot('debrief-wrong');
    await L(page, 'answer', 'l17.d1', 'ok'); await L(page, 'next');
    await L(page, 'answer', 'l17.d2', 'ok'); await L(page, 'next');
    await shot('echo');
    await L(page, 'next'); await L(page, 'next');
    await shot('complete');
    const code = await L(page, 'code');
    const dec = await page.evaluate((c) => window.__btc.BTC.code.decode(c), code);
    check('LV-6 ' + s.tag + ' complete with a valid code', !!dec.ok && dec.level === '17' && dec.G === 1, code);
    finish(s, 'LV-6', probs);
    await s.context.close();
  }

  // --- LV-7: copying the code ---------------------------------------------------------------------------
  const quickComplete = async (page) => {
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await L(page, 'next');
    await L(page, 'answer', 'p1', 'ok'); await L(page, 'answer', 'ss', 300);
    await page.evaluate(() => window.__btc.cell.command({ type: 'setPromoter', gene: 'lacY', level: window.__btc.app.test.level.runner().variant.targetLevel }));
    await L(page, 'runToEnd');
    await L(page, 'next');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await L(page, 'next');
    await L(page, 'next');
    await L(page, 'answer', 'p2', 'ok');
    await L(page, 'startEpilogue');
    await L(page, 'runToEnd');
    await L(page, 'next');
    for (const q of ['l14.d1', 'l14.d2']) { await L(page, 'answer', q, 'ok'); await L(page, 'next'); }
    while ((await L(page, 'phase')) !== 'complete') await L(page, 'next');
    await paint(page);
  };
  {
    const s = await openLevel(browser, port, [360, 740], '?test=1&seed=1&level=1.4', { permissions: ['clipboard-read', 'clipboard-write'] });
    await quickComplete(s.page);
    await s.page.locator('[data-action="copy-code"]').click();
    await s.page.waitForTimeout(200);
    const clip = await s.page.evaluate(() => navigator.clipboard.readText());
    const code = await L(s.page, 'code');
    const status = await s.page.locator('.lv-copy-status').textContent();
    check('LV-7 Copy code puts the code on the clipboard', clip === code && /Copied/.test(status), clip + ' / ' + status);
    await s.context.close();
    const f = await openLevel(browser, port, [360, 740], '?test=1&seed=1&level=1.4', {
      init: () => { try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (e) { /* ignore */ } document.execCommand = () => false; },
    });
    await quickComplete(f.page);
    await f.page.locator('[data-action="copy-code"]').click();
    await f.page.waitForTimeout(200);
    const fb = await f.page.evaluate(() => ({ status: document.querySelector('.lv-copy-status').textContent, sel: String(window.getSelection()) }));
    const code2 = await L(f.page, 'code');
    check('LV-7 without navigator.clipboard the fallback selects the code and says how to copy it', /Press and hold/.test(fb.status) && fb.sel.replace(/\s/g, '') === code2, JSON.stringify(fb));
    await f.page.screenshot({ path: path.join(OUT, '1.4-360x740-copy-fallback.png') });
    screens.push('1.4-360x740-copy-fallback.png');
    await f.context.close();
  }

  // --- LV-8: resume 1.4 mid-run ---------------------------------------------------------------------------
  {
    const s = await openLevel(browser, port, [360, 740], '?test=1&seed=1&level=1.4');
    const page = s.page;
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await L(page, 'next');
    await L(page, 'answer', 'p1', 'ok'); await L(page, 'answer', 'ss', 300);
    await page.evaluate(() => window.__btc.app.send({ type: 'setPromoter', gene: 'lacY', level: 2 }, 'lacY', '2'));
    await L(page, 'runTicks', 432);
    const before = await R(page, "{ tick: window.__btc.cell.tick, phase: window.__btc.app.test.level.phase(), hash: window.__btc.cell.hash() }");
    await page.locator('#status .levels-btn').click();
    await paint(page);
    const leave = page.locator('[data-action="leave"]');
    if (await leave.count()) await leave.click();
    await paint(page);
    await page.goto('http://localhost:' + port + '/?test=1&seed=1');
    await page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test);
    await paint(page);
    await page.locator('.level-row[data-level="1.4"]').click();
    await paint(page);
    const after = await R(page, "{ tick: window.__btc.cell.tick, phase: window.__btc.app.test.level.phase(), hash: window.__btc.cell.hash(), running: window.__btc.app.loop.running }");
    check('LV-8 1.4 left mid-run and reopened after a reload: same tick, phase and state, paused',
      after.tick === before.tick && after.phase === before.phase && after.hash === before.hash && !after.running, JSON.stringify({ before, after }));
    await page.screenshot({ path: path.join(OUT, '1.4-360x740-resumed.png') });
    screens.push('1.4-360x740-resumed.png');
    check('LV-8 no console errors', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();
  }

  // --- the published code decoder (…/tools/codes.html, §14 decision 5) -------------------------------------
  {
    const s = await openLevel(browser, port, [1280, 800], '?test=1&seed=1&level=1.4', { touch: false });
    await quickComplete(s.page);
    const code = await L(s.page, 'code');
    await s.page.goto('http://localhost:' + port + '/tools/codes.html');
    await s.page.fill('#codes', 'name,id,"1: Paste your Be the Cell code"\nAda,1,"' + code + '"\nGrace,2,"' + code + '"\n');
    await s.page.click('#decode');
    const t = await s.page.evaluate(() => ({ summary: document.getElementById('summary').textContent, rows: window.__codes.rows().map((r) => [r.valid, r.level, r.warnings]) }));
    check('codes.html (published) decodes a level code and flags the duplicate', /2 valid/.test(t.summary) && t.rows.every((r) => r[0] && r[1] === '1.4' && /same code/.test(r[2])), JSON.stringify(t));
    await s.page.screenshot({ path: path.join(OUT, 'codes-1280x800.png'), fullPage: true });
    screens.push('codes-1280x800.png');
    check('codes.html no console errors, no request leaves the origin', s.errors.length === 0 && s.offsite.length === 0, s.errors.concat(s.offsite).join(' | '));
    await s.context.close();
  }
  return screens;
}

module.exports = { run };
