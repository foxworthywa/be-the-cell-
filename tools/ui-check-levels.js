// Browser checks for the levels (LEVELS.md §12.2, LV-1, LV-3, LV-4, LV-5, LV-6, LV-7, LV-8, LV-9,
// and the published codes page), called by tools/ui-check.js. The opening (both parts; LV-2 before)
// has its own checks in tools/ui-check-opening.js (docs/PROLOGUE.md §10.2, BO-1 … BO-4).
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
/** From the echo phase: the outro beat (it comes after the debrief, LEVELS §4.1), the screens, then complete. */
async function echoToComplete(page, shot) {
  for (let i = 0; i < 30 && (await L(page, 'phase')) !== 'complete'; i++) {
    const st = await R(page, "{ beat: !!window.__btc.app.test.level.runner().beat, echo: window.__btc.app.test.level.runner().echoScreen() }");
    if (shot && !st.beat && st.echo && st.echo.index === 0) await shot('echo');
    await L(page, 'next');
  }
}

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
    const order = ['P', 'P2', '1.1', '1.2', '1.4', '1.7'];
    check('LV-1 home lists Prologue 1, Prologue 2, 1.1, 1.2, 1.4 and 1.7 in order', order.every((id) => rows.indexOf(id) >= 0) && order.every((id, k) => k === 0 || rows.indexOf(order[k - 1]) < rows.indexOf(id)), rows.join(', '));
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

  // --- LV-4: level 1.2 (docs/PROLOGUE.md §6.2), by taps: the watch, the Try with the milk at minute D, the result, Explain -----
  for (const vp of [[360, 740], [1280, 800]]) {
    const touch = vp[0] < 1000;
    const s = await openLevel(browser, port, vp, '?test=1&seed=1&level=1.2&v=000C1S', { touch });
    const page = s.page, probs = [];
    const shot = shotter(s, '1.2', probs);
    const tap = async (sel) => { const l = page.locator(sel).first(); if (touch) await l.tap(); else await l.click(); await paint(page); };
    const hudGoal = () => R(page, "document.querySelector('.hud-goal-text').textContent");
    const intros = async (name) => {
      for (let k = 0; k < 4 && (await R(page, "!!document.querySelector('.guide:not([hidden]) [data-action=\"intro-next\"]')")); k++) {
        if (name && k === 0) await shot(name);
        await tap('[data-action="intro-next"]');
      }
    };
    await shot('story');
    while ((await L(page, 'phase')) === 'intro') await tap('.lv-next');
    // The watch: one copy outlined and followed in the HUD; the gene off, the transporters since then counted.
    let readInto = '', sinceOff = '', zoom = '';
    for (let g = 0; g < 80 && (await L(page, 'phase')) === 'watch'; g++) {
      const w = await R(page, 'window.__btc.app.test.level.watch.info()');
      if (!w || w.done) break;
      if (await R(page, "!!document.querySelector('.guide:not([hidden]) [data-action=\"intro-next\"]')")) { await tap('[data-action="intro-next"]'); continue; }
      if (w.stage === 'guess') { await shot(w.id + '-guess'); await tap('.lv-option >> nth=1'); await tap('[data-action="guess-see"]'); continue; }
      if (w.stage === 'act') { await tap('.tb-ctrl .seg[data-key="' + (w.act.expect.on === false ? 'off' : 'on') + '"]'); await L(page, 'runTicks', 1); continue; }
      if (w.stage === 'until' || w.stage === 'wait') { await R(page, 'window.__btc.app.test.level.watch.untilGate(40000)'); await paint(page); continue; }
      if (w.id === 'w1b') { readInto = await hudGoal(); zoom = await R(page, 'window.__btc.app.views.zoom.get()'); await shot('w1b'); }
      if (w.id === 'w2b') { sinceOff = await hudGoal(); await shot('w2b'); }
      await tap('[data-action="watch-next"]');
    }
    check('LV-4 ' + s.tag + ' watch in the Gene close-up: the HUD follows the outlined copy, then counts the transporters since the switch-off',
      zoom === 'gene' && /[Rr]ead into \d+/.test(readInto) && /since/.test(sinceOff), JSON.stringify({ zoom, readInto, sinceOff }));
    // The task: the two machine cards, the goal and "Start".
    const task = await R(page, "{ phase: window.__btc.app.test.level.phase(), cards: document.querySelectorAll('.lv-cards > *').length, text: document.querySelector('.sheet-body').textContent }");
    await shot('task');
    check('LV-4 ' + s.tag + ' task: the lactose transporter and splitter cards, the goal with its number and minute',
      task.phase === 'task' && task.cards === 2 && /Have [\d,]+ lactose transporters in the membrane by minute \d+/.test(task.text), JSON.stringify(task).slice(0, 200));
    await tap('.lv-sticky .btn.primary');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await tap('.lv-next');
    await intros('run-intro');
    const hud = await page.evaluate(() => ({ h: document.getElementById('hud').getBoundingClientRect().height, stage: document.getElementById('stage').getBoundingClientRect().height,
      goal: document.querySelector('.hud-goal-text').textContent, counter: document.querySelector('.hud-counter').hidden ? '' : document.querySelector('.hud-counter').textContent,
      ellipsis: (() => { const e = document.querySelector('.hud-goal-text'); return e.scrollWidth > e.clientWidth + 0.5; })() }));
    // On a phone the goal and its target take the room (the copies made are in the focus bar below; the chip gives way).
    check('LV-4 ' + s.tag + ' run: 44 px HUD with the target (whole, not cut short) and, when wide enough, the copies made; canvas ≥ 220 px',
      hud.h === 44 && (touch ? /^Transporters 0 \/ [\d,]+$/ : /^0 \/ [\d,]+ lactose transporters$/).test(hud.goal) && !hud.ellipsis
        && (touch ? hud.counter === '' : /copies/.test(hud.counter)) && (!touch || hud.stage >= 220), JSON.stringify(hud));
    // LacZ is counted in whole four-chain enzymes wherever the student sees a count.
    const lacZ = await page.evaluate(() => {
      const a = window.__btc.app; a.setFocus('lacZ'); a.render(0, true, true, 0);
      const n = document.querySelector('[data-counter="protein"] .tb-num, [data-counter="protein"] .num, [data-counter="protein"] b');
      const out = { shown: n ? n.textContent : '', chains: a.cell.observe().geneById.lacZ.protein };
      a.setFocus('lacY'); a.render(0, true, true, 0);
      return out;
    });
    check('LV-4 ' + s.tag + ' the lactose-splitting enzyme is counted in whole four-chain enzymes', lacZ.shown.replace(/,/g, '') === String(Math.round(lacZ.chains / 4)), JSON.stringify(lacZ));
    await tap('.tb-ctrl .seg[data-key="on"]');
    await L(page, 'runTicks', 1);
    for (let i = 0; i < 400; i++) {
      await L(page, 'runTicks', 10);
      if (await R(page, "(() => { const g = window.__btc.cell.observe().geneById.lacY, r = window.__btc.app.test.level.runner(), L = window.__btc.BTC.levelConstants.l12; return g.protein + L.ppm * (g.mRNA + g.nascent) >= L.refMargin * r.variant.T; })()")) break;
    }
    await tap('.tb-ctrl .seg[data-key="off"]');
    await L(page, 'runTicks', 60);
    await shot('run-off');
    // Minute D: the milk arrives; a story beat holds the run, the switch locks, the economy readouts join.
    const D = await R(page, 'window.__btc.app.test.level.runner().variant.D');
    await L(page, 'runTicks', D * 60 + 2 - (await R(page, 'window.__btc.cell.tick')));
    await paint(page);
    const milk = await page.evaluate(() => ({ beat: (window.__btc.app.test.level.runner().beat || {}).name || null, running: window.__btc.app.isRunning(),
      locked: Array.from(document.querySelectorAll('.tb-ctrl .seg')).every((b) => b.disabled), text: (document.querySelector('.sheet-body') || {}).textContent || '' }));
    await shot('milk');
    check('LV-4 ' + s.tag + ' minute D: the milk story holds the run and the switch is locked', milk.beat === 'milk' && !milk.running && milk.locked && /glucose is gone/i.test(milk.text), JSON.stringify(milk).slice(0, 200));
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await tap('.lv-next');
    await intros('milk-intro');
    const readouts = await page.evaluate(() => ['.st-atp', '.st-growth-word', '.st-sugar'].map((q) => { const e = document.querySelector(q); return !!e && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0; }));
    check('LV-4 ' + s.tag + ' after the milk: energy, growth and sugar coming in are shown', readouts.every(Boolean), JSON.stringify(readouts));
    await L(page, 'runToEnd');
    await paint(page);
    const end = await hudGoal();
    await shot('run-end');
    await tap('.hud-goal');
    const result = await R(page, "document.querySelector('.sheet-body').textContent");
    await shot('result');
    check('LV-4 ' + s.tag + ' result: goal met, growth on milk sugar, the copies against what was needed', /Goal met/.test(end) && /On milk sugar the cell grew at \d+% of its glucose speed/.test(result) && /copies/.test(result), end + ' / ' + result.slice(0, 160));
    await tap('[data-action="result-continue"]');
    await tap('.lv-option >> nth=0');
    await shot('explain-first-tap');
    await L(page, 'answer', 'l12.d1', 'ok'); await paint(page);
    await tap('.lv-sticky .btn.primary');
    await L(page, 'answer', 'l12.d2', 'ok'); await paint(page);
    await shot('explain-2');
    await tap('.lv-sticky .btn.primary');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await tap('.lv-next');
    for (let k = 0; k < 4 && (await L(page, 'phase')) === 'echo'; k++) { if (k === 0) await shot('echo'); await tap('.lv-sticky .btn.primary'); }
    await shot('complete');
    const code = await L(page, 'code');
    const dec = await page.evaluate((c) => window.__btc.BTC.code.decode(c), code);
    check('LV-4 ' + s.tag + ' complete with a valid code', !!dec.ok && dec.level === '12' && dec.G === 1, code);
    finish(s, 'LV-4', probs);
    await s.context.close();
  }

  // --- LV-9: 375 × 553, the 1.2 watch and run keep their canvas ----------------------------------------------------
  {
    const s = await openLevel(browser, port, [375, 553], '?test=1&seed=1&level=1.2&v=000C1S');
    const page = s.page, probs = [];
    const shot = shotter(s, '1.2', probs);
    const size = () => page.evaluate(() => ({ stage: Math.round(document.getElementById('stage').getBoundingClientRect().height), hud: document.getElementById('hud').getBoundingClientRect().height }));
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    const w = await size();
    await shot('watch-short');
    // The watch played through its test hooks, then the run.
    for (let g = 0; g < 80 && (await L(page, 'phase')) === 'watch'; g++) {
      const i = await R(page, 'window.__btc.app.test.level.watch.info()');
      if (!i || i.done) break;
      if (i.stage === 'guess') await R(page, 'window.__btc.app.test.level.watch.guess()');
      else if (i.stage === 'act') { await page.locator('.tb-ctrl .seg[data-key="' + (i.act.expect.on === false ? 'off' : 'on') + '"]').first().tap(); await L(page, 'runTicks', 1); }
      else if (i.stage === 'until' || i.stage === 'wait') await R(page, 'window.__btc.app.test.level.watch.untilGate(40000)');
      else await R(page, 'window.__btc.app.test.level.watch.next()');
    }
    while ((await L(page, 'phase')) === 'task') await L(page, 'next');
    while (await R(page, '!!window.__btc.app.test.level.runner().beat')) await L(page, 'next');
    await L(page, 'runTicks', 30);
    const m = await size();
    check('LV-9 375×553 1.2 watch and run: canvas ≥ 220 px with the 44 px HUD', w.stage >= 220 && w.hud === 44 && m.stage >= 220 && m.hud === 44, JSON.stringify({ w, m }));
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
    await echoToComplete(page, shot);
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
        leaks: names.filter((n) => text.includes(n)),
        // A hidden gene's usual level (only a transporter sits at 1) or its "stands for ~10 genes" badge would name it.
        defaults: document.querySelectorAll('#pane-genes .seg.is-default').length, badges: document.querySelectorAll('#pane-genes .badge').length };
    }, CAND);
    check('LV-3 ' + s.tag + ' six candidates, lettered A–F, jobs Unknown, no names shown, no default mark or "stands for" badge',
      cards.letters === 'ABCDEF' && cards.unknown === 6 && cards.leaks.length === 0 && cards.defaults === 0 && cards.badges === 0, JSON.stringify(cards));
    await shot('genes-hidden');
    // The slow side route: drawn as its own glyph in the membrane; with no transporter made yet, every glucose marker goes through it.
    if (touch) await page.locator('[data-tab="cell"]:visible').first().click();
    await page.locator('.play').click();
    await page.waitForTimeout(1200);
    const side = await page.evaluate(() => {
      const cv = window.__btc.app.views.cellView;
      let viaPts = 0, viaSide = 0;
      for (let j = 0; j < 128; j++) { if (cv.mAge[j] >= 0) viaPts++; if (cv.mAge[5 * 128 + j] >= 0) viaSide++; }
      const onSide = [];
      for (let j = 0; j < 128; j++) {
        const i = 5 * 128 + j;
        if (cv.mAge[i] < 0) continue;
        // Each marker starts 16 px outside its glyph and ends inside it.
        const d = Math.min(...[0, 1].map((k) => Math.hypot(cv.mX0[i] - cv.sideX[k], cv.mY0[i] - cv.sideY[k])));
        onSide.push(d < 20);
      }
      return { sideN: cv.sideN, viaPts, viaSide, allAtGlyph: onSide.every(Boolean), ptsG: window.__btc.cell.observe().geneById.ptsG.protein, key: window.__btc.app.test.shownKey() };
    });
    await page.locator('.play').click();
    await shot('run-side-route');
    check('LV-3 ' + s.tag + ' the side route is drawn in the membrane and glucose comes in only there; the narrator says so',
      side.sideN === 2 && side.viaPts === 0 && side.viaSide > 0 && side.allAtGlyph && side.ptsG === 0 && side.key === 'l11.trickle', JSON.stringify(side));
    if (touch) await page.locator('[data-tab="genes"]:visible').first().click();
    await page.locator('[data-gene="ptsG"] .seg[data-key="2"]').click();
    if (touch) await page.locator('[data-tab="cell"]:visible').first().click();
    await L(page, 'runTicks', 240);
    const hud = await page.evaluate(() => ({ h: Math.round(document.getElementById('hud').getBoundingClientRect().height), stage: Math.round(document.querySelector('#stage').getBoundingClientRect().height),
      counter: document.querySelector('.hud-counter').textContent }));
    check('LV-3 ' + s.tag + ' run: 44 px HUD with the experiment counter; canvas ≥ 220 px', hud.h === 44 && /^1\/3 tests$|Experiments 1/.test(hud.counter) && (!touch || hud.stage >= 220), JSON.stringify(hud));
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
    await echoToComplete(page, shot);
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
    await echoToComplete(page, shot);
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

  // --- LV-10: a run that ends in real time (the loop, not runTicks): the HUD says so at once ----------------------
  {
    const s = await openLevel(browser, port, [360, 740], '?test=1&seed=1&level=1.4');
    const page = s.page, probs = [];
    const shot = shotter(s, '1.4', probs);
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await L(page, 'next');
    await L(page, 'answer', 'p1', 'ok'); await L(page, 'answer', 'ss', 300);
    const v = await R(page, 'window.__btc.app.test.level.runner().variant');
    await page.locator('[data-tab="genes"]:visible').first().click();
    await page.locator('[data-gene="lacY"] .seg[data-key="' + v.targetLevel + '"]').click();
    await page.locator('[data-tab="cell"]:visible').first().click();
    await page.evaluate(() => window.__btc.app.test.setSpeed(600));
    await page.locator('.play').click();
    await page.waitForFunction(() => { const r = window.__btc.app.test.level.runner(); return r.run && r.run.endReason; }, null, { timeout: 30000 });
    // No test hook steps the cell or refreshes the HUD from here on: the frame that ended the run must have done it.
    await page.waitForTimeout(150);
    const end = await page.evaluate(() => ({ reason: window.__btc.app.test.level.runner().run.endReason, goal: window.__btc.app.test.level.runner().goal,
      hud: document.querySelector('.hud-goal-text').textContent, cont: document.querySelector('.hud-goal').classList.contains('is-continue'),
      running: window.__btc.app.loop.running, play: document.querySelector('.play').textContent }));
    await shot('run-end-realtime');
    check('LV-10 360x740 1.4 ends in real time: the HUD reads "Goal met · Continue" at once, the loop has stopped',
      end.reason === 'goal' && end.goal && /Goal met · Continue/.test(end.hud) && end.cont && !end.running, JSON.stringify(end));
    await page.locator('.hud-goal').click();
    await paint(page);
    await L(page, 'next');                       // result → predict2
    await L(page, 'answer', 'p2', 'ok');
    await page.locator('[data-action="epilogue-start"]').click();
    await page.evaluate(() => window.__btc.app.test.setSpeed(600));
    await page.waitForFunction(() => window.__btc.app.test.level.runner().epilogue.done, null, { timeout: 30000 });
    await page.waitForTimeout(150);
    const ep = await page.evaluate(() => ({ hud: document.querySelector('.hud-goal-text').textContent, running: window.__btc.app.loop.running }));
    check('LV-10 360x740 the 1.4 epilogue ends in real time: the HUD reads "Continue" at once', /^Continue$/.test(ep.hud) && !ep.running, JSON.stringify(ep));
    finish(s, 'LV-10', probs);
    await s.context.close();
    // 1.7 on the loop (1 s = 1 h, a design that fails): the result opens by itself and "To the end" is gone.
    const t = await openLevel(browser, port, [360, 740], '?test=1&seed=1&level=1.7');
    const p7 = t.page;
    while ((await L(p7, 'phase')) === 'intro') await L(p7, 'next');
    await L(p7, 'next');
    await L(p7, 'answer', 'tt', { wt: { glc: 0, lac: 1 }, dlacI: { glc: 1, lac: 1 }, Oc: { glc: 1, lac: 1 }, Is: { glc: 0, lac: 0 } });
    await p7.evaluate(() => { const r = window.__btc.app.test.level.runner(); r.skip('crp'); if (!r.currentItem()) r.next(); window.__btc.app.views.levelUI.after(); });
    await L(p7, 'design', { lac: { promoter: 1, operator: true, crpSite: true }, lacI: { allele: 'Is', promoter: 1 } });
    await L(p7, 'runDesign');
    while (await R(p7, '!!window.__btc.app.test.level.runner().beat')) await L(p7, 'next');
    await p7.evaluate(() => window.__btc.app.test.setSpeed(3600));
    await p7.locator('.play').click();
    await p7.waitForFunction(() => { const r = window.__btc.app.test.level.runner(); return r.phase === 'result'; }, null, { timeout: 60000 });
    await p7.waitForTimeout(150);
    const r7 = await p7.evaluate(() => ({ action: !!document.querySelector('.hud-action:not([hidden])'), sheet: !!document.querySelector('[data-action="result-retry"]'),
      note: Array.from(document.querySelectorAll('.sheet-note')).map((e) => e.textContent).join(' | ') }));
    check('LV-10 360x740 1.7 ends in real time with the goal missed: the result opens, "To the end" is gone, Try again says to change the DNA',
      !r7.action && r7.sheet && /Change the DNA/.test(r7.note), JSON.stringify(r7));
    await p7.locator('[data-action="result-retry"]').click();
    await paint(p7);
    const back = await p7.evaluate(() => ({ phase: window.__btc.app.test.level.phase(), designer: !!document.querySelector('[data-part="lacI.allele"]') }));
    check('LV-10 360x740 1.7 Try again opens the DNA editor', back.phase === 'design' && back.designer, JSON.stringify(back));
    check('LV-10 no console errors', s.errors.length === 0 && t.errors.length === 0, s.errors.concat(t.errors).join(' | '));
    await t.context.close();
  }

  // --- LV-11: the free-play lab has a way home ------------------------------------------------------------------
  for (const vp of [[360, 740], [1280, 800]]) {
    const touch = vp[0] < 1000;
    const s = await openLevel(browser, port, vp, '?test=1&seed=1', { touch });
    const probs = [];
    const shot = shotter(s, 'lab', probs);
    await s.page.locator('[data-action="lab"]').click();
    await paint(s.page);
    const btn = await s.page.evaluate(() => { const b = document.querySelector('#status .levels-btn'); const r = b.getBoundingClientRect();
      return { hidden: b.hidden, w: Math.round(r.width), h: Math.round(r.height), screen: window.__btc.app.screen }; });
    await shot('levels-button');
    await s.page.locator('#status .levels-btn').click();
    await paint(s.page);
    const home = await R(s.page, "window.__btc.app.screen + '/' + document.body.getAttribute('data-surface')");
    // A reload in the lab comes back to the lab, with the button (a student's page: no ?test, which always opens home).
    await s.page.locator('[data-action="lab"]').click();
    await s.page.goto('http://localhost:' + port + '/');
    await s.page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.screen);
    const again = await s.page.evaluate(() => ({ screen: window.__btc.app.screen, hidden: document.querySelector('#status .levels-btn').hidden }));
    check('LV-11 ' + s.tag + ' the lab shows the Levels button, which goes home; after a reload in the lab it is still there',
      btn.screen === 'lab' && !btn.hidden && btn.w >= 44 && btn.h >= 44 && home === 'home/home' && again.screen === 'lab' && !again.hidden, JSON.stringify({ btn, home, again }));
    finish(s, 'LV-11', probs);
    await s.context.close();
  }

  // --- LV-12: two tabs share the progress: a code from one survives the other --------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const open = async () => { const pg = await context.newPage(); await pg.goto('http://localhost:' + port + '/?test=1&seed=1'); await pg.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test); return pg; };
    const A = await open(), B = await open();
    await A.evaluate(() => window.__btc.app.enterLevel('1.4'));
    await quickComplete(A);
    const a = await A.evaluate(() => window.__btc.app.test.level.code());
    await B.waitForTimeout(200);
    const homeB = await B.evaluate(() => (document.querySelector('.level-row[data-level="1.4"] .lr-chip') || {}).textContent || '');
    await B.evaluate(() => window.__btc.app.enterLevel('1.1'));
    const stored = await B.evaluate(() => { const p = JSON.parse(localStorage.getItem('btc.progress.v1')); return { r: (p.levels['1.4'] || {}).results || [], open: p.lastLevel }; });
    const C = await open();
    const next = await C.evaluate(() => window.__btc.app.progress.attemptFor('1.4').attempt);
    check('LV-12 two tabs: tab A\'s 1.4 code survives tab B opening 1.1; B\'s home showed it done; the next 1.4 attempt is 2',
      stored.r.length === 1 && stored.r[0].code === a && /done/.test(homeB) && stored.open === '1.1' && next === 2, JSON.stringify({ a, homeB, n: stored.r.length, next }));
    await context.close();
  }

  // --- LV-13: an autosave from another content version is not resumed ---------------------------------------------
  {
    const s = await openLevel(browser, port, [360, 740], '?test=1&seed=1&level=1.4');
    const page = s.page;
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await L(page, 'next');
    await L(page, 'answer', 'p1', 'ok'); await L(page, 'answer', 'ss', 300);
    await L(page, 'runTicks', 300);
    await page.evaluate(() => window.__btc.app.autosaveNow());
    await page.close();                          // the page saves on its way out, so the older save is planted before the next one boots
    const page2 = await s.context.newPage();
    page2.on('pageerror', (e) => s.errors.push(e.message));
    await page2.addInitScript(() => {
      if (sessionStorage.getItem('planted')) return;
      sessionStorage.setItem('planted', '1');
      const k = 'btc.level.autosave.v1', sv = JSON.parse(localStorage.getItem(k));
      sv.content = sv.content - 1;                // as written by a build with the level's previous content
      localStorage.setItem(k, JSON.stringify(sv));
    });
    await page2.goto('http://localhost:' + port + '/?test=1&seed=1');
    await page2.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test);
    await paint(page2);
    const st = await page2.evaluate(() => ({ phase: window.__btc.app.test.level.phase(), tick: window.__btc.cell.tick, toast: (document.getElementById('toast') || {}).textContent || '',
      saved: JSON.parse(localStorage.getItem('btc.level.autosave.v1') || 'null'), version: window.__btc.BTC.levels.byId['1.4'].version }));
    check('LV-13 an autosave of another content version: the level starts again from its story, with "The app was updated"',
      st.phase === 'intro' && st.tick === 0 && /updated/.test(st.toast) && st.saved && st.saved.content === st.version, JSON.stringify({ phase: st.phase, tick: st.tick, toast: st.toast }));
    check('LV-13 no console errors', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();
  }

  // --- LV-14: ?level and ?v are used once; a reload resumes the autosave instead of starting over ---------------------
  {
    const s = await openLevel(browser, port, [360, 740], '?test=1&seed=1&level=1.4&v=ABCDEF');
    const page = s.page;
    const url0 = await page.evaluate(() => location.search);
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await L(page, 'next');
    await L(page, 'answer', 'p1', 'ok'); await L(page, 'answer', 'ss', 300);
    await L(page, 'runTicks', 300);
    const before = await R(page, "{ tick: window.__btc.cell.tick, attempt: window.__btc.app.test.level.runner().attempt, override: window.__btc.app.test.level.runner().override }");
    await page.evaluate(() => window.__btc.app.autosaveNow());
    await page.reload();
    await page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test);
    await paint(page);
    const after = await R(page, "{ tick: window.__btc.cell.tick, phase: window.__btc.app.test.level.phase(), attempt: window.__btc.app.test.level.runner().attempt, override: window.__btc.app.test.level.runner().override, search: location.search }");
    check('LV-14 ?level=1.4&v=… is taken out of the address; a reload resumes the override run where it was',
      url0 === '?test=1&seed=1' && after.search === '?test=1&seed=1' && after.phase === 'run' && after.tick === before.tick && after.attempt === 0 && after.override === true,
      JSON.stringify({ url0, before, after }));
    // A link to 1.2, then the student plays 1.4, then the page reloads: 1.4 comes back, not a fresh 1.2.
    await page.goto('http://localhost:' + port + '/?test=1&seed=2&level=1.2');
    await page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test);
    await page.evaluate(() => { window.__btc.app.enterHome(); window.__btc.app.enterLevel('1.1'); });
    while ((await L(page, 'phase')) === 'intro') await L(page, 'next');
    await L(page, 'next');
    await L(page, 'answer', 'p1', 'ok'); await L(page, 'answer', 'p2', 'ok');
    await L(page, 'runTicks', 120);
    await page.evaluate(() => window.__btc.app.autosaveNow());
    await page.reload();
    await page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test);
    const again = await R(page, "{ level: window.__btc.app.test.level.runner().def.id, phase: window.__btc.app.test.level.phase(), tick: window.__btc.cell.tick }");
    check('LV-14 after ?level=1.2 the student plays 1.1; a reload resumes 1.1 at its tick', again.level === '1.1' && again.phase === 'run' && again.tick === 120, JSON.stringify(again));
    check('LV-14 no console errors', s.errors.length === 0, s.errors.join(' | '));
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

module.exports = { run, openLevel, layoutProblems };
