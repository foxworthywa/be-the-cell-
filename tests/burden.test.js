// The cost of making a protein the cell does not need (f1–f3): ribosomes busy
// with a useless protein are not making anything else, so growth slows in
// proportion to the useless share of the proteome. 8 h settle, 12 h average.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { SEEDS, SETTLE, WINDOW, warm, fmt, mean } = H;

function measure(seed, cfg, useless) {
  const c = warm(seed, cfg);
  c.advance(SETTLE);
  let lam = 0, frac = 0;
  for (let i = 0; i < WINDOW; i++) {
    c.step();
    lam += c.k.lambda;
    for (const id of useless) frac += H.proteomeFraction(c, id);
  }
  return { lambda: lam / WINDOW, fraction: frac / WINDOW };
}

// Mean over set C of the growth change and the useless proteome fraction.
const base = {};
function arm(cfg, useless) {
  const rows = SEEDS.C.map((seed) => {
    if (!base[seed]) base[seed] = measure(seed, undefined, []).lambda;
    const r = measure(seed, cfg, useless);
    return { dLam: r.lambda / base[seed] - 1, fraction: r.fraction };
  });
  return { dLam: mean(rows.map((r) => r.dLam)), fraction: mean(rows.map((r) => r.fraction)) };
}

const fliC = (o) => ({ genes: { fliC: o } });
const points = [];

test('f1: a useless protein slows growth: flagellin ×1 by 4–10%, ×4 by 16–27% (set C)', (t) => {
  const x1 = arm(fliC({ level: 1 }), ['fliC']);
  const x4 = arm(fliC({ level: 4 }), ['fliC']);
  points.push(x1, x4);
  t.diagnostic(`fliC ×1: ${fmt(100 * x1.dLam, 1)}% at ${fmt(100 * x1.fraction, 2)}% of proteome; ×4: ${fmt(100 * x4.dLam, 1)}% at ${fmt(100 * x4.fraction, 2)}%`);
  assert.ok(x1.dLam <= -0.04 && x1.dLam >= -0.10, `fliC ×1 changes growth by ${fmt(100 * x1.dLam, 1)}%`);
  assert.ok(x4.dLam <= -0.16 && x4.dLam >= -0.27, `fliC ×4 changes growth by ${fmt(100 * x4.dLam, 1)}%`);
});

test('f2: growth falls about linearly with the useless fraction, about 2% per 1% of proteome (fliC 3–40%)', (t) => {
  // Beyond ×4 the test raises the rate cap and the RBS (test only; the UI never offers these).
  points.push(arm(fliC({ level: 2 }), ['fliC']));
  for (const rbs of [4, 8, 16]) points.push(arm(Object.assign(fliC({ rate_perS: 0.6, rbs }), { params: { rateCap: 0.6 } }), ['fliC']));
  const xs = points.map((p) => p.fraction), ys = points.map((p) => -p.dLam);
  const slopes = points.map((p) => -p.dLam / p.fraction);
  // Least-squares line through (fraction, slowdown), with the reference cell at the origin.
  const X = [0].concat(xs), Y = [0].concat(ys);
  const mx = mean(X), my = mean(Y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < X.length; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  const r2 = sxy * sxy / (sxx * syy);
  t.diagnostic(`points (fraction %, slowdown %): ${points.map((p) => `(${fmt(100 * p.fraction, 1)}, ${fmt(-100 * p.dLam, 1)})`).join(' ')}`);
  t.diagnostic(`slopes ${slopes.map((s) => fmt(s, 2)).join(' ')}; fit slope ${fmt(sxy / sxx, 2)}, R² ${fmt(r2, 4)}`);
  assert.ok(Math.min(...xs) <= 0.04 && Math.max(...xs) >= 0.35, `fractions span ${fmt(100 * Math.min(...xs), 1)}–${fmt(100 * Math.max(...xs), 1)}%`);
  for (const s of slopes) assert.ok(s >= 1.6 && s <= 2.4, `slowdown per unit useless fraction ${fmt(s, 2)}`);
  assert.ok(r2 >= 0.98, `linear fit R² ${fmt(r2, 4)}`);
});

test('f3: lac enzymes made without lactose cost growth like any useless protein (lacY + lacZ ×1)', (t) => {
  const r = arm({ genes: { lacY: { level: 1 }, lacZ: { level: 1 } } }, ['lacY', 'lacZ']);
  t.diagnostic(`lacY + lacZ ×1: ${fmt(100 * r.dLam, 1)}% at ${fmt(100 * r.fraction, 2)}% of proteome (Dekel & Alon: −4.5% at 2.2%)`);
  assert.ok(r.dLam <= -0.03 && r.dLam >= -0.09, `lacY + lacZ ×1 without lactose changes growth by ${fmt(100 * r.dLam, 1)}%`);
});
