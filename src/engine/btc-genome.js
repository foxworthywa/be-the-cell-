// @deps btc-params btc-catalog
/*
 * Be the Cell: compiles a strain's flat gene catalog into the slot layout the
 * engine runs on (engine spec §13.1).
 *
 * M1 compiles only the flat catalog: one gene per transcription unit, one
 * cistron per mRNA. The general schema compiler (replicons, polycistronic
 * units, operator sites, alleles, compartments) is deferred (§20); the inert
 * schema fields are carried through unchanged so later levels can read them.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-params.js'), require('./btc-catalog.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.genome = factory(B.params, B.catalog);
  }
})(typeof self !== 'undefined' ? self : this, function (P, C) {
  'use strict';

  /**
   * compile(strainId, params) → layout:
   *   genes[]      one frozen descriptor per gene, in slot order
   *   byId         id → descriptor
   *   slotIndex    Int8Array(maxGenes): slot → index into genes (−1 = free)
   *   length, mRNALength, slot   typed arrays indexed like genes
   *   roleIndex    role → gene index (−1 if no gene has the role)
   *   sectors[]    {id, length, mRNALength, rbs}
   * params is a {id: value} map (BTC.params.values()).
   */
  function compile(strainId, params) {
    const strain = C.STRAINS[strainId];
    if (!strain) throw new Error('unknown strain ' + strainId);
    const pv = params || P.values();
    const utr = pv.utrNt;

    const n = strain.genes.length;
    const genes = [];
    const byId = {};
    const slotIndex = new Int8Array(strain.maxGenes).fill(-1);
    const length = new Int32Array(n);
    const mRNALength = new Int32Array(n);
    const slot = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const g = strain.genes[i];
      if (i > 0 && g.slot <= strain.genes[i - 1].slot) throw new Error('catalog genes must be in slot order');
      if (slotIndex[g.slot] !== -1) throw new Error('slot used twice: ' + g.slot);
      const d = Object.freeze({
        index: i, id: g.id, slot: g.slot, name: g.name, drawnAs: g.drawnAs,
        lumped: g.lumped, standsForGenes: g.standsForGenes,
        length: g.length, mRNALength: 3 * g.length + utr,
        location: g.location, role: g.role,
        rRef: pv[g.rRefParam], rbs: pv[g.rbsParam], defaultLevel: g.defaultLevel,
        kinetics: g.kinetics, uniprot: g.uniprot,
        oligomer: g.oligomer, sites: g.sites, allele: g.allele, signalPeptide: g.signalPeptide,
        compartment: g.compartment, activity: g.activity,
      });
      genes.push(d);
      byId[g.id] = d;
      slotIndex[g.slot] = i;
      length[i] = d.length;
      mRNALength[i] = d.mRNALength;
      slot[i] = g.slot;
    }

    const roleIndex = {};
    for (const r of C.ROLES) roleIndex[r] = -1;
    for (const d of genes) {
      if (d.role === 'none') continue;
      if (roleIndex[d.role] !== -1) throw new Error('M1 allows one gene per role: ' + d.role);
      roleIndex[d.role] = d.index;
    }

    const sectors = strain.sectors.map((s, k) => Object.freeze({
      index: k, id: s.id, name: s.name, standsFor: s.standsFor,
      length: pv[s.lengthParam], mRNALength: 3 * pv[s.lengthParam] + utr, rbs: s.rbs,
    }));

    return Object.freeze({
      strain: strain.id, maxGenes: strain.maxGenes, reservedSlots: strain.reservedSlots,
      genes: Object.freeze(genes), byId: Object.freeze(byId), slotIndex, length, mRNALength, slot,
      roleIndex: Object.freeze(roleIndex), sectors: Object.freeze(sectors), coldStart: strain.coldStart,
    });
  }

  return { compile };
});
