// @deps btc-math btc-prng
/*
 * Be the Cell: the regulated lac operon (strain 'm2-lac', level 1.7; engine
 * spec §13.3, v1.1; contract in docs/LEVELS.md §8 R-E13).
 *
 *   LacI     the repressor, an integer number of tetramers (≈10) made from its own
 *            weak constitutive gene (×10 for the Iq promoter). A free repressor finds
 *            an empty operator at rate (active tetramers)/tau_search (Elf 2007).
 *   operator one per copy of the operon (one, or two after the replication step).
 *            Each copy is bound or free and flips at random from the seeded stream
 *            'op:lac'. A free copy transcribes at the full rate, a bound copy at a
 *            small leak (partial release of the looped repressor; Choi 2008). The
 *            release rate is set so the wild type is repressed ≈1,000× at 10
 *            tetramers (Oehler 1990: 1,300× with all three operators; the single
 *            "operator" here stands for the natural set). Design "no operator":
 *            nothing blocks the promoter.
 *   inducer  allolactose, which LacZ makes from about half the lactose it turns over
 *            (Huber 1976) and hydrolyses, plus IPTG from the medium. Inducer bound to
 *            free repressor stops it binding (K_ind, Hill n_ind); inducer that reaches
 *            an operator-bound repressor releases it (K_indOp, k_rel). Is: LacI that
 *            cannot bind inducer. Design lacI 'deleted': no repressor at all.
 *   CRP      cAMP is high when no glucose flows in through the PTS. With the CRP site
 *            the promoter is multiplied by crpFactor = cAMP (1 without glucose, ≈0.15
 *            in 10 mM glucose) on free copies; without it the factor is 1 (like lacUV5). Inducer
 *            exclusion (EIIA-Glc blocking LacY) is available through IEmax, 0 by default.
 *
 * Hashed state: the operator copies, the allolactose pool and the operator stream.
 * Everything else is recomputed from the state at the start of each tick.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-math.js'), require('./btc-prng.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.regulation = factory(B.math, B.prng);
  }
})(typeof self !== 'undefined' ? self : this, function (M, R) {
  'use strict';

  const MAX_COPIES = 2;           // one operon per chromosome; two after the replication step

  /** Operator copies free at equilibrium, for a given inducer level (µM) and tetramer count. */
  function freeShare(lac, p, I, tetramers) {
    const fAct = lac.isAllele ? 1 : 1 - M.hill(I, lac.Kn, p.n_ind);
    const rel = lac.isAllele ? 0 : M.hill(I, lac.KopN, p.n_ind);
    const kOn = tetramers * fAct / p.tau_search, kOff = lac.kOff0 + p.k_rel * rel;
    return kOn + kOff > 0 ? kOff / (kOn + kOff) : 1;
  }

  /**
   * The lac regulation of a cell: the design (fixed for the run), hashed state and per-tick
   * scratch. design is config.design with the catalog defaults filled in.
   */
  function createLac(cell, design) {
    const p = cell.p, layout = cell.layout;
    const tu = layout.tus.find((t) => t.regulation === 'lac');
    // Wild-type repression rep_lac = 1/(f + (1 − f)·leak): f, the free share from complete release, …
    const f = (1 / p.rep_lac - p.lacLeak) / (1 - p.lacLeak);
    const kOnRef = p.lacIRef / p.tau_search;
    const lac = {
      design,
      operator: design.lac.operator,
      isAllele: design.lacI.allele === 'Is',
      deleted: design.lacI.allele === 'deleted',
      tu: tu.id,
      leader: tu.leader,                                    // gene index of lacZ (owns the lac promoter)
      lacI: layout.roleIndex['lac-repressor'],
      lacZ: layout.roleIndex['lactose-split'],
      ptsG: layout.roleIndex['glucose-import'],
      kOff0: f > 0 ? kOnRef * f / (1 - f) : 0,            // … sets the release rate of an inducer-free repressor
      Kn: M.powInt(p.K_ind, p.n_ind), KopN: M.powInt(p.K_indOp, p.n_ind),
      inducerHalf_uM: 0,
      // Hashed state
      op: new Int8Array(MAX_COPIES),                        // 1 = repressor bound on this copy's operator
      allo: 0,                                              // allolactose, molecules
      stream: new Int32Array(4),
      // Per-tick scratch (not hashed; kept in snapshots)
      inducer_uM: 0, allo_uM: 0, fAct: 1, release: 0, tetramers: 0, active: 0, kOn: 0, kOff: 0,
      free: 0, bound: 0, glucoseSignal: 0, cAMP: 1, crpFactor: 1, exclusion: 0,
    };
    // The inducer level that frees half the operators at the normal repressor level (facts.inducer).
    let lo = 0, hi = 1e6;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (freeShare(lac, p, mid, p.lacIRef) < 0.5) lo = mid; else hi = mid;
    }
    lac.inducerHalf_uM = hi;
    return lac;
  }

  /** Initial operator state: bound where a repressor can bind (a repressed cell), free otherwise. */
  function reset(lac, bound) {
    const b = bound && lac.operator && !lac.deleted ? 1 : 0;
    for (let c = 0; c < MAX_COPIES; c++) lac.op[c] = b;
    lac.allo = 0;
  }

  /** The operator stream is labelled by the unit ('op:lac'), never by a slot. */
  function seed(cell, seedValue) {
    R.seedStream(seedValue, 'op:lac', cell.lac.stream);
  }

  /**
   * Start of tick (after the derived quantities, before transcription): inducer, repressor,
   * operator flips (exactly MAX_COPIES uniforms every tick), cAMP–CRP, and k.lacTx, the
   * promoter factor that replaces the gene dosage for the lac unit.
   */
  function step(cell) {
    const lac = cell.lac, p = cell.p, k = cell.k, V = k.V, dt = p.dt;
    const perMM = p.N_mM * V;
    lac.allo_uM = 1000 * lac.allo / perMM;
    const I = lac.allo_uM + 1000 * cell.env.iptg_mM;
    lac.inducer_uM = I;
    if (lac.isAllele) { lac.fAct = 1; lac.release = 0; }             // Is: blind to inducer
    else { lac.fAct = 1 - M.hill(I, lac.Kn, p.n_ind); lac.release = M.hill(I, lac.KopN, p.n_ind); }
    const gI = lac.lacI >= 0 ? cell.genes[lac.lacI] : null;
    lac.tetramers = gI ? Math.floor(gI.P * gI.activity / 4) : 0;       // LacI counts as whole tetramers
    lac.active = lac.tetramers * lac.fAct;
    lac.kOn = lac.operator ? lac.active / p.tau_search : 0;
    lac.kOff = lac.kOff0 + p.k_rel * lac.release;
    const pOn = 1 - M.detExp(-lac.kOn * dt), pOff = 1 - M.detExp(-lac.kOff * dt);
    let free = 0, bound = 0;
    for (let c = 0; c < MAX_COPIES; c++) {
      const u = R.uniform(lac.stream);                                 // one draw per copy slot, every tick
      if (c >= cell.dosage) continue;
      if (!lac.operator) lac.op[c] = 0;                                // no operator: nothing can block
      else if (lac.op[c] === 1) { if (u < pOff) lac.op[c] = 0; }
      else if (u < pOn) lac.op[c] = 1;
      if (lac.op[c] === 0) free++; else bound++;
    }
    lac.free = free;
    lac.bound = bound;
    // Glucose flowing in through the PTS dephosphorylates EIIA-Glc, and adenylate cyclase idles.
    const g = lac.ptsG >= 0 ? cell.genes[lac.ptsG] : null;
    const G = cell.env.glucose_mM;
    const U = G > 0 ? ((g ? g.P * g.activity * p.k_pts : 0) + cell.uBasal * V) * G / (G + p.K_G) : 0;
    const u = U / V;
    lac.glucoseSignal = u / (u + p.K_crp);
    lac.cAMP = 1 - lac.glucoseSignal;
    lac.crpFactor = lac.design.lac.crpSite ? lac.cAMP : 1;
    lac.exclusion = p.IEmax * lac.glucoseSignal;
    // cAMP–CRP recruits RNA polymerase to a free promoter; the leak from a bound copy (partial
    // release of the looped repressor) is not scaled by it, since CRP also tightens the loop
    // (Kuhlman 2007), so glucose lowers the induced level, not the repressed one.
    k.lacTx = lac.crpFactor * free + p.lacLeak * bound;
  }

  /** After the fast pools: LacZ makes allolactose from lactose and hydrolyses it (first order at low levels). */
  function afterPools(cell) {
    const lac = cell.lac, p = cell.p, k = cell.k, dt = p.dt;
    const z = lac.lacZ >= 0 ? cell.genes[lac.lacZ] : null;
    const made = p.f_allo * cell.flux.lactoseSplit * dt;
    const kh = z ? p.k_Z * z.P * z.activity / (p.K_allo * p.N_mM * k.V) : 0;
    lac.allo = (lac.allo + made) * M.detExp(-kh * dt);
  }

  // Replication (the new copy starts in the old copy's state) and division (one copy per
  // daughter, allolactose halves; one draw from the division stream) are in btc-growth.js.

  function write(w, lac) {
    for (let c = 0; c < MAX_COPIES; c++) w.i32(lac.op[c]);
    w.f64(lac.allo);
    for (let i = 0; i < 4; i++) w.i32(lac.stream[i]);
  }

  function read(r, lac) {
    for (let c = 0; c < MAX_COPIES; c++) lac.op[c] = r.i32();
    lac.allo = r.f64();
    for (let i = 0; i < 4; i++) lac.stream[i] = r.i32();
  }

  const SCRATCH = ['inducer_uM', 'allo_uM', 'fAct', 'release', 'tetramers', 'active', 'kOn', 'kOff', 'free', 'bound',
    'glucoseSignal', 'cAMP', 'crpFactor', 'exclusion'];

  return { MAX_COPIES, SCRATCH, freeShare, createLac, reset, seed, step, afterPools, write, read };
});
