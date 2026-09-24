// @deps btc-layout
/*
 * Be the Cell: showing the narrator's sentence (LAB_UI §7.4).
 *
 * NarratorHold (pure; the clock is injected, test U-7) decides when a new
 * sentence may replace the current one: after it has been shown for 1.5 s of
 * real time, or 0.5 s for the urgent rules (drugs, starvation, and a gene
 * switched on with no ATP). Only the most recent candidate waits; there is no
 * backlog, so at high speed some intermediate phases are skipped.
 *
 * NarratorView writes the live region only when the key or the gene changes,
 * so a screen reader hears each new sentence once. The text never contains
 * numbers.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    var api = factory(B.layout);
    B.NarratorHold = api.NarratorHold;
    B.NarratorView = api.NarratorView;
  }
})(typeof self !== 'undefined' ? self : this, function (LY) {
  'use strict';

  const HOLD_MS = 1500, PREEMPT_MS = 500;

  class NarratorHold {
    /** now(): real milliseconds. */
    constructor(now) {
      this.now = now;
      this.key = null; this.gene = null; this.text = '';
      this.shownAt = -Infinity;
      this.pKey = null; this.pGene = null; this.pText = ''; this.pPreempt = false;
      this.writes = 0;
    }
    /** Offers the narrator's current choice. Returns true when the shown line changed. */
    offer(key, gene, text, preempt) {
      if (key === this.key && gene === this.gene) { this.pKey = null; return false; }
      this.pKey = key; this.pGene = gene; this.pText = text; this.pPreempt = !!preempt;
      return this.poll();
    }
    /** Shows the waiting candidate if its hold is over. Returns true when the shown line changed. */
    poll() {
      if (this.pKey === null) return false;
      const age = this.now() - this.shownAt;
      if (this.key !== null && age < (this.pPreempt ? PREEMPT_MS : HOLD_MS)) return false;
      this.key = this.pKey; this.gene = this.pGene; this.text = this.pText;
      this.pKey = null;
      this.shownAt = this.now();
      this.writes++;
      return true;
    }
    reset() { this.key = null; this.gene = null; this.pKey = null; this.shownAt = -Infinity; }
  }

  class NarratorView {
    constructor(el) { this.el = el; this.key = null; this.gene = null; }
    /** Writes the sentence only when the key or gene changed. Returns true if it wrote. */
    show(key, gene, text) {
      if (key === this.key && gene === this.gene) return false;
      this.key = key; this.gene = gene;
      LY.setText(this.el, text);
      this.el.setAttribute('data-key', key);
      return true;
    }
  }

  NarratorHold.HOLD_MS = HOLD_MS;
  NarratorHold.PREEMPT_MS = PREEMPT_MS;
  return { NarratorHold, NarratorView };
});
