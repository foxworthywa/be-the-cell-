// Pinned results: the golden hash (d-4), the preset's freshness (d-7), and the
// speed floor (p1). The golden hash is what every browser must reproduce
// (tools/golden.html); it may change only with an ENGINE_VERSION bump.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers.js');
const { BTC, Cell } = H;

const ROOT = path.join(__dirname, '..');
const GOLDEN = require('./golden.json');
const G = require('../tools/make-golden.js');

test('d-4: the golden hash (steady preset, seed 1, fixed log, 10,000 ticks) is unchanged', (t) => {
  assert.equal(GOLDEN.engineVersion, BTC.ENGINE_VERSION, 'ENGINE_VERSION changed: run node tools/make-golden.js to pin the new golden hash');
  const r = G.runGolden(BTC, GOLDEN);
  t.diagnostic(`golden hash ${r.hash} (engine ${r.engineVersion}, preset ${r.presetHash})`);
  assert.equal(r.presetHash, GOLDEN.presetHash, 'the preset changed without an ENGINE_VERSION bump');
  assert.equal(r.hash, GOLDEN.hash, 'the golden hash changed without an ENGINE_VERSION bump');
  // The scenario in the tool is the one pinned here.
  assert.deepEqual(G.golden(), GOLDEN);
});

test('d-4: tools/golden.html embeds the pinned scenario and loads the engine in build order', () => {
  const html = fs.readFileSync(path.join(ROOT, 'tools', 'golden.html'), 'utf8');
  assert.deepEqual(G.embedded(html), GOLDEN, 'golden.html is stale: run node tools/make-golden.js');
  const srcs = Array.from(html.matchAll(/<script src="\.\.\/([^"]+)"><\/script>/g), (m) => m[1]);
  const engine = require('../build-files.json').filter((f) => f.startsWith('src/engine/'));
  assert.deepEqual(srcs, engine);
});

test('d-7: every stored preset (steady and birth, per strain) is what tools/make-presets.js derives today', (t) => {
  const P = require('../tools/make-presets.js');
  const ids = P.SPECS.map((s) => s.id);
  assert.deepEqual(Object.keys(BTC.presets).sort(), ids.slice().sort(), 'the stored presets are not the specified ones');
  for (const id of ids) {
    const preset = P.makePreset(id);
    t.diagnostic(`${id} ${preset.hash}`);
    assert.equal(BTC.presets[id].hash, preset.hash, `${id}: btc-presets.js is stale: run node tools/make-presets.js`);
    assert.ok(P.isFresh(preset), `presets/${id}.json or btc-presets.js is stale: run node tools/make-presets.js`);
    // A steady or birth start loads exactly these bytes (before the reseed and the tick rebase).
    assert.equal(BTC.math.hash64(BTC.math.base64Decode(BTC.presets[id].state)), preset.hash);
  }
});

test('p1: the engine runs ≥ 40,000 ticks per second with every gene at ×4', (t) => {
  const genes = {};
  for (const id of H.GENE_IDS) genes[id] = { level: 4 };
  const c = new Cell({ seed: 1, start: 'steady', genes });
  c.advance(3000);                                  // warm-up: JIT, and the ×4 queues fill
  let best = 0;
  for (let rep = 0; rep < 3; rep++) {
    const n = 20000, t0 = process.hrtime.bigint();
    c.advance(n);
    const s = Number(process.hrtime.bigint() - t0) / 1e9;
    best = Math.max(best, n / s);
  }
  const ref = new Cell({ seed: 1, start: 'steady' });
  ref.advance(3000);
  const t0 = process.hrtime.bigint();
  ref.advance(20000);
  const refRate = 20000 / (Number(process.hrtime.bigint() - t0) / 1e9);
  t.diagnostic(`all genes ×4: ${Math.round(best)} ticks/s (${(1e6 / best).toFixed(2)} µs/tick); reference: ${Math.round(refRate)} ticks/s (${(1e6 / refRate).toFixed(2)} µs/tick)`);
  assert.ok(best >= 40000, `${Math.round(best)} ticks/s`);
});

test('p1 (R-E17): with the regulation module (m2-lac) the engine still runs ≥ 40,000 ticks per second, and a 10-hour level 1.7 run plus its par run takes ≤ 2 s', (t) => {
  const lac = new Cell({ seed: 1, strain: 'm2-lac', start: 'steady', design: { lac: { promoter: 4, operator: false }, lacI: { allele: 'deleted' } } });
  lac.advance(3000);
  let best = 0;
  for (let rep = 0; rep < 3; rep++) {
    const n = 20000, t0 = process.hrtime.bigint();
    lac.advance(n);
    best = Math.max(best, n / (Number(process.hrtime.bigint() - t0) / 1e9));
  }
  // A level 1.7 schedule (template T1: G 120 · L 150 · G 90 · B 60 · L 120 · G 60 min), student design and par design.
  const phases = [[120, 10, 0], [150, 0, 5], [90, 10, 0], [60, 10, 5], [120, 0, 5], [60, 10, 0]];
  const t0 = process.hrtime.bigint();
  for (const design of [{ lacI: { allele: 'deleted' }, lac: { crpSite: false } }, null]) {
    const c = new Cell({ seed: 3, strain: 'm2-lac', start: 'steady', design });
    for (const [min, glucose_mM, lactose_mM] of phases) { c.command({ type: 'setMedium', glucose_mM, lactose_mM }); c.advance(min * 60); }
    assert.equal(c.tick, 36000);
  }
  const s = Number(process.hrtime.bigint() - t0) / 1e9;
  t.diagnostic(`m2-lac: ${Math.round(best)} ticks/s; a 36,000-tick run plus its par run: ${s.toFixed(2)} s`);
  assert.ok(best >= 40000, `${Math.round(best)} ticks/s`);
  assert.ok(s <= 2, `the two 1.7 runs took ${s.toFixed(2)} s`);
});
