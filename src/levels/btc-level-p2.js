// @deps btc-level-kit btc-misconceptions btc-level-constants
/*
 * Be the Cell: Prologue 2, "A cell's economy" (docs/PROLOGUE.md §2.4, §2.8.2). Not scored.
 *
 * Drawings first: the bacterium beside one of your cells (the same code, read by ribosomes that do the
 * same job; no nucleus, one loop of DNA, so ribosomes start on an mRNA while it is still being made),
 * the two sugars (glucose, the everyday sugar; lactose, the sugar in milk), and the cell's economy
 * built up one piece per tap (sugar in → enzymes make ATP → ATP pays for building proteins → machines
 * wear out → the cell grows and divides). Its numbers come from the calibrated constants (LC.economy),
 * which come from the engine's parameters.
 *
 * Then the guided first experiment in the real engine (phase `watch`, §2.4.3): the 1.1 starting state
 * with names shown and one gene in play. The student switches the glucose transporter gene on and
 * sees the copies, the ribosomes, the transporters, the membrane and glucose coming in, each step
 * gated on a tap, the switch, a guess or a state of the model, never on elapsed time.
 *
 * Every student-facing string is in TEXT (linted, LEVELS §12.1 L-2).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/btc-level-kit.js'), require('../game/btc-misconceptions.js'),
      require('./btc-level-constants.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {})).P2 = factory(B.levelKit, B.misconceptions, B.levelConstants);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, LC) {
  'use strict';
  void MC;

  const CONTENT = 1;
  const ECO = LC.economy;
  const ON = 2;                                  // On = ×2 (PROLOGUE §2.4.3: the Off/On switch)

  const TEXT = {
    title: 'A cell’s economy',
    challenge: 'A bacterium, its two sugars, and a first experiment with one gene.',
    labels: {
      bacterium: 'a bacterium', betaCell: 'one of your cells (a beta cell)', nucleus: 'nucleus', ribosome: 'ribosome', mRNA: 'mRNA',
      dna: 'its DNA: one loop', noNucleus: 'no nucleus', rnap: 'RNA polymerase', copyInProgress: 'a copy still being made',
      readFront: 'ribosomes already reading its front', glucose: 'glucose', lactose: 'lactose', blood: 'your blood', milk: 'milk',
      glucoseTr: 'glucose transporter', lactoseTr: 'lactose transporter', enzymes: 'glucose-processing enzymes', splitter: 'lactose-splitting enzyme',
      sugar: 'sugar', transporter: 'transporter', enzyme: 'enzymes', atp: 'ATP', spent: 'spent', building: 'building proteins',
      other: 'other building', upkeep: 'upkeep', price: 'about {atp} ATP', priceAa: '{aa} amino acids', gene: 'gene', copy: 'mRNA copy', worn: 'worn out, cut up',
      divides: 'grows and divides', outside: 'outside', inside: 'inside', membrane: 'membrane', dotsEnlarged: 'drawn larger than scale',
      scale5um: '5 µm', scale1um: '1 µm', scale50nm: '50 nm', letters: 'letters drawn larger than scale',
      fewRibosomes: 'a few of its many thousands of ribosomes', dnaLength: 'drawn far shorter: stretched out, this DNA is about 1.6 mm long',
    },
    alt: {
      sizes: 'A bacterium beside one of your cells, both to the same scale bar.',
      bactRibosomes: 'The bacterium with a few of its ribosomes and an mRNA.',
      bactDNA: 'The bacterium’s DNA: one loop, lying free in the cell, with no nucleus; drawn far shorter than it is.',
      cotx: 'RNA polymerase making an mRNA while ribosomes already read its front end.',
      glucose: 'Glucose, with a drop of blood and a bacterium.',
      lactose: 'Lactose, two joined sugar rings, with a glass of milk.',
      pairs: 'Two pairs of machines: glucose transporter and glucose-processing enzymes; lactose transporter and lactose-splitting enzyme.',
      economy: 'The cell’s economy, built up one piece at a time.',
    },
    about: {
      q4: { row: 'About: insulin made by bacteria', text: 'Bacteria given an insulin gene with no cut-out stretches make its chain; enzymes then cut it into insulin. Much insulin is made this way.' },
    },
    ui: { simplified: 'What is simplified', simplifiedTitle: 'What is simplified', next: 'Next: level 1.1' },
    simplified: [
      'The drawings of cells are to their scale bars, but simplified; what is not says so.',
      'Protein shapes are drawn flat. Real proteins are three-dimensional; the fit between pocket and molecule is real.',
      'The bacterium you run is a lab strain: each of its genes has its own switch.',
      'Each dot on the cell stands for many molecules; the line under the cell says how many.',
    ],
    scenes: {
      q1: [{ who: 'narrator', text: 'This is a bacterium, much smaller than one of your cells. Bacteria of this kind live in your gut.' }],
      q2: [
        { who: 'narrator', text: 'It reads the same genetic code, with ribosomes that do the same job as yours.' },
        { who: 'ribosome', text: 'Different cell, same code, same job. I read what reaches me.' },
      ],
      q3: [{ who: 'narrator', text: 'It has no nucleus. Its DNA is one loop of about 4.6 million letters, with about 4,300 genes, lying free in the cell.' }],
      q4: [{ who: 'narrator', text: 'With no nucleus in the way, ribosomes start reading an mRNA while it is still being made.' }],
      q5: [{ who: 'narrator', text: 'Glucose is the everyday sugar. It is in your blood, and it is the sugar this bacterium uses first when it can.' }],
      q6: [{ who: 'narrator', text: 'Lactose is the sugar in milk. Some of it reaches the bacteria in your gut.' }],
      q7: [{ who: 'narrator', text: 'Each sugar gets in through its own transporter. Lactose must also be split in two by its own enzyme before the cell can use it.' }],
      s0: [{ who: 'commander', text: 'A cell of my own. What does it do all day?' }],
      s1: [{ who: 'narrator', text: 'A cell runs as a small economy.' }],
      s2: [{ who: 'narrator', text: 'Food first: sugar gets in only through transporter machines in the membrane.' }],
      s3: [
        { who: 'narrator', text: 'Enzyme machines inside break the sugar down and make ATP, the cell’s energy currency.' },
        { who: 'narrator', text: 'Here, with no oxygen, each glucose gives {atpPerGlucose} ATP.' },
      ],
      s4: [{ who: 'narrator', text: 'ATP is spent on everything the cell does. The biggest single cost is building proteins: about {atpPerAa} ATP to join each amino acid on.' }],
      s5: [{ who: 'narrator', text: 'So one transporter costs about {trAtp} ATP to build: the energy from about {trGlucose} glucose.' }],
      s6: [{ who: 'narrator', text: 'Genes hold the instructions for every machine. mRNA copies carry them to the ribosomes.' }],
      s7: [{ who: 'narrator', text: 'Machines wear out and are cut up, and new ones are made all the time.' }],
      s8: [{ who: 'narrator', text: 'When the economy runs well, the cell grows, copies its DNA and divides in two.' }],
    },
    // The guided experiment (§2.4.3, §2.8.2), in play order.
    steps: {
      s9: [
        { who: 'narrator', text: 'Your job: keep this cell fed and growing, until it divides in two.' },
        { who: 'commander', text: 'Fed, growing, dividing. I will give the orders.' },
        { who: 'narrator', text: 'A cell cannot read orders. It reads genes. Switching genes on and off is the one lever you have.' },
      ],
      e9: [{ who: 'narrator', text: 'Here is a cell with sugar all around it and no glucose transporters.' }],
      h1: [{ who: 'narrator', text: 'This cell is computed, not drawn by hand. Every mark on it comes from the model.' }],
      h2: [{ who: 'narrator', text: 'Each dot stands for many molecules. The line under the cell says how many.' }],
      h3: [{ who: 'narrator', text: 'Glucose is all around, but this cell has no glucose transporters. A trickle gets in by a slow side route.' }],
      h4: [{ who: 'narrator', text: 'So its energy is low and it grows slowly.' }],
      h5: [{ who: 'narrator', text: 'This is the glucose transporter gene. It is off.' }],
      h6: [{ who: 'narrator', text: 'Switch it on.' }],
      h7: [{ who: 'narrator', text: 'The first mRNA copy is finished. Each wavy strand is one copy.' }],
      h8: [{ who: 'narrator', text: 'Ribosomes are reading it, each building one transporter chain.' }],
      h9: [{ who: 'narrator', text: 'The first transporters are finished. Their count is here.' }],
      h10: [{ who: 'narrator', text: 'They sit across the membrane. A hollow mark means only a few so far.' }],
      h11: [{ who: 'narrator', text: 'Glucose now comes in through them. In the whole-cell view, each moving mark stands for {N} glucose.' }],
      h12: [{ who: 'narrator', text: 'With glucose coming in, energy is back to normal. Growth picks up over the next half hour.' }],
      h13: [
        { who: 'commander', text: 'It did exactly what I told it.' },
        { who: 'narrator', text: 'You switched one gene on. RNA polymerase copied it, ribosomes read the copies, and the transporters let glucose in.' },
      ],
      h14: [
        { who: 'narrator', text: 'Next time this cell starts over with six unlabelled genes. One of them holds the instructions for the transporter.' },
        { who: 'commander', text: 'Then I will switch on the right one.' },
        { who: 'narrator', text: 'First you will have to find it.' },
      ],
    },
    causes: {
      h7: 'The gene was copied first.',
      h9: 'Ribosomes built them from the copies.',
      h11: 'Glucose came in only once transporters sat in the membrane.',
    },
    offNote: 'The gene is off, so no new copies are started. Switch it on to carry on.',
    // While a step waits on the model, what is happening (no silent wait, PM4).
    wait: { h11: 'More transporters are being built. Glucose comes in faster as their number grows.' },
    look: { gene: 'Look closer', protein: 'Look at one transporter' },
    // Q7's machine cards (§4.3): what each does first, then its name. ATP is not named before S3, so these are not the lab's job lines.
    cardsQ7: {
      ptsG: { job: 'Carries glucose across the membrane.', name: 'Glucose transporter', where: 'Works in the membrane' },
      gly: { job: 'Break glucose down inside the cell.', name: 'Glucose-processing enzymes', where: 'Work inside the cell' },
      lacY: { job: 'Carries lactose across the membrane.', name: 'Lactose transporter', where: 'Works in the membrane' },
      lacZ: { job: 'Splits lactose into two sugars: glucose and galactose.', name: 'Lactose-splitting enzyme', where: 'Works inside the cell' },
    },
    e9g: {
      prompt: 'What will happen to its ATP?',
      options: [
        { t: 'It runs low, because little sugar gets in.', cause: true, fb: 'Its ATP ran low: without glucose transporters, only a trickle of sugar got in to be broken down.' },
        { t: 'It stays high: sugar outside is enough.', mc: 'ENERGY_FIRST', fb: 'Sugar outside makes no ATP. Only sugar that gets in and is broken down by enzymes does.' },
        { t: 'It rises, because the cell saves energy.', mc: 'CELL_DECIDES', fb: 'Nothing saves anything on purpose. ATP fell, because too little sugar got in.' },
      ],
    },
    h5g: {
      prompt: 'When you switch this gene on, what will you see first?',
      options: [
        { t: 'mRNA copies of the gene.', cause: true, fb: 'The gene was copied first. Transporters came next, and glucose got in only after that.' },
        { t: 'Glucose coming in.', mc: 'DNA_DIRECT', fb: 'Glucose came in only once transporters had been built and sat in the membrane, minutes later.' },
        { t: 'Energy going up.', mc: 'ENERGY_FIRST', fb: 'Energy rose last: it comes from glucose, and glucose waited for the transporters.' },
        { t: 'New transporters in the membrane.', mc: 'OTHER', fb: 'Transporters came second. Ribosomes can build them only from mRNA copies, so the copies came first.' },
      ],
    },
    // The lab's "none of it gets in" is not true of this cell: the side route lets a trickle in.
    narr: { trickle: 'Glucose is outside, but only a trickle of it can get in, through a slow side route.' },
    cards: { noNucleus: 'No nucleus', loop: 'All its genes on one loop of DNA', together: 'Reading mRNA while it is made', atp: 'ATP, the energy currency' },
  };

  const offNotes = [{ test: 'geneOff', text: TEXT.offNote }];
  const STEPS = [
    { id: 's9', lines: TEXT.steps.s9, gate: { kind: 'tap' } },
    { id: 'e9', lines: TEXT.steps.e9, guess: Object.assign({ id: 'e9', showAt: 'h4' }, TEXT.e9g), gate: { kind: 'guess' } },
    { id: 'h1', lines: TEXT.steps.h1, gate: { kind: 'tap' } },
    { id: 'h2', lines: TEXT.steps.h2, point: 'legend', introduces: ['legend'], gate: { kind: 'tap' } },
    { id: 'h3', lines: TEXT.steps.h3, point: 'side-route', gate: { kind: 'tap' } },
    { id: 'h4', until: { test: 'energyLow', pause: true }, lines: TEXT.steps.h4, point: 'gauge:energy', introduces: ['status.energy'], gate: { kind: 'tap' } },
    // H5's "What happened" waits for glucose to come in (H11), which its options are about (PM3).
    { id: 'h5', lines: TEXT.steps.h5, point: 'control:promoter', guess: Object.assign({ id: 'h5', showAt: 'h11' }, TEXT.h5g), gate: { kind: 'guess' } },
    { id: 'h6', lines: TEXT.steps.h6, point: 'control:promoter', act: { kind: 'command', expect: { type: 'setPromoter', gene: 'ptsG', on: true } }, gate: { kind: 'act' } },
    { id: 'h7', until: { test: 'firstMRNA', pause: true }, lines: TEXT.steps.h7, point: 'mrna:first', gate: { kind: 'tap' }, cause: TEXT.causes.h7, notes: offNotes },
    { id: 'h8', until: { test: 'firstRibosome', pause: true }, lines: TEXT.steps.h8, point: 'ribosome:focus', gate: { kind: 'tap' }, notes: offNotes,
      offer: [{ label: TEXT.look.gene, zoom: 'gene' }] },
    { id: 'h9', until: { test: 'firstProtein', pause: true }, lines: TEXT.steps.h9, point: 'counter:protein', introduces: ['counter.protein'], gate: { kind: 'tap' },
      cause: TEXT.causes.h9, notes: offNotes },
    // From H10 the wait for glucose is long (about 20 game-min): the cell goes to 1 s = 1 min by itself, and says so (PM4).
    { id: 'h10', until: { test: 'inPlace', pause: true }, lines: TEXT.steps.h10, point: 'glyph:membrane:ptsG', gate: { kind: 'tap' }, notes: offNotes, speed: 60 },
    { id: 'h11', until: { test: 'workOver', x: 1, pause: true }, lines: TEXT.steps.h11, point: 'marker:glucose', gate: { kind: 'tap' }, cause: TEXT.causes.h11,
      wait: TEXT.wait.h11, notes: offNotes, offer: [{ label: TEXT.look.protein, zoom: 'protein' }], offerSpeed: 60 },
    { id: 'h12', until: { test: 'energyNormal', pause: true }, lines: TEXT.steps.h12, point: 'gauge:energy', gate: { kind: 'tap' }, notes: offNotes, offerSpeed: 60 },
    { id: 'h13', lines: TEXT.steps.h13, gate: { kind: 'tap' } },
    { id: 'h14', lines: TEXT.steps.h14, gate: { kind: 'tap' } },
  ];
  const ORDER = STEPS.map((s) => s.id);
  const from = (step, id) => step !== null && step !== undefined && ORDER.indexOf(step) >= ORDER.indexOf(id);
  const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // The off-detour solution's memory, per played watch (solutions are frozen with the definition).
  const detour = new WeakMap();

  const DEF = {
    id: 'P2', code: 'P2', order: -1, version: CONTENT, prologue: 2, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'guided', scored: false, los: ['LO1', 'LO3', 'LO7', 'LO9'], misconceptions: ['DNA_DIRECT', 'ENERGY_FIRST', 'CELL_DECIDES'],
    estMinutes: 6, engine: '1.1',
    phases: ['scenes', 'watch', 'complete'],

    variant() { return { seed: 0 }; },
    textVars() {
      return { atpPerGlucose: ECO.atpPerGlucose, atpPerAa: ECO.atpPerAa, trAa: comma(ECO.transporterAa), aa: comma(ECO.transporterAa),
        trAtp: comma(ECO.transporterAtp), trGlucose: comma(ECO.transporterGlucose) };
    },
    /** The watch cell (PROLOGUE §2.4.3): the 1.1 starting state with names shown and one gene in play, seeded from the device. */
    config(v, role, extra) {
      return {
        seed: K.seedFor((extra && extra.deviceSeed) >>> 0, 'prologue2'), strain: 'm1-lab', start: 'birth',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
        genes: { ptsG: { level: 'off', initial: { clear: true, protein: 0 } } },
        flags: { backupGlucoseUptake: true, userGenes: ['ptsG'] },
        variant: { levelId: 'P2', content: CONTENT, seed: 0 },
      };
    },
    /** Tier 1 (§5.3): pause, clock and speed; two big counters and the Off/On switch; the energy bar from H4 on. */
    labConfig(v, state) {
      const st = state || {}, step = st.step;
      return {
        showNames: true, genesVisible: ['ptsG'], controls: { genes: true, medium: false, drugs: false },
        mediumRows: { glucose: 'locked', lactose: 'locked', aminoAcids: 'locked' },
        speedOptions: [1, 10, 60], defaultSpeed: 10, startPaused: true, focusGene: 'ptsG', graphGenes: ['ptsG'], tabs: ['cell'], hud: false,
        ui: { tier: 1, status: { energy: from(step, 'h4') }, zoom: { levels: ['cell', 'gene', 'protein'], initial: 'cell' },
          focusBar: { counters: ['mRNA', 'protein'], control: 'onoff', onLevel: ON }, tabs: ['cell'], legend: 'short',
          // The steps say what the legend, the energy bar and the transporter counter show (H2, H4, H9); the copies counter gets its sentence after H7.
          introduce: from(step, 'h8') ? ['counter.mRNA'] : [] },
      };
    },

    scenes: [
      { id: 'q1', picture: 'sizes', lines: TEXT.scenes.q1 },
      { id: 'q2', picture: 'bactRibosomes', lines: TEXT.scenes.q2 },
      { id: 'q3', picture: 'bactDNA', lines: TEXT.scenes.q3 },
      { id: 'q4', picture: 'cotx', lines: TEXT.scenes.q4, about: 'q4' },
      { id: 'q5', picture: 'glucose', lines: TEXT.scenes.q5 },
      { id: 'q6', picture: 'lactose', lines: TEXT.scenes.q6 },
      { id: 'q7', picture: 'pairs', lines: TEXT.scenes.q7 },
      { id: 's0', picture: 'economy', step: 0, lines: TEXT.scenes.s0 },
      { id: 's1', picture: 'economy', step: 1, lines: TEXT.scenes.s1 },
      { id: 's2', picture: 'economy', step: 2, lines: TEXT.scenes.s2 },
      { id: 's3', picture: 'economy', step: 3, lines: TEXT.scenes.s3 },
      { id: 's4', picture: 'economy', step: 4, lines: TEXT.scenes.s4 },
      { id: 's5', picture: 'economy', step: 5, lines: TEXT.scenes.s5 },
      { id: 's6', picture: 'economy', step: 6, lines: TEXT.scenes.s6 },
      { id: 's7', picture: 'economy', step: 7, lines: TEXT.scenes.s7 },
      { id: 's8', picture: 'economy', step: 8, lines: TEXT.scenes.s8 },
    ],
    economy: ECO,
    watch: { gene: 'ptsG', onLevel: ON, steps: STEPS },

    predictions: [],
    debrief: [],
    flags: [
      { id: 'PRED_DNA_DIRECT', mc: 'DNA_DIRECT', guess: 'h5' },
      { id: 'PRED_ENERGY_FIRST', mc: 'ENERGY_FIRST', guess: ['e9', 'h5'] },
      { id: 'PRED_CELL_DECIDES', mc: 'CELL_DECIDES', guess: 'e9' },
    ],
    score(v, m, answers) {
      const g = answers.guesses || {};
      return { D: [['e9', 'h5'].filter((id) => g[id] && g[id].cause).length, 2], flags: [] };
    },
    echo: {
      screens: [],
      cards: [
        { id: 'no-nucleus', title: 'cards.noNucleus', stamp: 'bacteria' },
        { id: 'dna-loop', title: 'cards.loop', stamp: 'bacteria' },
        { id: 'read-while-made', title: 'cards.together', stamp: 'bacteria' },
        { id: 'atp', title: 'cards.atp', stamp: 'universal' },
      ],
    },
    story: { intro: [], outro: [] },
    narratorRules: [
      { key: 'lp2.trickle', template: TEXT.narr.trickle,
        when: (f) => (f.medium === 'glucose' || f.medium === 'both') && f.carbon === 'none' && f.glucoseImport !== 'normal' },
    ],
    solutions: {
      reference: { expect: { goal: true, flags: [] } },
      energyFirst: { watch: { guesses: { e9: 1 } }, expect: { goal: true, flags: ['PRED_ENERGY_FIRST'] } },
      dnaDirect: { watch: { guesses: { h5: 1 } }, expect: { goal: true, flags: ['PRED_DNA_DIRECT'] } },
      cellDecides: { watch: { guesses: { e9: 2, h5: 2 } }, expect: { goal: true, flags: ['PRED_ENERGY_FIRST', 'PRED_CELL_DECIDES'] } },
      // OP-4: the gene switched off while the copies are awaited, then on again; the step waits and carries on.
      offDetour: {
        watch: {
          every: 5,
          policy(view, tick, api, stepId) {
            const g = view.geneById.ptsG, m = detour.get(api) || {};
            detour.set(api, m);
            if (stepId === 'h9' && g.level !== 'off' && !m.off) { m.off = tick; api.command({ type: 'setPromoter', gene: 'ptsG', level: 'off' }); }
            else if (g.level === 'off' && m.off && tick >= m.off + 60 && !m.on) { m.on = tick; api.command({ type: 'setPromoter', gene: 'ptsG', level: ON }); }
          },
        },
        expect: { goal: true, flags: [] },
      },
    },
  };
  return DEF;
});
