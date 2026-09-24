// L-10 (LEVELS §12.1, §4.2, §4.4): progress. Attempt numbering; the first
// attempt kept beside later ones; the level autosave round trip (a snapshot
// and a restored monitor give the same end result as an unbroken run); an
// engine mismatch discards the level autosave only; storage that throws.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PROG = require('../src/game/btc-progress.js');
const K = require('../src/game/btc-level-kit.js');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const stub = require('./fixtures/btc-level-stub.js');
const ENGINE_VERSION = require('../src/engine/btc-cell.js').ENGINE_VERSION;

function memStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}
const opts = (storage, seed) => ({ storage, today: () => '2026-09-24', randomU32: () => (seed === undefined ? 3141592653 : seed) });

test('L-10: attempts are numbered from 1; each uses its own variant seed; an open attempt resumes; overrides are attempt 0', () => {
  const st = memStorage();
  const p = PROG.create(opts(st));
  assert.equal(p.deviceSeed, 3141592653);
  const a1 = p.attemptFor('1.2');
  assert.deepEqual(a1, { attempt: 1, variantSeed: K.variantSeed(3141592653, '1.2', 0), override: false });
  p.open('1.2', a1);
  assert.deepEqual(PROG.create(opts(st, 1)).attemptFor('1.2'), a1, 'abandoning and resuming continues the same attempt (and the device seed is kept)');
  assert.equal(p.openLevel(), '1.2');
  p.complete('1.2', { attempt: 1, variantSeed: a1.variantSeed, total: 55, code: 'A', override: false });
  assert.equal(p.openLevel(), null);
  const a2 = p.attemptFor('1.2');
  assert.equal(a2.attempt, 2);
  assert.equal(a2.variantSeed, K.variantSeed(3141592653, '1.2', 1));
  assert.notEqual(a2.variantSeed, a1.variantSeed);
  p.open('1.2', a2);
  p.complete('1.2', { attempt: 2, variantSeed: a2.variantSeed, total: 90, code: 'B', override: false });
  assert.equal(p.firstResult('1.2').total, 55, 'the first attempt is kept separately');
  assert.equal(p.latestResult('1.2').total, 90);
  const ov = p.attemptFor('1.2', 12345);
  assert.deepEqual(ov, { attempt: 0, variantSeed: 12345, override: true });
  p.open('1.2', ov);
  p.complete('1.2', { attempt: 0, variantSeed: 12345, total: 70, code: 'C', override: true });
  assert.equal(p.attemptFor('1.2').attempt, 3, 'an override does not count as an attempt');
  assert.equal(p.results('1.2').length, 3, 'every result is kept');
  // Other levels and the Prologue.
  assert.equal(p.attemptFor('1.4').attempt, 1);
  p.complete('P', { attempt: 1, variantSeed: 0, total: null, code: 'P', override: false });
  assert.equal(p.data.prologueSeen, true);
  assert.equal(p.addCards(['ribosome', 'genetic-code']), 2);
  assert.equal(p.addCards(['ribosome']), 0);
  assert.deepEqual(PROG.create(opts(st)).cardIds().sort(), ['genetic-code', 'ribosome']);
  // A fixed device seed (?test=1&seed=) replaces the stored one.
  assert.equal(PROG.create(Object.assign(opts(memStorage()), { deviceSeed: 7 })).deviceSeed, 7);
});

test('L-10: the level autosave round trip gives the same end result as an unbroken run', () => {
  const def = LV.validate(stub.playable());
  const unbroken = RUN.game.playHeadless(def, { variantSeed: 424242 });
  for (const at of [0, 1, 37, 100]) {
    const broken = RUN.game.playHeadless(def, { variantSeed: 424242, interruptAt: at });
    assert.equal(broken.restored, true, 'interrupted at ' + at);
    assert.equal(broken.code, unbroken.code, 'interrupted at ' + at);
    assert.deepEqual(broken.result, unbroken.result);
  }
  // Through storage: save mid-run, reload progress, restore, finish.
  const st = memStorage();
  const p = PROG.create(opts(st));
  const r = new RUN.LevelRunner({ def, variantSeed: 424242, attempt: 1 }).start();
  while (r.phase !== 'run') { if (r.beat) { r.storySkip(); } if (r.phase === 'predict') { r.lock('p1', 'ok'); r.lock('n1', 20); } r.next(); }
  r.run.cell.command({ type: 'setPromoter', gene: 'lacY', level: 4 });
  for (let i = 0; i < 60; i++) r.run.cell.step();
  assert.equal(p.saveLevel(Object.assign(r.save(), { engineVersion: ENGINE_VERSION, build: 'test' })), true);
  const loaded = PROG.create(opts(st)).loadLevel(ENGINE_VERSION);
  assert.equal(loaded.status, 'ok');
  const r2 = RUN.LevelRunner.restore(def, loaded.save);
  assert.equal(r2.phase, 'run');
  assert.equal(r2.run.cell.tick, 60);
  assert.equal(r2.run.cell.hash(), r.run.cell.hash(), 'the restored cell is the same cell');
  assert.deepEqual(r2.run.monitor.save(), r.run.monitor.save(), 'and the same monitor');
  while (!r.run.endReason) r.run.cell.step();
  while (!r2.run.endReason) r2.run.cell.step();
  assert.equal(r2.run.endTick, r.run.endTick);
  assert.deepEqual(r2.monitorResult, r.monitorResult);
  assert.equal(r2.record.finalHash, r.record.finalHash);
});

test('L-10: an engine mismatch discards the level autosave only; progress stays', () => {
  const st = memStorage();
  const p = PROG.create(opts(st));
  p.complete('P', { attempt: 1, variantSeed: 0, total: null, code: 'P', override: false });
  p.saveLevel({ engineVersion: '0.9.0', levelId: '1.2', phase: 'run' });
  const q = PROG.create(opts(st));
  const res = q.loadLevel(ENGINE_VERSION);
  assert.equal(res.status, 'mismatch');
  assert.equal(res.levelId, '1.2');
  assert.equal(st.getItem(PROG.LEVEL_KEY), null, 'the level autosave is gone');
  assert.equal(q.latestResult('P').code, 'P', 'progress is untouched');
  assert.equal(q.loadLevel(ENGINE_VERSION).status, 'none');
});

test('L-10: storage that throws: nothing throws, the app just forgets', () => {
  const broken = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('x'); } };
  const p = PROG.create(opts(broken));
  assert.equal(p.deviceSeed, 3141592653);
  const a = p.attemptFor('1.4');
  p.open('1.4', a);
  assert.equal(p.attemptFor('1.4').attempt, 1, 'kept in memory for this visit');
  p.complete('1.4', { attempt: 1, total: 10, code: 'X', override: false });
  assert.equal(p.saveLevel({ levelId: '1.4' }), false);
  assert.equal(p.loadLevel(ENGINE_VERSION).status, 'none');
  assert.doesNotThrow(() => p.clearLevel());
  assert.equal(p.addCards(['x']), 1);
  const none = PROG.create({ storage: null, today: () => '2026-09-24', randomU32: () => 5 });
  assert.equal(none.deviceSeed, 5);
  // Corrupt JSON starts fresh.
  const st = memStorage();
  st.setItem(PROG.KEY, '{not json');
  assert.equal(PROG.create(opts(st)).deviceSeed, 3141592653);
});

test('M2 review: two tabs on one device never write an old copy of the progress over the other\'s codes', () => {
  const st = memStorage();
  const A = PROG.create(opts(st)), B = PROG.create(opts(st));        // both open on the home screen
  const a1 = A.attemptFor('1.4');
  A.open('1.4', a1);
  A.complete('1.4', { attempt: 1, variantSeed: a1.variantSeed, total: 80, code: 'CODE-A', override: false });
  A.addCards(['protein-turnover']);
  // Tab B, loaded before any of that, opens another level: its change starts from what is stored now.
  const b1 = B.attemptFor('1.1');
  B.open('1.1', b1);
  const fresh = PROG.create(opts(st));
  assert.equal(fresh.latestResult('1.4').code, 'CODE-A', 'tab A\'s code survives tab B\'s write');
  assert.deepEqual(fresh.cardIds(), ['protein-turnover']);
  assert.equal(fresh.attemptFor('1.4').attempt, 2, 'attempt 1 is not replayed with the same variant');
  assert.equal(B.attemptFor('1.4').attempt, 2, 'tab B sees it too');
  assert.equal(fresh.openLevel(), '1.1');
  // sync() keeps a fixed device seed (?test=1&seed=), and ignores a broken stored copy.
  const T = PROG.create(Object.assign(opts(st), { deviceSeed: 7 }));
  assert.equal(T.sync(), true);
  assert.equal(T.deviceSeed, 7);
  st.setItem(PROG.KEY, '{broken');
  assert.equal(T.sync(), false);
  assert.equal(T.latestResult('1.4').code, 'CODE-A');
});
