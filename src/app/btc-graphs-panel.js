// @deps btc-content btc-format btc-layout btc-palette btc-plot
/*
 * Be the Cell: the graphs panel (LAB_UI §5): small linked time-series plots
 * from the Recorder, and a bar of what the ATP is being spent on right now.
 *
 * Gene chips choose up to three genes for the mRNA and protein plots; a
 * fourth choice drops the oldest. Dashed lines mark divisions, small ticks
 * mark commands, and drug intervals are shaded. A horizontal drag scrubs all
 * plots together; a tap enlarges one.
 *
 * On a tiered screen (docs/PROLOGUE.md §5) the pane holds the single simple graph instead
 * (BTC.SimpleGraph): no chips, no lin/log, no window row and no spending bar, which come back
 * with "All controls".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'),
      require('./btc-palette.js'), require('./btc-plot.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.GraphsPanel = factory(B.content, B.format, B.layout, B.palette, B.Plot);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY, PAL, Plot) {
  'use strict';

  const G = C.graphs;
  const LN2 = 0.6931471805599453;
  const FPS_S = 1 / 15;             // at most 15 redraws per second while running
  const RECENT_MAX_S = 21600;       // windows up to 6 h read the full-resolution recent recorder
  const SPEND_NONE = 0.01;          // under 1% of a steady cell's ATP turnover, the spending bar is hidden
  const NBSP = '\u00a0';

  /** ATP in mM: two significant figures, and "< 0.01 mM" for a cell that has run out. */
  const atpText = (x) => (x < 0.01 ? G.atpBelow : F.sig2(x) + ' mM');

  // What each plot shows (LAB_UI §5.2).
  const SPECS = [
    { key: 'mRNA', title: G.plots.mRNA, multi: true, channel: 'mRNA:', scale: 'lin', log: true },
    { key: 'protein', title: G.plots.protein, multi: true, channel: 'protein:', scale: 'lin', log: true },
    { key: 'atp', title: G.plots.atp, channel: 'ATP_mM', scale: 'fixed', min: 0, max: 4, color: 'atp',
      band: { below: 1.05, label: G.low }, live: (v) => v.energy.ATP_mM, fmt: atpText },
    { key: 'size', title: G.plots.size, channel: 'V_fL', scale: 'fixed', min: 0, max: 2.5, color: 'membrane',
      live: (v) => v.cell.V_fL, fmt: (x) => F.sig2(x) + ' fL' },
    { key: 'growth', title: G.plots.growth, channel: 'growth_dph', scale: 'fixed', min: 0, max: 1.5, extendStep: 0.5,
      color: 'good', live: (v) => v.cell.lambdaEMA_perH / LN2, fmt: (x) => F.sig2(x) + NBSP + 'per' + NBSP + 'h' },
  ];

  const LEDGER_ORDER = ['translation', 'otherBuilding', 'upkeep', 'transcription', 'aaMaking', 'transport'];

  class GraphsPanel {
    constructor(app) {
      this.app = app;
      this.visible = false;
      this.since = 1;
      this.scrubT = -1;
      this.plots = [];
      this.model = {
        ticks: null, count: 0, dt: 1, t0: 0, t1: 0, window: 3600, nSeries: 0, scrubT: -1,
        series: [0, 1, 2].map(() => ({ data: null, live: 0, color: 'ink', label: '' })),
        markers: null, bands: null, gutterL: 0, gutterR: 0,
      };
      this.gut = { left: 0, right: 0 };
      const PV = app.BTC.params.values();
      this.spendRef = PV.fermYield * PV.F_ref;      // ATP per second of the reference cell (engine spec §9)
    }

    /** The screen's gene model (the app's; everything named when there is none). */
    genes() {
      const app = this.app;
      return app.geneModel || app.BTC.content.geneModel(app.cell.observe().genes.map((g) => g.id), app.labConfig);
    }

    /** The recorder behind the current window: full resolution for windows up to 6 h, the whole run for "All". */
    recorder() {
      const w = this.app.ui.window;
      return w > 0 && w <= RECENT_MAX_S && this.app.recRecent ? this.app.recRecent : this.app.rec;
    }

    mount(root) {
      const h = LY.h, app = this.app;
      this.root = root;
      if (app.tierUI && app.tierUI.graph && app.BTC.SimpleGraph) {
        this.simple = new app.BTC.SimpleGraph(app, app.tierUI);
        this.simple.mount(root);
        return;
      }
      // Gene chips.
      this.chips = {};
      const chipRow = h('div', { class: 'chip-row', role: 'group', 'aria-label': G.genesLabel });
      // One chip per visible gene, in the screen's display order; background genes get no chip.
      const model = this.genes();
      for (const id of model.visible) {
        const w = model.words(id);
        const b = h('button', { class: 'chip gene-toggle', type: 'button', 'aria-pressed': 'false', 'data-gene': id, onclick: () => app.toggleGraphGene(id),
          'aria-label': w.name }, [
          h('span', { class: 'chip-dot', style: { background: 'var(--' + model.color(id) + ')' } }), h('span', { class: 'sym-plain', text: w.tag }),
        ]);
        this.chips[id] = b;
        chipRow.appendChild(b);
      }
      // Window.
      this.windowCtrl = segmentedLocal(G.window, G.windows.map((x) => ({ key: String(x.s), label: x.label })), (k) => app.setWindow(Number(k)));
      // Size | Growth swap (wide only).
      this.swapCtrl = segmentedLocal(G.plots.size, G.sizeOrGrowth, (k) => { app.ui.plot4 = k; app.savePrefs(); this.applySwap(); this.redraw(); });
      this.swapCtrl.el.classList.add('swap-ctrl');
      // A level with its own fixed window (1.2: the 20-min test run, the whole 24-min run) hides the window choice.
      const gw = app.labConfig.graphWindow;
      const fixedWindow = !!gw && !G.windows.some((x) => x.s === gw);
      const winRow = h('div', { class: 'window-row' }, [h('span', { class: 'ctl-label inline', text: G.window }), this.windowCtrl.el, this.swapCtrl.el]);
      if (fixedWindow) { this.windowCtrl.el.hidden = true; winRow.firstChild.hidden = true; }
      this.fixedWindow = fixedWindow;
      root.appendChild(h('div', { class: 'graph-controls' }, [chipRow, winRow]));
      const grid = h('div', { class: 'plot-grid' });
      root.appendChild(grid);
      // A level may show fewer plots, in its own order (1.2's demo: Protein above mRNA).
      const want = app.labConfig.plots;
      const specs = Array.isArray(want) ? want.map((k) => SPECS.find((x) => x.key === k)).filter(Boolean) : SPECS;
      const yBand = app.labConfig.yBand;
      for (const spec of specs) {
        const canvas = h('canvas', { class: 'plot-canvas' });
        const value = h('span', { class: 'plot-value num' });
        const head = h('div', { class: 'plot-head' }, [h('div', { class: 'plot-titles' }, [h('span', { class: 'plot-title', text: spec.title }), value])]);
        const box = h('figure', { class: 'plot', 'data-plot': spec.key }, [head, h('div', { class: 'plot-canvas-wrap' }, canvas)]);
        let logCtrl = null;
        if (spec.log) {
          logCtrl = segmentedLocal(spec.title, [{ key: 'lin', label: G.lin }, { key: 'log', label: G.log }], (k) => {
            app.ui.logScales[spec.key] = k === 'log'; app.savePrefs(); this.syncControls(); this.redraw();
          });
          logCtrl.el.classList.add('lin-log');
          head.appendChild(logCtrl.el);
        }
        const plot = new Plot({ canvas, scale: spec.scale, min: spec.min, max: spec.max, extendStep: spec.extendStep, band: spec.band, labelGutter: spec.multi });
        if (yBand && yBand.plot === spec.key) plot.setYBand({ lo: yBand.lo, hi: yBand.hi, label: yBand.label });
        const entry = { spec, plot, box, value, logCtrl, canvas };
        this.attachPointer(entry);
        this.plots.push(entry);
        grid.appendChild(box);
      }
      // ATP spending now: a 100% stacked bar with direct labels.
      this.bar = h('div', { class: 'spend-bar', role: 'img' });
      this.barLabels = h('div', { class: 'spend-labels' });
      this.barSmall = h('div', { class: 'spend-small' });
      this.barEmpty = h('p', { class: 'spend-empty', text: G.spendingEmpty, hidden: true });
      this.barNone = h('p', { class: 'spend-empty', text: G.spendingNone, hidden: true });
      this.segs = LEDGER_ORDER.map((name, i) => {
        const seg = h('span', { class: 'spend-seg' + (name === 'translation' ? ' hatch' : ''), style: { background: 'var(--ledger-' + i + ')' } });
        const lab = h('span', { class: 'spend-in' });
        seg.appendChild(lab);
        this.bar.appendChild(seg);
        return { name, seg, lab, small: h('span', { class: 'spend-item' }, [h('span', { class: 'swatch' + (name === 'translation' ? ' hatch' : ''), style: { background: 'var(--ledger-' + i + ')' } }), h('span', { class: 'spend-text' })]) };
      });
      this.segs.forEach((s) => this.barSmall.appendChild(s.small));
      // The spending bar: shown in the M1 lab and in a tier that asks for it (spendBar), never in an earlier tier.
      const spendOff = (Array.isArray(want) && want.indexOf('spending') < 0) || (!!app.tierUI && !app.tierUI.spendBar);
      const spendFig = h('figure', { class: 'plot spend', 'data-plot': 'spending', hidden: spendOff }, [
        h('div', { class: 'plot-head' }, [h('span', { class: 'plot-title', text: G.plots.spending })]),
        this.bar, this.barEmpty, this.barNone, this.barSmall,
      ]);
      root.appendChild(spendFig);
      void this.barLabels;
      this.syncControls();
      this.applySwap();
    }

    /** Linked scrub (horizontal drag) and tap-to-enlarge; vertical drags still scroll the panel. */
    attachPointer(entry) {
      const cv = entry.canvas;
      let down = null, scrubbing = false;
      cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; scrubbing = false; });
      cv.addEventListener('pointermove', (e) => {
        if (!down || e.pointerId !== down.id) return;
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!scrubbing) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { down = null; return; }
          if (Math.abs(dx) < 8) return;
          scrubbing = true;
          try { cv.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        }
        const r = cv.getBoundingClientRect();
        this.setScrub(entry.plot.timeAt(e.clientX - r.left));
      });
      const end = (e, cancelled) => {
        if (!down || e.pointerId !== down.id) return;
        const wasScrub = scrubbing;
        down = null; scrubbing = false;
        if (wasScrub) {
          clearTimeout(this.scrubTimer);
          this.scrubTimer = setTimeout(() => this.setScrub(-1), 3000);   // readout stays 3 s (UI chrome)
        } else if (!cancelled) {
          if (this.scrubT >= 0) this.setScrub(-1);
          else this.enlarge(entry.spec);
        }
      };
      cv.addEventListener('pointerup', (e) => end(e, false));
      cv.addEventListener('pointercancel', (e) => end(e, true));
    }

    setScrub(t) {
      this.scrubT = t;
      this.redraw();
    }

    applySwap() {
      if (this.simple) return;
      const wide = this.app.layout === 'wide';
      const which = this.app.ui.plot4 === 'growth' ? 'growth' : 'size';
      const both = this.plots.some((p) => p.spec.key === 'size') && this.plots.some((p) => p.spec.key === 'growth');
      for (const p of this.plots) {
        const hide = both && wide && ((p.spec.key === 'size' && which !== 'size') || (p.spec.key === 'growth' && which !== 'growth'));
        p.box.hidden = hide;
      }
      this.swapCtrl.el.hidden = !wide || !both;
      this.swapCtrl.update(which);
      const row = this.swapCtrl.el.parentNode;
      if (row && this.fixedWindow) row.hidden = this.swapCtrl.el.hidden;
    }

    /** A curve over one plot (1.2: the student's sketch over the Protein plot): points [[t_s, y]]; null clears. */
    setOverlay(key, points, style) {
      if (this.simple) return;
      const p = this.plots.find((x) => x.spec.key === key);
      if (!p) return;
      p.plot.setOverlay(points, style);
      p.overlay = { points, style };
      this.redraw();
    }

    syncControls() {
      if (this.simple) { this.simple.redraw(); return; }
      const app = this.app;
      for (const id of Object.keys(this.chips)) {
        const on = app.ui.graphGenes.indexOf(id) >= 0;
        this.chips[id].setAttribute('aria-pressed', on ? 'true' : 'false');
        this.chips[id].classList.toggle('is-on', on);
      }
      this.windowCtrl.update(String(app.ui.window));
      for (const p of this.plots) if (p.logCtrl) p.logCtrl.update(app.ui.logScales[p.spec.key] ? 'log' : 'lin');
    }

    setVisible(v) { this.visible = v; if (this.simple) this.simple.setVisible(v); else if (v) this.redraw(); }
    redraw() { if (this.simple) { this.simple.redraw(); return; } this.dirty = true; this.app.requestPaint(); }

    /** Every frame: redraws at most 15 fps while running, on change while paused, never while hidden. */
    render(dtReal, stepped, force) {
      if (this.simple) { this.simple.render(dtReal, stepped, force); return; }
      if (!this.visible) return;
      this.since += dtReal;
      if (!force && !this.dirty && !(stepped && this.since >= FPS_S)) return;
      this.since = 0;
      this.dirty = false;
      this.drawAll();
    }

    drawAll() {
      const app = this.app, rec = this.recorder(), view = app.cell.observe(), m = this.model;
      m.ticks = rec.ticks; m.count = rec.count; m.dt = view.scale.dt_s;
      m.t1 = view.t_s;
      const win = app.ui.window;
      const first = rec.count ? rec.ticks[0] * m.dt : m.t1;
      // A window that is not yet full starts at the first sample, with room to the right.
      if (win > 0) { m.t0 = Math.max(first, m.t1 - win); m.tEnd = m.t0 + win; }
      else { m.t0 = first; m.tEnd = Math.max(m.t1, first + 60); }
      m.window = m.tEnd - m.t0;
      m.markers = app.markers; m.bands = app.bandsFor(view.tick);
      m.scrubT = this.scrubT;
      // One pair of side gutters for every plot, so the stacked plots share one time axis.
      let gl = 0, gr = 0;
      for (const p of this.plots) {
        if (p.box.hidden) continue;
        p.plot.resize();
        p.plot.log = !!app.ui.logScales[p.spec.key];
        this.fillSeries(p.spec, view);
        p.plot.gutters(m, this.gut);
        if (this.gut.left > gl) gl = this.gut.left;
        if (this.gut.right > gr) gr = this.gut.right;
      }
      for (const p of this.plots) {
        if (p.box.hidden) continue;
        this.fillSeries(p.spec, view);
        m.gutterL = gl; m.gutterR = gr;
        p.plot.opts.xStep = m.window <= 1800 ? 300 : 0;          // 5-min ticks on a level's short fixed window
        p.plot.draw(m);
        LY.setText(p.value, this.valueText(p.spec, view));
      }
      if (this.sheetPlot) {
        const sp = this.sheetPlot;
        sp.plot.resize();
        sp.plot.log = !!app.ui.logScales[sp.spec.key];
        this.fillSeries(sp.spec, view);
        m.gutterL = undefined; m.gutterR = undefined;     // the enlarged plot sets its own
        sp.plot.draw(m);
        LY.setText(sp.value, this.valueText(sp.spec, view));
      }
      this.drawSpending(view);
    }

    fillSeries(spec, view) {
      const m = this.model, rec = this.recorder();
      if (spec.multi) {
        const genes = this.app.ui.graphGenes;
        m.nSeries = genes.length;
        for (let s = 0; s < genes.length; s++) {
          const id = genes[s], gv = view.geneById[id], ser = m.series[s];
          if (!gv) continue;
          ser.data = rec.series(spec.channel + id);
          ser.live = spec.key === 'mRNA' ? gv.mRNA + gv.nascent : gv.protein;
          ser.color = this.genes().color(id);
          ser.label = this.genes().words(id).tag + ' ' + F.count(ser.live);
        }
      } else {
        m.nSeries = 1;
        const ser = m.series[0];
        ser.data = rec.series(spec.channel);
        ser.live = spec.live(view);
        ser.color = spec.color;
        ser.label = '';
      }
    }

    /** The HTML value over the plot: the live value, or every series at the scrub time. */
    valueText(spec, view) {
      const m = this.model;
      const at = this.scrubT >= 0 ? this.sampleAt(this.scrubT) : -1;
      const pieces = [];
      for (let s = 0; s < m.nSeries; s++) {
        const ser = m.series[s];
        const v = at >= 0 ? ser.data[at] : ser.live;
        if (spec.multi) {
          const id = this.app.ui.graphGenes[s];
          pieces.push(this.genes().words(id).tag + ' ' + F.count(v));
        } else pieces.push(spec.fmt(v));
      }
      const prefix = at >= 0 ? F.clock(this.recorder().ticks[at] * m.dt, false) + ': ' : '';
      void view;
      return pieces.length ? '· ' + prefix + pieces.join(', ') : '';
    }

    sampleAt(t) {
      const rec = this.recorder(), m = this.model;
      if (!rec.count) return -1;
      let i = Plot.lowerBound(rec.ticks, rec.count, Math.floor(t / m.dt));
      if (i >= rec.count) i = rec.count - 1;
      if (i > 0 && Math.abs(rec.ticks[i - 1] * m.dt - t) < Math.abs(rec.ticks[i] * m.dt - t)) i--;
      return i;
    }

    drawSpending(view) {
      const L = view.ledger;
      let sum = 0, total = 0;
      for (let i = 0; i < 6; i++) { sum += L.fractions[i]; total += L.perS[i]; }
      const empty = !(sum > 0);
      // Shares of almost nothing would look like a busy cell: below 1% of a steady cell's spending, say so instead.
      const none = !empty && total < SPEND_NONE * this.spendRef;
      this.barEmpty.hidden = !empty;
      this.barNone.hidden = !none;
      this.bar.hidden = empty || none;
      this.barSmall.hidden = empty || none;
      if (empty || none) {
        const label = G.plots.spending + ': ' + (none ? G.spendingNone : G.spendingEmpty);
        if (this.bar.getAttribute('aria-label') !== label) this.bar.setAttribute('aria-label', label);
        return;
      }
      const parts = [];
      for (const s of this.segs) {
        const f = L.fractions[L.names.indexOf(s.name)] / sum;
        const w = (f * 100).toFixed(2) + '%';
        if (s.seg.style.width !== w) s.seg.style.width = w;
        const text = G.ledger[s.name] + ' ' + F.pct(f);
        // Wide segments carry their label inside; narrow ones (< 8%) go to the line below.
        const inside = f >= 0.08;
        LY.setText(s.lab, inside ? F.pct(f) : '');
        s.small.hidden = false;
        LY.setText(s.small.lastChild, text);
        parts.push(text);
      }
      const label = G.plots.spending + ': ' + parts.join(', ');
      if (this.bar.getAttribute('aria-label') !== label) this.bar.setAttribute('aria-label', label);
    }

    /** Full-screen sheet with one plot (tap without drag). */
    enlarge(spec) {
      const h = LY.h;
      LY.openSheet({
        title: spec.title, className: 'plot-sheet',
        build: (body) => {
          const canvas = h('canvas', { class: 'plot-canvas big' });
          const value = h('span', { class: 'plot-value num' });
          body.appendChild(h('div', { class: 'plot-head' }, [value]));
          body.appendChild(h('div', { class: 'plot-canvas-wrap big' }, canvas));
          const plot = new Plot({ canvas, scale: spec.scale, min: spec.min, max: spec.max, extendStep: spec.extendStep, band: spec.band, labelGutter: spec.multi });
          this.sheetPlot = { spec, plot, value };
          requestAnimationFrame(() => { this.dirty = true; this.render(0, false, true); });
        },
        onClose: () => { this.sheetPlot = null; },
      });
    }

    /** Scrolls a plot into view (status strip taps). */
    reveal(key) {
      if (this.simple) { this.simple.redraw(); return; }
      const p = this.plots.find((x) => x.spec.key === key);
      if (!p) return;
      if (p.box.hidden && this.app.layout === 'wide' && (key === 'growth' || key === 'size')) {
        this.app.ui.plot4 = key; this.applySwap();
      }
      p.box.scrollIntoView({ block: 'nearest' });
      this.redraw();
    }
  }

  /** A small local segmented control (window, lin|log, size|growth): UI state, not commands. */
  function segmentedLocal(label, options, onSelect) {
    const h = LY.h;
    const el = h('div', { class: 'seg-group small', role: 'radiogroup', 'aria-label': label });
    const buttons = options.map((o) => {
      const b = h('button', { class: 'seg', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-key': o.key }, o.label);
      b.addEventListener('click', () => onSelect(o.key));
      el.appendChild(b);
      return b;
    });
    return {
      el,
      update(key) {
        buttons.forEach((b, i) => {
          const on = options[i].key === key;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      },
    };
  }

  GraphsPanel.SPECS = SPECS;
  return GraphsPanel;
});
