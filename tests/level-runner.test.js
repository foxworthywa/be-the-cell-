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
  // result: no story beat, even with the goal met; the outro waits for echo, after the debrief (§4.1).
  assert.equal(r.phase, 'result');
  assert.equal(r.beat, null, 'the outro would answer the debrief: it is not shown here');
  assert.equal(r.retry().ok, false, 'no Try again after the goal was met');
  assert.ok(r.next().ok);
  // predict2.
  assert.equal(r.phase, 'predict2');
  refused(r, 'predict');
  r.lock('p2', 'ok');
  assert.ok(r.next().ok);
  // epilogue: it waits for the student's act (1.4: "Switch LacY off"), then until its game time has run.
  assert.equal(r.phase, 'epilogue');
  assert.equal(r.halted(), true, 'time does not run before the epilogue is started');
  refused(r, 'epilogue');
  cell.command({ type: 'setPromoter', gene: 'lacY', level: 'off' });
  assert.equal(r.startEpilogue(), true);
  assert.equal(r.startEpilogue(), false, 'started once');
  assert.equal(r.halted(), false);
  refused(r, 'epilogue');
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
  // echo: the outro comes first, after the debrief; closing it keeps the phase; Continue on the last screen.
  assert.equal(r.phase, 'echo');
  assert.equal(r.storyLine().beat, 'outro');
  assert.equal(r.echoScreen(), null, 'the screens wait for the outro');
  refused(r, 'story');
  r.storySkip();
  assert.ok(r.next().ok);
  assert.equal(r.phase, 'echo', 'closing the beat keeps the phase');
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
  r.startEpilogue();
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

test('the opening, part 1 (PROLOGUE §2.3): scenes gate on each line, on their activities and on their guesses; guesses are never marked; cards; an unscored code', () => {
  const r = new RUN.LevelRunner({ def: P, variantSeed: 12345, attempt: 1, deviceSeed: 42 }).start();
  assert.equal(r.phase, 'scenes');
  assert.equal(r.variantSeed, 0, 'the opening has no variant');
  refused(r, 'scenes');
  // On to scene id, doing the activities and guesses on the way as a student would.
  const to = (id) => {
    for (let g = 0; r.sceneInfo().scene.id !== id && g < 200; g++) {
      const i = r.sceneInfo();
      if (i.guess && !i.guess.seen) { r.scenePick(i.guess.id, 'cause'); r.sceneSee(); }
      if (i.activity && i.lastLine && !i.activity.done) RUN.game.playActivity(r, r.sceneInfo(), null);
      assert.ok(r.sceneNext().ok, 'Next at ' + i.scene.id);
    }
  };
  const lastLine = () => { while (!r.sceneInfo().lastLine) assert.ok(r.sceneNext().ok); };
  let info = r.sceneInfo();
  assert.equal(info.scene.id, 'a0');
  assert.equal(info.who, 'narrator');
  assert.equal(info.text, 'This is you. Some of your cells are making a protein called insulin right now.');
  // The zoom ladder, one rung per scene, down to the letters; each rung can step back to the one before it.
  const rungs = [];
  while (r.sceneInfo().scene.id !== 'b1') {
    info = r.sceneInfo();
    if (info.scene.rung && rungs[rungs.length - 1] !== info.scene.rung) rungs.push(info.scene.rung);
    if (info.index > 0) assert.equal(info.canBack, true, info.scene.id);
    assert.ok(r.sceneNext().ok);
  }
  assert.deepEqual(rungs, ['you', 'pancreas', 'islet', 'betaCell', 'nucleus', 'chromosome', 'stretch', 'helix', 'letters']);
  // C4: the student makes the first six letters of the copy; Next waits for them. A T is answered with U's words.
  to('c4'); lastLine();
  assert.deepEqual(r.sceneNext(), { ok: false, reason: 'activity' });
  const a = r.sceneInfo().scene.activity;
  assert.equal(a.expect.length, 6);
  assert.equal(a.expect[5], 'U', 'the sixth letter is the first U');
  for (let i = 0; i < 5; i++) assert.equal(r.sceneAct({ pick: a.expect[i] }).match, true);
  const t = r.sceneAct({ pick: 'T' });
  assert.equal(t.match, false);
  assert.equal(t.fb, a.words.noT);
  assert.deepEqual(r.sceneNext(), { ok: false, reason: 'activity' }, 'the rest of the copy is still to run');
  assert.ok(r.sceneAct({ start: true }).ok);
  while (!r.sceneAct({ advance: 50 }).done) { /* the polymerase runs to the end of the gene */ }
  assert.ok(r.sceneNext().ok);
  // D1: a guess, never marked; its feedback shows where it is due (D2).
  to('d1'); lastLine();
  info = r.sceneInfo();
  assert.ok(info.guess && !info.guess.seen);
  assert.equal(r.sceneNext().ok, false, 'Next waits for the guess');
  const wrong = P.scenes.find((x) => x.id === 'd1').guess.options.findIndex((o) => o.mc === 'DNA_DIRECT');
  assert.ok(r.scenePick('d1', wrong));
  assert.ok(r.sceneSee().ok);
  assert.equal(r.sceneInfo().solved, true, 'a guess is seen, not marked');
  assert.ok(r.sceneNext().ok);
  assert.equal(r.sceneInfo().scene.id, 'd2');
  lastLine();
  assert.equal(r.sceneInfo().feedback.length, 1, 'D1\'s "what happened" shows at D2');
  // E3: the student decodes the first two codons; a wrong row is answered with the right one's name, then picked.
  to('e3'); lastLine();
  const e3 = r.sceneInfo().scene.activity;
  assert.deepEqual(e3.codons, ['AUG', 'GCC']);
  const wrongRow = e3.rows.findIndex((x) => x.codon !== 'AUG');
  assert.equal(r.sceneAct({ row: wrongRow }).match, false);
  assert.equal(r.sceneInfo().activity.hint, e3.rows.findIndex((x) => x.codon === 'AUG'));
  for (const c of e3.codons) assert.equal(r.sceneAct({ row: e3.rows.findIndex((x) => x.codon === c) }).match, true);
  assert.ok(r.sceneAct({ start: true }).ok);
  while (!r.sceneAct({ advance: 20 }).done) { /* the ribosome reads on to the stop */ }
  assert.ok(r.sceneNext().ok);
  // The rest by Skip (it stops at each unfinished activity or guess); F4's guess.
  for (let g = 0; g < 60 && !r.sceneInfo().last; g++) {
    info = r.sceneInfo();
    if (info.guess && !info.guess.seen) { r.scenePick(info.guess.id, 'cause'); r.sceneSee(); }
    if (info.activity && info.lastLine && !info.activity.done) RUN.game.playActivity(r, info, null);
    if (!r.sceneNext().ok) r.sceneSkip();
  }
  info = r.sceneInfo();
  assert.equal(info.scene.id, 'f7');
  assert.equal(info.last, true);
  assert.ok(r.next().ok);
  assert.equal(r.phase, 'complete');
  assert.deepEqual(r.cards, ['gene', 'mrna', 'ribosome', 'genetic-code']);
  const d = CODE.decode(r.code);
  assert.match(r.code, /^BTC2-P0-000000-G1ENAPNAD12X0-F01-A1N1-R\w{3}C2-000000-/);
  assert.equal(d.total, null);
  assert.equal(r.result.total, null);
  assert.deepEqual(r.result.flags, ['PRED_DNA_DIRECT']);
  const ok = RUN.game.playHeadless(P, { deviceSeed: 1 });
  assert.match(ok.code, /-G1ENAPNAD22X0-F00-/);
});

test('M2 review: a designer level\'s Try again goes back to the DNA editor; the result waits for par; runs stop at 99 in the code', () => {
  const def = LV.validate(stub.full());
  const r = new RUN.LevelRunner({ def, variantSeed: 4242, attempt: 1 }).start();
  r.storySkip(); r.next(); r.next();
  r.lock('p1', 'ok'); r.next();
  const demo = r.startDemo();
  while (!r.checkDemo()) demo.step();
  r.next();
  assert.equal(r.phase, 'design');
  r.next();
  while (!r.run.endReason) r.run.cell.step();              // never switched on: the limit ends it
  r.next();
  assert.equal(r.phase, 'result');
  assert.equal(r.goal, false);
  // A par run still being worked out (1.7) holds Continue (and Continue without the goal) on the result.
  r.par = { done: false };
  refused(r, 'par');
  assert.equal(r.continueWithoutGoal().ok, false);
  r.par = null;
  assert.ok(r.retry().ok);
  assert.equal(r.phase, 'design', 'the run has no controls: Try again means changing the DNA');
  assert.equal(r.setDesign({ lac: { promoter: 2 } }), true);
  assert.equal(r.runs, 2);
  assert.ok(r.next().ok);
  assert.equal(r.phase, 'run');
  assert.equal(r.run.cell.tick, 0);
  // The code has two digits for runs.
  const out = RUN.game.summarise(def, { goal: false, comp: {}, debrief: {}, variantSeed: 1, attempt: 1, runs: 150, record: null });
  assert.equal(out.runs, 99);
  assert.equal(CODE.decode(out.code).runs, 99);
  r.runs = 120;
  assert.equal(r.runFile().level.runs, 99);
});

test('M2 review: a save from another content version is refused; a finished demo comes back at its end, not played again', () => {
  const def = LV.validate(stub.full());
  const r = new RUN.LevelRunner({ def, variantSeed: 99, attempt: 1 }).start();
  r.storySkip(); r.next(); r.next();
  r.lock('p1', 'ok'); r.next();
  const demo = r.startDemo();
  while (!r.checkDemo()) demo.step();
  const endTick = demo.tick, final = r.demo.result.final;
  const saved = JSON.parse(JSON.stringify(r.save()));
  assert.throws(() => RUN.LevelRunner.restore(def, Object.assign({}, saved, { content: def.version + 1 })), /content/);
  const back = RUN.LevelRunner.restore(def, saved);
  assert.equal(back.phase, 'demo');
  assert.equal(back.demo.done, true);
  assert.ok(back.demo.cell, 'the demo cell is rebuilt from its record');
  assert.equal(back.demo.cell.tick, endTick);
  assert.equal(back.demo.cell.hash(), demo.hash());
  assert.equal(back.startDemo(), back.demo.cell, 'a finished demo is not started again');
  assert.equal(back.demo.result.final, final);
  assert.equal(back.halted(), true);
});
