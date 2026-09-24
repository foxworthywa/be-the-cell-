// Calibrates the level constants on the current engine and writes
// src/levels/btc-level-constants.js (LEVELS.md §3.7, §7.2.13, §7.4.14).
//
//   node tools/level-calibrate.js                 measure, check, write the constants file
//   node tools/level-calibrate.js --check         measure and check only (writes nothing)
//   node tools/level-calibrate.js --seeds 12      fewer engine seeds per variant (default 40; a quick look)
//   node tools/level-calibrate.js --only l14      one level section (the other keeps its current values)
//   node tools/level-calibrate.js --force         write even when a check fails
//
// It measures every number a level file reads, then plays every solution of every level on
// every variant with `--seeds` engine seeds each (the seeds come from variant seeds, exactly as
// in the app) through the real level runner, and prints the pass rates. It exits non-zero when
// a reference meets its goal within par on fewer than 95% of runs, a misconception solution
// passes par on more than 5%, or a level check below fails.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const { ENGINE_VERSION, Cell } = require('../src/engine/btc-cell.js');
const PARAMS = require('../src/engine/btc-params.js');
const K = require('../src/game/btc-level-kit.js');
const MC = require('../src/game/btc-misconceptions.js');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const OUT = path.join(ROOT, 'src', 'levels', 'btc-level-constants.js');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const SEEDS = Number(arg('seeds', 40));
const ONLY = arg('only', null);
const CHECK_ONLY = args.indexOf('--check') >= 0;
const PV = PARAMS.values();
const LN2 = Math.LN2;

// Values the level files can load with before the first calibration (the M1 numbers of LEVELS.md).
const PROVISIONAL = {
  l12: { ppm: 21, initSec: 13, lifeMin: 4.33, D: { 400: 14, 500: 14, 600: 14 },
    demoMean: { 4: new Array(21).fill(0), 5: new Array(21).fill(0), 6: new Array(21).fill(0) } },
  l14: { band: [0.70, 1.35], lifeMin: { 3: 4, 4: 5.5, 5: 7 },
    S: { 3: { 0.25: 70, 0.5: 140, 1: 280, 2: 590, 4: 1100 }, 4: { 0.25: 90, 0.5: 190, 1: 380, 2: 775, 4: 1440 }, 5: { 0.25: 110, 0.5: 230, 1: 460, 2: 940, 4: 1760 } } },
};

const problems = [];
const fail = (msg) => { problems.push(msg); console.log('  PROBLEM: ' + msg); };
const pct = (x) => (100 * x).toFixed(1) + '%';
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const quantile = (a, q) => { const b = a.slice().sort((x, y) => x - y); const i = (b.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return b[lo] + (b[hi] - b[lo]) * (i - lo); };
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/** Loads a level file with the given constants (a bare context, as in the browser); returns the validated definition. */
function loadLevel(file, constants) {
  const ctx = vm.createContext({});
  vm.runInContext('var self = this;', ctx);
  ctx.self.BTC = { levelKit: K, misconceptions: MC, levelConstants: JSON.parse(JSON.stringify(constants)) };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'levels', file), 'utf8'), ctx, { filename: file });
  const defs = ctx.self.BTC.levelDefs;
  return LV.validate(defs[Object.keys(defs)[0]]);
}

/** Variant seeds grouped by variant (key(v)), n per group, found by scanning attempt indices as the app draws them. */
function variantSeeds(def, key, n) {
  const groups = {};
  for (let i = 0; i < 100000; i++) {
    const vs = K.variantSeed(0x5eed + i, def.id, 0);
    const k = key(def.variant(vs));
    const g = groups[k] || (groups[k] = []);
    if (g.length < n) g.push(vs);
    if (i > 50 && Object.keys(groups).every((x) => groups[x].length >= n)) break;
  }
  return groups;
}

/** Plays every solution on every seed; returns {name: {n, expectMet, goalPar, goal, runs: [...]}}. */
function playAll(def, groups, onRun) {
  const out = {};
  for (const name of Object.keys(def.solutions)) {
    const sol = def.solutions[name];
    const agg = { n: 0, expectMet: 0, goalPar: 0, goal: 0, byVariant: {} };
    for (const key of Object.keys(groups)) {
      const bv = agg.byVariant[key] = { n: 0, expectMet: 0, goalPar: 0, goal: 0 };
      for (const vs of groups[key]) {
        const played = RUN.game.playHeadless(def, { variantSeed: vs, solution: name, today: () => '2026-01-01' });
        const res = played.result;
        const met = RUN.game.checkExpect(sol.expect, res).length === 0;
        const gp = res.G === 1 && res.E >= 0.8;
        for (const a of [agg, bv]) { a.n++; if (met) a.expectMet++; if (gp) a.goalPar++; if (res.G === 1) a.goal++; }
        if (onRun) onRun(name, key, played);
      }
    }
    out[name] = agg;
  }
  return out;
}

/** Prints the pass rates and applies the §3.7 rules: reference goal+par ≥ 95%; misconceptions pass par ≤ 5%. */
function judge(def, rates) {
  for (const name of Object.keys(rates)) {
    const a = rates[name], e = def.solutions[name].expect;
    const per = Object.keys(a.byVariant).map((k) => k + ' ' + a.byVariant[k].expectMet + '/' + a.byVariant[k].n).join(', ');
    console.log(`  ${name.padEnd(14)} meets its expect ${pct(a.expectMet / a.n)}; goal ${pct(a.goal / a.n)}; goal within par ${pct(a.goalPar / a.n)}  [${per}]`);
    if (name === 'reference' && a.goalPar / a.n < 0.95) fail(def.id + ' reference meets goal and par on only ' + pct(a.goalPar / a.n));
    // A solution may name its own rate (1.2's weak promoter: fails the goal on ≥ 80%); the others are held to §3.7.
    const misconception = (e.par === false || e.goal === false) && typeof e.rate !== 'number';
    if (misconception && a.goalPar / a.n > 0.05) fail(def.id + ' ' + name + ' passes par on ' + pct(a.goalPar / a.n));
    const need = typeof e.rate === 'number' ? e.rate : 0.9;
    if (a.expectMet / a.n < need) fail(def.id + ' ' + name + ' meets its expect on only ' + pct(a.expectMet / a.n) + ' (needs ' + pct(need) + ')');
  }
  const summary = {};
  for (const name of Object.keys(rates)) summary[name] = { expect: r2(rates[name].expectMet / rates[name].n), goalPar: r2(rates[name].goalPar / rates[name].n), n: rates[name].n };
  return summary;
}

// ---------------------------------------------------------------------------
// l12: one gene, many copies
// ---------------------------------------------------------------------------
function calibrate12(base) {
  console.log('\nl12 (level 1.2)');
  let def = loadLevel('btc-level-1-2.js', base);
  const byTOff = variantSeeds(def, (v) => v.tOff, SEEDS);
  const demoMean = {}, demoP5 = {}, demoP95 = {}, ppms = [], ppm20 = [], inits = [];
  for (const tOff of [4, 5, 6]) {
    const curves = [];
    for (const vs of byTOff[tOff]) {
      const v = def.variant(vs);
      const c = new Cell(def.config(v, 'demo'));
      const curve = [c.observe().geneById.lacY.protein];
      c.step();
      const view = c.observe();
      inits.push(1 / (view.ribosomes.kInitPerMRNA * view.geneById.lacY.rbs));
      for (let t = 1; t <= 30 * 60; t++) {
        if (t > 1) c.step();
        if (t % 60 === 0 && t <= 20 * 60) curve.push(c.observe().geneById.lacY.protein);
        if (t === 20 * 60) { const g = c.observe().geneById.lacY; ppm20.push(g.proteinMade / g.mRNAMade); }
      }
      const g = c.observe().geneById.lacY;
      ppms.push(g.proteinMade / g.mRNAMade);
      curves.push(curve);
    }
    demoMean[tOff] = curves[0].map((x, t) => r1(mean(curves.map((c) => c[t]))));
    demoP5[tOff] = curves[0].map((x, t) => Math.round(quantile(curves.map((c) => c[t]), 0.05)));
    demoP95[tOff] = curves[0].map((x, t) => Math.round(quantile(curves.map((c) => c[t]), 0.95)));
    const f = K.sketch.features(K.sketch.resample(demoMean[tOff].map((y, t) => [t, y])), { tOff });
    console.log(`  demo tOff ${tOff}: mean LacY at tOff ${Math.round(demoMean[tOff][tOff])}, at 20 min ${Math.round(demoMean[tOff][20])} (5–95%: ${demoP5[tOff][20]}–${demoP95[tOff][20]}); ` +
      `after the switch-off ${pct((demoMean[tOff][20] - demoMean[tOff][tOff]) / (demoMean[tOff][20] - demoMean[tOff][0]))} of the rise; last 5 min ${pct((demoMean[tOff][20] - demoMean[tOff][15]) / (demoMean[tOff][20] - demoMean[tOff][0]))}`);
    if (!(f.F1 && f.F2 && f.F3 && f.F4)) fail('l12 demo mean for tOff ' + tOff + ' fails ' + ['F1', 'F2', 'F3', 'F4'].filter((k) => !f[k]).join(', '));
  }
  const l12 = {
    ppm: r2(mean(ppms)), ppmDemo20: r2(mean(ppm20)), initSec: r2(mean(inits)), lifeMin: r2(PV.mRNAHalfLife / LN2 / 60),
    D: { 400: 14, 500: 14, 600: 14 }, demoMean, demoP5, demoP95,
  };
  console.log(`  copies per mRNA ${l12.ppm} at 30 min (${r1(quantile(ppms, 0.05))}–${r1(quantile(ppms, 0.95))}), ${l12.ppmDemo20} at 20 min; ` +
    `a ribosome starts every ${l12.initSec} s per mRNA; mean mRNA life ${l12.lifeMin} min`);
  // Reference reach times per T: D grows by a minute for a T reached by D − 1 on fewer than 95% of seeds.
  def = loadLevel('btc-level-1-2.js', Object.assign({}, base, { l12 }));
  const byT = variantSeeds(def, (v) => v.T, SEEDS);
  l12.reach = {};
  for (const T of [400, 500, 600]) {
    for (;;) {
      const times = byT[T].map((vs) => {
        const p = RUN.game.playHeadless(def, { variantSeed: vs, solution: 'reference', today: () => '2026-01-01' });
        return p.runner.monitorResult.reachedTick;
      });
      const D = l12.D[T];
      const reached = times.filter((t) => t >= 0);
      // Runs that never reach T (the switch-off came too early for that seed's mRNA) are not helped by a later
      // deadline; they count against the reference's pass rate below. Lateness is judged on the runs that reach T.
      const ok = reached.filter((t) => t <= (D - 1) * 60).length / Math.max(1, reached.length);
      l12.reach[T] = { p50: r1(quantile(reached, 0.5) / 60), p95: r1(quantile(reached, 0.95) / 60), max: r1(Math.max(...reached) / 60),
        byDminus1: r2(ok), reached: r2(reached.length / times.length) };
      console.log(`  reference T ${T}: reached on ${pct(reached.length / times.length)} of seeds, by ${l12.reach[T].p50} min (median), ${l12.reach[T].max} min at the latest; ` +
        `by D − 1 = ${D - 1} min on ${pct(ok)} of those`);
      if (ok >= 0.95 || D >= 20) break;
      l12.D[T] = D + 1;
      console.log(`  D for T ${T} grows to ${D + 1} min`);
      def = loadLevel('btc-level-1-2.js', Object.assign({}, base, { l12 }));
    }
  }
  l12.mPar = { 400: Math.round((1.7 * 400) / l12.ppm), 500: Math.round((1.7 * 500) / l12.ppm), 600: Math.round((1.7 * 600) / l12.ppm) };
  // Every solution on all 9 variants.
  def = loadLevel('btc-level-1-2.js', Object.assign({}, base, { l12 }));
  const groups = variantSeeds(def, (v) => 'T' + v.T + '/tOff' + v.tOff, SEEDS);
  const ms = {};
  const rates = playAll(def, groups, (name, key, p) => {
    const m = p.runner.monitorResult;
    (ms[name] || (ms[name] = {}));
    const T = key.split('/')[0];
    (ms[name][T] || (ms[name][T] = [])).push(m.m);
  });
  for (const name of ['reference', 'stopAtTarget']) {
    console.log(`  ${name} mRNAs: ` + Object.keys(ms[name]).map((T) => `${T} ${Math.min(...ms[name][T])}–${Math.max(...ms[name][T])} (mPar ${l12.mPar[T.slice(1)]})`).join('; '));
  }
  l12.mRNAs = {};
  for (const name of ['reference', 'stopAtTarget']) {
    l12.mRNAs[name] = {};
    for (const T of Object.keys(ms[name])) l12.mRNAs[name][T.slice(1)] = [Math.min(...ms[name][T]), Math.max(...ms[name][T])];
  }
  l12.passRates = judge(def, rates);
  return l12;
}

// ---------------------------------------------------------------------------
// l14: nothing lasts
// ---------------------------------------------------------------------------
function calibrate14(base) {
  console.log('\nl14 (level 1.4)');
  let def = loadLevel('btc-level-1-4.js', base);
  const byHl = variantSeeds(def, (v) => v.halfLife_min, SEEDS);
  const LEVELS = [0.25, 0.5, 1, 2, 4];
  const S = {}, cv = {}, perSeed = {};
  for (const hl of [3, 4, 5]) {
    S[hl] = {}; cv[hl] = {}; perSeed[hl] = {};
    for (const level of LEVELS) {
      const means = [], cvs = [];
      for (const vs of byHl[hl]) {
        const c = new Cell(def.config(def.variant(vs), 'task'));
        c.command({ type: 'setPromoter', gene: 'lacY', level });
        c.advance(20 * 60);
        let s = 0, q = 0;
        for (let t = 0; t < 20 * 60; t++) { c.step(); const p = c.observe().geneById.lacY.protein; s += p; q += p * p; }
        const m = s / 1200;
        means.push(m); cvs.push(Math.sqrt(Math.max(0, q / 1200 - m * m)) / m);
      }
      S[hl][level] = r1(mean(means));
      cv[hl][level] = [r2(Math.min(...cvs)), r2(Math.max(...cvs))];
      perSeed[hl][level] = means;
    }
    console.log(`  half-life ${hl} min: ` + LEVELS.map((l) => `×${l} ${Math.round(S[hl][l])} (seeds ${Math.round(Math.min(...perSeed[hl][l]))}–${Math.round(Math.max(...perSeed[hl][l]))}, cv ${cv[hl][l].join('–')})`).join('; '));
  }
  const lambda = PV.lambda_ref;
  const lifeMin = {};
  for (const hl of [3, 4, 5]) lifeMin[hl] = K.round(1 / (LN2 / (hl * 60) + lambda) / 60, 0.5);
  const tryBand = (band) => {
    const l14 = { S, cv, band, lifeMin };
    const d = loadLevel('btc-level-1-4.js', Object.assign({}, base, { l14 }));
    // Neighbouring settings sit outside the band: their 20–40-min mean, per seed.
    let out = 0, n = 0;
    for (const hl of [3, 4, 5]) {
      for (const tl of [1, 2]) {
        const s = S[hl][tl], lo = K.round(band[0] * s, 10), hi = K.round(band[1] * s, 10);
        const nb = tl === 1 ? [0.5, 2] : [1, 4];
        for (const l of nb) for (const m of perSeed[hl][l]) { n++; if (m < lo || m > hi) out++; }
      }
    }
    console.log(`  band [${band.join(', ')}]·S: the neighbouring settings' 20–40-min mean is outside the band on ${pct(out / n)} of runs`);
    const groups = variantSeeds(d, (v) => 'hl' + v.halfLife_min + '/x' + v.targetLevel, SEEDS);
    const goalAt = {};
    const rates = playAll(d, groups, (name, key, p) => {
      if (name !== 'reference' && name !== 'single') return;
      const t = p.runner.monitorResult.doneTick;
      if (t >= 0) (goalAt[name] || (goalAt[name] = [])).push(t / 60);
    });
    for (const name of Object.keys(goalAt)) console.log(`  ${name}: goal met at ${r1(quantile(goalAt[name], 0.05))}–${r1(quantile(goalAt[name], 0.95))} min (5–95%)`);
    return { l14, d, rates, neighboursOutside: out / n, goalAt };
  };
  let t = tryBand([0.70, 1.35]);
  const bad = (x) => x.rates.reference.goalPar / x.rates.reference.n < 0.95 || x.rates.max.goal / x.rates.max.n > 0.05 || x.neighboursOutside < 0.95;
  if (bad(t)) {
    console.log('  the band [0.70, 1.35] fails a check: widening to [0.65, 1.40] (LEVELS §7.4.14)');
    t = tryBand([0.65, 1.40]);
  }
  if (t.neighboursOutside < 0.95) fail('l14 neighbouring settings sit outside the band on only ' + pct(t.neighboursOutside));
  if (t.rates.max.goal / t.rates.max.n > 0.05) fail('l14 max meets the goal on ' + pct(t.rates.max.goal / t.rates.max.n));
  const l14 = t.l14;
  l14.holdMin = t.d.holdMin; l14.limitMin = t.d.limitMin;
  l14.neighboursOutside = r2(t.neighboursOutside);
  l14.goalAt = {};
  for (const name of Object.keys(t.goalAt)) l14.goalAt[name] = [r1(quantile(t.goalAt[name], 0.05)), r1(quantile(t.goalAt[name], 0.95))];
  l14.passRates = judge(t.d, t.rates);
  return l14;
}

// ---------------------------------------------------------------------------
function currentConstants() {
  try {
    delete require.cache[require.resolve(OUT)];
    const c = require(OUT);
    return c.engineVersion === ENGINE_VERSION ? c : null;
  } catch (e) { return null; }
}

function write(c) {
  const body = JSON.stringify(c, null, 2).replace(/\[\n\s+([^\[\]{}]*?)\n\s+\]/g, (m, inner) => '[' + inner.replace(/\s*\n\s*/g, ' ') + ']');
  const src = `// @deps
/*
 * Be the Cell: calibrated level constants (LEVELS §3.7).
 *
 * GENERATED by tools/level-calibrate.js on engine ${c.engineVersion}; do not edit by hand.
 * Re-run the tool after any engine change (test L-11 fails when engineVersion
 * differs from BTC.ENGINE_VERSION). passRates record, per solution, the share of
 * runs that met the solution's expect and the share that met the goal within par
 * (${c.seeds} engine seeds per variant).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.levelConstants = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function deepFreeze(x) {
    if (x && typeof x === 'object') { Object.freeze(x); for (const k of Object.keys(x)) deepFreeze(x[k]); }
    return x;
  }
  return deepFreeze(${body.split('\n').join('\n  ')});
});
`;
  fs.writeFileSync(OUT, src);
}

function main() {
  const t0 = Date.now();
  const cur = currentConstants() || {};
  const base = { l12: cur.l12 || PROVISIONAL.l12, l14: cur.l14 || PROVISIONAL.l14 };
  console.log(`Calibrating on engine ${ENGINE_VERSION} with ${SEEDS} engine seeds per variant` + (ONLY ? ' (only ' + ONLY + ')' : ''));
  const out = { engineVersion: ENGINE_VERSION, generated: new Date().toISOString().slice(0, 10), seeds: SEEDS };
  out.l12 = !ONLY || ONLY === 'l12' ? calibrate12(base) : base.l12;
  out.l14 = !ONLY || ONLY === 'l14' ? calibrate14(Object.assign({}, base, { l12: out.l12 })) : base.l14;
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s; ${problems.length ? problems.length + ' problem(s)' : 'all checks pass'}`);
  if (!CHECK_ONLY && (!problems.length || args.indexOf('--force') >= 0)) {
    write(out);
    console.log('wrote ' + path.relative(ROOT, OUT));
  } else if (!CHECK_ONLY) console.log('not written (fix the problems above, or pass --force to write anyway)');
  if (problems.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { loadLevel, variantSeeds, PROVISIONAL };
