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

  const NG = 7;                          // player genes
  const GENE_IDS = PAL.GENE_IDS;
  const MAX_GLYPHS = 1500;               // hard cap per frame (LAB_UI §2.3)
  const CAP = 2048;                      // buffer capacity (cap plus loci and headroom)
  const N_mM = 602214.076;               // molecules per (mM · fL)
  const STIPPLE = 160;                   // background-proteome specks (constant, not counted)
  const JITTER_PX = 1.2;
  const MARKER_LIFE_S = 0.6;             // flux marker lifetime, render time
  const MARKERS = 128;                   // per flux
  const GHOST_S = 180;                   // sister ghost fades over 3 sim-min

  // Glyph kinds.
  const K = {
    GLC_OUT: 1, LAC_OUT: 2, AA_OUT: 3, NASCENT: 4, MRNA_FOCUS: 5, MRNA: 6, RIB: 7, RIB_FREE: 8, RIB_STALLED: 9,
    POLY: 10, PROT: 11, ATP: 12, ADP: 13, AA: 14, LAC_IN: 15, LOCUS: 16, RNAP: 17,
  };

  // ---------------------------------------------------------------------------
  // The plan: how many glyphs of each species, at what scale (pure; test U-6)
  // ---------------------------------------------------------------------------
  function createPlan() {
    return {
      P: 0, polyN: 1, ribN: 100, atpN: 1e5, aaN: 1e5, lacN: 1e5, glcOutN: 1e6, lacOutN: 1e6, aaOutN: 1e6,
      focus: 0, protein: new Int32Array(NG), hollow: new Uint8Array(NG), mRNA: new Int32Array(NG), nascent: new Int32Array(NG),
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
    for (let i = 0; i < NG; i++) t += p.protein[i] + p.hollow[i] + p.mRNA[i] + 2 * p.nascent[i];
    p.total = t;
    return t;
  }

  /**
   * Fills p (from createPlan; its previous scales give the hysteresis) for this
   * view, geometry and focus gene. opts: {focus, strandNt: per-gene mRNA length (nt)}.
   */
  function plan(view, g, opts, p) {
    const genes = view.genes, f = opts.focus;
    p.focus = f;
    // One shared protein scale, so dot counts compare honestly across genes.
    let maxProt = 0;
    for (let i = 0; i < NG; i++) if (genes[i].protein > maxProt) maxProt = genes[i].protein;
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
      p.loci = NG * (view.cell.dosage >= 2 ? 2 : 1);
      for (let i = 0; i < NG; i++) {
        const gi = genes[i];
        // lacZ is drawn as tetramers at P/4 each, so one glyph still stands for P monomers.
        p.protein[i] = glyphs(gi.protein, p.P);
        p.hollow[i] = p.protein[i] === 0 && gi.proteinRounded > 0 ? 1 : 0;
        p.mRNA[i] = gi.mRNA;
        p.nascent[i] = gi.nascent;
      }
      return tally(p);
    };
    count();
    // Over the cap: the species with the most glyphs (never mRNA or the focus polysome) steps up the ladder.
    for (let guard = 0; p.total > MAX_GLYPHS && guard < 24; guard++) {
      let protTotal = 0;
      for (let i = 0; i < NG; i++) protTotal += p.protein[i];
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
    const m = genes[f].mRNA;
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
  // Ribosome: large and small subunit.
  function ribo(c, x, y, s) {
    circle(c, x, y + s * 0.14, s * 0.5);
    circle(c, x, y - s * 0.34, s * 0.32);
  }
  // LacZ tetramer: four lobes.
  function tetra(c, x, y, s) {
    const d = s * 0.25, r = s * 0.27;
    circle(c, x - d, y - d, r); circle(c, x + d, y - d, r); circle(c, x - d, y + d, r); circle(c, x + d, y + d, r);
  }
  // A rectangle of length l along angle a and width w.
  function rect(c, x, y, a, l, w) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const lx = ca * l / 2, ly = sa * l / 2, wx = -sa * w / 2, wy = ca * w / 2;
    c.moveTo(x + lx + wx, y + ly + wy); c.lineTo(x + lx - wx, y + ly - wy);
    c.lineTo(x - lx - wx, y - ly - wy); c.lineTo(x - lx + wx, y - ly + wy); c.closePath();
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
  function wavy(c, x, y, a, l) {
    const n = Math.max(4, Math.round(l / 2));
    wavePoint(x, y, a, l, 0, WP); c.moveTo(WP.x, WP.y);
    for (let k = 1; k <= n; k++) { wavePoint(x, y, a, l, k / n, WP); c.lineTo(WP.x, WP.y); }
  }

  // Glyph sizes (CSS px), from LAB_UI §2.3.
  const SZ = {
    glcOut: 3.6, lacOut: 2.6, aaOut: 3.2, rib: 5, poly: 4, prot: 2.5, tetra: 7, atp: 3.4, aa: 2.4, lacIn: 2.2, rnap: 2.5,
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
      // Glyph buffer: stage positions (unjittered), kind, gene, source id, angle, length, jitter phase/frequency.
      this.bx = new Float32Array(CAP); this.by = new Float32Array(CAP);
      this.bkind = new Uint8Array(CAP); this.bgene = new Uint8Array(CAP);
      this.bsrc = new Int32Array(CAP); this.bang = new Float32Array(CAP); this.blen = new Float32Array(CAP);
      this.bph = new Float32Array(CAP); this.bom = new Float32Array(CAP);
      this.n = 0;
      // Groups: contiguous ranges drawn with one fill or stroke. style: 0 fill, 1 stroke, 2 fill + ink outline, 3 fill + stalled bar.
      this.gStart = new Uint16Array(96); this.gEnd = new Uint16Array(96); this.gKind = new Uint8Array(96);
      this.gStyle = new Uint8Array(96); this.gColor = new Array(96).fill('ink'); this.gHollow = new Uint8Array(96);
      this.ng = 0;
      this.geneRange = new Int32Array(NG * 2);          // [start, end) of each gene's protein glyphs
      this.stip = new Float32Array(STIPPLE * 2);
      this.dnaCtl = [new Float64Array(32), new Float64Array(32)];
      this.dnaPts = new Float32Array(2 * 2 * 65);       // two lobes × 65 sampled points
      this.nucPts = new Float32Array(2 * 2 * 25);       // two lobes × 25 outline points
      this.lobeCount = 1;
      this.locusX = new Float32Array(NG * 2); this.locusY = new Float32Array(NG * 2); this.locusA = new Float32Array(NG * 2);
      this.hit = new G.HitGrid(CAP);
      this.hitDirty = true;
      this.built = { tick: -1, epoch: -1, focus: -1, w: 0, h: 0, dosage: 0 };
      this.strandNt = new Float64Array(NG);
      // Flux markers: 4 fluxes × 128, fixed straight paths, age in render seconds (< 0 unused).
      this.mAge = new Float32Array(4 * MARKERS).fill(-1);
      this.mX0 = new Float32Array(4 * MARKERS); this.mY0 = new Float32Array(4 * MARKERS);
      this.mX1 = new Float32Array(4 * MARKERS); this.mY1 = new Float32Array(4 * MARKERS);
      this.mNext = new Int32Array(4);
      this.emitters = [new D.FluxEmitter(1e3), new D.FluxEmitter(1e3), new D.FluxEmitter(1e3), new D.FluxEmitter(1e3)];
      this.emitCount = new Int32Array(4);
      this.markerN = new Float64Array(4).fill(1e3);
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
    }

    // --- mount -----------------------------------------------------------------
    mount(els) {
      this.els = els;
      const app = this.app;
      this.canvas = els.canvas;
      this.ctx = this.canvas.getContext('2d');
      const genes = app.BTC.catalog.STRAINS['m1-lab'].genes;
      for (let i = 0; i < NG; i++) this.strandNt[i] = 3 * genes[i].length + 60;     // mRNA is 3L + 60 nt
      if (typeof ResizeObserver === 'function') {
        this.ro = new ResizeObserver(() => this.resize());
        this.ro.observe(els.stage);
      }
      this.resize();
      this.canvas.addEventListener('click', (e) => this.onTap(e));
      this.mountFocusBar(els.focus);
      els.legend.addEventListener('click', () => this.openKey());
    }

    resize() {
      const r = this.els.stage.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
      if (w === this.cssW && h === this.cssH && dpr === this.dpr) return;
      this.cssW = w; this.cssH = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.geom = G.create(w, h, this.geom ? this.geom.vertical : undefined);
      this.built.w = -1;
      this.dirty = true;
      this.updateScaleBar();
      this.app.requestPaint();
    }

    reset() {
      this.plan = createPlan();
      this.built.tick = -1;
      this.mAge.fill(-1);
      for (const e of this.emitters) e.reset();
      this.dirty = true;
    }

    setVisible(v) { this.visible = v; if (v) { this.dirty = true; this.resize(); } }

    /**
     * Genes outside labConfig.genesVisible keep running but are drawn in --muted, so colours stay
     * reserved for the genes a level is about (LEVELS §5.5.1); the key says so.
     */
    updateBackground() {
      const gv = this.app.labConfig.genesVisible;
      this.background = GENE_IDS.map((id) => gv !== 'all' && Array.isArray(gv) && gv.indexOf(id) < 0);
    }
    geneColor(i) { return this.background && this.background[i] ? 'muted' : 'g-' + GENE_IDS[i]; }
    isBackground(id) { return !!(this.background && this.background[GENE_IDS.indexOf(id)]); }

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
      const f = app.focusIndex();
      const epoch = view.clock.generation;
      plan(view, g, { focus: f, strandNt: this.strandNt }, p);
      this.n = 0; this.ng = 0;
      this.updateBackground();
      const genes = view.genes;

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

      // Loci (hit targets; drawn as gene-coloured ticks on the DNA).
      for (let i = 0; i < NG; i++) {
        this.group(K.LOCUS, this.geneColor(i), 1, 0);
        for (let l = 0; l < this.lobeCount; l++) {
          const j = l * NG + i;
          this.push(K.LOCUS, i, j, this.locusX[j], this.locusY[j], this.locusA[j], 0, 0);
        }
        this.endGroup();
      }

      // Transcripts in progress, then mature mRNA (focus gene as long strands, others as short marks).
      for (let i = 0; i < NG; i++) {
        if (!genes[i].nascent) continue;
        this.group(K.NASCENT, this.geneColor(i), 1, 0);
        this.nascent(genes[i], i, i === f);
        this.endGroup();
      }
      for (let i = 0; i < NG; i++) {
        const gi = genes[i];
        if (!gi.mRNA) continue;
        const isF = i === f;
        this.group(isF ? K.MRNA_FOCUS : K.MRNA, this.geneColor(i), 1, 0);
        for (let j = 0; j < gi.mRNA; j++) {
          const id = gi.mRNAIds[j];
          D.pos('m', id, epoch, null, this.tmp2);
          G.map(this.tmp2.x, 2 * this.tmp2.y - 1, g, this.tmp);
          const a = D.hash01('ma', id, epoch) * Math.PI * 2;
          const len = isF ? p.strandLen : 6 + 2 * D.hash01('ml', id, epoch);
          this.push(isF ? K.MRNA_FOCUS : K.MRNA, i, id, this.tmp.x, this.tmp.y, a, len, D.hash01('mj', id, epoch));
        }
        this.endGroup();
      }

      // Pooled ribosomes: making protein (filled), free (hollow), stalled (filled with a bar).
      this.group(K.RIB, 'ribosome', 0, 0); this.inside('rib', p.ribFilled, epoch, K.RIB, 255); this.endGroup();
      this.group(K.RIB_FREE, 'ribosome', 1, 0); this.inside('ribf', p.ribFree, epoch, K.RIB_FREE, 255); this.endGroup();
      this.group(K.RIB_STALLED, 'ribosome', 3, 0); this.inside('ribs', p.ribStalled, epoch, K.RIB_STALLED, 255); this.endGroup();

      // Focus polysome: ribosomes spread along the focus gene's strands.
      this.group(K.POLY, 'ribosome', 0, 0); this.polysome(genes[f], f, epoch); this.endGroup();

      // Proteins (cytoplasmic); membrane proteins are drawn with the membrane.
      for (let i = 0; i < NG; i++) {
        const shape = PAL.shape[GENE_IDS[i]];
        if (shape === 'membrane') continue;
        const n = p.protein[i] + p.hollow[i];
        this.geneRange[2 * i] = this.n;
        if (n > 0) {
          this.group(K.PROT, this.geneColor(i), p.hollow[i] ? 1 : 0, p.hollow[i]);
          this.inside(PKEY[i], n, epoch, K.PROT, i);
          this.endGroup();
        }
        this.geneRange[2 * i + 1] = this.n;
      }

      this.group(K.ATP, 'atp', 2, 0); this.inside('atp', p.atp, epoch, K.ATP, 255); this.endGroup();
      this.group(K.ADP, 'atp', 1, 0); this.inside('adp', p.adp, epoch, K.ADP, 255); this.endGroup();
      this.group(K.AA, 'aa', 0, 0); this.inside('aa', p.aa, epoch, K.AA, 255); this.endGroup();
      this.group(K.LAC_IN, 'sugar', 1, 0); this.inside('lin', p.lacIn, epoch, K.LAC_IN, 255); this.endGroup();

      // Membrane proteins: around the perimeter, oriented along the normal.
      for (let i = 0; i < NG; i++) {
        if (PAL.shape[GENE_IDS[i]] !== 'membrane') continue;
        const n = p.protein[i] + p.hollow[i];
        this.geneRange[2 * i] = this.n;
        if (n > 0) {
          this.group(K.PROT, this.geneColor(i), p.hollow[i] ? 1 : 0, p.hollow[i]);
          for (let k = 0; k < n; k++) {
            G.perimeter(D.hash01(PKEY[i], k, epoch), g, this.tmp);
            this.push(K.PROT, i, k, this.tmp.x, this.tmp.y, Math.atan2(this.tmp.ny, this.tmp.nx), 0, D.hash01('j', k, epoch));
          }
          this.endGroup();
        }
        this.geneRange[2 * i + 1] = this.n;
      }

      this.built.tick = view.tick; this.built.epoch = epoch; this.built.focus = f;
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
      if (this.gEnd[this.ng] > this.gStart[this.ng]) this.ng++;
    }
    push(kind, gene, src, x, y, ang, len, ph) {
      if (this.n >= CAP) return -1;
      const i = this.n++;
      this.bx[i] = x; this.by[i] = y; this.bkind[i] = kind; this.bgene[i] = gene; this.bsrc[i] = src;
      this.bang[i] = ang; this.blen[i] = len;
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

    /** Nucleoid outline and chromosome loop per lobe, sampled into stage px; loci positions. */
    buildNucleoid(view, epoch) {
      const g = this.geom, lobes = G.lobes(view.cell.dosage);
      this.lobeCount = lobes.length;
      const uv = this.uv, o = this.tmp;
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
        for (let i = 0; i < NG; i++) {
          const T = G.locusT(i), j = l * NG + i;
          G.loopPoint(ctl, T + 0.15, uv); G.map(uv.u, uv.v, g, o);
          const x1 = o.x, y1 = o.y;
          G.loopPoint(ctl, T - 0.15, uv); G.map(uv.u, uv.v, g, o);
          const x0 = o.x, y0 = o.y;
          G.loopPoint(ctl, T, uv); G.map(uv.u, uv.v, g, o);
          this.locusX[j] = o.x; this.locusY[j] = o.y; this.locusA[j] = Math.atan2(y1 - y0, x1 - x0);
        }
      }
    }

    /** Transcripts in progress: RNA polymerase rings along the gene, each trailing its growing strand. */
    nascent(gv, i, isFocus) {
      const n = gv.nascent;
      for (let j = 0; j < n; j++) {
        const l = this.lobeCount > 1 ? j % 2 : 0;
        const li = l * NG + i;
        const a = this.locusA[li], prog = gv.nascentProgress[j];
        const span = isFocus ? 16 : 10;
        const x = this.locusX[li] + Math.cos(a) * (prog - 0.5) * span;
        const y = this.locusY[li] + Math.sin(a) * (prog - 0.5) * span;
        const side = j % 2 ? 1 : -1;
        const out = a + side * Math.PI / 2;
        const len = Math.max(2, prog * (isFocus ? this.plan.strandLen : 10));
        this.push(K.NASCENT, i, j, x, y, out, len, 0.5);
      }
    }

    /** The focus gene's ribosomes: floor(R/S) per strand, the remainder to strands in hash order. */
    polysome(gv, f, epoch) {
      const p = this.plan;
      const R = p.poly;
      const S = gv.mRNA + gv.nascent;
      if (R <= 0 || S <= 0) return;
      const each = Math.floor(R / S), extra = R - each * S;
      // Strands start after the mature-mRNA group of the focus gene; find them in the buffer.
      const first = this.findKind(K.MRNA_FOCUS, f), nasFirst = this.findKind(K.NASCENT, f);
      const pt = this.tmp2;
      const rot = D.hash01('ps', 0, epoch) * S;
      for (let s = 0; s < S; s++) {
        // The remainder goes to strands chosen by a hash rotation (stable within the epoch).
        const q = each + (((s + S - Math.floor(rot)) % S) < extra ? 1 : 0);
        if (!q) continue;
        const isM = s < gv.mRNA;
        const bi = isM ? first + s : nasFirst + (s - gv.mRNA);
        if (bi < 0 || bi >= this.n) continue;
        const x = this.bx[bi], y = this.by[bi], a = this.bang[bi], len = this.blen[bi];
        for (let k = 0; k < q; k++) {
          const t = (k + 0.5) / q;
          if (isM) wavePoint(x, y, a, len, t, pt);
          else { pt.x = x + Math.cos(a) * len * t; pt.y = y + Math.sin(a) * len * t; }
          const idx = this.push(K.POLY, f, s, pt.x, pt.y, a, 0, 0);
          if (idx >= 0) { this.bph[idx] = this.bph[bi]; this.bom[idx] = this.bom[bi]; }
        }
      }
    }
    findKind(kind, gene) {
      for (let i = 0; i < this.n; i++) if (this.bkind[i] === kind && this.bgene[i] === gene) return i;
      return -1;
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
      const b = this.built, f = app.focusIndex();
      if (b.tick !== view.tick || b.epoch !== view.clock.generation || b.focus !== f || b.w !== this.cssW ||
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
      this.drawGroups(c, P, K.NASCENT, K.NASCENT, 0, tau);
      this.drawGroups(c, P, K.MRNA, K.MRNA, A, tau);
      // The crowd (pooled ribosomes, other genes' proteins, ATP, amino acids) is dimmed so the watched gene reads.
      c.globalAlpha = CROWD_ALPHA;
      this.drawGroups(c, P, K.RIB, K.RIB_STALLED, A, tau);
      this.drawProteins(c, P, false, A, tau, true);
      this.drawGroups(c, P, K.ATP, K.LAC_IN, A, tau);
      c.globalAlpha = 1;
      this.drawProteins(c, P, false, A, tau, false);
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
      this.drawMarkers(c, P, reduced);
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
        if (kind === K.PROT) continue;
        this.drawGroup(c, P, gi, A, tau);
      }
    }

    /** Proteins: membrane or cytoplasmic; crowd = true for the other genes only, false for the focus gene only, undefined for all. */
    drawProteins(c, P, membrane, A, tau, crowd) {
      const focus = this.app.focusIndex();
      for (let gi = 0; gi < this.ng; gi++) {
        if (this.gKind[gi] !== K.PROT) continue;
        const gene = this.bgene[this.gStart[gi]];
        if ((PAL.shape[GENE_IDS[gene]] === 'membrane') !== membrane) continue;
        if (crowd === true && gene === focus) continue;
        if (crowd === false && gene !== focus) continue;
        this.drawGroup(c, P, gi, A, tau);
        if (gene === focus) this.drawGroup(c, P, gi, A, tau, true);      // accent ring on the focus gene's protein
      }
    }

    drawGroup(c, P, gi, A, tau, ring) {
      const kind = this.gKind[gi], style = this.gStyle[gi], s0 = this.gStart[gi], s1 = this.gEnd[gi];
      const base = c.globalAlpha;
      const color = P[this.gColor[gi]];
      const stroke = style === 1 || kind === K.NASCENT || kind === K.MRNA || kind === K.MRNA_FOCUS;
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
        c.lineWidth = kind === K.LOCUS ? 3 : kind === K.MRNA_FOCUS || kind === K.MRNA || kind === K.NASCENT ? 2 : 1.3;
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
        for (let i = s0; i < s1; i++) circle(c, this.bx[i], this.by[i], SZ.rnap);
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
        case K.NASCENT: {
          const a = this.bang[i], l = this.blen[i];
          c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
          break;
        }
        case K.MRNA_FOCUS: wavy(c, x, y, this.bang[i], this.blen[i]); break;
        case K.MRNA: mark(c, x, y, this.bang[i], this.blen[i]); break;
        case K.RIB: case K.RIB_FREE: case K.RIB_STALLED: ribo(c, x, y, SZ.rib); break;
        case K.POLY: ribo(c, x, y, SZ.poly); break;
        case K.PROT: {
          const gene = this.bgene[i], shape = PAL.shape[GENE_IDS[gene]];
          if (shape === 'membrane') rect(c, x, y, this.bang[i], 9, 5);
          else if (shape === 'tetramer') tetra(c, x, y, SZ.tetra);
          else if (shape === 'bar') rect(c, x, y, this.bang[i], 8, 3);
          else circle(c, x, y, SZ.prot);
          break;
        }
        case K.ATP: case K.ADP: diamond(c, x, y, SZ.atp); break;
        case K.AA: tri(c, x, y, SZ.aa); break;
        case K.LAC_IN: hex2(c, x, y, SZ.lacIn); break;
      }
    }

    // --- flux markers (LAB_UI §2.5): rates, not amounts ------------------------------
    markerScale(flux, speed) {
      // Smallest ladder value ≥ 10³ with at most 20 markers per real second.
      let N = 1e3;
      while (flux * speed / N > 20 && N < 1e12) N *= 10;
      return N;
    }

    spawnMarkers(view, dtSim) {
      const fl = view.flux, speed = this.app.speed();
      const rates = FLUX_RATE;
      rates[0] = fl.glucoseIn; rates[1] = fl.lactoseIn; rates[2] = fl.aaImported; rates[3] = fl.fermentationProductsOut;
      for (let k = 0; k < 4; k++) {
        const N = this.markerScale(rates[k], speed);
        if (N !== this.markerN[k]) { this.markerN[k] = N; this.emitters[k].N = N; this.emitters[k].reset(); }
        let spawn = this.emitters[k].add(rates[k] * dtSim);
        if (spawn > 8) spawn = 8;
        for (let s = 0; s < spawn; s++) this.spawn(k);
      }
    }

    spawn(k) {
      const g = this.geom, o = this.tmp;
      const e = this.emitCount[k]++;
      const gene = FLUX_GENE[k];
      let x, y, nx, ny;
      const r0 = gene >= 0 ? this.geneRange[2 * gene] : 0, r1 = gene >= 0 ? this.geneRange[2 * gene + 1] : 0;
      if (gene >= 0 && r1 > r0) {
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
      const a = outward ? -10 : 16, b = outward ? 16 : -10;
      this.mX0[j] = x + nx * a; this.mY0[j] = y + ny * a;
      this.mX1[j] = x + nx * b; this.mY1[j] = y + ny * b;
      this.mAge[j] = 0;
    }

    ageMarkers(dt) {
      for (let j = 0; j < 4 * MARKERS; j++) {
        if (this.mAge[j] < 0) continue;
        this.mAge[j] += dt;
        if (this.mAge[j] >= MARKER_LIFE_S) this.mAge[j] = -1;
      }
    }

    drawMarkers(c, P, reduced) {
      for (let k = 0; k < 4; k++) {
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
            if (k === 0) hex(c, x, y, 3.2); else if (k === 1) hex2(c, x, y, 2.4); else if (k === 2) tri(c, x, y, 3); else circle(c, x, y, 2.4);
            any = true;
          }
          if (!any) continue;
          c.globalAlpha = 1 - band / 3;
          if (k === 3) { c.fillStyle = P.products; c.fill(); }
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
      const words = C.geneWords(gv.id, app.labConfig.showNames);
      const k = key + '|' + gv.id;
      if (k === this.lastLabelKey) return;
      this.lastLabelKey = k;
      this.canvas.setAttribute('aria-label', F.fill(C.cell.canvasLabel, {
        sentence, name: words.name, m: F.count(gv.mRNA), n: F.count(gv.nascent), p: F.count(gv.proteinRounded),
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
      const words = C.geneWords(id, app.labConfig.showNames);
      this.fb.chip.style.background = 'var(--g-' + id + ')';
      LY.setText(this.fb.name, words.name);
      LY.setText(this.fb.sym, words.symbol);
      LY.setText(this.fb.countsM, F.fill(C.focus.counts, { m: F.count(gv.mRNA), n: F.count(gv.nascent) }));
      LY.setText(this.fb.countsP, F.fill(C.focus.protein, { p: F.count(gv.proteinRounded) }));
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
          const view = app.cell.observe();
          this.updateBackground();
          for (const id of GENE_IDS) {
            if (this.isBackground(id)) continue;
            const w = C.geneWords(id, app.labConfig.showNames);
            const st = C.geneState[view.geneById[id].geneState];
            body.appendChild(h('button', {
              class: 'btn row-btn picker-row' + (id === app.focusGene ? ' is-current' : ''), type: 'button', 'data-gene': id,
              'aria-current': id === app.focusGene ? 'true' : null,
              onclick: () => { app.setFocus(id); close(); },
            }, [h('span', { class: 'gene-chip', style: { background: 'var(--g-' + id + ')' } }),
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
        if ((kind === K.LOCUS || kind === K.NASCENT || kind === K.MRNA || kind === K.MRNA_FOCUS) && gene < NG) {
          this.app.setFocus(GENE_IDS[gene]);
        }
      }
      this.showChip(text, x, y);
    }

    describe(i) {
      const kind = this.bkind[i], gene = this.bgene[i], p = this.plan, app = this.app;
      const id = gene < NG ? GENE_IDS[gene] : null;
      const w = id ? C.geneWords(id, app.labConfig.showNames) : null;
      const noun = w ? (w.plural ? w.noun : w.noun) : '';
      const N = (x) => F.count(x);
      switch (kind) {
        case K.GLC_OUT: return F.fill(C.chip.glcOut, { N: N(p.glcOutN) });
        case K.LAC_OUT: return F.fill(C.chip.lacOut, { N: N(p.lacOutN) });
        case K.AA_OUT: return F.fill(C.chip.aaOut, { N: N(p.aaOutN) });
        case K.LOCUS: return F.fill(C.chip.locus, { name: w.name });
        case K.NASCENT: return F.fill(C.chip.nascent, { noun });
        case K.MRNA: case K.MRNA_FOCUS: return F.fill(C.chip.mRNA, { noun, id: this.bsrc[i] });
        case K.RIB: return F.fill(C.chip.ribosome, { N: N(p.ribN) });
        case K.RIB_FREE: return F.fill(C.chip.ribosomeFree, { N: N(p.ribN) });
        case K.RIB_STALLED: return F.fill(C.chip.ribosomeStalled, { N: N(p.ribN) });
        case K.POLY: return F.fill(C.chip.polysome, { noun, N: N(p.polyN) });
        case K.PROT: {
          const name = F.capital(w.protein);
          return F.fill(p.hollow[gene] ? C.chip.proteinHollow : C.chip.protein, { name: name + ' protein', N: N(p.P) });
        }
        case K.ATP: return F.fill(C.chip.atp, { N: N(p.atpN) });
        case K.ADP: return F.fill(C.chip.adp, { N: N(p.atpN) });
        case K.AA: return F.fill(C.chip.aa, { N: N(p.aaN) });
        case K.LAC_IN: return F.fill(C.chip.lacIn, { N: N(p.lacN) });
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
      const view = app.cell.observe();
      this.updateBackground();
      for (let i = 0; i < NG; i++) {
        if (this.background[i]) continue;
        const id = GENE_IDS[i], w = C.geneWords(id, app.labConfig.showNames), col = P['g-' + id], shape = PAL.shape[id];
        add((c) => {
          c.beginPath();
          if (shape === 'membrane') rect(c, 12, 12, -Math.PI / 2, 9, 5);
          else if (shape === 'tetramer') tetra(c, 12, 12, SZ.tetra);
          else if (shape === 'bar') rect(c, 12, 12, 0.6, 8, 3);
          else circle(c, 12, 12, SZ.prot);
          c.fillStyle = col; c.fill();
        }, F.fill(K2.protein, { name: F.capital(w.protein) }), N(p.P));
      }
      if (this.background.some(Boolean)) add((c) => { c.beginPath(); circle(c, 12, 12, SZ.prot); c.fillStyle = P.muted; c.fill(); }, K2.background, N(p.P));
      add((c) => { c.beginPath(); circle(c, 12, 12, SZ.prot); c.fillStyle = P['g-' + app.focusGene]; c.fill(); c.beginPath(); circle(c, 12, 12, 5.5); c.strokeStyle = P.accent; c.lineWidth = 1.5; c.stroke(); }, K2.proteinFocus, '');
      add((c) => { c.beginPath(); circle(c, 12, 12, SZ.prot); c.strokeStyle = P.muted; c.lineWidth = 1.3; c.stroke(); }, K2.hollow, '');
      add((c) => { c.beginPath(); wavy(c, 12, 12, 0, 18); c.strokeStyle = P['g-' + app.focusGene]; c.lineWidth = 2; c.stroke(); }, K2.mRNAFocus, N(1));
      add((c) => { c.beginPath(); mark(c, 12, 12, 0.7, 8); c.strokeStyle = P['g-gly']; c.lineWidth = 2; c.lineCap = 'round'; c.stroke(); }, K2.mRNA, N(1));
      add((c) => { c.beginPath(); c.moveTo(8, 16); c.lineTo(18, 6); c.strokeStyle = P['g-gly']; c.lineWidth = 2; c.stroke(); c.beginPath(); circle(c, 8, 16, SZ.rnap); c.fillStyle = P.inside; c.fill(); c.strokeStyle = P.rnap; c.lineWidth = 1.3; c.stroke(); }, K2.nascent, N(1));
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
      add((c) => { c.beginPath(); hex2(c, 12, 12, 2.4); c.strokeStyle = P.sugar; c.lineWidth = 1.4; c.stroke(); }, K2.fluxLac, M(1));
      add((c) => { c.beginPath(); tri(c, 12, 12, 3); c.fillStyle = P.aa; c.fill(); }, K2.fluxAa, M(2));
      add((c) => { c.beginPath(); circle(c, 12, 12, 2.4); c.fillStyle = P.products; c.fill(); }, K2.fluxOut, M(3));
      void view;
      LY.openSheet({
        title: C.key.title, className: 'key-sheet',
        build: (body) => {
          body.appendChild(h('ul', { class: 'key-list' }, rows));
          body.appendChild(h('ul', { class: 'key-notes' }, C.key.notes.map((t) => h('li', { text: t }))));
        },
      });
    }

    // --- test support: glyphs drawn per species and gene (LAB_UI §10.4) ----------------
    stats() {
      // Computed now from the cell's state, so it is current even while the view is hidden.
      if (this.geom) {
        const view = this.app.cell.observe();
        this.fitGeom(view);
        plan(view, this.geom, { focus: this.app.focusIndex(), strandNt: this.strandNt }, this.plan);
      }
      const p = this.plan, out = { mRNA: {}, nascent: {}, protein: {}, scales: {} };
      for (let i = 0; i < NG; i++) {
        out.mRNA[GENE_IDS[i]] = p.mRNA[i];
        out.nascent[GENE_IDS[i]] = p.nascent[i];
        out.protein[GENE_IDS[i]] = p.protein[i] + p.hollow[i];
      }
      Object.assign(out, {
        ATP: p.atp, ADP: p.adp, ribosomes: p.ribFilled, ribosomesFree: p.ribFree, ribosomesStalled: p.ribStalled,
        polysome: p.poly, aminoAcids: p.aa, lactoseInside: p.lacIn, glucoseOutside: p.glcOut + p.glcOutHollow,
        lactoseOutside: p.lacOut + p.lacOutHollow, aminoAcidsOutside: p.aaOut + p.aaOutHollow, total: p.total, buffer: this.n,
      });
      out.scales = { P: p.P, polysome: p.polyN, ribosomes: p.ribN, ATP: p.atpN, aminoAcids: p.aaN, lactose: p.lacN };
      return out;
    }
  }

  const PKEY = GENE_IDS.map((id) => 'p:' + id);
  const PAUSED_PENDING = C.cell.pausedBadge + ' · ' + C.cell.pendingNote;
  const FLUX_RATE = new Float64Array(4);
  const FX_KEY = ['fx0', 'fx1', 'fx2', 'fx3'], FP_KEY = ['fp0', 'fp1', 'fp2', 'fp3'];
  const FLUX_GENE = [0, 4, 3, -1];              // glucose through PtsG, lactose through LacY, amino acids through the importers

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
