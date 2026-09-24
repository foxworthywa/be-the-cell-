// Renderer support outside the determinism boundary (engine spec §12): the
// dots ladder and positions, flux emitters, and the Recorder.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { BTC, Cell } = H;
const D = BTC.dots;

test('dots: "1 dot = N" follows the ladder, with 20% hysteresis', () => {
  assert.equal(D.scaleFor(0), 1);
  assert.equal(D.scaleFor(120), 1);
  assert.equal(D.scaleFor(121), 10);
  assert.equal(D.scaleFor(118000), 1000, 'gly at the reference: about 118 dots of 1,000');
  // Rising: stays at 1,000 until the count needs more than 1.2 × 120 dots.
  assert.equal(D.scaleFor(140000, 120, 1000), 1000);
  assert.equal(D.scaleFor(145000, 120, 1000), 10000);
  // Falling: stays at 10⁴ until the smaller step fits in 120/1.2 = 100 dots.
  assert.equal(D.scaleFor(110000, 120, 10000), 10000);
  assert.equal(D.scaleFor(99000, 120, 10000), 1000);
  assert.equal(D.count(149, 100), 1);
  assert.equal(D.count(150, 100), 2);
  assert.deepEqual([D.polysomeScale(401), D.polysomeScale(350, 10), D.polysomeScale(319, 10), D.polysomeScale(350, 1)], [10, 10, 1, 1]);
});

test('dots: positions are stable per (species, index, epoch), spread out, and reshuffle only with the epoch', () => {
  const a = D.pos('p:ptsG', 7, 3), b = D.pos('p:ptsG', 7, 3, null, { x: 0, y: 0 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(D.pos('p:ptsG', 7, 4), a);
  const r = D.pos('m:12', 0, 1, { x: 10, y: 20, w: 100, h: 50 });
  assert.ok(r.x >= 10 && r.x < 110 && r.y >= 20 && r.y < 70);
  // 10,000 dots cover a 10 × 10 grid evenly (each cell 100 ± 40).
  const grid = new Array(100).fill(0);
  for (let k = 0; k < 10000; k++) { const p = D.pos('rib', k, 0); grid[Math.floor(p.x * 10) * 10 + Math.floor(p.y * 10)]++; }
  assert.ok(Math.min(...grid) > 60 && Math.max(...grid) < 140, `grid ${Math.min(...grid)}–${Math.max(...grid)}`);
  const h = D.hash01('p:lacY', 3, 0);
  assert.ok(h >= 0 && h < 1 && h === D.hash01('p:lacY', 3, 0));
});

test('dots: a flux emitter spawns exactly the flux over time, carrying remainders', () => {
  const e = new D.FluxEmitter(1e5);
  let n = 0;
  for (let i = 0; i < 1000; i++) n += e.add(5.8e5 * 0.37);      // 5.8e5 hexose/s, 0.37 sim-s per frame
  const exact = 5.8e5 * 0.37 * 1000 / 1e5;
  assert.ok(Math.abs(n + e.carry - exact) < 1e-9 * exact, `${n} particles + ${e.carry} carried vs ${exact}`);
  assert.ok(e.carry >= 0 && e.carry < 1);
  assert.equal(e.add(0), 0);
});

test('Recorder: samples on ticks, stores their ticks, and on thinning doubles its interval with no seam', () => {
  const c = new Cell({ seed: 1, start: 'steady' });
  const rec = new BTC.Recorder({ every: 5, capacity: 64, channels: [{ name: 'E', read: (x, v) => v.energy.E }, { name: 'tick', read: (x) => x.tick }] });
  c.attachRecorder(rec);
  c.advance(1000);
  assert.ok(rec.every > 5, 'thinning should have happened');
  const ticks = Array.from(rec.ticks.slice(0, rec.count));
  const gaps = new Set(ticks.slice(1).map((x, i) => x - ticks[i]));
  assert.deepEqual([...gaps], [rec.every], `uneven spacing ${[...gaps]}`);
  assert.equal(ticks[ticks.length - 1] % rec.every, 0);
  assert.deepEqual(Array.from(rec.series('tick').slice(0, rec.count)), ticks);
  // The every-doubling history: 5 → 10 → 20 … with the buffer never over capacity.
  assert.ok([10, 20, 40, 80].includes(rec.every) && rec.count <= 64);
  c.detachRecorder(rec);
  const n = rec.count;
  c.advance(100);
  assert.equal(rec.count, n);
});

test('Recorder: the lab channel set is the 27 channels of LAB_UI §5.1, and recording is deterministic', () => {
  const make = () => {
    const c = new Cell({ seed: 2, start: 'steady' });
    const rec = new BTC.Recorder({ every: 5, capacity: 4096, channels: BTC.Recorder.labChannels(c) });
    c.attachRecorder(rec);
    c.command({ type: 'setPromoter', gene: 'fliC', level: 4 });
    c.advance(600);
    return rec;
  };
  const a = make(), b = make();
  assert.equal(a.names.length, 27);
  assert.ok(a.names.includes('mRNA:fliC') && a.names.includes('ledger:translation') && a.names.includes('growth_dph'));
  for (const name of a.names) assert.deepEqual(a.series(name).slice(0, a.count), b.series(name).slice(0, b.count), name);
  const m = a.series('mRNA:fliC');
  assert.ok(m[a.count - 1] > 0, 'fliC mRNA recorded');
});
