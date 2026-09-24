// Deterministic math and random streams (engine spec §4, test n1). Replays and
// scores are recomputed on other machines, so these must be bit-exact everywhere.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BTC } = require('./helpers.js');
const M = BTC.math, R = BTC.prng;

// Distance in units in the last place between two positive doubles.
function ulps(a, b) {
  const f = new Float64Array(2), u = new BigInt64Array(f.buffer);
  f[0] = a; f[1] = b;
  const d = u[0] - u[1];
  return Number(d < 0n ? -d : d);
}

test('n1: detExp agrees with Math.exp to 2 ulp on [−50, 5]', () => {
  let worst = 0, at = 0;
  for (let i = 0; i <= 200000; i++) {
    const x = -50 + 55 * i / 200000;
    const d = ulps(M.detExp(x), Math.exp(x));
    if (d > worst) { worst = d; at = x; }
  }
  assert.ok(worst <= 2, `worst error ${worst} ulp at x = ${at}`);
  assert.equal(M.detExp(0), 1);
  assert.equal(M.detExp(-800), 0);
  assert.equal(M.detExp(800), Infinity);
});

test('n1: dsqrt is exact on perfect squares and within 1 ulp elsewhere', () => {
  for (let k = 1; k <= 5000; k++) assert.equal(M.dsqrt(k * k), k, `dsqrt(${k * k}) = ${M.dsqrt(k * k)}`);
  let worst = 0, at = 0;
  for (let i = 0; i <= 20000; i++) {
    const y = Math.pow(10, -6 + 18 * i / 20000);
    const d = ulps(M.dsqrt(y), Math.sqrt(y));
    if (d > worst) { worst = d; at = y; }
  }
  assert.ok(worst <= 1, `worst error ${worst} ulp at y = ${at}`);
  assert.equal(M.dsqrt(0), 0);
  assert.equal(M.dsqrt(-4), 0);
});

test('n1: every Poisson draw consumes exactly one uniform (so twins stay aligned)', () => {
  for (const mu of [0, 1e-6, 0.03, 0.6, 5, 29.9]) {
    const a = R.seedStream(7, 'tx:test'), b = R.seedStream(7, 'tx:test');
    for (let i = 0; i < 1000; i++) { R.poisson(a, mu); R.uniform(b); }
    assert.deepEqual(Array.from(a), Array.from(b), `stream advanced by more than one uniform per draw at μ = ${mu}`);
  }
});

test('n1: Poisson and binomial samplers have the right mean and variance', () => {
  const s = R.seedStream(3, 'check');
  for (const mu of [0.05, 0.6, 4]) {
    let sum = 0, sq = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) { const k = R.poisson(s, mu); sum += k; sq += k * k; }
    const m = sum / n, v = sq / n - m * m;
    assert.ok(Math.abs(m / mu - 1) < 0.02, `Poisson(${mu}) mean ${m}`);
    assert.ok(Math.abs(v / mu - 1) < 0.03, `Poisson(${mu}) variance ${v}`);
  }
  for (const n of [40, 5000]) {
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += R.binomialHalf(s, n);
    assert.ok(Math.abs(sum / 2000 / n - 0.5) < 0.01, `binomialHalf(${n}) mean fraction ${sum / 2000 / n}`);
  }
});

test('n1: streams are labelled by name, so one stream never depends on another', () => {
  const a = R.seedStream(11, 'tx:ptsG'), b = R.seedStream(11, 'tx:ptsG'), c = R.seedStream(11, 'tx:lacZ');
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.notDeepEqual(Array.from(a), Array.from(c));
  const u = R.uniform(a);
  assert.ok(u >= 0 && u < 1);
});

test('n1: sortStrings orders by UTF-16 code units (ASCII, mixed case, non-ASCII)', () => {
  const input = ['zeta', 'Alpha', 'alpha', 'éclair', 'Zulu', '_under', '10', '9', 'ärger', 'b', 'B', '', 'ab', 'a', '日本', 'Ω'];
  const ref = ['', '10', '9', 'Alpha', 'B', 'Zulu', '_under', 'a', 'ab', 'alpha', 'b', 'zeta', 'ärger', 'éclair', 'Ω', '日本'];
  assert.deepEqual(M.sortStrings(input.slice()), ref);
});

test('n1: hash64 is two FNV-1a lanes; canonical JSON ignores key order; base64 round-trips', () => {
  assert.equal(M.hash64(M.utf8('')), '811c9dc5050c5d1f');
  assert.equal(M.fnv1a32('a'), 0xe40c292c);
  assert.equal(M.canonicalJSON({ b: 1, a: [-0, 'x', { d: null, c: true }] }), '{"a":[0,"x",{"c":true,"d":null}],"b":1}');
  assert.equal(M.canonicalJSON({ b: 1, a: 2 }), M.canonicalJSON({ a: 2, b: 1 }));
  for (let n = 0; n < 40; n++) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 97 + n * 13) & 255;
    const b64 = M.base64Encode(bytes);
    assert.equal(b64, Buffer.from(bytes).toString('base64'));
    assert.deepEqual(Array.from(M.base64Decode(b64)), Array.from(bytes));
  }
});

test('n1: canonical bytes round-trip every float bit, including −0 and denormals', () => {
  const values = [0, -0, 5e-324, -2.2250738585072014e-308, 1 / 3, 6.02214076e23, NaN, Infinity];
  const w = new M.ByteWriter(8);
  for (const x of values) w.f64(x);
  w.i32(-7);
  const r = new M.ByteReader(w.bytes());
  for (const x of values) assert.ok(Object.is(r.f64(), x), `value ${x} changed`);
  assert.equal(r.i32(), -7);
  assert.ok(r.done);
});
