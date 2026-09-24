// The story thread (docs/PROLOGUE.md §1.5, §10.1 ST-1, ST-2) of the levels rebuilt to teach first: the opening's two
// parts and level 1.2 (1.1, 1.4 and 1.7 join REBUILT when they are rebuilt in phase 2).
//
//   ST-1  every story line has a speaker in {narrator, commander, ribosome}; every Commander line is answered by the
//         next line the student reads, a narrator's; on every play path a level has at most 4 Commander lines and at
//         most 1 Ribosome line (counted per path: 1.2's three outros are three paths, not one file); every outro's
//         first line is true of the run it follows (scripted runs of 1.2's solutions).
//   ST-2  a term of the shared vocabulary (§1.2) appears only at or after the step that introduces it, in play order
//         from Part 1: story lines, guesses and their feedback, causes, notes, cards, task, result and debrief text.
//
// The job tags of §2.8 and §6.2.8 (S, R, T) live in those tables, not in the level data.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/game/btc-level-kit.js');
const LV = require('../src/game/btc-levels.js');
const RUN = require('../src/game/btc-level-runner.js');
const P = LV.validate(require('../src/levels/btc-level-p.js'));
const P2 = LV.validate(require('../src/levels/btc-level-p2.js'));
const L12 = LV.validate(require('../src/levels/btc-level-1-2.js'));

const REBUILT = [P, P2, L12];
const SPEAKERS = ['narrator', 'commander', 'ribosome'];
const MAX = { commander: 4, ribosome: 1 };

/** Every student string under x (an object of words, a card, a list), in key order. */
function strings(x, out) {
  const o = out || [];
  if (typeof x === 'string') o.push(x);
  else if (Array.isArray(x)) x.forEach((y) => strings(y, o));
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) strings(x[k], o);
  return o;
}

/**
 * The items of one level in play order: {at, who?, text} (who only on story lines). Guess feedback is placed where
 * the student reads it (the scene or step `showAt` names, after its lines); a step's cause after its lines.
 */
function scenesPath(def) {
  const T = def.text, out = [], later = {};
  const put = (at, text, who) => out.push({ level: def.id, at, who, text });
  const guess = (at, g) => {
    put(at, g.prompt);
    for (const o of g.options) put(at, o.t);
    const show = g.showAt || at;
    (later[show] || (later[show] = [])).push(...g.options.map((o) => o.fb));
  };
  for (const sc of def.scenes) {
    for (const l of sc.lines) put(sc.id, l.text, l.who);
    for (const t of later[sc.id] || []) put(sc.id, t);
    if (sc.note && T[sc.note]) put(sc.id, T[sc.note]);
    if (sc.about && T.about && T.about[sc.about]) put(sc.id, T.about[sc.about].text);
    if (sc.picture === 'cards') strings(T.cardsF7).forEach((t) => put(sc.id, t));
    if (sc.picture === 'pairs') strings(T.cardsQ7).forEach((t) => put(sc.id, t));
    if (sc.activity && sc.activity.words) strings(sc.activity.words).forEach((t) => put(sc.id, t));
    if (sc.guess) guess(sc.id, sc.guess);
  }
  return { out, put, guess, later };
}
function watchPath(def, acc) {
  for (const st of def.watch.steps) {
    for (const l of st.lines) acc.put(st.id, l.text, l.who);
    if (st.guess) acc.guess(st.id, st.guess);
    for (const t of acc.later[st.id] || []) acc.put(st.id, t);
    if (st.cause) acc.put(st.id, st.cause);
    for (const n of st.notes || []) acc.put(st.id, n.text);
  }
}

/** The play paths of a level: one for each part of the opening; one per outro for 1.2. */
function paths(def) {
  if (def === P) {
    const a = scenesPath(P);
    strings(P.text.simplified).forEach((t) => a.put('complete', t));
    return { main: a.out };
  }
  if (def === P2) {
    const a = scenesPath(P2);
    watchPath(P2, a);
    strings(P2.text.simplified).forEach((t) => a.put('complete', t));
    return { main: a.out };
  }
  // Level 1.2: intro, watch, task card, the run (its story, the milk, the narrator's rules), result, Explain, then
  // the outro that fits the run, and "Meanwhile, in you".
  const T = L12.text, out = [], later = {};
  const put = (at, text, who) => out.push({ level: L12.id, at, who, text });
  const acc = { put, later, guess: (at, g) => {
    put(at, g.prompt);
    for (const o of g.options) put(at, o.t);
    (later[g.showAt || at] || (later[g.showAt || at] = [])).push(...g.options.map((o) => o.fb));
  } };
  for (const l of L12.story.intro) put('intro', l.text, l.who);
  watchPath(L12, acc);
  strings(T.task).forEach((t) => put('task', t));
  for (const l of L12.story.onRun) put('run', l.text, l.who);
  for (const r of L12.narratorRules) put('run', r.template);
  for (const l of L12.story.extra.milk) put('milk', l.text, l.who);
  strings(T.result).forEach((t) => put('result', t));
  for (const q of L12.debrief) { put('debrief', q.prompt); for (const o of q.options) { put('debrief', o.t); put('debrief', o.fb); } }
  const tail = [];
  for (const k of L12.echo.screens) tail.push({ level: L12.id, at: 'echo', text: LV.textAt(L12, k) });
  for (const c of L12.echo.cards) {
    tail.push({ level: L12.id, at: 'echo', text: LV.textAt(L12, c.title) });
    if (c.note) tail.push({ level: L12.id, at: 'echo', text: LV.textAt(L12, c.note) });
  }
  const res = {};
  for (const key of ['fed', 'keptOn', 'missed']) {
    res[key] = out.concat(L12.story.extra[key].map((l) => ({ level: L12.id, at: 'outro:' + key, who: l.who, text: l.text })), tail);
  }
  return res;
}

test('ST-1: speakers; every Commander line answered by a narrator; per play path at most 4 Commander and 1 Ribosome lines', (t) => {
  const report = [];
  for (const def of REBUILT) {
    for (const [name, path] of Object.entries(paths(def))) {
      const lines = path.filter((x) => x.who !== undefined);
      assert.ok(lines.length > 0, def.id + ' ' + name);
      for (const l of lines) assert.ok(SPEAKERS.includes(l.who), def.id + ' ' + l.at + ': speaker ' + l.who);
      lines.forEach((l, i) => {
        if (l.who !== 'commander') return;
        const next = lines[i + 1];
        assert.ok(next && next.who === 'narrator', def.id + ' ' + name + ' ' + l.at + ': "' + l.text + '" must be answered by a narrator line, not ' + (next ? next.who : 'nothing'));
      });
      const n = { commander: 0, ribosome: 0 };
      for (const l of lines) if (n[l.who] !== undefined) n[l.who]++;
      report.push(def.id + '/' + name + ' C' + n.commander + ' R' + n.ribosome);
      for (const who of Object.keys(MAX)) assert.ok(n[who] <= MAX[who], def.id + ' ' + name + ': ' + n[who] + ' ' + who + ' lines (at most ' + MAX[who] + ')');
    }
  }
  t.diagnostic(report.join(', '));
});

test('ST-1: each outro\'s first line is true of the run it follows (1.2, scripted runs of its solutions)', () => {
  const claims = {
    fed: (r, E) => r.goal && E >= 0.8,
    keptOn: (r, E) => r.goal && E < 0.8,
    missed: (r) => !r.goal,
  };
  const seen = new Set();
  for (const name of ['reference', 'keepOn', 'weak']) {
    for (let s = 0; s < 3; s++) {
      const vs = K.variantSeed(s, L12.id, 0);
      const p = RUN.game.playHeadless(L12, { variantSeed: vs, solution: name, today: () => '2026-01-01' });
      const r = p.runner, key = L12.outroKey(r.variant, r.monitorResult || {}, r.goal);
      const lines = r.beatLines('outro');
      assert.equal(lines, L12.story.extra[key], name + ': the outro shown is the one outroKey names');
      const E = L12.score(r.variant, r.monitorResult, { debrief: {} }).E;
      assert.ok(claims[key](r, E), name + ' seed ' + vs + ': "' + lines[0].text + '" (goal ' + r.goal + ', E ' + E.toFixed(2) + ')');
      seen.add(key);
    }
  }
  assert.deepEqual(Array.from(seen).sort(), ['fed', 'keptOn', 'missed'], 'every outro is reached by some run');
});

/**
 * The shared vocabulary (§1.2): each term and where it is introduced (level, scene or step). "Introduced" means the
 * student has seen the thing work and been told its name in plain words there, or (a card) read its job first.
 */
const TERMS = [
  { term: 'chromosome', re: /\bchromosomes?\b/i, at: ['P', 'a4'] },
  { term: 'gene', re: /\bgenes?\b/i, at: ['P', 'a7'] },
  { term: 'mRNA', re: /\bmRNAs?\b/, at: ['P', 'c5'] },
  { term: 'RNA polymerase', re: /\bRNA polymerase\b/i, at: ['P', 'c5'] },
  { term: 'ribosome', re: /\bribosomes?\b/i, at: ['P', 'e1'] },
  { term: 'codon', re: /\bcodons?\b/i, at: ['P', 'e2'] },
  { term: 'amino acid', re: /\bamino acids?\b/i, at: ['P', 'e2'] },
  { term: 'glucose', re: /\bglucose\b/i, at: ['P', 'f3'] },
  { term: 'transporter', re: /\btransporters?\b/i, at: ['P', 'f6'] },
  { term: 'enzyme', re: /\benzymes?\b/i, at: ['P', 'f7'] },
  { term: 'lactose', re: /\blactose\b/i, at: ['P2', 'q6'] },
  { term: 'ATP', re: /\bATP\b/, at: ['P2', 's3'] },
  { term: 'protease', re: /\bproteases?\b/i, at: ['1.4', 'intro'] },
  { term: 'repressor', re: /\brepressors?\b/i, at: ['1.7', 'w1'] },
  { term: 'allolactose', re: /\ballolactose\b/i, at: ['1.7', 'w2'] },
  { term: 'operator', re: /\boperators?\b/i, at: ['1.7', 'design'] },
];

test('ST-2: in play order from Part 1, a term of the vocabulary appears only at or after the step that introduces it', () => {
  // The whole order: Part 1, Part 2, then 1.2 (its longest path; the outros add no new terms).
  const order = paths(P).main.concat(paths(P2).main, paths(L12).keptOn);
  const pos = (lv, at) => order.findIndex((x) => x.level === lv && x.at === at);
  const bad = [];
  for (const t of TERMS) {
    const lv = t.at[0], intro = pos(lv, t.at[1]);
    // A term introduced in a later level (not yet rebuilt) must not appear at all.
    const first = intro >= 0 ? intro : order.length;
    if (REBUILT.some((d) => d.id === lv)) assert.ok(intro >= 0, t.term + ': its introducing step ' + t.at.join(' ') + ' exists');
    order.forEach((x, i) => { if (i < first && t.re.test(x.text)) bad.push(t.term + ' at ' + x.level + ' ' + x.at + ': "' + x.text + '"'); });
    // Where it is introduced, the step's own text uses the term.
    if (intro >= 0) assert.ok(order.some((x, i) => i >= intro && x.level === lv && x.at === t.at[1] && t.re.test(x.text)), t.term + ' is named at ' + t.at.join(' '));
  }
  assert.deepEqual(bad, []);
});
