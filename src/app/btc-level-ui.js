// @deps btc-content btc-format btc-layout btc-pwa btc-home
/*
 * Be the Cell: the level screens (LEVELS §5.2–5.9): story beats, the task
 * card, prediction sheets, the result, the debrief, "Meanwhile, in you" and
 * the completion screen with its code. The Prologue's scene lines and its
 * question use the same story sheet.
 *
 * Everything here reads the level runner (BTC.LevelRunner) and changes it
 * only through its methods; after each change sync() shows what the runner's
 * state asks for. Nothing advances because time passed: every line waits for
 * a tap. Sheets are bottom sheets on a phone (story ≤ 50% of the height,
 * the others full height) and centred dialogs (≤ 560 px) elsewhere; level
 * sheets have no close button, because their own buttons move on.
 *
 * Pure helpers (test L-13): LevelUI.codeLines(code, perLine), LevelUI.scoreLines(result).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'),
      require('./btc-pwa.js'), require('./btc-home.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.LevelUI = factory(B.content, B.format, B.layout, B.pwa, B.HomeView);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY, PWA, Home) {
  'use strict';

  const G = C.game;
  const textAt = (def, key) => String(key).split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), def.text);
  const pct = (x) => (typeof x === 'number' ? String(Math.round(100 * x)) : '–');

  /** The code split at its hyphens into lines of at most perLine characters (the hyphen stays at the line end). */
  function codeLines(code, perLine) {
    const parts = code.split('-').map((p, i, a) => (i < a.length - 1 ? p + '-' : p));
    const lines = [];
    let cur = '';
    for (const p of parts) {
      if (cur && cur.length + p.length > perLine) { lines.push(cur); cur = ''; }
      cur += p;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** The score lines of the completion screen, in the words of §6.1. */
  function scoreLines(res) {
    const K = G.complete;
    if (res.total === null || res.total === undefined) return [K.notScored];
    const lines = [];
    lines.push([res.G ? K.goalMet : K.goalNotMet, F.fill(K.efficiency, { v: pct(res.E) }), F.fill(K.prediction, { v: pct(res.P) })].join(' · '));
    lines.push([F.fill(K.debrief, { a: res.D[0], b: res.D[1] }), F.fill(K.expert, { v: res.X })].join(' · '));
    lines.push(F.fill(K.total, { v: res.total }));
    return lines;
  }

  class LevelUI {
    constructor(app) {
      this.app = app;
      this.runner = null;
      this.def = null;
      this.debriefIndex = 0;
      this.lastPhase = null;
    }

    bind(runner) {
      this.runner = runner;
      this.def = runner.def;
      this.debriefIndex = 0;
      this.lastPhase = runner.phase;
      this.completed = false;
    }
    unbind() { this.close(); this.runner = null; this.def = null; }
    title() { return this.def ? Home.nameOf(this.def) : ''; }

    close() {
      const cur = LY.currentSheet();
      if (cur && cur.key && cur.key.indexOf('lv:') === 0) cur.close();
    }

    /** After any change to the runner: save on a phase change, then show what the state asks for. */
    after() {
      const r = this.runner;
      if (!r) return;
      if (r.phase !== this.lastPhase) {
        this.lastPhase = r.phase;
        if (r.phase === 'debrief') this.debriefIndex = 0;
        this.app.levelPhaseChanged(r);
      } else this.app.levelChanged();
      this.sync();
    }

    /** Shows the sheet (or none) for the runner's state; the app shows the screen behind it. */
    sync() {
      const r = this.runner;
      if (!r) return;
      this.app.showLevelScreen(r);
      if (r.phase === 'scenes') return this.scene();
      if (r.beat) return this.story();
      switch (r.phase) {
        case 'intro': return this.story();
        case 'task': return this.task(false);
        case 'predict': case 'predict2': return this.predict();
        case 'run': case 'epilogue': return this.close();
        case 'result': return this.result();
        case 'debrief': return this.debrief();
        case 'echo': return this.echo();
        case 'complete': return this.complete();
        default: return this.placeholder();
      }
    }

    /** Opens a level sheet, or rebuilds the open one with the same key in place. */
    sheet(key, opts, build) {
      const k = 'lv:' + key;
      const cur = LY.currentSheet();
      if (cur && cur.key === k) {
        const top = cur.body.scrollTop;          // a rebuild in place keeps the student's place in a long sheet
        cur.body.textContent = '';
        if (opts.title !== undefined) LY.setText(cur.title, opts.title);
        build(cur.body);
        cur.body.scrollTop = top;
        this.focusPrimary(cur.sheet);
        return cur;
      }
      const st = LY.openSheet(Object.assign({ closable: false, key: k, build }, opts));
      this.focusPrimary(st.sheet);
      return st;
    }
    focusPrimary(sheet) {
      const b = sheet.querySelector('[data-primary]:not([disabled])') || sheet.querySelector('button:not([disabled])');
      if (b && document.activeElement !== b) b.focus({ preventScroll: true });
    }

    // --- story beats (§5.2) ------------------------------------------------------------
    speaker(who, count) {
      const h = LY.h;
      return h('div', { class: 'lv-speaker' + (who === 'commander' ? ' is-you' : '') }, [
        h('span', { class: 'lv-who', text: G.speakers[who] || who }), count ? h('span', { class: 'lv-count num', text: count }) : null,
      ]);
    }

    story() {
      const r = this.runner, h = LY.h, line = r.storyLine();
      if (!line) return this.close();
      this.sheet('story', { className: 'lv-sheet lv-story', backdropClass: 'lv-dim', label: G.speakers[line.who] }, (body) => {
        body.appendChild(this.speaker(line.who, F.fill(G.lineOf, { i: line.index + 1, n: line.count })));
        body.appendChild(h('p', { class: 'lv-line', 'aria-live': 'polite', text: line.text }));
        const next = h('button', { class: 'btn primary lv-next', type: 'button', 'data-primary': '', onclick: () => {
          if (line.last) r.next(); else r.storyNext();
          this.after();
        } }, line.last ? G.continue : G.next);
        const skip = line.last ? h('span') : h('button', { class: 'btn lv-skip', type: 'button', onclick: () => { r.storySkip(); this.after(); } }, G.skipStory);
        body.appendChild(h('div', { class: 'lv-actions' }, [skip, next]));
      });
    }

    // --- Prologue scenes (§7.P) --------------------------------------------------------
    scene() {
      const r = this.runner, h = LY.h, info = r.sceneInfo();
      const tall = !!info.question;
      this.sheet('scene', { className: 'lv-sheet lv-story' + (tall ? ' lv-tall' : ''), backdropClass: 'lv-dim lv-clear', label: G.speakers[info.who] }, (body) => {
        body.appendChild(this.speaker(info.who, info.lines > 1 ? F.fill(G.lineOf, { i: info.line + 1, n: info.lines }) : ''));
        body.appendChild(h('p', { class: 'lv-line', 'aria-live': 'polite', text: info.text }));
        if (info.question) body.appendChild(this.questionBlock(info.scene.question));
        const blocked = info.question && !info.solved;
        const next = h('button', { class: 'btn primary lv-next', type: 'button', 'data-primary': '', disabled: blocked, onclick: () => {
          if (info.last) r.next(); else r.sceneNext();
          this.after();
        } }, info.last ? G.continue : G.next);
        const canSkip = !info.last && !blocked;
        const skip = canSkip ? h('button', { class: 'btn lv-skip', type: 'button', onclick: () => { r.sceneSkip(); this.after(); } }, G.skipStory) : h('span');
        body.appendChild(h('div', { class: 'lv-actions' }, [skip, next]));
      });
    }

    // --- questions answered with feedback and retries (debrief, the Prologue's question) ----
    questionBlock(qid) {
      const r = this.runner, h = LY.h, q = r.question(qid);
      const st = r.debriefState[qid] || { tries: [], solved: false };
      const box = h('div', { class: 'lv-question' });
      box.appendChild(h('p', { class: 'lv-prompt', text: r.text(q.prompt) }));
      const list = h('div', { class: 'lv-options', role: 'group', 'aria-label': r.text(q.prompt) });
      for (const idx of r.optionOrder(qid)) {
        const o = q.options[idx];
        const tried = st.tries.indexOf(idx) >= 0;
        const right = tried && o.ok === true;
        const wrong = tried && o.ok !== true;
        const kids = [];
        if (wrong) kids.push(h('span', { class: 'lv-mark' }, [h('span', { 'aria-hidden': 'true', text: '✗ ' }), G.debrief.notQuite]));
        if (right) kids.push(h('span', { class: 'lv-mark' }, [h('span', { 'aria-hidden': 'true', text: '✓ ' }), G.debrief.right]));
        kids.push(h('span', { class: 'lv-opt-text', text: r.text(o.t) }));
        if (tried) kids.push(h('span', { class: 'lv-fb', text: r.text(o.fb) }));
        list.appendChild(h('button', {
          class: 'btn lv-option' + (wrong ? ' is-wrong' : '') + (right ? ' is-right' : ''), type: 'button', 'data-option': String(idx),
          disabled: tried || st.solved, 'aria-disabled': tried || st.solved ? 'true' : null,
          onclick: () => {
            r.tap(qid, idx);
            this.after();
            // Keep the tapped option and its feedback in view (the sheet may scroll).
            const cur = LY.currentSheet();
            const el = cur && cur.body.querySelector('.lv-option[data-option="' + idx + '"]');
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
          },
        }, kids));
      }
      box.appendChild(list);
      return box;
    }

    // --- the task card (§5.3) ------------------------------------------------------------
    task(fromHud) {
      const r = this.runner, h = LY.h, def = this.def, T = def.text.task;
      const build = (body, close) => {
        body.appendChild(h('h3', { text: G.task.goal }));
        body.appendChild(h('p', { class: 'lv-goal', text: r.text(T.goal) }));
        body.appendChild(h('h3', { text: G.task.core }));
        body.appendChild(h('ul', { class: 'lv-objectives' }, T.core.map((t) => h('li', { text: r.text(t) }))));
        if (T.expert.length) {
          body.appendChild(h('h3', { text: G.task.expert }));
          body.appendChild(h('ul', { class: 'lv-objectives' }, T.expert.map((t) => h('li', { text: r.text(t) }))));
        }
        body.appendChild(h('p', { class: 'sheet-note', text: F.fill(G.task.time, { n: def.estMinutes }) }));
        if (fromHud) {
          body.appendChild(h('h3', { text: G.task.menu }));
          body.appendChild(h('div', { class: 'lv-menu' }, [
            h('button', { class: 'btn row-btn', type: 'button', onclick: () => this.confirmRestart() }, G.task.restart),
            h('button', { class: 'btn row-btn', type: 'button', onclick: () => this.replayStory() }, G.task.replay),
            h('button', { class: 'btn row-btn', type: 'button', onclick: () => this.app.downloadLevelRun() }, G.task.download),
          ]));
          body.appendChild(h('div', { class: 'lv-sticky' }, h('button', { class: 'btn primary lv-wide', type: 'button', 'data-primary': '', onclick: close }, G.task.back)));
        } else {
          body.appendChild(h('div', { class: 'lv-sticky' }, h('button', { class: 'btn primary lv-wide', type: 'button', 'data-primary': '',
            onclick: () => { r.next(); this.after(); } }, G.task.start)));
        }
      };
      if (fromHud) LY.openSheet({ title: this.title(), className: 'lv-sheet lv-full', build, key: 'task-hud' });
      else this.sheet('task', { title: this.title(), className: 'lv-sheet lv-full' }, build);
    }

    confirmRestart() {
      const h = LY.h;
      LY.openSheet({
        title: G.task.restart, build: (body, close) => {
          body.appendChild(h('p', { text: G.task.restartText }));
          body.appendChild(h('div', { class: 'lv-actions' }, [
            h('button', { class: 'btn', type: 'button', onclick: close }, G.stay),
            h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); this.app.restartLevel(); } }, G.task.restartConfirm),
          ]));
        },
      });
    }

    replayStory() {
      const r = this.runner, h = LY.h;
      const lines = r.replayLines('intro').concat(r.outroShown ? r.replayLines('outro') : []);
      LY.openSheet({
        title: G.task.replayTitle, className: 'lv-sheet', build: (body) => {
          for (const l of lines) {
            body.appendChild(this.speaker(l.who));
            body.appendChild(h('p', { class: 'lv-line lv-line-small', text: l.text }));
          }
        },
      });
    }

    // --- predictions (§5.4) ------------------------------------------------------------
    predict() {
      const r = this.runner, h = LY.h;
      const it = r.currentItem();
      if (!it) { r.next(); return this.after(); }
      const items = r.items(), i = items.indexOf(it) + 1;
      const title = F.fill(G.predict.itemOf, { i, n: items.length }) + (it.expert ? ' · ' + G.predict.expert : '');
      this.sheet('predict:' + it.id, { title, className: 'lv-sheet lv-full' }, (body) => {
        body.appendChild(h('p', { class: 'lv-prompt', text: r.text(it.prompt) }));
        const lockBtn = h('button', { class: 'btn primary lv-wide', type: 'button', 'data-primary': '', disabled: true }, G.predict.lockIn);
        const actions = [];
        if (it.kind === 'choice') {
          const list = h('div', { class: 'lv-options', role: 'radiogroup', 'aria-label': r.text(it.prompt) });
          const buttons = [];
          const paint = () => {
            const sel = r.selected[it.id];
            for (const b of buttons) {
              const on = Number(b.getAttribute('data-option')) === sel;
              b.classList.toggle('is-selected', on);
              b.setAttribute('aria-checked', on ? 'true' : 'false');
            }
            lockBtn.disabled = sel === undefined;
          };
          for (const idx of r.optionOrder(it.id)) {
            const b = h('button', { class: 'btn lv-option', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-option': String(idx),
              onclick: () => { r.select(it.id, idx); paint(); } }, h('span', { class: 'lv-opt-text', text: r.text(it.options[idx].t) }));
            buttons.push(b);
            list.appendChild(b);
          }
          body.appendChild(list);
          paint();
          lockBtn.addEventListener('click', () => { if (r.lock(it.id).ok) this.afterLock(); });
        } else if (it.kind === 'number') {
          const input = h('input', { class: 'lv-number num', type: 'text', inputmode: 'numeric', 'aria-label': G.predict.numberLabel, autocomplete: 'off' });
          const clampNote = h('p', { class: 'sheet-note', text: F.fill(G.predict.clamped, { min: it.min, max: it.max }) });
          const read = () => { const v = Number(String(input.value).replace(/[^0-9.]/g, '')); return input.value === '' || !(v === v) ? null : v; };
          const set = (v) => { const x = Math.max(it.min, Math.min(it.max, v)); input.value = String(x); r.select(it.id, x); lockBtn.disabled = false; };
          const step = (d) => set((read() === null ? it.min : read()) + d * it.step);
          input.addEventListener('input', () => { const v = read(); if (v === null) { lockBtn.disabled = true; return; } r.select(it.id, v); lockBtn.disabled = false; });
          input.addEventListener('change', () => { const v = read(); if (v !== null) set(v); });
          if (r.selected[it.id] !== undefined) { input.value = String(r.selected[it.id]); lockBtn.disabled = false; }
          body.appendChild(h('div', { class: 'lv-stepper' }, [
            h('button', { class: 'btn lv-step', type: 'button', 'aria-label': G.predict.less, onclick: () => step(-1) }, '−'),
            input,
            h('button', { class: 'btn lv-step', type: 'button', 'aria-label': G.predict.more, onclick: () => step(1) }, '+'),
            it.unit ? h('span', { class: 'lv-unit', text: r.text(it.unit) }) : null,
          ]));
          body.appendChild(clampNote);
          lockBtn.addEventListener('click', () => { const v = read(); if (v !== null && r.lock(it.id, Math.max(it.min, Math.min(it.max, v))).ok) this.afterLock(); });
        }
        body.appendChild(h('p', { class: 'sheet-note', text: G.predict.note }));
        if (it.expert) actions.push(h('button', { class: 'btn', type: 'button', onclick: () => { r.skip(it.id); this.afterLock(); } }, G.predict.skipExpert));
        actions.push(lockBtn);
        body.appendChild(h('div', { class: 'lv-sticky lv-actions' }, actions));
      });
    }
    afterLock() {
      const r = this.runner;
      if (!r.currentItem()) r.next();
      this.app.saveLevel();
      this.after();
    }

    // --- the result (§5.6) --------------------------------------------------------------
    result() {
      const r = this.runner, h = LY.h, R = G.result;
      const prev = r.preview();
      this.sheet('result', { title: R.title, className: 'lv-sheet lv-full' }, (body) => {
        const reason = R.reasons[r.run && r.run.endReason] || R.reasons.done;
        body.appendChild(h('p', { class: 'lv-outcome ' + (r.goal ? 'is-met' : 'is-not'), text: r.goal ? R.met : F.fill(R.notMet, { reason }) }));
        if (r.goal && typeof prev.E === 'number') {
          const E = Math.max(0, Math.min(1, prev.E)), within = E >= 0.8;
          body.appendChild(h('div', { class: 'lv-eff' }, [
            h('div', { class: 'lv-eff-head' }, [h('span', { text: R.efficiency }), h('span', { class: 'num', text: pct(E) + ' · ' + (within ? R.withinPar : R.overPar) })]),
            h('div', { class: 'lv-eff-bar', role: 'img', 'aria-label': R.efficiency + ' ' + pct(E) + ', ' + (within ? R.withinPar : R.overPar) }, [
              h('span', { class: 'lv-eff-fill' + (within ? ' is-within' : ''), style: { width: (100 * E).toFixed(1) + '%' } }),
              h('span', { class: 'lv-eff-par', style: { left: '80%' } }, h('span', { class: 'lv-eff-par-label', text: R.parMark })),
            ]),
          ]));
        }
        const review = this.reviewCards('predict');
        if (review.length) {
          body.appendChild(h('h3', { text: R.predictions }));
          for (const c of review) body.appendChild(c);
        }
        const actions = [];
        if (r.goal) {
          actions.push(h('button', { class: 'btn primary lv-wide', type: 'button', 'data-primary': '', onclick: () => { r.next(); this.after(); } }, R.continue));
        } else {
          body.appendChild(h('p', { class: 'sheet-note', text: R.tryAgainNote }));
          actions.push(h('button', { class: 'btn', type: 'button', onclick: () => { r.continueWithoutGoal(); this.after(); } }, R.withoutGoal));
          actions.push(h('button', { class: 'btn primary', type: 'button', 'data-primary': '', onclick: () => { this.app.retryRun(); } }, R.tryAgain));
        }
        body.appendChild(h('div', { class: 'lv-sticky lv-actions' }, actions));
      });
    }

    /** "You predicted … / What happened …" cards for the locked items of a phase. */
    reviewCards(phase) {
      const r = this.runner, h = LY.h, R = G.result, out = [];
      for (const it of r.items(phase)) {
        const a = r.answers[it.id];
        if (!a) continue;
        const kids = [h('p', { class: 'lv-review-q', text: r.text(it.prompt) })];
        if (a.skipped) kids.push(h('p', { text: R.skipped }));
        else if (it.kind === 'choice') {
          const o = it.options[a.option];
          kids.push(h('p', { class: 'lv-review-a' }, [h('span', { class: 'lv-mark', 'aria-hidden': 'true', text: a.correct ? '✓ ' : '✗ ' }), F.fill(R.predicted, { option: r.text(o.t) })]));
          kids.push(h('p', { text: F.fill(R.happened, { fb: r.text(o.fb) }) }));
        } else if (it.kind === 'number') {
          kids.push(h('p', { text: F.fill(R.estimate, { v: a.value }) }));
          kids.push(h('p', { text: a.correct ? R.estimateRight : R.estimateWrong }));
        }
        out.push(h('div', { class: 'lv-review' + (a.correct ? ' is-right' : a.skipped ? '' : ' is-wrong') }, kids));
      }
      return out;
    }

    // --- the debrief (§5.7) ----------------------------------------------------------------
    debrief() {
      const r = this.runner, h = LY.h, qs = this.def.debrief;
      const i = Math.min(this.debriefIndex, qs.length - 1), q = qs[i];
      const solved = !!(r.debriefState[q.id] && r.debriefState[q.id].solved);
      this.sheet('debrief', { title: F.fill(G.debrief.questionOf, { i: i + 1, n: qs.length }), className: 'lv-sheet lv-full' }, (body) => {
        if (i === 0 && r.has('predict2')) {
          const review = this.reviewCards('predict2');
          for (const c of review) body.appendChild(c);
        }
        body.appendChild(this.questionBlock(q.id));
        body.appendChild(h('div', { class: 'lv-sticky lv-actions' }, h('button', {
          class: 'btn primary lv-wide', type: 'button', 'data-primary': '', disabled: !solved,
          onclick: () => {
            if (i < qs.length - 1) { this.debriefIndex = i + 1; this.sync(); } else { r.next(); this.after(); }
          },
        }, G.continue)));
      });
    }

    // --- Meanwhile, in you (§5.8) ----------------------------------------------------------
    echo() {
      const r = this.runner, h = LY.h, s = r.echoScreen();
      if (!s) return this.close();
      this.sheet('echo', { title: G.echo.heading, className: 'lv-sheet lv-full lv-echo' }, (body) => {
        body.appendChild(h('p', { class: 'lv-echo-text', text: s.text }));
        if (s.last) {
          body.appendChild(h('h3', { text: G.echo.cardsHeading }));
          body.appendChild(h('div', { class: 'card-tiles' }, this.def.echo.cards.map((c) => Home.cardTile({ id: c.id, title: textAt(this.def, c.title), stamp: c.stamp }))));
        }
        body.appendChild(h('div', { class: 'lv-sticky lv-actions' }, h('button', {
          class: 'btn primary lv-wide', type: 'button', 'data-primary': '',
          onclick: () => { if (s.last) r.next(); else r.echoNext(); this.after(); },
        }, s.last ? G.continue : G.next)));
      });
    }

    // --- the completion screen (§5.9) --------------------------------------------------------
    complete() {
      const r = this.runner, h = LY.h, app = this.app, K = G.complete, res = r.result;
      if (!this.completed) { this.completed = true; app.levelCompleted(r); }
      this.sheet('complete', { title: this.title(), className: 'lv-sheet lv-full lv-complete' }, (body) => {
        const lines = scoreLines(res);
        body.appendChild(h('div', { class: 'lv-score' }, lines.map((t, i) => h('p', { class: i === lines.length - 1 && res.total !== null ? 'lv-total' : '', text: t }))));
        if (r.cards.length && !r.has('echo')) {
          const names = this.def.echo.cards.map((c) => textAt(this.def, c.title) + ' (' + (c.stamp === 'universal' ? G.echo.universal : G.echo.bacteria) + ')');
          body.appendChild(h('p', { class: 'sheet-note', text: F.fill(K.cardsCollected, { list: names.join(', ') }) }));
        }
        const perLine = Math.max(16, Math.floor((Math.min(560, window.innerWidth) - 72) / 10.9));
        const codeEl = h('div', { class: 'code-box num', 'aria-label': K.codeLabel + ' ' + r.code }, codeLines(r.code, perLine).map((l) => h('span', { class: 'code-line-part', text: l })));
        body.appendChild(h('p', { class: 'code-caption', text: K.codeLabel }));
        body.appendChild(codeEl);
        const status = h('p', { class: 'lv-copy-status', 'aria-live': 'polite' });
        const row = [h('button', { class: 'btn primary', type: 'button', 'data-primary': '', 'data-action': 'copy-code', onclick: () => {
          PWA.copyText(r.code, codeEl).then((how) => {
            LY.setText(status, how === 'copied' ? K.copied : K.copyFailed);
            app.logEvent('code', { code: r.code, action: how === 'copied' ? 'copied' : 'copy-failed' });
          });
        } }, K.copy)];
        if (typeof navigator !== 'undefined' && navigator.share) {
          row.push(h('button', { class: 'btn', type: 'button', 'data-action': 'share-code', onclick: () => {
            navigator.share({ title: K.shareTitle, text: r.code }).then(() => app.logEvent('code', { code: r.code, action: 'shared' }), () => {});
          } }, K.share));
        }
        body.appendChild(h('div', { class: 'lv-actions lv-actions-start' }, row));
        body.appendChild(status);
        body.appendChild(h('p', { class: 'lv-keep', text: K.keep }));
        const more = [];
        if (this.def.scored) {
          more.push(h('button', { class: 'btn', type: 'button', onclick: () => app.downloadLevelRun() }, K.download));
          more.push(h('button', { class: 'btn', type: 'button', onclick: () => app.playAgain() }, K.again));
        }
        if (more.length) body.appendChild(h('div', { class: 'lv-actions lv-actions-start' }, more));
        const nextDef = app.BTC.levels.after(this.def.id);
        const last = [];
        if (nextDef) {
          last.push(h('button', { class: 'btn', type: 'button', 'data-action': 'next-level', onclick: () => app.enterLevel(nextDef.id) },
            this.def.scored ? K.next + ' ›' : F.fill(K.startNamed, { id: nextDef.id })));
        }
        last.push(h('button', { class: 'btn', type: 'button', 'data-action': 'levels', onclick: () => app.enterHome() }, K.levels));
        body.appendChild(h('div', { class: 'lv-actions lv-actions-start' }, last));
      });
    }

    /** Phases whose screens arrive with later levels (demo: 1.2, design: 1.7): a plain Continue. */
    placeholder() {
      const r = this.runner, h = LY.h;
      this.sheet('placeholder', { title: this.title(), className: 'lv-sheet' }, (body) => {
        body.appendChild(h('button', { class: 'btn primary lv-wide', type: 'button', onclick: () => {
          if (r.phase === 'demo') { const c = r.startDemo(); while (!r.checkDemo()) { c.step(); c.takeEvents(); } }
          r.next(); this.after();
        } }, G.continue));
      });
    }

    // --- leaving (§4.5) -----------------------------------------------------------------------
    confirmLeave(onLeave) {
      const h = LY.h;
      LY.openSheet({
        title: G.leaveTitle, build: (body, close) => {
          body.appendChild(h('p', { text: G.leaveText }));
          body.appendChild(h('div', { class: 'lv-actions' }, [
            h('button', { class: 'btn', type: 'button', onclick: close }, G.stay),
            h('button', { class: 'btn primary', type: 'button', 'data-action': 'leave', onclick: () => { close(); onLeave(); } }, G.leave),
          ]));
        },
      });
    }
  }

  LevelUI.codeLines = codeLines;
  LevelUI.scoreLines = scoreLines;
  return LevelUI;
});
