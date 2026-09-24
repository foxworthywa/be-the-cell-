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
    };
  }

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

    // Gene episodes
    const genes = cell.genes;
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

  return { THRESHOLDS: TH, createState, openEpisode, commandApplied, detect, cloneState };
});
