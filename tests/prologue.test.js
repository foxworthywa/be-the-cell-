// The opening (PROLOGUE §2, §10.1 OP-1 … OP-5): part 1 (P, "How a gene becomes a machine": the zoom ladder, the
// insulin gene's letters, its copy, export, reading and fold) and part 2 (P2, "A cell's economy": the bacterium,
// its sugars, the economy and a first experiment in the real engine). Both are unscored; guesses are logged.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const W = require('../src/game/btc-watch.js');
const CODE = require('../src/game/btc-code.js');
const SEQ = require('../src/shared/btc-seq.js');
const DATA = require('../src/shared/btc-seqdata.js');
const LC = require('../src/levels/btc-level-constants.js');
const P = LV.validate(require('../src/levels/btc-level-p.js'));
const P2 = LV.validate(require('../src/levels/btc-level-p2.js'));
const { LevelRunner, playHeadless, playWatch } = RUN.game;
const clone = (x) => JSON.parse(JSON.stringify(x));

test('OP-1: both parts validate; every scene has lines; every guess has ≥ 3 options, one the cause, feedback on all; every activity\'s letters come from BTC.seq', () => {
  assert.equal(P.order < P2.order, true, 'part 1 comes first');
  for (const def of [P, P2]) {
    assert.equal(def.scored, false, def.id + ' is not scored');
    for (const sc of def.scenes) assert.ok(Array.isArray(sc.lines) && sc.lines.length >= 1 && sc.lines.every((l) => l.text && l.who), def.id + ' ' + sc.id);
    const guesses = Object.values(W.guesses(def)).map((x) => x.guess);
    assert.ok(guesses.length >= 2, def.id + ' has its two guesses');
    for (const g of guesses) {
      assert.ok(g.options.length >= 3, g.id);
      assert.equal(g.options.filter((o) => o.cause === true).length, 1, g.id + ': one cause');
      assert.ok(g.options.every((o) => typeof o.fb === 'string' && o.fb.length > 0), g.id + ': feedback on every option');
      assert.ok(g.options.every((o) => o.ok === undefined && o.correct === undefined), g.id + ': a guess is never marked');
    }
  }
  // Part 1's activities: computed from the insulin sequence (NM_000207.3), never typed.
  const RNA = SEQ.transcribe(DATA.INS.mRNA), TR = SEQ.translate(RNA);
  const act = (id) => P.scenes.find((s) => s.id === id).activity;
  assert.equal(act('c4').template, SEQ.complement(DATA.INS.mRNA.slice(0, 6)));
  assert.equal(act('c4').expect, RNA.slice(0, 6));
  assert.equal(act('c4').expect[5], 'U', 'the sixth letter is the first U');
  assert.equal(act('c4').total, DATA.INS.mRNA.length);
  assert.equal(act('d3').total, DATA.INS.mRNA.length);
  const e3 = act('e3'), start = SEQ.firstStart(RNA);
  assert.equal(e3.start, start);
  assert.deepEqual(e3.codons, [RNA.slice(start, start + 3), RNA.slice(start + 3, start + 6)]);
  assert.deepEqual(e3.codons, ['AUG', 'GCC']);
  for (const c of e3.codons) assert.ok(e3.rows.some((r) => r.codon === c), 'the table has ' + c);
  for (const r of e3.rows) assert.equal(r.three, SEQ.AA[SEQ.CODE[r.codon]] ? SEQ.AA[SEQ.CODE[r.codon]].three : r.three);
  assert.equal(TR.protein.length, P.facts.aminoAcids);
  assert.equal(TR.protein.length, 110, 'preproinsulin is 110 amino acids');
  assert.equal(e3.total, P.facts.codonsRead);
});

/** On to scene id, doing activities and guesses as a student would. */
function to(r, id) {
  for (let g = 0; r.sceneInfo().scene.id !== id && g < 300; g++) {
    const i = r.sceneInfo();
    if (i.guess && !i.guess.seen) { r.scenePick(i.guess.id, 'cause'); r.sceneSee(); }
    if (i.activity && i.lastLine && !i.activity.done) RUN.game.playActivity(r, r.sceneInfo(), null);
    assert.ok(r.sceneNext().ok, 'Next at ' + i.scene.id);
  }
  while (!r.sceneInfo().lastLine) assert.ok(r.sceneNext().ok);
  return r.sceneInfo();
}

test('OP-2: Next and Skip wait for each activity (six letters, two codons, three copies, the runs to their end) and each guess', () => {
  const r = new LevelRunner({ def: P, variantSeed: 0, attempt: 1, deviceSeed: 7 }).start();
  const stuck = (why) => {
    const at = r.sceneInfo().scene.id;
    assert.equal(r.sceneNext().ok, false, at + ': ' + why);
    r.sceneSkip();
    assert.equal(r.sceneInfo().scene.id, at, 'Skip never passes an unfinished ' + why);
  };
  // The copy: five letters are not six; six letters, then the rest of the gene runs.
  to(r, 'c4');
  const a = r.sceneInfo().scene.activity;
  for (let i = 0; i < 5; i++) { r.sceneAct({ pick: a.expect[i] }); stuck('copy (' + (i + 1) + ' letters)'); }
  r.sceneAct({ pick: a.expect[5] });
  stuck('run');
  assert.equal(r.sceneAct({ advance: 10 }).ok, false, 'nothing runs before "Let it run"');
  assert.ok(r.sceneAct({ start: true }).ok);
  r.sceneAct({ advance: a.total - a.expect.length - 1 });   // the run goes on from the six letters made by hand
  stuck('run (one letter left)');
  r.sceneAct({ advance: 1 });
  assert.ok(r.sceneNext().ok);
  // The guess D1.
  to(r, 'd1');
  stuck('guess');
  r.scenePick('d1', 'cause');
  stuck('guess (picked, not seen)');
  assert.ok(r.sceneSee().ok);
  assert.ok(r.sceneNext().ok);
  // Three copies.
  to(r, 'd3');
  const c = r.sceneInfo().scene.activity;
  for (let k = 0; k < 2; k++) { assert.ok(r.sceneAct({ start: true }).ok); r.sceneAct({ advance: c.total }); }
  stuck('copies (2 of 3)');
  assert.ok(r.sceneAct({ start: true }).ok);
  r.sceneAct({ advance: c.total });
  assert.ok(r.sceneNext().ok);
  // Two codons, then the reading runs to the stop.
  to(r, 'e3');
  const e = r.sceneInfo().scene.activity;
  stuck('codons (none)');
  r.sceneAct({ row: e.rows.findIndex((x) => x.codon === 'AUG') });
  stuck('codons (one)');
  r.sceneAct({ row: e.rows.findIndex((x) => x.codon === 'GCC') });
  stuck('reading');
  assert.ok(r.sceneAct({ start: true }).ok);
  while (!r.sceneAct({ advance: 7 }).done) { /* on to the stop */ }
  assert.ok(r.sceneNext().ok);
  // The last scene's Next finishes the part; its cards are the four Universal ones.
  for (let g = 0; g < 80 && !r.sceneInfo().last; g++) {
    const i = r.sceneInfo();
    if (i.guess && !i.guess.seen) { r.scenePick(i.guess.id, 'cause'); r.sceneSee(); }
    if (i.activity && i.lastLine && !i.activity.done) RUN.game.playActivity(r, i, null);
    r.sceneNext();
  }
  assert.ok(r.next().ok);
  assert.equal(r.phase, 'complete');
  assert.deepEqual(r.cards, ['gene', 'mrna', 'ribosome', 'genetic-code']);
});

/** Part 2 at the start of its watch (its scenes read). */
function atWatch(deviceSeed) {
  const r = new LevelRunner({ def: P2, variantSeed: 0, attempt: 1, deviceSeed }).start();
  while (r.phase === 'scenes') { if (!r.sceneNext().ok) r.next(); }
  assert.equal(r.phase, 'watch');
  return r;
}
const send = (r, cmd) => { const c = Object.assign({ source: 'user' }, cmd); const res = r.watchCell.command(c); r.watchCommand(c, res); return res; };
/** The watch as the app's loop plays it: frames of perFrame ticks, stopping where the runner halts. */
function playByFrames(r, perFrame) {
  let frames = 0;
  while (!r.watch.done) {
    assert.ok(frames++ < 200000, 'stuck at ' + (r.watchStep() || {}).id);
    const info = r.watchInfo();
    if (info.stage === 'lines' || info.stage === 'tap') { r.watchNext(); continue; }
    if (info.stage === 'guess') { r.watchPick(info.guess.id, 'cause'); r.watchSee(); continue; }
    if (info.stage === 'act') { send(r, { type: 'setPromoter', gene: 'ptsG', level: 2 }); continue; }
    for (let k = 0; k < perFrame && !r.halted(); k++) { r.watchCell.step(); r.watchCell.takeEvents(); }
  }
  return clone(r.watch.gateTick);
}

test('OP-3: part 2\'s watch opens every state gate in order, at the same tick at 1 s = 10 s and 1 s = 1 h; render time alone opens nothing', () => {
  const a = playByFrames(atWatch(3), 10);
  const b = playByFrames(atWatch(3), 3600);
  const c = playWatch(atWatch(3), P2.solutions.reference, 200000);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c, 'the headless player opens the gates at the same ticks');
  const order = ['h4:until', 'h7:until', 'h8:until', 'h9:until', 'h10:until', 'h11:until', 'h12:until'].filter((k) => k in a);
  assert.ok(order.length >= 6, JSON.stringify(a));
  for (let i = 1; i < order.length; i++) assert.ok(a[order[i - 1]] <= a[order[i]], order[i - 1] + ' before ' + order[i] + ': ' + JSON.stringify(a));
  // Asking for the step again and again, without ticks, changes nothing.
  const r = atWatch(3);
  for (let i = 0; i < 12 && r.watchInfo().stage !== 'until'; i++) { const info = r.watchInfo(); if (info.stage === 'guess') { r.watchPick(info.guess.id, 'cause'); r.watchSee(); } else r.watchNext(); }
  assert.equal(r.watchInfo().id, 'h4', 'H4 waits for the energy to run low (so its "what happened" is true)');
  const tick = r.watchCell.tick;
  for (let i = 0; i < 1000; i++) r.watchInfo();
  assert.equal(r.watchInfo().stage, 'until');
  assert.equal(r.watchCell.tick, tick);
  while (r.watchInfo().stage === 'until') { assert.equal(r.halted(), false); r.watchCell.step(); }
  assert.equal(r.halted(), true, 'a pausing gate holds the cell');
  assert.equal(r.watchCell.tick, a['h4:until']);
  assert.notEqual(r.watchCell.observe().energy.state, 'normal', 'its energy is low when H4 says so');
  // The same device seed gives the same cell; another gives another.
  assert.notDeepEqual(playByFrames(atWatch(4), 60), a);
});

test('OP-4: the switch-off detour (between H7 and H11) waits, says so, and carries on when the gene is on again', () => {
  const ref = playWatch(atWatch(3), P2.solutions.reference, 200000);
  const r = atWatch(3);
  const notes = [];
  const gates = playWatch(r, {
    watch: Object.assign({}, P2.solutions.offDetour.watch, {
      policy(view, tick, api, id) {
        P2.solutions.offDetour.watch.policy(view, tick, api, id);
        const n = r.watchInfo().note;
        if (n && notes.indexOf(n) < 0) notes.push(n);
      },
    }),
  }, 200000);
  assert.ok(r.watch.done);
  assert.ok(notes.some((n) => /off/.test(n)), 'the step says the gene is off: ' + JSON.stringify(notes));
  assert.ok(gates['h9:until'] >= ref['h9:until'], 'H9 waits while the gene is off');
  const out = playHeadless(P2, { solution: 'offDetour', deviceSeed: 3 });
  assert.deepEqual(out.result.flags, []);
});

test('OP-5: flags and codes — first picks on DNA_DIRECT options raise PRED_DNA_DIRECT; the codes decode; D counts cause picks', () => {
  for (const def of [P, P2]) {
    for (const name of Object.keys(def.solutions)) {
      const out = playHeadless(def, { solution: name, deviceSeed: 1 });
      const e = def.solutions[name].expect;
      assert.deepEqual(RUN.game.checkExpect(e, out.result), [], def.id + ' ' + name);
      const d = CODE.decode(out.code);
      assert.equal(d.level, def.code);
      assert.equal(d.total, null, 'unscored');
      assert.match(out.code, /^BTC2-P[02]-000000-/);
      // D: the cause picks of the two guesses.
      const picks = Object.values(out.runner.watch.guesses).filter((g) => g.cause).length;
      assert.deepEqual(out.result.D, [picks, 2], def.id + ' ' + name);
    }
  }
  assert.deepEqual(playHeadless(P, { solution: 'dnaDirect' }).result.flags, ['PRED_DNA_DIRECT']);
  assert.deepEqual(playHeadless(P2, { solution: 'dnaDirect' }).result.flags, ['PRED_DNA_DIRECT']);
  // Part 2's economy numbers come from the calibrated constants (LC.economy), not from its text.
  const r = new LevelRunner({ def: P2, variantSeed: 0, attempt: 1 }).start();
  const vars = P2.textVars(r.variant);
  assert.equal(vars.trAtp, String(LC.economy.transporterAtp).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  assert.equal(LC.economy.transporterAtp, LC.economy.transporterAa * LC.economy.atpPerAa);
  assert.equal(LC.economy.transporterGlucose, LC.economy.transporterAtp / LC.economy.atpPerGlucose);
});
