// Lactose feeds the cell only when both lac proteins are there: LacY carries it
// in, LacZ splits it (h1, h2). With the regulated operon (strain m2-lac, v1.1) a
// glucose-grown cell with its few basal LacY and LacZ adapts to lactose alone
// after a lag, and more pre-existing LacY/LacZ shortens it (h3); the lab strain,
// with no lac regulation, cannot (h3c). Lactose outside a cell without LacY
// changes nothing at all (h4, negative control).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { PV, HOUR, SETTLE, WINDOW, SEEDS, warm, avg, run, lam, fmt } = H;

const KO = { knockout: true, initial: { protein: 0 } };
const lactoseOnly = { type: 'setMedium', glucose_mM: 0, lactose_mM: PV.lactosePresent };
const LinMM = (c) => c.Lin / (PV.N_mM * c.volume);
// What the narrator is told about the lac block (spec §11.5: capacity below 1% of the induced reference).
const lactoseBlock = (c) => H.BTC.observe.facts(c).lactoseBlock;

/** Warm cell with the given lac genes, preinduced 4 h in glucose, then moved to lactose only. */
function preinduced(genes) {
  const c = warm(1, { genes });
  c.advance(4 * HOUR);
  c.command(lactoseOnly);
  return c;
}

const lambda0 = () => H.steadyLambda(1);
let splitYZ = 0;   // cumulative lactose split in the first hour by the Y+Z arm (h2 compares against it)

test('h1: lactose supports growth when LacY and LacZ are both present', (t) => {
  const c = preinduced({ lacY: { level: 1 }, lacZ: { level: 1 } });
  run(c, HOUR, (x) => { splitYZ += x.flux.lactoseSplit * x.dt; });
  c.advance(SETTLE - HOUR);
  const r = avg(c, WINDOW, { lam, E: (x) => x.E });
  t.diagnostic(`Y+Z ×1 on lactose: Td ${fmt(H.Td_min(r.lam), 0)} min, E ${fmt(r.E)}`);
  assert.ok(H.Td_min(r.lam) >= 90 && H.Td_min(r.lam) <= 130, `Td on lactose ${fmt(H.Td_min(r.lam), 0)} min`);
  assert.ok(r.E > 0.8, `E on lactose ${fmt(r.E)}`);
});

test('h1: without either lac protein (a true knockout, no leak protein) growth stops; ATP falls to the starving level, and to nothing when LacY pumps lactose that is never split (lactose killing)', (t) => {
  const l0 = lambda0();
  for (const [label, genes, lo, hi] of [
    // LacY alone keeps pumping lactose in on the proton gradient; nothing splits it, so the pumping
    // drains ATP to the floor (transport itself kills: Dykhuizen & Hartl 1978, also in lacZ cells).
    ['Y only', { lacY: { level: 1 }, lacZ: KO }, 0, 0.01],
    // v1.1: with nothing coming in, the energy gates hold the starving cell's charge near 0.1 (g1).
    ['Z only', { lacY: KO, lacZ: { level: 1 } }, 0.05, 0.2],
    ['neither', { lacY: KO, lacZ: KO }, 0.05, 0.2],
  ]) {
    const c = preinduced(genes);
    c.advance(HOUR);
    t.diagnostic(`${label}: λ/λ0 ${fmt(c.k.lambda / l0)}, E ${fmt(c.E)} after 1 h`);
    assert.ok(c.k.lambda < 0.01 * l0, `${label}: λ/λ0 = ${fmt(c.k.lambda / l0)} after 1 h on lactose`);
    assert.ok(c.E >= lo && c.E < hi, `${label}: E = ${fmt(c.E)} after 1 h on lactose`);
  }
});

test('h2: with LacY but no LacZ, lactose gets in but is not split', (t) => {
  const c = preinduced({ lacY: { level: 1 }, lacZ: KO });
  let reached = -1, split = 0;
  run(c, 60, (x, s) => { if (reached < 0 && LinMM(x) > 0.5) reached = s; split += x.flux.lactoseSplit; });
  t.diagnostic(`internal lactose ${fmt(LinMM(c), 2)} mM after 60 s (above 0.5 mM after ${reached} s)`);
  assert.ok(reached > 0, `internal lactose only ${fmt(LinMM(c), 2)} mM after 60 s`);
  assert.equal(split, 0, 'lactose was split with no LacZ at all');
  assert.equal(lactoseBlock(c), 'no-lacZ');

  // Leak arm: lacZ merely "off" (1/1,000 leak), never switched on.
  if (!splitYZ) {
    const yz = preinduced({ lacY: { level: 1 }, lacZ: { level: 1 } });
    run(yz, HOUR, (x) => { splitYZ += x.flux.lactoseSplit * x.dt; });
  }
  const leak = preinduced({ lacY: { level: 1 } });
  let splitLeak = 0;
  run(leak, HOUR, (x) => { splitLeak += x.flux.lactoseSplit * x.dt; });
  t.diagnostic(`leak arm: LacZ ${fmt(leak.gene('lacZ').P, 1)} monomers; lactose split in 1 h ${fmt(splitLeak)} vs ${fmt(splitYZ)} with LacZ ×1`);
  assert.ok(splitLeak < 0.01 * splitYZ, `leaky lacZ split ${fmt(splitLeak / splitYZ)} of the induced arm's lactose`);
  assert.equal(lactoseBlock(leak), 'no-lacZ');
});

// h3 (v1.1): adaptation of the regulated operon. Lag as LEVELS.md §7.7.5: from the switch, the time
// until λ̄60 (the 60-s trailing mean) stays ≥ 0.5·λL for 60 s, λL being the induced wild type's steady growth on lactose.
function lambdaLac() {
  const c = new H.Cell({ seed: 99, strain: 'm2-lac', start: 'steady' });
  c.command({ type: 'setMedium', iptg_mM: 1 });
  c.advance(3 * HOUR);
  c.command({ type: 'setMedium', iptg_mM: 0, glucose_mM: 0, lactose_mM: PV.lactosePresent });
  c.advance(3 * HOUR);
  return avg(c, HOUR, lam);
}
let lamL = 0;
function lagOf(c, lamLac, maxTicks) {
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

test('h3: a glucose-grown wild-type cell (m2-lac preset: a few basal LacY and LacZ) adapts to lactose alone after a lag of about two hours, never going dormant', (t) => {
  lamL = lamL || lambdaLac();
  const rows = SEEDS.C.map((seed) => {
    const c = new H.Cell({ seed, strain: 'm2-lac', start: 'steady' });
    const Y = c.gene('lacY').P, Z = c.gene('lacZ').P;
    c.command(lactoseOnly);
    return Object.assign({ Y, Z }, lagOf(c, lamL, 5 * HOUR));
  });
  t.diagnostic(`λL ${fmt(lamL * 3600)} /h; at the switch LacY ${fmt(rows[0].Y, 1)}, LacZ ${fmt(rows[0].Z, 1)}; lags ${rows.map((r) => fmt(r.lag, 0)).join(', ')} min; lowest E ${fmt(Math.min(...rows.map((r) => r.Emin)))}`);
  for (const r of rows) {
    // Julou 2020: single glucose-grown cells lag from < 50 min to 3 h; Jacobson 1970: a ≈2 h diauxic lag.
    // This anaerobic cell (2 ATP per hexose) needs most of its induced LacY before growth reaches half.
    assert.ok(r.lag >= 60 && r.lag <= 180, `lag ${fmt(r.lag, 0)} min`);
    assert.ok(r.Emin >= 0.05, `E fell to ${fmt(r.Emin)} (dormancy starts below 0.01)`);
  }
});

test('h3b: more pre-existing LacY and LacZ shortens the lag (the preset cell, and the same cell holding 10× and 100× its lac proteins)', (t) => {
  lamL = lamL || lambdaLac();
  const rows = [1, 10, 100].map((x) => {
    const c = new H.Cell({ seed: 1, strain: 'm2-lac', start: 'steady' });
    for (const id of ['lacY', 'lacZ', 'lacA']) c.gene(id).P *= x;   // test-only: a cell that happened to carry more
    const Y = c.gene('lacY').P, Z = c.gene('lacZ').P;
    c.command(lactoseOnly);
    return Object.assign({ x, Y, Z }, lagOf(c, lamL, 5 * HOUR));
  });
  t.diagnostic(rows.map((r) => `LacY ${fmt(r.Y, 0)}, LacZ ${fmt(r.Z, 0)} → lag ${fmt(r.lag, 0)} min`).join('; '));
  assert.ok(rows[0].lag > rows[1].lag + 5 && rows[1].lag > rows[2].lag + 5, `lags ${rows.map((r) => fmt(r.lag, 0)).join(', ')} min`);
});

test('h3c: the lab strain has no lac regulation: with its lac genes at the leak it never adapts to lactose alone (LacY pumps, nothing splits)', (t) => {
  const c = warm(1);
  c.command(lactoseOnly);
  c.advance(10 * HOUR);
  const l0 = lambda0();
  t.diagnostic(`after 10 h: λ/λ0 ${fmt(c.k.lambda / l0)}; LacY ${fmt(c.gene('lacY').P, 1)}, LacZ ${fmt(c.gene('lacZ').P, 1)} monomers; E ${fmt(c.E)}`);
  assert.ok(c.k.lambda < 0.01 * l0, `λ/λ0 = ${fmt(c.k.lambda / l0)} after 10 h`);
});

test('h4: negative control: lactose outside a cell with no LacY leaves its physics bit-for-bit unchanged', (t) => {
  const make = (lactose) => new H.Cell({ seed: 7, start: 'cold', genes: { lacY: KO }, medium: { glucose_mM: 10, lactose_mM: lactose } });
  const a = make(0), b = make(PV.lactosePresent);
  let linA = 0, linB = 0;
  for (let i = 0; i < 20000; i++) {
    a.step(); b.step();
    if (a.Lin !== 0) linA++;
    if (b.Lin !== 0) linB++;
  }
  t.diagnostic(`digests ${a.physicsDigest()} / ${b.physicsDigest()}; hashes ${a.hash()} / ${b.hash()}`);
  assert.equal(linA + linB, 0, `internal lactose was nonzero on ${linA} + ${linB} ticks`);
  assert.equal(a.physicsDigest(), b.physicsDigest(), 'the two trajectories differ');
  assert.notEqual(a.hash(), b.hash(), 'the full hash should differ: the medium is hashed state');
});

