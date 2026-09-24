// Level 1.2, "Milk is on its way" (PROLOGUE §6.2; LEVELS §12.1 L-4, L-5, L-11): the variants and their cells,
// every solution on every variant, the calibration behind the level's constants, the watch (one copy read
// into transporters until it is broken down; the gene off, the copies still read), the milk's arrival at
// minute D (the switch locks, a story beat, growth on milk sugar), the HUD and the level's narrator rules.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/game/btc-level-kit.js');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const LC = require('../src/levels/btc-level-constants.js');
const N = require('../src/shared/btc-narrate.js');
const OBS = require('../src/engine/btc-observe.js');
const F = require('../src/app/btc-format.js');
const { Cell } = require('../src/engine/btc-cell.js');
const def = LV.validate(require('../src/levels/btc-level-1-2.js'));
const L = LC.l12, ECO = LC.economy;

/** n variant seeds per target T, found as the app draws them (attempt indices from 0). */
function sample(n) {
  const groups = {};
  for (let i = 0; i < 2000; i++) {
    const vs = K.variantSeed(i, def.id, 0);
    const k = 'T' + def.variant(vs).T;
    const g = groups[k] || (groups[k] = []);
    if (g.length < n) g.push(vs);
    if (Object.keys(groups).length === L.T.length && Object.values(groups).every((x) => x.length >= n)) break;
  }
  return groups;
}

/** A runner brought to its run (the story read, the watch played as a student would). */
function toRun(vs) {
  const r = new RUN.LevelRunner({ def, variantSeed: vs, attempt: 1 }).start();
  for (let guard = 0; r.phase !== 'run' && guard < 100; guard++) {
    if (r.beat) { r.storySkip(); r.next(); continue; }
    if (r.phase === 'watch') RUN.game.playWatch(r, {}, 40000);
    assert.ok(r.next().ok, 'Continue in ' + r.phase);
  }
  assert.equal(r.phase, 'run');
  while (r.beat) { r.storySkip(); r.next(); }             // the story as the run opens
  return r;
}

test('L12-1: three targets from the calibration, each with its milk minute D and Expert ceiling; deterministic, JSON-safe; the cells', () => {
  const seen = new Set();
  for (let s = 0; s < 300; s++) {
    const vs = K.variantSeed(s, def.id, 0);
    const v = def.variant(vs);
    assert.deepEqual(def.variant(vs), v);
    assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
    assert.ok(L.T.includes(v.T), 'T ' + v.T);
    assert.equal(v.D, L.D[v.T]);
    assert.equal(v.tMax, L.tMax[v.T]);
    seen.add(v.T);
    if (s < 20) {
      const task = def.config(v, 'task'), watch = def.config(v, 'watch');
      // The run: at minute D the glucose goes, milk sugar comes and the switch locks; the watch cell has no schedule.
      assert.deepEqual(task.schedule, [
        { tick: v.D * 60, cmd: { type: 'setMedium', glucose_mM: 0, lactose_mM: ECO.lactose_mM } },
        { tick: v.D * 60, cmd: { type: 'setControls', controls: 'locked' } },
      ]);
      assert.equal(watch.schedule, undefined);
      const c = new Cell(task), g = c.observe().geneById;
      assert.deepEqual(c.config.variant, { levelId: '1.2', content: def.version, seed: vs, T: v.T, D: v.D, tMax: v.tMax });
      assert.equal(g.lacY.protein, 0, 'no lactose transporters yet');
      assert.equal(g.lacY.level, 'off');
      // The lactose splitter is already made, and counted in whole four-chain enzymes where the student sees it.
      assert.ok(Math.abs(g.lacZ.protein - L.lacZReady) <= 1, 'LacZ chains ' + g.lacZ.protein);
      assert.equal(F.machines(g.lacZ), Math.round(g.lacZ.protein / 4));
    }
  }
  assert.equal(seen.size, L.T.length);
  assert.deepEqual(L.T.slice().sort((a, b) => a - b), L.T, 'the targets rise');
});

test('L12-2 (L-4/L-5): every solution meets its expectation on every target (5 seeds each; at least 4 of 5, and its rate overall)', (t) => {
  const groups = sample(5);
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
      assert.ok(ok >= 4, `${name} on ${k}: met its expectation on ${ok} of 5 seeds (${lines.join(' | ')})`);
      met += ok; n += groups[k].length;
    }
    const need = def.solutions[name].expect.rate || 0.9;
    assert.ok(met / n >= need, `${name}: ${met} of ${n} (${lines.join(' | ')})`);
  }
  t.diagnostic(lines.length ? 'misses (noise): ' + lines.join(' | ') : 'no misses');
});

test('L12-3 (§3.7): the constants were calibrated on this engine and their pass rates meet the rules', () => {
  const R = L.passRates;
  assert.equal(L.v, 2, 'the economy version of 1.2');
  assert.ok(LC.seeds >= 40, 'calibrated with ' + LC.seeds + ' seeds per variant');
  assert.ok(R.reference.goalPar >= 0.95, 'reference goal within par on ' + R.reference.goalPar);
  assert.ok(L.expertRef >= 0.9, 'the reference meets the Expert objective on ' + L.expertRef);
  for (const name of Object.keys(def.solutions)) {
    const e = def.solutions[name].expect;
    assert.ok(R[name], 'no pass rate for ' + name);
    if (e.par === false || e.goal === false) assert.ok(R[name].goalPar <= 0.05, name + ' passes par on ' + R[name].goalPar);
    assert.ok(R[name].expect >= (e.rate || 0.9), name + ' meets its expect on ' + R[name].expect);
  }
  // About twenty transporters per copy; every target is enough to live on milk sugar; the milk comes late enough for
  // the target to be reached; Expert allows about a tenth over the target.
  assert.ok(L.ppm >= 15 && L.ppm <= 25, 'transporters per copy ' + L.ppm);
  assert.ok(L.T[0] >= L.Tenough, 'the lowest target ' + L.T[0] + ' vs enough ' + L.Tenough);
  for (const T of L.T) {
    assert.ok(L.D[T] >= 20 && L.D[T] <= 45, 'D ' + L.D[T]);
    assert.ok(L.tMax[T] > T && L.tMax[T] <= 1.2 * T, 'Tmax ' + L.tMax[T]);
  }
  assert.ok(L.parFree < L.parX, 'efficiency falls from parFree to par at parX');
  assert.ok(L.lacZReady >= 4 * 1000, 'LacZ ready: ' + L.lacZReady + ' chains');
});

test('L12-4: the watch — the outlined copy is read into about twenty transporters and broken down; switched off, the copies left are still read', () => {
  for (const vs of sample(1)['T' + L.T[1]].concat(sample(1)['T' + L.T[0]])) {
    const r = new RUN.LevelRunner({ def, variantSeed: vs, attempt: 1 }).start();
    while (r.phase !== 'watch') { if (r.beat) r.storySkip(); r.next(); }
    const seen = { left: 0 };
    const gates = RUN.game.playWatch(r, {
      watch: {
        every: 1,
        policy(view, tick, api, id) { if (id === 'w2b') seen.left = Math.max(seen.left, view.geneById.lacY.mRNA); },
      },
    }, 40000);
    const m = r.watchMon.save();
    assert.ok(gates['w1b:until'] > 0 && gates.w1b > gates['w1b:until'], 'the first copy is outlined, then read until it is gone');
    assert.equal(m.alive, false, 'the outlined copy is broken down when w1b opens');
    // One copy's life is chance (its break-down is random); the calibrated mean is about twenty transporters per copy.
    assert.ok(m.n >= 1 && m.n <= 150, 'read into ' + m.n + ' transporters');
    assert.ok(m.life > 0, 'the copy lasted ' + m.life + ' s');
    assert.ok(m.k > 0, 'copies were made meanwhile: ' + m.k);
    assert.ok(seen.left > 0, 'copies were still there after the switch-off');
    assert.ok(m.a > 0, 'transporters still arrived after the switch-off: ' + m.a);
    assert.ok(gates.w2b > gates.w1b, 'w2b opens when the last copy is gone');
    const g = r.watchCell.observe().geneById.lacY;
    assert.equal(g.mRNA + g.nascent, 0);
  }
});

test('L12-5: at minute D the milk arrives — the glucose goes, the switch locks, a story beat holds the run; it ends 20 min later with growth on milk sugar', () => {
  // A seed on which the reference meets the target (it misses on about 2% of runs: one copy more or less is chance).
  const vs = sample(5)['T' + L.T[2]].find((s) => RUN.game.playHeadless(def, { variantSeed: s, solution: 'reference', today: () => '2026-01-01' }).runner.monitorResult.goal);
  const r = toRun(vs), v = r.variant, c = r.run.cell;
  assert.equal(c.command({ type: 'setPromoter', gene: 'lacY', level: 4, source: 'user' }).error, undefined, 'the switch works before D');
  let lockedAfterD = null, beatAt = -1, lactoseAfter = -1, glucoseAfter = -1;
  while (!r.run.endReason) {
    if (r.beat && r.beat.mid) {
      if (beatAt < 0) { beatAt = c.tick; assert.equal(r.beat.name, 'milk'); assert.ok(r.halted(), 'the beat holds the run'); }
      r.storySkip(); r.next();
    }
    const g = c.observe().geneById.lacY;
    // The reference's rule: off when the transporters plus about ppm per copy still here reach the target.
    if (c.tick < v.D * 60 && g.level !== 'off' && g.protein + L.ppm * (g.mRNA + g.nascent) >= L.refMargin * v.T) {
      c.command({ type: 'setPromoter', gene: 'lacY', level: 'off', source: 'user' });
    }
    if (beatAt === c.tick) {
      // As the beat opens, the glucose is already gone and the switch already locked.
      assert.equal(c.observe().env.glucose_mM, 0);
      assert.equal(c.command({ type: 'setPromoter', gene: 'lacY', level: 4, source: 'user' }).error, 'locked');
    }
    if (c.tick === v.D * 60 + 5) {
      lockedAfterD = c.command({ type: 'setPromoter', gene: 'lacY', level: 4, source: 'user' }).error || 'accepted';
      const env = c.observe().env;
      lactoseAfter = env.lactose_mM; glucoseAfter = env.glucose_mM;
    }
    c.step();
  }
  assert.equal(beatAt, v.D * 60 + 1, 'the milk beat opens at minute D, once its commands have run');
  assert.equal(lockedAfterD, 'locked');
  assert.equal(glucoseAfter, 0);
  assert.equal(lactoseAfter, ECO.lactose_mM);
  assert.equal(r.run.endReason, 'done');
  assert.equal(r.run.endTick, (v.D + 20) * 60);
  const m = r.monitorResult;
  assert.equal(m.goal, true);
  assert.ok(m.growth >= 0.8 && m.growth <= 1.3, 'growth on milk sugar ' + m.growth);
  // The result sheet leads with that growth, then the copies against what was needed.
  const comp = def.score(v, m, { debrief: {} });
  const lead = def.resultLead(v, comp), lines = def.resultLines(v, comp);
  assert.match(lead[0], /^On milk sugar the cell grew at \d+% of its glucose speed\.$/);
  assert.match(lines[0], /copies/);
});

test('L12-6: HUD texts (watch, run, milk; long and short forms) are filled for every target and pass the level lint', () => {
  for (let s = 0; s < 60; s++) {
    const v = def.variant(K.variantSeed(s, def.id, 0));
    const states = [null, { tick: 0, count: 0, m: 0 }, { tick: 600, count: 1404, m: 104, made: 1500 },
      { tick: 1800, count: v.T + 10, m: 330, made: v.T * 1.3, reached: true }, { tick: v.D * 60 + 30, count: v.T, m: 330, milk: true, reached: true },
      { watch: true, step: 'w1', tick: 0, m: 0 }, { watch: true, step: 'w1b', watching: true, alive: true, n: 12, tick: 200, m: 40 },
      { watch: true, step: 'w1b', watching: true, alive: false, n: 37, tick: 600, m: 125 }, { watch: true, step: 'w2b', offTick: 590, a: 1125, tick: 800, m: 134 }];
    for (const st of states) {
      const h = def.hud(v, st);
      for (const text of [h.goal.text, h.goal.short, h.timer.text, h.timer.short, h.counter.text, h.counter.short].filter((x) => x !== undefined)) {
        assert.ok(text.length <= 40 && !/[{}!]/.test(text) && !N.TELEOLOGY.test(text), text);
      }
      if (st && !st.watch) assert.ok(h.goal.short.length <= 20, 'the short goal fits a phone: ' + h.goal.short);
    }
  }
});

test('L12-6: the level narrator rules speak only when true — copies read, copies left after the switch-off, the milk', () => {
  const rules = def.narratorRules;
  const facts = OBS.createFacts();
  const vs = sample(1)['T' + L.T[0]][0];
  const r = toRun(vs), c = r.run.cell, v = r.variant;
  const said = {};
  c.command({ type: 'setPromoter', gene: 'lacY', level: 4, source: 'user' });
  while (!r.run.endReason) {
    if (r.beat && r.beat.mid) { r.storySkip(); r.next(); }
    if (c.tick === 20 * 60) c.command({ type: 'setPromoter', gene: 'lacY', level: 'off', source: 'user' });
    c.step();
    const lv = { phase: 'run', monitor: r.run.monitor.save(), variant: v };
    const f = OBS.facts(c, facts), g = c.observe().geneById.lacY;
    for (const rule of rules) {
      if (!rule.when(f, null, c.tick, lv)) continue;
      said[rule.key] = (said[rule.key] || 0) + 1;
      if (rule.key === 'l12.leftover') assert.ok(g.level === 'off' && g.mRNA > 0, 'leftover at ' + c.tick);
      if (rule.key === 'l12.read') assert.ok(g.level !== 'off' && g.mRNA > 0, 'read at ' + c.tick);
      if (['l12.milk', 'l12.fed', 'l12.short'].includes(rule.key)) assert.ok(c.tick >= v.D * 60, rule.key + ' before the milk at ' + c.tick);
    }
  }
  for (const key of ['l12.read', 'l12.leftover', 'l12.milk']) assert.ok(said[key] > 0, key + ' is reachable');
  assert.deepEqual(LV.lintText(def).filter((x) => /narratorRules/.test(x.where)), []);
});
