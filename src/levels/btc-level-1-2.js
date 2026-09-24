// @deps btc-level-kit btc-misconceptions btc-level-constants
/*
 * Be the Cell: level 1.2, "One gene, many copies" (LEVELS §7.2). Operator mode, LO2.
 *
 * Make at least T lactose permeases (LacY) by minute D with as few mRNAs as possible.
 * Before the run the student sketches the LacY curve of a scripted test run (×4 now,
 * off at minute tOff) and then watches that test run with the sketch drawn over it.
 * The lesson: one gene makes many mRNAs, each mRNA makes many proteins, and protein
 * keeps arriving after the gene is off. At the deadline the level locks the dial
 * (setControls from the config's schedule, R-E11) and the run goes on for 10 more
 * game-minutes, so the student sees what the leftover mRNA still makes.
 *
 * Every student-facing string is in TEXT (linted, §12.1 L-2). Calibrated numbers come
 * from BTC.levelConstants.l12 (tools/level-calibrate.js), never from this file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/btc-level-kit.js'), require('../game/btc-misconceptions.js'),
      require('./btc-level-constants.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {}))['1.2'] = factory(B.levelKit, B.misconceptions, B.levelConstants);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, LC) {
  'use strict';
  void MC;

  const SETTLE_MIN = 10, DEMO_MIN = 20;
  const GRID = K.sketch.GRID;
  // Content version (LEVELS §3.2: bumped on any change to variants, goals, scoring or questions): the M2 review reworded the Expert question and the debrief.
  const CONTENT = 2;

  const TEXT = {
    title: 'One gene, many copies',
    challenge: 'Many permeases, few mRNAs, one deadline.',
    task: {
      goal: '{T} LacY in the membrane by minute {D}.',
      core: ['Reach {T} LacY by minute {D}.', 'Use at most {mPar} mRNAs; the count is on screen.'],
      expert: ['Before the test run, work out how many LacY are made from one mRNA, within 30%.',
        'Sketch the amounts, not only the shape: 75% accuracy or better.'],
    },
    story: {
      intro: [
        { who: 'narrator', text: 'Orders from the top: {T} lactose permeases (lactose transporters) in the membrane by minute {D}.' },
        { who: 'commander', text: 'Build them one at a time. Starting now.' },
        { who: 'ribosome', text: 'There is one copy of the gene. I read the mRNA, not the gene, and I am not the only ribosome.' },
        { who: 'narrator', text: 'Each extra permease costs amino acids and ATP. The mRNA count is being watched.' },
      ],
      outro: [
        { who: 'narrator', text: 'You switched the gene off. The permeases kept arriving anyway, read from mRNA that was already there.' },
        { who: 'narrator', text: 'One gene, a few dozen mRNAs, several hundred proteins. The middle step is where the copies come from.' },
      ],
      // The outro when the target was not reached by the deadline.
      missed: [
        { who: 'narrator', text: 'The deadline came first. More mRNA, made sooner, would have been read into enough permeases in time.' },
        { who: 'narrator', text: 'One gene, a few dozen mRNAs, several hundred proteins. The middle step is where the copies come from.' },
      ],
      // The outro when lacY was still on at the deadline (its first line would not be true).
      keptOn: [
        { who: 'narrator', text: 'The gene stayed on past the target, so new mRNA kept coming, and every copy was read into more permeases.' },
        { who: 'narrator', text: 'One gene, a few dozen mRNAs, several hundred proteins. The middle step is where the copies come from.' },
      ],
    },
    ppm: {
      prompt: 'A ribosome starts on each LacY mRNA about every {sec} seconds, and an mRNA lasts about {min} minutes on average. How many LacY per mRNA?',
      unit: 'LacY per mRNA',
    },
    sketch: {
      prompt: 'Sketch the LacY count for the next 20 minutes. The gene goes on at ×4 now and off at minute {tOff}.',
      x: 'minutes', y: 'LacY (molecules)', band: '×4 on',
      features: {
        F1: 'A short delay before LacY rises',
        F2: 'Still rising after the switch-off',
        F3: 'Levelling off by minute 20',
        F4: 'Never falling',
      },
      happened: {
        F1: 'LacY appeared only after mRNA had been made and read, so the first minute stayed near the start.',
        F2: 'mRNA made before the switch-off was still being read, so LacY kept rising for minutes.',
        F3: 'Once the old mRNA had decayed, no more LacY was made, and the count levelled off.',
        F4: 'LacY is not broken down in this level, so the count never fell.',
      },
      accuracy: 'Amounts: {a}% accurate (Expert: 75% or better).',
    },
    demo: {
      title: 'Your sketch and the test run',
      intro: 'The test run: ×4 from minute 0, off at minute {tOff}. Your sketch is the dashed line.',
      copies: 'In the test run each LacY mRNA was read into about {ppm} LacY.',
    },
    d1: {
      prompt: 'You switched the gene off, yet LacY kept rising for minutes. Why?',
      options: [
        { t: 'mRNA made before the switch-off was still being read by ribosomes.', ok: true,
          fb: 'Each mRNA lasts a few minutes, and ribosomes keep reading it until it decays.' },
        { t: 'The gene took a while to register that it was off.', mc: 'CELL_DECIDES',
          fb: 'Genes register nothing. RNA polymerase stopped starting new copies at once; the copies already made remained.' },
        { t: 'LacY makes more LacY once there is enough of it.', mc: 'PROTEIN_SELF_COPY',
          fb: 'Proteins are not copied from proteins. Every LacY was built by a ribosome reading an mRNA.' },
        { t: 'The switch-off took minutes to reach the DNA.', mc: 'DELAY_MISATTRIBUTED',
          fb: 'The switch acted at once: no new mRNA was started after it. The rise came from mRNA already made.' },
      ],
    },
    d2: {
      prompt: 'Why is the gene copied into mRNA, instead of ribosomes reading the gene directly?',
      options: [
        { t: 'Many copies can be made, and each is read many times, so one gene gives many proteins.', ok: true,
          fb: 'Here one gene gave a few dozen mRNAs and each gave about twenty LacY. Copies also decay, so output stops soon after the gene does.' },
        { t: 'mRNA is a spare copy kept in case the DNA is damaged.', mc: 'MIDDLEMAN',
          fb: 'mRNA is read, not stored. Each copy lasts only minutes before it decays.' },
        { t: 'Ribosomes cannot reach the DNA.', mc: 'OTHER',
          fb: 'In this bacterium ribosomes start on mRNA right beside the DNA, while it is still being made. Distance is not the reason here.' },
        { t: 'mRNA is an early form of the protein.', mc: 'MIDDLEMAN',
          fb: 'mRNA is a copy of the instructions. Ribosomes read it; it is never built into the protein.' },
      ],
    },
    echo1: 'A beta cell in your pancreas makes insulin the same way: one gene, copied into many mRNAs, each read by many ribosomes.',
    echo2: 'Nearly every cell in your body has the same two copies of the insulin gene, one from each parent. It is copied into mRNA only in beta cells.',
    cards: { mRNA: 'mRNA' },
    hud: {
      goal: 'LacY {count} / {T}', reached: 'LacY {count} · {T} reached', reachedShort: 'LacY {count} · reached',
      settle: 'Reached · watching 10 more min', settleShort: 'Reached · watching',
      timer: 'deadline in {time}', timerShort: 'due in {time}', settleTimer: '{time} left',
      counter: 'mRNAs {m} / {mPar}', counterShort: '{m}/{mPar} mRNA',
      counterOver: 'mRNAs {m} / {mPar} · over par', counterOverShort: '{m}/{mPar} mRNA',
      demoGoal: 'Test run · LacY {count}', demoGoalShort: 'LacY {count}', demoTimer: '{time} of 20 min', demoTimerShort: 'min {t} of 20',
      demoCounter: 'mRNAs {m}', demoCounterShort: '{m} mRNAs',
    },
    narr: {
      settle: 'The deadline has passed; the permeases still arriving come from mRNA that was already there.',
    },
    result: {
      used: 'You used {m} mRNAs; par is {mPar} or fewer.',
      hint: 'mRNA already made keeps being read into LacY, so switching the gene off earlier needs fewer mRNAs.',
    },
  };

  const L = LC.l12;
  const cmd = (level) => ({ type: 'setPromoter', gene: 'lacY', level });
  const isOn = (g) => g.level !== 'off' && (g.level !== null || g.rate_perS > 0);
  const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);

  /** The demo's mean curve for tOff as sketch points ([minute, LacY]); the reference sketch. */
  const meanSketch = (tOff) => L.demoMean[tOff].map((y, t) => [t, Math.round(y)]);

  /** Shape features, P, and (with the demo curve) the amount accuracy A of a sketch (§7.2.6). */
  function evaluate(points, v, extras) {
    const s = K.sketch.resample(points, GRID.x0, GRID.x1, GRID.n);
    if (!s) return null;
    const f = K.sketch.features(s, { tOff: v.tOff });
    const out = { features: [f.F1, f.F2, f.F3, f.F4], P: f.P, stopsAtOff: f.s20 - f.sOff < 0.1 * (f.s20 - f.s0) };
    const demo = extras && extras.demo;
    if (demo && Array.isArray(demo.curve) && demo.curve.length === GRID.n + 1) out.A = K.sketch.accuracy(s, demo.curve);
    return out;
  }

  const DEF = {
    id: '1.2', code: '12', order: 2, version: CONTENT, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'operator', scored: true, los: ['LO2'], misconceptions: ['MIDDLEMAN', 'PROTEIN_SELF_COPY', 'DELAY_MISATTRIBUTED', 'INSTANT', 'CELL_DECIDES'],
    estMinutes: 8, engine: '1.1',
    phases: ['intro', 'task', 'predict', 'demo', 'run', 'result', 'debrief', 'echo', 'complete'],

    /** T ∈ {400, 500, 600} LacY, demo switch-off tOff ∈ {4, 5, 6} min: 9 variants. mPar from the calibrated copies per mRNA. */
    variant(seed) {
      const r = K.rng(seed, '1.2');
      const T = r.pick([400, 500, 600]), tOff = r.pick([4, 5, 6]);
      return { seed, T, tOff, D: L.D[T], mPar: Math.round((1.7 * T) / L.ppm) };
    },
    /** Words for the Expert number, read from the calibrated demo cell (seconds between starts, mean mRNA life). */
    textVars() {
      return { sec: Math.round(L.initSec), min: K.round(L.lifeMin, 0.5) };
    },
    /** The instructor's decoder shows this beside the variant seed. */
    variantLabel(v) { return 'T ' + v.T + ', tOff ' + v.tOff + ', D ' + v.D + ', mPar ' + v.mPar; },

    config(v, role) {
      const cfg = {
        seed: K.seedFor(v.seed, role), strain: 'm1-lab', start: 'birth',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
        genes: { lacY: { level: 'off' } },
        flags: { userGenes: ['lacY'] },
        variant: { levelId: '1.2', content: CONTENT, seed: v.seed, T: v.T, tOff: v.tOff, D: v.D, mPar: v.mPar },
      };
      if (role === 'demo') {
        // The scripted test run: ×4 now, off at tOff; the student only watches.
        cfg.flags.controls = 'locked';
        cfg.schedule = [{ tick: 0, cmd: cmd(4) }, { tick: v.tOff * 60, cmd: cmd('off') }];
      } else {
        // At the deadline the level locks the dial; the run goes on for the settle.
        cfg.schedule = [{ tick: v.D * 60, cmd: { type: 'setControls', controls: 'locked' } }];
      }
      return cfg;
    },

    labConfig(v, state) {
      const demo = !!state && state.phase === 'demo';
      return {
        showNames: true, genesVisible: ['lacY'], controls: { genes: true, medium: false, drugs: false },
        lockedGenes: demo ? ['lacY'] : [],
        mediumRows: { glucose: 'locked', lactose: 'locked', aminoAcids: 'locked' },
        // The run opens at 1 s = 10 s: at 1 s = 1 min the decision (when to switch off) lasts about two seconds.
        speedOptions: [10, 60], defaultSpeed: demo ? 60 : 10, startPaused: !demo,
        tabs: ['cell', 'genes', 'graphs'], graphGenes: ['lacY'], focusGene: 'lacY', hud: true,
        // The demo shows the Protein plot (with the sketch over it) above the mRNA plot, on a fixed 20-min axis.
        plots: demo ? ['protein', 'mRNA'] : null,
        graphWindow: demo ? DEMO_MIN * 60 : (v.D + SETTLE_MIN) * 60,
        initialTab: demo ? 'graphs' : 'cell',
      };
    },

    hud(v, st) {
      const s = Object.assign({ tick: 0, count: 0, m: 0, reached: false, settle: false }, st || {});
      const count = Math.floor(s.count + 0.5);
      if (s.demo) {
        const t = Math.min(s.tick, DEMO_MIN * 60);
        return {
          goal: { text: K.fill(TEXT.hud.demoGoal, { count }), short: K.fill(TEXT.hud.demoGoalShort, { count }), progress: null, done: false },
          timer: { text: K.fill(TEXT.hud.demoTimer, { time: K.clock(t, true) }), short: K.fill(TEXT.hud.demoTimerShort, { t: Math.floor(t / 60) }) },
          counter: { text: K.fill(TEXT.hud.demoCounter, { m: s.m }), short: K.fill(TEXT.hud.demoCounterShort, { m: s.m }) },
        };
      }
      const Dt = v.D * 60, settle = s.settle || s.tick >= Dt;
      const goalText = settle && s.reached ? TEXT.hud.settle : s.reached ? TEXT.hud.reached : TEXT.hud.goal;
      const goalShort = settle && s.reached ? TEXT.hud.settleShort : s.reached ? TEXT.hud.reachedShort : TEXT.hud.goal;
      const left = settle ? Math.max(0, Dt + SETTLE_MIN * 60 - s.tick) : Math.max(0, Dt - s.tick);
      const timer = K.fill(settle ? TEXT.hud.settleTimer : TEXT.hud.timer, { time: K.clock(left, true) });
      // Whole minutes left round up (5 min into a 14-min deadline reads "due in 9 min", matching the clock).
      const short = K.fill(settle ? TEXT.hud.settleTimer : TEXT.hud.timerShort, { time: left < 60 ? K.clock(left, true) : Math.ceil(left / 60) + ' min' });
      return {
        goal: { text: K.fill(goalText, { count, T: v.T }), short: K.fill(goalShort, { count, T: v.T }),
          progress: settle && s.reached ? null : Math.min(1, s.count / v.T), done: !!s.reached },
        timer: { text: timer, short },
        counter: s.m > v.mPar
          ? { text: K.fill(TEXT.hud.counterOver, { m: s.m, mPar: v.mPar }), short: K.fill(TEXT.hud.counterOverShort, { m: s.m, mPar: v.mPar }), over: true }
          : { text: K.fill(TEXT.hud.counter, { m: s.m, mPar: v.mPar }), short: K.fill(TEXT.hud.counterShort, { m: s.m, mPar: v.mPar }) },
      };
    },

    predictions: [
      { id: 'ppm', kind: 'number', expert: true, prompt: TEXT.ppm.prompt, unit: TEXT.ppm.unit, min: 1, max: 200, step: 1, tolerance: 0.3,
        /** Judged against the demo's measured copies per mRNA; before the demo, the calibrated mean. */
        answer(v, x) { return x && x.demo && x.demo.ppm > 0 ? x.demo.ppm : L.ppm; } },
      { id: 'sketch', kind: 'sketch', prompt: TEXT.sketch.prompt,
        x: { min: 0, max: DEMO_MIN, label: TEXT.sketch.x }, y: { min: 0, max: 2000, label: TEXT.sketch.y },
        schedule: (v) => [{ from: 0, to: v.tOff, label: TEXT.sketch.band }],
        words: TEXT.sketch, evaluate },
    ],

    demo: {
      durationTicks: DEMO_MIN * 60, speed: 60,
      /** Records the demo's LacY on the sketch grid (every 0.25 min) and its mRNA count. */
      monitor() {
        let st = { tick: 0, count: 0, m: 0, curve: [] };
        return {
          start(cell) { const g = cell.observe().geneById.lacY; st.curve = [g.protein]; st.count = g.protein; st.m = g.mRNAMade; },
          onTick(cell) {
            const g = cell.observe().geneById.lacY;
            st.tick = cell.tick; st.count = g.protein; st.m = g.mRNAMade;
            const step = GRID.step * 60;
            if (cell.tick % step === 0 && cell.tick <= DEMO_MIN * 60) st.curve[cell.tick / step] = g.protein;
          },
          end() { return null; },
          result() { return { curve: st.curve.slice(), m: st.m }; },
          save() { return { tick: st.tick, count: st.count, m: st.m }; },
          restore(s) { st = Object.assign({ curve: [] }, s); },
        };
      },
    },
    /** The demo's copies per mRNA (pMade / mMade since tick 0), its final count and its curve on the sketch grid. */
    demoResult(v, cell, mon) {
      const g = cell.observe().geneById.lacY;
      return {
        ppm: g.mRNAMade > 0 ? g.proteinMade / g.mRNAMade : 0, final: g.protein, mMade: g.mRNAMade, pMade: g.proteinMade,
        curve: mon ? mon.curve : null,
      };
    },

    monitor(v) {
      const Dt = v.D * 60, END = (v.D + SETTLE_MIN) * 60;
      let st = { tick: 0, count: 0, m: 0, mRNA: 0, nascent: 0, level: 'off', reached: false, reachedTick: -1,
        onRun: 0, keptOn: false, keptOnTick: -1, onAtDeadline: false, settle: false, commands: 0 };
      return {
        /** The HUD shows the newborn's few LacY before the run's first tick, as the gene card does. */
        start(cell) { st.count = cell.observe().geneById.lacY.protein; },
        onTick(cell) {
          const g = cell.observe().geneById.lacY, on = isOn(g);
          st.tick = cell.tick; st.count = g.protein; st.m = g.mRNAMade; st.mRNA = g.mRNA; st.nascent = g.nascent;
          st.level = on ? g.level : 'off';
          if (!st.reached && g.protein >= v.T && cell.tick <= Dt) { st.reached = true; st.reachedTick = cell.tick; }
          // KEPT_ON_PAST_TARGET: lacY on for 30 game-s in a row after LacY first reached T.
          st.onRun = st.reached && on ? st.onRun + 1 : 0;
          if (!st.keptOn && st.onRun >= 30) { st.keptOn = true; st.keptOnTick = cell.tick; }
          if (cell.tick === Dt) st.onAtDeadline = on;
          st.settle = cell.tick >= Dt;
        },
        userCommand() { st.commands++; },
        end() {
          if (!st.reached && st.tick >= Dt) return 'deadline';
          if (st.reached && st.tick >= END) return 'done';
          return null;
        },
        result() {
          return { goal: st.reached, reachedTick: st.reachedTick, m: st.m, count: st.count, keptOn: st.keptOn, keptOnTick: st.keptOnTick,
            onAtDeadline: st.onAtDeadline, commands: st.commands };
        },
        save() { return Object.assign({}, st); },
        restore(s) { st = Object.assign({}, s); },
      };
    },

    score(v, m, answers, extras) {
      const p = answers.predictions, d = answers.debrief, demo = extras && extras.demo;
      const mm = m.m || 0;
      const E = mm <= v.mPar ? 1 : clamp01(1 - (mm - v.mPar) / v.mPar);
      const sk = p.sketch && p.sketch.locked ? evaluate(p.sketch.value, v, { demo }) : null;
      const P = sk ? sk.P : 0;
      const n = p.ppm && p.ppm.locked ? p.ppm.value : null;
      const ppmOk = n !== null && !!demo && demo.ppm > 0 && Math.abs(n - demo.ppm) / demo.ppm <= 0.3;
      const aOk = !!sk && typeof sk.A === 'number' && sk.A >= 0.75;
      const flags = [];
      if (m.keptOn) flags.push({ id: 'KEPT_ON_PAST_TARGET', tick: m.keptOnTick, data: {} });
      if (sk) {
        if (sk.stopsAtOff) flags.push({ id: 'SKETCH_STOPS_AT_OFF', data: {} });
        if (!sk.features[0]) flags.push({ id: 'SKETCH_NO_DELAY', data: {} });
        if (!sk.features[3]) flags.push({ id: 'SKETCH_FALLS', data: {} });
        if (!sk.features[2]) flags.push({ id: 'SKETCH_NO_PLATEAU', data: {} });
      }
      const first = (qid) => (d[qid] ? d[qid].firstMc : null);
      if (first('l12.d2') === 'MIDDLEMAN') flags.push({ id: 'DEB_MIDDLEMAN', data: { option: d['l12.d2'].first } });
      if (first('l12.d1') === 'PROTEIN_SELF_COPY') flags.push({ id: 'DEB_PROTEIN_SELF_COPY', data: { option: d['l12.d1'].first } });
      if (first('l12.d1') === 'CELL_DECIDES') flags.push({ id: 'DEB_CELL_DECIDES', data: { option: d['l12.d1'].first } });
      return { E, P, X: (ppmOk ? 1 : 0) | (aOk ? 2 : 0), flags, m: mm, A: sk ? sk.A : null, features: sk ? sk.features : null };
    },

    /** The result sheet's line under the efficiency bar. */
    resultLines(v, comp) { return typeof comp.m === 'number' ? [K.fill(TEXT.result.used, { m: comp.m, mPar: v.mPar })] : []; },
    /** Goal met but over par: what to do differently (the leftover mRNA is the lesson). */
    resultHint(v, comp, m, goal) { return goal && typeof comp.m === 'number' && comp.m > v.mPar ? [TEXT.result.hint] : []; },

    flags: [
      { id: 'KEPT_ON_PAST_TARGET', mc: 'MIDDLEMAN' }, { id: 'SKETCH_STOPS_AT_OFF', mc: 'MIDDLEMAN' },
      { id: 'SKETCH_NO_DELAY', mc: 'INSTANT' }, 'SKETCH_FALLS', 'SKETCH_NO_PLATEAU',
      { id: 'DEB_MIDDLEMAN', mc: 'MIDDLEMAN' }, { id: 'DEB_PROTEIN_SELF_COPY', mc: 'PROTEIN_SELF_COPY' }, { id: 'DEB_CELL_DECIDES', mc: 'CELL_DECIDES' },
    ],
    debrief: [
      { id: 'l12.d1', kind: 'choice', prompt: TEXT.d1.prompt, options: TEXT.d1.options },
      { id: 'l12.d2', kind: 'choice', prompt: TEXT.d2.prompt, options: TEXT.d2.options },
    ],
    echo: { screens: ['echo1', 'echo2'], cards: [{ id: 'mrna', title: 'cards.mRNA', stamp: 'universal' }] },
    story: { intro: TEXT.story.intro, outro: TEXT.story.outro, extra: { keptOn: TEXT.story.keptOn, missed: TEXT.story.missed } },
    /** The outro's first line says the gene was switched off; when it was still on at the deadline, the other beat. */
    /** The outro's first line must be true: "You switched the gene off" only when the target was reached and the gene was off at the deadline. */
    outroKey(v, m, goal) { return !goal ? 'missed' : m && m.onAtDeadline ? 'keptOn' : null; },

    narratorRules: [
      { key: 'l12.settle', template: TEXT.narr.settle,
        when: (f, mem, tick, lv) => lv.phase === 'run' && !!lv.monitor && lv.monitor.settle && lv.monitor.level === 'off' &&
          lv.monitor.mRNA + lv.monitor.nascent > 0 },
    ],

    solutions: (function () {
      const withSketch = (sketch) => ({ ppm: () => Math.round(L.ppm), sketch });
      const reference = {
        kind: 'policy', every: 5,
        // ×4 at once; off when the mRNA already made will still deliver the rest (10% margin).
        act(view, tick, api, v) {
          const g = view.geneById.lacY;
          if (tick === 0) api.command(cmd(4));
          else if (isOn(g) && g.protein + 15 * g.mRNA + 20 * g.nascent >= 1.1 * v.T) api.command(cmd('off'));
        },
        predictions: withSketch((v) => meanSketch(v.tOff)),
        expect: { goal: true, par: true, P: 1, minTotal: 90, flags: [] },
      };
      const plateau = (v) => meanSketch(v.tOff).map((p) => [p[0], p[0] <= v.tOff ? p[1] : Math.round(L.demoMean[v.tOff][v.tOff])]);
      const falling = (v) => meanSketch(v.tOff).filter((p) => p[0] <= v.tOff).concat([[DEMO_MIN, 0]]);
      return {
        reference,
        stopAtTarget: {
          kind: 'policy', every: 5,
          act(view, tick, api, v) {
            const g = view.geneById.lacY;
            if (tick === 0) api.command(cmd(4)); else if (isOn(g) && g.protein >= v.T) api.command(cmd('off'));
          },
          expect: { goal: true, par: false },
        },
        keepOn: {
          kind: 'policy', every: 5,
          act(view, tick, api) { if (tick === 0) api.command(cmd(4)); },
          expect: { goal: true, par: false, flags: ['KEPT_ON_PAST_TARGET'] },
        },
        plateauSketch: Object.assign({}, reference, { predictions: withSketch(plateau), expect: { goal: true, par: true, P: 0.75, flags: ['SKETCH_STOPS_AT_OFF'] } }),
        fallingSketch: Object.assign({}, reference, { predictions: withSketch(falling), expect: { goal: true, flags: ['SKETCH_FALLS', 'SKETCH_STOPS_AT_OFF'] } }),
        weak: {
          kind: 'policy', every: 5,
          act(view, tick, api, v) {
            const g = view.geneById.lacY;
            if (tick === 0) api.command(cmd(0.5)); else if (isOn(g) && g.protein >= v.T) api.command(cmd('off'));
          },
          // LEVELS §7.2.12: fails the goal on at least 80% of runs (×½ sometimes reaches the lowest T in time).
          expect: { goal: false, rate: 0.8 },
        },
      };
    }()),
  };
  return DEF;
});
