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

test('d-7: the stored steady-state preset is what tools/make-presets.js derives today', (t) => {
  const P = require('../tools/make-presets.js');
  const preset = P.makePreset();
  t.diagnostic(`preset ${preset.hash}: ${P.SPEC.ticks} ticks from a cold start, seed ${P.SPEC.seed}`);
  assert.equal(BTC.presets['m1-lab-glucose'].hash, preset.hash, 'btc-presets.js is stale: run node tools/make-presets.js');
  assert.ok(P.isFresh(preset), 'presets/m1-lab-glucose.json or btc-presets.js is stale: run node tools/make-presets.js');
  // A steady start loads exactly these bytes (before the reseed and the tick rebase).
  const bytes = BTC.math.base64Decode(BTC.presets['m1-lab-glucose'].state);
  assert.equal(BTC.math.hash64(bytes), preset.hash);
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
