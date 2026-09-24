// @deps btc-math btc-prng
/*
 * Be the Cell: gene expression (engine spec §7.3–§7.5, §7.8–§7.11).
 *
 * Transcription: each gene copy starts transcripts at random (Poisson per
 * tick). A transcript grows at 3 nt per aa of ribosome travel, because the
 * leading ribosome and RNA polymerase move together; it becomes a mature mRNA
 * once the transcription odometer N has advanced by the mRNA length.
 *
 * Translation: all mRNAs, the player genes' and the background sectors', draw
 * on one pool of free ribosomes in proportion to RBS strength × copies. A gene
 * that takes ribosomes leaves fewer for everything else: that competition is
 * where the burden of a useless protein comes from.
 *
 * These functions work on a BTC.Cell (btc-cell.js) and its per-tick scratch
 * `k`. They are called by Cell.step() in the fixed order of §7.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-math.js'), require('./btc-prng.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.expression = factory(B.math, B.prng);
  }
})(typeof self !== 'undefined' ? self : this, function (M, R) {
  'use strict';

  /** Per-copy initiation rate (/s) from the promoter controls; knockout is exactly 0. */
  function promoterRate(p, gene) {
    if (gene.knockout) return 0;
    const r = gene.rateOverride === gene.rateOverride         // not NaN: an explicit rate
      ? gene.rateOverride
      : gene.rRef * (gene.level > 0 ? gene.level : p.leak);
    return r < p.rateCap ? r : p.rateCap;
  }

  // §7.3 Player transcription initiation (stochastic), genes in slot order.
  function initiateTranscription(cell) {
    const k = cell.k, genes = cell.genes, T = cell.tick;
    const scale = cell.dosage * k.hin * k.rifF * cell.p.dt;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i];
      const mu = g.rate * scale;
      let n = R.poisson(g.txStream, mu);           // exactly one uniform per gene per tick
      // A gene can hold only so many polymerases: one per footprint of DNA per copy.
      const room = cell.dosage * g.maxNascentPerCopy - g.nascent.len;
      if (n > room) n = room > 0 ? room : 0;
      for (let j = 0; j < n; j++) g.nascent.push(cell.N, T);
      g.initiations += n;
      g.txStarted = n;
    }
  }

  // §7.4 Sector transcription at nominal energy (the energy factor x/(x+K_in) is applied per substep).
  function sectorTranscription(cell) {
    const k = cell.k, p = cell.p, genes = cell.genes, sec = cell.sectors;
    // Q holds a fixed share φ_Q of synthesis: its mRNA target scales with everyone else's load.
    let wlNonQ = 0;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i];
      wlNonQ += g.rbs * (g.mature.count + g.nascent.len) * g.L;
    }
    const R_ = sec[0], Q = sec[1], P_ = sec[2];
    wlNonQ += R_.rbs * R_.m * R_.L + P_.rbs * P_.m * P_.L;
    const mQstar = p.phi_Q / (1 - p.phi_Q) * wlNonQ / (Q.rbs * Q.L);
    const xa2 = k.xa * k.xa;
    const fP = (0.4 + 0.6 / (1 + xa2)) / 0.7;     // P-sector expression rises when amino acids run short
    R_.sigma0 = p.beta_R * cell.dosage * k.chi * k.rifF;
    Q.sigma0 = k.kM * mQstar * k.rifF;
    P_.sigma0 = p.beta_P * cell.dosage * fP * k.rifF;
    k.bgTx0 = p.atpPerNT * (R_.sigma0 * R_.nt + Q.sigma0 * Q.nt + P_.sigma0 * P_.nt);
  }

  // §7.5 Translation initiation from one shared pool of free ribosomes.
  function initiateTranslation(cell) {
    const k = cell.k, p = cell.p, genes = cell.genes, sec = cell.sectors, D = cell.D;
    let W = 0;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i];
      W += g.rbs * (g.mature.count + g.nascent.len);   // nascent transcripts count: translation is coupled
    }
    for (let s = 0; s < sec.length; s++) W += sec[s].rbs * sec[s].m;

    const Rtot = sec[0].mass / p.aaPerRibosome;
    // Ribosomes that finished a chain last tick are recycled before they bind again,
    // so the busy count is the one taken right after last tick's initiation.
    const Rfree = Rtot > cell.Rbusy ? Rtot - cell.Rbusy : 0;
    const gI = k.hin * (p.gI_basal + (1 - p.gI_basal) * k.chi);   // ppGpp/hibernation stand-in
    const kappa = p.k_on * gI * W / k.V;
    const nBind = W > 0 ? Rfree * k.cmF * (1 - M.detExp(-kappa * p.dt)) : 0;

    let Relong = 0, Nnasc = 0;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i];
      const copies = g.mature.count + g.nascent.len;
      if (nBind > 0) g.cohorts.push(D, nBind * g.rbs * copies / W);
      Relong += g.cohorts.nSum;
      Nnasc += g.nascent.len;
    }
    for (let s = 0; s < sec.length; s++) {
      const u = sec[s];
      if (nBind > 0) u.cohorts.push(D, nBind * u.rbs * u.m / W);
      Relong += u.cohorts.nSum;
    }
    cell.Rbusy = Relong;
    k.W = W;
    k.Rtot = Rtot;
    k.Rfree = Rfree;
    k.gI = gI;
    k.kInit = p.k_on * gI * Rfree * k.cmF / k.V;     // per mRNA at b = 1 (/s)
    k.Relong = Relong;
    k.fR = Relong > 0 ? sec[0].cohorts.nSum / Relong : 0;
    k.Nnasc = Nnasc;
  }

  // §7.8 Completions: pop every cohort whose ribosomes have travelled the chain length.
  function completeChains(cell) {
    const genes = cell.genes, sec = cell.sectors, D = cell.D;
    const Q = sec[1];
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i], q = g.cohorts, L = g.L;
      let made = 0;
      while (q.len > 0 && D - q.headD0() >= L) {
        const n = q.headN(), travelled = D - q.headD0();
        q.popHead();
        made += n;
        // The released ribosome spends the rest of the tick on background mRNA.
        Q.mass += n * (travelled - L);
      }
      g.P += made;
      g.pMade += made;
      g.pCompleted = made;
    }
    for (let s = 0; s < sec.length; s++) {
      const u = sec[s], q = u.cohorts, L = u.L;
      let made = 0;
      while (q.len > 0 && D - q.headD0() >= L) {
        const aa = q.headN() * (D - q.headD0());
        u.mass += aa;
        made += aa;
        q.popHead();
      }
      u.made = made;                                   // aa finished this tick (view: ribosomes made)
    }
  }

  // §7.9 Player mRNA: decay first (in id order), then transcripts that reached full length mature.
  function playerMRNA(cell) {
    const genes = cell.genes, N = cell.N, T = cell.tick;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i];
      g.mDecayed = g.mature.decay(g.decayStream, g.pDecay);
      let done = 0;
      const nq = g.nascent, nt = g.nt;
      while (nq.len > 0 && N - nq.headN0() >= nt) {
        g.newestInitTick = nq.initTick[nq.head];     // read by the first_mrna detector
        nq.popHead();
        g.mature.add(cell.nextMRNAId, T);
        cell.nextMRNAId = (cell.nextMRNAId + 1) | 0;
        done++;
      }
      g.mMade += done;
      g.mCompleted = done;
    }
  }

  // §7.10 Sector mRNA: exact solution for constant synthesis over the tick.
  function sectorMRNA(cell) {
    const k = cell.k, sec = cell.sectors, dt = cell.p.dt;
    const Ek = k.decayFactorM;
    for (let s = 0; s < sec.length; s++) {
      const u = sec[s];
      const sigma = u.sigInt / dt;
      u.m = u.m * Ek + (sigma / k.kM) * (1 - Ek);
    }
  }

  // §7.11 Protein degradation (off by default). Proteases return the residues to the aa pool.
  function degradeProteins(cell) {
    const genes = cell.genes;
    let recycled = 0;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i];
      if (!(g.kdeg > 0)) continue;
      const dP = g.P * g.kdegLoss;
      g.P -= dP;
      recycled += g.L * dP;
    }
    cell.AA += recycled;
    cell.flux.aaRecycled = recycled / cell.p.dt;
  }

  return {
    promoterRate, initiateTranscription, sectorTranscription, initiateTranslation,
    completeChains, playerMRNA, sectorMRNA, degradeProteins,
  };
});
