// @deps btc-palette btc-layout btc-format btc-geneview btc-machine
/*
 * Be the Cell: the zoom control and the close-ups on the stage (docs/PROLOGUE.md §3.1).
 *
 * Three zoom levels share the lab's (and every level's) stage: Cell (the cell view, unchanged),
 * Gene (BTC.GeneView of a BTC.closeup gene plan) and Protein (BTC.MachineView). The control is a
 * three-segment overlay at the top left of the stage (3 × 64 × 44 px); pinch on the stage steps
 * one level (spread past ×1.25 closer, pinch past ×0.8 out; the drawing follows up to ×1.3 while
 * the fingers move); + and − on a keyboard; "Look closer ›" under the tap chip in Cell zoom.
 *
 * Zoom is UI state: not a command, not logged by the engine, and it never pauses the run. The
 * lab keeps it in btc.ui.v1 (ui.zoom); a level keeps it on app.level.zoom, and labConfig.ui.zoom
 * (or labConfig.zoom) = {levels, initial} sets which levels a screen allows and where it opens.
 *
 * The close-ups draw on their own canvas over the cell's; while one is shown the cell view is
 * not drawn (app.render asks render() first). Close-ups run at ≤ 30 fps while time runs and draw
 * only on change while paused. Every glyph comes from the engine's view and cell.detail().
 *
 * API (app.views.zoom): get(), set(level, via), allowed(), onChange(fn), watchCopy(id), watchNewest(),
 * watchState(), clearWatch(), rules(levelRules) (the close-up narrator rules), plan() / model() (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-palette.js'), require('./btc-layout.js'), require('./btc-format.js'),
      require('./btc-geneview.js'), require('./btc-machine.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.ZoomControl = factory(B.palette, B.layout, B.format, B.GeneView, { MachineView: B.MachineView, art: B.machineArt, MachineCard: B.MachineCard });
  }
})(typeof self !== 'undefined' ? self : this, function (PAL, LY, F, GeneView, MV) {
  'use strict';

  const LEVELS = ['cell', 'gene', 'protein'];
  const PINCH_IN = 1.25, PINCH_OUT = 0.8, FOLLOW_MAX = 1.3, FOLLOW_MIN = 0.77;
  const MIN_GAP = 1 / 30;

  const CSS = [
    '#closeup-canvas{position:absolute;inset:0;display:block;touch-action:none;transition:opacity .25s ease;}',
    '#closeup-canvas.is-hidden{display:none;}',
    '#cell-canvas{touch-action:none;}',
    '#stage.is-pinching canvas{transition:none;}',
    'body[data-reduced-motion] #closeup-canvas{transition:none;}',
    '.zoom-seg{position:absolute;z-index:3;top:6px;left:6px;display:flex;border-radius:10px;overflow:hidden;',
    'border:1px solid var(--line);background:var(--panel);background:color-mix(in srgb,var(--panel) 90%,transparent);}',
    '.zoom-seg button{width:64px;height:44px;border:0;padding:0;background:none;color:var(--ink);font-size:14px;font-weight:600;}',
    '.zoom-seg button+button{border-left:1px solid var(--line);}',
    '.zoom-seg button.is-on{background:var(--accent);color:var(--accent-ink);}',
    '.zoom-seg button:disabled{color:var(--muted);opacity:.5;}',
    '.zoom-summary{position:absolute;z-index:2;top:8px;right:8px;max-width:calc(100% - 222px);text-align:right;font-size:13px;line-height:1.25;',
    'color:var(--ink);padding:2px 6px;border-radius:6px;background:var(--panel);background:color-mix(in srgb,var(--panel) 88%,transparent);pointer-events:none;}',
    '.zoom-caption{position:absolute;z-index:2;left:8px;right:8px;bottom:50px;font-size:15px;line-height:1.3;color:var(--ink);pointer-events:none;',
    'display:flex;flex-direction:column;align-items:flex-start;gap:2px;}',
    '.zoom-caption.is-side{right:auto;max-width:42%;bottom:50px;}',
    '.zoom-caption span{padding:1px 6px;border-radius:6px;background:var(--panel);background:color-mix(in srgb,var(--panel) 88%,transparent);}',
    '.zoom-caption .zc-sub{font-size:13px;color:var(--muted);}',
    '.zoom-scale{position:absolute;z-index:2;right:10px;bottom:10px;display:flex;align-items:flex-end;gap:6px;font-size:12px;color:var(--muted);pointer-events:none;}',
    '.zoom-scale .zs-label{padding:0 4px;border-radius:4px;background:var(--panel);}',
    '.zoom-scale .zs-bar{display:block;height:3px;background:var(--ink);border-radius:2px;opacity:.75;}',
    '.zoom-note{position:absolute;z-index:2;right:10px;bottom:30px;font-size:12px;color:var(--muted);font-style:italic;pointer-events:none;',
    'padding:0 4px;border-radius:4px;background:var(--panel);background:color-mix(in srgb,var(--panel) 85%,transparent);max-width:60%;text-align:right;}',
    '.btn.zoom-act{position:absolute;z-index:4;min-height:44px;min-width:44px;padding:0 12px;font-size:14px;font-weight:600;',
    'border-color:var(--accent);color:var(--accent);background:var(--panel);box-shadow:0 2px 8px rgba(0,0,0,.15);}',
    '.btn.zoom-extra{position:absolute;z-index:3;right:8px;top:56px;min-height:44px;padding:0 12px;font-size:14px;background:var(--panel);}',
    'body[data-zoom="gene"] #scalebar,body[data-zoom="protein"] #scalebar,body[data-zoom="gene"] #outside-scale,',
    'body[data-zoom="protein"] #outside-scale,body[data-zoom="gene"] #lac-inset,body[data-zoom="protein"] #lac-inset{display:none !important;}',
    'body[data-zoomctl] .badges{top:56px;}',
    'body[data-zoomctl]:not([data-lac]) .outside-scale{top:56px;}',
    'body[data-zoomctl] .lac-inset{top:56px;}',
    '.machine-card{display:flex;gap:10px;align-items:center;}',
    '.machine-card .mc-pic{width:96px;height:96px;border-radius:8px;border:1px solid var(--line);flex:none;}',
    '.machine-card .mc-text{display:flex;flex-direction:column;gap:2px;font-size:14px;line-height:1.3;min-width:0;}',
    '.machine-card .mc-job{font-weight:600;}',
    '.machine-card .mc-where{color:var(--muted);font-size:13px;}',
    '.zoom-key canvas{width:32px;height:24px;flex:none;}',
  ].join('\n');

  class ZoomControl {
    constructor(app) {
      this.app = app;
      this.level = 'cell';
      this.allowedList = LEVELS.slice();
      this.lcRef = null;
      this.cellRef = null;
      this.listeners = [];
      this.geneView = new GeneView();
      this.machineView = new MV.MachineView();
      this.CU = app.BTC.closeup;
      this.gplan = this.CU.createGenePlan();
      this.pmodel = this.CU.createProteinModel();
      this.mstate = this.CU.createMachineState();
      this.detailOut = { gene: '', tick: -1, ribosomes: 0, ribosomeProgress: new Float64Array(16) };
      this.built = { tick: -1, focus: -1, w: 0, h: 0, epoch: -1, level: '', watched: -2 };
      this.tau = 0;
      this.sinceDraw = 1;
      this.dirty = true;
      this.palette = null;
      this.showPicture = false;
      this.watch = null;
      this.overlayKey = '';
      this.pinch = { ids: [], x: [0, 0], y: [0, 0], d0: 0, ratio: 1, active: false };
      this.zrules = null;
      this.zstate = { zoom: 'cell', gene: '', view: null, model: null };
      this.combo = { base: null, zoom: null, list: null };
      // Reused per frame: the drawing options, the protein plan's options, the words' change key.
      this.gopts = { P: null }; this.mopts = { labels: null }; this.popts = { speed: 1 };
      this.kArr = new Float64Array(24).fill(NaN); this.kIdx = 0; this.kDiff = true; this.kModel = null; this.kLevel = '';
    }

    // --- mount ------------------------------------------------------------------------
    mount(els) {
      const h = LY.h;
      this.els = els;
      if (!document.getElementById('btc-zoom-css')) {
        const st = document.createElement('style');
        st.id = 'btc-zoom-css';
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      const T = this.CU.TEXT;
      this.canvas = h('canvas', { id: 'closeup-canvas', class: 'is-hidden', role: 'img' });
      els.stage.insertBefore(this.canvas, els.cellCanvas.nextSibling);
      this.ctx = this.canvas.getContext('2d');
      this.seg = h('div', { class: 'zoom-seg', role: 'group', 'aria-label': T.zoom.group });
      this.btns = {};
      for (const z of LEVELS) {
        const b = h('button', { type: 'button', 'data-zoom': z, 'aria-pressed': 'false', 'aria-label': T.zoom.segLabel[z], onclick: () => this.set(z, 'segment') }, T.zoom[z]);
        this.btns[z] = b;
        this.seg.appendChild(b);
      }
      this.summary = h('div', { class: 'zoom-summary num', hidden: true });
      this.caption = h('div', { class: 'zoom-caption', hidden: true, 'aria-live': 'polite' });
      this.capMain = h('span', { class: 'zc-main' });
      this.capSub = h('span', { class: 'zc-sub' });
      this.caption.appendChild(this.capMain); this.caption.appendChild(this.capSub);
      this.scale = h('div', { class: 'zoom-scale num', hidden: true }, [h('span', { class: 'zs-label' }), h('span', { class: 'zs-bar' })]);
      this.note = h('div', { class: 'zoom-note', hidden: true });
      this.closer = h('button', { class: 'btn zoom-act', type: 'button', hidden: true, onclick: () => this.lookCloser() }, T.zoom.closerGene);
      this.extra = h('button', { class: 'btn zoom-extra', type: 'button', hidden: true, onclick: () => this.extraTap() });
      for (const el of [this.seg, this.summary, this.caption, this.note, this.scale, this.closer, this.extra]) els.stage.appendChild(el);
      document.body.toggleAttribute('data-zoomctl', true);

      // Taps: on the close-up canvas (identify), and after the cell view's own tap handler (Look closer).
      this.canvas.addEventListener('click', (e) => this.onTap(e));
      els.cellCanvas.addEventListener('click', (e) => this.afterCellTap(e));
      // The chip hides after 3 s (the cell view's timer): the Look closer button goes with it.
      if (typeof MutationObserver === 'function' && els.chip) {
        new MutationObserver(() => { if (els.chip.hidden) { this.closer.hidden = true; if (this.extra.dataset.kind === 'watch') this.extra.hidden = true; } })
          .observe(els.chip, { attributes: true, attributeFilter: ['hidden'] });
      }
      // The legend opens this zoom's key while a close-up is shown (capture on the wrapper, before the cell view's).
      if (els.stageWrap && els.legend) {
        els.stageWrap.addEventListener('click', (e) => {
          if (this.level === 'cell' || !els.legend.contains(e.target)) return;
          e.stopPropagation(); e.preventDefault();
          this.openKey();
        }, true);
      }
      // Pinch on the stage.
      const st = els.stage;
      st.addEventListener('pointerdown', (e) => this.pDown(e));
      st.addEventListener('pointermove', (e) => this.pMove(e));
      st.addEventListener('pointerup', (e) => this.pUp(e, false));
      st.addEventListener('pointercancel', (e) => this.pUp(e, true));
      st.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') this.pUp(e, true); });
      // Laptop: + and − step the zoom.
      document.addEventListener('keydown', (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('.sheet-backdrop')) return;
        const a = this.app;
        if (a.screen === 'home' || document.getElementById('app').hidden || !this.cv().visible) return;
        const t = e.target, tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.key === '+' || e.key === '=') { this.step(1, 'key'); e.preventDefault(); }
        else if (e.key === '-' || e.key === '−' || e.key === '_') { this.step(-1, 'key'); e.preventDefault(); }
      });
      this.syncControl();
    }

    cv() { return this.app.views.cellView; }

    // --- state --------------------------------------------------------------------------
    get() { return this.level; }
    allowed() { return this.allowedList.slice(); }
    onChange(fn) { this.listeners.push(fn); }

    /** Which levels this screen allows and where it opens (labConfig.ui.zoom or labConfig.zoom). */
    syncScreen() {
      const app = this.app, lc = app.labConfig || {};
      if (this.lcRef === lc && this.cellRef === app.cell) return;
      const cellChanged = this.cellRef !== app.cell;
      const screenChanged = this.lcRef !== lc;
      this.lcRef = lc;
      if (cellChanged) {
        this.cellRef = app.cell;
        this.clearWatch();
        this.gplan = this.CU.createGenePlan();
        this.geneView.reset();
        this.built.tick = -1;
      }
      if (!screenChanged) return;
      const zc = (lc.ui && lc.ui.zoom) || lc.zoom || null;
      const allowed = zc && Array.isArray(zc.levels) ? LEVELS.filter((z) => zc.levels.indexOf(z) >= 0) : LEVELS.slice();
      this.allowedList = allowed.length ? allowed : ['cell'];
      let want = 'cell';
      if (app.mode === 'lab') want = app.ui && app.ui.zoom ? app.ui.zoom : (zc && zc.initial) || 'cell';
      else if (app.level && app.level.zoom) want = app.level.zoom;
      else if (zc && zc.initial) want = zc.initial;
      if (this.allowedList.indexOf(want) < 0) want = this.allowedList[0];
      this.apply(want, null);
    }

    /** Sets the zoom level (via: 'segment' | 'pinch' | 'chip' | 'key' | 'guide' | 'level'); returns the level shown. */
    set(level, via) {
      this.syncScreen();
      if (LEVELS.indexOf(level) < 0 || this.allowedList.indexOf(level) < 0) return this.level;
      if (level === this.level) return level;
      const from = this.level;
      this.apply(level, via || 'level');
      const app = this.app;
      if (app.mode === 'lab' && app.ui) { app.ui.zoom = level; if (app.savePrefs) app.savePrefs(); }
      else if (app.level) app.level.zoom = level;
      if (app.logEvent) app.logEvent('zoom', { from, to: level, via: via || 'level' });
      for (const fn of this.listeners) { try { fn(level, from, via); } catch (e) { /* a listener's error is its own */ } }
      // The level flow (a Watch step whose act is a zoom), unless it listens through onChange already.
      if (typeof app.zoomChanged === 'function' && !app.zoomHooked) app.zoomChanged(level);
      return level;
    }

    step(dir, via) {
      const i = this.allowedList.indexOf(this.level) + dir;
      if (i >= 0 && i < this.allowedList.length) this.set(this.allowedList[i], via);
    }

    apply(level, via) {
      const was = this.level;
      this.level = level;
      document.body.setAttribute('data-zoom', level);
      const close = level !== 'cell';
      this.canvas.classList.toggle('is-hidden', !close);
      if (close && via && !this.app.reducedMotion()) {
        // A 250 ms crossfade (CSS transition on opacity).
        this.canvas.style.opacity = '0';
        requestAnimationFrame(() => { this.canvas.style.opacity = '1'; });
      } else this.canvas.style.opacity = '1';
      for (const el of [this.summary, this.caption, this.scale, this.note]) el.hidden = !close;
      this.extra.hidden = true;
      this.closer.hidden = true;
      this.showPicture = false;
      this.dirty = true;
      this.built.tick = -1;
      this.kArr.fill(NaN);
      const cv = this.cv();
      if (!close && cv) {
        // Back to the cell: its legend, label and frame are drawn afresh.
        if (cv.legendScales) cv.legendScales.fill(-1);
        cv.lastLabelKey = '';
        cv.dirty = true;
      }
      if (was !== level && this.els.chip) this.els.chip.hidden = true;
      this.app.narrTick = -1;                 // the narrator reads the new zoom's rules at once, even while paused
      this.syncControl();
      if (this.app.requestPaint) this.app.requestPaint();
    }

    syncControl() {
      for (const z of LEVELS) {
        const b = this.btns[z], on = z === this.level;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.hidden = this.allowedList.indexOf(z) < 0;
      }
      this.seg.hidden = this.allowedList.length <= 1;
    }

    // --- per frame --------------------------------------------------------------------
    /**
     * Called by app.render before the cell view. Returns false when the Cell zoom is shown (the
     * cell view draws), true when a close-up is shown (drawn here, or skipped while hidden).
     */
    render(dtReal, dtSim, force) {
      this.syncScreen();
      if (this.level === 'cell') return false;
      const app = this.app, cv = this.cv();
      if (!cv || !cv.visible) return true;
      const running = app.isRunning();
      if (running) this.tau += dtReal;
      this.sinceDraw += dtReal;
      if (running && dtSim > 0 && this.level === 'gene' && this.gplan.N) {
        this.geneView.spawn(this.gplan, app.cell.observe().genes[app.focusIndex()], dtSim, app.speed());
      }
      const P = PAL.current();
      if (P !== this.palette) { this.palette = P; this.dirty = true; }
      if (!force && !this.dirty && (!running || this.sinceDraw < MIN_GAP)) return true;
      this.fitCanvas();
      const t0 = performance.now();
      if (running) this.geneView.age(this.sinceDraw);
      if (this.level === 'gene') this.drawGene(P); else this.drawProtein(P, running ? this.sinceDraw : 0);
      this.pausedBadge(running);
      this.sinceDraw = 0;
      this.dirty = false;
      this.drawMs = performance.now() - t0;
      return true;
    }

    fitCanvas() {
      const cv = this.cv(), w = cv.cssW, h = cv.cssH, dpr = cv.dpr || 1;
      if (this.cw === w && this.ch === h && this.cdpr === dpr) return;
      this.cw = w; this.ch = h; this.cdpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.built.w = -1;
    }

    pausedBadge(running) {
      const b = this.els.pausedBadge;
      if (b && b.hidden === running) return;
      if (b) b.hidden = running;
    }

    gene() { return this.app.focusGene; }
    words(id) { const m = this.app.geneModel; return m ? m.words(id) : this.app.BTC.content.genes[id]; }
    colorTok(id) { const m = this.app.geneModel; return m ? m.color(id) : 'g-' + id; }

    // --- the Gene zoom ------------------------------------------------------------------
    rebuildGene() {
      const app = this.app, cell = app.cell, v = cell.observe(), f = app.focusIndex(), gv = v.genes[f];
      const b = this.built, epoch = v.clock.generation;
      const wid = this.watch && this.watch.alive && this.watch.gene === gv.id ? this.watch.id : -1;
      if (b.tick === v.tick && b.focus === f && b.w === this.cw && b.h === this.ch && b.epoch === epoch && b.level === 'gene' && b.watched === wid) return false;
      cell.detail(gv.id, this.detailOut);
      const wide = this.cw >= 640;
      this.CU.planGene(v, this.detailOut, { w: this.cw, h: this.ch, top: 52, bottom: 52 },
        { focus: f, maxCopies: wide ? 12 : 6, watchedId: wid, epoch }, this.gplan);
      // A copy broken down breaks up where it was (a process marker); not after a jump of many ticks (run to the end, tests).
      if (b.tick >= 0 && v.tick - b.tick <= 5 && app.isRunning()) this.geneView.spawnGone(this.gplan);
      b.tick = v.tick; b.focus = f; b.w = this.cw; b.h = this.ch; b.epoch = epoch; b.level = 'gene'; b.watched = wid;
      return true;
    }

    /** A cheap change test for the words on screen: numbers only, no allocation (kBegin, kPut…, then this.kDiff). */
    kBegin() { this.kIdx = 0; this.kDiff = this.kModel !== this.app.geneModel || this.kLevel !== this.level; this.kModel = this.app.geneModel; this.kLevel = this.level; }
    kPut(x) { const i = this.kIdx++; if (this.kArr[i] !== x) { this.kArr[i] = x; this.kDiff = true; } }

    drawGene(P) {
      const app = this.app, id = this.gene(), f = app.focusIndex();
      this.rebuildGene();
      const plan = this.gplan, T = this.CU.TEXT.gene;
      const wl = this.watch && this.watch.gene === id && this.watch.watching ? this.watch : null;
      const made = wl ? Math.round(wl.made) : -1;
      // The words (and the options the drawing reads) are rebuilt only when a number they show changes.
      this.kBegin();
      this.kPut(f); this.kPut(plan.d); this.kPut(plan.m); this.kPut(plan.n); this.kPut(plan.R); this.kPut(plan.P); this.kPut(plan.protMore);
      this.kPut(plan.ribScale); this.kPut(plan.scaleNm); this.kPut(plan.moreCopies); this.kPut(plan.moreRib); this.kPut(made);
      this.kPut(wl && wl.alive ? 1 : 0); this.kPut(plan.watchedLane); this.kPut(plan.membraneGene ? 1 : 0); this.kPut(this.cw);
      const go = this.gopts;
      if (this.kDiff || go.P !== P) {
        const v = app.cell.observe(), words = this.words(id);
        go.P = P; go.focusColor = this.colorTok(id); go.labels = T; go.inline = T.inline;
        go.geneLabel = words.symbol ? words.name + ' gene · ' + words.symbol : words.name;
        go.showPromoterLabel = true; go.shape = PAL.shape[id] || 'circle'; go.repColor = this.colorTok('lacI');
        go.moreText = plan.protMore > 0 ? F.fill(plan.membraneGene ? T.moreMembrane : T.more, { n: F.count(plan.protMore) }) : '';
        go.watched = wl && wl.alive ? { lane: plan.watchedLane, text: F.fill(T.watched, { n: F.count(made) }) } : null;
        // A transcription unit with several genes (lacZ lacY lacA): each gene's stretch of the DNA in its colour.
        const tu = v.tus && v.tus.find((u) => u.cistrons.indexOf(id) >= 0 && u.cistrons.length > 1);
        go.unitColors = tu ? tu.cistrons.map((cid) => {
          const g = v.geneById[cid];
          return [(g.cistronOffset_nt + 30) / g.unit_nt, (g.cistronOffset_nt + 30 + 3 * g.length_aa) / g.unit_nt, this.colorTok(cid)];
        }) : null;
        const summary = plan.d < plan.m ? F.fill(T.summaryCapped, { d: plan.d, m: F.count(plan.m) })
          : plan.m === 0 && plan.n > 0 ? F.fill(T.summaryMade, { r: F.count(plan.R), n: F.count(plan.n) })
            : F.fill(plan.m === 1 ? T.summaryOne : T.summary, { r: F.count(plan.R), m: F.count(plan.m) });
        // The copies not drawn (and their ribosomes) are in the summary, the canvas label and the key.
        const cap = wl && !wl.alive ? F.fill(T.watchedGone, { n: F.count(made) }) : '';
        this.moreLine = plan.moreCopies > 0 ? F.fill(plan.moreCopies === 1 ? T.moreCopy : T.moreCopies, { n: F.count(plan.moreCopies), r: F.count(Math.max(0, plan.moreRib)) }) : '';
        this.overlays(summary, cap, '', F.fill(T.scale, { nm: plan.scaleNm }), plan.scalePx, plan.ribToScale ? T.shorter : T.shorter + ' · ' + T.ribLarger,
          F.fill(T.legend, { R: plan.ribScale }));
        const label = F.fill(T.canvasLabel, { name: words.name + ' gene', m: F.count(plan.m), r: F.count(plan.R), p: F.count(plan.P) }) + (this.moreLine ? ' ' + F.capital(this.moreLine) + '.' : '');
        if (this.canvas.getAttribute('aria-label') !== label) this.canvas.setAttribute('aria-label', label);
        this.extraFor('gene');
      }
      go.reduced = app.reducedMotion();
      this.geneView.draw(this.ctx, plan, go);
    }

    // --- the Protein zoom ---------------------------------------------------------------
    drawProtein(P, dtReal) {
      const app = this.app, v = app.cell.observe(), id = this.gene();
      const T = this.CU.TEXT;
      this.popts.speed = app.speed();
      const model = this.CU.planProtein(v, id, this.popts, this.pmodel);
      const st = this.CU.machineState(model, this.tau, this.mstate, v.clock.generation);
      const wide = this.cw >= 640, M = model.machine;
      const mo = this.mopts;
      mo.w = this.cw; mo.h = this.ch; mo.top = 52; mo.bottom = wide ? 44 : 92; mo.side = wide; mo.model = model; mo.st = st; mo.P = P;
      mo.color = P[this.colorTok(id)] || P.muted; mo.reduced = app.reducedMotion(); mo.tau = this.tau; mo.strip = mo.reduced && model.working;
      mo.dtReal = dtReal; mo.showPicture = this.showPicture; mo.closeup = this.CU;
      this.kBegin();
      this.kPut(this.app.focusIndex()); this.kPut(model.count); this.kPut(model.rShown); this.kPut(model.k); this.kPut(model.none ? 1 : 0);
      this.kPut(model.working ? 1 : 0); this.kPut(model.nonfitPresent ? 1 : 0); this.kPut(model.speed); this.kPut(st.clamped ? 1 : 0);
      this.kPut(model.idle.length); this.kPut(wide ? 1 : 0);
      if (this.kDiff || !mo.labels) {
        const words = this.words(id);
        this.caption.classList.toggle('is-side', wide);
        mo.labels = {
          outside: T.gene.outside, membrane: T.gene.membrane, inside: T.gene.inside, picture: T.protein.picture, pocket: T.protein.pocket, strip: T.protein.strip,
          nonfit: M.nonfit ? F.fill(T.protein.nofitShort, { Name: F.capital(T.protein.short[M.nonfit] || M.nonfit) }) : '',
        };
        // Words: one {protein} of {count}; the rate and how much slower it is shown; or why it is idle.
        const protein = words.protein || words.name;
        const summary = model.none ? T.protein.noneYet : F.fill(T.protein.oneOf, { protein, count: F.count(model.count) });
        let cap = '', sub = '', slow = '';
        if (model.none) cap = T.protein.noneYetLine;
        else if (model.kind === 'repressor') cap = st.clamped ? T.protein.stateBound : T.protein.stateFree;
        else if (model.working) {
          cap = F.fill(T.protein.rate, { verb: T.verbs[M.verb] || T.verbs.carries, r: F.sig2(model.r), unit: T.units[M.unit] || '' });
          // At a game speed other than real time the line says both (a single molecule cannot be shown sped up with the cell).
          const sp = app.BTC.content.speeds.find((x) => x.s === model.speed), speed = sp ? sp.label : F.speedLabel(model.speed);
          const kk = model.k >= 1 ? F.count(model.k) : F.count(Math.round(1 / model.k));
          slow = model.k > 1 ? F.fill(T.protein.slower, { k: kk }) : model.k < 1 ? F.fill(T.protein.faster, { k: kk }) : T.protein.realSpeed;
          sub = model.speed === 1 ? slow : F.fill(model.k >= 1 ? T.protein.slowerCell : T.protein.fasterCell, { k: kk, speed });
        } else if (model.idle) cap = T.idle[model.idle] || '';
        const nofit = model.nonfitPresent && !model.none ? ' ' + F.fill(T.protein.doesNotFit, { Name: F.capital(T.protein.glyphs[M.nonfit] || M.nonfit) }) : '';
        if (M.standsFor > 1) sub = (sub ? sub + ' · ' : '') + F.fill(T.protein.standsFor, { n: M.standsFor, kind: T.kinds[M.standsKind] || '' });
        this.overlays(summary, cap, sub, '', 0, T.protein.flat, summary + (slow ? ' · ' + slow : ''));
        this.scaleProtein = true;
        const label = F.fill(T.protein.canvasLabel, { line: summary + '. ' + cap + (sub ? ' ' + sub : '') + nofit });
        if (this.canvas.getAttribute('aria-label') !== label) this.canvas.setAttribute('aria-label', label);
        this.extraFor('protein');
      }
      this.ctx.save();
      this.machineView.draw(this.ctx, mo);
      this.ctx.restore();
      // The scale bar follows the picture's own scale (set by draw).
      const g = this.machineView.geom;
      if (this.lastScaleNm !== g.scaleNm || this.lastScalePx !== g.scalePx) {
        this.lastScaleNm = g.scaleNm; this.lastScalePx = g.scalePx;
        LY.setText(this.scale.firstChild, g.scaleNm + ' nm');
        this.scale.lastChild.style.width = Math.round(g.scalePx) + 'px';
      }
      // The close-up narrator reads this model.
      this.zstate.model = model;
    }

    /** Overlay text and the scale bar (scaleText '' leaves the bar to the caller); DOM is written only when a word changes. */
    overlays(summary, cap, sub, scaleText, scalePx, note, legend) {
      LY.setText(this.summary, summary);
      LY.setText(this.capMain, cap); this.capMain.hidden = !cap;
      LY.setText(this.capSub, sub); this.capSub.hidden = !sub;
      this.caption.hidden = !cap && !sub;
      if (scaleText) {
        LY.setText(this.scale.firstChild, scaleText);
        this.scale.lastChild.style.width = Math.round(scalePx) + 'px';
        this.lastScaleNm = -1;
      }
      LY.setText(this.note, note);
      if (this.els.legendFull) { LY.setText(this.els.legendFull, legend); LY.setText(this.els.legendShort, legend); }
    }

    /** The row under the picture: "What does not fit?" (Protein zoom, when nothing that does not fit is present). */
    extraFor(level) {
      const T = this.CU.TEXT.protein;
      if (level === 'protein') {
        const m = this.pmodel, want = !!(m.machine && m.machine.nonfit && !m.nonfitPresent && !m.none);
        if (want) {
          if (this.extra.dataset.kind !== 'nofit') { this.extra.dataset.kind = 'nofit'; LY.setText(this.extra, T.whatNotFit); }
          if (this.extra.hidden) this.extra.hidden = false;
          this.extra.setAttribute('aria-pressed', this.showPicture ? 'true' : 'false');
        } else if (this.extra.dataset.kind === 'nofit' && !this.extra.hidden) this.extra.hidden = true;
      } else if (this.extra.dataset.kind === 'nofit' && !this.extra.hidden) this.extra.hidden = true;
    }

    extraTap() {
      const k = this.extra.dataset.kind;
      if (k === 'nofit') { this.showPicture = !this.showPicture; this.kArr.fill(NaN); this.dirty = true; this.app.requestPaint(); }
      else if (k === 'watch') {
        const id = Number(this.extra.dataset.id);
        this.watchCopy(id);
        this.extra.hidden = true;
        if (this.els.chip) this.els.chip.hidden = true;
      }
    }

    // --- the watched copy (§3.5) ----------------------------------------------------------
    /** Watches mRNA molecule `id` of the focus gene; returns true when it is alive. */
    watchCopy(id) {
      const app = this.app, W = app.BTC.MRNAWatch;
      if (!W || !app.cell) return false;
      this.syncScreen();                  // a new cell (a level's watch cell) is taken in first, so this watch survives it
      this.clearWatch();
      const w = new W(this.gene());
      if (!w.watch(app.cell, id)) return false;
      app.cell.attachRecorder(w);
      this.watch = w;
      this.watchCell = app.cell;
      this.dirty = true;
      this.built.tick = -1;
      app.requestPaint();
      return true;
    }
    /** Watches the focus gene's youngest copy (level steps: "the first copy is outlined"). */
    watchNewest() {
      const gv = this.app.cell.observe().geneById[this.gene()];
      if (!gv || !gv.mRNA) return false;
      let best = 0;
      for (let j = 1; j < gv.mRNA; j++) if (gv.mRNABirthTick[j] > gv.mRNABirthTick[best] || (gv.mRNABirthTick[j] === gv.mRNABirthTick[best] && gv.mRNAIds[j] > gv.mRNAIds[best])) best = j;
      return this.watchCopy(gv.mRNAIds[best]);
    }
    watchState() { return this.watch ? this.watch.state() : null; }
    clearWatch() {
      if (this.watch && this.watchCell) this.watchCell.detachRecorder(this.watch);
      this.watch = null; this.watchCell = null;
    }

    // --- taps ---------------------------------------------------------------------------
    /** In Cell zoom: after the cell view identified a tap, offer "Look closer ›" for a gene's copies or its proteins. */
    afterCellTap(e) {
      if (this.level !== 'cell') return;
      const cv = this.cv(), chip = this.els.chip;
      this.closer.hidden = true;
      if (!chip || chip.hidden || !cv.n) return;
      const r = cv.canvas.getBoundingClientRect();
      const i = cv.hit.nearest(e.clientX - r.left, e.clientY - r.top, 16);
      if (i < 0) return;
      const K = this.app.BTC.CellView.KINDS, kind = cv.bkind[i], gi = cv.bgene[i];
      if (gi >= cv.nGenes) return;
      const id = cv.ids[gi];
      if (!this.app.geneVisible(id)) return;
      let to = null;
      if (kind === K.LOCUS || kind === K.NASCENT || kind === K.MRNA || kind === K.MRNA_FOCUS || kind === K.POLY) to = 'gene';
      else if (kind === K.PROT) to = 'protein';
      if (!to || this.allowedList.indexOf(to) < 0) return;
      this.closerTo = { level: to, gene: id };
      const T = this.CU.TEXT.zoom;
      LY.setText(this.closer, to === 'gene' ? T.closerGene : T.closerProtein);
      this.closer.setAttribute('aria-label', to === 'gene' ? T.closerGeneLabel : T.closerProteinLabel);
      this.closer.hidden = false;
      const cw = this.closer.offsetWidth, chh = chip.offsetHeight;
      const left = Math.max(4, Math.min(cv.cssW - cw - 4, chip.offsetLeft + chip.offsetWidth / 2 - cw / 2));
      let top = chip.offsetTop + chh + 6;
      if (top + 48 > cv.cssH) top = Math.max(4, chip.offsetTop - 50);
      this.closer.style.left = left + 'px';
      this.closer.style.top = top + 'px';
    }
    lookCloser() {
      const t = this.closerTo;
      this.closer.hidden = true;
      if (!t) return;
      if (t.gene !== this.app.focusGene) this.app.setFocus(t.gene);
      if (this.els.chip) this.els.chip.hidden = true;
      this.set(t.level, 'chip');
    }

    /** In a close-up: identify what was tapped (the cell view's chip), and offer "Watch this copy" for a strand. */
    onTap(e) {
      if (this.pinch.moved) { this.pinch.moved = false; return; }
      const cv = this.cv(), r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (this.level !== 'gene') return;
      const plan = this.gplan, T = this.CU.TEXT, app = this.app, v = app.cell.observe(), gv = v.geneById[this.gene()];
      const words = this.words(this.gene());
      const i = this.geneView.hitTest(plan, x, y, 18);
      let text = '';
      this.extra.hidden = this.extra.dataset.kind === 'watch' ? true : this.extra.hidden;
      const C = TAP_TEXT;
      if (i === -2) text = F.fill(C.dna, { name: words.name });
      else if (i >= 0) {
        const k = plan.kind[i];
        if (k === 3) {
          const id = plan.laneId[plan.ref[i]], born = plan.laneBirth[plan.ref[i]];
          text = F.fill(C.mRNA, { t: F.clock((v.tick - born) * v.scale.dt_s, true) });
          if (app.BTC.MRNAWatch && !(this.watch && this.watch.alive && this.watch.id === id)) {
            this.extra.dataset.kind = 'watch'; this.extra.dataset.id = String(id);
            LY.setText(this.extra, C.watch);
            this.extra.hidden = false;
          }
        } else if (k === 4) text = F.fill(C.ribosome, { p: Math.round(100 * plan.p[i]) });
        else if (k === 1) text = F.fill(C.rnap, { p: Math.round(100 * plan.p[i]) });
        else if (k === 2) text = F.fill(C.rnap, { p: Math.round(100 * plan.p[plan.ref[i] >= 0 ? i - 1 : i]) });
        else if (k === 6) text = F.fill(gv.location === 'membrane' ? C.proteinMembrane : C.proteinInside, { name: F.capital(words.protein || words.name) });
      }
      if (!text) { if (cv.hideChip) cv.hideChip(); return; }
      cv.showChip(text, x, y);
    }

    // --- pinch --------------------------------------------------------------------------
    pDown(e) {
      const p = this.pinch;
      if (e.pointerType === 'mouse') return;
      if (p.ids.length === 0) p.moved = false;       // a new gesture: a tap after a pinch counts again
      if (p.ids.length >= 2) return;
      p.ids.push(e.pointerId);
      const k = p.ids.length - 1;
      p.x[k] = e.clientX; p.y[k] = e.clientY;
      if (p.ids.length === 2) {
        p.d0 = Math.hypot(p.x[1] - p.x[0], p.y[1] - p.y[0]) || 1;
        p.ratio = 1; p.active = true;
        this.els.stage.classList.add('is-pinching');
      }
    }
    pMove(e) {
      const p = this.pinch, k = p.ids.indexOf(e.pointerId);
      if (k < 0) return;
      p.x[k] = e.clientX; p.y[k] = e.clientY;
      if (!p.active) return;
      e.preventDefault();
      p.ratio = Math.hypot(p.x[1] - p.x[0], p.y[1] - p.y[0]) / p.d0;
      const f = Math.max(FOLLOW_MIN, Math.min(FOLLOW_MAX, p.ratio));
      const target = this.level === 'cell' ? this.els.cellCanvas : this.canvas;
      target.style.transform = 'scale(' + f.toFixed(3) + ')';
      p.moved = true;
    }
    pUp(e, cancel) {
      const p = this.pinch, k = p.ids.indexOf(e.pointerId);
      if (k < 0) return;
      const wasActive = p.active, ratio = p.ratio;
      p.ids.splice(k, 1);
      if (k === 0 && p.ids.length) { p.x[0] = p.x[1]; p.y[0] = p.y[1]; }
      if (!wasActive) return;
      p.active = false;
      this.els.cellCanvas.style.transform = ''; this.canvas.style.transform = '';
      this.els.stage.classList.remove('is-pinching');
      if (cancel) return;
      if (ratio >= PINCH_IN) this.step(1, 'pinch');
      else if (ratio <= PINCH_OUT) this.step(-1, 'pinch');
    }

    // --- narrator (§3.6) ------------------------------------------------------------------
    /** The level's rules, then the close-up rules while a close-up is shown (one reused list per combination). */
    rules(levelRules) {
      const BTC = this.app.BTC;
      if (!this.zrules) this.zrules = this.CU.zRules(() => this.zstate, BTC.narrate);
      const st = this.zstate;
      st.zoom = this.level; st.gene = this.gene();
      st.view = this.app.cell ? this.app.cell.observe() : null;
      if (this.level !== 'protein') st.model = null;
      else if (!st.model && st.view) st.model = this.CU.planProtein(st.view, st.gene, { speed: this.app.speed() }, this.pmodel);
      if (this.level === 'cell') return levelRules || undefined;
      const c = this.combo;
      if (c.base !== levelRules || !c.list) { c.base = levelRules; c.list = (levelRules || []).concat(this.zrules); }
      return c.list;
    }

    // --- the key sheet ------------------------------------------------------------------
    openKey() {
      const h = LY.h, P = PAL.current(), T = this.CU.TEXT, id = this.gene(), col = P[this.colorTok(id)] || P.muted;
      const glyph = (draw) => {
        const cvs = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
        cvs.width = 32 * dpr; cvs.height = 24 * dpr; cvs.setAttribute('aria-hidden', 'true');
        const c = cvs.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = P.inside; c.fillRect(0, 0, 32, 24); draw(c);
        return cvs;
      };
      const rows = [];
      const add = (draw, label) => rows.push(h('li', { class: 'key-row zoom-key' }, [glyph(draw), h('span', { class: 'key-label', text: label })]));
      const art = MV.art;
      let title, notes;
      if (this.level === 'gene') {
        const G = T.gene.glyphs;
        title = T.gene.keyTitle; notes = T.gene.notes.slice();
        if (!this.gplan.ribToScale) notes.push(T.gene.ribLarger);
        if (this.gplan.ribScale > 1) notes.push(F.fill(T.gene.ribGlyph, { R: this.gplan.ribScale }) + '.');
        add((c) => { c.beginPath(); c.moveTo(0, 11); c.lineTo(32, 11); c.moveTo(0, 14); c.lineTo(32, 14); c.strokeStyle = P.dna; c.lineWidth = 1.2; c.stroke(); c.beginPath(); c.moveTo(6, 12.5); c.lineTo(26, 12.5); c.strokeStyle = col; c.lineWidth = 4; c.stroke(); }, G.dna);
        add((c) => { c.beginPath(); c.arc(16, 16, 5, 0, 6.3); c.fillStyle = P.inside; c.fill(); c.strokeStyle = P.rnap; c.lineWidth = 1.8; c.stroke(); c.beginPath(); c.moveTo(14, 11); c.lineTo(8, 2); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); }, G.rnap);
        add((c) => { c.beginPath(); for (let x = 2; x <= 30; x += 2) { const y = 12 + 2.2 * Math.sin(x * 0.7); if (x === 2) c.moveTo(x, y); else c.lineTo(x, y); } c.strokeStyle = col; c.lineWidth = 2; c.stroke(); }, G.mRNA);
        add((c) => { c.beginPath(); c.arc(16, 15, 6, 0, 6.3); c.moveTo(20, 8); c.arc(16, 8, 4, 0, 6.3); c.fillStyle = P.ribosome; c.fill(); }, G.ribosome);
        add((c) => { c.beginPath(); for (let k = 0; k < 8; k++) { const row = Math.floor(k / 4), cx = 10 + (row % 2 ? 3 - (k % 4) : k % 4) * 4; c.moveTo(cx + 1.6, 18 - row * 4); c.arc(cx, 18 - row * 4, 1.6, 0, 6.3); } c.fillStyle = col; c.fill(); }, G.chain);
        add((c) => { c.fillStyle = col; if (this.gplan.membraneGene) { c.fillRect(11, 4, 4, 16); c.fillRect(17, 4, 4, 16); } else { c.beginPath(); c.arc(16, 12, 5, 0, 6.3); c.fill(); } }, G.protein);
        add((c) => { c.beginPath(); for (let k = 0; k < 4; k++) { c.moveTo(3 + k * 7, 12 + (k % 2 ? 3 : -3)); c.lineTo(7 + k * 7, 12 + (k % 2 ? 1 : -1)); } c.strokeStyle = P.muted; c.lineWidth = 2; c.stroke(); }, G.broken + ' · ' + F.fill(TAP_TEXT.perMarker, { N: 1 }));
        add((c) => { c.beginPath(); for (let k = 0; k < 8; k++) { const a = k * 0.785; c.moveTo(16 + Math.cos(a) * 6 + 1.5, 12 + Math.sin(a) * 6); c.arc(16 + Math.cos(a) * 6, 12 + Math.sin(a) * 6, 1.5, 0, 6.3); } c.fillStyle = col; c.fill(); },
          G.made + ' · ' + F.fill(TAP_TEXT.perMarker, { N: F.count(this.geneView.madeN) }));
      } else {
        const G = T.protein.glyphs, M = this.pmodel.machine || this.CU.machineOf(id);
        title = T.protein.keyTitle; notes = T.protein.notes.slice();
        const mols = [M.substrate, M.product, M.product2, M.nonfit, M.site === 'proton' ? 'proton' : null].filter((x, i, a) => x && a.indexOf(x) === i && art.MOL[x]);
        for (const m of mols) add((c) => art.drawMol(c, P, m, 16, 12, m === 'lactose' || m === 'allolactose' ? 8 : 14, m === 'lactose' || m === 'allolactose' ? Math.PI / 2 : 0, 1), F.capital(G[m] || m));
        if (M.atp) add((c) => { art.drawEnergy(c, P, true, 11, 12, 16); art.drawEnergy(c, P, false, 22, 12, 16); }, F.capital(G.atp));
      }
      LY.openSheet({
        title, className: 'key-sheet',
        build: (body) => {
          body.appendChild(h('ul', { class: 'key-list' }, rows));
          body.appendChild(h('ul', { class: 'key-notes' }, notes.map((t) => h('li', { text: t }))));
        },
      });
    }

    // --- guide targets (views.cellView.locate) ------------------------------------------------
    /**
     * Where a guide's canvas target is drawn now, {x, y} in canvas CSS px, or null. Points: 'mrna:first'
     * (the watched copy, else the newest one drawn), 'ribosome:focus', 'rnap:first', 'glyph:membrane:<gene>'
     * or 'protein:<gene>' (one of its proteins), 'marker:glucose' (where glucose comes in), 'side-route',
     * 'locus:<gene>' / 'dna' / 'promoter', 'pocket' / 'machine' / 'nonfit' (Protein zoom).
     */
    locate(point) {
      if (typeof point !== 'string') return null;
      const out = this.locOut || (this.locOut = { x: 0, y: 0 });
      const at = (x, y) => { out.x = x; out.y = y; return out; };
      const i = point.indexOf(':'), kind = i < 0 ? point : point.slice(0, i);
      let arg = i < 0 ? '' : point.slice(point.lastIndexOf(':') + 1);
      if (arg === 'focus' || arg === 'first') arg = '';
      if (this.level === 'protein') {
        const g = this.machineView.geom, M = this.pmodel.machine;
        if (!M || !g.s) return null;
        if (kind === 'nonfit') return this.mstate.nfShown ? at(g.x + this.mstate.nfX * g.s, g.y + this.mstate.nfY * g.s) : null;
        if (kind !== 'pocket' && kind !== 'machine' && kind !== 'protein' && kind !== 'glyph' && kind !== 'marker') return null;
        const gy = M.kind === 'splitter' ? -0.85 : M.kind === 'enzyme' || M.kind === 'builder' ? -1.0 : 0;
        return at(g.x, g.y + gy * g.s);
      }
      if (this.level === 'gene') {
        const p = this.gplan, G = this.CU.G;
        const find = (k, lane) => { for (let j = 0; j < p.N; j++) if (p.kind[j] === k && (lane === undefined || p.ref[j] === lane)) return j; return -1; };
        if (kind === 'mrna') {
          let l = p.watchedLane;
          if (l < 0) { let best = -Infinity; for (let j = 0; j < p.lanes; j++) if (p.laneId[j] >= 0 && p.laneBirth[j] > best) { best = p.laneBirth[j]; l = j; } }
          return l >= 0 ? at(p.laneX[l] + p.strandLen / 2, p.laneY[l]) : null;
        }
        let j = -1;
        if (kind === 'ribosome') { j = p.watchedLane >= 0 ? find(G.RIB, p.watchedLane) : -1; if (j < 0) j = find(G.RIB); }
        else if (kind === 'rnap' || kind === 'nascent') j = find(G.RNAP);
        else if (kind === 'glyph' || kind === 'protein') j = find(G.PROT);
        else if (kind === 'dna' || kind === 'locus' || kind === 'promoter') return at(kind === 'promoter' ? p.dnaX0 : p.dnaX0 + p.genePx / 2, p.dnaY);
        else if (kind === 'marker') { j = find(G.PROT); }
        return j >= 0 ? at(p.x[j], p.y[j]) : null;
      }
      // Cell zoom: from the cell view's own glyph buffer.
      const cv = this.cv(), K = this.app.BTC.CellView.KINDS;
      if (!cv || !cv.n) return null;
      const gi = arg && cv.idx && cv.idx[arg] !== undefined ? cv.idx[arg] : -1;
      // A flux marker comes in through its transporter's glyphs: glucose (PtsG), lactose (LacY), amino acids (importers).
      const mg = kind === 'marker' ? (arg === 'lactose' ? 'lacY' : arg === 'aa' ? 'aaImp' : 'ptsG') : '';
      const markGene = mg && cv.idx && cv.idx[mg] !== undefined ? cv.idx[mg] : -1;
      let best = -1, bestId = -Infinity;
      for (let j = 0; j < cv.n; j++) {
        const k = cv.bkind[j];
        if (kind === 'mrna' && k === K.MRNA_FOCUS) {
          const id = cv.bsrc[j];
          if (this.watch && this.watch.alive && this.watch.id === id) { best = j; break; }
          if (id > bestId) { bestId = id; best = j; }
        } else if (kind === 'ribosome' && k === K.POLY) { best = j; break; }
        else if ((kind === 'rnap' || kind === 'nascent') && k === K.NASCENT && cv.bs0[j] === 0) { best = j; break; }
        else if ((kind === 'glyph' || kind === 'protein') && k === K.PROT && (gi < 0 || cv.bgene[j] === gi)) { best = j; break; }
        else if (kind === 'marker' && k === K.PROT && cv.bgene[j] === markGene) { best = j; break; }
        else if ((kind === 'locus' || kind === 'dna') && k === K.LOCUS && cv.bgene[j] === (gi >= 0 ? gi : this.app.focusIndex())) { best = j; break; }
      }
      if (best >= 0) return at(cv.bx[best], cv.by[best]);
      if ((kind === 'marker' || kind === 'side-route' || kind === 'side') && cv.sideN) return at(cv.sideX[0], cv.sideY[0]);
      return null;
    }

    // --- test support ---------------------------------------------------------------------
    plan() { return this.gplan; }
    model() { return this.pmodel; }
    stats() {
      const p = this.gplan;
      return { level: this.level, allowed: this.allowed(), drawMs: this.drawMs || 0,
        gene: { m: p.m, d: p.d, n: p.n, R: p.R, P: p.P, total: p.total, ribScale: p.ribScale, beads: p.beads, moreCopies: p.moreCopies, moreRib: p.moreRib, scaleNm: p.scaleNm },
        protein: { gene: this.pmodel.gene, r: this.pmodel.r, k: this.pmodel.k, working: this.pmodel.working, idle: this.pmodel.idle, nonfit: this.pmodel.nonfitPresent } };
    }
  }

  // Tap-chip words in the close-ups (student text; linted with the rest of BTC.closeup.TEXT's shape).
  const TAP_TEXT = Object.freeze({
    mRNA: 'mRNA copy, made {t} ago', ribosome: 'Ribosome, chain {p}% built', rnap: 'RNA polymerase, copy {p}% made',
    proteinMembrane: '{name}, in the membrane', proteinInside: '{name}, inside the cell', dna: 'The {name} gene',
    watch: 'Watch this copy', perMarker: '1 mark = {N}',
  });
  ZoomControl.TAP_TEXT = TAP_TEXT;
  ZoomControl.LEVELS = LEVELS;
  return ZoomControl;
});
