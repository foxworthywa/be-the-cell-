// @deps btc-math btc-growth btc-commands btc-events
/*
 * Be the Cell: the read-only view of a cell (engine spec §11.5).
 *
 * The view is a flyweight: every object and typed array in it is allocated
 * once, when the cell first calls createView, and refresh() only writes
 * numbers and strings into them. Variable-length data (a gene's mRNA ids,
 * its transcripts in progress) is exposed as a fixed-capacity array plus a
 * count, so drawing a frame never allocates. The UI reads the view and never
 * writes to it.
 *
 * Also here:
 *   limiting(cell)     the first thing that limits growth, in a fixed order
 *   facts(cell, out)   schema 1.2: words, not numbers, for the narrator
 * Nothing in the physics or the hash reads any of this.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-math.js'), require('./btc-growth.js'), require('./btc-commands.js'), require('./btc-events.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.observe = factory(B.math, B.growth, B.commands, B.events);
  }
})(typeof self !== 'undefined' ? self : this, function (M, GR, CMD, EV) {
  'use strict';

  const FACTS_SCHEMA = '1.3';
  // 1 mmol/gDW/h = 3.21e4 molecules/s per fL of cell (spec §3; display only).
  const MMOL_PER_GDWH = 3.21e4;
  const SECTOR_IDS = ['R', 'Q', 'P'];

  // Every value each facts field can take (the narrator tests check that each occurs).
  const FACT_VALUES = Object.freeze({
    'drug.rif': ['off', 'low', 'full'],
    'drug.cm': ['off', 'low', 'full'],
    medium: ['none', 'glucose', 'lactose', 'both'],
    glucoseLevel: ['none', 'low', 'high'],
    carbon: ['none', 'glucose', 'lactose', 'both'],
    glucoseImport: ['none', 'low', 'normal'],
    glucoseStep: ['import', 'enzymes'],
    energy: ['normal', 'low', 'none'],
    aa: ['ok', 'low'],
    lactoseBlock: ['no-lacY', 'no-lacZ', null],
    lastCommandedGene: ['gene', null],
    uselessGene: ['fliC', 'lacZ', 'lacY', 'aaImp', null],
    aaOutside: [true, false],
    aaImportOn: [true, false],
    growth: ['normal', 'slow', 'arrested'],
    justDivided: [true, false],
    limiting: ['translation-blocked', 'transcription-blocked', 'no-carbon', 'energy', 'amino-acids', 'ribosomes'],
    // Schema 1.3 (v1.1; LEVELS.md R-E16): the regulated lac operon, null in strains without it.
    lacOperator: ['bound', 'free', 'none', null],
    inducer: ['none', 'some', null],
    crp: ['low', 'high', null],
  });

  const USELESS_ORDER = ['fliC', 'lacZ', 'lacY', 'aaImp'];
  // A useless gene's share of elongating ribosomes: it becomes the burden above USELESS_ON and stays
  // it while above USELESS_STAY (hysteresis; one gene's share swings with mRNA bursts, spec §11.5).
  const USELESS_ON = 0.025, USELESS_STAY = 0.010;
  // aaImportOn: the medium supplies at least this share of the amino acids polymerised.
  const AA_IMPORT_SHARE = 0.05;
  const JUST_DIVIDED_TICKS = 90;

  const byRole = (cell, role) => {
    const i = cell.layout.roleIndex[role];
    return i < 0 ? null : cell.genes[i];
  };
  const roleProtein = (cell, role) => {
    const g = byRole(cell, role);
    return g ? g.P * g.activity : 0;
  };

  /** geneState (spec §11.5): what a gene is doing, as one word. */
  function geneState(cell, g) {
    if (g.knockout) return 'knocked-out';
    const m = g.mature.count, n = g.nascent.len;
    if (CMD.isOn(g)) {
      const rifF = 1 - cell.rho, cmF = 1 - cell.theta;
      if (cell.E < 0.05 || (rifF < cmF ? rifF : cmF) < 0.1) return 'stalled';
      // A regulated operon with every operator copy held by the repressor (v1.1, m2-lac).
      if (cell.lac && g.leader.index === cell.lac.leader && m + n === 0 && cell.lac.free === 0) return 'repressed';
      const ep = cell.eventState.genes[g.index];
      if (ep.kind === 'on' && ep.firstTxTick === null && n === 0) return 'waiting';
      return m + n > 0 ? 'transcribing' : 'waiting';
    }
    if (m + n > 0) return 'leftover-mRNA';
    return g.P >= 1 ? 'protein-only' : 'off';
  }

  /** The first thing that limits growth, in this order (spec §11.5). */
  function limiting(cell) {
    if (cell.theta > 0.5) return 'translation-blocked';
    if (cell.rho > 0.5) return 'transcription-blocked';
    const p = cell.p, V = GR.mass(cell) / p.rho, G = cell.env.glucose_mM;
    // C_in = U + 2Z (§7.6–7.7): glucose through the transporters plus lactose split inside.
    const U = G > 0 ? (roleProtein(cell, 'glucose-import') * p.k_pts + cell.uBasal * V) : 0;
    const Z = cell.Lin > 0 ? roleProtein(cell, 'lactose-split') : 0;
    if (!(U > 0) && !(Z > 0)) return 'no-carbon';
    if (cell.E < 0.5) return 'energy';
    if (cell.AA / V < p.K_aa) return 'amino-acids';     // s_aa = a/(a + K_aa) < 0.5
    return 'ribosomes';
  }

  // ---------------------------------------------------------------------------
  // Facts, schema 1.2
  // ---------------------------------------------------------------------------
  function createFacts() {
    return {
      schema: FACTS_SCHEMA, drug: { rif: 'off', cm: 'off' }, medium: 'glucose', glucoseLevel: 'high', carbon: 'glucose',
      glucoseImport: 'normal', glucoseStep: 'import', energy: 'normal', aa: 'ok', lactoseBlock: null, lastCommandedGene: null,
      uselessGene: null, aaOutside: false, aaImportOn: false, growth: 'normal', justDivided: false, limiting: 'ribosomes',
      lacOperator: null, inducer: null, crp: null,
      _gene: { id: '', state: '' },       // reused holder behind lastCommandedGene
    };
  }

  const cut = (x) => (x === 0 ? 'off' : x > 0.5 ? 'full' : 'low');
  const which = (glucose, lactose) => (glucose ? (lactose ? 'both' : 'glucose') : (lactose ? 'lactose' : 'none'));

  /**
   * Fills out (from createFacts) from the end of the last completed tick (spec §11.5). No numbers leave here.
   * Pass the same out object each time: uselessGene keeps its previous value inside a hysteresis band.
   */
  function facts(cell, out) {
    const f = out || createFacts();
    const p = cell.p, env = cell.env, st = cell.eventState;
    const V = GR.mass(cell) / p.rho, E = cell.E;
    f.drug.rif = cut(cell.rho);
    f.drug.cm = cut(cell.theta);
    f.medium = which(env.glucose_mM > 0, env.lactose_mM > 0);
    f.glucoseLevel = env.glucose_mM === 0 ? 'none' : env.glucose_mM < 0.1 ? 'low' : 'high';
    const carbonMin = 0.01 * p.F_ref;
    f.carbon = which(cell.flux.glucoseIn > carbonMin, 2 * cell.flux.lactoseSplit > carbonMin);
    const CU = roleProtein(cell, 'glucose-import') * p.k_pts + cell.uBasal * V;
    f.glucoseImport = CU < 0.01 * p.U_ref ? 'none' : CU < 0.25 * p.U_ref ? 'low' : 'normal';
    // Which step holds glucose use back: PtsG uptake is matched to glycolysis (Chex = min(Cgly, C_in), §7.7).
    f.glucoseStep = cell.k.Cgly < cell.k.U ? 'enzymes' : 'import';
    f.energy = E > 0.7 ? 'normal' : E < 0.1 ? 'none' : 'low';
    f.aa = cell.AA / V < EV.THRESHOLDS.AA_LOW ? 'low' : 'ok';
    if (env.lactose_mM > 0) {
      if (roleProtein(cell, 'lactose-import') < 0.01 * p.lacY_ref) f.lactoseBlock = 'no-lacY';
      else if (roleProtein(cell, 'lactose-split') < 0.01 * p.lacZ_ref) f.lactoseBlock = 'no-lacZ';
      else f.lactoseBlock = null;
    } else f.lactoseBlock = null;
    if (st.lastGene !== null) {
      f._gene.id = st.lastGene;
      f._gene.state = geneState(cell, cell.geneById[st.lastGene]);
      f.lastCommandedGene = f._gene;
    } else f.lastCommandedGene = null;
    // A gene is a burden when it is useless here and ribosomes are translating it now (with hysteresis).
    const prev = f.uselessGene;
    f.uselessGene = null;
    let elongating = 0;
    for (let i = 0; i < cell.genes.length; i++) elongating += cell.genes[i].cohorts.nSum;
    for (let i = 0; i < cell.sectors.length; i++) elongating += cell.sectors[i].cohorts.nSum;
    for (let k = 0; k < USELESS_ORDER.length && elongating > 0; k++) {
      const id = USELESS_ORDER[k], g = cell.geneById[id];
      if (!g) continue;
      const useless = id === 'fliC' || ((id === 'lacZ' || id === 'lacY') && !(env.lactose_mM > 0)) || (id === 'aaImp' && env.aminoAcids_mM === 0);
      if (useless && g.cohorts.nSum / elongating > (id === prev ? USELESS_STAY : USELESS_ON)) { f.uselessGene = id; break; }
    }
    f.aaOutside = env.aminoAcids_mM > 0;
    // Import counts when it supplies a real share of the amino acids used, whatever the promoter level.
    f.aaImportOn = cell.flux.aaImported > AA_IMPORT_SHARE * cell.flux.aaPolymerised;
    f.growth = st.arrested ? 'arrested' : cell.lambdaEMA < 0.8 * p.lambda_ref ? 'slow' : 'normal';
    f.justDivided = st.lastDivisionTick !== null && cell.tick - st.lastDivisionTick <= JUST_DIVIDED_TICKS;
    f.limiting = limiting(cell);
    // Schema 1.3: the lac operon. 'bound' when any copy's operator holds the repressor; the
    // inducer counts as 'some' at or above the level that frees half the operators at the
    // normal LacI count (lac.inducerHalf_uM); cAMP below half its no-glucose level is 'low'.
    const lac = cell.lac;
    if (lac) {
      let bound = 0;
      for (let c = 0; c < cell.dosage; c++) bound += lac.op[c];
      f.lacOperator = !lac.operator ? 'none' : bound > 0 ? 'bound' : 'free';
      const I = 1000 * (lac.allo / (p.N_mM * V) + env.iptg_mM);
      f.inducer = I >= lac.inducerHalf_uM ? 'some' : 'none';
      f.crp = lac.cAMP < 0.5 ? 'low' : 'high';
    } else { f.lacOperator = null; f.inducer = null; f.crp = null; }
    return f;
  }

  // ---------------------------------------------------------------------------
  // The view
  // ---------------------------------------------------------------------------
  function createView(cell) {
    const nG = cell.genes.length, nU = nG + cell.sectors.length;
    const genes = [], geneById = {};
    for (let i = 0; i < nG; i++) {
      const g = cell.genes[i], d = g.d;
      const v = {
        id: d.id, slot: d.slot, role: d.role, lumped: d.lumped, standsForGenes: d.standsForGenes,
        level: 'off', rate_perS: 0, knockout: false, rbs: 0,
        mRNA: 0, mRNAIds: g.mature.ids, mRNABirthTick: g.mature.birth,
        nascent: 0, nascentProgress: new Float64Array(g.nascent.cap), ribosomes: 0, polysome: 0,
        protein: 0, proteinRounded: 0, conc_perFL: 0, proteomeFraction: 0, synthesis_perS: 0,
        madeSinceOn: 0, madeSinceOff: 0, geneState: 'off', functionSeen: false,
        mRNAMade: 0, proteinMade: 0, initiations: 0,   // cumulative since tick 0 (R-E8; a unit's cistrons share mRNA counts)
        degraded_perS: 0,                        // protein removed by degradation in the last tick, per s (R-E10)
        tu: d.tu,                                // transcription unit (lacZ, lacY and lacA share 'tu_lac' in m2-lac)
        episode: { onTick: null, firstMRNATick: null, firstProteinTick: null, offTick: null },
      };
      genes.push(v);
      geneById[d.id] = v;
    }
    const sectors = {};
    for (let s = 0; s < SECTOR_IDS.length; s++) sectors[SECTOR_IDS[s]] = { mRNA: 0, mass: 0, fraction: 0 };
    // Transcription units: one entry per unit (a one-gene unit is named after its gene). The
    // mRNA ids are the unit's molecule list itself (valid [0, mRNA)).
    const tus = [];
    for (let i = 0; i < nG; i++) {
      const g = cell.genes[i];
      if (!g.isLeader) continue;
      const cistrons = cell.genes.filter((x) => x.leader === g).map((x) => x.id);
      const order = g.tuSize > 1 ? cell.layout.tus.find((t) => t.leader === i).members.map((m) => cell.genes[m].id) : cistrons;
      tus.push({ id: g.d.tu, cistrons: Object.freeze(order), mRNA: 0, mRNAIds: g.mature.ids, nascent: 0, leader: g.id });
    }
    const view = {
      tick: -1, t_s: 0,
      clock: { minutes: 0, generation: 0, cellAge_s: 0, lastCycle_min: 0, doublingEMA_min: 0 },
      cell: { V_fL: 0, Vbirth_fL: 0, length_um: 0, width_um: 0, dosage: 1, M_aa: 0, proteins300: 0, lambda_perS: 0, lambda_perH: 0, lambdaEMA_perH: 0 },
      energy: { E: 0, ATP: 0, ADP: 0, ATP_mM: 0, turnover_s: 0, state: 'normal' },
      aminoAcids: { count: 0, mM: 0, state: 'ok' },
      lactose: { inside: 0, inside_mM: 0 },
      ribosomes: { total: 0, elongating: 0, running: 0, stalled: 0, free: 0, activeFraction: 0, vRun_aaPerS: 0, vTx_ntPerS: 0, byUnit: new Float64Array(nU), kInitPerMRNA: 0 },
      genes, geneById, tus,
      sectors,
      // The regulated lac operon (m2-lac; null in other strains; LEVELS.md R-E16).
      lac: cell.lac ? {
        operatorCopies: 1, operatorBound: 0, lacITetramers: 0, lacIFree: 0, allolactose: 0, allolactose_mM: 0,
        cAMP: 1, crpFactor: 1,
        inducer_uM: 0 /* allolactose + IPTG */, iptg_uM: 0, activeLacI: 0 /* tetramers not holding inducer */,
        promoterActivity: 0 /* per-copy promoter use: crpFactor × (free + leak × bound) */, exclusion: 0,
        inducerHalf_uM: cell.lac.inducerHalf_uM, design: cell.lac.design,
      } : null,
      proteome: { byGene: new Float64Array(nG), R: 0, Q: 0, P: 0 },
      flux: {
        glucoseIn: 0, glucoseIn_mmolPerGDWh: 0, lactoseIn: 0, lactoseSplit: 0, hexoseToGlycolysis: 0, hexoseFermented: 0,
        fermentationProductsOut: 0, aaMade: 0, aaImported: 0, aaRecycled: 0, aaPolymerised: 0, ntPolymerised: 0,
        transcriptsStarted: new Float64Array(nG), mRNAsCompleted: new Float64Array(nG), proteinsCompleted: new Float64Array(nG),
        ribosomesMade: 0, atpMade: 0, atpSpent: 0,
      },
      ledger: {
        names: cell.ledger.names, perS: new Float64Array(6), fractions: new Float64Array(6), cumulative: new Float64Array(6),
        supply_perS: 0, floor_perS: 0, cumulativeSupply: 0,
      },
      env: { glucose_mM: 0, lactose_mM: 0, aminoAcids_mM: 0, iptg_mM: 0, oxygen: false },
      drugs: { rifampicin: 0, chloramphenicol: 0, theta: 0 },
      scale: { dt_s: cell.p.dt, substeps: cell.p.substeps },
    };
    return view;
  }

  /** Writes the cell's current state into its view. Allocates nothing. */
  function refresh(view, cell) {
    const p = cell.p, k = cell.k, dt = p.dt, st = cell.eventState;
    const mass = GR.mass(cell), V = mass / p.rho, E = cell.E, theta = cell.theta;
    const nG = cell.genes.length;
    view.tick = cell.tick;
    view.t_s = cell.tick * dt;

    const c = view.clock;
    c.minutes = view.t_s / 60;
    c.generation = cell.gen;
    c.cellAge_s = (cell.tick - cell.birthTick) * dt;
    c.lastCycle_min = cell.lastCycle_s / 60;
    c.doublingEMA_min = cell.lambdaEMA > 0 ? M.LN2 / cell.lambdaEMA / 60 : Infinity;

    // A rod of radius r: V = πr²(ℓ − 2r) + 4/3·πr³.
    const r = p.rodRadius, cap = 4 / 3 * Math.PI * r * r * r;
    const cc = view.cell;
    cc.V_fL = V;
    cc.Vbirth_fL = cell.Vbirth;
    cc.length_um = V > cap ? (V - cap) / (Math.PI * r * r) + 2 * r : 2 * r;
    cc.width_um = 2 * r;
    cc.dosage = cell.dosage;
    cc.M_aa = mass;
    cc.proteins300 = mass / 300;
    cc.lambda_perS = k.lambda;
    cc.lambda_perH = k.lambda * 3600;
    cc.lambdaEMA_perH = cell.lambdaEMA * 3600;

    const NA = p.A_tot * p.N_mM * V;
    const en = view.energy;
    en.E = E;
    en.ATP = E * NA;
    en.ADP = (1 - E) * NA;
    en.ATP_mM = E * p.A_tot;
    en.turnover_s = cell.ledger.spent_perS > 0 ? en.ATP / cell.ledger.spent_perS : Infinity;
    en.state = E > 0.7 ? 'normal' : E < 0.1 ? 'depleted' : 'low';

    view.aminoAcids.count = cell.AA;
    view.aminoAcids.mM = cell.AA / V / p.N_mM;
    view.aminoAcids.state = cell.AA / V < EV.THRESHOLDS.AA_LOW ? 'low' : 'ok';
    view.lactose.inside = cell.Lin;
    view.lactose.inside_mM = cell.Lin / V / p.N_mM;

    // Ribosomes: elongating = on mRNA now; of those a fraction θ is held by chloramphenicol.
    const rb = view.ribosomes;
    let elong = 0;
    for (let i = 0; i < nG; i++) { const n = cell.genes[i].cohorts.nSum; rb.byUnit[i] = n; elong += n; }
    for (let s = 0; s < cell.sectors.length; s++) { const n = cell.sectors[s].cohorts.nSum; rb.byUnit[nG + s] = n; elong += n; }
    const Rtot = cell.sectors[0].mass / p.aaPerRibosome;
    rb.total = Rtot;
    rb.elongating = elong;
    rb.running = (1 - theta) * elong;
    rb.stalled = theta * elong;
    rb.free = Rtot > elong ? Rtot - elong : 0;
    rb.activeFraction = Rtot > 0 ? rb.running / Rtot : 0;
    rb.vRun_aaPerS = cell.flux.vRun;
    rb.vTx_ntPerS = p.ntPerAA * (1 - p.cmTx * theta) * cell.flux.vRun;
    rb.kInitPerMRNA = k.kInit;

    let nNasc = 0;
    for (let i = 0; i < nG; i++) {
      const g = cell.genes[i], v = view.genes[i], ep = st.genes[i];
      const m = g.mature.count, nq = g.nascent, n = nq.len;
      v.level = CMD.levelName(g);
      v.rate_perS = g.rate;
      v.knockout = g.knockout;
      v.rbs = g.rbs;
      v.mRNA = m;
      v.nascent = n;
      for (let j = 0; j < n; j++) {
        const x = (cell.N - nq.N0[nq.index(j)]) / g.nt;
        v.nascentProgress[j] = x < 0 ? 0 : x > 1 ? 1 : x;
      }
      nNasc += n;
      v.ribosomes = g.cohorts.nSum;
      v.polysome = m + n > 0 ? v.ribosomes / (m + n) : 0;
      v.protein = g.P;
      v.proteinRounded = Math.floor(g.P + 0.5);
      v.conc_perFL = g.P / V;
      v.proteomeFraction = g.P * g.L / mass;
      view.proteome.byGene[i] = v.proteomeFraction;
      v.synthesis_perS = g.pCompleted / dt;
      v.madeSinceOn = ep.kind === 'on' ? g.pMade - ep.pMadeAtOn : 0;
      v.madeSinceOff = ep.kind === 'off' ? g.pMade - ep.pMadeAtOff : 0;
      v.geneState = geneState(cell, g);
      v.functionSeen = st.fnSeen[i];
      v.mRNAMade = g.mMade;
      v.proteinMade = g.pMade;
      v.initiations = g.initiations;
      v.degraded_perS = g.degraded / dt;
      v.episode.onTick = ep.onTick;
      v.episode.firstMRNATick = ep.firstMRNATick;
      v.episode.firstProteinTick = ep.firstProteinTick;
      v.episode.offTick = ep.offTick;
      view.flux.transcriptsStarted[i] = g.txStarted / dt;
      view.flux.mRNAsCompleted[i] = g.mCompleted / dt;
      view.flux.proteinsCompleted[i] = g.pCompleted / dt;
    }
    let sectorNt = 0;
    for (let s = 0; s < cell.sectors.length; s++) {
      const u = cell.sectors[s], o = view.sectors[SECTOR_IDS[s]];
      o.mRNA = u.m;
      o.mass = u.mass;
      o.fraction = u.mass / mass;
      view.proteome[SECTOR_IDS[s]] = o.fraction;
      sectorNt += u.sigInt * u.nt;
    }

    const fl = view.flux, cf = cell.flux;
    fl.glucoseIn = cf.glucoseIn;
    fl.glucoseIn_mmolPerGDWh = cf.glucoseIn / (MMOL_PER_GDWH * V);
    fl.lactoseIn = cf.lactoseIn;
    fl.lactoseSplit = cf.lactoseSplit;
    fl.hexoseToGlycolysis = cf.hexoseToGlycolysis;
    fl.hexoseFermented = cf.hexoseFermented;
    fl.fermentationProductsOut = 2 * cf.hexoseFermented;     // lumped acids and ethanol
    fl.aaMade = cf.aaMade;
    fl.aaImported = cf.aaImported;
    fl.aaRecycled = cf.aaRecycled;
    fl.aaPolymerised = cf.aaPolymerised;
    // Player transcripts grow at 3 nt per aa of ribosome travel; sector transcripts are counted whole when started.
    fl.ntPolymerised = rb.vTx_ntPerS * nNasc + sectorNt / dt;
    fl.ribosomesMade = cell.sectors[0].made / p.aaPerRibosome / dt;
    fl.atpMade = cell.ledger.supply_perS;
    fl.atpSpent = cell.ledger.spent_perS;

    const lg = view.ledger, cl = cell.ledger;
    for (let i = 0; i < 6; i++) { lg.perS[i] = cl.perS[i]; lg.fractions[i] = cl.fractions[i]; lg.cumulative[i] = cl.cumulative[i]; }
    lg.supply_perS = cl.supply_perS;
    lg.floor_perS = cl.floor_perS;
    lg.cumulativeSupply = cl.cumulativeSupply;

    view.env.glucose_mM = cell.env.glucose_mM;
    view.env.lactose_mM = cell.env.lactose_mM;
    view.env.aminoAcids_mM = cell.env.aminoAcids_mM;
    view.env.iptg_mM = cell.env.iptg_mM;
    for (let t = 0; t < view.tus.length; t++) {
      const u = view.tus[t], g = cell.geneById[u.leader];
      u.mRNA = g.mature.count;
      u.nascent = g.nascent.len;
    }
    if (cell.lac) {
      const L = cell.lac, o = view.lac;
      let bound = 0;
      for (let c = 0; c < cell.dosage; c++) bound += L.op[c];
      o.operatorCopies = cell.dosage;
      o.operatorBound = bound;
      o.lacITetramers = L.tetramers;
      o.lacIFree = L.tetramers > bound ? L.tetramers - bound : 0;
      o.allolactose = L.allo;
      o.allolactose_mM = L.allo / (p.N_mM * V);
      o.cAMP = L.cAMP;
      o.crpFactor = L.crpFactor;
      o.inducer_uM = L.inducer_uM;
      o.iptg_uM = 1000 * cell.env.iptg_mM;
      o.activeLacI = L.active;
      o.promoterActivity = cell.k.lacTx;
      o.exclusion = L.exclusion;
    }
    view.drugs.rifampicin = cell.rifDose;
    view.drugs.chloramphenicol = cell.cmDose;
    view.drugs.theta = theta;
    return view;
  }

  return { FACTS_SCHEMA, FACT_VALUES, createView, refresh, geneState, limiting, createFacts, facts };
});
