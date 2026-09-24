// The regulated lac operon (strain m2-lac, engine v1.1; LEVELS.md R-E13–R-E16): LacI
// holds the operator shut in glucose, allolactose (or IPTG) pulls it off, cAMP–CRP
// helps the promoter only when no glucose comes in. The observable contract RT-1…RT-6
// (LEVELS.md §8.1), then the module's parts: repression, the designs and their
// validation, the view and the facts, and determinism.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { BTC, Cell, PV, SEEDS, HOUR, avg, lam, fmt, mean } = H;
const REG = BTC.regulation;

const G = { glucose_mM: 10, lactose_mM: 0 };
const L = { glucose_mM: 0, lactose_mM: PV.lactosePresent };
const B = { glucose_mM: 10, lactose_mM: PV.lactosePresent };
const D = {
  wt: null,
  dlacI: { lacI: { allele: 'deleted' } },
  Oc: { lac: { operator: false } },
  Is: { lacI: { allele: 'Is' } },
  noCrpSite: { lac: { crpSite: false } },
  noRepressor: { lacI: { allele: 'deleted' }, lac: { crpSite: false } },
};
const lac = (seed, design, extra) => new Cell(Object.assign({ seed, strain: 'm2-lac', start: 'steady', design }, extra || {}));
const medium = (c, m) => c.command(Object.assign({ type: 'setMedium' }, m));
/** Lac synthesis ζ = Σ (chains finished per s × length) over lacZ, lacY, lacA (aa/s; LEVELS.md §7.7.5). */
const zeta = (c) => ['lacZ', 'lacY', 'lacA'].reduce((s, id) => { const g = c.gene(id); return s + g.pCompleted / c.p.dt * g.L; }, 0);

/** The induced wild type on lactose: 3 h of IPTG in glucose, then 3 h on lactose alone. */
let inducedCache = null;
function induced() {
  if (inducedCache) return inducedCache.fork();
  const c = lac(99, null);
  medium(c, { iptg_mM: 1 });
  c.advance(3 * HOUR);
  medium(c, Object.assign({ iptg_mM: 0 }, L));
  c.advance(3 * HOUR);
  inducedCache = c;
  return c.fork();
}
let lamL = 0;
const lambdaLac = () => lamL || (lamL = avg(induced(), HOUR, lam));

/** Lag of LEVELS.md §7.7.5 from the current tick (min), and the lowest charge on the way. */
function lagOf(c, maxTicks) {
  const lamLac = lambdaLac();
  const ring = new Float64Array(60);
  let sum = 0, t1 = -1, run60 = 0, Emin = 1;
  for (let t = 0; t < maxTicks; t++) {
    c.step();
    sum += c.k.lambda - ring[t % 60]; ring[t % 60] = c.k.lambda;
    const l60 = t >= 59 ? sum / 60 : sum / (t + 1);
    if (c.E < Emin) Emin = c.E;
    if (t1 < 0) { if (l60 < 0.5 * lamLac) t1 = t; continue; }
    if (l60 >= 0.5 * lamLac) { if (++run60 >= 60) return { lag: (t - 59) / 60, Emin }; } else run60 = 0;
  }
  return { lag: t1 < 0 ? 0 : Infinity, Emin };
}

// ---------------------------------------------------------------------------
// RT-1…RT-6 (LEVELS.md §8.1, R-E15)
// ---------------------------------------------------------------------------

test('RT-1: truth table after 3 h: the wild type makes LacZ only on lactose; without the repressor or the operator it is made in both; a repressor blind to allolactose (Is) never lets it be made', (t) => {
  const Zind = induced().gene('lacZ').P;
  const expect = { wt: [false, true], dlacI: [true, true], Oc: [true, true], Is: [false, false] };
  const lines = [];
  for (const name of Object.keys(expect)) {
    [G, L].forEach((m, j) => {
      const shares = SEEDS.C.map((seed) => {
        const c = lac(seed, D[name]);
        medium(c, m);
        c.advance(3 * HOUR);
        return c.gene('lacZ').P / Zind;
      });
      lines.push(`${name} ${j ? 'lactose' : 'glucose'} ${shares.map((s) => fmt(100 * s, 2)).join('/')}%`);
      // "made": every seed ≥ 5%. "almost none": ≤ 1% over the seed set, and no seed above 2% (a rare
      // spontaneous release of the repressor can give one cell a burst of a few mRNAs in 3 h).
      if (expect[name][j]) for (const s of shares) assert.ok(s >= 0.05, `${name} in ${j ? 'lactose' : 'glucose'}: LacZ ${fmt(100 * s, 2)}% of induced ("made" needs ≥ 5%)`);
      else {
        assert.ok(mean(shares) <= 0.01, `${name} in ${j ? 'lactose' : 'glucose'}: LacZ ${fmt(100 * mean(shares), 3)}% of induced on average ("almost none" needs ≤ 1%)`);
        for (const s of shares) assert.ok(s <= 0.02, `${name} in ${j ? 'lactose' : 'glucose'}: LacZ ${fmt(100 * s, 3)}% of induced in one cell`);
      }
    });
  }
  t.diagnostic(`induced wild-type LacZ ${fmt(Zind, 0)} monomers; ${lines.join('; ')}`);
});

test('RT-2 (engine value; LEVELS.md asks 20–60 min, see ENGINE.md §21): the wild type moved from glucose to lactose alone lags 1–3 h on all 12 seeds without going dormant; the no-repressor design (no CRP site) lags ≤ 10 min', (t) => {
  const rows = SEEDS.A.map((seed) => {
    const c = lac(seed, null);
    medium(c, L);
    return lagOf(c, 4 * HOUR);
  });
  const lags = rows.map((r) => r.lag);
  t.diagnostic(`λL ${fmt(lambdaLac() * 3600)} /h; lags ${lags.map((x) => fmt(x, 0)).join(', ')} min; lowest E ${fmt(Math.min(...rows.map((r) => r.Emin)))}`);
  for (const r of rows) {
    assert.ok(r.lag >= 60 && r.lag <= 180, `lag ${fmt(r.lag, 0)} min`);
    assert.ok(r.Emin >= 0.05, `E fell to ${fmt(r.Emin)}: a stall, not a lag`);
  }
  const n = lac(1, D.noRepressor);
  n.advance(2 * HOUR);                               // its own glucose steady state
  const Y = n.gene('lacY').P;
  medium(n, L);
  const r = lagOf(n, HOUR);
  t.diagnostic(`no-repressor design: LacY ${fmt(Y, 0)} at the switch, lag ${fmt(r.lag, 1)} min`);
  assert.ok(r.lag <= 10, `no-repressor lag ${fmt(r.lag, 1)} min`);
});

test('RT-3: with a repressor blind to allolactose (Is) the cell on lactose alone never grows (λ < 0.1·λL after 3 h), and it holds a little charge instead of crashing to the floor', (t) => {
  const c = lac(1, D.Is);
  medium(c, L);
  let Emin = 1;
  for (let i = 0; i < 600; i++) { c.step(); if (c.E < Emin) Emin = c.E; }
  c.advance(3 * HOUR - 600);
  t.diagnostic(`λ/λL ${fmt(c.k.lambda / lambdaLac())} after 3 h; lowest E in the first 10 min ${fmt(Emin)}; E at 3 h ${fmt(c.E)}`);
  assert.ok(c.k.lambda < 0.1 * lambdaLac(), `λ/λL = ${fmt(c.k.lambda / lambdaLac())}`);
  assert.ok(Emin >= 0.05, `E fell to ${fmt(Emin)} within 10 min`);
});

test('RT-4: an induced wild type moved to glucose re-represses: lac transcription falls below 5% of induced within 15 min', (t) => {
  const c = induced();
  const r0 = avg(c, 300, (x) => x.k.lacTx);
  medium(c, G);
  const out = [];
  let under = -1;
  for (let s = 1; s <= 15 * 60; s++) {
    c.step();
    if (under < 0 && c.k.lacTx < 0.05 * r0) under = s;
    if (s % 300 === 0) out.push(`${s / 60} min ${fmt(100 * c.k.lacTx / r0, 2)}%`);
  }
  const late = avg(c, 60, (x) => x.k.lacTx) / r0;
  t.diagnostic(`below 5% after ${under} s; ${out.join(', ')}; mean over the next minute ${fmt(100 * late, 3)}%`);
  assert.ok(under > 0 && under <= 15 * 60, `lac transcription reached ${fmt(100 * c.k.lacTx / r0, 2)}% of induced`);
  assert.ok(late < 0.05, `lac transcription ${fmt(100 * late, 2)}% of induced after 15 min`);
});

test('RT-5: glucose first: with both sugars the wild type (CRP site) makes ≤ 20% of its lactose-only lac protein; without the CRP site ≥ 50%', (t) => {
  const rate = (design, m) => mean([1, 2].map((seed) => {
    const c = lac(seed, design);
    medium(c, { iptg_mM: 1 });                        // start induced, so the comparison is about steady expression, not the lag
    c.advance(2 * HOUR);
    medium(c, Object.assign({ iptg_mM: 0 }, m));
    c.advance(1.5 * HOUR);
    return avg(c, 1.5 * HOUR, zeta);
  }));
  const wt = rate(null, B) / rate(null, L), noSite = rate(D.noCrpSite, B) / rate(D.noCrpSite, L);
  t.diagnostic(`both sugars ÷ lactose only: with the CRP site ${fmt(wt)}, without ${fmt(noSite)}`);
  assert.ok(wt <= 0.2, `with the CRP site ${fmt(wt)}`);
  assert.ok(noSite >= 0.5, `without the CRP site ${fmt(noSite)}`);
});

test('RT-6: burden: the no-repressor design (×1, no CRP site) grows 3–9% slower than the wild type in glucose', (t) => {
  const growth = (design) => mean(SEEDS.C.slice(0, 2).map((seed) => { const c = lac(seed, design); c.advance(4 * HOUR); return avg(c, 6 * HOUR, lam); }));
  const cost = 1 - growth(D.noRepressor) / growth(null);
  t.diagnostic(`growth ${fmt(100 * cost, 2)}% below the wild type`);
  assert.ok(cost >= 0.03 && cost <= 0.09, `${fmt(100 * cost, 2)}% below the wild type`);
});

// ---------------------------------------------------------------------------
// The module's parts
// ---------------------------------------------------------------------------

test('lac: the wild-type operator is repressed ≈1,000× at the normal repressor level (Oehler 1990: 1,300× with all three operators), and the operon fires in bursts', (t) => {
  const c = lac(1, null);
  const L_ = c.lac, p = c.p;
  const free = REG.freeShare(L_, p, 0, p.lacIRef);
  const repression = 1 / (free + (1 - free) * p.lacLeak);
  t.diagnostic(`free share ${fmt(free)}; repression ${fmt(repression, 0)}×; inducer frees half the operators at ${fmt(L_.inducerHalf_uM, 2)} µM`);
  assert.ok(Math.abs(repression - p.rep_lac) / p.rep_lac < 1e-9, `repression ${repression}`);
  // An Iq promoter (×10 repressor) represses harder; inducer frees operators.
  assert.ok(REG.freeShare(L_, p, 0, 10 * p.lacIRef) < free / 5, 'Iq');
  assert.ok(REG.freeShare(L_, p, 10 * L_.inducerHalf_uM, p.lacIRef) > 0.9, 'inducer');
  // Basal expression in glucose is rare bursts: a handful of lac mRNAs in a day, the cell carrying a few LacY (Choi 2008).
  const m0 = c.gene('lacZ').mMade;
  let withY = 0;
  for (let i = 0; i < 24 * HOUR; i++) { c.step(); if (c.gene('lacY').P >= 1) withY++; }
  const bursts = c.gene('lacZ').mMade - m0;
  t.diagnostic(`glucose, 24 h: ${bursts} lac mRNAs; LacY ≥ 1 for ${fmt(100 * withY / (24 * HOUR), 0)}% of the time`);
  assert.ok(bursts <= 12, `${bursts} lac mRNAs in 24 h`);
});

test('lac: IPTG induces the wild type even in glucose; lacIq (repressor promoter ×10) holds the operon tighter; Is ignores IPTG', (t) => {
  const Y = (design, iptg) => { const c = lac(1, design); medium(c, { iptg_mM: iptg }); c.advance(2 * HOUR); return c.gene('lacY').P; };
  const wt0 = Y(null, 0), wt1 = Y(null, 1), is1 = Y(D.Is, 1);
  const iq = lac(1, { lacI: { promoter: 10 } });
  iq.advance(3 * HOUR);
  const wtI = lac(1, null);
  wtI.advance(3 * HOUR);
  t.diagnostic(`LacY after 2 h: wt ${fmt(wt0, 1)}, wt + IPTG ${fmt(wt1, 0)}, Is + IPTG ${fmt(is1, 1)}; LacI tetramers wt ${wtI.lac.tetramers}, Iq ${iq.lac.tetramers}`);
  assert.ok(wt1 > 50 * Math.max(wt0, 1), 'IPTG induction');
  assert.ok(is1 < 0.05 * wt1, 'Is ignores IPTG');
  assert.ok(iq.lac.tetramers >= 3 * wtI.lac.tetramers, `Iq has ${iq.lac.tetramers} tetramers vs ${wtI.lac.tetramers} after 3 h`);
});

test('lac: config.design is validated, folded into the config hash and applied at tick 0 ("deleted" clears LacI and its mRNA); other strains accept none', () => {
  const bad = [
    [{ lac: { promoter: 3 } }, 'design.lac.promoter'], [{ lac: { operator: 'yes' } }, 'design.lac.operator'],
    [{ lacI: { allele: 'q' } }, 'design.lacI.allele'], [{ lacI: { promoter: 2 } }, 'design.lacI.promoter'],
    [{ lac: { color: 1 } }, 'design.lac.color'], [{ ara: {} }, 'design.ara'], [[1], 'design'],
  ];
  for (const [design, path] of bad) {
    assert.throws(() => lac(1, design), (e) => e instanceof BTC.ConfigError && e.path === path, JSON.stringify(design));
  }
  assert.throws(() => new Cell({ seed: 1, start: 'steady', design: { lac: { promoter: 2 } } }), (e) => e.code === 'not-available');
  const a = lac(1, null), b = lac(1, { lac: { promoter: 1, operator: true, crpSite: true }, lacI: { allele: 'wt', promoter: 1 } }), c = lac(1, D.Oc);
  assert.equal(a.configHash, b.configHash, 'defaults written out give the same config');
  assert.notEqual(a.configHash, c.configHash);
  const d = lac(1, D.dlacI);
  const gI = d.gene('lacI');
  assert.deepEqual([gI.P, gI.mature.count, gI.nascent.len, gI.cohorts.len], [0, 0, 0, 0]);
  assert.ok(a.gene('lacI').P >= 32, 'the wild type starts with its repressor (≥ 8 tetramers)');
  // Regulated and follower genes are not on dials: their promoter is the design's.
  assert.equal(a.command({ type: 'setPromoter', gene: 'lacY', level: 4 }).ok, false);
});

test('lac: the view shows the lac region (view.lac, view.tus) and the three cistrons report the one mRNA count; facts 1.3', () => {
  const c = lac(2, null);
  medium(c, L);
  c.advance(20 * 60);
  const v = c.observe();
  for (const key of ['operatorCopies', 'operatorBound', 'lacITetramers', 'lacIFree', 'allolactose', 'allolactose_mM', 'cAMP', 'crpFactor']) {
    assert.equal(typeof v.lac[key], 'number', `view.lac.${key}`);
  }
  assert.ok(v.lac.cAMP > 0.9 && v.lac.crpFactor > 0.9, 'no glucose: cAMP high');
  const tu = v.tus.find((u) => u.id === 'tu_lac');
  assert.deepEqual(tu.cistrons, ['lacZ', 'lacY', 'lacA']);
  const byId = (id) => v.genes.find((g) => g.id === id);
  assert.equal(byId('lacY').mRNA, byId('lacZ').mRNA);
  assert.equal(byId('lacA').mRNA, byId('lacZ').mRNA);
  assert.equal(byId('lacZ').mRNA, tu.mRNA);
  const f = BTC.observe.facts(c);
  assert.deepEqual([f.lacOperator, f.inducer, f.crp], ['free', 'some', 'high']);
  const g = lac(2, null);
  g.step();
  const fg = BTC.observe.facts(g);
  assert.deepEqual([fg.lacOperator, fg.inducer, fg.crp], ['bound', 'none', 'low']);
});

test('lac: fuzz: random commands, media (with IPTG) and designs keep every invariant of test m2 on every tick (12 sequences × 3 h)', () => {
  const { fuzzSequence } = require('./fuzz.js');
  const designs = [null, D.dlacI, D.Oc, D.Is, D.noRepressor, { lac: { promoter: 4 }, lacI: { promoter: 10 } }];
  for (let i = 0; i < 12; i++) {
    const err = fuzzSequence(1000 + i, { strain: 'm2-lac', design: designs[i % designs.length], ticks: 3 * HOUR, iptg: true });
    assert.equal(err, null, err);
  }
});

test('lac: hash coverage: perturbing an operator copy, the allolactose pool or the operator stream changes the hash and the physics digest', () => {
  const base = lac(3, null);
  medium(base, L);
  base.advance(900);
  const h0 = base.hash(), d0 = base.physicsDigest();
  const changes = [
    ['lac.op[0]', (c) => { c.lac.op[0] ^= 1; }], ['lac.op[1]', (c) => { c.lac.op[1] ^= 1; }],
    ['lac.allo', (c) => { c.lac.allo = c.lac.allo * (1 + 1e-15) + 1e-300; }], ['lac.stream', (c) => { c.lac.stream[0] ^= 1; }],
  ];
  assert.deepEqual(Cell.LAC_STATE_LAYOUT.map((f) => f.path), ['lac.op', 'lac.allo', 'lac.stream']);
  for (const [name, change] of changes) {
    const c = base.fork();
    assert.equal(c.hash(), h0);
    change(c);
    assert.notEqual(c.hash(), h0, `perturbing ${name} did not change the hash`);
    assert.notEqual(c.physicsDigest(), d0, `perturbing ${name} did not change physicsDigest`);
  }
});

test('lac: determinism: a restored m2-lac run continues with the same hashes, and the operator stream is labelled by the unit, not a slot', () => {
  const a = lac(5, null);
  medium(a, L);
  a.advance(1500);
  const snap = a.snapshot();
  a.advance(1500);
  const b = Cell.restore(snap);
  b.advance(1500);
  assert.equal(b.hash(), a.hash());
  const s1 = new Int32Array(4), s2 = new Int32Array(4);
  BTC.prng.seedStream(5, 'op:lac', s1);
  const c = lac(5, null);
  s2.set(c.lac.stream);
  assert.deepEqual(Array.from(s2), Array.from(s1));
});
