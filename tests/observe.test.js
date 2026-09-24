// The read-only view, the event detectors and the facts layer (engine spec
// §11.4–§11.5; test c-3). The view is what every drawing reads, so it must be
// right, allocation-free, and impossible to confuse with the state itself.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { BTC, Cell, PV, warm, fmt } = H;
const OBS = BTC.observe;

/** Every typed array reachable from the view, with its path. */
function typedArrays(v, path, out) {
  for (const key of Object.keys(v)) {
    const x = v[key], p = path + '.' + key;
    if (ArrayBuffer.isView(x)) out.push([p, x]);
    else if (x && typeof x === 'object' && key !== 'geneById') typedArrays(x, p, out);
  }
  return out;
}

test('c-3: 1,000 steps with observe() reuse every object and typed array; geneById shares the gene objects', () => {
  const c = warm(1, { genes: { fliC: { level: 4 } } });
  const v = c.observe();
  const arrays = typedArrays(v, 'view', []);
  const objects = [v.clock, v.cell, v.energy, v.ribosomes, v.flux, v.ledger, v.env, v.drugs, v.proteome, ...v.genes, ...v.genes.map((g) => g.episode)];
  assert.ok(arrays.length >= 7 * 3 + 6, `only ${arrays.length} typed arrays found`);
  for (let i = 0; i < 1000; i++) {
    c.step();
    assert.equal(c.observe(), v, 'observe() returned a new view');
  }
  const after = new Map(typedArrays(v, 'view', []));
  for (const [p, arr] of arrays) assert.equal(after.get(p), arr, `${p} was replaced`);
  const now = [v.clock, v.cell, v.energy, v.ribosomes, v.flux, v.ledger, v.env, v.drugs, v.proteome, ...v.genes, ...v.genes.map((g) => g.episode)];
  now.forEach((o, i) => assert.equal(o, objects[i]));
  for (const g of c.genes) {
    assert.equal(v.geneById[g.id], v.genes[g.index]);
    assert.equal(v.genes[g.index].mRNAIds, g.mature.ids, 'mRNA ids are the molecule list itself (valid [0, mRNA))');
  }
  // refresh() never slices or allocates arrays (spec §11.5).
  const src = OBS.refresh.toString();
  assert.ok(!/subarray|slice\(|new |\[\]|Array\(/.test(src), 'refresh() allocates');
});

test('view: numbers agree with the state and with each other at the reference', (t) => {
  const c = warm(2);
  const v = c.observe();
  const M = c.mass, V = M / PV.rho;
  assert.equal(v.tick, c.tick);
  assert.equal(v.cell.V_fL, V);
  assert.ok(v.cell.length_um > 2 && v.cell.length_um < 6, `length ${v.cell.length_um} µm`);
  assert.ok(Math.abs(v.energy.ATP + v.energy.ADP - PV.A_tot * PV.N_mM * V) < 1e-6 * v.energy.ATP);
  assert.equal(v.energy.state, 'normal');
  assert.equal(v.aminoAcids.state, 'ok');
  let sumUnits = 0;
  for (const x of v.ribosomes.byUnit) sumUnits += x;
  assert.ok(Math.abs(sumUnits - v.ribosomes.elongating) < 1e-9 * sumUnits);
  assert.ok(v.ribosomes.activeFraction > 0.7 && v.ribosomes.activeFraction < 0.85, `active fraction ${v.ribosomes.activeFraction}`);
  assert.ok(v.ribosomes.vRun_aaPerS > 10.5 && v.ribosomes.vRun_aaPerS < 13);
  assert.ok(Math.abs(v.ribosomes.vTx_ntPerS - 3 * v.ribosomes.vRun_aaPerS) < 1e-9);
  let fr = v.proteome.R + v.proteome.Q + v.proteome.P;
  for (const x of v.proteome.byGene) fr += x;
  assert.ok(fr > 0.98 && fr <= 1, `proteome fractions add to ${fr} (the rest is chains in progress)`);
  let lf = 0;
  for (const x of v.ledger.fractions) lf += x;
  assert.ok(Math.abs(lf - 1) < 1e-12);
  assert.ok(v.flux.glucoseIn_mmolPerGDWh > 10 && v.flux.glucoseIn_mmolPerGDWh < 16);
  assert.ok(v.clock.doublingEMA_min > 85 && v.clock.doublingEMA_min < 110);
  const ptsG = v.geneById.ptsG;
  assert.equal(ptsG.geneState, 'transcribing');
  assert.equal(ptsG.level, 1);
  assert.equal(ptsG.proteinRounded, Math.round(c.gene('ptsG').P));
  for (let j = 0; j < ptsG.nascent; j++) assert.ok(ptsG.nascentProgress[j] >= 0 && ptsG.nascentProgress[j] <= 1);
  for (let j = 1; j < ptsG.nascent; j++) assert.ok(ptsG.nascentProgress[j] <= ptsG.nascentProgress[j - 1], 'oldest first');
  // The 1/1,000 leak leaves a few flagellin monomers, so "off" shows as protein-only once one has been made.
  assert.equal(v.geneById.fliC.geneState, c.gene('fliC').mature.count + c.gene('fliC').nascent.len > 0 ? 'leftover-mRNA' : c.gene('fliC').P >= 1 ? 'protein-only' : 'off');
  assert.equal(v.geneById.fliC.level, 'off');
  assert.equal(OBS.limiting(c), 'ribosomes');
  t.diagnostic(`V ${fmt(V)} fL, length ${fmt(v.cell.length_um)} µm, turnover ${fmt(v.energy.turnover_s)} s, ${fmt(v.flux.glucoseIn_mmolPerGDWh)} mmol/gDW/h`);
});

test('events: a gene switched on goes through tx_start, first_mrna and first_protein; switched off, mrna_gone', () => {
  const c = warm(3);
  c.command({ type: 'setPromoter', gene: 'lacZ', level: 4 });
  const seen = {};
  for (let i = 0; i < 400; i++) {
    c.step();
    for (const e of c.takeEvents()) if (e.gene === 'lacZ' && !(e.type in seen)) seen[e.type] = e.tick;
  }
  assert.ok(seen.tx_start <= seen.first_mrna && seen.first_mrna <= seen.first_protein, JSON.stringify(seen));
  // No mRNA finishes sooner than ℓ/(3·v_max) after its start (spec a1).
  assert.ok(seen.first_mrna - seen.tx_start >= 3132 / (3 * PV.v_max) - 1, JSON.stringify(seen));
  const ep = c.observe().geneById.lacZ.episode;
  assert.deepEqual([ep.firstMRNATick, ep.firstProteinTick], [seen.first_mrna, seen.first_protein]);
  assert.equal(ep.onTick, 3600);
  assert.ok(c.observe().geneById.lacZ.madeSinceOn >= 4);
  c.command({ type: 'setPromoter', gene: 'lacZ', level: 'off' });
  let gone = -1;
  for (let i = 0; i < 3600 && gone < 0; i++) {
    c.step();
    for (const e of c.takeEvents()) if (e.type === 'mrna_gone' && e.gene === 'lacZ') gone = e.tick;
    if (gone < 0) assert.ok(['leftover-mRNA'].includes(c.observe().geneById.lacZ.geneState));
  }
  assert.ok(gone > 0, 'mrna_gone never fired');
  assert.equal(c.observe().geneById.lacZ.geneState, 'protein-only');
  assert.ok(c.observe().geneById.lacZ.madeSinceOff > 0, 'ribosomes already on the mRNA finish their chains after switch-off');
});

test('events: glucose removal gives energy_low, energy_none, growth_arrest and dormant; refeeding gives revived, energy_ok, growth_resumed', () => {
  const c = warm(4);
  c.command({ type: 'setMedium', glucose_mM: 0 });
  const at = {};
  const collect = () => { for (const e of c.takeEvents()) if (!(e.type in at)) at[e.type] = e.tick; };
  for (let i = 0; i < 1200; i++) { c.step(); collect(); }
  const t0 = 3600;
  assert.ok(at.energy_low - t0 <= 5 && at.energy_none - t0 <= 10, JSON.stringify(at));
  assert.ok(at.growth_arrest - t0 >= 60 && at.growth_arrest - t0 <= 80, JSON.stringify(at));
  assert.ok(at.dormant - at.energy_none >= 599 && at.dormant - at.energy_none <= 601, JSON.stringify(at));
  const f = OBS.facts(c);
  assert.deepEqual([f.medium, f.carbon, f.energy, f.growth, f.limiting], ['none', 'none', 'none', 'arrested', 'no-carbon']);
  c.command({ type: 'setMedium', glucose_mM: 10 });
  for (let i = 0; i < 1200; i++) { c.step(); collect(); }
  assert.ok(at.revived <= at.energy_ok && at.energy_ok - 4800 <= 10, JSON.stringify(at));
  assert.ok(at.growth_resumed > at.energy_ok, JSON.stringify(at));
  assert.equal(OBS.facts(c).growth, 'normal');
});

test('facts: schema 1.1 fields, word values only, and a reused output object', () => {
  const c = warm(5);
  const out = OBS.createFacts();
  const f = OBS.facts(c, out);
  assert.equal(f, out);
  assert.equal(OBS.FACTS_SCHEMA, '1.1');
  assert.deepEqual(
    { drug: f.drug, medium: f.medium, glucoseLevel: f.glucoseLevel, carbon: f.carbon, glucoseImport: f.glucoseImport, energy: f.energy,
      aa: f.aa, lactoseBlock: f.lactoseBlock, lastCommandedGene: f.lastCommandedGene, uselessGene: f.uselessGene, aaOutside: f.aaOutside,
      aaImportOn: f.aaImportOn, growth: f.growth, limiting: f.limiting },
    { drug: { rif: 'off', cm: 'off' }, medium: 'glucose', glucoseLevel: 'high', carbon: 'glucose', glucoseImport: 'normal', energy: 'normal',
      aa: 'ok', lactoseBlock: null, lastCommandedGene: null, uselessGene: null, aaOutside: false, aaImportOn: false, growth: 'normal',
      limiting: 'ribosomes' });
  // Facts carry no numbers (only strings, booleans, null and gene ids).
  const walk = (x) => { for (const k of Object.keys(x)) { if (k === '_gene') continue; const y = x[k]; assert.notEqual(typeof y, 'number', k); if (y && typeof y === 'object') walk(y); } };
  walk(f);
  c.command({ type: 'setPromoter', gene: 'aaImp', level: 1 });
  c.command({ type: 'setDrug', drug: 'rifampicin', dose: 0.3 });
  c.step();
  OBS.facts(c, out);
  assert.deepEqual([out.lastCommandedGene.id, out.aaImportOn, out.drug.rif], ['aaImp', true, 'low']);
  assert.equal(out.lastCommandedGene, out._gene, 'the same holder object is reused');
});
