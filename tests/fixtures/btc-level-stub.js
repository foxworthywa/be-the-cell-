// @deps btc-level-kit btc-misconceptions btc-level-constants
/*
 * A stub level for the game-core tests (LEVELS §13 step 1): a short LacY
 * task on the M1 engine that passes through every scored phase. It is not
 * shipped: tests require it, and a browser check can inject it into the page
 * (Playwright addScriptTag) to exercise the level screens before a real scored
 * level exists. Its TEXT also exercises the three lint exceptions of §3.3.
 *
 * Node: require(...) → {playable, full}; `playable()` and `full()` each build
 * a fresh definition (full adds the demo and design phases).
 * Browser: registers the playable definition as level 'T'.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../src/game/btc-level-kit.js'), require('../../src/game/btc-misconceptions.js'),
      require('../../src/levels/btc-level-constants.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    var def = factory(B.levelKit, B.misconceptions, B.levelConstants).playable();
    (B.levelDefs || (B.levelDefs = {}))[def.id] = def;
    if (B.levels && B.levels.add) B.levels.add(def);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, LC) {
  'use strict';
  void MC; void LC;

  const TEXT = {
    title: 'Test bench',
    challenge: 'A short LacY task that passes through every phase.',
    task: {
      goal: '{T} LacY within {limitMin} minutes.',
      core: ['Reach {T} LacY within {limitMin} minutes.', 'Change the setting at most once.'],
      expert: ['Before the run, work out how many LacY one mRNA makes, within 30%.'],
    },
    story: {
      intro: [
        { who: 'narrator', text: 'A test bench. The cell here is real; the stakes are not.' },
        { who: 'commander', text: 'It clearly wants LacY. Order it to make some.' },
        { who: 'narrator', text: 'Orders do not reach the ribosomes. The lacY gene does, once it is switched on.' },
      ],
      outro: [
        { who: 'glucose', denies: true, text: "I don't want anything. I bumped into a transporter, and I fit." },
        { who: 'narrator', text: 'LacY kept arriving for as long as its mRNA was read.' },
      ],
    },
    p1: {
      prompt: 'You switch lacY on at ×4. What does the LacY count do first?',
      options: [
        { t: 'Nothing for a short while, then it rises.', ok: true, fb: 'Right. The gene is copied into mRNA first, and ribosomes need time to finish a chain.' },
        { t: 'It jumps up the moment the switch is on.', mc: 'INSTANT', fb: 'The first LacY arrived only after mRNA had been made and read.' },
        { t: 'The cell decides how much LacY it wants.', mc: 'CELL_DECIDES', fb: 'Nothing decided anything. The count rose as fast as ribosomes read the mRNA.' },
      ],
    },
    n1: { prompt: 'About how many LacY does one lacY mRNA make before it decays?', unit: 'LacY' },
    p2: {
      prompt: 'You switch lacY off now. What does the count do in the next minute?',
      options: [
        { t: 'It keeps rising a little while the mRNA lasts.', ok: true, fb: 'Right. mRNA made before the switch-off was still read.' },
        { t: 'It stops at once.', mc: 'INSTANT', fb: 'The mRNA already made was still being read, so the count kept rising for a while.' },
        { t: 'It falls to zero.', mc: 'MOLECULES_LAST', fb: 'LacY is not broken down here; the count stays and is only diluted as the cell grows.' },
      ],
    },
    d1: {
      prompt: 'Why did LacY appear only a while after the switch?',
      options: [
        { t: 'mRNA had to be made and read first.', ok: true, fb: 'Right. Transcription, then translation, and each takes time.' },
        { t: 'The cell needs to warm up first.', mc: 'CELL_DECIDES', fb: 'Nothing warmed up. RNA polymerase and ribosomes simply take time to finish.' },
        { t: 'LacY copies itself once there is some.', mc: 'PROTEIN_SELF_COPY', fb: 'Proteins are not copied from proteins; every LacY was built by a ribosome.' },
      ],
    },
    echo1: 'Your cells make proteins the same way: a gene, copies of it in mRNA, ribosomes reading them.',
    echo2: 'Some of your proteins are made within minutes of a signal; the delay has the same causes.',
    cardMRNA: 'mRNA',
    hud: {
      goal: 'LacY {count} / {T}', goalDone: 'LacY {count} · goal met', epilogue: 'LacY {count} · watching',
      timer: '{time} left', counter: 'changes {c} · target 1', counterShort: '{c} / 1',
    },
  };

  function build(phases) {
    return {
      id: 'T', code: 'T0', order: 99, version: 1, title: 'title', challenge: 'challenge', text: TEXT,
      mode: 'operator', scored: true, los: ['LO2'], misconceptions: ['INSTANT', 'CELL_DECIDES'], estMinutes: 3, engine: '1.1',
      phases,
      variant(seed) {
        const r = K.rng(seed, 'T');
        const T = r.pick([150, 200]);
        return { seed, T, limitMin: 8 };
      },
      textVars(v) { return { limitMin: v.limitMin }; },
      config(v, role, extra) {
        const cfg = {
          seed: K.seedFor(v.seed, role), strain: 'm1-lab', start: 'steady',
          medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
          genes: { lacY: { level: role === 'demo' ? 4 : 'off' } },
          variant: { levelId: 'T', content: 1, seed: v.seed, T: v.T },
        };
        void extra;
        return cfg;
      },
      labConfig(v, state) {
        return {
          showNames: true, genesVisible: ['lacY'], controls: { genes: true, medium: false, drugs: false },
          mediumRows: { glucose: 'locked', lactose: 'locked', aminoAcids: 'locked' },
          speedOptions: [10, 60], defaultSpeed: 60, startPaused: true, tabs: ['cell', 'genes', 'graphs'],
          graphGenes: ['lacY'], focusGene: 'lacY', hud: true, phase: state && state.phase,
        };
      },
      hud(v, st) {
        const s = st || { count: 0, tick: 0, changes: 0, reached: false };
        const ep = s.epilogue;
        const goalText = ep ? TEXT.hud.epilogue : s.reached ? TEXT.hud.goalDone : TEXT.hud.goal;
        return {
          goal: { text: K.fill(goalText, { count: Math.floor(s.count + 0.5), T: v.T }), progress: Math.min(1, s.count / v.T), done: !!s.reached },
          timer: { text: K.fill(TEXT.hud.timer, { time: K.clock(Math.max(0, v.limitMin * 60 - s.tick), true) }) },
          counter: { text: K.fill(TEXT.hud.counter, { c: s.changes }), short: K.fill(TEXT.hud.counterShort, { c: s.changes }) },
        };
      },
      predictions: [
        { id: 'p1', kind: 'choice', prompt: TEXT.p1.prompt, options: TEXT.p1.options },
        { id: 'n1', kind: 'number', expert: true, prompt: TEXT.n1.prompt, unit: TEXT.n1.unit, min: 1, max: 200, step: 1,
          answer: () => 20, tolerance: 0.3 },
        { id: 'p2', kind: 'choice', phase: 'predict2', prompt: TEXT.p2.prompt, options: TEXT.p2.options },
      ],
      demo: { durationTicks: 60, speed: 60 },
      demoResult(v, cell) { return { final: cell.observe().geneById.lacY.protein }; },
      epilogue: { durationTicks: 60 },
      monitor(v) {
        let st = { tick: 0, count: 0, reached: false, reachedTick: -1, changes: 0, commands: 0, epilogue: false };
        return {
          onTick(cell) {
            const g = cell.observe().geneById.lacY;
            st.tick = cell.tick; st.count = g.protein;
            if (!st.reached && st.count >= v.T) { st.reached = true; st.reachedTick = cell.tick; }
          },
          userCommand(e) {
            st.commands++;
            if (st.reached) st.epilogue = true;
            else if (e.type === 'setPromoter' && e.args.gene === 'lacY' && !e.rejected) st.changes++;
          },
          end() { return st.reached ? 'goal' : st.tick >= v.limitMin * 60 ? 'limit' : null; },
          result() { return { goal: st.reached, reachedTick: st.reachedTick, changes: st.changes, count: st.count }; },
          save() { return Object.assign({}, st); },
          restore(s) { st = Object.assign({}, s); },
        };
      },
      score(v, m, answers) {
        const p = answers.predictions, d = answers.debrief;
        const E = Math.max(0, Math.min(1, 1 - 0.5 * Math.max(0, (m.changes || 0) - 1)));
        const correct = ['p1', 'p2'].filter((id) => p[id] && p[id].correct).length;
        const flags = [];
        if (!m.changes) flags.push({ id: 'NO_SWITCH' });
        if (p.p1 && p.p1.mc === 'INSTANT') flags.push({ id: 'PRED_INSTANT', data: { item: 'p1' } });
        if (d.d1 && d.d1.firstMc === 'CELL_DECIDES') flags.push({ id: 'DEB_CELL_DECIDES' });
        return { E, P: correct / 2, X: p.n1 && p.n1.correct ? 1 : 0, flags };
      },
      flags: [{ id: 'NO_SWITCH', mc: 'OTHER' }, { id: 'PRED_INSTANT', mc: 'INSTANT' }, { id: 'DEB_CELL_DECIDES', mc: 'CELL_DECIDES' }],
      debrief: [{ id: 'd1', kind: 'choice', prompt: TEXT.d1.prompt, options: TEXT.d1.options }],
      echo: { screens: ['echo1', 'echo2'], cards: [{ id: 'mrna', title: 'cardMRNA', stamp: 'universal' }] },
      story: TEXT.story,
      narratorRules: [],
      solutions: {
        reference: {
          kind: 'policy', every: 5,
          act(view, tick, api) { if (tick === 0) api.command({ type: 'setPromoter', gene: 'lacY', level: 4 }); },
          predictions: { p1: 'ok', n1: 20, p2: 'ok' }, debrief: { d1: 'ok' },
          expect: { goal: true, par: true, minTotal: 90 },
        },
        idle: {
          kind: 'policy', every: 5, act() { /* never switches the gene on */ },
          predictions: { p1: 1 }, debrief: { d1: 1 },
          expect: { goal: false, par: false, flags: ['NO_SWITCH', 'PRED_INSTANT', 'DEB_CELL_DECIDES'] },
        },
        fiddler: {
          kind: 'policy', every: 5,
          act(view, tick, api) { if (tick % 20 === 0) api.command({ type: 'setPromoter', gene: 'lacY', level: (tick / 20) % 2 ? 2 : 4 }); },
          expect: { goal: true, par: false },
        },
      },
    };
  }

  const PLAYABLE = ['intro', 'task', 'predict', 'run', 'result', 'predict2', 'epilogue', 'debrief', 'echo', 'complete'];
  const FULL = ['intro', 'task', 'predict', 'demo', 'design', 'run', 'result', 'predict2', 'epilogue', 'debrief', 'echo', 'complete'];
  return { TEXT, playable: () => build(PLAYABLE), full: () => build(FULL) };
});
