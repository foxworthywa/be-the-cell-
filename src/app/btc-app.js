// @deps btc-content btc-palette btc-format btc-prefs btc-layout btc-loop btc-controls btc-cellview btc-status btc-genes-panel btc-medium-panel btc-graphs-panel btc-narrator-ui btc-pwa
/*
 * Be the Cell: bootstrap and wiring (LAB_UI §10.3–10.4).
 *
 * The engine owns the cell's state. The app reads cell.observe(), facts and
 * events, and changes the cell only through cell.command(); it never writes
 * to the cell or the view (test c-2). Speed and pause are UI state, not
 * commands. A new cell starts paused.
 *
 * window.__btc = {cell (a getter: reset replaces the cell), BTC, app}.
 * With ?test=1: app.test = {runTicks, pause, resume, setSpeed, stats, cellViewStats, narratorKey}.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.app = factory();
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => B.app.boot(B));
      else B.app.boot(B);
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MARKER_CAP = 256, BAND_CAP = 64;
  const AUTOSAVE_S = 60;
  // The recent-history recorder keeps full resolution (every 5 ticks) for the last 6 h or more (LAB_UI §5.1).
  const RECENT_CAP = 8640;

  // Kinds of graph marker.
  const MK_DIVISION = 1, MK_COMMAND = 2, MK_RESUMED = 3;

  function boot(BTC) {
    const C = BTC.content, LY = BTC.layout, PR = BTC.prefs, F = BTC.format;
    const $ = (id) => document.getElementById(id);
    const params = PR.parseParams(location.search);
    const ui = PR.loadUI();
    if (params.speed) ui.speed = params.speed;
    if (params.tab) ui.tab = params.tab;
    if (params.theme) ui.theme = params.theme;
    if (!C.speeds.some((s) => s.s === ui.speed) && !params.speed) ui.speed = 60;
    // Saved preferences may come from an older build: keep only what this build knows.
    if (C.GENE_IDS.indexOf(ui.focusGene) < 0) ui.focusGene = PR.DEFAULTS.focusGene;
    ui.graphGenes = ui.graphGenes.filter((id, i, a) => C.GENE_IDS.indexOf(id) >= 0 && a.indexOf(id) === i).slice(0, 3);
    if (!ui.graphGenes.length) ui.graphGenes = PR.DEFAULTS.graphGenes.slice();
    if (!C.graphs.windows.some((x) => x.s === ui.window)) ui.window = PR.DEFAULTS.window;
    if (ui.plot4 !== 'size' && ui.plot4 !== 'growth') ui.plot4 = 'size';
    if (!ui.logScales || typeof ui.logScales !== 'object') ui.logScales = Object.assign({}, PR.DEFAULTS.logScales);

    const app = {
      BTC, params, ui,
      build: (typeof window !== 'undefined' && window.BTC_BUILD) || 'dev',
      // Hooks reserved for levels (LAB_UI §12); inert in M1.
      labConfig: {
        showNames: true, genesVisible: 'all', controls: { genes: true, medium: true, drugs: true },
        lockedGenes: [], allowedLevels: null, speedOptions: null, startPaused: true,
      },
      layout: 'compact', tab: 'cell', focusGene: ui.focusGene,
      cell: null, config: null, rec: null, recRecent: null, mem: null, gen0: 0,
      facts: BTC.observe.createFacts(),
      pending: new BTC.controls.Pending(),
      registry: [],
      speedHistory: [],
      markers: { n: 0, tick: new Int32Array(MARKER_CAP), kind: new Uint8Array(MARKER_CAP), prio: new Uint8Array(MARKER_CAP), label: new Array(MARKER_CAP).fill('') },
      bandList: [],
      bandModel: { n: 0, t0: new Float64Array(BAND_CAP), t1: new Float64Array(BAND_CAP), color: new Array(BAND_CAP).fill('drug-rif'), label: new Array(BAND_CAP).fill('') },
      narrKey: '', narrTick: -1, lastTick: -1,
      sinceSlow: 1, sinceSave: 0, resumeOnShow: false, paintQueued: false,
    };

    // --- the cell -------------------------------------------------------------------
    function baseConfig(seed) {
      return {
        seed, strain: 'm1-lab', start: 'steady',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0, oxygen: false },
      };
    }
    function newSeed() {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);      // the only randomness in the app: a new cell's seed
      return a[0];
    }
    function attach(cell) {
      app.cell = cell;
      app.gen0 = cell.observe().clock.generation;
      const channels = BTC.Recorder.labChannels(cell);
      app.rec = new BTC.Recorder({ every: 5, capacity: 4096, channels });
      app.rec.sample(cell);
      cell.attachRecorder(app.rec);
      app.recRecent = new BTC.Recorder({ every: 5, capacity: RECENT_CAP, channels, mode: 'ring' });
      app.recRecent.sample(cell);
      cell.attachRecorder(app.recRecent);
      app.mem = BTC.narrate.createMemory({ phrases: C.narratorPhrases(), showNames: app.labConfig.showNames, dt: cell.dt });
      app.facts = BTC.observe.createFacts();
      app.pending.clear();
      restorePending(cell);
      app.markers.n = 0;
      app.bandList.length = 0;
      app.narrTick = -1; app.lastTick = -1;
      // Drugs already on at the start (a restored cell) begin their band at tick 0.
      const v = cell.observe();
      if (v.drugs.rifampicin > 0) app.bandList.push({ drug: 'rifampicin', t0: cell.tick, t1: -1 });
      if (v.drugs.chloramphenicol > 0) app.bandList.push({ drug: 'chloramphenicol', t0: cell.tick, t1: -1 });
    }

    /** A restored cell may hold commands that have not applied yet: its controls show them as pending (LAB_UI §3.4). */
    function restorePending(cell) {
      const q = cell.pending || [];
      for (const e of q) {
        if (e.source !== 'user' || !e.args) continue;
        const a = e.args;
        if (e.type === 'setPromoter' && typeof a.gene === 'string') app.pending.set(a.gene, e.seq, levelKey(a.level));
        else if (e.type === 'setDrug' && typeof a.drug === 'string') {
          app.pending.set(a.drug, e.seq, BTC.MediumPanel.keyFor(BTC.catalog.DRUG_PRESETS, a.dose));
        } else if (e.type === 'setMedium') {
          for (const f of ['glucose', 'lactose', 'aminoAcids']) {
            if (a[f + '_mM'] !== undefined) app.pending.set(f, e.seq, BTC.MediumPanel.keyFor(BTC.catalog.MEDIUM_PRESETS[f], a[f + '_mM']));
          }
        }
      }
    }

    // --- UI state ---------------------------------------------------------------
    app.isRunning = () => app.loop.running;
    app.speed = () => app.loop.speed;
    app.reducedMotion = () => ui.reducedMotion === 'on' ||
      (ui.reducedMotion === 'auto' && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    let focusIdx = C.GENE_IDS.indexOf(app.focusGene);
    app.focusIndex = () => focusIdx;
    app.savePrefs = () => PR.saveUI(ui);

    app.setSpeed = (s) => {
      app.loop.setSpeed(s);
      ui.speed = s;
      app.savePrefs();
      logSpeed();
      app.requestPaint();
    };
    function logSpeed() {
      if (app.speedHistory.length < 500) app.speedHistory.push({ tick: app.cell.tick, speed: app.loop.speed, running: app.loop.running });
    }
    app.pause = () => { app.loop.stop(); afterRunChange(); };
    app.resume = () => { app.loop.start(); afterRunChange(); };
    function afterRunChange() {
      logSpeed();
      views.status.update(app.cell.observe(), app.facts);     // the button answers the tap at once
      app.refreshControls();
      app.requestPaint();
    }
    app.togglePause = () => (app.loop.running ? app.pause() : app.resume());

    app.setFocus = (id) => {
      if (id === app.focusGene) return;
      app.focusGene = id; focusIdx = C.GENE_IDS.indexOf(id); ui.focusGene = id;
      const gg = ui.graphGenes;
      if (gg.indexOf(id) < 0) { if (gg.length >= 3) gg.shift(); gg.push(id); }
      app.savePrefs();
      views.genes.updateFocus();
      views.graphs.syncControls();
      views.graphs.redraw();
      views.cellView.dirty = true;
      app.refreshControls();
      app.requestPaint();
    };
    app.toggleGraphGene = (id) => {
      const gg = ui.graphGenes, i = gg.indexOf(id);
      if (i >= 0) { if (gg.length > 1) gg.splice(i, 1); } else { gg.push(id); if (gg.length > 3) gg.shift(); }
      app.savePrefs();
      views.graphs.syncControls();
      views.graphs.redraw();
    };
    app.setWindow = (s) => { ui.window = s; app.savePrefs(); views.graphs.syncControls(); views.graphs.redraw(); };

    // --- commands and controls (LAB_UI §3.4) ---------------------------------------
    /** Sends a command; the control shows pending until the engine applies it. */
    app.send = (cmd, key, valueKey) => {
      const r = app.cell.command(cmd);
      if (r.ok) app.pending.set(key, r.seq, valueKey);
      else LY.toast(C.rejections[r.error] || C.rejections['bad-value']);
      app.refreshControls();
      app.requestPaint();
      return r;
    };

    const STRAIN_GENES = BTC.catalog.STRAINS['m1-lab'].genes;
    const levelKey = (level) => (level === 'off' ? 'off' : level === null || level === undefined ? null : String(level));

    /** A promoter control for the gene getGene() returns (a card's own gene, or the focus gene). */
    app.makePromoterControl = (getGene, where) => {
      const options = C.levels.map((l) => ({ key: l.key, label: l.label, spoken: C.levelSpoken[l.value] }));
      const ctrl = BTC.controls.segmented({
        label: C.card.promoter, options,
        onSelect: (key) => {
          const id = getGene();
          app.send({ type: 'setPromoter', gene: id, level: key === 'off' ? 'off' : Number(key) }, id, key);
        },
        className: 'promoter',
      });
      app.registry.push({
        ctrl, key: getGene, where,
        read: (view) => levelKey(view.geneById[getGene()].level),
        defaultKey: () => {
          const lv = STRAIN_GENES[C.GENE_IDS.indexOf(getGene())].defaultLevel;
          return levelKey(lv === 0 ? 'off' : lv);
        },
      });
      return ctrl;
    };

    /** A medium or drug control: key is the pending key, read(view) the current option, send(key) the command. */
    app.makeControl = (o) => {
      const ctrl = BTC.controls.segmented({ label: o.label, options: o.options, onSelect: (k) => app.send(o.send(k), o.key, k) });
      app.registry.push({ ctrl, key: () => o.key, read: o.read, where: 'medium' });
      return ctrl;
    };

    app.refreshControls = () => {
      const view = app.cell.observe(), running = app.loop.running;
      for (const r of app.registry) {
        const key = r.key(), pend = app.pending.get(key);
        const note = pend && !running && r.where !== 'focus' ? C.card.pending : '';
        r.ctrl.update(r.read(view), pend ? pend.value : null, note);
        if (r.defaultKey) {
          const dk = r.defaultKey();
          if (r.lastDefault !== dk) {
            r.lastDefault = dk;
            for (const b of r.ctrl.buttons) b.classList.toggle('is-default', b.getAttribute('data-key') === dk);
          }
        }
      }
    };

    // --- markers for the graphs (LAB_UI §5.1) --------------------------------------
    // Label priority when command labels collide on a plot: glucose, other medium, drugs, then promoters.
    const PRIO = { setMedium: 3, setDrug: 2, setPromoter: 1 };
    function addMarker(tick, kind, label, prio) {
      const m = app.markers;
      if (m.n === MARKER_CAP) {                          // oldest dropped
        m.tick.copyWithin(0, 1); m.kind.copyWithin(0, 1); m.prio.copyWithin(0, 1); m.label.shift(); m.label.push('');
        m.n--;
      }
      m.tick[m.n] = tick; m.kind[m.n] = kind; m.prio[m.n] = prio || 0; m.label[m.n] = label; m.n++;
    }
    function commandLabel(ev) {
      const G = C.graphs.marker, lv = C.graphs.markerLevels, r = ev.resolved, a = ev.args || {};
      if (ev.cmdType === 'setPromoter') {
        return F.fill(G.promoter, { symbol: C.genes[a.gene] ? C.genes[a.gene].symbol : a.gene, level: r.level === null ? '' : lv[r.level] });
      }
      if (ev.cmdType === 'setMedium') {
        for (const f of ['glucose', 'lactose', 'aminoAcids']) {
          if (a[f + '_mM'] === undefined) continue;
          const key = BTC.MediumPanel.keyFor(BTC.catalog.MEDIUM_PRESETS[f], r[f + '_mM']);
          return F.fill(G[f], { v: key });
        }
      }
      if (ev.cmdType === 'setDrug') return F.fill(G.drug, { drug: r.drug, v: BTC.MediumPanel.keyFor(BTC.catalog.DRUG_PRESETS, r.dose) });
      return ev.cmdType;
    }
    function drugBand(ev) {
      const r = ev.resolved, list = app.bandList;
      let open = null;
      for (const b of list) if (b.drug === r.drug && b.t1 < 0) open = b;
      if (r.dose > 0 && !open) {
        if (list.length >= BAND_CAP) list.shift();
        list.push({ drug: r.drug, t0: ev.tick, t1: -1 });
      } else if (!(r.dose > 0) && open) open.t1 = ev.tick;
    }
    app.bandsFor = (tick) => {
      const bm = app.bandModel, dt = app.cell.dt;
      bm.n = 0;
      for (const b of app.bandList) {
        bm.t0[bm.n] = b.t0 * dt; bm.t1[bm.n] = (b.t1 < 0 ? tick : b.t1) * dt;
        bm.color[bm.n] = b.drug === 'rifampicin' ? 'drug-rif' : 'drug-cm';
        bm.label[bm.n] = C.graphs.marker.bandLabel[b.drug] || '';
        bm.n++;
      }
      return bm;
    };

    // --- events (LAB_UI §10.3) ---------------------------------------------------
    app.onEvents = (events) => {
      let controls = false;
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        switch (ev.type) {
          case 'command_applied':
            app.pending.resolve(ev);
            controls = true;
            addMarker(ev.tick, MK_COMMAND, commandLabel(ev), ev.cmdType === 'setMedium' && ev.args && ev.args.glucose_mM !== undefined ? 4 : PRIO[ev.cmdType] || 1);
            if (ev.cmdType === 'setDrug') drugBand(ev);
            break;
          case 'command_rejected': {
            const key = app.pending.resolve(ev);
            controls = true;
            if (key !== null) LY.toast(C.rejections[ev.code] || C.rejections['bad-value']);
            break;
          }
          case 'division':
            addMarker(ev.tick, MK_DIVISION, '');
            views.cellView.dirty = true;
            break;
          case 'replication':
            views.cellView.dirty = true;
            break;
        }
      }
      if (events.length) BTC.narrate.ingest(app.mem, events, app.cell.tick);
      if (controls) app.refreshControls();
    };

    // --- narrator ---------------------------------------------------------------
    const hold = new BTC.NarratorHold(() => performance.now());
    let narrView = null;
    const RULE = {};
    for (const r of BTC.narrate.RULES) RULE[r.key] = r;
    function narrate() {
      const tick = app.cell.tick;
      if (tick !== app.narrTick) {
        app.narrTick = tick;
        BTC.observe.facts(app.cell, app.facts);
        const out = BTC.narrate.narrate(app.facts, app.mem, tick);
        app.narrKey = out.key;
        const rule = RULE[out.key];
        if (hold.offer(out.key, out.gene, out.text, rule ? rule.preempt : false)) showNarr();
      } else if (hold.poll()) showNarr();
    }
    function showNarr() {
      if (narrView.show(hold.key, hold.gene, hold.text)) views.cellView.setLabel(hold.text, hold.key);
    }

    // --- frame --------------------------------------------------------------------
    app.render = (dtReal, stepped, force, dtSimOverride) => {
      const view = app.cell.observe();
      const dtSim = dtSimOverride !== undefined ? dtSimOverride : app.loop.lastDone * app.cell.dt;
      narrate();
      views.cellView.render(dtReal, dtSim, force);
      views.genes.render(dtReal, force);
      views.medium.render(dtReal, force);
      views.graphs.render(dtReal, stepped, force);
      app.sinceSlow += dtReal;
      if (force || app.sinceSlow >= 0.25) {
        app.sinceSlow = 0;
        views.status.update(view, app.facts);
        if (views.cellView.visible || app.layout === 'compact') views.cellView.updateFocusBar(view);
        app.refreshControls();
      }
      if (app.loop.running) {
        app.sinceSave += dtReal;
        if (app.sinceSave >= AUTOSAVE_S) { app.sinceSave = 0; BTC.pwa.autosave(app); }
      }
    };

    /** One repaint while paused (resize, tab, theme, focus gene); the loop itself does not idle. */
    app.requestPaint = () => {
      if (app.loop && app.loop.running) { views.cellView.dirty = true; return; }
      if (app.paintQueued) return;
      app.paintQueued = true;
      requestAnimationFrame(() => {
        app.paintQueued = false;
        if (!app.loop.running) app.render(0, false, true, 0);
      });
    };

    // --- layout and tabs (LAB_UI §1) ---------------------------------------------------
    const views = {};
    function applyTab() {
      const L = app.layout, tab = app.tab;
      const compact = L === 'compact';
      $('stage-wrap').hidden = compact && tab !== 'cell';
      for (const name of ['genes', 'medium', 'graphs']) {
        const on = tab === name || (name === 'graphs' && L === 'wide');
        $('pane-' + name).hidden = !on;
      }
      document.querySelectorAll('[data-tab]').forEach((b) => {
        const on = b.getAttribute('data-tab') === tab;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle('is-on', on);
      });
      document.querySelectorAll('#paneltabs [data-tab="graphs"]').forEach((b) => { b.hidden = L === 'wide'; });
      views.cellView.setVisible(!$('stage-wrap').hidden);
      views.genes.setVisible(!$('pane-genes').hidden);
      views.medium.setVisible(!$('pane-medium').hidden);
      views.graphs.setVisible(!$('pane-graphs').hidden);
      app.requestPaint();
    }
    app.setTab = (tab) => {
      app.tab = LY.mapTab(tab, app.layout);
      ui.tab = tab;
      app.savePrefs();
      applyTab();
    };
    app.showPlot = (key) => {
      if (app.layout !== 'wide') app.setTab('graphs');
      views.graphs.reveal(key);
    };
    function relayout() {
      const w = window.innerWidth, h = window.innerHeight;
      const L = LY.applyToBody(w, h);
      const changed = L !== app.layout;
      app.layout = L;
      app.tab = LY.mapTab(ui.tab, L);
      if (changed || !relayout.done) {
        relayout.done = true;
        applyTab();
        views.graphs.applySwap();
      }
      app.requestPaint();
    }

    // --- sheets -------------------------------------------------------------------
    app.openStartOver = () => {
      const h = LY.h, S = C.sheets.startOver;
      LY.openSheet({
        title: S.title,
        build: (body, close) => {
          body.appendChild(h('button', { class: 'btn row-btn big-choice', type: 'button', 'data-choice': 'same', onclick: () => { close(); app.reset(false); } },
            [h('span', { class: 'choice-title', text: S.same }), h('span', { class: 'choice-note', text: S.sameNote })]));
          body.appendChild(h('button', { class: 'btn row-btn big-choice', type: 'button', 'data-choice': 'new', onclick: () => { close(); app.reset(true); } },
            [h('span', { class: 'choice-title', text: S.fresh }), h('span', { class: 'choice-note', text: S.freshNote })]));
          body.appendChild(h('button', { class: 'btn row-btn', type: 'button', onclick: close }, S.cancel));
        },
      });
    };
    app.openAbout = () => {
      const h = LY.h, S = C.sheets.about;
      LY.openSheet({
        title: S.title, className: 'about-sheet',
        build: (body) => {
          body.appendChild(h('h3', { text: S.whyHeading }));
          body.appendChild(h('p', { text: S.why }));
          body.appendChild(h('h3', { text: S.lactoseHeading }));
          body.appendChild(h('p', { text: S.lactose }));
          body.appendChild(h('p', { text: S.lactoseRestart }));
          body.appendChild(h('h3', { text: S.heading }));
          body.appendChild(h('ul', { class: 'about-list' }, C.about.map((t) => h('li', { text: t }))));
          body.appendChild(h('p', { class: 'sheet-note', text: S.more }));
          const theme = BTC.controls.segmented({ label: S.theme, options: S.themes, onSelect: (k) => { ui.theme = k; app.savePrefs(); applyTheme(); theme.update(k, null); } });
          theme.update(ui.theme, null);
          const motion = BTC.controls.segmented({ label: S.motion, options: S.motions, onSelect: (k) => { ui.reducedMotion = k; app.savePrefs(); applyMotion(); motion.update(k, null); } });
          motion.update(ui.reducedMotion, null);
          body.appendChild(h('div', { class: 'ctl-row' }, [h('div', { class: 'ctl-label', text: S.theme }), theme.el]));
          body.appendChild(h('div', { class: 'ctl-row' }, [h('div', { class: 'ctl-label', text: S.motion }), motion.el]));
          body.appendChild(h('p', { class: 'sheet-note num', text: F.fill(S.version, { build: app.build, engine: BTC.ENGINE_VERSION }) }));
        },
      });
    };
    app.downloadRun = () => BTC.pwa.downloadRun(app);

    /** Start over: always a fresh Cell built from config, never patched fields (LAB_UI §4.3). */
    app.reset = (fresh) => {
      app.loop.stop();
      app.config = baseConfig(fresh ? newSeed() : app.config.seed);
      attach(new BTC.Cell(app.config));
      views.cellView.reset();
      hold.reset();
      narrView.key = null;
      logSpeed();
      BTC.pwa.autosave(app);
      app.refreshControls();
      views.graphs.redraw();
      app.requestPaint();
    };

    function applyTheme() {
      BTC.palette.apply(ui.theme);
      views.cellView && (views.cellView.dirty = true);
      views.graphs && views.graphs.redraw();
      app.requestPaint();
    }
    function applyMotion() {
      document.body.toggleAttribute('data-reduced-motion', app.reducedMotion());
      app.requestPaint();
    }

    /** An error inside a frame: the loop has stopped; say so instead of freezing under a "Running" button. */
    app.onError = (err) => {
      try { console.error(err); } catch (e) { /* no console */ }
      try {
        localStorage.setItem('btc.lastError', JSON.stringify({
          msg: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 2000), build: app.build, tick: app.cell ? app.cell.tick : -1,
        }));
      } catch (e) { /* storage blocked or full: ignored */ }
      try { if (app.loop) app.loop.stop(); afterRunChange(); } catch (e) { /* the UI itself may be what failed */ }
      LY.toast(C.pwa.error, { label: C.pwa.resumedAction, run: () => app.openStartOver() });
    };

    // --- start -----------------------------------------------------------------------
    BTC.palette.apply(ui.theme);
    // Static words in the page shell come from BTC.content too (data-text="path.in.content").
    document.querySelectorAll('[data-text]').forEach((el) => {
      const v = el.getAttribute('data-text').split('.').reduce((o, k) => (o ? o[k] : undefined), C);
      if (typeof v === 'string') el.textContent = v;
    });
    const saved = BTC.pwa.loadAutosave(app);
    let restored = false;
    if (saved) {
      try {
        attach(BTC.Cell.restore(saved.snapshot));
        app.config = saved.snapshot.config;
        app.gen0 = saved.gen0 || 0;
        addMarker(app.cell.tick, MK_RESUMED, C.graphs.marker.resumed, 4);
        restored = true;
      } catch (e) { restored = false; }
    }
    if (!restored) {
      const seed = params.seed !== undefined ? params.seed : params.test ? 1 : newSeed();
      app.config = baseConfig(seed);
      attach(new BTC.Cell(app.config));
    }

    app.loop = new BTC.Loop({
      now: () => performance.now(),
      raf: (f) => requestAnimationFrame(f),
      caf: (id) => cancelAnimationFrame(id),
      getCell: () => app.cell,
      onEvents: app.onEvents,
      render: (dtReal, stepped) => app.render(dtReal, stepped, false),
      onError: (err) => app.onError(err),
      speed: ui.speed,
    });
    views.status = new BTC.StatusStrip(app);
    views.cellView = new BTC.CellView(app);
    views.genes = new BTC.GenesPanel(app);
    views.medium = new BTC.MediumPanel(app);
    views.graphs = new BTC.GraphsPanel(app);
    app.views = views;

    views.status.mount($('status'));
    views.cellView.mount({
      stage: $('stage'), canvas: $('cell-canvas'), focus: $('focusbar'), legend: $('legend'),
      legendFull: $('legend-full'), legendShort: $('legend-short'), scaleBar: $('scalebar'), outsideScale: $('outside-scale'),
      pausedBadge: $('paused-badge'), pausedText: $('paused-text'), rifBadge: $('badge-rif'), cmBadge: $('badge-cm'), chip: $('tap-chip'),
    });
    views.genes.mount($('pane-genes'));
    views.medium.mount($('pane-medium'));
    views.graphs.mount($('pane-graphs'));
    narrView = new BTC.NarratorView($('narrator-text'));

    // Tabs: the bottom bar (compact) and the panel tabs (other layouts).
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => app.setTab(b.getAttribute('data-tab')));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const list = Array.from(b.parentElement.querySelectorAll('[data-tab]')).filter((x) => !x.hidden);
        const i = list.indexOf(b) + (e.key === 'ArrowRight' ? 1 : -1);
        if (i >= 0 && i < list.length) { list[i].focus(); app.setTab(list[i].getAttribute('data-tab')); }
      });
    });

    relayout();
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    if (typeof matchMedia === 'function') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
      matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyMotion);
    }
    applyMotion();

    // Laptop extras: Space runs or pauses; keys 1–5 choose a speed.
    document.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('.sheet-backdrop')) return;
      const t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ' && (tag === 'BODY' || tag === 'CANVAS' || !t)) { e.preventDefault(); app.togglePause(); }
      const n = Number(e.key);
      if (n >= 1 && n <= 5) app.setSpeed(C.speeds[n - 1].s);     // digits never activate a focused button
    });

    // Background tabs: stop and save; simulated time does not pass while hidden, and there is no catch-up.
    function hide() {
      if (app.loop.running) { app.resumeOnShow = true; app.loop.stop(); }
      BTC.pwa.autosave(app);
    }
    function show() {
      if (app.resumeOnShow) { app.resumeOnShow = false; app.loop.start(); }
      app.requestPaint();
    }
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? hide() : show()));
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', (e) => { if (e.persisted) show(); });
    document.addEventListener('freeze', hide);

    logSpeed();
    try {
      app.refreshControls();
      app.render(0, false, true, 0);
    } catch (err) { app.onError(err); }       // still register the worker and the debug hook below
    // Only a cell that has been run or changed is worth announcing (an untouched one is saved on every visit).
    if (restored && (saved.snapshot.tick > 0 || (saved.snapshot.log && saved.snapshot.log.length > 0) || app.cell.pending.length > 0)) {
      LY.toast(C.pwa.resumed, { label: C.pwa.resumedAction, run: () => app.openStartOver() });
    }
    BTC.pwa.register({ test: params.test, build: window.BTC_BUILD });

    // Debug hook; cell is a getter because reset replaces the cell.
    window.__btc = { get cell() { return app.cell; }, BTC, app };

    if (params.test) {
      app.test = {
        runTicks(n) {
          for (let i = 0; i < n; i++) app.cell.step();
          app.onEvents(app.cell.takeEvents());
          app.render(0, true, true, n * app.cell.dt);
          return app.cell.tick;
        },
        pause: () => app.pause(),
        resume: () => app.resume(),
        setSpeed: (s) => app.setSpeed(s),
        stats: () => ({
          tick: app.cell.tick, running: app.loop.running, speed: app.loop.speed,
          achievedSpeed: app.loop.stats.achievedSpeed, engineMsAvg: app.loop.stats.engineMsAvg, drawMsAvg: views.cellView.drawEma,
        }),
        cellViewStats: () => views.cellView.stats(),
        narratorKey: () => app.narrKey,
        shownKey: () => hold.key,
      };
    }
    return app;
  }

  return { boot };
});
