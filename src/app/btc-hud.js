// @deps btc-content btc-format btc-layout
/*
 * Be the Cell: the level HUD (LEVELS §5.5.2), one row in the #hud slot: 44 px
 * in compact, 40 px elsewhere, 0 px outside levels and in the Prologue.
 *
 *   [ goal chip (flex, tap: task card) ][ timer ][ counter ]
 *
 * The level supplies the words through def.hud(variant, monitorState):
 * {goal: {text, progress: 0..1|null, done}, timer: {text}, counter: {text, short}}.
 * Under 400 px of width the counter shows only its short form. State is
 * never colour alone: the goal chip carries words. When the run ends with the
 * goal met (or an epilogue has run its time) the goal chip becomes a
 * "Goal met · Continue" button. Text is written only when it changes; the app
 * calls update() at most 4 times per real second.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.Hud = factory(B.content, B.format, B.layout);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY) {
  'use strict';

  const G = C.game.hud;
  const NARROW = 400;

  /**
   * The strings the HUD shows for a model (pure; L-13): the counter's short form under
   * 400 px, the goal chip's continue wording when the run is over.
   */
  function texts(model, width, mode) {
    const m = model || {};
    const goal = m.goal || { text: '', progress: null, done: false };
    const narrow = width < NARROW;
    let goalText = goal.text || '';
    if (mode === 'met') goalText = G.goalMet;
    else if (mode === 'continue') goalText = G.continue;
    return {
      goal: goalText,
      progress: typeof goal.progress === 'number' && mode !== 'met' && mode !== 'continue' ? Math.max(0, Math.min(1, goal.progress)) : null,
      timer: (m.timer && m.timer.text) || '',
      counter: m.counter ? (narrow && m.counter.short ? m.counter.short : m.counter.text) : '',
      label: F.fill(G.taskLabel, { text: goal.text || '' }),
    };
  }

  class Hud {
    /** opts: {onGoal()} — the goal chip's tap (the task card, or Continue when the run is over). */
    constructor(opts) {
      this.opts = opts || {};
      this.mode = null;
      this.el = null;
      this.lastProgress = -1;
    }

    mount(root) {
      const h = LY.h;
      this.root = root;
      this.el = {
        goalText: h('span', { class: 'hud-goal-text num' }),
        bar: h('span', { class: 'hud-bar-fill' }),
        timer: h('span', { class: 'hud-chip hud-timer num', role: 'timer' }),
        counter: h('span', { class: 'hud-chip hud-counter num' }),
      };
      this.el.barWrap = h('span', { class: 'hud-bar', 'aria-hidden': 'true' }, this.el.bar);
      this.el.goal = h('button', { class: 'hud-chip hud-goal', type: 'button', onclick: () => this.opts.onGoal && this.opts.onGoal() },
        [this.el.goalText, this.el.barWrap]);
      root.textContent = '';
      root.appendChild(h('div', { class: 'hud-row' }, [this.el.goal, this.el.timer, this.el.counter]));
    }

    /** mode: null (running), 'met' (goal met, Continue) or 'continue' (the epilogue is over). */
    update(model, width, mode) {
      if (!this.el) return;
      const t = texts(model, width, mode);
      LY.setText(this.el.goalText, t.goal);
      LY.setText(this.el.timer, t.timer);
      LY.setText(this.el.counter, t.counter);
      this.el.counter.hidden = !t.counter;
      if (this.mode !== mode) {
        this.mode = mode;
        this.el.goal.classList.toggle('is-continue', !!mode);
      }
      const label = mode ? t.goal : t.label;
      if (this.el.goal.getAttribute('aria-label') !== label) this.el.goal.setAttribute('aria-label', label);
      const p = t.progress === null ? -1 : Math.round(t.progress * 1000) / 10;
      if (p !== this.lastProgress) {
        this.lastProgress = p;
        this.el.barWrap.hidden = p < 0;
        if (p >= 0) this.el.bar.style.width = p + '%';
      }
    }
  }

  Hud.texts = texts;
  Hud.NARROW = NARROW;
  return Hud;
});
