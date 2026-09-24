// @deps btc-dots
/*
 * Be the Cell: the close-up views, pure (docs/PROLOGUE.md §3, §4).
 *
 *   planGene(view, detail, box, opts, out)   the Gene zoom: every glyph, from engine state, into a
 *                                            reusable plan (typed arrays; allocation-free after the first call)
 *   createGenePlan()                         the plan object (its lanes persist: a copy keeps its lane while it lives)
 *   planProtein(view, geneId, opts, out)     the Protein zoom: which machine, its per-copy rate, the slow factor,
 *                                            why it is idle, what does not fit
 *   machineState(model, tau, out)            the machine's cycle at render time tau: shape, molecule positions
 *   slowFactor(r)                            how many times slower a cycle of rate r is shown (0.6–3 s a cycle)
 *   MACHINES                                 what each gene's protein is drawn as, what fits it and what does not
 *   TEXT                                     every student string of the close-ups (lint: tests/closeup-pure.test.js)
 *   zRules(getState)                         the close-up narrator rules (keys z.*), for BTC.narrate's levelRules slot
 *
 * Everything drawn comes from the engine's view: counts, progress, fluxes. Positions come from
 * hashes (BTC.dots.hash01, keyed by molecule id, index and generation), never from a random
 * stream. What is schematic is labelled so (TEXT.gene.notes, TEXT.protein.notes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-dots.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.closeup = factory(B.dots);
  }
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const H = D.hash01;
  const NM_PER_NT_DNA = 0.34;         // B-DNA rise per letter
  const NM_PER_NT_RNA = 0.6;          // single-stranded RNA, stretched
  const RIB_NM = 23;                  // a bacterial ribosome, about 21–25 nm across
  const RNAP_NM = 13;                 // RNA polymerase, about 13 nm across the bubble
  const MIN_GLYPH_PX = 6;
  const MAX_GLYPHS = 600;             // hard cap per Gene frame (§3.3.2)
  const CAP = 1400;                   // buffer capacity (the cap plus headroom for the counting pass)
  const MAX_LANES = 12;
  const MAX_PROT = 8;
  const AA_PER_BEAD = 20;
  const BEAD_ROW = 6;                 // a chain is drawn folding as it grows, in rows of 6 beads; a row counts as one glyph
  const BINS = 16;
  const RIB_SCALES = [1, 2, 5, 10];
  const COPY_STEPS = [8, 6, 4, 2];     // drawn copies give way in these steps (§3.3.2: 6 → 4 → 2 on a phone)
  const SCALE_BARS = [20, 50, 100, 200, 500];

  // Glyph kinds of the Gene plan.
  const G = Object.freeze({ RNAP: 1, NASCENT: 2, MRNA: 3, RIB: 4, CHAIN: 5, PROT: 6, OPER: 7, REP: 8 });

  // ---------------------------------------------------------------------------
  // Words (student text; every string passes the lint of PROLOGUE.md §1.1)
  // ---------------------------------------------------------------------------
  const TEXT = Object.freeze({
    zoom: Object.freeze({
      cell: 'Cell', gene: 'Gene', protein: 'Protein', group: 'Zoom',
      segLabel: Object.freeze({ cell: 'Whole cell', gene: 'Close-up of the watched gene', protein: 'Close-up of one of its proteins' }),
      closerGene: 'Look closer ›', closerProtein: 'Look closer ›',
      closerGeneLabel: 'Look closer at this gene', closerProteinLabel: 'Look closer at one of these proteins',
    }),
    gene: Object.freeze({
      summaryCapped: 'showing {d} of {m} mRNAs',
      summary: '{r} ribosomes on {m} copies',
      summaryOne: '{r} ribosomes on 1 copy',
      summaryMade: '{r} ribosomes on {n} copies being made',
      summaryFinishing: '{r} ribosomes finishing chains', summaryNone: 'no copies',
      none: 'No copies of this gene right now.',
      outside: 'outside', membrane: 'membrane', inside: 'inside the cell', promoter: 'copying starts here (promoter)', dna: 'DNA',
      beingMade: 'copies being made',
      more: '+{n} more',
      moreMembrane: '+{n} more in the membrane',
      inline: Object.freeze({ mRNA: 'mRNA copy', ribosome: 'ribosome', chain: 'new chain', rnap: 'RNA polymerase', promoter: 'copying starts here (promoter)' }),
      moreCopies: '+{n} more copies with {r} ribosomes',
      moreCopy: '+1 more copy with {r} ribosomes',
      watched: 'this copy: read into {n}',
      watchedGone: 'this copy: read into {n}, then broken down',
      scale: '{nm} nm',
      shorter: 'mRNA drawn folded and shorter',
      legend: '1 strand = 1 mRNA · 1 ribosome drawn = {R}',
      canvasLabel: 'Gene view of {name}: {m} mRNA copies, {r} ribosomes, {p} proteins.',
      notes: Object.freeze([
        'Each wavy strand is one mRNA copy. It is drawn folded and shorter than it is.',
        'Where each copy sits is drawn for clarity.',
        'The model shares ribosomes evenly among a gene\'s copies.',
        'Ribosomes, RNA polymerase and the DNA are drawn to the scale bar.',
        'A new chain grows from each ribosome: one bead for every 20 amino acids.',
        'Chains of membrane proteins go into the membrane as they are made.',
      ]),
      // A membrane protein's ribosomes are held at the membrane while they work; the lanes draw them below it (m32).
      membraneNote: 'Ribosomes making a membrane protein are held at the membrane; here they are drawn in lanes below it, for clarity.',
      ribLarger: 'Ribosomes are drawn larger than scale here.',
      ribGlyph: '1 ribosome glyph = {R}',
      keyTitle: 'Key: gene close-up',
      glyphs: Object.freeze({
        dna: 'DNA (the gene in its colour)', rnap: 'RNA polymerase making a copy', mRNA: 'mRNA copy', ribosome: 'Ribosome reading a copy',
        chain: 'New chain (1 bead = 20 amino acids)', protein: 'Finished protein', broken: 'A copy broken down', made: 'A chain finished',
      }),
    }),
    protein: Object.freeze({
      oneOf: 'one {protein} of {count}',
      noneYet: 'None of these proteins yet.',
      noneYetLine: 'Switch the gene on and wait for the first one to be made.',
      rate: '{verb} about {r} {unit} a second.',
      slower: 'Shown {k} times slower than real life.',
      slowerCell: 'Shown {k} times slower than real life; the cell itself runs at {speed}.',
      fasterCell: 'Shown {k} times faster than real life; the cell itself runs at {speed}.',
      faster: 'Shown {k} times faster than real life.',
      realSpeed: 'Shown at its real speed.',
      cellSpeed: 'The cell itself runs at {speed}.',
      scale: '2 nm',
      flat: 'shape drawn flat',
      pocket: 'pocket',
      strip: Object.freeze({
        transporter: Object.freeze(['open outside', 'holding it', 'open inside', 'let go']),
        enzyme: Object.freeze(['empty', 'holding it', 'changed', 'let go']),
      }),
      standsFor: 'stands for about {n} {kind}',
      doesNotFit: '{Name} does not fit this pocket.',
      nofitShort: '{Name}: does not fit',
      short: Object.freeze({ glucose: 'glucose', lactose: 'lactose', aa: 'amino acid', allolactose: 'allolactose' }),
      whatNotFit: 'Show a sugar that does not fit',
      picture: 'picture, not the model',
      stateBound: 'Clamped on the DNA: copying cannot start.',
      stateFree: 'Allolactose in its pocket: it has let go of the DNA.',
      canvasLabel: 'Protein view: {line}',
      notes: Object.freeze([
        'One molecule, drawn at the average rate of all of them.',
        'Protein shapes are drawn flat. Real proteins are three-dimensional; the fit between pocket and molecule is real.',
        'Molecules are drawn as simple outlines.',
        'A molecule is drawn in the pocket only when it fits and the model says the job is being done.',
      ]),
      // Where the model's per-copy rate is far from a measured one, the key says so (BIOLOGY.md, open item 8).
      rateNotes: Object.freeze({
        lacY: 'Rates are the model’s; a real lactose transporter carries about twenty a second.',
      }),
      keyTitle: 'Key: protein close-up',
      glyphs: Object.freeze({
        glucose: 'glucose', g6p: 'glucose with a phosphate tag', galactose: 'galactose', lactose: 'lactose (milk sugar)',
        allolactose: 'allolactose', arabinose: 'arabinose', aa: 'amino acid', proton: 'hydrogen ion', piece: 'piece of sugar',
        atp: 'ATP (filled) and ADP (hollow)',
      }),
    }),
    // Machine cards (§4.3): where a protein works; a hidden gene's card shows only what has been seen.
    card: Object.freeze({
      membrane: 'Works in the membrane', inside: 'Works inside the cell',
      hiddenMembrane: 'its protein sits in the membrane', hiddenInside: 'its protein stays inside the cell', hiddenJob: 'job not seen yet',
    }),
    // Why a machine is idle (no digits: these are read aloud like narrator lines).
    idle: Object.freeze({
      noGlucose: 'No glucose outside.', noLactose: 'No lactose outside.', noAminoAcids: 'No amino acids outside.',
      noArabinose: 'No arabinose here.', noLactoseInside: 'No lactose inside the cell.', noSugar: 'No sugar is coming in.',
      energy: 'Energy is too low for it to work.', nothing: 'Nothing here fits it.',
      fliC: 'Made, but not built into a tail here, so it does no work.', ghost: 'in a cell with the other flagellum genes',
      lacA: 'It does no work that matters here.',
    }),
    units: Object.freeze({
      glucose: 'glucose molecules', lactose: 'lactose molecules', aa: 'amino acids', arabinose: 'arabinose molecules', hexose: 'sugar molecules',
      split: 'lactose molecules',
    }),
    verbs: Object.freeze({ carries: 'Carries', splits: 'Splits', breaks: 'Breaks down', builds: 'Builds' }),
    kinds: Object.freeze({ enzymes: 'enzymes', importers: 'importers' }),
  });

  // Close-up narrator rules (§3.6). {G}/{N}/{n}/{is}/{it} expand as in BTC.narrate (hidden names in 1.1).
  const Z_TEMPLATES = Object.freeze({
    'z.gene.off': '{G} {is} switched off, so no copies of {it} are being made.',
    'z.gene.tx': 'RNA polymerase is copying {G}; ribosomes already read the front of each copy.',
    'z.gene.polysome': 'Ribosomes read each copy one after another until it is broken down.',
    'z.gene.leftover': '{G} {is} off, but the copies already made are still being read.',
    'z.protein.work.transporter': 'Each molecule that fits {n} is carried across as the protein changes shape, over and over.',
    'z.protein.work.enzyme': 'Each molecule that fits {n} is changed as the protein changes shape, over and over.',
    'z.protein.work.repressor': 'The repressor holds the DNA until allolactose fits its pocket and changes its shape.',
    'z.protein.nofit': 'Molecules that do not fit {n} bump into {it} and move on.',
    'z.protein.idle': '{N} {is} ready, but nothing that fits {it} is here.',
  });

  // ---------------------------------------------------------------------------
  // What each protein is drawn as (§3.4.2, §4)
  // ---------------------------------------------------------------------------
  const MACHINES = Object.freeze({
    ptsG: Object.freeze({ kind: 'transporter', substrate: 'glucose', product: 'g6p', site: null, nonfit: 'lactose', verb: 'carries', unit: 'glucose' }),
    // The opening's glucose transporter in a muscle cell (not named in student text): the same pocket, no tag.
    glut: Object.freeze({ kind: 'transporter', substrate: 'glucose', product: 'glucose', site: null, nonfit: 'lactose', verb: 'carries', unit: 'glucose' }),
    lacY: Object.freeze({ kind: 'transporter', substrate: 'lactose', product: 'lactose', site: 'proton', nonfit: 'glucose', verb: 'carries', unit: 'lactose' }),
    aaImp: Object.freeze({ kind: 'transporter', substrate: 'aa', product: 'aa', site: null, nonfit: 'glucose', verb: 'carries', unit: 'aa', standsFor: 10, standsKind: 'importers' }),
    araE: Object.freeze({ kind: 'transporter', substrate: 'arabinose', product: 'arabinose', site: 'proton', nonfit: 'glucose', verb: 'carries', unit: 'arabinose' }),
    // No molecule is shown not fitting LacZ: glucose, its own product, binds its pocket too (m28).
    lacZ: Object.freeze({ kind: 'splitter', substrate: 'lactose', product: 'glucose', product2: 'galactose', nonfit: null, verb: 'splits', unit: 'split', chains: 4 }),
    gly: Object.freeze({ kind: 'enzyme', substrate: 'glucose', product: 'piece', atp: 'make', nonfit: 'lactose', verb: 'breaks', unit: 'hexose', standsFor: 10, standsKind: 'enzymes' }),
    aaSyn: Object.freeze({ kind: 'builder', substrate: 'piece', product: 'aa', atp: 'spend', nonfit: null, verb: 'builds', unit: 'aa', standsFor: 100, standsKind: 'enzymes' }),
    fliC: Object.freeze({ kind: 'rod', substrate: null, nonfit: null }),
    lacI: Object.freeze({ kind: 'repressor', substrate: 'allolactose', nonfit: 'glucose', chains: 4 }),
    lacA: Object.freeze({ kind: 'idle', substrate: null, nonfit: null, chains: 3 }),
    enzyme: Object.freeze({ kind: 'enzyme', substrate: 'glucose', product: 'piece', atp: null, nonfit: 'lactose', verb: 'breaks', unit: 'hexose' }),
  });

  /** The machine a gene's protein is drawn as (a gene not in the table is drawn as a generic enzyme). */
  function machineOf(geneId) { return MACHINES[geneId] || MACHINES.enzyme; }

  // ---------------------------------------------------------------------------
  // Rates and the slow factor (§3.4.1)
  // ---------------------------------------------------------------------------
  // A 1-2-5 ladder: for any rate from 0.01 to 10⁴ per s there is a factor that puts one cycle
  // between 0.6 and 3 s of real time (a decade ladder leaves gaps; test ZC-5).
  const FACTORS = (() => {
    const out = [];
    for (let e = -3; e <= 6; e++) for (const m of [1, 2, 5]) out.push(Math.round(m * Math.pow(10, e) * 1e6) / 1e6);
    return Object.freeze(out);
  })();

  /**
   * k such that one cycle, shown at r/k per s, takes 0.6–3 s of real time; of those, the one
   * closest to 2 s (slow enough to follow). k > 1: shown k times slower; k < 1: 1/k times faster.
   */
  function slowFactor(r) {
    if (!(r > 0)) return 1;
    let best = 1, bestD = Infinity;
    for (let i = 0; i < FACTORS.length; i++) {
      const k = FACTORS[i], period = k / r;
      if (period < 0.6 || period > 3) continue;
      const d = Math.abs(Math.log(period / 2));
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  /** r to two significant figures, as a number (41.37 → 41, 0.0123 → 0.012, 5432 → 5400). */
  function sig2(r) {
    if (!(r > 0)) return 0;
    return Number(r.toPrecision(2));
  }

  // ---------------------------------------------------------------------------
  // The Gene plan
  // ---------------------------------------------------------------------------
  function createGenePlan() {
    return {
      // geometry (CSS px)
      w: 0, h: 0, pxPerNm: 0, ribPx: 0, rnapPx: 0, ribToScale: true, strandLen: 0, laneH: 0, cols: 1, colW: 0, lanes: 0,
      dnaY: 0, dnaY2: 0, dnaX0: 0, genePx: 0, unitNt: 0, s0: 0, s1: 1, memY0: 0, memY1: 0, outY0: 0, protY: 0,
      nascentTop: 0, laneTop: 0, membraneGene: false, scaleNm: 100, scalePx: 0,
      // counts (all from the view)
      m: 0, n: 0, tl: 0, R: 0, P: 0, d: 0, moreCopies: 0, moreRib: 0, ribScale: 1, beads: true, protDrawn: 0, protMore: 0,
      drawnRibGlyphs: 0, total: 0, dosage: 1, operator: false, opBound: 0, watchedLane: -1,
      // lanes: a copy keeps its lane while it lives
      laneId: new Int32Array(MAX_LANES).fill(-1), laneX: new Float32Array(MAX_LANES), laneY: new Float32Array(MAX_LANES),
      laneQ: new Int32Array(MAX_LANES), laneBirth: new Int32Array(MAX_LANES),
      gone: new Int32Array(MAX_LANES), goneX: new Float32Array(MAX_LANES), goneY: new Float32Array(MAX_LANES), nGone: 0,
      // glyphs
      N: 0, kind: new Uint8Array(CAP), x: new Float32Array(CAP), y: new Float32Array(CAP), a: new Float32Array(CAP),
      p: new Float32Array(CAP), beadN: new Int16Array(CAP), ref: new Int32Array(CAP),
      cdf: new Float64Array(BINS + 1),
      hm: new Float64Array(512), hn: new Float64Array(512),     // rank hashes of the copies (mature, in progress)
      wn: new Float64Array(512), qn: new Int32Array(512), fn: new Float64Array(512),   // transcripts' weights, glyphs, remainders
      wSum: 0, G: 0, baseM: 0, fracM: 0, extra: 0,
      focus: -1, gene: '', epoch: 0, tick: -1,
    };
  }

  function push(o, kind, x, y, a, p, beads, ref) {
    if (o.N >= CAP) return -1;
    const i = o.N++;
    o.kind[i] = kind; o.x[i] = x; o.y[i] = y; o.a[i] = a; o.p[i] = p; o.beadN[i] = beads; o.ref[i] = ref;
    return i;
  }

  /** Chain progress (0 … 1) at quantile u of the gene's ribosome spread (the 16-bin CDF in o.cdf). */
  function invCdf(o, u) {
    const c = o.cdf;
    if (!(c[BINS] > 0)) return u;
    const t = u * c[BINS];
    for (let b = 0; b < BINS; b++) {
      if (t <= c[b + 1]) {
        const w = c[b + 1] - c[b];
        return (b + (w > 0 ? (t - c[b]) / w : 0.5)) / BINS;
      }
    }
    return 1;
  }

  /** Index of mRNA id in the gene's list, or −1. */
  function findId(gv, id) {
    for (let j = 0; j < gv.mRNA; j++) if (gv.mRNAIds[j] === id) return j;
    return -1;
  }

  /** Is copy index j (mature) or transcript j (nascent) already in a lane? */
  function inLanes(o, id) {
    for (let l = 0; l < MAX_LANES; l++) if (o.laneId[l] === id) return true;
    return false;
  }

  /**
   * The gene's ribosome glyphs G shared out over its translatable copies (§3.3.1). In the model every
   * copy that ribosomes can load gets the same share of new ribosomes each second (Engine §7.5), so a
   * copy holds ribosomes in proportion to how long it has been open to them, up to the time one chain
   * takes: a mature copy has a full share (weight 1), a copy still being made a part (o.wn). Largest
   * remainders, ties in the hash order of the copies (mature by molecule id, in progress by index),
   * so the glyphs over all copies add up to G exactly and each copy's count is stable.
   */
  function allot(o, gv, G) {
    const m = gv.mRNA, n = gv.nascent, W = o.wSum;
    o.G = G;
    if (!(W > 0)) { o.baseM = 0; o.fracM = 0; o.extra = 0; return; }
    const qm = (G * 1) / W;
    o.baseM = Math.floor(qm); o.fracM = qm - o.baseM;
    let used = m * o.baseM;
    for (let j = 0; j < n; j++) {
      const q = (G * o.wn[j]) / W, b = Math.floor(q);
      o.qn[j] = b; o.fn[j] = o.wn[j] > 0 ? q - b : -1;
      used += b;
    }
    o.extra = G - used;
  }
  /** Glyphs on mature copy j, or on transcript j (isNascent). */
  function quota(o, gv, isNascent, j) {
    const f = isNascent ? o.fn[j] : o.fracM, hv = isNascent ? o.hn[j] : o.hm[j];
    if (isNascent && f < 0) return 0;
    let r = 0;
    const m = gv.mRNA, n = gv.nascent, fm = o.fracM;
    if (fm > f) r += m;
    else if (fm === f) for (let i = 0; i < m; i++) { const x = o.hm[i]; if (x < hv || (x === hv && !isNascent && i < j)) r++; }
    for (let i = 0; i < n; i++) {
      const fi = o.fn[i];
      if (fi > f || (fi === f && (o.hn[i] < hv || (o.hn[i] === hv && (!isNascent || i < j))))) r++;
    }
    return (isNascent ? o.qn[j] : o.baseM) + (r < o.extra ? 1 : 0);
  }

  /**
   * Fills o (from createGenePlan) with the Gene zoom of view.genes[f].
   * detail: cell.detail(gene, out) (ribosomes by chain progress, 16 bins).
   * box: {w, h, top, bottom} in CSS px (top and bottom are kept free for the overlays).
   * opts: {focus: index, maxCopies: 6 | 12, watchedId: −1 | molecule id, epoch, maxScale}
   */
  function planGene(view, detail, box, opts, o) {
    const f = opts.focus, gv = view.genes[f], epoch = opts.epoch | 0;
    const w = box.w, h = box.h, top = box.top || 0, bottom = box.bottom || 0;
    const newGene = o.gene !== gv.id;
    if (newGene) { o.laneId.fill(-1); }
    o.gene = gv.id; o.focus = f; o.epoch = epoch; o.tick = view.tick;
    o.w = w; o.h = h; o.N = 0; o.nGone = 0;
    o.membraneGene = gv.location === 'membrane';
    // --- scale: the gene's transcription unit fits the width --------------------------------
    const unitNt = gv.unit_nt || gv.mRNA_nt || (3 * gv.length_aa + 60);
    o.unitNt = unitNt;
    const maxScale = opts.maxScale || 0.8;
    let px = (w - 32) / (unitNt * NM_PER_NT_DNA);
    px = px < 0.15 ? 0.15 : px > maxScale ? maxScale : px;
    o.pxPerNm = px;
    o.genePx = unitNt * NM_PER_NT_DNA * px;
    o.dnaX0 = Math.max(16, (w - o.genePx) / 2);
    const rib = RIB_NM * px, rnap = RNAP_NM * px;
    o.ribToScale = rib >= MIN_GLYPH_PX;
    o.ribPx = rib >= MIN_GLYPH_PX ? rib : MIN_GLYPH_PX;
    o.rnapPx = rnap >= MIN_GLYPH_PX ? rnap : MIN_GLYPH_PX;
    // The focus gene's coding part on the unit's strand (half the UTR in front of the first gene).
    const lead = 30;
    o.s0 = (gv.cistronOffset_nt + lead) / unitNt;
    o.s1 = (gv.cistronOffset_nt + lead + 3 * gv.length_aa) / unitNt;
    // Scale bar: the ladder value closest to 80 px.
    let bestNm = SCALE_BARS[0], bestD = Infinity;
    for (let i = 0; i < SCALE_BARS.length; i++) {
      const d = Math.abs(SCALE_BARS[i] * px - 80);
      if (d < bestD) { bestD = d; bestNm = SCALE_BARS[i]; }
    }
    o.scaleNm = bestNm; o.scalePx = bestNm * px;

    // --- vertical layout ----------------------------------------------------------------
    o.outY0 = top;
    o.memY0 = top + 20;
    o.memY1 = o.memY0 + 12;
    o.dosage = view.cell.dosage >= 2 ? 2 : 1;
    o.dnaY = h - bottom - 16 - (o.dosage === 2 ? 12 : 0);
    o.dnaY2 = o.dnaY + 12;
    const nascentH = Math.max(36, Math.min(80, 0.18 * h));
    o.nascentTop = o.dnaY - nascentH;
    o.protY = o.memY1 + 12;
    o.laneTop = o.membraneGene ? o.memY1 + 10 : o.protY + 14;
    const laneBottom = o.nascentTop - 6;
    o.cols = w >= 640 ? 2 : 1;
    // A margin on the right keeps room for the in-picture legend (mRNA copy, ribosome, new chain).
    o.legendW = w >= 640 ? 118 : 104;
    o.colW = (w - 16 - o.legendW) / o.cols;
    o.strandLen = Math.min(NM_PER_NT_RNA * unitNt * px, 0.9 * Math.min(w, h), o.colW - 16);

    // --- counts from the view ------------------------------------------------------------
    const m = gv.mRNA, n = gv.nascent;
    o.m = m; o.n = n;
    // Transcripts a gene's ribosomes can load: all of them for a first gene; for a later gene of a unit,
    // those whose polymerase has passed its start (the engine's translatableCopies rule, from the view).
    let nTl = 0;
    for (let j = 0; j < n; j++) if (gv.nascentProgress[j] * unitNt >= gv.cistronOffset_nt) nTl++;
    o.tl = m + nTl;
    for (let j = 0; j < m; j++) o.hm[j] = H('rk', gv.mRNAIds[j], epoch);
    // A transcript that ribosomes cannot load yet (a later gene of a unit) sorts last and gets no share.
    for (let j = 0; j < n; j++) o.hn[j] = gv.nascentProgress[j] * unitNt >= gv.cistronOffset_nt ? H('rkn', j, epoch) : 2 + j;
    // Weights: a copy in progress has been open to ribosomes for (letters past this gene's start) / (copying speed),
    // out of the time one chain takes (L / ribosome speed).
    const vTx = view.ribosomes.vTx_ntPerS, vRun = view.ribosomes.vRun_aaPerS;
    const Tc = vRun > 0 ? gv.length_aa / vRun : 0;
    o.wSum = m;
    for (let j = 0; j < n; j++) {
      const past = gv.nascentProgress[j] * unitNt - gv.cistronOffset_nt;
      let wj = past < 0 ? 0 : Tc > 0 && vTx > 0 ? past / vTx / Tc : 1;
      if (wj > 1) wj = 1;
      o.wn[j] = wj; o.wSum += wj;
    }
    const R = Math.round(gv.ribosomes);
    o.R = R;
    // Finished proteins are drawn as working machines (a four-chain LacZ is one glyph): counted in machines.
    const olig = gv.oligomer > 1 ? gv.oligomer : 1;
    const P = olig > 1 ? Math.round(gv.protein / olig) : gv.proteinRounded;
    o.P = P;
    o.oligomer = olig;
    o.protDrawn = P < MAX_PROT ? P : MAX_PROT;
    o.protMore = P - o.protDrawn;
    // Ribosome spread along the chain (the engine's detail), as a CDF.
    o.cdf[0] = 0;
    for (let b = 0; b < BINS; b++) o.cdf[b + 1] = o.cdf[b] + (detail && detail.ribosomeProgress ? detail.ribosomeProgress[b] : 1);
    // A lac unit: the operator, and LacI on it while bound.
    o.operator = !!(view.lac && view.lac.design && view.lac.design.lac && view.lac.design.lac.operator && gv.tu === 'tu_lac');
    o.opBound = o.operator ? view.lac.operatorBound : 0;

    // Copies broken down since the last plan: recorded (the renderer shows them breaking up) and their lanes freed.
    o.nGone = 0;
    for (let l = 0; l < MAX_LANES; l++) {
      const id = o.laneId[l];
      if (id < 0 || findId(gv, id) >= 0) continue;
      if (o.nGone < MAX_LANES) { o.gone[o.nGone] = id; o.goneX[o.nGone] = o.laneX[l] + o.strandLen / 2; o.goneY[o.nGone] = o.laneY[l]; o.nGone++; }
      o.laneId[l] = -1;
    }

    // --- budget: copies 6 → 4 → 2, then ribosome glyph scale, then beads as lines (§3.3.2) ---
    // As many lanes as fit at a readable height (a ribosome and its chain above each strand).
    const minLaneH = Math.max(24, o.ribPx + 12);
    const fitRows = Math.max(1, Math.floor((laneBottom - o.laneTop) / minLaneH));
    const maxC = Math.max(2, Math.min(MAX_LANES, opts.maxCopies || 6, fitRows * o.cols));
    // Lane counts to try: maxC, then the fixed steps below it (…, 4, 2).
    let nSteps = 1;
    for (let i = 0; i < COPY_STEPS.length; i++) if (COPY_STEPS[i] < maxC) nSteps++;
    let chosen = false;
    for (let si = 0; si < RIB_SCALES.length && !chosen; si++) {
      for (let ci = 0; ci < nSteps && !chosen; ci++) {
        for (let bi = 0; bi < 2 && !chosen; bi++) {
          const beads = bi === 0;
          if (!beads && (ci < nSteps - 1 || si < RIB_SCALES.length - 1)) continue;   // beads go last
          o.lanes = ci === 0 ? maxC : COPY_STEPS[COPY_STEPS.length - nSteps + ci];
          o.ribScale = RIB_SCALES[si];
          o.beads = beads;
          layout(view, gv, o, opts);
          if (o.total <= MAX_GLYPHS) chosen = true;
        }
      }
    }
    return o;
  }

  /** One layout attempt at the current (lanes, ribScale, beads); fills the glyphs and o.total. */
  function layout(view, gv, o, opts) {
    const epoch = o.epoch, m = o.m, n = o.n;
    o.N = 0;
    const lanes = o.lanes;
    // Lanes past the count are emptied (their copies go into the summary).
    for (let l = lanes; l < MAX_LANES; l++) o.laneId[l] = -1;
    // The watched copy is always drawn: in a lane of its own, or in place of the oldest copy.
    const wid = typeof opts.watchedId === 'number' ? opts.watchedId : -1;
    if (wid >= 0 && findId(gv, wid) >= 0 && !inLanes(o, wid) && lanes > 0) {
      let slot = -1;
      for (let l = 0; l < lanes && slot < 0; l++) if (o.laneId[l] < 0) slot = l;
      if (slot < 0) {
        let oldest = Infinity;
        for (let l = 0; l < lanes; l++) {
          const j = findId(gv, o.laneId[l]), b = gv.mRNABirthTick[j];
          if (b < oldest) { oldest = b; slot = l; }
        }
      }
      o.laneId[slot] = wid;
    }
    // Empty lanes take the youngest copies not yet drawn (by birth tick, then id), so new copies appear where the student looks.
    for (let l = 0; l < lanes; l++) {
      if (o.laneId[l] >= 0) continue;
      let best = -1, bb = -Infinity, bid = -1;
      for (let j = 0; j < m; j++) {
        const id = gv.mRNAIds[j], b = gv.mRNABirthTick[j];
        if (inLanes(o, id)) continue;
        if (b > bb || (b === bb && id > bid)) { bb = b; bid = id; best = j; }
      }
      if (best >= 0) o.laneId[l] = bid;
    }
    // Lane geometry.
    let d = 0;
    for (let l = 0; l < lanes; l++) if (o.laneId[l] >= 0) d++;
    o.d = d;
    o.moreCopies = m - d;
    const perCol = Math.max(1, Math.ceil(lanes / o.cols));
    const laneBottom = o.nascentTop - 6;
    o.laneH = Math.max(12, (laneBottom - o.laneTop) / perCol);
    o.watchedLane = -1;
    const Gtot = Math.round(o.R / o.ribScale);
    allot(o, gv, Gtot);
    let ribGlyphs = 0, beadsTotal = 0, total = 0;
    let drawnGlyphs = 0;
    for (let l = 0; l < lanes; l++) {
      const id = o.laneId[l];
      if (id < 0) continue;
      // Lanes fill rows spread out (0, 2, 4, 1, 3, 5): a few copies use the whole height; a copy keeps its lane.
      const col = Math.floor(l / perCol), k = l - col * perCol, half = Math.ceil(perCol / 2);
      const row = k < half ? 2 * k : 2 * (k - half) + 1;
      const cx = 8 + col * o.colW;
      const free = o.colW - 8 - o.strandLen;
      o.laneX[l] = cx + 8 + (free > 0 ? H('mx', id, epoch) * free : 0);
      o.laneY[l] = o.laneTop + (row + 0.78) * o.laneH;
      if (id === wid) o.watchedLane = l;
      const j = findId(gv, id);
      o.laneBirth[l] = gv.mRNABirthTick[j];
      push(o, G.MRNA, o.laneX[l], o.laneY[l], 0, o.strandLen, 0, l);
      total++;
      const q = quota(o, gv, false, j);
      o.laneQ[l] = q;
      drawnGlyphs += q;
      for (let k = 0; k < q; k++) {
        const u = (k + 0.5 + 0.8 * (H('rp', id * 131 + k, epoch) - 0.5)) / q;
        const x = invCdf(o, u < 0 ? 0 : u > 1 ? 1 : u);
        const t = o.s0 + (o.s1 - o.s0) * x;
        const rx = o.laneX[l] + o.strandLen * t, ry = o.laneY[l] - o.ribPx * 0.3;
        push(o, G.RIB, rx, ry, 0, x, 0, l);
        const beads = Math.round((x * gv.length_aa) / AA_PER_BEAD);
        // The chain leaves from the top of the large subunit (the small one sits on the strand).
        push(o, G.CHAIN, rx, ry - o.ribPx * 0.8, 0, x, beads, l);
        ribGlyphs++;
        beadsTotal += beads;
        total += 2 + (o.beads ? Math.ceil(beads / BEAD_ROW) : 0);
      }
    }
    // Transcripts in progress: RNA polymerase on the DNA, the copy growing from it (never dropped).
    for (let j = 0; j < n; j++) {
      const prog = gv.nascentProgress[j];
      const copy = o.dosage === 2 ? j % 2 : 0;
      const x = o.dnaX0 + o.genePx * prog, y = copy ? o.dnaY2 : o.dnaY;
      push(o, G.RNAP, x, y, 0, prog, 0, j);
      const len = (o.dnaY - 4 - o.nascentTop) * prog;
      push(o, G.NASCENT, x, y - o.rnapPx * 0.5, 0, len, 0, j);
      total += 2;
      // Ribosomes already reading this copy (bacteria): only on the part made so far.
      if (prog * o.unitNt < gv.cistronOffset_nt) continue;
      const q = quota(o, gv, true, j);
      drawnGlyphs += q;
      // Ribosomes started at a steady rate since the polymerase passed the start: spread evenly up to w.
      const wj = o.wn[j];
      for (let k = 0; k < q; k++) {
        const u = (k + 0.5 + 0.8 * (H('rpn', j * 131 + k, epoch) - 0.5)) / q;
        const x0 = (u < 0 ? 0 : u > 1 ? 1 : u) * wj;
        // Along the strand from its tip (the 5′ end, first made) down to the polymerase.
        const t = prog > 0 ? (o.s0 + (o.s1 - o.s0) * x0) / prog : 0;
        const along = len * (1 - t);
        const dx = -0.5, dy = -0.86;                     // the strand leans up and back from the polymerase
        const rx = x + dx * along, ry = y - o.rnapPx * 0.5 + dy * along;
        push(o, G.RIB, rx, ry, 1, x0, 0, -1 - j);
        const beads = Math.round((x0 * gv.length_aa) / AA_PER_BEAD);
        push(o, G.CHAIN, rx, ry - o.ribPx * 0.8, 1, x0, beads, -1 - j);
        ribGlyphs++;
        beadsTotal += beads;
        total += 2 + (o.beads ? Math.ceil(beads / BEAD_ROW) : 0);
      }
    }
    o.drawnRibGlyphs = ribGlyphs;
    // Copies not drawn: their ribosomes, in the summary line.
    o.moreRib = (Gtot - drawnGlyphs) * o.ribScale;
    // Finished proteins: in the membrane band, or a row in the cytoplasm; up to 8, then "+n more".
    for (let k = 0; k < o.protDrawn; k++) {
      const slot = (k + 0.5 + 0.6 * (H('pf', k, epoch) - 0.5)) / MAX_PROT;
      // After the left labels; a cytoplasmic row leaves room at its right end for "+n more".
      const x = 96 + slot * (o.w - (o.membraneGene ? 112 : 236));
      const y = o.membraneGene ? (o.memY0 + o.memY1) / 2 : o.protY;
      push(o, G.PROT, x, y, 0, 0, 0, k);
      total++;
    }
    if (o.protMore > 0) total++;
    // The DNA, promoter and labels.
    total += 4 + (o.dosage === 2 ? 2 : 0);
    if (o.operator) {
      for (let c = 0; c < o.dosage; c++) {
        const y = c ? o.dnaY2 : o.dnaY, x = o.dnaX0 - 10;
        push(o, G.OPER, x, y, 0, 0, 0, c);
        total++;
        if (c < o.opBound) { push(o, G.REP, x, y, 0, 0, 0, c); total++; }
      }
    }
    o.total = total;
    o._beadsTotal = beadsTotal;
  }

  // ---------------------------------------------------------------------------
  // The Protein zoom
  // ---------------------------------------------------------------------------
  function createProteinModel() {
    return {
      gene: '', machine: null, kind: '', count: 0, r: 0, k: 1, rShown: 0, working: false, idle: '', nonfit: null, nonfitPresent: false,
      share: 0, standsFor: 1, speed: 1, energyLow: false, none: false, substrate: null, lineKey: '',
    };
  }

  /**
   * What the Protein zoom shows for view.geneById[geneId] (pure). opts: {speed (sim s per real s)}.
   * r is the engine's per-copy work rate (workPerCopy_perS); the cycle runs at r/k, k = slowFactor(r).
   */
  function planProtein(view, geneId, opts, out) {
    const o = out || createProteinModel();
    const gv = view.geneById[geneId];
    const M = machineOf(geneId);
    o.gene = geneId; o.machine = M; o.kind = M.kind; o.substrate = M.substrate;
    // One working machine of how many: a four-chain enzyme counts once.
    o.count = gv ? (M.chains > 1 ? Math.round(gv.protein / M.chains) : gv.proteinRounded) : 0;
    o.none = !gv || gv.protein < 1;
    o.r = gv && !o.none ? gv.workPerCopy_perS : 0;
    o.k = slowFactor(o.r);
    o.rShown = sig2(o.r);
    o.working = o.r > 0 && !o.none;
    o.speed = opts && opts.speed ? opts.speed : 1;
    o.standsFor = M.standsFor || 1;
    o.energyLow = view.energy.E < 0.1;
    // The repressor: the share of operator copies it is clamped on, and of repressors holding allolactose.
    o.share = view.lac ? (view.lac.operatorCopies > 0 ? view.lac.operatorBound / view.lac.operatorCopies : 0) : 0;
    o.inducerShare = view.lac ? view.lac.inducerShare : 0;
    // A molecule that does not fit, present where the protein works.
    const env = view.env, fl = view.flux;
    let present = false;
    if (M.nonfit === 'lactose') present = M.kind === 'transporter' ? env.lactose_mM > 0 : view.lactose.inside > 0;
    else if (M.nonfit === 'glucose') present = M.kind === 'transporter' ? env.glucose_mM > 0 : fl.glucoseIn > 0 || fl.lactoseSplit > 0;
    o.nonfit = M.nonfit;
    o.nonfitPresent = present && !o.none;
    // Why it is idle.
    o.idle = '';
    if (!o.working && !o.none) o.idle = idleReason(view, geneId, M, o.energyLow);
    return o;
  }

  function idleReason(view, geneId, M, low) {
    const env = view.env;
    if (geneId === 'fliC') return 'fliC';
    if (geneId === 'lacA' || M.kind === 'idle') return 'lacA';
    if (M.kind === 'repressor') return '';
    if (geneId === 'araE') return 'noArabinose';
    if (M.kind === 'transporter') {
      if (M.substrate === 'glucose' && !(env.glucose_mM > 0)) return 'noGlucose';
      if (M.substrate === 'lactose' && !(env.lactose_mM > 0)) return 'noLactose';
      if (M.substrate === 'aa' && !(env.aminoAcids_mM > 0)) return 'noAminoAcids';
      return low ? 'energy' : 'nothing';
    }
    if (M.kind === 'splitter') return view.lactose.inside > 0 ? (low ? 'energy' : 'nothing') : 'noLactoseInside';
    if (M.kind === 'enzyme' || M.kind === 'builder') return view.flux.glucoseIn + view.flux.lactoseSplit > 0 ? (low ? 'energy' : 'nothing') : 'noSugar';
    return 'nothing';
  }

  // ---------------------------------------------------------------------------
  // The machine's cycle (§3.4.1, §4.1): shape and molecule positions at render time tau
  // ---------------------------------------------------------------------------
  function createMachineState() {
    return {
      phase: 0, cycle: 0, open: 1, lid: 0, bound: false, subShown: false, subX: 0, subY: 0, subA: 1, subForm: 0,
      prodShown: false, prodX: 0, prodY: 0, prod2X: 0, prod2Y: 0, prodA: 0, atpFilled: false, siteBound: false,
      clamped: false, inducer: false, nfShown: false, nfX: 0, nfY: 0, nfT: 0, panel: 0, period: 0,
    };
  }
  const frac = (x) => x - Math.floor(x);
  const smooth = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /**
   * Fills s for the model at render time tau (s; frozen while paused). Positions are in nm from
   * the machine's centre (y down: outside is negative y for a membrane protein).
   * The molecule sits in the pocket only when it fits and the model's rate is above 0 (§4.1 Fit);
   * a molecule that does not fit touches the rim and bounces off, never entering.
   */
  function machineState(model, tau, s, epoch) {
    const o = s || createMachineState();
    const M = model.machine, kind = model.kind;
    const cycles = model.working ? (tau * model.r) / model.k : 0;
    const ph = model.working ? frac(cycles) : 0;
    o.phase = ph; o.cycle = Math.floor(cycles);
    o.panel = Math.floor(tau / 2) % 4;
    o.subShown = false; o.prodShown = false; o.bound = false; o.subA = 1; o.prodA = 0; o.subForm = 0; o.lid = 0; o.siteBound = false;
    o.atpFilled = false;
    if (kind === 'transporter') {
      // open out → bound → closed → open in → released → back to open out.
      // open: +1 open to the outside, 0 closed, −1 open to the inside.
      o.open = ph < 0.2 ? 1 : ph < 0.36 ? lerp(1, 0, smooth(0.2, 0.36, ph)) : ph < 0.46 ? 0 : ph < 0.6 ? lerp(0, -1, smooth(0.46, 0.6, ph))
        : ph < 0.82 ? -1 : lerp(-1, 1, smooth(0.82, 0.98, ph));
      if (model.working) {
        o.subShown = ph < 0.8;
        if (ph < 0.2) { const t = smooth(0, 0.2, ph); o.subX = lerp(-0.6, 0, t); o.subY = lerp(-3.9, -0.2, t); }
        else if (ph < 0.6) { o.subX = 0; o.subY = -0.2 + 0.2 * smooth(0.36, 0.46, ph); o.bound = true; }
        else { const t = smooth(0.6, 0.8, ph); o.subX = lerp(0, 0.5, t); o.subY = lerp(0, 3.9, t); o.subA = 1 - smooth(0.7, 0.8, ph); }
        o.subForm = ph >= 0.55 && M.product === 'g6p' ? 1 : 0;        // PtsG tags the glucose as it carries it
        o.siteBound = M.site === 'proton' && ph >= 0.12 && ph < 0.66;
      }
    } else if (kind === 'splitter' || kind === 'enzyme' || kind === 'builder') {
      // substrate in → the groove closes (the shape change) → changed → products out.
      o.lid = ph < 0.25 ? smooth(0.12, 0.25, ph) : ph < 0.6 ? 1 : 1 - smooth(0.6, 0.72, ph);
      o.open = 1 - o.lid;
      if (model.working) {
        if (ph < 0.25) { const t = smooth(0, 0.22, ph); o.subShown = true; o.subX = lerp(-3.4, 0, t); o.subY = lerp(-3.6, -0.9, t); }
        else if (ph < 0.45) { o.subShown = true; o.subX = 0; o.subY = -0.9; o.bound = true; }
        else if (ph < 0.62) { o.prodShown = true; o.prodX = -0.35; o.prodY = -0.9; o.prod2X = 0.35; o.prod2Y = -0.9; o.prodA = 1; o.bound = true; }
        else { const t = smooth(0.62, 0.9, ph); o.prodShown = true; o.prodX = lerp(-0.35, -3.2, t); o.prodY = lerp(-0.9, -3.4, t); o.prod2X = lerp(0.35, 3.2, t); o.prod2Y = lerp(-0.9, -3.4, t); o.prodA = 1 - smooth(0.8, 0.95, ph); }
        o.atpFilled = M.atp === 'make' ? ph >= 0.45 && ph < 0.95 : M.atp === 'spend' ? ph < 0.45 : false;
      }
    } else if (kind === 'repressor') {
      // A population state, held for a 2 s display period: clamped on the operator with the bound share.
      const period = Math.floor(tau / 2);
      o.period = period;
      o.clamped = H('m:' + model.gene, period, epoch | 0) < model.share;
      o.inducer = !o.clamped && model.inducerShare > 0 && H('mi:' + model.gene, period, epoch | 0) < Math.max(model.inducerShare, 0.5);
      o.open = o.clamped ? 0 : 1;
    } else {
      o.open = 0;
    }
    // A molecule that does not fit: along a fixed path to the pocket's rim and back, every 1.5 s of render time.
    o.nfShown = !!model.nonfitPresent;
    if (o.nfShown) {
      const t = frac(tau / 1.5);
      o.nfT = t;
      const toRim = t < 0.45 ? smooth(0, 0.45, t) : 1 - smooth(0.45, 0.95, t);
      if (kind === 'transporter') { o.nfX = lerp(3.4, 1.2, toRim); o.nfY = lerp(-4.2, -3.0, toRim); }
      else if (kind === 'repressor') { o.nfX = lerp(3.6, 1.4, toRim); o.nfY = lerp(-3.8, -2.0, toRim); }
      else { o.nfX = lerp(3.6, 1.35, toRim); o.nfY = lerp(-3.9, -2.25, toRim); }
    }
    return o;
  }

  /**
   * A model for a picture with no cell behind it (the opening's transporter, a card): one cycle per
   * `period` s of scene time (k = 1: the scene's own clock, which the scene labels). opts: {period,
   * nonfit (a molecule that does not fit is present), working (default true), share, inducerShare}.
   */
  function sceneModel(machineId, opts) {
    const M = machineOf(machineId), o = opts || {};
    return {
      gene: machineId, machine: M, kind: M.kind, r: 1 / (o.period || 0.8), k: 1, rShown: 0, working: o.working !== false,
      nonfit: M.nonfit, nonfitPresent: !!o.nonfit && !!M.nonfit, share: o.share || 0, inducerShare: o.inducerShare || 0,
      none: false, count: 1, idle: '', standsFor: M.standsFor || 1, speed: 1, energyLow: false, substrate: M.substrate,
    };
  }

  // ---------------------------------------------------------------------------
  // Narrator rules for the close-ups (§3.6), for BTC.narrate(facts, memory, tick, levelRules)
  // ---------------------------------------------------------------------------
  // Lab rules 1–15 (drugs, starvation, recovery, lactose blocks, amino acids, division) keep priority.
  const LAB_FIRST = /^(drug\.|starve\.|recover$|gene\.noatp$|lac\.|aa\.low$|divided$)/;

  /**
   * The z.* rules. getState() → {zoom: 'cell'|'gene'|'protein', gene, view, model (planProtein's)} or null.
   * narrate: BTC.narrate (to let a lab rule of higher priority speak first).
   */
  function zRules(getState, narrate) {
    const rule = (key, template, test) => {
      const r = { key, template, gene: null, preempt: false };
      r.when = (f, mem, tick) => {
        const st = getState();
        if (!st || !st.view || st.zoom === 'cell') return false;
        if (!test(st)) return false;
        if (narrate) {
          const lab = narrate.narrate(f, mem, tick);
          if (LAB_FIRST.test(lab.key)) return false;
        }
        r.gene = st.gene;
        return true;
      };
      return r;
    };
    const gv = (st) => st.view.geneById[st.gene];
    const isOn = (g) => g.level !== 'off';
    return [
      rule('z.gene.off', Z_TEMPLATES['z.gene.off'], (st) => st.zoom === 'gene' && !isOn(gv(st)) && gv(st).mRNA + gv(st).nascent === 0),
      rule('z.gene.leftover', Z_TEMPLATES['z.gene.leftover'], (st) => st.zoom === 'gene' && !isOn(gv(st)) && gv(st).mRNA > 0),
      rule('z.gene.tx', Z_TEMPLATES['z.gene.tx'], (st) => st.zoom === 'gene' && isOn(gv(st)) && gv(st).nascent > 0 && gv(st).mRNA === 0),
      rule('z.gene.polysome', Z_TEMPLATES['z.gene.polysome'], (st) => st.zoom === 'gene' && gv(st).mRNA > 0 && gv(st).ribosomes >= gv(st).mRNA),
      rule('z.protein.work.repressor', Z_TEMPLATES['z.protein.work.repressor'], (st) => st.zoom === 'protein' && st.model && st.model.kind === 'repressor' && !st.model.none),
      rule('z.protein.work.transporter', Z_TEMPLATES['z.protein.work.transporter'], (st) => st.zoom === 'protein' && st.model && st.model.working && st.model.kind === 'transporter'),
      rule('z.protein.work.enzyme', Z_TEMPLATES['z.protein.work.enzyme'], (st) => st.zoom === 'protein' && st.model && st.model.working),
      rule('z.protein.nofit', Z_TEMPLATES['z.protein.nofit'], (st) => st.zoom === 'protein' && st.model && st.model.nonfitPresent),
      rule('z.protein.idle', Z_TEMPLATES['z.protein.idle'], (st) => st.zoom === 'protein' && st.model && !st.model.working && !st.model.none && st.model.kind !== 'rod' && st.model.kind !== 'idle'),
    ];
  }

  return {
    TEXT, Z_TEMPLATES, MACHINES, G, MAX_GLYPHS, MAX_LANES, MAX_PROT, AA_PER_BEAD, BEAD_ROW, RIB_NM, RNAP_NM, NM_PER_NT_DNA, NM_PER_NT_RNA, FACTORS,
    machineOf, slowFactor, sig2, createGenePlan, planGene, createProteinModel, planProtein, createMachineState, machineState, zRules, sceneModel,
  };
});
