// @deps btc-content btc-format btc-layout btc-palette btc-plot
/*
 * Be the Cell: the genes panel (LAB_UI §3): one card per gene, in slot order.
 *
 * A card shows what the gene is, its promoter control, its counts (mature
 * mRNA, "+n" still being made, protein), a sparkline of the last simulated
 * hour, and its cost: the share of working ribosomes busy translating it now.
 * Text updates at most 4 times a second and is written only when it changes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'),
      require('./btc-palette.js'), require('./btc-plot.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.GenesPanel = factory(B.content, B.format, B.layout, B.palette, B.Plot);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY, PAL, Plot) {
  'use strict';

  const SHARE_FULL = 0.25;          // the ribosome-share bar is full at 25%
  const SPARK_S = 3600;             // sparkline window: the last simulated hour
  const SPARK_W = 88, SPARK_H = 28;

  class GenesPanel {
    constructor(app) {
      this.app = app;
      this.cards = [];
      this.visible = false;
      this.sinceText = 1;
      this.sinceSpark = 1;
    }

    mount(root) {
      const h = LY.h, app = this.app;
      this.root = root;
      root.appendChild(h('div', { class: 'pane-head' }, [
        h('h2', { text: C.card.header }), h('span', { class: 'pane-note', text: C.card.strain }),
      ]));
      const list = h('div', { class: 'card-list' });
      root.appendChild(list);
      const view = app.cell.observe();
      const lc = app.labConfig;
      for (const gv of view.genes) {
        // Genes outside labConfig.genesVisible keep running as background: no card (LEVELS §5.5.1).
        if (lc.genesVisible !== 'all' && Array.isArray(lc.genesVisible) && lc.genesVisible.indexOf(gv.id) < 0) continue;
        const id = gv.id, w = C.geneWords(id, lc.showNames);
        const e = {
          id,
          state: h('span', { class: 'state-chip' }),
          mrna: h('span', { class: 'num' }),
          protein: h('span', { class: 'num' }),
          shareFill: h('span', { class: 'share-fill' }),
          sharePct: h('span', { class: 'share-pct num' }),
          spark: h('canvas', { class: 'spark', width: SPARK_W, height: SPARK_H, 'aria-hidden': 'true' }),
          about: h('p', { class: 'card-about', hidden: true, text: w.about }),
        };
        const aboutBtn = h('button', { class: 'btn small-btn about-btn', type: 'button', 'aria-expanded': 'false' }, C.card.about);
        aboutBtn.addEventListener('click', () => {
          const open = e.about.hidden;
          e.about.hidden = !open;
          aboutBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
          aboutBtn.textContent = open ? C.card.aboutClose : C.card.about;
        });
        // Dials: replaced by a line when the DNA sets them (designer levels) or a level hides gene
        // controls; shown but disabled, with "Set by this level.", when a level locks the gene.
        const mode = app.geneControlMode(id);
        const ctrl = mode === 'free' || mode === 'locked' ? app.makePromoterControl(() => id, 'card') : null;
        e.ctrl = ctrl;
        const head = h('button', {
          class: 'card-head', type: 'button', 'aria-label': F.fill(C.card.focusLabel, { name: w.name }),
          onclick: () => app.setFocus(id),
        }, [
          h('span', { class: 'card-chip', style: { background: 'var(--g-' + id + ')' } }),
          h('span', { class: 'card-title' }, [h('span', { class: 'card-name', text: w.name }), ' ', h('span', { class: 'sym', text: w.symbol })]),
        ]);
        const badge = gv.lumped ? h('span', { class: 'badge', text: F.fill(C.card.standsFor, { n: gv.standsForGenes }) }) : null;
        const card = h('article', { class: 'gene-card', 'data-gene': id }, [
          head,
          h('p', { class: 'card-job' }, [e.state, ' ', badge, badge ? ' ' : null, w.job]),
          ctrl ? h('div', { class: 'card-ctrl' }, [h('span', { class: 'visually-hidden', text: C.card.promoter }), ctrl.el, ctrl.note])
            : h('p', { class: 'card-locked', text: lc.readOnlyGenes ? C.card.readOnly : C.card.locked }),
          h('div', { class: 'card-counts' }, [
            h('span', { class: 'count-m' }, e.mrna), h('span', { class: 'count-p' }, e.protein), e.spark,
          ]),
          h('div', { class: 'card-cost' }, [
            h('span', { class: 'share-label', text: C.card.share }),
            h('span', { class: 'share-bar', role: 'img', 'aria-label': C.card.shareLabel }, e.shareFill), e.sharePct, aboutBtn,
          ]),
          e.about,
        ]);
        if (ctrl) ctrl.el.setAttribute('aria-label', C.card.promoter + ', ' + w.name);
        e.card = card;
        this.cards.push(e);
        list.appendChild(card);
      }
      this.updateFocus();
    }

    setVisible(v) { this.visible = v; if (v) { this.sinceText = 1; this.sinceSpark = 1; } }

    updateFocus() {
      for (const e of this.cards) e.card.classList.toggle('is-focus', e.id === this.app.focusGene);
    }

    /** Called every frame; does work at most 4 Hz (text) and 2 Hz (sparklines), only while visible. */
    render(dtReal, force) {
      if (!this.visible) return;
      this.sinceText += dtReal; this.sinceSpark += dtReal;
      if (force || this.sinceText >= 0.25) { this.sinceText = 0; this.updateText(); }
      if (force || this.sinceSpark >= 0.5) { this.sinceSpark = 0; this.drawSparks(); }
    }

    updateText() {
      const view = this.app.cell.observe();
      const elong = view.ribosomes.elongating;
      for (const e of this.cards) {
        const gv = view.geneById[e.id];
        const st = gv.geneState;
        if (e.state.__s !== st) { e.state.__s = st; e.state.className = 'state-chip st-' + st; }
        LY.setText(e.state, C.geneState[st]);
        LY.setText(e.mrna, F.fill(C.card.counts, { m: F.count(gv.mRNA), n: F.count(gv.nascent) }));
        LY.setText(e.protein, F.fill(C.card.protein, { p: F.count(gv.proteinRounded) }));
        const share = elong > 0 ? gv.ribosomes / elong : 0;
        const w = Math.min(100, (share / SHARE_FULL) * 100).toFixed(1) + '%';
        if (e.shareFill.style.width !== w) e.shareFill.style.width = w;
        LY.setText(e.sharePct, F.pct(share));
      }
    }

    drawSparks() {
      // The recent recorder keeps full resolution, so the last hour stays detailed after a fast run.
      const app = this.app, rec = app.recRecent || app.rec, P = PAL.current(), view = app.cell.observe();
      const dt = view.scale.dt_s, t1 = view.t_s, t0 = t1 - SPARK_S;
      const i0 = Plot.lowerBound(rec.ticks, rec.count, Math.floor(t0 / dt));
      for (const e of this.cards) {
        const cv = e.spark, c = cv.getContext('2d');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== SPARK_W * dpr) { cv.width = SPARK_W * dpr; cv.height = SPARK_H * dpr; }
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, SPARK_W, SPARK_H);
        const gv = view.geneById[e.id];
        const prot = rec.series('protein:' + e.id), mr = rec.series('mRNA:' + e.id);
        // Each line is scaled to its own maximum over the window.
        let pMax = gv.protein, mMax = gv.mRNA + gv.nascent;
        for (let i = i0; i < rec.count; i++) { if (prot[i] > pMax) pMax = prot[i]; if (mr[i] > mMax) mMax = mr[i]; }
        const x = (tick) => ((tick * dt - t0) / SPARK_S) * (SPARK_W - 2) + 1;
        const line = (data, max, live, width, alpha) => {
          if (!(max >= 1)) return;                      // nothing worth a line yet
          const y = (v) => SPARK_H - 2 - (v / max) * (SPARK_H - 4);
          c.beginPath();
          let started = false;
          for (let i = i0; i < rec.count; i++) {
            const px = x(rec.ticks[i]), py = y(data[i]);
            if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
          }
          if (started) c.lineTo(SPARK_W - 1, y(live)); else { c.moveTo(SPARK_W - 3, y(live)); c.lineTo(SPARK_W - 1, y(live)); }
          c.globalAlpha = alpha; c.lineWidth = width; c.strokeStyle = P['g-' + e.id]; c.stroke(); c.globalAlpha = 1;
        };
        line(mr, mMax, gv.mRNA + gv.nascent, 1, 0.55);
        line(prot, pMax, gv.protein, 2, 1);
      }
    }
  }

  return GenesPanel;
});
