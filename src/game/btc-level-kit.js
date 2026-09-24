// @deps btc-math btc-prng
/*
 * Be the Cell: the level kit (LEVELS §3.4). Pure helpers for level files.
 *
 *   rng(seed, label)                  a seeded sfc32 stream, seeded like the engine's streams
 *                                     (splitmix32(seed ^ fnv1a32(label)), 12 outputs dropped):
 *                                     u() in [0, 1), int(lo, hi) inclusive, pick(arr), shuffle(arr) (a copy)
 *   seedFor(variantSeed, role)        the engine seed of a run: fnv1a32(variantSeed + ':' + role)
 *   variantSeed(deviceSeed, id, k)    the 30-bit variant seed of attempt k + 1
 *   fill(template, vars)              "{name}" placeholders, as BTC.format.fill
 *   round(x, step)                    nearest multiple of step
 *   clock(t_s, fine)                  game time in BTC.format.clock wording (HUD timers)
 *   sketch.resample / coverage / features / accuracy   the 1.2 sketch metrics (§5.4.3, §7.2.6)
 *   holdTracker({lo, hi, meanTicks, needTicks})        the band hold of §7.4.5
 *   trailingMean(n)                   a fixed-window mean
 *
 * Levels draw their variants here, never from a cell's streams, so a variant
 * cannot change what the engine does except through the config it builds.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../engine/btc-math.js'), require('../engine/btc-prng.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.levelKit = factory(B.math, B.prng);
  }
})(typeof self !== 'undefined' ? self : this, function (M, R) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Seeds and streams
  // ---------------------------------------------------------------------------
  function rng(seed, label) {
    const s = R.seedStream(seed | 0, String(label));
    const u = () => R.uniform(s);
    const int = (lo, hi) => lo + Math.floor(u() * (hi - lo + 1));
    return {
      u,
      int,
      pick(arr) { return arr[int(0, arr.length - 1)]; },
      /** Fisher–Yates on a copy. */
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = int(0, i);
          const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      },
    };
  }

  function seedFor(variantSeed, role) {
    return M.fnv1a32(String(variantSeed) + ':' + role) >>> 0;
  }

  function variantSeed(deviceSeed, levelId, index) {
    return M.fnv1a32(String(deviceSeed >>> 0) + ':' + levelId + ':' + index) & 0x3FFFFFFF;
  }

  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? String(vars[k]) : m));
  }

  function round(x, step) {
    return Math.round(x / step) * step;
  }

  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

  /** Game time in BTC.format.clock wording ("4 min 30 s" when fine, "1 h 12 min" otherwise), usable in Node. */
  function clock(t_s, fine) {
    const t = Math.max(0, Math.floor(t_s));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    if (fine) {
      if (h > 0) return h + ' h ' + m + ' min ' + s + ' s';
      if (m > 0) return m + ' min ' + s + ' s';
      return s + ' s';
    }
    if (h > 0) return h + ' h ' + m + ' min';
    return m + ' min';
  }

  // ---------------------------------------------------------------------------
  // Sketch metrics (1.2). A sketch is drawn as strokes of [t, y] points (t in
  // minutes); null separates strokes. It is scored on the grid t_j = j·0.25 min.
  // ---------------------------------------------------------------------------
  const GRID = Object.freeze({ x0: 0, x1: 20, n: 80, step: 0.25 });

  /** Column index of x on a grid of n intervals over [x0, x1]. */
  function column(x, x0, x1, n) {
    return clamp(Math.round(((x - x0) / (x1 - x0)) * n), 0, n);
  }

  /**
   * The drawn columns of a sketch: one value per column, the last one drawn
   * wins (drawing back over a column replaces it); the columns between two
   * successive samples of one stroke are filled by linear interpolation.
   * Returns {value: Float64Array(n + 1), drawn: Uint8Array(n + 1)}.
   */
  function columns(points, x0, x1, n) {
    const value = new Float64Array(n + 1), drawn = new Uint8Array(n + 1);
    let pc = -1, py = 0;
    for (const p of points || []) {
      if (!p) { pc = -1; continue; }
      const c = column(p[0], x0, x1, n), y = p[1];
      if (pc >= 0 && c !== pc) {
        const dir = c > pc ? 1 : -1;
        for (let k = pc + dir; k !== c; k += dir) {
          value[k] = py + ((y - py) * (k - pc)) / (c - pc);
          drawn[k] = 1;
        }
      }
      value[c] = y; drawn[c] = 1;
      pc = c; py = y;
    }
    return { value, drawn };
  }

  /**
   * Resamples a sketch onto the grid (§5.4.3): a grid point takes its column's
   * value; gaps between drawn columns are interpolated; before the first drawn
   * column the first value is used, after the last the last. null if nothing was drawn.
   */
  function resample(points, x0, x1, n) {
    const a = x0 === undefined ? GRID.x0 : x0, b = x1 === undefined ? GRID.x1 : x1, m = n === undefined ? GRID.n : n;
    const col = columns(points, a, b, m);
    const idx = [];
    for (let k = 0; k <= m; k++) if (col.drawn[k]) idx.push(k);
    if (!idx.length) return null;
    const out = new Array(m + 1);
    for (let k = 0; k <= idx[0]; k++) out[k] = col.value[idx[0]];
    for (let i = 0; i < idx.length - 1; i++) {
      const k0 = idx[i], k1 = idx[i + 1], y0 = col.value[k0], y1 = col.value[k1];
      for (let k = k0; k <= k1; k++) out[k] = y0 + ((y1 - y0) * (k - k0)) / (k1 - k0);
    }
    for (let k = idx[idx.length - 1]; k <= m; k++) out[k] = col.value[idx[idx.length - 1]];
    return out;
  }

  /** First and last drawn x of a sketch, and whether it spans [from, to] (the coverage rule: ≤ 1 min and ≥ 19 min). */
  function coverage(points, opts) {
    const o = Object.assign({ x0: GRID.x0, x1: GRID.x1, n: GRID.n, from: 1, to: 19 }, opts || {});
    const col = columns(points, o.x0, o.x1, o.n);
    let first = -1, last = -1;
    for (let k = 0; k <= o.n; k++) if (col.drawn[k]) { if (first < 0) first = k; last = k; }
    if (first < 0) return { first: null, last: null, ok: false };
    const x = (k) => o.x0 + ((o.x1 - o.x0) * k) / o.n;
    return { first: x(first), last: x(last), ok: x(first) <= o.from && x(last) >= o.to };
  }

  /**
   * The four shape features of §7.2.6 on a grid sketch s (81 values, step 0.25 min).
   * ref: {tOff (min), step?}. A flat sketch (smax − s0 < 100) fails F1–F3.
   */
  function features(s, ref) {
    const step = (ref && ref.step) || GRID.step, n = s.length - 1;
    const at = (t) => s[clamp(Math.round(t / step), 0, n)];
    const s0 = s[0], s20 = s[n];
    let smax = -Infinity;
    for (let j = 0; j <= n; j++) if (s[j] > smax) smax = s[j];
    const flat = smax - s0 < 100;
    const rise = s20 - s0;
    const F1 = !flat && at(1) - s0 <= 0.1 * (smax - s0);
    const F2 = !flat && s20 > s0 && s20 - at(ref.tOff) >= 0.3 * rise;
    const F3 = !flat && s20 - at(15) <= 0.15 * rise;
    let F4 = true, runMax = -Infinity;
    for (let j = 0; j <= n; j++) {
      if (s[j] > runMax) runMax = s[j];
      if (s[j] < runMax - 0.05 * smax) { F4 = false; break; }
    }
    const passed = (F1 ? 1 : 0) + (F2 ? 1 : 0) + (F3 ? 1 : 0) + (F4 ? 1 : 0);
    return { F1, F2, F3, F4, flat, s0, s20, smax, sOff: at(ref.tOff), P: passed / 4 };
  }

  /** Amount accuracy A = clamp(1 − mean_{j=1..n} |s_j − r_j| / r(20), 0, 1) (§7.2.6). */
  function accuracy(s, r) {
    const n = s.length - 1, rEnd = r[n];
    if (!(rEnd > 0)) return 0;
    let sum = 0;
    for (let j = 1; j <= n; j++) sum += Math.abs(s[j] - r[j]);
    return clamp(1 - sum / n / rEnd, 0, 1);
  }

  // ---------------------------------------------------------------------------
  // Trailing mean and band hold (1.4)
  // ---------------------------------------------------------------------------
  /** A fixed-window mean: push(x) → the mean of the last min(k, n) values. state()/restore() are plain JSON. */
  function trailingMean(n) {
    let buf = new Array(n).fill(0), i = 0, k = 0, sum = 0;
    return {
      push(x) {
        if (k === n) sum -= buf[i]; else k++;
        buf[i] = x; sum += x;
        i = (i + 1) % n;
        return sum / k;
      },
      get mean() { return k ? sum / k : 0; },
      state() { return { buf: buf.slice(), i, k, sum }; },
      restore(s) { buf = s.buf.slice(); i = s.i; k = s.k; sum = s.sum; },
    };
  }

  /**
   * Band hold (§7.4.5): push(x, tick?) → {mean, inBand, run, best, done, doneTick}. The goal is met
   * when the meanTicks trailing mean stays inside [lo, hi] for needTicks consecutive pushes.
   */
  function holdTracker(o) {
    const tm = trailingMean(o.meanTicks);
    let st = { mean: 0, inBand: false, run: 0, best: 0, done: false, doneTick: -1, n: 0 };
    return {
      push(x, tick) {
        st.mean = tm.push(x);
        st.inBand = st.mean >= o.lo && st.mean <= o.hi;
        st.run = st.inBand ? st.run + 1 : 0;
        if (st.run > st.best) st.best = st.run;
        if (!st.done && st.run >= o.needTicks) { st.done = true; st.doneTick = tick === undefined ? st.n : tick; }
        st.n++;
        return st;
      },
      get status() { return st; },
      state() { return { st: Object.assign({}, st), tm: tm.state() }; },
      restore(s) { st = Object.assign({}, s.st); tm.restore(s.tm); },
    };
  }

  return {
    rng, seedFor, variantSeed, fill, round, clamp, clock,
    sketch: { GRID, columns, resample, coverage, features, accuracy },
    trailingMean, holdTracker,
  };
});
