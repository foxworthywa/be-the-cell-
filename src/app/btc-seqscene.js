// @deps btc-seq btc-seqdata
/*
 * Be the Cell: the opening's sequence scenes and the pictures of Prologue 2 (docs/PROLOGUE.md §2.3.2–§2.3.6,
 * §2.4.1, §2.4.2), as inline SVG in palette tokens (light and dark follow the page).
 *
 * Every letter, copy, codon and chain drawn here is computed by BTC.seq from BTC.seqdata.INS at the
 * moment it is drawn: the ladder around the start of the instructions, the copy made letter by letter
 * (its U in the accent colour), the codons read three at a time, the chain bead by bead, the two insulin
 * chains and their links (from INS.parts), the ribosomes reading the front of a copy still being made.
 * Nothing is a canned picture of letters. What is drawn larger than scale says so.
 *
 *   SeqScene.svg(kind, state, words) → markup        (pure; tests: size, labels, tokens, the letters)
 *     kinds: letters, start, tx, txDone, nucleusCopy, export, copies, tl, polysome, cut, muscle,
 *            sizes, bactRibosomes, bactDNA, cotx, glucose, lactose, economy
 *     state: {k, total, fill, runs, made, c, decoded, p, step, …} as the scene's activity has it
 *     words: the level's TEXT.labels (and TEXT.scale)
 *   SeqScene.model()  the computed sequences (for tests): mRNA, rna, protein, start, parts
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/btc-seq.js'), require('../shared/btc-seqdata.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.SeqScene = factory(B.seq, B.seqdata);
  }
})(typeof self !== 'undefined' ? self : this, function (SEQ, SD) {
  'use strict';

  const INS = SD.INS;
  const RNA = SEQ.transcribe(INS.mRNA);
  const START = SEQ.firstStart(RNA);
  const TR = SEQ.translate(RNA);
  const PROTEIN = TR.protein;
  const TEMPLATE = SEQ.complement(INS.mRNA);          // the other strand, letter by letter across from the gene's letters

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const r1 = (x) => Math.round(x * 10) / 10;
  const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? String(v[k]) : m));
  const open = (w, h, extra) => '<svg class="pl-svg" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"' + (extra || '') + '>';
  const txt = (x, y, s, cls, anchor) => '<text class="' + (cls || 'pl-t') + '" x="' + r1(x) + '" y="' + r1(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
  /** A horizontal scale bar with end ticks and its words above it. */
  function sbar(x, y, len, label) {
    return '<path class="pl-sb" d="M' + r1(x) + ' ' + y + 'h' + r1(len) + 'M' + r1(x) + ' ' + (y - 5) + 'v10M' + r1(x + len) + ' ' + (y - 5) + 'v10"/>' +
      txt(x + len / 2, y - 9, label, 'pl-s', 'middle');
  }
  /** A glucose outline (a six-ring with one short arm), size s, at (x, y); flip: the arm on the other side (galactose). */
  function sugar(x, y, s, flip) {
    let d = '';
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 3;
      d += (k ? 'L' : 'M') + r1(x + s * Math.cos(a)) + ' ' + r1(y + s * Math.sin(a));
    }
    const vx = x - 0.866 * s, vy = y + (flip ? 0.5 : -0.5) * s;
    d += 'ZM' + r1(vx) + ' ' + r1(vy) + 'l' + r1(-0.55 * s) + ' ' + r1((flip ? 0.33 : -0.33) * s);
    return '<path class="pl-mol" d="' + d + '"/>';
  }
  function lactose(x, y, s) { return sugar(x, y - 1.3 * s, s, true) + sugar(x, y + 1.3 * s, s) + '<path class="pl-mol" d="M' + r1(x) + ' ' + r1(y - 0.35 * s) + 'v' + r1(0.7 * s) + '"/>'; }
  /** A ribosome glyph: a large and a small lobe (x, y the reading site on the mRNA). */
  function ribosome(x, y, s) {
    return '<path class="pl-rib" d="M' + r1(x - 1.2 * s) + ' ' + r1(y - 0.15 * s) + 'a' + r1(1.2 * s) + ' ' + r1(1 * s) + ' 0 1 1 ' + r1(2.4 * s) + ' 0z"/>' +
      '<path class="pl-rib pl-rib2" d="M' + r1(x - 0.95 * s) + ' ' + r1(y + 0.15 * s) + 'a' + r1(0.95 * s) + ' ' + r1(0.62 * s) + ' 0 1 0 ' + r1(1.9 * s) + ' 0z"/>';
  }
  /** A wavy strand (an mRNA copy) from x0 to x1 at y. */
  function wavy(x0, x1, y, amp, cls) {
    let d = 'M' + r1(x0) + ' ' + r1(y);
    for (let x = x0 + 6; x <= x1; x += 6) d += 'L' + r1(x) + ' ' + r1(y + amp * Math.sin((x - x0) / 5));
    return '<path class="' + (cls || 'pl-copy') + '" d="' + d + '"/>';
  }
  /** Beads of a chain along a path of points [[x, y], …]; labels (three-letter names) on the first nLabels. */
  function beads(pts, r, cls, labels) {
    let d = '';
    for (const [x, y] of pts) d += 'M' + r1(x + r) + ' ' + r1(y) + 'a' + r + ' ' + r + ' 0 1 0 ' + r1(-2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + r1(2 * r) + ' 0';
    let out = '<path class="' + (cls || 'pl-bead') + '" d="' + d + '"/>';
    if (labels) labels.forEach((t, i) => { if (pts[i]) out += txt(pts[i][0], pts[i][1] + 3.5, t, 'pl-bl', 'middle'); });
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // The ladder of letters (A9, B1): the gene's letters on top, the other strand below, pairs between
  // ---------------------------------------------------------------------------------------------
  const PAIR = 30;                                    // 30 units per pair (0.34 nm): 1 nm = 88 units
  function ladder(from, n, W, words, box, tap) {
    const coding = INS.mRNA.slice(from, from + n), other = SEQ.complement(coding);
    const x0 = (W - PAIR * n) / 2 + PAIR / 2, yTop = 118, yBot = 186;
    let s = '<path class="pl-bb" d="M' + (x0 - 22) + ' ' + (yTop - 22) + 'H' + (x0 + PAIR * (n - 1) + 22) + 'M' + (x0 - 22) + ' ' + (yBot + 18) + 'H' + (x0 + PAIR * (n - 1) + 22) + '"/>';
    let rungs = '';
    for (let j = 0; j < n; j++) rungs += 'M' + (x0 + PAIR * j) + ' ' + (yTop + 8) + 'V' + (yBot - 22);
    s += '<path class="pl-rung" d="' + rungs + '"/>';
    if (box) {
      const bx = x0 + PAIR * box[0] - PAIR / 2 + 1, bw = PAIR * (box[1] - box[0]) - 2;
      s += '<rect class="pl-gbox" x="' + bx + '" y="' + (yTop - 26) + '" width="' + bw + '" height="34" rx="6"/>';
      s += '<path class="pl-gline" d="M' + (bx + 2) + ' ' + (yTop - 26) + 'v-26h34"/>' + txt(bx + 40, yTop - 48, words.start, 'pl-t pl-gt');
    }
    for (let j = 0; j < n; j++) {
      const x = x0 + PAIR * j, hot = tap && tap.i === j;
      s += '<text class="pl-lt' + (hot && tap.side === 0 ? ' is-hot' : '') + '" x="' + x + '" y="' + yTop + '" text-anchor="middle">' + coding[j] + '</text>';
      s += '<text class="pl-lt pl-lt-o' + (hot && tap.side === 1 ? ' is-hot' : '') + '" x="' + x + '" y="' + yBot + '" text-anchor="middle">' + other[j] + '</text>';
      if (hot) s += '<rect class="pl-hot" x="' + (x - 14) + '" y="' + (yTop - 24) + '" width="28" height="' + (yBot - yTop + 32) + '" rx="8"/>';
    }
    // Invisible tap zones for the letters (A9's exploring taps): one per pair.
    if (tap) for (let j = 0; j < n; j++) s += '<rect class="pl-tap" data-i="' + j + '" x="' + (x0 + PAIR * j - PAIR / 2) + '" y="' + (yTop - 40) + '" width="' + PAIR + '" height="' + (yBot - yTop + 70) + '"/>';
    s += txt(x0 - 20, yTop - 34, box ? words.genesLetters + ' →' : words.strand, 'pl-t') + txt(x0 - 20, yBot + 38, words.otherStrand, 'pl-s');
    return { s, coding, other };
  }
  function letters(state, words) {
    const L = ladder(51, 11, 340, words, null, { i: state && state.tap !== undefined ? state.tap : -1, side: state && state.side ? 1 : 0 });
    return open(340, 300) + L.s + sbar(20, 280, PAIR / 0.34, words.scaleLetters || '1 nm') + '</svg>';
  }
  function start(state, words) {
    const L = ladder(START - 5, 11, 340, words, [5, 8]);
    return open(340, 300) + L.s + sbar(20, 280, PAIR / 0.34, words.scaleLetters || '1 nm') + '</svg>';
  }

  // ---------------------------------------------------------------------------------------------
  // Copying (C1–C5): the two strands opened into a bubble; the copy pairs with the other strand
  // ---------------------------------------------------------------------------------------------
  function tx(state, words) {
    const st = state || {}, mode = st.mode || 'closed', N = INS.mRNA.length;
    const k = Math.max(0, Math.min(N, Math.floor(st.k || 0)));
    const W = 340, n = 11, x0 = 20;
    // The window follows RNA polymerase once it runs; the bubble (the strands held apart) is 8 letters around it.
    const w0 = mode === 'run' ? Math.max(0, Math.min(N - n, k - 7)) : 0;
    const bubble = mode === 'closed' ? null : mode === 'run' ? [Math.max(0, k - 6), k + 1] : [0, 7];
    const inB = (i) => !!bubble && i >= bubble[0] && i <= bubble[1];
    const edge = (i) => !!bubble && (i === bubble[0] - 1 || i === bubble[1] + 1);
    // Rows: the two strands paired (closed), held apart in the bubble; the copy pairs with the other strand there.
    const yC = (i) => (inB(i) ? 70 : edge(i) ? 104 : 126), yT = (i) => (inB(i) ? 236 : edge(i) ? 196 : 174);
    const X = (i) => x0 + PAIR * (i - w0);
    // A little taller than the other pictures: two rows of notes under the strands' names at the foot.
    let s = open(W, 328);
    if (bubble) {
      const bx0 = Math.max(2, X(bubble[0]) - 18), bx1 = Math.min(W - 2, X(bubble[1]) + 18);
      s += '<rect class="pl-rnap" x="' + bx0 + '" y="46" width="' + (bx1 - bx0) + '" height="214" rx="36"/>';
      s += txt(bx0 + 10, 40, words.rnap, 'pl-t');
    }
    let rungs = '', cl = '', tl = '', cp = '', bbC = '', bbT = '';
    for (let j = 0; j < n; j++) {
      const i = w0 + j, x = X(i);
      if (i >= N) break;
      const hot = mode === 'fill' && i === k && k < (st.fillN || 6);
      bbC += (j ? 'L' : 'M') + x + ' ' + (yC(i) - 22);
      bbT += (j ? 'L' : 'M') + x + ' ' + (yT(i) + 10);
      cl += '<text class="pl-lt" x="' + x + '" y="' + yC(i) + '" text-anchor="middle">' + INS.mRNA[i] + '</text>';
      tl += '<text class="pl-lt pl-lt-o' + (hot ? ' is-hot' : '') + '" x="' + x + '" y="' + yT(i) + '" text-anchor="middle">' + TEMPLATE[i] + '</text>';
      if (!inB(i)) rungs += 'M' + x + ' ' + (yC(i) + 8) + 'V' + (yT(i) - 22);
      if (i < k && inB(i)) {
        const b = RNA[i];
        cp += '<text class="pl-lt' + (b === 'U' ? ' pl-u' : ' pl-lt-c') + '" x="' + x + '" y="188" text-anchor="middle">' + b + '</text>';
        rungs += 'M' + x + ' 194V' + (yT(i) - 22);
      }
      if (hot) {
        cp += '<rect class="pl-slot" x="' + (x - 13) + '" y="166" width="26" height="30" rx="5"/>' + txt(x, 188, '?', 'pl-lt pl-q', 'middle');
        tl += '<rect class="pl-hotbox" x="' + (x - 14) + '" y="' + (yT(i) - 24) + '" width="28" height="32" rx="6"/>';
      }
    }
    s += '<path class="pl-bb" d="' + bbC + '"/><path class="pl-bb pl-bb-o" d="' + bbT + '"/><path class="pl-rung" d="' + rungs + '"/>' + cl + tl;
    // The copy made so far leaves the bubble to the left (its letters behind the bubble, small, fading into the cell).
    if (bubble && k > bubble[0] && bubble[0] > w0) {
      const x1 = X(bubble[0]) - 16;
      s += '<path class="pl-copy" d="M' + (x1 + 14) + ' 178Q' + (x1 - 10) + ' 190 ' + (x1 - 30) + ' 214T' + Math.max(4, x1 - 120) + ' 240"/>';
    }
    s += cp;
    // The strands by what they do: the gene's letters (the coding strand) on top; the copy is built across from the
    // other one (the template strand), so it spells out the gene's letters with U for T.
    const top = words.coding || words.genesLetters, bot = String(words.template || words.otherStrand || ''), cut = bot.indexOf(' (');
    s += txt(8, 16, top + ' →', 'pl-s');
    s += cut < 0 ? txt(8, 282, bot, 'pl-s') : txt(8, 282, bot.slice(0, cut), 'pl-s') + txt(8, 296, bot.slice(cut + 1), 'pl-s');
    if (mode === 'fill' || mode === 'run') s += txt(W - 6, 31, fill(words.copied, { k, n: N }), 'pl-s pl-num', 'end');
    // While it runs, the speed; whenever the machine is drawn, that it is drawn smaller than scale (both at once in the run).
    if (mode === 'run') s += txt(W - 6, 310, words.realSpeed, 'pl-s', 'end');
    if (bubble) s += txt(W - 6, 324, words.drawnSmaller, 'pl-s', 'end');
    if (mode !== 'run') s += sbar(W - 94, 270, PAIR / 0.34, '1 nm');
    return s + '</svg>';
  }
  /** C5: the finished copy beside the gene, closed again. */
  function txDone(state, words) {
    const W = 340, N = RNA.length;
    let s = open(W, 300);
    // The gene: two closed strands, drawn as lines (its letters too small at this width).
    s += '<path class="pl-bb" d="M20 70H320M20 84H320"/><path class="pl-gline" d="M20 77H320"/>' + txt(20, 58, words.geneStays, 'pl-s');
    s += wavy(20, 320, 170, 4);
    s += txt(20, 140, fill(words.copyDone, { n: N }), 'pl-t');
    s += txt(20, 205, RNA.slice(0, 6) + '…', 'pl-lt pl-lt-s pl-lt-c') + txt(320, 205, '…' + RNA.slice(N - 6), 'pl-lt pl-lt-s pl-lt-c', 'end');
    return s + '</svg>';
  }

  // ---------------------------------------------------------------------------------------------
  // The nucleus with the copy (D1), the copy leaving through a pore (D2), copies again (D3)
  // ---------------------------------------------------------------------------------------------
  function nucleusBase(words) {
    let s = '<circle class="pl-l pl-nuc" cx="150" cy="150" r="118"/><circle class="pl-m" cx="150" cy="150" r="112" fill="none"/>';
    // Pores: gaps in the envelope.
    let d = '';
    for (let k = 0; k < 24; k++) { const a = (k / 24) * 2 * Math.PI; d += 'M' + r1(150 + 110 * Math.cos(a)) + ' ' + r1(150 + 110 * Math.sin(a)) + 'L' + r1(150 + 120 * Math.cos(a)) + ' ' + r1(150 + 120 * Math.sin(a)); }
    s += '<path class="pl-pore" d="' + d + '"/>';
    // Chromosomes, loosely tangled; the insulin gene marked on one.
    s += '<path class="pl-m" d="M90 110c20-30 50 10 30 30s-40 10-20 40 50-10 40 30M180 90c30 10 10 40 40 40s0 50-30 40M100 200c30 20 60-10 80 10"/>';
    s += '<path class="pl-chr" d="M150 120c20-10 40 20 20 40s-40 0-30 30"/><path class="pl-gline" d="M160 118l12-4"/>';
    s += txt(176, 108, words.geneHere, 'pl-t');
    s += txt(18, 22, words.nucleus, 'pl-t') + txt(274, 36, words.pore, 'pl-s', 'end');
    return s;
  }
  // The pore the copy leaves by (at the envelope's right, 15° up) and the copy's path out through it.
  const PORE = [150 + 115 * Math.cos(-0.26), 150 + 115 * Math.sin(-0.26)];
  function nucleusCopy(state, words) {
    let s = open(340, 300) + nucleusBase(words);
    s += wavy(PORE[0] - 70, PORE[0] - 8, PORE[1] + 12, 3) + txt(PORE[0] - 72, PORE[1] + 34, words.mRNA, 'pl-t');
    return s + txt(330, 292, words.dotsEnlarged, 'pl-s', 'end') + '</svg>';
  }
  function exportScene(state, words) {
    const p = Math.max(0, Math.min(1, (state && state.p) || 0));
    // Along a fixed path: from beside the pore, through it, to just outside the envelope (the gene stays where it is).
    const x = PORE[0] - 60 + 96 * p, y = PORE[1] + 12 - 30 * p;
    let s = open(340, 300) + nucleusBase(words);
    s += wavy(x - 22, x + 22, y, 3) + txt(Math.min(334, x + 26), y + 22, words.mRNA, 'pl-t', 'end');
    return s + txt(330, 292, words.dotsEnlarged, 'pl-s', 'end') + '</svg>';
  }
  /** D3: the gene copied again and again; each RNA polymerase along the gene has its copy growing behind it. */
  function copies(state, words) {
    const st = state || {}, N = INS.mRNA.length, runs = st.runs || [], made = st.made || 0;
    let s = open(340, 300);
    s += '<path class="pl-bb" d="M20 70H320M20 82H320"/><path class="pl-gline" d="M40 76H300"/>' + txt(40, 58, words.insulinGene, 'pl-t');
    for (const k of runs) {
      const x = 40 + (260 * k) / N;
      s += '<circle class="pl-rnapc" cx="' + r1(x) + '" cy="76" r="9"/>';
      if (k > 0) s += '<path class="pl-copy" d="M' + r1(x) + ' 86q-10 ' + r1(10 + (60 * k) / N) + ' ' + r1(-Math.min(60, (60 * k) / N)) + ' ' + r1(20 + (60 * k) / N) + '"/>';
    }
    for (let j = 0; j < Math.min(made, 12); j++) s += wavy(34 + (j % 4) * 72, 94 + (j % 4) * 72, 190 + Math.floor(j / 4) * 30, 3);
    s += txt(20, 280, fill(words.copies, { n: made }), 'pl-t pl-num');
    s += txt(320, 280, words.realSpeed, 'pl-s', 'end');
    return s + '</svg>';
  }

  // ---------------------------------------------------------------------------------------------
  // Reading (E1–E4): the copy's letters with codon frames; the ribosome over the codon it reads
  // ---------------------------------------------------------------------------------------------
  const L3 = 12;                                     // units per letter: letters drawn larger than scale (said on screen)
  /** The chain's path out of the ribosome: up, then back and forth in rows; returns point k along it (k in path units). */
  function chainPoint(k, exitX, exitY) {
    const rise = 18, rowW = 290, rowH = 26, left = 25;
    if (k <= rise) return [exitX, exitY - k];
    let t = k - rise, y = exitY - rise, x = exitX, dir = -1, room = exitX - left;
    for (let row = 0; row < 12; row++) {
      if (t <= room) return [x + dir * t, y];
      t -= room; x += dir * room;
      if (t <= rowH) return [x, y - t];
      t -= rowH; y -= rowH; dir = -dir; room = rowW;
    }
    return [x, y];
  }
  function tl(state, words) {
    const st = state || {}, mode = st.mode || 'frames';
    const c = Math.max(0, Math.min(TR.codons.length, Math.floor(st.c || 0)));          // codons read
    // The codon under the ribosome's reading site: the next one to read (the start codon on arrival; the stop at the end).
    const cur = mode === 'arrive' || mode === 'frames' ? 0 : mode === 'done' ? TR.codons.length - 1 : Math.min(c, TR.codons.length - 1);
    const W = 340, siteX = 170, y = 240;
    const first = START + 3 * cur - 12;
    let s = open(W, 300), lt = '', frames = '';
    for (let j = 0; j < 28; j++) {
      const i = first + j;
      if (i < 0 || i >= RNA.length) continue;
      const x = siteX + L3 * (j - 12) + L3 / 2;
      const inCds = i >= START && i < START + 3 * TR.codons.length;
      lt += '<text class="pl-lt pl-lt-s' + (RNA[i] === 'U' ? ' pl-u' : ' pl-lt-c') + '" x="' + r1(x) + '" y="' + y + '" text-anchor="middle">' + RNA[i] + '</text>';
      if (mode !== 'arrive' && inCds && (i - START) % 3 === 0) {
        const hot = i === START + 3 * cur;
        frames += '<rect class="pl-frame' + (hot ? ' is-hot' : '') + '" x="' + r1(x - L3 / 2) + '" y="' + (y - 16) + '" width="' + 3 * L3 + '" height="22" rx="4"/>';
      }
    }
    s += '<path class="pl-copyline" d="M0 ' + (y + 10) + 'H' + W + '"/>' + frames + lt;
    // The ribosome, about 25 nm across (58 units here, 10 nm is 46): over the codon it reads.
    s += ribosome(siteX + L3 * 1.5, y - 4, 58);
    // The chain: one bead per amino acid made so far, out of the ribosome's top; the first eight (the chain's start) named.
    const made = mode === 'done' ? PROTEIN.length : mode === 'arrive' || mode === 'frames' ? 0 : Math.min(PROTEIN.length, c);
    if (made > 0) {
      const exitX = siteX + L3 * 1.5, exitY = y - 80;
      if (made <= 8) {
        // A short chain: straight up out of the ribosome, the first amino acid (Met) furthest out.
        const pts = [], labels = [];
        for (let b = 0; b < made; b++) { pts.push([exitX, exitY - 12 - (made - 1 - b) * 24]); labels.push(SEQ.AA[PROTEIN[b]].three); }
        s += beads(pts, 11, 'pl-bead', labels);
      } else {
        // A long chain: the newest beads snake back and forth above the ribosome; the chain's start (its first eight
        // amino acids, named) reads left to right along the top.
        const small = [];
        let k = 0;
        for (let b = made - 1; b >= 8; b--) { small.push(chainPoint(k, exitX, exitY)); k += 8; }
        const named = [], labels = [];
        for (let b = 0; b < 8; b++) { named.push([24 + b * 25, 36]); labels.push(SEQ.AA[PROTEIN[b]].three); }
        const end = small[small.length - 1];
        s += '<path class="pl-chainlink" d="M' + r1(end[0]) + ' ' + r1(end[1]) + 'L' + named[7][0] + ' ' + named[7][1] + '"/>';
        s += beads(small, 3.4, 'pl-bead pl-bead-s') + beads(named, 11, 'pl-bead', labels);
      }
    }
    s += txt(W - 6, 16, fill(words.aminoAcids, { c: made, n: PROTEIN.length }), 'pl-s pl-num', 'end');
    s += txt(6, y + 34, words.mRNA, 'pl-t') + txt(siteX + 84, y - 56, words.ribosome, 'pl-t');
    // The speed stays said for the whole run (the chain's named start sits below it once it is long).
    if (mode === 'run') s += txt(6, 14, words.realSpeed, 'pl-s');
    s += txt(6, 292, words.lettersLarger, 'pl-s');
    s += sbar(W - 56, 292, 46, words.scaleRibosome || '10 nm');
    return s + '</svg>';
  }
  /** E4: four ribosomes on one copy, each with the chain it has built so far (the computed prefix). */
  function polysome(state, words) {
    const W = 340;
    let s = open(W, 300) + wavy(10, 330, 236, 2, 'pl-copy');
    const at = [18, 44, 70, 96];
    at.forEach((cd, n) => {
      const x = 30 + (280 * cd) / TR.codons.length;
      s += ribosome(x, 232, 16);
      const chain = SEQ.prefixChain(RNA, cd), pts = [];
      for (let b = 0; b < chain.length; b++) pts.push([x - 4 + 7 * Math.sin(b * 0.55), 212 - b * 1.7]);
      s += beads(pts, 2.2, 'pl-bead pl-bead-s');
      s += txt(x, 214 - chain.length * 1.7 - 6, String(chain.length), 'pl-s pl-num', 'middle');
      void n;
    });
    s += txt(10, 272, words.fourRibosomes, 'pl-t') + txt(330, 292, words.dotsEnlarged, 'pl-s', 'end');
    return s + '</svg>';
  }

  // ---------------------------------------------------------------------------------------------
  // F2: the middle piece cut out, insulin's two chains held by links (from INS.parts and the chain itself); the first
  // 24 amino acids were cut off already, as the chain was made (F1)
  // ---------------------------------------------------------------------------------------------
  function cut(state, words) {
    const P = INS.parts, W = 340;
    const B = SEQ.slice(PROTEIN, P.bChain[0], P.bChain[1]), A = SEQ.slice(PROTEIN, P.aChain[0], P.aChain[1]);
    const pos = {};
    let s = open(W, 300), d = '';
    const place = (chain, from, x0, y0) => {
      for (let i = 0; i < chain.length; i++) {
        const x = x0 + i * 10.4, y = y0;
        pos[from + i] = [x, y];
        d += '<circle class="pl-bead' + (chain[i] === 'C' ? ' pl-cys' : '') + '" cx="' + r1(x) + '" cy="' + y + '" r="5"/>';
      }
    };
    place(B, P.bChain[0], 18, 120);
    place(A, P.aChain[0], 60, 190);
    // Links between cysteines (the disulfides of INS.parts): A6–A11 within A, A7–B7 and A20–B19 between the chains.
    let links = '';
    for (const [a, b] of P.disulfides) {
      const p = pos[a], q = pos[b];
      if (!p || !q) continue;
      links += p[1] === q[1] ? 'M' + r1(p[0]) + ' ' + (p[1] + 5) + 'q' + r1((q[0] - p[0]) / 2) + ' 18 ' + r1(q[0] - p[0]) + ' 0' : 'M' + r1(p[0]) + ' ' + (p[1] - 5) + 'L' + r1(q[0]) + ' ' + (q[1] + 5);
    }
    s += '<path class="pl-link" d="' + links + '"/>' + d;
    s += txt(18, 104, words.bChain, 'pl-t') + txt(60, 222, words.aChain, 'pl-t') + txt(W - 8, 150, words.links, 'pl-s', 'end');
    // The middle piece cut out (with the pairs at its ends), faded, with how long it is.
    const mid = P.cutKR[1] - P.cutRR[0] + 1;
    let gone = '';
    for (let i = 0; i < mid; i++) gone += '<circle cx="' + r1(20 + i * 5.2) + '" cy="262" r="2.3"/>';
    s += '<g class="pl-gone">' + gone + '</g>' + txt(20, 250, words.cutAway + ' (' + mid + ')', 'pl-s');
    return s + txt(W - 8, 292, words.flat, 'pl-s', 'end') + '</svg>';
  }
  /** F3: insulin in the blood reaching a muscle cell, whose membrane gains glucose transporters. */
  function muscle(state, words) {
    const W = 340;
    let s = open(W, 300);
    s += '<rect class="pl-blood" x="0" y="30" width="' + W + '" height="70"/>' + txt(8, 24, words.blood, 'pl-t');
    let ins = '';
    for (let k = 0; k < 6; k++) { const x = 30 + k * 52, y = 55 + (k % 2) * 18; ins += 'M' + x + ' ' + y + 'h14M' + (x + 2) + ' ' + (y + 6) + 'h12M' + (x + 5) + ' ' + y + 'v6'; }
    s += '<path class="pl-ins" d="' + ins + '"/>' + txt(W - 8, 24, words.insulin, 'pl-t', 'end');
    s += '<path class="pl-memb" d="M0 170H' + W + 'M0 186H' + W + '"/>' + txt(8, 206, words.muscle, 'pl-t');
    let tr = '';
    for (let k = 0; k < 7; k++) { const x = 26 + k * 46; tr += 'M' + (x - 5) + ' 164v28M' + (x + 5) + ' 164v28'; }
    s += '<path class="pl-trans" d="' + tr + '"/>' + txt(W - 8, 226, words.transporters, 'pl-s', 'end');
    // Stored ones inside the cell, in small packets, moving up into the membrane (insulin moves them; it makes none).
    if (words.stored) {
      let ves = '', st = '', ar = '';
      for (const x of [40, 95, 150]) {
        ves += 'M' + (x + 13) + ' 254a13 13 0 1 0 -26 0a13 13 0 1 0 26 0';
        st += 'M' + (x - 4) + ' 244v20M' + (x + 4) + ' 244v20';
        ar += 'M' + x + ' 236V214M' + (x - 4) + ' 220l4-6 4 6';
      }
      s += '<path class="pl-m" d="' + ves + '"/><path class="pl-trans" d="' + st + '"/><path class="pl-arrow" d="' + ar + '"/>' + txt(8, 290, words.stored, 'pl-s');
    }
    return s + txt(W - 8, 292, words.dotsEnlarged, 'pl-s', 'end') + '</svg>';
  }

  // ---------------------------------------------------------------------------------------------
  // Prologue 2: the bacterium, its DNA, copying and reading at once, the two sugars, the economy
  // ---------------------------------------------------------------------------------------------
  function capsule(x, y, w, h, cls) {
    const r = h / 2;
    return '<path class="' + (cls || 'pl-l pl-f') + '" d="M' + r1(x + r) + ' ' + r1(y) + 'H' + r1(x + w - r) + 'a' + r1(r) + ' ' + r1(r) + ' 0 0 1 0 ' + r1(h) + 'H' + r1(x + r) + 'a' + r1(r) + ' ' + r1(r) + ' 0 0 1 0 ' + r1(-h) + 'z"/>';
  }
  /** Q1: one of your cells (about 12 µm) and a bacterium (about 2 µm long), to the same scale: 18 units per µm. */
  function sizes(state, words) {
    let s = open(340, 300);
    s += '<circle class="pl-l pl-f" cx="120" cy="150" r="108"/><circle class="pl-l pl-nuc" cx="104" cy="150" r="47"/>';
    s += capsule(272, 142, 36, 16) + txt(120, 28, words.betaCell, 'pl-t', 'middle') + txt(334, 180, words.bacterium, 'pl-t', 'end');
    return s + sbar(18, 292, 90, words.scale5um) + '</svg>';
  }
  /**
   * Q2: the bacterium (about 2 × 1 µm: 150 units per µm, the 1 µm bar 150 units), a few of its ribosomes and one mRNA
   * with ribosomes on it (ribosomes drawn larger than scale, and said so).
   */
  function bactRibosomes(state, words) {
    let s = open(340, 300) + capsule(20, 70, 300, 150);
    let rib = '';
    for (let k = 0; k < 34; k++) { const x = 50 + ((k * 73) % 240), y = 95 + ((k * 41) % 100); rib += 'M' + (x + 4) + ' ' + y + 'a4 3.4 0 1 1-8 0a4 3.4 0 1 1 8 0'; }
    s += '<path class="pl-rib" d="' + rib + '"/>' + wavy(90, 250, 150, 3);
    for (let k = 0; k < 4; k++) s += ribosome(110 + k * 36, 148, 7);
    s += txt(20, 56, words.bacterium, 'pl-t') + txt(250, 175, words.mRNA, 'pl-t') + txt(320, 240, words.fewRibosomes || words.ribosome, 'pl-s', 'end');
    return s + txt(320, 292, words.dotsEnlarged, 'pl-s', 'end') + sbar(20, 292, 150, words.scale1um) + '</svg>';
  }
  /** Q3: its DNA, one loop lying free in the cell (no nucleus), drawn far shorter than it is (about 1.6 mm stretched out). */
  function bactDNA(state, words) {
    let s = open(340, 300) + capsule(20, 70, 300, 150);
    // One closed loop, wound loosely (a wobbly ring, not a star: the old path also started off the ring).
    let d = '';
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * 2 * Math.PI, rr = 56 + 9 * Math.sin(5 * a + 0.6) + 6 * Math.cos(9 * a);
      d += (k ? 'L' : 'M') + r1(170 + rr * Math.cos(a) * 1.3) + ' ' + r1(145 + rr * Math.sin(a) * 0.9);
    }
    s += '<path class="pl-dna" d="' + d + 'z"/>' + txt(170, 60, words.dna, 'pl-t', 'middle') + txt(320, 236, words.noNucleus, 'pl-s', 'end');
    const dl = String(words.dnaLength || ''), c2 = dl.indexOf(': ');
    if (dl) s += c2 < 0 ? txt(320, 252, dl, 'pl-s', 'end') : txt(320, 252, dl.slice(0, c2 + 1), 'pl-s', 'end') + txt(320, 266, dl.slice(c2 + 2), 'pl-s', 'end');
    return s + sbar(20, 292, 150, words.scale1um) + '</svg>';
  }
  /**
   * Q4: RNA polymerase making an mRNA from the insulin sequence while ribosomes read its front end:
   * ribosomes only on codons already copied (computed), each with the chain it has built so far.
   */
  function cotx(state, words) {
    const k = (state && state.k) || 300;                        // letters copied so far
    let s = open(340, 300);
    s += '<path class="pl-bb" d="M10 80H330M10 92H330"/>';
    const px = 40 + (260 * k) / RNA.length;
    s += '<circle class="pl-rnapc" cx="' + r1(px) + '" cy="86" r="11"/>' + txt(px + 14, 70, words.rnap, 'pl-s');
    // The copy hangs from the polymerase: its front (the first letters) furthest away.
    const pt = (i) => { const f = 1 - i / k; return [px - 12 - 184 * f, 110 + 120 * f * f]; };
    let d = '';
    for (let i = 0; i <= k; i += 6) { const [x, y] = pt(i); d += (i ? 'L' : 'M') + r1(x) + ' ' + r1(y); }
    s += '<path class="pl-copy" d="' + d + '"/>';
    for (let cd = 0; START + 3 * cd + 3 <= k; cd += 22) {
      const [x, y] = pt(START + 3 * cd);
      s += ribosome(x, y - 3, 8);
      const chain = SEQ.prefixChain(RNA, cd);
      if (chain.length) {
        const pts = [];
        for (let b = 0; b < chain.length; b += 2) pts.push([x - 6 + 5 * Math.sin(b * 0.4), y - 12 - b * 0.9]);
        s += beads(pts, 1.8, 'pl-bead pl-bead-s');
      }
    }
    s += txt(14, 262, words.readFront, 'pl-s') + txt(330, 124, words.copyInProgress, 'pl-s', 'end');
    return s + txt(330, 292, words.dotsEnlarged, 'pl-s', 'end') + '</svg>';
  }
  function glucose(state, words) {
    let s = open(340, 300) + sugar(170, 130, 60);
    s += '<path class="pl-drop" d="M60 190c-18 26-22 42-4 50 18-8 14-24 4-50z"/>' + capsule(250, 210, 50, 22);
    return s + txt(170, 40, words.glucose, 'pl-t', 'middle') + txt(60, 268, words.blood, 'pl-s', 'middle') + txt(275, 254, words.bacterium, 'pl-s', 'middle') + '</svg>';
  }
  function lactoseScene(state, words) {
    let s = open(340, 300) + lactose(150, 150, 38);
    s += '<path class="pl-l pl-f" d="M250 110h54l-8 120h-38z"/><path class="pl-milk" d="M254 140h46l-6 86h-34z"/>';
    return s + txt(150, 30, words.lactose, 'pl-t', 'middle') + txt(277, 254, words.milk, 'pl-s', 'middle') + '</svg>';
  }

  /** S0–S8: the cell's economy, one piece added per step (a diagram, not to scale). */
  function economy(state, words) {
    const k = (state && state.step) || 0, W = 340;
    let s = open(W, 330) + capsule(30, 60, 280, 172, 'pl-l pl-f' + (k >= 8 ? ' pl-fade' : ''));
    if (k >= 2) {
      s += sugar(40, 40, 9) + sugar(68, 22, 9) + sugar(92, 42, 9);
      s += '<path class="pl-trans" d="M104 54v14M114 54v14"/><path class="pl-arrow" d="M109 48v42"/>' + txt(122, 84, words.transporter, 'pl-s');
    }
    if (k >= 3) {
      s += '<circle class="pl-enz" cx="109" cy="122" r="16"/>' + txt(109, 154, words.enzyme, 'pl-s', 'middle');
      s += '<path class="pl-arrow" d="M127 122h22"/>';
      s += '<path class="pl-atp" d="M160 114l7 8-7 8-7-8zM176 114l7 8-7 8-7-8z"/>' + txt(168, 104, words.atp, 'pl-t', 'middle');
    }
    if (k >= 4) {
      const bw = String(words.building || '').split(' ');
      s += '<path class="pl-arrow" d="M188 118L207 97M189 122h18M188 126L207 148"/>';
      s += txt(212, 92, bw[0] || '', 'pl-t') + txt(212, 106, bw.slice(1).join(' '), 'pl-t');
      s += txt(212, 127, words.other, 'pl-s') + txt(212, 154, words.upkeep, 'pl-s');
      s += '<path class="pl-atp-h" d="M232 166l6 7-6 7-6-7zM246 166l6 7-6 7-6-7z"/>' + txt(256, 177, words.spent, 'pl-s');
    }
    if (k >= 5) s += '<path class="pl-tag" d="M122 44L114 54"/><rect class="pl-tag" x="120" y="22" width="112" height="24" rx="6"/>' + txt(176, 39, fill(words.price, { atp: words.priceAtp || '' }), 'pl-s', 'middle');
    if (k >= 6) {
      s += '<path class="pl-gline" d="M70 204h32"/>' + txt(86, 196, words.gene, 'pl-s', 'middle');
      s += '<path class="pl-arrow" d="M106 204h10"/>' + wavy(120, 162, 204, 3) + txt(141, 222, words.copy, 'pl-s', 'middle');
      s += '<path class="pl-arrow" d="M166 204h10"/>' + ribosome(192, 202, 9);
    }
    if (k >= 7) s += '<path class="pl-worn" d="M232 198l8-6M244 204l8 2M234 212l10 4"/>' + txt(250, 254, words.worn, 'pl-s', 'middle');
    if (k >= 8) s += capsule(20, 288, 140, 36, 'pl-l pl-f') + capsule(180, 288, 140, 36, 'pl-l pl-f') + txt(170, 280, words.divides, 'pl-t', 'middle');
    return s + '</svg>';
  }

  const KINDS = { letters, start, tx, txDone, nucleusCopy, export: exportScene, copies, tl, polysome, cut, muscle,
    sizes, bactRibosomes, bactDNA, cotx, glucose, lactose: lactoseScene, economy };

  /** The markup for one picture; unknown kinds draw an empty frame. */
  function svg(kind, state, words) {
    const f = KINDS[kind];
    return f ? f(state || {}, words || {}) : open(340, 300) + '</svg>';
  }

  return {
    svg, KINDS: Object.keys(KINDS),
    model: () => ({ mRNA: INS.mRNA, rna: RNA, protein: PROTEIN, start: START, codons: TR.codons.length, template: TEMPLATE, parts: INS.parts }),
    PAIR, NM_PER_PAIR: 0.34,
  };
});
