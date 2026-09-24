// Level 1.7, "Nobody's in charge" (LEVELS §7.7; §12.1 L-4, L-5), the long runs: every solution
// meets its expectation on each schedule template (the par run shared between solutions, as
// the calibration does); the reference design is par, so it reproduces par's cell exactly;
// and the level narrator rules are true whenever they speak, judged from the lac region's own
// record rather than from the monitor that feeds them.
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
const def = LV.validate(require('../src/levels/btc-level-1-7.js'));

/** One variant seed per template, as the app draws them. */
function perTemplate(skip) {
  const out = {};
  let s = 0;
  for (let i = 0; i < 2000 && Object.keys(out).length < 4; i++) {
    const vs = K.variantSeed(i, def.id, 0);
    const t = def.variant(vs).template;
    if (!out[t] && s++ >= (skip || 0)) out[t] = vs;
  }
  return out;
}

test('L-4/L-5: every solution meets its expectation on each schedule template', (t) => {
  const seeds = perTemplate(0), parCache = {};
  const lines = [];
  for (const name of Object.keys(def.solutions)) {
    for (const [tpl, vs] of Object.entries(seeds)) {
      const p = RUN.game.playHeadless(def, { variantSeed: vs, solution: name, today: () => '2026-01-01', parCache });
      const bad = RUN.game.checkExpect(def.solutions[name].expect, p.result);
      if (bad.length) lines.push(`${name} ${tpl} seed ${vs}: ${bad.join('; ')}`);
    }
  }
  assert.equal(lines.length, 0, lines.join(' | '));
  t.diagnostic('templates ' + JSON.stringify(seeds));
});

test('the reference design is par: same design, same engine seed, same cell, so E = 1 by construction', () => {
  const vs = perTemplate(4).T3 || Object.values(perTemplate(4))[0];
  const p = RUN.game.playHeadless(def, { variantSeed: vs, solution: 'reference', today: () => '2026-01-01' });
  const r = p.runner;
  assert.equal(r.par.done, true);
  assert.equal(r.par.snapshot().finalHash, r.run.cell.hash());
  assert.equal(p.result.E, 1);
  const pr = r.parResult();
  assert.equal(pr.dbl, r.monitorResult.dbl);
});

test('the level narrator rules are true whenever they speak, judged from the lac region\'s last minute and what came after', () => {
  const vs = perTemplate(0).T3;                                   // T3 has both sugars after a lactose phase: the CRP line can speak
  const v = def.variant(vs), sp = def.spans(v), lamL = LC.l17.lambdaLacRef;
  const seen = new Set();
  for (const name of ['reference', 'commander', 'noRepressor', 'lockedOff']) {
    const design = def.fullDesign(def.solutions[name].design);
    const c = new Cell(def.config(v, 'task', { design }));
    const mon = def.monitor(v, { design });
    mon.start(c);
    const lv = { phase: 'run', monitor: null, design, variant: v };
    const rules = def.narratorRules.map((x) => ({ key: x.key, template: x.template, gene: x.gene || null, when: (f, m, t) => x.when(f, m, t, lv) }));
    const mem = N.createMemory({});
    const facts = OBS.createFacts();
    const hist = [];                                              // the lac region, tick by tick
    const claims = [];
    const total = def.totalTicks(v);
    while (c.tick < total) {
      c.step();
      mon.onTick(c);
      N.ingest(mem, c.takeEvents(), c.tick);
      const w = c.observe();
      hist.push({ bound: w.lac.operatorBound, copies: w.lac.operatorCopies, ind: w.lac.inducer_uM >= w.lac.inducerHalf_uM, cAMP: w.lac.cAMP, lacY: w.geneById.lacY.protein / w.cell.V_fL });
      if (c.tick % 30 || c.tick < 60) continue;
      lv.monitor = mon.save();
      const out = N.narrate(OBS.facts(c, facts), mem, c.tick, rules);
      if (!out.key || !out.key.startsWith('l17.')) continue;
      seen.add(out.key);
      const last = hist.slice(-60), share = (fn) => last.filter(fn).length / last.length;
      const where = `${out.key} in ${name} at ${c.tick} (${Math.round(c.tick / 60)} min)`;
      const kind = sp.find((p) => c.tick > p.t0 && c.tick <= p.t1).kind;
      switch (out.key) {
        case 'l17.repressed':
          assert.ok(design.lac.operator && design.lacI.allele !== 'deleted' && share((h) => h.bound >= h.copies) >= 0.95 && share((h) => h.ind) <= 0.2, where); break;
        case 'l17.induced':
          assert.ok(share((h) => h.bound === 0) >= 0.9 && share((h) => h.ind) >= 0.9, where); break;
        case 'l17.super':
          assert.ok(design.lacI.allele === 'Is' && w.lactose.inside > 0 && share((h) => h.bound >= h.copies) >= 0.9, where); break;
        case 'l17.noop': assert.equal(design.lac.operator, false, where); break;
        case 'l17.norep': assert.equal(design.lacI.allele, 'deleted', where); break;
        case 'l17.crp':
          assert.ok(kind === 'B' && design.lac.crpSite && share((h) => h.cAMP < 0.5) >= 0.9 && share((h) => h.bound === 0) >= 0.5, where); break;
        case 'l17.lag':
          // "few lac enzymes yet … until more are made": lactose only, slow now, and the permease that lets lactose in
          // (per fL of cell) is well below where it is by the end of the phase.
          assert.ok(kind === 'L' && lv.monitor.lambda60 < 0.5 * lamL, where);
          claims.push({ where, tick: c.tick, lacY: w.geneById.lacY.protein / w.cell.V_fL, end: sp.find((p) => c.tick > p.t0 && c.tick <= p.t1).t1 });
          break;
        default: break;
      }
    }
    for (const x of claims) {
      const later = hist[Math.min(hist.length, x.end) - 1];
      assert.ok(x.lacY < 0.8 * later.lacY, `${x.where}: LacY ${Math.round(x.lacY)} per fL, then ${Math.round(later.lacY)} at the phase's end`);
    }
  }
  for (const key of ['l17.repressed', 'l17.induced', 'l17.lag', 'l17.crp', 'l17.noop', 'l17.norep', 'l17.super']) assert.ok(seen.has(key), key + ' was never reached: ' + [...seen].join(', '));
});
