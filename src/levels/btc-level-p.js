// @deps btc-level-kit btc-misconceptions btc-seq btc-seqdata
/*
 * Be the Cell: Prologue 1, "How a gene becomes a machine" (docs/PROLOGUE.md §2.3, §2.8.1). Not scored.
 *
 * A zoom ladder from the student to the letters of their own insulin gene (rungs A0–A9, each drawn to
 * its scale bar; the spools rung A6 is skipped, §14 decision 6), then the gene's start (B1), the copy
 * made letter by letter (C1–C5: the student places the first six letters), the copy leaving the
 * nucleus (D1–D3: a guess, then "copy again"), a ribosome reading it three letters at a time (E1–E4:
 * the student decodes the first two codons), the chain folding and the job of a glucose transporter in
 * a muscle cell (F1–F7: a guess). Every letter, copy, codon and chain comes from BTC.seq over the
 * human insulin sequence in BTC.seqdata.INS (NM_000207.3, P01308); nothing here is typed by hand.
 *
 * Guesses are logged, never marked (flags only); the code carries G1, ENA, PNA and in D how many of
 * the two guesses were first picked on the explained cause. Every student-facing string is in TEXT
 * (linted, LEVELS §12.1 L-2). The drawings are btc-prologue.js (rungs) and btc-seqscene.js (letters,
 * copies, codons, folding, machines).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/btc-level-kit.js'), require('../game/btc-misconceptions.js'),
      require('../shared/btc-seq.js'), require('../shared/btc-seqdata.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {})).P = factory(B.levelKit, B.misconceptions, B.seq, B.seqdata);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, SEQ, SD) {
  'use strict';
  void MC;

  // Content version (LEVELS §3.2): 2, the teaching-first opening replaces the old five drawings and one question.
  const CONTENT = 2;
  const INS = SD.INS;
  const RNA = SEQ.transcribe(INS.mRNA);
  const START = SEQ.firstStart(RNA);
  const TR = SEQ.translate(RNA);
  // The first six letters of the copy, and the template letters across from them (PROLOGUE §2.2: AGCCCU across TCGGGA).
  const TEMPLATE6 = SEQ.complement(INS.mRNA.slice(0, 6));
  const COPY6 = TEMPLATE6.split('').map(SEQ.rnaPartner).join('');
  const FIRST_CODONS = SEQ.codons(RNA, START).slice(0, 2);
  // The small code table of E3: six codons, their amino acids from the standard code.
  const TABLE_CODONS = ['AUG', 'GCC', 'CUG', 'UGG', 'GGC', 'UAG'];
  const ROWS = TABLE_CODONS.map((codon) => {
    const aa = SEQ.CODE[codon];
    return { codon, aa, three: SEQ.AA[aa].three, name: SEQ.AA[aa].name, start: codon === 'AUG', stop: aa === '*' };
  });

  const TEXT = {
    title: 'How a gene becomes a machine',
    challenge: 'From you to the letters of your insulin gene, then to a working machine.',
    // The rungs of the zoom ladder (PROLOGUE §2.3.1): rail names, scale bars and labels on the drawings.
    rungs: {
      you: 'You', pancreas: 'Pancreas', islet: 'Islet', betaCell: 'Beta cell', nucleus: 'Nucleus', chromosome: 'Chromosome',
      stretch: 'DNA', helix: 'Helix', letters: 'Letters',
    },
    scale: {
      you: '50 cm', pancreas: '5 cm', islet: '50 µm', betaCell: '5 µm', nucleus: '1 µm', chromosome: '500 nm',
      stretch: '1,000 letters (340 nm)', helix: '2 nm', letters: '1 nm', ribosome: '10 nm', cell: '5 µm',
    },
    labels: {
      pancreas: 'pancreas', stomach: 'stomach', cluster: 'one cluster of cells', clusterNote: 'too small to see here',
      betaCells: 'beta cells', otherCells: 'other cells', nucleus: 'nucleus', packets: 'insulin packets',
      envelope: 'nucleus envelope', pore: 'pore', chr11: 'chromosome 11', geneHere: 'insulin gene',
      insulinGene: 'insulin gene', otherGenes: 'other genes', start: 'start', end: 'end', tooSmall: 'letters too small to show',
      strand: 'one strand', otherStrand: 'the other strand', pair: 'a pair',
      genesLetters: 'the gene’s letters', copy: 'the copy (mRNA)', rnap: 'RNA polymerase',
      ribosome: 'ribosome', mRNA: 'mRNA', codon: 'codon', chain: 'chain', thisCodon: 'this codon',
      dotsEnlarged: 'dots enlarged', drawnSmaller: 'machine drawn smaller than scale', lettersLarger: 'letters drawn larger than scale',
      realSpeed: 'shown at about real speed', flat: 'shape drawn flat and simplified',
      outside: 'outside the cell', membrane: 'membrane', oily: 'oily middle', inside: 'inside the cell', glucose: 'glucose',
      lactose: 'a bigger sugar', blood: 'blood', insulin: 'insulin', muscle: 'muscle cell', transporters: 'glucose transporters',
      aChain: 'A chain', bChain: 'B chain', cutAway: 'cut away', links: 'links',
      copied: 'letters copied {k} of {n}', copies: 'copies made {n}', aminoAcids: 'amino acids {c} of {n}',
      copyDone: 'the finished copy: {n} letters', geneStays: 'the gene stays',
      pocket: 'pocket', notFit: 'does not fit', pictureOnly: 'picture, not a model',
      fourRibosomes: 'four ribosomes on one copy', fold: 'the chain folds',
    },
    alt: {
      you: 'A person, about 1.7 metres tall, with the pancreas marked by a ring.',
      pancreas: 'The pancreas beside the stomach, with a ring around one cluster of cells.',
      islet: 'A slice through one cluster of about 150 cells; the beta cells are tinted.',
      betaCell: 'One beta cell with its nucleus and many small insulin packets.',
      nucleus: 'The nucleus with pores in its envelope and its chromosomes; chromosome 11 is tinted.',
      chromosome: 'Chromosome 11 as a loose tangle of thread; the insulin gene is marked near one end.',
      stretch: 'A stretch of DNA drawn straight, with genes as bands; the insulin gene is coloured.',
      helix: 'The DNA double helix: two strands twisted around each other, joined by pairs.',
      letters: 'The two strands untwisted into a ladder of letters.',
      start: 'The gene’s letters with the start of the insulin instructions boxed.',
      tx: 'RNA polymerase copying the gene letter by letter.',
      txDone: 'The finished copy beside the gene.',
      nucleusCopy: 'The nucleus with the finished copy near a pore.',
      export: 'The copy leaving the nucleus through a pore.',
      copies: 'The gene being copied again and again.',
      tl: 'A ribosome reading the copy three letters at a time, the chain growing.',
      polysome: 'Several ribosomes reading the same copy.',
      fold: 'The chain folding up on itself.',
      cut: 'Insulin: two short chains held together by links, with the pieces cut away beside them.',
      muscle: 'Insulin reaching a muscle cell, whose membrane gains glucose transporters.',
      membrane: 'A patch of membrane with glucose outside.',
      machine: 'A glucose transporter carrying glucose across the membrane.',
      bounce: 'A bigger sugar bumping into the transporter and bouncing off.',
      cards: 'Three machine cards: a transporter, an enzyme and insulin.',
    },
    ui: {
      closer: 'Closer', back: 'Back', rail: 'Zoom levels: {name}', railTitle: 'Zoom levels', notYet: 'not visited yet',
      ringLabel: 'Look closer', tapLetter: 'Tap a letter to see its partner.', pairs: '{a} pairs with {b}.',
      keys: 'Letter keys', letterKey: 'Letter {x}', runCopy: 'Let it run', copyAgain: 'Copy again', runRead: 'Let it run',
      fullTable: 'Full table', tableTitle: 'The genetic code', tableNote: 'Every group of three letters and the amino acid it stands for.',
      startWord: 'start', stopWord: 'stop', thisCodon: 'This codon: {codon}',
      fillCount: '{i} of {n} letters placed', fillDone: 'Six letters placed. Now let the machine copy the rest.',
      running: 'Copying…', reading: 'Reading…', readDone: 'Both codons read. Now let the ribosome read the rest.',
      copiesHint: 'Each tap starts one more copy.',
      simplified: 'What is simplified', simplifiedTitle: 'What is simplified', next: 'Next: Prologue 2',
    },
    // The one-line disclosure under the finished copy (PROLOGUE §2.2, §2.6 item 2).
    introns: 'Your insulin gene is longer than the copy shown: two stretches are copied, then cut out before the mRNA leaves the nucleus (chapter 2).',
    // The "What is simplified" sheet (§2.6), one plain line each.
    simplified: [
      'The drawings of your body, pancreas and cells are to their scale bars, but simplified.',
      'Your insulin gene is longer than the copy shown: two stretches are copied, then cut out before the mRNA leaves the nucleus (chapter 2).',
      'A real mRNA also gets a cap at its front and a long tail of A’s at its back.',
      'Insulin’s ribosomes sit on a membrane network next to the nucleus. The chain’s first 24 amino acids lead them there.',
      'Protein shapes are drawn flat. Real proteins are three-dimensional; the fit between pocket and molecule is real.',
      'The copying and reading run at about the speed they do in your cells.',
      'The bacterium you run is a lab strain: each of its genes has its own switch.',
    ],
    scenes: {
      a0: [
        { who: 'narrator', text: 'This is you. Some of your cells are making a protein called insulin right now.' },
        { who: 'commander', text: 'Good. Who gives the order to make it?' },
        { who: 'narrator', text: 'Watch, and see who does.' },
      ],
      a1: [{ who: 'narrator', text: 'This is your pancreas, about as long as your hand. The ring marks one tiny cluster of cells.' }],
      a2: [{ who: 'narrator', text: 'A slice through that cluster. After a meal, its beta cells release insulin into your blood.' }],
      a3: [{ who: 'narrator', text: 'One beta cell. Each small dot is a packet of insulin, ready to be released.' }],
      a4: [{ who: 'narrator', text: 'The nucleus holds the cell’s DNA, split into 46 long threads called chromosomes.' }],
      a5: [{ who: 'narrator', text: 'This is chromosome 11. In a cell that is not dividing, it is a loose tangle, not the X shape seen in pictures.' }],
      a7: [{ who: 'narrator', text: 'Along the DNA are genes. The coloured stretch is the insulin gene, one of about 20,000 genes in your DNA.' }],
      a8: [{ who: 'narrator', text: 'DNA is two strands twisted around each other.' }],
      a9: [
        { who: 'narrator', text: 'Each strand is a chain of four building blocks, written A, C, G and T.' },
        { who: 'narrator', text: 'Across the two strands, A always pairs with T, and C with G.' },
      ],
      b1: [
        { who: 'narrator', text: 'A gene is a stretch of these letters. The instructions for the insulin chain start here, at ATG.' },
        { who: 'commander', text: 'So the gene is the instructions. Now it goes and makes the insulin.' },
      ],
      c1: [{ who: 'narrator', text: 'Not directly. To use a gene, the cell first makes a copy of it.' }],
      c2: [{ who: 'narrator', text: 'A machine opens the two strands and builds the copy one letter at a time, matching the letters of one strand.' }],
      c3: [{ who: 'narrator', text: 'The copy pairs letters the same way, with one change: across from an A in the DNA, the copy has U, not T.' }],
      c4: [{ who: 'narrator', text: 'Fill in the copy. Which letter goes across from each DNA letter?' }],
      c5: [{ who: 'narrator', text: 'The machine is called RNA polymerase. The copy is called messenger RNA, or mRNA.' }],
      d1: [{ who: 'commander', text: 'The copy is done. Surely the gene goes out with it now.' }],
      d2: [{ who: 'narrator', text: 'The mRNA leaves through a pore in the nucleus. The gene stays inside and can be copied again.' }],
      d3: [{ who: 'narrator', text: 'Tap to copy the gene again.' }],
      d3b: [{ who: 'narrator', text: 'One gene can give many copies, and each copy can be read many times.' }],
      e1: [
        { who: 'narrator', text: 'Out in the cell, a machine called a ribosome reads the mRNA three letters at a time.' },
        { who: 'ribosome', text: 'I read whatever mRNA reaches me, three letters at a time. I have never once made a decision.' },
      ],
      e2: [{ who: 'narrator', text: 'Each group of three letters, a codon, stands for one amino acid. Amino acids are the building blocks of a protein.' }],
      e3: [{ who: 'narrator', text: 'Which amino acid does this codon stand for?' }],
      e3end: [{ who: 'narrator', text: 'UAG means stop. The chain is finished: 110 amino acids, in the order the gene spelled out.' }],
      e4: [{ who: 'narrator', text: 'Several ribosomes can read the same mRNA at once, each a little further along.' }],
      f1: [{ who: 'narrator', text: 'The chain folds up on itself.' }],
      f2: [{ who: 'narrator', text: 'Two pieces are cut away. What is left is insulin: two short chains held together.' }],
      f3: [{ who: 'narrator', text: 'Insulin travels in your blood. In your muscles, it leads cells to put more glucose transporters into their membranes.' }],
      f4: [{ who: 'commander', text: 'Glucose is right there. Just let it in.' }],
      f5: [{ who: 'narrator', text: 'This protein sits across the membrane. Glucose fits its pocket, the protein changes shape, and the glucose comes out inside.' }],
      f6: [{ who: 'narrator', text: 'A bigger sugar does not fit this pocket, so it does not get through. A protein that carries things across a membrane is a transporter.' }],
      f7: [
        { who: 'narrator', text: 'Every protein is made this way, from its gene, including the transporters that let glucose into your cells.' },
        { who: 'commander', text: 'I watched the whole thing. Nobody gave an order.' },
        { who: 'narrator', text: 'No. A gene was copied, the copy was read, and the chain folded. Each step happened because molecules bumped together and fit.' },
        { who: 'narrator', text: 'Next, a cell you can run yourself.' },
      ],
    },
    // The letter fill (§2.3.3): nothing is marked wrong; the right letter always goes in.
    fill: {
      noT: 'The copy has no T. Across from A, it puts U.',
      other: 'Across from {dna}, the copy puts {rna}.',
    },
    // The codon decode (§2.3.5).
    decode: { wrong: 'Find {codon} in the left column: it stands for {three} ({name}).' },
    // Guess D1 (§2.3.4) and guess F4 (§2.3.6): "What happened" for every option, never right or wrong.
    d1: {
      prompt: 'The copy is finished. What happens to the gene now?',
      options: [
        { t: 'It stays in the nucleus, and can be copied again.', cause: true,
          fb: 'The gene stayed put. Only the mRNA copy left, and the same gene can be copied again and again.' },
        { t: 'It leaves the nucleus with the copy.', mc: 'DNA_DIRECT',
          fb: 'The gene stayed put. Only the mRNA copy left, through a pore in the nucleus.' },
        { t: 'It is used up by the copying.', mc: 'DNA_DIRECT',
          fb: 'Copying left the gene as it was. The same gene can be copied again and again.' },
        { t: 'It becomes part of the protein.', mc: 'DNA_DIRECT',
          fb: 'The gene is never built into anything. Ribosomes read the mRNA copy, not the gene.' },
      ],
    },
    f4g: {
      prompt: 'Glucose is outside this membrane. Can it get through on its own?',
      options: [
        { t: 'No, not on its own.', cause: true, fb: 'The membrane’s oily middle keeps glucose out. It crosses only through a protein that it fits.' },
        { t: 'Yes, it slips through.', mc: 'MEMBRANE_OPEN', fb: 'It stayed outside. The membrane’s oily middle keeps glucose out unless a protein it fits lets it through.' },
        { t: 'Only when the cell wants it to.', mc: 'CELL_DECIDES', fb: 'Nothing here lets it in on purpose. Glucose crosses only where a protein it fits sits in the membrane.' },
      ],
    },
    // F7's machine cards (§4.3): what each does first, then its name.
    cardsF7: {
      transporter: { job: 'Carries glucose across the membrane.', name: 'Glucose transporter', where: 'Works in the membrane' },
      enzyme: { job: 'Breaks sugar down, making ATP.', name: 'Sugar-splitting enzyme', where: 'Works inside the cell' },
      insulin: { job: 'A signal in your blood: muscle cells put in more transporters.', name: 'Insulin', where: 'Travels in the blood' },
    },
    cards: { gene: 'Gene', mRNA: 'mRNA', ribosome: 'Ribosome', code: 'Genetic code' },
  };

  const copyAct = { kind: 'copy', template: TEMPLATE6, expect: COPY6, total: INS.mRNA.length, rate: 30, words: TEXT.fill };
  const copiesAct = { kind: 'copies', n: 3, total: INS.mRNA.length, rate: 30 };
  const readAct = { kind: 'read', codons: FIRST_CODONS, rows: ROWS, total: TR.codons.length, rate: 5, start: START, words: TEXT.decode };

  const scenes = [
    { id: 'a0', rung: 'you', lines: TEXT.scenes.a0 },
    { id: 'a1', rung: 'pancreas', lines: TEXT.scenes.a1 },
    { id: 'a2', rung: 'islet', lines: TEXT.scenes.a2 },
    { id: 'a3', rung: 'betaCell', lines: TEXT.scenes.a3 },
    { id: 'a4', rung: 'nucleus', lines: TEXT.scenes.a4 },
    { id: 'a5', rung: 'chromosome', lines: TEXT.scenes.a5 },
    { id: 'a7', rung: 'stretch', lines: TEXT.scenes.a7 },
    { id: 'a8', rung: 'helix', lines: TEXT.scenes.a8 },
    { id: 'a9', rung: 'letters', lines: TEXT.scenes.a9, explore: true },
    { id: 'b1', picture: 'start', lines: TEXT.scenes.b1 },
    { id: 'c1', picture: 'tx', tx: 'closed', lines: TEXT.scenes.c1 },
    { id: 'c2', picture: 'tx', tx: 'arrive', lines: TEXT.scenes.c2 },
    { id: 'c3', picture: 'tx', tx: 'open', lines: TEXT.scenes.c3 },
    { id: 'c4', picture: 'tx', tx: 'fill', lines: TEXT.scenes.c4, activity: copyAct },
    { id: 'c5', picture: 'txDone', lines: TEXT.scenes.c5, note: 'introns' },
    { id: 'd1', picture: 'nucleusCopy', lines: TEXT.scenes.d1, guess: Object.assign({ id: 'd1', showAt: 'd2' }, TEXT.d1) },
    { id: 'd2', picture: 'export', lines: TEXT.scenes.d2, activity: { kind: 'show', total: 1.2 } },
    { id: 'd3', picture: 'copies', lines: TEXT.scenes.d3, activity: copiesAct },
    { id: 'd3b', picture: 'copies', lines: TEXT.scenes.d3b },
    { id: 'e1', picture: 'tl', tl: 'arrive', lines: TEXT.scenes.e1 },
    { id: 'e2', picture: 'tl', tl: 'frames', lines: TEXT.scenes.e2 },
    { id: 'e3', picture: 'tl', tl: 'read', lines: TEXT.scenes.e3, activity: readAct },
    { id: 'e3end', picture: 'tl', tl: 'done', lines: TEXT.scenes.e3end },
    { id: 'e4', picture: 'polysome', lines: TEXT.scenes.e4 },
    { id: 'f1', picture: 'fold', lines: TEXT.scenes.f1 },
    { id: 'f2', picture: 'cut', lines: TEXT.scenes.f2 },
    { id: 'f3', picture: 'muscle', lines: TEXT.scenes.f3 },
    { id: 'f4', picture: 'membrane', lines: TEXT.scenes.f4, guess: Object.assign({ id: 'f4', showAt: 'f5' }, TEXT.f4g) },
    { id: 'f5', picture: 'machine', lines: TEXT.scenes.f5 },
    { id: 'f6', picture: 'bounce', lines: TEXT.scenes.f6 },
    { id: 'f7', picture: 'cards', lines: TEXT.scenes.f7 },
  ];

  const DEF = {
    id: 'P', code: 'P0', order: -2, version: CONTENT, prologue: 1, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'guided', scored: false, los: ['LO1', 'LO5', 'LO7'], misconceptions: ['DNA_DIRECT', 'MEMBRANE_OPEN', 'CELL_DECIDES'],
    estMinutes: 7, engine: '1.1',
    phases: ['scenes', 'complete'],

    /** No variant: every student sees the same opening, and its code carries 000000. */
    variant() { return { seed: 0 }; },
    /** Part 1 runs no cell (its pictures are drawings and exact sequence scenes); a config is kept for the registry. */
    config(v, role, extra) {
      return {
        seed: K.seedFor((extra && extra.deviceSeed) >>> 0, 'prologue'), strain: 'm1-lab', start: 'steady',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 }, variant: { levelId: 'P', content: CONTENT, seed: 0 },
      };
    },
    labConfig() {
      return { showNames: true, controls: { genes: false, medium: false, drugs: false }, tabs: ['cell'], focusGene: 'ptsG',
        speedOptions: null, defaultSpeed: 60, startPaused: true, hud: false };
    },

    scenes,
    /** The exact sequence model's facts the scenes show (tests SQ-5 and OP-1 read them; the drawings compute their own). */
    facts: { template6: TEMPLATE6, copy6: COPY6, firstCodons: FIRST_CODONS, start: START, aminoAcids: TR.protein.length, codonsRead: TR.codons.length },

    predictions: [],
    debrief: [],
    // Flags from guesses (PROLOGUE §2.7): the first (and only) pick of a guess on an option with the flag's misconception.
    flags: [
      { id: 'PRED_DNA_DIRECT', mc: 'DNA_DIRECT', guess: 'd1' },
      { id: 'PRED_MEMBRANE_OPEN', mc: 'MEMBRANE_OPEN', guess: 'f4' },
      { id: 'PRED_CELL_DECIDES', mc: 'CELL_DECIDES', guess: 'f4' },
    ],
    /** Not scored: D reports how many of the two guesses were picked on the explained cause (§2.1, "guesses (not scored)"). */
    score(v, m, answers) {
      const g = answers.guesses || {};
      return { D: [['d1', 'f4'].filter((id) => g[id] && g[id].cause).length, 2], flags: [] };
    },
    echo: {
      screens: [],
      cards: [
        { id: 'gene', title: 'cards.gene', stamp: 'universal' },
        { id: 'mrna', title: 'cards.mRNA', stamp: 'universal' },
        { id: 'ribosome', title: 'cards.ribosome', stamp: 'universal' },
        { id: 'genetic-code', title: 'cards.code', stamp: 'universal' },
      ],
    },
    story: { intro: [], outro: [] },
    narratorRules: [],
    solutions: {
      reference: { expect: { goal: true, flags: [] } },
      dnaDirect: { watch: { guesses: { d1: 1 } }, expect: { goal: true, flags: ['PRED_DNA_DIRECT'] } },
      membraneOpen: { watch: { guesses: { f4: 1, d1: 3 } }, activities: { c4: { picks: ['A', 'G', 'C', 'C', 'C', 'T'] }, e3: { rows: [5, 2] } },
        expect: { goal: true, flags: ['PRED_DNA_DIRECT', 'PRED_MEMBRANE_OPEN'] } },
      cellDecides: { watch: { guesses: { f4: 2 } }, expect: { goal: true, flags: ['PRED_CELL_DECIDES'] } },
    },
  };
  return DEF;
});
