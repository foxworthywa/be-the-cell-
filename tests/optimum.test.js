// Natural expression sits near the growth optimum (r6), and glycolytic flux is
// set by ATP demand rather than by enzyme amount (r3, Koebmann et al. 2002).
// 8 h settle, 12 h average, set C.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { SEEDS, SETTLE, WINDOW, warm, fmt, mean } = H;

function measure(seed, cfg) {
  const c = warm(seed, cfg);
  c.advance(SETTLE);
  let lam = 0, headroom = 0;
  for (let i = 0; i < WINDOW; i++) {
    c.step();
    lam += c.k.lambda;
    headroom += c.k.Cgly / c.flux.hexoseToGlycolysis;
  }
  return { lambda: lam / WINDOW, headroom: headroom / WINDOW };
}

// Mean growth change over set C for one gene at one level (memoised: r3 and r6 share arms).
const base = {}, memo = {};
function dLam(id, level) {
  const key = id + '×' + level;
  if (memo[key] === undefined) {
    memo[key] = mean(SEEDS.C.map((seed) => {
      if (!base[seed]) base[seed] = measure(seed);
      return measure(seed, { genes: { [id]: { level } } }).lambda / base[seed].lambda - 1;
    }));
  }
  return memo[key];
}

test('r3: glycolytic flux is controlled by ATP demand: extra PtsG barely matters, less PtsG slows growth', (t) => {
  const up = dLam('ptsG', 2), down = dLam('ptsG', 0.5);
  const headroom = mean(SEEDS.C.map((seed) => base[seed].headroom));
  t.diagnostic(`ptsG ×2 ${fmt(100 * up, 1)}%, ×0.5 ${fmt(100 * down, 1)}%; C_gly/F at reference ${fmt(headroom, 2)}`);
  assert.ok(Math.abs(up) < 0.03, `ptsG ×2 changes growth by ${fmt(100 * up, 1)}%`);
  assert.ok(down <= -0.05 && down >= -0.30, `ptsG ×0.5 changes growth by ${fmt(100 * down, 1)}%`);
  assert.ok(headroom >= 1.4 && headroom <= 1.9, `glycolytic capacity / flux at reference ${fmt(headroom, 2)}`);
});

test('r6: natural expression sits near the growth optimum: ×2 gains nothing, ×0.5 costs ≥ 5% (ptsG, gly, aaSyn)', (t) => {
  for (const id of ['ptsG', 'gly', 'aaSyn']) {
    const up = dLam(id, 2), down = dLam(id, 0.5);
    t.diagnostic(`${id}: ×2 ${fmt(100 * up, 1)}%, ×0.5 ${fmt(100 * down, 1)}%`);
    assert.ok(up <= 0.02, `${id} ×2 changes growth by ${fmt(100 * up, 1)}%`);
    assert.ok(down <= -0.05, `${id} ×0.5 changes growth by ${fmt(100 * down, 1)}%`);
  }
});
