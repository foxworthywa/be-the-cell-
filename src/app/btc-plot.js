// @deps btc-palette btc-format
/*
 * Be the Cell: a small canvas time-series plot (LAB_UI §5.2) and its pure
 * scale helpers (tested, U-10).
 *
 * Points are placed by the tick stored with each Recorder sample, never by an
 * assumed spacing. At most two points are drawn per pixel column (the
 * column's minimum and maximum), so a spike survives any zoom. The last point
 * is the live value from the view, so a plot moves even between samples.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-palette.js'), require('./btc-format.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.Plot = factory(B.palette, B.format);
  }
})(typeof self !== 'undefined' ? self : this, function (PAL, F) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Pure helpers
  // ---------------------------------------------------------------------------

  /** 3–5 "nice" ticks (1, 2, 2.5, 5 × 10ⁿ steps) covering [min, max]. */
  function niceTicks(min, max, n) {
    const want = Math.max(3, n || 3);
    let lo = min, hi = max;
    if (!(hi > lo)) hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.5);
    const raw = (hi - lo) / (want - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    let step = mag;
    for (const m of [1, 2, 2.5, 5, 10]) { step = m * mag; if (step >= raw * (1 - 1e-9)) break; }
    const start = Math.floor(lo / step + 1e-9) * step, end = Math.ceil(hi / step - 1e-9) * step;
    const ticks = [];
    for (let k = 0; start + k * step <= end + step * 1e-6 && k < 6; k++) ticks.push(Number((start + k * step).toPrecision(12)));
    while (ticks.length < 3) ticks.push(Number((ticks[ticks.length - 1] + step).toPrecision(12)));
    return ticks;
  }

  /** Decades for a log axis whose floor is 1 (0 is drawn on the baseline). */
  function logTicks(min, max) {
    const hi = Math.max(1, max);
    const top = Math.max(1, Math.ceil(Math.log10(hi) - 1e-9));
    const ticks = [];
    for (let e = 0; e <= top; e++) ticks.push(Math.pow(10, e));
    if (ticks.length === 1) ticks.push(10);
    return ticks;
  }

  /** Tick spacing (s) and unit for a time window (s; 0 = all). */
  function xTicks(windowSec) {
    const w = windowSec;
    if (w <= 600) return { step: 120, unit: 'min', div: 60 };
    if (w <= 3600) return { step: 600, unit: 'min', div: 60 };
    if (w <= 21600) return { step: 3600, unit: 'h', div: 3600 };
    if (w <= 86400) return { step: 4 * 3600, unit: 'h', div: 3600 };
    return { step: 12 * 3600, unit: 'h', div: 3600 };
  }

  /**
   * Min/max per pixel column for points (px[i], ys[i]), i in [0, n):
   * fills colMin/colMax (NaN where a column is empty) for columns [0, widthPx).
   * At most two points per column are then drawn, so spikes survive.
   */
  function thinForPixels(px, ys, n, widthPx, colMin, colMax) {
    const W = Math.floor(widthPx);
    for (let c = 0; c < W; c++) { colMin[c] = NaN; colMax[c] = NaN; }
    for (let i = 0; i < n; i++) {
      const c = Math.floor(px[i]);
      if (c < 0 || c >= W) continue;
      const y = ys[i];
      if (colMin[c] !== colMin[c] || y < colMin[c]) colMin[c] = y;
      if (colMax[c] !== colMax[c] || y > colMax[c]) colMax[c] = y;
    }
    return W;
  }

  /** First index with ticks[i] >= t (binary search over the valid prefix). */
  function lowerBound(ticks, n, t) {
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ticks[mid] < t) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // ---------------------------------------------------------------------------
  // The plot
  // ---------------------------------------------------------------------------
  const PAD_TOP = 18, PAD_BOTTOM = 18, MAX_COLS = 4096;

  class Plot {
    /**
     * opts: {canvas, scale: 'lin'|'log'|'fixed', min, max, extendStep, band: {below, label}, labelGutter}
     */
    constructor(opts) {
      this.canvas = opts.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.opts = opts;
      this.log = false;
      this.w = 0; this.h = 0; this.dpr = 1;
      this.colMin = new Float64Array(MAX_COLS);
      this.colMax = new Float64Array(MAX_COLS);
      this.labelY = new Float64Array(8);
      this.overlay = null;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w === this.w && h === this.h && dpr === this.dpr) return false;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }

    /** Reserved for level 1.2 (predicted curves); not in M1. */
    setOverlay() { throw new Error('not in M1'); }
    setInputMode() { throw new Error('not in M1'); }

    /** The y range for this frame, from the data maximum. */
    yRange(maxV) {
      const o = this.opts;
      if (o.scale === 'fixed') {
        let hi = o.max;
        if (o.extendStep && maxV > hi) hi = Math.ceil(maxV / o.extendStep) * o.extendStep;
        return { lo: o.min, hi, ticks: niceTicks(o.min, hi, 4).filter((t) => t <= hi + 1e-9) };
      }
      if (this.log) {
        const ticks = logTicks(1, maxV);
        return { lo: 0, hi: Math.log10(ticks[ticks.length - 1]), ticks };
      }
      const ticks = niceTicks(0, Math.max(maxV, 1), 3);
      return { lo: 0, hi: ticks[ticks.length - 1], ticks };
    }

    /**
     * m: {ticks (Int32Array), count, dt, t0, t1 (sim s shown), series: [{data, live, color, label}], nSeries,
     *     markers: {n, tick, kind, label}, bands: {n, t0, t1, color}, scrubT (sim s or -1)}
     */
    draw(m) {
      const c = this.ctx, P = PAL.current(), W = this.w, H = this.h;
      let gutter = 10;
      if (m.nSeries > 1 || this.opts.labelGutter) {
        c.font = '600 12px ' + FONT;
        for (let s = 0; s < m.nSeries; s++) gutter = Math.max(gutter, c.measureText(m.series[s].label).width + 12);
      }
      const x0 = 2, x1 = W - gutter, y0 = PAD_TOP, y1 = H - PAD_BOTTOM;
      const tEnd = m.tEnd > m.t1 ? m.tEnd : m.t1;
      const span = Math.max(1, tEnd - m.t0);
      const tx = (t) => x0 + ((t - m.t0) / span) * (x1 - x0);
      c.fillStyle = P.panel;
      c.fillRect(0, 0, W, H);

      // Data maximum within the window (and the live values).
      const i0 = lowerBound(m.ticks, m.count, Math.floor(m.t0 / m.dt));
      let maxV = 0;
      for (let s = 0; s < m.nSeries; s++) {
        const d = m.series[s].data;
        for (let i = i0; i < m.count; i++) if (d[i] > maxV) maxV = d[i];
        if (m.series[s].live > maxV) maxV = m.series[s].live;
      }
      const yr = this.yRange(maxV);
      const ty = (v) => {
        const u = this.log ? Math.log10(Math.max(1, v)) : v;
        return y1 - ((u - yr.lo) / (yr.hi - yr.lo || 1)) * (y1 - y0);
      };

      // Drug bands and the "low" band.
      for (let b = 0; b < m.bands.n; b++) {
        const a = Math.max(x0, tx(m.bands.t0[b])), e = Math.min(x1, tx(m.bands.t1[b]));
        if (e <= a) continue;
        c.globalAlpha = 0.1; c.fillStyle = P[m.bands.color[b]]; c.fillRect(a, y0, e - a, y1 - y0); c.globalAlpha = 1;
      }
      if (this.opts.band) {
        const yb = ty(this.opts.band.below);
        c.fillStyle = P['warn-pale']; c.fillRect(x0, yb, x1 - x0, y1 - yb);
        c.fillStyle = P['warn-ink']; c.font = '12px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'bottom';
        c.fillText(this.opts.band.label, x1 - 4, y1 - 2);
      }

      // Grid and y labels (inside the plot, no wasted margin).
      c.strokeStyle = P.line; c.lineWidth = 1;
      c.beginPath();
      for (const t of yr.ticks) { const y = Math.round(ty(t)) + 0.5; c.moveTo(x0, y); c.lineTo(x1, y); }
      c.stroke();
      c.fillStyle = P.muted; c.font = '12px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'top';
      const every = this.log && yr.ticks.length > 4 ? 2 : 1;
      for (let k = 0; k < yr.ticks.length; k++) {
        const t = yr.ticks[k], y = ty(t);
        if (y + 14 > y1 || (yr.ticks.length - 1 - k) % every) continue;
        const s = tickLabel(t);
        c.strokeStyle = P.panel; c.lineWidth = 3; c.lineJoin = 'round';
        c.strokeText(s, x0 + 3, y + 2);
        c.fillText(s, x0 + 3, y + 2);
      }

      // x axis: sim time.
      const xt = xTicks(m.window || span);
      c.textAlign = 'center'; c.textBaseline = 'top';
      const first = Math.ceil(m.t0 / xt.step) * xt.step;
      let lastLabelX = -1e9;
      for (let t = first; t <= tEnd; t += xt.step) {
        const x = tx(t);
        if (x - lastLabelX < 34 || x < x0 + 10 || x > x1 - 6) continue;
        c.fillText(String(Math.round(t / xt.div)), x, y1 + 3);
        lastLabelX = x;
      }
      c.textAlign = 'right';
      c.fillText(xt.unit === 'min' ? 'min' : 'h', W - 4, y1 + 3);

      // Division markers (dashed) and command ticks.
      c.strokeStyle = P.muted; c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath();
      for (let k = 0; k < m.markers.n; k++) {
        if (m.markers.kind[k] !== 1) continue;
        const x = Math.round(tx(m.markers.tick[k] * m.dt)) + 0.5;
        if (x < x0 || x > x1) continue;
        c.moveTo(x, y0); c.lineTo(x, y1);
      }
      c.stroke();
      c.setLineDash([]);
      // Command ticks along the top, labelled where there is room ("fliC ×4", "glucose none").
      c.fillStyle = P.muted; c.textAlign = 'left'; c.textBaseline = 'top'; c.font = '12px ' + FONT;
      let freeFrom = -1e9;
      for (let k = 0; k < m.markers.n; k++) {
        const kind = m.markers.kind[k];
        if (kind !== 2 && kind !== 3) continue;
        const x = tx(m.markers.tick[k] * m.dt);
        if (x < x0 || x > x1) continue;
        c.fillRect(Math.round(x) - 0.5, y0 - 5, 1.5, 5);
        const label = m.markers.label[k];
        if (label && x >= freeFrom) {
          const w = c.measureText(label).width;
          if (x + 3 + w <= W - 2) { c.fillText(label, x + 3, 1); freeFrom = x + w + 10; }
        }
      }

      // Series: min/max per pixel column, then the live head.
      for (let s = 0; s < m.nSeries; s++) {
        const ser = m.series[s];
        const cols = Math.min(MAX_COLS, Math.ceil(x1 - x0) + 1);
        const cmin = this.colMin, cmax = this.colMax;
        for (let q = 0; q < cols; q++) { cmin[q] = NaN; cmax[q] = NaN; }
        for (let i = i0; i < m.count; i++) {
          const q = Math.floor(tx(m.ticks[i] * m.dt) - x0);
          if (q < 0 || q >= cols) continue;
          const y = ty(ser.data[i]);
          if (cmin[q] !== cmin[q] || y < cmin[q]) cmin[q] = y;
          if (cmax[q] !== cmax[q] || y > cmax[q]) cmax[q] = y;
        }
        c.strokeStyle = P[ser.color]; c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath();
        let started = false;
        for (let q = 0; q < cols; q++) {
          if (cmin[q] !== cmin[q]) continue;
          const x = x0 + q + 0.5;
          if (!started) { c.moveTo(x, cmax[q]); started = true; } else c.lineTo(x, cmax[q]);
          if (cmin[q] !== cmax[q]) c.lineTo(x, cmin[q]);
        }
        const yl = ty(ser.live), xl = tx(m.t1);
        if (!started) c.moveTo(xl, yl); else c.lineTo(xl, yl);
        c.stroke();
        this.labelY[s] = yl;
        this.labelX = Math.min(x1, xl);
      }

      // Direct labels at the line ends, nudged apart so they do not overlap.
      if (m.nSeries > 1 || this.opts.labelGutter) {
        const order = ORDER;
        for (let s = 0; s < m.nSeries; s++) order[s] = s;
        for (let a = 1; a < m.nSeries; a++) {
          for (let b = a; b > 0 && this.labelY[order[b]] < this.labelY[order[b - 1]]; b--) {
            const t = order[b]; order[b] = order[b - 1]; order[b - 1] = t;
          }
        }
        for (let a = 1; a < m.nSeries; a++) {
          const prev = this.labelY[order[a - 1]];
          if (this.labelY[order[a]] < prev + 14) this.labelY[order[a]] = prev + 14;
        }
        c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = '600 12px ' + FONT;
        for (let s = 0; s < m.nSeries; s++) {
          const ser = m.series[s];
          c.fillStyle = P[ser.color];
          c.fillText(ser.label, this.labelX + 6, Math.max(y0, Math.min(H - PAD_BOTTOM - 4, this.labelY[s])));
        }
      }

      // Scrub crosshair.
      if (m.scrubT >= 0) {
        const x = Math.round(tx(m.scrubT)) + 0.5;
        c.strokeStyle = P.ink; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke();
      }
      this.x0 = x0; this.x1 = x1; this.t0 = m.t0; this.t1 = tEnd; this.tNow = m.t1;
    }

    /** Sim time (s) under CSS x, from the last draw. */
    timeAt(x) {
      if (!(this.x1 > this.x0)) return -1;
      const f = Math.max(0, Math.min(1, (x - this.x0) / (this.x1 - this.x0)));
      return Math.min(this.tNow, this.t0 + f * (this.t1 - this.t0));
    }
  }

  const ORDER = new Int32Array(8);
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  /** Axis numbers: 12, 1.5, 2.5k style is avoided; counts use the standard format. */
  function tickLabel(t) {
    if (t >= 1e6) return F.count(t);
    if (t >= 1000) return F.commas(t);
    return String(Number(t.toPrecision(3)));
  }

  Plot.niceTicks = niceTicks;
  Plot.logTicks = logTicks;
  Plot.xTicks = xTicks;
  Plot.thinForPixels = thinForPixels;
  Plot.lowerBound = lowerBound;
  return Plot;
});
