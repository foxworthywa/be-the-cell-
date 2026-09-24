// @deps btc-math
/*
 * Be the Cell: seeded random streams and samplers (engine spec §4).
 *
 * A stream is an Int32Array(4) holding sfc32 state. Streams are plain data, so
 * a snapshot copies them bit for bit. Each stream is seeded from the run seed
 * and its label ('tx:ptsG', 'decay:lacZ', 'division'), never from a slot
 * number or a creation order, so adding a gene or moving it to another slot
 * leaves every other stream's numbers unchanged.
 *
 * Every sampler consumes a fixed number of uniforms that depends only on its
 * arguments, which keeps a forked twin's draws aligned with the original's.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-math.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.prng = factory(B.math);
  }
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  /** splitmix32 generator (used only to fill a new stream's state). */
  function splitmix32(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x9e3779b9) | 0;
      let t = a ^ (a >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };
  }

  /** Advances sfc32 state s (Int32Array(4)) and returns a uniform in [0, 1). */
  function uniform(s) {
    const a = s[0], b = s[1], c = s[2], d = s[3];
    const t = (((a + b) | 0) + d) | 0;
    s[3] = (d + 1) | 0;
    s[0] = b ^ (b >>> 9);
    s[1] = (c + (c << 3)) | 0;
    s[2] = (((c << 21) | (c >>> 11)) + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Fills s (Int32Array(4), created if absent) for (seed, label) and discards 12 outputs. */
  function seedStream(seed, label, s) {
    s = s || new Int32Array(4);
    const sm = splitmix32((seed ^ M.fnv1a32(label)) | 0);
    s[0] = sm(); s[1] = sm(); s[2] = sm(); s[3] = sm();
    for (let i = 0; i < 12; i++) uniform(s);
    return s;
  }

  /** Sum of 12 uniforms minus 6: an approximately standard normal deviate. */
  function normal12(s) {
    let z = 0;
    for (let i = 0; i < 12; i++) z += uniform(s);
    return z - 6;
  }

  /**
   * Poisson(μ). For μ ≤ 30 (always, in M1): inversion with exactly one uniform,
   * even when μ = 0. Above 30: a rounded normal from 12 uniforms.
   */
  function poisson(s, mu) {
    if (mu > 30) {
      const k = Math.round(mu + M.dsqrt(mu) * normal12(s));
      return k > 0 ? k : 0;
    }
    const u = uniform(s);
    let p = M.detExp(-mu);
    let cdf = p, k = 0;
    while (u > cdf && k < 200) {
      k++;
      p = p * mu / k;
      cdf += p;
    }
    return k;
  }

  function bernoulli(s, p) {
    return uniform(s) < p;
  }

  /** Binomial(n, ½): n coin flips up to 1,000, a clamped normal above. */
  function binomialHalf(s, n) {
    if (n <= 1000) {
      let k = 0;
      for (let i = 0; i < n; i++) if (uniform(s) < 0.5) k++;
      return k;
    }
    const k = Math.round(n / 2 + M.dsqrt(n / 4) * normal12(s));
    return k < 0 ? 0 : (k > n ? n : k);
  }

  return { splitmix32, uniform, seedStream, normal12, poisson, bernoulli, binomialHalf };
});
