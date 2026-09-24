// @deps btc-palette btc-format
/*
 * Be the Cell: a small canvas time-series plot (LAB_UI §5.2) and its pure
 * scale helpers (tested, U-10).
 *
 * Points are placed by the tick stored with each Recorder sample, never by an
 * assumed spacing. At most two points are drawn per pixel column (the
 * column's minimum and maximum), so a spike survives any zoom. The last point
 * is the live value from the view, so a plot moves even between samples.
 *
 * Level hooks (LEVELS §5.4.3, §9 item 6): setOverlay(points, style) draws a
 * dashed curve in data units (1.2's sketch over the demo), setYBand(band)
 * shades a horizontal band (1.4's target band), and setInputMode('sketch', opts)
 * turns the canvas into a finger-drawing surface that reports data points.
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
      this.yBand = null;
      this.input = null;
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

    /**
     * A curve drawn over the data in data units: points [[t_s, value], …] (null breaks the line),
     * style {color (palette token), dash ([6, 5]), width, legend: [{text, dash?, color?}]}. null clears it.
     */
    setOverlay(points, style) {
      this.overlay = points && points.length ? { points, style: Object.assign({ color: 'muted', dash: [6, 5], width: 2 }, style || {}) } : null;
    }

    /** A horizontal band {lo, hi, label, color?} shaded behind the data (1.4's target band); null clears it. */
    setYBand(band) { this.yBand = band || null; }

    /**
     * 'sketch': pointer input in data units (touch-action none while on, pointer capture,
     * pointercancel ends the stroke). opts.onPoint(t_s, value, phase) with phase 'start' | 'move' |
     * 'end'. Any other mode (null) turns it off and restores scrolling.
     */
    setInputMode(mode, opts) {
      const cv = this.canvas;
      if (this.input) {
        for (const [type, fn] of this.input.handlers) cv.removeEventListener(type, fn);
        cv.style.touchAction = this.input.touchAction;
        this.input = null;
      }
      if (mode !== 'sketch') return;
      const o = opts || {};
      let active = null;
      const at = (e) => {
        const r = cv.getBoundingClientRect();
        return this.dataAt(e.clientX - r.left, e.clientY - r.top);
      };
      const emit = (e, phase) => {
        const p = at(e);
        if (p && o.onPoint) o.onPoint(p.t, p.v, phase);
      };
      const handlers = [
        ['pointerdown', (e) => {
          if (e.button !== undefined && e.button > 0) return;
          active = e.pointerId;
          try { cv.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
          e.preventDefault();
          emit(e, 'start');
        }],
        ['pointermove', (e) => { if (active !== e.pointerId) return; e.preventDefault(); emit(e, 'move'); }],
        ['pointerup', (e) => { if (active !== e.pointerId) return; emit(e, 'end'); active = null; }],
        ['pointercancel', (e) => { if (active !== e.pointerId) return; active = null; if (o.onPoint) o.onPoint(null, null, 'end'); }],
      ];
      for (const [type, fn] of handlers) cv.addEventListener(type, fn);
      this.input = { handlers, touchAction: cv.style.touchAction };
      cv.style.touchAction = 'none';
    }

    /** Data coordinates {t (sim s), v} under CSS point (x, y) of the last draw, clamped to the axes; null before a draw. */
    dataAt(x, y) {
      if (!(this.x1 > this.x0) || !this.ymap) return null;
      const fx = Math.max(0, Math.min(1, (x - this.x0) / (this.x1 - this.x0)));
      const m = this.ymap;
      const fy = Math.max(0, Math.min(1, (m.y1 - y) / (m.y1 - m.y0)));
      return { t: this.t0 + fx * (this.t1 - this.t0), v: m.lo + fy * (m.hi - m.lo) };
    }

    /** The y range for this frame, from the data maximum. */
    yRange(maxV) {
      const o = this.opts;
      if (o.scale === 'fixed') {
        let hi = o.max;
        if (o.extendStep && maxV > hi) hi = Math.ceil(maxV / o.extendStep) * o.extendStep;
        if (o.yStep) {
          const ticks = [];
          for (let t = o.min; t <= hi + 1e-9 && ticks.length < 12; t += o.yStep) ticks.push(t);
          return { lo: o.min, hi, ticks };
        }
        return { lo: o.min, hi, ticks: niceTicks(o.min, hi, 4).filter((t) => t <= hi + 1e-9) };
      }
      if (this.log) {
        const ticks = logTicks(1, maxV);
        return { lo: 0, hi: Math.log10(ticks[ticks.length - 1]), ticks };
      }
      const ticks = niceTicks(0, Math.max(maxV, 1), 3);
      return { lo: 0, hi: ticks[ticks.length - 1], ticks };
    }

    /** Data maximum within the window (and the live values, the overlay and the band). */
    dataMax(m) {
      const i0 = m.count ? lowerBound(m.ticks, m.count, Math.floor(m.t0 / m.dt)) : 0;
      let maxV = 0;
      for (let s = 0; s < m.nSeries; s++) {
        const d = m.series[s].data;
        if (d) for (let i = i0; i < m.count; i++) if (d[i] > maxV) maxV = d[i];
        if (m.series[s].live > maxV) maxV = m.series[s].live;
      }
      if (this.overlay) for (const p of this.overlay.points) if (p && p[1] > maxV) maxV = p[1];
      if (this.yBand && this.yBand.hi * 1.1 > maxV) maxV = this.yBand.hi * 1.1;
      return maxV;
    }

    /**
     * The side gutters this plot needs for m: left for the y tick labels, right for the
     * end-of-line labels. The graphs panel takes the largest over all plots and passes it
     * back as m.gutterL / m.gutterR, so stacked plots share one time axis (LAB_UI §5.2).
     */
    gutters(m, out) {
      const c = this.ctx, o = out || { left: 0, right: 0 };
      c.font = '12px ' + FONT;
      const yr = this.yRange(this.dataMax(m));
      let left = 0;
      for (const t of yr.ticks) left = Math.max(left, c.measureText(tickLabel(t)).width);
      o.left = Math.ceil(left) + 8;
      let right = 10;
      if (m.nSeries > 1 || this.opts.labelGutter) {
        c.font = '600 12px ' + FONT;
        for (let s = 0; s < m.nSeries; s++) right = Math.max(right, c.measureText(m.series[s].label).width + 12);
      }
      o.right = Math.ceil(right);
      return o;
    }

    /**
     * m: {ticks (Int32Array), count, dt, t0, t1 (sim s shown), series: [{data, live, color, label}], nSeries,
     *     markers: {n, tick, kind, label, prio?}, bands: {n, t0, t1, color, label?}, scrubT (sim s or -1),
     *     gutterL?, gutterR? (shared side gutters, px)}
     */
    draw(m) {
      const c = this.ctx, P = PAL.current(), W = this.w, H = this.h;
      const own = (m.gutterL === undefined || m.gutterR === undefined) ? this.gutters(m, GUT) : null;
      const gutterL = own ? own.left : m.gutterL, gutterR = own ? own.right : m.gutterR;
      const x0 = gutterL, x1 = Math.max(x0 + 20, W - gutterR), y0 = this.opts.yLabel ? PAD_TOP + 10 : PAD_TOP, y1 = H - PAD_BOTTOM;
      const tEnd = m.tEnd > m.t1 ? m.tEnd : m.t1;
      const span = Math.max(1, tEnd - m.t0);
      const tx = (t) => x0 + ((t - m.t0) / span) * (x1 - x0);
      c.fillStyle = P.panel;
      c.fillRect(0, 0, W, H);

      const i0 = m.count ? lowerBound(m.ticks, m.count, Math.floor(m.t0 / m.dt)) : 0;
      const yr = this.yRange(this.dataMax(m));
      const ty = (v) => {
        const u = this.log ? Math.log10(Math.max(1, v)) : v;
        return y1 - ((u - yr.lo) / (yr.hi - yr.lo || 1)) * (y1 - y0);
      };
      this.ymap = this.log ? null : { y0, y1, lo: yr.lo, hi: yr.hi };

      // A horizontal target band (1.4), labelled at its top right (the label is drawn after the grid, below).
      let bandLabel = null;
      if (this.yBand) {
        const b = this.yBand, ya = Math.max(y0, ty(b.hi)), yb = Math.min(y1, ty(b.lo));
        if (yb > ya) {
          c.globalAlpha = 0.16; c.fillStyle = P[b.color || 'good']; c.fillRect(x0, ya, x1 - x0, yb - ya); c.globalAlpha = 1;
          c.strokeStyle = P[b.color || 'good']; c.lineWidth = 1; c.setLineDash([4, 3]);
          c.beginPath(); c.moveTo(x0, Math.round(ya) + 0.5); c.lineTo(x1, Math.round(ya) + 0.5); c.moveTo(x0, Math.round(yb) + 0.5); c.lineTo(x1, Math.round(yb) + 0.5); c.stroke();
          c.setLineDash([]);
          if (b.label) bandLabel = { text: b.label, x: x1 - 4, y: ya + 4 };
        }
      }

      // Drug bands (each labelled at its start) and the "low" band.
      c.font = '11px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'top';
      for (let b = 0; b < m.bands.n; b++) {
        const a = Math.max(x0, tx(m.bands.t0[b])), e = Math.min(x1, tx(m.bands.t1[b]));
        if (e <= a) continue;
        const col = P[m.bands.color[b]] || P.accent;
        c.globalAlpha = 0.1; c.fillStyle = col; c.fillRect(a, y0, e - a, y1 - y0); c.globalAlpha = 1;
        // Adjacent bands (1.7's phases) are told apart by a thin line at each start.
        if (tx(m.bands.t0[b]) > x0) { c.globalAlpha = 0.35; c.fillStyle = col; c.fillRect(Math.round(a), y0, 1, y1 - y0); c.globalAlpha = 1; }
        const lab = m.bands.label ? m.bands.label[b] : '';
        // A label only where it fits inside its own band (1.7's sugar phases lie side by side).
        if (lab && tx(m.bands.t0[b]) >= x0 && a + 3 + c.measureText(lab).width <= Math.min(x1, e - 2)) { c.fillStyle = col; c.fillText(lab, a + 3, y0 + 2); }
      }
      if (this.opts.band) {
        const yb = ty(this.opts.band.below);
        c.fillStyle = P['warn-pale']; c.fillRect(x0, yb, x1 - x0, y1 - yb);
        c.fillStyle = P['warn-ink']; c.font = '12px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'bottom';
        c.fillText(this.opts.band.label, x1 - 4, y1 - 2);
      }

      // Grid, and y labels in the left gutter (never over the data).
      c.strokeStyle = P.line; c.lineWidth = 1;
      c.beginPath();
      for (const t of yr.ticks) { const y = Math.round(ty(t)) + 0.5; c.moveTo(x0, y); c.lineTo(x1, y); }
      c.moveTo(x0 - 0.5, y0); c.lineTo(x0 - 0.5, y1);
      c.stroke();
      // The band's label on a patch of the panel colour, so a gridline through the band never crosses it.
      if (bandLabel) {
        c.font = '12px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'top';
        const w = c.measureText(bandLabel.text).width;
        c.fillStyle = P.panel; c.fillRect(bandLabel.x - w - 3, bandLabel.y - 1, w + 6, 15);
        c.fillStyle = P.ink; c.fillText(bandLabel.text, bandLabel.x, bandLabel.y);
      }
      c.fillStyle = P.muted; c.font = '12px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'middle';
      const every = this.log && yr.ticks.length > 4 ? 2 : 1;
      for (let k = 0; k < yr.ticks.length; k++) {
        if ((yr.ticks.length - 1 - k) % every) continue;
        const t = yr.ticks[k], y = Math.max(y0 - 4, Math.min(y1, ty(t)));
        c.fillText(tickLabel(t), x0 - 5, y);
      }

      // x axis: sim time (a plot may ask for its own step, e.g. 5 min on the 20-min sketch axes, or 2 h with xUnit 'h').
      const xt = this.opts.xStep ? { step: this.opts.xStep, unit: this.opts.xUnit || 'min', div: this.opts.xUnit === 'h' ? 3600 : 60 } : xTicks(m.window || span);
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
      c.fillText(this.opts.xLabel || (xt.unit === 'min' ? 'min' : 'h'), W - 4, y1 + 3);
      if (this.opts.yLabel) { c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(this.opts.yLabel, 4, 1); }

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
      // Command ticks along the top. Labels ("fliC ×4", "glucose none") go where there is room,
      // the more important first: glucose, other medium, drugs, then promoters (prio 4, 3, 2, 1).
      c.fillStyle = P.muted; c.textAlign = 'left'; c.textBaseline = 'top'; c.font = '12px ' + FONT;
      let nPlaced = 0;
      for (let k = 0; k < m.markers.n; k++) {
        const kind = m.markers.kind[k];
        if (kind !== 2 && kind !== 3) continue;
        const x = tx(m.markers.tick[k] * m.dt);
        if (x < x0 || x > x1) continue;
        c.fillRect(Math.round(x) - 0.5, y0 - 5, 1.5, 5);
      }
      for (let pr = 4; pr >= 0; pr--) {
        for (let k = m.markers.n - 1; k >= 0; k--) {          // newest first within a priority
          const kind = m.markers.kind[k];
          if (kind !== 2 && kind !== 3) continue;
          const kp = m.markers.prio ? m.markers.prio[k] : 1;
          if (kp !== pr) continue;
          const label = m.markers.label[k];
          if (!label) continue;
          const x = tx(m.markers.tick[k] * m.dt);
          if (x < x0 || x > x1) continue;
          const w = c.measureText(label).width;
          const a = x + 3, e = a + w;
          if (e > W - 2) continue;
          let free = true;
          for (let q = 0; q < nPlaced && free; q++) if (a < PLACED[2 * q + 1] + 8 && e + 8 > PLACED[2 * q]) free = false;
          if (!free || nPlaced >= PLACED.length / 2) continue;
          c.fillText(label, a, 1);
          PLACED[2 * nPlaced] = a; PLACED[2 * nPlaced + 1] = e; nPlaced++;
        }
      }

      // The overlay (a sketch), dashed, under the series.
      if (this.overlay) {
        const ov = this.overlay;
        c.strokeStyle = P[ov.style.color] || P.muted; c.lineWidth = ov.style.width; c.setLineDash(ov.style.dash || []);
        c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath();
        let pen = false;
        for (const p of ov.points) {
          if (!p) { pen = false; continue; }
          const x = Math.max(x0, Math.min(x1, tx(p[0]))), y = Math.max(y0, Math.min(y1, ty(p[1])));
          if (!pen) { c.moveTo(x, y); pen = true; } else c.lineTo(x, y);
        }
        c.stroke();
        c.setLineDash([]);
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
        if (ser.live === ser.live) { if (!started) c.moveTo(xl, yl); else c.lineTo(xl, yl); }
        c.stroke();
        this.labelY[s] = yl;
        this.labelX = Math.min(x1, xl);
      }

      // Direct labels at the line ends: kept inside the plot, then nudged apart so they do not overlap.
      if (m.nSeries > 1 || this.opts.labelGutter) {
        const top = y0 + 6, bottom = y1 - 6, gap = 14;
        const order = ORDER;
        for (let s = 0; s < m.nSeries; s++) { order[s] = s; this.labelY[s] = Math.max(top, Math.min(bottom, this.labelY[s])); }
        for (let a = 1; a < m.nSeries; a++) {
          for (let b = a; b > 0 && this.labelY[order[b]] < this.labelY[order[b - 1]]; b--) {
            const t = order[b]; order[b] = order[b - 1]; order[b - 1] = t;
          }
        }
        for (let a = 1; a < m.nSeries; a++) {
          const prev = this.labelY[order[a - 1]];
          if (this.labelY[order[a]] < prev + gap) this.labelY[order[a]] = prev + gap;
        }
        const over = m.nSeries ? this.labelY[order[m.nSeries - 1]] - bottom : 0;
        if (over > 0) for (let s = 0; s < m.nSeries; s++) this.labelY[s] -= over;     // shift the stack up
        c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = '600 12px ' + FONT;
        for (let s = 0; s < m.nSeries; s++) {
          const ser = m.series[s];
          c.fillStyle = P[ser.color];
          c.fillText(ser.label, this.labelX + 6, this.labelY[s]);
        }
      }

      // A legend for the overlay (1.2: "- - your sketch  — the cell"), top left inside the plot.
      if (this.overlay && this.overlay.style.legend) {
        c.font = '12px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle';
        let lx = x0 + 8;
        const ly = y0 + 8;
        for (const it of this.overlay.style.legend) {
          c.strokeStyle = P[it.color || 'ink']; c.lineWidth = 2; c.setLineDash(it.dash || []);
          c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 18, ly); c.stroke();
          c.setLineDash([]);
          c.fillStyle = P.ink; c.fillText(it.text, lx + 23, ly);
          lx += 23 + c.measureText(it.text).width + 14;
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
  const PLACED = new Float64Array(2 * 64);      // command-label intervals placed this draw
  const GUT = { left: 0, right: 0 };
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
