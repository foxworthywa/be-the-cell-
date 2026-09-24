// The ATP budget: where the energy goes (e1, e3), that the books balance on
// every tick (e2), that amino acids are conserved (m1), the ribosome identity
// (r2), and that the numerics converge (n2).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { BTC, Cell, SETTLE, WINDOW, HOUR, warm, avg, fmt, randomCommand } = H;

const NAMES = BTC.metabolism.LEDGER;

function ledgerShares(cfg) {
  const c = warm(1, cfg);
  c.advance(SETTLE);
  const sums = new Float64Array(6);
  let spent = 0;
  for (let i = 0; i < WINDOW; i++) {
    c.step();
    for (let j = 0; j < 6; j++) sums[j] += c.ledger.perS[j];
    spent += c.ledger.spent_perS;
  }
  const shares = {};
  NAMES.forEach((n, j) => { shares[n] = sums[j] / spent; });
  return { shares, spend: spent / WINDOW };
}

const ranked = (shares) => Object.keys(shares).sort((a, b) => shares[b] - shares[a]);
const show = (shares) => ranked(shares).map((n) => `${n} ${fmt(100 * shares[n], 1)}%`).join(', ');

test('e1: translation is the largest ATP expense of a growing cell', (t) => {
  const ref = ledgerShares();
  t.diagnostic(`reference: spend ${fmt(ref.spend)} ATP/s; ${show(ref.shares)}`);
  const order = ranked(ref.shares);
  assert.equal(order[0], 'translation', `largest category is ${order[0]}`);
  const margin = ref.shares.translation / ref.shares[order[1]];
  assert.ok(margin >= 1.25, `translation is only ${fmt(margin, 2)}× the next category (${order[1]})`);
  assert.ok(ref.shares.transcription <= 0.06, `transcription takes ${fmt(100 * ref.shares.transcription, 1)}%`);
  assert.ok(ref.spend >= 7e5 && ref.spend <= 1.3e6, `total spend ${fmt(ref.spend)} ATP/s`);
  for (const [label, cfg] of [['fliC ×4', { genes: { fliC: { level: 4 } } }], ['ptsG ×0.25', { genes: { ptsG: { level: 0.25 } } }]]) {
    const r = ledgerShares(cfg);
    t.diagnostic(`${label}: ${show(r.shares)}`);
    assert.equal(ranked(r.shares)[0], 'translation', `${label}: largest category is ${ranked(r.shares)[0]}`);
  }
});

test('e3: when chloramphenicol blocks growth, upkeep becomes the largest expense', (t) => {
  const c = warm(1);
  c.command({ type: 'setDrug', drug: 'chloramphenicol', dose: 1 });
  c.advance(60);
  const sums = new Float64Array(6);
  for (let i = 0; i < 600; i++) { c.step(); for (let j = 0; j < 6; j++) sums[j] += c.ledger.perS[j]; }
  const total = sums.reduce((a, b) => a + b, 0), shares = {};
  NAMES.forEach((n, j) => { shares[n] = sums[j] / total; });
  t.diagnostic(show(shares));
  assert.equal(ranked(shares)[0], 'upkeep', `largest category under chloramphenicol is ${ranked(shares)[0]}`);
});

test('e2/m1/r2: over 24 h of random commands the ATP books balance, amino acids are conserved and flux = ribosomes × distance, every tick', (t) => {
  const c = warm(2);
  const s = BTC.prng.seedStream(99, 'e2-commands');
  let worstATP = 0, worstAA = 0, worstRib = 0, divisions = 0, commands = 0;
  for (let i = 1; i <= 24 * HOUR; i++) {
    if (i % 1800 === 0) { c.command(randomCommand(s)); commands++; }
    const AA0 = c.AA, M0 = c.mass, D0 = c.D, gen0 = c.gen;
    c.step();
    const k = c.k, led = c.ledger, dt = c.dt;
    // e2: N_A·ΔE = fermentation + floor − Σ spending
    const atp = led.supply + led.floor - led.spent - k.NA * (c.E - k.e0);
    const atpRel = Math.abs(atp) / Math.max(led.supply, led.spent, 1);
    if (atpRel > worstATP) worstATP = atpRel;
    // r2: aa polymerised = elongating ribosomes × odometer advance
    const poly = c.flux.aaPolymerised * dt;
    if (poly > 0) {
      const rel = Math.abs(poly - k.Relong * k.dD) / poly;
      if (rel > worstRib) worstRib = rel;
    }
    if (c.gen !== gen0) { divisions++; continue; }
    // r2 against the stored odometer, allowing for rounding in D itself
    const dD = c.D - D0;
    if (poly > 0) assert.ok(Math.abs(poly - k.Relong * dD) <= 1e-12 * poly + k.Relong * 2.3e-16 * c.D,
      `tick ${c.tick}: aaPolymerised ${poly} vs R_elong·ΔD ${k.Relong * dD}`);
    // m1: (aaMade + aaImported)·dt − ΔAA − ΔM = 0
    const aa = (c.flux.aaMade + c.flux.aaImported) * dt - (c.AA - AA0) - (c.mass - M0);
    const aaRel = Math.abs(aa) / M0;
    if (aaRel > worstAA) worstAA = aaRel;
  }
  t.diagnostic(`${commands} commands, ${divisions} divisions; worst ATP imbalance ${fmt(worstATP)} (relative), aa imbalance ${fmt(worstAA)} of M, ribosome identity ${fmt(worstRib)}`);
  assert.ok(worstATP <= 1e-9, `e2: ATP ledger off by ${worstATP} (relative)`);
  assert.ok(worstAA <= 1e-9, `m1: amino-acid balance off by ${worstAA} of M`);
  assert.ok(worstRib <= 1e-12, `r2: aaPolymerised vs R_elong·ΔD off by ${worstRib}`);
});

test('n2: the answer does not depend on the step size: substeps 4 vs 16 and dt 2 s give the same doubling time', (t) => {
  const Td = (params) => {
    const c = new Cell({ seed: 1, start: 'steady', params });
    const n = Math.round(SETTLE / c.dt), m = Math.round(WINDOW / c.dt);
    c.advance(n);
    let l = 0, emin = 1, emax = 0;
    for (let i = 0; i < m; i++) { c.step(); l += c.k.lambda; if (c.E < emin) emin = c.E; if (c.E > emax) emax = c.E; }
    return { Td: Math.LN2 / (l / m) / 60, emin, emax };
  };
  const k4 = Td({ substeps: 4 }), k16 = Td({ substeps: 16 }), dt2 = Td({ dt: 2, substeps: 16 });
  t.diagnostic(`Td: K4 ${fmt(k4.Td, 2)}, K16 ${fmt(k16.Td, 2)}, dt 2 K16 ${fmt(dt2.Td, 2)} min`);
  assert.ok(Math.abs(k4.Td / k16.Td - 1) < 0.01, `K 4 vs 16: Td ${fmt(k4.Td, 2)} vs ${fmt(k16.Td, 2)} min`);
  assert.ok(Math.abs(dt2.Td / k16.Td - 1) < 0.02, `dt 2 s: Td ${fmt(dt2.Td, 2)} vs ${fmt(k16.Td, 2)} min`);
  assert.ok(dt2.emin > 0 && dt2.emax < 1, `dt 2 s: E left (0, 1): [${dt2.emin}, ${dt2.emax}]`);
  assert.throws(() => new Cell({ seed: 1, start: 'cold', params: { substeps: 2 } }), (e) => e.name === 'ConfigError' && e.path === 'params.substeps');
  assert.throws(() => new Cell({ seed: 1, start: 'cold', params: { dt: 3, substeps: 16 } }), (e) => e.name === 'ConfigError');
  assert.throws(() => new Cell({ seed: 1, start: 'cold', params: { m_V: 0 } }), (e) => e.name === 'ConfigError');
});
