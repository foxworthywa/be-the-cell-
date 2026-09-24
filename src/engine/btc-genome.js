// @deps btc-params btc-catalog
/*
 * Be the Cell: compiles a strain's flat gene catalog into the slot layout the
 * engine runs on (engine spec §13.1).
 *
 * v1.1 compiles transcription units: every gene is its own unit unless the
 * strain names a polycistronic unit (m2-lac: lacZYA, with lacZ then lacY).
 * Replicons, alleles and compartments are still deferred (§20); the inert
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
   *   genes[]      one frozen descriptor per gene (= cistron), in slot order
   *   byId         id → descriptor
   *   slotIndex    Int8Array(maxGenes): slot → index into genes (−1 = free)
   *   length, mRNALength, slot   typed arrays indexed like genes
   *   roleIndex    role → gene index (−1 if no gene has the role)
   *   tus[]        transcription units with more than one cistron: {id, leader, members[], mRNALength, regulation}
   *   sectors[]    {id, length, mRNALength, rbs}
   * Every gene belongs to one transcription unit (TU). A gene not named in strain.tus is
   * its own unit. A polycistronic unit is transcribed from one promoter into one mRNA;
   * its first cistron is the leader, which owns the promoter, the transcripts and the
   * mRNA molecules; each cistron keeps its own ribosome-binding site, ribosomes and
   * protein. mRNALength is the whole unit's length (3·ΣL + UTRs); cistronOffset is where a
   * cistron starts on it, so ribosomes can load a downstream cistron only once RNA
   * polymerase has passed it (coupled translation).
   * params is a {id: value} map (BTC.params.values()).
   */
  function compile(strainId, params) {
    const strain = C.STRAINS[strainId];
    if (!strain) throw new Error('unknown strain ' + strainId);
    const pv = params || P.values();
    const utr = pv.utrNt;

    const n = strain.genes.length;
    const idx = {};
    for (let i = 0; i < n; i++) idx[strain.genes[i].id] = i;
    // Transcription units: leader index, member order and offsets.
    const tuOf = new Int32Array(n).fill(-1), offset = new Int32Array(n), tuDefs = [];
    for (const t of strain.tus || []) {
      const members = t.cistrons.map((id) => { if (!(id in idx)) throw new Error('TU ' + t.id + ' names unknown gene ' + id); return idx[id]; });
      let off = 0;
      for (const m of members) {
        if (tuOf[m] !== -1) throw new Error('gene in two units: ' + strain.genes[m].id);
        tuOf[m] = tuDefs.length;
        offset[m] = off;
        off += 3 * strain.genes[m].length;
      }
      tuDefs.push({ id: t.id, members, mRNALength: off + utr, regulation: t.regulation || null });
    }

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
      const t = tuOf[i] >= 0 ? tuDefs[tuOf[i]] : null;
      const d = Object.freeze({
        index: i, id: g.id, slot: g.slot, name: g.name, drawnAs: g.drawnAs,
        lumped: g.lumped, standsForGenes: g.standsForGenes,
        length: g.length, mRNALength: t ? t.mRNALength : 3 * g.length + utr,
        location: g.location, role: g.role,
        rRef: pv[g.rRefParam], rbs: pv[g.rbsParam], defaultLevel: g.defaultLevel,
        kinetics: g.kinetics, uniprot: g.uniprot,
        oligomer: g.oligomer, sites: g.sites, allele: g.allele, signalPeptide: g.signalPeptide,
        compartment: g.compartment, activity: g.activity,
        tu: t ? t.id : g.id, leader: t ? t.members[0] : i, tuSize: t ? t.members.length : 1,
        cistronOffset: offset[i], regulation: t ? t.regulation : null,
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
      if (roleIndex[d.role] !== -1) throw new Error('one gene per role: ' + d.role);
      roleIndex[d.role] = d.index;
    }

    const sectors = strain.sectors.map((s, k) => Object.freeze({
      index: k, id: s.id, name: s.name, standsFor: s.standsFor,
      length: pv[s.lengthParam], mRNALength: 3 * pv[s.lengthParam] + utr, rbs: s.rbs,
    }));

    const tus = tuDefs.map((t) => Object.freeze({ id: t.id, leader: t.members[0], members: Object.freeze(t.members.slice()),
      mRNALength: t.mRNALength, regulation: t.regulation }));

    return Object.freeze({
      strain: strain.id, maxGenes: strain.maxGenes, reservedSlots: strain.reservedSlots,
      genes: Object.freeze(genes), byId: Object.freeze(byId), slotIndex, length, mRNALength, slot,
      roleIndex: Object.freeze(roleIndex), tus: Object.freeze(tus), regulation: strain.regulation || null,
      sectors: Object.freeze(sectors), coldStart: strain.coldStart, preset: strain.preset,
    });
  }

  return { compile };
});
