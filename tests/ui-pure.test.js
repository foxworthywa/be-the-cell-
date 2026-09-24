// The lab UI's pure helpers (LAB_UI §11.1): layout classes (U-1), cell
// geometry (U-2), the narrator hold (U-7), the app loop under a fake clock
// (U-8), formatters (U-9) and plot scales (U-10).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const APP = path.join(__dirname, '..', 'src', 'app');
const req = (n) => require(path.join(APP, n + '.js'));
const LY = req('btc-layout'), G = req('btc-cellgeom'), F = req('btc-format'), Plot = req('btc-plot'), Loop = req('btc-loop');
const { NarratorHold } = req('btc-narrator-ui');
const Status = req('btc-status');
const D = require('../src/shared/btc-dots.js');

test('U-1: layout classes for phones, tablets and laptops; the short-screen flag below 600 px', () => {
  const cases = [[360, 740, 'compact'], [375, 553, 'compact'], [768, 1024, 'stack'], [740, 360, 'split'],
    [1280, 800, 'wide'], [1366, 768, 'wide'], [1024, 600, 'wide'], [600, 900, 'stack']];
  for (const [w, h, want] of cases) assert.equal(LY.classify(w, h), want, `${w}×${h}`);
  assert.equal(LY.isShort(553), true);
  assert.equal(LY.isShort(360), true);
  assert.equal(LY.isShort(740), false);
  // A tab missing from a layout maps to the nearest one.
  assert.equal(LY.mapTab('cell', 'stack'), 'genes');
  assert.equal(LY.mapTab('graphs', 'wide'), 'genes');
  assert.equal(LY.mapTab('medium', 'wide'), 'medium');
  assert.equal(LY.mapTab('graphs', 'split'), 'graphs');
});

test('U-2: mapped points lie strictly inside the rod; perimeter points on it with unit normals; points stretch, not jump', () => {
  for (const [w, h] of [[360, 420], [900, 440], [375, 230]]) {
    const g = G.create(w, h);
    G.fit(g, 3.08, 0.76, 0);
    const o = { x: 0, y: 0 };
    for (let k = 0; k < 100000; k++) {
      const p = D.pos('u2', k, 0);
      G.map(p.x, 2 * p.y - 1, g, o);
      if (!G.inside(g, o.x, o.y, -0.01)) assert.fail(`point ${k} (${o.x}, ${o.y}) not strictly inside at ${w}×${h}`);
    }
    const q = { x: 0, y: 0, nx: 0, ny: 0 };
    for (let k = 0; k < 2000; k++) {
      G.perimeter(k / 2000, g, q);
      // Distance from the axis segment equals the radius on the membrane.
      const s = g.vertical ? q.y - g.cy : q.x - g.cx, t = g.vertical ? q.x - g.cx : q.y - g.cy;
      const a = Math.max(0, Math.abs(s) - g.straight);
      assert.ok(Math.abs(Math.hypot(a, t) - g.r) <= 0.5, `perimeter ${k} off the membrane`);
      assert.ok(Math.abs(Math.hypot(q.nx, q.ny) - 1) < 1e-9, 'normal is not a unit vector');
    }
  }
  // Same input, same output; as the rod lengthens, a point moves monotonically outward along the axis.
  const g = G.create(360, 420), a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
  G.fit(g, 2.5, 0.76, 0); G.map(0.8, 0.3, g, a); G.map(0.8, 0.3, g, b);
  assert.deepEqual(a, b);
  let prev = -Infinity;
  for (let L = 2.4; L <= 4.6; L += 0.1) {
    G.fit(g, L, 0.76, 0); G.map(0.8, 0.3, g, a);
    assert.ok(a.y > prev, 'u = 0.8 moves toward the pole as the cell grows');
    prev = a.y;
  }
  // The rod that must fit (2.3 fL) plus 12% fits the long axis of the stage.
  const g2 = G.create(360, 420);
  assert.ok(G.lengthForVolume(2.3, 0.38) * g2.pxPerUm * 1.12 <= 420 + 1e-9);
});

test('U-2: the hit grid finds the nearest item within 16 px, and nothing farther away', () => {
  const grid = new G.HitGrid(16);
  grid.build(new Float32Array([10, 100, 105]), new Float32Array([10, 100, 112]), 3, 200, 200);
  assert.equal(grid.nearest(12, 12, 16), 0);
  assert.equal(grid.nearest(103, 104, 16), 1);
  assert.equal(grid.nearest(104, 111, 16), 2);
  assert.equal(grid.nearest(150, 150, 16), -1);
});

test('U-7: the narrator holds a line for 1.5 s, lets urgent rules in after 0.5 s, and writes only on a change', () => {
  let now = 0;
  const hold = new NarratorHold(() => now);
  assert.equal(hold.offer('growth.normal', null, 'a', false), true);
  now = 1000;
  assert.equal(hold.offer('gene.tx', 'fliC', 'b', false), false, 'held before 1.5 s');
  now = 1400;
  assert.equal(hold.offer('divided', null, 'c', false), false, 'only the latest candidate waits');
  now = 1500;
  assert.equal(hold.poll(), true);
  assert.equal(hold.key, 'divided');
  now = 1900;
  assert.equal(hold.offer('drug.cm', null, 'd', true), false, 'urgent, but not yet 0.5 s');
  now = 2000;
  assert.equal(hold.poll(), true, 'urgent rule after 0.5 s');
  assert.equal(hold.key, 'drug.cm');
  const writes = hold.writes;
  now = 9000;
  assert.equal(hold.offer('drug.cm', null, 'd', true), false, 'same key: no write');
  assert.equal(hold.writes, writes);
  // The preempt flag is exactly rules 1–11b.
  const N = require('../src/shared/btc-narrate.js');
  assert.deepEqual(N.RULES.filter((r) => r.preempt).map((r) => r.key).slice(-1), ['gene.noatp']);
});

function fakeLoop(opts) {
  let now = 0, cb = null, rafs = 0;
  const cell = { dt: 1, tick: 0, stepMs: opts.stepMs || 0, step() { this.tick++; now += this.stepMs; }, takeEvents: () => [] };
  const loop = new Loop({
    now: () => now, raf: (f) => { cb = f; return ++rafs; }, caf: () => { cb = null; }, getCell: () => cell, speed: opts.speed,
  });
  const frame = (dtMs) => { now += dtMs; const f = cb; cb = null; if (f) f(now); };
  return { loop, cell, frame, pending: () => cb !== null, clock: () => now };
}

test('U-8: the loop runs whole ticks at the chosen speed, stops while paused, and never catches up', () => {
  const t = fakeLoop({ speed: 60 });
  t.loop.start();
  t.frame(16);                                       // first frame: dt = 0, nothing advances
  assert.equal(t.cell.tick, 0);
  for (let i = 0; i < 60; i++) t.frame(1000 / 60);
  assert.ok(Math.abs(t.cell.tick - 60) <= 1, `60 ticks in a real second at 1 s = 1 min, got ${t.cell.tick}`);
  assert.ok(Math.abs(t.loop.stats.achievedSpeed - 60) < 3, 'reports the achieved speed');
  t.loop.stop();
  assert.equal(t.pending(), false, 'no animation frame is requested while paused');
  const before = t.cell.tick;
  t.frame(5000);
  assert.equal(t.cell.tick, before, 'no ticks while paused');
  t.loop.start();
  t.frame(16); t.frame(16);
  assert.ok(t.cell.tick - before <= 1, 'resuming does not catch up');
  // A 10 s hitch is capped at 0.25 s of real time.
  const b2 = t.cell.tick;
  t.frame(10000);
  assert.ok(t.cell.tick - b2 <= 15, `hitch capped, ran ${t.cell.tick - b2}`);
});

test('U-8: the engine gets at most 4 ms per frame; the rest is dropped and the device limit is reported', () => {
  const t = fakeLoop({ speed: 3600, stepMs: 0.5 });   // slow device: 0.5 ms per tick
  t.loop.start();
  t.frame(16);
  let maxPerFrame = 0;
  for (let i = 0; i < 240; i++) {
    const a = t.cell.tick;
    t.frame(1000 / 60);
    maxPerFrame = Math.max(maxPerFrame, t.cell.tick - a);
    assert.ok(t.loop.acc < 1, 'remainder dropped, no backlog');
  }
  assert.ok(maxPerFrame <= 9, `at most ~4 ms of steps per frame, ran ${maxPerFrame}`);
  assert.ok(t.loop.stats.behindFrames > 0);
  assert.ok(t.loop.stats.limited, 'the device-limit warning is on after 2 s behind');
  assert.ok(t.loop.stats.achievedSpeed < 0.9 * 3600);
});

test('U-9: counts, concentrations, percentages, clocks and speed labels', () => {
  assert.equal(F.count(0), '0');
  assert.equal(F.count(34100), '34,100');
  assert.equal(F.count(999999), '999,999');
  assert.equal(F.count(2.7e6), '2.7 million');
  assert.equal(F.count(12.4e6), '12 million');
  assert.equal(F.mM(10), '10 mM');
  assert.equal(F.mM(0.005), '0.005 mM');
  assert.equal(F.mM(3.1566), '3.2 mM');
  assert.equal(F.pct(0.04), '4%');
  assert.equal(F.pct(0.004), '0.4%');
  assert.equal(F.pct(0), '0%');
  assert.equal(F.clock(750, true), '12 min 30 s');
  assert.equal(F.clock(4320, false), '1 h 12 min');
  assert.equal(F.clock(45, true), '45 s');
  assert.equal(F.minutes(97.65), '98 min');
  assert.equal(F.minutes(150.2), '150 min');
  const C = req('btc-content');
  assert.deepEqual(C.speeds.map((s) => s.label), ['1 s = 1 s', '1 s = 10 s', '1 s = 1 min', '1 s = 10 min', '1 s = 1 h']);
  assert.deepEqual(C.speeds.map((s) => s.s), [1, 10, 60, 600, 3600]);
  assert.equal(F.speedLabel(1320), '1 s = 22 min');
  assert.equal(F.speedLabel(3600), '1 s = 1 h');
  assert.equal(F.speedLabel(59), '1 s = 59 s');
  assert.equal(F.capital('β-galactosidase'), 'β-galactosidase');
  assert.equal(F.capital('flagellin'), 'Flagellin');
});

test('U-9: the status strip shows the whole-cycle doubling time when steady, the recent one after a change', () => {
  const st = { recent: false };
  assert.equal(Status.growthText({ lastCycle_min: 97.65, doublingEMA_min: 100.8 }, 1000, false, st), 'doubling ≈ 98 min');
  assert.equal(Status.growthText({ lastCycle_min: 97.65, doublingEMA_min: 150 }, 1000, false, st), 'doubling ≈ 150 min (recent)');
  assert.equal(Status.growthText({ lastCycle_min: 97.65, doublingEMA_min: 110 }, 1000, false, st), 'doubling ≈ 110 min (recent)', 'hysteresis: still recent at 13%');
  assert.equal(Status.growthText({ lastCycle_min: 97.65, doublingEMA_min: 105 }, 1000, false, st), 'doubling ≈ 98 min');
  assert.equal(Status.growthText({ lastCycle_min: 97.65, doublingEMA_min: 105 }, 1000, true, st), 'not growing');
  assert.equal(Status.growthText({ lastCycle_min: null, doublingEMA_min: 105 }, 100, false, st), 'doubling: measuring…');
});

test('U-10: nice ticks cover the data; log ticks handle 0 and 1; thinning keeps each column\'s min and max', () => {
  for (const [lo, hi] of [[0, 0.9], [0, 4], [0, 13700], [0, 110731], [0, 1], [0, 0], [2, 37]]) {
    const t = Plot.niceTicks(lo, hi, 3);
    assert.ok(t.length >= 3 && t.length <= 5, `${lo}–${hi}: ${t}`);
    assert.ok(t[0] <= lo && t[t.length - 1] >= hi, `${lo}–${hi} covered by ${t}`);
  }
  assert.deepEqual(Plot.logTicks(0, 0), [1, 10]);
  assert.deepEqual(Plot.logTicks(1, 1), [1, 10]);
  assert.deepEqual(Plot.logTicks(1, 34100), [1, 10, 100, 1000, 10000, 100000]);
  assert.equal(Plot.xTicks(600).unit, 'min');
  assert.equal(Plot.xTicks(21600).unit, 'h');
  // 1,000 points over 10 columns, with one spike: the spike survives.
  const n = 1000, px = new Float64Array(n), ys = new Float64Array(n);
  for (let i = 0; i < n; i++) { px[i] = i / 100; ys[i] = i === 555 ? 99 : 1; }
  const mn = new Float64Array(10), mx = new Float64Array(10);
  assert.equal(Plot.thinForPixels(px, ys, n, 10, mn, mx), 10);
  assert.equal(mx[5], 99);
  assert.equal(mn[5], 1);
  assert.equal(mx[4], 1);
});
