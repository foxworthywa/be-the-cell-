// @deps btc-math btc-prng btc-params btc-catalog btc-presets btc-genome btc-queue btc-regulation btc-expression btc-metabolism btc-growth btc-commands btc-events btc-observe
/*
 * Be the Cell: the cell. Owns all simulation state and runs the fixed step
 * pipeline of engine spec §7:
 *
 *   commands → derived quantities → transcription → sector transcription →
 *   translation initiation → capacities → fast pools (E, AA, Lin) →
 *   completions → player mRNA → sector mRNA → protein degradation → growth →
 *   event detectors
 *
 * Everything that decides the future lives in this object as plain numbers,
 * typed arrays and fixed-capacity queues, written to canonical bytes in one
 * fixed order (writeState). hash(), presets, snapshots, twins and replay all
 * use those bytes, so a run is fully described by (config, seed, command log).
 *
 * Public API (spec §11): step/advance/advanceTo, command/schedule, getLog,
 * takeEvents, observe, snapshot, Cell.restore, fork, hash, physicsDigest,
 * configHash/paramsHash/presetHash, attach/detachRecorder, runRecord.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-math.js'), require('./btc-prng.js'), require('./btc-params.js'),
      require('./btc-catalog.js'), require('./btc-presets.js'), require('./btc-genome.js'), require('./btc-queue.js'),
      require('./btc-regulation.js'), require('./btc-expression.js'), require('./btc-metabolism.js'), require('./btc-growth.js'),
      require('./btc-commands.js'), require('./btc-events.js'), require('./btc-observe.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    var api = factory(B.math, B.prng, B.params, B.catalog, B.presets, B.genome, B.queue, B.regulation, B.expression, B.metabolism,
      B.growth, B.commands, B.events, B.observe);
    B.Cell = api.Cell;
    B.ConfigError = api.ConfigError;
    B.ENGINE_VERSION = api.ENGINE_VERSION;
  }
})(typeof self !== 'undefined' ? self : this, function (M, R, P, C, PRESETS, GENOME, Q, REG, X, MB, GR, CMD, EV, OBS) {
  'use strict';

  const ENGINE_VERSION = '1.1.1';        // 1.1.1: observe-only view fields and detail() (PROLOGUE.md §7); physics as 1.1.0
  const STATE_SCHEMA = 2;               // v1.1: IPTG in the medium, transcription units, lac regulation
  const SNAPSHOT_SCHEMA = 1;
  const MRNA_CAPACITY = 512;
  const NASCENT_CAPACITY = 512;
  const PRESET_ID = 'm1-lab-glucose';     // the lab strain's preset (each strain names its own in the catalog)
  const CHECKPOINT_EVERY = 600;       // ticks between automatic checkpoint hashes (run records, replay.verify)

  class ConfigError extends Error {
    constructor(code, path, message) {
      super(message);
      this.name = 'ConfigError';
      this.code = code;
      this.path = path;
    }
  }

  // ---------------------------------------------------------------------------
  // Per-gene and per-sector state
  // ---------------------------------------------------------------------------
  class GeneState {
    constructor(d, p) {
      this.d = d;                         // compiled descriptor (btc-genome)
      this.id = d.id;
      this.slot = d.slot;
      this.index = d.index;
      this.L = d.length;                  // protein length (aa)
      this.nt = d.mRNALength;             // mRNA length (nt) of the whole transcription unit
      // Transcription unit: the leader (first cistron) owns the promoter, transcripts and mRNA;
      // other cistrons share them (linked after construction) and keep their own ribosomes and protein.
      this.isLeader = d.leader === d.index;
      this.leader = this;
      this.tuSize = d.tuSize;
      this.offset = d.cistronOffset;      // nt from the transcription start to this cistron
      this.regulated = d.regulation !== null || d.role === 'lac-repressor';
      this.rRef = d.rRef;                 // promoter strength at ×1 (/s per copy)
      this.role = d.role;
      // Controls (hashed)
      this.level = d.defaultLevel;
      this.rateOverride = NaN;
      this.knockout = false;
      this.rbs = d.rbs;
      this.halfLife = p.mRNAHalfLife;
      this.kdeg = 0;
      this.activity = d.activity;
      this.promoterScale = 1;             // design strength of a promoter (config.design: lac ×0.5–4, lacI ×1 or ×10), else 1
      this.tlCopies = 0;                  // mRNA copies ribosomes can load this tick (per tick, not hashed)
      this.tlStarts = 0;                  // ribosomes that started on this gene this tick (observe-only scratch, 1.1.1)
      // Molecules (hashed)
      this.mature = new Q.MoleculeList(MRNA_CAPACITY);
      this.nascent = new Q.NascentQueue(NASCENT_CAPACITY);
      this.cohorts = new Q.CohortQueue(2 * d.length + 4);
      this.P = 0;
      this.initiations = 0;
      this.mMade = 0;
      this.pMade = 0;
      this.txStream = new Int32Array(4);
      this.decayStream = new Int32Array(4);
      // Derived from the controls (refresh())
      this.rate = 0;
      this.pDecay = 0;
      this.kdegLoss = 0;
      // One RNA polymerase covers rnapFootprint nt of DNA, which caps the transcripts a gene copy can hold.
      this.maxNascentPerCopy = Math.floor(d.mRNALength / p.rnapFootprint);
      // Last tick only (not hashed; kept in snapshots as scratch)
      this.txStarted = 0;
      this.mCompleted = 0;
      this.mDecayed = 0;
      this.pCompleted = 0;
      this.newestInitTick = 0;            // start tick of the newest transcript that finished
      this.degraded = 0;                  // protein degraded this tick (monomers)
    }

    refresh(p) {
      this.rate = X.promoterRate(p, this);
      this.pDecay = 1 - M.detExp(-M.LN2 * p.dt / this.halfLife);
      this.kdegLoss = this.kdeg > 0 ? 1 - M.detExp(-this.kdeg * p.dt) : 0;
    }
  }

  class SectorState {
    constructor(d) {
      this.d = d;
      this.id = d.id;
      this.L = d.length;
      this.nt = d.mRNALength;
      this.rbs = d.rbs;
      this.m = 0;                          // mRNA (continuous)
      this.mass = 0;                       // finished protein (aa)
      this.cohorts = new Q.CohortQueue(2 * d.length + 4);
      this.sigma0 = 0;                     // nominal transcription this tick (/s)
      this.sigInt = 0;                     // transcripts started this tick
      this.made = 0;                       // aa finished this tick
    }
  }

  function divisionRecord(nGenes, nSectors) {
    const genes = [];
    for (let i = 0; i < nGenes; i++) {
      genes.push({ mRNABefore: 0, mRNAKept: 0, mRNASister: 0, nascentBefore: 0, nascentKept: 0, nascentSister: 0,
        proteinBefore: 0, proteinKept: 0, proteinSister: 0, ribosomesBefore: 0, ribosomesKept: 0 });
    }
    const sectors = [];
    for (let j = 0; j < nSectors; j++) sectors.push({ mRNABefore: 0, mRNAKept: 0, massBefore: 0, massKept: 0, ribosomesBefore: 0, ribosomesKept: 0 });
    return { tick: -1, Mbefore: 0, Mafter: 0, genes, sectors, AABefore: 0, AAKept: 0, LinBefore: 0, LinKept: 0 };
  }

  // Scratch of the last tick that is not hashed but is kept in snapshots, so a
  // restored cell's view shows the same fluxes (spec §6). Written as float64.
  const K_SCRATCH = ['M', 'V', 'e0', 'hin', 'xa', 'chi', 'sUp', 'sTx', 'sEl', 'rifF', 'cmF', 'bgTx0', 'W', 'Rtot', 'Rfree', 'gI', 'kInit', 'Relong',
    'fR', 'Nnasc', 'U', 'Cgly', 'SynCap', 'ImpCap', 'YRaw', 'YCap', 'ZMax', 'NA', 'Cin', 'dD', 'vInt', 'lambda', 'Mend', 'lacTx', 'rescued'];
  const FLUX_SCRATCH = ['aaPolymerised', 'aaMade', 'aaImported', 'aaRecycled', 'glucoseIn', 'lactoseIn', 'lactoseSplit',
    'hexoseToGlycolysis', 'hexoseFermented', 'vRun'];
  const LEDGER_SCRATCH = ['supply', 'floor', 'spent', 'supply_perS', 'floor_perS', 'spent_perS'];

  /**
   * Every hashed field, in writeState order (spec §6; test d-6 perturbs each).
   * type: f64 | int | bool | enum | stream | list (a queue or molecule list) | f64x6 | pending
   */
  const STATE_LAYOUT = Object.freeze([
    ['tick', 'int'], ['Vbirth', 'f64'], ['gen', 'int'], ['dosage', 'int'], ['lambdaEMA', 'f64'], ['lastCycle_s', 'f64'], ['birthTick', 'int'],
    ['E', 'f64'], ['AA', 'f64'], ['Lin', 'f64'], ['D', 'f64'], ['N', 'f64'], ['Rbusy', 'f64'],
    ['genes[].level', 'f64'], ['genes[].rateOverride', 'f64'], ['genes[].knockout', 'bool'], ['genes[].rbs', 'f64'],
    ['genes[].halfLife', 'f64'], ['genes[].kdeg', 'f64'], ['genes[].activity', 'f64'],
    ['genes[].mature', 'list'], ['genes[].nascent', 'list'], ['genes[].cohorts', 'list'],
    ['genes[].P', 'f64'], ['genes[].initiations', 'f64'], ['genes[].mMade', 'f64'], ['genes[].pMade', 'f64'],
    ['sectors[].m', 'f64'], ['sectors[].cohorts', 'list'], ['sectors[].mass', 'f64'],
    ['nextMRNAId', 'int'],
    ['env.glucose_mM', 'f64'], ['env.lactose_mM', 'f64'], ['env.aminoAcids_mM', 'f64'], ['env.iptg_mM', 'f64'], ['rifDose', 'f64'], ['cmDose', 'f64'],
    ['s0', 'f64'], ['backupUptake', 'bool'], ['controls', 'enum'],
    ['genes[].txStream', 'stream'], ['genes[].decayStream', 'stream'], ['divisionStream', 'stream'],
    ['ledger.cumulative', 'f64x6'], ['ledger.cumulativeSupply', 'f64'], ['ledger.cumulativeFloor', 'f64'],
    ['seqNext', 'int'], ['pending', 'pending'],
  ].map(([path, type]) => Object.freeze({ path, type })));

  /** Extra hashed fields of a strain with the regulated lac operon (m2-lac), written after the division stream. */
  const LAC_STATE_LAYOUT = Object.freeze([
    ['lac.op', 'int8x2'], ['lac.allo', 'f64'], ['lac.stream', 'stream'],
  ].map(([path, type]) => Object.freeze({ path, type })));

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const isNum = (x) => typeof x === 'number' && x === x && x !== Infinity && x !== -Infinity;
  const levelValue = CMD.levelValue;

  function plainCopy(x) {
    return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  }

  const isSnapshot = (x) => !!x && typeof x === 'object' && x.schema === SNAPSHOT_SCHEMA && typeof x.state === 'string';

  function normalizeConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new ConfigError('bad-config', '', 'config must be an object');
    if (cfg.engineVersion !== undefined && cfg.engineVersion !== ENGINE_VERSION) {
      throw new ConfigError('engine-version', 'engineVersion', 'config is for engine ' + cfg.engineVersion + ', this is ' + ENGINE_VERSION);
    }
    const seed = cfg.seed;
    if (!(typeof seed === 'number' && seed >= 0 && seed <= 4294967295 && Math.floor(seed) === seed)) {
      throw new ConfigError('bad-value', 'seed', 'seed must be a uint32');
    }
    const strain = cfg.strain === undefined ? 'm1-lab' : cfg.strain;
    if (!C.STRAINS[strain]) throw new ConfigError('bad-value', 'strain', 'unknown strain ' + strain);
    const variant = normalizeVariant(cfg.variant);
    const design = normalizeDesign(cfg.design, C.STRAINS[strain]);
    const medium = Object.assign({ glucose_mM: C.MEDIUM_PRESETS.glucose.high, lactose_mM: 0, aminoAcids_mM: 0, iptg_mM: 0, oxygen: false }, plainCopy(cfg.medium) || {});
    if (medium.oxygen) throw new ConfigError('not-available', 'medium.oxygen', 'oxygen is not available in M1');
    for (const key of Object.keys(medium)) {
      if (key !== 'oxygen' && CMD.MEDIUM_FIELDS.indexOf(key) < 0) throw new ConfigError('bad-value', 'medium.' + key, 'unknown medium field ' + key);
    }
    for (const key of CMD.MEDIUM_FIELDS) {
      if (!isNum(medium[key]) || medium[key] < 0) throw new ConfigError('bad-value', 'medium.' + key, key + ' must be ≥ 0');
    }
    const drugs = Object.assign({ rifampicin: 0, chloramphenicol: 0 }, plainCopy(cfg.drugs) || {});
    for (const key of ['rifampicin', 'chloramphenicol']) {
      if (!isNum(drugs[key]) || drugs[key] < 0 || drugs[key] > 1) throw new ConfigError('bad-value', 'drugs.' + key, 'dose must be in [0, 1]');
    }
    const flags = Object.assign({ controls: 'free', backupGlucoseUptake: false, primingSeed: P.byId.s0.value, userGenes: null }, plainCopy(cfg.flags) || {});
    if (flags.controls !== 'free' && flags.controls !== 'locked') throw new ConfigError('bad-value', 'flags.controls', 'controls must be free or locked');
    // flags.userGenes (LEVELS.md R-E12): the only genes a 'user' gene command may name; null = all.
    if (flags.userGenes !== null) {
      const ids = C.STRAINS[strain].genes.map((g) => g.id);
      if (!Array.isArray(flags.userGenes) || flags.userGenes.some((id) => ids.indexOf(id) < 0)) {
        throw new ConfigError('bad-value', 'flags.userGenes', 'userGenes must be null or a list of gene ids of strain ' + strain);
      }
    }
    if (!isNum(flags.primingSeed) || flags.primingSeed < 0) throw new ConfigError('bad-value', 'flags.primingSeed', 'primingSeed must be ≥ 0');
    const params = plainCopy(cfg.params) || {};
    for (const id of Object.keys(params)) {
      if (!P.byId[id]) throw new ConfigError('unknown-param', 'params.' + id, 'unknown parameter ' + id);
      if (!isNum(params[id])) throw new ConfigError('bad-value', 'params.' + id, 'parameter values must be finite numbers');
    }
    let start = cfg.start === undefined ? 'steady' : cfg.start;
    if (isSnapshot(start)) start = plainCopy(start);
    else if (start !== 'steady' && start !== 'birth' && start !== 'cold') throw new ConfigError('bad-value', 'start', "start must be 'steady', 'birth', 'cold' or a Snapshot");
    const schedule = plainCopy(cfg.schedule) || [];
    if (!Array.isArray(schedule)) throw new ConfigError('bad-value', 'schedule', 'schedule must be an array of {tick, cmd}');
    return {
      engineVersion: ENGINE_VERSION, seed, strain, start, medium, genes: plainCopy(cfg.genes) || {}, drugs, flags, params,
      schedule, variant, design,
    };
  }

  /**
   * config.variant (LEVELS.md R-E3): null, or an opaque JSON-safe object of at most 2 KB. It is
   * folded into configHash and carried into snapshots and run records; the physics never reads
   * it (levels draw their variants outside the engine).
   */
  function normalizeVariant(v) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'object' || Array.isArray(v)) throw new ConfigError('bad-value', 'variant', 'variant must be null or a plain object');
    let text;
    try { text = M.canonicalJSON(JSON.parse(JSON.stringify(v))); } catch (err) { throw new ConfigError('bad-value', 'variant', 'variant must be JSON-safe'); }
    if (M.utf8(text).length > 2048) throw new ConfigError('bad-value', 'variant', 'variant must be at most 2 KB as canonical JSON');
    return JSON.parse(text);
  }

  /**
   * config.design (LEVELS.md R-E14; strain m2-lac): the student's lac region, fixed for the run.
   * {lac: {promoter: 0.5|1|2|4, operator: bool, crpSite: bool}, lacI: {allele: 'wt'|'deleted'|'Is',
   * promoter: 1|10}}; missing fields take the wild-type defaults. Other strains accept only null.
   */
  function normalizeDesign(d, strain) {
    if (!strain.regulation) {
      if (d !== undefined && d !== null) throw new ConfigError('not-available', 'design', 'strain ' + strain.id + ' has no designable operon');
      return null;
    }
    const src = plainCopy(d) || {};
    if (typeof src !== 'object' || Array.isArray(src)) throw new ConfigError('bad-value', 'design', 'design must be an object');
    const out = {};
    for (const part of Object.keys(src)) {
      if (!(part in C.DESIGN_DEFAULTS)) throw new ConfigError('bad-value', 'design.' + part, 'unknown design part ' + part);
    }
    for (const part of Object.keys(C.DESIGN_DEFAULTS)) {
      const given = src[part] || {};
      if (typeof given !== 'object' || Array.isArray(given)) throw new ConfigError('bad-value', 'design.' + part, part + ' must be an object');
      out[part] = {};
      for (const key of Object.keys(given)) {
        if (!(key in C.DESIGN_DEFAULTS[part])) throw new ConfigError('bad-value', 'design.' + part + '.' + key, 'unknown design field ' + key);
      }
      for (const key of Object.keys(C.DESIGN_DEFAULTS[part])) {
        const v = given[key] === undefined ? C.DESIGN_DEFAULTS[part][key] : given[key];
        if (C.DESIGN_CHOICES[part + '.' + key].indexOf(v) < 0) {
          throw new ConfigError('bad-value', 'design.' + part + '.' + key, part + '.' + key + ' must be one of ' + C.DESIGN_CHOICES[part + '.' + key].join(', '));
        }
        out[part][key] = typeof v === 'number' ? v + 0 : v;
      }
    }
    return out;
  }

  function deriveParams(cfg) {
    const p = P.values(cfg.params);
    if (!(p.dt > 0 && p.dt <= 2)) throw new ConfigError('bad-value', 'params.dt', 'dt must be in (0, 2] s');
    if (!(p.substeps >= 1 && Math.floor(p.substeps) === p.substeps)) throw new ConfigError('bad-value', 'params.substeps', 'substeps must be a positive integer');
    if (!(p.dt / p.substeps <= 0.25)) throw new ConfigError('bad-value', 'params.substeps', 'substep h = dt/substeps must be ≤ 0.25 s (keeps the amino-acid update positive, §7.13)');
    if (!(p.m_V > 0)) throw new ConfigError('bad-value', 'params.m_V', 'upkeep must be > 0 (keeps E below 1, §7.13)');
    if (!(p.upkeepBasal > 0 && p.upkeepBasal <= 1)) throw new ConfigError('bad-value', 'params.upkeepBasal', 'upkeepBasal must be in (0, 1] (keeps E below 1, §7.13)');
    for (const id of ['n_chiE', 'n_up', 'n_el']) {
      if (!(p[id] >= 1 && p[id] <= 16 && Math.floor(p[id]) === p[id])) throw new ConfigError('bad-value', 'params.' + id, id + ' must be an integer 1–16');
    }
    return Object.freeze(p);
  }

  const copyJSON = (x) => (x === null || x === undefined ? null : JSON.parse(JSON.stringify(x)));

  // ---------------------------------------------------------------------------
  // The cell
  // ---------------------------------------------------------------------------
  class Cell {
    /**
     * new Cell(config) builds a cell (spec §11.1). The optional second argument
     * is internal: {stubMetabolism: {E, v}} holds E fixed, runs ribosomes at
     * speed v and switches growth off (engine tests, spec §19 step 3);
     * {snapshot} is how Cell.restore rebuilds a cell.
     */
    constructor(config, internal) {
      const cfg = normalizeConfig(config);
      this.config = cfg;
      this.p = deriveParams(cfg);
      this.layout = GENOME.compile(cfg.strain, this.p);
      this.stub = internal && internal.stubMetabolism ? Object.freeze(Object.assign({ E: 0.9, v: 11.65 }, internal.stubMetabolism)) : null;
      this._presetHash = null;

      this.genes = this.layout.genes.map((d) => new GeneState(d, this.p));
      this.geneById = {};
      for (const g of this.genes) this.geneById[g.id] = g;
      // Cistrons of one transcription unit share its transcripts and mRNA molecules.
      for (const g of this.genes) {
        if (g.isLeader) continue;
        g.leader = this.genes[g.d.leader];
        g.mature = g.leader.mature;
        g.nascent = g.leader.nascent;
        g.halfLife = g.leader.halfLife;
      }
      this.lac = this.layout.regulation === 'lac' ? REG.createLac(this, cfg.design) : null;
      this.sectors = this.layout.sectors.map((d) => new SectorState(d));
      this.divisionStream = new Int32Array(4);

      // Scalars (hashed; order fixed in writeState)
      this.tick = 0;
      this.Vbirth = 1;
      this.gen = 0;
      this.dosage = 1;
      this.lambdaEMA = 0;
      this.lastCycle_s = 0;
      this.birthTick = 0;
      this.E = 0.9;
      this.AA = 0;
      this.Lin = 0;
      this.D = 0;          // ribosome odometer (aa travelled by a running ribosome)
      this.N = 0;          // transcription odometer (nt travelled by RNA polymerase)
      this.Rbusy = 0;      // ribosomes busy after last tick's initiation (recycled one tick later)
      this.nextMRNAId = 1;
      this.env = { glucose_mM: 0, lactose_mM: 0, aminoAcids_mM: 0, iptg_mM: 0, oxygen: false };
      this.rifDose = 0;
      this.cmDose = 0;
      this.s0 = cfg.flags.primingSeed;
      this.backupUptake = !!cfg.flags.backupGlucoseUptake;
      this.controls = cfg.flags.controls;
      this.userGenes = cfg.flags.userGenes;       // genes a 'user' command may name (null = all); config, not state
      // Derived from the above (refreshDerived)
      this.rho = 0;        // rifampicin occupancy
      this.theta = 0;      // chloramphenicol-stalled ribosome fraction
      this.uBasal = 0;

      this.ledger = {
        names: MB.LEDGER, tick: new Float64Array(6), perS: new Float64Array(6), fractions: new Float64Array(6),
        cumulative: new Float64Array(6), supply: 0, floor: 0, spent: 0, supply_perS: 0, floor_perS: 0, spent_perS: 0,
        cumulativeSupply: 0, cumulativeFloor: 0,
      };
      this.flux = {
        aaPolymerised: 0, aaMade: 0, aaImported: 0, aaRecycled: 0, glucoseIn: 0, lactoseIn: 0, lactoseSplit: 0,
        hexoseToGlycolysis: 0, hexoseFermented: 0, vRun: 0,
      };
      // Per-tick scratch shared by the pipeline stages (not hashed).
      const kM = M.LN2 / this.p.mRNAHalfLife;
      this.k = {
        h: this.p.dt / this.p.substeps, kM, decayFactorM: M.detExp(-kM * this.p.dt),
        emaFactor: 1 - M.detExp(-this.p.dt / this.p.emaTau),
        M: 0, V: 0, e0: 0, hin: 0, xa: 0, chi: 0, rifF: 1, cmF: 1, bgTx0: 0,
        W: 0, Rtot: 0, Rfree: 0, gI: 0, kInit: 0, Relong: 0, fR: 0, Nnasc: 0,
        U: 0, Cgly: 0, SynCap: 0, ImpCap: 0, YRaw: 0, YCap: 0, ZMax: 0, NA: 0, Cin: 0,
        dD: 0, vInt: 0, lambda: 0, Mend: 0, lacTx: 0, rescued: 0,
        // Hill constants K^n, fixed for the run (the parameters are frozen).
        KchiEn: M.powInt(this.p.K_chiE, this.p.n_chiE), KupN: M.powInt(this.p.K_up, this.p.n_up), KelN: M.powInt(this.p.K_el, this.p.n_el), KtxN: M.powInt(this.p.K_tx, this.p.n_tx), sUp: 0, sTx: 0, sEl: 0,
      };
      this.lastDivision = divisionRecord(this.genes.length, this.sectors.length);

      // Commands, log, events, checkpoints (not hashed except the pending queue and seqNext).
      this.pending = [];
      this.seqNext = 0;
      this.log = [];
      this.events = [];
      this.eventState = EV.createState(this.genes.length);
      this.checkpoints = [];
      this.watchers = [];                  // cell.watch(): edge-triggered conditions on view paths (not hashed)
      this.recorders = [];
      this._view = null;
      this._writer = new M.ByteWriter(32768);

      if (internal && internal.snapshot) {
        this.fromSnapshot(internal.snapshot);
      } else {
        if (cfg.start === 'steady' || cfg.start === 'birth') {
          // 'birth': the steady preset advanced to just after its first division (V ≈ 1 fL, one gene copy).
          const presetId = this.layout.preset + (cfg.start === 'birth' ? '-birth' : '');
          const preset = PRESETS[presetId];
          if (!preset) throw new ConfigError('no-preset', 'start', 'preset ' + presetId + ' is missing: run tools/make-presets.js');
          this.startFrom(preset.state);
          this._presetHash = preset.hash;
        } else if (cfg.start === 'cold') {
          this.coldStart();
        } else {
          this.startFrom(cfg.start.state);          // a Snapshot as the starting point: reseeded like the preset
        }
        this.applyConfig();
        this.k.Mend = GR.mass(this);
        for (let i = 0; i < cfg.schedule.length; i++) {
          const entry = cfg.schedule[i] || {};
          this.submit(entry.tick, entry.cmd, 'schedule', true);
        }
      }
      this._configHash = M.hash64(M.utf8(M.canonicalJSON(Object.assign({}, this.config, { presetHash: this._presetHash }))));
      this._paramsHash = M.hash64(M.utf8(M.canonicalJSON(this.p)));
      if (internal && internal.snapshot && internal.snapshot.configHash !== undefined && internal.snapshot.configHash !== this._configHash) {
        throw new ConfigError('config-hash', 'configHash', 'snapshot configHash ' + internal.snapshot.configHash + ' does not match its config (' + this._configHash + ')');
      }
    }

    // --- construction -------------------------------------------------------
    coldStart() {
      const cs = this.layout.coldStart, p = this.p;
      this.E = cs.E;
      this.AA = cs.AA;
      for (const g of this.genes) {
        const init = cs.genes[g.id];
        if (!init) continue;
        for (let i = 0; i < init[0]; i++) this.addMRNA(g, 0);
        g.P = init[1];
      }
      for (const s of this.sectors) {
        const init = cs.sectors[s.id];
        s.m = init[0];
        s.mass = init[1] * p.rho;
      }
      if (this.lac) {
        const gI = this.genes[this.lac.lacI];
        gI.P = 4 * p.lacIRef;                  // a cell starts with its usual ≈10 repressor tetramers, operators bound
        REG.reset(this.lac, true);
      }
      this.Vbirth = 1;
      this.seedStreams();
    }

    /**
     * Starts a fresh run from stored state bytes (the steady preset, or a
     * Snapshot given as config.start): tick 0 with stored ticks rebased,
     * counters, ledger and log cleared, and every PRNG stream re-derived from
     * this config's seed (spec §11.1).
     */
    startFrom(stateBase64) {
      this.readState(new M.ByteReader(M.base64Decode(stateBase64)));
      const offset = -this.tick;
      this.tick = 0;
      this.birthTick += offset;
      for (const g of this.genes) {
        if (g.isLeader) {
          g.mature.shiftTicks(offset);
          g.nascent.shiftTicks(offset);
        }
        g.initiations = 0; g.mMade = 0; g.pMade = 0;
      }
      this.gen = 0;
      this.ledger.cumulative.fill(0);
      this.ledger.cumulativeSupply = 0;
      this.ledger.cumulativeFloor = 0;
      this.pending.length = 0;
      this.seqNext = 0;
      this.seedStreams();
    }

    seedStreams() {
      const seed = this.config.seed;
      for (const g of this.genes) {
        R.seedStream(seed, 'tx:' + g.id, g.txStream);
        R.seedStream(seed, 'decay:' + g.id, g.decayStream);
      }
      R.seedStream(seed, 'division', this.divisionStream);
      if (this.lac) REG.seed(this, seed);
    }

    applyConfig() {
      const cfg = this.config;
      Object.assign(this.env, { glucose_mM: cfg.medium.glucose_mM, lactose_mM: cfg.medium.lactose_mM, aminoAcids_mM: cfg.medium.aminoAcids_mM,
        iptg_mM: cfg.medium.iptg_mM });
      this.rifDose = cfg.drugs.rifampicin;
      this.cmDose = cfg.drugs.chloramphenicol;
      this.s0 = cfg.flags.primingSeed;
      this.backupUptake = !!cfg.flags.backupGlucoseUptake;
      this.controls = cfg.flags.controls;
      this.userGenes = cfg.flags.userGenes;
      for (const id of Object.keys(cfg.genes)) {
        const g = this.geneById[id], o = cfg.genes[id], path = 'genes.' + id;
        if (!g) throw new ConfigError('unknown-gene', path, 'no gene ' + id);
        // A regulated gene's transcription is set by its design (config.design), not by a dial.
        for (const key of ['level', 'rate_perS', 'mRNAHalfLife_s', 'knockout']) {
          if (o[key] !== undefined && (g.regulated || !g.isLeader)) {
            throw new ConfigError('not-available', path + '.' + key, id + ' is transcribed from ' + (g.regulated ? 'a regulated promoter' : 'the ' + g.d.tu + ' promoter') + '; use config.design');
          }
        }
        if (o.initial && o.initial.mRNA !== undefined && !(g.isLeader && g.tuSize === 1)) {
          throw new ConfigError('not-available', path + '.initial.mRNA', id + ' shares the ' + g.d.tu + ' mRNA');
        }
        const wasOn = CMD.isOn(g);
        if (o.level !== undefined) {
          if (levelValue(o.level) < 0) throw new ConfigError('bad-value', path + '.level', 'level must be off, 0, 0.25, 0.5, 1, 2 or 4');
          g.level = levelValue(o.level);
        }
        if (o.rate_perS !== undefined) {
          if (!isNum(o.rate_perS) || o.rate_perS < 0) throw new ConfigError('bad-value', path + '.rate_perS', 'rate must be ≥ 0');
          g.rateOverride = o.rate_perS + 0;
        }
        if (o.rbs !== undefined) {
          if (!isNum(o.rbs) || !(o.rbs > 0) || o.rbs > 16) throw new ConfigError('bad-value', path + '.rbs', 'rbs must be in (0, 16]');
          g.rbs = o.rbs + 0;
        }
        if (o.knockout !== undefined) g.knockout = !!o.knockout;
        const init0 = o.initial || {};
        if (init0.clear !== undefined && typeof init0.clear !== 'boolean') throw new ConfigError('bad-value', path + '.initial.clear', 'clear must be true or false');
        // A knocked-out strain never had the gene; initial.clear empties it without a knockout (R-E6).
        if (g.knockout || init0.clear === true) this.clearGeneProducts(g);
        if (o.mRNAHalfLife_s !== undefined) {
          if (!isNum(o.mRNAHalfLife_s) || o.mRNAHalfLife_s <= 0) throw new ConfigError('bad-value', path + '.mRNAHalfLife_s', 'half-life must be > 0');
          g.halfLife = o.mRNAHalfLife_s + 0;
        }
        if (o.kdeg_perS !== undefined) {
          if (!isNum(o.kdeg_perS) || o.kdeg_perS < 0) throw new ConfigError('bad-value', path + '.kdeg_perS', 'kdeg must be ≥ 0');
          g.kdeg = o.kdeg_perS + 0;
        }
        const init = o.initial || {};
        if (init.mRNA !== undefined) {
          if (!(init.mRNA >= 0 && init.mRNA <= MRNA_CAPACITY && Math.floor(init.mRNA) === init.mRNA)) {
            throw new ConfigError('bad-value', path + '.initial.mRNA', 'initial mRNA must be an integer 0–' + MRNA_CAPACITY);
          }
          g.mature.count = 0;
          for (let i = 0; i < init.mRNA; i++) this.addMRNA(g, this.tick);
        }
        if (init.protein !== undefined) {
          if (!isNum(init.protein) || init.protein < 0) throw new ConfigError('bad-value', path + '.initial.protein', 'initial protein must be ≥ 0');
          g.P = init.protein + 0;
        }
        // A gene the config switches on or off starts its episode at tick 0.
        const on = CMD.isOn(g);
        if (on !== wasOn) EV.openEpisode(this.eventState, g, on, this.tick);
      }
      if (this.lac) this.applyDesign();
      this.refreshDerived();
    }

    /**
     * The student's lac design (config.design), applied at tick 0 on top of the preset:
     * lacI 'deleted' removes the repressor gene with its protein and mRNA; 'Is' keeps LacI but
     * it never binds inducer (btc-regulation.js); no operator means nothing blocks the promoter;
     * the promoter strengths scale the lac and lacI promoters (refreshDerived).
     */
    applyDesign() {
      const lac = this.lac, gI = this.genes[lac.lacI];
      if (lac.deleted) {
        gI.knockout = true;
        this.clearGeneProducts(gI);
        gI.P = 0;
      }
      if (lac.deleted || !lac.operator) REG.reset(lac, false);
      else for (let c = 0; c < REG.MAX_COPIES; c++) if (lac.op[c] !== 0 && lac.op[c] !== 1) lac.op[c] = 0;
    }

    /**
     * A strain built with a gene knocked out never had it: no mRNA, no transcripts in
     * progress and no ribosomes on its mRNA (protein is set separately, by initial.protein).
     * The setKnockout command, by contrast, only stops transcription.
     */
    clearGeneProducts(g) {
      if (g.tuSize === 1) {                     // a cistron of a longer unit shares the unit's mRNA, which stays
        g.mature.count = 0;
        g.nascent.len = 0;
        g.nascent.head = 0;
      }
      this.Rbusy -= g.cohorts.nSum;
      if (this.Rbusy < 0) this.Rbusy = 0;
      while (g.cohorts.len > 0) g.cohorts.popHead();
    }

    addMRNA(g, birthTick) {
      g.leader.mature.add(this.nextMRNAId, birthTick);
      this.nextMRNAId = (this.nextMRNAId + 1) | 0;
    }

    /** Recomputes everything derived from the controls, drugs and flags. */
    refreshDerived() {
      const p = this.p;
      this.rho = this.rifDose;
      this.theta = p.thetaMax * this.cmDose;
      this.uBasal = this.backupUptake ? p.uBasal_backup : 0;
      if (this.lac) {
        this.genes[this.lac.leader].promoterScale = this.lac.design.lac.promoter;
        this.genes[this.lac.lacI].promoterScale = this.lac.design.lacI.promoter;
      }
      for (const g of this.genes) g.refresh(p);
      for (const t of this.layout.tus) {         // a longer unit is silent only when all its cistrons are knocked out
        let all = true;
        for (const m of t.members) if (!this.genes[m].knockout) all = false;
        if (all) this.genes[t.leader].rate = 0;
      }
      for (const g of this.genes) {
        if (g.isLeader) continue;
        g.halfLife = g.leader.halfLife;          // cistrons of one unit share its mRNA and its half-life
        g.pDecay = g.leader.pDecay;
      }
    }

    // --- time ---------------------------------------------------------------
    get t() { return this.tick * this.p.dt; }
    get dt() { return this.p.dt; }

    step() {
      const T = this.tick;
      this.applyPending(T);                 // §7.1
      this.deriveStart();                   // §7.2
      if (this.lac) REG.step(this);         // operators, inducer, cAMP–CRP (v1.1)
      X.initiateTranscription(this);        // §7.3
      X.sectorTranscription(this);          // §7.4
      X.initiateTranslation(this);          // §7.5
      MB.capacities(this);                  // §7.6
      if (this.stub) MB.stubPools(this, this.stub);
      else MB.fastPools(this);              // §7.7
      if (this.lac) REG.afterPools(this);   // allolactose
      X.completeChains(this);               // §7.8
      X.rescueStalled(this);                // §7.8b stalled ribosomes on decayed mRNA are released (v1.1)
      X.playerMRNA(this);                   // §7.9
      X.sectorMRNA(this);                   // §7.10
      X.degradeProteins(this);              // §7.11
      if (!this.stub) GR.grow(this);        // §7.12
      else { this.k.lambda = 0; this.k.Mend = GR.mass(this); }
      EV.detect(this);                      // §11.4, stamped with tick T
      this.tick = T + 1;
      if (this.watchers.length) EV.checkWatchers(this, T);   // read the view after the step; events stamped T
      if (this.tick % CHECKPOINT_EVERY === 0) this.checkpoints.push({ tick: this.tick, hash: this.hash() });
      for (let i = 0; i < this.recorders.length; i++) this.recorders[i].onTick(this);
    }

    advance(n) {
      for (let i = 0; i < n; i++) this.step();
      return n;
    }

    advanceTo(tick) {
      while (this.tick < tick) this.step();
    }

    // §7.2 Quantities fixed for the whole tick.
    deriveStart() {
      const k = this.k, p = this.p;
      k.M = GR.mass(this);
      k.V = k.M / p.rho;
      const e0 = this.E;
      k.e0 = e0;
      k.hin = e0 / (e0 + p.K_in);
      k.xa = this.AA / k.V / p.K_chiA;
      const xa2 = k.xa * k.xa;
      const chiA = xa2 / (1 + xa2);
      // Energy leg: steep near the growing cell's charge (Hill n_chiE), so ribosome synthesis and
      // initiation give way as soon as supply falls short, before ATP runs down (v1.1).
      const chiE = M.hill(e0, k.KchiEn, p.n_chiE);
      k.chi = chiA * chiE;                   // ppGpp-like signal: high when amino acids and energy are plentiful
      // Energy gates (v1.1), in the order they close as the charge falls: χ (above), then s_up
      // (regulated upkeep, sector Q and P transcription, amino-acid synthesis), s_tx (unregulated
      // player promoters), then s_el (ribosome elongation, promoter firing; idle ribosomes
      // hibernate). Demand falls to what supply allows before ATP runs down.
      k.sUp = M.hill(e0, k.KupN, p.n_up);
      k.sTx = M.hill(e0, k.KtxN, p.n_tx);
      k.sEl = M.hill(e0, k.KelN, p.n_el);
      k.rifF = 1 - this.rho;
      k.cmF = 1 - this.theta;
      this.flux.aaRecycled = 0;
    }

    // --- commands (spec §11.3) ----------------------------------------------
    /** Queues cmd for the start of the next step. The source defaults to 'user'. */
    command(cmd) {
      return this.submit(this.tick, cmd, cmd && typeof cmd === 'object' && cmd.source !== undefined ? cmd.source : 'user');
    }

    /** Queues cmd for a future tick (lessons and tests). The source defaults to 'lesson'. */
    schedule(tick, cmd) {
      return this.submit(tick, cmd, cmd && typeof cmd === 'object' && cmd.source !== undefined ? cmd.source : 'lesson');
    }

    /**
     * Validates, logs and queues one command (internal; replay uses it directly).
     * Every submission takes the next seq and one log entry, accepted or not.
     * Source 'schedule' is reserved for config.schedule (fromConfig), because
     * replay takes those commands from the config instead of the log.
     */
    submit(tick, cmd, source, fromConfig) {
      const seq = this.seqNext++;
      const type = cmd && typeof cmd === 'object' ? cmd.type : undefined;
      const args = CMD.canonicalArgs(cmd);
      const at = typeof tick === 'number' ? tick + 0 : tick;
      const entry = { tick: at, seq, type, args, source, submitTick: this.tick };
      this.log.push(entry);
      let v;
      if (!(typeof at === 'number' && Math.floor(at) === at)) v = { ok: false, code: 'bad-value', message: 'tick must be an integer' };
      else if (at < this.tick) v = { ok: false, code: 'tick-in-past', message: 'tick ' + at + ' is in the past' };
      else if (source === 'schedule' && !fromConfig) v = { ok: false, code: 'bad-value', message: "source 'schedule' is reserved for config.schedule" };
      else v = CMD.validate(this, type, args, source);
      if (!v.ok) {
        entry.rejected = v.code;
        this.emit('command_rejected', { seq, cmdType: type, args: copyJSON(args), resolved: null, prev: this.controlOrNull(type, args), code: v.code });
        return { ok: false, error: v.code, message: v.message, seq };
      }
      const pend = { tick: at, seq, type, args: copyJSON(args), source };
      // pending stays sorted by (tick, seq); seq only grows, so insert after equal ticks.
      let i = this.pending.length;
      while (i > 0 && this.pending[i - 1].tick > at) i--;
      this.pending.splice(i, 0, pend);
      return { ok: true, tick: at, seq };
    }

    /** The resolved value of the control a command names, or null if the command does not name one. */
    controlOrNull(type, args) {
      if (CMD.TYPES.indexOf(type) < 0) return null;
      if (CMD.GENE_COMMANDS[type] && !(typeof args.gene === 'string' && Object.prototype.hasOwnProperty.call(this.geneById, args.gene))) return null;
      if (type === 'setDrug' && args.drug !== 'rifampicin' && args.drug !== 'chloramphenicol') return null;
      return CMD.control(this, type, args);
    }

    logEntry(seq) {
      const e = this.log[seq];
      if (e && e.seq === seq) return e;
      for (let i = 0; i < this.log.length; i++) if (this.log[i].seq === seq) return this.log[i];
      return null;
    }

    applyPending(T) {
      while (this.pending.length > 0 && this.pending[0].tick === T) {
        const e = this.pending.shift();
        const entry = this.logEntry(e.seq);
        // Re-validated at application: the controls may have changed since submission.
        const v = CMD.validate(this, e.type, e.args, e.source);
        const prev = this.controlOrNull(e.type, e.args);
        if (!v.ok) {
          if (entry) entry.rejected = v.code;
          this.emit('command_rejected', { seq: e.seq, cmdType: e.type, args: copyJSON(e.args), resolved: null, prev, code: v.code });
          continue;
        }
        const g = CMD.GENE_COMMANDS[e.type] ? this.geneById[e.args.gene] : null;
        const wasOn = g ? CMD.isOn(g) : false;
        CMD.apply(this, e.type, e.args);
        const resolved = CMD.control(this, e.type, e.args);
        if (entry) entry.resolved = resolved;
        EV.commandApplied(this, e.type, e.args, wasOn);
        this.emit('command_applied', { seq: e.seq, cmdType: e.type, args: copyJSON(e.args), resolved: copyJSON(resolved), prev });
      }
    }

    /** A copy of the command log (LogEntry[], spec §11.3). */
    getLog() { return copyJSON(this.log); }

    // --- events (spec §11.4) --------------------------------------------------
    emit(type, extra, atTick) {
      const tick = atTick === undefined ? this.tick : atTick;
      const ev = { tick, tEnd_s: (tick + 1) * this.p.dt, type };
      if (extra) Object.assign(ev, extra);
      this.events.push(ev);
    }

    /** Drains the event queue. */
    takeEvents() {
      const out = this.events;
      this.events = [];
      return out;
    }

    attachRecorder(rec) { this.recorders.push(rec); }
    detachRecorder(rec) { const i = this.recorders.indexOf(rec); if (i >= 0) this.recorders.splice(i, 1); }

    // --- watchers (spec §11.2, §20 grammar; v1.1) ------------------------------
    /**
     * Registers an edge-triggered watcher and returns its id: a 'watch' event {id, value} fires
     * at the end of every tick in which the condition becomes true (first check after
     * registration included). spec: {id?, field, op, value, gene?}; field is a view path
     * 'group.field' or 'genes.<geneId>.field' (or give gene and a plain field).
     * Watchers read the view, never the physics; they are kept in snapshots, not hashed.
     */
    watch(spec) {
      const w = EV.compileWatcher(this, spec, this.watchers);
      if (w.error) throw new ConfigError(w.error, 'watch.' + w.path, w.message);
      this.watchers.push(w);
      return w.id;
    }

    /** Removes a watcher; returns true if it existed. */
    unwatch(id) {
      for (let i = 0; i < this.watchers.length; i++) {
        if (this.watchers[i].id === id) { this.watchers.splice(i, 1); return true; }
      }
      return false;
    }

    // --- the view (spec §11.5) ------------------------------------------------
    /** The read-only view: one object, reused, refreshed when the tick has moved on. */
    observe() {
      if (this._view === null) this._view = OBS.createView(this);
      if (this._view.tick !== this.tick) OBS.refresh(this._view, this);
      return this._view;
    }

    /**
     * Observe-only detail for one gene (engine 1.1.1, PROLOGUE.md §7), for the Gene close-up:
     * out.ribosomeProgress (a Float64Array, 16 bins by default) is filled with the gene's
     * ribosomes by chain progress (D − D0)/L, from its cohort queue (≤ 2L + 1 entries). Pure
     * read, allocation-free when out is passed; nothing in the physics or the hash reads it.
     * Returns out: {gene, tick, ribosomes, ribosomeProgress}.
     */
    detail(geneId, out) {
      const o = out || { gene: '', tick: -1, ribosomes: 0, ribosomeProgress: new Float64Array(16) };
      const bins = o.ribosomeProgress, nb = bins.length;
      for (let b = 0; b < nb; b++) bins[b] = 0;
      o.gene = geneId;
      o.tick = this.tick;
      o.ribosomes = 0;
      const g = Object.prototype.hasOwnProperty.call(this.geneById, geneId) ? this.geneById[geneId] : null;
      if (!g) return o;
      const q = g.cohorts, D = this.D, L = g.L;
      let sum = 0;
      for (let k = 0; k < q.len; k++) {
        let i = q.head + k;
        if (i >= q.cap) i -= q.cap;
        const x = (D - q.D0[i]) / L;
        let b = Math.floor(x * nb);
        if (!(b >= 0)) b = 0; else if (b >= nb) b = nb - 1;
        bins[b] += q.n[i];
        sum += q.n[i];
      }
      o.ribosomes = sum;
      return o;
    }

    // --- state bytes, hashes ------------------------------------------------
    /**
     * Canonical state bytes (spec §6): every field that affects the future, in
     * a fixed order (STATE_LAYOUT). physicsOnly leaves out env, drugs and
     * pending commands (physicsDigest, negative controls only).
     */
    writeState(w, physicsOnly) {
      w.i32(STATE_SCHEMA);
      // time and cell
      w.f64(this.tick);
      w.f64(this.Vbirth); w.f64(this.gen); w.f64(this.dosage); w.f64(this.lambdaEMA); w.f64(this.lastCycle_s); w.f64(this.birthTick);
      // pools and odometers
      w.f64(this.E); w.f64(this.AA); w.f64(this.Lin);
      w.f64(this.D); w.f64(this.N); w.f64(this.Rbusy);
      // genes, in slot order
      w.i32(this.genes.length);
      for (const g of this.genes) {
        w.f64(g.level); w.f64(g.rateOverride); w.f64(g.knockout ? 1 : 0); w.f64(g.rbs); w.f64(g.halfLife); w.f64(g.kdeg); w.f64(g.activity);
        if (g.isLeader) {                      // a unit's transcripts and mRNA are written once, with its leader
          g.mature.write(w);
          g.nascent.write(w);
        }
        g.cohorts.write(w);
        w.f64(g.P); w.f64(g.initiations); w.f64(g.mMade); w.f64(g.pMade);
      }
      // sectors
      for (const s of this.sectors) { w.f64(s.m); s.cohorts.write(w); w.f64(s.mass); }
      w.i32(this.nextMRNAId);
      if (!physicsOnly) {
        w.f64(this.env.glucose_mM); w.f64(this.env.lactose_mM); w.f64(this.env.aminoAcids_mM); w.f64(this.env.iptg_mM);
        w.f64(this.rifDose); w.f64(this.cmDose);
      }
      // flags
      w.f64(this.s0); w.f64(this.backupUptake ? 1 : 0); w.f64(this.controls === 'locked' ? 1 : 0);
      // PRNG streams: tx and decay per gene in slot order, then division
      for (const g of this.genes) {
        for (let i = 0; i < 4; i++) w.i32(g.txStream[i]);
        for (let i = 0; i < 4; i++) w.i32(g.decayStream[i]);
      }
      for (let i = 0; i < 4; i++) w.i32(this.divisionStream[i]);
      if (this.lac) REG.write(w, this.lac);    // operator copies, allolactose, operator stream
      // ledger (cumulative)
      for (let i = 0; i < 6; i++) w.f64(this.ledger.cumulative[i]);
      w.f64(this.ledger.cumulativeSupply); w.f64(this.ledger.cumulativeFloor);
      if (!physicsOnly) {
        w.f64(this.seqNext);
        w.i32(this.pending.length);
        for (const e of this.pending) {
          w.f64(e.tick); w.f64(e.seq);
          w.str(M.canonicalJSON({ type: e.type, args: e.args, source: e.source }));
        }
      }
    }

    readState(r) {
      if (r.i32() !== STATE_SCHEMA) throw new ConfigError('bad-state', 'state', 'unknown state schema');
      this.tick = r.f64();
      this.Vbirth = r.f64(); this.gen = r.f64(); this.dosage = r.f64(); this.lambdaEMA = r.f64(); this.lastCycle_s = r.f64(); this.birthTick = r.f64();
      this.E = r.f64(); this.AA = r.f64(); this.Lin = r.f64();
      this.D = r.f64(); this.N = r.f64(); this.Rbusy = r.f64();
      if (r.i32() !== this.genes.length) throw new ConfigError('bad-state', 'state', 'gene count differs');
      for (const g of this.genes) {
        g.level = r.f64(); g.rateOverride = r.f64(); g.knockout = r.f64() === 1; g.rbs = r.f64(); g.halfLife = r.f64(); g.kdeg = r.f64(); g.activity = r.f64();
        if (g.isLeader) {
          g.mature.read(r);
          g.nascent.read(r);
        }
        g.cohorts.read(r);
        g.P = r.f64(); g.initiations = r.f64(); g.mMade = r.f64(); g.pMade = r.f64();
      }
      for (const s of this.sectors) { s.m = r.f64(); s.cohorts.read(r); s.mass = r.f64(); }
      this.nextMRNAId = r.i32();
      this.env.glucose_mM = r.f64(); this.env.lactose_mM = r.f64(); this.env.aminoAcids_mM = r.f64(); this.env.iptg_mM = r.f64();
      this.rifDose = r.f64(); this.cmDose = r.f64();
      this.s0 = r.f64(); this.backupUptake = r.f64() === 1; this.controls = r.f64() === 1 ? 'locked' : 'free';
      for (const g of this.genes) {
        for (let i = 0; i < 4; i++) g.txStream[i] = r.i32();
        for (let i = 0; i < 4; i++) g.decayStream[i] = r.i32();
      }
      for (let i = 0; i < 4; i++) this.divisionStream[i] = r.i32();
      if (this.lac) REG.read(r, this.lac);
      for (let i = 0; i < 6; i++) this.ledger.cumulative[i] = r.f64();
      this.ledger.cumulativeSupply = r.f64(); this.ledger.cumulativeFloor = r.f64();
      this.seqNext = r.f64();
      const nPending = r.i32();
      this.pending.length = 0;
      for (let i = 0; i < nPending; i++) {
        const tick = r.f64(), seq = r.f64(), c = JSON.parse(r.str());
        this.pending.push({ tick, seq, type: c.type, args: c.args, source: c.source });
      }
      if (!r.done) throw new ConfigError('bad-state', 'state', 'trailing bytes in state');
      this.refreshDerived();
    }

    stateBytes(physicsOnly) {
      const w = new M.ByteWriter(32768);
      this.writeState(w, physicsOnly);
      return w.bytes();
    }

    loadStateBytes(bytes) { this.readState(new M.ByteReader(bytes)); }

    /** 16 hex characters over the canonical state bytes (reuses one byte buffer). */
    hash() { return this.digest(false); }
    physicsDigest() { return this.digest(true); }

    digest(physicsOnly) {
      const w = this._writer;
      w.n = 0;
      this.writeState(w, physicsOnly);
      return M.hash64(new Uint8Array(w.buf, 0, w.n));
    }

    get configHash() { return this._configHash; }
    get paramsHash() { return this._paramsHash; }
    /** hash64 of the steady preset this run started from, or null (cold start or a Snapshot start). */
    get presetHash() { return this._presetHash; }

    // --- scratch (not hashed; kept in snapshots) -----------------------------
    writeScratch(w) {
      const k = this.k, f = this.flux, led = this.ledger;
      for (let i = 0; i < K_SCRATCH.length; i++) w.f64(k[K_SCRATCH[i]]);
      for (let i = 0; i < FLUX_SCRATCH.length; i++) w.f64(f[FLUX_SCRATCH[i]]);
      for (let i = 0; i < 6; i++) { w.f64(led.tick[i]); w.f64(led.perS[i]); w.f64(led.fractions[i]); }
      for (let i = 0; i < LEDGER_SCRATCH.length; i++) w.f64(led[LEDGER_SCRATCH[i]]);
      for (const g of this.genes) {
        w.f64(g.txStarted); w.f64(g.mCompleted); w.f64(g.mDecayed); w.f64(g.pCompleted); w.f64(g.newestInitTick); w.f64(g.degraded);
        w.f64(g.tlCopies); w.f64(g.tlStarts);
      }
      for (const s of this.sectors) { w.f64(s.sigma0); w.f64(s.sigInt); w.f64(s.made); }
      if (this.lac) for (let i = 0; i < REG.SCRATCH.length; i++) w.f64(this.lac[REG.SCRATCH[i]]);
    }

    readScratch(r) {
      const k = this.k, f = this.flux, led = this.ledger;
      for (let i = 0; i < K_SCRATCH.length; i++) k[K_SCRATCH[i]] = r.f64();
      for (let i = 0; i < FLUX_SCRATCH.length; i++) f[FLUX_SCRATCH[i]] = r.f64();
      for (let i = 0; i < 6; i++) { led.tick[i] = r.f64(); led.perS[i] = r.f64(); led.fractions[i] = r.f64(); }
      for (let i = 0; i < LEDGER_SCRATCH.length; i++) led[LEDGER_SCRATCH[i]] = r.f64();
      for (const g of this.genes) {
        g.txStarted = r.f64(); g.mCompleted = r.f64(); g.mDecayed = r.f64(); g.pCompleted = r.f64(); g.newestInitTick = r.f64(); g.degraded = r.f64();
        g.tlCopies = r.f64(); g.tlStarts = r.f64();
      }
      for (const s of this.sectors) { s.sigma0 = r.f64(); s.sigInt = r.f64(); s.made = r.f64(); }
      if (this.lac) for (let i = 0; i < REG.SCRATCH.length; i++) this.lac[REG.SCRATCH[i]] = r.f64();
    }

    // --- snapshot, restore, fork, run record (spec §11.2) ---------------------
    /** A JSON-safe, exact copy of everything this cell needs to continue. */
    snapshot() {
      const sw = new M.ByteWriter(4096);
      this.writeScratch(sw);
      return {
        schema: SNAPSHOT_SCHEMA, engineVersion: ENGINE_VERSION, configHash: this._configHash, paramsHash: this._paramsHash,
        presetHash: this._presetHash, config: copyJSON(this.config), tick: this.tick, seqNext: this.seqNext,
        state: M.base64Encode(this.stateBytes(false)),
        scratch: M.base64Encode(sw.bytes()),
        pending: copyJSON(this.pending),
        log: this.getLog(),
        eventState: EV.cloneState(this.eventState),
        watchers: copyJSON(this.watchers), marks: [],   // marks are still deferred (spec §20)
        checkpoints: copyJSON(this.checkpoints),
      };
    }

    fromSnapshot(snap) {
      this.readState(new M.ByteReader(M.base64Decode(snap.state)));
      if (typeof snap.scratch === 'string') {
        const r = new M.ByteReader(M.base64Decode(snap.scratch));
        this.readScratch(r);
        if (!r.done) throw new ConfigError('bad-snapshot', 'scratch', 'scratch has the wrong length');
      } else this.k.Mend = GR.mass(this);
      this._presetHash = snap.presetHash === undefined ? null : snap.presetHash;
      this.log = copyJSON(snap.log || []);
      if (snap.eventState) this.eventState = EV.cloneState(snap.eventState);
      this.checkpoints = copyJSON(snap.checkpoints || []);
      this.watchers = copyJSON(snap.watchers || []);
    }

    /** The same cell, with common random numbers from here on (restore of a snapshot). */
    fork() {
      return Cell.restore(this.snapshot(), this.stub ? { stubMetabolism: this.stub } : undefined);
    }

    /** Everything needed to replay and verify this run (BTC.replay). */
    runRecord() {
      return {
        engineVersion: ENGINE_VERSION, configHash: this._configHash, presetHash: this._presetHash, config: copyJSON(this.config),
        log: this.getLog(), finalTick: this.tick, checkpoints: copyJSON(this.checkpoints), finalHash: this.hash(),
      };
    }

    // --- convenience readouts (the full read-only view is observe()) ---------
    get mass() { return GR.mass(this); }
    get volume() { return GR.mass(this) / this.p.rho; }
    get lambda() { return this.k.lambda; }
    gene(id) { return this.geneById[id]; }
  }

  /** Rebuilds a cell from a snapshot; continuing gives the same hashes as never stopping (test d-3). */
  Cell.restore = function (snap, internal) {
    const s = typeof snap === 'string' ? JSON.parse(snap) : snap;
    if (!isSnapshot(s)) throw new ConfigError('bad-snapshot', '', 'not a snapshot (schema ' + SNAPSHOT_SCHEMA + ')');
    if (s.engineVersion !== ENGINE_VERSION) {
      throw new ConfigError('engine-version', 'engineVersion', 'snapshot is from engine ' + s.engineVersion + ', this is ' + ENGINE_VERSION);
    }
    return new Cell(s.config, Object.assign({}, internal || {}, { snapshot: s }));
  };

  Cell.ENGINE_VERSION = ENGINE_VERSION;
  Cell.PRESET_ID = PRESET_ID;
  Cell.STATE_LAYOUT = STATE_LAYOUT;
  Cell.LAC_STATE_LAYOUT = LAC_STATE_LAYOUT;
  Cell.CHECKPOINT_EVERY = CHECKPOINT_EVERY;

  return { Cell, ConfigError, ENGINE_VERSION, STATE_SCHEMA, STATE_LAYOUT, LAC_STATE_LAYOUT, CHECKPOINT_EVERY };
});
