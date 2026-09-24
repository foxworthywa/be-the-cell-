// Switching a gene off: the mRNA goes within minutes (a3), the protein stays
// and is only diluted by growth and division (a4), and it keeps rising for a
// while after transcription stops (c1).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { SEEDS, HOUR, warm, fmt, mean } = H;

const TD_REF = Math.LN2 / H.LAMBDA_REF;   // reference doubling time (s)
const fliCTotal = (g) => g.mature.count + g.nascent.len;

test('a3/a4: after fliC is switched off its mRNA vanishes in minutes; the protein never falls except at division and is diluted by growth (set B)', (t) => {
  const r10 = [], left20 = [], divRatios = [], dilution = [];
  let fell = null;
  for (const seed of SEEDS.B) {
    const c = warm(seed);
    const g = c.gene('fliC');
    c.command({ type: 'setPromoter', gene: 'fliC', level: 4 });
    c.advance(45 * 60);
    const m0 = fliCTotal(g);
    c.command({ type: 'setPromoter', gene: 'fliC', level: 'off' });
    let conc0 = 0;
    for (let s = 1; s <= 30 * 60 + Math.round(3 * TD_REF); s++) {
      const P = g.P, gen = c.gen;
      c.step();
      if (c.gen > gen) divRatios.push(g.P / P);
      else if (g.P < P && fell === null) fell = `seed ${seed}: fell from ${P} to ${g.P} at ${s} s without a division`;
      if (s === 600) r10.push(fliCTotal(g) / m0);
      if (s === 1200) left20.push(fliCTotal(g));
      if (s === 1800) conc0 = g.P / c.volume;
    }
    dilution.push(g.P / c.volume / conc0);
  }
  t.diagnostic(`a3: m(10 min)/m(0) ${fmt(mean(r10))}; m(20 min) ${fmt(mean(left20), 2)} molecules`);
  t.diagnostic(`a4: division ratios ${fmt(Math.min(...divRatios))}–${fmt(Math.max(...divRatios))} (${divRatios.length}); concentration after 3 Td ${dilution.map((x) => fmt(x)).join(' ')}`);
  assert.ok(mean(r10) >= 0.05 && mean(r10) <= 0.2, `a3: mean m(10 min)/m(0) = ${fmt(mean(r10))}`);
  assert.ok(mean(left20) <= 2, `a3: mean fliC mRNA left at 20 min = ${fmt(mean(left20), 2)}`);
  assert.equal(fell, null, 'a4: ' + fell);
  assert.ok(divRatios.length >= 16, `a4: only ${divRatios.length} divisions observed`);
  for (const x of divRatios) assert.ok(x >= 0.47 && x <= 0.53, `a4: a division kept ${fmt(x)} of the protein`);
  for (const x of dilution) assert.ok(x >= 0.11 && x <= 0.16, `a4: concentration after 3 Td fell to ${fmt(x)} of its value`);
});

test('c1: protein keeps rising for minutes after transcription stops, by the amount the remaining mRNA predicts (set C)', (t) => {
  const rows = [];
  for (const seed of SEEDS.C) {
    const c = warm(seed);
    const g = c.gene('fliC');
    c.command({ type: 'setPromoter', gene: 'fliC', level: 4 });
    c.advance(45 * 60);
    c.command({ type: 'setPromoter', gene: 'fliC', level: 'off' });
    c.step();                                              // the command applies at the start of this tick
    const P0 = g.P, made0 = g.pMade, m0 = fliCTotal(g), kInit = c.k.kInit;
    let made5 = 0;
    for (let s = 2; s <= HOUR; s++) { c.step(); if (s === 300) made5 = g.pMade - made0; }
    const rise = (g.pMade - made0) / P0;
    const predicted = m0 * g.rbs * kInit * 260 / P0;       // remaining mRNA × proteins each (k_init × mean lifetime)
    rows.push({ rise, ratio: rise / predicted, after5: 1 - made5 / (g.pMade - made0) });
  }
  t.diagnostic(`rise ${rows.map((r) => fmt(100 * r.rise, 1) + '%').join(' ')}; rise/predicted ${rows.map((r) => fmt(r.ratio, 2)).join(' ')}; share made after 5 min ${rows.map((r) => fmt(r.after5, 2)).join(' ')}`);
  for (const r of rows) {
    assert.ok(r.rise >= 0.08 && r.rise <= 0.25, `total rise after off ${fmt(100 * r.rise, 1)}%`);
    assert.ok(r.after5 >= 0.1, `only ${fmt(100 * r.after5, 1)}% of the rise came after 5 min`);
  }
  // The prediction counts proteins from the mRNA present at the switch; the ribosomes
  // already on it (≈43 s of transit ÷ 260 s of lifetime ≈ +17%) finish too, so single
  // seeds can sit just above 1.2. The claim is about the set-C mean.
  const ratio = mean(rows.map((r) => r.ratio));
  assert.ok(ratio >= 0.6 && ratio <= 1.2, `mean rise ÷ (m × b × k_init × 260 s) = ${fmt(ratio, 2)}`);

  // After a long steady state the rise is a smaller share of a larger protein pool.
  const c = warm(1);
  const g = c.gene('fliC');
  c.command({ type: 'setPromoter', gene: 'fliC', level: 4 });
  c.advance(10 * HOUR);
  c.command({ type: 'setPromoter', gene: 'fliC', level: 'off' });
  const P0 = g.P, made0 = g.pMade;
  c.advance(HOUR);
  const rise = (g.pMade - made0) / P0;
  t.diagnostic(`steady-state rise ${fmt(100 * rise, 1)}%`);
  assert.ok(rise >= 0.02 && rise <= 0.06, `rise after a 10 h steady state ${fmt(100 * rise, 1)}%`);
});
