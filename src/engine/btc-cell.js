// @deps btc-math btc-prng btc-params btc-catalog btc-presets btc-genome btc-queue btc-expression btc-metabolism btc-growth btc-commands btc-events btc-observe
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
      require('./btc-expression.js'), require('./btc-metabolism.js'), require('./btc-growth.js'),
      require('./btc-commands.js'), require('./btc-events.js'), require('./btc-observe.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    var api = factory(B.math, B.prng, B.params, B.catalog, B.presets, B.genome, B.queue, B.expression, B.metabolism, B.growth,
      B.commands, B.events, B.observe);
    B.Cell = api.Cell;
    B.ConfigError = api.ConfigError;
    B.ENGINE_VERSION = api.ENGINE_VERSION;
  }
})(typeof self !== 'undefined' ? self : this, function (M, R, P, C, PRESETS, GENOME, Q, X, MB, GR, CMD, EV, OBS) {
  'use strict';

  const ENGINE_VERSION = '1.0.0';
  const STATE_SCHEMA = 1;
  const SNAPSHOT_SCHEMA = 1;
  const MRNA_CAPACITY = 512;
  const NASCENT_CAPACITY = 512;
  const PRESET_ID = 'm1-lab-glucose';
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
      this.nt = d.mRNALength;             // mRNA length (nt)
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
  const K_SCRATCH = ['M', 'V', 'e0', 'hin', 'xa', 'chi', 'rifF', 'cmF', 'bgTx0', 'W', 'Rtot', 'Rfree', 'gI', 'kInit', 'Relong',
    'fR', 'Nnasc', 'U', 'Cgly', 'SynCap', 'ImpCap', 'YCap', 'ZMax', 'NA', 'Cin', 'dD', 'vInt', 'lambda', 'Mend'];
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
    ['env.glucose_mM', 'f64'], ['env.lactose_mM', 'f64'], ['env.aminoAcids_mM', 'f64'], ['rifDose', 'f64'], ['cmDose', 'f64'],
    ['s0', 'f64'], ['backupUptake', 'bool'], ['controls', 'enum'],
    ['genes[].txStream', 'stream'], ['genes[].decayStream', 'stream'], ['divisionStream', 'stream'],
    ['ledger.cumulative', 'f64x6'], ['ledger.cumulativeSupply', 'f64'], ['ledger.cumulativeFloor', 'f64'],
    ['seqNext', 'int'], ['pending', 'pending'],
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
    if (cfg.variant !== undefined && cfg.variant !== null) {
      throw new ConfigError('not-available', 'variant', 'per-student variants are not available in M1');
    }
    const medium = Object.assign({ glucose_mM: C.MEDIUM_PRESETS.glucose.high, lactose_mM: 0, aminoAcids_mM: 0, oxygen: false }, plainCopy(cfg.medium) || {});
    if (medium.oxygen) throw new ConfigError('not-available', 'medium.oxygen', 'oxygen is not available in M1');
    for (const key of ['glucose_mM', 'lactose_mM', 'aminoAcids_mM']) {
      if (!isNum(medium[key]) || medium[key] < 0) throw new ConfigError('bad-value', 'medium.' + key, key + ' must be ≥ 0');
    }
    const drugs = Object.assign({ rifampicin: 0, chloramphenicol: 0 }, plainCopy(cfg.drugs) || {});
    for (const key of ['rifampicin', 'chloramphenicol']) {
      if (!isNum(drugs[key]) || drugs[key] < 0 || drugs[key] > 1) throw new ConfigError('bad-value', 'drugs.' + key, 'dose must be in [0, 1]');
    }
    const flags = Object.assign({ controls: 'free', backupGlucoseUptake: false, primingSeed: P.byId.s0.value }, plainCopy(cfg.flags) || {});
    if (flags.controls !== 'free' && flags.controls !== 'locked') throw new ConfigError('bad-value', 'flags.controls', 'controls must be free or locked');
    if (!isNum(flags.primingSeed) || flags.primingSeed < 0) throw new ConfigError('bad-value', 'flags.primingSeed', 'primingSeed must be ≥ 0');
    const params = plainCopy(cfg.params) || {};
    for (const id of Object.keys(params)) {
      if (!P.byId[id]) throw new ConfigError('unknown-param', 'params.' + id, 'unknown parameter ' + id);
      if (!isNum(params[id])) throw new ConfigError('bad-value', 'params.' + id, 'parameter values must be finite numbers');
    }
    let start = cfg.start === undefined ? 'steady' : cfg.start;
    if (isSnapshot(start)) start = plainCopy(start);
    else if (start !== 'steady' && start !== 'cold') throw new ConfigError('bad-value', 'start', "start must be 'steady', 'cold' or a Snapshot");
    const schedule = plainCopy(cfg.schedule) || [];
    if (!Array.isArray(schedule)) throw new ConfigError('bad-value', 'schedule', 'schedule must be an array of {tick, cmd}');
    return {
      engineVersion: ENGINE_VERSION, seed, strain, start, medium, genes: plainCopy(cfg.genes) || {}, drugs, flags, params,
      schedule, variant: null,
    };
  }

  function deriveParams(cfg) {
    const p = P.values(cfg.params);
    if (!(p.dt > 0 && p.dt <= 2)) throw new ConfigError('bad-value', 'params.dt', 'dt must be in (0, 2] s');
    if (!(p.substeps >= 1 && Math.floor(p.substeps) === p.substeps)) throw new ConfigError('bad-value', 'params.substeps', 'substeps must be a positive integer');
    if (!(p.dt / p.substeps <= 0.25)) throw new ConfigError('bad-value', 'params.substeps', 'substep h = dt/substeps must be ≤ 0.25 s (keeps the amino-acid update positive, §7.13)');
    if (!(p.m_V > 0)) throw new ConfigError('bad-value', 'params.m_V', 'upkeep must be > 0 (keeps E below 1, §7.13)');
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
      this.env = { glucose_mM: 0, lactose_mM: 0, aminoAcids_mM: 0, oxygen: false };
      this.rifDose = 0;
      this.cmDose = 0;
      this.s0 = cfg.flags.primingSeed;
      this.backupUptake = !!cfg.flags.backupGlucoseUptake;
      this.controls = cfg.flags.controls;
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
        U: 0, Cgly: 0, SynCap: 0, ImpCap: 0, YCap: 0, ZMax: 0, NA: 0, Cin: 0,
        dD: 0, vInt: 0, lambda: 0, Mend: 0,
      };
      this.lastDivision = divisionRecord(this.genes.length, this.sectors.length);

      // Commands, log, events, checkpoints (not hashed except the pending queue and seqNext).
      this.pending = [];
      this.seqNext = 0;
      this.log = [];
      this.events = [];
      this.eventState = EV.createState(this.genes.length);
      this.checkpoints = [];
      this.recorders = [];
      this._view = null;
      this._writer = new M.ByteWriter(32768);

      if (internal && internal.snapshot) {
        this.fromSnapshot(internal.snapshot);
      } else {
        if (cfg.start === 'steady') {
          const preset = PRESETS[PRESET_ID];
          if (!preset) throw new ConfigError('no-preset', 'start', 'preset ' + PRESET_ID + ' is missing: run tools/make-presets.js');
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
        g.mature.shiftTicks(offset);
        g.nascent.shiftTicks(offset);
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
    }

    applyConfig() {
      const cfg = this.config;
      Object.assign(this.env, { glucose_mM: cfg.medium.glucose_mM, lactose_mM: cfg.medium.lactose_mM, aminoAcids_mM: cfg.medium.aminoAcids_mM });
      this.rifDose = cfg.drugs.rifampicin;
      this.cmDose = cfg.drugs.chloramphenicol;
      this.s0 = cfg.flags.primingSeed;
      this.backupUptake = !!cfg.flags.backupGlucoseUptake;
      this.controls = cfg.flags.controls;
      for (const id of Object.keys(cfg.genes)) {
        const g = this.geneById[id], o = cfg.genes[id], path = 'genes.' + id;
        if (!g) throw new ConfigError('unknown-gene', path, 'no gene ' + id);
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
        if (g.knockout) this.clearGeneProducts(g);
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
      this.refreshDerived();
    }

    /**
     * A strain built with a gene knocked out never had it: no mRNA, no transcripts in
     * progress and no ribosomes on its mRNA (protein is set separately, by initial.protein).
     * The setKnockout command, by contrast, only stops transcription.
     */
    clearGeneProducts(g) {
      g.mature.count = 0;
      g.nascent.len = 0;
      g.nascent.head = 0;
      this.Rbusy -= g.cohorts.nSum;
      if (this.Rbusy < 0) this.Rbusy = 0;
      while (g.cohorts.len > 0) g.cohorts.popHead();
    }

    addMRNA(g, birthTick) {
      g.mature.add(this.nextMRNAId, birthTick);
      this.nextMRNAId = (this.nextMRNAId + 1) | 0;
    }

    /** Recomputes everything derived from the controls, drugs and flags. */
    refreshDerived() {
      const p = this.p;
      this.rho = this.rifDose;
      this.theta = p.thetaMax * this.cmDose;
      this.uBasal = this.backupUptake ? p.uBasal_backup : 0;
      for (const g of this.genes) g.refresh(p);
    }

    // --- time ---------------------------------------------------------------
    get t() { return this.tick * this.p.dt; }
    get dt() { return this.p.dt; }

    step() {
      const T = this.tick;
      this.applyPending(T);                 // §7.1
      this.deriveStart();                   // §7.2
      X.initiateTranscription(this);        // §7.3
      X.sectorTranscription(this);          // §7.4
      X.initiateTranslation(this);          // §7.5
      MB.capacities(this);                  // §7.6
      if (this.stub) MB.stubPools(this, this.stub);
      else MB.fastPools(this);              // §7.7
      X.completeChains(this);               // §7.8
      X.playerMRNA(this);                   // §7.9
      X.sectorMRNA(this);                   // §7.10
      X.degradeProteins(this);              // §7.11
      if (!this.stub) GR.grow(this);        // §7.12
      else { this.k.lambda = 0; this.k.Mend = GR.mass(this); }
      EV.detect(this);                      // §11.4, stamped with tick T
      this.tick = T + 1;
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
      const chiE = e0 * e0 / (e0 * e0 + p.K_chiE * p.K_chiE);
      k.chi = chiA * chiE;                   // ppGpp-like signal: high when amino acids and energy are plentiful
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
    emit(type, extra) {
      const ev = { tick: this.tick, tEnd_s: (this.tick + 1) * this.p.dt, type };
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

    // --- the view (spec §11.5) ------------------------------------------------
    /** The read-only view: one object, reused, refreshed when the tick has moved on. */
    observe() {
      if (this._view === null) this._view = OBS.createView(this);
      if (this._view.tick !== this.tick) OBS.refresh(this._view, this);
      return this._view;
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
        g.mature.write(w);
        g.nascent.write(w);
        g.cohorts.write(w);
        w.f64(g.P); w.f64(g.initiations); w.f64(g.mMade); w.f64(g.pMade);
      }
      // sectors
      for (const s of this.sectors) { w.f64(s.m); s.cohorts.write(w); w.f64(s.mass); }
      w.i32(this.nextMRNAId);
      if (!physicsOnly) {
        w.f64(this.env.glucose_mM); w.f64(this.env.lactose_mM); w.f64(this.env.aminoAcids_mM);
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
        g.mature.read(r);
        g.nascent.read(r);
        g.cohorts.read(r);
        g.P = r.f64(); g.initiations = r.f64(); g.mMade = r.f64(); g.pMade = r.f64();
      }
      for (const s of this.sectors) { s.m = r.f64(); s.cohorts.read(r); s.mass = r.f64(); }
      this.nextMRNAId = r.i32();
      this.env.glucose_mM = r.f64(); this.env.lactose_mM = r.f64(); this.env.aminoAcids_mM = r.f64();
      this.rifDose = r.f64(); this.cmDose = r.f64();
      this.s0 = r.f64(); this.backupUptake = r.f64() === 1; this.controls = r.f64() === 1 ? 'locked' : 'free';
      for (const g of this.genes) {
        for (let i = 0; i < 4; i++) g.txStream[i] = r.i32();
        for (let i = 0; i < 4; i++) g.decayStream[i] = r.i32();
      }
      for (let i = 0; i < 4; i++) this.divisionStream[i] = r.i32();
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
      for (const g of this.genes) { w.f64(g.txStarted); w.f64(g.mCompleted); w.f64(g.mDecayed); w.f64(g.pCompleted); w.f64(g.newestInitTick); }
      for (const s of this.sectors) { w.f64(s.sigma0); w.f64(s.sigInt); w.f64(s.made); }
    }

    readScratch(r) {
      const k = this.k, f = this.flux, led = this.ledger;
      for (let i = 0; i < K_SCRATCH.length; i++) k[K_SCRATCH[i]] = r.f64();
      for (let i = 0; i < FLUX_SCRATCH.length; i++) f[FLUX_SCRATCH[i]] = r.f64();
      for (let i = 0; i < 6; i++) { led.tick[i] = r.f64(); led.perS[i] = r.f64(); led.fractions[i] = r.f64(); }
      for (let i = 0; i < LEDGER_SCRATCH.length; i++) led[LEDGER_SCRATCH[i]] = r.f64();
      for (const g of this.genes) { g.txStarted = r.f64(); g.mCompleted = r.f64(); g.mDecayed = r.f64(); g.pCompleted = r.f64(); g.newestInitTick = r.f64(); }
      for (const s of this.sectors) { s.sigma0 = r.f64(); s.sigInt = r.f64(); s.made = r.f64(); }
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
        watchers: [], marks: [],                 // reserved (deferred, spec §20)
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
  Cell.CHECKPOINT_EVERY = CHECKPOINT_EVERY;

  return { Cell, ConfigError, ENGINE_VERSION, STATE_SCHEMA, STATE_LAYOUT, CHECKPOINT_EVERY };
});
