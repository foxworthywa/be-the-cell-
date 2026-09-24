// Level 1.7, "Nobody's in charge" (LEVELS §7.7, §16; §12.1 L-3, L-11, L-13), the parts that need no
// long runs: the schedules (every lactose phase comes after both sugars and lasts at least three
// times the wild type's p90 lag), the configs (the student's design, par on the normal lac genes
// with the same engine seed), the lac cistron lengths, the truth table's answer against the
// calibrated strains and its marking, the scores and flags, HUD texts, the calibration, and the
// lac-region drawings. The solutions and the narrator run in level-1-7-runs.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/game/btc-level-kit.js');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const LC = require('../src/levels/btc-level-constants.js');
const N = require('../src/shared/btc-narrate.js');
const CAT = require('../src/engine/btc-catalog.js');
const { Cell } = require('../src/engine/btc-cell.js');
const D = require('../src/app/btc-designer.js');
const def = LV.validate(require('../src/levels/btc-level-1-7.js'));

const L = LC.l17;
const ANSWER = { wt: { glc: 0, lac: 1 }, dlacI: { glc: 1, lac: 1 }, Oc: { glc: 1, lac: 1 }, Is: { glc: 0, lac: 0 } };

test('L-3: four templates, jittered; every lactose phase follows both sugars and lasts ≥ LMIN; runs of 13–19 h (13.6–18.6 with LMIN 250); truth-table rows', () => {
  const seen = new Set();
  for (let s = 0; s < 500; s++) {
    const vs = K.variantSeed(s, def.id, 0);
    const v = def.variant(vs);
    assert.deepEqual(def.variant(vs), v);
    assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
    seen.add(v.template);
    const base = def.templates[v.template];
    assert.deepEqual(v.phases.map((p) => p[0]), base.map((p) => p[0]));
    assert.equal(v.phases[0][0], 'B', 'the run opens in both sugars');
    v.phases.forEach(([kind, min], i) => {
      assert.equal(min % 5, 0);
      if (kind === 'L') {
        assert.equal(v.phases[i - 1][0], 'B', 'a lactose phase comes after both sugars');
        assert.ok(min >= L.LMIN, `L ${min} < LMIN ${L.LMIN}`);
        assert.ok(v.phases[i - 1][1] >= 90);
      } else assert.ok(min >= 60);
    });
    const h = def.totalTicks(v) / 3600;
    assert.ok(h >= 13 && h <= 19, `${h} h`);
    assert.equal(v.rows.length, 3);
    assert.ok(v.rows.includes('wt') && v.rows.includes('dlacI'));
    assert.deepEqual([...v.rows, v.extraRow].sort(), ['Is', 'Oc', 'dlacI', 'wt']);
    const tv = def.textVars(v);
    assert.equal(tv.hours, Math.round(h));
  }
  assert.deepEqual([...seen].sort(), ['T1', 'T2', 'T3', 'T4']);
});

test('configs: the task cell runs the design (the Commander\'s by default), par the normal lac genes on the same engine seed; the schedule is the phases', () => {
  const v = def.variant(K.variantSeed(3, def.id, 0));
  const task = def.config(v, 'task'), par = def.config(v, 'par'), mine = def.config(v, 'task', { design: def.designRef });
  assert.equal(task.strain, 'm2-lac');
  assert.deepEqual(task.design, def.designStart);
  assert.deepEqual(par.design, def.designRef);
  assert.equal(par.seed, task.seed, 'par and the student\'s cell share their noise');
  assert.deepEqual(mine, par);
  assert.equal(task.flags.controls, 'locked');
  const sp = def.spans(v);
  assert.deepEqual(task.schedule.map((e) => e.tick), sp.slice(1).map((p) => p.t0));
  for (let i = 1; i < sp.length; i++) assert.deepEqual(task.schedule[i - 1].cmd, Object.assign({ type: 'setMedium' }, def.media[sp[i].kind]));
  assert.deepEqual(task.medium, Object.assign({ aminoAcids_mM: 0 }, def.media.B));
  const c = new Cell(task);
  assert.equal(c.observe().genes.length, 9);
  assert.deepEqual(c.observe().lac.design.lac, def.designStart.lac);
  const lc = def.labConfig(v, { phase: 'run' });
  assert.equal(lc.readOnlyGenes, true);
  assert.equal(lc.controls.genes, false);
  assert.deepEqual(lc.bands.map((b) => [b.t0, b.t1, b.token]), sp.map((p) => [p.t0, p.t1, 'band-' + p.kind]));
});

test('the lac cistron lengths match the catalog (lac synthesis in the waste measure weighs by length)', () => {
  const genes = CAT.STRAINS['m2-lac'].genes;
  for (const id of ['lacZ', 'lacY', 'lacA']) assert.equal(def.lacLengths[id], genes.find((g) => g.id === id).length, id);
});

test('the truth table: its answer is what the calibrated strains did; marking, Expert rows and the prediction flags', () => {
  // "LacZ made" is at least 5% of the induced wild type's LacZ; "almost none" at most 1% (§7.7.14; the cells, 3 h in each medium).
  for (const row of Object.keys(ANSWER)) {
    for (const col of ['glc', 'lac']) {
      const [lo, hi] = L.truth[row][col];
      if (ANSWER[row][col] === 1) assert.ok(lo >= 0.05, `${row} ${col}: ${lo}–${hi}`); else assert.ok(hi <= 0.01, `${row} ${col}: ${lo}–${hi}`);
    }
  }
  const it = def.predictions.find((x) => x.id === 'tt');
  assert.deepEqual(it.answer, ANSWER);
  const v = def.variant(K.variantSeed(5, def.id, 0));
  const all = RUN.game.markTable(it, ANSWER, v);
  assert.equal(all.P, 1); assert.equal(all.correct, true); assert.equal(all.expertAll, true);
  assert.equal(all.coreTotal, 6);
  const noExtra = JSON.parse(JSON.stringify(ANSWER)); delete noExtra[v.extraRow];
  const m2 = RUN.game.markTable(it, noExtra, v);
  assert.equal(m2.correct, true); assert.equal(m2.expertAll, false, 'the Expert row left empty');
  const oneWrong = JSON.parse(JSON.stringify(ANSWER)); oneWrong.dlacI.glc = 0;
  assert.ok(Math.abs(RUN.game.markTable(it, oneWrong, v).P - 5 / 6) < 1e-9);
  const missing = JSON.parse(JSON.stringify(ANSWER)); delete missing.wt;
  assert.ok(RUN.game.markTable(it, missing, v).error);
  // Flags from the table.
  const m = { goal: true, dbl: 7, lag: 50, wf: 0.003, rBL: 0.2, curve: [0], design: def.designRef, lactoseOk: true };
  const par = { dbl: 7, lag: 50, wf: 0.003, curve: [0] };
  const flagsFor = (value) => def.score(v, m, { predictions: { tt: Object.assign({ locked: true }, RUN.game.markTable(it, value, v)) }, debrief: {} }, { par }).flags.map((f) => f.id);
  assert.deepEqual(flagsFor(ANSWER), []);
  assert.deepEqual(flagsFor(Object.assign({}, ANSWER, { dlacI: { glc: 0, lac: 0 } })), ['PRED_REPRESSOR_AS_ACTIVATOR']);
  assert.deepEqual(flagsFor(Object.assign({}, ANSWER, { Oc: { glc: 0, lac: 1 } })), ['PRED_OPERATOR_IRRELEVANT']);
});

test('§7.7.6 scores: the par design scores E = 1; growth, lag and waste each pull E down; Expert bits; design flags', () => {
  const v = def.variant(K.variantSeed(9, def.id, 0));
  const par = { dbl: 7, lag: 50, wf: 0.003, curve: [0] };
  const base = { goal: true, dbl: 7, lag: 50, wf: 0.003, rBL: 0.2, curve: [0], design: def.designRef, lactoseOk: true };
  const tt = Object.assign({ locked: true }, RUN.game.markTable(def.predictions[0], ANSWER, v));
  const sc = (m, crp) => def.score(v, Object.assign({}, base, m), { predictions: { tt, crp: crp ? { locked: true, correct: true } : undefined }, debrief: {} }, { par });
  assert.equal(sc({}).E, 1);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(sc({ dbl: 7 * 0.9 }).E, 0), 'growth at 90% of par is 0');
  assert.ok(Math.abs(sc({ dbl: 7 * 0.94 }).sub.growth - 0.5) < 1e-9);
  assert.ok(near(sc({ lag: 1.25 * 50 + 5 }).sub.lag, 1));
  assert.ok(near(sc({ lag: 1.25 * 50 + 5 + 50 }).sub.lag, 0));
  assert.ok(near(sc({ wf: 1.5 * 0.003 + 0.001 }).sub.waste, 1));
  assert.ok(near(sc({ wf: 1.5 * 0.003 + 0.011 }).sub.waste, 0));
  assert.equal(sc({ wf: 0.05 }).E, 0, 'E is the worst of the three');
  assert.equal(sc({}).X, 1);
  assert.equal(sc({}, true).X, 3);
  assert.equal(sc({ rBL: L.rBLMax + 0.01 }, true).X, 2);
  assert.equal(sc({ goal: false }).X & 1, 0);
  const ids = (s) => s.flags.map((f) => f.id);
  assert.deepEqual(ids(sc({ design: def.designStart })), ['DESIGN_ALWAYS_ON']);
  assert.deepEqual(ids(sc({ design: { lac: { promoter: 1, operator: true, crpSite: true }, lacI: { allele: 'Is', promoter: 1 } } })), ['DESIGN_NEVER_ON']);
  assert.equal(def.missReason({ goal: false, dormant: false, lactoseOk: false }), def.text.result.missLactose);
  assert.equal(def.missReason({ goal: true }), null);
});

test('HUD texts: the phase and how the cell grows, no growth word before the first minute, "Run to the end" until the end; all pass the level lint', () => {
  for (let s = 0; s < 40; s++) {
    const v = def.variant(K.variantSeed(s, def.id, 0));
    const total = def.totalTicks(v);
    const states = [null, { tick: 0, pi: 0, lambda60: 0 }, { tick: 3000, pi: 0, lambda60: 1.1e-4 }, { tick: 9000, pi: 1, lambda60: 3e-5 },
      { tick: 12000, pi: 1, lambda60: 1e-6 }, { tick: total, pi: v.phases.length - 1, lambda60: 1e-4 }];
    for (const st of states) {
      const h = def.hud(v, st);
      for (const text of [h.goal.text, h.goal.short, h.goal.sub, h.timer.text, h.timer.short, h.counter.text, h.counter.short, h.action && h.action.text, h.action && h.action.short].filter(Boolean)) {
        assert.ok(text.length <= 60 && !/[{}!]/.test(text) && !N.TELEOLOGY.test(text), text);
      }
      assert.ok(h.goal.short.length <= 24, h.goal.short);
      const tick = st ? st.tick : 0;
      if (tick < 60) assert.ok(!/growing|slowed|stopped/.test(h.goal.text), 'no growth word at tick ' + tick + ': ' + h.goal.text);
      assert.equal(!!h.action, tick < total);
    }
  }
});

test('§3.7 / §16 calibration: λL, the lag and LMIN (≥ 3 × p90), the glucose-first threshold, and pass rates meet the rules', () => {
  assert.ok(L.lambdaLacRef > 0.5 * LC.l11.lambdaRef && L.lambdaLacRef < LC.l11.lambdaRef, 'λL ' + L.lambdaLacRef);
  assert.ok(L.lagP90 > 0 && L.LMIN >= 3 * L.lagP90 && L.LMIN < 3 * L.lagP90 + 5, `LMIN ${L.LMIN}, p90 ${L.lagP90}`);
  assert.equal(L.LMIN % 5, 0);
  assert.ok([0.25, 0.5].includes(L.rBLMax));
  assert.ok(L.rBL.crp[1] <= L.rBLMax + 0.05 && L.rBL.noCrp[0] > L.rBLMax, `rB/L ${JSON.stringify(L.rBL)} vs ${L.rBLMax}`);
  assert.ok(L.totalHours[0] >= 13 && L.totalHours[1] <= 19);
  const R = L.passRates;
  assert.ok(R.reference.goalPar >= 0.95);
  for (const name of ['commander', 'noRepressor', 'lockedOff']) assert.ok(R[name].goalPar <= 0.05, name + ' ' + R[name].goalPar);
  for (const name of Object.keys(R)) assert.ok(R[name].expect >= 0.9, name + ' ' + R[name].expect);
});

test('the lac-region drawings: palette tokens only, ≤ 4 KB, labelled parts; each truth-table strain outlines what differs', () => {
  const words = require('../src/app/btc-content.js').lacRegion;
  for (const d of [def.designRef, def.designStart, { lac: { promoter: 2, operator: true, crpSite: false }, lacI: { allele: 'Is', promoter: 10 } }]) {
    for (const state of [null, { bound: true, crp: true, inducer: true }, { bound: false, crp: false }]) {
      const s = D.regionSvg(d, state, { words, title: words.title });
      assert.ok(s.length <= 4096, s.length + ' bytes');
      assert.ok(!/#[0-9a-f]{3,6}\b/i.test(s), 'no raw colours');
      assert.ok(s.includes(d.lac.operator ? '>' + words.operator + '<' : '>' + words.noOperator + '<'));
      assert.ok(s.includes(d.lac.crpSite ? '>' + words.crp + '<' : '>' + words.noCrp + '<'));
      assert.ok(s.includes('>' + words.promoter + '<'));
    }
  }
  assert.ok(!D.strainSvg('wt').includes('stroke-width="2.2"'), 'the normal strain has nothing outlined');
  for (const row of ['dlacI', 'Oc', 'Is']) assert.ok(D.strainSvg(row).includes('stroke-width="2.2"'), row + ' outlines its difference');
  assert.equal(D.summary(def.designStart, def.text.design), 'This design: lac promoter ×4 · operator absent · repressor gene deleted · CRP site absent (promoter ignores CRP).');
});
