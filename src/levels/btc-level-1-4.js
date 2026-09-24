// @deps btc-level-kit btc-misconceptions btc-level-constants
/*
 * Be the Cell: level 1.4, "Nothing lasts" (LEVELS §7.4). Operator mode, LO4.
 *
 * LacY now carries a degradation tag (half-life 3, 4 or 5 min). Hold LacY inside a
 * band for 15 game-minutes in a row, within 45. The steady level is where making equals
 * removal, so one setting does it; a stockpile does not last, and pulsing the gene on
 * and off costs changes. After the goal the student predicts what switching the gene
 * off will do, switches it off and watches 12 game-minutes (the epilogue).
 *
 * The hold is 15 minutes, not the 10 of LEVELS §7.4: on engine 1.1 a stockpile (×4 to
 * the band's middle, then off) stays in the band for about 10 minutes, because the mRNA
 * already made keeps delivering LacY while proteases cut it; with 15 minutes it fails
 * (LEVELS.md, "Changes after engine 1.1"). The limit is 45 minutes, still before the
 * newborn replicates its chromosome (≈ 48 min).
 *
 * Every student-facing string is in TEXT (linted, §12.1 L-2); calibrated numbers come
 * from BTC.levelConstants.l14 (tools/level-calibrate.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/btc-level-kit.js'), require('../game/btc-misconceptions.js'),
      require('./btc-level-constants.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {}))['1.4'] = factory(B.levelKit, B.misconceptions, B.levelConstants);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, LC) {
  'use strict';
  void MC;

  const HOLD_MIN = 15, LIMIT_MIN = 45, EPILOGUE_MIN = 12, MEAN_TICKS = 60;
  // [half-life (min), target setting]: every combination except half-life 5 min at ×2 (content version 2).
  const VARIANTS = Object.freeze([[3, 1], [3, 2], [4, 1], [4, 2], [5, 1]]);
  const LN2 = 0.6931471805599453;
  // Content version (LEVELS §3.2: bumped on any change to variants, goals, scoring or questions): 2: half-life 5 min at ×2 removed; 3: the M2 review reworded the Expert question, p2 and the debrief feedback;
  // 4: the plain-language pass (§16.12) names the protein by its job ("transporters") in the predictions and the debrief.
  const CONTENT = 4;

  const TEXT = {
    title: 'Nothing lasts',
    challenge: 'Hold a protein steady as it breaks down.',
    task: {
      // Read before the goal (LEVELS §5.3): proteases and the setting in plain words.
      context: ['Proteases are enzymes that cut up proteins. Here the lactose transporters (LacY) carry a tag that proteases fit.',
        'The setting is how often their gene is copied, from ¼ to 4 times the usual rate.'],
      goal: 'Keep the number of lactose transporters between {lo} and {hi} for 15 minutes.',
      core: ['Hold it for 15 minutes in a row, within 45 minutes.', 'Change the setting at most twice.'],
      expert: ['Work out the level at ×1 from the rates, within 25%.', 'Hold it with a single setting, set once.'],
    },
    story: {
      intro: [
        { who: 'narrator', text: 'The lactose transporters from last time are gone. Nobody took them; the cell kept dividing, and they were shared out.' },
        { who: 'commander', text: 'Then build a stockpile, and keep it.' },
        { who: 'narrator', text: 'This time the transporters carry a tag that fits proteases, the enzymes that cut up proteins.' },
        { who: 'narrator', text: 'Half of them are cut up every {halfLife} minutes, whatever the orders.' },
      ],
      outro: [
        { who: 'narrator', text: 'A steady level is not a still one. While the count held, new transporters were made as fast as old ones were cut up.' },
        { who: 'protease', denies: true, text: "I don't cut anything on purpose. Tagged proteins fit me, and then they are in pieces." },
      ],
      // The outro when the count never held in the band (the first line would not be true).
      missed: [
        { who: 'narrator', text: 'The count never stayed inside the target range for fifteen minutes. Each setting has its own level, where making and cutting up balance.' },
        { who: 'protease', denies: true, text: "I don't cut anything on purpose. Tagged proteins fit me, and then they are in pieces." },
      ],
      // The outro when the gene was switched off during the run (the first line would not be true).
      pulsed: [
        { who: 'narrator', text: 'The count held, but each switch-off let proteases cut into it with nothing to replace what they cut.' },
        { who: 'protease', denies: true, text: "I don't cut anything on purpose. Tagged proteins fit me, and then they are in pieces." },
      ],
    },
    p1: {
      prompt: 'You switch the transporter gene on at one setting and leave it. What will the transporter count do?',
      options: [
        { t: 'Rise, then level off where making and breaking down balance.', ok: true,
          fb: 'The more transporters there are, the more proteases cut up each minute, until cutting up matches making.' },
        { t: 'Keep rising for as long as the gene is on.', mc: 'MOLECULES_LAST',
          fb: 'It would if nothing broke the transporters down. Here more are cut up as the count grows, so it levels off.' },
        { t: 'Jump straight to a fixed level.', mc: 'INSTANT',
          fb: 'It takes minutes to rise: mRNA first, then protein, and the count approaches its level gradually.' },
        { t: 'Rise, then fall back to zero.', mc: 'OTHER',
          fb: 'With the gene still on, new transporters keep replacing the ones cut up, so the count holds.' },
      ],
    },
    ss: {
      prompt: 'At ×1 about {X} LacY are made a minute, and each lasts about {Y} minutes on average. How many LacY are there once the count levels off?',
      unit: 'LacY',
    },
    p2: {
      prompt: 'You are about to switch the transporter gene off. What will the transporter count do?',
      options: [
        { t: 'Hold for a minute or two while the last mRNA is read, then fall, fast at first and then more slowly, as proteases cut them up.', ok: true,
          fb: 'Proteases keep cutting them up, and once the last mRNA is gone nothing replaces what they cut.' },
        { t: 'Stay where it is now.', mc: 'MOLECULES_LAST',
          fb: 'The count held only while new transporters replaced old ones. Without new ones, it falls.' },
        { t: 'Drop to zero at once.', mc: 'INSTANT',
          fb: 'Each transporter is cut up at its own moment, so the count falls gradually, not all at once.' },
        { t: 'Keep rising for a long time.', mc: 'OTHER',
          fb: 'Leftover mRNA adds a little for a minute or two, but breakdown soon wins.' },
      ],
    },
    epilogue: {
      prompt: 'Now switch the transporter gene off and watch the next 12 minutes.',
      button: 'Switch the gene off',
    },
    d1: {
      prompt: 'While the gene stayed on, the transporter count held steady. What was happening?',
      options: [
        { t: 'New transporters were being made as fast as old ones were cut up.', ok: true,
          fb: 'A steady count is a balance: new transporters replaced old ones as fast as proteases cut them up.' },
        { t: 'The cell stopped making transporters once there were enough.', mc: 'CELL_DECIDES',
          fb: 'Nothing in the cell counts them. At a fixed setting they were made at a steady rate, and cutting up rose until it matched.' },
        { t: 'Nothing: the transporters already made simply stayed.', mc: 'MOLECULES_LAST',
          fb: 'Each transporter lasted only minutes. The count held because new ones replaced them.' },
        { t: 'The mRNA ran out.', mc: 'OTHER',
          fb: 'mRNA was made the whole time the gene was on. Without it, the count would have fallen.' },
      ],
    },
    d2: {
      prompt: 'Proteases now cut twice as fast, and the gene setting stays the same. Where does the transporter count level off?',
      options: [
        { t: 'About half as high.', ok: true,
          fb: 'Each transporter now lasts half as long, so the same rate of making balances at half the count.' },
        { t: 'At the same level, reached more slowly.', mc: 'OTHER',
          fb: 'Faster cutting up lowers the level itself: the count settles where cutting up equals making.' },
        { t: 'It keeps its level; breakdown only matters once the gene is off.', mc: 'MOLECULES_LAST',
          fb: 'Cutting up goes on all the time. With faster proteases, a smaller count is cut up as fast as new ones are made.' },
        { t: 'About twice as high.', mc: 'OTHER',
          fb: 'Faster proteases remove each transporter sooner, so fewer build up.' },
      ],
    },
    echo1: 'Your proteins are made and broken down all the time. Some last minutes, others for years.',
    echo2: 'Red blood cells lose their nucleus, read their leftover mRNA for a day or two, then make no new protein. They last about 120 days.',
    cards: { turnover: 'Protein turnover' },
    hud: {
      // The long form names the protein by its job; under 400 px only "LacY" fits beside the timer and counter.
      goal: '{count} transporters · target {lo}–{hi} · held {h} of 15 min', goalShort: 'LacY {count} · {h}/15 min',
      ready: '{count} transporters · ready to switch off', off: '{count} transporters · gene off', offShort: 'LacY {count}',
      timer: '{time} left', epilogueTimer: '{time} of 12 min',
      counter: 'changes {c} · target 2', counterShort: '{c}/2 changes',
      counterOver: 'changes {c} · more than needed (2)', counterOverShort: '{c}/2 changes',
    },
    band: 'target',
    result: { used: 'You changed the setting {c} times; 2 or fewer is enough.', usedOne: 'You changed the setting once; 2 or fewer is enough.' },
    narr: {
      rising: 'Transporters are made faster than they are cut up, so the count rises until the two rates meet.',
      dropping: 'At this setting transporters are cut up faster than they are made, so the count falls until the two rates meet.',
      balance: 'Transporters are made and cut up at about the same rate, so the count holds steady.',
      over: 'At this setting making and cutting up balance above the target range, so the count settles there.',
      under: 'At this setting making and cutting up balance below the target range, so the count settles there.',
      falling: 'No new transporters are being made, and proteases keep cutting up the rest.',
      down: 'Transporters are made less often now, and proteases keep cutting them up, so the count settles at a lower level.',
    },
  };

  const L = LC.l14;
  const cmd = (level) => ({ type: 'setPromoter', gene: 'lacY', level });
  const isOn = (g) => g.level !== 'off' && (g.level !== null || g.rate_perS > 0);
  const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);

  const DEF = {
    id: '1.4', code: '14', order: 4, version: CONTENT, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'operator', scored: true, los: ['LO4'], misconceptions: ['MOLECULES_LAST', 'INSTANT', 'CELL_DECIDES'],
    estMinutes: 8, engine: '1.1',
    phases: ['intro', 'task', 'predict', 'run', 'result', 'predict2', 'epilogue', 'debrief', 'echo', 'complete'],
    holdMin: HOLD_MIN, limitMin: LIMIT_MIN,

    /**
     * Half-life 3, 4 or 5 min × target setting ×1 or ×2, without half-life 5 min at ×2: 5 variants
     * (content version 2). There the stockpile (×4 to the band's middle, then off) held the band on
     * 6 of 40 seeds, because a long half-life keeps the stock in the band for most of the hold
     * (LEVELS.md, "Changes after engine 1.1"). The band is set around the calibrated steady count.
     */
    variant(seed) {
      const r = K.rng(seed, '1.4');
      const [halfLife_min, targetLevel] = r.pick(VARIANTS);
      const S = L.S[halfLife_min][targetLevel], S1 = L.S[halfLife_min][1];
      return { seed, halfLife_min, targetLevel, lo: K.round(L.band[0] * S, 10), hi: K.round(L.band[1] * S, 10), S1: K.round(S1, 10) };
    },
    /** Words for the story and the Expert number: X LacY per minute at ×1, each lasting about Y minutes (X·Y = S1). */
    textVars(v) {
      const Y = L.lifeMin[v.halfLife_min];
      return { halfLife: v.halfLife_min, X: Math.round(v.S1 / Y), Y };
    },
    variantLabel(v) { return 'half-life ' + v.halfLife_min + ' min, ×' + v.targetLevel + ', band ' + v.lo + '–' + v.hi; },

    config(v, role) {
      return {
        seed: K.seedFor(v.seed, role), strain: 'm1-lab', start: 'birth',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
        genes: { lacY: { level: 'off', kdeg_perS: LN2 / (v.halfLife_min * 60) } },
        flags: { userGenes: ['lacY'] },
        variant: { levelId: '1.4', content: CONTENT, seed: v.seed, halfLife_min: v.halfLife_min, targetLevel: v.targetLevel },
      };
    },

    labConfig(v, state) {
      const epilogue = !!state && state.phase === 'epilogue';
      return {
        showNames: true, genesVisible: ['lacY'], controls: { genes: true, medium: false, drugs: false },
        // In the epilogue the one change is the "Switch the gene off" button.
        lockedGenes: epilogue ? ['lacY'] : [],
        mediumRows: { glucose: 'locked', lactose: 'locked', aminoAcids: 'locked' },
        speedOptions: [10, 60, 600], defaultSpeed: 60, startPaused: true,
        tabs: ['cell', 'genes', 'graphs'], graphGenes: ['lacY'], focusGene: 'lacY', hud: true,
        yBand: { plot: 'protein', gene: 'lacY', lo: v.lo, hi: v.hi, label: TEXT.band },
        graphWindow: 3600,
      };
    },

    hud(v, st) {
      const s = Object.assign({ tick: 0, count: 0, mean: 0, run: 0, done: false, changes: 0 }, st || {});
      const count = Math.floor(s.count + 0.5);
      const gauge = { lo: v.lo, hi: v.hi, max: Math.round(1.5 * v.hi), value: s.mean };
      // Over par (more than 2 changes) the counter says so in words, and the HUD colours it.
      const counter = s.changes > 2
        ? { text: K.fill(TEXT.hud.counterOver, { c: s.changes }), short: K.fill(TEXT.hud.counterOverShort, { c: s.changes }), over: true }
        : { text: K.fill(TEXT.hud.counter, { c: s.changes }), short: K.fill(TEXT.hud.counterShort, { c: s.changes }) };
      if (s.epilogue) {
        const ep = s.epilogue;
        const started = !!ep.started;
        return {
          goal: { text: K.fill(started ? TEXT.hud.off : TEXT.hud.ready, { count }), short: K.fill(TEXT.hud.offShort, { count }), progress: null, done: true, gauge },
          timer: { text: K.fill(TEXT.hud.epilogueTimer, { time: K.clock(started ? Math.min(EPILOGUE_MIN * 60, s.tick - ep.startTick) : 0, true) }) },
          counter,
        };
      }
      const h = Math.floor(Math.min(s.run, HOLD_MIN * 60) / 60), left = Math.max(0, LIMIT_MIN * 60 - s.tick);
      const vars = { count, lo: v.lo, hi: v.hi, h };
      return {
        goal: { text: K.fill(TEXT.hud.goal, vars), short: K.fill(TEXT.hud.goalShort, vars), progress: null, done: !!s.done, gauge },
        timer: { text: K.fill(TEXT.hud.timer, { time: K.clock(left, true) }), short: K.fill(TEXT.hud.timer, { time: left < 60 ? K.clock(left, true) : Math.ceil(left / 60) + ' min' }) },
        counter,
      };
    },

    predictions: [
      { id: 'p1', kind: 'choice', prompt: TEXT.p1.prompt, options: TEXT.p1.options },
      { id: 'ss', kind: 'number', expert: true, prompt: TEXT.ss.prompt, unit: TEXT.ss.unit, min: 10, max: 3000, step: 10, tolerance: 0.25,
        answer(v) { return v.S1; } },
      { id: 'p2', kind: 'choice', phase: 'predict2', prompt: TEXT.p2.prompt, options: TEXT.p2.options },
    ],
    epilogue: { durationTicks: EPILOGUE_MIN * 60, speed: 60, command: cmd('off') },

    monitor(v) {
      const tr = K.holdTracker({ lo: v.lo, hi: v.hi, meanTicks: MEAN_TICKS, needTicks: HOLD_MIN * 60 });
      // The last minute's making and cutting-up rates (LacY per s): the narrator says which is larger.
      const made = K.trailingMean(MEAN_TICKS), cut = K.trailingMean(MEAN_TICKS);
      let st = {
        tick: 0, count: 0, mean: 0, run: 0, best: 0, done: false, doneTick: -1, changes: 0, level: 'off', on: false,
        onOff: 0, pulsingTick: -1, stockArmed: -1, stockpileTick: -1, mRNA: 0, nascent: 0, prev: 0, falling: false,
        made: 0, cut: 0,
      };
      return {
        /** The HUD shows the newborn's few LacY before the run's first tick, as the gene card does. */
        start(cell) { st.count = st.prev = cell.observe().geneById.lacY.protein; },
        onTick(cell) {
          const g = cell.observe().geneById.lacY, on = isOn(g);
          st.prev = st.count;
          st.tick = cell.tick; st.count = g.protein; st.mRNA = g.mRNA; st.nascent = g.nascent;
          st.on = on; st.level = on ? g.level : 'off';
          st.falling = g.protein < st.prev;
          st.made = made.push(g.synthesis_perS); st.cut = cut.push(g.degraded_perS);
          const h = tr.push(g.protein, cell.tick);
          st.mean = h.mean; st.run = h.run; st.best = h.best;
          if (!st.done && h.done) { st.done = true; st.doneTick = h.doneTick; }
          // STOCKPILE: switched off above lo and still off once the count is below lo.
          if (st.stockArmed >= 0 && !st.done) {
            if (on) st.stockArmed = -1;
            else if (g.protein < v.lo && st.stockpileTick < 0) st.stockpileTick = cell.tick;
          }
        },
        userCommand(e) {
          if (st.done || e.rejected || e.type !== 'setPromoter' || !e.args || e.args.gene !== 'lacY') return;
          st.changes++;
          const r = e.resolved || {};
          const now = r.level !== undefined ? r.level !== 'off' && (r.level !== null || r.rate_perS > 0) : e.args.level !== 'off';
          if (st.on && !now) {
            st.onOff++;
            if (st.onOff >= 2 && st.pulsingTick < 0) st.pulsingTick = e.tick;
            if (st.count > v.lo) st.stockArmed = e.tick;
          }
          st.on = now;
        },
        end() { return st.done ? 'goal' : st.tick >= LIMIT_MIN * 60 ? 'limit' : null; },
        result() {
          return { goal: st.done, doneTick: st.doneTick, changes: st.changes, onOff: st.onOff, pulsingTick: st.pulsingTick,
            stockpileTick: st.stockpileTick, best: st.best, count: st.count };
        },
        save() { return Object.assign({}, st, { tracker: tr.state(), madeMean: made.state(), cutMean: cut.state() }); },
        restore(s) {
          const c = Object.assign({}, s);
          tr.restore(c.tracker); made.restore(c.madeMean); cut.restore(c.cutMean);
          delete c.tracker; delete c.madeMean; delete c.cutMean;
          st = c;
        },
      };
    },

    score(v, m, answers) {
      const p = answers.predictions, d = answers.debrief;
      const c = m.changes || 0;
      const E = clamp01(1 - 0.25 * Math.max(0, c - 2));
      const P = ((p.p1 && p.p1.correct ? 1 : 0) + (p.p2 && p.p2.correct ? 1 : 0)) / 2;
      const ssOk = !!(p.ss && p.ss.locked && p.ss.correct);
      const X = (ssOk ? 1 : 0) | (m.goal && c === 1 ? 2 : 0);
      const flags = [];
      if (m.pulsingTick >= 0) flags.push({ id: 'PULSING', tick: m.pulsingTick, data: { switchesOff: m.onOff } });
      if (m.stockpileTick >= 0) flags.push({ id: 'STOCKPILE', tick: m.stockpileTick, data: {} });
      const mc = (id) => (p[id] && p[id].locked ? p[id].mc : null);
      if (mc('p1') === 'MOLECULES_LAST') flags.push({ id: 'PRED_RISES_FOREVER', data: { option: p.p1.option } });
      if (mc('p2') === 'MOLECULES_LAST') flags.push({ id: 'PRED_STAYS_AFTER_OFF', data: { option: p.p2.option } });
      if (mc('p1') === 'INSTANT' || mc('p2') === 'INSTANT') flags.push({ id: 'PRED_INSTANT', data: {} });
      const first = (qid) => (d[qid] ? d[qid].firstMc : null);
      if (first('l14.d1') === 'MOLECULES_LAST' || first('l14.d2') === 'MOLECULES_LAST') flags.push({ id: 'DEB_MOLECULES_LAST', data: {} });
      if (first('l14.d1') === 'CELL_DECIDES') flags.push({ id: 'DEB_CELL_DECIDES', data: { option: d['l14.d1'].first } });
      return { E, P, X, flags, changes: c };
    },

    resultLines(v, comp) {
      if (typeof comp.changes !== 'number') return [];
      return [comp.changes === 1 ? TEXT.result.usedOne : K.fill(TEXT.result.used, { c: comp.changes })];
    },

    flags: [
      { id: 'PULSING', mc: 'MOLECULES_LAST' }, { id: 'STOCKPILE', mc: 'MOLECULES_LAST' },
      { id: 'PRED_RISES_FOREVER', mc: 'MOLECULES_LAST' }, { id: 'PRED_STAYS_AFTER_OFF', mc: 'MOLECULES_LAST' },
      { id: 'PRED_INSTANT', mc: 'INSTANT' }, { id: 'DEB_MOLECULES_LAST', mc: 'MOLECULES_LAST' }, { id: 'DEB_CELL_DECIDES', mc: 'CELL_DECIDES' },
    ],
    debrief: [
      { id: 'l14.d1', kind: 'choice', prompt: TEXT.d1.prompt, options: TEXT.d1.options },
      { id: 'l14.d2', kind: 'choice', prompt: TEXT.d2.prompt, options: TEXT.d2.options },
    ],
    echo: { screens: ['echo1', 'echo2'], cards: [{ id: 'protein-turnover', title: 'cards.turnover', stamp: 'universal' }] },
    story: { intro: TEXT.story.intro, outro: TEXT.story.outro, extra: { pulsed: TEXT.story.pulsed, missed: TEXT.story.missed } },
    /** "LacY was made and cut up at the same rate the whole time" is true only for a held band with the gene never switched off. */
    outroKey(v, m, goal) { return !goal ? 'missed' : m && m.onOff > 0 ? 'pulsed' : null; },

    /**
     * Level narrator rules (§7.4.12), each true when it fires: they compare the last minute's
     * making rate with its cutting-up rate (both measured, LacY per s), so "rises", "falls" and
     * "holds steady" describe what the count has just done. Dilution does not change a count.
     */
    narratorRules: (function () {
      const mon = (lv) => (lv && lv.monitor && typeof lv.monitor.made === 'number' && lv.monitor.tick >= MEAN_TICKS ? lv.monitor : null);
      const faster = (m) => m.made > 1.1 * m.cut + 0.05, slower = (m) => m.made < 0.9 * m.cut - 0.05;
      const even = (m) => !faster(m) && !slower(m);
      return [
        { key: 'l14.falling', template: TEXT.narr.falling,
          when: (f, mem, t, lv) => { const m = mon(lv); return !!m && !m.on && m.falling && m.mRNA + m.nascent === 0 && m.count > 1; } },
        { key: 'l14.rising', template: TEXT.narr.rising,
          when: (f, mem, t, lv) => { const m = mon(lv); return !!m && m.on && faster(m); } },
        { key: 'l14.dropping', template: TEXT.narr.dropping,
          when: (f, mem, t, lv) => { const m = mon(lv); return !!m && m.on && slower(m); } },
        { key: 'l14.balance', template: TEXT.narr.balance,
          when: (f, mem, t, lv) => { const m = mon(lv); return !!m && m.on && even(m) && m.run >= MEAN_TICKS; } },
        { key: 'l14.over', template: TEXT.narr.over,
          when: (f, mem, t, lv) => { const m = mon(lv); return !!m && m.on && even(m) && m.mean > lv.variant.hi; } },
        { key: 'l14.under', template: TEXT.narr.under,
          when: (f, mem, t, lv) => { const m = mon(lv); return !!m && m.on && even(m) && m.mean < lv.variant.lo; } },
        // Turned down: the lab's line would blame dilution, but here proteases remove nearly all of it.
        { key: 'l14.down', template: TEXT.narr.down,
          when: (f, mem, t, lv) => !!lv && lv.phase === 'run' && !!lv.monitor && lv.monitor.on && mem.phase === 'down' },
      ];
    }()),

    solutions: (function () {
      const offInEpilogue = { every: 1, act(view, tick, api) { if (isOn(view.geneById.lacY)) api.command(cmd('off')); } };
      const policy = (act, extra) => Object.assign({ kind: 'policy', every: 5, act, epilogue: offInEpilogue }, extra);
      return {
        // ×4 at once; the target setting when the mRNA already made will carry the count to the band's middle.
        reference: policy((view, tick, api, v) => {
          const g = view.geneById.lacY;
          if (tick === 0) api.command(cmd(4));
          else if (g.level === 4 && g.protein + 15 * g.mRNA + 20 * g.nascent >= (v.lo + v.hi) / 2) api.command(cmd(v.targetLevel));
        }, { predictions: { ss: (v) => v.S1 }, expect: { goal: true, par: true, minTotal: 90, flags: [] } }),
        single: policy((view, tick, api, v) => { if (tick === 0) api.command(cmd(v.targetLevel)); },
          { predictions: { ss: (v) => v.S1 }, expect: { goal: true, par: true, X: 3 } }),
        pulser: policy((view, tick, api, v) => {
          const g = view.geneById.lacY;
          if (!isOn(g) && g.protein < 1.1 * v.lo) api.command(cmd(4));
          else if (g.level === 4 && g.protein > (v.lo + v.hi) / 2) api.command(cmd('off'));
        }, { expect: { par: false, flags: ['PULSING'] } }),
        max: policy((view, tick, api) => { if (tick === 0) api.command(cmd(4)); }, { expect: { goal: false } }),
        stockpile: policy((view, tick, api, v) => {
          const g = view.geneById.lacY;
          if (tick === 0) api.command(cmd(4));
          else if (g.level === 4 && g.protein >= (v.lo + v.hi) / 2) api.command(cmd('off'));
        }, { expect: { goal: false, flags: ['STOCKPILE'] } }),
      };
    }()),
  };
  return DEF;
});
