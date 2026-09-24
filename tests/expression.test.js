// Gene expression: the promoter-rate unit guard (u1), switching a gene on (a1,
// a2, a5), and how many mRNAs a gene makes and proteins an mRNA makes (b1, b2).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { Cell, PV, SEEDS, HOUR, warm, fmt, median, mean } = H;

test('u1: promoter rates are per second: ptsG ×1 keeps about 7 mature mRNAs (stub metabolism, E fixed at 0.9)', (t) => {
  const hin = 0.9 / (0.9 + PV.K_in);
  let starts = 0, seconds = 0, mSum = 0, n = 0;
  for (const seed of SEEDS.C) {
    const c = new Cell({ seed, start: 'cold' }, { stubMetabolism: { E: 0.9 } });
    const g = c.gene('ptsG');
    c.advance(1800);                            // let the cold-start mRNA pool relax
    const i0 = g.initiations;
    for (let i = 0; i < 4 * HOUR; i++) { c.step(); mSum += g.mature.count; n++; }
    assert.equal(c.dosage, 1, 'the stub neither grows nor replicates');
    starts += g.initiations - i0;
    seconds += 4 * HOUR;
  }
  const rate = starts / seconds, expected = PV.rRef_ptsG * hin * 1;
  const meanM = mSum / n;
  t.diagnostic(`initiations ${fmt(rate, 5)} /s (expected ${fmt(expected, 5)}); mean mature mRNA ${fmt(meanM, 2)} (by hand ≈7)`);
  assert.ok(Math.abs(rate / expected - 1) < 0.10, `initiation rate ${fmt(rate, 5)} /s vs rRef·hin·g ${fmt(expected, 5)} /s`);
  assert.ok(meanM >= 5 && meanM <= 20, `mean mature ptsG mRNA ${fmt(meanM, 2)}; a per-minute rate read as per-second gives ≈75`);
});

/**
 * Switches `id` to `level` in a warm cell and times the first transcript
 * started, the first full-length mRNA and the first complete protein (or
 * oligomer). Also checks that no transcript finishes faster than RNA
 * polymerase can travel (ℓ/(3·v_max)).
 */
function switchOn(seed, id, level, seconds, oligomer) {
  const c = warm(seed);
  const g = c.gene(id);
  const T0 = c.tick;
  const i0 = g.initiations, p0 = g.pMade;
  c.command({ type: 'setPromoter', gene: id, level });
  const out = { txStart: -1, firstMRNA: -1, firstProtein: -1, made10: 0, made60: 0, fastest: Infinity };
  const oldest = new Int32Array(16);
  for (let s = 1; s <= seconds; s++) {
    const nq = g.nascent;
    const k = Math.min(nq.len, 16);
    for (let j = 0; j < k; j++) oldest[j] = nq.initTick[nq.index(j)];
    c.step();
    const T = c.tick - 1;                          // the tick just completed
    if (out.txStart < 0 && g.initiations > i0) out.txStart = s;
    for (let j = 0; j < g.mCompleted && j < k; j++) {
      const took = T + 1 - oldest[j];              // seconds from start of initiation tick to end of completion tick
      if (took < out.fastest) out.fastest = took;
      if (out.firstMRNA < 0 && oldest[j] >= T0) out.firstMRNA = s;
    }
    if (out.firstMRNA > 0 && out.firstProtein < 0 && g.pMade - p0 >= oligomer) out.firstProtein = s;
    if (s === 600) out.made10 = g.pMade - p0;
    if (s === 3600) out.made60 = g.pMade - p0;
  }
  return out;
}

let on4 = null;   // fliC ×4 switch-on runs, shared by a1 and a2
const fliC4 = () => (on4 ??= SEEDS.A.map((seed) => switchOn(seed, 'fliC', 4, 3600, 1)));

test('a1: switching a gene on gives mRNA within a minute, and protein right behind it (fliC, set A)', (t) => {
  fliC4();
  const tx = median(on4.map((r) => r.txStart)), m = median(on4.map((r) => r.firstMRNA));
  const lag = median(on4.map((r) => r.firstProtein - r.firstMRNA));
  const fastest = Math.min(...on4.map((r) => r.fastest));
  const minTime = H.BTC.genome.compile('m1-lab').byId.fliC.mRNALength / (PV.ntPerAA * PV.v_max);
  t.diagnostic(`fliC ×4: median tx_start ${tx} s, first_mrna ${m} s, protein lag ${lag} s, fastest transcript ${fastest} s (limit ${fmt(minTime, 1)})`);
  assert.ok(tx <= 20, `median tx_start ${tx} s`);
  assert.ok(m >= 35 && m <= 75, `median first_mrna ${m} s`);
  assert.ok(fastest >= minTime, `a transcript finished in ${fastest} s, faster than ℓ/(3·v_max) = ${fmt(minTime, 1)} s`);
  assert.ok(lag <= 15, `first_protein − first_mrna ${lag} s (translation is coupled)`);

  const on1 = SEEDS.A.map((seed) => switchOn(seed, 'fliC', 1, 400, 1));
  const m1 = median(on1.map((r) => r.firstMRNA < 0 ? Infinity : r.firstMRNA));
  t.diagnostic(`fliC ×1: median first_mrna ${m1} s`);
  assert.ok(m1 <= 120, `fliC ×1 median first_mrna ${m1} s`);
});

test('a2: after switching on, protein accumulates over tens of minutes, not seconds (fliC ×4, set A)', (t) => {
  fliC4();
  const r10 = median(on4.map((r) => r.made10)) / median(on4.map((r) => r.made60));
  const made60 = median(on4.map((r) => r.made60));
  t.diagnostic(`a2: made in 10 min / 60 min ${fmt(r10)}; made in 60 min ${fmt(made60, 0)}`);
  assert.ok(r10 <= 0.2, `a2: protein made in 10 min is ${fmt(r10)} of that made in 60 min`);
  assert.ok(made60 >= 6e4 && made60 <= 1.3e5, `a2: fliC made in 60 min ${fmt(made60, 0)}`);
});

test('a5: delays follow gene length: lacZ (3.1 kb) takes about 100 s to its first mRNA (set A)', (t) => {
  // Slower than Vogel & Jensen's 60–85 s for lacZ: they measured fast aerobic growth
  // (≈40–50 nt/s); here transcription runs at 3·v_run ≈ 35 nt/s, the slower
  // anaerobic speed (engine spec §18 item 6).
  const r = SEEDS.A.map((seed) => switchOn(seed, 'lacZ', 4, 400, 4));
  const m = median(r.map((x) => x.firstMRNA)), tet = median(r.map((x) => x.firstProtein));
  t.diagnostic(`lacZ ×4: median first mRNA ${m} s, first tetramer ${tet} s`);
  assert.ok(m >= 80 && m <= 120, `median first full-length lacZ mRNA ${m} s`);
  assert.ok(tet >= 85 && tet <= 150, `median first LacZ tetramer ${tet} s`);
});

// b1/b2: 4 h settle, then 12 h of counting.
function ptsGBursts(seed, rbs) {
  const c = warm(seed, rbs ? { genes: { ptsG: { rbs } } } : undefined);
  const g = c.gene('ptsG');
  c.advance(4 * HOUR);
  const p0 = g.pMade, m0 = g.mMade, gen0 = c.gen;
  let mSum = 0;
  for (let i = 0; i < 12 * HOUR; i++) { c.step(); mSum += g.mature.count; }
  return { perMRNA: (g.pMade - p0) / (g.mMade - m0), perGen: (g.mMade - m0) / (c.gen - gen0), meanM: mSum / (12 * HOUR) };
}

test('b1/b2: one ptsG mRNA yields tens of proteins, and the gene makes hundreds of mRNAs per generation (set C)', (t) => {
  const base = SEEDS.C.map((seed) => ptsGBursts(seed));
  const doubled = SEEDS.C.map((seed) => ptsGBursts(seed, 2));
  const perMRNA = mean(base.map((r) => r.perMRNA));
  const ratios = base.map((r, i) => doubled[i].perMRNA / r.perMRNA);
  const perGen = mean(base.map((r) => r.perGen)), meanM = mean(base.map((r) => r.meanM));
  t.diagnostic(`b1: ${fmt(perMRNA, 1)} proteins per mRNA; RBS ×2 ratios ${ratios.map((x) => fmt(x, 2)).join(' ')}`);
  t.diagnostic(`b2: ${fmt(perGen, 0)} transcripts per generation; mean mRNA ${fmt(meanM, 1)}`);
  assert.ok(perMRNA >= 25 && perMRNA <= 55, `b1: ptsG proteins per mRNA ${fmt(perMRNA, 1)}`);
  for (const x of ratios) assert.ok(x >= 1.8 && x <= 2.1, `b1: doubling the RBS changes proteins per mRNA ×${fmt(x, 2)}`);
  assert.ok(perGen >= 150, `b2: ptsG transcripts per generation ${fmt(perGen, 0)}`);
  assert.ok(meanM >= 5 && meanM <= 20, `b2: mean ptsG mRNA ${fmt(meanM, 1)}`);
});
