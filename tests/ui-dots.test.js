// U-6: the cell view's dot budget (LAB_UI §2.3). Over 50 random states (levels,
// media, drugs; 2 h each) the glyphs drawn stay within 1,500; every gene with
// protein has at least one glyph (solid or hollow); the shared protein scale
// has 20% hysteresis. Worst case: fliC ×4 as the focus gene after 2 h.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Cell } = require('./helpers.js');
const CV = require('../src/app/btc-cellview.js');
const G = require('../src/app/btc-cellgeom.js');
const cat = require('../src/engine/btc-catalog.js');

const GENES = cat.STRAINS['m1-lab'].genes;
const strandNt = new Float64Array(GENES.map((g) => 3 * g.length + 60));
const LEVELS = ['off', 0.25, 0.5, 1, 2, 4];

function geomFor(view, w, h) {
  const g = G.create(w, h);
  const c = view.cell;
  G.fit(g, c.length_um, c.width_um, Math.max(0, (c.V_fL - c.Vbirth_fL - 0.8) / 0.2) * 0.45);
  return g;
}

// A small deterministic generator for the scenarios (the test's own, not the engine's).
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

test('U-6: 50 random 2-hour states stay within 1,500 glyphs, and every gene with protein shows', () => {
  const rnd = lcg(20270115);
  let worst = 0;
  for (let k = 0; k < 50; k++) {
    const genes = {};
    for (const g of GENES) genes[g.id] = { level: LEVELS[Math.floor(rnd() * LEVELS.length)] };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const cell = new Cell({
      seed: k + 1, start: 'steady', genes,
      medium: { glucose_mM: pick([0, 0.005, 10, 10]), lactose_mM: pick([0, 5]), aminoAcids_mM: pick([0, 2]), oxygen: false },
      drugs: { rifampicin: pick([0, 0, 0.3, 1]), chloramphenicol: pick([0, 0, 0.3, 1]) },
    });
    cell.advance(7200);
    const view = cell.observe();
    for (const [w, h] of [[360, 420], [900, 440]]) {
      const focus = Math.floor(rnd() * 7);
      const p = CV.plan(view, geomFor(view, w, h), { focus, strandNt }, CV.createPlan());
      assert.ok(p.total <= CV.MAX_GLYPHS, `scenario ${k} at ${w}×${h}: ${p.total} glyphs`);
      worst = Math.max(worst, p.total);
      for (let i = 0; i < 7; i++) {
        if (view.genes[i].proteinRounded > 0) assert.ok(p.protein[i] + p.hollow[i] >= 1, `scenario ${k}: ${view.genes[i].id} has protein but no glyph`);
        assert.equal(p.mRNA[i], view.genes[i].mRNA, 'mRNA is always one mark per molecule');
      }
    }
  }
  assert.ok(worst > 300, `the scenarios draw a real cell (worst ${worst})`);
});

test('U-6: worst case, fliC ×4 as the focus gene after 2 h, fits the budget with the coarse polysome scale', () => {
  const cell = new Cell({ seed: 1, start: 'steady', genes: { fliC: { level: 4 } } });
  cell.advance(7200);
  const view = cell.observe(), f = 6;
  const fl = view.geneById.fliC;
  for (const [w, h] of [[360, 420], [375, 225], [900, 440]]) {
    const g = geomFor(view, w, h);
    const p = CV.plan(view, g, { focus: f, strandNt }, CV.createPlan());
    assert.ok(fl.ribosomes > 400, `fliC has ${Math.round(fl.ribosomes)} ribosomes`);
    assert.equal(p.polyN, 10, 'focus polysome drawn at 1 dot = 10');
    assert.ok(p.total <= CV.MAX_GLYPHS, `${w}×${h}: ${p.total} glyphs`);
    assert.ok(p.focusStrandArea <= 0.4 * p.interiorArea + 1e-9 || p.strandLen === 8,
      `strands cover ${Math.round(p.focusStrandArea)} of ${Math.round(p.interiorArea)} px²`);
    assert.ok(p.strandLen >= 8 && p.strandLen <= 48);
  }
});

test('U-6: the shared protein scale changes only after its threshold is crossed by 20%', () => {
  const cell = new Cell({ seed: 2, start: 'steady' });
  const real = cell.observe();
  // A stand-in view whose largest protein count we can set.
  const view = {
    genes: real.genes.map((g) => ({ protein: g.protein, proteinRounded: g.proteinRounded, ribosomes: g.ribosomes, mRNA: g.mRNA, nascent: g.nascent })),
    env: real.env, ribosomes: real.ribosomes, energy: real.energy, aminoAcids: real.aminoAcids, lactose: real.lactose, cell: real.cell,
  };
  const g = geomFor(real, 360, 420);
  for (const gv of view.genes) gv.protein = 500;
  const p = CV.createPlan();
  const scaleAt = (max) => { view.genes[1].protein = max; return CV.plan(view, g, { focus: 0, strandNt }, p).P; };
  assert.equal(scaleAt(118000), 1000);
  assert.equal(scaleAt(140000), 1000, 'above 120 dots but within 20%: unchanged');
  assert.equal(scaleAt(145000), 10000, 'past 144 dots: steps up');
  assert.equal(scaleAt(110000), 10000, 'back below 120 dots but not below 100: unchanged');
  assert.equal(scaleAt(99000), 1000, 'below 100 dots at the smaller step: steps down');
});
