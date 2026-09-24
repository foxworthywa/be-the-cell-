// Determinism and replay (engine spec §14.3 d-1 … d-10, except d-4 and d-7,
// which are in golden.test.js). A run is (config, seed, command log): the same
// three things must give the same cell, bit for bit, in any order of saving,
// restoring and forking.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { BTC, Cell, randomCommand } = H;
const R = BTC.prng;

/** Steps a cell to `ticks`, submitting commands [[tick, cmd], …] at their ticks; returns the cell. */
function play(cell, commands, ticks, onTick) {
  let next = 0;
  while (cell.tick < ticks) {
    while (next < commands.length && commands[next][0] === cell.tick) cell.command(commands[next++][1]);
    cell.step();
    if (onTick) onTick(cell);
  }
  return cell;
}

const LOG = [
  [500, { type: 'setPromoter', gene: 'fliC', level: 4 }],
  [3000, { type: 'setMedium', glucose_mM: 0.005 }],
  [6000, { type: 'setDrug', drug: 'chloramphenicol', dose: 0.3 }],
  [9000, { type: 'setDrug', drug: 'chloramphenicol', dose: 0 }],
  [12000, { type: 'setPromoter', gene: 'fliC', level: 'off' }],
  [15000, { type: 'setMedium', glucose_mM: 10 }],
];

test('d-1: the same config, seed and log give the same hash after 20,000 ticks; another seed gives another', () => {
  const a = play(new Cell({ seed: 3, start: 'steady' }), LOG, 20000);
  const b = play(new Cell({ seed: 3, start: 'steady' }), LOG, 20000);
  const c = play(new Cell({ seed: 4, start: 'steady' }), LOG, 20000);
  assert.equal(a.hash(), b.hash());
  assert.notEqual(a.hash(), c.hash());
});

// Commands the engine must turn down, one per rejection code (tick-in-past is scheduled separately).
const INVALID = [
  { type: 'setPromoter', gene: 'lacI', level: 1 },                  // unknown-gene
  { type: 'setPromoter', gene: 'fliC', level: 3 },                  // bad-value
  { type: 'setMedium', oxygen: true },                              // not-available
  { type: 'mark', label: 'deferred' },                              // unknown-type (marks are deferred, §20)
  { type: 'setDrug', drug: 'rifampicin', dose: 1.5 },               // bad-value
  { type: 'setMRNAHalfLife', gene: 'ptsG', s: 10 },                 // bad-value
  { type: 'setPromoter', gene: 'fliC', level: 1, source: 'schedule' }, // bad-value: only config.schedule has that source
];

/** 30 seeded commands at random ticks: mostly valid, some invalid, a few scheduled ahead by a lesson. */
function liveRun(seed, ticks) {
  const s = R.seedStream(seed, 'd2-commands');
  const cfg = { seed, start: 'steady', schedule: [{ tick: 50, cmd: { type: 'setPromoter', gene: 'lacZ', level: 0.25 } }] };
  const cell = new Cell(cfg);
  const plan = [];
  for (let i = 0; i < 30; i++) {
    const at = Math.floor(R.uniform(s) * (ticks - 10));
    const u = R.uniform(s);
    const cmd = u < 0.2 ? INVALID[Math.floor(R.uniform(s) * INVALID.length)] : randomCommand(s);
    plan.push({ at, cmd, lesson: u > 0.9 ? at + 1 + Math.floor(R.uniform(s) * 300) : null });
  }
  plan.push({ at: 1000, cmd: { type: 'setPromoter', gene: 'gly', level: 2 }, lesson: 500 });   // tick-in-past
  plan.sort((a, b) => a.at - b.at);
  const events = [];
  let next = 0;
  while (cell.tick < ticks) {
    while (next < plan.length && plan[next].at === cell.tick) {
      const p = plan[next++];
      if (p.lesson !== null) cell.schedule(p.lesson, p.cmd); else cell.command(p.cmd);
    }
    cell.step();
    for (const e of cell.takeEvents()) if (e.type === 'command_applied' || e.type === 'command_rejected') events.push(e);
  }
  return { cell, events };
}

test('d-2: a live run with 30 random commands replays exactly: every checkpoint, every command event', (t) => {
  const ticks = 7200;
  const { cell, events } = liveRun(11, ticks);
  const record = cell.runRecord();
  const rejected = events.filter((e) => e.type === 'command_rejected');
  const codes = new Set(rejected.map((e) => e.code));
  t.diagnostic(`${events.length} command events, ${rejected.length} rejected (${[...codes].join(', ')}); ${record.checkpoints.length} checkpoints`);
  assert.ok(rejected.length >= 4 && codes.has('tick-in-past'), 'the run should include rejected commands');
  assert.equal(record.checkpoints.length, ticks / Cell.CHECKPOINT_EVERY);

  const v = BTC.replay.verify(record);
  assert.deepEqual(v, { ok: true, finalHash: cell.hash() });

  // The replay emits the same command events, field for field (tick, seq, cmdType, args, resolved, prev, code).
  const replayed = BTC.replay.run(record).takeEvents().filter((e) => e.type === 'command_applied' || e.type === 'command_rejected');
  assert.deepEqual(replayed, events);
  for (const e of events) {
    for (const key of ['tick', 'tEnd_s', 'seq', 'cmdType', 'args', 'resolved', 'prev']) assert.ok(key in e, `${e.type} lacks ${key}`);
    if (e.type === 'command_rejected') assert.ok(e.code && e.resolved === null);
  }

  // A tampered log is caught at the first checkpoint after the change.
  const bad = JSON.parse(JSON.stringify(record));
  const entry = bad.log.find((e) => e.type === 'setMedium' && !e.rejected && e.tick > 600);
  entry.args.glucose_mM = entry.args.glucose_mM === 10 ? 0 : 10;
  const w = BTC.replay.verify(bad);
  assert.equal(w.ok, false);
  assert.ok(w.mismatchTick >= entry.tick && w.mismatchTick <= entry.tick + Cell.CHECKPOINT_EVERY, `mismatch reported at ${w.mismatchTick}, change at ${entry.tick}`);
});

/** The view's valid data only: per-gene arrays cut to their counts (the rest is stale by design, §11.5). */
function viewData(v) {
  const o = JSON.parse(JSON.stringify(v));
  v.genes.forEach((g, i) => {
    o.genes[i].mRNAIds = Array.from(g.mRNAIds.slice(0, g.mRNA));
    o.genes[i].mRNABirthTick = Array.from(g.mRNABirthTick.slice(0, g.mRNA));
    o.genes[i].nascentProgress = Array.from(g.nascentProgress.slice(0, g.nascent));
  });
  delete o.geneById;
  return o;
}

test('d-3: snapshot at tick 7,777 → JSON → restore → continue matches the uninterrupted run', () => {
  const a = play(new Cell({ seed: 5, start: 'steady' }), LOG, 7777);
  a.schedule(8000, { type: 'setPromoter', gene: 'ptsG', level: 2 });     // still pending at the snapshot
  const text = JSON.stringify(a.snapshot());
  const b = Cell.restore(JSON.parse(text));
  assert.deepEqual(b.stateBytes(false), a.stateBytes(false), 'state bytes round-trip exactly');
  assert.equal(b.hash(), a.hash());
  assert.equal(b.pending.length, 1);
  // The view of a restored cell shows the same last-tick fluxes (scratch is part of the snapshot).
  assert.deepEqual(viewData(b.observe()), viewData(a.observe()));
  const rest = LOG.filter(([tick]) => tick > 7777);
  play(a, rest, 14000);
  play(b, rest, 14000);
  assert.equal(b.hash(), a.hash());
  assert.deepEqual(b.checkpoints, a.checkpoints);
  // The restored cell's run record still verifies from tick 0.
  assert.equal(BTC.replay.verify(b.runRecord()).ok, true);
});

test('d-5: reset is a new cell: after any run, new Cell(config) hashes equal to a fresh one', () => {
  const cfg = { seed: 9, start: 'steady', genes: { fliC: { level: 2 } }, schedule: [{ tick: 10, cmd: { type: 'setMedium', lactose_mM: 5 } }] };
  const fresh = new Cell(cfg).hash();
  const used = new Cell(cfg);
  play(used, LOG, 4000);
  used.fork().advance(100);
  assert.equal(new Cell(cfg).hash(), fresh);
  assert.equal(new Cell(used.config).hash(), fresh, 'the stored config is not changed by running');
});

// Bit-level perturbations for test d-6.
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
function nextUp(x) {
  if (x !== x) return 0.5;
  f64[0] = x;
  if (x === 0) return Number.MIN_VALUE;
  if (x > 0) { if (u32[0] === 0xffffffff) { u32[0] = 0; u32[1]++; } else u32[0]++; }
  else { if (u32[0] === 0) { u32[0] = 0xffffffff; u32[1]--; } else u32[0]--; }
  return f64[0];
}

function perturb(c, path, type) {
  const parts = path.split('.');
  if (path.startsWith('genes[].') || path.startsWith('sectors[].')) {
    const list = path.startsWith('genes') ? c.genes : c.sectors, field = path.slice(path.indexOf('.') + 1);
    // One perturbation per unit, each on its own twin: every gene's and sector's copy must be covered.
    return list.map((u, i) => (x) => perturbUnit((path.startsWith('genes') ? x.genes : x.sectors)[i], field, type));
  }
  return [(x) => {
    let o = x;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    const k = parts[parts.length - 1];
    switch (type) {
      case 'f64': o[k] = nextUp(o[k]); break;
      case 'int': o[k] = o[k] + 1; break;
      case 'bool': o[k] = !o[k]; break;
      case 'enum': o[k] = o[k] === 'locked' ? 'free' : 'locked'; break;
      case 'stream': o[k][0] ^= 1; break;
      case 'f64x6': o[k][3] = nextUp(o[k][3]); break;
      case 'pending': o[k].push({ tick: x.tick + 5, seq: x.seqNext, type: 'setRBS', args: { gene: 'fliC', rbs: 3 }, source: 'user' }); break;
      default: throw new Error('no perturbation for ' + type);
    }
  }];
}

function perturbUnit(u, field, type) {
  switch (type) {
    case 'f64': u[field] = nextUp(u[field]); break;
    case 'bool': u[field] = !u[field]; break;
    case 'stream': u[field][0] ^= 1; break;
    case 'list': {
      const q = u[field];
      if (field === 'mature') q.ids[0] += 1;
      else if (field === 'nascent') q.N0[q.index(0)] = nextUp(q.N0[q.index(0)]);
      else q.n[q.head] = nextUp(q.n[q.head]);
      break;
    }
    default: throw new Error('no perturbation for ' + type);
  }
}

test('d-6: hash coverage: perturbing any field of STATE_LAYOUT by one ulp changes the hash', (t) => {
  // A cell with something in every list: all genes on (so each has mRNA, transcripts and ribosomes) and a pending command.
  const genes = {};
  for (const id of H.GENE_IDS) genes[id] = { level: 4 };
  const base = new Cell({ seed: 2, start: 'steady', genes });
  base.advance(900);
  base.schedule(base.tick + 10, { type: 'setPromoter', gene: 'fliC', level: 1 });
  for (const g of base.genes) assert.ok(g.mature.count > 0 && g.nascent.len > 0 && g.cohorts.len > 0, `${g.id} has an empty list`);
  const h0 = base.hash(), d0 = base.physicsDigest();
  let checked = 0;
  for (const { path, type } of Cell.STATE_LAYOUT) {
    for (const change of perturb(base, path, type)) {
      const c = base.fork();
      assert.equal(c.hash(), h0);
      change(c);
      assert.notEqual(c.hash(), h0, `perturbing ${path} did not change the hash`);
      // physicsDigest leaves out only the medium, the drugs and the command queue.
      const outside = path.startsWith('env.') || path === 'rifDose' || path === 'cmDose' || path === 'pending' || path === 'seqNext';
      if (outside) assert.equal(c.physicsDigest(), d0, `${path} should not enter physicsDigest`);
      else assert.notEqual(c.physicsDigest(), d0, `perturbing ${path} did not change physicsDigest`);
      checked++;
    }
  }
  t.diagnostic(`${Cell.STATE_LAYOUT.length} layout fields, ${checked} perturbations`);
});

test('d-8: a fork() twin given one command keeps every other gene\'s transcription stream in step', () => {
  const a = H.warm(4);
  const b = a.fork();
  assert.equal(b.hash(), a.hash());
  b.command({ type: 'setPromoter', gene: 'fliC', level: 4 });
  const others = b.genes.filter((g) => g.id !== 'fliC');
  for (let i = 0; i < 3000; i++) {
    a.step(); b.step();
    for (const g of others) assert.deepEqual(b.gene(g.id).txStream, a.gene(g.id).txStream, `tick ${a.tick}: ${g.id} stream out of step`);
  }
  assert.ok(b.gene('fliC').P > a.gene('fliC').P + 1000, 'the command had an effect');
});

test('d-9: run records carry the preset; −0 never enters the log; a pending command survives JSON', () => {
  const c = new Cell({ seed: 1, start: 'steady' });
  c.advance(10);
  const record = c.runRecord();
  assert.equal(record.presetHash, BTC.presets['m1-lab-glucose'].hash);
  assert.equal(c.presetHash, record.presetHash);
  assert.equal(new Cell({ seed: 1, start: 'cold' }).presetHash, null);

  const altered = Object.assign({}, record, { presetHash: '0123456789abcdef' });
  assert.throws(() => BTC.replay.run(altered), (err) => err.code === 'config-hash' && /configHash/.test(err.message));
  const alteredConfig = Object.assign({}, record, { configHash: '0123456789abcdef' });
  assert.throws(() => BTC.replay.run(alteredConfig), (err) => err.code === 'config-hash');

  const r = c.schedule(20, { type: 'setDrug', drug: 'rifampicin', dose: -0 });
  assert.equal(r.ok, true);
  const entry = c.getLog().find((e) => e.seq === r.seq);
  assert.ok(Object.is(entry.args.dose, 0), 'the log holds 0, not −0');
  assert.ok(Object.is(c.pending[0].args.dose, 0), 'the queue holds 0, not −0');
  const d = Cell.restore(JSON.parse(JSON.stringify(c.snapshot())));
  assert.equal(d.hash(), c.hash());
  assert.equal(d.pending.length, 1);
  c.advance(20); d.advance(20);
  assert.equal(d.hash(), c.hash());
});

test('d-10: locked controls reject only the student\'s commands; the level\'s own program still runs', () => {
  const c = new Cell({
    seed: 1, start: 'steady', flags: { controls: 'locked' },
    schedule: [{ tick: 5, cmd: { type: 'setPromoter', gene: 'fliC', level: 4 } }],
  });
  const user = c.command({ type: 'setPromoter', gene: 'fliC', level: 4 });
  assert.deepEqual([user.ok, user.error], [false, 'locked']);
  const rbs = c.command({ type: 'setRBS', gene: 'lacZ', rbs: 2 });
  assert.equal(rbs.error, 'locked');
  const lesson = c.schedule(7, { type: 'setPromoter', gene: 'lacZ', level: 1 });
  assert.equal(lesson.ok, true, 'lesson commands are not locked');
  const medium = c.command({ type: 'setMedium', lactose_mM: 5 });
  assert.equal(medium.ok, true, 'locking covers the gene dials only');
  c.advance(10);
  assert.equal(c.gene('fliC').level, 4);
  assert.equal(c.gene('lacZ').level, 1);
  const log = c.getLog();
  assert.equal(log.find((e) => e.source === 'schedule').resolved.level, 4);
  assert.equal(log.filter((e) => e.rejected === 'locked').length, 2);
  const ev = c.takeEvents().filter((e) => e.type === 'command_rejected');
  assert.deepEqual(ev.map((e) => [e.seq, e.code, e.cmdType]), [[user.seq, 'locked', 'setPromoter'], [rbs.seq, 'locked', 'setRBS']]);
  assert.deepEqual(ev[0].prev, { level: 'off', rate_perS: c.gene('fliC').rRef * H.PV.leak }, 'prev is the control before the command');
});

test('commands: every rejection code, canonical arguments, and resolved/prev values in the event', () => {
  const c = new Cell({ seed: 1, start: 'steady' });
  const code = (cmd, tick) => { const r = tick === undefined ? c.command(cmd) : c.schedule(tick, cmd); return r.ok ? 'ok' : r.error; };
  c.advance(5);
  assert.equal(code({ type: 'grow' }), 'unknown-type');
  assert.equal(code({ type: 'mark', label: 'x' }), 'unknown-type');
  assert.equal(code({ type: 'setPromoter', gene: 'lacI', level: 1 }), 'unknown-gene');
  assert.equal(code({ type: 'setPromoter', gene: 'fliC', level: 3 }), 'bad-value');
  assert.equal(code({ type: 'setPromoter', gene: 'fliC', rate_perS: 0.31 }), 'bad-value');
  assert.equal(code({ type: 'setRBS', gene: 'fliC', rbs: 0 }), 'bad-value');
  assert.equal(code({ type: 'setKnockout', gene: 'fliC', knockout: 1 }), 'bad-value');
  assert.equal(code({ type: 'setMedium', oxygen: true }), 'not-available');
  assert.equal(code({ type: 'setMedium', glucose_mM: -1 }), 'bad-value');
  assert.equal(code({ type: 'setDrug', drug: 'penicillin', dose: 1 }), 'bad-value');
  assert.equal(code({ type: 'setMRNAHalfLife', gene: 'fliC', s: 2000 }), 'bad-value');
  assert.equal(code({ type: 'setDegradation', gene: 'fliC', perS: 0.02 }), 'bad-value');
  assert.equal(code({ type: 'setPromoter', gene: 'fliC', level: 1 }, 2), 'tick-in-past');
  assert.equal(code({ type: 'setPromoter', gene: 'fliC', level: 1, source: 'hacker' }), 'bad-value');
  assert.equal(code({ type: 'setPromoter', gene: 'fliC', level: 1, source: 'schedule' }), 'bad-value', "'schedule' is the config's own source");
  assert.equal(code({ type: 'setPromoter', gene: 'fliC', level: 2 }), 'ok');
  assert.equal(code({ type: 'setPromoter', gene: 'fliC', level: 4 }, 8), 'ok');
  c.takeEvents();
  c.advance(5);
  const applied = c.takeEvents().filter((e) => e.type === 'command_applied');
  assert.equal(applied.length, 2);
  assert.deepEqual(applied[0].prev, { level: 'off', rate_perS: c.gene('fliC').rRef * H.PV.leak });
  assert.deepEqual(applied[0].resolved, { level: 2, rate_perS: c.gene('fliC').rRef * 2 });
  assert.deepEqual(applied[1].prev, applied[0].resolved);
  assert.equal(applied[1].tick, 8);
  assert.equal(applied[0].tick, 5);
  const log = c.getLog();
  assert.equal(log.length, 17);
  log.forEach((e, i) => assert.equal(e.seq, i));
  assert.equal(log[15].resolved.rate_perS, c.gene('fliC').rRef * 2, 'the log stores the resolved per-copy rate');
});
