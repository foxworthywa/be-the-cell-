// The level pattern of the teaching-first redesign (docs/PROLOGUE.md §1.4, §2.4.3, §10.1 OP-2 to OP-5
// in their framework form): the watch phase's gates, guesses that are logged and never scored, the
// new score (0.45·G + 0.25·G·E + 0.30·D) and code format BTC2, on the stub level of
// tests/fixtures/level-watch-stub.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const W = require('../src/game/btc-watch.js');
const S = require('../src/game/btc-score.js');
const CODE = require('../src/game/btc-code.js');
const TEL = require('../src/game/btc-telemetry.js');
const STUB = require('./fixtures/level-watch-stub.js');

const def = LV.validate(STUB);
const { LevelRunner, playHeadless, playWatch, verifyRunFile } = RUN.game;

function memStorage() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
const clone = (x) => JSON.parse(JSON.stringify(x));
/** A runner at the start of its watch phase (the intro read). */
function atWatch(opts) {
  const r = new LevelRunner(Object.assign({ def, variantSeed: 3 }, opts || {})).start();
  r.storySkip(); r.next();
  assert.equal(r.phase, 'watch');
  return r;
}
const send = (r, cmd) => { const c = Object.assign({ source: 'user' }, cmd); const res = r.watchCell.command(c); r.watchCommand(c, res); return res; };
/** Plays the watch as the app's loop would: frames of `perFrame` ticks, stopping where the runner halts. */
function playByFrames(r, perFrame) {
  let frames = 0;
  while (!r.watch.done) {
    assert.ok(frames++ < 100000, 'stuck');
    const info = r.watchInfo();
    if (info.stage === 'lines' || info.stage === 'tap') { r.watchNext(); continue; }
    if (info.stage === 'guess') { r.watchPick(info.guess.id, 'cause'); r.watchSee(); continue; }
    if (info.stage === 'act') { send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 }); continue; }
    for (let k = 0; k < perFrame && !r.halted(); k++) { r.watchCell.step(); r.watchCell.takeEvents(); }
  }
  return clone(r.watch.gateTick);
}

test('W-1: the stub level validates; a guess marked right or wrong, an act gate without an act, and a flag on an unknown guess do not', () => {
  assert.ok(LV.PHASES.indexOf('watch') === LV.PHASES.indexOf('intro') + 1);
  const bad = (edit, re) => {
    const d = Object.assign({}, STUB, { watch: clone({ gene: 'ptsG', steps: STUB.watch.steps }) });
    d.watch.steps = d.watch.steps.map((x) => Object.assign({}, x));
    edit(d);
    assert.throws(() => LV.validate(d), re);
  };
  bad((d) => { d.watch.steps[2].guess = Object.assign({}, d.watch.steps[2].guess, { options: d.watch.steps[2].guess.options.map((o, i) => Object.assign({}, o, i === 0 ? { ok: true } : {})) }); }, /never right or wrong/);
  bad((d) => { d.watch.steps[3] = Object.assign({}, d.watch.steps[3], { act: undefined }); delete d.watch.steps[3].act; }, /act gate needs an act/);
  bad((d) => { d.watch.steps[4] = Object.assign({}, d.watch.steps[4], { until: { test: 'noSuchTest' } }); }, /unknown state test/);
  bad((d) => { d.flags = [{ id: 'G_X', mc: 'DNA_DIRECT', guess: 'nope' }]; }, /no watch guess nope/);
  bad((d) => { d.phases = d.phases.filter((p) => p !== 'watch'); }, /no watch phase/);
  // Every student string of the stub passes the level lint (guesses' wrong options may voice a misconception).
  assert.deepEqual(LV.lintText(def), []);
});

test('W-2 (OP-2): nothing moves on by itself: lines wait for Next, a guess must be picked before "See what happens", the act is the student\'s', () => {
  const tel = TEL.create({ storage: memStorage(), now: () => 0, session: 'a1b2c3d4' });
  const r = atWatch({ telemetry: tel });
  assert.equal(r.next().ok, false, 'Continue is refused during the watch');
  assert.equal(r.next().reason, 'watch');
  let info = r.watchInfo();
  assert.equal(info.id, 'w1'); assert.equal(info.stage, 'tap', 'a tap step is open on its last line'); assert.equal(info.gate, 'tap');
  assert.equal(r.halted(), false, 'a tap step lets the cell run');
  r.watchNext(); r.watchNext();                        // w1, then w2's first line
  info = r.watchInfo();
  assert.equal(info.id, 'w2'); assert.equal(info.line, 1); assert.equal(info.lines, 2);
  r.watchNext(); r.watchNext();                        // w2's second line; w3's line
  info = r.watchInfo();
  assert.equal(info.id, 'w3'); assert.equal(info.stage, 'guess');
  assert.equal(r.halted(), true, 'the cell does not run ahead of the guess');
  assert.equal(info.guess.options.length, 4);
  assert.equal(r.watchSee().ok, false, 'See what happens needs a guess');
  assert.equal(r.watchNext().ok, false);
  assert.ok(r.watchPick('h5', 1));
  assert.ok(r.watchPick('h5', 'cause'), 'a guess can be changed until See');
  assert.equal(r.watchSee().ok, true);
  assert.deepEqual(r.watch.guesses.h5, { option: 0, mc: null, cause: true, step: 'w3' });
  info = r.watchInfo();
  assert.equal(info.id, 'w4');
  assert.equal(info.stage, 'act', 'on its last line an act step waits for the switch at once (no extra Next)');
  assert.equal(r.watchNext().ok, false, 'Next does not do the act');
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 'off' });
  assert.equal(r.watchInfo().stage, 'act', 'switching the gene off is not the act');
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 });
  info = r.watchInfo();
  assert.equal(info.id, 'w5'); assert.equal(info.stage, 'until');
  assert.equal(r.watchNext().ok, false, 'Next does not skip a state the model has not reached');
  assert.ok(info.waiting);
  const kinds = tel.all().map((e) => e.type);
  assert.ok(kinds.indexOf('guess') >= 0 && kinds.indexOf('step') >= 0);
  for (const e of tel.all()) assert.deepEqual(TEL.check(e), [], e.type);
});

test('W-3 (OP-3): every state gate opens at a tick that does not depend on the frame size (1 s = 10 s or 1 s = 1 h), and render time alone opens nothing', () => {
  const a = playByFrames(atWatch(), 10);
  const b = playByFrames(atWatch(), 3600);
  const c = playWatch(atWatch(), def.solutions.reference, 200000);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c, 'the headless player opens the gates at the same ticks');
  assert.ok(a['w5:until'] > 0 && a['w5:until'] <= a['w6:until'] && a['w6:until'] <= a['w8:until'], JSON.stringify(a));
  // Asking for the step again and again, without ticks, changes nothing.
  const r = atWatch();
  for (let i = 0; i < 6 && r.watchInfo().stage !== 'act'; i++) { const info = r.watchInfo(); if (info.stage === 'guess') { r.watchPick('h5', 'cause'); r.watchSee(); } else r.watchNext(); }
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 });
  const tick = r.watchCell.tick;
  for (let i = 0; i < 1000; i++) r.watchInfo();
  assert.equal(r.watchInfo().stage, 'until');
  assert.equal(r.watchCell.tick, tick);
  // A pausing gate holds the cell at its tick until the student taps.
  while (r.watchInfo().stage === 'until') { assert.equal(r.halted(), false); r.watchCell.step(); }
  assert.equal(r.watchInfo().id, 'w5');
  assert.equal(r.halted(), true);
  assert.equal(r.watchCell.tick, a['w5:until']);
  assert.equal(r.watchInfo().cause, 'The gene was copied first.', 'the cause, once the gate is open');
});

test('W-4 (OP-4): switching the gene off while a step waits is allowed; the step says so and keeps waiting', () => {
  const r = atWatch();
  for (let i = 0; i < 6 && r.watchInfo().stage !== 'act'; i++) { const info = r.watchInfo(); if (info.stage === 'guess') { r.watchPick('h5', 'cause'); r.watchSee(); } else r.watchNext(); }
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 });
  assert.equal(r.watchInfo().id, 'w5');
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 'off' });
  r.watchCell.step();
  assert.match(r.watchInfo().note, /The gene is off/);
  for (let i = 0; i < 400; i++) r.watchCell.step();
  assert.equal(r.watchInfo().id, 'w5');
  assert.equal(r.watchInfo().stage, 'until', 'no copy is finished while the gene is off');
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 });
  let n = 0;
  while (r.watchInfo().stage === 'until' && n++ < 2000) r.watchCell.step();
  assert.equal(r.watchInfo().stage, 'tap', 'switched on again, the step goes on');
  assert.equal(r.watchInfo().note, null);
});

test('W-5: a watch saved mid-step and restored (as after a reload) opens its gates at the same ticks', () => {
  const ref = playByFrames(atWatch(), 50);
  const r = atWatch();
  for (let i = 0; i < 6 && r.watchInfo().stage !== 'act'; i++) { const info = r.watchInfo(); if (info.stage === 'guess') { r.watchPick('h5', 'cause'); r.watchSee(); } else r.watchNext(); }
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 });
  for (let i = 0; i < 40; i++) r.watchCell.step();
  const saved = clone(r.save());
  assert.ok(saved.watchCell && saved.watchCell.snapshot, 'the watch cell is in the autosave');
  const q = LevelRunner.restore(def, saved, {});
  assert.equal(q.phase, 'watch');
  assert.equal(q.watchCell.tick, 40);
  assert.equal(q.watchInfo().id, 'w5');
  assert.deepEqual(playByFrames(q, 50), ref);
  // After the watch the cell is dropped, but the guesses stay with the attempt.
  q.next();
  assert.equal(q.phase, 'task');
  assert.equal(q.watchCell, null);
  assert.equal(q.halted(), true);
  assert.equal(q.save().watchCell, null);
  assert.ok(q.save().watch.guesses.h5);
});

test('W-6: guesses are logged and raise flags, but never change the score; the code is BTC2 with P as NA', () => {
  const a = playHeadless(def, { variantSeed: 5 });
  const b = playHeadless(def, { variantSeed: 5, solution: 'guessDnaDirect' });
  assert.equal(a.result.total, b.result.total);
  assert.deepEqual(a.result.flags, []);
  assert.deepEqual(b.result.flags, ['G_DNA_DIRECT']);
  assert.equal(a.result.P, null);
  assert.match(a.code, /^BTC2-W0-000005-G1E100PNAD11X[0-9A-F]-F00-/);
  assert.match(b.code, /-F01-/);
  const d = CODE.decode(a.code);
  assert.equal(d.total, a.result.total);
  assert.equal(a.result.total, S.total({ G: 1, E: a.result.E, D: [1, 1] }));
  assert.equal(a.result.total, 100);
  for (const out of [a, b]) assert.deepEqual(RUN.game.checkExpect(def.solutions[out === a ? 'reference' : 'guessDnaDirect'].expect, out.result), []);
});

test('W-7: Explain feedback retries; only the first tap counts (D), and a first wrong tap costs 30 points of 100', () => {
  const r = playHeadless(def, { variantSeed: 5, onPhase: (x) => { if (x.phase === 'debrief' && !x.debriefState.d1) x.tap('d1', 1); } });
  assert.deepEqual(r.result.D, [0, 1]);
  assert.equal(r.result.total, 70);
  assert.ok(r.result.flags.indexOf('DEB_SELF_COPY') >= 0);
});

test('W-8: the run file keeps the guesses, and verify-run recomputes the flags they raise', () => {
  const out = playHeadless(def, { variantSeed: 11, solution: 'guessDnaDirect' });
  const file = out.runner.runFile({ build: 'test' });
  assert.deepEqual(file.level.guesses, { h5: 1 });
  const res = verifyRunFile(clone(file), { levels: { W: def } });
  assert.equal(res.ok, true, JSON.stringify(res.checks.filter((c) => !c.ok)));
  assert.deepEqual(res.recomputed.flags, ['G_DNA_DIRECT']);
});

test('W-9: the watch step reaches the labConfig (a readout can appear from a given step on), and the state tests read the view only', () => {
  const r = atWatch();
  assert.equal(r.labConfig().ui.status.energy, false);
  r.watchNext();
  assert.equal(r.watchInfo().id, 'w2');
  assert.equal(r.labConfig().ui.status.energy, true);
  assert.notEqual(r.labConfigKey(), atWatch().labConfigKey());
  // matches / satisfiedBy
  assert.ok(W.matches({ type: 'setPromoter', gene: 'ptsG', on: true }, { type: 'setPromoter', gene: 'ptsG', level: 0.25 }));
  assert.ok(!W.matches({ type: 'setPromoter', gene: 'ptsG', on: true }, { type: 'setPromoter', gene: 'lacY', level: 2 }));
  assert.ok(W.satisfiedBy({ type: 'setPromoter', on: false }, 'off'));
  assert.equal(W.locationOf({ geneById: { lacY: {} } }, 'lacY'), 'membrane');
  assert.equal(W.locationOf({ geneById: { lacZ: {} } }, 'lacZ'), 'cytoplasm');
});

test('W-10: a switch-on before the act prompt does the act (the student need not switch it off and on again)', () => {
  const r = atWatch();
  for (let i = 0; i < 3; i++) r.watchNext();
  assert.equal(r.watchInfo().id, 'w3');
  assert.equal(r.watchInfo().stage, 'lines');
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 });
  r.watchNext();
  r.watchPick('h5', 'cause'); r.watchSee();
  assert.equal(r.watchInfo().id, 'w5', 'the act was already done');
});

test('W-11: a guess in a scene of the opening ("Guess, then see"): the scene waits for it, it is never marked, feedback shows where it is due, flags follow', () => {
  const def = LV.validate(require('../src/levels/btc-level-p.js'));
  const at = def.scenes.findIndex((sc) => sc.guess && sc.guess.id === 'd1');
  const g = def.scenes[at].guess;
  assert.ok(g.showAt && g.showAt !== def.scenes[at].id, 'D1\'s feedback is due on a later scene');
  const r = new LevelRunner({ def, variantSeed: 0 }).start();
  // On to D1's last line, doing the activities on the way.
  while (r.sceneInfo().index < at || !r.sceneInfo().lastLine) {
    const i = r.sceneInfo();
    if (i.activity && i.lastLine && !i.activity.done) RUN.game.playActivity(r, i, null);
    assert.ok(r.sceneNext().ok, 'Next at ' + i.scene.id);
  }
  let info = r.sceneInfo();
  assert.ok(info.guess && !info.guess.seen);
  assert.equal(r.sceneNext().reason, 'guess', 'the scene waits for the guess');
  assert.equal(r.sceneSkip() && r.sceneInfo().index, at, 'Skip never passes an unseen guess');
  assert.equal(r.sceneSee().ok, false, 'See needs a pick');
  const wrong = g.options.findIndex((o) => o.mc === 'DNA_DIRECT');
  assert.ok(r.scenePick('d1', wrong));
  assert.ok(r.sceneSee().ok);
  info = r.sceneInfo();
  assert.equal(info.guess.seen, true);
  assert.equal(info.solved, true, 'a guess is seen, never marked');
  assert.deepEqual(info.feedback, [], 'its feedback is due on a later scene');
  assert.ok(r.sceneNext().ok);
  while (r.sceneInfo().scene.id !== g.showAt || !r.sceneInfo().lastLine) assert.ok(r.sceneNext().ok);
  const fb = r.sceneInfo().feedback;
  assert.equal(fb.length, 1);
  assert.equal(fb[0].fb, g.options[wrong].fb);
  assert.equal(fb[0].cause, false);
  const out = playHeadless(def, { solution: 'reference' });
  assert.deepEqual(out.result.flags, []);
  const bad = playHeadless(def, { solution: 'reference', onPhase: (x) => { if (x.phase === 'scenes') { const i = x.sceneInfo(); if (i.guess && i.guess.id === 'd1' && !i.guess.seen) { x.scenePick('d1', wrong); x.sceneSee(); } } } });
  assert.deepEqual(bad.result.flags, ['PRED_DNA_DIRECT']);
  assert.equal(bad.result.total, null, 'the opening is not scored');
});

test('W-12: a step shown by a pausing condition and then waiting on another state lets the cell run again (no deadlock)', () => {
  const steps = [
    { id: 'a', lines: [{ who: 'narrator', text: 'Switch it on.' }], act: { kind: 'command', expect: { type: 'setPromoter', gene: 'ptsG', on: true } }, gate: { kind: 'act' } },
    { id: 'b', until: { test: 'firstMRNA', watch: true }, lines: [{ who: 'narrator', text: 'The first copy is outlined.' }],
      gate: { kind: 'state', test: 'firstProtein' }, cause: 'Ribosomes read it.' },
  ];
  const def = LV.validate(Object.assign({}, STUB, { watch: { gene: 'ptsG', onLevel: 2, steps }, flags: STUB.flags.filter((f) => !f.guess) }));
  const r = new LevelRunner({ def, variantSeed: 2 }).start();
  r.storySkip(); r.next();
  send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 });
  let n = 0;
  while (r.watchInfo().stage === 'until' && n++ < 5000) r.watchCell.step();
  assert.equal(r.watchInfo().id, 'b');
  assert.equal(r.halted(), false, 'the lines of b are shown; the step waits on the model, so the cell may run');
  assert.notEqual(r.watch.watchedId, null, 'until {watch: true} marks the first copy');
  while (r.watchInfo().stage === 'wait' && n++ < 20000) r.watchCell.step();
  assert.equal(r.watchInfo().stage, 'tap');
  assert.equal(r.watchInfo().cause, 'Ribosomes read it.');
  assert.equal(r.halted(), true, 'held at the gate until Next');
  r.watchNext();
  assert.equal(r.gate().ok, true);
});
