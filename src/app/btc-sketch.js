// @deps btc-content btc-layout btc-plot btc-level-kit
/*
 * Be the Cell: the finger-drawn prediction sketch and its overlay (LEVELS §5.4.3),
 * built on BTC.Plot's level hooks (setInputMode('sketch'), setOverlay).
 *
 * The student draws the LacY curve they expect on fixed axes (0–20 min, 0–2,000
 * molecules), with the "×4 on" part of the schedule shaded. Capture is x-monotone:
 * one value per column (0.1 min wide, about a pixel and a half on a phone), and
 * drawing over a column replaces it, so moving back redraws that part. Columns
 * between two samples of one stroke are filled by straight lines. "Done" is enabled
 * once the drawing starts by minute 1 and reaches minute 19 ("Draw across the whole
 * graph." until then). "Use sliders instead" swaps the canvas input for five
 * steppers (2, 5, 8, 12 and 20 min, 0–2,000 in steps of 100; the value can also be typed) through
 * (0, 0); Done waits until at least one of them has been set, so a flat blank line cannot be locked in.
 *
 * The locked value is one stroke of [minute, LacY] points (one per drawn column); the
 * level kit resamples it onto the scoring grid. Sketch.chart draws a finished sketch
 * (dashed) over a curve the cell made (solid), for the demo and result sheets.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-layout.js'), require('./btc-plot.js'),
      require('../game/btc-level-kit.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.Sketch = factory(B.content, B.layout, B.Plot, B.levelKit);
  }
})(typeof self !== 'undefined' ? self : this, function (C, LY, Plot, K) {
  'use strict';

  const W = C.game.sketch;
  const COLS = 200;                                  // 0.1-min columns over 0–20 min
  const SLIDER_T = [2, 5, 8, 12, 20];
  const SLIDER_STEP = 100;
  const round = (x, d) => Math.round(x * d) / d;

  /** An empty time-series model with fixed axes (x in sim seconds) and the schedule's bands. */
  function model(x1s, bands) {
    return {
      ticks: new Int32Array(0), count: 0, dt: 1, t0: 0, t1: x1s, tEnd: x1s, window: x1s,
      series: [{ data: null, live: NaN, color: 'ink', label: '' }], nSeries: 0,
      markers: { n: 0, tick: [], kind: [], label: [] },
      bands: { n: bands.length, t0: bands.map((b) => b.from * 60), t1: bands.map((b) => b.to * 60), color: bands.map(() => 'accent'), label: bands.map((b) => b.label) },
      scrubT: -1,
    };
  }

  /** Points [[min, y]] → overlay points [[s, y]]. */
  const toSeconds = (pts) => pts.map((p) => (p ? [p[0] * 60, p[1]] : null));

  /** The drawn columns of raw strokes as one x-monotone stroke [[min, y]] (the locked value), or [] if nothing is drawn. */
  function columnsStroke(raw, x0, x1) {
    const col = K.sketch.columns(raw, x0, x1, COLS);
    const out = [];
    for (let k = 0; k <= COLS; k++) if (col.drawn[k]) out.push([round(x0 + ((x1 - x0) * k) / COLS, 100), Math.round(col.value[k])]);
    return out;
  }

  class Sketch {
    /**
     * opts: {item (a level's sketch item), schedule: [{from, to, label}], words: {x, y}, onChange()}.
     */
    constructor(opts) {
      this.opts = opts;
      this.item = opts.item;
      this.x0 = this.item.x.min; this.x1 = this.item.x.max;
      this.y0 = this.item.y.min; this.y1 = this.item.y.max;
      this.raw = [];
      this.sliders = false;
      this.values = SLIDER_T.map(() => 0);
      this.touched = false;           // a slider value has been set (the blank line is not a prediction)
      this.plot = null;
    }

    mount(host) {
      const h = LY.h;
      this.canvas = h('canvas', { class: 'sketch-canvas', role: 'img', 'aria-label': W.canvasLabel });
      this.wrap = h('div', { class: 'sketch-wrap' }, this.canvas);
      this.note = h('p', { class: 'sketch-note', 'aria-live': 'polite' });
      this.sliderBox = h('div', { class: 'sketch-sliders', hidden: true });
      this.toggle = h('button', { class: 'btn lv-skip sketch-toggle', type: 'button', onclick: () => this.setSliders(!this.sliders) }, W.useSliders);
      host.appendChild(this.wrap);
      host.appendChild(this.note);
      host.appendChild(this.sliderBox);
      host.appendChild(this.toggle);
      this.plot = new Plot({ canvas: this.canvas, scale: 'fixed', min: this.y0, max: this.y1, yStep: 500, xStep: 300, xLabel: this.opts.words.x, yLabel: this.opts.words.y });
      this.plot.setInputMode('sketch', { onPoint: (t, v, phase) => this.onPoint(t, v, phase) });
      this.buildSliders();
      this.redraw();
      if (typeof ResizeObserver === 'function') { this.ro = new ResizeObserver(() => this.redraw()); this.ro.observe(this.wrap); }
      return this;
    }

    destroy() {
      if (this.ro) this.ro.disconnect();
      if (this.plot) this.plot.setInputMode(null);
    }

    onPoint(t, v, phase) {
      if (this.sliders) return;
      if (t === null) { this.raw.push(null); return; }
      if (phase === 'start' && this.raw.length && this.raw[this.raw.length - 1] !== null) this.raw.push(null);
      this.raw.push([t / 60, v]);
      if (phase === 'end') this.raw.push(null);
      this.redraw();
      if (this.opts.onChange) this.opts.onChange();
    }

    buildSliders() {
      const h = LY.h;
      this.sliderBox.textContent = '';
      this.sliderInputs = SLIDER_T.map((t, i) => {
        const at = (s) => s.replace('{t}', String(t));
        // The value can be typed as well as stepped (steps of 100: the whole range in 20 taps, not 40).
        const out = h('input', { class: 'sketch-value num', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': at(W.valueAt) });
        const set = (x) => {
          this.values[i] = Math.round(Math.max(this.y0, Math.min(this.y1, x)));
          this.touched = true;
          out.value = String(this.values[i]);
          this.redraw();
          if (this.opts.onChange) this.opts.onChange();
        };
        out.addEventListener('change', () => {
          const v = Number(String(out.value).replace(/[^0-9.]/g, ''));
          if (out.value !== '' && v === v) set(v); else out.value = String(this.values[i]);
        });
        const row = h('div', { class: 'sketch-slider' }, [
          h('span', { class: 'sketch-at', text: at(W.atMinute) }),
          h('button', { class: 'btn lv-step', type: 'button', 'aria-label': at(W.less), onclick: () => set(this.values[i] - SLIDER_STEP) }, '−'),
          out,
          h('button', { class: 'btn lv-step', type: 'button', 'aria-label': at(W.more), onclick: () => set(this.values[i] + SLIDER_STEP) }, '+'),
        ]);
        out.value = String(this.values[i]);
        this.sliderBox.appendChild(row);
        return { set };
      });
    }

    setSliders(on) {
      this.sliders = !!on;
      this.sliderBox.hidden = !this.sliders;
      this.wrap.classList.toggle('is-readonly', this.sliders);
      this.plot.setInputMode(this.sliders ? null : 'sketch', { onPoint: (t, v, phase) => this.onPoint(t, v, phase) });
      LY.setText(this.toggle, this.sliders ? W.useDrawing : W.useSliders);
      this.redraw();
      if (this.opts.onChange) this.opts.onChange();
    }

    clear() {
      this.raw = [];
      this.values = SLIDER_T.map(() => 0);
      this.touched = false;
      this.buildSliders();
      this.redraw();
      if (this.opts.onChange) this.opts.onChange();
    }

    /** The value to lock: one stroke of [minute, LacY] points. */
    value() {
      if (this.sliders) return [[0, 0]].concat(SLIDER_T.map((t, i) => [t, this.values[i]]));
      return columnsStroke(this.raw, this.x0, this.x1);
    }

    /** Coverage rule of §5.4.3: first drawn at ≤ 1 min, last at ≥ 19 min. With the sliders: one value set. */
    covered() {
      if (this.sliders) return this.touched;
      return K.sketch.coverage(this.raw, { x0: this.x0, x1: this.x1, n: COLS }).ok;
    }

    /** Sets a drawing programmatically (the test hook): points [[min, y], …] with null between strokes. */
    setPoints(points) {
      this.sliders = false;
      this.raw = (points || []).map((p) => (p ? [p[0], p[1]] : null));
      this.redraw();
      if (this.opts.onChange) this.opts.onChange();
    }

    redraw() {
      if (!this.plot) return;
      this.plot.resize();
      const v = this.value();
      this.plot.setOverlay(v.length ? toSeconds(v) : null, { color: 'ink', dash: [], width: 2.5 });
      this.plot.draw(model(this.x1 * 60, this.opts.schedule || []));
      const ok = this.covered();
      LY.setText(this.note, this.sliders ? (ok ? W.sliderReady : W.sliderStart) : !v.length ? W.start : ok ? W.ready : W.whole);
      this.note.classList.toggle('is-warn', !this.sliders && !!v.length && !ok);
    }
  }

  /**
   * A finished sketch (dashed) over the cell's curve (solid) on the sketch axes:
   * opts {host, sketch: [[min, y]], curve: [values every step min], step (min), schedule, words: {x, y, sketch, cell}, color}.
   */
  function chart(opts) {
    const h = LY.h;
    const canvas = h('canvas', { class: 'sketch-canvas is-chart', role: 'img', 'aria-label': opts.label || W.chartLabel });
    const wrap = h('div', { class: 'sketch-wrap is-chart' }, canvas);
    const color = opts.color || 'g-lacY';
    // The legend is text under the chart, so it never sits on the data or the schedule's label.
    const key = h('div', { class: 'sketch-legend', 'aria-hidden': 'true' }, [
      h('span', { class: 'sketch-key' }, [h('span', { class: 'sketch-swatch is-dashed' }), opts.words.sketch]),
      opts.curve ? h('span', { class: 'sketch-key' }, [h('span', { class: 'sketch-swatch', style: { borderColor: 'var(--' + color + ')' } }), opts.words.cell]) : null,
    ]);
    opts.host.appendChild(wrap);
    opts.host.appendChild(key);
    const plot = new Plot({ canvas, scale: 'fixed', min: 0, max: 2000, extendStep: 500, yStep: 500, xStep: 300, xLabel: opts.words.x, yLabel: opts.words.y });
    const draw = () => {
      plot.resize();
      plot.setOverlay(toSeconds(opts.sketch || []), { color: 'muted', dash: [6, 5], width: 2 });
      const m = model(20 * 60, opts.schedule || []);
      if (opts.curve && opts.curve.length) {
        const n = opts.curve.length, stepS = (opts.step || 0.25) * 60;
        m.ticks = new Int32Array(n); m.series[0].data = new Float64Array(n);
        for (let i = 0; i < n; i++) { m.ticks[i] = Math.round(i * stepS); m.series[0].data[i] = opts.curve[i]; }
        m.count = n; m.nSeries = 1; m.series[0].color = color; m.series[0].live = opts.curve[n - 1]; m.t1 = (n - 1) * stepS;
      }
      plot.draw(m);
    };
    draw();
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(draw); ro.observe(wrap); }
    return { plot, redraw: draw, destroy() { if (ro) ro.disconnect(); } };
  }

  Sketch.chart = chart;
  Sketch.columnsStroke = columnsStroke;
  Sketch.COLS = COLS;
  Sketch.SLIDER_T = SLIDER_T;
  return Sketch;
});
