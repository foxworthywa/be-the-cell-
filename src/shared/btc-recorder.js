// @deps
/*
 * Be the Cell: the Recorder (engine spec §12). Time series for the graphs.
 *
 * The cell calls rec.onTick(cell) after every step; the Recorder samples when
 * tick % every == 0, so what it stores depends only on simulated time, never
 * on frame rate, and a replay records the same samples. Each sample's tick is
 * stored beside its values. When the buffer is full, every second sample is
 * dropped and the sampling interval doubles (5 → 10 → 20 … ticks), so old and
 * new data stay evenly spaced.
 *
 *   new BTC.Recorder({every: 5, capacity: 4096, channels: [{name, read(cell, view)}]})
 *   rec.count, rec.every, rec.ticks (Int32Array, valid [0, count)), rec.series(name) (Float64Array, same)
 *   BTC.Recorder.labChannels(cell): the lab's 27 channels (LAB_UI §5.1)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.Recorder = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class Recorder {
    constructor(opts) {
      const o = opts || {};
      this.every = o.every || 5;
      this.capacity = o.capacity || 4096;
      if (this.capacity < 2 || this.capacity % 2) throw new Error('Recorder capacity must be even and ≥ 2');
      this.channels = (o.channels || []).slice();
      this.names = this.channels.map((c) => c.name);
      this.ticks = new Int32Array(this.capacity);
      this.data = this.channels.map(() => new Float64Array(this.capacity));
      this.byName = {};
      for (let i = 0; i < this.channels.length; i++) this.byName[this.names[i]] = this.data[i];
      this.count = 0;
    }

    /** Called by the cell after each step (cell.attachRecorder). */
    onTick(cell) {
      if (cell.tick % this.every === 0) this.sample(cell);
    }

    /** Stores one sample now. */
    sample(cell) {
      if (this.count === this.capacity) this.thin();
      const view = typeof cell.observe === 'function' ? cell.observe() : null;
      const i = this.count;
      this.ticks[i] = cell.tick;
      for (let c = 0; c < this.channels.length; c++) this.data[c][i] = this.channels[c].read(cell, view);
      this.count = i + 1;
    }

    /**
     * Halves the stored samples and doubles the interval. Samples on ticks that
     * are multiples of the new interval are kept, so the kept ones line up with
     * the ones still to come.
     */
    thin() {
      const every = this.every * 2;
      let j = 0;
      for (let i = 0; i < this.count; i++) {
        if (this.ticks[i] % every !== 0) continue;
        this.ticks[j] = this.ticks[i];
        for (let c = 0; c < this.data.length; c++) this.data[c][j] = this.data[c][i];
        j++;
      }
      this.count = j;
      this.every = every;
    }

    series(name) { return this.byName[name] || null; }

    clear(every) {
      this.count = 0;
      if (every) this.every = every;
    }
  }

  /** The lab's channels (LAB_UI §5.1): per gene mRNA (mature + nascent) and protein, then cell-wide series. */
  Recorder.labChannels = function (cell) {
    const view = cell.observe();
    const ch = [];
    view.genes.forEach((g, i) => {
      ch.push({ name: 'mRNA:' + g.id, read: (c, v) => v.genes[i].mRNA + v.genes[i].nascent });
      ch.push({ name: 'protein:' + g.id, read: (c, v) => v.genes[i].protein });
    });
    ch.push({ name: 'ATP_mM', read: (c, v) => v.energy.ATP_mM });
    ch.push({ name: 'E', read: (c, v) => v.energy.E });
    ch.push({ name: 'V_fL', read: (c, v) => v.cell.V_fL });
    // Doublings per hour from the 5-min growth-rate average: λ/ln 2 × 3600.
    ch.push({ name: 'growth_dph', read: (c, v) => v.cell.lambdaEMA_perH / 0.6931471805599453 });
    ch.push({ name: 'aa_mM', read: (c, v) => v.aminoAcids.mM });
    ch.push({ name: 'lacIn_mM', read: (c, v) => v.lactose.inside_mM });
    ch.push({ name: 'ribosomes_elongating', read: (c, v) => v.ribosomes.elongating });
    view.ledger.names.forEach((name, i) => ch.push({ name: 'ledger:' + name, read: (c, v) => v.ledger.fractions[i] }));
    return ch;
  };

  return Recorder;
});
