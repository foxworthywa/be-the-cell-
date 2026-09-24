// The Gene close-up plan and the close-up words (docs/PROLOGUE.md §3.3, §3.6, §10.1 ZC-1 … ZC-3, ZC-7).
// planGene is pure: the same view gives the same glyphs; every count it draws or summarises
// adds up to the view's own counts; it stays under the 600-glyph cap by giving way in the
// spec's order; and every student string of the close-ups passes the lint.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { Cell } = H;
const CU = require('../src/shared/btc-closeup.js');
const N = require('../src/shared/btc-narrate.js');
const OBS = require('../src/engine/btc-observe.js');
const Zoom = require('../src/app/btc-zoom.js');

const BOX = { w: 360, h: 390, top: 52, bottom: 52 };
const WIDE = { w: 900, h: 420, top: 52, bottom: 52 };

function planFor(c, gene, box, opts) {
  const v = c.observe(), f = v.genes.findIndex((g) => g.id === gene);
  const o = CU.createGenePlan();
  CU.planGene(v, c.detail(gene), box || BOX, Object.assign({ focus: f, maxCopies: (box || BOX).w >= 640 ? 12 : 6, epoch: v.clock.generation }, opts || {}), o);
  return o;
}
const count = (o, kind) => { let n = 0; for (let i = 0; i < o.N; i++) if (o.kind[i] === kind) n++; return n; };
const slice = (o) => ({ N: o.N, kind: Array.from(o.kind.slice(0, o.N)), x: Array.from(o.x.slice(0, o.N)), y: Array.from(o.y.slice(0, o.N)),
  p: Array.from(o.p.slice(0, o.N)), beads: Array.from(o.beadN.slice(0, o.N)), lanes: Array.from(o.laneId), total: o.total });

// Scenarios: the lab strain's genes at several levels, a long gene at ×4, the lac unit, a gene off.
function scenarios() {
  const out = [];
  const mk = (name, cfg, ticks, gene) => { const c = new Cell(Object.assign({ seed: 3, start: 'steady' }, cfg)); c.advance(ticks); out.push([name, c, gene]); };
  mk('ptsG ×1', {}, 600, 'ptsG');
  mk('gly ×1', {}, 600, 'gly');
  mk('lacY ×4', { genes: { lacY: { level: 4 } } }, 1800, 'lacY');
  mk('lacZ ×4', { genes: { lacZ: { level: 4 } } }, 1800, 'lacZ');
  mk('fliC ×2', { genes: { fliC: { level: 2 } } }, 1200, 'fliC');
  mk('lacY off', { genes: { lacY: { level: 'off', initial: { clear: true, protein: 0 } } } }, 60, 'lacY');
  mk('lac unit (m2-lac), lacY', { strain: 'm2-lac', medium: { glucose_mM: 0, lactose_mM: 5, iptg_mM: 1 } }, 1800, 'lacY');
  mk('ptsG ×4 birth', { start: 'birth', genes: { ptsG: { level: 4 } } }, 900, 'ptsG');
  return out;
}
const SC = scenarios();

test('ZC-1: planGene is deterministic and reuses its buffers', () => {
  for (const [name, c, gene] of SC) {
    const a = planFor(c, gene), b = planFor(c, gene);
    assert.deepEqual(slice(a), slice(b), name);
    // The same plan object planned again (its lanes kept) gives the same glyphs, in the same typed arrays.
    const v = c.observe(), f = v.genes.findIndex((g) => g.id === gene), det = c.detail(gene);
    const arrays = [a.kind, a.x, a.y, a.p, a.beadN, a.laneId, a.cdf];
    CU.planGene(v, det, BOX, { focus: f, maxCopies: 6, epoch: v.clock.generation }, a);
    assert.deepEqual(slice(a), slice(b), name + ' (replanned)');
    [a.kind, a.x, a.y, a.p, a.beadN, a.laneId, a.cdf].forEach((x, i) => assert.equal(x, arrays[i]));
  }
  // The planner's per-call code allocates nothing: no array or object literals, no `new`.
  const src = require('fs').readFileSync(require.resolve('../src/shared/btc-closeup.js'), 'utf8');
  const body = src.slice(src.indexOf('  function allot('), src.indexOf('  // The Protein zoom'));
  assert.ok(!/\bnew |\[\]|\{ *\}|\[[\d\w]+, /.test(body.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'allocates');
});

test('ZC-2: honest counts: copies drawn + summarised = mRNA; ribosome glyphs × scale over all copies = ribosomes; every transcript drawn', () => {
  for (const [name, c, gene] of SC) {
    for (const box of [BOX, WIDE]) {
      const o = planFor(c, gene, box), gv = c.observe().geneById[gene];
      assert.equal(o.d + o.moreCopies, gv.mRNA, name + ': copies');
      assert.equal(count(o, CU.G.MRNA), o.d, name + ': strands');
      assert.equal(count(o, CU.G.RNAP), gv.nascent, name + ': polymerases (never dropped)');
      assert.equal(count(o, CU.G.NASCENT), gv.nascent, name + ': copies being made');
      const G = Math.round(Math.round(gv.ribosomes) / o.ribScale);
      assert.equal(count(o, CU.G.RIB) + o.moreRib / o.ribScale, G, name + ': ribosome glyphs drawn + summarised');
      assert.ok(Math.abs(G * o.ribScale - Math.round(gv.ribosomes)) <= o.ribScale / 2, name + ': glyph scale');
      assert.equal(count(o, CU.G.CHAIN), count(o, CU.G.RIB), name + ': a chain on every ribosome');
      assert.ok(o.moreRib >= 0, name + ': ' + o.moreRib);
      // Finished proteins: up to 8 drawn, the rest in "+n more"; LacZ is counted in four-chain enzymes.
      assert.equal(count(o, CU.G.PROT), Math.min(8, o.P), name + ': proteins drawn');
      assert.equal(o.protDrawn + o.protMore, o.P);
      assert.ok(Math.abs(o.P * o.oligomer - gv.proteinRounded) <= o.oligomer, name + ': proteins');
      // Beads: one per 20 amino acids of the chain's progress.
      for (let i = 0; i < o.N; i++) if (o.kind[i] === CU.G.CHAIN) assert.equal(o.beadN[i], Math.round((o.p[i] * gv.length_aa) / 20));
      // Everything sits inside the stage.
      for (let i = 0; i < o.N; i++) assert.ok(o.x[i] >= -1 && o.x[i] <= box.w + 1 && o.y[i] >= 0 && o.y[i] <= box.h, name + ' glyph ' + i + ' at ' + o.x[i] + ',' + o.y[i]);
    }
  }
  // Without the summary, all copies drawn: the glyphs over the drawn copies are the gene's ribosomes exactly.
  const [, c] = SC.find((s) => s[0] === 'ptsG ×1');
  const o = planFor(c, 'ptsG', { w: 360, h: 900, top: 52, bottom: 52 }, { maxCopies: 12 });
  if (o.moreCopies === 0) assert.equal(count(o, CU.G.RIB) * o.ribScale, Math.round(c.observe().geneById.ptsG.ribosomes));
});

test('ZC-2: a copy keeps its lane while it lives; the watched copy is always drawn; copies broken down are reported', () => {
  const c = new Cell({ seed: 8, start: 'steady', genes: { lacY: { level: 4 } } });
  c.advance(1800);
  const o = CU.createGenePlan();
  const f = c.observe().genes.findIndex((g) => g.id === 'lacY');
  const det = { ribosomeProgress: new Float64Array(16) };
  let last = null, gone = 0;
  const watched = c.observe().geneById.lacY.mRNAIds[0];
  for (let t = 0; t < 300; t++) {
    c.step();
    const v = c.observe(), gv = v.geneById.lacY;
    const alive = new Set(Array.from(gv.mRNAIds.slice(0, gv.mRNA)));
    const wid = alive.has(watched) ? watched : -1;
    CU.planGene(v, c.detail('lacY', det), BOX, { focus: f, maxCopies: 6, epoch: v.clock.generation, watchedId: wid }, o);
    if (wid >= 0) assert.ok(o.watchedLane >= 0 && o.laneId[o.watchedLane] === watched, 'the watched copy is drawn');
    if (last) {
      for (let l = 0; l < o.lanes; l++) {
        if (last[l] >= 0 && alive.has(last[l]) && last[l] !== watched) assert.equal(o.laneId[l], last[l], 'lane ' + l + ' kept its copy');
      }
    }
    for (let g = 0; g < o.nGone; g++) assert.ok(!alive.has(o.gone[g]));
    gone += o.nGone;
    last = Array.from(o.laneId);
  }
  assert.ok(gone > 0, 'copies were broken down and reported');
});

test('ZC-3: at most 600 glyphs; drawn copies give way first (6 → 4 → 2), then the ribosome glyph scale, then beads', () => {
  for (const [name, c, gene] of SC) {
    for (const box of [BOX, WIDE]) {
      const o = planFor(c, gene, box);
      assert.ok(o.total <= CU.MAX_GLYPHS, name + ': ' + o.total + ' glyphs');
      if (o.ribScale > 1) assert.equal(o.lanes, 2, name + ': the glyph scale grows only after the copies are down to 2');
      if (!o.beads) assert.equal(o.ribScale, 10, name + ': beads go last');
    }
  }
  // Every lab gene at ×4 in a fuzz of seeds stays under the cap.
  for (let seed = 1; seed <= 4; seed++) {
    const genes = {};
    for (const id of H.GENE_IDS) genes[id] = { level: 4 };
    const c = new Cell({ seed, start: 'steady', genes });
    c.advance(1200 + 300 * seed);
    for (const id of H.GENE_IDS) {
      const o = planFor(c, id, BOX);
      assert.ok(o.total <= CU.MAX_GLYPHS, id + ' seed ' + seed + ': ' + o.total);
      assert.equal(count(o, CU.G.RNAP), c.observe().geneById[id].nascent);
    }
  }
  // The legend follows the glyph scale.
  assert.equal(require('../src/app/btc-format.js').fill(CU.TEXT.gene.legend, { R: 5 }), '1 strand = 1 mRNA · 1 ribosome drawn = 5');
});

test('Gene plan: honest scale: 0.34 nm per letter; ribosomes 23 nm or the 6 px minimum; the scale bar a round length', () => {
  for (const [name, c, gene] of SC) {
    const o = planFor(c, gene);
    const gv = c.observe().geneById[gene];
    assert.ok(Math.abs(o.genePx - gv.unit_nt * 0.34 * o.pxPerNm) < 1e-6, name);
    assert.ok(o.genePx <= BOX.w - 31, name + ': the gene fits');
    assert.equal(o.ribPx, Math.max(6, 23 * o.pxPerNm));
    assert.equal(o.ribToScale, 23 * o.pxPerNm >= 6);
    assert.ok([20, 50, 100, 200, 500].indexOf(o.scaleNm) >= 0);
    assert.ok(Math.abs(o.scalePx - o.scaleNm * o.pxPerNm) < 1e-9);
    assert.ok(o.strandLen <= 0.6 * gv.unit_nt * o.pxPerNm + 1e-9, name + ': strands are drawn shorter, never longer');
  }
  // A gene with no copies: its DNA only (the view says "No copies of this gene right now.").
  const [, off] = SC.find((s) => s[0] === 'lacY off');
  const o = planFor(off, 'lacY');
  assert.equal(o.m + o.n, 0);
  assert.equal(count(o, CU.G.MRNA) + count(o, CU.G.RIB), 0);
});

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------
const BANNED = /\b(primitive|advanced|upgrade|evolved from)\b/i;
function strings(x, path, out) {
  if (typeof x === 'string') out.push([path, x]);
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) strings(x[k], path + '.' + k, out);
  return out;
}

test('C-1: every close-up string: at most 140 characters, no "!", no teleology, no ranking of cells', () => {
  const all = strings(CU.TEXT, 'TEXT', []).concat(strings(Zoom.TAP_TEXT, 'TAP_TEXT', []), strings(CU.Z_TEMPLATES, 'Z', []));
  assert.ok(all.length > 60);
  for (const [p, s] of all) {
    assert.ok(s.length <= 140, p + ' is ' + s.length + ' characters');
    assert.ok(s.indexOf('!') < 0, p);
    assert.ok(!N.TELEOLOGY.test(s), p + ': ' + s);
    assert.ok(!BANNED.test(s), p + ': ' + s);
  }
  // Idle reasons are read like narrator lines: no digits.
  for (const [p, s] of strings(CU.TEXT.idle, 'idle', [])) assert.ok(!/[0-9]/.test(s), p);
});

test('ZC-7: the z.* narrator rules pass the full template lint for every gene, named and hidden', () => {
  for (const showNames of [true, false]) {
    const mem = N.createMemory({ showNames });
    for (const key of Object.keys(CU.Z_TEMPLATES)) {
      for (const id of N.GENE_IDS) {
        const text = N.expand(CU.Z_TEMPLATES[key], mem, id);
        assert.deepEqual(N.lint(text), [], key + ' ' + id + ': ' + text);
      }
    }
  }
});

test('ZC-7: the z.* rules speak only when they are true, only in a close-up, and after lab rules 1–15', () => {
  let st = null;
  const rules = CU.zRules(() => st, N);
  const say = (c, zoom, gene) => {
    const v = c.observe();
    st = { zoom, gene, view: v, model: zoom === 'protein' ? CU.planProtein(v, gene, { speed: 60 }) : null };
    const mem = N.createMemory({ dt: c.dt });
    N.ingest(mem, c.takeEvents(), c.tick);
    return N.narrate(OBS.facts(c), mem, c.tick, rules).key;
  };
  // A gene switched off with no copies, then on (being copied), then a polysome, then off with copies left.
  const c = new Cell({ seed: 2, start: 'steady', genes: { lacY: { level: 'off', initial: { clear: true, protein: 0 } } } });
  c.advance(10);
  assert.equal(say(c, 'gene', 'lacY'), 'z.gene.off');
  assert.notEqual(say(c, 'cell', 'lacY').slice(0, 2), 'z.', 'nothing from the close-ups in Cell zoom');
  c.command({ type: 'setPromoter', gene: 'lacY', level: 4 });
  let k = '';
  for (let i = 0; i < 200 && k !== 'z.gene.tx'; i++) { c.step(); if (c.observe().geneById.lacY.nascent > 0 && c.observe().geneById.lacY.mRNA === 0) k = say(c, 'gene', 'lacY'); }
  assert.equal(k, 'z.gene.tx');
  c.advance(600);
  assert.equal(say(c, 'gene', 'lacY'), 'z.gene.polysome');
  c.command({ type: 'setPromoter', gene: 'lacY', level: 'off' });
  c.advance(2);
  assert.equal(say(c, 'gene', 'lacY'), 'z.gene.leftover');
  // Protein zoom: PtsG at work; LacY with no lactose outside (idle) and glucose outside (does not fit).
  assert.equal(say(c, 'protein', 'ptsG'), 'z.protein.work.transporter');
  assert.equal(say(c, 'protein', 'gly'), 'z.protein.work.enzyme');
  assert.equal(say(c, 'protein', 'lacY'), 'z.protein.nofit');
  // Amino-acid importers with no amino acids outside, in a cell living on lactose: idle (a starving cell's lab line would win).
  const d = new Cell({ seed: 2, start: 'steady', medium: { glucose_mM: 10, lactose_mM: 5 }, genes: { lacY: { level: 2 }, lacZ: { level: 2 } } });
  d.advance(1800);
  d.command({ type: 'setMedium', glucose_mM: 0 });
  d.advance(600);
  assert.equal(say(d, 'protein', 'aaImp'), 'z.protein.idle');
  // A lab rule of higher priority (a drug) keeps its place.
  const e = new Cell({ seed: 2, start: 'steady' });
  e.command({ type: 'setDrug', drug: 'chloramphenicol', dose: 1 });
  e.advance(5);
  assert.ok(!/^z\./.test(say(e, 'gene', 'ptsG')), 'the drug line wins');
});

test('Protein plan: rates, idle reasons and molecules that do not fit come from the view', () => {
  const c = new Cell({ seed: 4, start: 'steady', medium: { glucose_mM: 10, lactose_mM: 5 } });
  c.advance(60);
  const v = c.observe();
  const p = CU.planProtein(v, 'ptsG', { speed: 60 });
  assert.equal(p.r, v.geneById.ptsG.workPerCopy_perS);
  assert.ok(p.working && p.r > 20 && p.r < 80, 'PtsG carries tens of glucose a second: ' + p.r);
  assert.equal(p.k, CU.slowFactor(p.r));
  assert.ok(p.nonfitPresent, 'lactose outside bounces off PtsG');
  assert.equal(p.count, v.geneById.ptsG.proteinRounded);
  const z = CU.planProtein(v, 'lacZ', {});
  assert.equal(z.count, Math.round(v.geneById.lacZ.protein / 4), 'one of so many four-chain enzymes');
  const f = CU.planProtein(v, 'fliC', {});
  assert.equal(f.working, false);
  assert.equal(f.idle, 'fliC');
  const y = CU.planProtein(v, 'lacY', {});
  assert.ok(y.none || y.idle === 'nothing' || y.working, 'LacY: ' + y.idle);
  const g = new Cell({ seed: 4, start: 'steady', medium: { glucose_mM: 0 } });
  g.advance(30);
  assert.equal(CU.planProtein(g.observe(), 'ptsG', {}).idle, 'noGlucose');
  assert.equal(CU.planProtein(g.observe(), 'aaImp', {}).idle, 'noAminoAcids');
});
