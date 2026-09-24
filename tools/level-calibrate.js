// Calibrates the level constants on the current engine and writes
// src/levels/btc-level-constants.js (LEVELS.md §3.7, §7.1.14, §7.2.13, §7.4.14, §7.7.14).
//
//   node tools/level-calibrate.js                 measure, check, write the constants file
//   node tools/level-calibrate.js --check         measure and check only (writes nothing)
//   node tools/level-calibrate.js --seeds 12      fewer engine seeds per variant (default 40; a quick look)
//   node tools/level-calibrate.js --only l14      one level section (the others keep their current values)
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
  l11: { lambdaRef: PV.lambda_ref, keepMin: 10 },
  l17: { lambdaLacRef: 9.42e-5, LMIN: 240, rBLMax: 0.5 },
  l12: { v: 2, T: [5400, 6000, 6600], D: { 5400: 34, 6000: 35, 6600: 37 }, tMax: { 5400: 6000, 6000: 6600, 6600: 7300 }, ppm: 21, lacZReady: 7000,
    Tenough: 5400, refMargin: 1.04, parX: 0.14, parFree: 0.08 },
  economy: { atpPerGlucose: 2, atpPerAa: 4, atpPerNt: 2, transporterAa: 450, transporterAtp: 1800, transporterGlucose: 900, lacYaa: 417, lacYnt: 1311, lactose_mM: 5 },
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
  ctx.self.BTC = { levelKit: K, misconceptions: MC, levelConstants: JSON.parse(JSON.stringify(constants)), MRNAWatch: require('../src/shared/btc-mrnawatch.js'),
    seq: require('../src/shared/btc-seq.js'), seqdata: require('../src/shared/btc-seqdata.js') };
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

/** Plays every solution on every seed; returns {name: {n, expectMet, goalPar, goal, runs: [...]}}. opts: {parCache}. */
function playAll(def, groups, onRun, opts) {
  const out = {};
  for (const name of Object.keys(def.solutions)) {
    const sol = def.solutions[name];
    const agg = { n: 0, expectMet: 0, goalPar: 0, goal: 0, byVariant: {} };
    for (const key of Object.keys(groups)) {
      const bv = agg.byVariant[key] = { n: 0, expectMet: 0, goalPar: 0, goal: 0 };
      for (const vs of groups[key]) {
        const played = RUN.game.playHeadless(def, { variantSeed: vs, solution: name, today: () => '2026-01-01', parCache: opts && opts.parCache });
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
// economy: the numbers the opening's economy scenes say (PROLOGUE §2.4.2), from the engine's parameters
// ---------------------------------------------------------------------------
function calibrateEconomy() {
  console.log('\neconomy (Prologue 2, level 1.2)');
  const CAT = require('../src/engine/btc-catalog.js');
  const len = (id) => CAT.STRAINS['m1-lab'].genes.find((g) => g.id === id).length;
  // "One transporter, about 450 amino acids long": the lab's two transporters, PtsG and LacY, rounded to 50.
  const trAa = Math.round((len('ptsG') + len('lacY')) / 2 / 50) * 50;
  const eco = {
    atpPerGlucose: PV.fermYield, atpPerAa: PV.c_tl, atpPerNt: PV.atpPerNT, transporterAa: trAa, transporterAtp: trAa * PV.c_tl,
    transporterGlucose: (trAa * PV.c_tl) / PV.fermYield, lacYaa: len('lacY'), lacYnt: 3 * len('lacY') + 60, lactose_mM: PV.lactosePresent,
  };
  console.log(`  ${eco.atpPerGlucose} ATP per glucose; ${eco.atpPerAa} ATP per amino acid; a transporter of about ${trAa} amino acids costs about ${eco.transporterAtp} ATP, the energy from ${eco.transporterGlucose} glucose`);
  return eco;
}

// ---------------------------------------------------------------------------
// l12 (v2): milk is on its way (PROLOGUE §6.2.3)
// ---------------------------------------------------------------------------
function calibrate12(base) {
  console.log('\nl12 (level 1.2)');
  const round100 = (x) => Math.round(x / 100) * 100, ceil100 = (x) => Math.ceil(x / 100) * 100;
  const LREF = PV.lambda_ref;
  const n = Math.max(8, SEEDS);
  // (a) The lactose splitter "already made": the lab strain's LacZ at ×1, as a newborn cell has it at steady state.
  const births = [];
  for (let seed = 1; seed <= Math.min(n, 16); seed++) {
    const c = new Cell({ seed: 7000 + seed, strain: 'm1-lab', start: 'steady', medium: { glucose_mM: 10 }, genes: { lacZ: { level: 1 } } });
    c.advance(3 * 3600);
    c.takeEvents();
    for (let t = 0; t < 3 * 3600; t++) {
      c.step();
      if (c.takeEvents().some((e) => e.type === 'division')) births.push(c.observe().geneById.lacZ.protein);
    }
  }
  const lacZReady = round100(mean(births));
  console.log(`  LacZ at ×1 in a newborn cell (steady state): ${lacZReady} chains (${births.length} births, ${Math.round(Math.min(...births))}–${Math.round(Math.max(...births))})`);
  // A cell of the level (the Try's config) switched on at ×4 at tick 0 and off by rule(g, tick) → stepped to D + 20.
  const probe = (seed, D, rule) => {
    const cfg = {
      seed, strain: 'm1-lab', start: 'birth', medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
      genes: { lacY: { level: 'off', initial: { clear: true, protein: 0 } }, lacZ: { level: 1, initial: { protein: lacZReady } } },
      flags: { userGenes: ['lacY'] },
      schedule: [{ tick: D * 60, cmd: { type: 'setMedium', glucose_mM: 0, lactose_mM: PV.lactosePresent } }, { tick: D * 60, cmd: { type: 'setControls', controls: 'locked' } }],
    };
    const c = new Cell(cfg);
    c.command({ type: 'setPromoter', gene: 'lacY', level: 4 });
    let on = true, Y = 0, lam = 0, k = 0;
    const T = rule.T, out = { reach: -1, onReach: -1 };
    const END = (D + 20) * 60;
    for (let t = 1; t <= END; t++) {
      c.step();
      const g = c.observe().geneById.lacY;
      if (out.reach < 0 && T && g.protein >= T && t <= D * 60) out.reach = t / 60;
      if (on && t % 5 === 0 && t < D * 60 && rule.off(g, t)) { c.command({ type: 'setPromoter', gene: 'lacY', level: 'off' }); on = false; }
      if (t === D * 60) Y = g.protein;
      if (t > END - 300) { lam += c.observe().cell.lambda_perS; k++; }
    }
    const g = c.observe().geneById.lacY;
    return Object.assign(out, { Y, lam: lam / k / LREF, made: g.proteinMade, M: g.mRNAMade, ppm: g.proteinMade / Math.max(1, g.mRNAMade) });
  };
  // (b) Growth on milk sugar against the transporters in place when it arrives: ×4 switched off at 12 … 34 minutes.
  const pts = [];
  for (let s = 0; s < n; s++) for (let off = 12; off <= 34; off += 2) pts.push(probe(8000 + s, 34, { T: 0, off: (g, t) => t >= off * 60 }));
  let Tenough = 0;
  for (let y = 2000; y <= 12000; y += 100) {
    const above = pts.filter((p) => p.Y >= y);
    if (above.length >= 10 && above.filter((p) => p.lam >= 0.8).length / above.length >= 0.95) { Tenough = y; break; }
  }
  if (!Tenough) fail('l12: no transporter count gives growth on milk sugar ≥ 0.8 of the glucose rate on 95% of runs');
  const ppm = r2(mean(pts.map((p) => p.ppm)));
  const band = (lo, hi) => { const b = pts.filter((p) => p.Y >= lo && p.Y < hi).map((p) => p.lam); return b.length ? r2(mean(b)) : NaN; };
  console.log(`  growth on milk sugar (÷ glucose rate) by transporters in place: 3,000–4,000 ${band(3000, 4000)}; 4,000–5,000 ${band(4000, 5000)}; ` +
    `5,000–6,000 ${band(5000, 6000)}; 6,000–7,000 ${band(6000, 7000)}; 7,000+ ${band(7000, 1e9)}`);
  console.log(`  enough to live on milk sugar (≥ 0.8 of the glucose rate on 95% of runs): ${Tenough} transporters; ${ppm} transporters per copy`);
  // (c) The variants: 0.9·T, T, 1.1·T with the lowest still "enough".
  const Tmid = ceil100(Tenough / 0.9);
  const Ts = [round100(0.9 * Tmid), Tmid, round100(1.1 * Tmid)];
  while (Ts[0] < Tenough) Ts[0] += 100;
  const refMargin = 1.04;
  // (d) Per T: the reference and the misconception "stop at the target", with a late milk (60 min) so the deadline does not bind.
  const refRule = (T) => ({ T, off: (g) => g.protein + ppm * (g.mRNA + g.nascent) >= refMargin * T });
  const stopRule = (T) => ({ T, off: (g) => g.protein >= T });
  const onRule = (T) => ({ T, off: () => false });
  const D = {}, stats = {};
  for (const T of Ts) {
    const ref = [], stop = [], always = [];
    for (let s = 0; s < n; s++) {
      ref.push(probe(9000 + s, 60, refRule(T)));
      stop.push(probe(9000 + s, 60, stopRule(T)));
      always.push(probe(9000 + s, 60, onRule(T)));
    }
    const reachRef = quantile(ref.map((p) => (p.reach < 0 ? 99 : p.reach)), 0.95), reachOn = quantile(always.map((p) => p.reach), 0.95);
    D[T] = Math.max(Math.ceil(reachRef) + 1, Math.ceil(reachOn) + 3);
    const fRef = ref.map((p) => p.made / T), fStop = stop.map((p) => p.made / T);
    stats[T] = { refP90: quantile(fRef, 0.9), refP95: quantile(fRef, 0.95), refMin: Math.min(...fRef), stopP5: quantile(fStop, 0.05), stopP10: quantile(fStop, 0.1),
      reachRef, reachOn, mRef: quantile(ref.map((p) => p.M), 0.5), mStop: quantile(stop.map((p) => p.M), 0.5) };
    console.log(`  T ${T}: reference reaches it by ${r1(reachRef)} min (p95), ×4 kept on by ${r1(reachOn)} min → D ${D[T]}; transporters made ÷ T: reference ` +
      `${r2(stats[T].refMin)}–${r2(stats[T].refP95)} (p95), stopping at the target ${r2(stats[T].stopP5)} (p5)–; copies ${stats[T].mRef} vs ${stats[T].mStop} (median)`);
  }
  // (e) Par: between the reference's p95 and "stop at the target"'s p10 (transporters made beyond T, as a share of T).
  const refHi = Math.max(...Ts.map((T) => stats[T].refP95)), stopLo = Math.min(...Ts.map((T) => stats[T].stopP10));
  const parX = r2((refHi + stopLo) / 2 - 1), parFree = r2(Math.max(0, parX - 0.06));
  if (!(refHi - 1 < parX && parX < stopLo - 1)) fail('l12 par ' + parX + ' does not separate the reference (' + r2(refHi) + ') from stopping at the target (' + r2(stopLo) + ')');
  // (f) The Expert: finish with no more than Tmax (rounded up to 100), set where the reference finishes on 90% of runs.
  const tMaxF = Math.max(1.08, Math.ceil(100 * Math.max(...Ts.map((T) => stats[T].refP95))) / 100);
  if (tMaxF - 1 > parX) fail('l12 the Expert limit ' + tMaxF + ' is looser than par ' + (1 + parX));
  const tMax = {};
  for (const T of Ts) tMax[T] = ceil100(tMaxF * T);
  console.log(`  par: E = 1 up to ${Math.round(100 * parFree)}% extra, 0.8 at ${Math.round(100 * parX)}% extra; Expert: no more than ${tMaxF}·T (${Ts.map((T) => tMax[T]).join(', ')})`);
  const l12 = { v: 2, T: Ts, D, tMax, ppm, lacZReady, Tenough, refMargin, parX, parFree, growthAtT: {} };
  for (const T of Ts) l12.growthAtT[T] = band(T - 250, T + 250);
  // (g) Every solution on the three variants, through the real runner (the watch included).
  const def = loadLevel('btc-level-1-2.js', Object.assign({}, base, { l12 }));
  const groups = variantSeeds(def, (v) => 'T' + v.T, SEEDS);
  const xs = {}, E0 = {}, ppmWatch = [], growth = {};
  const rates = playAll(def, groups, (name, key, p) => {
    const r = p.result, m = p.runner.monitorResult;
    (xs[name] || (xs[name] = [])).push(r.X & 1);
    (E0[name] || (E0[name] = [])).push(r.E === 0 ? 1 : 0);
    (growth[name] || (growth[name] = [])).push(m.growth);
    if (name === 'reference') { const g1 = p.runner.watch && p.runner.watch.gateTick; if (g1) ppmWatch.push(1); }
  });
  for (const name of Object.keys(growth)) console.log(`  ${name.padEnd(13)} growth on milk sugar ${r2(Math.min(...growth[name]))}–${r2(Math.max(...growth[name]))} of the glucose rate; Expert on ${pct(mean(xs[name]))}; E = 0 on ${pct(mean(E0[name]))}`);
  if (mean(xs.reference) < 0.9) fail('l12 the reference meets the Expert limit on only ' + pct(mean(xs.reference)));
  if (mean(E0.keepOn) < 0.9) fail('l12 keepOn has E = 0 on only ' + pct(mean(E0.keepOn)));
  if (ppm < 15 || ppm > 25) fail('l12 transporters per copy ' + ppm + ' is not "about twenty" (15–25)');
  l12.expertRef = r2(mean(xs.reference));
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
// l11: starving next to a feast
// ---------------------------------------------------------------------------
function calibrate11(base) {
  console.log('\nl11 (level 1.1)');
  const l11 = { lambdaRef: PV.lambda_ref, keepMin: base.l11.keepMin };
  let def = loadLevel('btc-level-1-1.js', Object.assign({}, base, { l11 }));
  const CAND = def.candidates;
  // The starving state (R-E7): growth and charge at 10 and 30 min on the backup route, ptsG off and cleared.
  const n = Math.max(8, Math.min(SEEDS, 40));
  const starve = { l10: [], l30: [], E10: [], E30: [] };
  const seen = { 1: [], 2: [], 4: [] }, goalAt = { 1: [], 2: [], 4: [] }, afterProtein = [];
  for (let i = 0; i < n; i++) {
    const v = def.variant(K.variantSeed(0xa11 + i, '1.1', 0));
    const c = new Cell(def.config(v, 'task'));
    c.advance(600); starve.l10.push(c.k.lambda / PV.lambda_ref); starve.E10.push(c.E);
    c.advance(1200); starve.l30.push(c.k.lambda / PV.lambda_ref); starve.E30.push(c.E);
    // ptsG switched on at ×1, ×2 or ×4 at tick 0: when its job is seen, and when the goal's hold is met.
    for (const level of [1, 2, 4]) {
      const d = new Cell(def.config(v, 'task'));
      d.command({ type: 'setPromoter', gene: 'ptsG', level });
      const ring = new Float64Array(60);
      let sum = 0, run = 0, s = -1, g = -1;
      for (let t = 0; t < def.limitMin * 60 && g < 0; t++) {
        d.step();
        sum += d.k.lambda - ring[t % 60]; ring[t % 60] = d.k.lambda;
        const l60 = t >= 59 ? sum / 60 : sum / (t + 1);
        const pv = d.observe().geneById.ptsG;
        if (s < 0 && pv.functionSeen) { s = d.tick; if (level === 2) afterProtein.push((s - pv.episode.firstProteinTick) / 60); }
        if (s >= 0) { if (l60 >= 0.8 * PV.lambda_ref) { if (++run >= 300) g = d.tick; } else run = 0; }
      }
      seen[level].push(s / 60); goalAt[level].push(g / 60);
    }
  }
  const range = (a) => [r2(Math.min(...a)), r2(Math.max(...a))];
  l11.starving = { l10: range(starve.l10), l30: range(starve.l30), E10: range(starve.E10), E30: range(starve.E30) };
  console.log(`  starving (backup route, ptsG off and cleared): λ/λref ${l11.starving.l10.join('–')} at 10 min, ${l11.starving.l30.join('–')} at 30 min; ` +
    `E ${l11.starving.E10.join('–')} and ${l11.starving.E30.join('–')}`);
  if (l11.starving.l10[1] > 0.45 || l11.starving.l10[0] < 0.15 || l11.starving.E10[0] < 0.05) fail('l11 starving state outside R-E7 (0.15–0.45 λref, E ≥ 0.05): lower uBasal_backup through config.params');
  l11.seen = {}; l11.goalAt = {};
  for (const level of [1, 2, 4]) {
    l11.seen[level] = { p50: r1(quantile(seen[level], 0.5)), p90: r1(quantile(seen[level], 0.9)), max: r1(Math.max(...seen[level])) };
    l11.goalAt[level] = { p50: r1(quantile(goalAt[level], 0.5)), p90: r1(quantile(goalAt[level], 0.9)), max: r1(Math.max(...goalAt[level])) };
    console.log(`  ptsG ×${level}: job seen after ${l11.seen[level].p50} min (median; p90 ${l11.seen[level].p90}, max ${l11.seen[level].max}); ` +
      `goal (0.8 λref for 5 min) at ${l11.goalAt[level].p50} min (p90 ${l11.goalAt[level].p90}, max ${l11.goalAt[level].max})`);
    if (seen[level].some((x) => x < 0) || goalAt[level].some((x) => x < 0)) fail('l11 ptsG ×' + level + ' does not reach the goal within ' + def.limitMin + ' min on every seed');
  }
  // The reasoned solution keeps a candidate until its first protein is keepMin old: longer than ptsG takes at ×2.
  const worst = Math.max(...afterProtein);
  l11.keepMin = Math.max(8, Math.ceil(worst + 1));
  console.log(`  ptsG ×2: job seen at most ${r1(worst)} min after its first protein; the reasoned solution keeps a candidate ${l11.keepMin} min after its first protein`);
  // Every solution: 12 display orders (3 per membrane rank of ptsG) × SEEDS engine seeds each.
  def = loadLevel('btc-level-1-1.js', Object.assign({}, base, { l11 }));
  const rank = (v) => v.order.filter((id) => def.membrane.indexOf(id) >= 0).indexOf('ptsG') + 1;
  const orders = [];
  for (let i = 0; orders.length < 12 && i < 100000; i++) {
    const v = def.variant(K.variantSeed(0x5eed + i, '1.1', 0));
    const key = v.order.join(',');
    if (orders.some((o) => o.key === key)) continue;
    if (orders.filter((o) => o.rank === rank(v)).length >= 3) continue;
    orders.push({ key, rank: rank(v), label: 'rank' + rank(v) + String.fromCharCode(97 + orders.filter((o) => o.rank === rank(v)).length) });
  }
  const groups = {};
  for (let i = 0; i < 2000000 && Object.keys(groups).length < orders.length * SEEDS; i++) {
    const vs = K.variantSeed(0x5eed + i, '1.1', 0);
    const key = def.variant(vs).order.join(',');
    const o = orders.find((x) => x.key === key);
    if (!o) continue;
    const g = groups[o.label] || (groups[o.label] = []);
    if (g.length < SEEDS) g.push(vs);
    if (orders.every((x) => (groups[x.label] || []).length >= SEEDS)) break;
  }
  const ns = {};
  const rates = playAll(def, groups, (name, key, p) => {
    if (name !== 'reasoned' && name !== 'reference') return;
    const r = key.slice(0, 5);
    ((ns[name] || (ns[name] = {}))[r] || (ns[name][r] = [])).push(p.runner.monitorResult.n);
  });
  for (const name of Object.keys(ns)) console.log(`  ${name} experiments by ptsG's rank among the membrane genes: ` + Object.keys(ns[name]).sort().map((r) => `${r} ${Math.min(...ns[name][r])}–${Math.max(...ns[name][r])}`).join('; '));
  l11.passRates = judge(def, rates);
  return l11;
}

// ---------------------------------------------------------------------------
// l17: nobody's in charge
// ---------------------------------------------------------------------------
function calibrate17(base) {
  console.log('\nl17 (level 1.7)');
  const MED = { G: { glucose_mM: 10, lactose_mM: 0 }, L: { glucose_mM: 0, lactose_mM: PV.lactosePresent } };
  // The level's own parameter overrides (content 2: inducer exclusion, IEmax), so every measurement uses its cell.
  const params = loadLevel('btc-level-1-7.js', base).params || {};
  console.log('  level parameters: ' + (Object.keys(params).length ? JSON.stringify(params) : 'engine defaults'));
  const lac = (seed, design) => new Cell({ seed, strain: 'm2-lac', start: 'steady', design, params: Object.assign({}, params) });
  const medium = (c, m) => c.command(Object.assign({ type: 'setMedium' }, m));
  // λL: the induced wild type growing on lactose (3 h of IPTG in glucose, then 3 h on lactose, then 1 h measured).
  const lams = [], Zinds = [];
  for (const seed of [99, 98, 97, 96]) {
    const c = lac(seed, null);
    medium(c, { iptg_mM: 1 }); c.advance(3 * 3600);
    medium(c, Object.assign({ iptg_mM: 0 }, MED.L)); c.advance(3 * 3600);
    Zinds.push(c.gene('lacZ').P);
    let s = 0;
    for (let i = 0; i < 3600; i++) { c.step(); s += c.k.lambda; }
    lams.push(s / 3600);
  }
  const l17 = { lambdaLacRef: Number(mean(lams).toPrecision(4)), LMIN: base.l17.LMIN, rBLMax: base.l17.rBLMax };
  console.log(`  λL (induced wild type on lactose) ${l17.lambdaLacRef} /s (doubling ${r1(LN2 / l17.lambdaLacRef / 60)} min; ${r2(l17.lambdaLacRef / PV.lambda_ref)} λref)`);
  // The truth table of §7.7.7 (R-E15 RT-1): 3 h in each condition from the glucose steady state, LacZ as a share of induced.
  const Zind = mean(Zinds);
  const STRAINS = { wt: null, dlacI: { lacI: { allele: 'deleted' } }, Oc: { lac: { operator: false } }, Is: { lacI: { allele: 'Is' } } };
  let def = loadLevel('btc-level-1-7.js', Object.assign({}, base, { l17 }));
  const want = def.predictions.find((it) => it.id === 'tt').answer;
  l17.truth = {};
  for (const row of Object.keys(STRAINS)) {
    l17.truth[row] = {};
    for (const [col, m] of [['glc', MED.G], ['lac', MED.L]]) {
      const shares = [1, 2, 3, 4].map((seed) => { const c = lac(seed, STRAINS[row]); medium(c, m); c.advance(3 * 3600); return c.gene('lacZ').P / Zind; });
      l17.truth[row][col] = [Number(Math.min(...shares).toPrecision(2)), Number(Math.max(...shares).toPrecision(2))];
      const ok = want[row][col] === 1 ? Math.min(...shares) >= 0.05 : mean(shares) <= 0.01;
      if (!ok) fail('l17 truth table ' + row + ' in ' + col + ': LacZ ' + shares.map((x) => pct(x)).join('/') + ' of induced, expected ' + (want[row][col] ? 'made' : 'almost none'));
    }
  }
  console.log('  truth table (LacZ after 3 h, share of induced): ' + Object.keys(l17.truth).map((r) => `${r} glucose ${l17.truth[r].glc.map((x) => pct(x)).join('–')}, lactose ${l17.truth[r].lac.map((x) => pct(x)).join('–')}`).join('; '));
  // The variants: 4 templates × 10 jitter seeds (the app draws them from attempt seeds).
  const variantsFor = (d) => {
    const groups = {};
    for (let i = 0; i < 100000; i++) {
      const vs = K.variantSeed(0x5eed + i, '1.7', 0);
      const t = d.variant(vs).template;
      const g = groups[t] || (groups[t] = []);
      if (g.length < 10) g.push(vs);
      if (Object.keys(groups).length === 4 && Object.values(groups).every((x) => x.length >= 10)) break;
    }
    return groups;
  };
  // LMIN = max(90, 3 × the 90th-percentile wild-type lag on these schedules), rounded up to 5 min; re-measured until stable.
  let lags = [], firstLags = [], secondLags = [];
  for (let iter = 0; iter < 3; iter++) {
    def = loadLevel('btc-level-1-7.js', Object.assign({}, base, { l17 }));
    const groups = variantsFor(def);
    lags = []; firstLags = []; secondLags = [];
    for (const t of Object.keys(groups)) for (const vs of groups[t]) {
      const p = RUN.game.playHeadless(def, { variantSeed: vs, solution: 'reference', today: () => '2026-01-01' });
      const m = p.runner.monitorResult;
      lags.push(...m.lags); firstLags.push(m.lags[0]); secondLags.push(m.lags[1]);
    }
    const p90 = quantile(lags, 0.9);
    const LMIN = Math.max(90, Math.ceil((3 * p90) / 5) * 5);
    console.log(`  wild-type lag on the templates (LMIN ${l17.LMIN}): first lactose phase ${r1(quantile(firstLags, 0.5))} min (median; ${r1(Math.min(...firstLags))}–${r1(Math.max(...firstLags))}), ` +
      `second ${r1(quantile(secondLags, 0.5))} min (${r1(Math.min(...secondLags))}–${r1(Math.max(...secondLags))}); all phases p50 ${r1(quantile(lags, 0.5))}, p90 ${r1(p90)} → LMIN ${LMIN}`);
    if (LMIN === l17.LMIN) break;
    l17.LMIN = LMIN;
  }
  l17.lagP50 = r1(quantile(lags, 0.5)); l17.lagP90 = r1(quantile(lags, 0.9));
  l17.lagFirst = [r1(Math.min(...firstLags)), r1(Math.max(...firstLags))]; l17.lagSecond = [r1(Math.min(...secondLags)), r1(Math.max(...secondLags))];
  // Every solution on the 40 variants (the par run shared per variant), plus the §7.7.14 numbers.
  def = loadLevel('btc-level-1-7.js', Object.assign({}, base, { l17 }));
  const groups = variantsFor(def);
  const parCache = {}, per = {};
  const rates = playAll(def, groups, (name, key, p) => {
    const m = p.runner.monitorResult, c = p.runner.preview();
    const o = per[name] || (per[name] = { rBL: [], wf: [], dbl: [], lag: [], E: [] });
    if (typeof m.rBL === 'number') o.rBL.push(m.rBL);
    o.wf.push(m.wf); o.lag.push(m.lag);
    if (c.sub) o.E.push(Math.min(c.sub.growth, c.sub.lag, c.sub.waste));
    if (c.par && c.mine) o.dbl.push(c.mine.dbl / c.par.dbl);
  }, { parCache });
  const totals = [];
  for (const t of Object.keys(groups)) for (const vs of groups[t]) totals.push(def.totalTicks(def.variant(vs)) / 3600);
  l17.totalHours = [r1(Math.min(...totals)), r1(Math.max(...totals))];
  for (const name of Object.keys(per)) {
    const o = per[name];
    console.log(`  ${name.padEnd(20)} rB/L ${o.rBL.length ? r2(Math.min(...o.rBL)) + '–' + r2(Math.max(...o.rBL)) : '–'}; waste ${pct(Math.min(...o.wf))}–${pct(Math.max(...o.wf))}; ` +
      `lag ${r1(Math.min(...o.lag))}–${r1(Math.max(...o.lag))} min; doublings ÷ par ${o.dbl.length ? r2(Math.min(...o.dbl)) + '–' + r2(Math.max(...o.dbl)) : '–'}; E ${o.E.length ? r2(Math.min(...o.E)) + '–' + r2(Math.max(...o.E)) : '–'}`);
  }
  const ref = per.reference, noCrp = per.coreWildType;
  l17.wfRef = [Number(Math.min(...ref.wf).toPrecision(2)), Number(Math.max(...ref.wf).toPrecision(2))];
  l17.rBL = { crp: [r2(Math.min(...ref.rBL)), r2(Math.max(...ref.rBL))], noCrp: [r2(Math.min(...noCrp.rBL)), r2(Math.max(...noCrp.rBL))] };
  // Glucose first (§8.3): a quarter when the reference holds it with room (p95 ≤ 0.2), otherwise half; designs
  // without the CRP site must stay above the threshold.
  const refP95 = quantile(ref.rBL, 0.95), noP5 = quantile(noCrp.rBL, 0.05);
  const rBLMax = refP95 <= 0.2 ? 0.25 : 0.5;
  console.log(`  glucose first: reference rB/L p95 ${r2(refP95)}; without the CRP site p5 ${r2(noP5)} → threshold ${rBLMax}`);
  if (refP95 > rBLMax || noP5 <= rBLMax) fail('l17 the glucose-first threshold ' + rBLMax + ' does not separate the designs with and without the CRP site');
  l17.rBLMax = rBLMax;
  console.log(`  run length ${l17.totalHours.join('–')} h of game time`);
  l17.passRates = judge(def, rates);
  return l17;
}

// ---------------------------------------------------------------------------
function currentConstants() {
  try {
    delete require.cache[require.resolve(OUT)];
    const c = require(OUT);
    // A patch release changes no physics (PROLOGUE §7): the constants of 1.1.0 stand for 1.1.1.
    const mm = (x) => String(x).split('.').slice(0, 2).join('.');
    return mm(c.engineVersion) === mm(ENGINE_VERSION) ? c : null;
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
  const base = { l11: cur.l11 || PROVISIONAL.l11, l12: cur.l12 && cur.l12.v === 2 ? cur.l12 : PROVISIONAL.l12, l14: cur.l14 || PROVISIONAL.l14,
    l17: cur.l17 || PROVISIONAL.l17, economy: cur.economy || PROVISIONAL.economy };
  console.log(`Calibrating on engine ${ENGINE_VERSION} with ${SEEDS} engine seeds per variant` + (ONLY ? ' (only ' + ONLY + ')' : ''));
  const out = { engineVersion: ENGINE_VERSION, generated: new Date().toISOString().slice(0, 10), seeds: SEEDS };
  out.economy = calibrateEconomy();
  out.l11 = !ONLY || ONLY === 'l11' ? calibrate11(Object.assign({}, base, { economy: out.economy })) : base.l11;
  out.l12 = !ONLY || ONLY === 'l12' ? calibrate12(Object.assign({}, base, { l11: out.l11, economy: out.economy })) : base.l12;
  out.l14 = !ONLY || ONLY === 'l14' ? calibrate14(Object.assign({}, base, { l11: out.l11, l12: out.l12, economy: out.economy })) : base.l14;
  out.l17 = !ONLY || ONLY === 'l17' ? calibrate17(Object.assign({}, base, { l11: out.l11, l12: out.l12, l14: out.l14, economy: out.economy })) : base.l17;
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s; ${problems.length ? problems.length + ' problem(s)' : 'all checks pass'}`);
  if (!CHECK_ONLY && (!problems.length || args.indexOf('--force') >= 0)) {
    write(out);
    console.log('wrote ' + path.relative(ROOT, OUT));
  } else if (!CHECK_ONLY) console.log('not written (fix the problems above, or pass --force to write anyway)');
  if (problems.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { loadLevel, variantSeeds, PROVISIONAL };
