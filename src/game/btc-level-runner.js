// @deps btc-cell btc-replay btc-level-kit btc-levels btc-score btc-code
/*
 * Be the Cell: the level runner (LEVELS §4) and the headless player.
 *
 * One pure phase machine drives every level through the same phases:
 * scenes (Prologue) · intro · task · predict · demo · design · run · result ·
 * predict2 · epilogue · debrief · echo · complete. Nothing advances because
 * time passed: next() refuses until the gate of §4.1 holds, and says why.
 *
 *   const r = new BTC.LevelRunner({def, variantSeed, attempt, override, deviceSeed, telemetry})
 *   r.start()                         level_start, then the first phase
 *   r.phase, r.gate(), r.next()       the phase and its gate; next() → {ok, phase} or {ok: false, reason}
 *   r.storyLine() / storyNext() / storySkip()        the active story beat (intro; outro in result or echo)
 *   r.sceneInfo() / sceneNext() / sceneSkip()        Prologue scenes
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
      require('./btc-level-kit.js'), require('./btc-levels.js'), require('./btc-score.js'), require('./btc-code.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    var api = factory({ Cell: B.Cell, ENGINE_VERSION: B.ENGINE_VERSION, replay: B.replay }, B.levelKit, B.levels, B.score, B.code);
    B.LevelRunner = api.LevelRunner;
    B.game = api.game;
  }
})(typeof self !== 'undefined' ? self : this, function (ENG, K, LV, S, CODE) {
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
        }
        const t0 = nowMs();
        let n = 0;
        while (!st.endReason) {
          cell.step();
          if ((++n & 255) === 0) { cell.takeEvents(); if (ms !== Infinity && nowMs() - t0 >= ms) break; }
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

  /**
   * G, E, P, D, X, flags, total and the code of an attempt (§6, §10), from the level's score
   * components. o: {goal, comp, debrief (state), variantSeed, attempt, runs, override, record}.
   */
  function summarise(def, o) {
    const comp = o.comp || {};
    let first = 0;
    for (const q of def.debrief) if (o.debrief[q.id] && o.debrief[q.id].firstCorrect) first++;
    const D = [first, def.debrief.length];
    const scored = def.scored;
    const G = scored ? (o.goal ? 1 : 0) : 1;
    // Efficiency against par counts only when the goal was met (§6.1), so a missed goal reports E 0.
    const E = scored ? (G && typeof comp.E === 'number' ? S.clamp01(comp.E) : 0) : null;
    const P = scored && typeof comp.P === 'number' ? S.clamp01(comp.P) : null;
    const X = comp.X || 0;
    const flagIds = LV.flagList(def).map((f) => f.id);
    const evidence = (comp.flags || []).map((f) => (typeof f === 'string' ? { id: f } : copy(f)))
      .filter((f, i, a) => flagIds.indexOf(f.id) >= 0 && a.findIndex((g) => g.id === f.id) === i);
    const total = scored ? S.total({ G, E, P, D }) : null;
    const digest = scored && o.record ? o.record.finalHash.slice(0, 6).toUpperCase() : '000000';
    const engine = (o.record && o.record.engineVersion) || ENG.ENGINE_VERSION;
    const attempt = o.override ? 0 : o.attempt;
    const runs = Math.max(1, o.runs || 0);
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
      this.scene = { index: 0, line: 0 };
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
      this.result = null;
      this.code = null;
      this.flagEvidence = [];
      this.started = false;
    }

    get phase() { return this.phases[this.phaseIndex]; }
    has(p) { return this.phases.indexOf(p) >= 0; }
    text(s) { return K.fill(s, this.vars); }

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
      const p = this.phase, def = this.def;
      this.log('phase', { name: p });
      if (p === 'intro') this.beat = { name: 'intro', index: 0 };
      else if (p === 'scenes') this.scene = { index: 0, line: 0 };
      else if (p === 'run') {
        // A designer level's cell is built from the design the student ran (it applies at tick 0).
        if (this.has('design') && this.run && this.run.cell.tick === 0 && !this.run.endReason) this.replaceRunCell();
        this.ensureRun();
        const onRun = this.beatLines('onRun');
        if (onRun.length && !this.onRunShown) this.beat = { name: 'onRun', index: 0 };
        this.log('run_start', { speed: this.speedFn ? this.speedFn() : null });
      } else if (p === 'result') {
        if (this.goal && def.story.outro.length && !this.outroShown) this.beat = { name: 'outro', index: 0 };
      } else if (p === 'epilogue') {
        this.epilogue = { startTick: this.run ? this.run.cell.tick : 0, done: false, started: false };
      } else if (p === 'echo') {
        this.echoIndex = 0;
        if (!this.outroShown && def.story.outro.length) this.beat = { name: 'outro', index: 0 };
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
        case 'run': return this.run && this.run.endReason ? { ok: true } : { ok: false, reason: 'run' };
        case 'epilogue': return this.epilogue.done ? { ok: true } : { ok: false, reason: 'epilogue' };
        case 'debrief': {
          const open = this.def.debrief.filter((q) => !(this.debriefState[q.id] && this.debriefState[q.id].solved));
          return open.length ? { ok: false, reason: 'debrief', item: open[0].id } : { ok: true };
        }
        case 'echo': return this.echoIndex >= this.def.echo.screens.length - 1 ? { ok: true } : { ok: false, reason: 'echo' };
        case 'complete': return { ok: false, reason: 'complete' };
        default: return { ok: true };    // intro (after its beat), task, design, result
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
      if (p === 'scenes' && !this.has('echo')) this.collectCards();
      if (p === 'echo') this.collectCards();
      if (p === 'design' && this.design) this.log('design_submit', { design: this.design });
      this.enter(this.phaseIndex + 1);
      return { ok: true, phase: this.phase };
    }

    // --- story beats ----------------------------------------------------------------
    /** A beat's lines; the outro may be swapped for one in story.extra when the level's outroKey names it. */
    beatLines(name) {
      const def = this.def;
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

    // --- Prologue scenes -----------------------------------------------------------------
    sceneSolved(i) {
      const q = this.def.scenes[i].question;
      return !q || !!(this.debriefState[q] && this.debriefState[q].solved);
    }
    sceneInfo() {
      if (this.phase !== 'scenes') return null;
      const s = this.scene, sc = this.def.scenes[s.index], l = sc.lines[s.line];
      const lastLine = s.line >= sc.lines.length - 1;
      return {
        index: s.index, count: this.def.scenes.length, scene: sc, line: s.line, lines: sc.lines.length,
        who: l.who, text: this.text(l.text), denies: !!l.denies, lastLine,
        last: lastLine && s.index >= this.def.scenes.length - 1,
        question: lastLine && sc.question ? this.question(sc.question) : null,
        solved: this.sceneSolved(s.index),
      };
    }
    /** Next inside the scenes: the next line, then the next scene once the question is right. */
    sceneNext() {
      if (this.phase !== 'scenes') return { ok: false, reason: 'phase' };
      const s = this.scene, sc = this.def.scenes[s.index];
      if (s.line < sc.lines.length - 1) { s.line++; }
      else if (!this.sceneSolved(s.index)) return { ok: false, reason: 'question' };
      else if (s.index < this.def.scenes.length - 1) { s.index++; s.line = 0; }
      else return { ok: false, reason: 'end' };
      this.log('story', { beat: 'scene:' + this.def.scenes[s.index].id, line: s.line, action: 'next' });
      return { ok: true };
    }
    /** Skip: forward to the next unanswered question, or to the last line. */
    sceneSkip() {
      if (this.phase !== 'scenes') return false;
      const s = this.scene, scenes = this.def.scenes;
      for (;;) {
        const sc = scenes[s.index];
        s.line = sc.lines.length - 1;
        if (!this.sceneSolved(s.index) || s.index >= scenes.length - 1) break;
        s.index++;
      }
      this.log('story', { beat: 'scene:' + scenes[s.index].id, line: s.line, action: 'skip' });
      return true;
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
    question(id) { return this.def.predictions.find((x) => x.id === id) || this.def.debrief.find((x) => x.id === id) || null; }

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
          if (runner.phase === 'epilogue' && runner.epilogue.started && !runner.epilogue.done && def.epilogue &&
            c.tick - runner.epilogue.startTick >= def.epilogue.durationTicks) runner.epilogue.done = true;
        },
      };
      cell.attachRecorder(run.recorder);
      this.run = run;
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
      if (this.phase === 'demo') return !this.demo.cell || this.demo.done || this.demo.cell.tick >= this.def.demo.durationTicks;
      if (!this.run) return true;
      if (this.phase === 'epilogue') return !this.epilogue.started || this.epilogue.done;
      if (this.phase === 'run') return !!this.run.endReason;
      return true;
    }
    /** True when time may run for the cell on screen. */
    canRun() { return this.phase === 'demo' ? !this.halted() : !!this.run && !this.halted(); }

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

    /** Try again after a failed run: same variant and seed, a fresh cell, predictions kept. */
    retry() {
      if (this.phase !== 'result' || this.goal) return { ok: false, reason: 'phase' };
      if (this.run) this.run.cell.detachRecorder(this.run.recorder);
      this.run = null; this.record = null; this.monitorResult = null; this.goal = false;
      this.newRun();
      this.enter(this.phases.indexOf('run'));
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
      return this.def.labConfig(this.variant, Object.assign({ phase: this.phase, revealed, scene: this.phase === 'scenes' ? this.scene.index : null,
        design: this.design }, extraState || {}));
    }
    /** A key that changes whenever the labConfig would (the revealed genes), so the app knows to rebuild its panels. */
    labConfigKey() {
      const mon = this.run && this.run.monitor.save ? this.run.monitor.save() : null;
      return this.phase + '|' + (mon && mon.revealed ? Object.keys(mon.revealed).sort().join(',') : '');
    }
    hud() {
      if (!this.def.hud) return null;
      let state = this.run && this.run.monitor.save ? this.run.monitor.save() : null;
      if (this.phase === 'demo') state = this.demo.monitor && this.demo.monitor.save ? Object.assign({ demo: true }, this.demo.monitor.save()) : { demo: true };
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
      const demo = this.phase === 'demo';
      const mon = demo ? this.demo.monitor : this.run && this.run.monitor;
      return { variant: this.variant, design: this.design, monitor: mon && mon.save ? mon.save() : null, phase: this.phase };
    }

    // --- scoring and the code (§6, §10) -------------------------------------------------
    answersForScore() {
      const predictions = {}, debrief = {};
      for (const id of Object.keys(this.answers)) predictions[id] = copy(this.answers[id]);
      for (const id of Object.keys(this.debriefState)) debrief[id] = copy(this.debriefState[id]);
      return { predictions, debrief };
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
        goal: this.goal, comp, debrief: this.debriefState, variantSeed: this.variantSeed, attempt: this.attempt,
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
        attempt: this.override ? 0 : this.attempt, runs: Math.max(1, this.runs), override: this.override,
        answers, debrief: copy(this.taps),
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
        echoIndex: this.echoIndex, cards: this.cards.slice(), withoutGoal: this.withoutGoal, design: copy(this.design),
        demo: { done: this.demo.done, record: copy(this.demo.record), result: copy(this.demo.result) },
        epilogue: copy(this.epilogue),
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
    const r = new LevelRunner(o);
    if (s.levelId !== def.id) throw new Error('saved level ' + s.levelId + ' is not ' + def.id);
    r.started = true;
    r.phaseIndex = Math.max(0, def.phases.indexOf(s.phase));
    r.runs = s.runs || 0;
    r.answers = copy(s.answers) || {};
    r.selected = copy(s.selected) || {};
    r.debriefState = copy(s.debrief) || {};
    r.taps = copy(s.taps) || [];
    r.beat = copy(s.beat) || null;
    r.outroShown = !!s.outroShown;
    r.scene = copy(s.scene) || { index: 0, line: 0 };
    r.echoIndex = s.echoIndex || 0;
    r.cards = (s.cards || []).slice();
    r.withoutGoal = !!s.withoutGoal;
    r.design = copy(s.design) || null;
    r.demo = { done: !!(s.demo && s.demo.done), cell: null, record: s.demo ? copy(s.demo.record) : null, result: s.demo ? copy(s.demo.result) : null };
    r.epilogue = copy(s.epilogue) || { startTick: null, done: false, started: false };
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
        if (info.question && !info.solved) answer(info.scene.question);
        if (!r.sceneNext().ok) r.next();
        continue;
      }
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
      const comp = def.score ? (def.score(variant, monitorResult, { predictions, debrief }, { demo, design, withoutGoal: false, par }) || {}) : {};
      const r = summarise(def, {
        goal: !!monitorResult.goal, comp, debrief, variantSeed, attempt: L.attempt, runs: L.runs, override: L.override, record,
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

  const game = { makeCell, playHeadless, LevelRunner, answerRecord, markTable, debriefFromTaps, summarise, monitorFeed, verifyRunFile, checkExpect, parRunner };
  return { LevelRunner, game };
});
