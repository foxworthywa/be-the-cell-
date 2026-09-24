// @deps btc-commands
/*
 * Be the Cell: event detectors (engine spec §11.4).
 *
 * Events are edge-triggered: each fires once when its condition becomes true
 * and is re-armed only after a clear return (hysteresis), so a value hovering
 * at a threshold never floods the queue. Gene events belong to episodes: an
 * on-episode starts when a gene is switched on and follows it through its
 * first transcript, first finished mRNA and first protein; an off-episode
 * starts when it is switched off and ends when the last of its mRNA is gone.
 *
 * The detector state is plain JSON (it goes into snapshots). It is never
 * hashed and nothing in the physics reads it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-commands.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.events = factory(B.commands);
  }
})(typeof self !== 'undefined' ? self : this, function (CMD) {
  'use strict';

  // Thresholds (spec §11.4). Re-arm points not given by the spec are marked "design".
  const TH = Object.freeze({
    ENERGY_LOW: 0.30,        // energy_low below this …
    ENERGY_OK: 0.45,         // … energy_ok (and re-arm) above this
    ENERGY_NONE: 0.01,       // energy_none, and the dormancy clock
    ENERGY_NONE_REARM: 0.30, // design: energy_none re-arms once ATP is back to the energy_low line
    DORMANT_TICKS: 600,      // E < 0.01 for 10 min → dormant
    REVIVED: 0.30,           // E above this after dormant → revived
    AA_LOW: 0.5e6,           // amino acids per fL (0.83 mM)
    AA_REARM: 1.0e6,         // design: twice the aa_low line
    ARREST: 0.05,            // λ < 0.05·λ_ref for GROWTH_TICKS → growth_arrest
    RESUME: 0.2,             // λ > 0.2·λ_ref for GROWTH_TICKS → growth_resumed
    GROWTH_TICKS: 60,
    FUNCTION_SHARE: 0.10,    // function_seen: the protein carries ≥ 10% of its class …
    FUNCTION_MIN: 1000,      // … and ≥ 1,000 /s (lactose split: ≥ 500 lactose/s, i.e. 1,000 hexose/s) …
    FUNCTION_TICKS: 30,      // … for 30 consecutive ticks
  });

  function newEpisode() {
    return {
      kind: null,              // 'on' | 'off' | null (no switch seen in this run)
      onTick: null, firstTxTick: null, firstMRNATick: null, firstProteinTick: null,
      offTick: null, goneTick: null,
      pMadeAtOn: 0, pMadeAtOff: 0,
    };
  }

  function createState(nGenes) {
    const genes = [];
    for (let i = 0; i < nGenes; i++) genes.push(newEpisode());
    return {
      energyLow: false, energyNone: false, belowNone: 0, dormant: false, aaLow: false,
      arrested: false, arrestRun: 0, resumeRun: 0,
      lastDivisionTick: null,
      lastGene: null,          // id of the gene of the most recent applied gene command (facts.lastCommandedGene)
      genes,
      fnRun: new Array(nGenes).fill(0),          // function_seen: consecutive ticks meeting the condition
      fnSeen: new Array(nGenes).fill(false),     // … and whether it has fired (once per cell)
    };
  }

  /**
   * What gene g's protein contributes to its role's flux this tick, and the class total it is
   * compared with (spec §11.4 function_seen). Returns false for roles that never fire.
   */
  function roleShare(cell, g, out) {
    const f = cell.flux, p = cell.p;
    switch (g.role) {
      case 'glucose-import': {
        const pts = g.P * g.activity * p.k_pts, other = cell.uBasal * cell.k.V;
        out.total = f.glucoseIn;
        out.part = pts + other > 0 ? f.glucoseIn * pts / (pts + other) : 0;
        return true;
      }
      case 'glycolysis': out.total = out.part = f.hexoseToGlycolysis; return true;
      case 'aa-synthesis': out.total = f.aaMade + f.aaImported; out.part = f.aaMade; return true;
      case 'aa-import': out.total = f.aaMade + f.aaImported; out.part = f.aaImported; return true;
      case 'lactose-import': out.total = out.part = f.lactoseIn; return true;
      case 'lactose-split': out.total = f.hexoseToGlycolysis; out.part = 2 * f.lactoseSplit; return true;
      default: return false;   // 'none' (flagellin) and 'lac-repressor' never fire
    }
  }
  const SHARE = { part: 0, total: 0 };

  /** Opens an on- or off-episode for gene g at tick T (called when a command or config changes its on/off state). */
  function openEpisode(st, g, on, T) {
    const ep = st.genes[g.index];
    if (on) {
      ep.kind = 'on';
      ep.onTick = T; ep.firstTxTick = null; ep.firstMRNATick = null; ep.firstProteinTick = null;
      ep.offTick = null; ep.goneTick = null;
      ep.pMadeAtOn = g.pMade;
    } else {
      ep.kind = 'off';
      ep.offTick = T; ep.goneTick = null;
      ep.pMadeAtOff = g.pMade;
    }
  }

  /** A gene command was applied: remember the gene, and open an episode if it switched on or off. */
  function commandApplied(cell, type, args, wasOn) {
    if (!CMD.GENE_COMMANDS[type]) return;
    const g = cell.geneById[args.gene];
    cell.eventState.lastGene = g.id;
    const on = CMD.isOn(g);
    if (on !== wasOn) openEpisode(cell.eventState, g, on, cell.tick);
  }

  /**
   * Runs every detector once, at the end of tick T (after growth and division,
   * before the tick counter advances), so events are stamped with the tick in
   * which they occurred.
   */
  function detect(cell) {
    const st = cell.eventState, p = cell.p, T = cell.tick, E = cell.E;

    // Energy
    if (!st.energyLow && E < TH.ENERGY_LOW) { st.energyLow = true; cell.emit('energy_low'); }
    else if (st.energyLow && E > TH.ENERGY_OK) { st.energyLow = false; cell.emit('energy_ok'); }
    if (!st.energyNone && E < TH.ENERGY_NONE) { st.energyNone = true; cell.emit('energy_none'); }
    else if (st.energyNone && E > TH.ENERGY_NONE_REARM) st.energyNone = false;
    st.belowNone = E < TH.ENERGY_NONE ? st.belowNone + 1 : 0;
    if (!st.dormant && st.belowNone >= TH.DORMANT_TICKS) { st.dormant = true; cell.emit('dormant'); }
    else if (st.dormant && E > TH.REVIVED) { st.dormant = false; cell.emit('revived'); }

    // Amino acids (per fL, at the end-of-tick volume)
    const a = cell.AA * p.rho / cell.k.Mend;
    if (!st.aaLow && a < TH.AA_LOW) { st.aaLow = true; cell.emit('aa_low'); }
    else if (st.aaLow && a > TH.AA_REARM) st.aaLow = false;

    // Growth
    const lam = cell.k.lambda, lref = p.lambda_ref;
    if (!st.arrested) {
      st.arrestRun = lam < TH.ARREST * lref ? st.arrestRun + 1 : 0;
      if (st.arrestRun >= TH.GROWTH_TICKS) { st.arrested = true; st.arrestRun = 0; st.resumeRun = 0; cell.emit('growth_arrest'); }
    } else {
      st.resumeRun = lam > TH.RESUME * lref ? st.resumeRun + 1 : 0;
      if (st.resumeRun >= TH.GROWTH_TICKS) { st.arrested = false; st.resumeRun = 0; st.arrestRun = 0; cell.emit('growth_resumed'); }
    }

    if (cell.lastDivision.tick === T) st.lastDivisionTick = T;

    // function_seen: once per cell, when a protein has visibly done its job for 30 ticks.
    const genes = cell.genes;
    for (let i = 0; i < genes.length; i++) {
      if (st.fnSeen[i]) continue;
      const g = genes[i];
      if (!roleShare(cell, g, SHARE)) continue;
      const ok = SHARE.total > 0 && SHARE.part >= TH.FUNCTION_SHARE * SHARE.total && SHARE.part >= TH.FUNCTION_MIN;
      st.fnRun[i] = ok ? st.fnRun[i] + 1 : 0;
      if (st.fnRun[i] >= TH.FUNCTION_TICKS) { st.fnSeen[i] = true; cell.emit('function_seen', { gene: g.id }); }
    }

    // Gene episodes
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i], ep = st.genes[i];
      if (ep.kind === 'on') {
        if (ep.firstTxTick === null && g.txStarted > 0) { ep.firstTxTick = T; cell.emit('tx_start', { gene: g.id }); }
        // Transcripts finish oldest first, so the newest one finished this tick carries the latest start tick.
        if (ep.firstMRNATick === null && g.mCompleted > 0 && g.newestInitTick >= ep.onTick) {
          ep.firstMRNATick = T; cell.emit('first_mrna', { gene: g.id });
        }
        if (ep.firstMRNATick !== null && ep.firstProteinTick === null && g.pMade - ep.pMadeAtOn >= g.d.oligomer) {
          ep.firstProteinTick = T; cell.emit('first_protein', { gene: g.id });
        }
      } else if (ep.kind === 'off' && ep.goneTick === null && g.mature.count === 0 && g.nascent.len === 0) {
        ep.goneTick = T; cell.emit('mrna_gone', { gene: g.id });
      }
    }
  }

  const cloneState = (st) => JSON.parse(JSON.stringify(st));

  // ---------------------------------------------------------------------------
  // Watchers (spec §11.2, grammar in §20): 'group.field' or 'genes.<geneId>.field',
  // resolved through the view (view.geneById for genes). Edge-triggered.
  // ---------------------------------------------------------------------------
  const WATCH_GROUPS = Object.freeze(['energy', 'cell', 'clock', 'aminoAcids', 'lactose', 'ribosomes', 'flux', 'lac']);
  const WATCH_OPS = Object.freeze(['>=', '<=', '>', '<']);

  /** A JSON-safe watcher from a spec, or {error, path, message} if the spec is not valid. */
  function compileWatcher(cell, spec, existing) {
    const bad = (path, message) => ({ error: 'bad-value', path, message });
    if (!spec || typeof spec !== 'object') return bad('', 'a watcher needs {field, op, value}');
    if (WATCH_OPS.indexOf(spec.op) < 0) return bad('op', 'op must be one of ' + WATCH_OPS.join(' '));
    if (typeof spec.value !== 'number' || spec.value !== spec.value) return bad('value', 'value must be a number');
    if (typeof spec.field !== 'string') return bad('field', 'field must be a string');
    const path = spec.gene !== undefined ? 'genes.' + spec.gene + '.' + spec.field : spec.field;
    const parts = path.split('.');
    const view = cell.observe();
    let gene = null, group = null, field;
    if (parts[0] === 'genes') {
      if (parts.length !== 3 || !Object.prototype.hasOwnProperty.call(view.geneById, parts[1])) return bad('field', 'unknown gene in ' + path);
      gene = parts[1]; field = parts[2];
      if (typeof view.geneById[gene][field] !== 'number') return bad('field', path + ' is not a number in the view');
    } else {
      if (parts.length !== 2 || WATCH_GROUPS.indexOf(parts[0]) < 0 || !view[parts[0]]) return bad('field', 'unknown view group in ' + path);
      group = parts[0]; field = parts[1];
      if (typeof view[group][field] !== 'number') return bad('field', path + ' is not a number in the view');
    }
    let id = spec.id;
    if (id === undefined) {
      let n = existing.length + 1;
      const taken = (x) => existing.some((w) => w.id === x);
      while (taken('w' + n)) n++;
      id = 'w' + n;
    }
    if (typeof id !== 'string' || id.length === 0 || id.length > 40) return bad('id', 'id must be a string of 1–40 characters');
    if (existing.some((w) => w.id === id)) return bad('id', 'a watcher ' + id + ' exists');
    return { id, path, gene, group, field, op: spec.op, value: spec.value + 0, on: false };
  }

  function holds(x, op, v) {
    return op === '>=' ? x >= v : op === '<=' ? x <= v : op === '>' ? x > v : x < v;
  }

  /** After a step (tick T): fires 'watch' {id, value} for every condition that became true. */
  function checkWatchers(cell, T) {
    const view = cell.observe(), ws = cell.watchers;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const x = w.gene !== null ? view.geneById[w.gene][w.field] : view[w.group][w.field];
      const on = holds(x, w.op, w.value);
      if (on && !w.on) cell.emit('watch', { id: w.id, value: x }, T);
      w.on = on;
    }
  }

  return { THRESHOLDS: TH, WATCH_GROUPS, WATCH_OPS, createState, openEpisode, commandApplied, detect, cloneState, compileWatcher, checkWatchers };
});
