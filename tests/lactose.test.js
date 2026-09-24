// Lactose feeds the cell only when both lac proteins are there: LacY carries it
// in, LacZ splits it (h1, h2). A cell that never made them cannot start on
// lactose alone without oxygen (h3, a documented gap). Lactose outside a cell
// without LacY changes nothing at all (h4, negative control).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { PV, HOUR, SETTLE, WINDOW, warm, avg, run, lam, fmt } = H;

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

test('h1: without either lac protein (a true knockout, no leak protein) the cell runs out of ATP within an hour', (t) => {
  const l0 = lambda0();
  for (const [label, genes] of [
    ['Y only', { lacY: { level: 1 }, lacZ: KO }],
    ['Z only', { lacY: KO, lacZ: { level: 1 } }],
    ['neither', { lacY: KO, lacZ: KO }],
  ]) {
    const c = preinduced(genes);
    c.advance(HOUR);
    t.diagnostic(`${label}: λ/λ0 ${fmt(c.k.lambda / l0)}, E ${fmt(c.E)} after 1 h`);
    assert.ok(c.k.lambda < 0.01 * l0, `${label}: λ/λ0 = ${fmt(c.k.lambda / l0)} after 1 h on lactose`);
    assert.ok(c.E < 0.01, `${label}: E = ${fmt(c.E)} after 1 h on lactose`);
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

test('h3: (documented gap, spec §15 item 1) a basal-lac cell cannot adapt to lactose alone without oxygen', (t) => {
  const c = warm(1);
  c.command(lactoseOnly);
  c.advance(10 * HOUR);
  const l0 = lambda0();
  t.diagnostic(`after 10 h: λ/λ0 ${fmt(c.k.lambda / l0)}; LacY ${fmt(c.gene('lacY').P, 1)}, LacZ ${fmt(c.gene('lacZ').P, 1)} monomers`);
  assert.ok(c.k.lambda < 0.01 * l0, `λ/λ0 = ${fmt(c.k.lambda / l0)} after 10 h`);
  assert.equal(lactoseBlock(c), 'no-lacY');
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

