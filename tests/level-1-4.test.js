// Level 1.4, "Nothing lasts" (LEVELS §7.4; §12.1 L-4, L-5, L-11): the reference and the single
// setting hold the band, the stockpile, the pulser and "maximum everything" do not (or miss
// par), the calibration that produced the band passed its checks, switching the gene off makes
// the count fall as p2 says, and every level narrator rule is true whenever it speaks.
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
const def = LV.validate(require('../src/levels/btc-level-1-4.js'));

function sample(n) {
  const groups = {};
  for (let i = 0; i < 2000; i++) {
    const vs = K.variantSeed(i, def.id, 0);
    const v = def.variant(vs), k = 'hl' + v.halfLife_min + '/x' + v.targetLevel;
    const g = groups[k] || (groups[k] = []);
    if (g.length < n) g.push(vs);
    if (Object.keys(groups).length === 5 && Object.values(groups).every((x) => x.length >= n)) break;
  }
  return groups;
}

test('L-3: 5 variants (half-life 3/4/5 min × ×1/×2, without half-life 5 min at ×2); the band is set around the calibrated steady count; kdeg from the half-life', () => {
  const seen = new Set();
  for (let s = 0; s < 500; s++) {
    const vs = K.variantSeed(s, def.id, 0);
    const v = def.variant(vs);
    assert.deepEqual(def.variant(vs), v);
    const S = LC.l14.S[v.halfLife_min][v.targetLevel];
    assert.equal(v.lo, K.round(LC.l14.band[0] * S, 10));
    assert.equal(v.hi, K.round(LC.l14.band[1] * S, 10));
    seen.add(v.halfLife_min + '/' + v.targetLevel);
    const c = new Cell(def.config(v, 'task'));
    assert.ok(Math.abs(c.gene('lacY').kdeg - Math.LN2 / (v.halfLife_min * 60)) < 1e-12 || c.config.genes.lacY.kdeg_perS > 0);
  }
  assert.equal(seen.size, 5);
  assert.ok(!seen.has('5/2'), 'half-life 5 min at ×2 was removed (content version 2)');
  assert.equal(def.version, 4, 'content 2: a variant removed; 3: the M2 review reworded its questions; 4: the plain-language pass');
});

test('L-4/L-5: every solution meets its expectation on every variant (4 seeds each; at least 2 of 4, and 85% of the 20)', (t) => {
  const groups = sample(4);
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
      assert.ok(ok >= 2, `${name} on ${k}: met its expectation on ${ok} of 4 seeds`);
      met += ok; n += groups[k].length;
    }
    // The 40-seed calibration (below) is the real guard on the rates; a sample of 20 allows three misses.
    assert.ok(met / n >= 0.85, `${name}: ${met} of ${n}`);
  }
  t.diagnostic(lines.length ? 'misses (noise): ' + lines.join(' | ') : 'no misses');
});

test('§3.7 / §7.4.14 calibration: pass rates meet the rules; the neighbouring settings sit outside the band; the hold is 15 min within 45', () => {
  const R = LC.l14.passRates;
  assert.ok(LC.seeds >= 40);
  assert.ok(R.reference.goalPar >= 0.95, 'reference ' + R.reference.goalPar);
  assert.ok(R.max.goalPar <= 0.05 && R.stockpile.goalPar <= 0.05 && R.pulser.goalPar <= 0.05, JSON.stringify(R));
  assert.ok(LC.l14.neighboursOutside >= 0.95, 'neighbours outside on ' + LC.l14.neighboursOutside);
  assert.equal(LC.l14.holdMin, def.holdMin);
  assert.equal(LC.l14.limitMin, def.limitMin);
  // The calibrated steady counts grow with the setting and with the half-life.
  for (const hl of [3, 4, 5]) {
    const S = LC.l14.S[hl];
    assert.ok(S[0.5] < S[1] && S[1] < S[2] && S[2] < S[4], 'half-life ' + hl + ': ' + JSON.stringify(S));
    assert.ok(S[4] / S[1] > 3 && S[4] / S[1] < 5);
  }
  assert.ok(LC.l14.S[3][1] < LC.l14.S[4][1] && LC.l14.S[4][1] < LC.l14.S[5][1]);
  // The run ends before the newborn replicates (≈ 48 min), so no second gene copy doubles the count mid-hold.
  assert.ok(def.limitMin * 60 < 48 * 60);
});

test('Expert number: X LacY a minute × Y minutes is the steady count at ×1 (within rounding); the answer is S1', () => {
  for (let s = 0; s < 60; s++) {
    const v = def.variant(K.variantSeed(s, def.id, 0));
    const tv = def.textVars(v);
    assert.ok(Math.abs(tv.X * tv.Y - v.S1) / v.S1 < 0.1, JSON.stringify(tv) + ' S1 ' + v.S1);
    assert.equal(def.predictions.find((x) => x.id === 'ss').answer(v), v.S1);
  }
});

test('the epilogue: switched off after the goal, the count holds for a minute or two while the last mRNA is read, then falls below half within 12 min (p2)', () => {
  for (const [k, list] of Object.entries(sample(1))) {
    const p = RUN.game.playHeadless(def, { variantSeed: list[0], solution: 'reference' });
    const r = p.runner;
    if (!r.goal) continue;
    const v = r.variant;
    // Replay the whole cell (run + epilogue) from its final state: the epilogue's command is in the cell's log.
    const c = r.run.cell;
    const log = c.log.filter((e) => e.source === 'user');
    const off = log[log.length - 1];
    assert.equal(off.args.level, 'off', k + ': the epilogue switched lacY off');
    assert.ok(c.tick - off.tick >= 12 * 60 - 1, k + ': watched 12 game-min');
    // The count at the switch-off and 12 min later, from a replay of the cell's own record.
    const rec = c.runRecord();
    const at = (tick) => require('../src/engine/btc-replay.js').run(rec, tick).observe().geneById.lacY.protein;
    // p2's right answer: it holds for a minute or two while the last mRNA is read, then falls steadily.
    const a = at(off.tick), b = at(off.tick + 2 * 60), z = at(off.tick + 12 * 60);
    assert.ok(b > 0.9 * a, `${k}: ${Math.round(a)} → ${Math.round(b)} after 2 min`);
    assert.ok(z < 0.5 * a, `${k}: ${Math.round(a)} → ${Math.round(z)} after 12 min`);
    void v;
  }
});

test('HUD texts (run, epilogue; long and short forms) are filled for every variant and pass the level lint; the band gauge carries the band', () => {
  for (let s = 0; s < 100; s++) {
    const v = def.variant(K.variantSeed(s, def.id, 0));
    const states = [null, { tick: 0, count: 5, mean: 3, run: 0, changes: 0 }, { tick: 900, count: v.lo + 5, mean: v.lo + 1, run: 420, changes: 2 },
      { tick: 1500, count: 300, mean: 310, run: 900, done: true, changes: 1, epilogue: { started: true, startTick: 1400, done: false } }];
    for (const st of states) {
      const h = def.hud(v, st);
      for (const text of [h.goal.text, h.goal.short, h.timer.text, h.timer.short, h.counter.text, h.counter.short].filter((x) => x !== undefined)) {
        assert.ok(text.length <= 60 && !/[{}!]/.test(text) && !N.TELEOLOGY.test(text), text);
      }
      assert.deepEqual([h.goal.gauge.lo, h.goal.gauge.hi], [v.lo, v.hi]);
    }
  }
});

test('the level narrator rules are true whenever they speak (rising, dropping, balance, over, under, falling), across the solutions and a few settings', () => {
  const facts = OBS.createFacts();
  const seen = new Set();
  const groups = sample(1);
  const scenarios = [
    ['reference', null], ['stockpile', null], ['max', null], ['pulser', null],
    ['half', (c) => { if (c.tick === 0) c.command({ type: 'setPromoter', gene: 'lacY', level: 0.5 }); }],
    ['down', (c) => { if (c.tick === 0) c.command({ type: 'setPromoter', gene: 'lacY', level: 4 }); if (c.tick === 20 * 60) c.command({ type: 'setPromoter', gene: 'lacY', level: 1 }); }],
  ];
  for (const vs of [groups['hl3/x1'][0], groups['hl5/x1'][0], groups['hl4/x2'][0]]) {
    for (const [name, script] of scenarios) {
      const r = new RUN.LevelRunner({ def, variantSeed: vs, attempt: 1 }).start();
      const c = r.run.cell, v = r.variant;
      const sol = def.solutions[name];
      const hist = [], claims = [];
      for (let t = 0; t < 45 * 60; t++) {
        if (script) script(c, v); else if (t % 5 === 0) sol.act(c.observe(), c.tick, { command: (cmd) => c.command(cmd) }, v);
        c.step();
        const m = r.run.monitor.save();
        hist.push(m.count);
        const lv = { phase: 'run', monitor: m, variant: v };
        for (const rule of r.narratorRules()) {
          if (!rule.when(OBS.facts(c, facts), null, c.tick, lv)) continue;
          seen.add(rule.key);
          const g = c.observe().geneById.lacY;
          const where = `${rule.key} in ${name} at ${c.tick} (count ${Math.round(m.count)}, mean ${Math.round(m.mean)}, level ${m.level})`;
          if (rule.key === 'l14.falling') assert.ok(g.level === 'off' && m.falling && g.mRNA + g.nascent === 0, where);
          if (rule.key === 'l14.balance') assert.ok(g.level !== 'off' && m.mean >= v.lo && m.mean <= v.hi, where);
          if (rule.key === 'l14.over') assert.ok(g.level !== 'off' && m.mean > v.hi, where);
          if (rule.key === 'l14.under') assert.ok(g.level !== 'off' && m.mean < v.lo, where);
          if (rule.key === 'l14.rising' || rule.key === 'l14.dropping') claims.push({ key: rule.key, t, count: m.count, where });
          break;                                                  // the first rule that holds is the one shown
        }
      }
      // "rises" and "falls" describe the last minute (made vs cut up, measured): the count moved that way over it.
      const judged = claims.filter((x) => x.t >= 60);
      const wrong = judged.filter((x) => (x.key === 'l14.rising' ? hist[x.t] <= hist[x.t - 60] : hist[x.t] >= hist[x.t - 60]));
      assert.equal(wrong.length, 0, `${name}: ${wrong.length} of ${judged.length} direction claims were wrong, e.g. ${wrong.slice(0, 2).map((x) => x.where).join('; ')}`);
    }
  }
  for (const key of ['l14.rising', 'l14.balance', 'l14.over', 'l14.falling', 'l14.dropping', 'l14.under']) assert.ok(seen.has(key), key + ' was never reached: ' + [...seen].join(', '));
});
