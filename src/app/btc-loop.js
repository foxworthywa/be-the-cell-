// @deps
/*
 * Be the Cell: the app loop (LAB_UI §10.3; engine spec §10 frame contract).
 *
 * Simulated time advances by (real seconds × speed), in whole ticks, and the
 * engine gets at most 4 ms per frame. If a device cannot keep up, the rest is
 * dropped rather than carried: time never spirals, and the status strip shows
 * the speed actually achieved. Pausing stops requestAnimationFrame entirely;
 * nothing runs while paused or hidden, and resuming never catches up.
 *
 * now(), raf() and caf() are injected, so the whole loop runs under a fake
 * clock in Node (test U-8).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.Loop = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ENGINE_BUDGET_MS = 4;       // engine time per frame
  const MAX_FRAME_S = 0.25;         // a hitch longer than this is not caught up
  const WINDOW_S = 1;               // achieved speed is measured over the last real second
  const RING = 256;                 // frames kept for the rolling window

  /** Rolling one-second statistics, in preallocated rings (no per-frame allocation). */
  class Stats {
    constructor() {
      this.dt = new Float64Array(RING);
      this.ticks = new Float64Array(RING);
      this.ms = new Float64Array(RING);
      this.head = 0;
      this.n = 0;
      this.behindFrames = 0;
      this.achievedSpeed = 0;
      this.engineMsAvg = 0;
      this.ticksPerSecond = 0;
      // Device-limit warning: shown after 2 s below 0.9 × speed, cleared after 2 s at ≥ 0.95.
      this.limited = false;
      this.belowFor = 0;
      this.aboveFor = 0;
    }
    reset() {
      this.n = 0; this.head = 0; this.achievedSpeed = 0; this.engineMsAvg = 0;
      this.belowFor = 0; this.aboveFor = 0; this.limited = false;
    }
    record(done, ms, dtReal, dt, speed) {
      this.dt[this.head] = dtReal;
      this.ticks[this.head] = done;
      this.ms[this.head] = ms;
      this.head = (this.head + 1) % RING;
      if (this.n < RING) this.n++;
      let T = 0, k = 0, m = 0, f = 0;
      for (let i = 1; i <= this.n && T < WINDOW_S; i++) {
        const j = (this.head - i + RING) % RING;
        T += this.dt[j]; k += this.ticks[j]; m += this.ms[j]; f++;
      }
      this.ticksPerSecond = T > 0 ? k / T : 0;
      this.achievedSpeed = this.ticksPerSecond * dt;
      this.engineMsAvg = f > 0 ? m / f : 0;
      if (T < 0.5) return;                                  // too little data to judge
      if (this.achievedSpeed < 0.9 * speed) { this.belowFor += dtReal; this.aboveFor = 0; }
      else if (this.achievedSpeed >= 0.95 * speed) { this.aboveFor += dtReal; this.belowFor = 0; }
      if (!this.limited && this.belowFor >= 2) this.limited = true;
      if (this.limited && this.aboveFor >= 2) this.limited = false;
    }
  }

  class Loop {
    /**
     * opts: {now(), raf(fn), caf(id), getCell(), onEvents(events), render(dtReal, stepped), speed}
     */
    constructor(opts) {
      this.now = opts.now;
      this.raf = opts.raf;
      this.caf = opts.caf || (() => {});
      this.getCell = opts.getCell;
      this.onEvents = opts.onEvents || (() => {});
      this.render = opts.render || (() => {});
      this.speed = opts.speed || 60;
      this.running = false;
      this.acc = 0;
      this.last = null;
      this.rafId = 0;
      this.lastDone = 0;                // ticks run in the last frame (the view reads it for flux markers)
      this.stats = new Stats();
      this.frame = this.frame.bind(this);
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.last = null;                 // no catch-up: the first frame advances nothing
      this.acc = 0;
      this.stats.reset();
      this.rafId = this.raf(this.frame);
    }

    stop() {
      this.running = false;
      if (this.rafId) this.caf(this.rafId);
      this.rafId = 0;
    }

    setSpeed(s) {
      this.speed = s;
      this.acc = 0;
      this.stats.reset();
    }

    frame(ts) {
      if (!this.running) { this.rafId = 0; return; }
      const cell = this.getCell();
      const dtReal = this.last === null ? 0 : Math.min(MAX_FRAME_S, Math.max(0, (ts - this.last) / 1000));
      this.last = ts;
      this.acc += dtReal * this.speed;
      const want = Math.floor(this.acc / cell.dt);
      const t0 = this.now();
      let done = 0;
      while (done < want) {
        cell.step();
        done++;
        if (this.now() - t0 > ENGINE_BUDGET_MS) break;
      }
      this.acc -= done * cell.dt;
      if (done < want) { this.acc = 0; this.stats.behindFrames++; }   // drop the remainder; never spiral
      this.lastDone = done;
      this.stats.record(done, this.now() - t0, dtReal, cell.dt, this.speed);
      this.onEvents(cell.takeEvents());
      this.render(dtReal, done > 0);
      if (this.running) this.rafId = this.raf(this.frame);
    }
  }

  Loop.Stats = Stats;
  Loop.ENGINE_BUDGET_MS = ENGINE_BUDGET_MS;
  return Loop;
});
