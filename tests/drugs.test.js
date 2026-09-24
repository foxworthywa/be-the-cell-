// Two antibiotics with distinct signatures (i1–i3). Rifampicin blocks RNA
// polymerase: no new mRNA, the old mRNA is read until it decays, so protein
// synthesis winds down over minutes. Chloramphenicol stalls ribosomes:
// translation stops at once while the mRNA stays. Set C.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { SEEDS, warm, avg, run, fmt, totalMRNA, spend, J } = H;

/** fliC ×4 for 30 min (a gene mid-rise), a 5 min baseline, then the drug at full dose. */
function dose(seed, drug) {
  const c = warm(seed);
  const fliC = c.gene('fliC');
  c.command({ type: 'setPromoter', gene: 'fliC', level: 4 });
  c.advance(1800);
  const base = avg(c, 300, { lam: H.lam, spend });
  const m0 = totalMRNA(c), J0 = J(c), E0 = c.E, made0 = fliC.pMade;
  c.command({ type: 'setDrug', drug, dose: 1 });
  const at = {};
  run(c, 2400, (x, s) => {
    if ([1, 180, 300, 600, 1200, 1500, 2400].includes(s)) {
      at[s] = { m: totalMRNA(x) / m0, J: J(x) / J0, lam: x.k.lambda / base.lam, spend: spend(x) / base.spend, E: x.E, made: fliC.pMade - made0, P: fliC.P };
    }
    if (s === 120) at[120] = { made: fliC.pMade - made0 };
  });
  return { at, E0 };
}

const runs = {};
const get = (seed, drug) => (runs[seed + drug] ??= dose(seed, drug));

test('i1: rifampicin: mRNA decays within minutes, translation winds down over ~20 min, a protein mid-rise keeps rising briefly then plateaus', (t) => {
  for (const seed of SEEDS.C) {
    const { at } = get(seed, 'rifampicin');
    const lateChange = (at[2400].made - at[1500].made) / at[1500].P;
    t.diagnostic(`seed ${seed}: mRNA ${fmt(at[600].m)} at 10 min; translation ${fmt(at[300].J)} at 5 min, ${fmt(at[1200].J)} at 20 min; λ ${fmt(at[300].lam)} at 5 min; ATP use ${fmt(at[300].spend)} / ${fmt(at[1200].spend)}; fliC made 2–3 min ${fmt(at[180].made - at[120].made, 0)}, 25–40 min ${fmt(100 * lateChange, 2)}%`);
    assert.ok(at[600].m <= 0.2, `total mRNA at 10 min ${fmt(at[600].m)} of before`);
    assert.ok(at[300].J >= 0.6, `translation at 5 min ${fmt(at[300].J)} of before`);
    assert.ok(at[1200].J <= 0.15, `translation at 20 min ${fmt(at[1200].J)} of before`);
    assert.ok(at[300].lam > 0.5, `λ at 5 min ${fmt(at[300].lam)} of λ0`);
    assert.ok(at[180].made - at[120].made > 0, 'fliC stopped rising within 3 min');
    assert.ok(Math.abs(lateChange) < 0.01, `fliC changed ${fmt(100 * lateChange, 2)}% between 25 and 40 min`);
    assert.ok(at[300].spend >= 0.8, `ATP use at 5 min ${fmt(at[300].spend)} of before`);
    assert.ok(at[1200].spend <= 0.5, `ATP use at 20 min ${fmt(at[1200].spend)} of before`);
  }
});

test('i2: chloramphenicol: translation stops at once, the mRNA stays, ATP demand drops and the charge rises', (t) => {
  for (const seed of SEEDS.C) {
    const { at, E0 } = get(seed, 'chloramphenicol');
    t.diagnostic(`seed ${seed}: translation ${fmt(at[1].J)} after 1 s; λ ${fmt(at[1].lam)}; mRNA ${fmt(at[600].m)} at 10 min, ${fmt(at[2400].m)} at 40 min; ATP use ${fmt(at[1].spend)} after 1 s; E ${fmt(E0)} → ${fmt(at[600].E)}`);
    assert.ok(at[1].J <= 0.03, `translation after 1 tick ${fmt(at[1].J)} of before`);
    assert.ok(at[1].lam <= 0.05 && at[600].lam <= 0.05, `λ ${fmt(at[1].lam)} / ${fmt(at[600].lam)} of λ0`);
    assert.ok(at[600].m >= 0.8 && at[600].m <= 1.2, `total mRNA at 10 min ${fmt(at[600].m)} of before`);
    assert.ok(at[2400].m >= 0.8 && at[2400].m <= 1.3, `total mRNA at 40 min ${fmt(at[2400].m)} of before`);
    assert.ok(at[1].spend <= 0.6, `ATP use fell only to ${fmt(at[1].spend)} of before within 1 tick`);
    assert.ok(at[1].E >= E0 && at[600].E >= E0, `E fell from ${fmt(E0)} to ${fmt(Math.min(at[1].E, at[600].E))}`);
  }
});

test('i3: the two drugs are distinguishable at 5 min: rifampicin removes mRNA, chloramphenicol stops growth', (t) => {
  for (const seed of SEEDS.C) {
    const rif = get(seed, 'rifampicin').at[300], cm = get(seed, 'chloramphenicol').at[300];
    t.diagnostic(`seed ${seed}: mRNA rif/cm ${fmt(rif.m / cm.m)}; λ rif/cm ${fmt(rif.lam / cm.lam, 1)}`);
    assert.ok(rif.m / cm.m < 0.5, `mRNA(rif)/mRNA(cm) = ${fmt(rif.m / cm.m)}`);
    assert.ok(rif.lam > 10 * cm.lam, `λ(rif)/λ(cm) = ${fmt(rif.lam / cm.lam, 1)}`);
  }
});
