// @deps btc-content btc-format btc-layout
/*
 * Be the Cell: the status strip (LAB_UI §6): run/pause, the clock, the
 * generation count, the time compression (always visible), the ATP gauge
 * (a word as well as a colour) and the doubling time.
 *
 * Growth shows the whole-cycle doubling time when growth is steady, because
 * the instantaneous rate ripples within each cycle. After a change of
 * conditions it shows the recent average, labelled "recent", until the two
 * agree again (on at > 15% apart, off at ≤ 10%).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.StatusStrip = factory(B.content, B.format, B.layout);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY) {
  'use strict';

  const S = C.status;

  /** Growth text from the view clock (pure; tested). state: {recent} carries the hysteresis. */
  function growthText(clock, t_s, arrested, state) {
    if (arrested) return S.notGrowing;
    const last = clock.lastCycle_min, ema = clock.doublingEMA_min;
    const emaOk = ema > 0 && ema < 1e5 && ema === ema;
    if (!(last > 0)) {
      if (t_s < 300 || !emaOk) return S.measuring;
      return F.fill(S.doublingRecent, { t: F.minutes(ema) });
    }
    if (!emaOk) return S.notGrowing;
    const diff = Math.abs(ema - last) / last;
    if (diff > 0.15) state.recent = true;
    else if (diff <= 0.10) state.recent = false;
    return state.recent ? F.fill(S.doublingRecent, { t: F.minutes(ema) }) : F.fill(S.doubling, { t: F.minutes(last) });
  }

  class StatusStrip {
    constructor(app) {
      this.app = app;
      this.growthState = { recent: false };
    }

    mount(root) {
      const h = LY.h, app = this.app;
      this.el = {
        playIcon: h('span', { class: 'play-icon', 'aria-hidden': 'true' }),
        playWord: h('span', { class: 'play-word' }),
        clock: h('span', { class: 'st-clock num' }),
        gen: h('span', { class: 'st-gen' }),
        spMain: h('span', { class: 'sp-main' }),
        spSub: h('span', { class: 'sp-sub' }),
        gaugeFill: h('span', { class: 'gauge-fill' }),
        atpWord: h('span', { class: 'atp-word' }),
        growth: h('span', { class: 'st-growth-text num' }),
        limit: h('span', { class: 'st-limit', hidden: true }),
      };
      const e = this.el;
      e.play = h('button', { class: 'play', type: 'button', 'aria-pressed': 'false', onclick: () => app.togglePause() }, [e.playIcon, e.playWord]);
      // Levels (LEVELS §4.5, §9 item 9): a "Levels" button at the left end, and the level title in wide.
      e.levels = h('button', { class: 'btn levels-btn', type: 'button', hidden: true, 'aria-label': C.game.levelsLabel, onclick: () => app.leaveLevel() },
        [h('span', { class: 'levels-icon', 'aria-hidden': 'true' }), h('span', { class: 'levels-word', text: C.game.levels })]);
      e.title = h('span', { class: 'st-level-title', hidden: true });
      root.appendChild(e.levels);
      e.speed = h('button', { class: 'speed-chip', type: 'button', onclick: () => this.openSpeed() }, [e.spMain, e.spSub]);
      e.atp = h('div', { class: 'st-atp', onclick: () => app.showPlot('atp') }, [
        h('span', { class: 'atp-label', text: S.atp }), h('span', { class: 'gauge', 'aria-hidden': 'true' }, e.gaugeFill), e.atpWord]);
      e.growthBox = h('div', { class: 'st-growth', onclick: () => app.showPlot('growth') }, e.growth);
      root.appendChild(e.play);
      root.appendChild(h('div', { class: 'st-time' }, [h('span', { class: 'st-t', text: S.tPrefix }), e.clock, h('span', { class: 'st-sep', text: ' · ' }), e.gen]));
      root.appendChild(e.title);
      root.appendChild(e.speed);
      root.appendChild(h('div', { class: 'st-row2' }, [e.atp, e.growthBox, e.limit]));
      this.root = root;
    }

    /**
     * Level mode: shows the Levels button and the level title. title null: no level; lab true: the
     * free-play lab, which keeps the Levels button (home) without a title.
     */
    setLevel(title, lab) {
      const e = this.el, on = title !== null && title !== undefined;
      const btn = on || !!lab;
      e.levels.hidden = !btn;
      e.title.hidden = !on;
      LY.setText(e.title, on ? title : '');
      this.root.classList.toggle('has-levels', btn);
      this.lastRunning = null;
    }

    update(view, facts) {
      const app = this.app, e = this.el, speed = app.speed();
      const running = app.isRunning();
      const can = app.canRun ? app.canRun() : true;
      if (this.lastRunning !== running || this.lastCan !== can) {
        this.lastRunning = running; this.lastCan = can;
        e.play.setAttribute('aria-pressed', running ? 'true' : 'false');
        e.play.setAttribute('aria-label', running ? S.pauseLabel : S.playLabel);
        e.play.classList.toggle('is-running', running);
        e.play.disabled = !can && !running;
        LY.setText(e.playWord, running ? S.running : S.paused);
      }
      const clockText = F.clock(view.t_s, speed <= 10);
      LY.setText(e.clock, clockText);
      // "14 h 30 min" is wider than the phone strip leaves beside the Levels button: a smaller size then.
      if (this.clockLong !== (clockText.length >= 9)) { this.clockLong = clockText.length >= 9; e.clock.classList.toggle('is-long', this.clockLong); }
      const gen = view.clock.generation - app.gen0;
      LY.setText(e.gen, F.fill(app.layout === 'compact' ? S.generation : S.generationShort, { n: gen }));
      let sp = null;
      for (const x of C.speeds) if (x.s === speed) sp = x;
      if (!sp) sp = { label: F.speedLabel(speed), short: '', gloss: '' };
      LY.setText(e.spMain, sp.label);
      LY.setText(e.spSub, sp.short);
      const spLabel = F.fill(S.speedLabel, { label: sp.label, gloss: sp.gloss || '' });
      if (e.speed.getAttribute('aria-label') !== spLabel) e.speed.setAttribute('aria-label', spLabel);

      const E = view.energy.E, state = view.energy.state;
      const w = Math.round(Math.max(0, Math.min(1, E)) * 100) + '%';
      if (e.gaugeFill.style.width !== w) e.gaugeFill.style.width = w;
      if (e.gaugeFill.__s !== state) { e.gaugeFill.__s = state; e.gaugeFill.className = 'gauge-fill is-' + state; }
      LY.setText(e.atpWord, S.atpWords[state]);

      LY.setText(e.growth, growthText(view.clock, view.t_s, facts.growth === 'arrested', this.growthState));

      const st = app.loop.stats;
      e.limit.hidden = !(running && st.limited);
      if (!e.limit.hidden) LY.setText(e.limit, F.fill(S.deviceLimit, { label: F.speedLabel(st.achievedSpeed) }));
    }

    openSpeed() {
      const app = this.app, h = LY.h;
      LY.openSheet({
        title: C.speedSheet.title,
        build: (body, close) => {
          body.appendChild(h('p', { class: 'sheet-note', text: C.speedSheet.note }));
          const list = h('div', { class: 'speed-list', role: 'radiogroup', 'aria-label': C.speedSheet.title });
          (app.speedList ? app.speedList() : C.speeds).forEach((sp, i) => {
            const on = sp.s === app.speed();
            list.appendChild(h('button', {
              class: 'btn row-btn speed-row' + (on ? ' is-current' : ''), type: 'button', role: 'radio',
              'aria-checked': on ? 'true' : 'false', 'data-speed': String(sp.s),
              onclick: () => { app.setSpeed(sp.s); close(); },
            }, [h('span', { class: 'speed-check', 'aria-hidden': 'true', text: on ? '✓' : '' }),
              h('span', { class: 'speed-label', text: sp.label }), h('span', { class: 'speed-gloss', text: sp.gloss }),
              h('span', { class: 'speed-key', 'aria-hidden': 'true', text: String(i + 1) })]));
          });
          body.appendChild(list);
        },
      });
    }
  }

  StatusStrip.growthText = growthText;
  return StatusStrip;
});
