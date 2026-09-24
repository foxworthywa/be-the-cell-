// L-9 (LEVELS §12.1, §11): local telemetry. The schema per event type; the
// ring buffer's caps and the quota fallback; no keys that could name a
// person; a level run file includes only its own attempt's events.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TEL = require('../src/game/btc-telemetry.js');
const LV = require('../src/game/btc-levels.js');
const G = require('../src/game/btc-level-runner.js').game;
const stub = require('./fixtures/btc-level-stub.js');

/** A localStorage stand-in; quotaChars makes setItem throw like a full store. */
function memStorage(quotaChars) {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      if (quotaChars !== undefined && s.length > quotaChars) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, s);
    },
    removeItem: (k) => m.delete(k),
  };
}
function clock() { let t = 1000; const f = () => t; f.add = (ms) => { t += ms; }; return f; }

const SAMPLES = {
  session_start: { date: '2026-09-24', build: 'abc123def456', engine: '1.1.0', layout: 'compact', w: 360, h: 740, standalone: false, touch: true, reducedMotion: false },
  screen: { name: 'home' }, level_start: { variantSeed: 12345, content: 1, variant: { seed: 12345, T: 500 } }, phase: { name: 'predict' },
  story: { beat: 'intro', line: 2, action: 'next' }, predict: { id: 'p1', kind: 'choice', value: 2, correct: false },
  design: { part: 'operator', from: false, to: true }, design_submit: { design: { lac: { promoter: 1 } } }, demo_end: { ppm: 21, final: 1180 },
  run_start: { speed: 60 }, run_end: { reason: 'goal', ticks: 812 }, cmd: { seq: 3, type: 'setPromoter', args: { gene: 'lacY', level: 4 }, ok: true },
  speed: { s: 600 }, pause: {}, resume: {}, tab: { name: 'graphs' }, focus: { gene: 'lacY' }, reveal: { gene: 'ptsG', letter: 'C' }, goal: {},
  flag: { id: 'SHOTGUN', evidence: { tick: 20 } }, debrief: { id: 'd1', option: 1, correct: false, try: 1 }, echo: { screen: 1 }, card: { id: 'mrna' },
  score: { G: 1, E: 1, P: 0.5, D: [1, 2], X: 0, total: 80 }, code: { code: 'BTC1-…', action: 'copied' }, download: { kind: 'run' }, error: { msg: 'x' },
};

test('L-9: every event type has a schema, and events made by log() fit it', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(TEL.SCHEMA).sort(), 'one sample per type');
  const tel = TEL.create({ storage: memStorage(), now: clock(), session: 'a1b2c3d4' });
  tel.setContext({ lv: '1.2', att: 1, run: 2 });
  tel.setTick(() => 1234);
  for (const type of Object.keys(SAMPLES)) {
    const ev = tel.log(type, SAMPLES[type]);
    assert.deepEqual(TEL.check(ev), [], type);
    assert.equal(ev.v, 1); assert.equal(ev.s, 'a1b2c3d4'); assert.equal(ev.lv, '1.2'); assert.equal(ev.att, 1); assert.equal(ev.run, 2);
    assert.equal(ev.tick, 1234);
    assert.ok(Number.isInteger(ev.t) && ev.t >= 0);
  }
  const seqs = tel.all().map((e) => e.seq);
  assert.deepEqual(seqs, seqs.map((x, i) => seqs[0] + i), 'seq counts up');
  // Negative controls.
  assert.ok(TEL.check(tel.log('predict', { id: 'p1' })).some((p) => /missing kind/.test(p)));
  assert.ok(TEL.check(tel.log('run_end', { reason: 'bored', ticks: 3 })).some((p) => /reason = bored/.test(p)));
  assert.ok(TEL.check(tel.log('speed', { s: 60, extra: 1 })).some((p) => /unexpected extra/.test(p)));
  assert.ok(TEL.check({ v: 1, seq: 0, s: 'x', t: 0, type: 'nope', d: {} }).some((p) => /unknown type/.test(p)));
});

test('L-9: no key could carry a person\'s name, email or user id; no absolute time except the session date', () => {
  for (const k of ['email', 'user', 'userName', 'student', 'studentName', 'fullName']) assert.ok(TEL.FORBIDDEN_KEY.test(k), k);
  const ev = TEL.create({ now: clock(), session: 'x' }).log('level_start', { variantSeed: 1, content: 1, variant: { user: 'ada' } });
  assert.ok(TEL.check(ev).some((p) => /forbidden key d\.variant\.user/.test(p)));
  // A whole headless play: every event fits the schema, none has a forbidden key, t is relative.
  const tel = TEL.create({ storage: memStorage(), now: clock(), session: 'feedbeef' });
  G.playHeadless(LV.validate(stub.playable()), { variantSeed: 99, telemetry: tel });
  const all = tel.all();
  assert.ok(all.length > 20);
  for (const e of all) {
    assert.deepEqual(TEL.check(e), [], JSON.stringify(e));
    assert.ok(!/"(date|time|timestamp)"/i.test(JSON.stringify(e.d)) || e.type === 'session_start');
    assert.ok(e.t < 1e7, 'relative time');
  }
  const types = new Set(all.map((e) => e.type));
  for (const t of ['level_start', 'phase', 'story', 'predict', 'run_start', 'cmd', 'run_end', 'goal', 'debrief', 'echo', 'card', 'score']) assert.ok(types.has(t), t);
});

test('L-9: the ring buffer keeps at most maxEvents and maxChars; a full store drops the oldest half and tries once more', () => {
  const now = clock();
  const tel = TEL.create({ storage: memStorage(), now, session: 's', maxEvents: 50 });
  for (let i = 0; i < 120; i++) tel.log('speed', { s: i });
  assert.equal(tel.all().length, 50);
  assert.equal(tel.all()[0].d.s, 70, 'the oldest dropped first');
  const big = TEL.create({ now, session: 's', maxChars: 2000 });
  for (let i = 0; i < 100; i++) big.log('tab', { name: 'genes' });
  assert.ok(JSON.stringify(big.all()).length <= 2000 + 100);
  assert.ok(big.all().length < 100 && big.all().length > 10);
  // Quota: a store that refuses more than 6,000 characters.
  const st = memStorage(6000);
  const q = TEL.create({ storage: st, now, session: 's' });
  for (let i = 0; i < 80; i++) q.log('focus', { gene: 'lacY' });
  now.add(5000);
  assert.equal(q.flush(), true, 'the retry after dropping half fits');
  const kept = JSON.parse(st.getItem(TEL.KEY)).events;
  assert.ok(kept.length >= 30 && kept.length < 80, kept.length + ' kept');
  // A store that always throws: logging still works, flushing reports failure, nothing throws.
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const b = TEL.create({ storage: broken, now, session: 's' });
  assert.ok(b.log('pause', {}));
  assert.equal(b.flush(), false);
  // Events survive a reload through storage.
  const s2 = memStorage();
  const t1 = TEL.create({ storage: s2, now, session: 'one' });
  t1.log('resume', {}); t1.flush();
  const t2 = TEL.create({ storage: s2, now, session: 'two' });
  assert.equal(t2.all().length, 1);
  assert.equal(t2.log('pause', {}).seq, 1, 'seq continues');
});

test('L-9: a level run file includes only its own attempt\'s events', () => {
  const tel = TEL.create({ storage: memStorage(), now: clock(), session: 's' });
  const def = LV.validate(stub.playable());
  tel.setContext({ lv: null, att: null, run: null });
  tel.log('screen', { name: 'home' });
  G.playHeadless(def, { variantSeed: 5, attempt: 1, telemetry: tel });
  const second = G.playHeadless(def, { variantSeed: 6, attempt: 2, telemetry: tel });
  const file = second.runner.runFile({ build: 'test', telemetry: tel.forAttempt('T', 2) });
  assert.ok(file.telemetry.length > 10);
  assert.ok(file.telemetry.every((e) => e.lv === 'T' && e.att === 2));
  assert.ok(tel.all().some((e) => e.att === 1), 'the first attempt is in the log, not in the file');
  assert.equal(file.format, 'btc-level-run');
  assert.equal(file.level.attempt, 2);
  assert.equal(file.level.code, second.code);
  assert.equal(file.records.task.finalHash.slice(0, 6).toUpperCase(), second.code.split('-')[7]);
});

test('M2 review: two tabs keep each other\'s events (the stored log is merged before a write); clear empties it', () => {
  const st = memStorage();
  const A = TEL.create({ storage: st, now: clock(), session: 'aaaaaaaa' });
  const B = TEL.create({ storage: st, now: clock(), session: 'bbbbbbbb' });
  A.log('screen', { name: 'home' }); A.flush();
  B.log('screen', { name: 'lab' }); B.flush();
  A.log('screen', { name: 'level' }); A.flush();
  const stored = JSON.parse(st.getItem(TEL.KEY)).events;
  assert.deepEqual(stored.map((e) => e.s + ':' + e.d.name).sort(), ['aaaaaaaa:home', 'aaaaaaaa:level', 'bbbbbbbb:lab']);
  A.clear();
  assert.deepEqual(JSON.parse(st.getItem(TEL.KEY)).events, []);
});
