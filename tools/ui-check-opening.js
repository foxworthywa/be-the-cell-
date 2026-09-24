// Browser checks for the opening (docs/PROLOGUE.md §10.2, BO-1 … BO-4), called by tools/ui-check.js: part 1
// and part 2 played by taps, as a student would, from the home screen to their completion screens, at
// 360 × 740 (touch); part 1's key screens again at 1280 × 800 (no touch) and 375 × 553. Every screen: no
// console errors, no request off the origin, no page scroll, no overflow, touch targets ≥ 44 px (touch).
// Screenshots go to test-artifacts/opening/.
'use strict';
const path = require('path');
const fs = require('fs');
const { openLevel, layoutProblems } = require('./ui-check-levels.js');

const paint = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const R = (page, expr) => page.evaluate(new Function('return (' + expr + ');'));
const info = (page) => R(page, 'window.__btc.app.test.level.scene.info()');
const phase = (page) => R(page, 'window.__btc.app.test.level.phase()');

async function run(browser, port, OUT, check) {
  fs.mkdirSync(OUT, { recursive: true });
  const screens = [];
  const shotter = (s, part, problems) => async (name) => {
    await paint(s.page);
    await s.page.waitForTimeout(150);
    const f = `${part}-${s.tag}-${String(screens.length + 1).padStart(3, '0')}-${name}.png`;
    await s.page.screenshot({ path: path.join(OUT, f) });
    screens.push(f);
    for (const p of await layoutProblems(s.page, s.touch)) problems.push(name + ': ' + p);
  };
  const finish = (s, id, problems) => {
    check(id + ' ' + s.tag + ' layout (no scroll, no overflow' + (s.touch ? ', targets ≥ 44 px' : '') + ')', problems.length === 0, problems.slice(0, 6).join(' | '));
    check(id + ' ' + s.tag + ' no console errors, no request leaves the origin', s.errors.length === 0 && s.offsite.length === 0, s.errors.concat(s.offsite).join(' | '));
  };
  const tapper = (s) => async (sel) => {
    const l = s.page.locator(sel).first();
    if (s.touch) await l.tap(); else await l.click();
    await paint(s.page);
  };

  // --- BO-1 … BO-3: part 1 by taps ------------------------------------------------------------------------------
  for (const vp of [[360, 740], [1280, 800], [375, 553]]) {
    const touch = vp[0] < 1000, full = vp[0] === 360;
    const s = await openLevel(browser, port, vp, '?test=1&seed=1', { touch });
    const page = s.page, probs = [], shot = shotter(s, 'P1', probs), tap = tapper(s);
    await tap('.level-row[data-level="P"]');
    const rungs = [], bars = [];
    let backOk = null, ringOk = null, railOk = null, fill = null, decode = null, table = null, skips = 0;
    const sees = [];
    for (let guard = 0; guard < 160; guard++) {
      if ((await phase(page)) !== 'scenes') break;
      const i = await info(page);
      // PM6: on a first play there is no Skip (it would skip the teaching); it comes once the part is finished.
      skips += await page.locator('[data-action="skip"]:visible, .lv-skip:visible').count();
      if (i.scene.rung && rungs[rungs.length - 1] !== i.scene.rung) {
        rungs.push(i.scene.rung);
        // Its scale bar is drawn and inside the viewport, above the sheet.
        bars.push(await page.evaluate(() => {
          const sb = document.querySelector('.pl-art .pl-sb'), sheet = document.querySelector('.sheet');
          if (!sb) return 'none';
          const r = sb.getBoundingClientRect(), top = sheet ? sheet.getBoundingClientRect().top : innerHeight;
          // In view, and not under the sheet (a bottom sheet on a phone, a side card on a laptop).
          const sr = sheet ? sheet.getBoundingClientRect() : null;
          const under = sr && r.right > sr.left && r.left < sr.right && r.bottom > sr.top && r.top < sr.bottom;
          return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && !under ? 'ok' : 'out ' + [r.left, r.top, r.right, r.bottom, top].map(Math.round).join(',');
        }));
        if (full || i.scene.rung === 'you' || i.scene.rung === 'letters') await shot('rung-' + i.scene.rung);
      }
      // BO-1: Closer by the drawing's ring, then Back, on the pancreas; the rail's sheet once.
      if (i.scene.id === 'a1' && i.lastLine && backOk === null) {
        // The ring pulses (never "stable" to Playwright): a tap at its centre, as a finger would.
        const rb = await page.locator('[data-action="rung-ring"]').first().boundingBox();
        if (touch) await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2); else await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
        await paint(page);
        const at = (await info(page)).scene.id;
        await tap('[data-action="rung-back"]');
        backOk = at === 'a2' && (await info(page)).scene.id === 'a1';
        ringOk = at === 'a2';
      }
      if (i.scene.id === 'a3' && i.lastLine && railOk === null) {
        await tap('[data-action="rung-rail"]');
        railOk = await page.evaluate(() => document.querySelectorAll('.pl-rail-row').length);
        if (full) await shot('rail-sheet');
        await page.keyboard.press('Escape'); await paint(page);
      }
      if (i.guess && !i.guess.seen) {
        const n = await page.locator('.lv-option').count();
        await tap('.lv-option >> nth=' + (n - 1));
        if (full) await shot(i.scene.id + '-guess');
        await tap('[data-action="guess-see"]');
        // PB3: "See what happens" goes on to the scene that shows it (D1 to D2, F4 to F5), never back to the same still.
        const show = i.scene.guess && i.scene.guess.showAt;
        if (show && show !== i.scene.id) {
          const now = (await info(page)).scene.id;
          sees.push(i.scene.id + '>' + now + (now === show ? ':ok' : ':no'));
          if (full) await shot(now + '-after-see');
        }
        continue;
      }
      const a = i.activity;
      if (a && a.open && !a.done) {
        if (a.kind === 'copy') {
          // BO-2: five letters by the keys, then T for the template's A: the U sentence; no run before six letters.
          const exp = i.scene.activity.expect;
          for (let k = 0; k < 5; k++) await tap('.pl-key[data-key="' + exp[k] + '"]');
          const runBefore = await page.locator('[data-action="activity-run"]').count();
          await tap('.pl-key[data-key="T"]');
          const fb = await page.evaluate(() => (document.querySelector('.pl-actfb') || {}).textContent || '');
          const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.pl-key')).map((b) => b.getBoundingClientRect()).every((r) => r.width >= 44 && r.height >= 44));
          fill = { runBefore, fb, sixth: exp[5], keys };
          if (full || !touch) await shot('c4-sixth-letter');
          await tap('[data-action="activity-run"]');
          await R(page, 'window.__btc.app.test.level.scene.act({ advance: 1000 })');
          fill.total = (await info(page)).activity.k;
        } else if (a.kind === 'copies') {
          for (let k = 0; k < 3; k++) { await tap('[data-action="copy-again"]'); await page.waitForTimeout(250); }
          await R(page, 'window.__btc.app.test.level.scene.act({ advance: 1000 })');
        } else if (a.kind === 'read') {
          // BO-3: six rows ≥ 48 px; the full table lists 64 codons; the chain ends at 110.
          const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.pl-row')).map((b) => Math.round(b.getBoundingClientRect().height)));
          await tap('[data-action="full-table"]');
          table = await page.evaluate(() => document.querySelectorAll('.pl-table .pl-cell').length);
          if (full) await shot('e3-full-table');
          await page.keyboard.press('Escape'); await paint(page);
          const codons = i.scene.activity.codons, spec = i.scene.activity.rows;
          for (const c of codons) await tap('.pl-row[data-row="' + spec.findIndex((x) => x.codon === c) + '"]');
          if (full || !touch) await shot('e3-decoded');
          await tap('[data-action="activity-run"]');
          await R(page, 'window.__btc.app.test.level.scene.act({ advance: 1000 })');
          decode = { rows, chain: await R(page, "window.__btc.app.test.level.runner().def.facts.aminoAcids") };
        } else if (a.kind === 'show') {
          await page.waitForTimeout(1600);
        }
        continue;
      }
      if (full && i.lastLine && ['b1', 'c5', 'd2', 'e4', 'f1', 'f3', 'f5', 'f7'].includes(i.scene.id)) await shot(i.scene.id);
      await tap('.lv-next');
    }
    await page.waitForTimeout(300);
    const done = await page.evaluate(() => ({
      phase: window.__btc.app.level && window.__btc.app.level.runner.phase, code: window.__btc.app.level && window.__btc.app.level.runner.code,
      next: (document.querySelector('[data-action="next-level"]') || {}).textContent || '',
      simplified: !!document.querySelector('[data-action="simplified"]'),
      stored: ((JSON.parse(localStorage.getItem('btc.progress.v1')).levels.P || {}).results || []).length,
    }));
    await shot('complete');
    const tag = 'BO-1 ' + s.tag;
    check(tag + ' part 1: the zoom ladder, you to the letters, one rung each, with its scale bar in view',
      rungs.join(' ') === 'you pancreas islet betaCell nucleus chromosome stretch helix letters' && bars.every((b) => b === 'ok'), rungs.join(' ') + ' / ' + bars.join(' '));
    check(tag + ' part 1: "Look closer" on the drawing steps down one rung and Back steps up; the rail lists the rungs visited', ringOk && backOk && railOk >= 3, [ringOk, backOk, railOk].join('/'));
    check('BO-2 ' + s.tag + ' the copy: keys ≥ 44 px, no run before six letters, a T for A gets the U sentence, the sixth letter is U, the run ends at 465',
      !!fill && fill.keys && fill.runBefore === 0 && /\bU\b/.test(fill.fb) && fill.sixth === 'U' && fill.total === 465, JSON.stringify(fill));
    check('BO-3 ' + s.tag + ' the codons: six rows ≥ 48 px (44 on a short screen), the full table has 64 codons, the chain is 110 long',
      !!decode && decode.rows.length === 6 && decode.rows.every((h) => h >= (vp[1] < 600 ? 44 : 48)) && table === 64 && decode.chain === 110, JSON.stringify({ decode, table }));
    check('BO-1 ' + s.tag + ' PB3: "See what happens" goes on at once to the scene that shows it (D1 to D2, F4 to F5)',
      sees.length === 2 && sees.every((x) => /:ok$/.test(x)), sees.join(' '));
    check('BO-1 ' + s.tag + ' PM6: no Skip on a first play of part 1', skips === 0, String(skips));
    check(tag + ' part 1 ends on its completion screen: an unscored code, "What is simplified", "Next: Prologue 2"; the result is stored',
      done.phase === 'complete' && /^BTC2-P0-/.test(done.code || '') && /Prologue 2/.test(done.next) && done.simplified && done.stored === 1, JSON.stringify(done));
    finish(s, 'BO-1', probs);
    await s.context.close();
  }

  // --- BO-4: part 2 by taps -------------------------------------------------------------------------------------
  {
    const s = await openLevel(browser, port, [360, 740], '?test=1&seed=1&level=P2', { touch: true });
    const page = s.page, probs = [], shot = shotter(s, 'P2', probs), tap = tapper(s);
    for (let guard = 0; guard < 60 && (await phase(page)) === 'scenes'; guard++) {
      const i = await info(page);
      if (i.lastLine && ['q1', 'q4', 'q7', 's5', 's8'].includes(i.scene.id)) await shot(i.scene.id);
      await tap('.lv-next');
    }
    // The watch: each step's callout; a waiting step runs on the real loop (1 s = 10 s) and stops at its gate.
    const stops = [], pointed = [];
    let h10 = null, h11 = null;
    const toasts = [];
    for (let guard = 0; guard < 120; guard++) {
      if ((await phase(page)) !== 'watch') break;
      const w = await R(page, 'window.__btc.app.test.level.watch.info()');
      if (!w || w.done) break;
      const intro = await R(page, "!!document.querySelector('.guide:not([hidden]) [data-action=\"intro-next\"]')");
      if (intro) { await tap('[data-action="intro-next"]'); continue; }
      if (w.stage === 'guess') { await shot(w.id + '-guess'); await tap('.lv-option >> nth=0'); await tap('[data-action="guess-see"]'); continue; }
      if (w.stage === 'act') {
        await shot(w.id + '-act'); await tap('.tb-ctrl .seg[data-key="on"]'); await page.waitForTimeout(300);
        // The switch was taken: no rejection toast.
        const t = await R(page, "(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.textContent : ''; })()");
        if (t) toasts.push(w.id + ': ' + t);
        continue;
      }
      if (w.stage === 'until' || w.stage === 'wait') {
        if (w.id === 'h4' || w.id === 'h7') {
          // The real loop: Run, then wait for the loop to stop by itself at the gate's tick.
          // Run (the cell runs on by itself when the student had it running before).
          if (await page.locator('[data-action="watch-run"]').count()) await tap('[data-action="watch-run"]');
          await page.waitForFunction(() => !window.__btc.app.isRunning(), null, { timeout: 60000 });
          const st = await R(page, "{ tick: window.__btc.cell.tick, gate: window.__btc.app.test.level.runner().watch.gateTick['" + w.id + ":until'], id: window.__btc.app.test.level.watch.info().id }");
          stops.push(w.id + ':' + (st.tick === st.gate && st.id === w.id));
        } else {
          // PM4: H11 says what the cell is doing while it waits (no silent "Watching the cell…").
          if (w.id === 'h11' && !h11) { h11 = await R(page, "{ speed: window.__btc.app.speed(), text: (document.querySelector('.guide:not([hidden])') || {}).textContent || '' }"); await shot('h11-wait'); }
          await R(page, 'window.__btc.app.test.level.watch.untilGate(40000)');
        }
        await page.waitForTimeout(250);
        continue;
      }
      // PM4: at H10 the watch speeds up to 1 s = 1 min by itself and says so.
      if (w.id === 'h10' && !h10) h10 = await R(page, "{ speed: window.__btc.app.speed(), text: (document.querySelector('.guide:not([hidden])') || {}).textContent || '' }");
      // The pointer's ring: on its element (a counter, the switch, the energy bar, the legend), or on the cell view.
      if (w.point) {
        pointed.push(w.id + ':' + await page.evaluate((pt) => {
          const ring = document.querySelector('.guide-ring');
          if (!ring || ring.hidden) return 'none';
          const r = ring.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const sel = window.__btc.BTC.tiers.TARGETS[pt], el = sel ? document.querySelector(sel) : document.getElementById('stage');
          if (!el) return 'no ' + pt;
          const b = el.getBoundingClientRect();
          return cx >= b.left - 1 && cx <= b.right + 1 && cy >= b.top - 1 && cy <= b.bottom + 1 ? 'ok' : 'off ' + pt;
        }, w.point));
      }
      if (['h2', 'h4', 'h9', 'h11', 'h14'].includes(w.id)) await shot(w.id);
      await tap('[data-action="watch-next"]');
    }
    await page.waitForTimeout(300);
    const done = await page.evaluate(() => ({ phase: window.__btc.app.level && window.__btc.app.level.runner.phase, code: window.__btc.app.level && window.__btc.app.level.runner.code,
      next: (document.querySelector('[data-action="next-level"]') || {}).textContent || '' }));
    await shot('complete');
    check('BO-4 ' + s.tag + ' part 2: on the real loop at 1 s = 10 s, the cell stops by itself at the tick of each gate (H4, H7)', stops.length === 2 && stops.every((x) => /:true$/.test(x)), stops.join(' '));
    check('BO-4 ' + s.tag + ' part 2: the pointer\'s ring is on the element (or the cell) each step is about', pointed.length >= 8 && pointed.every((x) => /:ok$/.test(x)), pointed.join(' '));
    check('BO-4 ' + s.tag + ' part 2: the switch answers the tap with no toast', toasts.length === 0, toasts.join(' | '));
    check('BO-4 ' + s.tag + ' PM4: at H10 the watch speeds up to 1 s = 1 min and says so; H11 waits with its own line',
      !!h10 && h10.speed === 60 && /Sped up: 1 s = 1 min/.test(h10.text) && !!h11 && h11.speed === 60 && /More transporters are being built/.test(h11.text), JSON.stringify({ h10, h11 }).slice(0, 400));
    check('BO-4 ' + s.tag + ' part 2 ends on its completion screen: an unscored code, "Next: level 1.1"', done.phase === 'complete' && /^BTC2-P2-/.test(done.code || '') && /1\.1/.test(done.next), JSON.stringify(done));
    finish(s, 'BO-4', probs);
    await s.context.close();
  }
  return screens;
}

module.exports = { run };
