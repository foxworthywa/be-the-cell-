// Level 1.1, "Starving next to a feast" (LEVELS §7.1; §12.1 L-3, L-4, L-5, L-11, L-13): the six
// unlabelled candidates are shown in a random order, lettered and coloured by that order and
// named only once their job has been seen; the reference, the Expert run and a student who
// reasons through the membrane genes meet their expectations, "switch everything on" and
// "switch it off before any protein exists" do not; the calibration passed its own checks;
// the score follows §7.1.9; HUD texts never name a hidden gene; and the level narrator rules
// are true whenever they speak, with no line naming a gene that is still hidden.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/game/btc-level-kit.js');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const LC = require('../src/levels/btc-level-constants.js');
const N = require('../src/shared/btc-narrate.js');
const OBS = require('../src/engine/btc-observe.js');
const PARAMS = require('../src/engine/btc-params.js');
const { Cell } = require('../src/engine/btc-cell.js');
const C = require('../src/app/btc-content.js');
const PAL = require('../src/app/btc-palette.js');
const def = LV.validate(require('../src/levels/btc-level-1-1.js'));

const CAND = ['ptsG', 'aaImp', 'lacY', 'lacZ', 'fliC', 'araE'];
const MEMBRANE = ['ptsG', 'aaImp', 'lacY', 'araE'];

/** Variant seeds as the app draws them, by where ptsG falls among the membrane candidates in display order (0 = first). */
function byRank(perRank) {
  const out = [];
  const need = perRank.slice();
  for (let i = 0; i < 5000 && need.some((x) => x > 0); i++) {
    const vs = K.variantSeed(i, def.id, 0);
    const v = def.variant(vs);
    const r = v.order.filter((id) => MEMBRANE.includes(id)).indexOf('ptsG');
    if (need[r] > 0) { need[r]--; out.push({ vs, rank: r }); }
  }
  return out;
}

/** Everything a hidden gene could be called by, lowercased: its symbol and its lab words. */
function namesOf(id) {
  const g = C.genes[id];
  return [id, g.name, g.short, g.noun, g.genePhrase, g.symbol].filter((x) => typeof x === 'string' && x.length > 2).map((x) => x.toLowerCase());
}

test('L-3: variants are orders of the six candidates (deterministic, JSON-safe, hundreds of orders); letters, colours and names follow the order', () => {
  const orders = new Set();
  for (let s = 0; s < 500; s++) {
    const vs = K.variantSeed(s, def.id, 0);
    const v = def.variant(vs);
    assert.deepEqual(def.variant(vs), v);
    assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
    assert.deepEqual(v.order.slice().sort(), CAND.slice().sort());
    orders.add(v.order.join(','));
    v.order.forEach((id, k) => assert.equal(def.letterOf(v, id), 'ABCDEF'[k]));
  }
  assert.ok(orders.size >= 300, `${orders.size} distinct orders in 500 attempts`);

  const v = def.variant(K.variantSeed(7, def.id, 0));
  const cfg = def.config(v, 'task');
  assert.equal(cfg.strain, 'm2-l11');
  assert.equal(cfg.flags.backupGlucoseUptake, true);
  for (const id of CAND) assert.deepEqual(cfg.genes[id], { level: 'off', initial: { clear: true, protein: 0 } });
  assert.deepEqual(cfg.variant.order, v.order);
  const c = new Cell(cfg);
  assert.equal(c.observe().genes.length, 8, 'the lab genes and the araE decoy');
  for (const id of CAND) assert.equal(c.observe().geneById[id].protein, 0, id + ' starts with no protein');

  // The lab config hides names, orders and colours the cards by display, and names a gene once its job was seen.
  const lc0 = def.labConfig(v, { phase: 'run', revealed: {} });
  assert.equal(lc0.showNames, false);
  assert.deepEqual(lc0.displayOrder, v.order);
  assert.equal(lc0.colorBy, 'display');
  assert.equal(lc0.mediumRows.glucose, 'locked');
  const ids = c.observe().genes.map((g) => g.id);
  const m0 = C.geneModel(ids, lc0);
  assert.deepEqual(m0.visible, v.order, 'only the six candidates show, in display order');
  v.order.forEach((id, k) => {
    assert.equal(m0.letter(id), 'ABCDEF'[k]);
    assert.equal(m0.color(id), PAL.DISPLAY_COLORS[k]);
    assert.equal(m0.words(id).name, 'Gene ' + 'ABCDEF'[k]);
    assert.equal(m0.words(id).job, 'Unknown');
  });
  const found = v.order[3];
  const m1 = C.geneModel(ids, def.labConfig(v, { phase: 'run', revealed: { [found]: true } }));
  assert.equal(m1.words(found).name, C.genes[found].name, 'a revealed gene takes its name');
  assert.equal(m1.letter(found), 'D', 'and keeps its letter and place');
  const phr = C.narratorPhrases(m1);
  assert.equal(phr[found].open, true);
  for (const id of v.order.filter((x) => x !== found)) assert.ok(!phr[id].open && phr[id].slot === v.order.indexOf(id), id);
  const mEnd = C.geneModel(ids, def.labConfig(v, { phase: 'complete' }));
  for (const id of CAND) assert.equal(mEnd.words(id).name, C.genes[id].name, 'every candidate is named at the end');
});

test('L-4/L-5: every solution meets its expectation on orders with the transporter first to last among the membrane genes', (t) => {
  const seeds = byRank([1, 1, 2, 2]);
  const lines = [];
  for (const name of Object.keys(def.solutions)) {
    let ok = 0;
    for (const { vs, rank } of seeds) {
      const p = RUN.game.playHeadless(def, { variantSeed: vs, solution: name, today: () => '2026-01-01' });
      const bad = RUN.game.checkExpect(def.solutions[name].expect, p.result);
      if (!bad.length) ok++; else lines.push(`${name} rank ${rank} seed ${vs}: ${bad.join('; ')}`);
    }
    assert.ok(ok >= seeds.length - (name === 'reference' ? 0 : 1), `${name}: met its expectation on ${ok} of ${seeds.length} orders: ${lines.join(' | ')}`);
  }
  t.diagnostic(lines.length ? 'misses: ' + lines.join(' | ') : 'no misses');
});

test('§3.7 calibration: λref, the starving state, the reasoned keep time and pass rates meet the rules', () => {
  const L = LC.l11;
  assert.equal(L.lambdaRef, PARAMS.values().lambda_ref);
  assert.ok(L.keepMin >= 8 && L.keepMin <= 15, 'keepMin ' + L.keepMin);
  if (L.starving) {
    assert.ok(L.starving.l10[0] >= 0.15 && L.starving.l10[1] <= 0.45, 'starving growth ' + L.starving.l10.join('–'));
    assert.ok(L.starving.E10[0] >= 0.05);
    assert.ok(L.seen[2].max < L.keepMin + 5, 'ptsG ×2 is seen within the reasoned keep time');
  }
  const R = L.passRates;
  assert.ok(R, 'pass rates were recorded');
  assert.ok(R.reference.goalPar >= 0.95, 'reference ' + R.reference.goalPar);
  for (const name of ['shotgun', 'impatient']) assert.ok(R[name].goalPar <= 0.05, name + ' passes par on ' + R[name].goalPar);
  for (const name of Object.keys(R)) assert.ok(R[name].expect >= 0.9, name + ' meets its expect on ' + R[name].expect);
});

test('§7.1.9 scoring: E = 1 − 0.35 per experiment over 3; P from both predictions; Expert needs a second job seen in ≤ 4 experiments; flags', () => {
  const v = def.variant(K.variantSeed(1, def.id, 0));
  const pred = (ok1, ok2, mc1, mc2) => ({ p1: { locked: true, correct: ok1, mc: mc1 || null, option: 0 }, p2: { locked: true, correct: ok2, mc: mc2 || null, option: 0 } });
  const base = { goal: true, n: 3, second: null, offBeforeProteinTick: -1, shotgunTick: -1, maxOn: 1 };
  const sc = (m, p, d) => def.score(v, Object.assign({}, base, m), { predictions: p || pred(true, true), debrief: d || {} });
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => Math.round(sc({ n }).E * 100) / 100), [1, 1, 1, 0.65, 0.3, 0]);
  assert.equal(sc({}, pred(true, false)).P, 0.5);
  assert.equal(sc({ n: 4, second: 'lacY' }).X, 1);
  assert.equal(sc({ n: 5, second: 'lacY' }).X, 0);
  assert.equal(sc({ n: 2, second: null }).X, 0);
  const ids = (s) => s.flags.map((f) => f.id);
  assert.deepEqual(ids(sc({ offBeforeProteinTick: 30, shotgunTick: 0, maxOn: 6 }, pred(false, false, 'DNA_DIRECT', 'DNA_DIRECT'))), ['OFF_BEFORE_PROTEIN', 'SHOTGUN', 'PRED_DNA_DIRECT']);
  assert.deepEqual(ids(sc({}, pred(false, true, 'ENERGY_FIRST'))), ['PRED_ENERGY_FIRST']);
  assert.deepEqual(ids(sc({}, null, { 'l11.d1': { firstMc: 'CELL_DECIDES', first: 3 }, 'l11.d2': { firstMc: 'PROTEIN_AS_FOOD', first: 1 } })),
    ['DEB_PROTEIN_AS_FOOD', 'DEB_CELL_DECIDES']);
});

test('HUD texts (searching, found, done; long and short) pass the level lint and never name a candidate', () => {
  // The goal names the job ("the glucose transporter"), never a gene: no symbol, no protein name.
  const forbidden = CAND.flatMap((id) => [id, C.genes[id].short].filter(Boolean).map((x) => x.toLowerCase()));
  for (let s = 0; s < 50; s++) {
    const v = def.variant(K.variantSeed(s, def.id, 0));
    for (const st of [null, { tick: 0, n: 0 }, { tick: 600, n: 2, found: false, lambda60: 5e-5 }, { tick: 1500, n: 3, found: true, lambda60: 1.1e-4 },
      { tick: 3000, n: 6, found: true, lambda60: 1.2e-4, done: true }, { tick: 10800, n: 9, found: false, lambda60: 4e-5 }]) {
      const h = def.hud(v, st);
      for (const text of [h.goal.text, h.goal.short, h.timer.text, h.timer.short, h.counter.text, h.counter.short]) {
        assert.ok(text.length <= 60 && !/[{}!]/.test(text) && !N.TELEOLOGY.test(text), text);
        for (const w of forbidden) assert.ok(!text.toLowerCase().includes(w), `${text} names ${w}`);
      }
      assert.ok(h.goal.short.length <= 28, 'the short goal fits a 360 px HUD: ' + h.goal.short);
    }
  }
});

test('the level narrator rules are true whenever they speak, and no line names a gene that is still hidden', () => {
  const facts = OBS.createFacts();
  const seen = new Set();
  const seeds = byRank([0, 1, 0, 1]);
  const scenarios = ['reference', 'expert', 'reasoned', 'lactoseRoute', 'shotgun'];
  for (const { vs } of seeds) {
    for (const name of scenarios) {
      const r = new RUN.LevelRunner({ def, variantSeed: vs, attempt: 1 }).start();
      const c = r.run.cell, v = r.variant, sol = def.solutions[name];
      const ids = c.observe().genes.map((g) => g.id);
      // The rules as the runner hands them to the narrator, reading this loop's monitor (the runner itself is still at the intro).
      const lv = { phase: 'run', monitor: null, variant: v };
      const rules = def.narratorRules.map((x) => {
        const rule = { key: x.key, template: x.template, gene: typeof x.gene === 'string' ? x.gene : null, preempt: !!x.preempt };
        rule.when = (f, mm, tt) => { const ok = x.when(f, mm, tt, lv); if (ok && typeof x.gene === 'function') rule.gene = x.gene(f, mm, tt, lv) || null; return ok; };
        return rule;
      });
      const mem = N.createMemory({ showNames: false });
      const limit = Math.min(def.limitMin * 60, 90 * 60);
      for (let t = 0; t < limit && !r.run.monitor.end(); t++) {
        if (t % sol.every === 0) sol.act(c.observe(), c.tick, { command: (cmd) => c.command(cmd) }, v);
        c.step();                                                 // the run's recorder feeds the monitor
        N.ingest(mem, c.takeEvents(), c.tick);
        if (t % 5) continue;
        const m = lv.monitor = r.run.monitor.save();
        mem.phrases = C.narratorPhrases(C.geneModel(ids, def.labConfig(v, { phase: 'run', revealed: m.revealed })));
        const out = N.narrate(OBS.facts(c, facts), mem, c.tick, rules);
        const vw = c.observe();
        const where = `${out.key} in ${name} (seed ${vs}) at ${c.tick}: "${out.text}"`;
        // No line names a candidate whose job has not been seen.
        for (const id of CAND) if (!m.revealed[id]) for (const w of namesOf(id)) assert.ok(!out.text.toLowerCase().includes(w), where + ' names hidden ' + id);
        if (!out.key || !out.key.startsWith('l11.')) continue;
        seen.add(out.key);
        const g = out.gene ? vw.geneById[out.gene] : null;
        if (/^l11\.reveal/.test(out.key)) {
          assert.ok(g && g.functionSeen && m.revealed[out.gene] && c.tick - m.revealTick[out.gene] <= 60, where);
          assert.ok(out.text.includes(C.genes[out.gene].noun) || out.text.includes(C.genes[out.gene].short || '\u0000'), where + ' names the revealed gene');
        }
        if (out.key === 'l11.nofit') assert.ok(g && out.gene !== 'ptsG' && g.level !== 'off' && g.protein > 0 && !m.revealed[out.gene], where);
        if (out.key === 'l11.nosplit') assert.ok(vw.lactose.inside > 0 && !m.revealed.lacZ, where);
        if (out.key === 'l11.busy') assert.ok(g && ['lacY', 'lacZ'].includes(out.gene) && g.level !== 'off' && !m.revealed[out.gene], where);
      }
    }
  }
  for (const key of ['l11.revealGlucose', 'l11.revealLactose', 'l11.nofit']) assert.ok(seen.has(key), key + ' was never reached: ' + [...seen].join(', '));
});
