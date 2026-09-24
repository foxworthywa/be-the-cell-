// TI-1 and TI-2 (docs/PROLOGUE.md §10.1): the tiered screens. Each screen's labConfig.ui is valid; the tiers
// follow the table of §5.3 (what each shows, what it introduces, and a sentence for every introduced readout);
// the lab's Simple and All controls modes expose the same commands; the pure readouts (growth and sugar words,
// the simple graph's axis) say what the model says.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const APP = path.join(__dirname, '..', 'src', 'app');
const TI = require(path.join(APP, 'btc-tiers.js'));
const SG = require(path.join(APP, 'btc-simplegraph.js'));
const C = require(path.join(APP, 'btc-content.js'));
const CAT = require('../src/engine/btc-catalog.js');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const STUB = LV.validate(require('./fixtures/level-watch-stub.js'));

const LAB = {
  showNames: true, genesVisible: 'all', controls: { genes: true, medium: true, drugs: true }, lockedGenes: [], readOnlyGenes: false,
  mediumRows: { glucose: 'free', lactose: 'free', aminoAcids: 'free' }, allowedLevels: null, tabs: ['cell', 'genes', 'medium', 'graphs'], ui: null,
};
const LEVELS = ['off', 0.25, 0.5, 1, 2, 4];
const MEDIUM = Object.fromEntries(Object.keys(C.medium.rows).map((f) => [f, C.medium.rows[f].options.map((o) => o.key)]));
const DRUGS = { rifampicin: C.drugs.options.map((o) => o.key), chloramphenicol: C.drugs.options.map((o) => o.key) };
const GENES = CAT.STRAINS['m1-lab'].genes.map((g) => g.id);

test('TI-1: a labConfig without ui (an older level, or All controls) is the full M1 lab; tier defaults fill in the rest', () => {
  assert.equal(TI.normalise(null), null);
  assert.equal(TI.normalise({ tier: 'all' }), null);
  assert.deepEqual(TI.visibleReadouts(null), TI.READOUTS);
  const t1 = TI.normalise({ tier: 1 });
  assert.deepEqual([t1.status.clock, t1.status.speed, t1.status.energy, t1.status.growth, t1.status.generation, t1.status.doubling], [true, true, false, false, false, false]);
  assert.deepEqual(t1.focusBar.counters, ['mRNA', 'protein']);
  assert.equal(t1.focusBar.control, 'onoff');
  assert.deepEqual(t1.tabs, ['cell']);
  assert.equal(t1.graph, null);
  assert.equal(t1.spendBar, false);
  assert.equal(t1.legend, 'short');
  const t3 = TI.normalise({ tier: 3, graph: { series: [{ gene: 'lacY', kind: 'protein' }], target: { y: 5000, label: 'aim' } } });
  assert.deepEqual(t3.focusBar.counters, ['mRNA', 'made', 'protein']);
  assert.deepEqual(TI.appTabs(t3), ['cell', 'graphs']);
  assert.equal(t3.mediumPanel, 'hidden');
  assert.ok(t3.graph && t3.graph.target.y === 5000);
  // A level's own tabs stand when its ui names none; the clock and the speed chip can never be switched off.
  assert.deepEqual(TI.normalise({ tier: 3 }, ['cell', 'genes', 'graphs']).tabs, ['cell', 'genes', 'graph']);
  assert.equal(TI.normalise({ tier: 2, status: { speed: false, clock: false } }).status.speed, true);
  for (const k of ['generation', 'doubling']) for (const t of [1, 2, 3, 4, 5]) assert.equal(TI.normalise({ tier: t }).status[k], false, k + ' in tier ' + t);
});

test('TI-1: the tier table of §5.3: each row normalises as listed, and every readout it introduces is shown there, with its sentence', () => {
  for (const id of Object.keys(TI.LEVEL_TABLE)) {
    const row = TI.LEVEL_TABLE[id];
    const ui = { tier: row.tier, focusBar: { counters: row.counters, control: row.control }, tabs: row.tabs, introduce: row.introduce,
      status: Object.assign({}, row.status || {}), graph: row.graph ? { series: [{ gene: 'lacY', kind: 'protein' }] } : undefined };
    if (row.introduce.indexOf('graph.target') >= 0) ui.graph.target = { y: 1, label: 'aim' };
    if (row.introduce.indexOf('graph.zone') >= 0) ui.graph.zone = { lo: 1, hi: 2 };
    if (row.introduce.indexOf('bands.phases') >= 0) ui.graph.bands = true;
    if (row.introduce.indexOf('status.doubling') >= 0) ui.status.doubling = true;
    assert.deepEqual(TI.validate(ui), [], id);
    const u = TI.normalise(ui);
    assert.equal(!!u.graph, row.graph, id + ' graph');
    for (const r of row.introduce) assert.ok(C.tiers.readouts[r], id + ': no sentence for ' + r);
  }
  // Tiers only add: a readout shown in tier k is shown in every later tier's defaults (the dial replaces the switch).
  const shown = (t) => TI.visibleReadouts(TI.normalise({ tier: t, graph: t >= 3 ? { series: [{ gene: 'x', kind: 'protein' }] } : undefined }));
  for (let t = 2; t <= 5; t++) for (const r of shown(t - 1)) if (r !== 'counter.made' && r !== 'control.dial') assert.ok(shown(t).indexOf(r) >= 0, r + ' disappears in tier ' + t);
  // The lab's Simple mode is the 'lab' row.
  const lab = TI.normalise(TI.LAB_UI);
  assert.deepEqual(TI.validate(TI.LAB_UI), []);
  assert.equal(lab.tier, TI.LEVEL_TABLE.lab.tier);
  assert.deepEqual(lab.tabs, TI.LEVEL_TABLE.lab.tabs);
  assert.equal(lab.focusBar.control, 'dial');
  assert.equal(lab.genesPanel, 'simple');
  assert.equal(lab.mediumPanel, 'simple');
  assert.equal(lab.spendBar, false);
  // Problems are named.
  assert.deepEqual(TI.validate({ tier: 7 }), ['tier must be 1–5 or all']);
  assert.ok(TI.validate({ tier: 1, focusBar: { counters: ['mRNA', 'atp'] } }).some((p) => /unknown counter atp/.test(p)));
  assert.ok(TI.validate({ tier: 1, introduce: ['graph.protein'] }).some((p) => /graph.protein is not shown/.test(p)));
  assert.ok(TI.validate({ tier: 2, introduce: ['counter.nope'] }).some((p) => /no sentence/.test(p)));
  assert.ok(TI.validate({ tier: 3, graph: { series: [] } }).some((p) => /one or two lines/.test(p)));
});

test('TI-1: every screen of the stub level (watch and run) has a valid ui; the new pattern levels on disk too', () => {
  const r = new RUN.game.LevelRunner({ def: STUB, variantSeed: 1 }).start();
  for (const phase of ['intro', 'watch', 'task', 'run', 'result', 'debrief']) {
    const lc = STUB.labConfig(r.variant, { phase, step: phase === 'watch' ? 'w2' : null });
    assert.deepEqual(TI.validate(lc.ui), [], phase);
  }
  // Every shipped level with a watch phase (the new pattern) declares a valid tier on each screen.
  const fs = require('fs');
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'levels'))) {
    if (!/^btc-level-.*\.js$/.test(f) || f === 'btc-level-constants.js') continue;
    const def = LV.validate(require('../src/levels/' + f));
    if (def.phases.indexOf('watch') < 0) continue;
    const v = def.variant(def.scored ? 12345 : 0);
    for (const phase of def.phases) {
      const lc = def.labConfig(v, { phase, revealed: {}, step: null });
      // The screens with a live cell (the watch and the run) declare their tier; any ui declared elsewhere is valid.
      if (phase === 'watch' || phase === 'run') assert.ok(lc.ui, def.id + ' ' + phase + ' has a ui');
      assert.deepEqual(TI.validate(lc.ui), [], def.id + ' ' + phase);
    }
  }
});

test('TI-2: the lab\'s Simple and All controls modes expose the same commands (every dial, the medium, the drugs)', () => {
  const all = TI.commandsExposed(LAB, GENES, LEVELS, MEDIUM, DRUGS);
  const simple = TI.commandsExposed(Object.assign({}, LAB, { ui: TI.LAB_UI }), GENES, LEVELS, MEDIUM, DRUGS);
  assert.deepEqual(simple, all);
  assert.equal(all.filter((x) => x.startsWith('setPromoter:')).length, 7 * 6);
  assert.ok(all.some((x) => x === 'setDrug:rifampicin:full') && all.some((x) => x === 'setMedium:lactose:present'));
  // A tier-3 level screen: only its gene's Off/On (On at the level's setting).
  const run = STUB.labConfig(STUB.variant(1), { phase: 'run' });
  const lc = Object.assign({}, LAB, run, { controls: Object.assign({}, LAB.controls, run.controls), mediumRows: Object.assign({}, LAB.mediumRows, run.mediumRows) });
  assert.deepEqual(TI.commandsExposed(lc, GENES, LEVELS, MEDIUM, DRUGS), ['setPromoter:ptsG:4', 'setPromoter:ptsG:off']);
});

test('the words the tiered strip shows: growth from the facts, sugar in against the reference flux', () => {
  assert.equal(TI.growthWord({ growth: 'normal' }), 'growing normally');
  assert.equal(TI.growthWord({ growth: 'slow' }), 'growing slowly');
  assert.equal(TI.growthWord({ growth: 'arrested' }), 'not growing');
  const F = 5.8e5, v = (g, l) => ({ flux: { glucoseIn: g, lactoseIn: l } });
  assert.equal(TI.sugarLevel(v(5.4e5, 0), F), 'plenty');
  assert.equal(TI.sugarLevel(v(0.3 * F, 0), F), 'some');
  assert.equal(TI.sugarLevel(v(0.15 * F, 0), F), 'trickle', "1.1's side route alone");
  assert.equal(TI.sugarLevel(v(0, 0.2 * F), F), 'some', 'a lactose gives two sugars');
  assert.equal(TI.sugarLevel(v(0, 0), F), 'none');
  // The simple graph's time axis: from 0, at least 10 minutes, its end clear of the last tick.
  for (const t1 of [0, 60, 600, 1799, 3600, 20000]) {
    const a = SG.axis('fit', t1);
    assert.equal(a.t0, 0);
    assert.ok(a.tEnd >= Math.max(600, t1), JSON.stringify([t1, a]));
    const last = Math.floor(a.tEnd / a.step) * a.step;
    assert.ok(a.tEnd - last >= 0.3 * a.step - 1e-9, 'room after the last tick: ' + JSON.stringify([t1, a]));
  }
  assert.ok(SG.axis(2400, 100).tEnd >= 2400);
});
