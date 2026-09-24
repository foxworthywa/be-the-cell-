// @deps btc-catalog
/*
 * Be the Cell: the Watch step of the level pattern (docs/PROLOGUE.md §1.4, §2.4.3): the pure
 * parts that the level runner, the headless player and the tests share.
 *
 * A level's `watch` phase is a list of steps played on a watch cell (role 'watch'). Nothing
 * advances because time passed: every step waits for a tap, for a student action (a switch),
 * for a guess, or for a state of the model that a test below reads from cell.observe() after
 * every tick. The same run replayed opens every gate at the same tick.
 *
 * Step (all text is the level's TEXT, filled with the variant and the watch monitor's vars):
 *
 *   { id,
 *     until?: {test, gene?, x?, n?, pause?: true, watch?: false},   // the step is shown only once this holds;
 *                                                                   // pause stops the run at that tick; watch marks
 *                                                                   // the gene's first mature mRNA as the watched copy
 *     lines: [{who, text}],                                         // shown one at a time (Next)
 *     point?: 'counter:protein' | 'gauge:energy' | 'control:promoter' | 'legend' | 'mrna:first' | … | null,
 *     guess?: {id, prompt, options: [{t, fb, mc?, cause?: true}], showAt?: stepId},   // before the step's show
 *     act?: {kind: 'command', expect: {type: 'setPromoter', gene, on?: bool, level?}} | {kind: 'zoom', to},
 *     gate: {kind: 'tap'} | {kind: 'act'} | {kind: 'guess'} | {kind: 'state', test, gene?, x?, n?, pause?: true},
 *     cause?: 'one sentence, shown once the gate has opened',
 *     wait?: 'one sentence shown while the step waits on the model (until or a state gate)',
 *     speed?: 60 | {to: 60, test, …},                               // the step moves the cell to this speed, at once or once the
 *                                                                   // state holds (a note says so)
 *     notes?: [{test, gene?, text}],                                // honest help while waiting ("The gene is off, …")
 *     offer?: [{label, zoom}], offerSpeed?: 60 }                    // optional "Look closer" and "Speed up" buttons
 *
 * Built-in state tests (PROLOGUE §2.4.3), each test(view, p, mem, ctx) → bool, where p is the
 * condition ({gene, x, n}), mem a per-condition scratch object (kept in the autosave) and ctx
 * {watchedId, location(geneId)}. A level may add its own in def.watch.tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../engine/btc-catalog.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.watch = factory(B.catalog);
  }
})(typeof self !== 'undefined' ? self : this, function (CAT) {
  'use strict';

  const gv = (view, p) => view.geneById[p.gene];

  /** Where a gene's protein sits: the view's own field when the engine gives it, else the catalog. */
  function locationOf(view, id) {
    const g = view.geneById[id];
    if (g && typeof g.location === 'string') return g.location;
    if (CAT && CAT.STRAINS) {
      for (const k of Object.keys(CAT.STRAINS)) {
        const d = CAT.STRAINS[k].genes.find((x) => x.id === id);
        if (d && d.location) return d.location;
      }
    }
    return null;
  }

  /** True for n consecutive ticks (default 30) of cond; mem.run counts them. */
  function held(mem, cond, n) {
    mem.run = cond ? (mem.run || 0) + 1 : 0;
    return mem.run >= (n || 30);
  }

  function hasId(g, id) {
    if (id === null || id === undefined) return false;
    const ids = g.mRNAIds;
    for (let i = 0; i < g.mRNA; i++) if (ids[i] === id) return true;
    return false;
  }

  const TESTS = {
    /** RNA polymerase has started copying the gene. */
    firstTx: (v, p) => gv(v, p).nascent > 0,
    /** The first mature mRNA of this switch-on is finished. */
    firstMRNA: (v, p) => gv(v, p).episode.firstMRNATick !== null,
    /** A ribosome is reading the gene's mRNA. */
    firstRibosome: (v, p) => gv(v, p).ribosomes >= 1,
    /** The first protein of this switch-on is finished. */
    firstProtein: (v, p) => gv(v, p).episode.firstProteinTick !== null,
    /** At least one protein sits in the membrane (a membrane gene; a hollow glyph is drawn). */
    inPlace: (v, p) => gv(v, p).protein >= 1 && locationOf(v, p.gene) === 'membrane',
    /**
     * The gene's protein does more of its job than x × the side route: from the engine's work flux
     * when it reports one (PROLOGUE §7), otherwise glucose in has grown to (1 + x) × what came in
     * when the condition began (the side route alone).
     */
    workOver: (v, p, mem) => {
      const g = gv(v, p), x = typeof p.x === 'number' ? p.x : 1;
      if (typeof g.work_perS === 'number' && v.flux && typeof v.flux.glucoseInSide === 'number') {
        return g.work_perS > x * v.flux.glucoseInSide;
      }
      if (mem.base === undefined) mem.base = v.flux.glucoseIn;
      return v.flux.glucoseIn > (1 + x) * Math.max(mem.base, 1);
    },
    /** Energy (ATP charge) above 0.7 for n ticks. */
    energyNormal: (v, p, mem) => held(mem, v.energy.E > 0.7, p.n),
    /** The energy word reads low (or very low) for n ticks: what the energy bar shows. */
    energyLow: (v, p, mem) => held(mem, !!v.energy.state && v.energy.state !== 'normal', p.n),
    /** The watched mRNA has been broken down. */
    watchedGone: (v, p, mem, ctx) => ctx.watchedId !== null && ctx.watchedId !== undefined && !hasId(gv(v, p), ctx.watchedId),
    /** No mRNA of the gene is left, mature or being made. */
    allMRNAGone: (v, p) => gv(v, p).mRNA + gv(v, p).nascent === 0,
    /** The lac operator is free (or bound) for n ticks (1.7). */
    operatorFree: (v, p, mem) => held(mem, !!v.lac && v.lac.operatorBound === 0, p.n),
    operatorBound: (v, p, mem) => held(mem, !!v.lac && v.lac.operatorBound > 0, p.n),
    /** The gene is switched off / on (step notes: "The gene is off, so no new copies are started."). */
    // (ctx.levelOf, when given, counts a switch the student has made that applies when time runs.)
    geneOff: (v, p, mem, ctx) => (ctx && ctx.levelOf ? ctx.levelOf(p.gene) : gv(v, p).level) === 'off',
    geneOn: (v, p, mem, ctx) => (ctx && ctx.levelOf ? ctx.levelOf(p.gene) : gv(v, p).level) !== 'off',
    /** At least x proteins of the gene. */
    proteinAtLeast: (v, p) => gv(v, p).protein >= (typeof p.x === 'number' ? p.x : 1),
  };

  /** The test function for a condition: a level's own first, then the built-ins. */
  function testFor(def, name) {
    const own = def && def.watch && def.watch.tests;
    if (own && typeof own[name] === 'function') return own[name];
    return TESTS[name] || null;
  }

  /** Does an accepted user command satisfy an act's expect ({type, gene?, on?, level?})? */
  function matches(expect, cmd) {
    if (!expect || !cmd || cmd.type !== expect.type) return false;
    if (expect.gene !== undefined && cmd.gene !== expect.gene) return false;
    if (expect.on === true && cmd.level === 'off') return false;
    if (expect.on === false && cmd.level !== 'off') return false;
    if (expect.level !== undefined && cmd.level !== expect.level) return false;
    return true;
  }

  /** Does the gene's level (current, or a pending command's) already satisfy a promoter expect? */
  function satisfiedBy(expect, level) {
    if (!expect || expect.type !== 'setPromoter' || level === null || level === undefined) return false;
    if (expect.level !== undefined) return level === expect.level;
    if (expect.on === true) return level !== 'off';
    if (expect.on === false) return level === 'off';
    return false;
  }

  const GATES = ['tap', 'act', 'guess', 'state'];

  /**
   * Checks a level's watch definition ({steps, tests?, monitor?}); fail(path, message) throws.
   * isMc(id) says whether a misconception id is registered; vline validates a story line.
   */
  function validate(def, fail, isMc, vline) {
    const w = def.watch;
    if (!w || typeof w !== 'object' || !Array.isArray(w.steps) || !w.steps.length) fail('watch', '{steps: [a step, …]}');
    if (w.monitor !== undefined && typeof w.monitor !== 'function') fail('watch.monitor', 'monitor(variant, ctx) → {onTick, save, restore, vars?}');
    if (w.tests !== undefined && (typeof w.tests !== 'object' || Object.keys(w.tests).some((k) => typeof w.tests[k] !== 'function'))) {
      fail('watch.tests', '{name: test(view, p, mem, ctx)}');
    }
    const ids = {}, guessIds = {};
    const cond = (path, c) => {
      if (!c || typeof c !== 'object' || typeof c.test !== 'string') fail(path, 'a condition {test, gene?, …}');
      if (!testFor(def, c.test)) fail(path + '.test', 'unknown state test ' + c.test);
      if (c.pause !== undefined && typeof c.pause !== 'boolean') fail(path + '.pause', 'true or false');
    };
    w.steps.forEach((s, i) => {
      const p = 'watch.steps[' + i + ']';
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id) fail(p + '.id', 'missing');
      if (ids[s.id]) fail(p + '.id', 'duplicate step ' + s.id);
      ids[s.id] = true;
      if (!Array.isArray(s.lines) || !s.lines.length) fail(p + '.lines', 'at least one line');
      s.lines.forEach((l, j) => vline(p + '.lines[' + j + ']', l));
      if (s.until !== undefined) cond(p + '.until', s.until);
      const g = s.gate;
      if (!g || GATES.indexOf(g.kind) < 0) fail(p + '.gate', 'tap, act, guess or state');
      if (g.kind === 'state') cond(p + '.gate', g);
      if (g.kind === 'act' && !s.act) fail(p + '.gate', 'an act gate needs an act');
      if (g.kind === 'guess' && !s.guess) fail(p + '.gate', 'a guess gate needs a guess');
      if (s.act !== undefined) {
        const a = s.act;
        if (!a || (a.kind !== 'command' && a.kind !== 'zoom')) fail(p + '.act', "{kind: 'command', expect} or {kind: 'zoom', to}");
        if (a.kind === 'command' && (!a.expect || typeof a.expect.type !== 'string')) fail(p + '.act.expect', '{type, gene?, on?, level?}');
      }
      if (s.guess !== undefined) validateGuess(s.guess, p + '.guess', fail, isMc, guessIds);
      (s.notes || []).forEach((n, k) => {
        cond(p + '.notes[' + k + ']', n);
        if (typeof n.text !== 'string' || !n.text) fail(p + '.notes[' + k + '].text', 'missing');
      });
      if (s.cause !== undefined && (typeof s.cause !== 'string' || !s.cause)) fail(p + '.cause', 'one sentence');
      if (s.wait !== undefined && (typeof s.wait !== 'string' || !s.wait)) fail(p + '.wait', 'one sentence shown while the step waits');
      if (s.speed !== undefined) {
        if (typeof s.speed === 'object' && s.speed) { cond(p + '.speed', s.speed); if (!(s.speed.to > 0)) fail(p + '.speed.to', 'a speed'); }
        else if (!(typeof s.speed === 'number' && s.speed > 0)) fail(p + '.speed', 'a speed (sim s per real s), or {to, test}');
      }
    });
    for (const s of w.steps) {
      if (s.guess && s.guess.showAt !== undefined && !ids[s.guess.showAt]) fail('watch.steps.' + s.id + '.guess.showAt', 'no step ' + s.guess.showAt);
    }
    return guessIds;
  }

  /**
   * One guess ({id, prompt, options: [{t, fb, mc?, cause?: true}], showAt?}): never right or wrong, every option with
   * its "What happened" feedback, exactly one marked as the explained cause. ids collects the ids (no duplicates).
   */
  function validateGuess(q, gp, fail, isMc, ids) {
    if (!q || typeof q.id !== 'string' || !q.id) fail(gp + '.id', 'missing');
    if (ids[q.id]) fail(gp + '.id', 'duplicate guess ' + q.id);
    ids[q.id] = true;
    if (typeof q.prompt !== 'string' || !q.prompt) fail(gp + '.prompt', 'missing prompt');
    if (!Array.isArray(q.options) || q.options.length < 3) fail(gp + '.options', 'at least 3 options');
    let cause = 0;
    q.options.forEach((o, k) => {
      const op = gp + '.options[' + k + ']';
      if (!o || typeof o.t !== 'string' || !o.t) fail(op + '.t', 'missing option text');
      if (typeof o.fb !== 'string' || !o.fb) fail(op + '.fb', 'every option has "What happened" feedback');
      if (o.ok !== undefined) fail(op + '.ok', 'guesses are never right or wrong: mark the explained cause with cause: true');
      if (o.cause === true) { cause++; if (o.mc !== undefined) fail(op + '.mc', 'the cause has no misconception'); }
      else if (o.mc !== undefined && !isMc(o.mc)) fail(op + '.mc', 'unknown misconception ' + o.mc);
    });
    if (cause !== 1) fail(gp + '.options', 'exactly one option has cause: true (found ' + cause + ')');
    return ids;
  }

  /** Every guess of a level (its watch steps and its opening scenes), by id: {id: {step, guess, scene?}}. */
  function guesses(def) {
    const out = {};
    for (const s of (def.watch && def.watch.steps) || []) if (s.guess) out[s.guess.id] = { step: s.id, guess: s.guess };
    for (const s of def.scenes || []) if (s.guess) out[s.guess.id] = { step: s.id, guess: s.guess, scene: true };
    return out;
  }

  return { TESTS, testFor, matches, satisfiedBy, locationOf, validate, validateGuess, guesses, GATES };
});
