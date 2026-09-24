// @deps btc-level-kit btc-misconceptions btc-level-constants
/*
 * Be the Cell: level 1.7, "Nobody's in charge" (LEVELS §7.7). Designer mode, LO6.
 *
 * The Ordeal beat: the console loses its buttons. The student writes the lac region of the
 * DNA (lac promoter strength, operator, CRP site; the repressor gene lacI and its promoter),
 * presses Run, and has no controls while glucose and lactose alternate for most of a day.
 * The cell keeps growing only through its own molecules: LacI, the operator, allolactose
 * and (Expert) CRP–cAMP. Strain m2-lac (lacZ, lacY, lacA as one operon, plus lacI), starting
 * from a glucose-grown cell; the design applies at tick 0 (config.design).
 *
 * The schedule (coordinator decision, LEVELS §16): every lactose-only phase comes after a
 * phase with both sugars, as sugars arrive mixed in the gut. On engine 1.1 the wild type
 * lags 125–146 min after a direct glucose → lactose switch but about an hour after time in
 * both sugars. Every lactose phase is at least LMIN = max(90, 3 × the 90th-percentile lag
 * measured on these templates) long (LC.l17.LMIN), so the run is longer than the ten hours of
 * §7.7.3; the HUD timer shows the real total.
 *
 * Par is the reference design (normal lac genes with the CRP site) run on the student's
 * schedule with the same engine seed (common random numbers); the runner computes it in
 * idle frames. Efficiency is the worst of three sub-scores against par: growth, waste
 * (lac protein made in glucose) and the lag when lactose arrives.
 *
 * Every student-facing string is in TEXT (linted, §12.1 L-2); calibrated numbers come from
 * BTC.levelConstants.l17 (tools/level-calibrate.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/btc-level-kit.js'), require('../game/btc-misconceptions.js'),
      require('./btc-level-constants.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {}))['1.7'] = factory(B.levelKit, B.misconceptions, B.levelConstants);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, LC) {
  'use strict';
  void MC;

  const L = LC.l17;
  const LN2 = 0.6931471805599453;
  const MEAN_TICKS = 60, CURVE_TICKS = 600;
  // Protein lengths (aa) of the lac cistrons, for lac synthesis ζ (§7.7.5); a test checks them against the catalog.
  const LAC_LEN = Object.freeze({ lacZ: 1024, lacY: 417, lacA: 203 });
  const MEDIA = Object.freeze({
    G: { glucose_mM: 10, lactose_mM: 0 }, L: { glucose_mM: 0, lactose_mM: 5 }, B: { glucose_mM: 10, lactose_mM: 5 },
  });
  // Phase templates (§7.7.3 revised, LEVELS §16): every L comes after a B phase, and the run opens in both sugars,
  // straight from the glucose-grown start. A glucose phase first lets a division leave the cell with none of the
  // preset's few LacY, and such a cell never lets lactose in (2 of 40 wild-type cells; ENGINE §15 item 1).
  // 0 marks an L phase (its length is LMIN + 15 before the jitter).
  const TEMPLATES = Object.freeze({
    T1: [['B', 105], ['L', 0], ['G', 90], ['B', 105], ['L', 0], ['G', 60]],
    T2: [['B', 120], ['L', 0], ['G', 135], ['B', 105], ['L', 0], ['G', 60]],
    T3: [['B', 105], ['L', 0], ['B', 60], ['G', 105], ['B', 120], ['L', 0], ['G', 75]],
    T4: [['B', 105], ['L', 0], ['G', 75], ['B', 90], ['G', 60], ['B', 105], ['L', 0], ['G', 60]],
  });
  // The Commander's design (the editor's start, §5.10): always on, full power.
  const DESIGN_START = Object.freeze({ lac: { promoter: 4, operator: false, crpSite: false }, lacI: { allele: 'deleted', promoter: 1 } });
  // Par: the normal lac genes (§7.7.13 reference).
  const DESIGN_REF = Object.freeze({ lac: { promoter: 1, operator: true, crpSite: true }, lacI: { allele: 'wt', promoter: 1 } });
  const ROWS = ['wt', 'dlacI', 'Oc', 'Is'];
  const HOURS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
    'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four'];

  const TEXT = {
    title: 'Nobody\'s in charge',
    challenge: 'Glucose and lactose come and go. Write the DNA, then let it run.',
    task: {
      goal: 'Keep the cell growing through every change, with no controls.',
      core: ['Grow on lactose in every lactose phase.',
        'Stay within par for growth, waste and lag; par is the normal lac genes run on your schedule.'],
      // The fraction follows the calibrated threshold (§16.8); written in here so every reader (the codes page too) sees it.
      expert: ['Glucose first: with both sugars present, make at most ' + (L.rBLMax <= 0.25 ? 'a quarter' : 'half') + ' as much lac protein as on lactose alone.',
        'Predict all four strains and the CRP question correctly.'],
    },
    story: {
      intro: [
        { who: 'narrator', text: 'Glucose and lactose come and go, alone or together. The flask does not send a schedule.' },
        { who: 'commander', text: 'I will switch the lac genes myself, as the sugars change.' },
        { who: 'narrator', text: 'The sugars change without warning, for {hoursWord} hours. The console has lost its buttons.' },
        { who: 'narrator', text: 'You may write the DNA. After that it runs without you.' },
      ],
      outro: [
        { who: 'narrator', text: 'The cell kept growing through every change. You were not involved.' },
        { who: 'ribosome', text: 'Still reading whatever lands on me.' },
        { who: 'narrator', text: 'Nobody switched anything. LacI, allolactose and a great many collisions did.' },
      ],
      onRun: [
        { who: 'laci', denies: true, text: "I don't want anything. When allolactose fits me, I let go of the operator." },
      ],
      // The goal was not met (§7.7.11).
      missed: [
        { who: 'narrator', text: 'The sugars changed. The DNA you wrote had no way to follow.' },
        { who: 'ribosome', text: 'Still reading whatever lands on me.' },
        { who: 'narrator', text: 'Nobody switched anything. Whatever the DNA allowed is what happened.' },
      ],
      // No operator or no repressor: nothing switched at all (the last line of the outro would not be true).
      alwaysOn: [
        { who: 'narrator', text: 'The cell kept growing through every change, with the lac genes on the whole time.' },
        { who: 'ribosome', text: 'Still reading whatever lands on me. In glucose that included a lot of lac mRNA.' },
        { who: 'narrator', text: 'Nothing switched anything. The lac proteins made in glucose cost amino acids and ATP.' },
      ],
    },
    table: {
      prompt: 'Which strains make LacZ?',
      rows: {
        wt: 'Normal lac genes', dlacI: 'No repressor gene', Oc: 'No operator', Is: 'Repressor that cannot bind allolactose',
      },
      cols: { glc: 'glucose only', lac: 'lactose only' },
      choices: ['almost none', 'LacZ made'],
    },
    crp: {
      prompt: 'Glucose and lactose are both present. Which design makes less LacZ?',
      options: [
        { t: 'The one with the CRP site.', ok: true,
          fb: 'Right. With glucose getting in, cAMP is low, so CRP gives the lac promoter little help.' },
        { t: 'The one without the CRP site.', mc: 'OTHER',
          fb: 'Without the site, CRP cannot help or hold back; the promoter runs at its own strength, sugar or not.' },
        { t: 'Both make the same.', mc: 'OTHER',
          fb: 'The CRP site ties the promoter to cAMP, and cAMP is low while glucose gets in.' },
      ],
    },
    d1: {
      prompt: 'When lactose arrived, what switched the lac genes on?',
      options: [
        { t: 'Allolactose made from lactose fitted LacI and pulled it off the operator.', ok: true,
          fb: 'Right. With the operator free, RNA polymerase started the lac genes. Nothing else was involved.' },
        { t: 'The cell decided lactose was worth using.', mc: 'CELL_DECIDES',
          fb: 'Nothing decided. LacI lets go of the operator only when allolactose is bound to it.' },
        { t: 'You did, by designing the DNA.', mc: 'COMMANDER',
          fb: 'You wrote the parts before the run. During it, LacI and allolactose did the switching.' },
        { t: 'The ribosomes, once they saw lactose.', mc: 'RIBOSOME_DECIDES',
          fb: 'Ribosomes see nothing. They read whatever mRNA lands on them.' },
      ],
    },
    d2: {
      prompt: 'Why did the normal design make so little LacZ in glucose?',
      options: [
        { t: 'With no lactose there was no allolactose, so LacI stayed on the operator.', ok: true,
          fb: 'Right. RNA polymerase was blocked until something pulled LacI off.' },
        { t: 'The cell switched the lac genes off to save energy.', mc: 'CELL_DECIDES',
          fb: 'Nothing was saved on purpose. LacI stayed bound because nothing pulled it off.' },
        { t: 'Glucose damages the lac genes.', mc: 'OTHER',
          fb: 'The genes were untouched. A protein sat on the operator, and they were read again once it came off.' },
        { t: 'Ribosomes skip lac mRNA when glucose is present.', mc: 'RIBOSOME_DECIDES',
          fb: 'Ribosomes read any mRNA. There was little lac mRNA to read, because LacI blocked transcription.' },
      ],
    },
    echo1: 'Your cells switch genes on and off with regulatory proteins called transcription factors. Each binds DNA when a signal fits it.',
    echo2: 'Your genes are not grouped into operons; most have their own promoter, and several factors act on each. Nobody is in charge there either.',
    cards: { repressor: 'Repressor protein', operon: 'Operon' },
    design: {
      title: 'Write the DNA',
      note: 'The run starts from a cell grown on glucose; your DNA takes over from there.',
      repressorUnit: 'Repressor gene',
      lacUnit: 'lac operon',
      genes: 'lacZ, lacY, lacA: the genes, not editable',
      parts: {
        'lacI.promoter': { label: 'promoter', name: 'Promoter of the repressor gene', desc: 'How often the repressor gene is transcribed.',
          options: [{ v: 1, t: 'normal' }, { v: 10, t: 'strong (Iq)' }] },
        'lacI.allele': { label: 'lacI', name: 'Repressor gene (lacI)', desc: 'Its protein, LacI, sits on the operator unless allolactose is bound to it.',
          options: [{ v: 'wt', t: 'normal' }, { v: 'deleted', t: 'deleted' }, { v: 'Is', t: 'cannot bind allolactose' }] },
        'lac.crpSite': { label: 'CRP site', name: 'CRP site', desc: 'CRP with cAMP bound helps RNA polymerase start here.',
          options: [{ v: true, t: 'present' }, { v: false, t: 'absent' }] },
        'lac.promoter': { label: 'promoter', name: 'Promoter of the lac genes', desc: 'How often RNA polymerase starts the lac genes when nothing blocks it.',
          options: [{ v: 0.5, t: '×½' }, { v: 1, t: '×1' }, { v: 2, t: '×2' }, { v: 4, t: '×4' }] },
        'lac.operator': { label: 'operator', name: 'Operator', desc: 'The stretch of DNA that LacI binds.',
          options: [{ v: true, t: 'present' }, { v: false, t: 'absent' }] },
      },
      summary: 'This design: {parts}.',
      summaryParts: {
        lacPromoter: 'lac promoter {v}', operator: 'operator {v}', lacI: 'repressor gene {v}', lacIPromoter: 'repressor promoter {v}', crp: 'CRP site {v}',
      },
      run: 'Run',
      confirm: 'Once it runs, nothing can be changed. Run it?',
      keepEditing: 'Keep editing',
      runNow: 'Run',
    },
    medium: 'The sugars follow the flask. The next change is not announced.',
    fractions: { quarter: 'a quarter', half: 'half' },
    phases: { G: 'glucose', L: 'lactose', B: 'both sugars' },
    hud: {
      goal: 'Now: {phase} · {status}', goalShort: '{Phase} · {status}', goalFresh: 'Now: {phase}', goalFreshShort: '{Phase}',
      status: { growing: 'growing', slowed: 'slowed', stopped: 'stopped' },
      timer: '{elapsed} of {total}', timerShort: '{elapsed}',
      counter: 'No controls', counterShort: 'No controls',
      toEnd: 'Run to the end', toEndShort: 'To the end',
      next: 'Next change: unknown',
    },
    result: {
      growth: 'Growth', waste: 'Waste in glucose', lag: 'Lag on lactose',
      growthLine: '{d} doublings; par {p}.', wasteLine: '{w}% of the protein made in glucose was lac protein; par {p}%.',
      lagLine: 'Lag {l} min on average; par {p} min.', noLactose: 'Growth on lactose fell short in at least one lactose phase.',
      missLactose: 'growth on lactose fell short', missDormant: 'the cell ran out of energy and stopped',
      chart: 'Doublings over the run: your design (solid) and par (dashed), over the sugar phases.',
      yours: 'your design', par: 'par (normal lac genes)', x: 'h', y: 'doublings',
      working: 'Working out par…',
    },
    narr: {
      super: 'This LacI cannot bind allolactose, so it stays on the operator even with lactose inside.',
      noop: 'With no operator, nothing blocks RNA polymerase, so the lac genes are transcribed all the time.',
      norep: 'With no LacI, nothing sits on the operator, so the lac genes are transcribed all the time.',
      crp: 'Glucose is getting in, so cAMP is low and CRP gives the lac promoter little help.',
      lag: 'Only lactose is here, and the cell has few lac proteins yet, so it grows slowly until more are made.',
      induced: 'Allolactose is bound to LacI, so LacI has let go of the operator and the lac genes are transcribed.',
      repressed: 'LacI is sitting on the operator, so RNA polymerase rarely starts the lac genes.',
    },
  };

  const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);
  const copy = (x) => JSON.parse(JSON.stringify(x));

  /** A design with every field present (missing fields take the wild-type values, as the engine does). */
  function fullDesign(d) {
    const x = d || DESIGN_START;
    const lac = Object.assign({}, DESIGN_REF.lac, x.lac || {}), lacI = Object.assign({}, DESIGN_REF.lacI, x.lacI || {});
    return { lac: { promoter: lac.promoter, operator: lac.operator, crpSite: lac.crpSite }, lacI: { allele: lacI.allele, promoter: lacI.promoter } };
  }
  /** The phases as [{kind, t0, t1}] in ticks (1 tick = 1 s); the medium changes at t0. */
  function spans(v) {
    const out = [];
    let t = 0;
    for (const [kind, min] of v.phases) { out.push({ kind, t0: t, t1: t + min * 60 }); t += min * 60; }
    return out;
  }
  const totalTicks = (v) => v.phases.reduce((s, p) => s + p[1] * 60, 0);
  const alwaysOn = (d) => d.lac.operator === false || d.lacI.allele === 'deleted';
  // The expected answer of the truth table (the model contract R-E15; 1 = LacZ made, 0 = almost none).
  const ANSWER = { wt: { glc: 0, lac: 1 }, dlacI: { glc: 1, lac: 1 }, Oc: { glc: 1, lac: 1 }, Is: { glc: 0, lac: 0 } };

  const DEF = {
    id: '1.7', code: '17', order: 7, version: 1, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'designer', scored: true, los: ['LO6'],
    misconceptions: ['CELL_DECIDES', 'COMMANDER', 'RIBOSOME_DECIDES', 'REPRESSOR_AS_ACTIVATOR', 'OPERATOR_IRRELEVANT'],
    estMinutes: 10, engine: '1.1',
    phases: ['intro', 'task', 'predict', 'design', 'run', 'result', 'debrief', 'echo', 'complete'],
    designStart: DESIGN_START, designRef: DESIGN_REF, templates: TEMPLATES, media: MEDIA, lacLengths: LAC_LEN,
    par: { design: DESIGN_REF, ticks: (v) => totalTicks(v) },
    spans, totalTicks, fullDesign,

    /**
     * One of four templates, jittered: every phase but the last moves by a multiple of 5 min in
     * [−15, +15], then the minimums hold (G ≥ 60, B ≥ 60, B before L ≥ 90, L ≥ LMIN).
     * The Core truth-table rows are wt, dlacI and one of Oc or Is, in a random order.
     */
    variant(seed) {
      const r = K.rng(seed, '1.7');
      const template = r.pick(['T1', 'T2', 'T3', 'T4']);
      const base = TEMPLATES[template];
      const phases = base.map(([kind, min], i) => {
        let m = kind === 'L' ? L.LMIN + 15 : min;
        if (i < base.length - 1) m += 5 * r.int(-3, 3);
        const next = base[i + 1];
        const floor = kind === 'L' ? L.LMIN : kind === 'B' && next && next[0] === 'L' ? 90 : 60;
        return [kind, Math.max(floor, m)];
      });
      const third = r.pick(['Oc', 'Is']);
      const rows = r.shuffle(['wt', 'dlacI', third]);
      return { seed, template, phases, rows, extraRow: third === 'Oc' ? 'Is' : 'Oc' };
    },
    textVars(v) {
      const h = Math.round(totalTicks(v) / 3600);
      return { hoursWord: HOURS[h] || String(h), hours: h, fraction: L.rBLMax <= 0.25 ? TEXT.fractions.quarter : TEXT.fractions.half };
    },
    variantLabel(v) { return v.template + ' ' + v.phases.map((p) => p[0] + p[1]).join(' ') + ' · rows ' + v.rows.join(', '); },

    config(v, role, extra) {
      const design = fullDesign(extra && extra.design ? extra.design : role === 'par' ? DESIGN_REF : DESIGN_START);
      const sp = spans(v);
      return {
        seed: K.seedFor(v.seed, role === 'par' ? 'task' : role), strain: 'm2-lac', start: 'steady', design,
        medium: Object.assign({ aminoAcids_mM: 0 }, MEDIA[sp[0].kind]),
        flags: { controls: 'locked' },
        schedule: sp.slice(1).map((p) => ({ tick: p.t0, cmd: Object.assign({ type: 'setMedium' }, MEDIA[p.kind]) })),
        variant: { levelId: '1.7', content: 1, seed: v.seed, template: v.template, phases: v.phases },
      };
    },

    labConfig(v, state) {
      const sp = spans(v);
      const bands = sp.map((p) => ({ t0: p.t0, t1: p.t1, kind: p.kind, label: TEXT.phases[p.kind], token: 'band-' + p.kind }));
      return {
        showNames: true, genesVisible: ['lacI', 'lacZ', 'lacY', 'lacA'], displayOrder: ['lacI', 'lacZ', 'lacY', 'lacA'],
        controls: { genes: false, medium: true, drugs: false }, readOnlyGenes: true,
        mediumRows: { glucose: 'locked', lactose: 'locked', aminoAcids: 'hidden' }, mediumNote: TEXT.medium,
        speedOptions: [60, 600, 3600], defaultSpeed: 600, startPaused: true,
        tabs: ['cell', 'genes', 'medium', 'graphs'], graphGenes: ['lacZ', 'lacY', 'lacI'], focusGene: 'lacZ', hud: true,
        bands, graphWindow: 0, plots: ['growth', 'protein', 'mRNA', 'atp'],
        designer: !!state && state.phase === 'design',
      };
    },

    hud(v, st) {
      const s = Object.assign({ tick: 0, pi: 0, lambda60: 0 }, st || {});
      const sp = spans(v), total = sp[sp.length - 1].t1;
      const kind = sp[Math.min(s.pi, sp.length - 1)].kind;
      const lamL = L.lambdaLacRef;
      const status = s.lambda60 >= 0.5 * lamL ? 'growing' : s.lambda60 >= 0.1 * lamL ? 'slowed' : 'stopped';
      const word = TEXT.phases[kind];
      const vars = { phase: word, Phase: word.charAt(0).toUpperCase() + word.slice(1), status: TEXT.hud.status[status] };
      // Before the first minute has run there is no growth to report yet.
      const fresh = s.tick < MEAN_TICKS;
      const elapsed = K.clock(Math.min(s.tick, total), false);
      return {
        goal: { text: K.fill(fresh ? TEXT.hud.goalFresh : TEXT.hud.goal, vars), short: K.fill(fresh ? TEXT.hud.goalFreshShort : TEXT.hud.goalShort, vars),
          progress: Math.min(1, s.tick / total), done: false, sub: TEXT.hud.next },
        timer: { text: K.fill(TEXT.hud.timer, { elapsed, total: K.clock(total, false) }), short: K.fill(TEXT.hud.timerShort, { elapsed }) },
        counter: { text: TEXT.hud.counter, short: TEXT.hud.counterShort },
        action: s.tick < total ? { id: 'runToEnd', text: TEXT.hud.toEnd, short: TEXT.hud.toEndShort } : null,
      };
    },

    predictions: [
      {
        id: 'tt', kind: 'table', prompt: TEXT.table.prompt,
        rows: ROWS.map((id) => ({ id, label: TEXT.table.rows[id] })),
        cols: [{ id: 'glc', label: TEXT.table.cols.glc }, { id: 'lac', label: TEXT.table.cols.lac }],
        choices: TEXT.table.choices, answer: ANSWER,
        coreRows: (v) => v.rows.slice(),
        shownRows: (v) => v.rows.concat([v.extraRow]),
        expertRows: (v) => [v.extraRow],
      },
      { id: 'crp', kind: 'choice', expert: true, prompt: TEXT.crp.prompt, options: TEXT.crp.options },
    ],

    /**
     * The run's measurements (§7.7.5): doublings, the lag of each lactose phase, lactose growth
     * (mean 60-s growth over each lactose phase's second half), waste (lac synthesis over all
     * protein synthesis in glucose-only phases), the glucose-first ratio (lac synthesis in the
     * second halves of both-sugar phases over that of lactose phases) and dormancy (E < 0.01
     * for 10 min). The run ends when the schedule does.
     */
    monitor(v, ctx) {
      const sp = spans(v), total = sp[sp.length - 1].t1, lamL = L.lambdaLacRef;
      const design = fullDesign(ctx && ctx.design);
      const tm = K.trailingMean(MEAN_TICKS);
      // The last minute of the lac region, for the narrator: share of ticks with every operator copy bound,
      // with none bound, with the inducer at or above the level that frees half the operators, and with cAMP low.
      const mBound = K.trailingMean(MEAN_TICKS), mFree = K.trailingMean(MEAN_TICKS), mInd = K.trailingMean(MEAN_TICKS), mCrp = K.trailingMean(MEAN_TICKS);
      const phase = (k) => ({ kind: sp[k].kind, t1: -1, run60: 0, lag: null, g2: 0, z2: 0, n2: 0 });
      let st = {
        tick: 0, pi: 0, lambda60: 0, dbl: 0, wfNum: 0, wfDen: 0, lags: [], lacGrowth: [], B2: [], L2: [], dormant: false, dormantTick: -1,
        below: 0, curve: [0], cur: phase(0), opBound: 0, opCopies: 1, inducer: false, crpLow: false, lacIn: 0, lacZ: 0, done: false,
        bound60: 0, free60: 0, ind60: 0, crpLow60: 0,
      };
      const finish = () => {
        const c = st.cur, p = sp[st.pi];
        if (c.kind === 'L') {
          st.lags.push(c.t1 < 0 ? 0 : c.lag === null ? (p.t1 - p.t0) / 60 : c.lag);
          st.lacGrowth.push(c.n2 ? c.g2 / c.n2 / lamL : 0);
          st.L2.push(c.n2 ? c.z2 / c.n2 : 0);
        } else if (c.kind === 'B') st.B2.push(c.n2 ? c.z2 / c.n2 : 0);
      };
      const lacView = (vw, push) => {
        const lac = vw.lac;
        if (!lac) return;
        st.opBound = lac.operatorBound; st.opCopies = lac.operatorCopies;
        st.inducer = lac.inducer_uM >= lac.inducerHalf_uM; st.crpLow = lac.cAMP < 0.5;
        st.lacIn = vw.lactose.inside; st.lacZ = vw.geneById.lacZ.protein;
        if (push) {
          st.bound60 = mBound.push(lac.operatorBound >= lac.operatorCopies ? 1 : 0);
          st.free60 = mFree.push(lac.operatorBound === 0 ? 1 : 0);
          st.ind60 = mInd.push(st.inducer ? 1 : 0);
          st.crpLow60 = mCrp.push(st.crpLow ? 1 : 0);
        }
      };
      return {
        start(cell) { const vw = cell.observe(); st.lambda60 = vw.cell.lambda_perS; lacView(vw); },
        onTick(cell) {
          if (st.done) return;
          const vw = cell.observe(), t = cell.tick;
          st.tick = t;
          while (st.pi < sp.length - 1 && t > sp[st.pi].t1) { finish(); st.pi++; st.cur = phase(st.pi); }
          const lam = vw.cell.lambda_perS;
          const l60 = tm.push(lam);
          st.lambda60 = l60;
          st.dbl += (lam * vw.scale.dt_s) / LN2;
          let z = 0;
          for (const id of ['lacZ', 'lacY', 'lacA']) z += vw.geneById[id].synthesis_perS * LAC_LEN[id];
          const p = sp[st.pi], c = st.cur, into = t - p.t0, len = p.t1 - p.t0;
          if (c.kind === 'G') { st.wfNum += z; st.wfDen += vw.flux.aaPolymerised; }
          if (into > len / 2) { c.z2 += z; c.g2 += l60; c.n2++; }
          if (c.kind === 'L' && c.lag === null) {
            if (c.t1 < 0) { if (l60 < 0.5 * lamL) c.t1 = into; } else if (l60 >= 0.5 * lamL) { if (++c.run60 >= MEAN_TICKS) c.lag = (into - (MEAN_TICKS - 1)) / 60; } else c.run60 = 0;
          }
          st.below = vw.energy.E < 0.01 ? st.below + 1 : 0;
          if (!st.dormant && st.below >= 600) { st.dormant = true; st.dormantTick = t; }
          if (t % CURVE_TICKS === 0) st.curve.push(Math.round(st.dbl * 1000) / 1000);
          lacView(vw, true);
          if (t >= total) { finish(); st.done = true; }
        },
        end() { return st.done ? 'done' : null; },
        result() {
          const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
          const lactoseOk = st.lacGrowth.length > 0 && st.lacGrowth.every((g) => g >= 0.5);
          const L2 = mean(st.L2);
          return {
            goal: st.done && lactoseOk && !st.dormant, lactoseOk, dormant: st.dormant, dbl: st.dbl, lags: st.lags.slice(), lag: mean(st.lags),
            lacGrowth: st.lacGrowth.slice(), wf: st.wfDen > 0 ? st.wfNum / st.wfDen : 0, rBL: L2 > 0 ? mean(st.B2) / L2 : null,
            curve: st.curve.slice(), design,
          };
        },
        save() { return copy(Object.assign({}, st, { mean: tm.state(), lacMeans: [mBound.state(), mFree.state(), mInd.state(), mCrp.state()] })); },
        restore(s) {
          const c = copy(s);
          tm.restore(c.mean);
          if (c.lacMeans) { mBound.restore(c.lacMeans[0]); mFree.restore(c.lacMeans[1]); mInd.restore(c.lacMeans[2]); mCrp.restore(c.lacMeans[3]); }
          delete c.mean; delete c.lacMeans;
          st = c;
        },
      };
    },

    /** Growth, lag and waste against par (§7.7.6); E is the worst of the three. */
    subScores(m, par) {
      if (!par || typeof m.dbl !== 'number') return null;
      const g = clamp01((m.dbl / par.dbl - 0.90) / 0.08);
      const l = clamp01(1 - (m.lag - (1.25 * par.lag + 5)) / Math.max(par.lag, 15));
      const w = clamp01(1 - (m.wf - (1.5 * par.wf + 0.001)) / 0.01);
      return { growth: g, lag: l, waste: w };
    },

    score(v, m, answers, extras) {
      const p = answers.predictions, d = answers.debrief, par = extras && extras.par;
      const sub = DEF.subScores(m, par);
      const E = sub ? Math.min(sub.growth, sub.lag, sub.waste) : null;
      const tt = p.tt && p.tt.locked ? p.tt : null;
      const P = tt ? tt.P : 0;
      const crpOk = !!(p.crp && p.crp.locked && p.crp.correct);
      // Glucose first (§7.7.6; the threshold is calibrated, §8.3): a quarter, or half when the reference cannot hold a quarter.
      const X = (m.goal && typeof m.rBL === 'number' && m.rBL <= L.rBLMax ? 1 : 0) | (tt && tt.expertAll && crpOk ? 2 : 0);
      const flags = [];
      const des = fullDesign(m.design || (extras && extras.design));
      if (alwaysOn(des)) flags.push({ id: 'DESIGN_ALWAYS_ON', data: { operator: des.lac.operator, lacI: des.lacI.allele } });
      if (des.lacI.allele === 'Is') flags.push({ id: 'DESIGN_NEVER_ON', data: {} });
      if (tt) {
        const val = tt.value;
        if (val.dlacI && (val.dlacI.glc === 0 || val.dlacI.lac === 0)) flags.push({ id: 'PRED_REPRESSOR_AS_ACTIVATOR', data: { row: val.dlacI } });
        if (val.Oc && val.wt && val.Oc.glc === val.wt.glc && val.Oc.lac === val.wt.lac) flags.push({ id: 'PRED_OPERATOR_IRRELEVANT', data: { row: val.Oc } });
      }
      const first = (qid) => (d[qid] ? d[qid].firstMc : null);
      if (first('l17.d1') === 'CELL_DECIDES' || first('l17.d2') === 'CELL_DECIDES') flags.push({ id: 'DEB_CELL_DECIDES', data: {} });
      if (first('l17.d1') === 'COMMANDER') flags.push({ id: 'DEB_COMMANDER', data: {} });
      if (first('l17.d1') === 'RIBOSOME_DECIDES' || first('l17.d2') === 'RIBOSOME_DECIDES') flags.push({ id: 'DEB_RIBOSOME_DECIDES', data: {} });
      return { E, P, X, flags, sub, par: par ? { dbl: par.dbl, lag: par.lag, wf: par.wf, curve: par.curve } : null,
        mine: { dbl: m.dbl, lag: m.lag, wf: m.wf, curve: m.curve, lactoseOk: m.lactoseOk } };
    },

    /** The result sheet's three bars with their numbers (§7.7.6). */
    resultBars(v, comp) {
      if (!comp.sub || !comp.par) return null;
      const R = TEXT.result, a = comp.mine, b = comp.par;
      const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1), pc = (x) => (Math.round(x * 1000) / 10).toFixed(1);
      return [
        { key: 'growth', label: R.growth, value: comp.sub.growth, line: K.fill(R.growthLine, { d: r1(a.dbl), p: r1(b.dbl) }) },
        { key: 'waste', label: R.waste, value: comp.sub.waste, line: K.fill(R.wasteLine, { w: pc(a.wf), p: pc(b.wf) }) },
        { key: 'lag', label: R.lag, value: comp.sub.lag, line: K.fill(R.lagLine, { l: Math.round(a.lag), p: Math.round(b.lag) }) },
      ];
    },
    /** The result sheet's chart: doublings over the run, the design against par, over the phases. */
    resultChart(v, comp) {
      if (!comp.mine || !comp.par) return null;
      const R = TEXT.result;
      return {
        mine: comp.mine.curve, par: comp.par.curve, stepMin: CURVE_TICKS / 60, totalMin: totalTicks(v) / 60,
        bands: spans(v).map((p) => ({ from: p.t0 / 60, to: p.t1 / 60, label: TEXT.phases[p.kind], color: 'band-' + p.kind })),
        words: { x: R.x, y: R.y, sketch: R.par, cell: R.yours, label: R.chart },
      };
    },

    flags: [
      'DESIGN_ALWAYS_ON', 'DESIGN_NEVER_ON', { id: 'PRED_REPRESSOR_AS_ACTIVATOR', mc: 'REPRESSOR_AS_ACTIVATOR' },
      { id: 'PRED_OPERATOR_IRRELEVANT', mc: 'OPERATOR_IRRELEVANT' }, { id: 'DEB_CELL_DECIDES', mc: 'CELL_DECIDES' },
      { id: 'DEB_COMMANDER', mc: 'COMMANDER' }, { id: 'DEB_RIBOSOME_DECIDES', mc: 'RIBOSOME_DECIDES' },
    ],
    debrief: [
      { id: 'l17.d1', kind: 'choice', prompt: TEXT.d1.prompt, options: TEXT.d1.options },
      { id: 'l17.d2', kind: 'choice', prompt: TEXT.d2.prompt, options: TEXT.d2.options },
    ],
    echo: {
      screens: ['echo1', 'echo2'],
      cards: [{ id: 'repressor', title: 'cards.repressor', stamp: 'universal' }, { id: 'operon', title: 'cards.operon', stamp: 'bacteria' }],
    },
    story: { intro: TEXT.story.intro, outro: TEXT.story.outro, extra: { onRun: TEXT.story.onRun, missed: TEXT.story.missed, alwaysOn: TEXT.story.alwaysOn } },
    /** "LacI, allolactose … did" is true only when the design keeps a working switch; otherwise another outro. */
    outroKey(v, m, goal) {
      if (!goal) return 'missed';
      return m && m.design && alwaysOn(fullDesign(m.design)) ? 'alwaysOn' : null;
    },
    /** The run always reaches its end here, so "the run ended" would not say why the goal was missed. */
    missReason(m) {
      if (!m || m.goal) return null;
      return m.dormant ? TEXT.result.missDormant : m.lactoseOk === false ? TEXT.result.missLactose : null;
    },

    /**
     * Level narrator rules (§7.7.12; facts 1.3), each true whenever it speaks. They read the
     * design (fixed for the run) and what the lac region did over the last minute (the
     * operator flickers between bound and free during induction): "sitting on the operator"
     * needs every copy bound for nearly all of it, "let go" none bound. The lag line names
     * what holds a cell back on lactose alone in this model: too few lac enzymes yet.
     */
    narratorRules: (function () {
      const run = (lv) => (lv && lv.phase === 'run' && lv.monitor && lv.monitor.opCopies && lv.monitor.tick >= MEAN_TICKS ? lv.monitor : null);
      const des = (lv) => fullDesign(lv.design);
      return [
        { key: 'l17.super', template: TEXT.narr.super,
          when: (f, mem, t, lv) => { const m = run(lv); return !!m && des(lv).lacI.allele === 'Is' && des(lv).lac.operator && m.lacIn > 0 && m.bound60 >= 0.9; } },
        { key: 'l17.noop', template: TEXT.narr.noop,
          when: (f, mem, t, lv) => !!run(lv) && des(lv).lac.operator === false },
        { key: 'l17.norep', template: TEXT.narr.norep,
          when: (f, mem, t, lv) => !!run(lv) && des(lv).lacI.allele === 'deleted' },
        { key: 'l17.crp', template: TEXT.narr.crp,
          when: (f, mem, t, lv) => { const m = run(lv); return !!m && f.medium === 'both' && des(lv).lac.crpSite && m.crpLow60 >= 0.9 && m.free60 >= 0.5; } },
        { key: 'l17.lag', template: TEXT.narr.lag,
          when: (f, mem, t, lv) => { const m = run(lv); return !!m && f.medium === 'lactose' && m.lambda60 < 0.5 * L.lambdaLacRef && des(lv).lacI.allele !== 'Is'; } },
        { key: 'l17.induced', template: TEXT.narr.induced,
          when: (f, mem, t, lv) => { const m = run(lv); return !!m && m.free60 >= 0.9 && m.ind60 >= 0.9; } },
        { key: 'l17.repressed', template: TEXT.narr.repressed,
          when: (f, mem, t, lv) => { const m = run(lv); return !!m && m.bound60 >= 0.95 && m.ind60 <= 0.2; } },
      ];
    }()),

    solutions: (function () {
      const idle = () => {};
      const right = { tt: copy(ANSWER), crp: 'ok' };
      const sol = (design, expect, predictions) => ({ kind: 'policy', every: 600, act: idle, design, expect, predictions: predictions || right });
      return {
        reference: sol(DESIGN_REF, { goal: true, par: true, X: 1, minTotal: 90, flags: [] }),
        coreWildType: sol({ lac: { promoter: 1, operator: true, crpSite: false }, lacI: { allele: 'wt', promoter: 1 } }, { goal: true, par: true }),
        commander: sol(DESIGN_START, { goal: true, par: false, flags: ['DESIGN_ALWAYS_ON'] }),
        noRepressor: sol({ lac: { promoter: 1, operator: true, crpSite: false }, lacI: { allele: 'deleted', promoter: 1 } }, { par: false, flags: ['DESIGN_ALWAYS_ON'] }),
        lockedOff: sol({ lac: { promoter: 1, operator: true, crpSite: true }, lacI: { allele: 'Is', promoter: 1 } }, { goal: false, flags: ['DESIGN_NEVER_ON'] }),
        lacIq: sol({ lac: { promoter: 1, operator: true, crpSite: true }, lacI: { allele: 'wt', promoter: 10 } }, { goal: true }),
        // The repressor read as an activator: "no repressor gene" predicted to make almost no LacZ.
        repressorAsActivator: sol(DESIGN_REF, { goal: true, flags: ['PRED_REPRESSOR_AS_ACTIVATOR'] },
          { tt: Object.assign(copy(ANSWER), { dlacI: { glc: 0, lac: 0 } }), crp: 'ok' }),
      };
    }()),
  };
  return DEF;
});
