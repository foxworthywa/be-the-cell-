// @deps btc-cell btc-level-kit btc-levels btc-score btc-code
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
 *   r.echoNext()                                     "Meanwhile, in you"
 *   r.preview()                                      score components so far (the result sheet)
 *   r.result, r.code, r.runFile(extra), r.save(), LevelRunner.restore(def, saved, opts)
 *
 * The run's cell gets the level monitor through a recorder: after every step
 * it passes the user commands that have been applied (LogEntries, in order),
 * calls monitor.onTick(cell) and asks monitor.end(). The same happens in a
 * replay, so the headless player, the app and verify-run agree.
 *
 * Option values of choice questions are canonical option indices (the order
 * in the level file); solutions may write 'ok' for the right option.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../engine/btc-cell.js'), require('./btc-level-kit.js'), require('./btc-levels.js'),
      require('./btc-score.js'), require('./btc-code.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    var api = factory({ Cell: B.Cell, ENGINE_VERSION: B.ENGINE_VERSION }, B.levelKit, B.levels, B.score, B.code);
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

  /**
   * Builds a cell from a level config. Engine builds before LEVELS R-E3 reject an opaque
   * config.variant; the cell is then built without it (the variant still goes into the
   * code, the result and the run file), so levels run on either engine.
   */
  function makeCell(config) {
    try { return new Cell(config); } catch (e) {
      if (e && e.name === 'ConfigError' && config && config.variant && /^variant/.test(String(e.path || ''))) {
        const c = Object.assign({}, config);
        delete c.variant;
        return new Cell(c);
      }
      throw e;
    }
  }

  function localDate() {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
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
      this.design = null;
      this.epilogue = { startTick: null, done: false };
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
        this.ensureRun();
        this.log('run_start', { speed: this.speedFn ? this.speedFn() : null });
      } else if (p === 'result') {
        if (this.goal && def.story.outro.length && !this.outroShown) this.beat = { name: 'outro', index: 0 };
      } else if (p === 'epilogue') {
        this.epilogue = { startTick: this.run ? this.run.cell.tick : 0, done: false };
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
    beatLines(name) { return (this.def.story[name] || []); }
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
      let v = value === undefined ? this.selected[id] : value;
      if (v === undefined || v === null) return { ok: false, reason: 'no answer' };
      const a = { locked: true, value: v };
      if (it.kind === 'choice') {
        v = this.resolveOption(it, v);
        const o = it.options[v];
        if (!o) return { ok: false, reason: 'no such option' };
        a.value = v; a.option = v; a.correct = o.ok === true; a.mc = o.mc || null;
      } else if (it.kind === 'number') {
        const x = Math.max(it.min, Math.min(it.max, Number(v)));
        if (!(x === x)) return { ok: false, reason: 'not a number' };
        a.value = x;
        const ans = it.answer(this.variant, { demo: this.demo.result });
        a.answer = ans;
        a.correct = ans !== 0 ? Math.abs(x - ans) / Math.abs(ans) <= it.tolerance : x === 0;
      }
      this.answers[id] = a;
      delete this.selected[id];
      const d = { id, kind: it.kind };
      if (it.kind === 'sketch') d.points = Array.isArray(v) ? v.filter(Boolean).length : 0;
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

    attachRun(cell, saved) {
      const def = this.def;
      const monitor = def.monitor(this.variant, { dt: cell.dt, K, variant: this.variant, design: this.design });
      if (saved && saved.monitor !== undefined && monitor.restore) monitor.restore(copy(saved.monitor));
      const run = {
        cell, monitor, logIdx: saved ? saved.logIdx : 0,
        endReason: saved ? saved.endReason : null, endTick: saved ? saved.endTick : null,
      };
      const runner = this;
      run.recorder = {
        onTick(c) {
          if (runner.run !== run) return;
          const log = c.log;
          while (run.logIdx < log.length) {
            const e = log[run.logIdx];
            if (e.source !== 'user') { run.logIdx++; continue; }
            if (!(e.tick < c.tick)) break;             // not applied yet
            run.logIdx++;
            if (monitor.userCommand) monitor.userCommand(copy(e));
            const d = { seq: e.seq, type: e.type, args: copy(e.args) || {}, ok: !e.rejected };
            if (e.rejected) d.code = e.rejected;
            runner.log('cmd', d, e.tick);
          }
          monitor.onTick(c);
          if (!run.endReason) {
            const r = monitor.end();
            if (r) runner.endRun(r, c.tick);
          }
          if (runner.phase === 'epilogue' && !runner.epilogue.done && def.epilogue &&
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
      if (!this.run) return true;
      if (this.phase === 'epilogue') return this.epilogue.done;
      if (this.phase === 'run') return !!this.run.endReason;
      return true;
    }
    /** True when time may run for the cell on screen. */
    canRun() { return !!this.run && !this.halted(); }

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
      this.demo = { done: false, cell, record: null, result: null };
      return cell;
    }
    /** The app or the headless player calls this after stepping the demo cell. */
    checkDemo() {
      const d = this.demo;
      if (!d.cell || d.done) return d.done;
      if (d.cell.tick >= this.def.demo.durationTicks) {
        d.done = true;
        d.record = d.cell.runRecord();
        d.result = this.def.demoResult ? copy(this.def.demoResult(this.variant, d.cell)) : null;
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
    labConfig(extraState) {
      return this.def.labConfig(this.variant, Object.assign({ phase: this.phase, revealed: {}, scene: this.phase === 'scenes' ? this.scene.index : null }, extraState || {}));
    }
    hud() {
      if (!this.def.hud) return null;
      const state = this.run && this.run.monitor.save ? this.run.monitor.save() : null;
      return this.def.hud(this.variant, state);
    }
    /** Level narrator rules with the read-only `level` object of §5.5.4 as their fourth argument. */
    narratorRules() {
      const runner = this;
      return this.def.narratorRules.map((r) => ({
        key: r.key, template: this.text(r.template), gene: r.gene || null, preempt: !!r.preempt,
        when: (f, m, t) => r.when(f, m, t, runner.levelView()),
      }));
    }
    levelView() {
      return { variant: this.variant, design: this.design, monitor: this.run && this.run.monitor.save ? this.run.monitor.save() : null, phase: this.phase };
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
        { demo: this.demo.result, design: this.design, withoutGoal: this.withoutGoal }) || {};
    }

    finish() {
      if (this.result) return this.result;
      const def = this.def;
      const comp = def.score ? (def.score(this.variant, this.monitorResult || {}, this.answersForScore(),
        { demo: this.demo.result, design: this.design, withoutGoal: this.withoutGoal }) || {}) : {};
      const qs = def.debrief;
      let first = 0;
      for (const q of qs) if (this.debriefState[q.id] && this.debriefState[q.id].firstCorrect) first++;
      const D = [first, qs.length];
      const scored = def.scored;
      const G = scored ? (this.goal ? 1 : 0) : 1;
      // Efficiency against par counts only when the goal was met (§6.1), so a missed goal reports E 0.
      const E = scored ? (G && typeof comp.E === 'number' ? S.clamp01(comp.E) : 0) : null;
      const P = scored && typeof comp.P === 'number' ? S.clamp01(comp.P) : null;
      const X = comp.X || 0;
      const flagIds = LV.flagList(def).map((f) => f.id);
      const evidence = (comp.flags || []).map((f) => (typeof f === 'string' ? { id: f } : copy(f)))
        .filter((f, i, a) => flagIds.indexOf(f.id) >= 0 && a.findIndex((g) => g.id === f.id) === i);
      this.flagEvidence = evidence;
      const total = scored ? S.total({ G, E, P, D }) : null;
      const digest = scored && this.record ? this.record.finalHash.slice(0, 6).toUpperCase() : '000000';
      const engine = (this.record && this.record.engineVersion) || ENG.ENGINE_VERSION;
      this.code = CODE.encode({
        level: def.code, variantSeed: this.variantSeed, G, E: S.percent(E), P: S.percent(P), D, X,
        flags: S.flagMask(flagIds, evidence), attempt: this.override ? 0 : this.attempt, runs: Math.max(1, this.runs),
        engine, content: def.version, digest,
      });
      this.result = {
        attempt: this.override ? 0 : this.attempt, variantSeed: this.variantSeed, content: def.version, engine,
        runs: Math.max(1, this.runs), G, E, P, D, X, flags: evidence.map((f) => f.id), total, code: this.code,
        date: this.today(), override: this.override,
      };
      for (const f of evidence) this.log('flag', { id: f.id, evidence: f });
      this.log('score', { G, E, P, D, X, total });
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
    r.epilogue = copy(s.epilogue) || { startTick: null, done: false };
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
        if (runner.phase === 'run' && sol.every && cell.tick % sol.every === 0) sol.act(cell.observe(), cell.tick, api(runner));
        if (runner.phase === 'epilogue' && sol.epilogue && cell.tick % (sol.epilogue.every || 1) === 0) {
          sol.epilogue.act(cell.observe(), cell.tick, api(runner));
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
          const v = sol.predictions ? sol.predictions[it.id] : undefined;
          if (v !== undefined) r.lock(it.id, typeof v === 'function' ? v(r.variant) : v);
          else if (it.expert) r.skip(it.id);
          else r.lock(it.id, it.kind === 'choice' ? 'ok' : undefined);
        }
      } else if (p === 'demo') {
        const cell = r.startDemo();
        while (!r.checkDemo()) { cell.step(); cell.takeEvents(); }
      } else if (p === 'design') {
        if (sol.design) r.setDesign(sol.design);
      } else if (p === 'run') {
        stepCell(r, r.run.cell, () => !!r.run.endReason);
        if (!r.run.endReason) throw new Error('level ' + def.id + ': the run did not end within ' + maxTicks + ' ticks');
      } else if (p === 'result') {
        if (!r.goal) {
          if (o.retryFailed && !retried) { retried = true; r.retry(); continue; }
          r.continueWithoutGoal();
          continue;
        }
      } else if (p === 'epilogue') {
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

  const game = { makeCell, playHeadless, LevelRunner };
  return { LevelRunner, game };
});
