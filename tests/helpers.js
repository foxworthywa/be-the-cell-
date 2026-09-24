// Shared helpers for the engine tests (not a test file itself).
'use strict';
const path = require('path');

const ENGINE = path.join(__dirname, '..', 'src', 'engine');
const req = (name) => require(path.join(ENGINE, name + '.js'));

// The same object shape the browser gets as the global BTC.
const cellApi = req('btc-cell');
const BTC = {
  math: req('btc-math'), prng: req('btc-prng'), params: req('btc-params'), catalog: req('btc-catalog'),
  presets: req('btc-presets'), genome: req('btc-genome'), queue: req('btc-queue'), expression: req('btc-expression'),
  metabolism: req('btc-metabolism'), growth: req('btc-growth'), commands: req('btc-commands'), events: req('btc-events'),
  observe: req('btc-observe'), replay: req('btc-replay'),
  Cell: cellApi.Cell, ConfigError: cellApi.ConfigError, ENGINE_VERSION: cellApi.ENGINE_VERSION,
  dots: require(path.join(__dirname, '..', 'src', 'shared', 'btc-dots.js')),
  Recorder: require(path.join(__dirname, '..', 'src', 'shared', 'btc-recorder.js')),
  narrate: require(path.join(__dirname, '..', 'src', 'shared', 'btc-narrate.js')),
};
const { Cell } = BTC;
const PV = BTC.params.values();

// Fixed seed sets (engine spec §14).
const SEEDS = {
  A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  B: [1, 2, 3, 4, 5, 6, 7, 8],
  C: [1, 2, 3, 4],
};
const HOUR = 3600;
const SETTLE = 8 * HOUR;     // steady-state claims: 8 h settle …
const WINDOW = 12 * HOUR;    // … then a 12 h average
const LAMBDA_REF = PV.lambda_ref;

function mergeConfig(base, extra) {
  const out = Object.assign({}, base);
  for (const key of Object.keys(extra || {})) {
    const v = extra[key];
    out[key] = v && typeof v === 'object' && !Array.isArray(v) ? Object.assign({}, base[key] || {}, v) : v;
  }
  return out;
}

/** A steady-state cell (preset, reseeded), run for one more hour (spec §14 helper). */
function warm(seed, cfg) {
  const cell = new Cell(mergeConfig({ seed, start: 'steady' }, cfg));
  cell.advance(HOUR);
  return cell;
}

/** A twin with common random numbers (spec §14 helper). */
function twin(cell) {
  return cell.fork();
}

/**
 * Runs `ticks` steps and returns the mean of fn(cell) taken after each step.
 * fn may be a function (→ number) or an object of functions (→ object of means).
 */
function avg(cell, ticks, fn) {
  if (typeof fn === 'function') {
    let s = 0;
    for (let i = 0; i < ticks; i++) { cell.step(); s += fn(cell); }
    return s / ticks;
  }
  const keys = Object.keys(fn), sums = new Float64Array(keys.length);
  for (let i = 0; i < ticks; i++) {
    cell.step();
    for (let j = 0; j < keys.length; j++) sums[j] += fn[keys[j]](cell);
  }
  const out = {};
  keys.forEach((key, j) => { out[key] = sums[j] / ticks; });
  return out;
}

/** Runs n steps, calling fn(cell, i) after each (i = 1…n); stops early if fn returns true. Returns steps run. */
function run(cell, n, fn) {
  for (let i = 1; i <= n; i++) {
    cell.step();
    if (fn && fn(cell, i) === true) return i;
  }
  return n;
}

// Readouts used across tests (straight from the cell's state; the UI reads cell.observe()).
const lam = (c) => c.k.lambda;
const V = (c) => c.volume;
const playerMRNA = (c) => c.genes.reduce((s, g) => s + g.mature.count, 0);
const totalMRNA = (c) => playerMRNA(c) + c.sectors.reduce((s, u) => s + u.m, 0);
const proteomeFraction = (c, id) => { const g = c.gene(id); return g.P * g.L / c.mass; };
const phiR = (c) => c.sectors[0].mass / c.mass;
const ribosomes = (c) => c.sectors[0].mass / PV.aaPerRibosome;
const spend = (c) => c.ledger.spent_perS;
const J = (c) => c.flux.aaPolymerised;
const perHour = (lambda) => lambda * 3600;
const Td_min = (lambda) => Math.LN2 / lambda / 60;

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => {
  const b = a.slice().sort((x, y) => x - y);
  const m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};
const fmt = (x, d) => (typeof x === 'number' ? (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(d === undefined ? 3 : d) : x.toFixed(d === undefined ? 3 : d)) : String(x));

/** Steady-state mean growth rate: settle, then average λ (memoised per seed and config). */
const lambdaCache = new Map();
function steadyLambda(seed, cfg, settle, window) {
  const key = JSON.stringify([seed, cfg || null, settle || SETTLE, window || WINDOW]);
  if (!lambdaCache.has(key)) {
    const c = warm(seed, cfg);
    c.advance(settle || SETTLE);
    lambdaCache.set(key, avg(c, window || WINDOW, lam));
  }
  return lambdaCache.get(key);
}

/**
 * A random command covering every M1 command type (tests e2 and m2). Uses a
 * seeded stream, so a failing sequence can be replayed from its seed.
 */
const GENE_IDS = ['ptsG', 'gly', 'aaSyn', 'aaImp', 'lacY', 'lacZ', 'fliC'];
function randomCommand(s) {
  const R = BTC.prng;
  const pick = (arr) => arr[Math.floor(R.uniform(s) * arr.length)];
  const gene = pick(GENE_IDS);
  switch (Math.floor(R.uniform(s) * 9)) {
    case 0: case 1: return { type: 'setPromoter', gene, level: pick(['off', 0.25, 0.5, 1, 2, 4]) };
    case 2: return { type: 'setPromoter', gene, rate_perS: 0.3 * R.uniform(s) };
    case 3: return { type: 'setKnockout', gene, knockout: R.uniform(s) < 0.5 };
    case 4: return { type: 'setRBS', gene, rbs: pick([0.5, 1, 2, 4, 16]) };
    case 5: return { type: 'setMedium', glucose_mM: pick([0, 0.005, 10]), lactose_mM: pick([0, 5]), aminoAcids_mM: pick([0, 2]) };
    case 6: return { type: 'setDrug', drug: pick(['rifampicin', 'chloramphenicol']), dose: pick([0, 0.3, 1]) };
    case 7: return { type: 'setMRNAHalfLife', gene, s: pick([30, 90, 180, 600, 1800]) };
    default: return { type: 'setDegradation', gene, perS: pick([0, 1e-4, 1e-3, 0.01]) };
  }
}

module.exports = {
  randomCommand, GENE_IDS,
  BTC, Cell, PV, SEEDS, HOUR, SETTLE, WINDOW, LAMBDA_REF,
  warm, twin, avg, run, mergeConfig, steadyLambda,
  lam, V, playerMRNA, totalMRNA, proteomeFraction, phiR, ribosomes, spend, J, perHour, Td_min,
  mean, median, fmt,
};
