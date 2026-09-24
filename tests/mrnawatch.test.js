// The watched mRNA (docs/PROLOGUE.md §3.5, §10.1 ZC-4): one copy's share of its gene's ribosomes,
// counted per tick from the view (attached to the cell like a recorder), so it is exact whatever
// the frame rate and the same on replay. Chains already started finish after the copy is broken down.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { Cell } = H;
const W = require('../src/shared/btc-mrnawatch.js');

test('ZC-4: watchers on every copy account for every ribosome that started on a mature copy; the count stops after the copy is gone', () => {
  const c = new Cell({ seed: 6, start: 'birth', genes: { lacY: { level: 2 } } });
  c.advance(900);
  const watchers = new Map();
  let expected = 0;
  let prevIds = new Set();
  const gen = c.observe().clock.generation;
  for (let t = 0; t < 1800; t++) {
    // A new copy gets its own watcher the tick after it appears.
    const v0 = c.observe(), g0 = v0.geneById.lacY;
    for (let j = 0; j < g0.mRNA; j++) {
      const id = g0.mRNAIds[j];
      if (!watchers.has(id)) { const w = new W('lacY'); assert.ok(w.watch(c, id)); c.attachRecorder(w); watchers.set(id, w); }
    }
    prevIds = new Set(Array.from(g0.mRNAIds.slice(0, g0.mRNA)));
    c.step();
    const g = c.observe().geneById.lacY;
    // The model's own even split: each copy mature at the tick's start took tlStarts / tlCopies.
    if (g.tlCopies > 0) expected += (g.tlStarts_perS * c.dt * prevIds.size) / g.tlCopies;
  }
  assert.equal(c.observe().clock.generation, gen, 'no division in the window');
  let started = 0, made = 0, flying = 0, gone = 0;
  for (const w of watchers.values()) {
    started += w.started; made += w.made; flying += w.inFlight;
    assert.ok(Math.abs(w.made + w.inFlight - w.started) < 1e-9 * Math.max(1, w.started));
    if (!w.alive) { gone++; assert.equal(w.reason, 'decay'); assert.ok(w.lifetime() > 0); }
  }
  assert.ok(Math.abs(started - expected) <= 1e-9 * expected, started + ' vs ' + expected);
  assert.ok(gone > 10, gone + ' copies broken down');
  assert.ok(made > 0.8 * started);
  // A copy lasts minutes and is read into tens of proteins (level 1.2's "about twenty").
  const done = Array.from(watchers.values()).filter((w) => w.done);
  const mean = done.reduce((s, w) => s + w.made, 0) / done.length;
  assert.ok(mean > 5 && mean < 60, 'a copy is read into about ' + mean.toFixed(1));
});

test('ZC-4: after the watched copy is broken down its chains in flight finish, then the count stops', () => {
  const c = new Cell({ seed: 3, start: 'steady', genes: { lacY: { level: 2 } } });
  c.advance(1200);
  const w = new W('lacY');
  assert.ok(w.watchNewest(c));
  c.attachRecorder(w);
  let t = 0;
  while (w.alive && t++ < 7200) c.step();
  assert.equal(w.alive, false, 'the copy was broken down');
  const startedAtEnd = w.started;
  const L = c.observe().geneById.lacY.length_aa, v = c.observe().ribosomes.vRun_aaPerS;
  c.advance(Math.ceil((1.5 * L) / v) + 2);
  assert.equal(w.started, startedAtEnd, 'no new ribosomes start on a broken-down copy');
  assert.equal(w.inFlight, 0, 'the chains in flight finished');
  assert.ok(Math.abs(w.made - w.started) < 1e-9 * w.started);
  const made = w.made;
  c.advance(300);
  assert.equal(w.made, made, 'then the count stops');
  assert.ok(w.state().lifetime_s > 0 && w.state().id === w.id);
});

test('ZC-4: save and restore continue the count exactly; an unknown copy is refused', () => {
  const run = (split) => {
    const c = new Cell({ seed: 9, start: 'steady', genes: { lacY: { level: 4 } } });
    c.advance(900);
    let w = new W('lacY');
    w.watchNewest(c);
    c.attachRecorder(w);
    c.advance(split);
    if (split < 600) {
      c.detachRecorder(w);
      w = W.restore(JSON.parse(JSON.stringify(w.save())));
      c.attachRecorder(w);
    }
    c.advance(600 - split);
    return w.state();
  };
  assert.deepEqual(run(250), run(600));
  const c = new Cell({ seed: 9, start: 'steady' });
  assert.equal(new W('lacY').watch(c, 123456789), false);
});
