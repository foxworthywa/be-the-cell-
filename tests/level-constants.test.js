// L-11 (LEVELS §12.1, §3.7): the calibrated constants belong to this engine,
// and every constant a level file reads exists. Each shipped level file is
// loaded in a bare context whose BTC.levelConstants throws on any missing
// key, then its variant and config are built for many seeds.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LC = require('../src/levels/btc-level-constants.js');
const { ENGINE_VERSION } = require('../src/engine/btc-cell.js');
const K = require('../src/game/btc-level-kit.js');
const MC = require('../src/game/btc-misconceptions.js');

const LEVEL_DIR = path.join(ROOT, 'src', 'levels');
const levelFiles = fs.readdirSync(LEVEL_DIR).filter((f) => /^btc-level-[\w-]+\.js$/.test(f) && f !== 'btc-level-constants.js').sort();

test('L-11: the constants were calibrated on this engine version (major.minor: a patch changes no physics)', () => {
  const mm = ENGINE_VERSION.split('.').slice(0, 2).join('.');
  // A patch release (1.1.1: observe-only fields, golden hash unchanged) keeps the calibration (PROLOGUE.md §7).
  assert.equal(LC.engineVersion.split('.').slice(0, 2).join('.'), mm, 'run tools/level-calibrate.js after an engine change');
  for (const f of levelFiles) assert.equal(require(path.join(LEVEL_DIR, f)).engine, mm, f + ' was written for engine ' + mm);
});

/** A read-only view of obj that throws on a missing key, at any depth. */
function strict(obj, where) {
  return new Proxy(obj, {
    get(t, k) {
      if (typeof k === 'symbol' || k === 'toJSON' || k === 'then') return t[k];
      if (!(k in t)) throw new Error('constant ' + where + '.' + String(k) + ' is missing');
      const v = t[k];
      return v && typeof v === 'object' ? strict(v, where + '.' + String(k)) : v;
    },
  });
}

test('L-11: every constant a level file reads exists (500 variants and their configs)', () => {
  for (const f of levelFiles) {
    const ctx = vm.createContext({});
    vm.runInContext('var self = this;', ctx);
    // A plain copy: the shipped constants are frozen, and a proxy must not wrap a frozen object's properties.
    ctx.self.BTC = { levelKit: K, misconceptions: MC, levelConstants: strict(JSON.parse(JSON.stringify(LC)), 'LC') };
    vm.runInContext(fs.readFileSync(path.join(LEVEL_DIR, f), 'utf8'), ctx, { filename: f });
    const defs = ctx.self.BTC.levelDefs;
    const ids = Object.keys(defs);
    assert.equal(ids.length, 1, f + ' registers one level');
    const def = defs[ids[0]];
    for (let s = 0; s < 500; s++) {
      const v = def.variant(K.variantSeed(s, def.id, 0));
      for (const role of ['task', 'demo', 'par']) def.config(v, role, { deviceSeed: s, design: null });
      def.labConfig(v, { phase: 'run', revealed: {} });
    }
  }
  // The strict view catches a missing constant (negative control).
  assert.throws(() => strict({ l14: { S: {} } }, 'LC').l14.S[4], /LC\.l14\.S\.4 is missing/);
});
