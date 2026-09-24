// Level 1.2, "One gene, many copies" (LEVELS §7.2; §12.1 L-4, L-5, L-11): the reference and
// every misconception solution meet their expectations on every variant, the calibration that
// produced the level's constants passed its own checks, the demo is the scripted test run, the
// deadline locks the dial and the settle shows what the leftover mRNA still makes, and the
// level narrator rule only speaks when it is true.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/game/btc-level-kit.js');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const LC = require('../src/levels/btc-level-constants.js');
const N = require('../src/shared/btc-narrate.js');
const OBS = require('../src/engine/btc-observe.js');
const { Cell } = require('../src/engine/btc-cell.js');
const def = LV.validate(require('../src/levels/btc-level-1-2.js'));

/** n variant seeds per variant (T, tOff), found as the app draws them (attempt indices from 0). */
function sample(n) {
  const groups = {};
  for (let i = 0; i < 2000; i++) {
    const vs = K.variantSeed(i, def.id, 0);
    const v = def.variant(vs), k = 'T' + v.T + '/tOff' + v.tOff;
    const g = groups[k] || (groups[k] = []);
    if (g.length < n) g.push(vs);
    if (Object.keys(groups).length === 9 && Object.values(groups).every((x) => x.length >= n)) break;
  }
  return groups;
}

test('L-3: 9 variants (T 400/500/600 × tOff 4/5/6), deterministic, JSON-safe; mPar from the calibrated copies per mRNA; D from the calibration', () => {
  const seen = new Set();
  for (let s = 0; s < 500; s++) {
    const vs = K.variantSeed(s, def.id, 0);
    const v = def.variant(vs);
    assert.deepEqual(def.variant(vs), v);
    assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
    assert.ok([400, 500, 600].includes(v.T) && [4, 5, 6].includes(v.tOff));
    assert.equal(v.mPar, Math.round((1.7 * v.T) / LC.l12.ppm));
    assert.equal(v.D, LC.l12.D[v.T]);
    seen.add(v.T + '/' + v.tOff);
    for (const role of ['task', 'demo']) {
      const c = new Cell(def.config(v, role));
      assert.deepEqual(c.config.variant, { levelId: '1.2', content: 1, seed: vs, T: v.T, tOff: v.tOff, D: v.D, mPar: v.mPar });
    }
  }
  assert.equal(seen.size, 9);
});

test('L-4/L-5: every solution meets its expectation on every variant (3 seeds each; at least 2 of 3, and 90% overall)', (t) => {
  const groups = sample(3);
  const lines = [];
  for (const name of Object.keys(def.solutions)) {
    let met = 0, n = 0;
    for (const k of Object.keys(groups)) {
      let ok = 0;
      for (const vs of groups[k]) {
        const p = RUN.game.playHeadless(def, { variantSeed: vs, solution: name, today: () => '2026-01-01' });
        const bad = RUN.game.checkExpect(def.solutions[name].expect, p.result);
        if (!bad.length) ok++; else lines.push(name + ' ' + k + ' seed ' + vs + ': ' + bad.join('; '));
      }
      assert.ok(ok >= 2, `${name} on ${k}: met its expectation on ${ok} of 3 seeds`);
      met += ok; n += groups[k].length;
    }
    const need = def.solutions[name].expect.rate || 0.9;
    assert.ok(met / n >= need, `${name}: ${met} of ${n}`);
  }
  t.diagnostic(lines.length ? 'misses (noise): ' + lines.join(' | ') : 'no misses');
});

test('§3.7 calibration: the constants file was calibrated on this engine and its pass rates meet the rules (reference ≥ 95% goal within par; misconceptions pass par ≤ 5%)', () => {
  const R = LC.l12.passRates;
  assert.ok(LC.seeds >= 40, 'calibrated with ' + LC.seeds + ' seeds per variant');
  assert.ok(R.reference.goalPar >= 0.95, 'reference ' + R.reference.goalPar);
  for (const name of Object.keys(def.solutions)) {
    const e = def.solutions[name].expect;
    assert.ok(R[name], 'no pass rate for ' + name);
    if ((e.par === false || e.goal === false) && typeof e.rate !== 'number') assert.ok(R[name].goalPar <= 0.05, name + ' passes par on ' + R[name].goalPar);
    assert.ok(R[name].expect >= (e.rate || 0.9), name + ' meets its expect on ' + R[name].expect);
  }
  // The demo mean passes the four shape features (the reference sketch), and each T is reached well before D.
  for (const tOff of [4, 5, 6]) {
    const f = K.sketch.features(K.sketch.resample(LC.l12.demoMean[tOff].map((y, m) => [m, y])), { tOff });
    assert.deepEqual([f.F1, f.F2, f.F3, f.F4], [true, true, true, true], 'demo mean, tOff ' + tOff);
  }
  for (const T of [400, 500, 600]) assert.ok(LC.l12.reach[T].max <= LC.l12.D[T] - 1, 'T ' + T + ' reached at ' + LC.l12.reach[T].max + ' min');
});

test('the demo is the scripted test run: ×4 at 0, off at tOff, controls locked; its copies per mRNA and curve feed the Expert number and the sketch accuracy', () => {
  const vs = sample(1)['T500/tOff5'][0];
  const r = new RUN.LevelRunner({ def, variantSeed: vs, attempt: 1 }).start();
  while (r.phase !== 'predict') { if (r.beat) r.storySkip(); r.next(); }
  assert.equal(r.currentItem().id, 'ppm', 'the Expert number comes before the sketch');
  assert.ok(r.lock('ppm', 21).ok);
  const sketch = LC.l12.demoMean[5].map((y, m) => [m, Math.round(y)]);
  assert.ok(r.lock('sketch', sketch).ok);
  assert.deepEqual(r.answers.sketch.features, [true, true, true, true]);
  r.next();
  assert.equal(r.phase, 'demo');
  const cell = r.startDemo();
  assert.equal(cell.command({ type: 'setPromoter', gene: 'lacY', level: 1 }).error, 'locked', 'the student only watches');
  let offAt = -1;
  while (!r.halted()) {
    cell.step();
    const g = cell.observe().geneById.lacY;
    if (offAt < 0 && g.level === 'off' && cell.tick > 1) offAt = cell.tick;
  }
  assert.equal(offAt, 5 * 60 + 1, 'off from minute 5');
  assert.equal(cell.tick, 20 * 60, 'the demo stops at 20 min');
  assert.equal(r.checkDemo(), true);
  const d = r.demo.result;
  assert.equal(d.curve.length, 81);
  assert.ok(d.ppm > 15 && d.ppm < 28, 'copies per mRNA ' + d.ppm);
  assert.ok(d.curve[80] > d.curve[20] * 1.3, 'LacY kept rising after the switch-off');
  assert.equal(typeof r.answers.ppm.answer, 'number');
  assert.equal(r.answers.ppm.answer, d.ppm, 'the Expert number is judged against this demo');
  assert.equal(r.answers.ppm.correct, Math.abs(21 - d.ppm) / d.ppm <= 0.3);
});

test('the deadline locks the dial; a met goal runs a 10-min settle and ends "done"; a missed one ends "deadline" at D', () => {
  const vs = sample(1)['T400/tOff4'][0];
  const v = def.variant(vs);
  const play = (level) => {
    const r = new RUN.LevelRunner({ def, variantSeed: vs, attempt: 1 }).start();
    const c = r.run.cell;
    r.phaseIndex = def.phases.indexOf('run');
    c.command({ type: 'setPromoter', gene: 'lacY', level });
    let rejectedAfterD = null;
    while (!r.run.endReason) {
      if (c.tick === v.D * 60 + 5) rejectedAfterD = c.command({ type: 'setPromoter', gene: 'lacY', level: 'off' }).error || 'accepted';
      c.step();
    }
    return { r, rejectedAfterD };
  };
  const on = play(4);
  assert.equal(on.r.run.endReason, 'done');
  assert.equal(on.r.run.endTick, (v.D + 10) * 60);
  assert.equal(on.rejectedAfterD, 'locked');
  assert.equal(on.r.monitorResult.goal, true);
  assert.equal(on.r.monitorResult.onAtDeadline, true);
  assert.equal(on.r.beatLines('outro'), def.story.extra.keptOn, 'the gene was on at the deadline: the other outro');
  const weak = play(0.25);
  assert.equal(weak.r.run.endReason, 'deadline');
  assert.equal(weak.r.run.endTick, v.D * 60);
  assert.equal(weak.r.monitorResult.goal, false);
  assert.equal(weak.r.beatLines('outro'), def.story.extra.missed, 'a missed target: the outro does not say the gene was switched off');
});

test('HUD texts (run, settle, demo; long and short forms) are filled for every variant and pass the level lint', () => {
  for (let s = 0; s < 100; s++) {
    const v = def.variant(K.variantSeed(s, def.id, 0));
    const states = [null, { tick: 0, count: 4, m: 0 }, { tick: 400, count: v.T + 10, m: 30, reached: true },
      { tick: v.D * 60 + 30, count: 900, m: 40, reached: true, settle: true }, { demo: true, tick: 700, count: 800, m: 44 }];
    for (const st of states) {
      const h = def.hud(v, st);
      for (const text of [h.goal.text, h.goal.short, h.timer.text, h.timer.short, h.counter.text, h.counter.short].filter((x) => x !== undefined)) {
        assert.ok(text.length <= 40 && !/[{}!]/.test(text) && !N.TELEOLOGY.test(text), text);
      }
    }
  }
});

test('narrator rule l12.settle speaks only after the deadline, with lacY off and its mRNA still there, and it is reached', () => {
  const rule = def.narratorRules.find((x) => x.key === 'l12.settle');
  const facts = OBS.createFacts();
  const scenario = (vs, script) => {
    const r = new RUN.LevelRunner({ def, variantSeed: vs, attempt: 1 }).start();
    const c = r.run.cell, v = r.variant;
    let fired = 0;
    while (!r.run.endReason) {
      script(c, v);
      c.step();
      const lv = { phase: 'run', monitor: r.run.monitor.save(), variant: v };
      if (rule.when(OBS.facts(c, facts), null, c.tick, lv)) {
        fired++;
        const g = c.observe().geneById.lacY;
        assert.ok(c.tick >= v.D * 60 && g.level === 'off' && g.mRNA + g.nascent > 0, 'l12.settle at tick ' + c.tick);
      }
    }
    return fired;
  };
  const vs = sample(1)['T400/tOff4'][0];
  // ×2, switched off a minute before the deadline: after it, the leftover mRNA is still read.
  const late = scenario(vs, (c, v) => {
    if (c.tick === 0) c.command({ type: 'setPromoter', gene: 'lacY', level: 2 });
    if (c.tick === (v.D - 1) * 60) c.command({ type: 'setPromoter', gene: 'lacY', level: 'off' });
  });
  assert.ok(late > 0, 'the settle line is reachable');
  // Kept on at ×4 through the deadline: new mRNA is still being made, so the line must not speak.
  const on = scenario(vs, (c) => { if (c.tick === 0) c.command({ type: 'setPromoter', gene: 'lacY', level: 4 }); });
  assert.equal(on, 0);
  assert.deepEqual(LV.lintText(def).filter((x) => /narratorRules/.test(x.where)), []);
});
