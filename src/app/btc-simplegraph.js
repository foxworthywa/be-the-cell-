// @deps btc-content btc-format btc-layout btc-palette btc-plot btc-tiers
/*
 * Be the Cell: the single simple graph of a tiered screen (docs/PROLOGUE.md §5.1, §5.3): one or two
 * lines (a gene's protein or mRNA over time), a dashed target line, a shaded "enough" zone with its
 * edges named, and a level's marks ("milk arrives"). No gene chips, no lin/log, no window row, no
 * spending bar: those come with "All controls" or a later tier.
 *
 * It draws from the app's whole-run recorder, on a time axis from the start of the run to the graph's
 * window ('fit': the run so far, at least 10 minutes), with BTC.Plot. Command marks stay (the switch
 * was flipped here); division lines do not (they belong to later tiers).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'),
      require('./btc-palette.js'), require('./btc-plot.js'), require('./btc-tiers.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.SimpleGraph = factory(B.content, B.format, B.layout, B.palette, B.Plot, B.tiers);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY, PAL, Plot, TI) {
  'use strict';

  const FPS_S = 1 / 15;
  const MIN_FIT_S = 600;
  const MARK_CAP = 64;

  /** Tick spacing (s) for a time axis of span s: 5 min up to half an hour, 10 min up to 2 h, then hours. */
  const stepFor = (span) => (span <= 1800 ? 300 : span <= 7200 ? 600 : 3600);

  /**
   * The time axis of a graph (pure): 'fit' runs from 0 to a little past the run so far (at least 10 min); a number
   * is a fixed axis from 0. The end is kept clear of the last tick, so its label never runs into the unit ("10min").
   * → {t0, tEnd, step}.
   */
  function axis(window, t1) {
    let end = typeof window === 'number' && window > 0 ? Math.max(window, t1) : Math.max(MIN_FIT_S, t1 * 1.15);
    const step = stepFor(end);
    const last = Math.floor(end / step) * step;
    if (end - last < 0.3 * step) end = last + 0.3 * step;
    return { t0: 0, tEnd: end, step };
  }

  class SimpleGraph {
    /** ui: the screen's normalised ui (its graph is not null). */
    constructor(app, ui) {
      this.app = app;
      this.ui = ui;
      this.visible = false;
      this.since = 1;
      this.model = {
        ticks: null, count: 0, dt: 1, t0: 0, t1: 0, tEnd: 0, window: 0, nSeries: 0, scrubT: -1,
        series: [0, 1].map(() => ({ data: null, live: 0, color: 'ink', label: '' })),
        markers: { n: 0, tick: new Int32Array(MARK_CAP), kind: new Uint8Array(MARK_CAP), prio: new Uint8Array(MARK_CAP), label: new Array(MARK_CAP).fill('') },
        bands: { n: 0, t0: [], t1: [], color: [], label: [] },
      };
    }

    /** The genes of the lines ('focus' is the focus gene). */
    genes() {
      const app = this.app;
      return this.ui.graph.series.map((s) => ({ gene: s.gene === 'focus' ? app.focusGene : s.gene, kind: s.kind }));
    }

    mount(root) {
      const h = LY.h, g = this.ui.graph;
      this.root = root;
      this.title = h('span', { class: 'plot-title sg-title' });
      this.value = h('span', { class: 'plot-value num' });
      this.canvas = h('canvas', { class: 'plot-canvas sg-canvas', role: 'img' });
      const keys = [];
      if (g.target) keys.push(h('span', { class: 'sg-key' }, [h('span', { class: 'sketch-swatch is-dashed sg-swatch-target', 'aria-hidden': 'true' }), h('span', { text: g.target.label })]));
      if (g.zone) {
        const lab = (g.zone.labels && g.zone.labels.inside) || '';
        keys.push(h('span', { class: 'sg-key' }, [h('span', { class: 'sg-swatch-zone', 'aria-hidden': 'true' }), h('span', { text: lab })]));
      }
      this.keys = h('div', { class: 'sg-keys', hidden: !keys.length }, keys);
      this.empty = h('p', { class: 'sheet-note sg-empty', text: C.tiers.graph.empty, hidden: true });
      this.fig = h('figure', { class: 'plot sg-figure', 'data-plot': 'simple' }, [
        h('div', { class: 'plot-head' }, [h('div', { class: 'plot-titles' }, [this.title, this.value])]),
        h('div', { class: 'plot-canvas-wrap sg-wrap' }, this.canvas),
        this.keys, this.empty,
      ]);
      root.appendChild(this.fig);
      this.plot = new Plot({ canvas: this.canvas, scale: 'lin', labelGutter: g.series.length > 1 });
      if (g.zone) this.plot.setYBand({ lo: g.zone.lo, hi: g.zone.hi, label: (g.zone.labels && g.zone.labels.inside) || '' });
    }

    setVisible(v) { this.visible = v; if (v) this.redraw(); }
    redraw() { this.dirty = true; this.app.requestPaint(); }

    render(dtReal, stepped, force) {
      if (!this.visible) return;
      this.since += dtReal;
      if (!force && !this.dirty && !(stepped && this.since >= FPS_S)) return;
      this.since = 0;
      this.dirty = false;
      this.draw();
    }

    draw() {
      const app = this.app, g = this.ui.graph, rec = app.rec, view = app.cell.observe(), m = this.model;
      const model = app.geneModel;
      m.ticks = rec.ticks; m.count = rec.count; m.dt = view.scale.dt_s; m.t1 = view.t_s;
      const ax = axis(g.window, m.t1);
      m.t0 = ax.t0; m.tEnd = ax.tEnd; m.window = ax.tEnd - ax.t0;
      const lines = this.genes();
      m.nSeries = lines.length;
      const pieces = [];
      lines.forEach((ln, s) => {
        const gv = view.geneById[ln.gene], ser = m.series[s];
        ser.data = rec.series((ln.kind === 'mRNA' ? 'mRNA:' : 'protein:') + ln.gene);
        ser.live = gv ? (ln.kind === 'mRNA' ? gv.mRNA + gv.nascent : gv.protein) : 0;
        ser.color = model ? model.color(ln.gene) : 'accent';
        const noun = model ? (ln.kind === 'mRNA' ? C.tiers.counters.mRNA : TI.proteinsWord(model, ln.gene)) : ln.gene;
        ser.label = lines.length > 1 ? noun + ' ' + F.count(ser.live) : '';
        pieces.push((lines.length > 1 ? noun + ' ' : '') + F.count(ser.live));
      });
      const first = lines[0];
      const noun = model ? (first.kind === 'mRNA' ? C.tiers.counters.mRNA : TI.proteinsWord(model, first.gene)) : first.gene;
      LY.setText(this.title, lines.length > 1 ? C.tiers.graph.twoTitle : F.fill(C.tiers.graph.title, { Proteins: noun }));
      LY.setText(this.value, '· ' + pieces.join(', '));
      this.canvas.setAttribute('aria-label', this.title.textContent + ': ' + pieces.join(', '));
      this.fillMarkers(view);
      m.bands = g.bands ? app.bandsFor(view.tick) : { n: 0 };
      this.plot.setOverlay(g.target ? [[0, g.target.y], [Math.max(m.tEnd, m.t1) * 2, g.target.y]] : null, { color: 'ink', dash: [7, 5], width: 1.5 });
      this.plot.opts.xStep = ax.step;
      this.plot.opts.xUnit = ax.step >= 3600 ? 'h' : 'min';
      this.plot.resize();
      this.plot.draw(m);
      this.empty.hidden = view.tick > 0;
    }

    /** The level's marks (a dashed line and its label) and the app's command marks; no division lines. */
    fillMarkers(view) {
      const src = this.app.markers, mk = this.model.markers, dt = view.scale.dt_s;
      mk.n = 0;
      const add = (tick, kind, label, prio) => {
        if (mk.n >= MARK_CAP) return;
        mk.tick[mk.n] = tick; mk.kind[mk.n] = kind; mk.prio[mk.n] = prio; mk.label[mk.n] = label; mk.n++;
      };
      for (const x of this.ui.graph.marks || []) {
        const t = Math.round(x.t / dt);
        add(t, 1, '', 0);
        add(t, 3, x.label, 4);
      }
      for (let k = 0; k < src.n; k++) if (src.kind[k] === 2) add(src.tick[k], 2, src.label[k], src.prio[k]);
    }
  }

  SimpleGraph.axis = axis;
  return SimpleGraph;
});
