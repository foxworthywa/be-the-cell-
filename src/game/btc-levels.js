// @deps btc-narrate btc-level-kit btc-misconceptions btc-watch
/*
 * Be the Cell: the level registry (LEVELS §3.1–3.3).
 *
 * Each level file registers one definition in BTC.levelDefs. This module
 * validates every definition against the schema of §3.2 (throwing with the
 * level id and the field path), freezes it, and exposes BTC.levels.list (in
 * `order`) and BTC.levels.byId. In Node, tests require a level file directly
 * and pass it to validate(def).
 *
 * lintText(def) is the text lint of §12.1 L-2 over a level's TEXT object
 * (def.text): at most 140 characters, no "!", no teleology and no
 * "primitive/advanced/upgrade/evolved from", with the three reviewed
 * exceptions of §3.3: a Commander line followed later in its beat by a
 * narrator line, a denial with a negation just before the word, and a wrong
 * option's text (never its feedback).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/btc-narrate.js'), require('./btc-level-kit.js'), require('./btc-misconceptions.js'),
      require('./btc-watch.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.levels = factory(B.narrate, B.levelKit, B.misconceptions, B.watch);
    B.levels.load(B.levelDefs || {});
  }
})(typeof self !== 'undefined' ? self : this, function (N, K, MC, W) {
  'use strict';

  /** Every phase, in the only order a level may use them (§4.1; watch: PROLOGUE §1.4, the teaching-first redesign). */
  const PHASES = Object.freeze(['scenes', 'intro', 'watch', 'task', 'predict', 'demo', 'design', 'run', 'result', 'predict2',
    'epilogue', 'debrief', 'echo', 'complete']);
  const WHO = Object.freeze(['narrator', 'commander', 'ribosome', 'laci', 'protease', 'glucose']);
  const MODES = ['guided', 'operator', 'designer'];
  const STAMPS = ['universal', 'bacteria'];
  const KINDS = ['choice', 'number', 'sketch', 'table'];

  class LevelError extends Error {
    constructor(id, path, message) {
      super('level ' + id + ': ' + path + ': ' + message);
      this.name = 'LevelError';
      this.levelId = id;
      this.path = path;
    }
  }

  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const isInt = (x) => typeof x === 'number' && Math.floor(x) === x;
  const isStr = (x) => typeof x === 'string' && x.length > 0;

  function validateLine(fail, path, line) {
    if (!isObj(line)) fail(path, 'a story line must be {who, text}');
    if (WHO.indexOf(line.who) < 0) fail(path + '.who', 'unknown speaker ' + line.who);
    if (!isStr(line.text)) fail(path + '.text', 'missing text');
    if (line.denies !== undefined && typeof line.denies !== 'boolean') fail(path + '.denies', 'must be true or false');
  }

  function validateChoice(fail, path, q) {
    if (!isStr(q.prompt)) fail(path + '.prompt', 'missing prompt');
    if (!Array.isArray(q.options) || q.options.length < 3) fail(path + '.options', 'at least 3 options');
    let ok = 0;
    q.options.forEach((o, i) => {
      const p = path + '.options[' + i + ']';
      if (!isObj(o) || !isStr(o.t)) fail(p + '.t', 'missing option text');
      if (!isStr(o.fb)) fail(p + '.fb', 'every option needs feedback');
      if (o.ok === true) {
        ok++;
        if (o.mc !== undefined) fail(p + '.mc', 'the right option has no misconception');
      } else {
        if (o.ok !== undefined) fail(p + '.ok', 'ok is true or absent');
        if (!MC.has(o.mc)) fail(p + '.mc', 'a wrong option needs a registered misconception, not ' + o.mc);
      }
    });
    if (ok !== 1) fail(path + '.options', 'exactly one option has ok: true (found ' + ok + ')');
  }

  function validateItem(fail, path, it) {
    if (!isObj(it) || !isStr(it.id)) fail(path + '.id', 'missing id');
    if (KINDS.indexOf(it.kind) < 0) fail(path + '.kind', 'unknown kind ' + it.kind);
    if (it.kind === 'choice') validateChoice(fail, path, it);
    else if (it.kind === 'number') {
      if (!isStr(it.prompt)) fail(path + '.prompt', 'missing prompt');
      for (const k of ['min', 'max', 'step', 'tolerance']) if (typeof it[k] !== 'number') fail(path + '.' + k, 'must be a number');
      if (typeof it.answer !== 'function') fail(path + '.answer', 'must be answer(variant, extras)');
      if (it.expert !== true) fail(path + '.expert', 'number items are Expert only');
    } else if (it.kind === 'sketch') {
      if (!isStr(it.prompt)) fail(path + '.prompt', 'missing prompt');
      if (!isObj(it.x) || !isObj(it.y)) fail(path + '.x', 'sketch axes {min, max, label}');
    } else if (it.kind === 'table') {
      if (!isStr(it.prompt)) fail(path + '.prompt', 'missing prompt');
      if (!Array.isArray(it.rows) || !Array.isArray(it.cols)) fail(path + '.rows', 'rows and cols are arrays');
      if (!Array.isArray(it.choices) || it.choices.length !== 2) fail(path + '.choices', 'two choice labels');
      if (!isObj(it.answer)) fail(path + '.answer', 'answer {rowId: {colId: 0|1}}');
      for (const r of it.rows) for (const c of it.cols) {
        if (!it.answer[r.id] || (it.answer[r.id][c.id] !== 0 && it.answer[r.id][c.id] !== 1)) fail(path + '.answer.' + r.id + '.' + c.id, '0 or 1');
      }
      if (it.coreRows !== undefined && typeof it.coreRows !== 'function') fail(path + '.coreRows', 'coreRows(variant) → [rowId]');
    }
    if (it.phase !== undefined && it.phase !== 'predict' && it.phase !== 'predict2') fail(path + '.phase', 'predict or predict2');
    if (it.expert !== undefined && typeof it.expert !== 'boolean') fail(path + '.expert', 'true or false');
  }

  /** A scene activity of the opening (PROLOGUE §2.3): copy, copies, read, show or explore, with what it needs. */
  function validateActivity(fail, path, a) {
    const KINDS_A = ['copy', 'copies', 'read', 'show', 'explore'];
    if (!isObj(a) || KINDS_A.indexOf(a.kind) < 0) fail(path + '.kind', 'copy, copies, read, show or explore');
    if (a.kind !== 'explore' && !(typeof a.total === 'number' && a.total > 0)) fail(path + '.total', 'a positive number');
    if (a.kind === 'copy') {
      if (!isStr(a.template) || !isStr(a.expect) || a.template.length !== a.expect.length) fail(path + '.expect', 'template and expect of equal length');
      if (!isObj(a.words) || !isStr(a.words.noT) || !isStr(a.words.other)) fail(path + '.words', '{noT, other}');
    }
    if (a.kind === 'copies' && !(isInt(a.n) && a.n > 0)) fail(path + '.n', 'how many copies');
    if (a.kind === 'read') {
      if (!Array.isArray(a.codons) || !a.codons.length || !Array.isArray(a.rows)) fail(path + '.codons', 'codons and rows');
      for (const c of a.codons) if (!a.rows.some((r) => r.codon === c)) fail(path + '.rows', 'no row for ' + c);
      if (!isObj(a.words) || !isStr(a.words.wrong)) fail(path + '.words', '{wrong}');
    }
  }

  /** A string in a level's TEXT by key; dotted keys walk into nested objects ('cards.ribosome'). */
  function textAt(def, key) {
    let x = def && def.text;
    for (const k of String(key).split('.')) x = x && typeof x === 'object' ? x[k] : undefined;
    return typeof x === 'string' ? x : undefined;
  }

  /**
   * Flag entries are ids, or {id, mc} to name the misconception a behaviour flag stands for, or
   * {id, mc, guess: 'g1' | ['d1', 'h5']}: raised when one of those watch guesses was picked on an option with that mc.
   */
  function flagList(def) {
    return (def.flags || []).map((f) => (typeof f === 'string' ? { id: f, mc: null, guess: [] }
      : { id: f.id, mc: f.mc || null, guess: f.guess === undefined ? [] : [].concat(f.guess) }));
  }

  /** Validates a level definition (§3.2); throws LevelError. Returns the definition. */
  function validate(def) {
    const id = def && def.id !== undefined ? String(def.id) : '?';
    const fail = (path, msg) => { throw new LevelError(id, path, msg); };
    if (!isObj(def)) fail('', 'a definition must be an object');
    if (!isStr(def.id)) fail('id', 'missing');
    if (typeof def.code !== 'string' || !/^[0-9A-Z]{2}$/.test(def.code)) fail('code', 'two characters 0–9 or A–Z');
    if (!isInt(def.order)) fail('order', 'an integer');
    if (!isInt(def.version) || def.version < 1) fail('version', 'an integer ≥ 1');
    if (!isObj(def.text)) fail('text', 'the TEXT object');
    for (const k of ['title', 'challenge']) {
      if (!isStr(def[k]) || textAt(def, def[k]) === undefined) fail(k, 'must name a string in TEXT');
    }
    if (MODES.indexOf(def.mode) < 0) fail('mode', 'guided, operator or designer');
    if (typeof def.scored !== 'boolean') fail('scored', 'true or false');
    if (!Array.isArray(def.los) || !def.los.length || def.los.some((x) => !/^LO\d+$/.test(x))) fail('los', 'a list of LO ids');
    if (!Array.isArray(def.misconceptions)) fail('misconceptions', 'a list');
    def.misconceptions.forEach((m, i) => { if (!MC.has(m)) fail('misconceptions[' + i + ']', 'unknown misconception ' + m); });
    if (!isInt(def.estMinutes) || def.estMinutes < 1) fail('estMinutes', 'a positive integer');
    if (typeof def.engine !== 'string' || !/^\d+\.\d+$/.test(def.engine)) fail('engine', "major.minor, e.g. '1.1'");

    // Phases: a subset of PHASES in their order, ending with complete.
    if (!Array.isArray(def.phases) || !def.phases.length) fail('phases', 'a list');
    let last = -1;
    def.phases.forEach((p, i) => {
      const k = PHASES.indexOf(p);
      if (k < 0) fail('phases[' + i + ']', 'unknown phase ' + p);
      if (k <= last) fail('phases[' + i + ']', p + ' is out of order or repeated');
      last = k;
    });
    if (def.phases[def.phases.length - 1] !== 'complete') fail('phases', 'the last phase is complete');
    const has = (p) => def.phases.indexOf(p) >= 0;
    if (def.scored) for (const p of ['task', 'run', 'result', 'debrief']) if (!has(p)) fail('phases', 'a scored level has ' + p);
    if (has('scenes') && def.scored) fail('phases', 'scenes are for the unscored Prologue');

    for (const f of ['variant', 'config', 'labConfig']) if (typeof def[f] !== 'function') fail(f, 'must be a function');
    if (has('run')) {
      for (const f of ['hud', 'monitor']) if (typeof def[f] !== 'function') fail(f, 'must be a function');
    }
    if (def.scored && typeof def.score !== 'function') fail('score', 'must be a function');
    if (def.score !== undefined && typeof def.score !== 'function') fail('score', 'must be a function');

    // Items and questions.
    const ids = {};
    const seen = (path, qid) => { if (ids[qid]) fail(path, 'duplicate item id ' + qid); ids[qid] = true; };
    if (!Array.isArray(def.predictions)) fail('predictions', 'a list (may be empty)');
    def.predictions.forEach((it, i) => {
      validateItem(fail, 'predictions[' + i + ']', it);
      seen('predictions[' + i + '].id', it.id);
      const ph = it.phase || 'predict';
      if (!has(ph)) fail('predictions[' + i + '].phase', 'the level has no ' + ph + ' phase');
    });
    for (const ph of ['predict', 'predict2']) {
      if (has(ph) && !def.predictions.some((it) => (it.phase || 'predict') === ph && !it.expert)) fail('predictions', ph + ' has no Core item');
    }
    // The unscored opening explains through its guesses and may have no question of its own (PROLOGUE §2.1).
    if (!Array.isArray(def.debrief) || def.debrief.length > 2 || (def.debrief.length < 1 && def.scored)) fail('debrief', '1 or 2 questions');
    def.debrief.forEach((q, i) => {
      if (!isObj(q) || q.kind !== 'choice') fail('debrief[' + i + ']', 'a choice question');
      validateChoice(fail, 'debrief[' + i + ']', q);
      seen('debrief[' + i + '].id', q.id);
    });
    if (has('demo') && !(isObj(def.demo) && isInt(def.demo.durationTicks))) fail('demo', '{durationTicks, speed}');
    // The Watch step (PROLOGUE §1.4, §2.4.3): its steps, guesses and gates.
    let guessIds = {};
    if (has('watch')) guessIds = W.validate(def, fail, (m) => MC.has(m), (path, l) => validateLine(fail, path, l));
    else if (def.watch !== undefined) fail('watch', 'the level has no watch phase');
    // A scene of the opening may ask a guess too ("Guess, then see", PROLOGUE §2.3.4): the same rules.
    for (const [i, sc] of (def.scenes || []).entries()) {
      if (sc && sc.guess !== undefined) {
        W.validateGuess(sc.guess, 'scenes[' + i + '].guess', fail, (m) => MC.has(m), guessIds);
        if (sc.guess.showAt !== undefined && !def.scenes.some((x) => x.id === sc.guess.showAt)) fail('scenes[' + i + '].guess.showAt', 'no scene ' + sc.guess.showAt);
      }
    }

    // Flags: at most 8, unique, misconceptions registered.
    const flags = flagList(def);
    if (flags.length > 8) fail('flags', 'at most 8');
    const fseen = {};
    flags.forEach((f, i) => {
      if (!isStr(f.id) || !/^[A-Z0-9_]+$/.test(f.id)) fail('flags[' + i + ']', 'an upper-case id');
      if (fseen[f.id]) fail('flags[' + i + ']', 'duplicate flag ' + f.id);
      fseen[f.id] = true;
      if (f.mc !== null && !MC.has(f.mc)) fail('flags[' + i + '].mc', 'unknown misconception ' + f.mc);
      // A flag raised by a guess (the first pick on an option with its misconception) names the guess or guesses.
      for (const g of f.guess) if (!guessIds[g]) fail('flags[' + i + '].guess', 'no watch guess ' + g);
      if (f.guess.length && f.mc === null) fail('flags[' + i + '].mc', 'a guess flag names the misconception it stands for');
    });

    // The task card (§5.3): TEXT.task = {goal, core: [lines], expert: [lines]}.
    if (has('task')) {
      const t = def.text.task;
      if (!isObj(t) || !isStr(t.goal) || !Array.isArray(t.core) || !t.core.length || !Array.isArray(t.expert)) {
        fail('text.task', '{goal, core: [lines], expert: [lines]}');
      }
    }

    // Echo, story, scenes.
    if (!isObj(def.echo) || !Array.isArray(def.echo.screens) || !Array.isArray(def.echo.cards)) fail('echo', '{screens, cards}');
    def.echo.screens.forEach((k, i) => { if (textAt(def, k) === undefined) fail('echo.screens[' + i + ']', 'must name a string in TEXT'); });
    if (has('echo') && !def.echo.screens.length) fail('echo.screens', 'at least one screen');
    def.echo.cards.forEach((c, i) => {
      if (!isObj(c) || !isStr(c.id)) fail('echo.cards[' + i + '].id', 'missing');
      if (textAt(def, c.title) === undefined) fail('echo.cards[' + i + '].title', 'must name a string in TEXT');
      if (STAMPS.indexOf(c.stamp) < 0) fail('echo.cards[' + i + '].stamp', 'universal or bacteria');
    });
    if (!isObj(def.story) || !Array.isArray(def.story.intro) || !Array.isArray(def.story.outro)) fail('story', '{intro, outro}');
    for (const beat of ['intro', 'outro']) def.story[beat].forEach((l, i) => validateLine(fail, 'story.' + beat + '[' + i + ']', l));
    if (def.story.extra !== undefined) {
      if (!isObj(def.story.extra)) fail('story.extra', '{name: [lines]}');
      for (const k of Object.keys(def.story.extra)) {
        const lines = def.story.extra[k];
        if (!Array.isArray(lines) || !lines.length) fail('story.extra.' + k, 'a beat of lines');
        lines.forEach((l, i) => validateLine(fail, 'story.extra.' + k + '[' + i + ']', l));
      }
    }
    if (def.outroKey !== undefined && typeof def.outroKey !== 'function') fail('outroKey', 'must be outroKey(variant, monitorResult, goal)');
    if (def.skipBeat !== undefined && typeof def.skipBeat !== 'function') fail('skipBeat', 'must be skipBeat(name, variant, design)');
    if (def.missReason !== undefined && typeof def.missReason !== 'function') fail('missReason', 'must be missReason(monitorResult) → a phrase or null');
    if (has('intro') && !def.story.intro.length) fail('story.intro', 'the intro beat has no lines');
    if (has('scenes')) {
      if (!Array.isArray(def.scenes) || !def.scenes.length) fail('scenes', 'a list of scenes');
      def.scenes.forEach((s, i) => {
        const p = 'scenes[' + i + ']';
        if (!isObj(s) || !isStr(s.id)) fail(p + '.id', 'missing');
        if (!Array.isArray(s.lines) || !s.lines.length) fail(p + '.lines', 'at least one line');
        s.lines.forEach((l, j) => validateLine(fail, p + '.lines[' + j + ']', l));
        if (s.question !== undefined && !def.debrief.some((q) => q.id === s.question)) fail(p + '.question', 'must name a debrief question');
        if (s.activity !== undefined) validateActivity(fail, p + '.activity', s.activity);
        if (s.rung !== undefined && !isStr(s.rung)) fail(p + '.rung', 'the rung\'s drawing, a name');
      });
    }
    if (def.runBeats !== undefined) {
      if (!Array.isArray(def.runBeats) || def.runBeats.some((b) => !isObj(b) || !isStr(b.name) || typeof b.when !== 'function')) fail('runBeats', '[{name, when(monitorSave)}]');
      for (const b of def.runBeats) if (!def.story.extra || !def.story.extra[b.name]) fail('runBeats.' + b.name, 'story.extra has no beat ' + b.name);
    }
    if (def.uiKey !== undefined && typeof def.uiKey !== 'function') fail('uiKey', 'uiKey(monitorSave, phase) → a string');
    if (!Array.isArray(def.narratorRules)) fail('narratorRules', 'a list (may be empty)');
    def.narratorRules.forEach((r, i) => {
      if (!isObj(r) || typeof r.key !== 'string' || r.key.indexOf(prefixOf(def.id)) !== 0) fail('narratorRules[' + i + '].key', 'starts with ' + prefixOf(def.id));
      if (typeof r.when !== 'function' || !isStr(r.template)) fail('narratorRules[' + i + ']', '{key, when, template}');
    });

    // Solutions: the reference must exist and expect goal and par.
    if (!isObj(def.solutions) || !isObj(def.solutions.reference)) fail('solutions.reference', 'missing');
    for (const name of Object.keys(def.solutions)) {
      const s = def.solutions[name];
      if (!isObj(s.expect)) fail('solutions.' + name + '.expect', 'missing');
      if (has('run') && (s.kind !== 'policy' || typeof s.act !== 'function' || !isInt(s.every))) fail('solutions.' + name, '{kind: "policy", every, act}');
    }
    if (def.scored && !(def.solutions.reference.expect.goal === true && def.solutions.reference.expect.par === true)) {
      fail('solutions.reference.expect', 'the reference expects goal and par');
    }
    return def;
  }

  /** "l14." for 1.4, "lp." for the Prologue. */
  function prefixOf(id) { return 'l' + String(id).replace('.', '').toLowerCase() + '.'; }

  function deepFreeze(x) {
    if (x && typeof x === 'object' && !Object.isFrozen(x)) {
      Object.freeze(x);
      for (const k of Object.keys(x)) deepFreeze(x[k]);
    }
    return x;
  }

  // ---------------------------------------------------------------------------
  // The text lint (L-2)
  // ---------------------------------------------------------------------------
  const BAD_WORDS = /\b(primitive|advanced|upgrade[ds]?|evolved from)\b/i;
  const NEGATIONS = ['not', "don't", "doesn't", 'never', 'nothing', 'no one'];

  /** True when one of the negations appears within the three words before index i. */
  function negatedBefore(text, i) {
    const before = text.slice(0, i).toLowerCase().replace(/[’]/g, "'").split(/\s+/).filter(Boolean);
    const window = before.slice(-3).map((w) => w.replace(/[^a-z']/g, ''));
    const joined = ' ' + window.join(' ') + ' ';
    return NEGATIONS.some((n) => joined.indexOf(' ' + n + ' ') >= 0);
  }

  function basic(text) {
    const out = [];
    if (text.length > 140) out.push('longer than 140 characters (' + text.length + ')');
    if (text.indexOf('!') >= 0) out.push('exclamation mark');
    if (BAD_WORDS.test(text)) out.push('word "' + BAD_WORDS.exec(text)[0] + '"');
    return out;
  }
  function teleology(text) { return N.TELEOLOGY.test(text) ? 'teleology "' + N.TELEOLOGY.exec(text)[0] + '"' : null; }

  const isLine = (x) => isObj(x) && typeof x.who === 'string' && typeof x.text === 'string';

  /**
   * Problems in a level's TEXT: [{where, text, problem}]. Structures are
   * recognised by shape: an array of {who, text} is a story beat; an object
   * with options [{t, fb}] is a question.
   */
  function lintText(def) {
    const out = [];
    const add = (where, text, problems) => { for (const p of problems) out.push({ where, text, problem: p }); };
    const plain = (where, text) => {
      const t = teleology(text);
      add(where, text, basic(text).concat(t ? [t] : []));
    };
    function beat(where, lines) {
      lines.forEach((l, i) => {
        const w = where + '[' + i + ']';
        const probs = basic(l.text);
        const m = N.TELEOLOGY.exec(l.text);
        if (m) {
          const laterNarrator = lines.slice(i + 1).some((x) => x.who === 'narrator');
          if (l.who === 'commander') {
            if (!laterNarrator) probs.push('a Commander line with "' + m[0] + '" needs a later narrator line in its beat');
          } else if (l.denies === true) {
            if (!negatedBefore(l.text, m.index)) probs.push('a denial of "' + m[0] + '" needs a negation within three words before it');
          } else probs.push('teleology "' + m[0] + '"');
        }
        add(w, l.text, probs);
        for (const k of Object.keys(l)) if (k !== 'who' && k !== 'text' && k !== 'denies') walk(w + '.' + k, l[k]);
      });
    }
    function question(where, q) {
      for (const k of Object.keys(q)) {
        if (k === 'options') continue;
        walk(where + '.' + k, q[k]);
      }
      q.options.forEach((o, i) => {
        const w = where + '.options[' + i + ']';
        if (typeof o.t === 'string') {
          const wrongWithMc = o.ok !== true && typeof o.mc === 'string';
          const probs = basic(o.t);
          const t = teleology(o.t);
          if (t && !wrongWithMc) probs.push(t);
          add(w + '.t', o.t, probs);
        }
        if (typeof o.fb === 'string') plain(w + '.fb', o.fb);
        for (const k of Object.keys(o)) if (k !== 't' && k !== 'fb' && k !== 'ok' && k !== 'mc') walk(w + '.' + k, o[k]);
      });
    }
    function walk(where, x) {
      if (typeof x === 'string') plain(where, x);
      else if (Array.isArray(x)) {
        if (x.length && x.every(isLine)) beat(where, x);
        else x.forEach((y, i) => walk(where + '[' + i + ']', y));
      } else if (isObj(x)) {
        if (Array.isArray(x.options) && x.options.every((o) => isObj(o) && typeof o.t === 'string')) question(where, x);
        else for (const k of Object.keys(x)) walk(where + '.' + k, x[k]);
      }
    }
    walk('TEXT', def.text);
    // Narrator level rules: the full template rules, expanded for every gene, named and hidden.
    for (const r of def.narratorRules || []) {
      for (const showNames of [true, false]) {
        const memory = N.createMemory({ showNames });
        const genes = /\{(G|n|N|is|its|it|s)\}/.test(r.template) ? N.GENE_IDS : [null];
        for (const g of genes) {
          const text = N.expand(r.template, memory, g);
          for (const p of N.lint(text)) out.push({ where: 'narratorRules.' + r.key + (g ? '/' + g : ''), text, problem: p });
          if (BAD_WORDS.test(text)) out.push({ where: 'narratorRules.' + r.key, text, problem: 'word "' + BAD_WORDS.exec(text)[0] + '"' });
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // The registry
  // ---------------------------------------------------------------------------
  function build(defs) {
    const list = [], byId = {}, codes = {}, orders = {};
    for (const key of Object.keys(defs || {})) {
      const def = validate(defs[key]);
      if (byId[def.id]) throw new LevelError(def.id, 'id', 'registered twice');
      if (codes[def.code]) throw new LevelError(def.id, 'code', 'code ' + def.code + ' is also level ' + codes[def.code]);
      if (orders[def.order] !== undefined) throw new LevelError(def.id, 'order', 'order ' + def.order + ' is also level ' + orders[def.order]);
      codes[def.code] = def.id; orders[def.order] = def.id;
      byId[def.id] = deepFreeze(def);
      list.push(def);
    }
    list.sort((a, b) => a.order - b.order);
    return { list, byId };
  }

  const api = {
    PHASES, WHO, LevelError, validate, lintText, negatedBefore, flagList, prefixOf, textAt, build,
    list: [], byId: {},
    /** Loads BTC.levelDefs (the browser does this at load). A definition that fails validation is left out and reported. */
    load(defs) {
      api.list.length = 0;
      for (const k of Object.keys(api.byId)) delete api.byId[k];
      for (const key of Object.keys(defs || {})) {
        try { api.add(defs[key]); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
      }
      return api;
    },
    /** Adds one definition (a level file loaded later, or a test fixture). */
    add(def) {
      const one = build({ x: def });
      const d = one.list[0];
      if (api.byId[d.id] === d) return d;
      if (api.byId[d.id]) throw new LevelError(d.id, 'id', 'registered twice');
      for (const o of api.list) {
        if (o.code === d.code) throw new LevelError(d.id, 'code', 'code ' + d.code + ' is also level ' + o.id);
        if (o.order === d.order) throw new LevelError(d.id, 'order', 'order ' + d.order + ' is also level ' + o.id);
      }
      api.byId[d.id] = d;
      api.list.push(d);
      api.list.sort((a, b) => a.order - b.order);
      return d;
    },
    /** The level after id in the list, or null. */
    after(id) {
      const i = api.list.findIndex((d) => d.id === id);
      return i >= 0 && i + 1 < api.list.length ? api.list[i + 1] : null;
    },
  };
  return api;
});
