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
  const ROLES = ['glucose-import', 'glycolysis', 'aa-synthesis', 'aa-import', 'lactose-import', 'lactose-split', 'lac-repressor', 'none'];

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
      rRefParam: o.rRefParam || 'rRef_' + id,   // promoter strength at ×1 (/s per copy)
      rbsParam: o.rbsParam || 'b_' + id,
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

  // --- Strain 'm2-l11' (level 1.1): the lab strain plus a decoy -----------------------
  // araE, the arabinose–proton symporter: a membrane transporter whose sugar is never in the
  // medium, so it never does visible work (role 'none'). Promoter and RBS as lacY's; default off.
  const L11_GENES = Object.freeze(GENES.concat([
    gene(7, 'araE', { name: 'arabinose–proton symporter AraE', length: 472, location: 'membrane', role: 'none',
      defaultLevel: 0, kinetics: [], uniprot: 'P0AE24', rRefParam: 'rRef_lacY', rbsParam: 'b_lacY' }),
  ]));

  // --- Strain 'm2-lac' (level 1.7): the regulated lac operon (spec §13.3) ------------------
  // Slots 0–6 are the lab genes; lacZ, lacY and lacA are the three cistrons of one
  // polycistronic transcript (unit 'tu_lac') made from one promoter, which the repressor
  // LacI (slot 7, its own weak constitutive promoter) blocks through the operator and
  // cAMP–CRP activates. lacA (galactoside acetyltransferase) has no job here (role 'none').
  const M2_GENES = Object.freeze([
    GENES[0], GENES[1], GENES[2], GENES[3],
    gene(4, 'lacY', { name: 'lactose permease LacY', length: 417, location: 'membrane', role: 'lactose-import',
      defaultLevel: 1, kinetics: ['k_Y', 'K_Y', 'L_max', 'c_Y'], uniprot: 'P02920', rRefParam: 'rRef_lac' }),
    gene(5, 'lacZ', { name: 'β-galactosidase LacZ', length: 1024, location: 'cytoplasm', role: 'lactose-split',
      defaultLevel: 1, oligomer: 4, kinetics: ['k_Z', 'K_Z'], uniprot: 'P00722', rRefParam: 'rRef_lac' }),
    GENES[6],
    gene(7, 'lacI', { name: 'lac repressor LacI', length: 360, location: 'cytoplasm', role: 'lac-repressor',
      defaultLevel: 1, oligomer: 4, kinetics: ['tau_search', 'K_ind'], uniprot: 'P03023' }),
    gene(8, 'lacA', { name: 'galactoside acetyltransferase LacA', length: 203, location: 'cytoplasm', role: 'none',
      defaultLevel: 1, oligomer: 3, kinetics: [], uniprot: 'P07464', rRefParam: 'rRef_lac' }),
  ]);
  // Transcription units with more than one cistron (every other gene is its own unit), in
  // order from the promoter. Offsets along the mRNA follow from the cistron lengths.
  const M2_TUS = Object.freeze([
    Object.freeze({ id: 'tu_lac', cistrons: Object.freeze(['lacZ', 'lacY', 'lacA']), regulation: 'lac' }),
  ]);

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
      id: 'm1-lab', genes: GENES, tus: Object.freeze([]), regulation: null,
      reservedSlots: RESERVED_SLOTS, sectors: SECTORS, coldStart: COLD_START, maxGenes: 16, preset: 'm1-lab-glucose',
    }),
    'm2-l11': Object.freeze({
      id: 'm2-l11', genes: L11_GENES, tus: Object.freeze([]), regulation: null,
      reservedSlots: Object.freeze([]), sectors: SECTORS, coldStart: COLD_START, maxGenes: 16, preset: 'm2-l11-glucose',
      presetFrom: 'm1-lab',        // its presets are the lab strain's, with araE added empty
    }),
    'm2-lac': Object.freeze({
      id: 'm2-lac', genes: M2_GENES, tus: M2_TUS, regulation: 'lac',
      reservedSlots: Object.freeze([]), sectors: SECTORS, coldStart: COLD_START, maxGenes: 16, preset: 'm2-lac-glucose',
    }),
  });

  // The student's lac design (config.design, level 1.7; fixed for the run). Defaults = wild type.
  const DESIGN_DEFAULTS = Object.freeze({
    lac: Object.freeze({ promoter: 1, operator: true, crpSite: true }),
    lacI: Object.freeze({ allele: 'wt', promoter: 1 }),
  });
  const DESIGN_CHOICES = Object.freeze({
    'lac.promoter': Object.freeze([0.5, 1, 2, 4]), 'lac.operator': Object.freeze([true, false]),
    'lac.crpSite': Object.freeze([true, false]), 'lacI.allele': Object.freeze(['wt', 'deleted', 'Is']),
    'lacI.promoter': Object.freeze([1, 10]),
  });

  return { ROLES, STRAINS, LEVELS, MEDIUM_PRESETS, DRUG_PRESETS, DESIGN_DEFAULTS, DESIGN_CHOICES };
});
