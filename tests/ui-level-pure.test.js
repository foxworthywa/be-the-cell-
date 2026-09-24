// L-13 (LEVELS §12.1, extended in a file of its own): the pure parts of the
// level screens. HUD texts (the short counter under 400 px, the Continue
// wording), the home list model, the code box's line breaks, the completion
// score lines, and the Prologue's line drawings (≤ 4 KB, labelled, palette
// tokens only).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const APP = path.join(__dirname, '..', 'src', 'app');
const req = (n) => require(path.join(APP, n + '.js'));
const Hud = req('btc-hud'), Home = req('btc-home'), LevelUI = req('btc-level-ui'), Prologue = req('btc-prologue');
const C = req('btc-content');
const LV = require('../src/game/btc-levels.js');
const PROG = require('../src/game/btc-progress.js');
const CODE = require('../src/game/btc-code.js');
const stub = require('./fixtures/btc-level-stub.js');
const P = LV.validate(require('../src/levels/btc-level-p.js'));

test('L-13: HUD texts: the counter\'s short form under 400 px; words, not colour, when the run is over', () => {
  const model = { goal: { text: 'LacY 312 / 500', progress: 0.624, done: false }, timer: { text: '4 min 30 s left' }, counter: { text: 'mRNAs 18 / 40', short: '18 / 40' } };
  const wide = Hud.texts(model, 1280, null), narrow = Hud.texts(model, 360, null);
  assert.equal(wide.counter, 'mRNAs 18 / 40');
  assert.equal(narrow.counter, '18 / 40');
  assert.equal(Hud.texts(model, 400, null).counter, 'mRNAs 18 / 40', '400 px is not narrow');
  assert.equal(wide.goal, 'LacY 312 / 500');
  assert.equal(wide.progress, 0.624);
  assert.equal(wide.timer, '4 min 30 s left');
  assert.equal(wide.label, 'Goal: LacY 312 / 500. Open the task card.');
  const met = Hud.texts(model, 360, 'met');
  assert.equal(met.goal, C.game.hud.goalMet);
  assert.equal(met.progress, null, 'no bar on the Continue button');
  assert.equal(Hud.texts(model, 360, 'continue').goal, C.game.hud.continue);
  assert.equal(Hud.texts({ goal: { text: 'x', progress: 7 } }, 360, null).progress, 1, 'progress is clamped');
  assert.deepEqual(Hud.texts(null, 360, null), { goal: '', progress: null, gauge: null, timer: '', counter: '', label: 'Goal: . Open the task card.' });
  // A goal's short form under 400 px (1.4), and a band gauge instead of a bar: band and value as shares of the gauge's range.
  const band = { goal: { text: 'LacY 412 · band 270–520 · held 4 of 15 min', short: 'LacY 412 · held 4 of 15', progress: null, gauge: { lo: 270, hi: 520, max: 780, value: 390 } } };
  assert.equal(Hud.texts(band, 360, null).goal, 'LacY 412 · held 4 of 15');
  assert.equal(Hud.texts(band, 1280, null).goal, 'LacY 412 · band 270–520 · held 4 of 15 min');
  assert.deepEqual(Hud.texts(band, 360, null).gauge, { lo: 270 / 780, hi: 520 / 780, value: 0.5 });
  assert.equal(Hud.texts(band, 360, 'met').gauge, null, 'no gauge on the Continue button');
  assert.equal(Hud.texts({ goal: { text: 'x', gauge: { lo: 1, hi: 2, max: 3, value: 99 } } }, 360, null).gauge.value, 1, 'the value is clamped');
});

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}

test('L-13: the home list model: names, challenges, status chips, minutes, Continue and the card count', () => {
  const T = LV.validate(stub.playable());
  const p = PROG.create({ storage: memStorage(), today: () => '2026-09-24', randomU32: () => 9 });
  let m = Home.model([P, T], p);
  assert.deepEqual(m.rows.map((r) => [r.name, r.status]), [['Prologue · You, right now', 'new'], ['T · Test bench', 'new']]);
  assert.equal(m.rows[0].challenge, 'From you to one cell, then to a bacterium.');
  assert.equal(m.rows[0].minutes, 'about 3 min');
  assert.equal(m.continueRow, null);
  p.open('T', p.attemptFor('T'));
  m = Home.model([P, T], p);
  assert.equal(m.rows[1].status, 'in progress');
  assert.deepEqual(m.continueRow, { id: 'T', text: 'Continue: T · Test bench' });
  p.complete('T', { attempt: 1, total: 72, X: 0, code: 'c', override: false });
  p.complete('P', { attempt: 1, total: null, X: 0, code: 'p', override: false });
  p.addCards(['ribosome', 'mrna']);
  m = Home.model([P, T], p);
  assert.equal(m.rows[0].status, 'done');
  assert.equal(m.rows[1].status, 'done · 72');
  assert.equal(m.rows[1].expert, false);
  assert.equal(m.cards, 2);
  p.complete('T', { attempt: 2, total: 95, X: 1, code: 'd', override: false });
  m = Home.model([P, T], p);
  assert.equal(m.rows[1].status, 'done · 95', 'the latest total');
  assert.equal(m.rows[1].expertText, 'Expert ✓', 'every Expert objective met in some attempt');
  const idx = Home.cardIndex([P, T]);
  assert.deepEqual(idx['no-nucleus'], { id: 'no-nucleus', title: 'No nucleus', stamp: 'bacteria', level: 'P' });
});

test('L-13: the code box breaks only after hyphens, into lines that fit', () => {
  const code = CODE.encode({ level: '12', variantSeed: CODE.decodeSeed('7K2Q9C'), G: 1, E: 100, P: 75, D: [1, 2], X: 1, flags: 2,
    attempt: 1, runs: 2, engine: '1.1.0', content: 1, digest: '3f9a0b' });
  for (const per of [16, 20, 28, 34, 60, 80]) {
    const lines = LevelUI.codeLines(code, per);
    assert.equal(lines.join(''), code, 'nothing lost at ' + per);
    for (const l of lines.slice(0, -1)) assert.ok(l.endsWith('-'), 'breaks after a hyphen: ' + l);
    for (const l of lines) assert.ok(l.length <= Math.max(per, 17), l.length + ' > ' + per + ': ' + l);
  }
  assert.deepEqual(LevelUI.codeLines(code, 34).length, 2, 'two lines at a phone\'s width, as in §5.9');
  assert.equal(LevelUI.codeLines(code, 80).length, 1);
});

test('L-13: completion score lines use the words of §6.1', () => {
  assert.deepEqual(LevelUI.scoreLines({ G: 1, E: 1, P: 0.75, D: [1, 2], X: 1, total: 85 }), [
    'Goal met · Efficiency 100 · Prediction 75', 'Debrief 1 of 2 right first time · Expert 1', 'Total 85']);
  assert.deepEqual(LevelUI.scoreLines({ G: 0, E: 0, P: 0.5, D: [0, 2], X: 0, total: 10 })[0], 'Goal not met · Efficiency 0 · Prediction 50');
  assert.deepEqual(LevelUI.scoreLines({ G: 1, E: null, P: null, D: [1, 1], X: 0, total: null }), ['Not scored']);
  // With the level's number of Expert objectives, the objectives met are counted (X = 3 is both of 2).
  assert.equal(LevelUI.scoreLines({ G: 1, E: 1, P: 1, D: [1, 2], X: 3, total: 90 }, 2)[1], 'Debrief 1 of 2 right first time · Expert 2 of 2');
  assert.equal(LevelUI.scoreLines({ G: 1, E: 1, P: 1, D: [1, 2], X: 0, total: 80 }, 0)[1], 'Debrief 1 of 2 right first time');
});

test('the Prologue drawings: ≤ 4 KB each, labelled from TEXT, with a scale bar, drawn in palette tokens', () => {
  const T = P.text;
  const pictures = P.scenes.filter((s) => !s.live).map((s) => s.picture).filter((x, i, a) => a.indexOf(x) === i);
  assert.deepEqual(pictures, ['body', 'pancreas', 'betaCell', 'ribosome']);
  for (const pic of pictures) {
    const svg = Prologue.svg(pic, T);
    assert.ok(Buffer.byteLength(svg) <= 4096, pic + ' is ' + Buffer.byteLength(svg) + ' bytes');
    assert.ok(/^<svg class="pl-svg" viewBox="0 0 \d+ \d+"/.test(svg), pic);
    assert.ok(!/#[0-9a-f]{3,6}\b|rgb\(/i.test(svg), pic + ' uses a hard-coded colour');
    assert.ok(/class="pl-sb"/.test(svg), pic + ' has a scale bar');
    assert.ok(T.alt[pic], pic + ' has alt text');
  }
  assert.ok(Prologue.svg('body', T).indexOf('>1 m<') > 0);
  const pan = Prologue.svg('pancreas', T);
  assert.ok(pan.indexOf('>10 cm<') > 0 && pan.indexOf('>100 µm<') > 0, 'pancreas, then an islet: two scale bars');
  assert.ok(pan.indexOf('>' + T.labels.islet + '<') > 0);
  assert.ok(Prologue.svg('betaCell', T).indexOf('>' + T.labels.insulinGene + '<') > 0);
  const rib = Prologue.svg('ribosome', T);
  for (const k of ['ribosome', 'mRNA', 'chain']) assert.ok(rib.indexOf('>' + T.labels[k] + '<') > 0, k);
  assert.ok(rib.indexOf('>30 nm<') > 0);
  // Labels are escaped.
  assert.ok(Prologue.svg('body', { labels: { pancreas: 'a<b' }, scale: { m1: '1 m' } }).indexOf('a&lt;b') > 0);
});
