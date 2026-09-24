// Engine 1.1.1: the observe-only fields the close-ups read (docs/PROLOGUE.md §7, OB-1 … OB-4).
// Nothing here changes physics: the digests and hashes of three scenarios are pinned to the
// values engine 1.1.0 gave, and every new field is checked against a direct computation
// from the state or against the counts the view already had.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { BTC, Cell, PV } = H;

const SCENARIOS = [
  ['m1-lab steady, ptsG x2 then lacY x4 + lactose', { seed: 1, start: 'steady' },
    [[100, { type: 'setPromoter', gene: 'ptsG', level: 2 }], [900, { type: 'setPromoter', gene: 'lacY', level: 4 }],
      [1500, { type: 'setMedium', lactose_mM: 5 }], [2400, { type: 'setMedium', glucose_mM: 0 }]], 6000,
    ['0ebb202d36c5ad3f', '0ed0767145a33b7b']],
  ['m2-l11 birth, backup uptake, ptsG cleared then on',
    { seed: 7, strain: 'm2-l11', start: 'birth', flags: { backupGlucoseUptake: true }, genes: { ptsG: { level: 'off', initial: { clear: true, protein: 0 } } } },
    [[300, { type: 'setPromoter', gene: 'ptsG', level: 2 }]], 5000, ['d69ebc65a460d53f', 'e325159cc8e0e5d2']],
  ['m2-lac steady, glucose to lactose', { seed: 3, strain: 'm2-lac', start: 'steady' },
    [[600, { type: 'setMedium', glucose_mM: 0, lactose_mM: 5 }]], 7200, ['ad649cbd169fcec3', '223ef5bc6299cf06']],
];

/** Runs a scenario; each(cell) is called after every step. */
function play(cfg, cmds, ticks, each) {
  const c = new Cell(cfg);
  let i = 0;
  while (c.tick < ticks) {
    while (i < cmds.length && cmds[i][0] === c.tick) c.command(cmds[i++][1]);
    c.step();
    if (each) each(c);
  }
  return c;
}

const close = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b)), `${what}: ${a} vs ${b}`);

test('OB-3: engine 1.1.1 is 1.1.0 physics: physicsDigest and hash of three scenarios equal the 1.1.0 values, observed or not', () => {
  assert.equal(BTC.ENGINE_VERSION, '1.1.1');
  const out = { gene: '', tick: -1, ribosomes: 0, ribosomeProgress: new Float64Array(16) };
  for (const [name, cfg, cmds, ticks, pinned] of SCENARIOS) {
    const quiet = play(cfg, cmds, ticks);
    assert.deepEqual([quiet.physicsDigest(), quiet.hash()], pinned, name + ' (not observed)');
    // Reading the view and the detail after every tick changes nothing.
    const watched = play(cfg, cmds, ticks, (c) => { c.observe(); c.detail('ptsG', out); c.detail('lacY', out); });
    assert.deepEqual([watched.physicsDigest(), watched.hash()], pinned, name + ' (observed every tick)');
  }
});

test('OB-1: location, lengths and oligomers come from the catalog; tlCopies and tlStarts are the last tick\'s translation initiation', () => {
  for (const strain of ['m1-lab', 'm2-l11', 'm2-lac']) {
    const c = new Cell({ seed: 2, strain, start: 'steady' });
    const cat = BTC.catalog.STRAINS[strain].genes;
    c.advance(30);
    const v = c.observe();
    for (const d of cat) {
      const g = v.geneById[d.id];
      assert.equal(g.location, d.location, d.id);
      assert.equal(g.length_aa, d.length, d.id);
      assert.equal(g.mRNA_nt, 3 * d.length + PV.utrNt, d.id);
      assert.equal(g.oligomer, d.oligomer, d.id);
      assert.equal(g.unit_nt, c.geneById[d.id].nt, d.id);
    }
    // The per-copy start rate is the same for every gene with copies, weighted by its RBS (the even split of Engine §7.5).
    let ref = null;
    for (const g of c.genes) {
      const gv = v.geneById[g.id];
      assert.equal(gv.tlCopies, g.tlCopies);
      if (!(gv.tlCopies > 0)) { assert.equal(gv.tlStarts_perS, 0, g.id); continue; }
      const perCopy = gv.tlStarts_perS / (g.rbs * gv.tlCopies);
      if (ref === null) ref = perCopy; else close(perCopy, ref, 1e-12, strain + ' ' + g.id + ' per-copy starts');
    }
  }
});

test('OB-1: every ribosome that started on a gene is finished or still in flight (Σ tlStarts·dt over an hour, no division)', () => {
  const c = new Cell({ seed: 4, start: 'birth', genes: { lacY: { level: 2 }, fliC: { level: 1 } } });
  const ids = ['ptsG', 'gly', 'lacY', 'fliC'];
  const v = c.observe();
  const made0 = {}, fly0 = {}, started = {};
  for (const id of ids) { made0[id] = v.geneById[id].proteinMade; fly0[id] = v.geneById[id].ribosomes; started[id] = 0; }
  const gen = v.clock.generation;
  for (let t = 0; t < 3600; t++) {
    c.step();
    const w = c.observe();
    for (const id of ids) started[id] += w.geneById[id].tlStarts_perS * c.dt;
  }
  const w = c.observe();
  assert.equal(w.clock.generation, gen, 'no division in the window');
  for (const id of ids) {
    const g = w.geneById[id];
    const out = g.proteinMade - made0[id] + g.ribosomes - fly0[id];
    // Within 1e-4: at normal energy a tiny share of paused ribosomes is still released by rescue (Engine §7.8b).
    close(started[id], out, 1e-4, id + ' started vs finished + in flight');
  }
});

test('OB-1: work flux per role and per machine; the lac repressor\'s inducer share', () => {
  // Lactose only, with LacY and LacZ made: LacY carries lactose in and LacZ splits it.
  const c = new Cell({ seed: 5, start: 'steady', medium: { glucose_mM: 10, lactose_mM: 5 }, genes: { lacY: { level: 2 }, lacZ: { level: 2 } } });
  c.advance(2400);
  c.command({ type: 'setMedium', glucose_mM: 0 });
  c.advance(1200);
  const v = c.observe(), f = v.flux;
  const G = (id) => v.geneById[id];
  assert.equal(G('ptsG').work_perS, f.glucoseInPtsG);
  assert.equal(G('gly').work_perS, f.hexoseToGlycolysis);
  assert.equal(G('aaSyn').work_perS, f.aaMade);
  assert.equal(G('aaImp').work_perS, f.aaImported);
  assert.equal(G('lacY').work_perS, f.lactoseIn);
  assert.equal(G('lacZ').work_perS, f.lactoseSplit);
  assert.equal(G('fliC').work_perS, 0);
  assert.ok(f.lactoseIn > 0 && f.lactoseSplit > 0, 'lactose flows');
  close(G('lacY').workPerCopy_perS, f.lactoseIn / G('lacY').protein, 1e-12, 'LacY per copy');
  close(G('lacZ').workPerCopy_perS, 4 * f.lactoseSplit / G('lacZ').protein, 1e-12, 'LacZ per four-chain enzyme');
  close(G('gly').workPerCopy_perS, f.hexoseToGlycolysis / G('gly').protein, 1e-12, 'gly per copy');
  // A gene with less than one protein does no per-copy work.
  const d = new Cell({ seed: 5, start: 'steady', genes: { lacY: { level: 'off', initial: { clear: true, protein: 0 } } } });
  d.advance(5);
  assert.equal(d.observe().geneById.lacY.workPerCopy_perS, 0);
  // m2-lac: inducerShare = 1 − activeLacI / lacITetramers.
  const l = new Cell({ seed: 3, strain: 'm2-lac', start: 'steady' });
  l.advance(60);
  const lv = l.observe().lac;
  close(lv.inducerShare, lv.lacITetramers > 0 ? 1 - lv.activeLacI / lv.lacITetramers : 0, 1e-12, 'inducer share');
  assert.ok(lv.inducerShare >= 0 && lv.inducerShare <= 1);
  l.command({ type: 'setMedium', glucose_mM: 0, lactose_mM: 5, iptg_mM: 1 });
  l.advance(600);
  assert.ok(l.observe().lac.inducerShare > 0.5, 'IPTG loads the repressors: ' + l.observe().lac.inducerShare);
});

test('OB-4: the glucose split adds up to glucoseIn and follows the capacity shares; ribosome progress bins add up to the gene\'s ribosomes', () => {
  const k_pts = PV.k_pts;
  const cfg = { seed: 7, strain: 'm2-l11', start: 'birth', flags: { backupGlucoseUptake: true }, genes: { ptsG: { level: 'off', initial: { clear: true, protein: 0 } } } };
  let sawSide = false, sawBoth = false;
  const out = { gene: '', tick: -1, ribosomes: 0, ribosomeProgress: new Float64Array(16) };
  const c0 = new Cell(cfg);
  let P0 = 0;
  c0.schedule(300, { type: 'setPromoter', gene: 'ptsG', level: 2 });
  while (c0.tick < 4000) {
    P0 = c0.genes[0].P;                 // PtsG at the start of the tick (the capacities are fixed then, Engine §7.6)
    c0.step();
    const c = c0;
    if (c.tick % 97) continue;
    const v = c.observe(), f = v.flux;
    close(f.glucoseInPtsG + f.glucoseInSide, f.glucoseIn, 1e-12, 'split sums');
    const pts = P0 * c.genes[0].activity * k_pts, side = c.uBasal * c.k.V;
    if (f.glucoseIn > 0) close(f.glucoseInSide / f.glucoseIn, side / (side + pts), 1e-9, 'side share at tick ' + c.tick);
    if (pts === 0 && f.glucoseIn > 0) { sawSide = true; assert.equal(f.glucoseInPtsG, 0); }
    if (pts > 0 && f.glucoseInSide > 0) sawBoth = true;
    assert.equal(v.geneById.ptsG.work_perS, f.glucoseInPtsG);
    for (const id of ['ptsG', 'gly', 'araE']) {
      const d = c.detail(id, out);
      assert.equal(d, out);
      let s = 0;
      for (const x of d.ribosomeProgress) { assert.ok(x >= 0); s += x; }
      close(s, v.geneById[id].ribosomes, 1e-9, id + ' Σ bins');
      close(d.ribosomes, v.geneById[id].ribosomes, 1e-9, id + ' ribosomes');
    }
  }
  assert.ok(sawSide && sawBoth, 'the side route alone, then both routes');
  // Without the side route all glucose comes through PtsG.
  const c = new Cell({ seed: 1, start: 'steady' });
  c.advance(20);
  assert.equal(c.observe().flux.glucoseInSide, 0);
  assert.equal(c.observe().flux.glucoseInPtsG, c.observe().flux.glucoseIn);
  assert.equal(c.observe().ribosomes.odometer_aa, c.D);
});

test('OB-2: observe() and detail(out) allocate nothing: the same objects every call; ribosomes spread over chain progress', () => {
  const c = new Cell({ seed: 1, start: 'steady', genes: { lacY: { level: 4 } } });
  c.advance(600);
  const v = c.observe();
  const out = { gene: '', tick: -1, ribosomes: 0, ribosomeProgress: new Float64Array(16) };
  const arr = out.ribosomeProgress;
  for (let i = 0; i < 200; i++) {
    c.step();
    assert.equal(c.observe(), v);
    assert.equal(c.detail('lacY', out), out);
    assert.equal(out.ribosomeProgress, arr);
  }
  assert.equal(out.gene, 'lacY');
  assert.equal(out.tick, c.tick);
  // A steadily expressed gene has ribosomes at every stage of the chain.
  const filled = Array.from(arr).filter((x) => x > 0).length;
  assert.ok(filled >= 14, filled + ' of 16 bins hold ribosomes');
  // Without out, detail builds its own holder; an unknown gene gives empty bins.
  const own = c.detail('nope');
  assert.equal(own.ribosomes, 0);
  assert.equal(own.ribosomeProgress.length, 16);
  // The refresh source still allocates nothing (the c-3 rule covers the new fields).
  assert.ok(!/subarray|slice\(|new |\[\]|Array\(/.test(BTC.observe.refresh.toString()));
});
