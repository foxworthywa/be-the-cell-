// @deps btc-level-kit btc-score
/*
 * A stub level in the teaching-first pattern (docs/PROLOGUE.md §1.4, build step S6: "a stub level
 * plays through"): intro · watch · task · run · result · debrief · echo · complete. Tests only; it is
 * never in the build. The browser checks inject it into a page (tools/ui-check-tiers.js).
 *
 * Watch (tier 1, the guided experiment of PROLOGUE §2.4.3 in miniature): a starving cell with the
 * glucose transporter gene off; a guess, a switch-on, then the copies, the first transporters, the
 * transporters in place and energy back to normal, each a state gate that pauses the run.
 * Try (tier 3): reach {T} glucose transporters by minute {D} without making far more copies than
 * needed; a simple graph with the target line and the deadline. Explain: one question.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../src/game/btc-level-kit.js'), require('../../src/game/btc-score.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {})).W = factory(B.levelKit, B.score);
  }
})(typeof self !== 'undefined' ? self : this, function (K, S) {
  'use strict';

  const T = 1500, D = 30, M_PAR = 90, ON = 4;

  const TEXT = {
    title: 'Watch, then try',
    challenge: 'A stub level for the new level pattern.',
    task: {
      context: ['Glucose gets in only through glucose transporters, and this cell has almost none.'],
      goal: 'Have {T} glucose transporters in the membrane by minute {D}.',
      core: ['Reach {T} by minute {D}.', 'Switch the gene off when enough are on the way.'],
      expert: ['Finish with no more than {tMax} transporters.'],
    },
    story: {
      intro: [{ who: 'narrator', text: 'Your cell sits in glucose, but almost none of it gets in.' }],
      outro: [{ who: 'narrator', text: 'The transporters let glucose in, so the cell has energy to grow.' }],
    },
    steps: {
      w1: [{ who: 'narrator', text: 'This cell is computed, not drawn by hand. Every mark on it comes from the model.' }],
      w2: [{ who: 'narrator', text: 'Glucose is all around, but this cell has no glucose transporters. A trickle gets in by a slow side route.' },
        { who: 'narrator', text: 'So its energy is low and it grows slowly.' }],
      w3: [{ who: 'narrator', text: 'This is the glucose transporter gene. It is off.' }],
      w4: [{ who: 'narrator', text: 'Switch it on.' }],
      w5: [{ who: 'narrator', text: 'The first mRNA copy is finished. Its count is here.' }],
      w6: [{ who: 'narrator', text: 'The first transporters are finished. Their count is here.' }],
      w7: [{ who: 'narrator', text: 'They sit across the membrane, where the glucose is.' }],
      w8: [{ who: 'narrator', text: 'With glucose coming in, energy is back to normal.' },
        { who: 'commander', text: 'It did exactly what I told it.' },
        { who: 'narrator', text: 'You switched one gene on. The copies were read, and the transporters let glucose in.' }],
    },
    causes: {
      w5: 'The gene was copied first.',
      w6: 'Ribosomes built them from the copies.',
    },
    offNote: 'The gene is off, so no new copies are started. Switch it on to carry on.',
    guess: {
      prompt: 'When you switch this gene on, what will you see first?',
      options: [
        { t: 'mRNA copies of the gene.', cause: true, fb: 'The gene was copied first. Transporters came next, and glucose got in only after that.' },
        { t: 'Glucose coming in.', mc: 'DNA_DIRECT', fb: 'Glucose came in only once transporters had been built and sat in the membrane, minutes later.' },
        { t: 'Energy going up.', mc: 'ENERGY_FIRST', fb: 'Energy rose last: it comes from glucose, and glucose waited for the transporters.' },
        { t: 'New transporters in the membrane.', mc: 'OTHER', fb: 'Transporters came second. Ribosomes can build them only from mRNA copies, so the copies came first.' },
      ],
    },
    d1: {
      prompt: 'You switched the gene off, yet transporters kept arriving. Why?',
      options: [
        { t: 'Copies made before the switch-off were still being read by ribosomes.', ok: true, fb: 'Each copy lasts a few minutes, and ribosomes keep reading it until it is broken down.' },
        { t: 'Transporters make more transporters once there are enough.', mc: 'PROTEIN_SELF_COPY', fb: 'Proteins are not copied from proteins. Every transporter was built by a ribosome reading an mRNA copy.' },
        { t: 'The switch-off took minutes to reach the DNA.', mc: 'DELAY_MISATTRIBUTED', fb: 'The switch acted at once. The extra transporters came from copies already made.' },
      ],
    },
    hud: {
      goal: '{count} / {T} transporters', goalShort: '{count}/{T}', timer: 'due in {time}', counter: '{m} copies', counterShort: '{m} copies',
      counterOver: '{m} copies · over par', counterOverShort: '{m} copies',
    },
    graph: { target: 'target {T}', deadline: 'due' },
    echo1: 'Your own cells also make many copies of each gene they use, and read each copy many times.',
    cards: { mrna: 'mRNA' },
  };

  const DEF = {
    id: 'W', code: 'W0', order: 90, version: 1, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'operator', scored: true, los: ['LO2'], misconceptions: ['DNA_DIRECT', 'ENERGY_FIRST', 'PROTEIN_SELF_COPY'],
    estMinutes: 6, engine: '1.1',
    phases: ['intro', 'watch', 'task', 'run', 'result', 'debrief', 'echo', 'complete'],

    variant(seed) { return { seed, T, D, tMax: Math.round(1.15 * T) }; },
    textVars(v) { return { T: v.T, D: v.D, tMax: v.tMax }; },

    config(v, role) {
      return {
        seed: K.seedFor(v.seed, role), strain: 'm1-lab', start: 'birth',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
        genes: { ptsG: { level: 'off', initial: { clear: true, protein: 0 } } },
        flags: { backupGlucoseUptake: true, userGenes: ['ptsG'] },
        variant: { levelId: 'W', content: 1, seed: v.seed },
      };
    },

    labConfig(v, state) {
      const st = state || {};
      const base = {
        showNames: true, genesVisible: ['ptsG'], controls: { genes: true, medium: false, drugs: false },
        mediumRows: { glucose: 'locked', lactose: 'locked', aminoAcids: 'locked' },
        speedOptions: [1, 10, 60], defaultSpeed: 10, startPaused: true, focusGene: 'ptsG', graphGenes: ['ptsG'],
      };
      if (st.phase === 'watch' || st.phase === 'intro') {
        // Tier 1: two big counters, the Off/On switch, the cell alone; the energy bar appears (and is introduced) at w2.
        const energy = st.phase === 'watch' && ['w1'].indexOf(st.step) < 0;
        return Object.assign(base, {
          tabs: ['cell'], hud: false,
          ui: { tier: 1, status: { energy }, focusBar: { counters: ['mRNA', 'protein'], control: 'onoff', onLevel: 2 },
            introduce: energy ? ['counter.mRNA', 'counter.protein', 'status.energy'] : ['counter.mRNA', 'counter.protein'] },
        });
      }
      // Tier 3 for the Try: three counters, Off/On (On = ×4), one simple graph with the target and the deadline.
      return Object.assign(base, {
        tabs: ['cell', 'graphs'], hud: true, graphWindow: (D + 10) * 60,
        ui: { tier: 3, focusBar: { counters: ['mRNA', 'made', 'protein'], control: 'onoff', onLevel: ON },
          graph: { series: [{ gene: 'ptsG', kind: 'protein' }], target: { y: v.T, label: K.fill(TEXT.graph.target, { T: v.T }) },
            marks: [{ t: v.D * 60, label: TEXT.graph.deadline }], window: (D + 10) * 60 },
          introduce: ['counter.made', 'graph.protein', 'graph.target'] },
      });
    },

    watch: {
      gene: 'ptsG', onLevel: 2,
      steps: [
        { id: 'w1', lines: TEXT.steps.w1, gate: { kind: 'tap' } },
        { id: 'w2', lines: TEXT.steps.w2, point: 'gauge:energy', gate: { kind: 'tap' } },
        { id: 'w3', lines: TEXT.steps.w3, point: 'control:promoter', guess: Object.assign({ id: 'h5', showAt: 'w6' }, TEXT.guess), gate: { kind: 'guess' } },
        { id: 'w4', lines: TEXT.steps.w4, point: 'control:promoter', act: { kind: 'command', expect: { type: 'setPromoter', gene: 'ptsG', on: true } },
          gate: { kind: 'act' } },
        { id: 'w5', until: { test: 'firstMRNA', pause: true }, lines: TEXT.steps.w5, point: 'counter:mRNA', gate: { kind: 'tap' }, cause: TEXT.causes.w5,
          notes: [{ test: 'geneOff', text: TEXT.offNote }] },
        { id: 'w6', until: { test: 'firstProtein', pause: true }, lines: TEXT.steps.w6, point: 'counter:protein', gate: { kind: 'tap' }, cause: TEXT.causes.w6,
          notes: [{ test: 'geneOff', text: TEXT.offNote }] },
        { id: 'w7', until: { test: 'inPlace', pause: true }, lines: TEXT.steps.w7, point: 'counter:protein', gate: { kind: 'tap' }, offerSpeed: 60 },
        { id: 'w8', until: { test: 'energyNormal', pause: true }, lines: TEXT.steps.w8, point: 'gauge:energy', gate: { kind: 'tap' },
          notes: [{ test: 'geneOff', text: TEXT.offNote }] },
      ],
    },

    hud(v, st) {
      const s = Object.assign({ tick: 0, count: 0, m: 0 }, st || {});
      const count = Math.floor(s.count + 0.5), left = Math.max(0, v.D * 60 - s.tick);
      return {
        goal: { text: K.fill(TEXT.hud.goal, { count, T: v.T }), short: K.fill(TEXT.hud.goalShort, { count, T: v.T }), progress: Math.min(1, s.count / v.T), done: s.count >= v.T },
        timer: { text: K.fill(TEXT.hud.timer, { time: K.clock(left, true) }), short: K.fill(TEXT.hud.timer, { time: Math.ceil(left / 60) + ' min' }) },
        counter: s.m > M_PAR ? { text: K.fill(TEXT.hud.counterOver, { m: s.m }), short: K.fill(TEXT.hud.counterOverShort, { m: s.m }), over: true }
          : { text: K.fill(TEXT.hud.counter, { m: s.m }), short: K.fill(TEXT.hud.counterShort, { m: s.m }) },
      };
    },

    monitor(v) {
      let st = { tick: 0, count: 0, m: 0, goal: false, goalTick: null, end: null };
      return {
        start(cell) { const g = cell.observe().geneById.ptsG; st.count = g.protein; },
        onTick(cell) {
          const g = cell.observe().geneById.ptsG;
          st.tick = cell.tick; st.count = g.protein; st.m = g.mRNAMade;
          if (!st.goal && g.protein >= v.T && cell.tick <= v.D * 60) { st.goal = true; st.goalTick = cell.tick; }
          if (!st.end && cell.tick >= v.D * 60) st.end = st.goal ? 'goal' : 'deadline';
        },
        end() { return st.end; },
        result() { return { goal: st.goal, goalTick: st.goalTick, m: st.m, count: st.count }; },
        save() { return JSON.parse(JSON.stringify(st)); },
        restore(x) { st = JSON.parse(JSON.stringify(x)); },
      };
    },

    score(v, m, answers) {
      const flags = [];
      const q = answers.debrief.d1;
      if (q && q.firstMc === 'PROTEIN_SELF_COPY') flags.push({ id: 'DEB_SELF_COPY', data: { option: q.first } });
      return { E: S.overBudget(m.m || 0, M_PAR), P: null, X: m.goal && m.count <= v.tMax ? 1 : 0, flags };
    },

    predictions: [],
    debrief: [Object.assign({ id: 'd1', kind: 'choice' }, TEXT.d1)],
    flags: [
      { id: 'G_DNA_DIRECT', mc: 'DNA_DIRECT', guess: 'h5' },
      { id: 'G_ENERGY_FIRST', mc: 'ENERGY_FIRST', guess: 'h5' },
      { id: 'DEB_SELF_COPY', mc: 'PROTEIN_SELF_COPY' },
    ],
    echo: { screens: ['echo1'], cards: [{ id: 'mrna', title: 'cards.mrna', stamp: 'universal' }] },
    story: TEXT.story,
    narratorRules: [],

    solutions: {
      reference: {
        kind: 'policy', every: 5,
        act(view, tick, api) {
          const g = view.geneById.ptsG;
          if (tick === 0) api.command({ type: 'setPromoter', gene: 'ptsG', level: ON });
          else if (g.level !== 'off' && g.protein + 15 * g.mRNA + 20 * g.nascent >= 1.05 * T) api.command({ type: 'setPromoter', gene: 'ptsG', level: 'off' });
        },
        expect: { goal: true, par: true, flags: [] },
      },
      guessDnaDirect: {
        kind: 'policy', every: 5, watch: { guesses: { h5: 1 } },
        act(view, tick, api) {
          const g = view.geneById.ptsG;
          if (tick === 0) api.command({ type: 'setPromoter', gene: 'ptsG', level: ON });
          else if (g.level !== 'off' && g.protein + 15 * g.mRNA + 20 * g.nascent >= 1.05 * T) api.command({ type: 'setPromoter', gene: 'ptsG', level: 'off' });
        },
        expect: { goal: true, par: true, flags: ['G_DNA_DIRECT'] },
      },
    },
  };
  return DEF;
});
