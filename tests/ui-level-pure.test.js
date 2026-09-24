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
  assert.equal(Hud.texts(model, 600, null).counter, 'mRNAs 18 / 40', '600 px is wide enough for the long counter');
  // 400–599 px: the goal keeps its words; the timer and counter take their short forms, so the goal chip is not squeezed.
  const mid = Hud.texts(Object.assign({}, model, { goal: { text: '312 / 500 lactose transporters', short: 'LacY 312/500', progress: 0.6 },
    timer: { text: 'due in 9 min 30 s', short: 'due in 10 min' } }), 480, null);
  assert.deepEqual([mid.goal, mid.timer, mid.counter], ['312 / 500 lactose transporters', 'due in 10 min', '18 / 40']);
  assert.equal(wide.goal, 'LacY 312 / 500');
  assert.equal(wide.progress, 0.624);
  assert.equal(wide.timer, '4 min 30 s left');
  assert.equal(wide.label, 'Goal: LacY 312 / 500. Open the task card.');
  const met = Hud.texts(model, 360, 'met');
  assert.equal(met.goal, C.game.hud.goalMet);
  assert.equal(met.progress, null, 'no bar on the Continue button');
  assert.equal(Hud.texts(model, 360, 'continue').goal, C.game.hud.continue);
  assert.equal(Hud.texts({ goal: { text: 'x', progress: 7 } }, 360, null).progress, 1, 'progress is clamped');
  assert.deepEqual(Hud.texts(null, 360, null), { action: null, sub: '', goal: '', progress: null, gauge: null, timer: '', counter: '', over: false, label: 'Goal: . Open the task card.' });
  // Over par: the counter is marked (and its long form says so in words).
  const over = { counter: { text: 'mRNAs 35 / 32 · over par', short: '35/32 mRNA', over: true } };
  assert.deepEqual([Hud.texts(over, 360, null).counter, Hud.texts(over, 360, null).over], ['35/32 mRNA', true]);
  assert.equal(Hud.texts(over, 1280, null).counter, 'mRNAs 35 / 32 · over par');
  // 1.7: an action button ("Run to the end") takes the counter's place under 400 px; while it runs it shows its progress.
  const act = Object.assign({}, model, { action: { id: 'runToEnd', text: 'Run to the end', short: 'To the end' }, goal: Object.assign({ sub: 'Next change: unknown' }, model.goal) });
  assert.deepEqual([Hud.texts(act, 360, null).action.text, Hud.texts(act, 360, null).counter], ['To the end', '']);
  assert.deepEqual([Hud.texts(act, 1280, null).action.text, Hud.texts(act, 1280, null).counter, Hud.texts(act, 1280, null).sub], ['Run to the end', 'mRNAs 18 / 40', 'Next change: unknown']);
  assert.equal(Hud.texts(act, 360, null).sub, '', 'the second line only in wide layouts');
  const running = Hud.texts({ action: { id: 'runToEnd', text: 'Run to the end', progress: 45 } }, 360, null).action;
  assert.ok(running.running && /45%/.test(running.text) && /Stop/.test(running.text), running.text);
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
  assert.deepEqual(m.rows.map((r) => [r.name, r.status]), [['Prologue 1 · How a gene becomes a machine', 'new'], ['T · Test bench', 'new']]);
  assert.equal(m.rows[0].challenge, 'From you to the letters of your insulin gene, then to a working machine.');
  assert.equal(m.rows[0].minutes, 'about 7 min');
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
  assert.deepEqual(idx['genetic-code'], { id: 'genetic-code', title: 'Genetic code', stamp: 'universal', level: 'P' });
  const P2 = LV.validate(require('../src/levels/btc-level-p2.js'));
  assert.equal(Home.model([P, P2, T], p).rows[1].name, 'Prologue 2 · A cell’s economy');
  assert.deepEqual(Home.cardIndex([P, P2])['no-nucleus'], { id: 'no-nucleus', title: 'No nucleus', stamp: 'bacteria', level: 'P2' });
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

test('L-13: completion score lines use the words of §6.1; predictions are reported but not scored (PROLOGUE §1.4)', () => {
  assert.deepEqual(LevelUI.scoreLines({ G: 1, E: 1, P: 0.75, D: [1, 2], X: 1, total: 85 }), [
    'Goal met · Efficiency 100 · Prediction 75 (not scored)', 'Explain 1 of 2 right first time · Expert 1', 'Total 85']);
  assert.deepEqual(LevelUI.scoreLines({ G: 0, E: 0, P: 0.5, D: [0, 2], X: 0, total: 0 })[0], 'Goal not met · Efficiency 0 · Prediction 50 (not scored)');
  // A level in the new pattern has no prediction score at all.
  assert.deepEqual(LevelUI.scoreLines({ G: 1, E: 0.8, P: null, D: [2, 2], X: 0, total: 95 }, 1), ['Goal met · Efficiency 80', 'Explain 2 of 2 right first time · Expert 0 of 1', 'Total 95']);
  assert.deepEqual(LevelUI.scoreLines({ G: 1, E: null, P: null, D: [1, 1], X: 0, total: null }), ['Not scored']);
  // With the level's number of Expert objectives, the objectives met are counted (X = 3 is both of 2).
  assert.equal(LevelUI.scoreLines({ G: 1, E: 1, P: 1, D: [1, 2], X: 3, total: 90 }, 2)[1], 'Explain 1 of 2 right first time · Expert 2 of 2');
  assert.equal(LevelUI.scoreLines({ G: 1, E: 1, P: 1, D: [1, 2], X: 0, total: 80 }, 0)[1], 'Explain 1 of 2 right first time');
  // A scored level without a watch phase is an older version (it keeps the full lab and says so).
  assert.equal(LevelUI.isOlder(LV.validate(require('../src/levels/btc-level-1-4.js'))), true);
  assert.equal(LevelUI.isOlder(P), false, 'the opening is not scored');
  assert.equal(LevelUI.isOlder(LV.validate(require('./fixtures/level-watch-stub.js'))), false);
});

test('the opening\'s drawings: the zoom ladder\'s rungs with honest scale bars, the sequence pictures from BTC.seq, labels from TEXT, palette tokens only', () => {
  const T = P.text;
  // Part 1's rungs: each drawn with its scale bar, labelled from TEXT; the ladder skips the spools rung.
  const rungs = P.scenes.filter((s) => s.rung).map((s) => s.rung).filter((x, i, a) => a.indexOf(x) === i);
  assert.deepEqual(rungs, ['you', 'pancreas', 'islet', 'betaCell', 'nucleus', 'chromosome', 'stretch', 'helix', 'letters']);
  assert.deepEqual(Prologue.RUNGS, rungs);
  for (const id of rungs) {
    const out = { svg: Prologue.svg(id, T) };
    if (id !== 'letters') assert.ok(Array.isArray(Prologue.ringOf(id, T)), id + ': where "Look closer" sits (the letters are the last rung)');
    assert.ok(/^<svg class="pl-svg" viewBox="0 0 \d+ \d+"/.test(out.svg), id);
    assert.ok(Buffer.byteLength(out.svg) <= 16384, id + ' is ' + Buffer.byteLength(out.svg) + ' bytes');
    assert.ok(!/#[0-9a-f]{3,6}\b|rgb\(/i.test(out.svg), id + ' uses a hard-coded colour');
    assert.ok(/class="pl-sb"/.test(out.svg), id + ' has a scale bar');
    assert.ok(T.alt[id], id + ' has alt text');
  }
  // The sequence pictures (BTC.SeqScene) and part 2's: every scene's picture draws, in palette tokens, with its words.
  const SS = require('../src/app/btc-seqscene.js');
  const P2 = LV.validate(require('../src/levels/btc-level-p2.js'));
  for (const def of [P, P2]) {
    for (const sc of def.scenes) {
      const kind = sc.picture || (sc.activity && sc.activity.kind);
      if (!kind || sc.rung || kind === 'pairs' || kind === 'cards') continue;
      const svg = SS.svg(kind, { step: sc.step || 0 }, def.text.labels || {});
      assert.ok(/^<svg class="pl-svg"/.test(svg), def.id + ' ' + sc.id + ' ' + kind);
      assert.ok(!/#[0-9a-f]{3,6}\b|rgb\(/i.test(svg), def.id + ' ' + sc.id + ' uses a hard-coded colour');
      assert.ok(!/undefined|NaN/.test(svg), def.id + ' ' + sc.id + ' ' + kind + ' has an undefined word or number');
    }
  }
  // The first letters shown are the insulin gene's own (computed, never typed).
  const SEQ = require('../src/shared/btc-seq.js'), DATA = require('../src/shared/btc-seqdata.js');
  const c4 = P.scenes.find((x) => x.id === 'c4').activity;
  assert.equal(String(c4.expect), SEQ.transcribe(DATA.INS.mRNA).slice(0, 6));
  assert.equal(String(c4.template), SEQ.complement(DATA.INS.mRNA.slice(0, 6)));
  // Labels are escaped.
  const esc = Prologue.svg('pancreas', Object.assign({}, T, { labels: Object.assign({}, T.labels, { pancreas: 'a<b' }) }));
  assert.ok(esc.indexOf('a&lt;b') > 0 && esc.indexOf('a<b') < 0);
});

