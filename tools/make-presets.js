#!/usr/bin/env node
/*
 * Regenerates the starting points (engine spec §11.1; LEVELS.md R-E2): per strain
 * a steady state (a cold start with seed 0 in 10 mM glucose run for 120,000
 * ticks, ≈33 h) and a newborn cell (the same, run on to just after its next
 * division). Canonical state bytes are stored as base64 with their hash, in two
 * places with the same content:
 *   src/engine/btc-presets.js        what the engine loads (data only)
 *   presets/<id>.json                the same snapshot as plain JSON
 *
 *   node tools/make-presets.js          write all files
 *   node tools/make-presets.js --check  exit 1 if any is stale (test d-7)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ENGINE = path.join(__dirname, '..', 'src', 'engine');
const OUT = path.join(ENGINE, 'btc-presets.js');
const jsonPath = (id) => path.join(__dirname, '..', 'presets', id + '.json');
/*
 * steady:  a cold start (seed 0) run for 120,000 ticks in 10 mM glucose.
 * birth:   the steady cell run on to just after its first division (V ≈ 1 fL, one gene
 *          copy; LEVELS.md R-E2), so replication comes ≈48 min and division ≈98 min later.
 * m2-l11:  the lab strain's presets with the decoy araE added empty (its other genes, streams
 *          by gene id, are the lab strain's; LEVELS.md R-E5).
 * m2-lac:  after the 120,000 ticks the cell runs on until it is between lac bursts and carries a
 *          typical basal load: 2–6 LacY (the long-run mean in glucose is ≈3; Julou 2020 and Choi
 *          2008: about half of glucose-grown cells carry at least one LacY), no lac mRNA and no
 *          lac transcript, and 8–14 LacI tetramers (the long-run mean is ≈10). A cell with no LacY at all cannot start on lactose alone in this
 *          anaerobic model (BIOLOGY.md, lactose lag), so the preset is a cell that can.
 */
const SPECS = [
  { id: 'm1-lab-glucose', strain: 'm1-lab', seed: 0, ticks: 120000 },
  { id: 'm1-lab-glucose-birth', strain: 'm1-lab', seed: 0, ticks: 120000, birth: true },
  { id: 'm2-lac-glucose', strain: 'm2-lac', seed: 0, ticks: 120000, basalLac: true },
  { id: 'm2-lac-glucose-birth', strain: 'm2-lac', seed: 0, ticks: 120000, basalLac: true, birth: true },
  { id: 'm2-l11-glucose', strain: 'm2-l11', seed: 0, ticks: 120000, from: 'm1-lab-glucose' },
  { id: 'm2-l11-glucose-birth', strain: 'm2-l11', seed: 0, ticks: 120000, birth: true, from: 'm1-lab-glucose-birth' },
];
const SPEC = SPECS[0];

/**
 * The cell a spec describes (cold start, 120,000 ticks, then on to just after a division for birth).
 * Cells are memoised per spec (the caller gets a fork), so a birth preset continues its steady
 * preset's run instead of repeating it; the result is the same as a fresh run.
 */
const made = new Map();
function specCell(spec) {
  if (!made.has(spec.id)) made.set(spec.id, buildCell(spec));
  return made.get(spec.id).fork();
}

function buildCell(spec) {
  const { Cell } = require(path.join(ENGINE, 'btc-cell.js'));
  if (spec.from) return transplant(specCell(SPECS.find((s) => s.id === spec.from)), spec.strain);
  const base = spec.birth && SPECS.find((s) => !s.birth && !s.from && s.strain === spec.strain && s.seed === spec.seed &&
    s.ticks === spec.ticks && !!s.basalLac === !!spec.basalLac);
  if (base) {
    const cell = specCell(base);
    const gen = cell.gen;
    while (cell.gen === gen) cell.step();
    return cell;
  }
  const cell = new Cell({ seed: spec.seed, strain: spec.strain, start: 'cold' });
  cell.advance(spec.ticks);
  if (spec.basalLac) {
    const Y = cell.geneById.lacY, Z = cell.geneById.lacZ, I = cell.geneById.lacI;
    const between = () => Z.mature.count === 0 && Z.nascent.len === 0 && Z.cohorts.len === 0 && Y.cohorts.len === 0;
    const tetramers = () => Math.floor(I.P / 4);
    let n = 0;
    while (!(Y.P >= 2 && Y.P <= 6 && between() && tetramers() >= 8 && tetramers() <= 14)) {
      cell.step();
      if (++n > 400000) throw new Error(spec.id + ': no basal lac state within 400,000 ticks');
    }
  }
  if (spec.birth) {
    const gen = cell.gen;
    while (cell.gen === gen) cell.step();
  }
  return cell;
}

/** The same state in a strain with extra genes: shared genes (by id) and everything else copied, new genes empty. */
function transplant(src, strain) {
  const M = require(path.join(ENGINE, 'btc-math.js'));
  const { Cell } = require(path.join(ENGINE, 'btc-cell.js'));
  const dst = new Cell({ seed: src.config.seed, strain, start: 'cold' });
  const copyQueue = (from, to) => {
    const w = new M.ByteWriter(1 << 16);
    from.write(w);
    to.read(new M.ByteReader(w.bytes()));
  };
  for (const key of ['tick', 'Vbirth', 'gen', 'dosage', 'lambdaEMA', 'lastCycle_s', 'birthTick', 'E', 'AA', 'Lin', 'D', 'N', 'Rbusy',
    'nextMRNAId', 'rifDose', 'cmDose', 's0', 'backupUptake', 'controls', 'seqNext']) dst[key] = src[key];
  Object.assign(dst.env, src.env);
  for (const g of dst.genes) {
    const o = src.geneById[g.id];
    if (!o) {                                // a new gene starts empty (its dial at the catalog default)
      g.mature.count = 0; g.nascent.len = 0; g.nascent.head = 0;
      while (g.cohorts.len > 0) g.cohorts.popHead();
      g.P = 0; g.initiations = 0; g.mMade = 0; g.pMade = 0;
      continue;
    }
    for (const key of ['level', 'rateOverride', 'knockout', 'rbs', 'halfLife', 'kdeg', 'activity', 'P', 'initiations', 'mMade', 'pMade']) g[key] = o[key];
    copyQueue(o.mature, g.mature);
    copyQueue(o.nascent, g.nascent);
    copyQueue(o.cohorts, g.cohorts);
    g.txStream.set(o.txStream);
    g.decayStream.set(o.decayStream);
  }
  dst.sectors.forEach((u, j) => { const o = src.sectors[j]; u.m = o.m; u.mass = o.mass; copyQueue(o.cohorts, u.cohorts); });
  dst.divisionStream.set(src.divisionStream);
  dst.ledger.cumulative.set(src.ledger.cumulative);
  dst.ledger.cumulativeSupply = src.ledger.cumulativeSupply;
  dst.ledger.cumulativeFloor = src.ledger.cumulativeFloor;
  dst.refreshDerived();
  return dst;
}

function makePreset(id) {
  const spec = SPECS.find((s) => s.id === (id || SPEC.id));
  const M = require(path.join(ENGINE, 'btc-math.js'));
  const { ENGINE_VERSION } = require(path.join(ENGINE, 'btc-cell.js'));
  const bytes = specCell(spec).stateBytes(false);
  return {
    id: spec.id, strain: spec.strain, seed: spec.seed, ticks: spec.ticks, engineVersion: ENGINE_VERSION,
    hash: M.hash64(bytes), state: M.base64Encode(bytes),
  };
}

function renderOne(preset) {
  const chunks = [];
  for (let i = 0; i < preset.state.length; i += 96) chunks.push("      '" + preset.state.slice(i, i + 96) + "'");
  return `    '${preset.id}': {
      strain: '${preset.strain}', seed: ${preset.seed}, ticks: ${preset.ticks}, engineVersion: '${preset.engineVersion}',
      hash: '${preset.hash}',
      state: [
${chunks.join(',\n')},
      ].join(''),
    },
`;
}

function render(presets) {
  return `// @deps
/*
 * Be the Cell: steady-state starting points (data only). GENERATED by
 * tools/make-presets.js from cold starts (seed 0, 120000 ticks; m2-lac then runs on to a typical
 * basal-lac state; birth presets run on to the next division; m2-l11 reuses the lab strain's with
 * araE added empty); do not edit.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.presets = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
${presets.map(renderOne).join('')}  };
});
`;
}

function renderJSON(preset) {
  return JSON.stringify(preset, null, 2) + '\n';
}

/** True when both stored copies hold exactly this preset. */
function isFresh(preset) {
  const stored = require(OUT)[preset.id];
  const p = jsonPath(preset.id);
  const json = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  return !!stored && stored.hash === preset.hash && stored.state === preset.state && json === renderJSON(preset);
}

if (require.main === module) {
  const presets = SPECS.map((s) => makePreset(s.id));
  if (process.argv.includes('--check')) {
    let ok = true;
    for (const preset of presets) {
      const fresh = isFresh(preset);
      const stored = require(OUT)[preset.id];
      console.log(fresh ? preset.id + ' is fresh: ' + preset.hash : preset.id + ' is STALE: stored ' + (stored && stored.hash) + ', fresh ' + preset.hash);
      ok = ok && fresh;
    }
    process.exit(ok ? 0 : 1);
  }
  fs.writeFileSync(OUT, render(presets));
  for (const preset of presets) {
    fs.mkdirSync(path.dirname(jsonPath(preset.id)), { recursive: true });
    fs.writeFileSync(jsonPath(preset.id), renderJSON(preset));
  }
  console.log('wrote ' + path.relative(process.cwd(), OUT) + ' and presets/*.json (' + presets.map((p) => p.id + ' ' + p.hash).join(', ') + ')');
}

module.exports = { makePreset, render, renderJSON, isFresh, SPEC, SPECS };
