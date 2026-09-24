// Steady states: a protein settles where synthesis balances removal by
// dilution (and degradation, when there is any). Doubling the promoter roughly
// doubles the steady state (d1); the balance itself holds (d2); degradation at
// the growth rate halves it (d3). 8 h settle, 12 h average (spec §14).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { SEEDS, SETTLE, WINDOW, LAMBDA_REF, warm, fmt, mean } = H;

function steadyProtein(seed, id, level, extra) {
  const c = warm(seed, { genes: { [id]: Object.assign({ level }, extra || {}) } });
  const g = c.gene(id);
  c.advance(SETTLE);
  const made0 = g.pMade;
  let conc = 0, count = 0, lam = 0;
  for (let i = 0; i < WINDOW; i++) {
    c.step();
    conc += g.P / c.volume;
    count += g.P;
    lam += c.k.lambda;
  }
  return { conc: conc / WINDOW, count: count / WINDOW, lambda: lam / WINDOW, synthesis: (g.pMade - made0) / WINDOW };
}

const results = {};
function arm(seed, id, level, extra) {
  const key = [seed, id, level, JSON.stringify(extra || null)].join('|');
  if (!results[key]) results[key] = steadyProtein(seed, id, level, extra);
  return results[key];
}

test('d1: doubling promoter strength roughly doubles steady-state protein (fliC, ptsG, lacZ; set C)', (t) => {
  for (const id of ['fliC', 'ptsG', 'lacZ']) {
    const ratios = SEEDS.C.map((seed) => arm(seed, id, 2).conc / arm(seed, id, 1).conc);
    t.diagnostic(`${id} 2×/1× ${ratios.map((x) => fmt(x)).join(' ')}`);
    for (const x of ratios) assert.ok(x >= 1.7 && x <= 2.15, `${id}: 2×/1× steady-state concentration ${fmt(x)}`);
    assert.ok(mean(ratios) >= 1.75, `${id}: mean 2×/1× ratio ${fmt(mean(ratios))}`);
  }
});

test('d2: at steady state, synthesis equals dilution by growth (synthesis/(λ·count) ≈ 1)', (t) => {
  for (const id of ['fliC', 'ptsG', 'lacZ']) {
    const r = SEEDS.C.map((seed) => { const a = arm(seed, id, 1); return a.synthesis / (a.lambda * a.count); });
    t.diagnostic(`${id} ×1 synthesis/(λ·count) ${r.map((x) => fmt(x)).join(' ')}`);
    for (const x of r) assert.ok(Math.abs(x - 1) <= 0.07, `${id}: synthesis/(λ·count) = ${fmt(x)}`);
  }
});

test('d3: degradation at the growth rate halves the steady state, as synthesis/(λ + k_deg) predicts (fliC ×1)', (t) => {
  const r = SEEDS.C.map((seed) => arm(seed, 'fliC', 1, { kdeg_perS: LAMBDA_REF }).conc / arm(seed, 'fliC', 1).conc);
  t.diagnostic(`k_deg = λ_ref: ratio ${r.map((x) => fmt(x)).join(' ')}`);
  for (const x of r) assert.ok(x >= 0.43 && x <= 0.57, `steady state with k_deg = λ_ref is ${fmt(x)} of that without`);
});
