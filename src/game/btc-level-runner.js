// @deps btc-cell btc-replay btc-level-kit btc-watch btc-levels btc-score btc-code
/*
 * Be the Cell: the level runner (LEVELS §4) and the headless player.
 *
 * One pure phase machine drives every level through the same phases:
 * scenes (Prologue) · intro · watch · task · predict · demo · design · run · result ·
 * predict2 · epilogue · debrief · echo · complete. Nothing advances because
 * time passed: next() refuses until the gate of §4.1 holds, and says why.
 *
 * The level pattern of the teaching-first redesign (docs/PROLOGUE.md §1.4): Watch (the watch
 * phase: steps on a watch cell, gated on taps, acts, guesses or model states; guesses are logged,
 * never marked wrong, and feed flags only), Guess then see (a step's guess), Try (the run: G and
 * E) and Explain (the debrief: D). Only Try and Explain are scored (BTC.score, code format BTC2).
 *
 *   r.watchInfo()                     the current step: its line, stage, guess, cause and feedback
 *   r.watchNext()                     Next (the next line, or past an opened gate)
 *   r.watchPick(gid, option), r.watchSee()   a guess, then "See what happens"
 *   r.watchCommand(cmd, result)       the app reports each command the student sent on the watch cell
 *   r.watchZoom(level)                the app reports a zoom change (an act of kind 'zoom')
 *   r.watchCell, r.watch              the watch cell (role 'watch'; discarded after the phase) and its state
 *
 *   const r = new BTC.LevelRunner({def, variantSeed, attempt, override, deviceSeed, telemetry})
 *   r.start()                         level_start, then the first phase
 *   r.phase, r.gate(), r.next()       the phase and its gate; next() → {ok, phase} or {ok: false, reason}
 *   r.storyLine() / storyNext() / storySkip()        the active story beat (intro; outro in result or echo)
 *   r.watchInfo() / watchNext() / watchPick() / watchSee() / watchCommand()   the watch phase (above)
 *   r.sceneInfo() / sceneNext() / sceneSkip()        the opening's scenes; sceneAct(action) does a scene's activity
 *                                                    (letters, copies, codons, a run), sceneBack() / sceneJump(i) move
 *                                                    along the zoom ladder (rungs already visited)
 *   r.items() / select(id, v) / lock(id, v) / skip(id) / optionOrder(id)   predictions
 *   r.ensureRun() → cell; r.halted(); r.retry(); r.continueWithoutGoal()  the run
 *   r.tap(qid, option) → {correct, fb, mc}           debrief (and scene) questions, with retries
 *   r.setDesign(d), r.hasPar(), r.parStep(ms)        1.7: the student's DNA, and the par run (the reference
 *                                                    design on the same schedule and seed), computed in slices
 *   r.echoNext()                                     "Meanwhile, in you"
 *   r.preview()                                      score components so far (the result sheet)
 *   r.result, r.code, r.runFile(extra), r.save(), LevelRunner.restore(def, saved, opts)
 *   BTC.game.verifyRunFile(file, {levels})           replays a run file's records with the level's
 *                                                    monitor and recomputes its score and code (§10.4)
 *
 * The run's cell gets the level monitor through a recorder: after every step
 * it passes the user commands that have been applied (LogEntries, in order),
 * calls monitor.onTick(cell) and asks monitor.end(). The same happens in a
 * replay, so the headless player, the app and verify-run agree.
 *
 * Option values of choice questions are canonical option indices (the order
 * in the level file); solutions may write 'ok' for the right option. A policy's
 * act(view, tick, api, variant) gets the variant as its fourth argument.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const cellApi = require('../engine/btc-cell.js');
    module.exports = factory({ Cell: cellApi.Cell, ENGINE_VERSION: cellApi.ENGINE_VERSION, replay: require('../engine/btc-replay.js') },
      require('./btc-level-kit.js'), require('./btc-levels.js'), require('./btc-score.js'), require('./btc-code.js'), require('./btc-watch.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    var api = factory({ Cell: B.Cell, ENGINE_VERSION: B.ENGINE_VERSION, replay: B.replay }, B.levelKit, B.levels, B.score, B.code, B.watch);
    B.LevelRunner = api.LevelRunner;
    B.game = api.game;
  }
})(typeof self !== 'undefined' ? self : this, function (ENG, K, LV, S, CODE, W) {
  'use strict';

  const Cell = ENG.Cell;
  const copy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

  function deepFreeze(x) {
    if (x && typeof x === 'object' && !Object.isFrozen(x)) {
      Object.freeze(x);
      for (const k of Object.keys(x)) deepFreeze(x[k]);
    }
    return x;
  }

  /** Builds a cell from a level config (engine ≥ 1.1 accepts config.variant, LEVELS R-E3). */
  function makeCell(config) {
    return new Cell(config);
  }

  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  /**
   * The par run of a designer level (LEVELS §7.7.4): the level's par design run headless on the
   * student's variant with the task's engine seed (common random numbers) and the level's own
   * monitor, stepped in slices. step(ms) runs until the monitor ends the run or ms of wall time
   * have passed (Infinity: to the end); snapshot() → {done, result, finalHash}.
   */
  function parRunner(def, variant, make) {
    const design = copy(def.par.design);
    let cell = null, monitor = null, st = null, out = { done: false, result: null, finalHash: null, ticks: 0 };
    return {
      get done() { return out.done; },
      step(ms) {
        if (out.done) return true;
        if (!cell) {
          cell = (make || makeCell)(def.config(variant, 'par', { deviceSeed: 0, design }));
          monitor = def.monitor(variant, { dt: cell.dt, K, variant, design });
          if (monitor.start) monitor.start(cell);
          st = { logIdx: 0, endReason: null, endTick: null };
          cell.attachRecorder(monitorFeed(monitor, st));
          // Building the cell is a slice of its own: the first frame does nothing else.
          if (ms !== Infinity) return false;
        }
        const t0 = nowMs();
        let n = 0;
        while (!st.endReason) {
          cell.step();
          // The clock is read every 16 steps, so a slice stays close to its budget on a slow phone.
          if ((++n & 15) === 0) {
            if ((n & 255) === 0) cell.takeEvents();
            if (ms !== Infinity && nowMs() - t0 >= ms) break;
          }
        }
        cell.takeEvents();
        if (st.endReason) {
          out = { done: true, result: copy(monitor.result()), finalHash: cell.hash(), ticks: cell.tick };
          cell = null; monitor = null;
        }
        return out.done;
      },
      progress() { return out.done ? 1 : cell && def.par.ticks ? Math.min(0.99, cell.tick / def.par.ticks(variant)) : 0; },
      snapshot() { return copy(out); },
      set(s) { if (s && s.done) out = copy(s); },
    };
  }

  function localDate() {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /**
   * The record of one locked prediction (pure; the runner, verify-run and the tests share it):
   * {locked, value, option?, correct?, mc?, answer?, features?, P?} or {error}.
   * extras: {demo} (1.2's Expert number is judged against the demo's copies per mRNA).
   */
  function answerRecord(it, value, variant, extras) {
    const a = { locked: true, value };
    if (it.kind === 'choice') {
      const idx = value === 'ok' ? it.options.findIndex((o) => o.ok === true) : value;
      const o = it.options[idx];
      if (!o) return { error: 'no such option' };
      a.value = idx; a.option = idx; a.correct = o.ok === true; a.mc = o.mc || null;
    } else if (it.kind === 'number') {
      const x = Math.max(it.min, Math.min(it.max, Number(value)));
      if (!(x === x)) return { error: 'not a number' };
      a.value = x;
      const ans = it.answer(variant, extras || {});
      a.answer = ans;
      a.correct = ans !== 0 ? Math.abs(x - ans) / Math.abs(ans) <= it.tolerance : x === 0;
    } else if (it.kind === 'sketch' && typeof it.evaluate === 'function') {
      const e = it.evaluate(value, variant, extras || {});
      if (e) { a.features = e.features; a.P = e.P; a.correct = e.P === 1; }
    } else if (it.kind === 'table') {
      const m = markTable(it, value, variant);
      if (m.error) return { error: m.error };
      Object.assign(a, m);
    }
    return a;
  }

  /**
   * Marks a truth-table answer (LEVELS §3.3, §7.7.7): value {rowId: {colId: 0|1}}. Every Core cell
   * (the variant's coreRows) must be set; the other rows are Expert and may be left empty.
   * → {value (normalised), rows, coreRows, cells: {rowId: {colId: true|false}}, coreRight, coreTotal,
   *    P, correct (every Core cell right), expertAll (every row set and right)} or {error}.
   */
  function markTable(it, value, variant) {
    if (!value || typeof value !== 'object') return { error: 'not a table' };
    const core = typeof it.coreRows === 'function' ? it.coreRows(variant) : it.rows.map((r) => r.id);
    const rows = typeof it.shownRows === 'function' ? it.shownRows(variant) : it.rows.map((r) => r.id);
    const cols = it.cols.map((c) => c.id);
    const norm = {}, cells = {};
    let coreRight = 0, coreTotal = 0, all = true;
    for (const rid of rows) {
      const src = value[rid] || {};
      for (const cid of cols) {
        const x = src[cid];
        const set = x === 0 || x === 1;
        const isCore = core.indexOf(rid) >= 0;
        if (!set) { if (isCore) return { error: 'a Core cell is empty' }; all = false; continue; }
        (norm[rid] || (norm[rid] = {}))[cid] = x;
        const right = it.answer[rid][cid] === x;
        (cells[rid] || (cells[rid] = {}))[cid] = right;
        if (isCore) { coreTotal++; if (right) coreRight++; }
        if (!right) all = false;
      }
    }
    return { value: norm, rows, coreRows: core, cells, coreRight, coreTotal, P: coreTotal ? coreRight / coreTotal : 0,
      correct: coreTotal > 0 && coreRight === coreTotal, expertAll: all };
  }

  /** Debrief state {qid: {tries, solved, first, firstCorrect, firstMc}} rebuilt from the taps, in order (pure). */
  function debriefFromTaps(def, taps) {
    const out = {};
    for (const t of taps || []) {
      const q = def.debrief.find((x) => x.id === t.id);
      const o = q && q.options[t.option];
      if (!o) continue;
      const st = out[t.id] || (out[t.id] = { tries: [], solved: false, first: null, firstCorrect: false, firstMc: null });
      if (st.solved || st.tries.indexOf(t.option) >= 0) continue;
      st.tries.push(t.option);
      const correct = o.ok === true;
      if (st.tries.length === 1) { st.first = t.option; st.firstCorrect = correct; st.firstMc = correct ? null : (o.mc || null); }
      if (correct) st.solved = true;
    }
    return out;
  }

  /**
   * A recorder that feeds a level monitor exactly as a run does, live or in a replay: after
   * every step, the user commands applied so far (LogEntries, in order) go to
   * monitor.userCommand, then monitor.onTick(cell), then monitor.end(). st holds {logIdx,
   * endReason, endTick} (the run keeps it in its autosave). onCommand(entry) and
   * onEnd(reason, tick) are optional.
   */
  function monitorFeed(monitor, st, onCommand, onEnd) {
    return {
      onTick(c) {
        const log = c.log;
        while (st.logIdx < log.length) {
          const e = log[st.logIdx];
          if (e.source !== 'user') { st.logIdx++; continue; }
          if (!(e.tick < c.tick)) break;             // not applied yet
          st.logIdx++;
          if (monitor.userCommand) monitor.userCommand(copy(e));
          if (onCommand) onCommand(e);
        }
        monitor.onTick(c);
        if (!st.endReason) {
          const r = monitor.end();
          if (r) {
            st.endReason = r; st.endTick = c.tick;
            if (onEnd) onEnd(r, c.tick);
          }
        }
      },
    };
  }

  const clampRuns = (n) => Math.min(99, Math.max(1, n || 0));

  /**
   * The watch phase's state (plain JSON, in the autosave): the step, the line within it, the stage
   * ('until' waiting to show the step · 'lines' · 'guess' · 'act' · 'wait' for a state gate · 'tap' once
   * the gate is open · 'done'), the picks and the locked guesses, the acts, gate ticks, the scratch
   * memory of the condition being tested, the watched mRNA and whether a paused gate holds the cell.
   */
  function freshWatch() {
    return { index: 0, line: 0, stage: 'lines', open: false, hold: false, done: false, picks: {}, guesses: {}, acted: {},
      gateTick: {}, mem: {}, watchedId: null, commands: [] };
  }

  /**
   * G, E, P, D, X, flags, total and the code of an attempt (§6, §10), from the level's score
   * components. o: {goal, comp, debrief (state), variantSeed, attempt, runs, override, record}.
   */
  function summarise(def, o) {
    const comp = o.comp || {};
    let first = 0;
    for (const q of def.debrief) if (o.debrief[q.id] && o.debrief[q.id].firstCorrect) first++;
    // An unscored level may report something else in D (the opening: guesses first picked on the cause).
    const D = Array.isArray(comp.D) && comp.D.length === 2 ? [comp.D[0] | 0, comp.D[1] | 0] : [first, def.debrief.length];
    const scored = def.scored;
    const G = scored ? (o.goal ? 1 : 0) : 1;
    // Efficiency against par counts only when the goal was met (§6.1), so a missed goal reports E 0.
    const E = scored ? (G && typeof comp.E === 'number' ? S.clamp01(comp.E) : 0) : null;
    const P = scored && typeof comp.P === 'number' ? S.clamp01(comp.P) : null;
    const X = comp.X || 0;
    const flagList = LV.flagList(def), flagIds = flagList.map((f) => f.id);
    const raised = (comp.flags || []).map((f) => (typeof f === 'string' ? { id: f } : copy(f)));
    // Flags from guesses (PROLOGUE §2.7, §6.2.5): a guess picked on an option with the flag's misconception.
    for (const f of flagList) {
      for (const gid of f.guess) {
        const g = o.guesses && o.guesses[gid];
        if (g && g.mc === f.mc) { raised.push({ id: f.id, data: { guess: gid, option: g.option } }); break; }
      }
    }
    const evidence = raised.filter((f, i, a) => flagIds.indexOf(f.id) >= 0 && a.findIndex((g) => g.id === f.id) === i);
    const total = scored ? S.total({ G, E, P, D }) : null;
    const digest = scored && o.record ? o.record.finalHash.slice(0, 6).toUpperCase() : '000000';
    const engine = (o.record && o.record.engineVersion) || ENG.ENGINE_VERSION;
    const attempt = o.override ? 0 : o.attempt;
    // The code has two digits for runs (N1–N99): from the 100th run it says 99.
    const runs = clampRuns(o.runs);
    const code = CODE.encode({
      level: def.code, variantSeed: o.variantSeed, G, E: S.percent(E), P: S.percent(P), D, X,
      flags: S.flagMask(flagIds, evidence), attempt, runs, engine, content: def.version, digest,
    });
    return { G, E, P, D, X, evidence, total, code, engine, attempt, runs };
  }

  class LevelRunner {
    /**
     * o: {def, variantSeed, attempt (0 = override), override, deviceSeed, telemetry?, makeCell?, restoreCell?,
     *     today?, speed?() (for run_start)}
     */
    constructor(o) {
      const def = o.def;
      this.def = def;
      this.phases = def.phases;
      // The Prologue is not scored and has no variant: its code carries 000000.
      this.variantSeed = def.scored ? (o.variantSeed >>> 0) & 0x3FFFFFFF : 0;
      this.attempt = o.attempt === undefined ? 1 : o.attempt;
      this.override = !!o.override;
      this.deviceSeed = (o.deviceSeed || 0) >>> 0;
      this.tel = o.telemetry || null;
      this.makeCell = o.makeCell || makeCell;
      this.restoreCell = o.restoreCell || ((snap) => Cell.restore(snap));
      this.today = o.today || localDate;
      this.speedFn = o.speed || null;
      this.variant = deepFreeze(copy(def.variant(this.variantSeed)));
      this.vars = Object.assign({}, this.variant, def.textVars ? def.textVars(this.variant) : {});
      this.orders = {};
      this.phaseIndex = 0;
      this.answers = {};
      this.selected = {};
      this.debriefState = {};
      this.taps = [];
      this.beat = null;
      this.outroShown = false;
      this.scene = { index: 0, line: 0, max: 0 };
      this.acts = {};             // the opening's activities, by scene id (PROLOGUE §2.3): letters placed, copies made, codons read
      this.shownBeats = {};       // mid-run story beats already shown (def.runBeats; 1.2's milk arrival)
      this.echoIndex = 0;
      this.cards = [];
      this.runs = 0;
      this.run = null;
      this.record = null;
      this.monitorResult = null;
      this.goal = false;
      this.withoutGoal = false;
      this.demo = { done: false, cell: null, record: null, result: null };
      // Designer levels start from the level's starting design (1.7: the Commander's, LEVELS §5.10).
      this.design = def.designStart ? copy(def.designStart) : null;
      this.par = def.par ? parRunner(def, this.variant, o.makeCell) : null;
      this.onRunShown = false;
      this.epilogue = { startTick: null, done: false, started: false };
      // The watch phase (PROLOGUE §1.4): its cell is built on entering the phase and dropped after it.
      this.watch = freshWatch();
      this.watchCell = null;
      this.watchMon = null;
      this.result = null;
      this.code = null;
      this.flagEvidence = [];
      this.started = false;
    }

    get phase() { return this.phases[this.phaseIndex]; }
    has(p) { return this.phases.indexOf(p) >= 0; }
    /** A level string filled with the variant's words, and once the run has ended the run's own numbers (def.resultVars). */
    text(s) {
      if (this.monitorResult && this.def.resultVars) return K.fill(s, Object.assign({}, this.vars, this.def.resultVars(this.variant, this.monitorResult)));
      return K.fill(s, this.vars);
    }

    // --- telemetry --------------------------------------------------------------
    log(type, d, tick) {
      if (!this.tel) return;
      this.tel.setContext({ lv: this.def.id, att: this.attempt, run: this.runs || null });
      this.tel.log(type, d || {}, { tick: tick !== undefined ? tick : (this.run ? this.run.cell.tick : null) });
    }

    /** Starts a new attempt: level_start, then the first phase. */
    start() {
      if (this.started) return this;
      this.started = true;
      this.log('level_start', { variantSeed: this.variantSeed, content: this.def.version, variant: this.variant, attempt: this.attempt, override: this.override });
      this.ensureRun();          // run 1's cell exists from the start, paused at tick 0, behind the story and the predictions
      this.enter(0);
      return this;
    }

    enter(i) {
      this.phaseIndex = i;
      const p = this.phase;
      this.log('phase', { name: p });
      if (p === 'intro') this.beat = { name: 'intro', index: 0 };
      else if (p === 'scenes') this.scene = { index: 0, line: 0, max: 0 };
      else if (p === 'watch') this.startWatch();
      else if (p === 'run') {
        // A designer level's cell is built from the design the student ran (it applies at tick 0).
        if (this.has('design') && this.run && this.run.cell.tick === 0 && !this.run.endReason) this.replaceRunCell();
        this.ensureRun();
        const onRun = this.beatLines('onRun');
        if (onRun.length && !this.onRunShown) this.beat = { name: 'onRun', index: 0 };
        this.log('run_start', { speed: this.speedFn ? this.speedFn() : null });
      } else if (p === 'epilogue') {
        this.epilogue = { startTick: this.run ? this.run.cell.tick : 0, done: false, started: false };
      } else if (p === 'echo') {
        // The outro comes after the debrief, whether or not the goal was met (LEVELS §4.1): shown earlier,
        // its lines would answer the debrief questions for the student.
        this.echoIndex = 0;
        if (!this.outroShown && this.beatLines('outro').length) this.beat = { name: 'outro', index: 0 };
      } else if (p === 'complete') this.finish();
    }

    // --- gates (§4.1) -------------------------------------------------------------
    /** {ok: true} when Continue may move on, else {ok: false, reason}. */
    gate() {
      if (this.beat) {
        const n = this.beatLines(this.beat.name).length;
        return this.beat.index >= n - 1 ? { ok: true } : { ok: false, reason: 'story' };
      }
      switch (this.phase) {
        case 'scenes': {
          const scenes = this.def.scenes, s = this.scene;
          if (s.index < scenes.length - 1 || s.line < scenes[s.index].lines.length - 1) return { ok: false, reason: 'scenes' };
          return this.sceneSolved(s.index) ? { ok: true } : { ok: false, reason: 'question' };
        }
        case 'predict': case 'predict2': {
          const open = this.items().filter((it) => !it.expert && !(this.answers[it.id] && this.answers[it.id].locked));
          return open.length ? { ok: false, reason: 'predict', item: open[0].id } : { ok: true };
        }
        case 'demo': return this.demo.done ? { ok: true } : { ok: false, reason: 'demo' };
        case 'watch': return this.watch.done ? { ok: true } : { ok: false, reason: 'watch', item: (this.watchStep() || {}).id };
        case 'run': return this.run && this.run.endReason ? { ok: true } : { ok: false, reason: 'run' };
        // A designer level's result waits for its par run (worked out in idle frames), so the score never
        // has to finish it in one long frame (LEVELS §16).
        case 'result': return this.par && !this.par.done ? { ok: false, reason: 'par' } : { ok: true };
        case 'epilogue': return this.epilogue.done ? { ok: true } : { ok: false, reason: 'epilogue' };
        case 'debrief': {
          const open = this.def.debrief.filter((q) => !(this.debriefState[q.id] && this.debriefState[q.id].solved));
          return open.length ? { ok: false, reason: 'debrief', item: open[0].id } : { ok: true };
        }
        case 'echo': return this.echoIndex >= this.def.echo.screens.length - 1 ? { ok: true } : { ok: false, reason: 'echo' };
        case 'complete': return { ok: false, reason: 'complete' };
        default: return { ok: true };    // intro (after its beat), task, design
      }
    }
    canContinue() { return this.gate().ok; }

    /** Continue: closes a finished story beat, or moves to the next phase. */
    next() {
      const g = this.gate();
      if (!g.ok) return g;
      if (this.beat) {
        const name = this.beat.name;
        if (name === 'outro') this.outroShown = true;
        if (name === 'onRun') this.onRunShown = true;
        this.beat = null;
        if (name !== 'intro') return { ok: true, phase: this.phase };
      }
      const p = this.phase;
      if (p === 'predict' || p === 'predict2') {
        for (const it of this.items()) if (!this.answers[it.id]) this.skip(it.id);
      }
      // A level with no "Meanwhile, in you" (the opening) collects its cards as it completes.
      if (!this.has('echo') && this.phases[this.phaseIndex + 1] === 'complete') this.collectCards();
      if (p === 'echo') this.collectCards();
      if (p === 'design' && this.design) this.log('design_submit', { design: this.design });
      if (p === 'watch') this.dropWatch();
      this.enter(this.phaseIndex + 1);
      return { ok: true, phase: this.phase };
    }

    // --- story beats ----------------------------------------------------------------
    /** A beat's lines; the outro may be swapped for one in story.extra when the level's outroKey names it. */
    beatLines(name) {
      const def = this.def;
      // A level may drop a beat that would not be true of this run (1.7: LacI's line when the design deleted lacI).
      if (def.skipBeat && def.skipBeat(name, this.variant, this.design)) return [];
      if (name === 'outro' && def.outroKey) {
        const key = def.outroKey(this.variant, this.monitorResult || {}, this.goal);
        const alt = key && def.story.extra && def.story.extra[key];
        if (alt) return alt;
      }
      return def.story[name] || (def.story.extra && def.story.extra[name]) || [];
    }
    storyLine() {
      if (!this.beat) return null;
      const lines = this.beatLines(this.beat.name), l = lines[this.beat.index];
      return { beat: this.beat.name, index: this.beat.index, count: lines.length, last: this.beat.index >= lines.length - 1,
        who: l.who, text: this.text(l.text), denies: !!l.denies };
    }
    storyNext() {
      if (!this.beat) return false;
      const n = this.beatLines(this.beat.name).length;
      if (this.beat.index >= n - 1) return false;
      this.beat.index++;
      this.log('story', { beat: this.beat.name, line: this.beat.index, action: 'next' });
      return true;
    }
    storySkip() {
      if (!this.beat) return false;
      this.beat.index = this.beatLines(this.beat.name).length - 1;
      this.log('story', { beat: this.beat.name, line: this.beat.index, action: 'skip' });
      return true;
    }
    /** Replays a beat (the level menu's "Replay the story"); it does not change the phase. */
    replayLines(name) { return this.beatLines(name).map((l) => ({ who: l.who, text: this.text(l.text), denies: !!l.denies })); }

    // --- the opening's scenes (PROLOGUE §2.3, §2.4) --------------------------------------------
    sceneSolved(i) {
      const sc = this.def.scenes[i], q = sc.question;
      // A scene's guess ("Guess, then see") must be seen through before the scene moves on; it is never marked.
      if (sc.guess && !this.watch.guesses[sc.guess.id]) return false;
      // An activity (letters, copies, codons, a run) must be finished: nothing moves on because time passed.
      if (sc.activity && !this.actDone(sc)) return false;
      return !q || !!(this.debriefState[q] && this.debriefState[q].solved);
    }
    sceneInfo() {
      if (this.phase !== 'scenes') return null;
      const s = this.scene, sc = this.def.scenes[s.index], l = sc.lines[s.line];
      const lastLine = s.line >= sc.lines.length - 1;
      const g = lastLine && sc.guess ? sc.guess : null, got = g ? this.watch.guesses[g.id] : null;
      return {
        index: s.index, count: this.def.scenes.length, scene: sc, line: s.line, lines: sc.lines.length,
        who: l.who, text: this.text(l.text), denies: !!l.denies, lastLine, max: s.max,
        last: lastLine && s.index >= this.def.scenes.length - 1,
        question: lastLine && sc.question ? this.question(sc.question) : null,
        // The scene's guess on its last line: options in this attempt's order, the pick, and whether it was seen.
        guess: g ? { id: g.id, prompt: this.text(g.prompt), picked: this.watch.picks[g.id] === undefined ? null : this.watch.picks[g.id], seen: !!got,
          options: this.optionOrder(g.id).map((i) => ({ index: i, t: this.text(g.options[i].t) })) } : null,
        // The scene's activity (on its last line, once any guess is seen): its stage, counts and the last feedback.
        activity: sc.activity ? this.activityInfo(sc, lastLine && (!g || !!got)) : null,
        // "What happened" for the guesses due on this scene (showAt, else their own scene), once seen.
        feedback: lastLine ? this.sceneFeedback(sc.id) : [],
        solved: this.sceneSolved(s.index),
        // Back and the zoom ladder: a rung may step back to the rung before it.
        canBack: !!sc.rung && s.index > 0 && !!this.def.scenes[s.index - 1].rung,
      };
    }
    sceneFeedback(id) {
      const out = [];
      for (const sc of this.def.scenes) {
        const g = sc.guess, got = g && this.watch.guesses[g.id];
        if (!got || (g.showAt || sc.id) !== id) continue;
        const o = g.options[got.option];
        out.push({ id: g.id, prompt: this.text(g.prompt), picked: this.text(o.t), fb: this.text(o.fb), cause: got.cause });
      }
      return out;
    }
    /** A scene's guess: pick (changeable), then "See what happens" (logged, never marked). */
    scenePick(gid, option) {
      if (this.phase !== 'scenes') return false;
      const sc = this.def.scenes[this.scene.index];
      if (!sc.guess || sc.guess.id !== gid || this.watch.guesses[gid] || this.scene.line < sc.lines.length - 1) return false;
      const opt = this.resolveOption(sc.guess, option);
      if (!sc.guess.options[opt]) return false;
      this.watch.picks[gid] = opt;
      return true;
    }
    sceneSee() {
      if (this.phase !== 'scenes') return { ok: false, reason: 'phase' };
      const sc = this.def.scenes[this.scene.index], g = sc.guess;
      if (!g || this.watch.guesses[g.id]) return { ok: false, reason: 'no guess' };
      const opt = this.watch.picks[g.id];
      if (opt === undefined) return { ok: false, reason: 'no guess' };
      const o = g.options[opt];
      this.watch.guesses[g.id] = { option: opt, mc: o.mc || null, cause: o.cause === true, step: sc.id };
      delete this.watch.picks[g.id];
      this.log('guess', { id: g.id, option: opt, cause: o.cause === true, step: sc.id });
      return { ok: true };
    }
    /** Next inside the scenes: the next line, then the next scene once its guess, activity and question are done. */
    sceneNext() {
      if (this.phase !== 'scenes') return { ok: false, reason: 'phase' };
      const s = this.scene, sc = this.def.scenes[s.index];
      if (s.line < sc.lines.length - 1) { s.line++; }
      else if (sc.guess && !this.watch.guesses[sc.guess.id]) return { ok: false, reason: 'guess' };
      else if (sc.activity && !this.actDone(sc)) return { ok: false, reason: 'activity' };
      else if (!this.sceneSolved(s.index)) return { ok: false, reason: 'question' };
      else if (s.index < this.def.scenes.length - 1) { s.index++; s.line = 0; if (s.index > s.max) s.max = s.index; }
      else return { ok: false, reason: 'end' };
      this.log('step', { id: this.def.scenes[s.index].id, action: 'shown' });
      this.log('story', { beat: 'scene:' + this.def.scenes[s.index].id, line: s.line, action: 'next' });
      return { ok: true };
    }
    /** Skip: forward to the next scene whose guess, activity or question is not done, or to the last line. */
    sceneSkip() {
      if (this.phase !== 'scenes') return false;
      const s = this.scene, scenes = this.def.scenes;
      for (;;) {
        const sc = scenes[s.index];
        s.line = sc.lines.length - 1;
        if (!this.sceneSolved(s.index) || s.index >= scenes.length - 1) break;
        s.index++;
        if (s.index > s.max) s.max = s.index;
      }
      this.log('story', { beat: 'scene:' + scenes[s.index].id, line: s.line, action: 'skip' });
      return true;
    }
    /** Back one rung of the zoom ladder (a rung only goes back to the rung before it), shown on its last line. */
    sceneBack() {
      if (this.phase !== 'scenes') return { ok: false, reason: 'phase' };
      const s = this.scene, scenes = this.def.scenes;
      if (!scenes[s.index].rung || s.index === 0 || !scenes[s.index - 1].rung) return { ok: false, reason: 'first' };
      s.index--;
      s.line = scenes[s.index].lines.length - 1;
      this.log('story', { beat: 'scene:' + scenes[s.index].id, line: s.line, action: 'back' });
      return { ok: true };
    }
    /** Jumps to a rung already visited (the ladder rail's "Zoom levels" sheet); unvisited rungs keep the story's order. */
    sceneJump(index) {
      if (this.phase !== 'scenes') return { ok: false, reason: 'phase' };
      const s = this.scene, scenes = this.def.scenes, sc = scenes[index];
      if (!sc || !sc.rung || index > s.max || !scenes[s.index].rung) return { ok: false, reason: 'not visited' };
      s.index = index;
      s.line = sc.lines.length - 1;
      this.log('story', { beat: 'scene:' + sc.id, line: s.line, action: 'jump' });
      return { ok: true };
    }

    // --- the opening's activities (PROLOGUE §2.3.3–§2.3.5) ------------------------------------------
    /**
     * Activity kinds (a scene's `activity`; every expected value is computed by BTC.seq in the level file):
     *   copy   {template, expect, total, words}: six letters picked on a keypad (the right one always goes in),
     *          then "Let it run" copies the rest (progress in letters) up to total
     *   copies {n, total}: "Copy again" starts one more copy; copies advance together; done after n
     *   read   {codons, rows, total, words}: each codon decoded on the small table, then "Let it run" reads to the stop
     *   show   {total}: a short picture that plays by itself (seconds), e.g. the copy leaving through a pore
     * The view advances runs with sceneAct({advance: amount}) from its own clock; the gate is the state reached.
     */
    actState(sc) {
      return this.acts[sc.id] || (this.acts[sc.id] = { i: 0, k: 0, made: 0, runs: [], started: false, last: null, hint: null, tries: 0 });
    }
    actDone(sc) {
      const a = sc.activity, st = this.acts[sc.id];
      if (!a || a.kind === 'explore') return true;
      if (!st) return false;
      if (a.kind === 'copies') return st.made >= a.n;
      if (a.kind === 'copy') return st.i >= a.expect.length && st.k >= a.total;
      if (a.kind === 'read') return st.i >= a.codons.length && st.k >= a.total;
      return st.k >= a.total;
    }
    activityInfo(sc, open) {
      const a = sc.activity, st = this.actState(sc);
      let stage = 'done';
      if (!this.actDone(sc)) {
        if (a.kind === 'copy') stage = st.i < a.expect.length ? 'fill' : 'run';
        else if (a.kind === 'read') stage = st.i < a.codons.length ? 'decode' : 'run';
        else stage = 'run';
      }
      return { kind: a.kind, open: !!open, stage, done: this.actDone(sc), i: st.i, k: st.k, made: st.made, runs: st.runs.slice(),
        started: st.started, total: a.total, n: a.n || (a.expect ? a.expect.length : a.codons ? a.codons.length : 0),
        last: st.last ? Object.assign({}, st.last) : null, hint: st.hint === null ? null : st.hint, spec: a };
    }
    /**
     * Does the current scene's activity: {pick: letter} (copy), {row: index} (read), {start: true} ("Let it run" or
     * "Copy again"), {advance: amount} (the view's clock: letters, codons or seconds). Returns {ok, …} or {ok: false, reason}.
     * Picks are logged (telemetry 'activity'), never marked wrong: a copy letter always goes in right, with a sentence.
     */
    sceneAct(action) {
      if (this.phase !== 'scenes') return { ok: false, reason: 'phase' };
      const sc = this.def.scenes[this.scene.index], a = sc.activity;
      if (!a) return { ok: false, reason: 'no activity' };
      const info = this.activityInfo(sc, true);
      if (this.scene.line < sc.lines.length - 1 || (sc.guess && !this.watch.guesses[sc.guess.id])) return { ok: false, reason: 'not yet' };
      const st = this.actState(sc), x = action || {};
      if (a.kind === 'copy' && info.stage === 'fill' && typeof x.pick === 'string') {
        const want = a.expect[st.i], dna = a.template[st.i], match = x.pick === want;
        let fb = '';
        if (!match) fb = dna === 'A' && x.pick === 'T' ? a.words.noT : K.fill(a.words.other, { dna, rna: want });
        st.last = { i: st.i, value: x.pick, expected: want, match, dna, fb };
        this.log('activity', { id: sc.id, i: st.i, value: x.pick, expected: want, match });
        st.i++; st.k = st.i;
        return { ok: true, match, fb };
      }
      if (a.kind === 'read' && info.stage === 'decode' && typeof x.row === 'number') {
        const row = a.rows[x.row], want = a.codons[st.i];
        if (!row) return { ok: false, reason: 'no such row' };
        const match = row.codon === want;
        const right = a.rows.findIndex((r) => r.codon === want);
        st.tries++;
        this.log('activity', { id: sc.id, i: st.i, value: row.codon, expected: want, match });
        if (match) { st.last = { i: st.i, value: row.codon, expected: want, match: true, fb: '' }; st.hint = null; st.i++; st.k = st.i; }
        else {
          const r = a.rows[right];
          st.last = { i: st.i, value: row.codon, expected: want, match: false, fb: K.fill(a.words.wrong, { codon: want, three: r.three, name: r.name }) };
          st.hint = right;
        }
        return { ok: true, match, fb: st.last.fb };
      }
      if (x.start) {
        if (a.kind === 'copies') {
          if (st.made + st.runs.length >= a.n + 8) return { ok: false, reason: 'busy' };
          st.runs.push(0);
          this.log('activity', { id: sc.id, i: st.made + st.runs.length - 1, value: 'copy', expected: 'copy', match: true });
          return { ok: true };
        }
        if (info.stage !== 'run' || st.started) return { ok: false, reason: 'not now' };
        st.started = true;
        return { ok: true };
      }
      if (typeof x.advance === 'number' && x.advance > 0) {
        if (a.kind === 'copies') {
          const before = st.made;
          for (let j = 0; j < st.runs.length; j++) st.runs[j] = Math.min(a.total, st.runs[j] + x.advance);
          while (st.runs.length && st.runs[0] >= a.total) { st.runs.shift(); st.made++; }
          return { ok: true, finished: st.made - before };
        }
        if ((a.kind === 'copy' || a.kind === 'read') && !st.started) return { ok: false, reason: 'not started' };
        if (a.kind === 'show') st.started = true;
        st.k = Math.min(a.total, st.k + x.advance);
        return { ok: true, done: st.k >= a.total };
      }
      return { ok: false, reason: 'not now' };
    }

    // --- predictions (§4.3) ---------------------------------------------------------
    items(phase) {
      const p = phase || this.phase;
      return this.def.predictions.filter((it) => (it.phase || 'predict') === p);
    }
    /** The first item of this phase that is neither locked nor skipped, or null. */
    currentItem() {
      for (const it of this.items()) if (!this.answers[it.id]) return it;
      return null;
    }
    item(id) { return this.def.predictions.find((x) => x.id === id) || null; }
    question(id) {
      // A guess of the watch or of an opening scene (its options are shown in this attempt's order too).
      const w = this.def.watch || this.def.scenes ? W.guesses(this.def)[id] : null;
      return this.def.predictions.find((x) => x.id === id) || this.def.debrief.find((x) => x.id === id) || (w ? w.guess : null);
    }

    /** Display order of a question's options for this attempt (canonical indices). */
    optionOrder(id) {
      if (!this.orders[id]) {
        const q = this.question(id);
        const idx = q && q.options ? q.options.map((o, i) => i) : [];
        this.orders[id] = K.rng(this.variantSeed, 'q:' + id).shuffle(idx);
      }
      return this.orders[id];
    }

    resolveOption(q, v) {
      if (v === 'ok') return q.options.findIndex((o) => o.ok === true);
      if (v === 'cause') return q.options.findIndex((o) => o.cause === true);
      return v;
    }

    select(id, value) {
      const it = this.item(id);
      if (!it || (it.phase || 'predict') !== this.phase || (this.answers[id] && this.answers[id].locked)) return false;
      this.selected[id] = it.kind === 'choice' ? this.resolveOption(it, value) : value;
      return true;
    }

    /** Locks an item (one locked answer per attempt; no feedback until the result). */
    lock(id, value) {
      const it = this.item(id);
      if (!it) return { ok: false, reason: 'unknown item' };
      if ((it.phase || 'predict') !== this.phase) return { ok: false, reason: 'phase' };
      if (this.answers[id]) return { ok: false, reason: 'locked' };
      const v = value === undefined ? this.selected[id] : value;
      if (v === undefined || v === null) return { ok: false, reason: 'no answer' };
      const a = answerRecord(it, v, this.variant, { demo: this.demo.result });
      if (a.error) return { ok: false, reason: a.error };
      this.answers[id] = a;
      delete this.selected[id];
      const d = { id, kind: it.kind };
      if (it.kind === 'sketch') {
        d.points = Array.isArray(a.value) ? a.value.filter(Boolean).length : 0;
        if (a.features) { d.features = a.features; d.P = a.P; }
      } else if (it.kind === 'table') { d.value = a.value; d.P = a.P; d.correct = a.correct; }
      else { d.value = a.value; d.correct = a.correct === undefined ? null : a.correct; }
      this.log('predict', d);
      return { ok: true };
    }

    skip(id) {
      const it = this.item(id);
      if (!it || !it.expert || this.answers[id]) return false;
      this.answers[id] = { locked: false, skipped: true, value: null };
      this.log('predict', { id, kind: it.kind, skipped: true });
      return true;
    }

    // --- debrief and scene questions (§4.3): retries, the first tap counts ------------
    tap(qid, option) {
      const q = this.question(qid);
      if (!q || !q.options) return null;
      const opt = this.resolveOption(q, option);
      const o = q.options[opt];
      if (!o) return null;
      const st = this.debriefState[qid] || (this.debriefState[qid] = { tries: [], solved: false, first: null, firstCorrect: false, firstMc: null });
      if (st.solved || st.tries.indexOf(opt) >= 0) return { correct: o.ok === true, fb: o.fb, mc: o.mc || null, repeat: true };
      st.tries.push(opt);
      const correct = o.ok === true;
      if (st.tries.length === 1) { st.first = opt; st.firstCorrect = correct; st.firstMc = correct ? null : (o.mc || null); }
      if (correct) st.solved = true;
      this.taps.push({ id: qid, option: opt, try: st.tries.length });
      this.log('debrief', { id: qid, option: opt, correct, try: st.tries.length });
      return { correct, fb: o.fb, mc: o.mc || null };
    }
    tried(qid) { return this.debriefState[qid] ? this.debriefState[qid].tries.slice() : []; }

    // --- the run ------------------------------------------------------------------
    extra() { return { deviceSeed: this.deviceSeed, design: this.design }; }

    /** The cell of the current run, built paused at tick 0 when the level opens (run 1). */
    ensureRun() {
      if (!this.run && this.has('run')) this.newRun();
      return this.run ? this.run.cell : null;
    }

    newRun() {
      const def = this.def;
      const cell = this.makeCell(def.config(this.variant, 'task', this.extra()));
      this.runs++;
      this.attachRun(cell, null);
      return cell;
    }

    /** The same run with a fresh cell from the current config (1.7: the design was edited before Run). */
    replaceRunCell() {
      if (this.run) this.run.cell.detachRecorder(this.run.recorder);
      this.run = null;
      const cell = this.makeCell(this.def.config(this.variant, 'task', this.extra()));
      this.attachRun(cell, null);
      return cell;
    }

    // --- the par run (1.7) --------------------------------------------------------------
    hasPar() { return !!this.par; }
    /** Runs the par run for up to ms of wall time (Infinity: to the end); true when it is done. */
    parStep(ms) { return this.par ? this.par.step(ms === undefined ? Infinity : ms) : true; }
    parResult() { return this.par && this.par.done ? this.par.snapshot().result : null; }

    attachRun(cell, saved) {
      const def = this.def;
      const monitor = def.monitor(this.variant, { dt: cell.dt, K, variant: this.variant, design: this.design });
      if (saved && saved.monitor !== undefined && monitor.restore) monitor.restore(copy(saved.monitor));
      else if (!saved && monitor.start) monitor.start(cell);
      const run = {
        cell, monitor, logIdx: saved ? saved.logIdx : 0,
        endReason: saved ? saved.endReason : null, endTick: saved ? saved.endTick : null,
      };
      const runner = this;
      const feed = monitorFeed(monitor, run, (e) => {
        const d = { seq: e.seq, type: e.type, args: copy(e.args) || {}, ok: !e.rejected };
        if (e.rejected) d.code = e.rejected;
        runner.log('cmd', d, e.tick);
      }, (reason, tick) => runner.endRun(reason, tick));
      run.recorder = {
        onTick(c) {
          if (runner.run !== run) return;
          feed.onTick(c);
          // A mid-run story beat (1.2: the milk arrives) is shown once, when the level's condition holds; the run waits for it.
          if (runner.phase === 'run' && !runner.beat && def.runBeats && !run.endReason) runner.checkRunBeats(run);
          if (runner.phase === 'epilogue' && runner.epilogue.started && !runner.epilogue.done && def.epilogue &&
            c.tick - runner.epilogue.startTick >= def.epilogue.durationTicks) runner.epilogue.done = true;
        },
      };
      cell.attachRecorder(run.recorder);
      this.run = run;
    }

    /** Opens the first mid-run beat (def.runBeats: [{name, when(monitorSave)}]) not shown yet whose condition holds. */
    checkRunBeats(run) {
      const st = run.monitor.save ? run.monitor.save() : null;
      for (const b of this.def.runBeats) {
        if (this.shownBeats[b.name] || !b.when(st)) continue;
        this.shownBeats[b.name] = true;
        if (!this.beatLines(b.name).length) continue;
        this.beat = { name: b.name, index: 0, mid: true };
        this.log('story', { beat: b.name, line: 0, action: 'shown' });
        return true;
      }
      return false;
    }

    endRun(reason, tick) {
      const run = this.run;
      run.endReason = reason; run.endTick = tick;
      this.record = run.cell.runRecord();
      this.monitorResult = copy(run.monitor.result());
      this.goal = !!(this.monitorResult && this.monitorResult.goal);
      this.log('run_end', { reason, ticks: tick }, tick);
      if (this.goal) this.log('goal', {}, tick);
    }

    /** True when the app must not step the cell any further (the run has ended, or the epilogue is done). */
    halted() {
      if (this.phase === 'watch') return this.watchHalted();
      if (this.phase === 'demo') return !this.demo.cell || this.demo.done || this.demo.cell.tick >= this.def.demo.durationTicks;
      if (!this.run) return true;
      if (this.phase === 'epilogue') return !this.epilogue.started || this.epilogue.done;
      if (this.phase === 'run') return !!this.run.endReason || !!(this.beat && this.beat.mid);
      return true;
    }
    /** True when time may run for the cell on screen. */
    canRun() { return this.phase === 'demo' || this.phase === 'watch' ? !this.halted() : !!this.run && !this.halted(); }

    /**
     * The epilogue (1.4) starts when the student acts (taps "Switch LacY off"): its watching time
     * counts from here. The headless player starts it on entry.
     */
    startEpilogue() {
      if (this.phase !== 'epilogue' || this.epilogue.started) return false;
      this.epilogue.started = true;
      this.epilogue.startTick = this.run ? this.run.cell.tick : 0;
      return true;
    }

    /**
     * Try again after a failed run: same variant and seed, a fresh cell, predictions kept. A designer
     * level (1.7) goes back to the DNA editor, since the run itself has no controls: running the same
     * design again would only repeat the same run.
     */
    retry() {
      if (this.phase !== 'result' || this.goal) return { ok: false, reason: 'phase' };
      if (this.run) this.run.cell.detachRecorder(this.run.recorder);
      this.run = null; this.record = null; this.monitorResult = null; this.goal = false;
      this.newRun();
      this.enter(this.phases.indexOf(this.has('design') ? 'design' : 'run'));
      return { ok: true, phase: this.phase };
    }

    /** After a failed run the student may go on without the goal (G0). */
    continueWithoutGoal() {
      if (this.phase !== 'result' || this.goal) return { ok: false, reason: 'phase' };
      this.withoutGoal = true;
      return this.next();
    }

    /** Stops the run for good (leaving the level mid-run is saved instead; this is for tools). */
    runState() {
      if (!this.run) return null;
      return { tick: this.run.cell.tick, ended: this.run.endReason, monitor: this.run.monitor.save ? this.run.monitor.save() : null };
    }

    // --- demo (1.2) and design (1.7) --------------------------------------------------
    startDemo() {
      if (this.demo.done && this.demo.cell) return this.demo.cell;     // a finished demo is not played again
      const cell = this.makeCell(this.def.config(this.variant, 'demo', this.extra()));
      const mon = this.def.demo && this.def.demo.monitor ? this.def.demo.monitor(this.variant) : null;
      this.demo = { done: false, cell, record: null, result: null, monitor: mon };
      if (mon) {
        if (mon.start) mon.start(cell);
        cell.attachRecorder({ onTick: (c) => mon.onTick(c) });
      }
      return cell;
    }
    /** The app or the headless player calls this after stepping the demo cell. */
    checkDemo() {
      const d = this.demo;
      if (!d.cell || d.done) return d.done;
      if (d.cell.tick >= this.def.demo.durationTicks) {
        d.done = true;
        d.record = d.cell.runRecord();
        d.result = this.def.demoResult ? copy(this.def.demoResult(this.variant, d.cell, d.monitor ? d.monitor.result() : null)) : null;
        // Expert numbers that are judged against the demo (1.2's copies per mRNA) are marked now.
        for (const it of this.def.predictions) {
          const a = this.answers[it.id];
          if (it.kind === 'number' && a && a.locked) Object.assign(a, answerRecord(it, a.value, this.variant, { demo: d.result }));
        }
        if (d.result && typeof d.result.ppm === 'number') this.log('demo_end', { ppm: d.result.ppm, final: d.result.final });
      }
      return d.done;
    }
    setDesign(design) {
      if (this.phase !== 'design') return false;
      this.design = copy(design);
      return true;
    }

    // --- watch (PROLOGUE §1.4, §2.4.3) ------------------------------------------------------
    watchSteps() { return (this.def.watch && this.def.watch.steps) || []; }
    watchStep() { return this.phase === 'watch' || this.watchCell ? this.watchSteps()[this.watch.index] || null : null; }

    /** The watch cell (role 'watch'), built from the level's config, with the step monitor attached. */
    startWatch() {
      if (this.watchCell) return this.watchCell;
      const cell = this.makeCell(this.def.config(this.variant, 'watch', this.extra()));
      this.attachWatch(cell, null);
      const guesses = this.watch.guesses;           // a restarted watch keeps nothing but what is already locked
      this.watch = freshWatch();
      this.watch.guesses = guesses;
      this.enterStep(0);
      return cell;
    }

    attachWatch(cell, saved) {
      const def = this.def;
      const mon = def.watch && def.watch.monitor ? def.watch.monitor(this.variant, { dt: cell.dt, K, variant: this.variant }) : null;
      if (mon) {
        if (saved && saved.monitor !== undefined && saved.monitor !== null && mon.restore) mon.restore(copy(saved.monitor));
        else if (!saved && mon.start) mon.start(cell);
      }
      this.watchCell = cell;
      this.watchMon = mon;
      const runner = this;
      this.watchRec = { onTick(c) { if (runner.watchCell === c && runner.phase === 'watch') runner.watchTick(c); } };
      cell.attachRecorder(this.watchRec);
    }

    /** Leaving the watch phase: the watch cell is dropped (its guesses stay, for flags and the run file). */
    dropWatch() {
      if (this.watchCell && this.watchRec) this.watchCell.detachRecorder(this.watchRec);
      this.watchCell = null; this.watchMon = null; this.watchRec = null;
      this.watch.hold = false;
    }

    /** The default gene of the watch's conditions (def.watch.gene), unless a condition names its own. */
    condParams(c) { return Object.assign({ gene: this.def.watch && this.def.watch.gene }, c); }
    testCond(c, view, mem, extra) {
      const fn = W.testFor(this.def, c.test);
      return !!fn(view, this.condParams(c), mem, Object.assign({ watchedId: this.watch.watchedId, variant: this.variant }, extra || {}));
    }
    /** A gene's level as the student has set it: a switch still waiting to apply counts (for notes, not gates). */
    levelOf(id) {
      let level = null;
      for (const e of (this.watchCell && this.watchCell.pending) || []) {
        if (e.source === 'user' && e.type === 'setPromoter' && e.args && e.args.gene === id) level = e.args.level;
      }
      if (level !== null) return level;
      const g = this.watchCell ? this.watchCell.observe().geneById[id] : null;
      return g ? g.level : null;
    }

    /** After every tick of the watch cell: the level's watch monitor, then the condition being waited on. */
    watchTick(c) {
      const w = this.watch, s = this.watchStep();
      if (this.watchMon) this.watchMon.onTick(c, { watchedId: w.watchedId, step: s ? s.id : null, stage: w.stage });
      if (!s || (w.stage !== 'until' && w.stage !== 'wait')) return;
      const cond = w.stage === 'until' ? s.until : s.gate;
      if (this.testCond(cond, c.observe(), w.mem)) this.condMet(cond, c.tick);
    }

    /** A condition holds: the step is shown (until) or its gate opens (state); a pausing one holds the cell here. */
    condMet(cond, tick) {
      const w = this.watch, s = this.watchStep();
      if (cond.watch && this.watchCell) {
        const g = this.watchCell.observe().geneById[this.condParams(cond).gene];
        w.watchedId = g && g.mRNA > 0 ? g.mRNAIds[0] : null;
      }
      const until = w.stage === 'until';
      w.gateTick[s.id + (until ? ':until' : '')] = tick;
      if (cond.pause !== false) w.hold = true;
      this.log('step', { id: s.id, action: 'gate', gate: cond.test, tick }, tick);
      w.mem = {};
      if (until) this.showLines();
      else this.openGate();
    }

    enterStep(i) {
      const w = this.watch, steps = this.watchSteps();
      w.hold = false; w.open = false; w.line = 0; w.mem = {};
      if (i >= steps.length) { w.done = true; w.stage = 'done'; w.index = steps.length; return; }
      w.index = i;
      // Commands from here on may do this step's act (a student who switches the gene on while reading).
      w.stepSeq = w.commands.length ? w.commands[w.commands.length - 1].seq + 1 : 0;
      const s = steps[i];
      if (s.until) {
        w.stage = 'until';
        // A condition that already holds opens at once (tested on a scratch memory, so held-for-n tests start afresh).
        if (this.watchCell && this.testCond(s.until, this.watchCell.observe(), {})) this.condMet(s.until, this.watchCell.tick);
      } else this.showLines();
    }
    showLines() {
      const w = this.watch, s = this.watchStep();
      w.stage = 'lines'; w.line = 0;
      this.log('step', { id: s.id, action: 'shown' });
      this.onLine();
    }
    /**
     * On the step's last line the step goes on by itself unless a guess comes first (Next opens it): an act waits
     * for the student's switch, a state gate for the model, and a tap gate is open at once, its cause and any
     * guess feedback shown with that line, so its Next completes the step (one tap, not two).
     */
    onLine() {
      const w = this.watch, s = this.watchStep();
      if (w.line < s.lines.length - 1) return;
      if (s.guess && !w.guesses[s.guess.id]) return;
      this.afterGuess();
    }
    afterLines() {
      const w = this.watch, s = this.watchStep();
      if (s.guess && !w.guesses[s.guess.id]) { w.stage = 'guess'; return; }
      this.afterGuess();
    }
    afterGuess() {
      const w = this.watch, s = this.watchStep();
      if (s.gate.kind === 'guess') return this.openGate();
      if (s.act && !w.acted[s.id]) {
        w.stage = 'act';
        w.hold = false;                 // an act may need the cell to run afterwards: a paused 'until' holds only its lines
        if (this.actAlreadyDone(s)) this.acted(s);
        return;
      }
      this.gateStage();
    }
    gateStage() {
      const w = this.watch, s = this.watchStep(), g = s.gate;
      if (g.kind === 'state') {
        w.stage = 'wait'; w.mem = {};
        w.hold = false;                 // waiting on the model: the cell must be able to run
        if (this.watchCell && this.testCond(g, this.watchCell.observe(), {})) this.condMet(g, this.watchCell.tick);
        return;
      }
      this.openGate();
    }
    /** The gate is open: the cause and any guess feedback due here are shown, and Next moves on (a bare act or guess gate moves on at once). */
    openGate() {
      const w = this.watch, s = this.watchStep();
      w.open = true;
      if (s.gate.kind === 'tap' || s.gate.kind === 'state' || s.cause || this.feedbackAt(s.id).length) { w.stage = 'tap'; return; }
      this.completeStep();
    }
    completeStep() {
      const s = this.watchStep();
      this.log('step', { id: s.id, action: 'done' });
      this.enterStep(this.watch.index + 1);
    }

    /** The act of a step is done by what the student already did: a matching command since the step began, or the gene already set. */
    actAlreadyDone(s) {
      const a = s.act;
      if (!a || a.kind !== 'command' || !this.watchCell) return false;
      const since = this.watch.stepSeq || 0;
      if (this.watch.commands.some((c) => c.seq >= since && W.matches(a.expect, c.cmd))) return true;
      if (a.expect.type !== 'setPromoter') return false;
      let level = null;
      for (const e of this.watchCell.pending || []) if (e.source === 'user' && e.type === 'setPromoter' && e.args && e.args.gene === a.expect.gene) level = e.args.level;
      if (level === null) { const g = this.watchCell.observe().geneById[a.expect.gene]; level = g ? g.level : null; }
      return W.satisfiedBy(a.expect, level);
    }
    acted(s) {
      this.watch.acted[s.id] = true;
      this.log('step', { id: s.id, action: 'gate', gate: 'act' });
      if (s.gate.kind === 'act') this.openGate();
      else this.gateStage();
    }

    /** Next: the step's next line, past its lines, or on past an opened gate. */
    watchNext() {
      if (this.phase !== 'watch' || this.watch.done) return { ok: false, reason: 'phase' };
      const w = this.watch, s = this.watchStep();
      if (w.stage === 'lines') {
        if (w.line < s.lines.length - 1) { w.line++; this.onLine(); return { ok: true }; }
        this.afterLines();
        return { ok: true };
      }
      if (w.stage === 'tap') { this.completeStep(); return { ok: true }; }
      return { ok: false, reason: w.stage };
    }
    /** A guess may be changed until "See what happens" (option: a canonical index or 'cause'). */
    watchPick(gid, option) {
      const w = this.watch, s = this.watchStep();
      if (this.phase !== 'watch' || w.stage !== 'guess' || !s.guess || s.guess.id !== gid) return false;
      const opt = this.resolveOption(s.guess, option);
      if (!s.guess.options[opt]) return false;
      w.picks[gid] = opt;
      return true;
    }
    /** "See what happens": the guess is kept (logged, never marked), and the step goes on to its show. */
    watchSee() {
      const w = this.watch, s = this.watchStep();
      if (this.phase !== 'watch' || w.stage !== 'guess') return { ok: false, reason: 'phase' };
      const gid = s.guess.id, opt = w.picks[gid];
      if (opt === undefined) return { ok: false, reason: 'no guess' };
      const o = s.guess.options[opt];
      w.guesses[gid] = { option: opt, mc: o.mc || null, cause: o.cause === true, step: s.id };
      delete w.picks[gid];
      this.log('guess', { id: gid, option: opt, cause: o.cause === true, step: s.id });
      this.afterGuess();
      return { ok: true };
    }
    /** The app reports every command the student sent on the watch cell (and its result); a matching one does the act. */
    watchCommand(cmd, result) {
      if (this.phase !== 'watch' || !result || !result.ok) return false;
      const w = this.watch;
      w.commands.push({ seq: result.seq, cmd: copy(cmd) });
      if (w.commands.length > 64) w.commands.shift();
      const s = this.watchStep();
      if (w.stage === 'act' && s.act && s.act.kind === 'command' && W.matches(s.act.expect, cmd)) { this.acted(s); return true; }
      return false;
    }
    /** The app reports a zoom change; a step whose act is that zoom is done. */
    watchZoom(level) {
      const w = this.watch, s = this.watchStep();
      if (this.phase !== 'watch' || w.stage !== 'act' || !s.act || s.act.kind !== 'zoom' || s.act.to !== level) return false;
      this.acted(s);
      return true;
    }
    watchHalted() {
      const w = this.watch;
      if (!this.watchCell || w.done) return true;
      return w.stage === 'guess' || !!w.hold;
    }
    /** Template values for watch text: the variant's, then the watch monitor's ({n}, {t}, {k}, {a} …). */
    watchVars() {
      return Object.assign({}, this.vars, this.watchMon && this.watchMon.vars ? this.watchMon.vars() : {});
    }
    /** "What happened" for the guesses whose feedback is due at this step (showAt, else their own step). */
    feedbackAt(stepId) {
      const out = [], vars = this.watchVars(), fill = (t) => K.fill(t, vars);
      for (const st of this.watchSteps()) {
        const g = st.guess;
        if (!g || (g.showAt || st.id) !== stepId) continue;
        const got = this.watch.guesses[g.id];
        if (!got) continue;
        const o = g.options[got.option];
        out.push({ id: g.id, prompt: fill(g.prompt), picked: fill(o.t), fb: fill(o.fb), cause: got.cause });
      }
      return out;
    }
    /** What the screen shows for the watch step now (null outside the phase). */
    watchInfo() {
      if (this.phase !== 'watch') return null;
      const w = this.watch, steps = this.watchSteps();
      if (w.done) return { done: true, index: steps.length, count: steps.length, stage: 'done', last: true };
      const s = steps[w.index], vars = this.watchVars(), fill = (t) => K.fill(t, vars);
      const l = s.lines[Math.min(w.line, s.lines.length - 1)];
      const info = {
        done: false, id: s.id, index: w.index, count: steps.length, last: w.index >= steps.length - 1, stage: w.stage,
        line: w.line, lines: s.lines.length, lastLine: w.line >= s.lines.length - 1, who: l.who, text: fill(l.text),
        point: s.point || null, hold: !!w.hold, waiting: w.stage === 'until' || w.stage === 'wait',
        guess: null, act: w.stage === 'act' ? copy(s.act) : null,
        cause: w.open && s.cause ? fill(s.cause) : null, feedback: w.open ? this.feedbackAt(s.id) : [],
        note: null, offer: s.offer ? copy(s.offer) : null, offerSpeed: s.offerSpeed || null, gate: s.gate.kind,
        // Readouts this step's own line explains (P2's H2, H4, H9): the tiered screen does not introduce them again.
        introduces: s.introduces ? s.introduces.slice() : null,
      };
      if (w.stage === 'guess') {
        const g = s.guess;
        info.guess = { id: g.id, prompt: fill(g.prompt), picked: w.picks[g.id] === undefined ? null : w.picks[g.id],
          options: this.optionOrder(g.id).map((i) => ({ index: i, t: fill(g.options[i].t) })) };
      }
      // Honest help while the step waits: the first of its notes whose condition holds now.
      if ((info.waiting || w.stage === 'act') && s.notes && this.watchCell) {
        const view = this.watchCell.observe();
        for (const n of s.notes) if (this.testCond(n, view, {}, { levelOf: (id) => this.levelOf(id) })) { info.note = fill(n.text); break; }
      }
      return info;
    }

    // --- echo ---------------------------------------------------------------------------
    echoScreen() {
      if (this.phase !== 'echo' || this.beat) return null;
      const keys = this.def.echo.screens;
      return { index: this.echoIndex, count: keys.length, last: this.echoIndex >= keys.length - 1, text: this.text(LV.textAt(this.def, keys[this.echoIndex])) };
    }
    echoNext() {
      if (this.phase !== 'echo' || this.beat || this.echoIndex >= this.def.echo.screens.length - 1) return false;
      this.echoIndex++;
      this.log('echo', { screen: this.echoIndex });
      return true;
    }
    collectCards() {
      if (this.cards.length) return;
      this.cards = this.def.echo.cards.map((c) => c.id);
      for (const id of this.cards) this.log('card', { id });
    }

    // --- labConfig, HUD, narrator ------------------------------------------------------
    /** The level's labConfig for the current phase; revealed genes come from the run's monitor (1.1). */
    labConfig(extraState) {
      const mon = this.run && this.run.monitor.save ? this.run.monitor.save() : null;
      const revealed = mon && mon.revealed ? copy(mon.revealed) : {};
      // In the watch phase the step's id comes along: a readout may appear from a given step on (PROLOGUE §5.3: energy at H4).
      const step = this.phase === 'watch' ? (this.watchStep() || {}).id || null : null;
      return this.def.labConfig(this.variant, Object.assign({ phase: this.phase, revealed, scene: this.phase === 'scenes' ? this.scene.index : null,
        design: this.design, step, monitor: mon }, extraState || {}));
    }
    /** A key that changes whenever the labConfig would (the revealed genes), so the app knows to rebuild its panels. */
    labConfigKey() {
      const mon = this.run && this.run.monitor.save ? this.run.monitor.save() : null;
      const step = this.phase === 'watch' ? (this.watchStep() || {}).id || '' : '';
      // A level whose screen follows its run (1.2: the milk phase adds the economy readouts) names what matters in uiKey.
      const own = this.def.uiKey ? String(this.def.uiKey(mon, this.phase)) : '';
      return this.phase + '|' + step + '|' + (mon && mon.revealed ? Object.keys(mon.revealed).sort().join(',') : '') + '|' + own;
    }
    hud() {
      if (!this.def.hud) return null;
      let state = this.run && this.run.monitor.save ? this.run.monitor.save() : null;
      if (this.phase === 'demo') state = this.demo.monitor && this.demo.monitor.save ? Object.assign({ demo: true }, this.demo.monitor.save()) : { demo: true };
      else if (this.phase === 'watch') {
        state = Object.assign({ watch: true, step: (this.watchStep() || {}).id || null, tick: this.watchCell ? this.watchCell.tick : 0 },
          this.watchMon && this.watchMon.save ? this.watchMon.save() : {});
      }
      else if (this.phase === 'epilogue' && state) state = Object.assign({}, state, { epilogue: copy(this.epilogue) });
      return this.def.hud(this.variant, state);
    }
    /** Level narrator rules with the read-only `level` object of §5.5.4 as their fourth argument. */
    narratorRules() {
      const runner = this;
      return this.def.narratorRules.map((r) => {
        // A rule's gene is fixed (a string) or chosen when it speaks (gene(facts, memory, tick, level): 1.1's reveals).
        const rule = { key: r.key, template: this.text(r.template), gene: typeof r.gene === 'string' ? r.gene : null, preempt: !!r.preempt };
        rule.when = (f, m, t) => {
          const lv = runner.levelView();
          const ok = r.when(f, m, t, lv);
          if (ok && typeof r.gene === 'function') rule.gene = r.gene(f, m, t, lv) || null;
          return ok;
        };
        return rule;
      });
    }
    levelView() {
      const demo = this.phase === 'demo', watch = this.phase === 'watch';
      const mon = demo ? this.demo.monitor : watch ? this.watchMon : this.run && this.run.monitor;
      const out = { variant: this.variant, design: this.design, monitor: mon && mon.save ? mon.save() : null, phase: this.phase };
      if (watch) out.watch = { step: (this.watchStep() || {}).id || null, stage: this.watch.stage, watchedId: this.watch.watchedId };
      return out;
    }

    // --- scoring and the code (§6, §10) -------------------------------------------------
    answersForScore() {
      const predictions = {}, debrief = {};
      for (const id of Object.keys(this.answers)) predictions[id] = copy(this.answers[id]);
      for (const id of Object.keys(this.debriefState)) debrief[id] = copy(this.debriefState[id]);
      // Guesses are not scored; a level may still read them (flags, the opening's guess count).
      return { predictions, debrief, guesses: copy(this.watch.guesses) };
    }

    /** The level's score components as things stand (the result sheet shows E before the level is complete). */
    preview() {
      const def = this.def;
      if (!def.score) return {};
      return def.score(this.variant, this.monitorResult || {}, this.answersForScore(),
        { demo: this.demo.result, design: this.design, withoutGoal: this.withoutGoal, par: this.parResult() }) || {};
    }

    finish() {
      if (this.result) return this.result;
      const def = this.def;
      if (this.par && this.monitorResult) this.parStep(Infinity);
      const comp = def.score ? (def.score(this.variant, this.monitorResult || {}, this.answersForScore(),
        { demo: this.demo.result, design: this.design, withoutGoal: this.withoutGoal, par: this.parResult() }) || {}) : {};
      const r = summarise(def, {
        goal: this.goal, comp, debrief: this.debriefState, guesses: this.watch.guesses, variantSeed: this.variantSeed, attempt: this.attempt,
        runs: this.runs, override: this.override, record: this.record,
      });
      this.flagEvidence = r.evidence;
      this.code = r.code;
      this.result = {
        attempt: r.attempt, variantSeed: this.variantSeed, content: def.version, engine: r.engine,
        runs: r.runs, G: r.G, E: r.E, P: r.P, D: r.D, X: r.X, flags: r.evidence.map((f) => f.id), total: r.total, code: r.code,
        date: this.today(), override: this.override,
      };
      for (const f of r.evidence) this.log('flag', { id: f.id, evidence: f });
      this.log('score', { G: r.G, E: r.E, P: r.P, D: r.D, X: r.X, total: r.total });
      return this.result;
    }

    /** The level run file (§11.4). extra: {build, ui, telemetry}. */
    runFile(extra) {
      const x = extra || {};
      const answers = {};
      for (const id of Object.keys(this.answers)) if (this.answers[id].locked) answers[id] = copy(this.answers[id].value);
      const r = this.result;
      const level = {
        id: this.def.id, content: this.def.version, variantSeed: this.variantSeed, variant: copy(this.variant),
        attempt: this.override ? 0 : this.attempt, runs: clampRuns(this.runs), override: this.override,
        answers, debrief: copy(this.taps),
        guesses: Object.keys(this.watch.guesses).reduce((o, k) => { o[k] = this.watch.guesses[k].option; return o; }, {}),
        result: r ? { G: r.G, E: r.E, P: r.P, D: r.D, X: r.X, flags: copy(this.flagEvidence), total: r.total } : null,
        code: this.code,
      };
      if (this.design) level.design = copy(this.design);
      const sk = this.def.predictions.find((it) => it.kind === 'sketch');
      if (sk && this.answers[sk.id] && this.answers[sk.id].locked) level.sketch = copy(this.answers[sk.id].value);
      const records = { task: copy(this.record) };
      if (this.demo.record) records.demo = copy(this.demo.record);
      if (this.par && this.par.done) records.par = { finalHash: this.par.snapshot().finalHash };
      return { format: 'btc-level-run', v: 1, build: x.build || null, ui: x.ui || {}, level, records, telemetry: x.telemetry || [] };
    }

    fileName() {
      return 'be-the-cell-' + this.def.id + '-' + CODE.encodeSeed(this.variantSeed) + '-a' + (this.override ? 0 : this.attempt) + '.json';
    }

    // --- autosave (§4.4) ------------------------------------------------------------
    save() {
      // The run's cell stays on screen behind every sheet until the level is complete.
      const liveCell = !!this.run && this.phase !== 'complete';
      return {
        levelId: this.def.id, content: this.def.version, attempt: this.attempt, variantSeed: this.variantSeed, override: this.override,
        deviceSeed: this.deviceSeed, phase: this.phase, phaseIndex: this.phaseIndex, runs: this.runs,
        answers: copy(this.answers), selected: copy(this.selected), debrief: copy(this.debriefState), taps: copy(this.taps),
        beat: copy(this.beat), outroShown: this.outroShown, scene: copy(this.scene), textIndex: this.beat ? this.beat.index : this.scene.line,
        acts: copy(this.acts), shownBeats: copy(this.shownBeats),
        echoIndex: this.echoIndex, cards: this.cards.slice(), withoutGoal: this.withoutGoal, design: copy(this.design),
        demo: { done: this.demo.done, record: copy(this.demo.record), result: copy(this.demo.result) },
        epilogue: copy(this.epilogue),
        // The watch: its state for the whole attempt (the guesses feed flags), its cell only during the phase.
        watch: copy(this.watch),
        watchCell: this.phase === 'watch' && this.watchCell ? {
          snapshot: this.watchCell.snapshot(), monitor: this.watchMon && this.watchMon.save ? copy(this.watchMon.save()) : null,
        } : null,
        // A par run in progress is not saved: it starts again (LEVELS §4.4). A finished one is small.
        par: this.par && this.par.done ? this.par.snapshot() : null, onRunShown: this.onRunShown,
        run: this.run ? {
          endReason: this.run.endReason, endTick: this.run.endTick, logIdx: this.run.logIdx,
          monitor: this.run.monitor.save ? copy(this.run.monitor.save()) : null,
          snapshot: liveCell ? this.run.cell.snapshot() : null,
        } : null,
        record: copy(this.record), monitorResult: copy(this.monitorResult), goal: this.goal,
        result: copy(this.result), code: this.code, flagEvidence: copy(this.flagEvidence),
      };
    }
    /** Index of the first phase after which the run's cell is no longer shown (debrief). */
    firstAfterRun() {
      const i = this.phases.indexOf('debrief');
      return i < 0 ? this.phases.length : i;
    }
  }

  /** Rebuilds a runner from save(); a saved run gets its cell back from the snapshot, paused. */
  LevelRunner.restore = function (def, s, opts) {
    const o = Object.assign({}, opts || {}, { def, variantSeed: s.variantSeed, attempt: s.attempt, override: s.override, deviceSeed: s.deviceSeed });
    if (s.levelId !== def.id) throw new Error('saved level ' + s.levelId + ' is not ' + def.id);
    // A save from another content version would run the old cell against new variants and scoring.
    if (s.content !== def.version) throw new Error('saved level ' + s.levelId + ' has content ' + s.content + ', not ' + def.version);
    const r = new LevelRunner(o);
    r.started = true;
    r.phaseIndex = Math.max(0, def.phases.indexOf(s.phase));
    r.runs = s.runs || 0;
    r.answers = copy(s.answers) || {};
    r.selected = copy(s.selected) || {};
    r.debriefState = copy(s.debrief) || {};
    r.taps = copy(s.taps) || [];
    r.beat = copy(s.beat) || null;
    r.outroShown = !!s.outroShown;
    r.scene = Object.assign({ index: 0, line: 0, max: 0 }, copy(s.scene) || {});
    if (r.scene.max < r.scene.index) r.scene.max = r.scene.index;
    r.acts = copy(s.acts) || {};
    r.shownBeats = copy(s.shownBeats) || {};
    r.echoIndex = s.echoIndex || 0;
    r.cards = (s.cards || []).slice();
    r.withoutGoal = !!s.withoutGoal;
    r.design = copy(s.design) || null;
    r.demo = { done: !!(s.demo && s.demo.done), cell: null, record: s.demo ? copy(s.demo.record) : null, result: s.demo ? copy(s.demo.result) : null };
    // A finished demo (1.2) is rebuilt from its record, so it is shown at its end instead of playing again.
    if (r.demo.done && r.demo.record && def.demo) {
      const rep = replayWithMonitor(r.demo.record, () => (def.demo.monitor ? def.demo.monitor(r.variant) : { onTick() {}, end() { return null; } }));
      r.demo.cell = rep.cell;
      r.demo.monitor = def.demo.monitor ? rep.monitor : null;
    }
    r.epilogue = copy(s.epilogue) || { startTick: null, done: false, started: false };
    r.watch = Object.assign(freshWatch(), copy(s.watch) || {});
    if (r.phase === 'watch') {
      // The watch cell comes back from its snapshot, paused, at the same step; without one the watch starts again.
      if (s.watchCell && s.watchCell.snapshot) r.attachWatch(r.restoreCell(s.watchCell.snapshot), s.watchCell);
      else { r.watch = Object.assign(freshWatch(), { guesses: r.watch.guesses }); r.startWatch(); }
    }
    if (r.par && s.par) r.par.set(s.par);
    r.onRunShown = !!s.onRunShown;
    r.record = copy(s.record) || null;
    r.monitorResult = copy(s.monitorResult) || null;
    r.goal = !!s.goal;
    r.result = copy(s.result) || null;
    r.code = s.code || null;
    r.flagEvidence = copy(s.flagEvidence) || [];
    if (s.run && s.run.snapshot) {
      r.attachRun(r.restoreCell(s.run.snapshot), s.run);
    } else if (r.has('run') && !s.run) {
      r.ensureRun();
    } else if (s.run && !r.result && r.phaseIndex < r.firstAfterRun()) {
      // A run whose cell was not saved (it was being made when the page closed): start that run again.
      r.runs = Math.max(0, r.runs - 1);
      r.newRun();
    }
    return r;
  };

  // ---------------------------------------------------------------------------
  // The headless player (tests and tools): plays a solution through every phase.
  // ---------------------------------------------------------------------------
  /**
   * Plays the watch phase of runner r as a student would: Next on every line and opened gate,
   * each guess (solution.watch.guesses[id], else the cause), each act (the step's expected command,
   * On at def.watch.onLevel or ×1), and the watch cell stepped while a step waits on the model.
   * sol.watch: {guesses?: {id: option | 'cause'}, every?, policy?(view, tick, api, stepId)} (the policy may
   * send other commands while a step waits, e.g. a switch-off detour). Returns the gate ticks.
   */
  function playWatch(r, sol, maxTicks) {
    const ws = (sol && sol.watch) || {}, def = r.def;
    const api = {
      command(cmd) {
        const c = Object.assign({}, cmd, { source: 'user' });
        const res = r.watchCell.command(c);
        r.watchCommand(c, res);
        return res;
      },
    };
    let guard = 0;
    while (!r.watch.done) {
      if (guard++ > 20000) throw new Error('level ' + def.id + ': the watch is stuck at step ' + (r.watchStep() || {}).id);
      const info = r.watchInfo();
      if (info.stage === 'lines' || info.stage === 'tap') { r.watchNext(); continue; }
      if (info.stage === 'guess') {
        const want = ws.guesses && ws.guesses[info.guess.id] !== undefined ? ws.guesses[info.guess.id] : 'cause';
        if (!r.watchPick(info.guess.id, want) || !r.watchSee().ok) throw new Error('level ' + def.id + ': guess ' + info.guess.id + ' refused');
        continue;
      }
      if (info.stage === 'act') {
        const a = info.act;
        if (a.kind === 'zoom') r.watchZoom(a.to);
        else {
          const e = a.expect;
          const level = e.level !== undefined ? e.level : e.on === false ? 'off' : (def.watch.onLevel || 1);
          api.command(Object.assign({ type: e.type }, e.gene !== undefined ? { gene: e.gene } : {}, e.type === 'setPromoter' ? { level } : {}));
        }
        if (r.watchInfo().stage === 'act') throw new Error('level ' + def.id + ': the act of step ' + info.id + ' was not done');
        continue;
      }
      // until / wait: the watch cell runs until the model reaches the step's state.
      const cell = r.watchCell, stage = info.stage, id = info.id;
      let n = 0;
      while (r.watch.stage === stage && (r.watchStep() || {}).id === id && !r.watch.done) {
        if (n++ > maxTicks) throw new Error('level ' + def.id + ': step ' + id + ' did not open within ' + maxTicks + ' ticks');
        if (ws.policy && cell.tick % (ws.every || 5) === 0) ws.policy(cell.observe(), cell.tick, api, id);
        cell.step();
        cell.takeEvents();
      }
    }
    return copy(r.watch.gateTick);
  }

  /**
   * Does a scene's activity as a student would (headless): the right letters and codons (or sol.activities[sceneId]:
   * {picks: [...], rows: [...]} to pick others first), three copies, and the runs played to their end.
   */
  function playActivity(r, info, sol) {
    const a = info.scene.activity, own = (sol && sol.activities && sol.activities[info.scene.id]) || {};
    let guard = 0;
    while (!r.activityInfo(info.scene, true).done) {
      if (guard++ > 1000) throw new Error('level ' + r.def.id + ': the activity of scene ' + info.scene.id + ' is stuck');
      const st = r.activityInfo(info.scene, true);
      if (st.stage === 'fill') r.sceneAct({ pick: own.picks && own.picks[st.i] !== undefined ? own.picks[st.i] : a.expect[st.i] });
      else if (st.stage === 'decode') {
        const want = own.rows && own.rows[st.i] !== undefined && st.hint === null ? own.rows[st.i] : a.rows.findIndex((x) => x.codon === a.codons[st.i]);
        r.sceneAct({ row: want });
      } else if (a.kind === 'copies') {
        if (st.made + st.runs.length < a.n) r.sceneAct({ start: true });
        else r.sceneAct({ advance: a.total });
      } else {
        if ((a.kind === 'copy' || a.kind === 'read') && !st.started) r.sceneAct({ start: true });
        r.sceneAct({ advance: a.total });
      }
    }
  }

  /**
   * opts: {variantSeed, solution ('reference'), attempt, override, deviceSeed, telemetry, makeCell,
   *        maxTicks (per run, default 200,000), interruptAt (tick: save → JSON → restore mid-run),
   *        retryFailed (Try again once after a failed run), onPhase(runner)}
   * Returns {runner, result, code, restored}.
   */
  function playHeadless(def, opts) {
    const o = opts || {};
    const sol = def.solutions[o.solution || 'reference'];
    if (!sol) throw new Error('level ' + def.id + ' has no solution ' + o.solution);
    let r = new LevelRunner({
      def, variantSeed: o.variantSeed === undefined ? 1 : o.variantSeed, attempt: o.attempt === undefined ? 1 : o.attempt,
      override: o.override, deviceSeed: o.deviceSeed, telemetry: o.telemetry, makeCell: o.makeCell, today: o.today,
      speed: () => 60,
    }).start();
    let restored = false, retried = false, guard = 0;
    const maxTicks = o.maxTicks || 200000;
    const api = (runner) => ({ command: (cmd) => runner.run.cell.command(Object.assign({}, cmd, { source: 'user' })) });
    const answer = (qid) => {
      const want = sol.debrief && sol.debrief[qid] !== undefined ? sol.debrief[qid] : 'ok';
      const res = r.tap(qid, want);
      if (!res || !res.correct) r.tap(qid, 'ok');
    };
    const stepCell = (runner, cell, until) => {
      let n = 0;
      while (!until() && n++ < maxTicks) {
        // A mid-run story beat (1.2's milk arrival) holds the run until it is read: the player reads it at once.
        if (runner.beat && runner.beat.mid) { runner.storySkip(); runner.next(); }
        if (o.interruptAt !== undefined && !restored && cell.tick === o.interruptAt && runner.phase === 'run') {
          const saved = JSON.parse(JSON.stringify(runner.save()));
          r = runner = LevelRunner.restore(def, saved, { telemetry: o.telemetry, makeCell: o.makeCell, today: o.today });
          cell = runner.run.cell;
          restored = true;
        }
        if (runner.phase === 'run' && sol.every && cell.tick % sol.every === 0) sol.act(cell.observe(), cell.tick, api(runner), runner.variant);
        if (runner.phase === 'epilogue' && sol.epilogue && cell.tick % (sol.epilogue.every || 1) === 0) {
          sol.epilogue.act(cell.observe(), cell.tick, api(runner), runner.variant);
        }
        cell.step();
        const evs = cell.takeEvents();
        if (runner.run && runner.run.monitor.events) runner.run.monitor.events(evs);
      }
    };
    while (r.phase !== 'complete') {
      if (guard++ > 10000) throw new Error('headless player stuck in phase ' + r.phase);
      if (o.onPhase) o.onPhase(r);
      if (r.beat) { r.storySkip(); r.next(); continue; }
      const p = r.phase;
      if (p === 'scenes') {
        const info = r.sceneInfo();
        if (info.guess && !info.guess.seen) {
          const want = sol.watch && sol.watch.guesses && sol.watch.guesses[info.guess.id] !== undefined ? sol.watch.guesses[info.guess.id] : 'cause';
          r.scenePick(info.guess.id, want); r.sceneSee();
        }
        if (info.question && !info.solved) answer(info.scene.question);
        if (info.activity && info.lastLine && !info.activity.done) playActivity(r, info, sol);
        if (!r.sceneNext().ok) r.next();
        continue;
      }
      if (p === 'watch') playWatch(r, sol, maxTicks);
      if (p === 'predict' || p === 'predict2') {
        for (const it of r.items()) {
          let v = sol.predictions ? sol.predictions[it.id] : undefined;
          // A Core sketch or number the solution does not script takes the reference's answer.
          if (v === undefined && !it.expert && it.kind !== 'choice') v = (def.solutions.reference.predictions || {})[it.id];
          if (v !== undefined) r.lock(it.id, typeof v === 'function' ? v(r.variant) : v);
          else if (it.expert) r.skip(it.id);
          else r.lock(it.id, 'ok');
        }
      } else if (p === 'demo') {
        const cell = r.startDemo();
        while (!r.checkDemo()) { cell.step(); cell.takeEvents(); }
      } else if (p === 'design') {
        if (sol.design) r.setDesign(typeof sol.design === 'function' ? sol.design(r.variant) : sol.design);
      } else if (p === 'run') {
        stepCell(r, r.run.cell, () => !!r.run.endReason);
        if (!r.run.endReason) throw new Error('level ' + def.id + ': the run did not end within ' + maxTicks + ' ticks');
        // The par run (1.7): opts.parCache (variantSeed → snapshot) lets tools share it between solutions.
        if (r.par && !r.par.done) {
          const cached = o.parCache && o.parCache[r.variantSeed];
          if (cached) r.par.set(cached);
          else { r.parStep(Infinity); if (o.parCache) o.parCache[r.variantSeed] = r.par.snapshot(); }
        }
      } else if (p === 'result') {
        if (!r.goal) {
          if (o.retryFailed && !retried) { retried = true; r.retry(); continue; }
          r.continueWithoutGoal();
          continue;
        }
      } else if (p === 'epilogue') {
        r.startEpilogue();
        stepCell(r, r.run.cell, () => r.epilogue.done);
      } else if (p === 'debrief') {
        for (const q of def.debrief) answer(q.id);
      } else if (p === 'echo') {
        while (r.echoNext()) { /* every screen */ }
      }
      const g = r.next();
      if (!g.ok) throw new Error('level ' + def.id + ': Continue refused in ' + p + ' (' + g.reason + ')');
    }
    return { runner: r, result: r.result, code: r.code, restored };
  }

  // ---------------------------------------------------------------------------
  // Run-file verification (§10.4; tools/verify-run.js and tools/codes.html)
  // ---------------------------------------------------------------------------
  /** Replays a record with a fresh monitor (make(cell) → monitor) fed exactly as in a run; returns {cell, monitor, st}. */
  function replayWithMonitor(record, make) {
    const st = { logIdx: 0, endReason: null, endTick: null };
    let monitor = null;
    const cell = ENG.replay.run(record, record.finalTick, {
      attach(c) {
        monitor = make(c);
        if (monitor.start) monitor.start(c);
        c.attachRecorder(monitorFeed(monitor, st));
      },
    });
    return { cell, monitor, st };
  }

  /**
   * Verifies a level run file (§11.4): the variant from its seed, the configs of its records,
   * a replay of the scored run with the level's monitor attached (R-E18), the 1.2 demo, and the
   * score, flags, total and code recomputed from the stored answers. opts: {levels: {id: def}}.
   * Returns {ok, level, checks: [{what, ok, got, want}], recomputed, error?}.
   */
  function verifyRunFile(file, opts) {
    const levels = (opts && opts.levels) || LV.byId;
    const out = { ok: false, level: null, checks: [], recomputed: null };
    const check = (what, ok, got, want) => { out.checks.push({ what, ok: !!ok, got: got === undefined ? null : got, want: want === undefined ? null : want }); return !!ok; };
    const L = file && file.level;
    if (!file || file.format !== 'btc-level-run' || !L) { out.error = 'not a Be the Cell level run file'; return out; }
    const def = levels[L.id];
    if (!def) { out.error = 'unknown level ' + L.id; return out; }
    out.level = L.id;
    check('content version', L.content === def.version, L.content, def.version);
    const variantSeed = def.scored ? (L.variantSeed >>> 0) & 0x3FFFFFFF : 0;
    const variant = copy(def.variant(variantSeed));
    check('variant from its seed', JSON.stringify(variant) === JSON.stringify(L.variant), L.variant, variant);
    const design = L.design || null;
    const recs = file.records || {};
    const configHash = (role) => new Cell(def.config(variant, role, { deviceSeed: 0, design })).configHash;
    try {
      // The 1.2 demo: its config, its replay and its result (the copies per mRNA and the curve).
      let demo = null;
      if (def.demo && recs.demo) {
        check('demo config', recs.demo.configHash === configHash('demo'), recs.demo.configHash, configHash('demo'));
        const rep = def.demo.monitor ? replayWithMonitor(recs.demo, () => def.demo.monitor(variant)) : { cell: ENG.replay.run(recs.demo, recs.demo.finalTick), monitor: null };
        check('demo replay reaches its final hash', rep.cell.hash() === recs.demo.finalHash, rep.cell.hash(), recs.demo.finalHash);
        demo = def.demoResult ? copy(def.demoResult(variant, rep.cell, rep.monitor ? rep.monitor.result() : null)) : null;
      } else if (def.demo) check('demo record present', false, null, 'records.demo');
      // The scored run.
      let monitorResult = {}, record = null;
      if (def.monitor) {
        record = recs.task;
        if (!check('scored run record present', !!record, null, 'records.task')) return out;
        check('run config is this level\'s', record.configHash === configHash('task'), record.configHash, configHash('task'));
        const rep = replayWithMonitor(record, (c) => def.monitor(variant, { dt: c.dt, K, variant, design }));
        check('run replay reaches its final hash', rep.cell.hash() === record.finalHash, rep.cell.hash(), record.finalHash);
        check('run ends as recorded', rep.st.endTick === record.finalTick, rep.st.endTick, record.finalTick);
        monitorResult = copy(rep.monitor.result()) || {};
      }
      // The par run (1.7): recomputed from the variant (it is the reference design on the same seed).
      let par = null;
      if (def.par) {
        const pr = parRunner(def, variant);
        pr.step(Infinity);
        const snap = pr.snapshot();
        par = snap.result;
        if (recs.par && recs.par.finalHash) check('par run reaches its final hash', snap.finalHash === recs.par.finalHash, recs.par.finalHash, snap.finalHash);
      }
      // Answers and debrief, re-marked from what the file stores.
      const predictions = {};
      for (const it of def.predictions) {
        const v = L.answers ? L.answers[it.id] : undefined;
        if (v !== undefined && v !== null) predictions[it.id] = answerRecord(it, v, variant, { demo });
        else if (it.expert) predictions[it.id] = { locked: false, skipped: true, value: null };
      }
      const debrief = debriefFromTaps(def, L.debrief);
      // Guesses (not scored) come back from their options, for the flags they raise.
      const guesses = {}, known = def.watch ? W.guesses(def) : {};
      for (const gid of Object.keys(L.guesses || {})) {
        const k = known[gid], o = k && k.guess.options[L.guesses[gid]];
        if (o) guesses[gid] = { option: L.guesses[gid], mc: o.mc || null, cause: o.cause === true, step: k.step };
      }
      const comp = def.score ? (def.score(variant, monitorResult, { predictions, debrief, guesses }, { demo, design, withoutGoal: false, par }) || {}) : {};
      const r = summarise(def, {
        goal: !!monitorResult.goal, comp, debrief, guesses, variantSeed, attempt: L.attempt, runs: L.runs, override: L.override, record,
      });
      const res = L.result || {};
      out.recomputed = { G: r.G, E: r.E, P: r.P, D: r.D, X: r.X, flags: r.evidence.map((f) => f.id), total: r.total, code: r.code };
      const near = (a, b) => (a === null || a === undefined ? b === null || b === undefined : typeof b === 'number' && Math.abs(a - b) < 1e-9);
      check('goal (G)', res.G === r.G, res.G, r.G);
      check('efficiency (E)', near(res.E, r.E), res.E, r.E);
      check('prediction (P)', near(res.P, r.P), res.P, r.P);
      check('debrief (D)', JSON.stringify(res.D) === JSON.stringify(r.D), res.D, r.D);
      check('Expert (X)', res.X === r.X, res.X, r.X);
      const gotFlags = (res.flags || []).map((f) => (typeof f === 'string' ? f : f.id)).sort();
      check('flags', JSON.stringify(gotFlags) === JSON.stringify(out.recomputed.flags.slice().sort()), gotFlags, out.recomputed.flags);
      check('total', res.total === r.total, res.total, r.total);
      check('code', L.code === r.code, L.code, r.code);
    } catch (err) {
      check('replay', false, String(err && err.message || err), 'no error');
    }
    out.ok = out.checks.every((c) => c.ok);
    return out;
  }

  /**
   * What a played solution got wrong against its expect (§3.6): [] when it met every claim.
   * expect: {goal: bool, par: bool (true: goal met and E ≥ 0.8; false: not both), P, minTotal, minE (goal met
   * with E at least this), flags: [ids that must be raised], X (bits that must be set)}.
   */
  function checkExpect(expect, result) {
    const e = expect || {}, r = result, out = [];
    const withinPar = r.G === 1 && typeof r.E === 'number' && r.E >= S.PAR;
    if (e.goal === true && r.G !== 1) out.push('goal not met');
    if (e.goal === false && r.G !== 0) out.push('goal met');
    if (e.par === true && !withinPar) out.push('not within par (E ' + r.E + ')');
    if (e.par === false && withinPar) out.push('within par');
    if (typeof e.P === 'number' && !(typeof r.P === 'number' && Math.abs(r.P - e.P) < 1e-9)) out.push('P ' + r.P + ', expected ' + e.P);
    if (typeof e.minE === 'number' && !(r.G === 1 && typeof r.E === 'number' && r.E >= e.minE - 1e-9)) out.push('E ' + r.E + ' below ' + e.minE);
    if (typeof e.minTotal === 'number' && !(r.total >= e.minTotal)) out.push('total ' + r.total + ' < ' + e.minTotal);
    for (const f of e.flags || []) if ((r.flags || []).indexOf(f) < 0) out.push('flag ' + f + ' not raised');
    if (typeof e.X === 'number' && (r.X & e.X) !== e.X) out.push('Expert bits ' + r.X + ', expected ' + e.X);
    return out;
  }

  const game = { makeCell, playHeadless, playWatch, playActivity, LevelRunner, answerRecord, markTable, debriefFromTaps, summarise, monitorFeed, verifyRunFile, checkExpect, parRunner };
  return { LevelRunner, game };
});
