// @deps btc-content btc-format btc-layout
/*
 * Be the Cell: the level HUD (LEVELS §5.5.2), one row in the #hud slot: 44 px
 * in compact, 40 px elsewhere, 0 px outside levels and in the Prologue.
 *
 *   [ goal chip (flex, tap: task card) ][ timer ][ counter ]
 *
 * The level supplies the words through def.hud(variant, monitorState):
 * {goal: {text, short?, progress: 0..1|null, done, gauge?}, timer: {text, short?}, counter: {text, short}}.
 * Under 400 px of width the counter (and the goal and timer, when they have one) show their short forms.
 * A goal with a gauge {lo, hi, max, value} (1.4) draws a band gauge along the chip's
 * bottom instead of a progress bar: the band marked, a tick at the value. State is
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
    let goalText = (narrow && goal.short) || goal.text || '';
    if (mode === 'met') goalText = G.goalMet;
    else if (mode === 'continue') goalText = G.continue;
    return {
      goal: goalText,
      progress: typeof goal.progress === 'number' && mode !== 'met' && mode !== 'continue' ? Math.max(0, Math.min(1, goal.progress)) : null,
      gauge: goal.gauge && mode !== 'met' && mode !== 'continue' && goal.gauge.max > 0 ? {
        lo: Math.max(0, Math.min(1, goal.gauge.lo / goal.gauge.max)), hi: Math.max(0, Math.min(1, goal.gauge.hi / goal.gauge.max)),
        value: Math.max(0, Math.min(1, goal.gauge.value / goal.gauge.max)),
      } : null,
      timer: (m.timer && ((narrow && m.timer.short) || m.timer.text)) || '',
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
      this.el.band = h('span', { class: 'hud-gauge-band' });
      this.el.tick = h('span', { class: 'hud-gauge-tick' });
      this.el.barWrap = h('span', { class: 'hud-bar', 'aria-hidden': 'true' }, [this.el.bar, this.el.band, this.el.tick]);
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
      const g = t.gauge;
      const p = g ? -2 : t.progress === null ? -1 : Math.round(t.progress * 1000) / 10;
      const gKey = g ? [g.lo, g.hi, g.value].map((x) => Math.round(x * 1000)).join(',') : '';
      if (p !== this.lastProgress || gKey !== this.lastGauge) {
        this.lastProgress = p; this.lastGauge = gKey;
        this.el.barWrap.hidden = p === -1;
        this.el.barWrap.classList.toggle('is-gauge', !!g);
        this.el.bar.hidden = !!g;
        this.el.band.hidden = !g; this.el.tick.hidden = !g;
        if (g) {
          this.el.band.style.left = (100 * g.lo).toFixed(1) + '%';
          this.el.band.style.width = (100 * (g.hi - g.lo)).toFixed(1) + '%';
          this.el.tick.style.left = (100 * g.value).toFixed(1) + '%';
          this.el.tick.classList.toggle('is-in', g.value >= g.lo && g.value <= g.hi);
        } else if (p >= 0) this.el.bar.style.width = p + '%';
      }
    }
  }

  Hud.texts = texts;
  Hud.NARROW = NARROW;
  return Hud;
});
