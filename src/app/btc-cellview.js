// @deps btc-dots btc-cellgeom btc-palette btc-content btc-format btc-layout
/*
 * Be the Cell: the cell view (LAB_UI §2). One canvas, drawn only from the
 * cell's state, plus HTML overlays for text (badges, scale bar, legend, the
 * tap chip).
 *
 * Every count drawn is BTC.dots.count(n, N), and N is always in the legend.
 * Dot positions come from hashes of (species, index, generation), never from
 * a random stream, so dot k stays put while counts change and the layout
 * reshuffles once per division. mRNA is keyed by molecule id, so the molecule
 * that decays is the dot that disappears. The only motion is a small jitter
 * around each fixed position, in render time, which stops while paused.
 *
 * Hot path: a frame reads cell.observe() (no allocation), rebuilds the glyph
 * buffer only when the tick, generation, focus gene or stage changed, then
 * draws batched by (shape, colour): one path and one fill or stroke per group.
 * Nothing is allocated per frame.
 *
 * The gene list comes from the cell (7 genes in the lab strain, 8 in m2-l11, 9 in m2-lac,
 * LEVELS R-E19) and the screen's gene model (app.geneModel, BTC.content.geneModel): loci,
 * colours and names follow its display order, so a hidden-name level (1.1) draws each gene
 * where and in the colour its display position says. A transcription unit with several
 * genes (m2-lac's lacZ lacY lacA) is one mRNA: it is drawn once, as one strand in three
 * segments coloured by gene and sized by gene length. With the lac regulation module the
 * repressor LacI is drawn as tetramers (1 dot = 1, a V; a dot inside when allolactose is
 * bound), sitting on the operator at the lac locus while it is bound, and an enlarged "lac
 * region" panel shows the design's parts and what sits on them.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/btc-dots.js'), require('./btc-cellgeom.js'), require('./btc-palette.js'),
      require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.CellView = factory(B.dots, B.cellgeom, B.palette, B.content, B.format, B.layout);
  }
})(typeof self !== 'undefined' ? self : this, function (D, G, PAL, C, F, LY) {
  'use strict';

  const MAXG = 16;                       // genes a strain may have (engine maxGenes)
  const MAX_GLYPHS = 1500;               // hard cap per frame (LAB_UI §2.3)
  const CAP = 2048;                      // buffer capacity (cap plus loci and headroom)
  const N_mM = 602214.076;               // molecules per (mM · fL)
  const STIPPLE = 160;                   // background-proteome specks (constant, not counted)
  const JITTER_PX = 1.2;
  const MARKER_LIFE_S = 0.6;             // flux marker lifetime, render time
  const MARKERS = 128;                   // per flux
  const NF = 6;                          // fluxes: glucose in, lactose in, amino acids in, products out, protein cut up, glucose by the side route
  const CUT = 4;                         // the "cut up" marker (degradation, LEVELS §7.4.2)
  const SIDE = 5;                        // glucose through the slow side route (level 1.1's backup uptake)
  // The side route's two places on the membrane (perimeter fractions): drawn as a glyph of its own, so glucose
  // never appears to cross bare membrane (M2 biology review).
  const SIDE_AT = [0.19, 0.69];
  const GHOST_S = 180;                   // sister ghost fades over 3 sim-min

  // Glyph kinds.
  const K = {
    GLC_OUT: 1, LAC_OUT: 2, AA_OUT: 3, NASCENT: 4, MRNA_FOCUS: 5, MRNA: 6, RIB: 7, RIB_FREE: 8, RIB_STALLED: 9,
    POLY: 10, PROT: 11, ATP: 12, ADP: 13, AA: 14, LAC_IN: 15, LOCUS: 16, RNAP: 17,
    OPER: 18, REP_BOUND: 19, INDUCER: 20,        // the lac operator, LacI sitting on it, allolactose on free LacI (m2-lac)
    SIDE: 21,                                    // the slow side route for glucose (m2-l11 backup uptake), in the membrane
  };

  // ---------------------------------------------------------------------------
  // The plan: how many glyphs of each species, at what scale (pure; test U-6)
  // ---------------------------------------------------------------------------
  function createPlan() {
    return {
      P: 0, polyN: 1, ribN: 100, atpN: 1e5, aaN: 1e5, lacN: 1e5, glcOutN: 1e6, lacOutN: 1e6, aaOutN: 1e6,
      focus: 0, protein: new Int32Array(MAXG), hollow: new Uint8Array(MAXG), mRNA: new Int32Array(MAXG), nascent: new Int32Array(MAXG),
      genes: 0,
      strandLen: 0, strandBase: 0,
      glcOut: 0, lacOut: 0, aaOut: 0, glcOutHollow: 0, lacOutHollow: 0, aaOutHollow: 0,
      ribFilled: 0, ribFree: 0, ribStalled: 0, poly: 0, atp: 0, adp: 0, aa: 0, lacIn: 0, loci: 0,
      total: 0, interiorArea: 0, focusStrandArea: 0,
    };
  }

  /** Interior area of the drawn rod, px². */
  function interiorArea(g) { return Math.PI * g.r * g.r + 2 * g.straight * 2 * g.r; }

  /** Volume of medium drawn around the cell: visible outside area × 1 µm depth, in fL (µm³). */
  function outsideVolume(g) {
    return Math.max(0, g.w * g.h - interiorArea(g)) / (g.pxPerUm * g.pxPerUm);
  }

  // Hollow dot: 0 < n < N/2 gets one hollow glyph, so something present never looks absent.
  const glyphs = (n, N) => D.count(n, N);
  const hollow = (n, N) => (n > 0 && D.count(n, N) === 0 ? 1 : 0);

  function tally(p) {
    let t = p.glcOut + p.lacOut + p.aaOut + p.glcOutHollow + p.lacOutHollow + p.aaOutHollow +
      p.ribFilled + p.ribFree + p.ribStalled + p.poly + p.atp + p.adp + p.aa + p.lacIn + p.loci;
    for (let i = 0; i < p.genes; i++) t += p.protein[i] + p.hollow[i] + p.mRNA[i] + 2 * p.nascent[i];
    p.total = t;
    return t;
  }

  /**
   * Fills p (from createPlan; its previous scales give the hysteresis) for this
   * view, geometry and focus gene. opts: {focus, strandNt: per-gene mRNA length (nt),
   * follower?: Uint8Array (1 for a gene whose mRNA its unit's first gene draws), lacI?: the
   * repressor's index (drawn as free tetramers, 1 dot = 1, when view.lac exists)}.
   */
  function plan(view, g, opts, p) {
    const genes = view.genes, f = opts.focus, NGv = Math.min(MAXG, genes.length);
    const follower = opts.follower || null, lacI = view.lac && opts.lacI >= 0 ? opts.lacI : -1;
    p.focus = f;
    p.genes = NGv;
    // One shared protein scale, so dot counts compare honestly across genes. Proteins are counted in working
    // machines, as every count the student sees: a four-chain LacZ is one glyph (LacI is counted in tetramers).
    const machines = (gi) => (gi.oligomer > 1 ? gi.protein / gi.oligomer : gi.protein);
    let maxProt = 0;
    for (let i = 0; i < NGv; i++) if (i !== lacI && machines(genes[i]) > maxProt) maxProt = machines(genes[i]);
    p.P = D.scaleFor(maxProt, 120, p.P || 0);
    p.polyN = D.polysomeScale(genes[f].ribosomes, p.polyN || 1);
    p.ribN = 100; p.atpN = 1e5; p.aaN = 1e5; p.lacN = 1e5;
    p.glcOutN = 1e6; p.lacOutN = 1e6; p.aaOutN = 1e6;

    const vol = outsideVolume(g);
    const nGlc = view.env.glucose_mM * N_mM * vol, nLac = view.env.lactose_mM * N_mM * vol, nAa = view.env.aminoAcids_mM * N_mM * vol;
    const rib = view.ribosomes;
    const focusRib = genes[f].ribosomes;
    const poolElong = Math.max(0, rib.elongating - focusRib);
    const stalledShare = rib.elongating > 0 ? rib.stalled / rib.elongating : 0;

    const count = () => {
      p.glcOut = glyphs(nGlc, p.glcOutN); p.glcOutHollow = hollow(nGlc, p.glcOutN);
      p.lacOut = glyphs(nLac, p.lacOutN); p.lacOutHollow = hollow(nLac, p.lacOutN);
      p.aaOut = glyphs(nAa, p.aaOutN); p.aaOutHollow = hollow(nAa, p.aaOutN);
      p.ribStalled = glyphs(poolElong * stalledShare, p.ribN);
      p.ribFilled = Math.max(0, glyphs(poolElong, p.ribN) - p.ribStalled);
      p.ribFree = glyphs(rib.free, p.ribN);
      p.poly = glyphs(focusRib, p.polyN);
      p.atp = glyphs(view.energy.ATP, p.atpN);
      p.adp = glyphs(view.energy.ADP, p.atpN);
      p.aa = glyphs(view.aminoAcids.count, p.aaN);
      p.lacIn = glyphs(view.lactose.inside, p.lacN);
      p.loci = NGv * (view.cell.dosage >= 2 ? 2 : 1);
      for (let i = 0; i < NGv; i++) {
        const gi = genes[i];
        if (i === lacI) {
          // The repressor: every tetramer not sitting on an operator, one glyph each.
          p.protein[i] = Math.min(400, view.lac.lacIFree); p.hollow[i] = 0;
        } else {
          // One glyph stands for P machines (LacZ: P four-chain enzymes).
          p.protein[i] = glyphs(machines(gi), p.P);
          p.hollow[i] = p.protein[i] === 0 && Math.round(machines(gi)) > 0 ? 1 : 0;
        }
        // A unit's mRNA is one molecule list: its first gene draws it, once.
        const fol = follower && follower[i];
        p.mRNA[i] = fol ? 0 : gi.mRNA;
        p.nascent[i] = fol ? 0 : gi.nascent;
      }
      return tally(p);
    };
    count();
    // Over the cap: the species with the most glyphs (never mRNA or the focus polysome) steps up the ladder.
    for (let guard = 0; p.total > MAX_GLYPHS && guard < 24; guard++) {
      let protTotal = 0;
      for (let i = 0; i < NGv; i++) if (i !== lacI) protTotal += p.protein[i];
      const cands = [
        ['P', protTotal], ['ribN', p.ribFilled + p.ribFree + p.ribStalled], ['atpN', p.atp + p.adp], ['aaN', p.aa],
        ['lacN', p.lacIn], ['glcOutN', p.glcOut], ['lacOutN', p.lacOut], ['aaOutN', p.aaOut],
      ];
      let best = null, most = 0;
      for (let c = 0; c < cands.length; c++) if (cands[c][1] > most) { most = cands[c][1]; best = cands[c][0]; }
      if (!best) break;
      p[best] *= 10;
      count();
    }
    // Focus strands: length ∝ mRNA length, clamped 12–48 px, then scaled down uniformly (floor 8 px)
    // so that all of them together cover at most 40% of the interior (2 px stroke).
    const area = interiorArea(g);
    p.interiorArea = area;
    const base = Math.max(12, Math.min(48, opts.strandNt[f] / 40));
    const m = genes[f].mRNA;     // a unit's genes share one mRNA count
    const fit = m > 0 ? (0.4 * area) / (2 * m) : base;
    p.strandBase = base;
    p.strandLen = Math.max(8, Math.min(base, fit));
    p.focusStrandArea = 2 * m * p.strandLen;
    return p;
  }

  // ---------------------------------------------------------------------------
  // Glyph shapes: each appends subpaths to the current path (no Path2D objects)
  // ---------------------------------------------------------------------------
  function hex(c, x, y, r) {
    c.moveTo(x + r, y);
    for (let k = 1; k < 6; k++) c.lineTo(x + r * HEX_C[k], y + r * HEX_S[k]);
    c.closePath();
  }
  const HEX_C = [1, 0.5, -0.5, -1, -0.5, 0.5], HEX_S = [0, 0.866, 0.866, 0, -0.866, -0.866];
  function hex2(c, x, y, r) {
    hex(c, x - r * 0.95, y, r); hex(c, x + r * 0.95, y, r);
  }
  function tri(c, x, y, r) {
    c.moveTo(x, y - r); c.lineTo(x + r * 0.87, y + r * 0.5); c.lineTo(x - r * 0.87, y + r * 0.5); c.closePath();
  }
  function diamond(c, x, y, r) {
    c.moveTo(x, y - r); c.lineTo(x + r * 0.75, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.75, y); c.closePath();
  }
  function circle(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.283185307179586); }
  // Ribosome: the small subunit below (on the mRNA), the large one above, as in the close-ups and the opening.
  function ribo(c, x, y, s) {
    circle(c, x, y + s * 0.14, s * 0.32);
    circle(c, x, y - s * 0.3, s * 0.5);
  }
  // LacZ tetramer: four lobes.
  function tetra(c, x, y, s) {
    const d = s * 0.25, r = s * 0.27;
    circle(c, x - d, y - d, r); circle(c, x + d, y - d, r); circle(c, x - d, y + d, r); circle(c, x + d, y + d, r);
  }
  // LacI tetramer (a dimer of dimers): a V of two rounded arms, open towards angle a.
  function vee(c, x, y, a, s) {
    const h = s * 0.5, w = s * 0.18;
    for (const side of [-1, 1]) {
      const b = a + Math.PI + side * 0.5;
      const cx = x + Math.cos(b) * h * 0.55, cy = y + Math.sin(b) * h * 0.55;
      rect(c, cx, cy, b, h * 1.1, w * 2);
    }
  }
  // LacA trimer: three lobes.
  function trimer(c, x, y, s) {
    const d = s * 0.26, r = s * 0.26;
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3; circle(c, x + Math.cos(a) * d, y + Math.sin(a) * d, r); }
  }
  // A rectangle of length l along angle a and width w.
  function rect(c, x, y, a, l, w) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const lx = ca * l / 2, ly = sa * l / 2, wx = -sa * w / 2, wy = ca * w / 2;
    c.moveTo(x + lx + wx, y + ly + wy); c.lineTo(x + lx - wx, y + ly - wy);
    c.lineTo(x - lx - wx, y - ly - wy); c.lineTo(x - lx + wx, y - ly + wy); c.closePath();
  }
  // A "cut up" protein: its membrane rectangle in two pieces that come apart as the marker fades (f 0 → 1).
  function broken(c, x, y, a, l, w, f) {
    const ca = Math.cos(a), sa = Math.sin(a), gap = 1 + 3 * f, half = (l - 1) / 2;
    const d = (gap + half) / 2;
    rect(c, x - ca * d, y - sa * d, a, half, w);
    rect(c, x + ca * d, y + sa * d, a, half, w);
  }
  function mark(c, x, y, a, l) {
    const dx = Math.cos(a) * l / 2, dy = Math.sin(a) * l / 2;
    c.moveTo(x - dx, y - dy); c.lineTo(x + dx, y + dy);
  }
  // A wavy strand (coiled mRNA, not to scale): along angle a, length l.
  const WAVE_AMP = 2.2, WAVE_LEN = 7;
  function wavePoint(x, y, a, l, t, out) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const d = (t - 0.5) * l, off = WAVE_AMP * Math.sin((d * 6.283185307179586) / WAVE_LEN);
    out.x = x + ca * d - sa * off; out.y = y + sa * d + ca * off;
    return out;
  }
  const WP = { x: 0, y: 0 };
  /** A wavy strand, or its part from fraction s0 to s1 (a gene's segment of a unit's mRNA). */
  function wavy(c, x, y, a, l, s0, s1) {
    const t0 = s0 === undefined ? 0 : s0, t1 = s1 === undefined ? 1 : s1;
    const n = Math.max(2, Math.round((l * (t1 - t0)) / 2));
    wavePoint(x, y, a, l, t0, WP); c.moveTo(WP.x, WP.y);
    for (let k = 1; k <= n; k++) { wavePoint(x, y, a, l, t0 + ((t1 - t0) * k) / n, WP); c.lineTo(WP.x, WP.y); }
  }

  // Glyph sizes (CSS px), from LAB_UI §2.3.
  const SZ = {
    glcOut: 3.6, lacOut: 2.6, aaOut: 3.2, rib: 5, poly: 4, prot: 2.5, tetra: 7, atp: 3.4, aa: 2.4, lacIn: 2.2, rnap: 2.5, vee: 8, trimer: 6,
  };
  // The watched gene is drawn on top at full strength; the crowd around it is dimmed (LAB_UI §2.7).
  // Only alpha changes: counts, positions and hit-testing are the same.
  const CROWD_ALPHA = 0.45, POLY_ALPHA = 0.6;

  // ---------------------------------------------------------------------------
  // The view
  // ---------------------------------------------------------------------------
  class CellView {
    constructor(app) {
      this.app = app;
      this.plan = createPlan();
      this.geom = null;
      this.dpr = 1;
      this.cssW = 0; this.cssH = 0;
      // Glyph buffer: stage positions (unjittered), kind, gene, source id, angle, length, jitter phase/frequency,
      // and the part of a strand a glyph draws (a gene's segment of its unit's mRNA: fractions s0–s1).
      this.bx = new Float32Array(CAP); this.by = new Float32Array(CAP);
      this.bkind = new Uint8Array(CAP); this.bgene = new Uint8Array(CAP);
      this.bsrc = new Int32Array(CAP); this.bang = new Float32Array(CAP); this.blen = new Float32Array(CAP);
      this.bph = new Float32Array(CAP); this.bom = new Float32Array(CAP);
      this.bs0 = new Float32Array(CAP); this.bs1 = new Float32Array(CAP).fill(1);
      this.n = 0;
      // Groups: contiguous ranges drawn with one fill or stroke. style: 0 fill, 1 stroke, 2 fill + ink outline, 3 fill + stalled bar.
      this.gStart = new Uint16Array(160); this.gEnd = new Uint16Array(160); this.gKind = new Uint8Array(160);
      this.gStyle = new Uint8Array(160); this.gColor = new Array(160).fill('ink'); this.gHollow = new Uint8Array(160);
      this.ng = 0;
      this.geneRange = new Int32Array(MAXG * 2);        // [start, end) of each gene's protein glyphs
      this.stip = new Float32Array(STIPPLE * 2);
      this.dnaCtl = [new Float64Array(32), new Float64Array(32)];
      this.dnaPts = new Float32Array(2 * 2 * 65);       // two lobes × 65 sampled points
      this.nucPts = new Float32Array(2 * 2 * 25);       // two lobes × 25 outline points
      this.lobeCount = 1;
      this.locusX = new Float32Array(MAXG * 2); this.locusY = new Float32Array(MAXG * 2); this.locusA = new Float32Array(MAXG * 2);
      this.operX = new Float32Array(2); this.operY = new Float32Array(2); this.operA = new Float32Array(2);
      this.hit = new G.HitGrid(CAP);
      this.hitDirty = true;
      this.built = { tick: -1, epoch: -1, focus: -1, w: 0, h: 0, dosage: 0, model: null };
      // The cell's genes (set up when the cell changes): ids, units, segment fractions, mRNA lengths.
      this.cellRef = null;
      this.ids = [];
      this.nGenes = 0;
      this.idx = {};
      this.strandNt = new Float64Array(MAXG);
      this.follower = new Uint8Array(MAXG);
      this.leaderOf = new Int8Array(MAXG);
      this.seg0 = new Float32Array(MAXG); this.seg1 = new Float32Array(MAXG).fill(1);
      this.members = [];                                // per unit leader: the unit's gene indices in order
      this.pkey = [];
      this.lacI = -1; this.lacLeader = -1;
      this.fluxGene = [-1, -1, -1, -1];
      this.strands = new Int32Array(CAP); this.strandProg = new Float32Array(CAP); this.nStrands = 0; this.strandFrom = 0;
      // Flux markers: 5 fluxes × 128, fixed straight paths, age in render seconds (< 0 unused).
      this.mAge = new Float32Array(NF * MARKERS).fill(-1);
      this.mX0 = new Float32Array(NF * MARKERS); this.mY0 = new Float32Array(NF * MARKERS);
      this.mX1 = new Float32Array(NF * MARKERS); this.mY1 = new Float32Array(NF * MARKERS);
      this.mA = new Float32Array(NF * MARKERS);         // the angle a "cut up" marker is drawn at
      this.mNext = new Int32Array(NF);
      this.emitters = [new D.FluxEmitter(1e3), new D.FluxEmitter(1e3), new D.FluxEmitter(1e3), new D.FluxEmitter(1e3), new D.FluxEmitter(1), new D.FluxEmitter(1e3)];
      this.emitCount = new Int32Array(NF);
      this.markerN = new Float64Array(NF).fill(1e3);
      this.markerN[CUT] = 1;
      this.cutGene = -1;                                // the gene whose protein is being cut up (lacY in level 1.4)
      this.sideX = new Float32Array(2); this.sideY = new Float32Array(2); this.sideA = new Float32Array(2);
      this.sideN = 0;                                   // side-route glyphs drawn (0 when the cell has no side route)
      this.tau = 0;                                     // render time: advances only while running
      this.visible = true;
      this.dirty = true;
      this.drawEma = 0;
      this.sinceDraw = 1;
      this.insideCache = { key: -1, color: '' };
      this.tmp = { x: 0, y: 0, nx: 0, ny: 0 };
      this.tmp2 = { x: 0, y: 0 };
      this.uv = { u: 0, v: 0 };
      this.lastLabelKey = '';
      this.legendScales = new Float64Array(4);
      this.lacKey = '';
    }

    // --- mount -----------------------------------------------------------------
    mount(els) {
      this.els = els;
      this.canvas = els.canvas;
      this.ctx = this.canvas.getContext('2d');
      if (typeof ResizeObserver === 'function') {
        this.ro = new ResizeObserver(() => this.resize());
        this.ro.observe(els.stage);
      }
      this.resize();
      this.canvas.addEventListener('click', (e) => this.onTap(e));
      this.mountFocusBar(els.focus);
      els.legend.addEventListener('click', () => this.openKey());
    }

    /**
     * The cell's genes, once per cell: ids in slot order, each gene's transcription unit (a
     * unit's first gene draws its mRNA; the others are followers), each gene's share of the
     * unit's mRNA (by gene length), and the mRNA length the focus strands are sized from.
     */
    setupGenes(view) {
      const app = this.app;
      this.cellRef = app.cell;
      const strain = (app.cell.config && app.cell.config.strain) || 'm1-lab';
      const cat = app.BTC.catalog.STRAINS[strain] || app.BTC.catalog.STRAINS['m1-lab'];
      const len = {};
      for (const g of cat.genes) len[g.id] = g.length;
      this.ids = view.genes.map((g) => g.id);
      this.nGenes = Math.min(MAXG, this.ids.length);
      this.idx = {};
      this.ids.forEach((id, i) => { this.idx[id] = i; });
      this.pkey = this.ids.map((id) => 'p:' + id);
      this.members = [];
      this.follower.fill(0);
      for (let i = 0; i < this.nGenes; i++) { this.leaderOf[i] = i; this.seg0[i] = 0; this.seg1[i] = 1; this.strandNt[i] = 3 * (len[this.ids[i]] || 400) + 60; this.members[i] = [i]; }
      for (const tu of view.tus || []) {
        if (!tu.cistrons || tu.cistrons.length < 2) continue;
        const mem = tu.cistrons.map((id) => this.idx[id]).filter((i) => i >= 0);
        const total = tu.cistrons.reduce((s, id) => s + 3 * (len[id] || 0), 0) + 60;
        const lead = this.idx[tu.leader];
        let off = 0;
        for (const i of mem) {
          this.leaderOf[i] = lead;
          this.seg0[i] = off / total; off += 3 * (len[this.ids[i]] || 0); this.seg1[i] = off / total;
          this.strandNt[i] = total;
          if (i !== lead) { this.follower[i] = 1; this.members[i] = []; }
        }
        this.members[lead] = mem;
      }
      this.lacI = this.idx.lacI === undefined ? -1 : this.idx.lacI;
      this.lacLeader = view.lac && this.idx.lacZ !== undefined ? this.leaderOf[this.idx.lacZ] : -1;
      const at = (id) => (this.idx[id] === undefined ? -1 : this.idx[id]);
      this.fluxGene = [at('ptsG'), at('lacY'), at('aaImp'), -1];   // glucose through PtsG, lactose through LacY, amino acids through the importers
      this.plan = createPlan();
    }

    resize() {
      const r = this.els.stage.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
      const top = this.insetReserve();
      if (w === this.cssW && h === this.cssH && dpr === this.dpr && top === this.topReserve) return;
      this.cssW = w; this.cssH = h; this.dpr = dpr; this.topReserve = top;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The lac region panel covers the top of the stage: the rod is fitted and centred below it.
      const g = G.create(w, Math.max(1, h - top), this.geom ? this.geom.vertical : undefined);
      if (top) { g.h = h; g.cy = top + (h - top) / 2; g.fitAlong = g.vertical ? h - top : w; }
      this.geom = g;
      this.built.w = -1;
      this.dirty = true;
      this.updateScaleBar();
      this.app.requestPaint();
    }

    /** Stage px taken at the top by the lac region panel while it shows (0 otherwise). */
    insetReserve() {
      const el = this.els.lacInset;
      if (!el || el.hidden) return 0;
      return Math.ceil(el.offsetTop + el.offsetHeight + 4);
    }

    reset() {
      this.plan = createPlan();
      this.built.tick = -1;
      this.cellRef = null;
      this.lacKey = '';
      this.mAge.fill(-1);
      for (const e of this.emitters) e.reset();
      this.dirty = true;
    }

    setVisible(v) {
      this.visible = v;
      if (!v) return;
      this.dirty = true; this.resize();
      // Shown in the middle of a relayout (panels being remounted), the stage may not have its final size yet,
      // and the observer reports no change once it has: measure again next frame.
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this.resize());
    }

    /** The screen's gene model (the app's; a stand-in that shows everything by name when there is none). */
    model() {
      const m = this.app.geneModel;
      if (m && m.ids.length === this.ids.length) return m;
      if (!this.fallback || this.fallback.ids.length !== this.ids.length) this.fallback = C.geneModel(this.ids, {});
      return this.fallback;
    }
    /**
     * Genes outside labConfig.genesVisible keep running but are drawn in --muted, so colours stay
     * reserved for the genes a level is about (LEVELS §5.5.1); the key says so.
     */
    updateBackground() {
      const m = this.model();
      this.background = this.ids.map((id) => !m.isVisible(id));
    }
    geneColor(i) { return this.model().color(this.ids[i]); }
    isBackground(id) { return !this.model().isVisible(id); }
    shapeOf(i) { return PAL.shape[this.ids[i]] || 'circle'; }
    words(id) { return this.model().words(id); }

    // --- geometry from the view --------------------------------------------------
    fitGeom(view) {
      const c = view.cell;
      // Septum pinch drawn from size: progress p = (V − Vbirth)/1 fL, pinch from p = 0.8 on.
      const prog = c.V_fL - c.Vbirth_fL;
      const pinch = Math.max(0, (prog - 0.8) / 0.2) * 0.45;
      if (G.fit(this.geom, c.length_um, c.width_um, pinch)) this.updateScaleBar();
    }

    // --- rebuild the glyph buffer (only when something changed) --------------------
    rebuild(view) {
      const g = this.geom, p = this.plan, app = this.app;
      if (this.cellRef !== app.cell || this.ids.length !== view.genes.length) this.setupGenes(view);
      const f = app.focusIndex(), fo = this.leaderOf[f];
      const epoch = view.clock.generation;
      plan(view, g, { focus: f, strandNt: this.strandNt, follower: this.follower, lacI: this.lacI }, p);
      this.n = 0; this.ng = 0;
      this.updateBackground();
      const genes = view.genes, NGv = this.nGenes;

      // Outside molecules: uniform over the stage, rejected (deterministic retry) where the rod is.
      this.group(K.GLC_OUT, 'sugar', 1, 0); this.outside('glc', p.glcOut + p.glcOutHollow, epoch, K.GLC_OUT); this.endGroup();
      this.group(K.LAC_OUT, 'sugar', 1, 0); this.outside('lac', p.lacOut + p.lacOutHollow, epoch, K.LAC_OUT); this.endGroup();
      this.group(K.AA_OUT, 'aa', p.aaOutHollow ? 1 : 0, p.aaOutHollow); this.outside('aao', p.aaOut + p.aaOutHollow, epoch, K.AA_OUT); this.endGroup();

      // Stipple (the rest of the proteome) and nucleoid/DNA: per epoch and dosage, mapped with the current size.
      for (let k = 0; k < STIPPLE; k++) {
        D.pos('bg', k, epoch, null, this.tmp2);
        G.map(this.tmp2.x, 2 * this.tmp2.y - 1, g, this.tmp);
        this.stip[2 * k] = this.tmp.x; this.stip[2 * k + 1] = this.tmp.y;
      }
      this.buildNucleoid(view, epoch);

      // Loci (hit targets; drawn as gene-coloured ticks on the DNA, in the screen's display order).
      for (let i = 0; i < NGv; i++) {
        this.group(K.LOCUS, this.geneColor(i), 1, 0);
        for (let l = 0; l < this.lobeCount; l++) {
          const j = l * MAXG + i;
          this.push(K.LOCUS, i, j, this.locusX[j], this.locusY[j], this.locusA[j], 0, 0);
        }
        this.endGroup();
      }
      // The lac operator on each copy of the chromosome, with LacI sitting on it while bound (m2-lac).
      const lac = view.lac;
      if (lac && this.lacLeader >= 0 && lac.design && lac.design.lac.operator) {
        this.group(K.OPER, 'ink', 1, 0);
        for (let l = 0; l < this.lobeCount; l++) this.push(K.OPER, this.lacLeader, l, this.operX[l], this.operY[l], this.operA[l], 0, 0);
        this.endGroup();
        if (this.lacI >= 0 && lac.operatorBound > 0) {
          this.group(K.REP_BOUND, this.geneColor(this.lacI), 0, 0);
          for (let l = 0; l < Math.min(this.lobeCount, lac.operatorBound); l++) {
            const a = this.operA[l] - Math.PI / 2;
            this.push(K.REP_BOUND, this.lacI, l, this.operX[l] + Math.cos(a) * 5, this.operY[l] + Math.sin(a) * 5, a, 0, 0);
          }
          this.endGroup();
        }
      }

      // Transcripts in progress, then mature mRNA (focus gene as long strands, others as short marks). A unit's
      // transcripts and mRNA are drawn once, by its first gene, as one strand in its genes' colours.
      this.nStrands = 0;
      for (let i = 0; i < NGv; i++) {
        if (this.follower[i] || !genes[i].nascent) continue;
        for (const c of this.members[i]) {
          this.group(K.NASCENT, this.geneColor(c), 1, 0);
          this.nascent(genes[i], i, c, i === fo);
          this.endGroup();
        }
      }
      this.strandFrom = this.nStrands;                    // focus strands: nascent ones first, then mature
      for (let i = 0; i < NGv; i++) {
        const gi = genes[i];
        if (this.follower[i] || !gi.mRNA) continue;
        const isF = i === fo;
        const mem = this.members[i];
        for (let k = 0; k < mem.length; k++) {
          const c = mem[k];
          this.group(isF ? K.MRNA_FOCUS : K.MRNA, this.geneColor(c), 1, 0);
          for (let j = 0; j < gi.mRNA; j++) {
            const id = gi.mRNAIds[j];
            D.pos('m', id, epoch, null, this.tmp2);
            G.map(this.tmp2.x, 2 * this.tmp2.y - 1, g, this.tmp);
            const a = D.hash01('ma', id, epoch) * Math.PI * 2;
            const len = isF ? p.strandLen : (6 + 2 * D.hash01('ml', id, epoch)) * (mem.length > 1 ? 1.6 : 1);
            const bi = this.push(isF ? K.MRNA_FOCUS : K.MRNA, c, id, this.tmp.x, this.tmp.y, a, len, D.hash01('mj', id, epoch));
            if (bi >= 0) { this.bs0[bi] = this.seg0[c]; this.bs1[bi] = this.seg1[c]; }
            if (isF && k === 0 && bi >= 0) { this.strandProg[this.nStrands] = 1; this.strands[this.nStrands++] = bi; }
          }
          this.endGroup();
        }
      }

      // Pooled ribosomes: making protein (filled), free (hollow), stalled (filled with a bar).
      this.group(K.RIB, 'ribosome', 0, 0); this.inside('rib', p.ribFilled, epoch, K.RIB, 255); this.endGroup();
      this.group(K.RIB_FREE, 'ribosome', 1, 0); this.inside('ribf', p.ribFree, epoch, K.RIB_FREE, 255); this.endGroup();
      this.group(K.RIB_STALLED, 'ribosome', 3, 0); this.inside('ribs', p.ribStalled, epoch, K.RIB_STALLED, 255); this.endGroup();

      // Focus polysome: the focus gene's ribosomes spread along its part of the watched strands.
      this.group(K.POLY, 'ribosome', 0, 0); this.polysome(genes[f], f, epoch); this.endGroup();

      // Proteins (cytoplasmic); membrane proteins are drawn with the membrane.
      for (let i = 0; i < NGv; i++) {
        if (this.shapeOf(i) === 'membrane') continue;
        const n = p.protein[i] + p.hollow[i];
        this.geneRange[2 * i] = this.n;
        if (n > 0) {
          this.group(K.PROT, this.geneColor(i), p.hollow[i] ? 1 : 0, p.hollow[i]);
          this.inside(this.pkey[i], n, epoch, K.PROT, i);
          this.endGroup();
        }
        this.geneRange[2 * i + 1] = this.n;
      }
      // Free LacI holding allolactose: a dot inside the V (the share of tetramers with inducer bound).
      if (lac && this.lacI >= 0 && p.protein[this.lacI] > 0) {
        const share = lac.lacITetramers > 0 ? Math.max(0, Math.min(1, 1 - lac.activeLacI / lac.lacITetramers)) : 0;
        const nInd = Math.round(share * p.protein[this.lacI]);
        const r0 = this.geneRange[2 * this.lacI];
        if (nInd > 0) {
          this.group(K.INDUCER, 'sugar', 0, 0);
          for (let k = 0; k < nInd; k++) this.push(K.INDUCER, this.lacI, k, this.bx[r0 + k], this.by[r0 + k], this.bang[r0 + k], 0, this.bph[r0 + k] / 6.283185307179586);
          this.endGroup();
        }
      }

      this.group(K.ATP, 'atp', 2, 0); this.inside('atp', p.atp, epoch, K.ATP, 255); this.endGroup();
      this.group(K.ADP, 'atp', 1, 0); this.inside('adp', p.adp, epoch, K.ADP, 255); this.endGroup();
      this.group(K.AA, 'aa', 0, 0); this.inside('aa', p.aa, epoch, K.AA, 255); this.endGroup();
      this.group(K.LAC_IN, 'sugar', 1, 0); this.inside('lin', p.lacIn, epoch, K.LAC_IN, 255); this.endGroup();

      // Membrane proteins: around the perimeter, oriented along the normal.
      for (let i = 0; i < NGv; i++) {
        if (this.shapeOf(i) !== 'membrane') continue;
        const n = p.protein[i] + p.hollow[i];
        this.geneRange[2 * i] = this.n;
        if (n > 0) {
          this.group(K.PROT, this.geneColor(i), p.hollow[i] ? 1 : 0, p.hollow[i]);
          for (let k = 0; k < n; k++) {
            G.perimeter(D.hash01(this.pkey[i], k, epoch), g, this.tmp);
            this.push(K.PROT, i, k, this.tmp.x, this.tmp.y, Math.atan2(this.tmp.ny, this.tmp.nx), 0, D.hash01('j', k, epoch));
          }
          this.endGroup();
        }
        this.geneRange[2 * i + 1] = this.n;
      }

      // The slow side route (level 1.1): two fixed places in the membrane, drawn apart from every gene's protein.
      this.sideN = 0;
      if (this.sideCapacity(view) > 0) {
        this.group(K.SIDE, 'muted', 1, 0);
        for (let k = 0; k < SIDE_AT.length; k++) {
          G.perimeter(SIDE_AT[k], g, this.tmp);
          const a = Math.atan2(this.tmp.ny, this.tmp.nx);
          this.sideX[k] = this.tmp.x; this.sideY[k] = this.tmp.y; this.sideA[k] = a;
          this.push(K.SIDE, 255, k, this.tmp.x, this.tmp.y, a, 0, 0);
          this.sideN++;
        }
        this.endGroup();
      }

      this.built.tick = view.tick; this.built.epoch = epoch; this.built.focus = f; this.built.model = this.model();
      this.built.w = this.cssW; this.built.h = this.cssH; this.built.dosage = view.cell.dosage;
      this.built.length = g.L; this.built.pinch = g.pinch;
      this.hitDirty = true;
    }

    group(kind, color, style, isHollow) {
      const k = this.ng;
      this.gKind[k] = kind; this.gColor[k] = color; this.gStyle[k] = style; this.gHollow[k] = isHollow ? 1 : 0;
      this.gStart[k] = this.n;
    }
    endGroup() {
      this.gEnd[this.ng] = this.n;
      if (this.gEnd[this.ng] > this.gStart[this.ng] && this.ng < this.gStart.length - 1) this.ng++;
    }
    push(kind, gene, src, x, y, ang, len, ph) {
      if (this.n >= CAP) return -1;
      const i = this.n++;
      this.bx[i] = x; this.by[i] = y; this.bkind[i] = kind; this.bgene[i] = gene; this.bsrc[i] = src;
      this.bang[i] = ang; this.blen[i] = len;
      this.bs0[i] = 0; this.bs1[i] = 1;
      this.bph[i] = ph * 6.283185307179586;
      this.bom[i] = 2 + 3 * ((ph * 7.31) % 1);          // 2–5 rad/s
      return i;
    }
    inside(key, n, epoch, kind, gene) {
      const g = this.geom, t = this.tmp2, o = this.tmp;
      for (let k = 0; k < n; k++) {
        D.pos(key, k, epoch, null, t);
        G.map(t.x, 2 * t.y - 1, g, o);
        this.push(kind, gene, k, o.x, o.y, t.x * 6.283185307179586, 0, t.y);
      }
    }
    outside(key, n, epoch, kind) {
      const g = this.geom, t = this.tmp2;
      const inset = 5, rw = g.w - 2 * inset, rh = g.h - 2 * inset;
      for (let k = 0; k < n; k++) {
        let r = 0;
        do {
          D.pos(key, k + 65536 * r, epoch, null, t);
          t.x = inset + t.x * rw; t.y = inset + t.y * rh;
          r++;
        } while (r < 8 && G.inside(g, t.x, t.y, 7));
        this.push(kind, 255, k, t.x, t.y, 0, 0, D.hash01('jo', k, epoch));
      }
    }

    /** Nucleoid outline and chromosome loop per lobe, sampled into stage px; loci (in display order) and the lac operator. */
    buildNucleoid(view, epoch) {
      const g = this.geom, lobes = G.lobes(view.cell.dosage);
      this.lobeCount = lobes.length;
      const uv = this.uv, o = this.tmp, model = this.model();
      for (let l = 0; l < lobes.length; l++) {
        const lb = lobes[l];
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * 6.283185307179586;
          G.map(lb.u + lb.du * Math.cos(a), lb.dv * Math.sin(a), g, o);
          this.nucPts[l * 50 + 2 * k] = o.x; this.nucPts[l * 50 + 2 * k + 1] = o.y;
        }
        const ctl = G.dnaLoop(lb, l, epoch, D.hash01, this.dnaCtl[l]);
        for (let k = 0; k <= 64; k++) {
          G.loopPoint(ctl, (k / 64) * G.DNA_POINTS, uv);
          G.map(uv.u, uv.v, g, o);
          this.dnaPts[l * 130 + 2 * k] = o.x; this.dnaPts[l * 130 + 2 * k + 1] = o.y;
        }
        const point = (T, xs, ys, as, j) => {
          G.loopPoint(ctl, T + 0.15, uv); G.map(uv.u, uv.v, g, o);
          const x1 = o.x, y1 = o.y;
          G.loopPoint(ctl, T - 0.15, uv); G.map(uv.u, uv.v, g, o);
          const x0 = o.x, y0 = o.y;
          G.loopPoint(ctl, T, uv); G.map(uv.u, uv.v, g, o);
          xs[j] = o.x; ys[j] = o.y; as[j] = Math.atan2(y1 - y0, x1 - x0);
        };
        for (let i = 0; i < this.nGenes; i++) point(model.locusFrac(this.ids[i]) * G.DNA_POINTS, this.locusX, this.locusY, this.locusA, l * MAXG + i);
        // The operator sits just before the operon's first gene.
        if (this.lacLeader >= 0) point((model.locusFrac(this.ids[this.lacLeader]) - 0.055) * G.DNA_POINTS, this.operX, this.operY, this.operA, l);
      }
    }

    /**
     * Transcripts in progress of unit leader i: RNA polymerase rings along the gene, each trailing its growing
     * strand. c is the gene whose segment is drawn (the whole strand for a one-gene unit).
     */
    nascent(gv, i, c, isFocus) {
      const n = gv.nascent;
      const s0 = this.seg0[c], s1 = this.seg1[c];
      for (let j = 0; j < n; j++) {
        const l = this.lobeCount > 1 ? j % 2 : 0;
        const li = l * MAXG + i;
        const a = this.locusA[li], prog = gv.nascentProgress[j];
        if (prog <= s0 && s0 > 0) continue;              // the polymerase has not reached this gene yet
        const span = isFocus ? 16 : 10;
        const x = this.locusX[li] + Math.cos(a) * (prog - 0.5) * span;
        const y = this.locusY[li] + Math.sin(a) * (prog - 0.5) * span;
        const side = j % 2 ? 1 : -1;
        const out = a + side * Math.PI / 2;
        const full = isFocus ? this.plan.strandLen : 10 * (this.members[i].length > 1 ? 1.6 : 1);
        const bi = this.push(K.NASCENT, c, j, x, y, out, full, 0.5);
        if (bi >= 0) { this.bs0[bi] = s0; this.bs1[bi] = Math.max(s0 + 2 / full, Math.min(s1, prog)); }
        if (isFocus && s0 === 0 && bi >= 0) { this.strandProg[this.nStrands] = prog; this.strands[this.nStrands++] = bi; }
      }
    }

    /** The focus gene's ribosomes: floor(R/S) per strand, the remainder to strands in hash order, along its part of each. */
    polysome(gv, f, epoch) {
      const p = this.plan;
      const R = p.poly;
      const S = this.nStrands;
      if (R <= 0 || S <= 0) return;
      const each = Math.floor(R / S), extra = R - each * S;
      const pt = this.tmp2, s0 = this.seg0[f], s1 = this.seg1[f];
      const rot = D.hash01('ps', 0, epoch) * S;
      for (let s = 0; s < S; s++) {
        // The remainder goes to strands chosen by a hash rotation (stable within the epoch).
        const q = each + (((s + S - Math.floor(rot)) % S) < extra ? 1 : 0);
        if (!q) continue;
        const bi = this.strands[s];
        if (bi < 0 || bi >= this.n) continue;
        const isM = this.bkind[bi] === K.MRNA_FOCUS;
        const x = this.bx[bi], y = this.by[bi], a = this.bang[bi], len = this.blen[bi];
        // On a transcript still being made, only the part the polymerase has passed carries ribosomes.
        const top = Math.min(s1, this.strandProg[s]);
        if (top <= s0) continue;
        for (let k = 0; k < q; k++) {
          const t = s0 + (top - s0) * ((k + 0.5) / q);
          if (isM) wavePoint(x, y, a, len, t, pt);
          else { pt.x = x + Math.cos(a) * len * t; pt.y = y + Math.sin(a) * len * t; }
          const idx = this.push(K.POLY, f, s, pt.x, pt.y, a, 0, 0);
          if (idx >= 0) { this.bph[idx] = this.bph[bi]; this.bom[idx] = this.bom[bi]; }
        }
      }
    }

    // --- per frame ---------------------------------------------------------------
    /**
     * Called every animation frame by the app. dtReal in s (0 when painting while
     * paused), dtSim in sim s advanced this frame. Returns true if it drew.
     */
    render(dtReal, dtSim, force) {
      if (!this.visible || !this.geom || !this.ctx) return false;
      const app = this.app;
      const running = app.isRunning();
      if (running) this.tau += dtReal;
      // Frame-rate cap from the measured draw cost: 30 fps above 8 ms, 20 fps above 14 ms.
      this.sinceDraw += dtReal;
      const minGap = this.drawEma > 14 ? 0.05 : this.drawEma > 8 ? 0.033 : 0;
      if (!force && !this.dirty && (!running || this.sinceDraw < minGap)) {
        if (running && dtSim > 0) this.spawnMarkers(app.cell.observe(), dtSim);   // keep emitting between draws
        return false;
      }
      const t0 = performance.now();
      const view = app.cell.observe();
      this.fitGeom(view);
      if (this.cellRef !== app.cell || this.ids.length !== view.genes.length) this.setupGenes(view);
      const b = this.built, f = app.focusIndex();
      if (b.tick !== view.tick || b.epoch !== view.clock.generation || b.focus !== f || b.w !== this.cssW || b.model !== this.model() ||
          b.h !== this.cssH || b.length !== this.geom.L || b.pinch !== this.geom.pinch) this.rebuild(view);
      if (running && dtSim > 0) this.spawnMarkers(view, dtSim);
      if (running) this.ageMarkers(this.sinceDraw);
      this.draw(view);
      this.updateOverlays(view);
      this.sinceDraw = 0;
      this.dirty = false;
      const ms = performance.now() - t0;
      this.drawEma = this.drawEma ? this.drawEma * 0.9 + ms * 0.1 : ms;
      return true;
    }

    draw(view) {
      const c = this.ctx, g = this.geom, P = PAL.current(), app = this.app;
      const reduced = app.reducedMotion();
      const A = reduced ? 0 : JITTER_PX, tau = this.tau;

      // Medium.
      c.fillStyle = P.outside;
      c.fillRect(0, 0, g.w, g.h);
      c.globalAlpha = 0.55;                 // the medium stays in the background
      this.drawGroups(c, P, K.GLC_OUT, K.AA_OUT, A, tau);
      c.globalAlpha = 1;

      // Sister ghost after division: dashed outline fading over 3 sim-min, drifting away (drawn from sim time).
      const age = view.clock.cellAge_s;
      if (view.clock.generation > 0 && age < GHOST_S) {
        const fr = age / GHOST_S;
        const off = g.L + 4 + (reduced ? 0 : fr * g.L);
        c.save();
        c.globalAlpha = 0.4 * (1 - fr);
        c.setLineDash([5, 4]);
        c.strokeStyle = P.membrane; c.lineWidth = 1.5;
        c.translate(g.vertical ? 0 : off, g.vertical ? off : 0);
        const pinch = g.pinch; g.pinch = 0;
        c.beginPath(); G.trace(c, g, 0); c.stroke();
        g.pinch = pinch;
        c.restore();
      }

      // Cytoplasm: its colour follows the energy charge (pale when ATP runs down).
      c.fillStyle = this.insideColor(P, view.energy.E);
      c.beginPath(); G.trace(c, g, 0); c.fill();

      c.save();
      c.beginPath(); G.trace(c, g, -1.5); c.clip();
      // Stipple: the rest of the proteome, not counted.
      c.globalAlpha = 0.09;
      c.fillStyle = P.muted;
      c.beginPath();
      for (let k = 0; k < STIPPLE; k++) c.rect(this.stip[2 * k] - 0.9, this.stip[2 * k + 1] - 0.9, 1.8, 1.8);
      c.fill();
      c.globalAlpha = 1;
      this.drawNucleoid(c, P);
      this.drawGroups(c, P, K.LOCUS, K.LOCUS, 0, tau);
      this.drawGroups(c, P, K.OPER, K.REP_BOUND, 0, tau);
      this.drawGroups(c, P, K.NASCENT, K.NASCENT, 0, tau);
      this.drawGroups(c, P, K.MRNA, K.MRNA, A, tau);
      // The crowd (pooled ribosomes, other genes' proteins, ATP, amino acids) is dimmed so the watched gene reads.
      c.globalAlpha = CROWD_ALPHA;
      this.drawGroups(c, P, K.RIB, K.RIB_STALLED, A, tau);
      this.drawProteins(c, P, false, A, tau, true);
      this.drawGroups(c, P, K.ATP, K.LAC_IN, A, tau);
      c.globalAlpha = 1;
      this.drawProteins(c, P, false, A, tau, false);
      this.drawGroups(c, P, K.INDUCER, K.INDUCER, A, tau);
      // Then the watched gene's mRNA strands on top (with a halo), and its ribosomes, translucent, over them.
      this.drawGroups(c, P, K.MRNA_FOCUS, K.MRNA_FOCUS, A, tau);
      c.globalAlpha = POLY_ALPHA;
      this.drawGroups(c, P, K.POLY, K.POLY, A, tau);
      c.globalAlpha = 1;
      c.restore();

      // Membrane: a bilayer (two strokes), then membrane proteins spanning it.
      c.strokeStyle = P.membrane; c.lineWidth = 1.2;
      c.beginPath(); G.trace(c, g, 1.6); G.trace(c, g, -1.6); c.stroke();
      this.drawProteins(c, P, true, A * 0.4, tau);
      this.drawSideRoute(c, P);
      this.drawMarkers(c, P, reduced);
    }

    /** The slow side route: a dashed gate across the membrane at each of its places, labelled "side route" once. */
    drawSideRoute(c, P) {
      if (!this.sideN) return;
      c.save();
      c.setLineDash([2.5, 2]);
      c.strokeStyle = P.ink; c.lineWidth = 1.4;
      c.fillStyle = P.panel || P.inside;
      for (let k = 0; k < this.sideN; k++) {
        c.beginPath(); sideGlyph(c, this.sideX[k], this.sideY[k], this.sideA[k]); c.fill(); c.stroke();
      }
      c.restore();
      // One label, outside the membrane beside the first place (beyond where its markers start), clamped to the stage.
      const a = this.sideA[0], lx = this.sideX[0] + Math.cos(a) * 24, ly = this.sideY[0] + Math.sin(a) * 24;
      c.font = '600 11px ' + FONT;
      c.textBaseline = 'middle';
      const w = c.measureText(C.cell.sideRoute).width;
      const left = Math.cos(a) < -0.3;
      let x = left ? lx - w : Math.cos(a) > 0.3 ? lx : lx - w / 2;
      x = Math.max(4, Math.min(this.cssW - w - 4, x));
      const y = Math.max(8, Math.min(this.cssH - 8, ly + (Math.abs(Math.cos(a)) <= 0.3 ? Math.sign(Math.sin(a) || 1) * 4 : 0)));
      c.fillStyle = P.outside; c.globalAlpha = 0.85;
      c.fillRect(x - 2, y - 7, w + 4, 14);
      c.globalAlpha = 1;
      c.fillStyle = P.ink; c.textAlign = 'left';
      c.fillText(C.cell.sideRoute, x, y);
    }

    insideColor(P, E) {
      const q = Math.max(0, Math.min(32, Math.round(((E - 0.1) / 0.6) * 32)));
      const key = q + (PAL.isDark() ? 100 : 0);
      if (this.insideCache.key !== key) {
        this.insideCache.key = key;
        this.insideCache.color = mix(P['inside-depleted'], P.inside, q / 32);
      }
      return this.insideCache.color;
    }

    drawNucleoid(c, P) {
      for (let l = 0; l < this.lobeCount; l++) {
        c.fillStyle = P.nucleoid;
        c.beginPath();
        for (let k = 0; k <= 24; k++) {
          const x = this.nucPts[l * 50 + 2 * k], y = this.nucPts[l * 50 + 2 * k + 1];
          if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.fill();
      }
      // DNA as a double line: a dark stroke with a thin light core.
      for (let pass = 0; pass < 2; pass++) {
        c.strokeStyle = pass === 0 ? P.dna : P.inside;
        c.lineWidth = pass === 0 ? 2.6 : 0.9;
        c.globalAlpha = pass === 0 ? 0.55 : 1;
        c.beginPath();
        for (let l = 0; l < this.lobeCount; l++) {
          for (let k = 0; k <= 64; k++) {
            const x = this.dnaPts[l * 130 + 2 * k], y = this.dnaPts[l * 130 + 2 * k + 1];
            if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
        }
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    /** Draws every group whose kind is in [k0, k1], batched. */
    drawGroups(c, P, k0, k1, A, tau) {
      for (let gi = 0; gi < this.ng; gi++) {
        const kind = this.gKind[gi];
        if (kind < k0 || kind > k1) continue;
        if (kind === K.PROT || kind === K.SIDE) continue;
        this.drawGroup(c, P, gi, A, tau);
      }
    }

    /** Proteins: membrane or cytoplasmic; crowd = true for the other genes only, false for the focus gene only, undefined for all. */
    drawProteins(c, P, membrane, A, tau, crowd) {
      const focus = this.app.focusIndex();
      for (let gi = 0; gi < this.ng; gi++) {
        if (this.gKind[gi] !== K.PROT) continue;
        const gene = this.bgene[this.gStart[gi]];
        if ((this.shapeOf(gene) === 'membrane') !== membrane) continue;
        if (crowd === true && gene === focus) continue;
        if (crowd === false && gene !== focus) continue;
        this.drawGroup(c, P, gi, A, tau);
        if (gene === focus) this.drawGroup(c, P, gi, A, tau, true);      // accent ring on the focus gene's protein
      }
    }

    drawGroup(c, P, gi, A, tau, ring) {
      const kind = this.gKind[gi], style = this.gStyle[gi], s0 = this.gStart[gi], s1 = this.gEnd[gi];
      const base = c.globalAlpha;
      const color = P[this.gColor[gi]] || P.muted;
      const stroke = style === 1 || kind === K.NASCENT || kind === K.MRNA || kind === K.MRNA_FOCUS || kind === K.OPER;
      c.beginPath();
      for (let i = s0; i < s1; i++) {
        let x = this.bx[i], y = this.by[i];
        if (A > 0) {
          const ph = this.bph[i], om = this.bom[i];
          x += A * Math.sin(tau * om + ph);
          y += A * Math.sin(tau * (om * 0.83 + 0.7) + ph * 1.618);
        }
        if (ring) { circle(c, x, y, 6); continue; }
        this.glyph(c, kind, i, x, y);
      }
      if (ring) {
        c.globalAlpha = base * 0.75; c.strokeStyle = P.accent; c.lineWidth = 1.2; c.stroke(); c.globalAlpha = base;
        return;
      }
      if (kind === K.MRNA_FOCUS) {                          // a halo in the cytoplasm colour, so the strand reads over anything
        c.strokeStyle = P.inside; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
        c.stroke();
      }
      if (stroke) {
        c.strokeStyle = color;
        c.lineWidth = kind === K.LOCUS ? 3 : kind === K.OPER ? 2 : kind === K.MRNA_FOCUS || kind === K.MRNA || kind === K.NASCENT ? 2 : 1.3;
        c.lineCap = 'round'; c.lineJoin = 'round';
        c.stroke();
      } else {
        c.fillStyle = color;
        c.fill();
      }
      if (style === 2) {                                   // ATP: a thin ink outline at 40%
        c.globalAlpha = base * 0.4; c.strokeStyle = P.ink; c.lineWidth = 1; c.stroke(); c.globalAlpha = base;
      } else if (style === 3) {                            // stalled: a short bar across each glyph
        c.beginPath();
        for (let i = s0; i < s1; i++) {
          let x = this.bx[i], y = this.by[i];
          if (A > 0) {
            const ph = this.bph[i], om = this.bom[i];
            x += A * Math.sin(tau * om + ph); y += A * Math.sin(tau * (om * 0.83 + 0.7) + ph * 1.618);
          }
          c.moveTo(x - 4, y); c.lineTo(x + 4, y);
        }
        c.strokeStyle = P.bad; c.lineWidth = 1.6; c.stroke();
      }
      if (kind === K.NASCENT) {                            // RNA polymerase rings at each transcript's base
        c.beginPath();
        for (let i = s0; i < s1; i++) if (this.bs0[i] === 0) circle(c, this.bx[i], this.by[i], SZ.rnap);
        c.fillStyle = P.inside; c.fill();
        c.strokeStyle = P.rnap; c.lineWidth = 1.3; c.stroke();
      }
    }

    glyph(c, kind, i, x, y) {
      switch (kind) {
        case K.GLC_OUT: hex(c, x, y, SZ.glcOut); break;
        case K.LAC_OUT: hex2(c, x, y, SZ.lacOut); break;
        case K.AA_OUT: tri(c, x, y, SZ.aaOut); break;
        case K.LOCUS: {
          const a = this.bang[i] + Math.PI / 2;
          mark(c, x, y, a, 7);
          break;
        }
        case K.OPER: {                                      // a small box across the DNA
          const a = this.bang[i];
          rect(c, x, y, a, 6, 7);
          break;
        }
        case K.REP_BOUND: vee(c, x, y, this.bang[i] + Math.PI, SZ.vee + 2); break;
        case K.INDUCER: circle(c, x, y, 1.6); break;
        case K.NASCENT: {
          const a = this.bang[i], l = this.blen[i], s0 = this.bs0[i], s1 = this.bs1[i];
          c.moveTo(x + Math.cos(a) * l * s0, y + Math.sin(a) * l * s0); c.lineTo(x + Math.cos(a) * l * s1, y + Math.sin(a) * l * s1);
          break;
        }
        case K.MRNA_FOCUS: wavy(c, x, y, this.bang[i], this.blen[i], this.bs0[i], this.bs1[i]); break;
        case K.MRNA: {
          const s0 = this.bs0[i], s1 = this.bs1[i];
          if (s0 === 0 && s1 === 1) { mark(c, x, y, this.bang[i], this.blen[i]); break; }
          const a = this.bang[i], l = this.blen[i], ca = Math.cos(a), sa = Math.sin(a);
          c.moveTo(x + ca * l * (s0 - 0.5), y + sa * l * (s0 - 0.5)); c.lineTo(x + ca * l * (s1 - 0.5), y + sa * l * (s1 - 0.5));
          break;
        }
        case K.RIB: case K.RIB_FREE: case K.RIB_STALLED: ribo(c, x, y, SZ.rib); break;
        case K.POLY: ribo(c, x, y, SZ.poly); break;
        case K.PROT: {
          const shape = this.shapeOf(this.bgene[i]);
          if (shape === 'membrane') rect(c, x, y, this.bang[i], 9, 5);
          else if (shape === 'tetramer') tetra(c, x, y, SZ.tetra);
          else if (shape === 'bar') rect(c, x, y, this.bang[i], 8, 3);
          else if (shape === 'repressor') vee(c, x, y, this.bang[i], SZ.vee);
          else if (shape === 'trimer') trimer(c, x, y, SZ.trimer);
          else circle(c, x, y, SZ.prot);
          break;
        }
        case K.ATP: case K.ADP: diamond(c, x, y, SZ.atp); break;
        case K.AA: tri(c, x, y, SZ.aa); break;
        case K.LAC_IN: hex2(c, x, y, SZ.lacIn); break;
      }
    }

    // --- flux markers (LAB_UI §2.5): rates, not amounts ------------------------------
    markerScale(flux, speed, floor) {
      // Smallest ladder value ≥ 10³ (≥ 1 for proteins cut up) with at most 20 markers per real second.
      let N = floor || 1e3;
      while (flux * speed / N > 20 && N < 1e12) N *= 10;
      return N;
    }

    /**
     * Glucose capacity of the slow side route (glucose/s at saturation): the engine's backup uptake, which level 1.1
     * turns on (flags.backupGlucoseUptake). Read from the cell, never written.
     */
    sideCapacity(view) {
      const cell = this.app.cell;
      const u = cell && typeof cell.uBasal === 'number' ? cell.uBasal : 0;
      return u > 0 ? u * view.cell.V_fL : 0;
    }
    /** The share of the glucose coming in that takes the side route (the rest comes through PtsG). */
    sideShare(view) {
      const side = this.sideCapacity(view);
      if (!(side > 0)) return 0;
      const cell = this.app.cell, g = view.geneById.ptsG;
      const pts = g && cell.p ? g.protein * cell.p.k_pts : 0;
      return side / (side + pts);
    }

    spawnMarkers(view, dtSim) {
      const fl = view.flux, speed = this.app.speed();
      const rates = FLUX_RATE;
      const side = this.sideN ? this.sideShare(view) : 0;
      rates[0] = fl.glucoseIn * (1 - side); rates[SIDE] = fl.glucoseIn * side;
      rates[1] = fl.lactoseIn; rates[2] = fl.aaImported; rates[3] = fl.fermentationProductsOut;
      // Proteins cut up by proteases (R-E10): the visible gene with the most degradation, from its glyphs.
      let cut = -1, cutRate = 0;
      for (let i = 0; i < this.nGenes; i++) {
        const r = view.genes[i].degraded_perS;
        if (r > cutRate && !(this.background && this.background[i])) { cutRate = r; cut = i; }
      }
      this.cutGene = cut; rates[CUT] = cutRate;
      for (let k = 0; k < NF; k++) {
        const N = this.markerScale(rates[k], speed, k === CUT ? 1 : 1e3);
        if (N !== this.markerN[k]) { this.markerN[k] = N; this.emitters[k].N = N; this.emitters[k].reset(); }
        let spawn = this.emitters[k].add(rates[k] * dtSim);
        if (spawn > 8) spawn = 8;
        for (let s = 0; s < spawn; s++) this.spawn(k);
      }
    }

    spawn(k) {
      const g = this.geom, o = this.tmp;
      const e = this.emitCount[k]++;
      const gene = k === CUT ? this.cutGene : k === SIDE ? -1 : this.fluxGene[k];
      let x, y, nx, ny;
      const r0 = gene >= 0 ? this.geneRange[2 * gene] : 0, r1 = gene >= 0 ? this.geneRange[2 * gene + 1] : 0;
      if (k === SIDE || (k === 0 && !(gene >= 0 && r1 > r0) && this.sideN)) {
        // Through one of the side route's two places (glucose never crosses bare membrane).
        if (!this.sideN) return;
        const q = Math.floor(D.hash01(FX_KEY[k], e, 0) * this.sideN) % this.sideN;
        x = this.sideX[q]; y = this.sideY[q]; nx = Math.cos(this.sideA[q]); ny = Math.sin(this.sideA[q]);
      } else if (gene >= 0 && r1 > r0) {
        // Through a transporter glyph chosen by hash.
        const bi = r0 + Math.floor(D.hash01(FX_KEY[k], e, 0) * (r1 - r0));
        x = this.bx[bi]; y = this.by[bi]; nx = Math.cos(this.bang[bi]); ny = Math.sin(this.bang[bi]);
      } else {
        // No transporter glyph (backup uptake, fermentation products): a hashed point on the membrane.
        G.perimeter(D.hash01(FP_KEY[k], e, 0), g, o);
        x = o.x; y = o.y; nx = o.nx; ny = o.ny;
      }
      const j = k * MARKERS + this.mNext[k];
      this.mNext[k] = (this.mNext[k] + 1) % MARKERS;       // the oldest is recycled
      const outward = k === 3;
      // A cut-up protein leaves from its glyph and drifts a little inward as it fades.
      const a = k === CUT ? 0 : outward ? -10 : 16, b = k === CUT ? -9 : outward ? 16 : -10;
      this.mX0[j] = x + nx * a; this.mY0[j] = y + ny * a;
      this.mX1[j] = x + nx * b; this.mY1[j] = y + ny * b;
      this.mA[j] = Math.atan2(ny, nx);
      this.mAge[j] = 0;
    }

    ageMarkers(dt) {
      for (let j = 0; j < NF * MARKERS; j++) {
        if (this.mAge[j] < 0) continue;
        this.mAge[j] += dt;
        if (this.mAge[j] >= MARKER_LIFE_S) this.mAge[j] = -1;
      }
    }

    drawMarkers(c, P, reduced) {
      for (let k = 0; k < NF; k++) {
        // Three alpha steps per flux keep this to a few fill calls.
        for (let band = 0; band < 3; band++) {
          c.beginPath();
          let any = false;
          for (let m = 0; m < MARKERS; m++) {
            const j = k * MARKERS + m, age = this.mAge[j];
            if (age < 0) continue;
            const fr = age / MARKER_LIFE_S;
            if (Math.min(2, Math.floor(fr * 3)) !== band) continue;
            const t = reduced ? 0.5 : fr;
            const x = this.mX0[j] + (this.mX1[j] - this.mX0[j]) * t, y = this.mY0[j] + (this.mY1[j] - this.mY0[j]) * t;
            if (k === 0 || k === SIDE) hex(c, x, y, 3.2); else if (k === 1) hex2(c, x, y, 2.4); else if (k === 2) tri(c, x, y, 3);
            else if (k === CUT) broken(c, x, y, this.mA[j] + Math.PI / 2, 9, 5, fr);
            else circle(c, x, y, 2.4);
            any = true;
          }
          if (!any) continue;
          c.globalAlpha = 1 - band / 3;
          if (k === CUT) { c.strokeStyle = (this.cutGene >= 0 && P[this.geneColor(this.cutGene)]) || P.muted; c.lineWidth = 1.4; c.stroke(); }
          else if (k === 3) { c.fillStyle = P.products; c.fill(); }
          else if (k === 2) { c.fillStyle = P.aa; c.fill(); }
          else { c.strokeStyle = P.sugar; c.lineWidth = 1.4; c.stroke(); }
        }
      }
      c.globalAlpha = 1;
    }

    // --- overlays, legend, focus bar ----------------------------------------------
    updateScaleBar() {
      if (!this.els || !this.geom) return;
      const px = Math.round(this.geom.pxPerUm);
      const bar = this.els.scaleBar;
      bar.style.setProperty('--len', px + 'px');
      bar.classList.toggle('is-vertical', this.geom.vertical);
    }

    updateOverlays(view) {
      const els = this.els, app = this.app;
      const paused = !app.isRunning();
      els.pausedBadge.hidden = !paused;
      LY.setText(els.pausedText, app.pending.any() && paused ? PAUSED_PENDING : C.cell.pausedBadge);
      els.rifBadge.hidden = !(view.drugs.rifampicin > 0);
      els.cmBadge.hidden = !(view.drugs.chloramphenicol > 0);
      this.updateLegend();
      this.updateOutsideScale();
      this.updateLacRegion(view);
    }

    /**
     * The lac region panel (m2-lac): the design's parts as a DNA strip, LacI on the operator while
     * any copy is bound, CRP–cAMP on the CRP site while cAMP is high. Rebuilt only when that changes.
     */
    updateLacRegion(view) {
      const el = this.els.lacInset;
      if (!el) return;
      const lac = view.lac, show = !!lac && this.lacI >= 0 && !this.isBackground('lacZ');
      if (el.hidden === show) el.hidden = !show;
      document.body.toggleAttribute('data-lac', show);
      if (!show) { if (this.topReserve) this.resize(); return; }
      const d = lac.design;
      // Before the first tick the engine has not yet read the medium (cAMP starts at 1): draw CRP from the glucose then.
      const crp = view.tick > 0 ? lac.cAMP >= 0.5 : !(view.env && view.env.glucose_mM > 0);
      const st = { bound: lac.operatorBound > 0, crp, inducer: lac.inducer_uM >= lac.inducerHalf_uM };
      const key = JSON.stringify(d) + (st.bound ? 1 : 0) + (st.crp ? 1 : 0) + (st.inducer ? 1 : 0) + (PAL.isDark() ? 'd' : 'l');
      if (key === this.lacKey) return;
      this.lacKey = key;
      const DV = this.app.BTC.DesignerView;
      if (!DV) return;
      const R = C.lacRegion;
      el.innerHTML = DV.regionSvg(d, st, { words: R, title: R.title });
      const parts = [
        d.lac.operator ? (st.bound ? R.bound : R.free) : R.none,
        d.lac.crpSite ? (st.crp ? R.crpOn : R.crpOff) : R.noSite,
      ];
      el.setAttribute('aria-label', F.fill(R.label, { parts: parts.join('; ') }));
      if (this.insetReserve() !== this.topReserve) this.resize();
    }

    updateLegend() {
      const p = this.plan;
      const L = this.legendScales;
      if (L[0] === p.P && L[1] === p.ribN && L[2] === p.atpN && L[3] === p.polyN) return;
      L[0] = p.P; L[1] = p.ribN; L[2] = p.atpN; L[3] = p.polyN;
      // The focus polysome's own scale is in the key sheet, so the legend stays at two lines (LAB_UI §2.9).
      const vars = { P: F.count(p.P), R: F.count(p.ribN), A: F.count(p.atpN) };
      const full = F.fill(C.legend.full, vars);
      LY.setText(this.els.legendFull, full);
      LY.setText(this.els.legendShort, F.fill(C.legend.short, vars));
      this.els.legend.setAttribute('aria-label', F.fill(C.legend.buttonLabel, { text: full }));
    }

    /** "outside: 1 dot = N" on the canvas while outside molecules are drawn (LAB_UI §2.9; the scale of the most numerous). */
    updateOutsideScale() {
      const el = this.els.outsideScale;
      if (!el) return;
      const p = this.plan;
      const g = p.glcOut + p.glcOutHollow, l = p.lacOut + p.lacOutHollow, a = p.aaOut + p.aaOutHollow;
      el.hidden = g + l + a === 0;
      if (el.hidden) return;
      const N = g >= l && g >= a ? p.glcOutN : l >= a ? p.lacOutN : p.aaOutN;
      LY.setText(el, F.fill(C.cell.outsideScale, { N: F.count(N) }));
    }

    /** The canvas label: narrator sentence plus the focus gene's counts (updated on narrator key change). */
    setLabel(sentence, key) {
      const app = this.app, view = app.cell.observe(), gv = view.genes[app.focusIndex()];
      const words = this.words(gv.id);
      const k = key + '|' + gv.id + '|' + words.name;
      if (k === this.lastLabelKey) return;
      this.lastLabelKey = k;
      this.canvas.setAttribute('aria-label', F.fill(C.cell.canvasLabel, {
        sentence, name: words.name, m: F.count(gv.mRNA), n: F.count(gv.nascent), p: F.count(F.machines(gv)),
      }));
    }

    mountFocusBar(el) {
      const h = LY.h, app = this.app;
      this.fb = {
        chip: h('span', { class: 'gene-chip' }),
        name: h('span', { class: 'fb-name' }),
        sym: h('span', { class: 'sym' }),
        counts: h('span', { class: 'fb-counts num' }),
        countsM: h('span', { class: 'fb-m' }),
        countsP: h('span', { class: 'fb-p' }),
      };
      this.fb.counts.appendChild(this.fb.countsM);
      this.fb.counts.appendChild(this.fb.countsP);
      const btn = h('button', { class: 'fb-row1', type: 'button', onclick: () => this.openPicker() }, [
        this.fb.chip,
        h('span', { class: 'fb-text' }, [h('span', { class: 'fb-title' }, [this.fb.name, ' ', this.fb.sym]), this.fb.counts]),
        h('span', { class: 'fb-change' }, [h('span', { class: 'fb-change-word', text: C.focus.change }), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')]),
      ]);
      this.fb.btn = btn;
      const ctrl = app.makePromoterControl(() => app.focusGene, 'focus');
      this.fb.ctrl = ctrl;
      el.appendChild(btn);
      this.fb.row2 = h('div', { class: 'fb-row2' }, ctrl.el);
      el.appendChild(this.fb.row2);
    }

    updateFocusBar(view) {
      if (!this.fb) return;
      const app = this.app, id = app.focusGene, gv = view.geneById[id];
      if (!gv) return;
      const words = this.words(id);
      const bg = 'var(--' + this.model().color(id) + ')';
      if (this.fb.chip.style.background !== bg) this.fb.chip.style.background = bg;
      LY.setText(this.fb.name, words.name);
      LY.setText(this.fb.sym, words.symbol);
      LY.setText(this.fb.countsM, F.fill(C.focus.counts, { m: F.count(gv.mRNA), n: F.count(gv.nascent) }));
      LY.setText(this.fb.countsP, F.fill(C.focus.protein, { p: F.count(F.machines(gv)) }));
      const label = F.fill(C.focus.buttonLabel, { name: words.name });
      if (this.fb.btn.getAttribute('aria-label') !== label) this.fb.btn.setAttribute('aria-label', label);
      const pl = F.fill(C.focus.promoterLabel, { name: words.name });
      if (this.fb.ctrl.el.getAttribute('aria-label') !== pl) this.fb.ctrl.el.setAttribute('aria-label', pl);
      // The promoter row shows only when this level lets the student set the watched gene.
      const mode = app.geneControlMode ? app.geneControlMode(id) : 'free';
      const hide = mode !== 'free' && mode !== 'locked';
      if (this.fb.row2.hidden !== hide) this.fb.row2.hidden = hide;
    }

    openPicker() {
      const app = this.app, h = LY.h;
      LY.openSheet({
        title: C.focus.pickerTitle,
        build: (body, close) => {
          body.appendChild(h('p', { class: 'sheet-note', text: C.focus.pickerNote }));
          const view = app.cell.observe(), m = this.model();
          for (const id of m.visible) {
            const w = this.words(id);
            const st = C.geneState[view.geneById[id].geneState] || '';
            body.appendChild(h('button', {
              class: 'btn row-btn picker-row' + (id === app.focusGene ? ' is-current' : ''), type: 'button', 'data-gene': id,
              'aria-current': id === app.focusGene ? 'true' : null,
              onclick: () => { app.setFocus(id); close(); },
            }, [h('span', { class: 'gene-chip', style: { background: 'var(--' + m.color(id) + ')' } }),
              h('span', { class: 'picker-text' }, [h('span', { class: 'picker-name', text: w.name }),
                h('span', { class: 'picker-state' }, [h('span', { class: 'sym', text: w.symbol }), w.symbol ? ' · ' : '', st])])]));
          }
        },
      });
    }

    // --- tap to identify (LAB_UI §2.8) --------------------------------------------
    onTap(e) {
      if (!this.n) return;
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (this.hitDirty) { this.hit.build(this.bx, this.by, this.n, this.cssW, this.cssH); this.hitDirty = false; }
      const i = this.hit.nearest(x, y, 16);
      let text;
      if (i < 0) {
        if (G.inside(this.geom, x, y, 3) && !G.inside(this.geom, x, y, -3)) text = C.chip.membrane;
        else return this.hideChip();
      } else {
        text = this.describe(i);
        const kind = this.bkind[i], gene = this.bgene[i];
        if ((kind === K.LOCUS || kind === K.NASCENT || kind === K.MRNA || kind === K.MRNA_FOCUS) && gene < this.nGenes && !this.isBackground(this.ids[gene])) {
          this.app.setFocus(this.ids[gene]);
        }
      }
      this.showChip(text, x, y);
    }

    describe(i) {
      const kind = this.bkind[i], gene = this.bgene[i], p = this.plan;
      const id = gene < this.nGenes ? this.ids[gene] : null;
      const w = id ? this.words(id) : null;
      const noun = w ? w.noun : '';
      const N = (x) => F.count(x);
      const unit = id ? this.members[this.leaderOf[gene]] : null;
      const multi = !!unit && unit.length > 1;
      switch (kind) {
        case K.GLC_OUT: return F.fill(C.chip.glcOut, { N: N(p.glcOutN) });
        case K.LAC_OUT: return F.fill(C.chip.lacOut, { N: N(p.lacOutN) });
        case K.AA_OUT: return F.fill(C.chip.aaOut, { N: N(p.aaOutN) });
        case K.LOCUS: return F.fill(C.chip.locus, { name: w.name });
        case K.OPER: return C.chip.operator;
        case K.REP_BOUND: return C.chip.repressorBound;
        case K.INDUCER: return C.chip.repressorInducer;
        case K.NASCENT: return F.fill(C.chip.nascent, { noun });
        case K.MRNA: case K.MRNA_FOCUS:
          if (multi) return F.fill(C.chip.tuMRNA, { names: unit.map((c) => this.words(this.ids[c]).symbol || this.words(this.ids[c]).name).join(', '), id: this.bsrc[i] });
          return F.fill(C.chip.mRNA, { noun, id: this.bsrc[i] });
        case K.RIB: return F.fill(C.chip.ribosome, { N: N(p.ribN) });
        case K.RIB_FREE: return F.fill(C.chip.ribosomeFree, { N: N(p.ribN) });
        case K.RIB_STALLED: return F.fill(C.chip.ribosomeStalled, { N: N(p.ribN) });
        case K.POLY: return F.fill(C.chip.polysome, { noun, N: N(p.polyN) });
        case K.PROT: {
          if (gene === this.lacI && this.app.cell.observe().lac) return C.chip.repressor;
          const name = F.capital(w.protein);
          if (this.isBackground(id)) return F.fill(C.chip.protein, { name: F.capital(C.key.glyphs.background), N: N(p.P) });
          return F.fill(p.hollow[gene] ? C.chip.proteinHollow : C.chip.protein, { name: name + ' protein', N: N(p.P) });
        }
        case K.ATP: return F.fill(C.chip.atp, { N: N(p.atpN) });
        case K.ADP: return F.fill(C.chip.adp, { N: N(p.atpN) });
        case K.AA: return F.fill(C.chip.aa, { N: N(p.aaN) });
        case K.LAC_IN: return F.fill(C.chip.lacIn, { N: N(p.lacN) });
        case K.SIDE: return C.chip.sideRoute;
      }
      return '';
    }

    showChip(text, x, y) {
      const chip = this.els.chip;
      chip.textContent = text;
      chip.hidden = false;
      const cw = chip.offsetWidth, ch = chip.offsetHeight;
      const left = Math.max(4, Math.min(this.cssW - cw - 4, x - cw / 2));
      const top = y - ch - 14 < 4 ? y + 14 : y - ch - 14;
      chip.style.left = left + 'px';
      chip.style.top = top + 'px';
      clearTimeout(this.chipTimer);
      this.chipTimer = setTimeout(() => this.hideChip(), 3000);    // UI chrome: 3 s of real time
    }
    hideChip() { this.els.chip.hidden = true; }

    // --- key sheet (LAB_UI §2.9) ---------------------------------------------------
    openKey() {
      const app = this.app, h = LY.h, p = this.plan, P = PAL.current();
      const N = (x) => F.fill(C.key.perDot, { N: F.count(x) });
      const K2 = C.key.glyphs;
      const rows = [];
      const add = (draw, label, note) => rows.push(h('li', { class: 'key-row' }, [keyGlyph(draw, P), h('span', { class: 'key-label', text: label }), h('span', { class: 'key-n num', text: note || '' })]));
      const view = app.cell.observe(), m = this.model();
      this.updateBackground();
      const lacDrawn = !!view.lac && this.lacI >= 0;
      for (const id of m.visible) {
        const i = this.idx[id];
        if (i === undefined) continue;
        const w = this.words(id), col = P[m.color(id)], shape = this.shapeOf(i);
        if (lacDrawn && i === this.lacI) {
          add((c) => { c.beginPath(); vee(c, 12, 12, -Math.PI / 2, SZ.vee + 2); c.fillStyle = col; c.fill(); }, K2.repressor, N(1));
          add((c) => { c.beginPath(); vee(c, 12, 12, -Math.PI / 2, SZ.vee + 2); c.fillStyle = col; c.fill(); c.beginPath(); circle(c, 12, 12, 1.8); c.fillStyle = P.sugar; c.fill(); }, K2.repressorInducer, N(1));
          continue;
        }
        add((c) => {
          c.beginPath();
          if (shape === 'membrane') rect(c, 12, 12, -Math.PI / 2, 9, 5);
          else if (shape === 'tetramer') tetra(c, 12, 12, SZ.tetra);
          else if (shape === 'bar') rect(c, 12, 12, 0.6, 8, 3);
          else if (shape === 'repressor') vee(c, 12, 12, -Math.PI / 2, SZ.vee + 2);
          else if (shape === 'trimer') trimer(c, 12, 12, SZ.trimer);
          else circle(c, 12, 12, SZ.prot);
          c.fillStyle = col; c.fill();
        }, F.fill(K2.protein, { name: F.capital(w.protein) }), N(p.P));
      }
      if (this.background.some(Boolean)) add((c) => { c.beginPath(); circle(c, 12, 12, SZ.prot); c.fillStyle = P.muted; c.fill(); }, K2.background, N(p.P));
      const fcol = P[m.color(app.focusGene)] || P.muted;
      add((c) => { c.beginPath(); circle(c, 12, 12, SZ.prot); c.fillStyle = fcol; c.fill(); c.beginPath(); circle(c, 12, 12, 5.5); c.strokeStyle = P.accent; c.lineWidth = 1.5; c.stroke(); }, K2.proteinFocus, '');
      add((c) => { c.beginPath(); circle(c, 12, 12, SZ.prot); c.strokeStyle = P.muted; c.lineWidth = 1.3; c.stroke(); }, K2.hollow, '');
      add((c) => { c.beginPath(); wavy(c, 12, 12, 0, 18); c.strokeStyle = fcol; c.lineWidth = 2; c.stroke(); }, K2.mRNAFocus, N(1));
      add((c) => { c.beginPath(); mark(c, 12, 12, 0.7, 8); c.strokeStyle = P.muted; c.lineWidth = 2; c.lineCap = 'round'; c.stroke(); }, K2.mRNA, N(1));
      if (lacDrawn) {
        const segs = ['lacZ', 'lacY', 'lacA'].map((id) => P[m.color(id)] || P.muted);
        add((c) => { const f = [0, 0.62, 0.87, 1]; for (let k = 0; k < 3; k++) { c.beginPath(); wavy(c, 12, 12, 0, 20, f[k], f[k + 1]); c.strokeStyle = segs[k]; c.lineWidth = 2; c.stroke(); } }, K2.tuMRNA, N(1));
        add((c) => { c.beginPath(); c.moveTo(2, 12); c.lineTo(22, 12); c.strokeStyle = P.dna; c.lineWidth = 2.6; c.stroke(); c.beginPath(); rect(c, 12, 12, 0, 6, 7); c.strokeStyle = P.ink; c.lineWidth = 2; c.stroke(); }, K2.operator, '');
      }
      add((c) => { c.beginPath(); c.moveTo(8, 16); c.lineTo(18, 6); c.strokeStyle = P.muted; c.lineWidth = 2; c.stroke(); c.beginPath(); circle(c, 8, 16, SZ.rnap); c.fillStyle = P.inside; c.fill(); c.strokeStyle = P.rnap; c.lineWidth = 1.3; c.stroke(); }, K2.nascent, N(1));
      add((c) => { c.beginPath(); ribo(c, 12, 12, SZ.poly); c.fillStyle = P.ribosome; c.fill(); }, K2.polysome, N(p.polyN));
      add((c) => { c.beginPath(); ribo(c, 12, 12, SZ.rib); c.fillStyle = P.ribosome; c.fill(); }, K2.rib, N(p.ribN));
      add((c) => { c.beginPath(); ribo(c, 12, 12, SZ.rib); c.strokeStyle = P.ribosome; c.lineWidth = 1.3; c.stroke(); }, K2.ribFree, N(p.ribN));
      add((c) => { c.beginPath(); ribo(c, 12, 12, SZ.rib); c.fillStyle = P.ribosome; c.fill(); c.beginPath(); c.moveTo(8, 12); c.lineTo(16, 12); c.strokeStyle = P.bad; c.lineWidth = 1.6; c.stroke(); }, K2.ribStalled, N(p.ribN));
      add((c) => { c.beginPath(); diamond(c, 12, 12, SZ.atp + 1); c.fillStyle = P.atp; c.fill(); c.globalAlpha = 0.4; c.strokeStyle = P.ink; c.stroke(); }, K2.atp, N(p.atpN));
      add((c) => { c.beginPath(); diamond(c, 12, 12, SZ.atp + 1); c.strokeStyle = P.atp; c.lineWidth = 1.3; c.stroke(); }, K2.adp, N(p.atpN));
      add((c) => { c.beginPath(); tri(c, 12, 13, SZ.aa + 1); c.fillStyle = P.aa; c.fill(); }, K2.aa, N(p.aaN));
      add((c) => { c.beginPath(); hex2(c, 12, 12, SZ.lacIn + 0.5); c.strokeStyle = P.sugar; c.lineWidth = 1.3; c.stroke(); }, K2.lacIn, N(p.lacN));
      add((c) => { c.beginPath(); hex(c, 12, 12, SZ.glcOut + 0.5); c.strokeStyle = P.sugar; c.lineWidth = 1.3; c.stroke(); }, K2.glcOut, N(p.glcOutN));
      add((c) => { c.beginPath(); hex2(c, 12, 12, SZ.lacOut + 0.5); c.strokeStyle = P.sugar; c.lineWidth = 1.3; c.stroke(); }, K2.lacOut, N(p.lacOutN));
      add((c) => { c.beginPath(); tri(c, 12, 13, SZ.aaOut + 0.5); c.fillStyle = P.aa; c.fill(); }, K2.aaOut, N(p.aaOutN));
      const M = (k) => F.fill(C.key.perMarker, { N: F.count(this.markerN[k]) });
      add((c) => { c.beginPath(); hex(c, 12, 12, 3.2); c.strokeStyle = P.sugar; c.lineWidth = 1.4; c.stroke(); }, K2.fluxGlc, M(0));
      if (this.sideN) {
        add((c) => { c.setLineDash([2.5, 2]); c.beginPath(); sideGlyph(c, 12, 12, 0); c.fillStyle = P.panel || P.inside; c.fill(); c.strokeStyle = P.ink; c.lineWidth = 1.4; c.stroke(); c.setLineDash([]); },
          K2.sideRoute, M(SIDE));
      }
      add((c) => { c.beginPath(); hex2(c, 12, 12, 2.4); c.strokeStyle = P.sugar; c.lineWidth = 1.4; c.stroke(); }, K2.fluxLac, M(1));
      add((c) => { c.beginPath(); tri(c, 12, 12, 3); c.fillStyle = P.aa; c.fill(); }, K2.fluxAa, M(2));
      add((c) => { c.beginPath(); circle(c, 12, 12, 2.4); c.fillStyle = P.products; c.fill(); }, K2.fluxOut, M(3));
      // Proteins cut up (level 1.4): shown only when a gene's protein is being broken down.
      if (this.cutGene >= 0) {
        const id = this.ids[this.cutGene], w = this.words(id);
        add((c) => { c.beginPath(); broken(c, 12, 12, -Math.PI / 2, 12, 5, 0.6); c.strokeStyle = P[m.color(id)] || P.muted; c.lineWidth = 1.4; c.stroke(); },
          F.fill(K2.fluxCut, { name: w.short || F.capital(w.protein) }), M(CUT));
      }
      LY.openSheet({
        title: C.key.title, className: 'key-sheet',
        build: (body) => {
          body.appendChild(h('ul', { class: 'key-list' }, rows));
          const notes = C.key.notes.slice();
          if (lacDrawn) notes.push(F.capital(K2.notDrawn) + '.');
          body.appendChild(h('ul', { class: 'key-notes' }, notes.map((t) => h('li', { text: t }))));
        },
      });
    }

    /**
     * Where a guide's canvas target is drawn (PROLOGUE §2.4.3 `point`: 'mrna:first', 'ribosome:focus',
     * 'glyph:membrane:ptsG', 'marker:glucose', …), as {x, y} in canvas CSS px, or null. The zoom control
     * answers (BTC.ZoomControl.locate), for the Cell zoom from this view's glyph buffer.
     */
    locate(point) {
      const z = this.app.views && this.app.views.zoom;
      return z && typeof z.locate === 'function' ? z.locate(point) : null;
    }

    // --- test support: glyphs drawn per species and gene (LAB_UI §10.4) ----------------
    stats() {
      // Computed now from the cell's state, so it is current even while the view is hidden.
      if (this.geom) {
        const view = this.app.cell.observe();
        this.fitGeom(view);
        if (this.cellRef !== this.app.cell || this.ids.length !== view.genes.length) this.setupGenes(view);
        plan(view, this.geom, { focus: this.app.focusIndex(), strandNt: this.strandNt, follower: this.follower, lacI: this.lacI }, this.plan);
      }
      const p = this.plan, out = { mRNA: {}, nascent: {}, protein: {}, scales: {} };
      for (let i = 0; i < this.nGenes; i++) {
        out.mRNA[this.ids[i]] = p.mRNA[i];
        out.nascent[this.ids[i]] = p.nascent[i];
        out.protein[this.ids[i]] = p.protein[i] + p.hollow[i];
      }
      Object.assign(out, {
        ATP: p.atp, ADP: p.adp, ribosomes: p.ribFilled, ribosomesFree: p.ribFree, ribosomesStalled: p.ribStalled,
        polysome: p.poly, aminoAcids: p.aa, lactoseInside: p.lacIn, glucoseOutside: p.glcOut + p.glcOutHollow,
        lactoseOutside: p.lacOut + p.lacOutHollow, aminoAcidsOutside: p.aaOut + p.aaOutHollow, total: p.total, buffer: this.n,
        genes: this.ids.slice(), loci: this.ids.map((id) => this.model().locusFrac(id)), colors: this.ids.map((id) => this.model().color(id)),
      });
      out.scales = { P: p.P, polysome: p.polyN, ribosomes: p.ribN, ATP: p.atpN, aminoAcids: p.aaN, lactose: p.lacN };
      return out;
    }
  }

  const PAUSED_PENDING = C.cell.pausedBadge + ' · ' + C.cell.pendingNote;
  const FLUX_RATE = new Float64Array(NF);
  const FX_KEY = ['fx0', 'fx1', 'fx2', 'fx3', 'fx4', 'fx5'], FP_KEY = ['fp0', 'fp1', 'fp2', 'fp3', 'fp4', 'fp5'];

  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  /** The side route's gate: a rounded box across the membrane with an opening through it (a, the outward normal). */
  function sideGlyph(c, x, y, a) {
    const ca = Math.cos(a), sa = Math.sin(a), L = 6.5, W = 4.5;      // half-lengths along and across the normal
    const pt = (u, v) => [x + ca * u - sa * v, y + sa * u + ca * v];
    const q = [pt(-L, -W), pt(L, -W), pt(L, W), pt(-L, W)];
    c.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]);
    c.closePath();
    const m0 = pt(-L, 0), m1 = pt(L, 0);
    c.moveTo(m0[0], m0[1]); c.lineTo(m1[0], m1[1]);
  }

  /** Mixes two #rrggbb colours: t = 0 gives a, 1 gives b. */
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }

  /** A 24 × 24 canvas showing one glyph, for the key sheet. */
  function keyGlyph(draw, P) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = 24 * dpr; cv.height = 24 * dpr;
    cv.className = 'key-glyph';
    cv.setAttribute('aria-hidden', 'true');
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = P.inside; c.fillRect(0, 0, 24, 24);
    draw(c);
    return cv;
  }

  CellView.plan = plan;
  CellView.createPlan = createPlan;
  CellView.interiorArea = interiorArea;
  CellView.outsideVolume = outsideVolume;
  CellView.MAX_GLYPHS = MAX_GLYPHS;
  CellView.KINDS = K;
  return CellView;
});
