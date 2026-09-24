// @deps btc-math btc-prng
/*
 * Be the Cell: mass, volume, growth rate, gene dosage and division
 * (engine spec §7.2, §7.12).
 *
 * The cell's size is its protein: M counts every residue in finished protein,
 * in the three background sectors and in chains still on ribosomes, and the
 * volume is M/ρ. Growth rate is the translation flux divided by mass, so a
 * cell grows exactly as fast as its ribosomes polymerise amino acids.
 *
 * Division follows an adder: a cell divides after adding Vadd to its birth
 * volume, and this simulation then follows one daughter. Molecules are split
 * at random (fair coins from the 'division' stream); continuous pools halve.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-math.js'), require('./btc-prng.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.growth = factory(B.math, B.prng);
  }
})(typeof self !== 'undefined' ? self : this, function (M, R) {
  'use strict';

  /** Total protein mass (aa): finished player protein, sectors, and chains in progress. */
  function mass(cell) {
    const genes = cell.genes, sec = cell.sectors, D = cell.D;
    let m = 0;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i];
      m += g.P * g.L + g.cohorts.nascentAA(D);
    }
    for (let s = 0; s < sec.length; s++) m += sec[s].mass + sec[s].cohorts.nascentAA(D);
    return m;
  }

  // §7.12 Growth rate, gene dosage, division. Called once per tick after the pools.
  function grow(cell) {
    const k = cell.k, p = cell.p, dt = p.dt;
    const Mnew = mass(cell);
    const lambda = cell.flux.aaPolymerised / k.M;           // aaPolymerised is already per second
    cell.lambdaEMA += (lambda - cell.lambdaEMA) * k.emaFactor;
    k.lambda = lambda;
    const Vnew = Mnew / p.rho;
    if (cell.dosage === 1 && Vnew >= p.repFrac * cell.Vbirth) {
      cell.dosage = 2;
      cell.emit('replication');
    }
    k.Mend = Mnew;
    if (Vnew >= cell.Vbirth + p.Vadd) divide(cell, Mnew);
  }

  /**
   * Splits the cell and keeps one daughter (§7.12). Uses only the 'division'
   * stream, in a fixed order. cell.lastDivision records, for every species,
   * the amount before, the amount kept and the amount given to the sister.
   */
  function divide(cell, Mbefore) {
    const s = cell.divisionStream, rec = cell.lastDivision;
    const genes = cell.genes, sec = cell.sectors;
    rec.tick = cell.tick;
    rec.Mbefore = Mbefore;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i], r = rec.genes[i];
      r.mRNABefore = g.mature.count;
      r.mRNAKept = g.mature.halve(s);
      r.mRNASister = r.mRNABefore - r.mRNAKept;
      r.nascentBefore = g.nascent.len;
      r.nascentKept = g.nascent.halve(s);
      r.nascentSister = r.nascentBefore - r.nascentKept;
      // Whole proteins go to one daughter or the other; the fractional remainder (protein
      // counts are averages, spec §18 item 9) is split evenly, so both shares stay ≥ 0.
      const P = g.P, n = Math.floor(P);
      const kept = R.binomialHalf(s, n);
      const rest = (P - n) * 0.5;
      r.proteinBefore = P;
      r.proteinKept = kept + rest;
      r.proteinSister = (n - kept) + rest;
      g.P = kept + rest;
      r.ribosomesBefore = g.cohorts.nSum;
      g.cohorts.scaleAndRebase(0.5, cell.D);
      r.ribosomesKept = g.cohorts.nSum;
      g.nascent.rebase(cell.N);
    }
    for (let j = 0; j < sec.length; j++) {
      const u = sec[j], r = rec.sectors[j];
      r.mRNABefore = u.m; u.m *= 0.5; r.mRNAKept = u.m;
      r.massBefore = u.mass; u.mass *= 0.5; r.massKept = u.mass;
      r.ribosomesBefore = u.cohorts.nSum;
      u.cohorts.scaleAndRebase(0.5, cell.D);
      r.ribosomesKept = u.cohorts.nSum;
    }
    rec.AABefore = cell.AA; cell.AA *= 0.5; rec.AAKept = cell.AA;
    rec.LinBefore = cell.Lin; cell.Lin *= 0.5; rec.LinKept = cell.Lin;
    // E is unchanged: ATP halves with the volume.
    cell.Rbusy *= 0.5;
    cell.D = 0;
    cell.N = 0;
    const Mafter = mass(cell);
    rec.Mafter = Mafter;
    cell.k.Mend = Mafter;
    cell.dosage = 1;
    cell.Vbirth = Mafter / cell.p.rho;
    cell.gen += 1;
    const T1 = cell.tick + 1;
    cell.lastCycle_s = (T1 - cell.birthTick) * cell.p.dt;
    cell.birthTick = T1;
    cell.emit('division', { gen: cell.gen, keptFraction: Mafter / Mbefore });
  }

  return { mass, grow, divide };
});
