// Energy comes from glucose, and glucose gets in only through PtsG (the lab
// strain lacks the mannose PTS). No sugar → ATP falls a long way within seconds
// and everything that builds stops, while the cell holds a little charge (g1,
// v1.1); refeeding restarts the proteins already there (g2); a cell that stops
// making its transporter slowly starves, keeping its charge while growth falls
// (g3, g4); with no transporter at all ATP runs down over hours (g5); glycolysis
// needs a little ATP to start (g6); backup transporters (g7); and the Low
// glucose preset (g8), where a carbon-limited cell keeps its charge (v1.1).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { SEEDS, HOUR, SETTLE, WINDOW, LAMBDA_REF, warm, twin, avg, run, lam, fmt, mean } = H;

const PLAYERS = ['ptsG', 'gly', 'aaSyn', 'aaImp', 'lacY', 'lacZ', 'fliC'];

/** Runs `seconds` and returns the charge range and each player protein's largest change and pMade rise (relative to its count). */
function stallWindow(c, seconds) {
  const P0 = PLAYERS.map((id) => c.gene(id).P), made0 = PLAYERS.map((id) => c.gene(id).pMade);
  let maxE = 0, minE = 1;
  for (let i = 0; i < seconds; i++) { c.step(); if (c.E > maxE) maxE = c.E; if (c.E < minE) minE = c.E; }
  let dP = 0, dMade = 0, rel = 0;
  PLAYERS.forEach((id, j) => {
    const d = Math.abs(c.gene(id).P - P0[j]), m = c.gene(id).pMade - made0[j];
    dP = Math.max(dP, d);
    dMade = Math.max(dMade, m);
    rel = Math.max(rel, Math.max(d, m) / Math.max(P0[j], 1));
  });
  return { dP, dMade, rel, maxE, minE };
}

test('g1/g2: with no glucose ATP falls a long way within seconds and everything that builds stalls, while the cell keeps a little charge; refeeding restarts growth with the proteins already there', (t) => {
  const c = warm(1);
  let k0 = 0;
  const l0 = avg(c, 600, (x) => { k0 += x.k.kInit; return x.k.lambda; });
  k0 /= 600;
  const m0 = H.totalMRNA(c);
  c.command({ type: 'setMedium', glucose_mM: 0 });
  let tE = -1, tLam = -1, worstInit = 0, m10 = 0;
  run(c, 600, (x, s) => {
    if (tE < 0 && x.E < 0.3) tE = s;
    if (tLam < 0 && x.k.lambda < 0.05 * l0) tLam = s;
    if (s >= 60) worstInit = Math.max(worstInit, x.k.kInit / k0);
    if (s === 600) m10 = H.totalMRNA(x) / m0;
  });
  t.diagnostic(`g1: E < 0.3 after ${tE} s, λ < 0.05 λ0 after ${tLam} s; initiation after the first minute ≤ ${fmt(worstInit)} of before; mRNA at 10 min ${fmt(m10)}`);
  assert.ok(tE > 0 && tE <= 5, `g1: E fell below 0.3 after ${tE} s`);
  assert.ok(tLam > 0 && tLam <= 10, `g1: λ fell below 0.05 λ0 after ${tLam} s`);
  assert.ok(worstInit < 0.01, `g1: initiation after the first minute was ${fmt(worstInit)} of before`);
  assert.ok(m10 <= 0.2, `g1: total mRNA at 10 min is ${fmt(m10)} of before`);

  // v1.1: the energy gates shut building down before ATP is gone, so a starving cell keeps a
  // little charge (Chapman 1971: starving cells hold part of their charge) instead of hitting the floor.
  const starved = twin(c);                           // the stall window is checked on a twin
  const w = stallWindow(starved, 20 * 60);
  t.diagnostic(`g1 stall window (10–30 min): E ${fmt(w.minE)}–${fmt(w.maxE)}; max |ΔP| ${fmt(w.dP)}, max pMade rise ${fmt(w.dMade)} (≤ ${fmt(100 * w.rel, 3)}% of a count)`);
  assert.ok(w.maxE <= 0.2 && w.minE >= 0.05, `g1: charge while starving ranged ${fmt(w.minE)}–${fmt(w.maxE)}`);
  assert.ok(w.dP < 1 && w.dMade < 1, `g1: during the stall a protein changed by ${fmt(w.dP)} (made ${fmt(w.dMade)})`);

  // g2: refeed after 20 min without glucose.
  c.advance(600);
  c.command({ type: 'setMedium', glucose_mM: 10 });
  let tUp = -1, l5 = 0, l15 = 0;
  run(c, 900, (x, s) => {
    if (tUp < 0 && x.E > 0.8) tUp = s;
    if (s === 300) l5 = x.k.lambda / l0;
    if (s === 900) l15 = x.k.lambda / l0;
  });
  t.diagnostic(`g2: E > 0.8 after ${tUp} s; λ/λ0 ${fmt(l5)} at 5 min, ${fmt(l15)} at 15 min`);
  assert.ok(tUp > 0 && tUp <= 10, `g2: E recovered above 0.8 after ${tUp} s`);
  assert.ok(l5 >= 0.8, `g2: λ/λ0 at 5 min ${fmt(l5)}`);
  assert.ok(l15 >= 0.9, `g2: λ/λ0 at 15 min ${fmt(l15)}`);
});

test('g3/g4: without new PtsG the transporter is diluted away and growth spirals down while the charge stays up; the longer the wait, the slower the recovery', (t) => {
  const c = warm(1);
  const l0 = avg(c, HOUR, lam);
  c.command({ type: 'setPromoter', gene: 'ptsG', level: 'off' });
  const at = {}, recovery = {};
  const recover = (hours) => {
    const r = twin(c);
    r.command({ type: 'setPromoter', gene: 'ptsG', level: 1 });
    const s = run(r, 12 * HOUR, (x) => x.k.lambda > 0.5 * l0);
    recovery[hours] = s / HOUR;
  };
  for (let h = 1; h <= 20; h++) {
    c.advance(HOUR);
    at[h] = { lam: c.k.lambda / l0, E: c.E };
    if (h === 6 || h === 10 || h === 20) recover(h);
  }
  t.diagnostic(`g3: λ/λ0 ${fmt(at[1].lam, 2)} at 1 h, ${fmt(at[6].lam, 2)} at 6 h (E ${fmt(at[6].E, 3)}), ${fmt(at[20].lam, 3)} at 20 h`);
  t.diagnostic(`g4: hours to 0.5 λ0 after ptsG back on: 6 h off ${fmt(recovery[6], 2)}, 10 h ${fmt(recovery[10], 2)}, 20 h ${fmt(recovery[20], 2)}`);
  assert.ok(at[1].lam >= 0.9, `g3: λ/λ0 after 1 h ${fmt(at[1].lam)}`);
  assert.ok(at[6].lam <= 0.5, `g3: λ/λ0 after 6 h ${fmt(at[6].lam)}`);
  // v1.1: growth falls while the charge stays up (the cell spends less instead of running down).
  assert.ok(at[6].E >= 0.55, `g3: E after 6 h ${fmt(at[6].E)}`);
  assert.ok(at[20].lam <= 0.15, `g3: λ/λ0 after 20 h ${fmt(at[20].lam)}`);
  assert.ok(recovery[20] > recovery[10] && recovery[10] > recovery[6], `g4: recovery times ${fmt(recovery[6], 2)}, ${fmt(recovery[10], 2)}, ${fmt(recovery[20], 2)} h`);
});

test('g5: a cell with no transporter at all never recovers: ATP runs down over hours and almost nothing is made for 24 h', (t) => {
  const c = new H.Cell({ seed: 1, start: 'steady', genes: { ptsG: { knockout: true, initial: { protein: 0 } } } });
  c.advance(HOUR);
  const E1 = c.E;
  const w = stallWindow(c, 23 * HOUR);
  t.diagnostic(`g5: E ${fmt(E1)} at 1 h, ${fmt(c.E)} at 24 h (max ${fmt(w.maxE)} after 1 h); max |ΔP| ${fmt(w.dP)}; max pMade rise ${fmt(w.dMade)} (${fmt(100 * w.rel, 3)}% of a count)`);
  assert.ok(E1 < 0.15, `g5: E at 1 h ${fmt(E1)}`);
  assert.ok(c.E < 0.01, `g5: E at 24 h ${fmt(c.E)}`);
  assert.ok(w.maxE <= E1, `g5: E rose to ${fmt(w.maxE)} after the first hour`);
  assert.ok(w.rel < 0.01, `g5: a protein changed by ${fmt(100 * w.rel, 3)}% of its count (${fmt(w.dP)} molecules, made ${fmt(w.dMade)})`);
});

test('g6: glycolysis needs a little ATP to start: from zero ATP the priming seed speeds the restart; with v1.1 energy gates even few enzymes restart (the M1 threshold is gone)', (t) => {
  const trial = (primingSeed, f, hours, target) => {
    const c = warm(1, { flags: { primingSeed } });
    const l0 = avg(c, 600, lam);
    c.command({ type: 'setMedium', glucose_mM: 0 });
    c.advance(20 * 60);
    c.gene('ptsG').P *= f;                           // test-only: fewer transporters and glycolytic enzymes
    c.gene('gly').P *= f;
    c.E = 0;                                         // test-only: ATP has run out (v1.1 starving cells keep some for hours; g5)
    c.command({ type: 'setMedium', glucose_mM: 10 });
    let reached = -1, tE = -1;
    run(c, hours * HOUR, (x, s) => {
      if (tE < 0 && x.E > 0.5) tE = s;
      if (reached < 0 && x.k.lambda >= target * l0) reached = s;
    });
    return { reached, tE };
  };
  const bare = trial(0, 0.2, 2, 0.8), seeded = trial(0.01, 0.2, 2, 0.8);
  const half = trial(0, 0.5, 0.5, 0.8), few = trial(0.01, 0.15, 6, 0.9);
  t.diagnostic(`f = 0.2: E > 0.5 after ${bare.tE} s without the seed, ${seeded.tE} s with it; s0 = 0, f = 0.5: 0.8 λ0 after ${half.reached} s; s0 = 0.01, f = 0.15: 0.9 λ0 after ${fmt(few.reached / HOUR, 2)} h`);
  assert.ok(bare.tE > seeded.tE && seeded.tE > 0, `restart from zero ATP took ${bare.tE} s without the seed and ${seeded.tE} s with it`);
  assert.ok(bare.tE > 0 && bare.tE <= 60, `f = 0.2 without the seed: E > 0.5 after ${bare.tE} s (v1.1: the gates shut the big users, so supply wins)`);
  assert.ok(half.reached > 0 && half.reached <= 30 * 60, `s0 = 0, f = 0.5 reached 0.8 λ0 after ${half.reached} s`);
  assert.ok(few.reached > 0 && few.reached <= 6 * HOUR, `s0 = 0.01, f = 0.15 reached 0.9 λ0 after ${few.reached} s`);
});

test('g7: backup glucose uptake gives the slow growth of a real ΔptsG strain (0.10–0.18 /h)', (t) => {
  const c = warm(1, { flags: { backupGlucoseUptake: true }, genes: { ptsG: { level: 'off' } } });
  c.advance(16 * HOUR);
  const l = avg(c, WINDOW, lam) * 3600;
  t.diagnostic(`λ ${fmt(l)} /h`);
  assert.ok(l >= 0.10 && l <= 0.18, `ΔptsG with backup uptake grows at ${fmt(l)} /h`);
});

test('g8: the Low glucose preset (0.005 mM) leaves PtsG partly empty and about halves growth, while the cell keeps its charge (set C; v1.1 homeostasis)', (t) => {
  const rows = SEEDS.C.map((seed) => {
    const l0 = H.steadyLambda(seed);
    const c = warm(seed, { medium: { glucose_mM: H.PV.glucoseLow } });
    c.advance(SETTLE);
    const r = avg(c, WINDOW, { lam, E: (x) => x.E });
    const f = H.BTC.observe.facts(c);
    return { ratio: r.lam / l0, E: r.E, Td: H.Td_min(r.lam), ema: c.lambdaEMA, G: c.env.glucose_mM, level: f.glucoseLevel, growth: f.growth };
  });
  t.diagnostic(`λ/λ0 ${rows.map((r) => fmt(r.ratio)).join(' ')}; Td ${fmt(mean(rows.map((r) => r.Td)), 0)} min; E ${fmt(mean(rows.map((r) => r.E)))}`);
  for (const r of rows) {
    assert.ok(r.ratio >= 0.35 && r.ratio <= 0.65, `λ at 0.005 mM glucose is ${fmt(r.ratio)} of λ0`);
    // Carbon-limited cells slow down instead of running out of ATP (Chapman 1971; Walker-Simmons & Atkinson 1977).
    assert.ok(r.E >= 0.7, `E at 0.005 mM glucose is ${fmt(r.E)}`);
    // What the narrator is told (spec §11.5), and the thresholds behind it.
    assert.equal(r.level, 'low', `facts.glucoseLevel at ${r.G} mM`);
    assert.equal(r.growth, 'slow', `facts.growth with λEMA ${fmt(r.ema)} /s`);
    assert.ok(r.ema < 0.8 * LAMBDA_REF && r.ema > 0.05 * LAMBDA_REF, `λEMA ${fmt(r.ema)} /s is not in the 'slow' band`);
  }
});
