// @deps btc-params
/*
 * Be the Cell: the lab strain 'm1-lab' (engine spec §5).
 *
 * The strain is engineered, and students are told so: every gene sits on its
 * own switchable promoter, and the mannose PTS is deleted (ΔmanXYZ), so PtsG
 * is the only way glucose gets in unless backupGlucoseUptake is set.
 *
 * Numbers live in btc-params; this file holds structure: which genes exist,
 * how long their proteins are, where they sit, and what job the metabolism
 * reads from them (the role). Fields such as sites, allele and signalPeptide
 * belong to the later genome schema (spec §13.1) and are inert in M1.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-params.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.catalog = factory(B.params);
  }
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  const v = (id) => P.byId[id].value;

  // Roles are what the metabolism reads; a protein counts toward its role's capacity.
  const ROLES = ['glucose-import', 'glycolysis', 'aa-synthesis', 'aa-import', 'lactose-import', 'lactose-split', 'none'];

  function gene(slot, id, o) {
    return Object.freeze({
      slot, id,
      name: o.name,                    // what the protein is
      drawnAs: o.drawnAs || null,      // the single protein drawn for a lumped gene
      lumped: !!o.standsForGenes && o.standsForGenes > 1,
      standsForGenes: o.standsForGenes || 1,
      length: o.length,                // protein length L (aa); mRNA is 3L + 60 nt
      location: o.location,
      role: o.role,
      rRefParam: 'rRef_' + id,         // promoter strength at ×1 (/s per copy)
      rbsParam: 'b_' + id,
      defaultLevel: o.defaultLevel,
      kinetics: o.kinetics,            // parameter ids the role uses
      uniprot: o.uniprot || null,
      // Inert fields of the target genome schema (§13.1); M1 reads only oligomer and activity.
      oligomer: o.oligomer || 1,
      sites: Object.freeze([]),
      allele: 'wt',
      signalPeptide: false,
      compartment: 0,
      activity: 1,
    });
  }

  const GENES = Object.freeze([
    gene(0, 'ptsG', { name: 'glucose transporter EIICB^Glc', length: 477, location: 'membrane', role: 'glucose-import',
      defaultLevel: 1, kinetics: ['k_pts', 'K_G'], uniprot: 'P69786' }),
    gene(1, 'gly', { name: 'glucose-processing enzymes (lumped glycolysis)', drawnAs: 'GapA', standsForGenes: 10, length: 331,
      location: 'cytoplasm', role: 'glycolysis', defaultLevel: 1, kinetics: ['k_gly'], uniprot: 'P0A9B2' }),
    gene(2, 'aaSyn', { name: 'amino-acid-making enzymes (lumped)', standsForGenes: 100, length: 350, location: 'cytoplasm',
      role: 'aa-synthesis', defaultLevel: 1, kinetics: ['k_syn', 'k_P', 'K_i'] }),
    gene(3, 'aaImp', { name: 'amino-acid importers (lumped)', standsForGenes: 10, length: 440, location: 'membrane',
      role: 'aa-import', defaultLevel: 0.25, kinetics: ['k_imp', 'K_imp', 'K_iI', 'c_imp'] }),
    gene(4, 'lacY', { name: 'lactose permease LacY', length: 417, location: 'membrane', role: 'lactose-import',
      defaultLevel: 0, kinetics: ['k_Y', 'K_Y', 'L_max', 'c_Y'], uniprot: 'P02920' }),
    gene(5, 'lacZ', { name: 'β-galactosidase LacZ', length: 1024, location: 'cytoplasm', role: 'lactose-split',
      defaultLevel: 0, oligomer: 4, kinetics: ['k_Z', 'K_Z'], uniprot: 'P00722' }),
    gene(6, 'fliC', { name: 'flagellin', length: 498, location: 'cytoplasm', role: 'none',
      defaultLevel: 0, kinetics: [], uniprot: 'P04949' }),
  ]);

  // Slot 7 is free: reserved for level 1.1 decoys and the level 1.7 repressor LacI.
  const RESERVED_SLOTS = Object.freeze([{ slot: 7, reservedFor: 'level 1.1 decoys and 1.7 LacI' }]);

  // Background sectors: the rest of the proteome, not player-controlled in M1 (§5.2).
  const SECTORS = Object.freeze([
    Object.freeze({ id: 'R', name: 'ribosomes', standsFor: '55 r-proteins plus rRNA', lengthParam: 'L_R', rbs: 1 }),
    Object.freeze({ id: 'Q', name: 'housekeeping', standsFor: 'RNA polymerase, translation factors, chaperones, DNA machinery', lengthParam: 'L_Q', rbs: 1 }),
    Object.freeze({ id: 'P', name: 'other metabolism', standsFor: 'precursors, nucleotides, lipids, wall, fermentation and Leloir enzymes', lengthParam: 'L_P', rbs: 1 }),
  ]);

  // Promoter dial: 'off' keeps the 1/1,000 leak; knockout (separate) removes the gene.
  const LEVELS = Object.freeze([
    { key: 'off', value: 0 }, { key: 'x0.25', value: 0.25 }, { key: 'x0.5', value: 0.5 },
    { key: 'x1', value: 1 }, { key: 'x2', value: 2 }, { key: 'x4', value: 4 },
  ]);

  const MEDIUM_PRESETS = Object.freeze({
    glucose: Object.freeze({ none: 0, low: v('glucoseLow'), high: v('glucoseHigh') }),
    lactose: Object.freeze({ none: 0, present: v('lactosePresent') }),
    aminoAcids: Object.freeze({ none: 0, present: v('aminoAcidsPresent') }),
  });
  const DRUG_PRESETS = Object.freeze({ off: 0, low: v('drugLow'), full: 1 });

  // Cold start (§11.1): a cell of about 1 fL with enough machinery to run.
  const COLD_START = Object.freeze({
    E: 0.9,
    AA: 1.9e6,
    genes: Object.freeze({ ptsG: [8, 9000], gly: [25, 9e4], aaSyn: [25, 9e4], aaImp: [0, 300] }),   // [mRNA, protein]
    sectors: Object.freeze({ R: [400, 0.09], Q: [1100, 0.5], P: [700, 0.28] }),                 // [mRNA, mass as a fraction of rho·1 fL]
  });

  const STRAINS = Object.freeze({
    'm1-lab': Object.freeze({
      id: 'm1-lab', genes: GENES, reservedSlots: RESERVED_SLOTS, sectors: SECTORS, coldStart: COLD_START, maxGenes: 16,
    }),
  });

  return { ROLES, STRAINS, LEVELS, MEDIUM_PRESETS, DRUG_PRESETS };
});
