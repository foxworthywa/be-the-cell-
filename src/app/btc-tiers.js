// @deps btc-content btc-format btc-layout btc-controls
/*
 * Be the Cell: the tiered screens (docs/PROLOGUE.md §5). Early levels show one or two big plain
 * counters and at most one simple graph; each later readout appears in the tier that introduces it,
 * with one plain sentence the first time it appears; the free-play lab opens in a Simple mode with
 * "All controls" one tap away.
 *
 * A level asks for a tier through labConfig.ui (§5.1):
 *
 *   ui = { tier: 1–5 | 'all',
 *          status: {clock, speed, energy, growth, sugarIn, generation, doubling},   // booleans; the speed chip always shows
 *          zoom: {levels: ['cell', 'gene', 'protein'], initial: 'cell'},           // read by the zoom control
 *          focusBar: {counters: ['mRNA', 'made', 'protein', 'rates'], control: 'onoff' | 'dial' | 'none', onLevel: 2},
 *          tabs: ['cell', 'genes', 'medium', 'graph'],                            // 'graph' is the single simple graph
 *          graph: {series: [{gene, kind: 'protein' | 'mRNA'}], target: {y, label} | null, zone: {lo, hi, labels} | null,
 *                  marks: [{t (s), label}], window: 'fit' | seconds, bands?: true} | null,
 *          genesPanel: 'simple' | 'full', mediumPanel: 'hidden' | 'simple' | 'full', spendBar: false,
 *          legend: 'short' | 'full', introduce: [readout ids of §5.2] }
 *
 * Anything a level leaves out comes from its tier's defaults (normalise). A labConfig without ui is
 * an older level: it gets the full M1 lab, so nothing breaks while levels are migrated.
 *
 * Pure (tested in Node, TI-1 and TI-2): normalise, validate, visibleReadouts, commandsExposed,
 * growthWord, sugarLevel, LEVEL_TABLE. DOM: TierBar, the focus bar of a tiered screen (big counters and
 * an Off/On switch or the dial).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'), require('./btc-controls.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.tiers = factory(B.content, B.format, B.layout, B.controls);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY, CTL) {
  'use strict';

  const READOUTS = Object.freeze(Object.keys(C.tiers.readouts));
  const COUNTERS = ['mRNA', 'made', 'protein', 'rates'];
  const CONTROLS = ['onoff', 'dial', 'none'];
  const TABS = ['cell', 'genes', 'medium', 'graph', 'graphs'];
  const STATUS = ['clock', 'speed', 'energy', 'growth', 'sugarIn', 'generation', 'doubling'];

  // What each tier shows when a level does not say (the columns of §5.3).
  const TIER = {
    1: { status: { energy: false, growth: false, sugarIn: false }, counters: ['mRNA', 'protein'], control: 'onoff', tabs: ['cell'],
      genesPanel: 'simple', mediumPanel: 'hidden', legend: 'short' },
    2: { status: { energy: true, growth: true, sugarIn: true }, counters: ['mRNA', 'protein'], control: 'onoff', tabs: ['cell', 'genes', 'medium'],
      genesPanel: 'simple', mediumPanel: 'simple', legend: 'short' },
    3: { status: { energy: true, growth: true, sugarIn: true }, counters: ['mRNA', 'made', 'protein'], control: 'onoff', tabs: ['cell', 'graph'],
      genesPanel: 'simple', mediumPanel: 'hidden', legend: 'short' },
    4: { status: { energy: true, growth: true, sugarIn: true }, counters: ['mRNA', 'protein'], control: 'dial', tabs: ['cell', 'graph'],
      genesPanel: 'simple', mediumPanel: 'simple', legend: 'full' },
    5: { status: { energy: true, growth: true, sugarIn: true }, counters: ['mRNA', 'protein'], control: 'none', tabs: ['cell', 'graph'],
      genesPanel: 'simple', mediumPanel: 'simple', legend: 'full' },
  };

  /**
   * §5.3, row by row: what each screen of the redesign shows (TI-1 checks a level's normalised ui against its row
   * once the level is built in the new pattern; the lab's Simple mode is the 'lab' row). introduce: the readouts
   * first shown there.
   */
  const LEVEL_TABLE = Object.freeze({
    P2: { tier: 1, status: { energy: true }, counters: ['mRNA', 'protein'], control: 'onoff', tabs: ['cell'], graph: false,
      introduce: ['counter.mRNA', 'counter.protein', 'legend', 'status.energy'] },
    '1.1': { tier: 2, counters: ['mRNA', 'protein'], control: 'onoff', tabs: ['cell', 'genes', 'medium'], graph: false,
      introduce: ['status.growth', 'readout.sugarIn'] },
    '1.2': { tier: 3, counters: ['mRNA', 'made', 'protein'], control: 'onoff', tabs: ['cell', 'graph'], graph: true,
      introduce: ['counter.made', 'graph.protein', 'graph.target'] },
    '1.4': { tier: 4, counters: ['mRNA', 'protein', 'rates'], control: 'dial', tabs: ['cell', 'graph'], graph: true,
      introduce: ['graph.zone', 'counter.rates', 'control.dial'] },
    '1.7': { tier: 5, counters: ['mRNA', 'protein'], control: 'none', tabs: ['cell', 'graph'], graph: true, introduce: ['bands.phases'] },
    lab: { tier: 4, counters: ['mRNA', 'protein'], control: 'dial', tabs: ['cell', 'genes', 'medium', 'graph'], graph: true, introduce: [] },
  });

  /** The lab's Simple mode (§5.4): tier 4 with every lever (all seven dials, the medium); only readouts and graph options hidden. */
  const LAB_UI = Object.freeze({
    tier: 4, focusBar: { counters: ['mRNA', 'protein'], control: 'dial' }, tabs: ['cell', 'genes', 'medium', 'graph'],
    graph: { series: [{ gene: 'focus', kind: 'protein' }], window: 'fit' }, genesPanel: 'simple', mediumPanel: 'simple', legend: 'full', introduce: [],
  });

  const clone = (x) => JSON.parse(JSON.stringify(x));

  /**
   * The full ui of a labConfig.ui (tier defaults filled in), or null for an older level (the full M1 lab).
   * fallbackTabs: the labConfig's own tabs, used when the ui names none.
   */
  function normalise(ui, fallbackTabs) {
    if (!ui || ui.tier === 'all') return null;
    const t = TIER[ui.tier] || TIER[4];
    const st = Object.assign({ clock: true, speed: true, generation: false, doubling: false }, t.status, ui.status || {});
    st.clock = true; st.speed = true;                    // time and its compression are always shown (honest scale)
    const fb = Object.assign({ counters: t.counters.slice(), control: t.control, onLevel: 2 }, ui.focusBar || {});
    const tabs = (ui.tabs || fallbackTabs || t.tabs).map((x) => (x === 'graphs' ? 'graph' : x));
    const graph = ui.graph ? Object.assign({ series: [], target: null, zone: null, marks: [], window: 'fit', bands: false }, clone(ui.graph)) : null;
    return {
      tier: ui.tier in TIER ? ui.tier : 4, status: st,
      zoom: Object.assign({ levels: ['cell', 'gene', 'protein'], initial: 'cell' }, ui.zoom || {}),
      focusBar: fb, tabs, graph: tabs.indexOf('graph') >= 0 ? graph : null,
      genesPanel: ui.genesPanel || t.genesPanel,
      mediumPanel: ui.mediumPanel || (tabs.indexOf('medium') >= 0 ? t.mediumPanel === 'hidden' ? 'simple' : t.mediumPanel : 'hidden'),
      spendBar: ui.spendBar === true, legend: ui.legend || t.legend, introduce: (ui.introduce || []).slice(),
    };
  }

  /** The labConfig.tabs of a tiered screen, in the app's tab ids (the simple graph lives in the Graphs pane). */
  function appTabs(u) { return u.tabs.map((x) => (x === 'graph' ? 'graphs' : x)).filter((x, i, a) => a.indexOf(x) === i); }

  /** The readouts a normalised ui shows (§5.2 ids). */
  function visibleReadouts(u) {
    if (!u) return READOUTS.slice();
    const out = ['legend'];
    const c = u.focusBar.counters;
    if (c.indexOf('mRNA') >= 0) out.push('counter.mRNA');
    if (c.indexOf('protein') >= 0) out.push('counter.protein');
    if (c.indexOf('made') >= 0) out.push('counter.made');
    if (c.indexOf('rates') >= 0) out.push('counter.rates');
    if (u.focusBar.control === 'dial') out.push('control.dial');
    if (u.status.energy) out.push('status.energy');
    if (u.status.growth) out.push('status.growth');
    if (u.status.sugarIn) out.push('readout.sugarIn');
    if (u.status.doubling) out.push('status.doubling');
    if (u.graph) {
      if (u.graph.series.some((x) => x.kind === 'protein')) out.push('graph.protein');
      if (u.graph.target) out.push('graph.target');
      if (u.graph.zone) out.push('graph.zone');
      if (u.graph.bands) out.push('bands.phases');
    }
    return out;
  }

  /** Problems with a labConfig.ui ([] when valid): known fields and values, and every introduced readout shown and with its sentence. */
  function validate(ui) {
    const out = [];
    if (!ui) return out;
    if (!(ui.tier in TIER) && ui.tier !== 'all') out.push('tier must be 1–5 or all');
    const known = ['tier', 'status', 'zoom', 'focusBar', 'tabs', 'graph', 'genesPanel', 'mediumPanel', 'spendBar', 'legend', 'introduce'];
    for (const k of Object.keys(ui)) if (known.indexOf(k) < 0) out.push('unknown field ' + k);
    for (const k of Object.keys(ui.status || {})) {
      if (STATUS.indexOf(k) < 0) out.push('unknown status ' + k);
      else if (typeof ui.status[k] !== 'boolean') out.push('status.' + k + ' must be true or false');
    }
    const fb = ui.focusBar || {};
    for (const c of fb.counters || []) if (COUNTERS.indexOf(c) < 0) out.push('unknown counter ' + c);
    if (fb.control !== undefined && CONTROLS.indexOf(fb.control) < 0) out.push('focusBar.control must be onoff, dial or none');
    for (const t of ui.tabs || []) if (TABS.indexOf(t) < 0) out.push('unknown tab ' + t);
    if (ui.genesPanel !== undefined && ['simple', 'full'].indexOf(ui.genesPanel) < 0) out.push('genesPanel must be simple or full');
    if (ui.mediumPanel !== undefined && ['hidden', 'simple', 'full'].indexOf(ui.mediumPanel) < 0) out.push('mediumPanel must be hidden, simple or full');
    if (ui.legend !== undefined && ['short', 'full'].indexOf(ui.legend) < 0) out.push('legend must be short or full');
    const g = ui.graph;
    if (g) {
      if (!Array.isArray(g.series) || !g.series.length || g.series.length > 2) out.push('graph.series: one or two lines');
      for (const x of g.series || []) if (!x || typeof x.gene !== 'string' || ['protein', 'mRNA'].indexOf(x.kind) < 0) out.push('graph.series: {gene, kind: protein | mRNA}');
      if (g.target && !(typeof g.target.y === 'number' && typeof g.target.label === 'string')) out.push('graph.target: {y, label}');
      if (g.zone && !(typeof g.zone.lo === 'number' && typeof g.zone.hi === 'number' && g.zone.hi > g.zone.lo)) out.push('graph.zone: {lo, hi}');
      for (const m of g.marks || []) if (!(typeof m.t === 'number' && typeof m.label === 'string')) out.push('graph.marks: [{t, label}]');
      if (g.window !== undefined && g.window !== 'fit' && !(typeof g.window === 'number' && g.window > 0)) out.push("graph.window: 'fit' or seconds");
    }
    const u = normalise(ui);
    if (u) {
      const vis = visibleReadouts(u);
      for (const id of u.introduce) {
        if (READOUTS.indexOf(id) < 0) out.push('introduce: no sentence for ' + id);
        else if (vis.indexOf(id) < 0) out.push('introduce: ' + id + ' is not shown on this screen');
      }
      if (u.graph && !(u.tabs.indexOf('graph') >= 0)) out.push('a graph needs the graph tab');
    }
    return out;
  }

  /**
   * The commands a screen lets the student send (TI-2: the lab's Simple and All controls modes expose the same ones):
   * setPromoter per visible gene and level, setMedium per free row and option, setDrug per drug and dose.
   */
  function commandsExposed(labConfig, genes, levels, mediumOptions, drugOptions) {
    const lc = labConfig, u = normalise(lc.ui), out = [];
    const tabs = u ? appTabs(u) : lc.tabs;
    const lv = lc.allowedLevels || levels;
    const geneControls = lc.controls.genes !== false && !lc.readOnlyGenes;
    const vis = lc.genesVisible === 'all' ? genes : genes.filter((g) => lc.genesVisible.indexOf(g) >= 0);
    if (geneControls && (tabs.indexOf('genes') >= 0 || !u)) {
      for (const g of vis) for (const l of lv) out.push('setPromoter:' + g + ':' + l);
    } else if (geneControls && u && u.focusBar.control !== 'none') {
      // Only the focus bar's control: the dial (every setting) or the Off/On switch (off, and On at onLevel).
      const levels = u.focusBar.control === 'dial' ? lv : ['off', u.focusBar.onLevel];
      for (const g of vis) for (const l of levels) out.push('setPromoter:' + g + ':' + l);
    }
    const mediumShown = u ? u.mediumPanel !== 'hidden' && tabs.indexOf('medium') >= 0 : tabs.indexOf('medium') >= 0;
    if (lc.controls.medium !== false && mediumShown) {
      for (const f of Object.keys(mediumOptions)) if (lc.mediumRows[f] === 'free') for (const k of mediumOptions[f]) out.push('setMedium:' + f + ':' + k);
    }
    if (lc.controls.drugs !== false && mediumShown) for (const d of Object.keys(drugOptions)) for (const k of drugOptions[d]) out.push('setDrug:' + d + ':' + k);
    return out.sort();
  }

  /** "growing normally / slowly / not growing" from the facts (§5.2 status.growth). */
  function growthWord(facts) {
    const W = C.status.growthWords;
    return facts.growth === 'arrested' ? W.arrested : facts.growth === 'slow' ? W.slow : W.normal;
  }

  /**
   * How much sugar gets in (§5.2 readout.sugarIn), as a share of the reference cell's hexose flux F_ref:
   * plenty ≥ 60%, some ≥ 25%, a trickle above 1%, none below (lactose counts twice: it gives two hexoses).
   */
  function sugarLevel(view, F_ref) {
    const x = (view.flux.glucoseIn + 2 * view.flux.lactoseIn) / F_ref;
    return x >= 0.6 ? 'plenty' : x >= 0.25 ? 'some' : x > 0.01 ? 'trickle' : 'none';
  }

  /**
   * The counter noun for a gene's protein, plural and capitalised ("Glucose transporters"; "Protein C" while its name
   * is hidden). short: its last word only ("Transporters"), for three counters side by side on a phone.
   */
  function proteinsWord(model, id, cap, short) {
    const w = model.words(id);
    let t;
    if (!model.named(id)) t = w.name.replace(/^Gene/, 'Protein');
    else {
      t = (C.genes[id] && C.genes[id].protein ? C.genes[id].protein : w.name) + 's';
      if (short) t = t.split(/[\s-]+/).pop();
    }
    return cap === false ? t.charAt(0).toLowerCase() + t.slice(1) : t.charAt(0).toUpperCase() + t.slice(1);
  }

  /** A readout's introducing sentence for this screen ({proteins} filled with the focus gene's noun). */
  function sentence(id, model, gene) {
    const t = C.tiers.readouts[id];
    return t ? F.fill(t, { proteins: model && gene ? proteinsWord(model, gene, false) : 'proteins' }) : '';
  }

  /** Where the guide points for a readout or a watch step's `point` (a CSS selector; canvas targets are resolved by the app). */
  const TARGETS = {
    'counter.mRNA': '[data-counter="mRNA"]', 'counter:mRNA': '[data-counter="mRNA"]',
    'counter.protein': '[data-counter="protein"]', 'counter:protein': '[data-counter="protein"]',
    'counter.made': '[data-counter="made"]', 'counter:made': '[data-counter="made"]',
    'counter.rates': '[data-counter="rates"]', legend: '#legend',
    'status.energy': '.st-atp', 'gauge:energy': '.st-atp', 'status.growth': '.st-growth-word', 'readout.sugarIn': '.st-sugar',
    'status.doubling': '.st-growth', 'control.dial': '.tb-ctrl', 'control:promoter': '.tb-ctrl',
    'graph.protein': '.sg-figure', 'graph.target': '.sg-figure', 'graph.zone': '.sg-figure', 'bands.phases': '.sg-figure',
  };

  // ---------------------------------------------------------------------------
  // The focus bar of a tiered screen: big plain counters and one control
  // ---------------------------------------------------------------------------
  class TierBar {
    /** app: the app; ui: a normalised ui. */
    constructor(app, ui) {
      this.app = app;
      this.ui = ui;
      this.rate = { made: 0, cut: 0, t: -1 };
    }

    mount(el) {
      const h = LY.h, app = this.app, fb = this.ui.focusBar;
      this.el = el;
      el.classList.add('is-tiered');
      const many = app.geneModel && app.geneModel.visible.length > 1;
      this.chip = h('span', { class: 'gene-chip tb-chip' });
      this.name = h('span', { class: 'tb-name' });
      this.sym = h('span', { class: 'sym' });
      this.counters = {};
      const row = h('span', { class: 'tb-counters', 'data-n': String(fb.counters.length) });
      for (const k of fb.counters) {
        const num = h('span', { class: 'tb-num num' }), lab = h('span', { class: 'tb-label' });
        this.counters[k] = { num, lab, box: h('span', { class: 'tb-counter' + (k === 'rates' ? ' is-rates' : ''), 'data-counter': k }, [num, lab]) };
        row.appendChild(this.counters[k].box);
      }
      // The name, then the counters under it (beside it on a short screen); with several genes the whole row is the
      // gene picker (as the M1 focus bar's first row), with one it is plain text.
      const headKids = [this.chip, h('span', { class: 'tb-title' }, [this.name, ' ', this.sym]), row];
      if (many) headKids.push(h('span', { class: 'fb-change' }, [h('span', { class: 'fb-change-word', text: C.focus.change }), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')]));
      this.head = many ? h('button', { class: 'tb-head is-button', type: 'button', onclick: () => app.views.cellView.openPicker() }, headKids)
        : h('div', { class: 'tb-head' }, headKids);
      this.ctrlBox = h('div', { class: 'tb-ctrl' });
      if (fb.control === 'onoff') this.ctrl = app.makeOnOffControl(() => app.focusGene, fb.onLevel || 2);
      else if (fb.control === 'dial') this.ctrl = app.makePromoterControl(() => app.focusGene, 'focus');
      if (this.ctrl) { this.ctrlBox.appendChild(this.ctrl.el); this.ctrlBox.appendChild(this.ctrl.note); }
      else this.ctrlBox.hidden = true;
      el.appendChild(this.head);
      el.appendChild(this.ctrlBox);
    }

    /** At most 4 times a second (the app's slow tick): the counts, and the making and cutting-up rates over the last minute or so. */
    update(view) {
      if (!this.el) return;
      const app = this.app, id = app.focusGene, gv = view.geneById[id], model = app.geneModel;
      if (!gv || !model) return;
      const w = model.words(id);
      const bg = 'var(--' + model.color(id) + ')';
      if (this.chip.style.background !== bg) this.chip.style.background = bg;
      LY.setText(this.name, w.name);
      LY.setText(this.sym, w.symbol);
      const T = C.tiers.counters;
      const set = (k, n, label) => { const c = this.counters[k]; if (!c) return; LY.setText(c.num, n); LY.setText(c.lab, label); };
      set('mRNA', F.count(gv.mRNA), T.mRNA);
      set('made', F.count(gv.mRNAMade), T.made);
      // Three counters side by side on a phone: the protein's noun in one word ("Transporters"), the full one read aloud.
      const short = this.ui.focusBar.counters.length >= 3 && app.layout === 'compact';
      set('protein', F.count(gv.proteinRounded), proteinsWord(model, id, true, short));
      if (this.counters.protein) {
        const full = proteinsWord(model, id) + ' ' + F.count(gv.proteinRounded);
        if (this.counters.protein.box.getAttribute('aria-label') !== full) this.counters.protein.box.setAttribute('aria-label', full);
      }
      if (this.counters.rates) {
        // A trailing mean over about a minute of simulated time (the instantaneous rates flicker tick to tick).
        const r = this.rate, t = view.t_s;
        const a = r.t < 0 ? 1 : 1 - Math.exp(-Math.max(0, t - r.t) / 60);
        r.made += (gv.synthesis_perS * 60 - r.made) * a; r.cut += (gv.degraded_perS * 60 - r.cut) * a; r.t = t;
        const c = this.counters.rates;
        LY.setText(c.num, F.fill(T.rates, { a: F.count(Math.round(r.made)), b: F.count(Math.round(r.cut)) }));
      }
      const mode = app.geneControlMode ? app.geneControlMode(id) : 'free';
      const hide = !this.ctrl || (mode !== 'free' && mode !== 'locked');
      if (this.ctrlBox.hidden !== hide) this.ctrlBox.hidden = hide;
      if (this.ctrl) {
        const label = F.fill(this.ui.focusBar.control === 'onoff' ? C.tiers.onoff.label : C.focus.promoterLabel, { name: w.name });
        if (this.ctrl.el.getAttribute('aria-label') !== label) this.ctrl.el.setAttribute('aria-label', label);
      }
    }
  }

  return {
    READOUTS, TIER, LEVEL_TABLE, LAB_UI, TARGETS, normalise, appTabs, validate, visibleReadouts, commandsExposed,
    growthWord, sugarLevel, proteinsWord, sentence, TierBar,
  };
});
