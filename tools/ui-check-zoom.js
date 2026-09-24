// Browser checks for the close-ups and the zoom control (docs/PROLOGUE.md §3, §10.2 BZ-1 … BZ-5),
// called by tools/ui-check.js.
//
//   BZ-2  Gene zoom: ptsG (its copies, ribosomes and polymerases drawn from the view), lacY ×4 (many
//         copies: "showing d of m mRNAs"), lacZ (a long gene: the 200 nm scale bar), a gene off ("No copies")
//   BZ-3  Protein zoom: PtsG with lactose outside (it bounces off; the rate line and the slow factor),
//         LacY with lactose (working), the flagellum protein (idle, with its reason)
//   BZ-4  the control: segments, the tap chip's "Look closer ›", pinch out and in (touch), + and − (laptop)
//   BZ-5  375 × 553: every zoom keeps the canvas ≥ 220 px
//
// Every screen: no console errors, no request off the origin, no page scroll, and (touch) the zoom's
// buttons ≥ 44 × 44. Screenshots go to test-artifacts/zoom/.
'use strict';
const path = require('path');
const fs = require('fs');

const paint = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(browser, port, vp, touch) {
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
  await page.goto('http://localhost:' + port + '/?test=1&seed=1&lab=1');
  await page.waitForFunction(() => window.__btc && window.__btc.app && window.__btc.app.test && window.__btc.app.views.zoom);
  if (touch) await page.locator('[data-tab="cell"]:visible').first().click().catch(() => {});
  await paint(page);
  return { page, context, errors, offsite, tag: vp.join('x') };
}

/** Sets the lab cell up, focuses a gene and shows a zoom (UI state only; the cell is driven by its commands). */
function show(page, o) {
  return page.evaluate((x) => {
    const a = window.__btc.app;
    for (const c of x.cmds || []) a.cell.command(c);
    if (x.ticks) a.test.runTicks(x.ticks);
    a.setFocus(x.gene);
    a.views.zoom.set(x.zoom, 'segment');
    a.test.runTicks(1);
    return a.views.zoom.stats();
  }, o);
}

async function layout(page, touch) {
  return page.evaluate((t) => {
    const out = [], d = document.documentElement;
    if (d.scrollWidth > innerWidth || d.scrollHeight > innerHeight) out.push('page scrolls');
    const st = document.getElementById('stage').getBoundingClientRect();
    if (st.height < 220) out.push('canvas ' + Math.round(st.height) + ' px');
    if (t) for (const b of document.querySelectorAll('.zoom-seg button, .zoom-act, .zoom-extra')) {
      if (b.hidden || !b.offsetParent) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push('small ' + b.textContent + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    }
    return out;
  }, touch);
}

async function run(browser, port, outDir, check) {
  fs.mkdirSync(outDir, { recursive: true });
  const shots = [];
  const snap = async (page, name) => { await page.waitForTimeout(300); await paint(page); const f = path.join(outDir, name + '.png'); await page.screenshot({ path: f }); shots.push(f); };
  for (const [vp, touch] of [[[360, 740], true], [[1280, 800], false]]) {
    const { page, context, errors, offsite, tag } = await open(browser, port, vp, touch);
    const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : ''; }, sel);
    // BZ-2 Gene zoom.
    let s = await show(page, { gene: 'ptsG', zoom: 'gene', ticks: 60 });
    const v = await page.evaluate(() => { const g = window.__btc.cell.observe().geneById.ptsG; return { m: g.mRNA, n: g.nascent, R: Math.round(g.ribosomes) }; });
    check('BZ-2 ' + tag + ' Gene zoom of ptsG: copies, polymerases and ribosomes from the view; under the glyph cap',
      s.level === 'gene' && s.gene.m === v.m && s.gene.n === v.n && s.gene.R === v.R && s.gene.d + s.gene.moreCopies === v.m && s.gene.total <= 600, JSON.stringify(s.gene));
    await snap(page, tag + '-gene-ptsG');
    s = await show(page, { gene: 'lacY', zoom: 'gene', ticks: 1800, cmds: [{ type: 'setPromoter', gene: 'lacY', level: 4 }] });
    const sum = await text('.zoom-summary');
    check('BZ-2 ' + tag + ' lacY ×4: many copies, the summary says how many are drawn', s.gene.m > s.gene.d && /^showing \d+ of [\d,]+ mRNAs$/.test(sum), sum);
    await snap(page, tag + '-gene-lacY');
    s = await show(page, { gene: 'lacZ', zoom: 'gene', cmds: [{ type: 'setPromoter', gene: 'lacZ', level: 2 }], ticks: 600 });
    check('BZ-2 ' + tag + ' lacZ, a long gene: the scale bar is a round length', [100, 200].indexOf(s.gene.scaleNm) >= 0 && /nm$/.test(await text('.zoom-scale')), s.gene.scaleNm + ' nm');
    await snap(page, tag + '-gene-lacZ');
    s = await show(page, { gene: 'fliC', zoom: 'gene' });
    check('BZ-2 ' + tag + ' a gene with no copies shows its DNA only', s.gene.m + s.gene.n === 0, JSON.stringify(s.gene));
    // BZ-3 Protein zoom.
    s = await show(page, { gene: 'ptsG', zoom: 'protein', cmds: [{ type: 'setMedium', lactose_mM: 5 }], ticks: 30 });
    const cap = await text('.zoom-caption');
    check('BZ-3 ' + tag + ' PtsG at work: the rate, the slow factor, lactose bouncing off', s.protein.working && s.protein.nonfit && /^Carries about [\d.,]+ glucose a second\./.test(cap) && /slower/.test(cap), cap);
    await snap(page, tag + '-protein-ptsG');
    s = await show(page, { gene: 'lacY', zoom: 'protein', cmds: [{ type: 'setMedium', glucose_mM: 0 }], ticks: 600 });
    check('BZ-3 ' + tag + ' LacY with lactose outside carries it', s.protein.working, JSON.stringify(s.protein));
    await snap(page, tag + '-protein-lacY');
    s = await show(page, { gene: 'fliC', zoom: 'protein', cmds: [{ type: 'setPromoter', gene: 'fliC', level: 2 }], ticks: 900 });
    check('BZ-3 ' + tag + ' the flagellum protein is idle and says why', !s.protein.working && s.protein.idle === 'fliC' && /no work/.test(await text('.zoom-caption')), s.protein.idle);
    await snap(page, tag + '-protein-fliC');
    // BZ-4 The control.
    await page.evaluate(() => window.__btc.app.views.zoom.set('cell', 'segment'));
    await page.locator('.zoom-seg button[data-zoom="gene"]').click();
    check('BZ-4 ' + tag + ' the Gene segment opens the Gene zoom', (await page.evaluate(() => window.__btc.app.views.zoom.get())) === 'gene');
    if (touch) {
      await page.evaluate(() => { const a = window.__btc.app; a.views.zoom.set('cell'); a.setFocus('lacY'); a.test.runTicks(1); });
      await paint(page);
      const pt = await page.evaluate(() => {
        const cv = window.__btc.app.views.cellView, K = window.__btc.BTC.CellView.KINDS, r = cv.canvas.getBoundingClientRect();
        for (let i = 0; i < cv.n; i++) if (cv.bkind[i] === K.MRNA_FOCUS) return { x: r.left + cv.bx[i], y: r.top + cv.by[i] };
        return null;
      });
      if (pt) await page.touchscreen.tap(pt.x, pt.y);
      await paint(page);
      const closer = await page.evaluate(() => { const b = document.querySelector('.zoom-act'); return !b.hidden; });
      if (closer) await page.locator('.zoom-act').click();
      check('BZ-4 ' + tag + ' a strand\'s tap chip offers "Look closer ›", which opens the Gene zoom', closer && (await page.evaluate(() => window.__btc.app.views.zoom.get())) === 'gene', String(!!pt));
      const cdp = await context.newCDPSession(page);
      const box = await page.locator('#stage').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const pinch = async (d0, d1) => {
        const tp = (d) => [{ x: cx - d, y: cy, id: 0 }, { x: cx + d, y: cy, id: 1 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(d0) });
        for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(d0 + ((d1 - d0) * k) / 6) });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await paint(page);
        return page.evaluate(() => window.__btc.app.views.zoom.get());
      };
      const out1 = await pinch(40, 90), in1 = await pinch(90, 30);
      check('BZ-4 ' + tag + ' pinch out steps one level closer, pinch in one level out', out1 === 'protein' && in1 === 'gene', out1 + ' then ' + in1);
    } else {
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__btc.app.views.zoom.set('cell'); });
      await page.keyboard.press('+');
      const a = await page.evaluate(() => window.__btc.app.views.zoom.get());
      await page.keyboard.press('-');
      const b = await page.evaluate(() => window.__btc.app.views.zoom.get());
      check('BZ-4 ' + tag + ' + and − step the zoom', a === 'gene' && b === 'cell', a + ' then ' + b);
    }
    const lay = await layout(page, touch);
    check('BZ ' + tag + ' layout (no scroll, canvas ≥ 220 px, zoom targets ≥ 44 px)', lay.length === 0, lay.join('; '));
    check('BZ ' + tag + ' no console errors, no request leaves the origin', errors.length === 0 && offsite.length === 0, errors.concat(offsite).join(' | '));
    await context.close();
  }
  // BZ-5 A short phone screen.
  const { page, context, errors, tag } = await open(browser, port, [375, 553], true);
  const sizes = [];
  for (const z of ['cell', 'gene', 'protein']) {
    await show(page, { gene: 'ptsG', zoom: z });
    await paint(page);
    sizes.push(z + ' ' + Math.round((await page.locator('#stage').boundingBox()).height));
  }
  await snap(page, tag + '-protein-ptsG');
  check('BZ-5 375x553 every zoom keeps the canvas ≥ 220 px', sizes.every((x) => Number(x.split(' ')[1]) >= 220) && errors.length === 0, sizes.join(', '));
  await context.close();
  return shots;
}

module.exports = { run };
