// Growth and division (j1–j3), the reference cell (r1), amino-acid supply (r4,
// r5), and the bacterial growth laws, which are not programmed in but emerge
// from ribosome allocation (L1, L2). Steady states: 8 h settle, 12 h average.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { PV, SEEDS, HOUR, SETTLE, WINDOW, warm, avg, fmt, mean } = H;

// --- Division ----------------------------------------------------------------

const divisions = [];      // one entry per division: record copy + birth volumes
let lambdaSum = 0, lambdaTicks = 0, idViolation = null;
function collectDivisions() {
  if (divisions.length) return;
  for (const seed of SEEDS.C) {
    const c = warm(seed);
    const ids = c.genes.map(() => new Int32Array(512));
    const counts = new Int32Array(c.genes.length);
    let n = 0;
    while (n < 15) {
      c.genes.forEach((g, i) => { ids[i].set(g.mature.ids.subarray(0, g.mature.count)); counts[i] = g.mature.count; });
      const gen = c.gen, VbirthPrev = c.Vbirth, nextId = c.nextMRNAId;
      c.step();
      lambdaSum += c.k.lambda; lambdaTicks++;
      if (c.gen === gen) continue;
      n++;
      const rec = JSON.parse(JSON.stringify(c.lastDivision));
      rec.seed = seed;
      rec.VdivOverVbirth = rec.Mbefore / PV.rho / VbirthPrev;
      rec.Vbirth = c.Vbirth;
      rec.cycle_s = c.lastCycle_s;
      divisions.push(rec);
      // Every molecule kept existed before the division (or was made in that tick).
      c.genes.forEach((g, i) => {
        const before = new Set(ids[i].subarray(0, counts[i]));
        for (let k = 0; k < g.mature.count; k++) {
          const id = g.mature.ids[k];
          if (!before.has(id) && id < nextId && idViolation === null) idViolation = `seed ${seed}: ${g.id} mRNA ${id} appeared at division`;
        }
      });
    }
  }
}

test('j1: the reference cell doubles in about 98 min, divides at twice its birth volume, and is born at about 1 fL', (t) => {
  collectDivisions();
  const Td = H.Td_min(lambdaSum / lambdaTicks);
  const cycles = divisions.filter((d, i) => i % 15 !== 0).map((d) => d.cycle_s / 60);   // skip each run's first, partial cycle
  const ratio = mean(divisions.map((d) => d.VdivOverVbirth)), Vb = mean(divisions.map((d) => d.Vbirth));
  t.diagnostic(`Td ${fmt(Td, 1)} min (mean cycle ${fmt(mean(cycles), 1)} min); V_div/V_birth ${fmt(ratio)}; V_birth ${fmt(Vb)} fL`);
  assert.ok(Td >= 90 && Td <= 105, `doubling time ${fmt(Td, 1)} min`);
  for (const d of divisions) assert.ok(d.VdivOverVbirth >= 1.9 && d.VdivOverVbirth <= 2.1, `V at division / V at birth ${fmt(d.VdivOverVbirth)}`);
  assert.ok(Math.abs(Vb - 1) <= 0.05, `mean birth volume ${fmt(Vb)} fL`);
});

test('j2: each daughter gets about half of every molecule, with binomial scatter (60 divisions, set C)', (t) => {
  collectDivisions();
  let kept = 0, before = 0, chi = 0, cells = 0;
  const proteinRatios = [];
  for (const d of divisions) {
    for (const g of d.genes) {
      if (g.mRNABefore > 0) {
        kept += g.mRNAKept; before += g.mRNABefore;
        chi += (g.mRNAKept - g.mRNABefore / 2) ** 2 / (g.mRNABefore / 4);
        cells++;
      }
      if (g.proteinBefore > 1000) proteinRatios.push(g.proteinKept / g.proteinBefore);
    }
  }
  const frac = kept / before, varRatio = chi / cells;
  t.diagnostic(`${divisions.length} divisions: mRNA kept ${fmt(frac)} (${before} molecules); variance/binomial ${fmt(varRatio, 2)}; protein kept ${fmt(Math.min(...proteinRatios))}–${fmt(Math.max(...proteinRatios))}`);
  assert.ok(divisions.length >= 60, `${divisions.length} divisions`);
  assert.ok(frac >= 0.45 && frac <= 0.55, `mRNA kept fraction ${fmt(frac)}`);
  assert.ok(varRatio >= 0.7 && varRatio <= 1.3, `variance / binomial ${fmt(varRatio, 2)}`);
  for (const r of proteinRatios) assert.ok(r >= 0.47 && r <= 0.53, `a daughter kept ${fmt(r)} of a protein with > 1,000 copies`);
});

test('j3: division conserves molecules: what this daughter keeps plus what the sister gets is exactly what there was', () => {
  collectDivisions();
  const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b), 1);
  for (const d of divisions) {
    d.genes.forEach((g, i) => {
      assert.equal(g.mRNAKept + g.mRNASister, g.mRNABefore, `gene ${i} mRNA`);
      assert.ok(g.mRNAKept >= 0 && g.mRNASister >= 0);
      assert.equal(g.nascentKept + g.nascentSister, g.nascentBefore, `gene ${i} nascent`);
      assert.ok(close(g.proteinKept + g.proteinSister, g.proteinBefore), `gene ${i} protein ${g.proteinKept} + ${g.proteinSister} ≠ ${g.proteinBefore}`);
      assert.ok(g.proteinSister >= -1e-9, `gene ${i} sister protein ${g.proteinSister}`);
      assert.ok(close(2 * g.ribosomesKept, g.ribosomesBefore), `gene ${i} ribosomes`);
    });
    for (const s of d.sectors) {
      assert.ok(close(2 * s.mRNAKept, s.mRNABefore) && close(2 * s.massKept, s.massBefore) && close(2 * s.ribosomesKept, s.ribosomesBefore), 'sector halves');
    }
    assert.ok(close(2 * d.AAKept, d.AABefore) && close(2 * d.LinKept, d.LinBefore), 'pools halve');
  }
  assert.equal(idViolation, null, idViolation);
});

// --- Steady states across conditions -------------------------------------------

function steady(cfg, prepare) {
  const c = warm(1, cfg);
  if (prepare) prepare(c);
  c.advance(SETTLE);
  return avg(c, WINDOW, {
    lam: H.lam, phiR: H.phiR, E: (x) => x.E, vRun: (x) => x.flux.vRun,
    active: (x) => x.k.Relong * x.k.cmF / x.k.Rtot, R: H.ribosomes, mRNA: H.totalMRNA, M: (x) => x.mass,
    glc: (x) => x.flux.glucoseIn / (PV.mmolPerGDWh * x.volume), phiQ: (x) => x.sectors[1].mass / x.mass,
    ptsG: (x) => x.gene('ptsG').P, kInit: (x) => x.k.kInit, turnover: (x) => x.E * x.k.NA / x.ledger.spent_perS,
  });
}

const AA = PV.aminoAcidsPresent;
const CONDITIONS = {
  reference: [],
  'glucose 0.005 mM': [{ medium: { glucose_mM: PV.glucoseLow } }],
  'ptsG ×0.25': [{ genes: { ptsG: { level: 0.25 } } }],
  lactose: [{ genes: { lacY: { level: 1 }, lacZ: { level: 1 } } }, (c) => { c.advance(3 * HOUR); c.command({ type: 'setMedium', glucose_mM: 0, lactose_mM: PV.lactosePresent }); }],
  'aa, aaImp ×4, aaSyn off': [{ medium: { aminoAcids_mM: AA }, genes: { aaImp: { level: 4 }, aaSyn: { level: 'off' } } }],
  'aa, aaImp ×4': [{ medium: { aminoAcids_mM: AA }, genes: { aaImp: { level: 4 } } }],
  'aa, aaImp ×1, aaSyn off': [{ medium: { aminoAcids_mM: AA }, genes: { aaImp: { level: 1 }, aaSyn: { level: 'off' } } }],
  'aa, default': [{ medium: { aminoAcids_mM: AA } }],
};
const results = {};
const cond = (name) => (results[name] ??= steady(...CONDITIONS[name]));

test('r1: the reference cell sits in the measured ranges', (t) => {
  const r = cond('reference');
  const checks = [
    ['E', r.E, 0.85, 0.93], ['ATP (mM)', r.E * PV.A_tot, 2.5, 3.5], ['ATP turnover (s)', r.turnover, 2, 4],
    ['v_run (aa/s)', r.vRun, 10.5, 13], ['active ribosome fraction', r.active, 0.72, 0.85], ['ribosomes', r.R, 9000, 13500],
    ['φ_R', r.phiR, 0.08, 0.11], ['total mRNA', r.mRNA, 2000, 3500], ['proteins (300-aa equivalents)', r.M / 300, 2.5e6, 3.3e6],
    ['glucose uptake (mmol/gDW/h)', r.glc, 10, 16], ['φ_Q', r.phiQ, 0.47, 0.51], ['PtsG', r.ptsG, 8000, 20000], ['k_init (/s)', r.kInit, 0.12, 0.18],
  ];
  t.diagnostic(checks.map(([n, v]) => `${n} ${fmt(v)}`).join('; ') + `; Td ${fmt(H.Td_min(r.lam), 1)} min`);
  for (const [name, v, lo, hi] of checks) assert.ok(v >= lo && v <= hi, `${name} = ${fmt(v)}, outside [${lo}, ${hi}]`);
});

test('L1: growth law 1: across nutrient conditions the ribosome share rises linearly with growth rate', (t) => {
  const xs = [], ys = [];
  for (const name of Object.keys(CONDITIONS)) {
    const r = cond(name);
    xs.push(r.lam * 3600); ys.push(100 * r.phiR);
    t.diagnostic(`${name}: λ ${fmt(r.lam * 3600)} /h, φ_R ${fmt(100 * r.phiR, 2)}%`);
  }
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const slope = sxy / sxx, r = sxy / Math.sqrt(sxx * syy);
  t.diagnostic(`slope ${fmt(slope, 1)} % per h⁻¹, r ${fmt(r)}`);
  assert.ok(xs.length >= 6);
  assert.ok(r >= 0.95, `correlation of φ_R with λ is ${fmt(r)}`);
  assert.ok(slope >= 12 && slope <= 22, `slope ${fmt(slope, 1)} % per h⁻¹`);
});

test('r4/r5: amino acids: making them costs growth, importing them speeds it up; starved ribosomes slow down only partly', (t) => {
  const ref = cond('reference');
  const fast = cond('aa, aaImp ×4, aaSyn off'), dflt = cond('aa, default'), poor = cond('ptsG ×0.25');
  const s1 = ref.lam > 0 ? fast.lam / ref.lam : 0, s2 = dflt.lam / ref.lam;
  t.diagnostic(`r5: Td shortened ×${fmt(s1, 2)} (aaImp ×4, aaSyn off, ${fmt(H.Td_min(fast.lam), 1)} min) and ×${fmt(s2, 2)} (default settings)`);
  assert.ok(s1 >= 1.5 && s1 <= 2.3, `aa medium with importers ×4: Td shortened ×${fmt(s1, 2)}`);
  assert.ok(s2 >= 1.05, `aa medium with default settings: Td shortened ×${fmt(s2, 2)}`);
  t.diagnostic(`r4: active fraction ${fmt(poor.active)} at ptsG ×0.25 vs ${fmt(ref.active)} at reference`);
  assert.ok(poor.active < ref.active, `active fraction at ptsG ×0.25 ${fmt(poor.active)} ≥ reference ${fmt(ref.active)}`);

  const c = warm(1);
  const l0 = avg(c, 600, H.lam);
  c.command({ type: 'setPromoter', gene: 'aaSyn', level: 'off' });
  let vMin = Infinity;
  for (let i = 0; i < 8 * HOUR; i++) { c.step(); if (c.flux.vRun < vMin) vMin = c.flux.vRun; }
  const lam8 = c.k.lambda / l0, v8 = c.flux.vRun;
  t.diagnostic(`r4: aaSyn off: λ/λ0 ${fmt(lam8)} at 8 h; v_run ${fmt(v8, 2)} at 8 h, minimum ${fmt(vMin, 2)}`);
  assert.ok(lam8 <= 0.6, `λ/λ0 after 8 h without aaSyn ${fmt(lam8)}`);
  assert.ok(vMin >= 6, `v_run fell to ${fmt(vMin, 2)} aa/s`);
  assert.ok(v8 >= 6 && v8 <= 10, `v_run after 8 h ${fmt(v8, 2)} aa/s`);
});

test('L2: growth law 2: partial chloramphenicol lowers growth and raises the ribosome share', (t) => {
  const rows = [0.1, 0.2, 0.3, 0.45].map((theta) => {
    const r = steady({ drugs: { chloramphenicol: theta / PV.thetaMax } });
    return { theta, lam: r.lam * 3600, phiR: 100 * r.phiR };
  });
  t.diagnostic(rows.map((r) => `θ ${r.theta}: λ ${fmt(r.lam)} /h, φ_R ${fmt(r.phiR, 2)}%`).join('; '));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].lam < rows[i - 1].lam, `λ did not fall from θ ${rows[i - 1].theta} to ${rows[i].theta}`);
    assert.ok(rows[i].phiR > rows[i - 1].phiR, `φ_R did not rise from θ ${rows[i - 1].theta} to ${rows[i].theta}`);
  }
});
