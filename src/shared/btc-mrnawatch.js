// @deps
/*
 * Be the Cell: the watched mRNA (docs/PROLOGUE.md §3.5).
 *
 * One mRNA molecule of a gene, marked as watched ("this copy: read into {n}"). The engine
 * counts ribosomes per gene, not per molecule, so the count here is the model's own expected
 * share: in each tick in which the copy could be loaded, it takes tlStarts / tlCopies of the
 * gene's new ribosomes (every translatable copy gets the same share, Engine §7.5). Each share
 * is queued with the ribosome odometer at its start and counted as made once the odometer has
 * advanced by the chain length. After the copy is broken down, chains already started still
 * finish (the model finishes chains on a decayed copy); then the count stops.
 *
 *   const w = new BTC.MRNAWatch('lacY');
 *   cell.attachRecorder(w);          // onTick(cell) after every step: exact whatever the frame rate
 *   w.watch(cell, id)                // or w.watchNewest(cell)
 *   w.state()  → {id, gene, made, started, alive, lifetime_s, birthTick, goneTick}
 *   w.save() / BTC.MRNAWatch.restore(saved)
 *
 * Pure bookkeeping on the view: nothing in the cell reads it, so replays give the same counts.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.MRNAWatch = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CAP = 1024;

  function findId(gv, id) {
    for (let j = 0; j < gv.mRNA; j++) if (gv.mRNAIds[j] === id) return j;
    return -1;
  }

  class MRNAWatch {
    constructor(gene) {
      this.gene = gene;
      this.id = -1;
      this.birthTick = -1;
      this.goneTick = -1;
      this.alive = false;
      this.made = 0;
      this.started = 0;
      this.odo = 0;              // own ribosome odometer (aa a running ribosome has travelled since watching; kept across divisions)
      this.gen = 0;
      this.reason = '';          // why the copy is gone: 'decay' or 'division' (it went to the sister cell)
      this.tick = -1;
      this.dt = 1;
      this.L = 1;
      this.qD0 = new Float64Array(CAP);
      this.qN = new Float64Array(CAP);
      this.head = 0;
      this.len = 0;
    }

    /** Starts watching copy `id` of this gene (it must be alive now); counts start at 0. */
    watch(cell, id) {
      const v = cell.observe(), gv = v.geneById[this.gene];
      const j = gv ? findId(gv, id) : -1;
      if (j < 0) return false;
      this.id = id;
      this.birthTick = gv.mRNABirthTick[j];
      this.goneTick = -1;
      this.alive = true;
      this.made = 0;
      this.started = 0;
      this.head = 0;
      this.len = 0;
      this.odo = 0;
      this.gen = v.clock.generation;
      this.reason = '';
      this.tick = v.tick;
      this.dt = v.scale.dt_s;
      this.L = gv.length_aa;
      return true;
    }

    /** Watches the youngest copy of the gene (the first one made after a switch-on, when there is one). */
    watchNewest(cell) {
      const gv = cell.observe().geneById[this.gene];
      if (!gv || gv.mRNA === 0) return false;
      let best = 0;
      for (let j = 1; j < gv.mRNA; j++) {
        if (gv.mRNABirthTick[j] > gv.mRNABirthTick[best] || (gv.mRNABirthTick[j] === gv.mRNABirthTick[best] && gv.mRNAIds[j] > gv.mRNAIds[best])) best = j;
      }
      return this.watch(cell, gv.mRNAIds[best]);
    }

    get watching() { return this.id >= 0; }
    /** Chains started on this copy that are still being built. */
    get inFlight() { let s = 0; for (let k = 0; k < this.len; k++) s += this.qN[(this.head + k) % CAP]; return s; }
    get done() { return this.id >= 0 && !this.alive && this.len === 0; }

    /** Called by the cell after every step (cell.attachRecorder). */
    onTick(cell) {
      if (this.id < 0) return;
      const v = cell.observe(), gv = v.geneById[this.gene];
      if (!gv) return;
      // Ribosome travel this tick, as the engine's odometer moves (dD = cmF·vInt, Engine §7.7); the engine's own
      // odometer restarts at each division, this one does not.
      const odo0 = this.odo;
      this.odo += v.ribosomes.vRun_aaPerS * this.dt * (1 - v.drugs.theta);
      const D = this.odo;
      const wasAlive = this.alive;
      const alive = wasAlive && findId(gv, this.id) >= 0;
      // The copy could take ribosomes in this tick if it was a mature copy at its start (translation
      // starts before mRNA breaks down in the engine's step, Engine §7).
      if (wasAlive && gv.tlCopies > 0 && gv.tlStarts_perS > 0) {
        const n = (gv.tlStarts_perS * this.dt) / gv.tlCopies;
        this.started += n;
        if (this.len === CAP) { this.made += this.qN[this.head]; this.head = (this.head + 1) % CAP; this.len--; }
        const i = (this.head + this.len) % CAP;
        this.qD0[i] = odo0;
        this.qN[i] = n;
        this.len++;
      }
      // Chains finish once the odometer has moved on by the chain length.
      while (this.len > 0 && D - this.qD0[this.head] >= this.L) {
        this.made += this.qN[this.head];
        this.head = (this.head + 1) % CAP;
        this.len--;
      }
      if (wasAlive && !alive) { this.alive = false; this.goneTick = v.tick; this.reason = v.clock.generation !== this.gen ? 'division' : 'decay'; }
      this.gen = v.clock.generation;
      this.tick = v.tick;
    }

    /** Seconds the copy lived: from its birth to when it was broken down (or to now). */
    lifetime(tickNow) {
      if (this.id < 0) return 0;
      const end = this.goneTick >= 0 ? this.goneTick : (tickNow === undefined ? this.tick : tickNow);
      return (end - this.birthTick) * this.dt;
    }

    state() {
      return { id: this.id, gene: this.gene, made: this.made, started: this.started, alive: this.alive, lifetime_s: this.lifetime(),
        birthTick: this.birthTick, goneTick: this.goneTick, inFlight: this.inFlight, reason: this.reason };
    }

    save() {
      const q = [];
      for (let k = 0; k < this.len; k++) { const i = (this.head + k) % CAP; q.push([this.qD0[i], this.qN[i]]); }
      return { gene: this.gene, id: this.id, birthTick: this.birthTick, goneTick: this.goneTick, alive: this.alive, made: this.made,
        started: this.started, odo: this.odo, gen: this.gen, reason: this.reason, tick: this.tick, dt: this.dt, L: this.L, queue: q };
    }

    static restore(s) {
      const w = new MRNAWatch(s.gene);
      for (const k of ['id', 'birthTick', 'goneTick', 'alive', 'made', 'started', 'odo', 'gen', 'reason', 'tick', 'dt', 'L']) w[k] = s[k];
      for (const [d0, n] of s.queue || []) { w.qD0[w.len] = d0; w.qN[w.len] = n; w.len++; }
      return w;
    }
  }

  return MRNAWatch;
});
