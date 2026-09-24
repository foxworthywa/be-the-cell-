// @deps btc-level-kit btc-misconceptions btc-level-constants
/*
 * Be the Cell: level 1.1, "Starving next to a feast" (LEVELS §7.1). Operator mode, LO1.
 *
 * Glucose sits outside, and the cell has no working transporter: a slow side route lets a
 * trickle in, so it is starving but alive. Six unlabelled genes (strain m2-l11: the lab
 * genes ptsG, aaImp, lacY, lacZ and fliC, plus the decoy araE, an arabinose transporter
 * whose sugar is never present) start empty and switched off. The student finds the one
 * whose protein lets glucose in, in as few experiments as possible; switching a gene on
 * counts as one. A gene is named only once its protein's job has been seen (the engine's
 * function_seen), and until then it is "Gene A"…"Gene F" in a display order, with colours
 * and chromosome positions, drawn per student, so "gene C" or "the green one" does not
 * transfer between students. Only where a protein sits (membrane or inside) is the same
 * for everyone: that is what the student is meant to reason from.
 *
 * Every student-facing string is in TEXT (linted, §12.1 L-2); calibrated numbers come from
 * BTC.levelConstants.l11 (tools/level-calibrate.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/btc-level-kit.js'), require('../game/btc-misconceptions.js'),
      require('./btc-level-constants.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {}))['1.1'] = factory(B.levelKit, B.misconceptions, B.levelConstants);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, LC) {
  'use strict';
  void MC;

  // The six candidates; the other lab genes (gly, aaSyn) keep running as background.
  const CANDIDATES = Object.freeze(['ptsG', 'aaImp', 'lacY', 'lacZ', 'fliC', 'araE']);
  // Where each candidate's protein sits (drawn the same for every student).
  const MEMBRANE = Object.freeze(['ptsG', 'aaImp', 'lacY', 'araE']);
  const LIMIT_MIN = 180, HOLD_TICKS = 300, MEAN_TICKS = 60, PAR_N = 3, REVEAL_TICKS = 600;
  const LETTERS = 'ABCDEF';
  // Content version (LEVELS §3.2: bumped on any change to variants, goals, scoring or questions): the M2 review reworded its questions and feedback, and the side route is disclosed.
  const CONTENT = 2;

  const TEXT = {
    title: 'Starving next to a feast',
    challenge: 'Glucose is outside. Find its transporter.',
    task: {
      goal: 'Get glucose into the cell.',
      core: ['Find the gene whose protein lets glucose in, and get growth back to normal.',
        'Use at most 3 experiments; switching a gene on counts as one.'],
      expert: ['Also reveal a second gene\'s job, with at most 4 experiments in total.'],
    },
    story: {
      intro: [
        { who: 'narrator', text: 'Your bacterium is starving. It is sitting in glucose.' },
        { who: 'narrator', text: 'A slow side route lets a trickle of glucose in, so it grows, but at about a third of its usual speed.' },
        { who: 'commander', text: 'It clearly wants the glucose. Order it to eat.' },
        { who: 'narrator', text: 'Wanting is not among its options. Orders do not cross membranes. Glucose does, through the right protein.' },
        { who: 'narrator', text: 'One of these six unlabelled genes holds the instructions for that protein. Each gets its name once you have seen its protein work.' },
      ],
      outro: [
        { who: 'narrator', text: 'The glucose was there the whole time. The transporter was not.' },
        { who: 'glucose', denies: true, text: "I don't want anything. I bumped into a transporter, and I fit." },
        { who: 'ribosome', text: 'I built the transporters. I had no idea what they were for.' },
      ],
      // The glucose transporter's job was never seen (the first line of the outro would not be true).
      missed: [
        { who: 'narrator', text: 'The glucose stayed outside, apart from a trickle through a slow side route. None of the proteins made in this run carried it in.' },
        { who: 'glucose', denies: true, text: "I don't want anything. I bump into whatever is in the membrane, and nothing here fits." },
      ],
      // The transporter was found, but growth was not back to normal in time.
      slow: [
        { who: 'narrator', text: 'The transporter was found, but growth was not back to normal before time ran out.' },
        { who: 'ribosome', text: 'I built the transporters as fast as their mRNA arrived. I had no idea what they were for.' },
      ],
    },
    p1: {
      prompt: 'You switch on the right gene. What changes first?',
      options: [
        { t: 'mRNA from that gene appears.', ok: true,
          fb: 'The gene is copied into mRNA first; the transporter comes next, and only then does more glucose get in.' },
        { t: 'More glucose starts coming in.', mc: 'DNA_DIRECT',
          fb: 'More glucose came in only after transporters had been made and sat in the membrane, minutes later.' },
        { t: 'ATP goes up.', mc: 'ENERGY_FIRST',
          fb: 'ATP rose later. ATP comes from glucose inside, glucose gets in only through transporters, and transporters are built from mRNA.' },
        { t: 'The cell grows faster.', mc: 'OTHER',
          fb: 'Growth changed last of all, once ATP was back.' },
      ],
    },
    p2: {
      prompt: 'Where will the transporter protein sit?',
      options: [
        { t: 'In the membrane, between the glucose and the inside.', ok: true,
          fb: 'It spans the membrane, which is why it was drawn across the cell\'s edge.' },
        { t: 'In the DNA.', mc: 'DNA_DIRECT',
          fb: 'The DNA holds the instructions. The protein made from them ends up in the membrane.' },
        { t: 'Anywhere in the cytoplasm.', mc: 'PROTEIN_LOCATION',
          fb: 'A protein floating inside never meets the glucose outside. This one sits in the membrane.' },
        { t: 'Outside the cell, around the glucose.', mc: 'OTHER',
          fb: 'It stays in the membrane. Glucose meets it there and crosses through it.' },
      ],
    },
    d1: {
      prompt: 'Glucose was outside the whole time. What finally let it in?',
      options: [
        { t: 'Transporter proteins made from that gene\'s mRNA, sitting in the membrane.', ok: true,
          fb: 'The gene was copied into mRNA, ribosomes built transporters from it, and glucose crossed through them.' },
        { t: 'The gene itself, once it was switched on.', mc: 'DNA_DIRECT',
          fb: 'The gene never left the chromosome. It was copied into mRNA, and the copies were read into transporters.' },
        { t: 'ATP made from the glucose.', mc: 'ENERGY_FIRST',
          fb: 'ATP came after glucose got in, not before. Until the transporters existed, ATP stayed low.' },
        { t: 'The cell sensed the glucose and let it in.', mc: 'CELL_DECIDES',
          fb: 'No one let it in. Glucose crossed only once transporters it happens to fit were sitting in the membrane.' },
      ],
    },
    d2: {
      prompt: 'What is the transporter?',
      options: [
        { t: 'A machine: a protein whose shape lets glucose through the membrane.', ok: true,
          fb: 'Its shape gives it the job; while it lasts, it carries glucose across, one molecule at a time.' },
        { t: 'Food that the cell uses up for energy.', mc: 'PROTEIN_AS_FOOD',
          fb: 'The transporter is not used up. Each one carries many glucose molecules across every second, for as long as it lasts.' },
        { t: 'Building material that makes the membrane stronger.', mc: 'PROTEIN_AS_MATERIAL',
          fb: 'It sits in the membrane, but not as material: without it the membrane holds, and only a trickle of glucose gets in by a slow side route.' },
        { t: 'A message that tells the cell to eat.', mc: 'CELL_DECIDES',
          fb: 'Nothing in the cell takes orders. The transporter is the machine: glucose crosses the membrane through it.' },
      ],
    },
    echo1: 'Your gut and muscle cells take in glucose through transporter proteins too, made the same way: gene, mRNA, protein.',
    echo2: 'Your transporters are different proteins that do the same job. After a meal, insulin makes muscle cells add more to their membranes.',
    cards: { transporter: 'Transporter protein' },
    hud: {
      goal: 'Find the glucose transporter', goalShort: 'Find the transporter',
      found: 'Found it · growth {pct}% of normal', foundShort: 'Found · growth {pct}%',
      timer: '{time} left',
      counter: 'Experiments {n} · target 3', counterShort: '{n}/3 tests',
      counterOver: 'Experiments {n} · over par (3)', counterOverShort: '{n}/3 tests',
    },
    medium: 'The glucose outside is fixed. Lactose and amino acids are yours to add; adding them is not an experiment.',
    result: {
      used: 'You used {n} experiments; par is 3 or fewer.', usedOne: 'You used 1 experiment; par is 3 or fewer.',
      second: 'You also saw the job of gene {letter} (Expert).',
    },
    complete: {
      heading: 'The six genes',
      line: 'Gene {letter}: {name} ({symbol}), {where}',
      membrane: 'in the membrane', inside: 'inside the cell',
      // Flagellin is exported to build a flagellum in a real cell; this strain has none of the other flagellum genes.
      fliC: 'made inside the cell; here it is not exported to a flagellum',
    },
    narr: {
      revealGlucose: 'Glucose now gets in through {N}, so {its} gene is named after that job.',
      revealAmino: 'Amino acids now get in through {N}, so {its} gene is named after that job.',
      revealLactose: 'Lactose now gets in through {N}, so {its} gene is named after that job.',
      revealSplit: 'Lactose inside is now split by {N}, so {its} gene is named after that job.',
      nofit: 'Ribosomes are making {N}, but no glucose gets in through {it}.',
      nosplit: 'Lactose gets in, but almost none of it is split inside.',
      busy: 'Ribosomes busy with {n} are not making other proteins, so growth slows over a few generations.',
      // Gene → mRNA → protein in plain words (the lab's rules 16a–16c lose to "too little glucose" all through the search).
      waiting: '{G} {is} switched on; RNA polymerase has not started on {it} yet.',
      tx: '{G} {is} being copied into mRNA; no protein yet.',
      rising: '{N} {is} building up; each mRNA is read by many ribosomes before it decays.',
      trickle: 'Only a trickle of glucose gets in, through a slow side route, so ATP is low and growth is slow.',
      start: 'Glucose is outside, but only a trickle of it can get in, through a slow side route.',
    },
  };

  const L = LC.l11;
  const cmd = (gene, level) => ({ type: 'setPromoter', gene, level });
  const isOn = (g) => g.level !== 'off' && (g.level !== null || g.rate_perS > 0);
  const isOnResolved = (r) => !!r && r.level !== 'off' && (r.level !== null || r.rate_perS > 0);
  const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);
  const letterOf = (v, id) => LETTERS[v.order.indexOf(id)] || '';
  // The job each candidate's reveal names (the ones whose function can be seen in this level).
  const REVEAL_KEY = { ptsG: 'revealGlucose', aaImp: 'revealAmino', lacY: 'revealLactose', lacZ: 'revealSplit' };

  const DEF = {
    id: '1.1', code: '11', order: 1, version: CONTENT, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'operator', scored: true, los: ['LO1'],
    misconceptions: ['DNA_DIRECT', 'ENERGY_FIRST', 'PROTEIN_AS_FOOD', 'PROTEIN_AS_MATERIAL', 'PROTEIN_LOCATION', 'CELL_DECIDES'],
    estMinutes: 8, engine: '1.1',
    phases: ['intro', 'task', 'predict', 'run', 'result', 'debrief', 'echo', 'complete'],
    candidates: CANDIDATES, membrane: MEMBRANE, limitMin: LIMIT_MIN,

    /** A display order of the six candidates (720 orders): letters, colours, card order and loci follow it. */
    variant(seed) {
      return { seed, order: K.rng(seed, '1.1').shuffle(CANDIDATES) };
    },
    /** The instructor's decoder shows the letters with the genes behind them. */
    variantLabel(v) { return v.order.map((id, k) => LETTERS[k] + ' ' + id).join(', '); },

    config(v, role) {
      const genes = {};
      for (const id of CANDIDATES) genes[id] = { level: 'off', initial: { clear: true, protein: 0 } };
      return {
        seed: K.seedFor(v.seed, role), strain: 'm2-l11', start: 'birth',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
        genes, flags: { backupGlucoseUptake: true, userGenes: CANDIDATES.slice() },
        variant: { levelId: '1.1', content: CONTENT, seed: v.seed, order: v.order.slice() },
      };
    },

    labConfig(v, state) {
      const st = state || {};
      // At the end every candidate is named (§5.5.1).
      const revealed = {};
      for (const id of CANDIDATES) if (st.phase === 'complete' || (st.revealed && st.revealed[id])) revealed[id] = true;
      return {
        showNames: false, revealed, displayOrder: v.order.slice(), colorBy: 'display', genesVisible: v.order.slice(),
        controls: { genes: true, medium: true, drugs: false },
        mediumRows: { glucose: 'locked', lactose: 'free', aminoAcids: 'free' }, mediumNote: TEXT.medium,
        speedOptions: null, defaultSpeed: 60, startPaused: true,
        tabs: ['cell', 'genes', 'medium', 'graphs'], graphGenes: v.order.slice(0, 3), focusGene: v.order[0], hud: true,
        graphWindow: 3600,
      };
    },

    hud(v, st) {
      const s = Object.assign({ tick: 0, n: 0, found: false, lambda60: 0, done: false }, st || {});
      const pct = Math.round((100 * s.lambda60) / L.lambdaRef);
      const left = Math.max(0, LIMIT_MIN * 60 - s.tick);
      return {
        goal: {
          text: s.found ? K.fill(TEXT.hud.found, { pct }) : TEXT.hud.goal,
          short: s.found ? K.fill(TEXT.hud.foundShort, { pct }) : TEXT.hud.goalShort,
          progress: s.found ? Math.min(1, s.lambda60 / (0.8 * L.lambdaRef)) : null, done: !!s.done,
        },
        // On a phone the minutes alone ("171 min left"), so the goal chip keeps its words.
        timer: { text: K.fill(TEXT.hud.timer, { time: K.clock(left, false) }), short: K.fill(TEXT.hud.timer, { time: Math.ceil(left / 60) + ' min' }) },
        // Over par the counter says so in words (and the HUD colours it): more than 3 experiments.
        counter: s.n > PAR_N
          ? { text: K.fill(TEXT.hud.counterOver, { n: s.n }), short: K.fill(TEXT.hud.counterOverShort, { n: s.n }), over: true }
          : { text: K.fill(TEXT.hud.counter, { n: s.n }), short: K.fill(TEXT.hud.counterShort, { n: s.n }) },
      };
    },

    predictions: [
      { id: 'p1', kind: 'choice', prompt: TEXT.p1.prompt, options: TEXT.p1.options },
      { id: 'p2', kind: 'choice', prompt: TEXT.p2.prompt, options: TEXT.p2.options },
    ],

    /**
     * The run's monitor (§7.1.5): experiments (a candidate switched from off to on by the
     * student), the reveals (function_seen, read from the view), and the goal: after
     * ptsG's job has been seen, the 60-s mean growth rate stays ≥ 0.8 λ_ref for 300 ticks in
     * a row while ptsG is on. Limit 180 game-min.
     */
    monitor() {
      const tm = K.trailingMean(MEAN_TICKS);
      const empty = () => { const o = {}; for (const id of CANDIDATES) o[id] = false; return o; };
      let st = {
        tick: 0, n: 0, nAtGoal: -1, on: empty(), protein: empty(), firstProtein: {}, revealed: {}, revealTick: {}, revealOrder: [],
        found: false, foundTick: -1, lambda60: 0, run: 0, done: false, doneTick: -1, maxOn: 0, shotgunTick: -1,
        offBeforeProteinTick: -1, offBeforeProteinGene: null, last: null, lastTick: -1, ptsGOn: false,
        lactoseBlock: false, useless: null, secondAtGoal: null,
      };
      return {
        start(cell) { st.lambda60 = cell.observe().cell.lambda_perS; },
        onTick(cell) {
          const v = cell.observe();
          st.tick = cell.tick;
          st.lambda60 = tm.push(v.cell.lambda_perS);
          let onCount = 0;
          for (const id of CANDIDATES) {
            const g = v.geneById[id];
            if (g.functionSeen && !st.revealed[id]) {
              st.revealed[id] = true; st.revealTick[id] = cell.tick; st.revealOrder.push(id);
              if (id === 'ptsG') { st.found = true; st.foundTick = cell.tick; }
            }
            const on = isOn(g);
            if (on) onCount++;
            // The first protein of the current on-episode (OFF_BEFORE_PROTEIN, and l11.nofit).
            if (on && g.episode.firstProteinTick !== null) { st.protein[id] = true; st.firstProtein[id] = g.episode.firstProteinTick; }
          }
          if (onCount > st.maxOn) st.maxOn = onCount;
          if (onCount >= 4 && st.shotgunTick < 0) st.shotgunTick = cell.tick;
          st.ptsGOn = isOn(v.geneById.ptsG);
          if (!st.done) {
            st.run = st.found && st.ptsGOn && st.lambda60 >= 0.8 * L.lambdaRef ? st.run + 1 : 0;
            if (st.run >= HOLD_TICKS) {
              st.done = true; st.doneTick = cell.tick; st.nAtGoal = st.n;
              st.secondAtGoal = st.revealOrder.find((id) => id !== 'ptsG') || null;
            }
          }
        },
        userCommand(e) {
          if (e.rejected || e.type !== 'setPromoter' || !e.args || CANDIDATES.indexOf(e.args.gene) < 0) return;
          const id = e.args.gene, was = st.on[id], now = isOnResolved(e.resolved);
          if (!was && now) {
            if (!st.done) st.n++;
            st.protein[id] = false; delete st.firstProtein[id];
          }
          // Switched off before any of its protein existed: the switch alone was expected to act (DNA_DIRECT).
          if (was && !now && !st.protein[id] && st.offBeforeProteinTick < 0) { st.offBeforeProteinTick = e.tick; st.offBeforeProteinGene = id; }
          st.on[id] = now;
          st.last = id; st.lastTick = e.tick;
        },
        end() { return st.done ? 'goal' : st.tick >= LIMIT_MIN * 60 ? 'limit' : null; },
        result() {
          return {
            goal: st.done, doneTick: st.doneTick, n: st.done ? st.nAtGoal : st.n, found: st.found, foundTick: st.foundTick,
            revealed: Object.assign({}, st.revealed), revealOrder: st.revealOrder.slice(), second: st.secondAtGoal,
            maxOn: st.maxOn, shotgunTick: st.shotgunTick, offBeforeProteinTick: st.offBeforeProteinTick, offBeforeProteinGene: st.offBeforeProteinGene,
          };
        },
        save() { return JSON.parse(JSON.stringify(Object.assign({}, st, { mean: tm.state() }))); },
        restore(s) { const c = JSON.parse(JSON.stringify(s)); tm.restore(c.mean); delete c.mean; st = c; },
      };
    },

    score(v, m, answers) {
      const p = answers.predictions, d = answers.debrief;
      const n = typeof m.n === 'number' ? m.n : 0;
      const E = clamp01(1 - 0.35 * Math.max(0, n - PAR_N));
      const P = ((p.p1 && p.p1.correct ? 1 : 0) + (p.p2 && p.p2.correct ? 1 : 0)) / 2;
      const X = m.goal && m.second && n <= 4 ? 1 : 0;
      const flags = [];
      if (m.offBeforeProteinTick >= 0) flags.push({ id: 'OFF_BEFORE_PROTEIN', tick: m.offBeforeProteinTick, data: { gene: m.offBeforeProteinGene } });
      if (m.shotgunTick >= 0) flags.push({ id: 'SHOTGUN', tick: m.shotgunTick, data: { maxOn: m.maxOn } });
      const mc = (id) => (p[id] && p[id].locked ? p[id].mc : null);
      if (mc('p1') === 'DNA_DIRECT' || mc('p2') === 'DNA_DIRECT') flags.push({ id: 'PRED_DNA_DIRECT', data: {} });
      if (mc('p1') === 'ENERGY_FIRST') flags.push({ id: 'PRED_ENERGY_FIRST', data: { option: p.p1.option } });
      const first = (qid) => (d[qid] ? d[qid].firstMc : null);
      if (first('l11.d1') === 'DNA_DIRECT') flags.push({ id: 'DEB_DNA_DIRECT', data: { option: d['l11.d1'].first } });
      if (first('l11.d2') === 'PROTEIN_AS_FOOD') flags.push({ id: 'DEB_PROTEIN_AS_FOOD', data: {} });
      if (first('l11.d2') === 'PROTEIN_AS_MATERIAL') flags.push({ id: 'DEB_PROTEIN_AS_MATERIAL', data: {} });
      if (first('l11.d1') === 'CELL_DECIDES' || first('l11.d2') === 'CELL_DECIDES') flags.push({ id: 'DEB_CELL_DECIDES', data: {} });
      return { E, P, X, flags, n, second: m.second || null };
    },

    /** The result sheet's lines under the efficiency bar. */
    resultLines(v, comp) {
      if (typeof comp.n !== 'number') return [];
      const out = [comp.n === 1 ? TEXT.result.usedOne : K.fill(TEXT.result.used, { n: comp.n })];
      if (comp.second) out.push(K.fill(TEXT.result.second, { letter: letterOf(v, comp.second) }));
      return out;
    },

    /** The completion screen names every candidate, with its letter for this student (§5.5.1). */
    completeNotes(v, names) {
      return {
        heading: TEXT.complete.heading,
        lines: v.order.map((id, k) => K.fill(TEXT.complete.line, {
          letter: LETTERS[k], name: names(id).name, symbol: id,
          where: MEMBRANE.indexOf(id) >= 0 ? TEXT.complete.membrane : id === 'fliC' ? TEXT.complete.fliC : TEXT.complete.inside,
        })),
      };
    },

    flags: [
      { id: 'OFF_BEFORE_PROTEIN', mc: 'DNA_DIRECT' }, 'SHOTGUN', { id: 'PRED_DNA_DIRECT', mc: 'DNA_DIRECT' },
      { id: 'PRED_ENERGY_FIRST', mc: 'ENERGY_FIRST' }, { id: 'DEB_DNA_DIRECT', mc: 'DNA_DIRECT' },
      { id: 'DEB_PROTEIN_AS_FOOD', mc: 'PROTEIN_AS_FOOD' }, { id: 'DEB_PROTEIN_AS_MATERIAL', mc: 'PROTEIN_AS_MATERIAL' },
      { id: 'DEB_CELL_DECIDES', mc: 'CELL_DECIDES' },
    ],
    debrief: [
      { id: 'l11.d1', kind: 'choice', prompt: TEXT.d1.prompt, options: TEXT.d1.options },
      { id: 'l11.d2', kind: 'choice', prompt: TEXT.d2.prompt, options: TEXT.d2.options },
    ],
    echo: { screens: ['echo1', 'echo2'], cards: [{ id: 'transporter', title: 'cards.transporter', stamp: 'universal' }] },
    story: { intro: TEXT.story.intro, outro: TEXT.story.outro, extra: { missed: TEXT.story.missed, slow: TEXT.story.slow } },
    /** "The transporter was not [there]" needs the transporter found; the alternatives say what happened instead. */
    outroKey(v, m, goal) { return goal ? null : m && m.found ? 'slow' : 'missed'; },

    /**
     * Level narrator rules (§7.1.12), each true when it speaks. A reveal is named for the job
     * that was seen. l11.nofit speaks only for a candidate that carries no glucose (never
     * ptsG, whose first transporters let a little in before its job counts as seen). Two lab
     * rules would tie a lactose job to a hidden letter ("without protein C it is not split",
     * "with no lactose here, protein C does no work"); while that gene is unnamed these
     * rules say the same thing without the letter.
     */
    narratorRules: (function () {
      const mon = (lv) => (lv && lv.phase === 'run' && lv.monitor && lv.monitor.revealTick ? lv.monitor : null);
      // A reveal speaks for 10 game-min and may replace the line on screen after half a second: at 1 s = 1 min a
      // one-minute window was shorter than the narrator's 1.5-s hold, so the reveal was never shown.
      const recent = (m, id, tick) => m.revealed[id] && tick - m.revealTick[id] <= REVEAL_TICKS;
      const reveal = (id) => ({
        key: 'l11.' + REVEAL_KEY[id], template: TEXT.narr[REVEAL_KEY[id]], gene: id, preempt: true,
        when: (f, mem, tick, lv) => { const m = mon(lv); return !!m && recent(m, id, tick); },
      });
      // The gene the student last switched on, while it is on its way to protein (the lab's 16a–16c in plain words).
      const phase = (key, ph) => ({
        key: 'l11.' + key, template: TEXT.narr[key], gene: (f, mem) => mem.gene,
        when: (f, mem, tick, lv) => !!mon(lv) && mem.gene !== null && mem.phase === ph && CANDIDATES.indexOf(mem.gene) >= 0,
      });
      return [
        reveal('ptsG'), reveal('aaImp'), reveal('lacY'), reveal('lacZ'),
        { key: 'l11.nofit', template: TEXT.narr.nofit,
          gene: (f, mem, tick, lv) => lv.monitor.last,
          when: (f, mem, tick, lv) => {
            const m = mon(lv);
            if (!m || !m.last || m.last === 'ptsG' || !m.on[m.last] || m.revealed[m.last]) return false;
            const fp = m.firstProtein[m.last];
            return typeof fp === 'number' && tick - fp > 300;
          } },
        { key: 'l11.nosplit', template: TEXT.narr.nosplit,
          when: (f, mem, tick, lv) => { const m = mon(lv); return !!m && !m.revealed.lacZ && f.lactoseBlock === 'no-lacZ' && f.energy === 'normal'; } },
        { key: 'l11.busy', template: TEXT.narr.busy,
          gene: (f) => f.uselessGene,
          when: (f, mem, tick, lv) => {
            const m = mon(lv);
            return !!m && (f.uselessGene === 'lacY' || f.uselessGene === 'lacZ') && !m.revealed[f.uselessGene] && f.energy === 'normal' &&
              f.aa === 'ok' && !f.justDivided && f.lactoseBlock === null && mem.phase === null &&
              (mem.recoverTick === null || tick - mem.recoverTick > 300);
          } },
        phase('waiting', 'waiting'), phase('tx', 'transcribing'), phase('rising', 'rising'),
        // Before the first tick (the paused start, behind the sheets): no flux yet, and ATP not yet low.
        { key: 'l11.start', template: TEXT.narr.start,
          when: (f, mem, tick, lv) => tick === 0 && !!lv && !!lv.monitor && !lv.monitor.found && f.medium !== 'none' },
        // The search: the side route keeps the cell alive but short of ATP (the lab's "none of it gets in" is not true here).
        { key: 'l11.trickle', template: TEXT.narr.trickle,
          when: (f, mem, tick, lv) => { const m = mon(lv); return !!m && !m.found && mem.phase === null && f.energy !== 'normal' && f.medium !== 'none'; } },
      ];
    }()),

    solutions: (function () {
      const policy = (act, extra) => Object.assign({ kind: 'policy', every: 5, act }, extra);
      const right = { predictions: { p1: 'ok', p2: 'ok' } };
      // Membrane candidates in display order at ×2; each kept until its first protein is L.keepMin
      // game-min old (10 on engine 1.1), then off if its job was not seen; ptsG found → stop.
      const reasoned = (view, tick, api, v) => {
        const G = (id) => view.geneById[id];
        if (G('ptsG').functionSeen) return;
        const mem = v.order.filter((id) => MEMBRANE.indexOf(id) >= 0);
        const on = mem.find((id) => isOn(G(id)));
        if (on) {
          const ep = G(on).episode;
          if (ep.firstProteinTick !== null && tick - ep.firstProteinTick >= L.keepMin * 60) api.command(cmd(on, 'off'));
          return;
        }
        const next = mem.find((id) => G(id).episode.onTick === null);
        if (next) api.command(cmd(next, 2));
      };
      return {
        reference: policy((view, tick, api) => { if (tick === 0) api.command(cmd('ptsG', 2)); },
          Object.assign({ expect: { goal: true, par: true, minTotal: 90, flags: [] } }, right)),
        // Expert: lactose in (free), lacY ×2 as a second experiment; both jobs seen, 2 experiments.
        expert: policy((view, tick, api) => {
          if (tick === 0) { api.command(cmd('ptsG', 2)); api.command(cmd('lacY', 2)); api.command({ type: 'setMedium', lactose_mM: 5 }); }
        }, Object.assign({ expect: { goal: true, par: true, X: 1 } }, right)),
        reasoned: policy(reasoned, Object.assign({ expect: { goal: true, minE: 0.65 } }, right)),
        // "Switch everything on": all six at once.
        shotgun: policy((view, tick, api) => { if (tick === 0) for (const id of CANDIDATES) api.command(cmd(id, 1)); },
          Object.assign({ expect: { par: false, flags: ['SHOTGUN'] } }, right)),
        // On for 30 game-s each, then off, cycling: nothing lasts long enough to make protein.
        impatient: policy((view, tick, api, v) => {
          if (tick % 30 !== 0) return;
          const k = (tick / 30) % CANDIDATES.length, id = v.order[k], prev = v.order[(k + CANDIDATES.length - 1) % CANDIDATES.length];
          if (tick > 0) api.command(cmd(prev, 'off'));
          api.command(cmd(id, 2));
        }, { every: 1, expect: { par: false, flags: ['OFF_BEFORE_PROTEIN'] }, predictions: { p1: 1, p2: 1 } }),
        // Feed it lactose instead: lacY and lacZ ×4, never ptsG.
        lactoseRoute: policy((view, tick, api) => {
          if (tick === 0) { api.command({ type: 'setMedium', lactose_mM: 5 }); api.command(cmd('lacY', 4)); api.command(cmd('lacZ', 4)); }
        }, Object.assign({ expect: { goal: false } }, right)),
      };
    }()),
  };
  // The letter a student sees for a candidate (tools and tests).
  DEF.letterOf = letterOf;
  return DEF;
});
