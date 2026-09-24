// L-1 (LEVELS §12.1): every level definition validates against §3.2; ids,
// codes and orders are unique; phases are legal and in order; flag lists are
// at most 8; every question has one ok option, at least 3 options, feedback on
// all and a misconception on the wrong ones; every misconception is
// registered. Also: the game and level files load in Node and in a bare
// browser-like context, and build-files.json lists them in the §2 order.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LV = require('../src/game/btc-levels.js');
const MC = require('../src/game/btc-misconceptions.js');
const stub = require('./fixtures/btc-level-stub.js');

const LEVEL_DIR = path.join(ROOT, 'src', 'levels');
const levelFiles = fs.readdirSync(LEVEL_DIR).filter((f) => /^btc-level-[\w-]+\.js$/.test(f) && f !== 'btc-level-constants.js').sort();
const shipped = () => levelFiles.map((f) => require(path.join(LEVEL_DIR, f)));

test('L-1: every shipped level and the stub fixtures validate; ids, codes and orders are unique', () => {
  assert.ok(levelFiles.indexOf('btc-level-p.js') >= 0, 'the Prologue is shipped');
  const defs = shipped().concat([stub.playable()]);
  const reg = LV.build(Object.fromEntries(defs.map((d) => [d.id, d])));
  assert.equal(reg.list.length, defs.length);
  assert.deepEqual(reg.list.map((d) => d.order), reg.list.map((d) => d.order).slice().sort((a, b) => a - b));
  assert.equal(new Set(reg.list.map((d) => d.code)).size, reg.list.length);
  assert.ok(Object.isFrozen(reg.byId.P) && Object.isFrozen(reg.byId.P.text), 'definitions are frozen');
  LV.validate(stub.full());
  // Duplicate ids, codes and orders are refused.
  const a = stub.playable(), b = stub.playable();
  b.id = 'T2'; b.order = 98;
  assert.throws(() => LV.build({ a, b }), /code T0 is also level T/);
  const c = stub.playable(); c.id = 'T3'; c.code = 'T3';
  assert.throws(() => LV.build({ a: stub.playable(), c }), /order 99 is also level T/);
});

test('L-1: phases are legal and in order; flags ≤ 8; questions have one ok option, ≥ 3 options, feedback and misconceptions', () => {
  for (const def of shipped().concat([stub.playable(), stub.full()])) {
    let last = -1;
    for (const p of def.phases) { const k = LV.PHASES.indexOf(p); assert.ok(k > last, def.id + ': ' + p); last = k; }
    assert.equal(def.phases[def.phases.length - 1], 'complete');
    assert.ok(LV.flagList(def).length <= 8);
    for (const f of LV.flagList(def)) if (f.mc) assert.ok(MC.has(f.mc), def.id + ' flag ' + f.id);
    for (const m of def.misconceptions) assert.ok(MC.has(m));
    const questions = def.debrief.concat(def.predictions.filter((it) => it.kind === 'choice'));
    for (const q of questions) {
      assert.equal(q.options.filter((o) => o.ok === true).length, 1, def.id + ' ' + q.id);
      assert.ok(q.options.length >= 3);
      for (const o of q.options) {
        assert.ok(o.fb, def.id + ' ' + q.id + ' feedback');
        if (!o.ok) assert.ok(MC.has(o.mc), def.id + ' ' + q.id + ' ' + o.mc);
      }
    }
  }
});

test('L-1: validation names the level and the field that is wrong (negative controls)', () => {
  const broken = [
    [(d) => { d.phases = ['task', 'intro', 'run', 'result', 'debrief', 'echo', 'complete']; }, /T: phases\[1\]: intro is out of order/],
    [(d) => { d.phases = d.phases.concat(['bonus']); }, /phases\[\d+\]: unknown phase bonus/],
    [(d) => { d.phases = d.phases.filter((p) => p !== 'complete'); }, /the last phase is complete/],
    [(d) => { d.code = 'T'; }, /T: code:/],
    [(d) => { d.debrief[0].options[1].ok = true; delete d.debrief[0].options[1].mc; }, /exactly one option has ok: true \(found 2\)/],
    [(d) => { d.debrief[0].options[1].ok = true; }, /the right option has no misconception/],
    [(d) => { d.debrief[0].options = d.debrief[0].options.slice(0, 2); }, /at least 3 options/],
    [(d) => { delete d.debrief[0].options[2].fb; }, /debrief\[0\]\.options\[2\]\.fb/],
    [(d) => { delete d.debrief[0].options[2].mc; }, /a wrong option needs a registered misconception/],
    [(d) => { d.debrief[0].options[2].mc = 'LAZY_RIBOSOMES'; }, /not LAZY_RIBOSOMES/],
    [(d) => { d.misconceptions = ['NOT_A_THING']; }, /unknown misconception NOT_A_THING/],
    [(d) => { d.flags = 'ABCDEFGHI'.split('').map((x) => 'F_' + x); }, /flags: at most 8/],
    [(d) => { d.flags = [{ id: 'X1', mc: 'NOPE' }]; }, /flags\[0\]\.mc: unknown misconception/],
    [(d) => { d.story.intro[0].who = 'cell'; }, /unknown speaker cell/],
    [(d) => { d.solutions.reference.expect = { goal: true, par: false }; }, /the reference expects goal and par/],
    [(d) => { delete d.monitor; }, /monitor: must be a function/],
    [(d) => { d.title = 'nope'; }, /title: must name a string in TEXT/],
    [(d) => { d.echo.cards[0].stamp = 'advanced'; }, /universal or bacteria/],
    [(d) => { d.debrief = []; }, /debrief: 1 or 2 questions/],
    [(d) => { d.predictions = d.predictions.filter((it) => it.phase !== 'predict2'); }, /predict2 has no Core item/],
  ];
  for (const [edit, re] of broken) {
    const d = stub.playable();
    // The fixture's TEXT is shared (and frozen once validated): edit deep copies only.
    d.debrief = JSON.parse(JSON.stringify(d.debrief));
    d.story = JSON.parse(JSON.stringify(d.story));
    d.echo = JSON.parse(JSON.stringify(d.echo));
    d.solutions = Object.assign({}, d.solutions, { reference: Object.assign({}, d.solutions.reference) });
    edit(d);
    assert.throws(() => LV.validate(d), re, re.toString());
  }
});

test('game and level files load through require and in a bare context with only `self`', () => {
  const FILES = require('../build-files.json');
  const game = FILES.filter((f) => f.startsWith('src/game/') || f.startsWith('src/levels/'));
  const onDisk = fs.readdirSync(path.join(ROOT, 'src', 'game')).map((f) => 'src/game/' + f)
    .concat(fs.readdirSync(LEVEL_DIR).map((f) => 'src/levels/' + f)).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual(game.slice().sort(), onDisk, 'build-files.json and src/game + src/levels differ');
  const ctx = vm.createContext({});
  vm.runInContext('var self = this;', ctx);
  for (const f of FILES) {
    if (f.startsWith('src/app/')) break;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src.split('\n')[0], /^\/\/ @deps/, f + ' has an @deps line');
    if (f.startsWith('src/game/') || f.startsWith('src/levels/')) assert.ok(require(path.join(ROOT, f)), f + ' loads through require');
    vm.runInContext(src, ctx, { filename: f });
  }
  const B = ctx.self.BTC;
  for (const name of ['levelKit', 'misconceptions', 'levelConstants', 'levels', 'score', 'code', 'telemetry', 'progress', 'LevelRunner', 'game']) {
    assert.ok(B[name], 'BTC.' + name + ' is defined');
  }
  assert.ok(B.levelDefs.P, 'the Prologue registered itself');
  // Every shipped level registered itself, and the list is in `order`.
  const ids = shipped().slice().sort((a, b) => a.order - b.order).map((d) => d.id);
  assert.deepEqual(Array.from(B.levels.list, (d) => d.id), ids);
  assert.equal(B.levels.byId.P.code, 'P0');
});

test('build-files.json: game files after the shared files and before the app, in the §2 order', () => {
  const FILES = require('../build-files.json');
  const idx = (name) => FILES.findIndex((f) => path.basename(f, '.js') === name);
  const lastShared = Math.max(...FILES.map((f, i) => (f.startsWith('src/shared/') ? i : -1)));
  const firstApp = FILES.findIndex((f) => f.startsWith('src/app/'));
  const order = ['btc-level-kit', 'btc-misconceptions', 'btc-watch', 'btc-level-constants'];
  for (const f of levelFiles) order.push(path.basename(f, '.js'));
  order.push('btc-levels', 'btc-score', 'btc-code', 'btc-telemetry', 'btc-progress', 'btc-level-runner');
  const at = order.map(idx);
  assert.ok(at.every((i) => i > lastShared && i < firstApp), 'between the shared and the app files');
  assert.deepEqual(at.slice().sort((a, b) => a - b), at, 'in order: ' + order.join(', '));
  // Every @deps name loads earlier.
  const seen = new Set();
  for (const f of FILES) {
    const deps = (/^\/\/ @deps(.*)$/m.exec(fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')[0]) || [, ''])[1].trim().split(/\s+/).filter(Boolean);
    for (const d of deps) assert.ok(seen.has(d), f + ' loads before ' + d);
    seen.add(path.basename(f, '.js'));
  }
  const appOrder = ['btc-home', 'btc-hud', 'btc-prologue', 'btc-level-ui', 'btc-app'].map(idx);
  assert.ok(appOrder.every((i) => i > firstApp), 'the level app files are app files');
  assert.equal(Math.max(...appOrder), idx('btc-app'), 'btc-app loads last of them');
});
