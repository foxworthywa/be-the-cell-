// L-2 (LEVELS §12.1, §3.3): level text. Every string in a level's TEXT and
// every HUD text (filled with every variant's values) is ≤ 140 characters,
// has no "!", no teleology and no "primitive/advanced/upgrade/evolved from",
// with the three reviewed exceptions, each checked here: a Commander line
// needs a later narrator line in its beat; a denial needs a negation within
// three words before the word; a wrong option may say it, its feedback may not.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const LV = require('../src/game/btc-levels.js');
const K = require('../src/game/btc-level-kit.js');
const N = require('../src/shared/btc-narrate.js');
const C = require('../src/app/btc-content.js');
const stub = require('./fixtures/btc-level-stub.js');

const LEVEL_DIR = path.join(__dirname, '..', 'src', 'levels');
const shipped = fs.readdirSync(LEVEL_DIR).filter((f) => /^btc-level-[\w-]+\.js$/.test(f) && f !== 'btc-level-constants.js')
  .map((f) => require(path.join(LEVEL_DIR, f)));

const show = (list) => list.map((p) => p.where + ': ' + p.problem + ' — "' + p.text + '"');

test('L-2: every shipped level\'s TEXT passes the lint (and the stub\'s, which uses all three exceptions)', () => {
  for (const def of shipped.concat([stub.playable()])) assert.deepEqual(show(LV.lintText(def)), [], def.id);
  // The stub really does rely on each exception (so the passes above are not vacuous).
  const t = stub.TEXT;
  assert.ok(N.TELEOLOGY.test(t.story.intro[1].text) && t.story.intro[1].who === 'commander');
  assert.ok(N.TELEOLOGY.test(t.story.outro[0].text) && t.story.outro[0].denies);
  assert.ok(t.p1.options.some((o) => !o.ok && o.mc && N.TELEOLOGY.test(o.t)));
});

test('L-2: HUD texts filled with every variant\'s values pass the reduced lint', () => {
  for (const def of shipped.concat([stub.playable()])) {
    if (!def.hud) continue;
    for (let s = 0; s < 200; s++) {
      const v = def.variant(K.variantSeed(s, def.id, 0));
      for (const st of [null, { count: 0, tick: 0, changes: 0 }, { count: 123456, tick: 99999, changes: 12, reached: true }]) {
        const h = def.hud(v, st);
        for (const text of [h.goal.text, h.timer.text, h.counter.text, h.counter.short]) {
          assert.ok(text.length <= 140 && text.indexOf('!') < 0 && !N.TELEOLOGY.test(text), def.id + ': ' + text);
          assert.ok(!/\{\w+\}/.test(text), 'an unfilled placeholder: ' + text);
        }
      }
    }
  }
});

test('L-2: story lines, questions and the level UI words stay dry (≤ 140, no "!", no bad words)', () => {
  for (const def of shipped) {
    const lines = def.story.intro.concat(def.story.outro, ...(def.scenes || []).map((s) => s.lines));
    for (const l of lines) assert.ok(l.text.length <= 140, l.text);
  }
  const game = [];
  (function walk(x, w) {
    if (typeof x === 'string') game.push({ w, x });
    else if (x && typeof x === 'object') for (const k of Object.keys(x)) walk(x[k], w + '.' + k);
  })({ game: C.game, home: C.home, tiers: C.tiers }, 'content');   // C-1: the readouts' introducing sentences too
  assert.ok(game.length > 60, game.length + ' level UI strings');
  for (const s of game) {
    assert.ok(s.x.length <= 140 && s.x.indexOf('!') < 0, s.w);
    assert.ok(!N.TELEOLOGY.test(s.x), s.w + ': ' + s.x);
    assert.ok(!/\b(primitive|advanced|upgrade[ds]?|evolved from)\b/i.test(s.x), s.w);
  }
});

test('L-2: the lint exceptions are narrow (negative controls)', () => {
  const lint = (text) => show(LV.lintText({ text, narratorRules: [] }));
  // 1. A Commander line may voice the misconception only if a narrator line follows in the same beat.
  assert.deepEqual(lint({ b: [{ who: 'commander', text: 'It wants glucose.' }, { who: 'narrator', text: 'It does not.' }] }), []);
  assert.equal(lint({ b: [{ who: 'narrator', text: 'Fine.' }, { who: 'commander', text: 'It wants glucose.' }] }).length, 1);
  assert.equal(lint({ b: [{ who: 'commander', text: 'It wants glucose.' }, { who: 'ribosome', text: 'I read.' }] }).length, 1);
  assert.equal(lint({ b: [{ who: 'ribosome', text: 'I decide what to read.' }, { who: 'narrator', text: 'It does not.' }] }).length, 1,
    'only the Commander gets the exception');
  // 2. A denial needs a negation within the three words before the word.
  assert.deepEqual(lint({ b: [{ who: 'glucose', denies: true, text: "I don't want anything." }] }), []);
  assert.deepEqual(lint({ b: [{ who: 'laci', denies: true, text: 'I never decide anything.' }] }), []);
  assert.deepEqual(lint({ b: [{ who: 'protease', denies: true, text: 'Nothing here knows about it.' }] }), []);
  assert.equal(lint({ b: [{ who: 'glucose', denies: true, text: 'I want to get in.' }] }).length, 1);
  assert.equal(lint({ b: [{ who: 'glucose', denies: true, text: 'Not today, I suppose, but I want it.' }] }).length, 1, 'too far from the negation');
  assert.equal(lint({ b: [{ who: 'glucose', text: "I don't want anything." }] }).length, 1, 'only lines marked denies');
  assert.equal(LV.negatedBefore("I don't really want it", "I don't really ".length), true);
  assert.equal(LV.negatedBefore('No one should want it', 'No one should '.length), true);
  assert.equal(LV.negatedBefore('No one here should want it', 'No one here should '.length), false, 'four words back is too far');
  // 3. A wrong option with a misconception may say it; its feedback may not; the right option may not.
  const q = (o) => lint({ q: { prompt: 'Why?', options: o } });
  assert.deepEqual(q([{ t: 'The cell decides.', mc: 'CELL_DECIDES', fb: 'Nothing chose anything.' }]), []);
  assert.equal(q([{ t: 'The cell decides.', mc: 'CELL_DECIDES', fb: 'It decides nothing.' }]).length, 1);
  assert.equal(q([{ t: 'The cell decides.', ok: true, fb: 'Right.' }]).length, 1);
  assert.equal(q([{ t: 'The cell decides.', fb: 'Hm.' }]).length, 1, 'a wrong option without mc');
  // The rest applies everywhere.
  assert.equal(lint({ a: 'Well done!' }).length, 1);
  assert.equal(lint({ a: 'x'.repeat(141) }).length, 1);
  assert.equal(lint({ a: 'Human cells are more advanced.' }).length, 1);
  assert.equal(lint({ a: 'Bacteria are primitive.' }).length, 1);
  assert.equal(lint({ b: [{ who: 'commander', text: 'Upgrade the cell!' }, { who: 'narrator', text: 'No.' }] }).length, 2);
  // Narrator level rules get the full rules, expanded for every gene, named and hidden.
  const bad = LV.lintText({ text: {}, narratorRules: [{ key: 'lt.x', when: () => false, template: '{G} {is} on. It tries 2 things' }] });
  assert.ok(bad.some((p) => /digit/.test(p.problem)) && bad.some((p) => /teleology/.test(p.problem)) && bad.some((p) => /one sentence/.test(p.problem)));
  assert.ok(bad.some((p) => /\/lacY$/.test(p.where)));
});
