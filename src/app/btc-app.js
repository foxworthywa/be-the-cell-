// @deps btc-content btc-palette btc-format btc-prefs btc-layout btc-loop btc-controls btc-cellview btc-status btc-genes-panel btc-medium-panel btc-graphs-panel btc-narrator-ui btc-pwa btc-home btc-hud btc-sketch btc-designer btc-prologue btc-level-ui
/*
 * Be the Cell: bootstrap and wiring (LAB_UI §10.3–10.4), and the router
 * (LEVELS §9 item 1): screens home, lab and level. The lab mounts as in M1;
 * a level reuses the same lab screen on its own cell with its labConfig, a
 * HUD and the level sheets. Only one cell loop runs at a time, and the lab's
 * cell and autosave are left alone while a level is open.
 *
 * The engine owns the cell's state. The app reads cell.observe(), facts and
 * events, and changes the cell only through cell.command(); it never writes
 * to the cell or the view (test c-2). Speed and pause are UI state, not
 * commands. A new cell starts paused.
 *
 * window.__btc = {cell (a getter: reset replaces the cell), BTC, app}.
 * With ?test=1: app.test = {runTicks, pause, resume, setSpeed, stats, cellViewStats, narratorKey, level}.
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

  // The free-play lab's labConfig: everything shown and free (LEVELS §5.5.1 defaults).
  const LAB_CONFIG = Object.freeze({
    showNames: true, revealed: {}, displayOrder: null, colorBy: 'gene', genesVisible: 'all',
    controls: Object.freeze({ genes: true, medium: true, drugs: true }), lockedGenes: [], readOnlyGenes: false,
    mediumRows: Object.freeze({ glucose: 'free', lactose: 'free', aminoAcids: 'free' }), allowedLevels: null,
    speedOptions: null, defaultSpeed: 60, startPaused: true, tabs: ['cell', 'genes', 'medium', 'graphs'],
    graphGenes: null, bands: null, yBand: null, hud: false, focusGene: null,
    // Level extensions (LEVELS.md, "Changes after engine 1.1"): which plots, in which order; the graph
    // window (s) a level opens with; the tab it opens on; a line under the medium rows.
    plots: null, graphWindow: null, initialTab: null, mediumNote: null,
  });
  function localDate() {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** A level's labConfig over the lab defaults. */
  function levelConfig(lc) {
    const out = Object.assign({}, LAB_CONFIG, lc || {});
    out.controls = Object.assign({}, LAB_CONFIG.controls, (lc && lc.controls) || {});
    out.mediumRows = Object.assign({}, LAB_CONFIG.mediumRows, (lc && lc.mediumRows) || {});
    return out;
  }

  function boot(BTC) {
    const C = BTC.content, LY = BTC.layout, PR = BTC.prefs, F = BTC.format;
    const $ = (id) => document.getElementById(id);
    const params = PR.parseParams(location.search);
    const ui = PR.loadUI();
    const GENE_ALL = C.ALL_GENE_IDS;
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
      BTC, params, ui, prefs: ui,          // ui: the current screen's settings; prefs: the lab's saved ones (and the theme)
      build: (typeof window !== 'undefined' && window.BTC_BUILD) || 'dev',
      // The lab's labConfig (LAB_UI §12); a level brings its own (LEVELS §5.5.1).
      labConfig: LAB_CONFIG,
      mode: 'lab', screen: null, level: null,
      layout: 'compact', tab: 'cell', focusGene: ui.focusGene,
      cell: null, config: null, rec: null, recRecent: null, mem: null, gen0: 0,
      facts: BTC.observe.createFacts(),
      pending: new BTC.controls.Pending(),
      registry: [],
      speedHistory: [],
      markers: { n: 0, tick: new Int32Array(MARKER_CAP), kind: new Uint8Array(MARKER_CAP), prio: new Uint8Array(MARKER_CAP), label: new Array(MARKER_CAP).fill('') },
      bandList: [],
      bandModel: { n: 0, t0: new Float64Array(BAND_CAP), t1: new Float64Array(BAND_CAP), color: new Array(BAND_CAP).fill('drug-rif'), label: new Array(BAND_CAP).fill('') },
      // How this screen shows the cell's genes: order, letters, colours, names (BTC.content.geneModel).
      geneModel: null,
      narrKey: '', narrTick: -1, lastTick: -1,
      sinceSlow: 1, sinceSave: 0, resumeOnShow: false, paintQueued: false,
    };

    // --- progress and local telemetry (LEVELS §4.4, §11); every storage access is guarded ------
    const store = (() => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } })();
    app.progress = BTC.progress.create({
      storage: store, today: localDate, randomU32: () => newSeed(),
      deviceSeed: params.test && params.seed !== undefined ? params.seed : undefined,
    });
    app.tel = BTC.telemetry.create({ storage: store, now: () => performance.now(), session: BTC.telemetry.sessionId(window.crypto) });
    /** Logs an app event with the open level (if any) as its context. */
    app.logEvent = (type, d) => {
      const r = app.mode === 'level' && app.level ? app.level.runner : null;
      app.tel.setContext(r ? { lv: r.def.id, att: r.attempt, run: r.runs || null } : null);
      app.tel.log(type, d || {}, { tick: app.cell && app.mode !== 'home' ? app.cell.tick : null });
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
    /** The gene model for this cell and screen (hidden names, display order, colours; LEVELS §5.5.1). */
    function refreshGeneModel() {
      const ids = app.cell ? app.cell.observe().genes.map((g) => g.id) : C.GENE_IDS.slice();
      app.geneModel = C.geneModel(ids, app.labConfig);
      focusIdx = Math.max(0, ids.indexOf(app.focusGene));
    }
    app.refreshGeneModel = refreshGeneModel;
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
      refreshGeneModel();
      app.mem = BTC.narrate.createMemory({ phrases: C.narratorPhrases(app.geneModel), showNames: app.labConfig.showNames, dt: cell.dt });
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
    /** The focus gene's index in the cell's own gene list. */
    app.focusIndex = () => focusIdx;
    app.savePrefs = () => PR.saveUI(ui);     // the lab's preferences; a level's own settings are not saved

    app.setSpeed = (s) => {
      app.loop.setSpeed(s);
      app.ui.speed = s;
      app.savePrefs();
      logSpeed();
      app.logEvent('speed', { s });
      app.requestPaint();
    };
    /** The speeds this screen offers (a level may limit them, LEVELS §5.5.3). */
    app.speedList = () => {
      const so = app.labConfig.speedOptions;
      return so ? C.speeds.filter((x) => so.indexOf(x.s) >= 0) : C.speeds;
    };
    function logSpeed() {
      if (app.speedHistory.length < 500) app.speedHistory.push({ tick: app.cell.tick, speed: app.loop.speed, running: app.loop.running });
    }
    app.pause = () => { app.loop.stop(); afterRunChange(); app.logEvent('pause', {}); };
    app.resume = () => {
      if (!app.canRun() || app.ff) return;
      app.loop.start(); afterRunChange(); app.logEvent('resume', {});
    };
    /** Time may run: always in the lab; in a level only while its run (or demo, epilogue, or live Prologue scene) is on. */
    app.canRun = () => {
      if (app.mode !== 'level' || !app.level) return true;
      if (app.level.live) return true;
      const r = app.level.runner;
      if (r.phase === 'demo') return !!r.demo.cell && app.cell === r.demo.cell && !r.halted();
      return !!r.run && app.cell === r.run.cell && (r.phase === 'run' || r.phase === 'epilogue') && !r.halted();
    };
    function afterRunChange() {
      logSpeed();
      views.status.update(app.cell.observe(), app.facts);     // the button answers the tap at once
      app.refreshControls();
      app.requestPaint();
    }
    app.togglePause = () => (app.loop.running ? app.pause() : app.resume());

    app.setFocus = (id) => {
      if (id === app.focusGene || !app.geneVisible(id)) return;
      app.focusGene = id; app.ui.focusGene = id;
      focusIdx = Math.max(0, app.geneModel ? app.geneModel.ids.indexOf(id) : C.GENE_IDS.indexOf(id));
      const gg = app.ui.graphGenes;
      if (gg.indexOf(id) < 0) { if (gg.length >= 3) gg.shift(); gg.push(id); }
      app.logEvent('focus', { gene: id });
      app.savePrefs();
      views.genes.updateFocus();
      views.graphs.syncControls();
      views.graphs.redraw();
      views.cellView.dirty = true;
      app.refreshControls();
      app.requestPaint();
    };
    app.toggleGraphGene = (id) => {
      const gg = app.ui.graphGenes, i = gg.indexOf(id);
      if (i >= 0) { if (gg.length > 1) gg.splice(i, 1); } else { gg.push(id); if (gg.length > 3) gg.shift(); }
      app.savePrefs();
      views.graphs.syncControls();
      views.graphs.redraw();
    };
    app.setWindow = (s) => { app.ui.window = s; app.savePrefs(); views.graphs.syncControls(); views.graphs.redraw(); };

    // --- what a level lets the student see and change (LEVELS §5.5.1) --------------------
    app.geneVisible = (id) => {
      const gv = app.labConfig.genesVisible;
      return gv === 'all' || !Array.isArray(gv) || gv.indexOf(id) >= 0;
    };
    /** 'free' | 'locked' (dial shown, disabled) | 'readonly' (set by the DNA) | 'none' (no gene controls, or a background gene). */
    app.geneControlMode = (id) => {
      const lc = app.labConfig;
      if (!app.geneVisible(id)) return 'none';
      if (lc.readOnlyGenes) return 'readonly';
      if (lc.controls && lc.controls.genes === false) return 'none';
      if (lc.lockedGenes && lc.lockedGenes.indexOf(id) >= 0) return 'locked';
      // A level may lock the student's controls from inside the run (1.2's deadline, setControls R-E11).
      if (app.mode === 'level' && app.cell && app.cell.controls === 'locked') return 'locked';
      return 'free';
    };

    // --- commands and controls (LAB_UI §3.4) ---------------------------------------
    /** Sends a command; the control shows pending until the engine applies it. */
    app.send = (cmd, key, valueKey) => {
      const r = app.cell.command(cmd);
      if (r.ok) app.pending.set(key, r.seq, valueKey);
      else LY.toast(C.rejections[r.error] || C.rejections['bad-value']);
      if (app.mode === 'level') app.levelChanged();
      app.refreshControls();
      app.requestPaint();
      return r;
    };

    /** The default promoter level of a gene in the current cell's strain (the dial's default mark). */
    const defaultLevelOf = (id) => {
      const strain = (app.cell && app.cell.config && app.cell.config.strain) || 'm1-lab';
      const g = (BTC.catalog.STRAINS[strain] || BTC.catalog.STRAINS['m1-lab']).genes.find((x) => x.id === id);
      return g ? g.defaultLevel : 0;
    };
    const levelKey = (level) => (level === 'off' ? 'off' : level === null || level === undefined ? null : String(level));

    /** A promoter control for the gene getGene() returns (a card's own gene, or the focus gene). */
    app.makePromoterControl = (getGene, where) => {
      const allowed = app.labConfig.allowedLevels;
      const options = C.levels.filter((l) => !allowed || allowed.indexOf(l.value) >= 0)
        .map((l) => ({ key: l.key, label: l.label, spoken: C.levelSpoken[l.value] }));
      const ctrl = BTC.controls.segmented({
        label: C.card.promoter, options,
        onSelect: (key) => {
          const id = getGene();
          app.send({ type: 'setPromoter', gene: id, level: key === 'off' ? 'off' : Number(key) }, id, key);
        },
        className: 'promoter',
      });
      app.registry.push({
        ctrl, key: getGene, where, locked: () => app.geneControlMode(getGene()) === 'locked',
        read: (view) => (view.geneById[getGene()] ? levelKey(view.geneById[getGene()].level) : null),
        defaultKey: () => {
          const lv = defaultLevelOf(getGene());
          return levelKey(lv === 0 ? 'off' : lv);
        },
      });
      return ctrl;
    };

    /** A medium or drug control: key is the pending key, read(view) the current option, send(key) the command. */
    app.makeControl = (o) => {
      const ctrl = BTC.controls.segmented({ label: o.label, options: o.options, onSelect: (k) => app.send(o.send(k), o.key, k) });
      app.registry.push({ ctrl, key: () => o.key, read: o.read, where: 'medium', locked: o.locked ? () => true : null });
      return ctrl;
    };

    app.refreshControls = () => {
      const view = app.cell.observe(), running = app.loop.running;
      for (const r of app.registry) {
        const key = r.key(), pend = app.pending.get(key);
        const locked = r.locked ? r.locked() : false;
        const note = locked ? C.card.locked : pend && !running && r.where !== 'focus' ? C.card.pending : '';
        r.ctrl.update(r.read(view), pend ? pend.value : null, note);
        if (r.lastLocked !== locked) {
          r.lastLocked = locked;
          for (const b of r.ctrl.buttons) b.disabled = locked;
        }
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
        // With names hidden (1.1) a command is marked with the gene's letter until its job has been seen.
        const tag = app.geneModel && app.geneModel.ids.indexOf(a.gene) >= 0 ? app.geneModel.words(a.gene).tag : C.genes[a.gene] ? C.genes[a.gene].symbol : a.gene;
        return F.fill(G.promoter, { symbol: tag, level: r.level === null ? '' : lv[r.level] });
      }
      if (ev.cmdType === 'setMedium') {
        for (const f of ['glucose', 'lactose', 'aminoAcids']) {
          if (a[f + '_mM'] === undefined) continue;
          const key = BTC.MediumPanel.keyFor(BTC.catalog.MEDIUM_PRESETS[f], r[f + '_mM']);
          return F.fill(G[f], { v: key });
        }
      }
      if (ev.cmdType === 'setDrug') return F.fill(G.drug, { drug: r.drug, v: BTC.MediumPanel.keyFor(BTC.catalog.DRUG_PRESETS, r.dose) });
      // A level's schedule locking or freeing the controls (1.2's deadline) is marked in words, never by the command's name.
      if (ev.cmdType === 'setControls') return r.controls === 'locked' ? G.locked : G.unlocked;
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
      // A level's schedule (1.7's sugar phases, labConfig.bands): the phases that have started, up to now; future ones are not drawn.
      const lb = app.labConfig.bands;
      if (Array.isArray(lb)) {
        for (const b of lb) {
          if (bm.n >= BAND_CAP || b.t0 > tick) continue;
          bm.t0[bm.n] = b.t0 * dt; bm.t1[bm.n] = Math.min(b.t1, tick) * dt; bm.color[bm.n] = b.token || 'accent'; bm.label[bm.n] = b.label || '';
          bm.n++;
        }
      }
      for (const b of app.bandList) {
        if (bm.n >= BAND_CAP) break;
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
            // A level's phase change (1.7) is drawn as the edge of its band, labelled with the phase: no marker on top.
            if (!(ev.cmdType === 'setMedium' && Array.isArray(app.labConfig.bands) && app.labConfig.bands.some((b) => b.t0 === ev.tick))) {
              addMarker(ev.tick, MK_COMMAND, commandLabel(ev), ev.cmdType === 'setMedium' && ev.args && ev.args.glucose_mM !== undefined ? 4 : PRIO[ev.cmdType] || 1);
            }
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
        const out = BTC.narrate.narrate(app.facts, app.mem, tick, app.levelRules || undefined);
        app.narrKey = out.key;
        const rule = RULE[out.key] || (app.levelRules && app.levelRules.find((x) => x.key === out.key));
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
        if (app.sinceSave >= AUTOSAVE_S) { app.sinceSave = 0; app.autosaveNow(); }
      }
      if (app.mode === 'level') levelFrame(dtReal, force);
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
    /** The tabs of this layout that the screen's labConfig.tabs allows. */
    function tabsFor(L) {
      const allowed = app.labConfig.tabs || LAB_CONFIG.tabs;
      return LY.TABS[L].filter((t) => allowed.indexOf(t) >= 0);
    }
    function mapTab(tab, L) {
      const list = tabsFor(L);
      if (list.indexOf(tab) >= 0) return tab;
      const m = LY.mapTab(tab, L);
      return list.indexOf(m) >= 0 ? m : (list[0] || 'cell');
    }
    function applyTab() {
      const L = app.layout, tab = app.tab;
      const compact = L === 'compact';
      const allowed = app.labConfig.tabs || LAB_CONFIG.tabs;
      // Only the cell (the Prologue's live scenes): no tab bar, the cell view takes the screen.
      const cellOnly = compact ? tabsFor(L).length <= 1 : tabsFor(L).length === 0 && allowed.indexOf('graphs') < 0;
      document.body.toggleAttribute('data-cellonly', cellOnly);
      $('stage-wrap').hidden = compact && tab !== 'cell';
      for (const name of ['genes', 'medium', 'graphs']) {
        const on = allowed.indexOf(name) >= 0 && (tab === name || (name === 'graphs' && L === 'wide'));
        $('pane-' + name).hidden = !on;
      }
      document.querySelectorAll('[data-tab]').forEach((b) => {
        const on = b.getAttribute('data-tab') === tab;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle('is-on', on);
        b.hidden = allowed.indexOf(b.getAttribute('data-tab')) < 0;
      });
      document.querySelectorAll('#paneltabs [data-tab="graphs"]').forEach((b) => { b.hidden = L === 'wide' || allowed.indexOf('graphs') < 0; });
      views.cellView.setVisible(!$('stage-wrap').hidden);
      views.genes.setVisible(!$('pane-genes').hidden);
      views.medium.setVisible(!$('pane-medium').hidden);
      views.graphs.setVisible(!$('pane-graphs').hidden);
      app.requestPaint();
    }
    app.setTab = (tab) => {
      app.tab = mapTab(tab, app.layout);
      app.ui.tab = tab;
      app.savePrefs();
      app.logEvent('tab', { name: app.tab });
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
      app.tab = mapTab(app.ui.tab, L);
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
          body.appendChild(h('p', { text: S.lactoseLag }));
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
      try { app.logEvent('error', { msg: String(err && err.message || err).slice(0, 200) }); } catch (e) { /* ignored */ }
      LY.toast(C.pwa.error, app.mode === 'lab' ? { label: C.pwa.resumedAction, run: () => app.openStartOver() } : undefined);
    };

    // --- screens: home, lab and level (LEVELS §5.1, §5.11, §9 item 1) ------------------------
    const surfaces = () => ({ home: $('home'), prologue: $('prologue'), app: $('app') });
    /** Which part of the page is shown: 'home', 'app' (the lab screen), 'prologue' (a drawing) or 'none'. */
    function showSurface(name) {
      const s = surfaces();
      const wasHidden = s.app.hidden;
      s.home.hidden = name !== 'home';
      s.prologue.hidden = name !== 'prologue';
      s.app.hidden = name !== 'app';
      document.body.setAttribute('data-surface', name);
      if (name === 'app' && wasHidden) { relayout.done = false; relayout(); views.cellView.resize(); }
    }
    function setScreen(name) {
      if (app.screen === name) return;
      app.screen = name;
      ui.screen = name;
      app.savePrefs();
      app.logEvent('screen', { name });
    }
    app.autosaveNow = () => {
      if (app.mode === 'lab') BTC.pwa.autosave(app);
      else if (app.mode === 'level') saveLevelNow();
    };
    app.shouldHalt = () => app.mode === 'level' && !!app.level && !app.level.live && app.level.runner.halted();

    /** The lab's cell, recorders, markers and pending controls stay as they are while a level is open. */
    let labBundle = null;
    function stashLab() {
      if (app.mode !== 'lab' || !app.cell) return;
      BTC.pwa.autosave(app);
      const m = app.markers;
      labBundle = {
        cell: app.cell, config: app.config, rec: app.rec, recRecent: app.recRecent, mem: app.mem, gen0: app.gen0, facts: app.facts,
        pending: app.pending, bandList: app.bandList.slice(), focusGene: app.focusGene,
        markers: { n: m.n, tick: m.tick.slice(), kind: m.kind.slice(), prio: m.prio.slice(), label: m.label.slice() },
      };
    }
    function unstashLab() {
      const b = labBundle;
      labBundle = null;
      Object.assign(app, { cell: b.cell, config: b.config, rec: b.rec, recRecent: b.recRecent, mem: b.mem, gen0: b.gen0, facts: b.facts, pending: b.pending });
      const m = app.markers;
      m.n = b.markers.n; m.tick.set(b.markers.tick); m.kind.set(b.markers.kind); m.prio.set(b.markers.prio);
      for (let i = 0; i < m.label.length; i++) m.label[i] = b.markers.label[i];
      app.bandList.length = 0;
      for (const x of b.bandList) app.bandList.push(x);
      app.narrTick = -1; app.lastTick = -1;
    }

    /** Rebuilds the panels for the screen's labConfig (cards, rows, chips and dials come from it). */
    function remountPanels() {
      app.registry.length = 0;
      for (const id of ['pane-genes', 'pane-medium', 'pane-graphs', 'focusbar']) $(id).textContent = '';
      views.genes = new BTC.GenesPanel(app); views.genes.mount($('pane-genes'));
      views.medium = new BTC.MediumPanel(app); views.medium.mount($('pane-medium'));
      views.graphs = new BTC.GraphsPanel(app); views.graphs.mount($('pane-graphs'));
      views.cellView.mountFocusBar($('focusbar'));
      views.cellView.reset();
      document.body.toggleAttribute('data-hud', !!app.labConfig.hud);
      relayout.done = false;
      relayout();
      app.refreshControls();
    }
    function resetNarrator() { hold.reset(); narrView.key = null; }

    app.enterLab = () => {
      LY.closeSheet();
      app.loop.stop();
      if (app.level) { saveLevelNow(); closeLevel(); }
      if (labBundle) unstashLab();
      app.mode = 'lab';
      app.labConfig = LAB_CONFIG;
      app.levelRules = null;
      app.ui = ui;
      app.focusGene = ui.focusGene;
      refreshGeneModel();
      app.loop.setSpeed(ui.speed);
      views.status.setLevel(null);
      setScreen('lab');
      showSurface('app');
      remountPanels();
      resetNarrator();
      app.requestPaint();
    };

    app.enterHome = () => {
      LY.closeSheet();
      app.loop.stop();
      if (app.mode === 'lab') stashLab();
      if (app.level) { saveLevelNow(); closeLevel(); }
      app.mode = 'home';
      setScreen('home');
      views.home.render();
      showSurface('home');
    };

    const runnerOpts = () => ({ deviceSeed: app.progress.deviceSeed, telemetry: app.tel, speed: () => app.loop.speed });

    /**
     * Opens a level: its open attempt (resumed from the level autosave when it matches), a new
     * attempt, or with opts.v (?v=) the think-aloud override, attempt 0. opts.fresh: Play again.
     */
    app.enterLevel = (id, opts) => {
      const o = opts || {};
      const def = BTC.levels.byId[id];
      if (!def) { LY.toast(C.game.missing); if (app.screen !== 'home') app.enterHome(); return; }
      LY.closeSheet();
      app.loop.stop();
      if (app.mode === 'lab') stashLab();
      if (app.level) { saveLevelNow(); closeLevel(); }
      const overrideSeed = o.v !== undefined && o.v !== null ? BTC.code.decodeSeed(String(o.v)) : null;
      const ref = o.fresh ? app.progress.nextAttempt(id) : app.progress.attemptFor(id, overrideSeed);
      let runner = null, resumed = false;
      if (!o.fresh && overrideSeed === null && !ignoreLevelSave) {
        const saved = app.progress.loadLevel(BTC.ENGINE_VERSION);
        if (saved.status === 'mismatch') LY.toast(C.game.updated);
        else if (saved.status === 'ok' && saved.save.levelId === id && saved.save.attempt === ref.attempt &&
          (!def.scored || saved.save.variantSeed === ((ref.variantSeed >>> 0) & 0x3FFFFFFF))) {
          try { runner = BTC.LevelRunner.restore(def, saved.save, runnerOpts()); resumed = true; } catch (e) { runner = null; }
        }
      }
      ignoreLevelSave = false;
      if (!runner) {
        runner = new BTC.LevelRunner(Object.assign(runnerOpts(), { def, variantSeed: ref.variantSeed, attempt: ref.attempt, override: ref.override }));
        runner.start();
      }
      app.progress.open(id, ref);
      openLevel(def, runner);
      if (resumed) LY.toast(F.fill(C.game.resumed, { id: BTC.HomeView.nameOf(def) }));
    };
    let ignoreLevelSave = !!params.reset;          // ?reset=1: the first level opened starts afresh

    function openLevel(def, runner) {
      app.mode = 'level';
      app.level = { def, runner, live: false, lastEnd: null, sinceHud: 1, dirtyAt: null, lcKey: null };
      setScreen('level');
      views.levelUI.bind(runner);
      views.status.setLevel(views.levelUI.title());
      saveLevelNow();
      views.levelUI.sync();
      startParIdle();
    }
    /**
     * 1.7's par run (the reference design on the student's schedule and seed) is worked out in idle
     * frames, at most 4 ms each, from the moment the level opens (LEVELS §7.7.4).
     */
    function startParIdle() {
      const L = app.level;
      if (!L || !L.runner.hasPar() || L.runner.par.done || L.parRaf) return;
      const frame = () => {
        const M = app.level;
        if (!M || M !== L) return;
        L.parRaf = 0;
        try { L.runner.parStep(4); } catch (e) { app.onError(e); return; }
        if (L.runner.par.done) {
          saveLevelNow();
          if (L.runner.phase === 'result') views.levelUI.sync();
          return;
        }
        L.parRaf = requestAnimationFrame(frame);
      };
      L.parRaf = requestAnimationFrame(frame);
    }
    function closeLevel() {
      stopRunToEnd();
      if (app.level && app.level.parRaf) cancelAnimationFrame(app.level.parRaf);
      views.levelUI.unbind();
      views.prologue.reset();
      app.level = null;
      app.levelRules = null;
      views.status.setLevel(null);
      document.body.removeAttribute('data-hud');
    }

    /** Start this level again (the level menu): the same attempt and variant, from the intro. */
    app.restartLevel = () => {
      const L = app.level;
      if (!L) return;
      app.loop.stop();
      const r = L.runner;
      const nr = new BTC.LevelRunner(Object.assign(runnerOpts(), { def: r.def, variantSeed: r.variantSeed, attempt: r.attempt, override: r.override }));
      nr.start();
      closeLevel();
      openLevel(r.def, nr);
    };
    app.playAgain = () => { if (app.level) app.enterLevel(app.level.def.id, { fresh: true }); };
    app.retryRun = () => {
      const r = app.level && app.level.runner;
      if (!r) return;
      app.loop.stop();
      if (r.retry().ok) views.levelUI.after();
    };
    /** The Levels button: during a run, first ask (§4.5). */
    app.leaveLevel = () => {
      const r = app.level && app.level.runner;
      const go = () => {
        if (r && r.phase === 'run' && r.run && !r.run.endReason) app.logEvent('run_end', { reason: 'leave', ticks: r.run.cell.tick });
        saveLevelNow();
        app.enterHome();
      };
      if (r && (r.phase === 'run' || r.phase === 'epilogue') && !r.halted()) views.levelUI.confirmLeave(go);
      else go();
    };

    function saveLevelNow() {
      const L = app.level;
      if (!L) return;
      L.dirtyAt = null;
      if (L.runner.phase === 'complete') return;       // a finished attempt lives in progress, not in the autosave
      app.progress.saveLevel(Object.assign(L.runner.save(), { engineVersion: BTC.ENGINE_VERSION, build: app.build }));
    }
    app.levelPhaseChanged = () => { saveLevelNow(); app.tel.flush(); };
    app.saveLevel = () => saveLevelNow();          // a locked answer is saved at once (§4.4)
    app.levelChanged = () => { if (app.level && app.level.dirtyAt === null) app.level.dirtyAt = performance.now(); };
    app.levelCompleted = (r) => {
      app.progress.complete(r.def.id, r.result);
      app.progress.addCards(r.cards);
      app.progress.clearLevel();
      app.logEvent('code', { code: r.code, action: 'shown' });
      app.tel.flush();
    };
    app.downloadLevelRun = () => {
      const r = app.level && app.level.runner;
      if (!r) return;
      const file = r.runFile({ build: app.build, ui: { layout: app.layout, speedHistory: app.speedHistory }, telemetry: app.tel.forAttempt(r.def.id, r.attempt) });
      BTC.pwa.deliverFile(JSON.stringify(file), r.fileName(), C.pwa.shareTitle);
      app.logEvent('download', { kind: 'run' });
    };
    app.exportData = () => {
      const file = { format: 'btc-export', v: 1, progress: app.progress.export(), telemetry: app.tel.all() };
      BTC.pwa.deliverFile(JSON.stringify(file), 'be-the-cell-data-' + localDate() + '.json', C.home.exportTitle);
      app.logEvent('download', { kind: 'export' });
    };
    app.setTheme = (k) => { ui.theme = k; app.savePrefs(); applyTheme(); };
    app.setMotion = (k) => { ui.reducedMotion = k; app.savePrefs(); applyMotion(); };

    /** Puts a level's cell on the lab screen with the level's labConfig (a run, a retry, the Prologue's live cell). */
    function attachLevelCell(r, cell) {
      app.loop.stop();
      const lc = levelConfig(r.labConfig());
      app.labConfig = lc;
      if (app.level) app.level.lcKey = JSON.stringify(lc);
      app.levelRules = r.narratorRules();
      app.pending = new BTC.controls.Pending();
      attach(cell);
      app.config = cell.config;
      const visible = app.geneModel.visible;
      const focus = lc.focusGene && visible.indexOf(lc.focusGene) >= 0 ? lc.focusGene : visible[0] || 'fliC';
      app.ui = Object.assign({}, ui, {
        speed: lc.defaultSpeed || 60, tab: lc.initialTab || 'cell', focusGene: focus,
        window: lc.graphWindow !== null && lc.graphWindow !== undefined ? lc.graphWindow : 600,
        graphGenes: (lc.graphGenes || [focus]).filter((id) => visible.indexOf(id) >= 0).slice(0, 3),
        logScales: Object.assign({}, PR.DEFAULTS.logScales),
      });
      if (!app.ui.graphGenes.length) app.ui.graphGenes = [focus];
      app.focusGene = focus; focusIdx = Math.max(0, app.geneModel.ids.indexOf(focus));
      app.loop.setSpeed(app.ui.speed);
      remountPanels();
      resetNarrator();
      logSpeed();
      if (lc.startPaused === false && app.canRun()) app.resume();
      app.requestPaint();
    }

    /**
     * A level's labConfig can change while its cell stays (1.1 names a gene once its protein's job is
     * seen; a phase may lock a dial): the panels are rebuilt and the narrator gets the new names.
     */
    function refreshLevelConfig(r) {
      const L = app.level;
      if (!L || L.live || !r.run || app.cell !== r.run.cell) return;
      const lc = levelConfig(r.labConfig());
      const key = JSON.stringify(lc);
      if (key === L.lcKey) return;
      const before = app.labConfig.revealed || {};
      L.lcKey = key;
      app.labConfig = lc;
      refreshGeneModel();
      app.mem.phrases = C.narratorPhrases(app.geneModel);
      app.mem.showNames = lc.showNames !== false;
      app.mem.cache = {};
      remountPanels();
      views.cellView.dirty = true;
      // A newly named gene gets a toast, with its letter and its name (not at the end, when all are named at once).
      const fresh = Object.keys(lc.revealed || {}).filter((id) => !before[id]);
      if (fresh.length === 1 && r.phase !== 'complete') {
        const id = fresh[0];
        LY.toast(F.fill(C.game.reveal, { letter: app.geneModel.letter(id), name: C.genes[id].name }));
        app.logEvent('reveal', { gene: id, letter: app.geneModel.letter(id) });
      }
      app.requestPaint();
    }

    /** The surface behind the level sheets for the runner's state (LevelUI.sync calls it). */
    app.showLevelScreen = (r) => {
      const L = app.level;
      if (!L) return;
      if (r.phase === 'scenes') {
        const info = r.sceneInfo();
        if (info.scene.live) {
          if (!L.live) {
            L.live = true;
            attachLevelCell(r, BTC.game.makeCell(r.def.config(r.variant, 'task', r.extra())));
          }
          showSurface('app');
        } else {
          if (L.live) { L.live = false; app.loop.stop(); }
          views.prologue.show(info.scene, r.def, views.levelUI.title());
          showSurface('prologue');
        }
        return;
      }
      if (L.live) { showSurface('app'); return; }        // the Prologue's bacterium stays behind its completion screen
      if (r.phase === 'demo') {
        // 1.2's scripted test run: its own cell, with the student's sketch over the Protein plot.
        if (!r.demo.cell) r.startDemo();
        if (app.cell !== r.demo.cell) { attachLevelCell(r, r.demo.cell); sketchOverlay(r); }
        showSurface('app');
        updateHud(true);
        views.status.update(app.cell.observe(), app.facts);
        return;
      }
      const cell = r.run ? r.run.cell : null;
      if (!cell) { showSurface('none'); return; }
      if (app.cell !== cell) attachLevelCell(r, cell);
      else refreshLevelConfig(r);
      showSurface('app');
      updateHud(true);
      views.status.update(app.cell.observe(), app.facts);
    };

    /** The student's locked sketch over the demo's Protein plot, dashed, with its legend (§5.4.3). */
    function sketchOverlay(r) {
      const it = r.def.predictions.find((x) => x.kind === 'sketch');
      const a = it && r.answers[it.id];
      if (!a || !a.locked) return;
      const S = C.game.sketch;
      views.graphs.setOverlay('protein', a.value.map((p) => (p ? [p[0] * 60, p[1]] : null)), {
        color: 'muted', dash: [6, 5], width: 2, legend: [{ text: S.sketch, dash: [6, 5], color: 'muted' }, { text: S.cell, color: 'g-lacY' }],
      });
    }

    function hudMode(r) {
      if (app.ff) return 'fast';
      if (r.phase === 'run' && r.run && r.run.endReason && r.goal) return 'met';
      if (r.phase === 'epilogue' && r.epilogue.done) return 'continue';
      if (r.phase === 'demo' && r.demo.done) return 'continue';
      return null;
    }
    function updateHud() {
      const L = app.level;
      if (!L || !app.labConfig.hud) return;
      const r = L.runner;
      const model = r.hud();
      // "Run to the end" (1.7) is offered only while the run can go on; while it runs, it shows its progress.
      if (model && model.action && !(r.phase === 'run' && !r.halted() && !r.beat)) model.action = null;
      if (model && model.action && app.ff) model.action = Object.assign({}, model.action, { progress: app.ff.pct });
      views.hud.update(model, window.innerWidth, hudMode(r));
    }

    /**
     * "Run to the end" (LEVELS §7.7.2): the rest of the run in chunks of at most 8 ms of engine time
     * per frame, with its progress in the HUD; the cell view and graphs are painted at the end. A
     * second tap stops it where it is (paused).
     */
    function stopRunToEnd() {
      if (!app.ff) return;
      if (app.ff.raf) cancelAnimationFrame(app.ff.raf);
      app.ff = null;
      document.body.removeAttribute('data-ff');
    }
    app.runToEnd = () => {
      const L = app.level, r = L && L.runner;
      if (app.ff) { stopRunToEnd(); resetNarrator(); app.render(0, true, true, 0); updateHud(); return; }
      if (!r || r.phase !== 'run' || !app.canRun() || r.beat) return;
      app.loop.stop();
      const total = r.def.par && r.def.par.ticks ? r.def.par.ticks(r.variant) : null;
      app.ff = { raf: 0, pct: 0 };
      document.body.setAttribute('data-ff', '');
      app.logEvent('speed', { s: 'end' });
      const frame = () => {
        if (!app.ff) return;
        app.ff.raf = 0;
        const t0 = performance.now();
        try {
          let n = 0;
          while (!app.shouldHalt()) { app.cell.step(); if ((++n & 31) === 0 && performance.now() - t0 >= 8) break; }
          app.onEvents(app.cell.takeEvents());
        } catch (err) { stopRunToEnd(); app.onError(err); return; }
        app.ff.pct = total ? Math.min(100, Math.floor((100 * app.cell.tick) / total)) : 0;
        if (app.shouldHalt()) {
          stopRunToEnd();
          // The narrator's held line is hours old by now: let it read the cell afresh.
          resetNarrator();
          app.render(0, true, true, 0);
          updateHud();
          return;
        }
        updateHud();
        app.ff.raf = requestAnimationFrame(frame);
      };
      updateHud();
      app.ff.raf = requestAnimationFrame(frame);
    };
    /** The goal chip: the task card, or Continue once the run (or the epilogue) is over. */
    function hudGoalTap() {
      const r = app.level && app.level.runner;
      if (!r) return;
      if (r.phase === 'demo' && r.demo.done) views.levelUI.sync();     // its sheet carries the Continue
      else if (hudMode(r)) { r.next(); views.levelUI.after(); }
      else views.levelUI.task(true);
    }

    /** The 1.4 epilogue: the student's one command (switch the gene off, logged), then 12 game-min at 1 s = 1 min. */
    app.startEpilogue = () => {
      const r = app.level && app.level.runner;
      if (!r || r.phase !== 'epilogue' || r.epilogue.started || !r.run || app.cell !== r.run.cell) return;
      const cmd = r.def.epilogue && r.def.epilogue.command;
      if (cmd) app.send(Object.assign({}, cmd), cmd.gene || 'epilogue', 'off');
      r.startEpilogue();
      saveLevelNow();
      views.levelUI.after();
      if (r.def.epilogue && r.def.epilogue.speed) app.setSpeed(r.def.epilogue.speed);
      app.resume();
    };
    /** Per frame in a level: the end of a run, the HUD (≤ 4 Hz), the debounced autosave, a changed labConfig (1.1's reveals). */
    function levelFrame(dtReal, force) {
      const L = app.level;
      if (!L) return;
      const r = L.runner;
      if (force || L.sinceHud + dtReal >= 0.25) refreshLevelConfig(r);
      if (r.phase === 'run' && r.run && r.run.endReason && L.lastEnd !== r.run.endTick + ':' + r.runs) {
        L.lastEnd = r.run.endTick + ':' + r.runs;
        if (app.loop.running) app.loop.stop();
        saveLevelNow();
        views.status.update(app.cell.observe(), app.facts);
        if (!r.goal) { r.next(); views.levelUI.after(); }    // a missed goal opens the result; a met one waits on the goal chip
      }
      if (r.phase === 'epilogue' && r.epilogue.done && app.loop.running) app.loop.stop();
      // The demo stops at its end tick (halt); then its sheet opens.
      if (r.phase === 'demo' && r.demo.cell && !r.demo.done && r.halted()) {
        r.checkDemo();
        if (app.loop.running) app.loop.stop();
        saveLevelNow();
        views.levelUI.after();
      }
      L.sinceHud += dtReal;
      if (force || L.sinceHud >= 0.25) { L.sinceHud = 0; updateHud(); }
      if (L.dirtyAt !== null && performance.now() - L.dirtyAt >= 2000) saveLevelNow();
    }

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
      halt: () => app.shouldHalt(),
    });
    views.status = new BTC.StatusStrip(app);
    views.home = new BTC.HomeView(app);
    views.prologue = new BTC.PrologueView(app);
    views.levelUI = new BTC.LevelUI(app);
    views.hud = new BTC.Hud({ onGoal: () => hudGoalTap(), onAction: (id) => { if (id === 'runToEnd') app.runToEnd(); } });
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
      lacInset: $('lac-inset'),
    });
    views.genes.mount($('pane-genes'));
    views.medium.mount($('pane-medium'));
    views.graphs.mount($('pane-graphs'));
    views.home.mount($('home'));
    views.prologue.mount($('prologue'));
    views.hud.mount($('hud'));
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
      if (app.screen === 'home' || $('app').hidden) return;
      const t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ' && (tag === 'BODY' || tag === 'CANVAS' || !t)) { e.preventDefault(); app.togglePause(); }
      const n = Number(e.key), list = app.speedList();
      if (n >= 1 && n <= list.length) app.setSpeed(list[n - 1].s);     // digits never activate a focused button
    });

    // Background tabs: stop and save; simulated time does not pass while hidden, and there is no catch-up.
    function hide() {
      if (app.loop.running) { app.resumeOnShow = true; app.loop.stop(); }
      app.autosaveNow();
      app.tel.flush();
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
    app.logEvent('session_start', {
      date: localDate(), build: app.build, engine: BTC.ENGINE_VERSION, layout: app.layout, w: window.innerWidth, h: window.innerHeight,
      standalone: !!((typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true),
      touch: 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0, reducedMotion: app.reducedMotion(),
    });
    // The first screen (LEVELS §5.11): ?level, ?lab, else the last screen; a fresh install opens home.
    const lastScreen = ui.screen;
    if (params.level) app.enterLevel(params.level, { v: params.v });
    else if (params.lab || (lastScreen === 'lab' && !params.test)) { setScreen('lab'); showSurface('app'); }
    else if (lastScreen === 'level' && !params.reset) {
      const s = app.progress.loadLevel(BTC.ENGINE_VERSION);
      if (s.status === 'ok' && BTC.levels.byId[s.save.levelId]) app.enterLevel(s.save.levelId);
      else { if (s.status === 'mismatch') LY.toast(C.game.updated); app.enterHome(); }
    } else app.enterHome();
    // Only a cell that has been run or changed is worth announcing (an untouched one is saved on every visit).
    if (app.screen === 'lab' && restored && (saved.snapshot.tick > 0 || (saved.snapshot.log && saved.snapshot.log.length > 0) || app.cell.pending.length > 0)) {
      LY.toast(C.pwa.resumed, { label: C.pwa.resumedAction, run: () => app.openStartOver() });
    }
    BTC.pwa.register({ test: params.test, build: window.BTC_BUILD });

    // Debug hook; cell is a getter because reset replaces the cell.
    window.__btc = { get cell() { return app.cell; }, BTC, app };

    if (params.test) {
      const stepN = (n) => {
        let k = 0;
        while (k < n && !app.shouldHalt()) { app.cell.step(); k++; }    // a level's cell stops where its run ends
        app.onEvents(app.cell.takeEvents());
        app.render(0, true, true, k * app.cell.dt);
        return app.cell.tick;
      };
      const R = () => (app.level ? app.level.runner : null);
      app.test = {
        runTicks: (n) => stepN(n),
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
        // Levels (LEVELS §9 item 12).
        level: {
          open(id, variantSeed) {
            app.enterLevel(id, variantSeed === undefined ? {} : { v: typeof variantSeed === 'number' ? BTC.code.encodeSeed(variantSeed) : variantSeed });
            return R() ? R().phase : null;
          },
          phase: () => (R() ? R().phase : null),
          runner: R,
          /** A prediction is locked; a debrief (or Prologue) question is tapped. Values are canonical option indices or 'ok'. */
          answer(itemId, value) {
            const r = R();
            const out = r.phase === 'debrief' || r.phase === 'scenes' ? r.tap(itemId, value) : r.lock(itemId, value);
            if (r.phase === 'predict' || r.phase === 'predict2') { if (!r.currentItem()) r.next(); }
            views.levelUI.after();
            return out;
          },
          /** Locks the current sketch item with points [[minute, value], …] (as if drawn and Done tapped). */
          sketch(points) {
            const r = R();
            const it = r.currentItem();
            if (!it || it.kind !== 'sketch') return { ok: false, reason: 'no sketch item now' };
            const out = r.lock(it.id, points);
            if (out.ok) { views.levelUI.dropSketch(); if (!r.currentItem()) r.next(); }
            views.levelUI.after();
            return out;
          },
          /** 1.4: taps "Switch LacY off" in the epilogue. */
          startEpilogue() { app.startEpilogue(); return R().epilogue.started; },
          /** 1.7: sets the design (in the design phase) as if edited; run() confirms it and moves to the run. */
          design(obj) { const ok = R().setDesign(obj); views.levelUI.after(); return ok; },
          runDesign() { views.levelUI.runDesign(); return R().phase; },
          /** 1.7: taps "Run to the end" and waits until the run has ended. */
          fastForward() {
            return new Promise((resolve) => {
              app.runToEnd();
              const poll = () => (app.ff ? requestAnimationFrame(poll) : resolve(app.cell.tick));
              poll();
            });
          },
          par: () => { const r = R(); return r && r.hasPar() ? { done: r.par.done, result: r.parResult() } : null; },
          runTicks: (n) => { const t = stepN(n); updateHud(); return t; },
          runToEnd() { let guard = 0; while (!app.shouldHalt() && guard++ < 1000) stepN(500); updateHud(); return app.cell.tick; },
          /** The sheet's main button: the next line, screen or phase. */
          next() {
            const r = R();
            if (r.phase === 'scenes') { if (r.sceneInfo().last) r.next(); else r.sceneNext(); }
            else if (r.beat) { if (r.storyLine().last) r.next(); else r.storyNext(); }
            else if (r.phase === 'echo' && !r.echoScreen().last) r.echoNext();
            else if (hudMode(r)) r.next();
            else r.next();
            views.levelUI.after();
            return r.phase;
          },
          code: () => (R() ? R().code : null),
          score: () => (R() ? R().result : null),
        },
      };
    }
    return app;
  }

  return { boot };
});
