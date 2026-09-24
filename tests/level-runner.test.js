// L-12 (LEVELS §12.1, §4): the level runner. Continue is refused until the
// gate of §4.1 holds, for every phase; predictions lock; the debrief records
// the first try; Try again keeps the variant and the seed; the ?v= override
// is attempt 0. The stub level's solutions meet their expectations (the
// L-4/L-5 pattern the real levels will follow), and the Prologue plays through.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const CODE = require('../src/game/btc-code.js');
const S = require('../src/game/btc-score.js');
const K = require('../src/game/btc-level-kit.js');
const stub = require('./fixtures/btc-level-stub.js');
const P = LV.validate(require('../src/levels/btc-level-p.js'));

const refused = (r, reason) => {
  const g = r.next();
  assert.equal(g.ok, false, 'Continue must be refused in ' + r.phase);
  if (reason) assert.equal(g.reason, reason);
};

test('L-12: every phase of a scored level refuses Continue until its gate holds', () => {
  const def = LV.validate(stub.full());
  const r = new RUN.LevelRunner({ def, variantSeed: 31337, attempt: 1 }).start();
  // intro: one line at a time; Skip jumps to the last line, then Continue.
  assert.equal(r.phase, 'intro');
  refused(r, 'story');
  assert.equal(r.storyLine().index, 0);
  assert.equal(r.storyNext(), true);
  refused(r, 'story');
  r.storySkip();
  assert.equal(r.storyLine().last, true);
  assert.ok(r.next().ok);
  // task: always.
  assert.equal(r.phase, 'task');
  assert.ok(r.next().ok);
  // predict: every Core item locked; Expert items may be skipped.
  assert.equal(r.phase, 'predict');
  refused(r, 'predict');
  assert.equal(r.select('p1', 1), true);
  refused(r, 'predict');
  assert.ok(r.lock('p1').ok);
  assert.equal(r.lock('p1', 0).ok, false, 'one locked answer per attempt');
  assert.equal(r.select('p1', 0), false, 'no changes after locking');
  assert.equal(r.answers.p1.value, 1);
  assert.equal(r.answers.p1.mc, 'INSTANT');
  assert.equal(r.lock('p2', 0).ok, false, 'predict2 items wait for their phase');
  assert.ok(r.next().ok, 'the Expert number item may be skipped');
  assert.equal(r.answers.n1.skipped, true);
  // demo: until the demo has reached its end.
  assert.equal(r.phase, 'demo');
  refused(r, 'demo');
  const demo = r.startDemo();
  for (let i = 0; i < 30; i++) demo.step();
  assert.equal(r.checkDemo(), false);
  refused(r, 'demo');
  while (!r.checkDemo()) demo.step();
  assert.ok(r.demo.result.final > 0);
  assert.ok(r.next().ok);
  // design: always (the app asks for confirmation).
  assert.equal(r.phase, 'design');
  assert.equal(r.setDesign({ lac: { promoter: 1 } }), true);
  assert.ok(r.next().ok);
  // run: until the monitor ends the run; the cell was built paused at tick 0.
  assert.equal(r.phase, 'run');
  const cell = r.run.cell;
  assert.equal(cell.tick, 0);
  assert.equal(r.halted(), false);
  refused(r, 'run');
  cell.command({ type: 'setPromoter', gene: 'lacY', level: 4 });
  for (let i = 0; i < 30; i++) cell.step();
  refused(r, 'run');
  while (!r.run.endReason) cell.step();
  assert.equal(r.run.endReason, 'goal');
  assert.equal(r.halted(), true, 'the app stops stepping at the end tick');
  assert.equal(r.run.monitor.result().changes, 1, 'the monitor saw the applied user command');
  assert.ok(r.next().ok);
  // result: the goal was met, so the outro beat comes first.
  assert.equal(r.phase, 'result');
  assert.equal(r.storyLine().beat, 'outro');
  refused(r, 'story');
  r.storySkip();
  assert.ok(r.next().ok);
  assert.equal(r.phase, 'result', 'closing the beat keeps the phase');
  assert.equal(r.retry().ok, false, 'no Try again after the goal was met');
  assert.ok(r.next().ok);
  // predict2.
  assert.equal(r.phase, 'predict2');
  refused(r, 'predict');
  r.lock('p2', 'ok');
  assert.ok(r.next().ok);
  // epilogue: until its game time has run.
  assert.equal(r.phase, 'epilogue');
  assert.equal(r.halted(), false);
  refused(r, 'epilogue');
  cell.command({ type: 'setPromoter', gene: 'lacY', level: 'off' });
  while (!r.halted()) cell.step();
  assert.equal(r.epilogue.done, true);
  assert.ok(r.next().ok);
  // debrief: each question right (retries allowed; the first tap counts).
  assert.equal(r.phase, 'debrief');
  refused(r, 'debrief');
  const wrong = r.tap('d1', 1);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.mc, 'CELL_DECIDES');
  assert.ok(wrong.fb.length > 10);
  refused(r, 'debrief');
  assert.equal(r.tap('d1', 1).repeat, true, 'a wrong option stays disabled');
  assert.equal(r.tap('d1', 'ok').correct, true);
  assert.equal(r.debriefState.d1.firstCorrect, false);
  assert.equal(r.debriefState.d1.firstMc, 'CELL_DECIDES');
  assert.ok(r.next().ok);
  // echo: the outro was shown in result, so the screens start at once; Continue on the last one.
  assert.equal(r.phase, 'echo');
  assert.equal(r.beat, null);
  refused(r, 'echo');
  assert.equal(r.echoNext(), true);
  assert.equal(r.echoNext(), false);
  assert.ok(r.next().ok);
  assert.deepEqual(r.cards, ['mrna'], 'Next on the last screen collects the cards');
  // complete: the result and its code.
  assert.equal(r.phase, 'complete');
  refused(r, 'complete');
  const res = r.result;
  assert.equal(res.G, 1);
  assert.equal(res.P, 0.5);
  assert.deepEqual(res.D, [0, 1]);
  assert.deepEqual(res.flags, ['PRED_INSTANT', 'DEB_CELL_DECIDES']);
  assert.equal(res.total, S.total(res));
  const d = CODE.decode(r.code);
  assert.equal(d.ok, true);
  assert.equal(d.flags, 0b110);
  assert.equal(d.variantSeed, 31337);
  assert.equal(d.total, res.total);
  assert.equal(d.digest, r.record.finalHash.slice(0, 6).toUpperCase());
});

test('L-12: option order is shuffled per attempt, from the variant seed, and stable', () => {
  const def = LV.validate(stub.playable());
  const orders = new Set();
  for (let s = 0; s < 40; s++) {
    const r = new RUN.LevelRunner({ def, variantSeed: K.variantSeed(1, 'T', s) });
    const o = r.optionOrder('d1');
    assert.deepEqual(o.slice().sort(), [0, 1, 2]);
    assert.deepEqual(new RUN.LevelRunner({ def, variantSeed: K.variantSeed(1, 'T', s) }).optionOrder('d1'), o);
    orders.add(o.join(''));
  }
  assert.ok(orders.size >= 5, 'all six orders are reachable: ' + orders.size);
});

test('L-12: a failed run offers Try again: same variant and seed, a fresh cell, predictions kept; the outro waits for echo', () => {
  const def = LV.validate(stub.playable());
  const r = new RUN.LevelRunner({ def, variantSeed: 777, attempt: 3 }).start();
  r.storySkip(); r.next(); r.next();
  r.lock('p1', 'ok'); r.next();
  const first = r.run.cell;
  const seed1 = first.config.seed, hash0 = first.hash();
  while (!r.run.endReason) first.step();          // never switched on: the limit ends it
  assert.equal(r.run.endReason, 'limit');
  assert.equal(r.goal, false);
  r.next();
  assert.equal(r.phase, 'result');
  assert.equal(r.beat, null, 'no outro before a failed result');
  assert.ok(r.retry().ok);
  assert.equal(r.phase, 'run');
  assert.equal(r.runs, 2);
  assert.notEqual(r.run.cell, first);
  assert.equal(r.run.cell.config.seed, seed1, 'same engine seed');
  assert.equal(r.run.cell.hash(), hash0, 'a fresh cell, identical to the first at tick 0');
  assert.equal(r.answers.p1.locked, true, 'predictions stay as they were locked');
  while (!r.run.endReason) r.run.cell.step();
  r.next();
  // Continue without the goal: the code has G0 and the outro shows at the start of echo.
  assert.ok(r.continueWithoutGoal().ok);
  assert.equal(r.phase, 'predict2');
  r.lock('p2', 'ok'); r.next();
  while (!r.halted()) r.run.cell.step();
  r.next();
  r.tap('d1', 'ok'); r.next();
  assert.equal(r.phase, 'echo');
  assert.equal(r.storyLine().beat, 'outro');
  refused(r, 'story');
  r.storySkip(); r.next();
  r.echoNext(); r.next();
  const d = CODE.decode(r.code);
  assert.equal(d.G, 0);
  assert.equal(d.E, 0, 'efficiency counts only when the goal was met');
  assert.equal(d.attempt, 3);
  assert.equal(d.runs, 2);
});

test('L-12: the ?v= override is attempt 0 and carries the given variant', () => {
  const def = LV.validate(stub.playable());
  const seed = CODE.decodeSeed('7K2Q9C');
  const out = RUN.game.playHeadless(def, { variantSeed: seed, attempt: 0, override: true });
  const d = CODE.decode(out.code);
  assert.equal(d.attempt, 0);
  assert.equal(d.override, true);
  assert.equal(d.variant, '7K2Q9C');
  assert.equal(out.result.override, true);
  assert.equal(out.runner.fileName(), 'be-the-cell-T-7K2Q9C-a0.json');
});

test('L-4/L-5 pattern: the stub\'s reference, idle and fiddler solutions meet their expectations', () => {
  const def = LV.validate(stub.playable());
  for (const s of [1, 2, 3, 4]) {
    const vs = K.variantSeed(s, 'T', 0);
    for (const name of Object.keys(def.solutions)) {
      const sol = def.solutions[name];
      const out = RUN.game.playHeadless(def, { variantSeed: vs, solution: name });
      assert.equal(!!out.result.G, sol.expect.goal, name + ' goal');
      assert.equal(S.withinPar(out.result.E), sol.expect.par, name + ' par');
      if (sol.expect.minTotal) assert.ok(out.result.total >= sol.expect.minTotal, name + ' total ' + out.result.total);
      if (sol.expect.flags) assert.deepEqual(out.result.flags, sol.expect.flags, name + ' flags');
    }
  }
});

test('the Prologue: scenes gate on each line and on the question; cards; an unscored code', () => {
  const r = new RUN.LevelRunner({ def: P, variantSeed: 12345, attempt: 1, deviceSeed: 42 }).start();
  assert.equal(r.phase, 'scenes');
  assert.equal(r.variantSeed, 0, 'the Prologue has no variant');
  refused(r, 'scenes');
  let info = r.sceneInfo();
  assert.equal(info.scene.id, 's1');
  assert.equal(info.text, 'Congratulations. You are in charge of a cell.');
  assert.ok(r.sceneNext().ok);
  assert.ok(r.sceneNext().ok);
  assert.equal(r.sceneInfo().scene.id, 's2');
  while (r.sceneInfo().scene.id !== 's4') r.sceneNext();
  info = r.sceneInfo();
  assert.equal(info.who, 'ribosome');
  assert.ok(info.question, 'the question comes with the ribosome line');
  assert.deepEqual(r.sceneNext(), { ok: false, reason: 'question' });
  r.sceneSkip();
  assert.equal(r.sceneInfo().scene.id, 's4', 'Skip stops at an unanswered question');
  const t = r.tap('p.q1', 2);
  assert.equal(t.correct, false);
  assert.equal(t.mc, 'DNA_DIRECT');
  assert.deepEqual(r.sceneNext(), { ok: false, reason: 'question' });
  assert.equal(r.tap('p.q1', 'ok').correct, true);
  assert.ok(r.sceneNext().ok);
  assert.equal(r.sceneInfo().scene.id, 's5');
  r.sceneNext();
  info = r.sceneInfo();
  assert.equal(info.scene.live, true);
  const cfg = P.config(r.variant, 'task', r.extra());
  assert.equal(cfg.seed, K.seedFor(42, 'prologue'), 'the live bacterium is seeded from the device');
  r.sceneSkip();
  info = r.sceneInfo();
  assert.equal(info.last, true);
  assert.equal(info.who, 'narrator');
  assert.ok(r.next().ok);
  assert.equal(r.phase, 'complete');
  assert.deepEqual(r.cards, ['ribosome', 'genetic-code', 'no-nucleus']);
  const d = CODE.decode(r.code);
  assert.match(r.code, /^BTC1-P0-000000-G1ENAPNAD01X0-F01-A1N1-R\w{3}C1-000000-/);
  assert.equal(d.total, null);
  assert.equal(r.result.total, null);
  assert.deepEqual(r.result.flags, ['PRED_DNA_DIRECT']);
  const ok = RUN.game.playHeadless(P, { deviceSeed: 1 });
  assert.match(ok.code, /-G1ENAPNAD11X0-F00-/);
});
