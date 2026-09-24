// @deps btc-content btc-layout btc-palette btc-seqscene btc-machine
/*
 * Be the Cell: the opening's host (docs/PROLOGUE.md §2.3, §2.4.1–§2.4.2, §2.5): the zoom ladder's drawings,
 * the ladder rail, the ring to tap for "Closer", pinch and keys, and every picture of the opening's scenes.
 *
 * Rungs (A0–A9 without the spools rung, §14 decision 6) are inline SVG drawn to their scale bars (≤ 6 KB
 * each, palette tokens, pure: PrologueView.svg(rung, text)); anything drawn larger than scale says so. The
 * sequence scenes and Prologue 2's pictures come from BTC.SeqScene (every letter from BTC.seq); the
 * machines (a glucose transporter in a muscle cell's membrane, a bigger sugar bouncing off, a chain
 * folding) are drawn on a canvas by BTC.machineArt / BTC.MachineView at the scene's own clock.
 *
 * Runs (the copy made at about real speed, the copies again, the ribosome reading to the stop, the copy
 * leaving through a pore) advance the scene's activity from this view's clock through
 * runner.sceneAct({advance}); the gate is the state the activity reaches, never the time that passed.
 *
 * Touch first: Closer (48 px) and Back (44 px) sit in the sheet; the pulsing 44 px ring on the thing to
 * zoom into equals Closer; a two-finger spread past ×1.25 steps closer, a pinch past ×0.8 steps back (the
 * drawing follows up to ×1.3 / ×0.77, then snaps); the rail at the right edge opens "Zoom levels" (visited
 * rungs can be jumped to). Laptop: + / − and the arrow keys, the mouse wheel one rung per notch.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-layout.js'), require('./btc-palette.js'), require('./btc-seqscene.js'), require('./btc-machine.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.PrologueView = factory(B.content, B.layout, B.palette, B.SeqScene, { art: B.machineArt, MachineView: B.MachineView, MachineCard: B.MachineCard });
  }
})(typeof self !== 'undefined' ? self : this, function (C, LY, PAL, SS, MV) {
  'use strict';

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const r1 = (x) => Math.round(x * 10) / 10;
  const W = 320, H = 300;
  const open = () => '<svg class="pl-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">';
  const label = (x, y, text, anchor, cls) => '<text class="' + (cls || 'pl-t') + '" x="' + x + '" y="' + y + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(text) + '</text>';
  const leader = (x1, y1, x2, y2) => '<path class="pl-k" d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '"/>';
  function scaleBar(x, y, len, text, vertical) {
    if (vertical) {
      return '<path class="pl-sb" d="M' + x + ' ' + y + 'v' + r1(-len) + 'M' + (x - 5) + ' ' + y + 'h10M' + (x - 5) + ' ' + r1(y - len) + 'h10"/>' +
        '<text class="pl-s" x="' + (x - 9) + '" y="' + r1(y - len / 2 + 4) + '" text-anchor="end">' + esc(text) + '</text>';
    }
    // A long label ("1,000 letters (340 nm)") starts at the bar's left end, so it never runs off the drawing.
    const long = String(text).length > 8;
    return '<path class="pl-sb" d="M' + x + ' ' + y + 'h' + r1(len) + 'M' + x + ' ' + (y - 5) + 'v10M' + r1(x + len) + ' ' + (y - 5) + 'v10"/>' +
      '<text class="pl-s" x="' + r1(long ? x : x + len / 2) + '" y="' + (y - 9) + '" text-anchor="' + (long ? 'start' : 'middle') + '">' + esc(text) + '</text>';
  }
  /** A note in two lines, split after its first colon ("drawn far shorter:" / "stretched out, …"), anchored at x. */
  function note2(x, y, text, anchor) {
    const t = String(text || ''), i = t.indexOf(': ');
    if (i < 0) return label(x, y, t, anchor, 'pl-s');
    return label(x, y, t.slice(0, i + 1), anchor, 'pl-s') + label(x, y + 14, t.slice(i + 2), anchor, 'pl-s');
  }
  // A small deterministic hash in [0, 1) for scattering dots (no random stream: every drawing is the same every time).
  const hash = (i, k) => { let h = (i * 374761393 + k * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  /** Circles as one path of arcs (compact: the islet has about 150 cells). */
  const dots = (pts, r) => pts.map(([x, y]) => 'M' + r1(x + r) + ' ' + r1(y) + 'a' + r + ' ' + r + ' 0 1 0 ' + r1(-2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + r1(2 * r) + ' 0').join('');

  // ---------------------------------------------------------------------------------------------
  // The rungs of the zoom ladder (PROLOGUE §2.3.1). Each returns {svg, ring: [x, y]} in viewBox units.
  // ---------------------------------------------------------------------------------------------
  const RUNGS = ['you', 'pancreas', 'islet', 'betaCell', 'nucleus', 'chromosome', 'stretch', 'helix', 'letters'];
  const RUNG = {
    /** A0: a person about 1.7 m tall; 150 units per metre, so 50 cm is 75 units; the field is 2 m. */
    you(T) {
      const L = T.labels, S = T.scale;
      return {
        ring: [161, 120],
        svg: open() + '<g class="pl-l pl-f">' +
          '<rect x="134" y="146" width="22" height="133" rx="10"/><rect x="164" y="146" width="22" height="133" rx="10"/>' +
          '<rect x="112" y="70" width="16" height="88" rx="8"/><rect x="192" y="70" width="16" height="88" rx="8"/>' +
          '<rect x="130" y="64" width="60" height="88" rx="18"/><rect x="153" y="54" width="14" height="14" rx="4"/>' +
          '<circle cx="160" cy="40" r="16"/></g>' +
          '<path class="pl-l pl-a" d="M148 120c6-5 18-6 26-2 3 2 2 5-1 6-8 2-18 1-25-4z"/>' +
          leader(178, 119, 214, 104) + label(218, 108, L.pancreas) + scaleBar(64, 279, 75, S.you, true) + '</svg>',
      };
    },
    /** A1: the pancreas (about 15 cm; 16 units per cm, 5 cm is 80) under the stomach; one islet is far too small to see, so a ring marks it. */
    pancreas(T) {
      const L = T.labels, S = T.scale;
      return {
        ring: [198, 164],
        svg: open() + '<path class="pl-l pl-m" d="M150 30c46-12 112 2 122 44 10 42-22 72-64 80-30 6-58-2-66-22"/>' +
          '<path class="pl-l pl-f" d="M40 190c0-28 30-40 54-30 30 12 70 2 110-6 40-8 70-8 80 4 6 8-2 16-20 18-40 4-80 16-120 26-36 10-104 20-104-12z"/>' +
          '<path class="pl-l pl-m" d="M56 192c50 2 110-18 214-28"/>' +
          label(262, 28, L.stomach, 'end', 'pl-s') + label(40, 234, L.pancreas) +
          label(312, 116, L.cluster, 'end') + label(312, 132, L.clusterNote, 'end', 'pl-s') + leader(250, 138, 208, 154) +
          scaleBar(24, 282, 80, S.pancreas) + '</svg>',
      };
    },
    /** A2: a slice through one islet (about 150 µm; 1.6 units per µm, 50 µm is 80): about 150 cells in section, beta cells (about 55%) tinted. */
    islet(T) {
      const L = T.labels, S = T.scale, beta = [], other = [];
      const cx = 160, cy = 138, sp = 17.5, rr = 112;
      let i = 0;
      for (let row = -8; row <= 8; row++) {
        const y = cy + row * sp * 0.866;
        for (let col = -8; col <= 8; col++) {
          const x = cx + col * sp + (row % 2 ? sp / 2 : 0);
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > rr * rr) continue;
          (hash(i++, 3) < 0.55 ? beta : other).push([x + (hash(i, 5) - 0.5) * 3, y + (hash(i, 7) - 0.5) * 3]);
        }
      }
      return {
        ring: [cx + sp, cy],
        count: beta.length + other.length,
        svg: open() + '<circle class="pl-l pl-f" cx="' + cx + '" cy="' + cy + '" r="' + (rr + 10) + '"/>' +
          '<path class="pl-cell pl-beta" d="' + dots(beta, 7.6) + '"/><path class="pl-cell" d="' + dots(other, 7.6) + '"/>' +
          label(300, 28, L.betaCells, 'end') + leader(262, 32, beta[4][0], beta[4][1]) + label(300, 286, L.otherCells, 'end', 'pl-s') +
          scaleBar(18, 290, 80, S.islet) + '</svg>',
      };
    },
    /** A3: one beta cell (about 12 µm; 21.3 units per µm, 5 µm is 107): its nucleus, and insulin packets (about 300 nm: 6 units). */
    betaCell(T) {
      const L = T.labels, S = T.scale;
      let cell = '';
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * 2 * Math.PI, rad = 124 + 6 * Math.sin(k * 2.3);
        cell += (k ? 'L' : 'M') + r1(160 + rad * Math.cos(a)) + ' ' + r1(140 + rad * 0.92 * Math.sin(a));
      }
      const pk = [];
      for (let k = 0; pk.length < 64 && k < 400; k++) {
        const a = hash(k, 1) * 2 * Math.PI, d = 70 + hash(k, 2) * 44, x = 160 + d * Math.cos(a), y = 140 + d * 0.92 * Math.sin(a);
        if ((x - 138) * (x - 138) / 3600 + (y - 146) * (y - 146) / 2916 < 1.15) continue;
        pk.push([x, y]);
      }
      return {
        ring: [138, 146],
        svg: open() + '<path class="pl-l pl-f" d="' + cell + 'z"/><ellipse class="pl-l pl-nuc" cx="138" cy="146" rx="60" ry="54"/>' +
          '<path class="pl-pk" d="' + dots(pk, 3.2) + '"/>' +
          label(12, 22, L.nucleus) + leader(40, 27, 106, 104) + label(308, 22, L.packets, 'end') + leader(284, 27, pk[0][0], pk[0][1]) +
          scaleBar(14, 292, 107, S.betaCell) + '</svg>',
      };
    },
    /** A4: the nucleus (about 6 µm; 45.7 units per µm, 1 µm is 46): envelope and pores (about 120 nm: 5.5 units), chromosomes; both 11s tinted. */
    nucleus(T) {
      const L = T.labels, S = T.scale;
      let pores = '';
      for (let k = 0; k < 40; k++) { const a = (k / 40) * 2 * Math.PI; pores += 'M' + r1(160 + 127 * Math.cos(a)) + ' ' + r1(150 + 127 * Math.sin(a)) + 'L' + r1(160 + 135 * Math.cos(a)) + ' ' + r1(150 + 135 * Math.sin(a)); }
      let terr = '';
      const blobs = [[110, 100, 30, 22], [170, 86, 28, 20], [224, 118, 26, 30], [96, 160, 24, 30], [150, 142, 30, 24], [210, 180, 30, 22],
        [120, 214, 30, 20], [180, 222, 24, 22], [236, 160, 16, 20], [70, 118, 14, 18]];
      for (const [x, y, rx, ry] of blobs) terr += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '"/>';
      return {
        ring: [150, 142],
        svg: open() + '<circle class="pl-l pl-nuc" cx="160" cy="150" r="133"/><circle class="pl-m" cx="160" cy="150" r="128" fill="none"/>' +
          '<path class="pl-pore" d="' + pores + '"/><g class="pl-terr">' + terr + '</g>' +
          // Two copies of chromosome 11, one from each parent: both tinted.
          '<ellipse class="pl-chr11" cx="150" cy="142" rx="30" ry="24"/><ellipse class="pl-chr11" cx="210" cy="180" rx="30" ry="22"/>' +
          label(300, 20, L.envelope, 'end', 'pl-s') + label(310, 292, L.pore, 'end', 'pl-s') + leader(296, 280, 262, 238) +
          label(160, 106, L.chr11Both || L.chr11, 'middle') + leader(212, 112, 212, 157) + scaleBar(14, 294, 46, S.nucleus) + '</svg>',
      };
    },
    /**
     * A5: chromosome 11 (about 2 µm; 128 units per µm, 500 nm is 64) as a loose tangle, the insulin gene's place near one end.
     * The thread is drawn far shorter than its DNA (about 135 million letters: 4.6 cm stretched out), and says so.
     */
    chromosome(T) {
      const L = T.labels, S = T.scale;
      let d = 'M70 70', x = 70, y = 70, a = 0.3, end = null;
      for (let k = 0; k < 150; k++) {
        a += (hash(k, 11) - 0.5) * 1.6;
        let nx = x + 9 * Math.cos(a), ny = y + 9 * Math.sin(a);
        if (nx < 40 || nx > 280) { a = Math.PI - a; nx = x + 9 * Math.cos(a); }
        if (ny < 36 || ny > 250) { a = -a; ny = y + 9 * Math.sin(a); }
        x = nx; y = ny;
        d += 'L' + r1(x) + ' ' + r1(y);
        if (k === 6) end = [x, y];
      }
      return {
        ring: end,
        svg: open() + '<path class="pl-thread" d="' + d + '"/><circle class="pl-gmark" cx="' + r1(end[0]) + '" cy="' + r1(end[1]) + '" r="5"/>' +
          label(r1(end[0] + 16), r1(end[1] - 14), L.geneHere) + note2(312, 14, L.threadNote, 'end') + scaleBar(18, 290, 64, S.chromosome) + '</svg>',
      };
    },
    /**
     * A7: a stretch of DNA straightened (about 5,000 letters over 300 units: 1,000 letters is 60), the insulin gene coloured.
     * Its real neighbourhood (GRCh38): the next gene, tyrosine hydroxylase, ends about 2,700 letters before the insulin
     * gene starts, so only its last stretch is in view; the rest of the view is DNA between genes.
     */
    stretch(T) {
      const L = T.labels, S = T.scale;
      const u = 0.06, gx = 190, gw = 1431 * u, nx1 = r1(gx - 2700 * u);
      return {
        ring: [gx, 150],
        svg: open() + '<path class="pl-bb" d="M10 146H310M10 154H310"/>' +
          '<rect class="pl-other" x="10" y="140" width="' + r1(nx1 - 10) + '" height="20" rx="3"/>' +
          '<rect class="pl-gband" x="' + gx + '" y="138" width="' + r1(gw) + '" height="24" rx="3"/>' +
          '<path class="pl-l" d="M' + gx + ' 132v36M' + r1(gx + gw) + ' 132v36"/>' +
          label(gx, 126, L.start, 'middle', 'pl-s') + label(r1(gx + gw), 126, L.end, 'middle', 'pl-s') +
          label(r1(gx + gw / 2), 100, L.insulinGene, 'middle') + label(12, 200, L.nextGene, 'start', 'pl-s') +
          leader(r1((10 + nx1) / 2), 188, r1((10 + nx1) / 2), 162) + label(310, 238, L.tooSmall, 'end', 'pl-s') +
          scaleBar(18, 290, 1000 * u, S.stretch) + '</svg>',
      };
    },
    /** A8: the double helix (2 nm across, a turn every 3.4 nm; 16 units per nm, 2 nm is 32) at the start of the insulin instructions. */
    helix(T) {
      const L = T.labels, S = T.scale;
      const cy = 150, rad = 16, pitch = 54.4, ph = 0.8 * Math.PI;
      let a = '', b = '', rungs = '';
      for (let x = 10; x <= 310; x += 4) {
        const t = ((x - 10) / pitch) * 2 * Math.PI;
        a += (x === 10 ? 'M' : 'L') + x + ' ' + r1(cy + rad * Math.sin(t));
        b += (x === 10 ? 'M' : 'L') + x + ' ' + r1(cy + rad * Math.sin(t + ph));
      }
      for (let x = 12; x <= 308; x += 5.44) {
        const t = ((x - 10) / pitch) * 2 * Math.PI;
        rungs += 'M' + r1(x) + ' ' + r1(cy + rad * Math.sin(t)) + 'L' + r1(x) + ' ' + r1(cy + rad * Math.sin(t + ph));
      }
      return {
        ring: [160, cy],
        svg: open() + '<path class="pl-rung" d="' + rungs + '"/><path class="pl-strand" d="' + a + '"/><path class="pl-strand pl-strand2" d="' + b + '"/>' +
          label(20, 110, L.strand) + leader(40, 114, 52, 134) + label(300, 196, L.otherStrand, 'end') + leader(270, 184, 258, 166) +
          label(160, 206, L.pair, 'middle', 'pl-s') + leader(160, 196, 160, 158) +
          scaleBar(18, 280, 32, S.helix) + '</svg>',
      };
    },
    /** A9: the helix untwisted into a ladder of letters (30 units per pair, 0.34 nm: 1 nm is 88): INS positions 52–62 and their partners. */
    letters(T, st) {
      return { ring: null, svg: SS.svg('letters', st || {}, Object.assign({}, T.labels, { scaleLetters: T.scale.letters })) };
    },
  };

  /** The SVG markup of a rung (pure; tests: size ≤ 6 KB, the scale bar's words, palette tokens only). */
  function svg(rung, text, state) {
    const f = RUNG[rung];
    return f ? f(text, state).svg : open() + '</svg>';
  }
  function ringOf(rung, text) { const f = RUNG[rung]; return f ? f(text).ring : null; }

  // ---------------------------------------------------------------------------------------------
  // Canvas scenes (F1 fold, F4 membrane, F5 the transporter at work, F6 a bigger sugar bouncing off)
  // ---------------------------------------------------------------------------------------------
  const CANVAS = { fold: 1, membrane: 1, machine: 1, bounce: 1 };
  const CARDS = { cards: 1, pairs: 1 };

  class PrologueView {
    constructor(app) {
      this.app = app; this.root = null; this.key = null; this.info = null; this.def = null;
      this.raf = 0; this.last = 0; this.tau = 0; this.mv = MV.MachineView ? new MV.MachineView() : null;
      this.pinch = { ids: [], x: [0, 0], y: [0, 0], d0: 1, ratio: 1, active: false };
      this.wheelAt = 0; this.tap = null; this.tapUntil = 0;
    }

    mount(root) {
      const h = LY.h, app = this.app;
      this.root = root;
      this.title = h('span', { class: 'pl-title' });
      this.figure = h('figure', { class: 'pl-figure', role: 'img' });
      this.art = h('div', { class: 'pl-art' });
      this.note = h('figcaption', { class: 'pl-note', hidden: true });
      this.ring = h('button', { class: 'pl-ring', type: 'button', hidden: true, 'data-action': 'rung-ring', onclick: () => this.closer('ring', 'tap') });
      this.rail = h('button', { class: 'pl-rail', type: 'button', hidden: true, 'data-action': 'rung-rail', onclick: () => this.openRail() });
      this.figure.appendChild(this.art);
      this.figure.appendChild(this.note);
      this.art.appendChild(this.ring);
      root.appendChild(h('div', { class: 'pl-bar' }, [
        h('button', { class: 'btn levels-btn', type: 'button', 'aria-label': C.game.levelsLabel, onclick: () => app.leaveLevel() },
          [h('span', { class: 'levels-icon', 'aria-hidden': 'true' }), h('span', { class: 'levels-word', text: C.game.levels })]),
        this.title,
      ]));
      this.stage = h('div', { class: 'pl-stage' }, [this.figure, this.rail]);
      root.appendChild(this.stage);
      // Pinch on the drawing only (touch-action: none there); letters are tapped (A9's exploring).
      this.art.addEventListener('pointerdown', (e) => this.pDown(e));
      this.art.addEventListener('pointermove', (e) => this.pMove(e));
      this.art.addEventListener('pointerup', (e) => this.pUp(e, false));
      this.art.addEventListener('pointercancel', (e) => this.pUp(e, true));
      this.art.addEventListener('click', (e) => this.artClick(e));
      this.art.addEventListener('wheel', (e) => {
        if (!this.isRung()) return;
        e.preventDefault();
        const now = performance.now();
        if (now - this.wheelAt < 250) return;
        this.wheelAt = now;
        if (e.deltaY < 0) this.closer('closer', 'wheel'); else if (e.deltaY > 0) this.back('wheel');
      }, { passive: false });
      document.addEventListener('keydown', (e) => {
        if (!this.isRung() || document.body.getAttribute('data-surface') !== 'prologue' || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target && e.target.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA') return;
        if (e.key === '+' || e.key === '=' || e.key === 'ArrowRight') { e.preventDefault(); this.closer('closer', 'key'); }
        else if (e.key === '-' || e.key === 'ArrowLeft') { e.preventDefault(); this.back('key'); }
      });
      // The drawing sits above the sheet: the sheet's height sets the stage's bottom padding.
      if (typeof ResizeObserver === 'function') {
        this.ro = new ResizeObserver(() => this.fitToSheet());
        this.mo = new MutationObserver(() => this.watchSheet());
        this.mo.observe(document.getElementById('sheets') || document.body, { childList: true });
      }
      window.addEventListener('resize', () => { this.fitToSheet(); this.placeRing(); if (this.canvas) this.drawCanvas(0); });
    }

    runner() { return this.app.level ? this.app.level.runner : null; }
    isRung() { return !!(this.info && this.info.scene && this.info.scene.rung); }

    /** The sheet that holds the scene's lines: the drawing is fitted above it (phone) or beside it (wider screens). */
    watchSheet() {
      const sheet = document.querySelector('#sheets .lv-story, #sheets .sheet');
      if (sheet === this.sheetEl) return;
      if (this.sheetEl && this.ro) this.ro.unobserve(this.sheetEl);
      this.sheetEl = sheet;
      if (sheet && this.ro) this.ro.observe(sheet);
      this.fitToSheet();
    }
    fitToSheet() {
      if (!this.stage) return;
      const compact = document.body.getAttribute('data-layout') === 'compact';
      const s = this.sheetEl && document.contains(this.sheetEl) ? this.sheetEl.getBoundingClientRect() : null;
      this.stage.style.paddingBottom = compact ? Math.round((s ? s.height : 0) + 8) + 'px' : '';
      this.stage.style.paddingRight = !compact && s ? Math.round(s.width + 40) + 'px' : '';
      this.placeRing();
      if (this.canvas) this.drawCanvas(0);
    }

    /**
     * Shows the scene of info (runner.sceneInfo()) with def's TEXT. A new rung zooms in from the ring (or out, going
     * back); pictures that change with the activity are redrawn; runs are advanced from this view's clock.
     */
    show(info, def, title) {
      LY.setText(this.title, title);
      const prev = this.info;
      this.info = info; this.def = def;
      const sc = info.scene, T = def.text;
      const kind = sc.rung ? 'rung:' + sc.rung : sc.picture;
      if (kind !== this.key) {
        const dir = prev && prev.scene && prev.scene.rung && sc.rung ? (info.index > prev.index ? 1 : -1) : 1;
        this.setKind(kind, sc, T, dir);
      } else this.refresh();
      this.syncRail();
      this.loop();
      this.watchSheet();
    }

    setKind(kind, sc, T, dir) {
      const h = LY.h;
      this.key = kind;
      this.canvas = null; this.tau = 0; this.tap = null;
      this.art.textContent = '';
      this.art.appendChild(this.ring);
      this.note.hidden = true;
      if (sc.rung) {
        this.art.insertAdjacentHTML('afterbegin', svg(sc.rung, T, this.letterState()));
        this.figure.setAttribute('aria-label', (T.alt && T.alt[sc.rung]) || '');
      } else if (CANVAS[kind]) {
        this.canvas = h('canvas', { class: 'pl-canvas', 'aria-hidden': 'true' });
        this.art.insertBefore(this.canvas, this.ring);
        this.figure.setAttribute('aria-label', (T.alt && T.alt[kind]) || '');
        this.drawCanvas(0);
      } else if (CARDS[kind]) {
        this.art.insertBefore(this.cards(kind, T), this.ring);
        this.figure.setAttribute('aria-label', (T.alt && T.alt[kind]) || '');
      } else {
        this.art.insertAdjacentHTML('afterbegin', this.pictureSvg(sc, T));
        this.figure.setAttribute('aria-label', (T.alt && T.alt[kind]) || '');
      }
      if (sc.note && T[sc.note]) { LY.setText(this.note, T[sc.note]); this.note.hidden = false; }
      // A 300 ms scale-and-crossfade centred on the ring the student zoomed into (100 ms crossfade under reduced motion).
      const reduced = this.app.reducedMotion && this.app.reducedMotion();
      const from = this.ringAt;
      this.placeRing();
      const origin = dir > 0 && from ? from : this.ringAt;
      this.art.style.transformOrigin = origin ? Math.round(origin[0]) + 'px ' + Math.round(origin[1]) + 'px' : '';
      this.art.classList.remove('pl-zoom-in', 'pl-zoom-out', 'pl-fade-in');
      void this.art.offsetWidth;
      this.art.classList.add(reduced ? 'pl-fade-in' : dir < 0 ? 'pl-zoom-out' : 'pl-zoom-in');
    }

    /** The drawing's state from the scene's activity (the letters copied, the codons read, the copies made …). */
    stateFor(sc) {
      const a = this.info && this.info.activity, spec = sc.activity;
      if (sc.picture === 'tx') {
        if (!a) return { mode: sc.tx, k: 0 };
        if (a.stage === 'fill') return { mode: 'fill', k: a.i, fillN: a.n };
        return { mode: 'run', k: a.k };
      }
      if (sc.picture === 'export') return { p: a ? a.k / a.total : 1 };
      if (sc.picture === 'copies') return a ? { runs: a.runs, made: a.made } : { runs: [], made: 3 };
      if (sc.picture === 'tl') {
        if (sc.tl === 'read' && a) return { mode: a.stage === 'run' || a.done ? 'run' : 'read', c: a.stage === 'decode' ? a.i : a.k };
        return { mode: sc.tl, c: 0 };
      }
      if (sc.picture === 'cotx') return { k: 300 };
      if (sc.picture === 'economy') return { step: sc.step };
      return {};
    }
    pictureSvg(sc, T) {
      const words = Object.assign({}, T.labels, { scaleRibosome: T.scale && T.scale.ribosome, scaleLetters: T.scale && T.scale.letters });
      if (sc.picture === 'economy' && this.def && this.def.economy) words.priceAtp = String(this.def.economy.transporterAtp).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return SS.svg(sc.picture, this.stateFor(sc), words);
    }
    /** Redraws a picture whose state changed (the activity moved on). */
    refresh() {
      const sc = this.info.scene, T = this.def.text;
      if (sc.rung === 'letters') { this.replaceSvg(svg('letters', T, this.letterState())); return; }
      if (sc.rung || CANVAS[this.key] || CARDS[this.key]) return;
      const s = this.pictureSvg(sc, T);
      if (s !== this.lastSvg) this.replaceSvg(s);
    }
    replaceSvg(markup) {
      this.lastSvg = markup;
      const old = this.art.querySelector('svg');
      if (old) old.remove();
      this.art.insertAdjacentHTML('afterbegin', markup);
    }
    letterState() { return this.tap && performance.now() < this.tapUntil ? { tap: this.tap.i, side: this.tap.side } : {}; }

    /** F7 and Q7: machine cards, what each does first (§4.3). */
    cards(kind, T) {
      const h = LY.h, CU = this.app.BTC.closeup, box = h('div', { class: 'pl-cards' });
      if (kind === 'cards') {
        const W2 = T.cardsF7;
        box.appendChild(MV.MachineCard.create(CU.MACHINES.glut, 'g-ptsG', { job: W2.transporter.job, name: W2.transporter.name, where: W2.transporter.where }));
        box.appendChild(MV.MachineCard.create(CU.MACHINES.enzyme, 'g-gly', { job: W2.enzyme.job, name: W2.enzyme.name, where: W2.enzyme.where }));
        box.appendChild(this.insulinCard(W2.insulin));
      } else {
        // Q7: the part's own words (what each does, with no ATP before S3 names it), the gene symbol in muted italics.
        const W2 = T.cardsQ7 || {}, G = this.app.BTC.content.genes;
        for (const id of ['ptsG', 'gly', 'lacY', 'lacZ']) {
          const wd = W2[id];
          box.appendChild(wd ? MV.MachineCard.create(CU.machineOf(id), 'g-' + id, { job: wd.job, name: wd.name, symbol: G[id].symbol, where: wd.where })
            : MV.MachineCard.forGene(id, { location: id === 'ptsG' || id === 'lacY' ? 'membrane' : 'cytoplasm' }));
        }
        box.classList.add('is-pairs');
      }
      return box;
    }
    /** Insulin's card: its two chains and their links, drawn from the sequence scene's own drawing. */
    insulinCard(words) {
      const h = LY.h, pic = h('div', { class: 'mc-pic mc-svg', 'aria-hidden': 'true' });
      pic.innerHTML = '<svg viewBox="0 0 96 96"><rect width="96" height="96" class="pl-cardbg"/>' +
        '<path class="pl-chainline" d="M12 36h72M24 62h48"/><path class="pl-link" d="M30 36v26M58 36v26M40 62q6 10 12 0"/>' +
        '<text class="pl-s" x="12" y="28">B</text><text class="pl-s" x="12" y="72">A</text></svg>';
      return h('div', { class: 'machine-card' }, [pic, h('div', { class: 'mc-text' }, [
        h('div', { class: 'mc-job', text: words.job }), h('div', { class: 'mc-name', text: words.name }), h('div', { class: 'mc-where', text: words.where }),
      ])]);
    }

    // --- the canvas scenes --------------------------------------------------------------------------
    drawCanvas(dt) {
      const cv = this.canvas;
      if (!cv) return;
      const r = this.art.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width), hh = Math.round(r.height);
      if (cv.width !== w * dpr || cv.height !== hh * dpr) { cv.width = w * dpr; cv.height = hh * dpr; cv.style.width = w + 'px'; cv.style.height = hh + 'px'; }
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const P = PAL.current(), T = this.def.text, L = T.labels, art = MV.art, CU = this.app.BTC.closeup;
      const reduced = this.app.reducedMotion && this.app.reducedMotion();
      this.tau += dt;
      c.clearRect(0, 0, w, hh);
      const s = Math.max(14, Math.min(38, Math.min(w / 9, hh / 11)));
      if (this.key === 'fold') {
        c.fillStyle = P.inside; c.fillRect(0, 0, w, hh);
        const t = reduced ? 1 : Math.min(1, this.tau / 1.4);
        // The chain's first 24 amino acids (INS.parts.signal) are cut off as it is made, so the rest folds: one bead per
        // amino acid of the computed chain after them (86); oily stretches (none in insulin: the maximum is under the
        // threshold) drawn thicker. Insulin's own colour (the prologue's gene colour), not a lab gene's.
        const SEQ = this.app.BTC.seq, model = SS.model(), protein = model.protein, oily = SEQ.oilyStretches(protein), sig = model.parts.signal[1];
        const col = P.insulin || P.muted, br = Math.max(2.4, Math.min(4, w / 110));
        art.drawChainFold(c, P, col, protein.length - sig, t, w / 2, hh / 2 - 10, Math.min(w - 40, 420), br,
          (i) => oily.some((x) => i + sig + 1 >= x.from && i + sig + 1 <= x.to));
        // The piece cut off, faded beside the fold, with how long it is.
        c.globalAlpha = 0.4; c.beginPath();
        for (let i = 0; i < sig; i++) { const x = 14 + i * br * 2.4; c.moveTo(x + br * 0.8, hh - 40); c.arc(x, hh - 40, br * 0.8, 0, 6.283185307179586); }
        c.fillStyle = col; c.fill(); c.globalAlpha = 1;
        this.canvasLabel(c, P, L.cutAway + ' (' + sig + ')', 10, hh - 58);
        this.canvasLabel(c, P, L.fold, 10, 18);
        this.canvasLabel(c, P, L.flat, w - 10, hh - 12, 'right');
        return;
      }
      const top = 28, bottom = 44;
      if (this.key === 'membrane') {
        const y = top + (hh - top - bottom) / 2;
        c.fillStyle = P.outside; c.fillRect(0, 0, w, y); c.fillStyle = P.inside; c.fillRect(0, y, w, hh - y);
        art.drawMembrane(c, P, 0, w, y, s);
        for (let k = 0; k < 5; k++) art.drawMol(c, P, 'glucose', w * (0.14 + 0.18 * k), y - s * (2.6 + (k % 2) * 1.4), s, 0, 1);
        this.canvasLabel(c, P, L.outside, 10, 18);
        this.canvasLabel(c, P, L.membrane + ' · ' + L.oily, 10, y - s * 1.6 - 12);
        this.canvasLabel(c, P, L.inside, 10, hh - 14);
        this.canvasLabel(c, P, L.glucose, w - 10, 18, 'right');
        return;
      }
      // F5 and F6: the glucose transporter of a muscle cell at work (one cycle every 0.8 s of the scene's clock).
      const model = CU.sceneModel('glut', { period: 0.8, nonfit: this.key === 'bounce' });
      const st = CU.machineState(model, this.tau, this.mstate || (this.mstate = CU.createMachineState()));
      this.mv.draw(c, {
        w, h: hh, top, bottom, model, st, P, color: P['g-ptsG'], reduced, tau: this.tau, strip: reduced, closeup: CU, dtReal: dt,
        labels: { outside: L.outside, membrane: L.membrane, inside: L.inside, pocket: L.pocket, nonfit: this.key === 'bounce' ? L.lactose + ': ' + L.notFit : '',
          picture: L.pictureOnly, strip: CU.TEXT.protein.strip },
      });
      // The cycle here takes 0.8 s; in your cells a transporter carries about a hundred glucose a second (M6).
      this.canvasLabel(c, P, L.slower, w - 10, 14, 'right');
      this.canvasLabel(c, P, L.flat, w - 10, hh - 12, 'right');
    }
    canvasLabel(c, P, text, x, y, align) {
      if (!text) return;
      c.font = '600 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      c.textBaseline = 'middle'; c.textAlign = align || 'left';
      const tw = c.measureText(text).width, lx = align === 'right' ? x - tw : x;
      c.globalAlpha = 0.88; c.fillStyle = P.panel; c.fillRect(lx - 4, y - 9, tw + 8, 18); c.globalAlpha = 1;
      c.fillStyle = P.ink; c.fillText(text, x, y + 0.5);
    }

    // --- the clock: runs and animations ------------------------------------------------------------------
    /** Starts the frame loop when something moves: a run, the copy leaving, a machine, the fold, a letter lit. */
    loop() {
      if (this.raf) return;
      this.last = performance.now();
      const frame = (now) => {
        this.raf = 0;
        if (!this.info || document.body.getAttribute('data-surface') !== 'prologue') return;
        const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        let more = false;
        const r = this.runner(), a = this.info.activity;
        if (r && a && a.open && !a.done && this.advancing(a)) {
          const rate = a.spec.rate || 1;
          const res = r.sceneAct({ advance: rate * dt });
          const info = r.sceneInfo();
          this.info = info;
          this.refresh();
          if (info.activity.done || (res && res.finished)) this.app.views.levelUI.after();
          more = true;
        }
        if (this.canvas && (this.key !== 'fold' || this.tau < 1.5)) { this.drawCanvas(dt); more = true; }
        if (this.tap) { if (now > this.tapUntil) { this.tap = null; this.refresh(); } else more = true; }
        if (more) this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }
    /** An activity whose run is under way (the student tapped "Let it run" or "Copy again"), or a picture that plays by itself. */
    advancing(a) {
      if (a.kind === 'show') return true;
      if (a.kind === 'copies') return a.runs.length > 0;
      return a.stage === 'run' && a.started;
    }

    // --- the ladder: Closer, Back, the ring, the rail, pinch -----------------------------------------------
    closer(action, via) {
      const r = this.runner();
      if (!r || !this.isRung()) return;
      const info = r.sceneInfo();
      // The ring and the gestures follow the sheet's main button: the next line, or the next rung once the rung's lines are read.
      if (!info.lastLine) r.sceneNext();
      else if (info.last) r.next();
      else if (!r.sceneNext().ok) return;
      this.app.logEvent('rung', { id: info.scene.id, action: action || 'closer', via: via || 'button' });
      this.app.views.levelUI.after();
    }
    back(via) {
      const r = this.runner();
      if (!r || !this.isRung()) return;
      const id = r.sceneInfo().scene.id;
      if (!r.sceneBack().ok) return;
      this.app.logEvent('rung', { id, action: 'back', via: via || 'button' });
      this.app.views.levelUI.after();
    }
    /** The ring on the rung's target, from the drawing's layout box (not its transformed box: it may be zooming in). */
    placeRing() {
      const sc = this.info && this.info.scene;
      const ring = sc && sc.rung && this.def ? ringOf(sc.rung, this.def.text) : null;
      const svgEl = this.art.querySelector('svg');
      const aw = this.art.offsetWidth, ah = this.art.offsetHeight;
      if (!ring || !svgEl || !aw || !ah) { this.ring.hidden = true; this.ringAt = null; return; }
      const k = Math.min(aw / W, ah / H), ox = (aw - W * k) / 2, oy = (ah - H * k) / 2;
      const x = ox + ring[0] * k, y = oy + ring[1] * k;
      this.ringAt = [x, y];
      this.ring.style.left = Math.round(x - 22) + 'px'; this.ring.style.top = Math.round(y - 22) + 'px';
      this.ring.setAttribute('aria-label', this.def.text.ui.ringLabel);
      this.ring.hidden = false;
    }
    syncRail() {
      const sc = this.info && this.info.scene, T = this.def && this.def.text;
      if (!sc || !sc.rung || !T.rungs) { this.rail.hidden = true; document.body.removeAttribute('data-rail'); return; }
      const h = LY.h, scenes = this.def.scenes, rungs = scenes.filter((x) => x.rung);
      this.rail.textContent = '';
      const ticks = h('span', { class: 'pl-ticks', 'aria-hidden': 'true' });
      rungs.forEach((x) => {
        const i = scenes.indexOf(x);
        ticks.appendChild(h('span', { class: 'pl-tick' + (i <= this.info.max ? ' is-visited' : '') + (x.id === sc.id ? ' is-now' : '') }));
      });
      this.rail.appendChild(ticks);
      this.rail.appendChild(h('span', { class: 'pl-rail-name', text: T.rungs[sc.rung] }));
      this.rail.setAttribute('aria-label', T.ui.rail.replace('{name}', T.rungs[sc.rung]));
      this.rail.hidden = false;
      document.body.setAttribute('data-rail', '');
    }
    /** "Zoom levels": every rung as a 48 px row; visited ones can be jumped to, the others wait their turn. */
    openRail() {
      const r = this.runner();
      if (!r || !this.def) return;
      const h = LY.h, T = this.def.text, scenes = this.def.scenes, info = r.sceneInfo();
      LY.openSheet({
        title: T.ui.railTitle, className: 'pl-rail-sheet',
        onClose: () => this.app.views.levelUI.sync(),
        build: (body, close) => {
          const list = h('div', { class: 'pl-rail-list' });
          scenes.forEach((x, i) => {
            if (!x.rung) return;
            const visited = i <= info.max;
            list.appendChild(h('button', { class: 'btn pl-rail-row' + (i === info.index ? ' is-now' : ''), type: 'button', disabled: !visited,
              onclick: () => { if (r.sceneJump(i).ok) this.app.logEvent('rung', { id: x.id, action: 'jump', via: 'button' }); close(); } },
            [h('span', { text: T.rungs[x.rung] }), visited ? null : h('span', { class: 'sheet-note', text: T.ui.notYet })]));
          });
          body.appendChild(list);
        },
      });
    }
    pDown(e) {
      const p = this.pinch;
      if (e.pointerType === 'mouse' || !this.isRung()) return;
      if (p.ids.length >= 2) return;
      p.ids.push(e.pointerId);
      const k = p.ids.length - 1;
      p.x[k] = e.clientX; p.y[k] = e.clientY;
      if (p.ids.length === 2) { p.d0 = Math.hypot(p.x[1] - p.x[0], p.y[1] - p.y[0]) || 1; p.ratio = 1; p.active = true; }
    }
    pMove(e) {
      const p = this.pinch, k = p.ids.indexOf(e.pointerId);
      if (k < 0) return;
      p.x[k] = e.clientX; p.y[k] = e.clientY;
      if (!p.active) return;
      e.preventDefault();
      p.ratio = Math.hypot(p.x[1] - p.x[0], p.y[1] - p.y[0]) / p.d0;
      const svgEl = this.art.querySelector('svg');
      if (svgEl) svgEl.style.transform = 'scale(' + Math.max(0.77, Math.min(1.3, p.ratio)).toFixed(3) + ')';
    }
    pUp(e, cancel) {
      const p = this.pinch, k = p.ids.indexOf(e.pointerId);
      if (k < 0) return;
      const was = p.active, ratio = p.ratio;
      p.ids.splice(k, 1);
      if (k === 0 && p.ids.length) { p.x[0] = p.x[1]; p.y[0] = p.y[1]; }
      if (!was) return;
      p.active = false;
      const svgEl = this.art.querySelector('svg');
      if (svgEl) svgEl.style.transform = '';
      if (cancel) return;
      if (ratio >= 1.25) this.closer('closer', 'pinch'); else if (ratio <= 0.8) this.back('pinch');
    }
    /** A9: a tapped letter and its partner light up for 2 s ("A pairs with T"). */
    artClick(e) {
      const t = e.target && e.target.closest ? e.target.closest('.pl-tap') : null;
      if (!t || !this.info || this.info.scene.rung !== 'letters') return;
      const i = Number(t.getAttribute('data-i'));
      const rect = t.getBoundingClientRect(), side = e.clientY > rect.top + rect.height / 2 ? 1 : 0;
      this.tap = { i, side };
      this.tapUntil = performance.now() + 2000;
      const INS = this.app.BTC.seqdata.INS, SEQ = this.app.BTC.seq;
      const a = side ? SEQ.complement(INS.mRNA[51 + i]) : INS.mRNA[51 + i], b = SEQ.dnaPartner(a);
      this.app.logEvent('activity', { id: 'a9', i, value: a, expected: b, match: true });
      this.refresh();
      this.app.views.levelUI.pairNote(this.def.text.ui.pairs.replace('{a}', a).replace('{b}', b));
      this.loop();
    }

    reset() {
      this.key = null; this.info = null; this.canvas = null; this.lastSvg = null;
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
      if (this.art) { this.art.textContent = ''; this.art.appendChild(this.ring); }
      if (this.rail) this.rail.hidden = true;
      document.body.removeAttribute('data-rail');
    }
  }

  PrologueView.svg = svg;
  PrologueView.ringOf = ringOf;
  PrologueView.RUNGS = RUNGS;
  return PrologueView;
});
