// L-6 (LEVELS §12.1): the level kit. Sketch features on a reference curve and
// on four synthetic misconception sketches (each fails exactly one feature),
// resampling of back-and-forth strokes, the coverage rule, the band hold
// tracker hitting and missing by one tick, and fixed vectors for the seeded
// streams and seeds.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/game/btc-level-kit.js');
const PRNG = require('../src/engine/btc-prng.js');

const N = 80, STEP = 0.25;
const tj = (j) => j * STEP;

/**
 * A reference LacY curve on the grid: the gene is on from 0 to tOff; mRNA is
 * made after a 0.5-min delay and lasts 4.3 min on average; each mRNA is read
 * into protein after another 0.5 min. Shaped like the M1 demo runs (60–70% of
 * the rise after the switch-off, a few percent in the last 5 minutes).
 */
function refCurve(tOff, height) {
  const dt = 0.005, tau = 4.3, lag = 0.5;
  const m = [], out = new Array(N + 1).fill(0);
  let mm = 0, p = 0, j = 0;
  for (let i = 0; i * dt <= 20 + 1e-9; i++) {
    const t = i * dt;
    m.push(mm);
    const on = t >= lag && t < tOff + lag ? 1 : 0;
    const mLag = i - Math.round(lag / dt) >= 0 ? m[i - Math.round(lag / dt)] : 0;
    while (j <= N && tj(j) <= t + 1e-9) { out[j] = p; j++; }
    mm += (on - mm / tau) * dt;
    p += mLag * dt;
  }
  const scale = height / out[N];
  return out.map((x) => x * scale);
}

const featureSet = (f) => ['F1', 'F2', 'F3', 'F4'].filter((k) => !f[k]);

test('L-6: the reference curve passes F1–F4 and is accurate against itself; A drops as the amount drifts', () => {
  for (const tOff of [4, 5, 6]) {
    const r = refCurve(tOff, 1200);
    const f = K.sketch.features(r, { tOff });
    assert.deepEqual(featureSet(f), [], 'tOff ' + tOff);
    assert.equal(f.P, 1);
    assert.equal(K.sketch.accuracy(r, r), 1);
    assert.ok(K.sketch.accuracy(r.map((x) => x * 1.05), r) >= 0.9);
    assert.ok(K.sketch.accuracy(r.map((x) => x * 0.5), r) < 0.75);
    assert.equal(K.sketch.accuracy(r.map(() => 0), r.map(() => 0)), 0, 'a zero reference gives 0, not NaN');
  }
});

test('L-6: plateau-at-tOff, linear-to-20-min, rise-then-fall and instant-jump sketches fail exactly F2, F3, F4 and F1', () => {
  for (const tOff of [4, 5, 6]) {
    const r = refCurve(tOff, 1200);
    const jOff = Math.round(tOff / STEP), smax = r[N];
    const plateau = r.map((x, j) => (j <= jOff ? x : r[jOff]));
    const linear = r.map((x, j) => (smax * tj(j)) / 20);
    const riseFall = r.map((x, j) => (tj(j) <= 16 ? x : r[64] - ((r[64] * 0.2) * (tj(j) - 16)) / 4));
    const instant = r.map((x, j) => (j === 0 ? 0 : 0.2 * smax + 0.8 * x));
    assert.deepEqual(featureSet(K.sketch.features(plateau, { tOff })), ['F2'], 'plateau, tOff ' + tOff);
    assert.deepEqual(featureSet(K.sketch.features(linear, { tOff })), ['F3'], 'linear, tOff ' + tOff);
    assert.deepEqual(featureSet(K.sketch.features(riseFall, { tOff })), ['F4'], 'rise-then-fall, tOff ' + tOff);
    assert.deepEqual(featureSet(K.sketch.features(instant, { tOff })), ['F1'], 'instant, tOff ' + tOff);
    assert.equal(K.sketch.features(plateau, { tOff }).P, 0.75);
  }
  // A flat sketch (smax − s0 < 100) fails F1–F3.
  const flat = new Array(N + 1).fill(50).map((x, j) => x + j);
  assert.deepEqual(featureSet(K.sketch.features(flat, { tOff: 5 })), ['F1', 'F2', 'F3']);
});

test('L-6: resampling keeps the last value drawn in each column and interpolates the rest', () => {
  // One stroke out to 10 min, then back to 6 min: columns 6–10 min hold the return stroke.
  const s = K.sketch.resample([[0, 0], [10, 500], [6, 100]]);
  assert.equal(s.length, N + 1);
  assert.equal(s[20], 250, 'column 5 min is only on the way out');
  assert.equal(s[32], 300, 'column 8 min was drawn over on the way back: its last value wins');
  assert.equal(s[40], 500, 'the turning column keeps its value');
  assert.equal(s[80], 500, 'after the last drawn column, the last value');
  // Back and forth again: the forward pass overwrites the backward one.
  const t = K.sketch.resample([[0, 0], [10, 500], [5, 900], [20, 1000]]);
  assert.ok(Math.abs(t[30] - (900 + (100 * 10) / 60)) < 1e-9);
  // Separate strokes; the gap between them is interpolated, before the first drawn column the first value.
  const u = K.sketch.resample([[2, 100], [4, 100], null, [8, 500], [20, 500]]);
  assert.equal(u[0], 100);
  assert.equal(u[24], 300, 'gap at 6 min is interpolated');
  assert.equal(K.sketch.resample([]), null);
});

test('L-6: coverage needs the first drawn column at ≤ 1 min and the last at ≥ 19 min', () => {
  assert.equal(K.sketch.coverage([[0.5, 0], [19.5, 900]]).ok, true);
  assert.equal(K.sketch.coverage([[0, 0], [19, 900]]).ok, true);
  assert.equal(K.sketch.coverage([[2, 0], [20, 900]]).ok, false, 'starts too late');
  assert.equal(K.sketch.coverage([[0, 0], [18.5, 900]]).ok, false, 'stops too early');
  assert.equal(K.sketch.coverage([[0, 0], [5, 100], null, [15, 800], [20, 900]]).ok, true, 'two strokes cover it together');
  assert.equal(K.sketch.coverage([]).ok, false);
});

test('L-6: the band hold tracker hits the goal on exactly the needed tick and misses by one', () => {
  const run = (series, o) => {
    const h = K.holdTracker(Object.assign({ lo: 10, hi: 20, meanTicks: 1, needTicks: 5 }, o || {}));
    let st = null;
    series.forEach((x, i) => { st = h.push(x, 100 + i); });
    return st;
  };
  const hit = run([15, 15, 15, 15, 15]);
  assert.equal(hit.done, true);
  assert.equal(hit.doneTick, 104);
  const miss = run([15, 15, 15, 15, 25, 15, 15, 15, 15]);
  assert.equal(miss.done, false);
  assert.equal(miss.best, 4);
  assert.equal(run([15, 15, 15, 15, 25, 15, 15, 15, 15, 15]).done, true, 'the fifth tick of the second stretch');
  assert.equal(run([9.999, 20, 10, 20, 20, 20]).done, true, 'band edges count as inside');
  // The trailing mean decides, not the latest value: 30 then 10s averaged over 2 ticks enter the band at 20.
  const m = run([30, 10, 10, 10], { meanTicks: 2, needTicks: 3 });
  assert.equal(m.done, true);
  // State survives JSON.
  const h = K.holdTracker({ lo: 10, hi: 20, meanTicks: 3, needTicks: 4 });
  [5, 30, 12].forEach((x) => h.push(x));
  const h2 = K.holdTracker({ lo: 10, hi: 20, meanTicks: 3, needTicks: 4 });
  h2.restore(JSON.parse(JSON.stringify(h.state())));
  for (const x of [15, 16, 14, 15, 15]) assert.deepEqual(h2.push(x), h.push(x));
});

test('L-6: trailing mean over a fixed window', () => {
  const tm = K.trailingMean(3);
  assert.deepEqual([3, 6, 9, 12].map((x) => tm.push(x)), [3, 4.5, 6, 9]);
});

test('L-6: rng, seedFor and variantSeed match fixed vectors and the engine\'s stream construction', () => {
  const r = K.rng(1, '1.4');
  assert.deepEqual([r.u(), r.u(), r.u()], [0.04957629041746259, 0.26040499401278794, 0.466193774016574]);
  const s = PRNG.seedStream(1, '1.4');
  assert.equal(K.rng(1, '1.4').u(), PRNG.uniform(s), 'seeded exactly like an engine stream');
  const q = K.rng(123456789, 'q:d1');
  assert.deepEqual([q.int(0, 9), q.int(0, 9), q.int(0, 9)], [2, 0, 0]);
  assert.deepEqual(q.shuffle([0, 1, 2, 3]), [3, 0, 2, 1]);
  const w = K.rng(7, 'x');
  for (let i = 0; i < 1000; i++) { const k = w.int(-2, 3); assert.ok(k >= -2 && k <= 3 && Number.isInteger(k)); }
  assert.deepEqual(K.rng(9, 'p').shuffle([1, 2, 3, 4, 5]).sort(), [1, 2, 3, 4, 5]);
  // Independent FNV-1a for the seed formulas.
  const fnv = (str) => { let h = 0x811c9dc5; for (const b of Buffer.from(str, 'utf8')) { h ^= b; h = Math.imul(h, 0x01000193); } return h >>> 0; };
  assert.equal(K.seedFor(12345, 'task'), fnv('12345:task'));
  assert.equal(K.seedFor(12345, 'task'), 1148856795);
  assert.equal(K.seedFor(12345, 'demo'), 746581065);
  assert.equal(K.variantSeed(4000000000, '1.2', 0), fnv('4000000000:1.2:0') & 0x3FFFFFFF);
  assert.equal(K.variantSeed(4000000000, '1.2', 0), 647789018);
  assert.equal(K.variantSeed(1, 'P', 3), 458277349);
  assert.ok(K.variantSeed(4294967295, '1.7', 99) < 2 ** 30);
  assert.equal(K.round(537, 10), 540);
  assert.equal(K.fill('{T} LacY by minute {D}', { T: 500, D: 14 }), '500 LacY by minute 14');
  assert.equal(K.clock(270, true), '4 min 30 s');
  assert.equal(K.clock(4320, false), '1 h 12 min');
});
