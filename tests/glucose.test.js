// Energy comes from glucose, and glucose gets in only through PtsG (the lab
// strain lacks the mannose PTS). No sugar → no ATP → everything stops (g1);
// refeeding restarts the proteins already there (g2); a cell that stops making
// its transporter slowly starves (g3, g4, g5); glycolysis needs a little ATP to
// start (g6); backup transporters (g7); and the Low glucose preset (g8).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { SEEDS, HOUR, SETTLE, WINDOW, LAMBDA_REF, warm, twin, avg, run, lam, fmt, mean } = H;

const PLAYERS = ['ptsG', 'gly', 'aaSyn', 'aaImp', 'lacY', 'lacZ', 'fliC'];

/** Starting once E < 1e−3 has held for 60 ticks, runs `seconds` and returns the largest protein change and pMade rise. */
function stallWindow(c, seconds, maxWait) {
  let below = 0, waited = 0;
  while (below < 60) {
    c.step();
    below = c.E < 1e-3 ? below + 1 : 0;
    if (++waited > maxWait) return null;
  }
  const P0 = PLAYERS.map((id) => c.gene(id).P), made0 = PLAYERS.map((id) => c.gene(id).pMade);
  let maxE = 0;
  for (let i = 0; i < seconds; i++) { c.step(); if (c.E > maxE) maxE = c.E; }
  let dP = 0, dMade = 0;
  PLAYERS.forEach((id, j) => {
    dP = Math.max(dP, Math.abs(c.gene(id).P - P0[j]));
    dMade = Math.max(dMade, c.gene(id).pMade - made0[j]);
  });
  return { dP, dMade, maxE };
}

test('g1/g2: with no glucose ATP runs out within seconds and everything stalls; refeeding restarts growth with the proteins already there', (t) => {
  const c = warm(1);
  let h0 = 0, k0 = 0;
  const l0 = avg(c, 600, (x) => { h0 += x.k.hin; k0 += x.k.kInit; return x.k.lambda; });
  h0 /= 600; k0 /= 600;
  const m0 = H.totalMRNA(c);
  c.command({ type: 'setMedium', glucose_mM: 0 });
  let tE = -1, tLam = -1, worstInit = 0, m10 = 0;
  run(c, 600, (x, s) => {
    if (tE < 0 && x.E < 0.3) tE = s;
    if (tLam < 0 && x.k.lambda < 0.05 * l0) tLam = s;
    if (x.k.e0 < 1e-3) worstInit = Math.max(worstInit, x.k.hin / h0, x.k.kInit / k0);
    if (s === 600) m10 = H.totalMRNA(x) / m0;
  });
  t.diagnostic(`g1: E < 0.3 after ${tE} s, λ < 0.05 λ0 after ${tLam} s; initiation while E < 1e−3 ≤ ${fmt(worstInit)} of before; mRNA at 10 min ${fmt(m10)}`);
  assert.ok(tE > 0 && tE <= 5, `g1: E fell below 0.3 after ${tE} s`);
  assert.ok(tLam > 0 && tLam <= 10, `g1: λ fell below 0.05 λ0 after ${tLam} s`);
  assert.ok(worstInit < 0.01, `g1: initiation at E < 1e−3 was ${fmt(worstInit)} of before`);
  assert.ok(m10 <= 0.2, `g1: total mRNA at 10 min is ${fmt(m10)} of before`);

  const starved = twin(c);                           // the stall window is checked on a twin
  const w = stallWindow(starved, 20 * 60, 600);
  assert.ok(w, 'g1: E never stayed below 1e−3 for 60 ticks');
  t.diagnostic(`g1 stall window (20 min): max |ΔP| ${fmt(w.dP)}, max pMade rise ${fmt(w.dMade)}`);
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

test('g3/g4: without new PtsG the transporter is diluted away and growth spirals down; the longer the wait, the slower the recovery', (t) => {
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
  assert.ok(at[6].E < 0.5, `g3: E after 6 h ${fmt(at[6].E)}`);
  assert.ok(at[20].lam <= 0.15, `g3: λ/λ0 after 20 h ${fmt(at[20].lam)}`);
  assert.ok(recovery[20] > recovery[10] && recovery[10] > recovery[6], `g4: recovery times ${fmt(recovery[6], 2)}, ${fmt(recovery[10], 2)}, ${fmt(recovery[20], 2)} h`);
});

test('g5: a cell with no transporter at all never recovers: ATP stays at the floor and nothing is made for 24 h', (t) => {
  const c = new H.Cell({ seed: 1, start: 'steady', genes: { ptsG: { knockout: true, initial: { protein: 0 } } } });
  const w = stallWindow(c, 24 * HOUR, 3600);
  assert.ok(w, 'g5: E never stayed below 1e−3 for 60 ticks');
  t.diagnostic(`g5: max E ${fmt(w.maxE)}; max |ΔP| ${fmt(w.dP)}; max pMade rise ${fmt(w.dMade)}`);
  assert.ok(w.maxE <= 1e-6, `g5: E rose to ${w.maxE}`);
  assert.ok(w.dP < 1 && w.dMade < 1, `g5: a protein changed by ${fmt(w.dP)} (made ${fmt(w.dMade)})`);
});

test('g6: glycolysis needs a little ATP to start: without the priming seed, too few enzymes never restart; with it, even few do', (t) => {
  const trial = (primingSeed, f, hours, target, within) => {
    const c = warm(1, { flags: { primingSeed } });
    const l0 = avg(c, 600, lam);
    c.command({ type: 'setMedium', glucose_mM: 0 });
    c.advance(20 * 60);
    c.gene('ptsG').P *= f;                           // test-only: fewer transporters and glycolytic enzymes
    c.gene('gly').P *= f;
    c.command({ type: 'setMedium', glucose_mM: 10 });
    let reached = -1, maxE = 0;
    run(c, hours * HOUR, (x, s) => {
      if (x.E > maxE) maxE = x.E;
      if (reached < 0 && x.k.lambda >= target * l0) reached = s;
    });
    return { reached, maxE, within: reached > 0 && reached <= within };
  };
  const dead = trial(0, 0.2, 4, 0.8, 4 * HOUR);
  const half = trial(0, 0.5, 1, 0.8, 30 * 60);
  const seeded = trial(0.01, 0.15, 6, 0.9, 6 * HOUR);
  t.diagnostic(`s0 = 0, f = 0.2: max E ${fmt(dead.maxE)}; s0 = 0, f = 0.5: 0.8 λ0 after ${half.reached} s; s0 = 0.01, f = 0.15: 0.9 λ0 after ${fmt(seeded.reached / HOUR, 2)} h`);
  assert.ok(dead.reached < 0 && dead.maxE < 1e-6, `s0 = 0, f = 0.2 recovered (max E ${fmt(dead.maxE)})`);
  assert.ok(half.within, `s0 = 0, f = 0.5 reached 0.8 λ0 after ${half.reached} s`);
  assert.ok(seeded.within, `s0 = 0.01, f = 0.15 reached 0.9 λ0 after ${seeded.reached} s`);
});

test('g7: backup glucose uptake gives the slow growth of a real ΔptsG strain (0.10–0.18 /h)', (t) => {
  const c = warm(1, { flags: { backupGlucoseUptake: true }, genes: { ptsG: { level: 'off' } } });
  c.advance(16 * HOUR);
  const l = avg(c, WINDOW, lam) * 3600;
  t.diagnostic(`λ ${fmt(l)} /h`);
  assert.ok(l >= 0.10 && l <= 0.18, `ΔptsG with backup uptake grows at ${fmt(l)} /h`);
});

test('g8: the Low glucose preset (0.005 mM) leaves PtsG partly empty and about halves growth (set C)', (t) => {
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
    // What the narrator is told (spec §11.5), and the thresholds behind it.
    assert.equal(r.level, 'low', `facts.glucoseLevel at ${r.G} mM`);
    assert.equal(r.growth, 'slow', `facts.growth with λEMA ${fmt(r.ema)} /s`);
    assert.ok(r.ema < 0.8 * LAMBDA_REF && r.ema > 0.05 * LAMBDA_REF, `λEMA ${fmt(r.ema)} /s is not in the 'slow' band`);
  }
});
