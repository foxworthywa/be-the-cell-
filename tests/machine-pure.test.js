// The machine pictures' rules (docs/PROLOGUE.md §3.4, §4; §10.1 ZC-5) and the level 1.5 fold hooks (§4.4).
// A molecule is drawn in a pocket only when it fits and the model's rate is above 0; a molecule
// that does not fit never enters; the slow factor keeps one cycle between 0.6 and 3 s of real
// time; population states follow the hashed draw; pockets are cut to the shape of what fits.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CU = require('../src/shared/btc-closeup.js');
const D = require('../src/shared/btc-dots.js');
const Fold = require('../src/shared/btc-fold.js');
const Art = require('../src/app/btc-machine.js').art;

const model = (gene, r, extra) => {
  const M = CU.machineOf(gene);
  return Object.assign({ gene, machine: M, kind: M.kind, r, k: CU.slowFactor(r), working: r > 0, nonfitPresent: !!M.nonfit, share: 0, inducerShare: 0, none: false }, extra || {});
};

test('ZC-5: the slow factor keeps one cycle between 0.6 and 3 s of real time for rates from 0.01 to 10⁴ per second', () => {
  for (let e = -2; e <= 4; e += 0.01) {
    const r = Math.pow(10, e), k = CU.slowFactor(r), period = k / r;
    assert.ok(period >= 0.6 - 1e-9 && period <= 3 + 1e-9, 'r ' + r.toFixed(4) + ': k ' + k + ', ' + period.toFixed(2) + ' s');
    assert.ok(CU.FACTORS.indexOf(k) >= 0);
  }
  assert.equal(CU.slowFactor(41), 100, 'PtsG at 41 glucose a second: shown 100 times slower');
  assert.equal(CU.slowFactor(0), 1);
  assert.equal(CU.sig2(41.37), 41);
  assert.equal(CU.sig2(0.01234), 0.012);
});

test('ZC-5: with rate 0 nothing binds; a molecule that does not fit never enters the pocket', () => {
  for (const gene of ['ptsG', 'lacY', 'aaImp', 'araE', 'lacZ', 'gly', 'aaSyn', 'glut']) {
    const idle = model(gene, 0), work = model(gene, 23);
    const st = CU.createMachineState();
    let bound = 0;
    for (let tau = 0; tau < 20; tau += 0.013) {
      CU.machineState(idle, tau, st, 0);
      assert.equal(st.bound || st.subShown || st.prodShown, false, gene + ': nothing bound at rate 0');
      if (st.nfShown) {
        const rim = idle.kind === 'transporter' ? -2.9 : -1.2;
        assert.ok(st.nfY <= rim, gene + ': the molecule that does not fit stays at the rim (' + st.nfY.toFixed(2) + ')');
      }
      CU.machineState(work, tau, st, 0);
      if (st.bound) bound++;
      if (st.nfShown) assert.ok(st.nfY <= (work.kind === 'transporter' ? -2.9 : -1.2), gene + ': never in the pocket');
    }
    assert.ok(bound > 100, gene + ': a working machine binds its substrate each cycle (' + bound + ')');
  }
  // The machine's shape changes while it works (alternating access): open out, closed, open in.
  const st = CU.createMachineState(), m = model('ptsG', 41);
  const seen = new Set();
  for (let ph = 0; ph < 1; ph += 0.01) { CU.machineState(m, (ph * m.k) / m.r, st, 0); seen.add(Math.round(st.open)); }
  assert.deepEqual(Array.from(seen).sort(), [-1, 0, 1]);
  // PtsG hands the glucose over with a phosphate tag; the opening's muscle transporter does not tag it.
  CU.machineState(m, (0.7 * m.k) / m.r, st, 0);
  assert.equal(st.subForm, 1);
  const g = model('glut', 1);
  CU.machineState(g, 0.7, st, 0);
  assert.equal(st.subForm, 0);
});

test('ZC-5: the repressor\'s state follows the hashed draw per 2 s display period', () => {
  const m = model('lacI', 0, { share: 0.4, inducerShare: 0.3 });
  const st = CU.createMachineState();
  let clamped = 0;
  for (let period = 0; period < 400; period++) {
    CU.machineState(m, period * 2 + 0.5, st, 7);
    assert.equal(st.clamped, D.hash01('m:lacI', period, 7) < 0.4);
    if (st.clamped) clamped++;
  }
  assert.ok(clamped > 120 && clamped < 200, 'about 40% of periods clamped: ' + clamped);
});

test('Pockets are cut to the shape of what fits: the molecule\'s rings lie inside its pocket, a larger one does not', () => {
  for (const type of ['glucose', 'galactose', 'lactose', 'allolactose', 'arabinose', 'aa']) {
    const pk = Art.pocketFor(type);
    assert.ok(pk.left.length > 10, type);
    for (let i = 0; i < pk.left.length; i++) {
      const y = pk.left[i][1], r = Art.rowRange(type, y, true);
      if (!r) continue;
      assert.ok(pk.left[i][0] < r[0] && pk.right[i][0] > r[1], type + ' at ' + y.toFixed(2));
      assert.ok(r[0] - pk.left[i][0] < 0.2 && pk.right[i][0] - r[1] < 0.2, type + ': a snug fit');
    }
  }
  // Lactose is wider than the glucose pocket when it lies across it.
  const g = Art.pocketFor('glucose');
  const width = Math.max(...g.right.map((p) => p[0])) - Math.min(...g.left.map((p) => p[0]));
  const lactoseFlat = 2 * Art.HALF_H.lactose;
  assert.ok(lactoseFlat > width * 1.8, 'lactose (' + lactoseFlat + ' nm) is far too big for the glucose pocket (' + width.toFixed(2) + ' nm)');
});

test('§4.4 hooks: model folds (HP lattice): deterministic best fold, energy, mutations, pocket shape', () => {
  const ref = Fold.REFERENCE;
  assert.equal(ref.beads.length, 16);
  const a = Fold.best(ref.beads), b = Fold.best(ref.beads);
  assert.equal(a, b, 'cached');
  assert.equal(Fold.energy({ beads: ref.beads, path: a.path }), -a.contacts);
  // A self-avoiding walk on the lattice.
  const seen = new Set(a.path.map((p) => p.join(',')));
  assert.equal(seen.size, 16);
  for (let i = 1; i < 16; i++) assert.equal(Math.abs(a.path[i][0] - a.path[i - 1][0]) + Math.abs(a.path[i][1] - a.path[i - 1][1]), 1);
  // All oily: a compact 4 × 4 square has 9 contacts; no oily beads, no contacts.
  assert.equal(Fold.best('HHHHHHHHHHHHHHHH').contacts, 9);
  assert.equal(Fold.best('PPPPPPPP').contacts, 0);
  // Mutations: a swap changes one bead, a stop ends the chain, a shift changes every bead after it.
  assert.equal(Fold.mutate('HPHP', { kind: 'swap', at: 1 }), 'HHHP');
  assert.equal(Fold.mutate('HPHP', { kind: 'stop', at: 2 }), 'HP');
  const sh = Fold.mutate(ref.beads, { kind: 'shift', at: 4 });
  assert.equal(sh.slice(0, 4), ref.beads.slice(0, 4));
  assert.equal(sh.length, 16);
  // The pocket shape does not depend on rotation or reflection; the reference fold keeps its pocket.
  const rot = a.path.map(([x, y]) => [-y, x]), mir = a.path.map(([x, y]) => [-x, y]);
  assert.equal(Fold.pocketShape(rot, ref.pocket), Fold.pocketShape(a.path, ref.pocket));
  assert.equal(Fold.pocketShape(mir, ref.pocket), Fold.pocketShape(a.path, ref.pocket));
  assert.equal(Fold.foldFor(ref.beads, ref.pocket, ref).works, true);
  // A stop before the pocket leaves no pocket; some single swaps keep it and some do not (position matters).
  assert.equal(Fold.foldFor(Fold.mutate(ref.beads, { kind: 'stop', at: 7 }), ref.pocket, ref).works, false);
  const works = [];
  for (let at = 0; at < 16; at++) works.push(Fold.foldFor(Fold.mutate(ref.beads, { kind: 'swap', at }), ref.pocket, ref).works);
  assert.ok(works.some(Boolean) && works.some((x) => !x), works.join(' '));
  assert.throws(() => Fold.best('HPX'), /H and P/);
  assert.throws(() => Fold.best('H'.repeat(17)), /at most 16/);
});
