// @deps btc-level-kit btc-misconceptions btc-level-constants btc-mrnawatch
/*
 * Be the Cell: level 1.2, "Milk is on its way" (docs/PROLOGUE.md §6.2). Operator mode, LO2; the
 * teaching-first pattern: Watch, Guess then see, Try, Explain.
 *
 * Watch (W1–W3, tier 3, Gene zoom on lacY): the student switches the lactose transporter gene on and
 * watches one mRNA copy being read into transporters, one after another, until it is broken down (the
 * watched copy: its count comes from BTC.MRNAWatch, the model's own share of the gene's ribosomes);
 * then guesses what switching the gene off will do, switches it off, and counts the copies still left
 * while transporters keep arriving from them.
 *
 * Try (the run, tier 3): at minute D the glucose runs out and milk sugar (lactose) arrives. The target
 * T comes from the cell's economy: the number of lactose transporters with which a cell whose
 * lactose-splitting enzyme is already made grows on milk sugar at least 0.8 of its glucose rate (tools/level-calibrate.js,
 * l12 v2). At D the switch locks, the view goes to the whole cell and the student watches the cell live on
 * milk sugar for 20 game-minutes: it keeps growing, or stalls. Efficiency counts the copies made beyond
 * those the target needed (by this run's own copies-to-transporters ratio): every extra copy costs energy.
 *
 * Explain (the debrief): two questions whose feedback teaches. Every student-facing string is in TEXT
 * (linted, LEVELS §12.1 L-2). Calibrated numbers come from BTC.levelConstants.l12, never from this file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/btc-level-kit.js'), require('../game/btc-misconceptions.js'),
      require('./btc-level-constants.js'), require('../shared/btc-mrnawatch.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {}))['1.2'] = factory(B.levelKit, B.misconceptions, B.levelConstants, B.MRNAWatch);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, LC, MRNAWatch) {
  'use strict';
  void MC;

  // Content version (LEVELS §3.2): 2 the M2 review, 3 the plain-language pass, 4 the teaching-first rebuild
  // (watch, guesses, a target from the cell's economy, the milk phase, efficiency from extra copies).
  const CONTENT = 4;
  const L = LC.l12, ECO = LC.economy, LAMBDA_REF = LC.l11.lambdaRef;
  const MILK_MIN = 20, ON = 4;
  const WORDS = { 15: 'fifteen', 20: 'twenty', 25: 'twenty-five' };
  const ppmWords = WORDS[Math.min(25, Math.max(15, Math.round(L.ppm / 5) * 5))];
  const comma = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const TEXT = {
    title: 'Milk is on its way',
    challenge: 'Enough lactose transporters in time, and no more copies than needed.',
    task: {
      // The task card of PROLOGUE §1.4: machine cards, the scenario, why it matters, then the goal.
      cards: {
        lacY: { job: 'Carries lactose into the cell.', name: 'Lactose transporter', symbol: 'lacY', state: 'none yet' },
        lacZ: { job: 'Splits lactose into two sugars: glucose and galactose.', name: 'Lactose-splitting enzyme', symbol: 'lacZ', state: 'ready' },
      },
      context: ['At minute {D} the glucose runs out and milk sugar arrives.',
        'Without enough lactose transporters, the cell will be short of energy and grow slowly on milk sugar.'],
      goal: 'Have {T} lactose transporters in the membrane by minute {D}.',
      core: ['Reach {T} by minute {D}.', 'Switch the gene off when enough are on the way: every extra copy costs energy.'],
      expert: ['Finish with no more than {tMax} transporters: switch off at the right moment.'],
    },
    story: {
      intro: [
        { who: 'narrator', text: 'Your cell is fed and growing on glucose. At minute {D} the glucose runs out, and milk sugar arrives instead.' },
        { who: 'narrator', text: 'Milk sugar gets in only through lactose transporters, and this cell has none. Its lactose-splitting enzyme is already made.' },
        { who: 'commander', text: 'Then build every transporter now, and stop when the milk arrives.' },
        { who: 'narrator', text: 'Each transporter is built from an mRNA copy of its gene. Before you plan, watch one copy at work.' },
      ],
      onRun: [
        { who: 'narrator', text: 'Switch off too late and energy goes on copies that are not needed. Switch off too early and too few transporters arrive.' },
      ],
      milk: [
        { who: 'narrator', text: 'The glucose is gone. From now on the cell lives on what its transporters let in.' },
      ],
      fed: [
        { who: 'narrator', text: 'The milk sugar arrived, and the transporters were already in place, so the cell kept growing.' },
        { who: 'narrator', text: 'You switched one gene on and off at the right moments. The copies and the ribosomes did the rest.' },
      ],
      keptOn: [
        { who: 'narrator', text: 'The cell kept growing on milk sugar, but the gene stayed on long after enough copies had been made.' },
        { who: 'commander', text: 'Better too many than too few.' },
        { who: 'narrator', text: 'Every extra copy and transporter cost energy that could have gone into growing.' },
      ],
      missed: [
        { who: 'narrator', text: 'The milk sugar arrived before enough transporters did, so the cell ran short of energy and grew slowly.' },
        { who: 'commander', text: 'I switched the gene on. Why was that not enough?' },
        { who: 'narrator', text: 'Each copy takes minutes to be made and read, so transporters arrive well after the switch.' },
      ],
      all: [
        { who: 'narrator', text: 'One gene, a few hundred copies, thousands of transporters. The copies are where the numbers come from.' },
        { who: 'commander', text: 'The switch is only the start. The copies set the numbers.' },
        { who: 'narrator', text: 'And transporters do not last forever. That is the next problem.' },
      ],
    },
    steps: {
      w1: [{ who: 'narrator', text: 'This is the lactose transporter gene. It is switched off, so nothing is being copied.' }],
      w1b: [{ who: 'narrator', text: 'The first copy is outlined. Watch how many transporters it is read into.' }],
      w2: [{ who: 'narrator', text: 'Ribosome after ribosome reads each copy until it is broken down.' }],
      w2b: [{ who: 'narrator', text: 'The gene is off. Count the copies still left.' }],
      w2c: [{ who: 'ribosome', text: 'I read each copy that reaches me until it is broken down. Nobody tells me the gene is off.' }],
      w3: [
        { who: 'narrator', text: 'So one copy gives about {ppmWords} transporters, and they keep arriving for a few minutes after the gene is off.' },
        { who: 'commander', text: 'About {ppmWords} from each copy. Then a handful of copies will do.' },
        { who: 'narrator', text: 'Feeding a cell on milk sugar takes thousands of transporters, so it takes a few hundred copies.' },
      ],
    },
    causes: {
      w1b: 'This copy was read into {n} transporters in {t}, then broken down. Meanwhile {k} more copies were made.',
      w2b: 'Switching the gene off stopped new copies from being started. The copies already made were still read, so {a} more transporters arrived.',
    },
    notes: {
      on: 'The gene is on again, so new copies are being made. Switch it off to carry on.',
      off: 'The gene is off, so no copy is being made. Switch it on to carry on.',
    },
    g1: {
      prompt: 'When you switch the gene on, how many transporters will one mRNA copy be read into before it is broken down?',
      options: [
        { t: 'One.', mc: 'OTHER', fb: 'Ribosome after ribosome read the same copy. This one gave {n} before it was broken down.' },
        { t: 'About {ppmWords}.', cause: true, fb: 'Ribosome after ribosome read it until it was broken down. This one gave {n}; the average is about {ppmWords}.' },
        { t: 'Thousands.', mc: 'OTHER', fb: 'Each copy lasts only minutes, so it gives tens, not thousands. This one gave {n}.' },
        { t: 'It is never broken down, so it keeps going.', mc: 'MOLECULES_LAST', fb: 'Copies are broken down within minutes. This one lasted {t} and gave {n}.' },
      ],
    },
    g2: {
      prompt: 'What will happen if you switch the gene off now?',
      options: [
        { t: 'The copies already made are still read, so transporters keep arriving for a few minutes.', cause: true,
          fb: 'Transporters kept arriving from the copies already made, {a} of them, until the last copy was broken down.' },
        { t: 'Transporters stop arriving at once.', mc: 'INSTANT', fb: 'They kept arriving: {a} more, from copies made before the switch-off.' },
        { t: 'The copies stay, so transporters keep arriving for good.', mc: 'MOLECULES_LAST', fb: 'The copies were broken down within minutes, so the arrivals slowed and then stopped.' },
        { t: 'The transporters already made disappear.', mc: 'OTHER', fb: 'The transporters stayed in the membrane. Only the copies were broken down.' },
      ],
    },
    d1: {
      prompt: 'You switched the gene off, yet transporters kept arriving. Why?',
      options: [
        { t: 'Copies made before the switch-off were still being read by ribosomes.', ok: true,
          fb: 'Each copy lasts a few minutes, and ribosomes keep reading it until it is broken down.' },
        { t: 'The gene took a while to notice it was off.', mc: 'CELL_DECIDES',
          fb: 'Genes notice nothing. No new copy was started after the switch-off; the copies already made were still read.' },
        { t: 'Transporters make more transporters once there are enough.', mc: 'PROTEIN_SELF_COPY',
          fb: 'Proteins are not copied from proteins. Every transporter was built by a ribosome reading an mRNA copy.' },
        { t: 'The switch-off took minutes to reach the DNA.', mc: 'DELAY_MISATTRIBUTED',
          fb: 'The switch acted at once: no new copy was started. The extra transporters came from copies already made.' },
      ],
    },
    d2: {
      prompt: 'Why does the cell make mRNA copies instead of reading the gene itself?',
      options: [
        { t: 'Many copies can be made, and each is read many times, so one gene gives many proteins.', ok: true,
          fb: 'One gene gave {M} copies, each read into about {ppmWords} transporters. Copies are broken down, so making stops soon after the gene is off.' },
        { t: 'mRNA is a spare copy kept in case the DNA is damaged.', mc: 'MIDDLEMAN', fb: 'mRNA is read, not stored. Each copy lasts only minutes.' },
        { t: 'Ribosomes cannot reach the DNA.', mc: 'OTHER',
          fb: 'In this bacterium ribosomes start on a copy right beside the DNA, while it is still being made. Distance is not the reason.' },
        { t: 'mRNA is an early form of the protein.', mc: 'MIDDLEMAN', fb: 'mRNA is a copy of the instructions. Ribosomes read it; it is never built into the protein.' },
      ],
    },
    echo1: 'A beta cell in your pancreas makes insulin the same way: one gene, copied into many mRNAs, each read by many ribosomes.',
    echo2: 'Nearly every cell in your body has the same two copies of the insulin gene. It is copied into mRNA almost only in beta cells.',
    // The card of this level (Part 1 already gave the mRNA card): what the watch showed, true of your cells too.
    cards: {
      mRNATemp: 'mRNA copies are temporary',
      mRNATempNote: 'Your cells’ mRNA copies are also broken down after a while. That is how a cell stops making a protein soon after its gene is switched off.',
    },
    hud: {
      goal: '{count} / {T} lactose transporters', goalShort: 'Transporters {count} / {T}', goalOverShort: 'Transporters {count}',
      milk: 'Milk sugar here · {count} transporters', milkShort: 'Milk here · {count}',
      timer: 'milk in {time}', timerShort: 'milk in {time}', watchTimer: 'watching {time} more', watchTimerShort: '{time} more',
      counter: '{m} copies', counterShort: '{m} copies', counterOver: '{m} copies · over par', counterOverShort: '{m} · over par', counterOverTiny: 'over par',
      copy: 'This copy: read into {n}', copyGone: 'Read into {n}, then broken down', copyShort: 'Read into {n}',
      sinceOff: '+{a} transporters since the switch-off', sinceOffShort: '+{a} since off',
      watchGoal: 'Watching the lactose transporter gene', watchGoalShort: 'Watching the gene',
      watchCounter: '{m} copies made', watchCounterShort: '{m} made', clock: 'minute {t}',
    },
    graph: { target: 'target {T}', milk: 'milk arrives' },
    narr: {
      read: 'Ribosomes are reading every copy; each copy gives about {ppmWords} transporters before it is broken down.',
      leftover: 'The gene is off, but the copies already made are still being read.',
      milk: 'The glucose is gone; lactose gets in only through the lactose transporters in the membrane.',
      short: 'Too few transporters let too little lactose in, so energy is low and growth is slow.',
      fed: 'Enough lactose gets in through the transporters, so the cell keeps growing.',
    },
    result: {
      growth: 'On milk sugar the cell grew at {pct}% of its glucose speed.',
      copies: 'You made {m} copies; about {need} would have given {T} transporters.',
      cost: 'Extra copies and the transporters they made cost about {atp} ATP: the energy from about {glc} glucose.',
      hint: 'Each copy already made gives about {ppmWords} more transporters, so switch off before the count reaches the target.',
    },
  };

  const cmd = (level) => ({ type: 'setPromoter', gene: 'lacY', level });
  const isOn = (g) => g.level !== 'off' && (g.level !== null || g.rate_perS > 0);
  const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);
  /** "about 4 minutes", "40 seconds": a copy's life in words for the story lines. */
  function lifeWords(s) {
    if (!(s > 0)) return '0 seconds';
    if (s < 90) return Math.round(s) + ' seconds';
    const m = Math.round(s / 60);
    return m + ' minutes';
  }
  /** Efficiency (PROLOGUE §6.2.5, recalibrated): the share of transporters (so of copies) made beyond the target. */
  function efficiency(T, made) {
    const x = made / T - 1;
    return x <= L.parFree ? 1 : clamp01(1 - (0.2 * (x - L.parFree)) / (L.parX - L.parFree));
  }

  /** The watch cell's monitor: the watched copy (BTC.MRNAWatch), copies made meanwhile, transporters since the switch-off. */
  function watchMonitor() {
    let st = { m: 0, mRNA: 0, nascent: 0, level: 'off', n: 0, alive: false, life: 0, k: 0, base: 0, watching: false, offTick: -1, pOff: 0, a: 0, tick: 0 };
    let w = null;
    return {
      start(cell) { const g = cell.observe().geneById.lacY; st.m = g.mRNAMade; },
      onTick(cell, ctx) {
        const v = cell.observe(), g = v.geneById.lacY;
        st.tick = cell.tick; st.m = g.mRNAMade; st.mRNA = g.mRNA; st.nascent = g.nascent;
        const on = isOn(g);
        if (ctx && ctx.watchedId !== null && ctx.watchedId !== undefined && !st.watching) {
          w = new MRNAWatch('lacY');
          if (w.watch(cell, ctx.watchedId)) { st.watching = true; st.base = g.mRNAMade; }
        }
        if (w && st.watching) {
          w.onTick(cell);
          st.n = w.started; st.alive = w.alive; st.life = w.lifetime(cell.tick);
          if (w.alive) st.k = g.mRNAMade - st.base;
        }
        // The switch-off after the watched copy: transporters made from then on.
        if (st.watching && st.offTick < 0 && st.level !== 'off' && !on) { st.offTick = cell.tick; st.pOff = g.proteinMade; }
        if (st.offTick >= 0) st.a = g.proteinMade - st.pOff;
        st.level = on ? g.level : 'off';
      },
      vars() { return { n: Math.round(st.n), t: lifeWords(st.life), k: st.k, a: comma(st.a), m: st.mRNA }; },
      save() { return Object.assign({}, st, { w: w ? w.save() : null }); },
      restore(s) { st = Object.assign({}, s); w = s.w ? MRNAWatch.restore(s.w) : null; delete st.w; },
    };
  }

  const DEF = {
    id: '1.2', code: '12', order: 2, version: CONTENT, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'operator', scored: true, los: ['LO2', 'LO3', 'LO4'],
    misconceptions: ['MIDDLEMAN', 'PROTEIN_SELF_COPY', 'DELAY_MISATTRIBUTED', 'INSTANT', 'MOLECULES_LAST', 'CELL_DECIDES'],
    estMinutes: 12, engine: '1.1',
    phases: ['intro', 'watch', 'task', 'run', 'result', 'debrief', 'echo', 'complete'],

    /** T ∈ L.T (0.9·T, T, 1.1·T of the economy's "enough", rounded to 100); D and Tmax per T from the calibration. */
    variant(seed) {
      const r = K.rng(seed, '1.2');
      const T = r.pick(L.T);
      return { seed, T, D: L.D[T], tMax: L.tMax[T] };
    },
    textVars(v) { return { T: comma(v.T), D: v.D, tMax: comma(v.tMax), ppmWords }; },
    /** Numbers from the run, for the debrief's feedback ({M}: the copies this student made). */
    resultVars(v, m) { return { M: m && typeof m.m === 'number' ? comma(m.m) : 'a few hundred' }; },
    variantLabel(v) { return 'T ' + v.T + ', D ' + v.D + ', Tmax ' + v.tMax; },

    config(v, role) {
      const cfg = {
        seed: K.seedFor(v.seed, role), strain: 'm1-lab', start: 'birth',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
        genes: { lacY: { level: 'off', initial: { clear: true, protein: 0 } }, lacZ: { level: 1, initial: { protein: L.lacZReady } } },
        flags: { userGenes: ['lacY'] },
        variant: { levelId: '1.2', content: CONTENT, seed: v.seed, T: v.T, D: v.D, tMax: v.tMax },
      };
      // The run: at D the glucose goes, milk sugar arrives and the switch locks (lesson commands, R-E11).
      if (role !== 'watch') {
        cfg.schedule = [
          { tick: v.D * 60, cmd: { type: 'setMedium', glucose_mM: 0, lactose_mM: ECO.lactose_mM } },
          { tick: v.D * 60, cmd: { type: 'setControls', controls: 'locked' } },
        ];
      }
      return cfg;
    },

    labConfig(v, state) {
      const st = state || {}, mon = st.monitor || {};
      const base = {
        showNames: true, genesVisible: ['lacY', 'lacZ'], controls: { genes: true, medium: false, drugs: false }, lockedGenes: ['lacZ'],
        mediumRows: { glucose: 'locked', lactose: 'locked', aminoAcids: 'locked' }, focusGene: 'lacY', graphGenes: ['lacY'], hud: true,
      };
      const counters = { counters: ['mRNA', 'made', 'protein'], control: 'onoff', onLevel: ON };
      if (st.phase === 'watch' || st.phase === 'intro') {
        return Object.assign(base, {
          speedOptions: [1, 10, 60], defaultSpeed: 10, startPaused: true, tabs: ['cell'],
          ui: { tier: 3, status: { energy: false, growth: false, sugarIn: false }, zoom: { levels: ['cell', 'gene', 'protein'], initial: 'gene' },
            focusBar: counters, tabs: ['cell'], introduce: ['counter.mRNA', 'counter.made', 'counter.protein'] },
        });
      }
      // The Try: the counters, Off/On (On = ×4) and one graph with the target and the milk's arrival; from minute D the
      // economy readouts (sugar coming in, energy, growth) join, each introduced once.
      const milk = !!mon.milk;
      return Object.assign(base, {
        speedOptions: [10, 60], defaultSpeed: 10, startPaused: true, tabs: ['cell', 'graphs'], graphWindow: (v.D + MILK_MIN) * 60,
        ui: { tier: 3, status: { energy: milk, growth: milk, sugarIn: milk }, zoom: { levels: ['cell', 'gene', 'protein'], initial: 'gene' },
          focusBar: counters, tabs: ['cell', 'graph'],
          graph: { series: [{ gene: 'lacY', kind: 'protein' }], target: { y: v.T, label: K.fill(TEXT.graph.target, { T: comma(v.T) }) },
            marks: [{ t: v.D * 60, label: TEXT.graph.milk }], window: (v.D + MILK_MIN) * 60 },
          introduce: milk ? ['readout.sugarIn', 'status.energy', 'status.growth'] : ['counter.made', 'graph.protein', 'graph.target'] },
      });
    },
    /** The screen changes when the milk arrives (the economy readouts join). */
    uiKey(mon) { return mon && mon.milk ? 'milk' : ''; },

    watch: {
      gene: 'lacY', onLevel: ON,
      monitor: watchMonitor,
      steps: [
        { id: 'w1', lines: TEXT.steps.w1, point: 'control:promoter', guess: Object.assign({ id: 'g1', showAt: 'w1b' }, TEXT.g1),
          act: { kind: 'command', expect: { type: 'setPromoter', gene: 'lacY', on: true } }, gate: { kind: 'act' } },
        { id: 'w1b', until: { test: 'firstMRNA', watch: true, pause: true }, lines: TEXT.steps.w1b, point: 'mrna:first',
          gate: { kind: 'state', test: 'watchedGone', pause: true }, cause: TEXT.causes.w1b, offerSpeed: 60 },
        { id: 'w2', lines: TEXT.steps.w2, point: 'control:promoter', guess: Object.assign({ id: 'g2', showAt: 'w2b' }, TEXT.g2),
          act: { kind: 'command', expect: { type: 'setPromoter', gene: 'lacY', on: false } }, gate: { kind: 'act' } },
        { id: 'w2b', lines: TEXT.steps.w2b, point: 'counter:mRNA', gate: { kind: 'state', test: 'allMRNAGone', pause: true }, cause: TEXT.causes.w2b,
          notes: [{ test: 'geneOn', text: TEXT.notes.on }], offerSpeed: 60 },
        { id: 'w2c', lines: TEXT.steps.w2c, gate: { kind: 'tap' } },
        { id: 'w3', lines: TEXT.steps.w3, gate: { kind: 'tap' } },
      ],
    },

    hud(v, st) {
      const s = Object.assign({ tick: 0, count: 0, m: 0, made: 0, milk: false }, st || {});
      if (s.watch) {
        const H = TEXT.hud;
        let goal = { text: H.watchGoal, short: H.watchGoalShort, progress: null, done: false };
        if (s.step === 'w1b' && s.watching) {
          const n = Math.round(s.n || 0);
          goal = { text: K.fill(s.alive ? H.copy : H.copyGone, { n }), short: K.fill(H.copyShort, { n }), progress: null, done: false };
        } else if ((s.step === 'w2b' || s.step === 'w2c' || s.step === 'w3') && s.offTick >= 0) {
          const a = comma(s.a || 0);
          goal = { text: K.fill(H.sinceOff, { a }), short: K.fill(H.sinceOffShort, { a }), progress: null, done: false };
        }
        const t = Math.floor((s.tick || 0) / 60);
        return {
          goal, timer: { text: K.fill(H.clock, { t }), short: K.fill(H.clock, { t }) },
          counter: { text: K.fill(H.watchCounter, { m: comma(s.m || 0) }), short: K.fill(H.watchCounterShort, { m: comma(s.m || 0) }) },
        };
      }
      const count = Math.floor(s.count + 0.5), Dt = v.D * 60, END = (v.D + MILK_MIN) * 60;
      const milk = s.milk || s.tick > Dt;
      const left = milk ? Math.max(0, END - s.tick) : Math.max(0, Dt - s.tick);
      const H = TEXT.hud, cf = comma(count), Tf = comma(v.T);
      const shortTime = left < 60 ? K.clock(left, true) : Math.ceil(left / 60) + ' min';
      // Over par once the transporters already made are beyond what par allows (the extra copies are already made).
      const over = s.made > (1 + L.parX) * v.T;
      // On a phone (under 400 px) the goal and its target take the room before the milk: the copies made are in the
      // focus bar just below, so the counter chip gives way ('' hides it) and comes back as "over par"; by then the
      // count is past the target, so the goal drops "/ T" to make room for it.
      const counter = over ? { text: K.fill(H.counterOver, { m: comma(s.m) }), short: K.fill(H.counterOverShort, { m: comma(s.m) }), over: true }
        : { text: K.fill(H.counter, { m: comma(s.m) }), short: K.fill(H.counterShort, { m: comma(s.m) }) };
      if (!milk) counter.tiny = over ? H.counterOverTiny : '';
      return {
        goal: milk
          ? { text: K.fill(H.milk, { count: cf }), short: K.fill(H.milkShort, { count: cf }), progress: null, done: !!s.reached }
          : { text: K.fill(H.goal, { count: cf, T: Tf }), short: K.fill(over ? H.goalOverShort : H.goalShort, { count: cf, T: Tf }),
            progress: Math.min(1, s.count / v.T), done: !!s.reached },
        timer: { text: K.fill(milk ? H.watchTimer : H.timer, { time: K.clock(left, true) }), short: K.fill(milk ? H.watchTimerShort : H.timerShort, { time: shortTime }) },
        counter,
      };
    },

    monitor(v) {
      const Dt = v.D * 60, END = (v.D + MILK_MIN) * 60;
      let st = { tick: 0, count: 0, made: 0, m: 0, mRNA: 0, nascent: 0, level: 'off', reached: false, reachedTick: -1, onRun: 0, keptOn: false,
        keptOnTick: -1, onAtDeadline: false, countAtD: 0, milk: false, lamSum: 0, lamN: 0, energy: 'normal', growth: 'normal', commands: 0 };
      return {
        start(cell) { st.count = cell.observe().geneById.lacY.protein; },
        onTick(cell) {
          const v2 = cell.observe(), g = v2.geneById.lacY, on = isOn(g);
          st.tick = cell.tick; st.count = g.protein; st.made = g.proteinMade; st.m = g.mRNAMade; st.mRNA = g.mRNA; st.nascent = g.nascent;
          st.level = on ? g.level : 'off';
          if (!st.reached && g.protein >= v.T && cell.tick <= Dt) { st.reached = true; st.reachedTick = cell.tick; }
          // KEPT_ON_PAST_TARGET: lacY on for 30 game-s in a row after the count first reached T (before the milk).
          st.onRun = st.reached && on && cell.tick <= Dt ? st.onRun + 1 : 0;
          if (!st.keptOn && st.onRun >= 30) { st.keptOn = true; st.keptOnTick = cell.tick; }
          if (cell.tick === Dt) { st.onAtDeadline = on; st.countAtD = g.protein; }
          // The milk is here once the step at minute D has run its lesson commands (the glucose gone, the switch locked).
          st.milk = cell.tick > Dt;
          st.energy = v2.energy.E > 0.7 ? 'normal' : 'low';
          st.growth = v2.cell.lambdaEMA_perH / 3600 < 0.8 * LAMBDA_REF ? 'slow' : 'normal';
          // Growth on milk sugar: the mean growth rate over the last 5 minutes of the run.
          if (cell.tick > END - 300) { st.lamSum += v2.cell.lambda_perS; st.lamN++; }
        },
        userCommand() { st.commands++; },
        end() { return st.tick >= END ? 'done' : null; },
        result() {
          return { goal: st.reached, reachedTick: st.reachedTick, m: st.m, made: st.made, count: st.count, countAtD: st.countAtD, keptOn: st.keptOn,
            keptOnTick: st.keptOnTick, onAtDeadline: st.onAtDeadline, growth: st.lamN ? st.lamSum / st.lamN / LAMBDA_REF : 0, commands: st.commands };
        },
        save() { return Object.assign({}, st); },
        restore(s) { st = Object.assign({}, s); },
      };
    },
    /** The milk arrives: a story beat holds the run (T2), then the economy readouts are introduced. */
    runBeats: [{ name: 'milk', when: (st) => !!st && st.milk }],

    score(v, m, answers) {
      const d = answers.debrief;
      const made = m.made || 0;
      const E = efficiency(v.T, made);
      const flags = [];
      if (m.keptOn) flags.push({ id: 'KEPT_ON_PAST_TARGET', tick: m.keptOnTick, data: {} });
      if (!m.goal) flags.push({ id: 'SHORT_ON_MILK', data: { countAtD: Math.round(m.countAtD || 0) } });
      const first = (qid) => (d[qid] ? d[qid].firstMc : null);
      if (first('l12.d2') === 'MIDDLEMAN') flags.push({ id: 'DEB_MIDDLEMAN', data: { option: d['l12.d2'].first } });
      if (first('l12.d1') === 'PROTEIN_SELF_COPY') flags.push({ id: 'DEB_PROTEIN_SELF_COPY', data: { option: d['l12.d1'].first } });
      if (first('l12.d1') === 'CELL_DECIDES') flags.push({ id: 'DEB_CELL_DECIDES', data: { option: d['l12.d1'].first } });
      // The copies this run needed for T, by its own ratio of transporters made to copies made.
      const ppmRun = m.m > 0 ? made / m.m : L.ppm;
      const need = Math.ceil(v.T / ppmRun);
      const extraCopies = Math.max(0, (m.m || 0) - need), extraT = Math.max(0, made - v.T);
      const atp = extraT * ECO.lacYaa * ECO.atpPerAa + extraCopies * ECO.lacYnt * ECO.atpPerNt;
      return { E, P: null, X: m.goal && (m.count || 0) <= v.tMax ? 1 : 0, flags, m: m.m || 0, made, need, extraCopies,
        atp, glucose: atp / ECO.atpPerGlucose, growth: m.growth || 0 };
    },
    /** The result sheet's lines: growth on milk sugar, then the copies against what was needed, and what the extras cost. */
    resultLines(v, comp) {
      const out = [];
      if (typeof comp.m === 'number') out.push(K.fill(TEXT.result.copies, { m: comma(comp.m), need: comma(comp.need), T: comma(v.T) }));
      if (comp.extraCopies > 0) out.push(K.fill(TEXT.result.cost, { atp: comma(Math.round(comp.atp / 1000) * 1000), glc: comma(Math.round(comp.glucose / 1000) * 1000) }));
      return out;
    },
    /** Shown whether or not the goal was met: how the cell did on milk sugar. */
    resultLead(v, comp) { return typeof comp.growth === 'number' ? [K.fill(TEXT.result.growth, { pct: Math.round(100 * comp.growth) })] : []; },
    resultHint(v, comp, m, goal) { return goal && comp.E < 0.8 ? [K.fill(TEXT.result.hint, { ppmWords })] : []; },

    flags: [
      { id: 'KEPT_ON_PAST_TARGET', mc: 'MIDDLEMAN' },
      { id: 'G1_MOLECULES_LAST', mc: 'MOLECULES_LAST', guess: 'g1' },
      { id: 'G2_INSTANT', mc: 'INSTANT', guess: 'g2' },
      { id: 'G2_MOLECULES_LAST', mc: 'MOLECULES_LAST', guess: 'g2' },
      { id: 'DEB_MIDDLEMAN', mc: 'MIDDLEMAN' }, { id: 'DEB_PROTEIN_SELF_COPY', mc: 'PROTEIN_SELF_COPY' }, { id: 'DEB_CELL_DECIDES', mc: 'CELL_DECIDES' },
      { id: 'SHORT_ON_MILK', mc: 'DELAY_MISATTRIBUTED' },
    ],
    predictions: [],
    debrief: [
      { id: 'l12.d1', kind: 'choice', prompt: TEXT.d1.prompt, options: TEXT.d1.options },
      { id: 'l12.d2', kind: 'choice', prompt: TEXT.d2.prompt, options: TEXT.d2.options },
    ],
    echo: { screens: ['echo1', 'echo2'], cards: [{ id: 'mrna-temporary', title: 'cards.mRNATemp', note: 'cards.mRNATempNote', stamp: 'universal' }] },
    story: {
      intro: TEXT.story.intro, outro: TEXT.story.fed.concat(TEXT.story.all), onRun: TEXT.story.onRun,
      extra: { milk: TEXT.story.milk, fed: TEXT.story.fed.concat(TEXT.story.all), keptOn: TEXT.story.keptOn.concat(TEXT.story.all),
        missed: TEXT.story.missed.concat(TEXT.story.all) },
    },
    /** The outro that is true of this run: fed (goal within par), keptOn (goal over par), missed (goal not met). */
    outroKey(v, m, goal) {
      if (!goal) return 'missed';
      return efficiency(v.T, (m && m.made) || 0) < 0.8 ? 'keptOn' : 'fed';
    },

    narratorRules: [
      { key: 'l12.milk', template: TEXT.narr.milk,
        when: (f, mem, tick, lv) => lv.phase === 'run' && !!lv.monitor && lv.monitor.milk && tick < lv.variant.D * 60 + 120 },
      { key: 'l12.short', template: TEXT.narr.short,
        when: (f, mem, tick, lv) => lv.phase === 'run' && !!lv.monitor && lv.monitor.milk && f.energy !== 'normal' },
      { key: 'l12.fed', template: TEXT.narr.fed,
        when: (f, mem, tick, lv) => lv.phase === 'run' && !!lv.monitor && lv.monitor.milk && f.energy === 'normal' && f.growth === 'normal' },
      { key: 'l12.leftover', template: TEXT.narr.leftover,
        when: (f, mem, tick, lv) => (lv.phase === 'run' || lv.phase === 'watch') && !!lv.monitor && lv.monitor.level === 'off' && lv.monitor.mRNA > 0 },
      { key: 'l12.read', template: TEXT.narr.read,
        when: (f, mem, tick, lv) => (lv.phase === 'run' || lv.phase === 'watch') && !!lv.monitor && lv.monitor.level !== 'off' && lv.monitor.mRNA > 0 },
    ],

    solutions: (function () {
      // The reference: ×4 at once; off when the transporters plus about ppm per copy still here (and per copy being made)
      // reach the target with a small margin: "transporters + about twenty × copies now".
      const refOff = (g, v) => g.protein + L.ppm * (g.mRNA + g.nascent) >= L.refMargin * v.T;
      const reference = {
        kind: 'policy', every: 5,
        act(view, tick, api, v) {
          const g = view.geneById.lacY;
          if (tick === 0) api.command(cmd(ON));
          else if (isOn(g) && tick < v.D * 60 && refOff(g, v)) api.command(cmd('off'));
        },
        expect: { goal: true, par: true, minTotal: 90, flags: [] },
      };
      return {
        reference,
        keepOn: { kind: 'policy', every: 5, act(view, tick, api) { if (tick === 0) api.command(cmd(ON)); }, expect: { goal: true, par: false, flags: ['KEPT_ON_PAST_TARGET'] } },
        stopAtTarget: {
          kind: 'policy', every: 5,
          act(view, tick, api, v) {
            const g = view.geneById.lacY;
            if (tick === 0) api.command(cmd(ON)); else if (isOn(g) && g.protein >= v.T) api.command(cmd('off'));
          },
          expect: { goal: true, par: false },
        },
        // PROLOGUE §6.2.7: ×1 until the milk fails the goal on at least 80% of runs.
        weak: { kind: 'policy', every: 5, act(view, tick, api) { if (tick === 0) api.command(cmd(1)); }, expect: { goal: false, rate: 0.8, flags: ['SHORT_ON_MILK'] } },
        // Every guess of the watch on a misconception: the watch completes, its flags are raised; the run as the reference.
        watchOnly: Object.assign({}, reference, { watch: { guesses: { g1: 3, g2: 1 } }, expect: { goal: true, par: true, flags: ['G1_MOLECULES_LAST', 'G2_INSTANT'] } }),
      };
    }()),
  };
  return DEF;
});
