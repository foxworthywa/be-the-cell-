// @deps btc-palette btc-format
/*
 * Be the Cell: the Gene zoom renderer (docs/PROLOGUE.md §3.3). It draws a BTC.closeup gene plan:
 * the gene's DNA with its RNA polymerases and the copies they are making, its mRNA copies in
 * lanes with their ribosomes and growing chains, and its finished proteins in their place (the
 * membrane for a membrane protein). Every count comes from the plan, which comes from the view.
 *
 * Process markers (§3.3.1, open question 2, decided: allowed): a chain finished (a short fold in
 * place, at a ribosome at the end of a copy), a copy broken down (its strand breaks into fading
 * pieces where it was), a protein cut up. Each lasts 0.6 s of render time, on a fixed spot; one
 * marker per N events, N in the key. Nothing moves toward anything.
 *
 * Hot path: batched paths per (shape, colour); nothing allocated per frame.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-palette.js'), require('./btc-format.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.GeneView = factory(B.palette, B.format);
  }
})(typeof self !== 'undefined' ? self : this, function (PAL, F) {
  'use strict';

  const TAU = 6.283185307179586;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const MK = 48, LIFE = 0.6;
  const K_MADE = 1, K_GONE = 2, K_CUT = 3;
  // Glyph kinds (BTC.closeup.G).
  const RNAP = 1, NASCENT = 2, MRNA = 3, RIB = 4, CHAIN = 5, PROT = 6, OPER = 7, REP = 8;
  const WAVE_AMP = 2.2, WAVE_LEN = 9;
  const ROW = 6;                   // beads per row of a growing chain (BTC.closeup.BEAD_ROW)

  function wavyH(c, x0, y, len, t0, t1) {
    const n = Math.max(2, Math.round((len * (t1 - t0)) / 3));
    for (let k = 0; k <= n; k++) {
      const d = len * (t0 + ((t1 - t0) * k) / n);
      const yy = y + WAVE_AMP * Math.sin((d * TAU) / WAVE_LEN);
      if (k === 0) c.moveTo(x0 + d, yy); else c.lineTo(x0 + d, yy);
    }
  }
  /** A wavy strand from (x, y) along direction (dx, dy) (unit), length len. */
  function wavyDir(c, x, y, dx, dy, len) {
    const n = Math.max(2, Math.round(len / 3));
    for (let k = 0; k <= n; k++) {
      const d = (len * k) / n, off = WAVE_AMP * Math.sin((d * TAU) / WAVE_LEN);
      const px = x + dx * d - dy * off, py = y + dy * d + dx * off;
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
  }
  function ribo(c, x, y, s) {
    c.moveTo(x + s * 0.5, y + s * 0.12); c.arc(x, y + s * 0.12, s * 0.5, 0, TAU);
    c.moveTo(x + s * 0.32, y - s * 0.34); c.arc(x, y - s * 0.34, s * 0.32, 0, TAU);
  }
  function circ(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }

  class GeneView {
    constructor() {
      this.mAge = new Float32Array(MK).fill(-1);
      this.mX = new Float32Array(MK); this.mY = new Float32Array(MK); this.mK = new Uint8Array(MK); this.mL = new Float32Array(MK);
      this.mNext = 0;
      this.madeCarry = 0; this.cutCarry = 0;
      this.madeN = 1; this.cutN = 1;
      this.spawnIx = 0;
    }

    reset() { this.mAge.fill(-1); this.madeCarry = 0; this.cutCarry = 0; }

    /** Markers for the events of this frame: chains finished and proteins cut up (fluxes), copies broken down (plan). */
    spawn(plan, gv, dtSim, speed) {
      // One marker per N events, N from the 1-2-5 ladder, at most 3 markers per real second.
      const made = gv.synthesis_perS, cut = gv.degraded_perS;
      this.madeN = ladder(made * speed / 3);
      this.cutN = ladder(cut * speed / 3);
      this.madeCarry += (made * dtSim) / this.madeN;
      let k = Math.floor(this.madeCarry);
      this.madeCarry -= k;
      if (k > 3) k = 3;
      for (let i = 0; i < k; i++) {
        // At a ribosome near the end of a drawn copy (the chain that has just been finished).
        let best = -1, bp = -1;
        const start = (this.spawnIx * 7) % Math.max(1, plan.N);
        for (let jj = 0; jj < plan.N; jj++) {
          const j = (start + jj) % plan.N;
          if (plan.kind[j] === RIB && plan.p[j] > bp) { bp = plan.p[j]; best = j; }
        }
        this.spawnIx++;
        if (best >= 0) this.add(K_MADE, plan.x[best], plan.y[best] - plan.ribPx * 0.9, 0);
      }
      this.cutCarry += (cut * dtSim) / this.cutN;
      let q = Math.floor(this.cutCarry);
      this.cutCarry -= q;
      if (q > 3) q = 3;
      for (let i = 0; i < q; i++) {
        for (let j = 0; j < plan.N; j++) if (plan.kind[j] === PROT && ((j + this.spawnIx) % 3 === 0)) { this.add(K_CUT, plan.x[j], plan.y[j], 0); break; }
        this.spawnIx++;
      }
    }
    /** The copies the plan found broken down since the last rebuild. */
    spawnGone(plan) {
      for (let g = 0; g < plan.nGone; g++) this.add(K_GONE, plan.goneX[g], plan.goneY[g], plan.strandLen);
    }
    add(kind, x, y, len) {
      const j = this.mNext;
      this.mNext = (j + 1) % MK;
      this.mK[j] = kind; this.mX[j] = x; this.mY[j] = y; this.mL[j] = len; this.mAge[j] = 0;
    }
    age(dt) {
      for (let j = 0; j < MK; j++) if (this.mAge[j] >= 0) { this.mAge[j] += dt; if (this.mAge[j] >= LIFE) this.mAge[j] = -1; }
    }

    /**
     * Draws the plan. o: {P, colorOf(i) (palette token of gene index i), focusColor, gene (view gene), words, labels,
     * reduced, tau, watched: {lane, text} | null, unitColors: [[s0, s1, token], …] | null, dark}.
     */
    draw(c, plan, o) {
      const P = o.P, w = plan.w, h = plan.h, col = P[o.focusColor] || P.muted;
      const L = o.labels;
      // Outside, membrane, inside (the whole canvas is painted: nothing of the last frame shows through).
      c.fillStyle = P.inside; c.fillRect(0, 0, w, h);
      c.fillStyle = P.outside; c.fillRect(0, 0, w, plan.memY0);
      c.fillStyle = P['warn-pale'] || P.inside; c.globalAlpha = 0.6; c.fillRect(0, plan.memY0, w, plan.memY1 - plan.memY0); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(0, plan.memY0 + 1); c.lineTo(w, plan.memY0 + 1); c.moveTo(0, plan.memY1 - 1); c.lineTo(w, plan.memY1 - 1);
      c.strokeStyle = P.membrane; c.lineWidth = 1.6; c.stroke();
      this.text(c, P, L.outside, 8, (plan.outY0 + plan.memY0) / 2, 'left');
      this.text(c, P, L.membrane, 8, (plan.memY0 + plan.memY1) / 2, 'left');

      // DNA (one or two copies): a double line; the gene (or the unit's genes) in colour; the promoter's bent arrow.
      for (let k = 0; k < plan.dosage; k++) {
        const y = k ? plan.dnaY2 : plan.dnaY;
        c.beginPath(); c.moveTo(0, y - 1.6); c.lineTo(w, y - 1.6); c.moveTo(0, y + 1.6); c.lineTo(w, y + 1.6);
        c.strokeStyle = P.dna; c.globalAlpha = 0.55; c.lineWidth = 1.3; c.stroke(); c.globalAlpha = 1;
        const segs = o.unitColors;
        if (segs) {
          for (const [s0, s1, tok] of segs) {
            c.beginPath(); c.moveTo(plan.dnaX0 + plan.genePx * s0, y); c.lineTo(plan.dnaX0 + plan.genePx * s1, y);
            c.strokeStyle = P[tok] || P.muted; c.lineWidth = tok === o.focusColor ? 5 : 3; c.stroke();
          }
        } else {
          c.beginPath(); c.moveTo(plan.dnaX0 + plan.genePx * plan.s0, y); c.lineTo(plan.dnaX0 + plan.genePx * plan.s1, y);
          c.strokeStyle = col; c.lineWidth = 5; c.stroke();
        }
        // Promoter: a bent arrow standing on the DNA at the gene's start, pointing along it.
        const px = plan.dnaX0;
        c.beginPath(); c.moveTo(px, y - 2); c.lineTo(px, y - 11); c.lineTo(px + 9, y - 11);
        c.moveTo(px + 6, y - 14); c.lineTo(px + 9.5, y - 11); c.lineTo(px + 6, y - 8);
        c.strokeStyle = P.ink; c.lineWidth = 1.8; c.lineJoin = 'round'; c.stroke();
      }
      const dnaLabelY = plan.dnaY + (plan.dosage === 2 ? 26 : 14);
      this.text(c, P, o.geneLabel, Math.max(8, plan.dnaX0), Math.min(h - 6, dnaLabelY), 'left');
      if (o.showPromoterLabel) this.text(c, P, L.promoter, Math.max(8, plan.dnaX0 - 4), plan.dnaY - 20, 'left');

      // The lac operator on each DNA copy, the repressor clamped on it while bound.
      this.batch(c, plan, OPER, P.ink, 'strokeBox');
      this.batch(c, plan, REP, P[o.repColor] || P.muted, 'vee');

      if (plan.m + plan.n === 0) {
        c.font = '600 15px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = P.muted;
        c.fillText(L.none, w / 2, (plan.laneTop + plan.nascentTop) / 2);
      }

      // Copies in progress: the strand growing from each polymerase.
      c.beginPath();
      for (let i = 0; i < plan.N; i++) if (plan.kind[i] === NASCENT && plan.p[i] > 1) wavyDir(c, plan.x[i], plan.y[i], -0.5, -0.866, plan.p[i]);
      c.strokeStyle = P.inside; c.lineWidth = 4.5; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
      c.strokeStyle = col; c.lineWidth = 2; c.stroke();

      // Mature copies in their lanes: the watched one outlined; the coding part in colour, the ends muted.
      if (o.watched && o.watched.lane >= 0) {
        const l = o.watched.lane;
        c.beginPath(); wavyH(c, plan.laneX[l], plan.laneY[l], plan.strandLen, 0, 1);
        c.strokeStyle = P.accent; c.lineWidth = 7; c.globalAlpha = 0.35; c.stroke(); c.globalAlpha = 1;
      }
      c.beginPath();
      for (let i = 0; i < plan.N; i++) if (plan.kind[i] === MRNA) wavyH(c, plan.x[i], plan.y[i], plan.p[i], 0, 1);
      c.strokeStyle = P.inside; c.lineWidth = 4.5; c.stroke();
      c.strokeStyle = P.muted; c.lineWidth = 1.6; c.stroke();
      c.beginPath();
      for (let i = 0; i < plan.N; i++) if (plan.kind[i] === MRNA) wavyH(c, plan.x[i], plan.y[i], plan.p[i], plan.s0, plan.s1);
      c.strokeStyle = col; c.lineWidth = 2.2; c.stroke();

      // Chains: a string of beads from each ribosome (1 bead = 20 amino acids), folding as it grows; membrane
      // proteins' chains go on up into the membrane (a thin line).
      const b = Math.max(2.1, Math.min(3.2, plan.ribPx * 0.18)), br = b * 0.46;
      if (plan.membraneGene) {
        c.beginPath();
        for (let i = 0; i < plan.N; i++) {
          if (plan.kind[i] !== CHAIN || plan.a[i] !== 0 || plan.beadN[i] < 1) continue;
          const rows = Math.ceil(plan.beadN[i] / ROW);
          c.moveTo(plan.x[i], plan.y[i] - rows * b); c.lineTo(plan.x[i], plan.memY1 + 2);
        }
        c.strokeStyle = col; c.globalAlpha = 0.28; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
      }
      c.beginPath();
      for (let i = 0; i < plan.N; i++) {
        if (plan.kind[i] !== CHAIN) continue;
        const n = plan.beadN[i], x = plan.x[i], y = plan.y[i];
        if (!plan.beads) { if (n > 0) { c.moveTo(x, y); c.lineTo(x, y - Math.ceil(n / ROW) * b); } continue; }
        for (let k = 0; k < n; k++) {
          const row = Math.floor(k / ROW), cix = k % ROW, dir = row % 2 ? -1 : 1;
          const bx = x + dir * (cix - (ROW - 1) / 2) * b, by = y - (row + 0.5) * b;
          circ(c, bx, by, br);
        }
      }
      if (plan.beads) { c.fillStyle = col; c.fill(); } else { c.strokeStyle = col; c.lineWidth = 2; c.stroke(); }

      // Ribosomes (two subunits), to scale or at the 6 px minimum.
      c.beginPath();
      for (let i = 0; i < plan.N; i++) if (plan.kind[i] === RIB) ribo(c, plan.x[i], plan.y[i], plan.ribPx);
      c.fillStyle = P.ribosome; c.globalAlpha = 0.9; c.fill(); c.globalAlpha = 1;
      c.strokeStyle = P.inside; c.lineWidth = 1; c.stroke();

      // RNA polymerase rings on the DNA.
      c.beginPath();
      for (let i = 0; i < plan.N; i++) if (plan.kind[i] === RNAP) circ(c, plan.x[i], plan.y[i], plan.rnapPx * 0.5);
      c.fillStyle = P.inside; c.fill(); c.strokeStyle = P.rnap; c.lineWidth = 1.8; c.stroke();

      // Finished proteins in their place, up to 8, then "+n more".
      let lastX = 0, py = 0;
      c.beginPath();
      for (let i = 0; i < plan.N; i++) {
        if (plan.kind[i] !== PROT) continue;
        const x = plan.x[i], y = plan.y[i];
        lastX = Math.max(lastX, x); py = y;
        if (plan.membraneGene) { c.rect(x - 4, y - 8, 3.4, 16); c.rect(x + 0.6, y - 8, 3.4, 16); }
        else if (o.shape === 'tetramer') { circ(c, x - 2.6, y - 2.6, 2.9); circ(c, x + 2.6, y - 2.6, 2.9); circ(c, x - 2.6, y + 2.6, 2.9); circ(c, x + 2.6, y + 2.6, 2.9); }
        else if (o.shape === 'bar') { c.rect(x - 1.8, y - 6, 3.6, 12); }
        else if (o.shape === 'trimer') { circ(c, x, y - 2.8, 2.7); circ(c, x - 2.5, y + 1.6, 2.7); circ(c, x + 2.5, y + 1.6, 2.7); }
        else circ(c, x, y, 4.5);
      }
      c.fillStyle = col; c.fill();
      c.strokeStyle = P.ink; c.globalAlpha = 0.35; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
      if (plan.protMore > 0 && o.moreText) {
        // "+n more" in the outside band at the right (a membrane protein) or at the end of the row.
        if (plan.membraneGene) this.text(c, P, o.moreText, w - 8, (plan.outY0 + plan.memY0) / 2, 'right');
        else this.text(c, P, o.moreText, Math.min(w - 8, lastX + 12), py, lastX + 12 > w - 110 ? 'right' : 'left');
      }
      this.legend(c, P, plan, col, o.inline);

      // The watched copy's label.
      if (o.watched && o.watched.lane >= 0 && o.watched.text) {
        const l = o.watched.lane;
        this.text(c, P, o.watched.text, Math.min(w - 8, plan.laneX[l] + plan.strandLen), plan.laneY[l] + 10, 'right', P.accent);
      }
      this.drawMarkers(c, P, col, o.reduced);
    }

    /** The in-picture legend in the right margin: a strand, a ribosome, a chain and a polymerase, each named. */
    legend(c, P, plan, col, words) {
      if (!words || !plan.legendW) return;
      const x = plan.w - plan.legendW + 6, y0 = plan.laneTop + 10, step = 26;
      c.beginPath(); wavyH(c, x, y0, 16, 0, 1); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
      c.beginPath(); ribo(c, x + 8, y0 + step, 11); c.fillStyle = P.ribosome; c.fill();
      c.beginPath();
      for (let k = 0; k < 12; k++) { const row = Math.floor(k / ROW), cix = k % ROW, dir = row % 2 ? -1 : 1; circ(c, x + 8 + dir * (cix - 2.5) * 2.6, y0 + 2 * step + 3 - row * 2.6, 1.2); }
      c.fillStyle = col; c.fill();
      c.beginPath(); circ(c, x + 8, y0 + 3 * step, 5); c.fillStyle = P.inside; c.fill(); c.strokeStyle = P.rnap; c.lineWidth = 1.8; c.stroke();
      c.font = '12px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = P.ink;
      c.fillText(words.mRNA, x + 22, y0);
      c.fillText(words.ribosome, x + 22, y0 + step);
      c.fillText(words.chain, x + 22, y0 + 2 * step);
      const r = words.rnap.split(' ');
      c.fillText(r[0], x + 22, y0 + 3 * step - 7); if (r[1]) c.fillText(r.slice(1).join(' '), x + 22, y0 + 3 * step + 7);
    }

    batch(c, plan, kind, color, how) {
      let any = false;
      c.beginPath();
      for (let i = 0; i < plan.N; i++) {
        if (plan.kind[i] !== kind) continue;
        any = true;
        const x = plan.x[i], y = plan.y[i];
        if (how === 'strokeBox') c.rect(x - 4, y - 5, 8, 10);
        else {                                   // the repressor, a V clamped on the operator
          c.moveTo(x - 7, y - 16); c.lineTo(x - 1.5, y - 5); c.lineTo(x + 1.5, y - 5); c.lineTo(x + 7, y - 16); c.lineTo(x + 3.5, y - 16); c.lineTo(x, y - 9); c.lineTo(x - 3.5, y - 16); c.closePath();
        }
      }
      if (!any) return;
      if (how === 'strokeBox') { c.strokeStyle = color; c.lineWidth = 2; c.stroke(); } else { c.fillStyle = color; c.fill(); }
    }

    drawMarkers(c, P, col, reduced) {
      for (let j = 0; j < MK; j++) {
        const age = this.mAge[j];
        if (age < 0) continue;
        const f = reduced ? 0.5 : age / LIFE, x = this.mX[j], y = this.mY[j];
        c.globalAlpha = 1 - f;
        if (this.mK[j] === K_MADE) {
          // A finished chain folding up: a ring of beads drawing together.
          const r = 7 * (1 - 0.6 * f);
          c.beginPath();
          for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + f * 2; circ(c, x + Math.cos(a) * r, y + Math.sin(a) * r, 1.6); }
          c.fillStyle = col; c.fill();
          c.beginPath(); circ(c, x, y, 4 + 3 * f); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke();
        } else if (this.mK[j] === K_GONE) {
          // A copy broken down: its strand in pieces that drift a little apart and fade where it was.
          const len = this.mL[j], n = 6;
          c.beginPath();
          for (let k = 0; k < n; k++) {
            const x0 = x - len / 2 + (len * k) / n, seg = (len / n) * 0.55;
            const dy = (k % 2 ? 1 : -1) * 4 * f;
            c.moveTo(x0, y + dy); c.lineTo(x0 + seg, y + dy + (k % 2 ? -2 : 2));
          }
          c.strokeStyle = P.muted; c.lineWidth = 2; c.stroke();
        } else {
          c.beginPath(); c.rect(x - 4 - 3 * f, y - 8, 3.4, 16); c.rect(x + 0.6 + 3 * f, y - 8 + 4 * f, 3.4, 16);
          c.strokeStyle = col; c.lineWidth = 1.4; c.stroke();
        }
      }
      c.globalAlpha = 1;
    }

    text(c, P, s, x, y, align, color) {
      if (!s) return;
      c.font = '600 12px ' + FONT;
      c.textAlign = align; c.textBaseline = 'middle';
      const tw = c.measureText(s).width;
      const lx = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
      c.globalAlpha = 0.8; c.fillStyle = P.panel || '#fff'; c.fillRect(lx - 3, y - 8, tw + 6, 16); c.globalAlpha = 1;
      c.fillStyle = color || P.muted;
      c.fillText(s, x, y + 0.5);
    }

    /** The nearest glyph to (x, y) within r px, for the tap chip: {kind, i} or null. */
    hitTest(plan, x, y, r) {
      let best = -1, bd = r * r;
      for (let i = 0; i < plan.N; i++) {
        const k = plan.kind[i];
        if (k === CHAIN) continue;
        let dx = plan.x[i] - x, dy = plan.y[i] - y;
        if (k === MRNA) { const t = Math.max(0, Math.min(plan.p[i], x - plan.x[i])); dx = plan.x[i] + t - x; dy = plan.y[i] - y; }
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return best;
      if (Math.abs(y - plan.dnaY) < 10 && x >= plan.dnaX0 && x <= plan.dnaX0 + plan.genePx) return -2;   // the gene's DNA
      return -1;
    }
  }

  /** Smallest 1-2-5 value ≥ x (at least 1). */
  function ladder(x) {
    let n = 1;
    const steps = [2, 2.5, 2];
    let i = 0;
    while (n < x && n < 1e9) { n *= steps[i % 3]; i++; }
    return Math.round(n);
  }

  GeneView.ladder = ladder;
  return GeneView;
});
