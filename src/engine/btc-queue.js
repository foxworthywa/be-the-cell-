// @deps btc-prng
/*
 * Be the Cell: fixed-capacity queues for molecules in flight (engine spec §6).
 *
 * CohortQueue   ribosomes on one kind of mRNA. A cohort is a group of n
 *               ribosomes that started at odometer reading D0; they finish when
 *               the ribosome odometer D has advanced by the chain length L.
 *               Running sums (nSum, nD0Sum) give the ribosome count and the
 *               aa in growing chains without walking the queue.
 * NascentQueue  transcripts still being made, oldest first (odometer N0, start tick).
 * MoleculeList  mature mRNA molecules in id order (id, birth tick).
 *
 * All storage is allocated once; step() never allocates.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-prng.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.queue = factory(B.prng);
  }
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  // Ribosomes that start within half a residue of the newest cohort join it (this only
  // happens when translation nearly stalls). Cohorts are therefore ≥ 0.5 aa apart, so a
  // chain of L aa holds ≤ 2L + 1 of them.
  const MERGE_AA = 0.5;

  class CohortQueue {
    constructor(capacity) {
      this.cap = capacity;
      this.D0 = new Float64Array(capacity);
      this.n = new Float64Array(capacity);
      this.head = 0;
      this.len = 0;
      this.nSum = 0;      // ribosomes in flight
      this.nD0Sum = 0;    // Σ n·D0, so aa in growing chains = D·nSum − nD0Sum
    }

    push(D, n) {
      if (!(n > 0)) return;
      if (this.len > 0) {
        let tail = this.head + this.len - 1;
        if (tail >= this.cap) tail -= this.cap;
        if (D - this.D0[tail] < MERGE_AA) {
          // The merged cohort starts at the ribosome-weighted mean odometer reading,
          // so the aa already in chains (D·nSum − nD0Sum) is unchanged by the merge.
          const nt = this.n[tail];
          this.D0[tail] += n * (D - this.D0[tail]) / (nt + n);
          this.n[tail] = nt + n;
          this.nSum += n;
          this.nD0Sum += n * D;
          return;
        }
      }
      if (this.len === this.cap) throw new Error('CohortQueue overflow');
      let i = this.head + this.len;
      if (i >= this.cap) i -= this.cap;
      this.D0[i] = D;
      this.n[i] = n;
      this.len++;
      this.nSum += n;
      this.nD0Sum += n * D;
    }

    headD0() { return this.D0[this.head]; }
    headN() { return this.n[this.head]; }

    popHead() {
      const n = this.n[this.head];
      this.nSum -= n;
      this.nD0Sum -= n * this.D0[this.head];
      this.head++;
      if (this.head === this.cap) this.head = 0;
      this.len--;
      if (this.len === 0) { this.nSum = 0; this.nD0Sum = 0; this.head = 0; }
    }

    /** aa already joined into chains that are still growing. */
    nascentAA(D) { return D * this.nSum - this.nD0Sum; }

    /** Division: every cohort keeps a fraction f; odometer rebased by −D; sums recomputed. */
    scaleAndRebase(f, D) {
      let nSum = 0, nD0Sum = 0;
      for (let k = 0; k < this.len; k++) {
        let i = this.head + k;
        if (i >= this.cap) i -= this.cap;
        this.n[i] *= f;
        this.D0[i] -= D;
        nSum += this.n[i];
        nD0Sum += this.n[i] * this.D0[i];
      }
      this.nSum = nSum;
      this.nD0Sum = nD0Sum;
    }

    /** Oldest-first copy of the entries (tests and inspection; allocates). */
    entries() {
      const out = [];
      for (let k = 0; k < this.len; k++) {
        const i = (this.head + k) % this.cap;
        out.push({ D0: this.D0[i], n: this.n[i] });
      }
      return out;
    }

    write(w) {
      w.i32(this.len);
      for (let k = 0; k < this.len; k++) {
        let i = this.head + k;
        if (i >= this.cap) i -= this.cap;
        w.f64(this.D0[i]);
        w.f64(this.n[i]);
      }
      w.f64(this.nSum);
      w.f64(this.nD0Sum);
    }

    read(r) {
      const len = r.i32();
      if (len > this.cap) throw new Error('CohortQueue: stored length exceeds capacity');
      this.head = 0;
      this.len = len;
      for (let k = 0; k < len; k++) { this.D0[k] = r.f64(); this.n[k] = r.f64(); }
      this.nSum = r.f64();
      this.nD0Sum = r.f64();
    }
  }

  class NascentQueue {
    constructor(capacity) {
      this.cap = capacity;
      this.N0 = new Float64Array(capacity);
      this.initTick = new Int32Array(capacity);
      this.head = 0;
      this.len = 0;
    }

    push(N0, tick) {
      if (this.len === this.cap) throw new Error('NascentQueue overflow');
      let i = this.head + this.len;
      if (i >= this.cap) i -= this.cap;
      this.N0[i] = N0;
      this.initTick[i] = tick;
      this.len++;
    }

    /** Odometer reading at which the newest transcript started (NaN if empty). */
    tailN0() {
      if (this.len === 0) return NaN;
      let i = this.head + this.len - 1;
      if (i >= this.cap) i -= this.cap;
      return this.N0[i];
    }

    headN0() { return this.N0[this.head]; }

    popHead() {
      this.head++;
      if (this.head === this.cap) this.head = 0;
      this.len--;
      if (this.len === 0) this.head = 0;
    }

    /** Entry k (0 = oldest) as an index into N0/initTick. */
    index(k) {
      let i = this.head + k;
      if (i >= this.cap) i -= this.cap;
      return i;
    }

    /** Division: each transcript stays with this daughter on a fair coin (stream s), oldest first. Returns kept. */
    halve(s) {
      let j = 0;
      for (let k = 0; k < this.len; k++) {
        const i = this.index(k);
        if (R.uniform(s) < 0.5) {
          const o = this.index(j);
          this.N0[o] = this.N0[i];
          this.initTick[o] = this.initTick[i];
          j++;
        }
      }
      this.len = j;
      if (j === 0) this.head = 0;
      return j;
    }

    rebase(N) {
      for (let k = 0; k < this.len; k++) this.N0[this.index(k)] -= N;
    }

    shiftTicks(offset) {
      for (let k = 0; k < this.len; k++) this.initTick[this.index(k)] += offset;
    }

    write(w) {
      w.i32(this.len);
      for (let k = 0; k < this.len; k++) {
        const i = this.index(k);
        w.f64(this.N0[i]);
        w.i32(this.initTick[i]);
      }
    }

    read(r) {
      const len = r.i32();
      if (len > this.cap) throw new Error('NascentQueue: stored length exceeds capacity');
      this.head = 0;
      this.len = len;
      for (let k = 0; k < len; k++) { this.N0[k] = r.f64(); this.initTick[k] = r.i32(); }
    }
  }

  class MoleculeList {
    constructor(capacity) {
      this.cap = capacity;
      this.ids = new Int32Array(capacity);
      this.birth = new Int32Array(capacity);
      this.count = 0;
    }

    add(id, birthTick) {
      if (this.count === this.cap) throw new Error('MoleculeList overflow');
      this.ids[this.count] = id;
      this.birth[this.count] = birthTick;
      this.count++;
    }

    /** Removes each molecule with probability p (one draw each, in id order). Returns the number removed. */
    decay(s, p) {
      let j = 0;
      const n = this.count;
      for (let i = 0; i < n; i++) {
        if (R.uniform(s) < p) continue;
        if (j !== i) { this.ids[j] = this.ids[i]; this.birth[j] = this.birth[i]; }
        j++;
      }
      this.count = j;
      return n - j;
    }

    /** Division: each molecule stays with this daughter on a fair coin, in id order. Returns kept. */
    halve(s) {
      let j = 0;
      const n = this.count;
      for (let i = 0; i < n; i++) {
        if (R.uniform(s) < 0.5) {
          if (j !== i) { this.ids[j] = this.ids[i]; this.birth[j] = this.birth[i]; }
          j++;
        }
      }
      this.count = j;
      return j;
    }

    shiftTicks(offset) {
      for (let i = 0; i < this.count; i++) this.birth[i] += offset;
    }

    write(w) {
      w.i32(this.count);
      for (let i = 0; i < this.count; i++) { w.i32(this.ids[i]); w.i32(this.birth[i]); }
    }

    read(r) {
      const n = r.i32();
      if (n > this.cap) throw new Error('MoleculeList: stored length exceeds capacity');
      this.count = n;
      for (let i = 0; i < n; i++) { this.ids[i] = r.i32(); this.birth[i] = r.i32(); }
    }
  }

  return { CohortQueue, NascentQueue, MoleculeList, MERGE_AA };
});
