// What the levels need from the engine (LEVELS.md §8.1, R-E1…R-E19, engine v1.1):
// newborn presets, opaque variants, counters in the view, lesson-only control
// locks, user-gene lists, function_seen, the decoy strain, cleared genes, the
// backup-uptake starving state, strain-driven gene lists and replay observers.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { BTC, Cell, HOUR, LAMBDA_REF, avg, lam, fmt } = H;

const STRAINS = ['m1-lab', 'm2-l11', 'm2-lac'];
const events = (c, type) => c.takeEvents().filter((e) => e.type === type);

test('R-E1: the engine is 1.1.0 and the golden scenario is pinned to it', () => {
  assert.equal(BTC.ENGINE_VERSION, '1.1.0');
  assert.equal(require('./golden.json').engineVersion, '1.1.0');
  for (const id of Object.keys(BTC.presets)) assert.equal(BTC.presets[id].engineVersion, '1.1.0', id);
});

test('R-E2: start "birth" loads a newborn (V ≈ 1 fL, one gene copy) for every strain; it replicates ≥ 45 min and divides ≥ 90 min later at reference growth', (t) => {
  for (const strain of STRAINS) {
    const c = new Cell({ seed: 1, strain, start: 'birth' });
    const s = new Cell({ seed: 1, strain, start: 'steady' });
    assert.notEqual(c.configHash, s.configHash, `${strain}: the birth preset's hash is in the config hash`);
    const V0 = c.volume, dosage0 = c.dosage, gen = c.gen;
    let rep = -1, div = -1;
    for (let i = 1; i <= 3 * HOUR && div < 0; i++) {
      c.step();
      if (rep < 0 && c.dosage === 2) rep = i;
      if (c.gen !== gen) div = i;
    }
    t.diagnostic(`${strain}: V ${fmt(V0)} fL, dosage ${dosage0}; replication after ${fmt(rep / 60, 1)} min, division after ${fmt(div / 60, 1)} min`);
    assert.ok(Math.abs(V0 - 1) <= 0.05 && dosage0 === 1, `${strain}: V ${fmt(V0)}, dosage ${dosage0}`);
    assert.ok(rep >= 45 * 60 && rep <= 55 * 60, `${strain}: replication after ${rep} s`);
    assert.ok(div >= 90 * 60 && div <= 110 * 60, `${strain}: division after ${div} s`);
  }
});

test('R-E3: config.variant is opaque JSON: key order does not matter, it is in the config hash and the run record, physics never reads it; oversized or non-JSON variants are rejected', () => {
  const v = { template: 'T2', phases: [[90, 'G'], [120, 'L']], slotOrder: [3, 1, 2], nested: { a: 1, b: [true, null] } };
  const a = new Cell({ seed: 1, start: 'steady', variant: v });
  const b = new Cell({ seed: 1, start: 'steady', variant: { nested: { b: [true, null], a: 1 }, slotOrder: [3, 1, 2], phases: [[90, 'G'], [120, 'L']], template: 'T2' } });
  const plain = new Cell({ seed: 1, start: 'steady' });
  assert.equal(a.configHash, b.configHash);
  assert.notEqual(a.configHash, plain.configHash);
  a.advance(2000); plain.advance(2000);
  assert.equal(a.physicsDigest(), plain.physicsDigest(), 'the variant changed the physics');
  assert.deepEqual(a.runRecord().config.variant, v);
  assert.deepEqual(Cell.restore(a.snapshot()).config.variant, v);
  for (const bad of [[1, 2], 'T1', { big: 'x'.repeat(3000) }]) {
    assert.throws(() => new Cell({ seed: 1, start: 'steady', variant: bad }), (e) => e instanceof BTC.ConfigError && e.path === 'variant');
  }
});

test('R-E4: function_seen fires once when PtsG carries the glucose flux, and view.genes[i].functionSeen survives a restore; never for a gene with no role', () => {
  const c = new Cell({ seed: 1, strain: 'm2-l11', start: 'birth', flags: { backupGlucoseUptake: true },
    genes: { ptsG: { level: 'off', initial: { clear: true, protein: 0 } }, araE: { level: 4 } } });
  c.advance(600);
  assert.deepEqual(events(c, 'function_seen').map((e) => e.gene).filter((g) => g === 'ptsG' || g === 'araE'), []);
  c.command({ type: 'setPromoter', gene: 'ptsG', level: 1 });
  let at = -1;
  for (let i = 0; i < 20 * 60 && at < 0; i++) { c.step(); if (events(c, 'function_seen').some((e) => e.gene === 'ptsG')) at = i; }
  assert.ok(at > 0, 'no function_seen for ptsG within 20 min');
  const r = Cell.restore(c.snapshot());
  assert.equal(r.observe().geneById.ptsG.functionSeen, true);
  assert.equal(r.observe().geneById.araE.functionSeen, false);
  r.advance(1200);
  assert.deepEqual(events(r, 'function_seen').filter((e) => e.gene === 'ptsG' || e.gene === 'araE'), [], 'fired twice, or for araE');
});

test('R-E5/R-E19: strain m2-l11 is the lab strain plus the araE decoy in slot 7; gene lists follow the strain (7, 8, 9 genes); shared genes keep their random streams', () => {
  const S = BTC.catalog.STRAINS;
  assert.deepEqual(S['m2-l11'].genes.map((g) => g.id), S['m1-lab'].genes.map((g) => g.id).concat(['araE']));
  const araE = S['m2-l11'].genes[7];
  assert.deepEqual([araE.id, araE.role, araE.uniprot, araE.defaultLevel], ['araE', 'none', 'P0AE24', 0]);
  assert.deepEqual(S['m2-lac'].genes.map((g) => g.id).slice(7), ['lacI', 'lacA']);
  for (const [strain, n] of [['m1-lab', 7], ['m2-l11', 8], ['m2-lac', 9]]) {
    const c = new Cell({ seed: 3, strain, start: 'steady' });
    assert.equal(c.observe().genes.length, n, strain);
    assert.equal(S[strain].genes.length, n, strain);
  }
  const a = new Cell({ seed: 3, strain: 'm1-lab', start: 'steady' }), b = new Cell({ seed: 3, strain: 'm2-l11', start: 'steady' });
  for (const g of a.genes) assert.deepEqual(Array.from(b.gene(g.id).txStream), Array.from(g.txStream), g.id);
  assert.deepEqual([b.gene('araE').L, b.gene('araE').P], [472, 0]);
});

test('R-E6: genes.<id>.initial.clear empties a gene (mRNA, transcripts, ribosomes) without knocking it out', () => {
  const c = new Cell({ seed: 2, start: 'steady', genes: { fliC: { level: 1, initial: { clear: true, protein: 0 } } } });
  const g = c.gene('fliC');
  assert.deepEqual([g.P, g.mature.count, g.nascent.len, g.cohorts.len, g.knockout], [0, 0, 0, 0, false]);
  c.advance(300);
  assert.ok(g.mMade > 0 && g.nascent.len + g.mature.count > 0, 'the cleared gene is still transcribed');
  assert.throws(() => new Cell({ seed: 2, start: 'steady', genes: { ptsG: { initial: { clear: 'yes' } } } }), (e) => e.path === 'genes.ptsG.initial.clear');
});

test('R-E7: on the backup route with ptsG off and cleared the cell starves but is not dormant (0.15–0.45 λref, E ≥ 0.05 after 10 min); ptsG ×1 then gives function_seen in 3–15 min and ≥ 0.8 λref within 90 min', (t) => {
  const rows = H.SEEDS.C.map((seed) => {
    const genes = {};
    for (const id of ['ptsG', 'aaImp', 'lacY', 'lacZ', 'fliC', 'araE']) genes[id] = { level: 'off', initial: { clear: true, protein: 0 } };
    const c = new Cell({ seed, strain: 'm2-l11', start: 'birth', flags: { backupGlucoseUptake: true }, genes });
    c.advance(600);
    c.takeEvents();
    const l10 = c.k.lambda / LAMBDA_REF, E10 = c.E;
    c.command({ type: 'setPromoter', gene: 'ptsG', level: 1 });
    let seen = -1, fast = -1;
    for (let i = 1; i <= 90 * 60; i++) {
      c.step();
      if (seen < 0 && events(c, 'function_seen').some((e) => e.gene === 'ptsG')) seen = i;
      if (fast < 0 && c.k.lambda >= 0.8 * LAMBDA_REF) fast = i;
    }
    return { l10, E10, seen, fast };
  });
  t.diagnostic(rows.map((r) => `λ ${fmt(r.l10)} λref, E ${fmt(r.E10)}; function_seen ${fmt(r.seen / 60, 1)} min; 0.8 λref at ${fmt(r.fast / 60, 0)} min`).join(' | '));
  for (const r of rows) {
    assert.ok(r.l10 >= 0.15 && r.l10 <= 0.45 && r.E10 >= 0.05, `starving state λ ${fmt(r.l10)} λref, E ${fmt(r.E10)}`);
    assert.ok(r.seen >= 3 * 60 && r.seen <= 15 * 60, `function_seen after ${r.seen} s`);
    assert.ok(r.fast > 0 && r.fast <= 90 * 60, `0.8 λref after ${r.fast} s`);
  }
});

test('R-E8/R-E9/R-E10: the view carries cumulative mRNAMade, proteinMade and initiations, the per-mRNA initiation rate and RBS, and degraded_perS', () => {
  const c = new Cell({ seed: 4, start: 'steady', genes: { fliC: { level: 4, kdeg_perS: 0.005 } } });
  c.advance(1200);
  const v = c.observe(), f = v.geneById.fliC, g = c.gene('fliC');
  assert.deepEqual([f.mRNAMade, f.proteinMade, f.initiations], [g.mMade, g.pMade, g.initiations]);
  assert.ok(f.mRNAMade > 0 && f.proteinMade > 0 && f.initiations >= f.mRNAMade);
  assert.equal(typeof v.ribosomes.kInitPerMRNA, 'number');
  assert.equal(f.rbs, g.rbs);
  // The §7.11 loss per second: first-order removal of a stable protein.
  assert.ok(Math.abs(f.degraded_perS - 0.005 * g.P) / (0.005 * g.P) < 0.05, `degraded_perS ${fmt(f.degraded_perS)} vs k·P ${fmt(0.005 * g.P)}`);
  assert.equal(v.geneById.ptsG.degraded_perS, 0);
});

test('R-E11: setControls locks and frees the dials only from a lesson; the change is logged and replayed', () => {
  const c = new Cell({ seed: 1, start: 'steady' });
  assert.equal(c.command({ type: 'setControls', controls: 'locked' }).error, 'locked', 'a user cannot lock');
  c.schedule(10, { type: 'setControls', controls: 'locked' });
  c.schedule(20, { type: 'setControls', controls: 'free' });
  c.advance(15);
  assert.equal(c.controls, 'locked');
  assert.equal(c.command({ type: 'setPromoter', gene: 'lacY', level: 2 }).error, 'locked');
  c.advance(10);
  assert.equal(c.controls, 'free');
  assert.equal(c.command({ type: 'setPromoter', gene: 'lacY', level: 2 }).ok, true);
  c.advance(10);
  const r = BTC.replay.run(c.runRecord());
  assert.equal(r.hash(), c.hash());
});

test('R-E12: flags.userGenes restricts user gene commands to the listed genes (others rejected "locked"); lessons are not restricted', () => {
  const c = new Cell({ seed: 1, start: 'steady', flags: { userGenes: ['lacY'] } });
  assert.equal(c.command({ type: 'setPromoter', gene: 'lacY', level: 2 }).ok, true);
  assert.equal(c.command({ type: 'setPromoter', gene: 'fliC', level: 2 }).error, 'locked');
  assert.equal(c.command({ type: 'setMedium', lactose_mM: 5 }).ok, true, 'the medium is not a gene command');
  assert.equal(c.schedule(c.tick + 1, { type: 'setPromoter', gene: 'fliC', level: 2 }).ok, true);
  assert.throws(() => new Cell({ seed: 1, start: 'steady', flags: { userGenes: ['araE'] } }), (e) => e.path === 'flags.userGenes');
});

test('R-E18: replay.run calls attach(cell) before the first step, so observers see every tick', () => {
  const c = new Cell({ seed: 6, start: 'steady', strain: 'm2-lac', design: { lac: { promoter: 2 } }, variant: { t: 'T1' } });
  c.command({ type: 'setMedium', glucose_mM: 0, lactose_mM: 5 });
  c.advance(500);
  let seenAt = null, steps = 0;
  const r = BTC.replay.run(c.runRecord(), 500, {
    attach(cell) { seenAt = cell.tick; const step = cell.step.bind(cell); cell.step = () => { steps++; step(); }; },
  });
  assert.equal(seenAt, 0);
  assert.equal(steps, 500);
  assert.equal(r.hash(), c.hash());
});

test('watchers (engine spec §11.2; kept although levels use observers): an edge-triggered watch event fires when a view value crosses a line', () => {
  const c = new Cell({ seed: 1, start: 'steady' });
  const id = c.watch({ field: 'energy.E', op: '<', value: 0.3, id: 'lowE' });
  assert.equal(id, 'lowE');
  assert.throws(() => c.watch({ field: 'energy.nope', op: '<', value: 1 }), (e) => e instanceof BTC.ConfigError);
  c.takeEvents();
  c.command({ type: 'setMedium', glucose_mM: 0 });
  c.advance(30);
  const w = c.takeEvents().filter((e) => e.type === 'watch');
  assert.equal(w.length, 1);
  assert.equal(w[0].id, 'lowE');
  assert.ok(w[0].value < 0.3);
  assert.equal(c.unwatch('lowE'), true);
});
