// @deps
/*
 * Be the Cell: every student-facing string in the lab (LAB_UI §3.2, §4, §6, §7, §2.9).
 *
 * Data only. Panels read their words from here, so a level can hide names or
 * swap text without code changes, and one lint (tests/ui-content.test.js)
 * checks all of it: at most 140 characters, no exclamation marks, and no
 * teleology (molecules never want, try, decide or know anything). The
 * narrator's own sentence templates live in src/shared/btc-narrate.js; the
 * gene phrases they need are here.
 *
 * Templates use {name} placeholders filled by BTC.format.fill.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.content = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Gene table (LAB_UI §3.2). `short` is the protein name the narrator uses for {Y}/{Z}.
  const genes = {
    ptsG: {
      slot: 0, name: 'Glucose transporter', symbol: 'ptsG', plural: false,
      job: 'Carries glucose across the membrane.',
      about: 'One PtsG carries about 80 glucose per second. It sits in the inner membrane.',
      genePhrase: 'the glucose transporter gene', noun: 'the glucose transporter', protein: 'glucose transporter',
    },
    gly: {
      slot: 1, name: 'Glucose-processing enzymes', symbol: 'gapA et al.', plural: true,
      job: 'Break glucose down, making ATP.',
      about: 'Stands for about 10 glycolysis enzymes, drawn as one. Each glucose broken down here gives 2 ATP.',
      genePhrase: 'the glucose-processing genes', noun: 'the glucose-processing enzymes', protein: 'glucose-processing enzyme',
    },
    aaSyn: {
      slot: 2, name: 'Amino-acid-making enzymes', symbol: '(many)', plural: true,
      job: 'Build amino acids from sugar.',
      about: 'Stands for about 100 genes. Making amino acids from sugar costs carbon and ATP.',
      genePhrase: 'the amino-acid-making genes', noun: 'the amino-acid-making enzymes', protein: 'amino-acid-making enzyme',
    },
    aaImp: {
      slot: 3, name: 'Amino-acid importers', symbol: '(several)', plural: true,
      job: 'Bring amino acids in from the medium.',
      about: 'Stands for about 10 transporters in the membrane. With no amino acids outside they carry nothing.',
      genePhrase: 'the amino-acid importer genes', noun: 'the amino-acid importers', protein: 'amino-acid importer',
    },
    lacY: {
      slot: 4, name: 'Lactose permease', symbol: 'lacY', plural: false, short: 'LacY',
      job: 'Carries lactose across the membrane.',
      about: 'LacY sits in the membrane and moves lactose in using the proton gradient.',
      genePhrase: 'the lactose permease gene', noun: 'the lactose permease', protein: 'lactose permease',
    },
    lacZ: {
      slot: 5, name: 'β-galactosidase', symbol: 'lacZ', plural: false, short: 'LacZ',
      job: 'Splits lactose into glucose and galactose.',
      about: 'Four LacZ chains join into one working enzyme, drawn as a four-lobed cluster.',
      genePhrase: 'the β-galactosidase gene', noun: 'β-galactosidase', protein: 'β-galactosidase',
    },
    fliC: {
      slot: 6, name: 'Flagellin', symbol: 'fliC', plural: false,
      job: 'Flagellum building block; does no work here.',
      about: 'Many flagellin molecules form the flagellum a cell swims with; the other flagellum genes are missing here, so it stays inside.',
      genePhrase: 'the flagellin gene', noun: 'flagellin', protein: 'flagellin',
    },
    // Strain m2-l11 (level 1.1): the decoy, a transporter whose sugar is never present.
    araE: {
      slot: 7, name: 'Arabinose transporter', symbol: 'araE', plural: false,
      job: 'Carries arabinose across the membrane.',
      about: 'AraE sits in the membrane and carries arabinose in with a proton. There is no arabinose here, so it carries nothing.',
      genePhrase: 'the arabinose transporter gene', noun: 'the arabinose transporter', protein: 'arabinose transporter',
    },
    // Strain m2-lac (level 1.7): the repressor and the third gene of the lac operon.
    lacI: {
      slot: 7, name: 'Lac repressor', symbol: 'lacI', plural: false, short: 'LacI',
      job: 'Blocks the lac genes unless allolactose binds it.',
      about: 'Four LacI chains form one repressor, drawn as a V. With allolactose bound it lets go of the operator.',
      genePhrase: 'the repressor gene', noun: 'the lac repressor', protein: 'lac repressor',
    },
    lacA: {
      slot: 8, name: 'Galactoside acetyltransferase', symbol: 'lacA', plural: false, short: 'LacA',
      job: 'Third lac gene; does no work that matters here.',
      about: 'LacA adds acetyl groups to some sugars. Three chains form one enzyme, drawn as a three-lobed cluster.',
      genePhrase: 'the acetyltransferase gene', noun: 'the acetyltransferase', protein: 'acetyltransferase',
    },
  };
  const GENE_IDS = ['ptsG', 'gly', 'aaSyn', 'aaImp', 'lacY', 'lacZ', 'fliC'];
  // Every gene any strain has (the lab strain's seven, then araE, lacI and lacA).
  const ALL_GENE_IDS = GENE_IDS.concat(['araE', 'lacI', 'lacA']);
  // The short tag on graph chips and line labels is the gene's id (LAB_UI §1.5).
  for (const id of ALL_GENE_IDS) genes[id].tag = id;
  const LETTERS = 'ABCDEFGHIJKLMNOP';
  const DISPLAY_COLORS = ['g-ptsG', 'g-gly', 'g-aaSyn', 'g-aaImp', 'g-lacY', 'g-lacZ', 'g-fliC', 'g-lacI', 'g-lacA'];

  /**
   * The phrase table the narrator reads (BTC.narrate.createMemory({phrases})). With a gene model
   * (a level's display order) each gene's letter follows its display position, and genes the
   * student may see named (background genes, genes revealed in 1.1) are marked open.
   */
  function narratorPhrases(model) {
    const out = {};
    for (const id of ALL_GENE_IDS) {
      const g = genes[id];
      out[id] = { genePhrase: g.genePhrase, noun: g.noun, plural: g.plural, slot: g.slot };
      if (g.short) out[id].name = g.short;
      if (model) {
        const k = model.index(id);
        if (k >= 0) out[id].slot = k;
        if (model.named(id)) out[id].open = true;
      }
    }
    return out;
  }

  /**
   * Display words for a gene, honouring labConfig.showNames (hidden: "Gene A", job "Unknown").
   * letter: the gene's display letter (hidden-name levels letter genes by display position).
   */
  function geneWords(id, showNames, letter) {
    const g = genes[id];
    if (showNames !== false) return g;
    const L = letter || LETTERS[g.slot];
    return { slot: g.slot, name: 'Gene ' + L, symbol: '', tag: L, plural: false, job: 'Unknown', about: '',
      genePhrase: 'gene ' + L, noun: 'protein ' + L, protein: 'protein ' + L, letter: L };
  }

  /**
   * How a screen shows the cell's genes (LEVELS §5.5.1; pure, test L-13): ids is the cell's gene
   * list (slot order), lc the screen's labConfig. Visible genes come in display order, then the
   * background genes; letters, colours (labConfig.colorBy 'display': colour k to position k)
   * and chromosome positions follow that order. A revealed gene keeps its display colour and
   * letter and gains its real name.
   *   {ids, visible, order, index(id), isVisible(id), letter(id), color(id) (a palette token),
   *    named(id), revealed(id), words(id), locusFrac(id), tuOf}
   */
  function geneModel(ids, lc) {
    const c = lc || {};
    const gv = c.genesVisible;
    const vis = gv === 'all' || !Array.isArray(gv) ? ids.slice() : ids.filter((id) => gv.indexOf(id) >= 0);
    const disp = Array.isArray(c.displayOrder) ? c.displayOrder.filter((id) => vis.indexOf(id) >= 0) : [];
    const visible = disp.concat(vis.filter((id) => disp.indexOf(id) < 0));
    const order = visible.concat(ids.filter((id) => visible.indexOf(id) < 0));
    const at = {};
    visible.forEach((id, k) => { at[id] = k; });
    const hidden = c.showNames === false, byDisplay = c.colorBy === 'display', rev = c.revealed || {};
    const index = (id) => (at[id] === undefined ? -1 : at[id]);
    const letter = (id) => (index(id) >= 0 ? LETTERS[index(id)] : '');
    const named = (id) => !hidden || index(id) < 0 || !!rev[id];
    // Loci sit at (k + 0.5)/n along the loop in this order; n is at least 8, so the lab strain keeps its M1 spacing.
    const n = Math.max(8, order.length);
    return {
      ids: ids.slice(), visible, order, index, letter, named, hidden,
      isVisible: (id) => index(id) >= 0,
      revealed: (id) => hidden && index(id) >= 0 && !!rev[id],
      color: (id) => (index(id) < 0 ? 'muted' : byDisplay ? DISPLAY_COLORS[index(id) % DISPLAY_COLORS.length] : 'g-' + id),
      words: (id) => geneWords(id, named(id), letter(id)),
      locusFrac: (id) => (order.indexOf(id) + 0.5) / n,
    };
  }

  return {
    genes, GENE_IDS, ALL_GENE_IDS, LETTERS, narratorPhrases, geneWords, geneModel,

    app: {
      title: 'Be the Cell',
      tagline: 'A bacterium you run by switching its genes on and off.',
    },

    tabs: { cell: 'Cell', genes: 'Genes', medium: 'Medium', graphs: 'Graphs' },

    // Status strip (LAB_UI §6).
    status: {
      play: 'Run', pause: 'Pause', paused: 'Paused', running: 'Running',
      playLabel: 'Run the simulation', pauseLabel: 'Pause the simulation',
      generation: 'generation {n}', generationShort: 'gen {n}', tPrefix: 't = ',
      atp: 'ATP', atpWords: { normal: 'normal', low: 'low', depleted: 'very low' },
      atpLabel: 'ATP charge {word}. Open the ATP graph.',
      doubling: 'doubling ≈ {t}', doublingRecent: 'doubling ≈ {t} (recent)', notGrowing: 'not growing',
      measuring: 'doubling: measuring…', growthLabel: 'Growth: {text}. Open the growth graph.',
      deviceLimit: 'device limit: {label}',
      speedLabel: 'Speed {label}, {gloss}. Change speed.',
    },

    // Speed sheet (LAB_UI §6): sim seconds per real second.
    speeds: [
      { s: 1, label: '1 s = 1 s', gloss: 'real time', short: 'real time' },
      { s: 10, label: '1 s = 10 s', gloss: '10× faster', short: '10× real time' },
      { s: 60, label: '1 s = 1 min', gloss: '60× faster', short: '60× real time' },
      { s: 600, label: '1 s = 10 min', gloss: '600× faster', short: '600× real time' },
      { s: 3600, label: '1 s = 1 h', gloss: '3,600× faster (max)', short: '3,600× real time' },
    ],
    speedSheet: { title: 'Speed', note: 'Simulated time per real second. Speed is how fast you watch, not how fast the cell lives.' },

    // Cell view (LAB_UI §2).
    cell: {
      canvasLabel: '{sentence} Focus gene {name}: mRNA {m}, being made {n}, protein {p}.',
      pausedBadge: 'Paused', pendingNote: 'Changes apply when time runs.',
      drugBadge: { rifampicin: 'Rifampicin on', chloramphenicol: 'Chloramphenicol on' },
      scaleBar: '1 µm · width ×2',
      outsideScale: 'outside: 1 dot = {N}',
    },
    focus: {
      counts: 'mRNA {m} + {n} being made', protein: 'protein {p}',
      change: 'Change', pickerTitle: 'Choose a gene to watch',
      pickerNote: 'The chosen gene is drawn in full: its mRNA as long strands, with its ribosomes on them.',
      buttonLabel: 'Watching {name}. Choose another gene.',
      promoterLabel: 'Promoter strength for {name}',
    },
    legend: {
      full: '1 dot = {P} proteins · {R} ribosomes · {A} ATP · 1 mRNA',
      short: '1 dot = {P} proteins · …',
      key: 'Key',
      buttonLabel: 'Legend: {text}. Open the key.',
    },
    // Tap-to-identify chips (LAB_UI §2.8).
    chip: {
      protein: '{name} · 1 dot = {N}',
      proteinHollow: '{name} · fewer than half a dot ({N})',
      mRNA: 'mRNA for {noun} · molecule #{id}',
      nascent: 'mRNA for {noun}, being made',
      rnap: 'RNA polymerase making mRNA for {noun}',
      locus: 'Gene: {name}',
      ribosome: 'Ribosome (making protein) · 1 dot = {N}',
      ribosomeFree: 'Ribosome (free) · 1 dot = {N}',
      ribosomeStalled: 'Ribosome (stalled) · 1 dot = {N}',
      polysome: 'Ribosome on {noun} mRNA · 1 dot = {N}',
      atp: 'ATP · 1 dot = {N}',
      adp: 'ADP (spent ATP) · 1 dot = {N}',
      aa: 'Amino acids · 1 dot = {N}',
      lacIn: 'Lactose inside · 1 dot = {N}',
      glcOut: 'Glucose outside · 1 dot = {N}',
      lacOut: 'Lactose outside · 1 dot = {N}',
      aaOut: 'Amino acids outside · 1 dot = {N}',
      membrane: 'Membrane',
      dna: 'DNA (the chromosome)',
      // The lac operon (level 1.7).
      tuMRNA: 'mRNA of {names}, one molecule for all three · #{id}',
      repressor: 'Lac repressor LacI, four chains · 1 dot = 1',
      repressorInducer: 'Lac repressor with allolactose bound · 1 dot = 1',
      repressorBound: 'Lac repressor sitting on the operator',
      operator: 'Operator: the stretch of DNA that LacI binds',
    },
    // Key sheet (LAB_UI §2.9).
    key: {
      title: 'Key',
      glyphs: {
        protein: '{name} protein', proteinFocus: 'ring: protein of the gene you are watching',
        background: 'grey: other proteins, not studied here',
        mRNAFocus: 'mRNA of the gene you are watching (long strand)', mRNA: 'mRNA of other genes (short mark)',
        nascent: 'mRNA being made, with RNA polymerase (ring)', rib: 'ribosome making protein',
        ribFree: 'free ribosome', ribStalled: 'stalled ribosome', polysome: 'ribosome on the watched mRNA',
        atp: 'ATP', adp: 'ADP (spent ATP)', aa: 'amino acids', lacIn: 'lactose inside',
        glcOut: 'glucose outside', lacOut: 'lactose outside', aaOut: 'amino acids outside',
        hollow: 'hollow dot: fewer than half a dot\'s worth',
        fluxGlc: 'glucose coming in', fluxLac: 'lactose coming in', fluxAa: 'amino acids coming in',
        fluxOut: 'acids and ethanol out',
        fluxCut: '{name} cut up by proteases (proteases are not drawn)',
        repressor: 'lac repressor LacI (four chains)', repressorInducer: 'LacI with allolactose bound (dot in the V)',
        operator: 'operator on the DNA (LacI sits here while bound)', tuMRNA: 'lac mRNA: one strand, three genes in their colours',
        notDrawn: 'allolactose and cAMP are not drawn; the lac region panel shows where they act',
      },
      perDot: '1 dot = {N}',
      perMarker: 'each marker = {N}',
      notes: [
        'The chosen gene\'s mRNA is drawn as long strands; other genes\' mRNA as short marks, one per molecule.',
        'Outside molecules: 1 dot = 1,000,000; outside counted in a 1 µm-deep slab of the visible medium.',
        'Length to scale; width drawn twice as wide so the inside is readable.',
        'mRNA drawn coiled, not to scale.',
        'The grey stipple is the rest of the proteome (the other ~4,000 genes\' proteins), not counted.',
        'Glucose from PtsG arrives already tagged (as glucose-6-phosphate) and goes straight to the enzymes, so free glucose is not drawn.',
        'Hollow dot: fewer than half a dot\'s worth.',
        'Moving markers show traffic across the membrane; each one lasts 0.6 s on screen.',
        'The pinch in the middle is drawn from cell size; the model has no septum.',
        '"Being made" counts mRNA still being transcribed.',
      ],
    },

    // Gene cards (LAB_UI §3).
    card: {
      standsFor: 'stands for ~{n} genes',
      counts: 'mRNA {m} + {n} being made', protein: 'protein {p}',
      share: 'ribosome share', shareLabel: 'Share of working ribosomes reading this gene\'s mRNA',
      about: 'About', aboutClose: 'Less',
      promoter: 'promoter strength', pending: 'Applies when time runs.',
      defaultTick: 'default', header: 'Genes', strain: 'lab strain', strains: { 'm2-l11': 'six unlabelled genes', 'm2-lac': 'lac genes' },
      focusLabel: 'Watch {name} in the cell view',
      locked: 'Set by this level.', readOnly: 'Set by the DNA.',
      revealed: 'Named after what its protein did.', operon: 'One mRNA for {names}',
    },
    // The lac region panel on the cell view (level 1.7): the design's parts and what sits on them now.
    lacRegion: {
      title: 'lac region, enlarged', lacI: 'lacI', noLacI: 'no lacI', crp: 'CRP site', noCrp: 'no CRP site', promoter: 'promoter',
      operator: 'operator', noOperator: 'no operator', genes: 'lacZ lacY lacA', repressor: 'LacI', crpBound: 'CRP–cAMP',
      label: 'The lac region: {parts}.', bound: 'LacI is on the operator', free: 'the operator is free', none: 'there is no operator',
      crpOn: 'CRP with cAMP is on the CRP site', crpOff: 'the CRP site is empty', noSite: 'there is no CRP site',
    },
    levels: [
      { key: 'off', label: 'Off', value: 'off' },
      { key: '0.25', label: '¼', value: 0.25 },
      { key: '0.5', label: '½', value: 0.5 },
      { key: '1', label: '1', value: 1 },
      { key: '2', label: '2', value: 2 },
      { key: '4', label: '4', value: 4 },
    ],
    levelSpoken: { off: 'off', 0.25: 'one quarter', 0.5: 'one half', 1: 'times one', 2: 'times two', 4: 'times four' },
    geneState: {
      'off': 'off', 'waiting': 'switched on', 'transcribing': 'making mRNA', 'stalled': 'stalled',
      'leftover-mRNA': 'off · mRNA left', 'protein-only': 'off · some protein', 'knocked-out': 'removed',
    },

    // Medium and drugs (LAB_UI §4).
    medium: {
      title: 'Medium', titleNote: '(never runs out)',
      rows: {
        glucose: { label: 'Glucose', desc: 'Low: transporters are only partly filled, so less sugar gets in.',
          options: [{ key: 'none', label: 'None' }, { key: 'low', label: 'Low' }, { key: 'high', label: 'High' }] },
        lactose: { label: 'Lactose', desc: '',
          options: [{ key: 'none', label: 'None' }, { key: 'present', label: 'Present' }] },
        aminoAcids: { label: 'Amino acids', desc: '',
          options: [{ key: 'none', label: 'None' }, { key: 'present', label: 'Present' }] },
      },
      footer: 'The medium never runs out and waste does not build up. No oxygen, as in the gut.',
    },
    drugs: {
      title: 'Drugs', titleNote: '',
      rows: {
        rifampicin: { label: 'Rifampicin-type',
          desc: 'Blocks RNA polymerase: no new mRNA is started. mRNA already made is still read.' },
        chloramphenicol: { label: 'Chloramphenicol-type',
          desc: 'Stalls ribosomes: protein is not made, but the mRNA stays.' },
      },
      options: [{ key: 'off', label: 'Off' }, { key: 'low', label: 'Low' }, { key: 'full', label: 'Full' }],
      footer: 'Drugs act instantly here; there is no uptake and no resistance.',
    },
    actions: {
      startOver: 'Start over…', about: 'About this cell', download: 'Download this run',
      build: 'build {build} · seed {seed}',
    },

    // Graphs (LAB_UI §5).
    graphs: {
      plots: {
        mRNA: 'mRNA (molecules)', protein: 'Protein (molecules)', atp: 'ATP (mM)',
        size: 'Cell size (fL)', growth: 'Growth (doublings per hour)', spending: 'ATP spending now',
      },
      window: 'Window', windows: [
        { s: 600, label: '10 min' }, { s: 3600, label: '1 h' }, { s: 21600, label: '6 h' }, { s: 0, label: 'All' },
      ],
      lin: 'lin', log: 'log', simTime: 'sim time', low: 'low',
      sizeOrGrowth: [{ key: 'size', label: 'Size' }, { key: 'growth', label: 'Growth' }],
      genesLabel: 'Genes to plot (up to 3)',
      spendingEmpty: 'Nothing measured yet: run the cell for a moment.',
      spendingNone: 'Almost no ATP is being made or spent.',
      atpBelow: '< 0.01 mM',
      ledger: {
        translation: 'making protein', otherBuilding: 'other building', upkeep: 'upkeep',
        transcription: 'making RNA', aaMaking: 'making amino acids', transport: 'transport',
      },
      marker: {
        promoter: '{symbol} {level}', glucose: 'glucose {v}', lactose: 'lactose {v}', aminoAcids: 'amino acids {v}',
        drug: '{drug} {v}', resumed: 'resumed', locked: 'controls locked', unlocked: 'controls free',
        bandLabel: { rifampicin: 'rif', chloramphenicol: 'Cm' },
      },
      markerLevels: { off: 'off', 0.25: '×¼', 0.5: '×½', 1: '×1', 2: '×2', 4: '×4' },
      close: 'Close', enlargeLabel: 'Enlarge the {title} graph',
    },

    // Sheets (LAB_UI §4.3–4.5).
    sheets: {
      close: 'Close',
      startOver: {
        title: 'Start over',
        same: 'Same cell again', sameNote: 'Same randomness: the run repeats exactly if you do the same things.',
        fresh: 'New cell', freshNote: 'Different random events; the averages come out the same.',
        cancel: 'Keep this cell',
      },
      about: {
        title: 'About this cell',
        whyHeading: 'Why a bacterium',
        why: 'A bacterium is the simplest cell that does it all; your own cells also copy genes into mRNA and read it with ribosomes.',
        lactoseHeading: 'Lactose',
        lactose: 'Switch LacY and LacZ on while glucose is still there, then remove glucose: the cell pauses, then grows on lactose.',
        lactoseLag: 'More LacY and LacZ at the switch, a shorter pause: about 2 h after ×1 for 3 min, a few minutes after ×4 for 15 min.',
        lactoseRestart: 'Switched on after glucose is gone, they are never made: no sugar gets in, so ATP runs down. Adding glucose back restarts the cell.',
        heading: 'What is simplified',
        more: 'Full details are in the instructor notes.',
        theme: 'Theme', themes: [{ key: 'system', label: 'System' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }],
        motion: 'Reduce motion', motions: [{ key: 'auto', label: 'Auto' }, { key: 'on', label: 'On' }, { key: 'off', label: 'Off' }],
        version: 'Build {build}, engine {engine}.',
      },
    },
    // Short forms of engine spec §18 items 1–21.
    about: [
      'Each gene here has its own switch, and you set it; real cells switch genes with regulator proteins that sense conditions.',
      'Real E. coli keeps its lac genes nearly off while glucose is present; here you control them.',
      '"Off" still leaks a little, so a switched-off gene makes a few proteins.',
      'This strain has no second glucose transporter.',
      'Some genes stand for many: glucose processing for about 10, amino-acid making for about 100.',
      'The rest of the proteome is lumped into three groups with simple rules.',
      'No oxygen, 37 °C; the medium never runs out and waste does not build up.',
      'One energy charge stands for ATP, GTP and the proton gradient; each glucose gives 2 ATP.',
      'Without sugar, ribosomes and upkeep slow down as in real cells, but ATP still falls lower here; real cells also draw on stored reserves.',
      'Amino acids are one pool, standing in for charged tRNA.',
      'Ribosomes assemble instantly, and RNA polymerase is never in short supply.',
      'Drugs act instantly, with no uptake and no resistance; otherwise each acts as rifampicin or chloramphenicol does.',
      'Every mRNA has the same half-life, about 3 minutes.',
      'mRNA is counted molecule by molecule; protein numbers are averages.',
      'Cells add a fixed 1 fL per cycle, and only one daughter is followed.',
      'Lactose gives glucose and galactose; the enzymes that use galactose are assumed present.',
      'Flagellin stays inside the cell; no flagellum is built.',
      'Nothing dies in the free lab: a cell can stop growing but not die.',
      'The cost of useless protein comes only from ribosomes being busy.',
      'Protein is not broken down in this lab; it is shared out at each division.',
    ],

    rejections: {
      'unknown-type': 'That change is not available here.',
      'unknown-gene': 'That gene is not in this cell.',
      'bad-value': 'That value is not allowed.',
      'locked': 'This gene cannot be changed in this level.',
      'not-available': 'That is not available in this lab.',
      'tick-in-past': 'That change came too late to apply.',
    },

    pwa: {
      update: 'An update is ready. Reload (your current cell restarts)',
      reload: 'Reload', dismiss: 'Not now', offline: 'Ready to work offline.',
      resumed: 'Resumed your last cell.', resumedAction: 'Start over',
      error: 'Something went wrong. Start over, or reload the page.',
      shareTitle: 'Be the Cell run',
    },

    // Home and level select (LEVELS §5.1).
    home: {
      title: 'Be the Cell',
      tagline: 'You are in charge of a cell. In principle.',
      continueRow: 'Continue: {title}',
      levelName: '{id} · {title}', prologueName: 'Prologue · {title}',
      status: { fresh: 'new', open: 'in progress', done: 'done', doneTotal: 'done · {total}', expert: 'Expert ✓' },
      minutes: 'about {n} min',
      listLabel: 'Levels, in the recommended order; any level can be played at any time.',
      lab: 'Free-play lab', labNote: 'One bacterium, every control, no goal.',
      codes: 'My codes', cards: 'Cards {n}', about: 'About',
      privacy: 'Your progress stays on this device.',
      exportData: 'Export my data',
      codesTitle: 'My codes', codesFirst: 'First attempt', codesLatest: 'Latest',
      codesNone: 'No codes yet. Each level you finish gives one.', copy: 'Copy', copied: 'Copied.',
      codesNote: 'Paste a code into its Canvas quiz. The first attempt counts separately.',
      cardsTitle: 'Cards', cardsNote: 'Collected from "Meanwhile, in you". Each says whether your own cells share it.',
      cardsEmpty: 'No cards yet. Finish a level to collect its cards.',
      aboutTitle: 'About Be the Cell',
      aboutText: [
        'Every level gives the same kind of cell a goal. The only lever is which genes are expressed.',
        'Predictions come before the run, and questions after it. Wrong answers get their own explanation.',
        'Nothing leaves this device unless you send a file: a run file, or "Export my data".',
      ],
      exportTitle: 'Be the Cell data',
    },

    // Level screens (LEVELS §5.2–5.9).
    game: {
      levels: 'Levels', levelsLabel: 'Back to the level list',
      leaveTitle: 'Leave this level?', leaveText: 'Leave this level? It is saved, and you can come back to it.',
      leave: 'Leave', stay: 'Stay',
      resumed: 'Resumed level {id}.', updated: 'The app was updated; this level starts again.',
      missing: 'That level is not in this version of the app.',
      speakers: { narrator: 'Narrator', commander: 'You', ribosome: 'The Ribosome', laci: 'LacI', protease: 'A protease', glucose: 'A glucose molecule' },
      next: 'Next', continue: 'Continue', skipStory: 'Skip story',
      lineOf: 'Line {i} of {n}',
      task: {
        goal: 'Goal', core: 'Core', expert: 'Expert (required for majors)', time: 'About {n} minutes', start: 'Start',
        back: 'Back to the cell', menu: 'This level', restart: 'Start this level again', replay: 'Replay the story',
        download: 'Download this run', restartText: 'The level starts again from its story, with the same cell and the same variant.',
        restartConfirm: 'Start again', replayTitle: 'The story so far',
      },
      predict: {
        title: 'Predict', itemOf: 'Prediction {i} of {n}', lockIn: 'Lock in', skipExpert: 'Skip (Expert)', expert: 'Expert',
        note: 'Your answer is locked in; you see how it went after the run.', less: 'Less', more: 'More',
        numberLabel: 'Your estimate', clamped: 'Allowed: {min} to {max}.',
        sketchNote: 'Done locks your sketch in; the test run comes next.',
      },
      // The finger-drawn sketch (LEVELS §5.4.3).
      sketch: {
        canvasLabel: 'Drawing area for the LacY count from minute 0 to minute 20. Draw with a finger or the mouse, or use the sliders.',
        chartLabel: 'Your sketch, dashed, over the LacY count of the test run, solid.',
        start: 'Draw one line from left to right with your finger.',
        whole: 'Draw across the whole graph.',
        ready: 'Drawn from start to end. Redraw any part, or tap Done.',
        useSliders: 'Use sliders instead', useDrawing: 'Draw instead',
        atMinute: 'minute {t}', less: 'Less at minute {t}', more: 'More at minute {t}',
        clear: 'Clear', done: 'Done', sketch: 'your sketch', cell: 'the cell',
        right: 'matched', wrong: 'did not match',
      },
      demo: { continue: 'Continue to your run' },
      debrief: { title: 'Debrief', questionOf: 'Question {i} of {n}', notQuite: 'Not quite', right: 'Right.' },
      question: { title: 'A question' },
      result: {
        title: 'Result', met: 'Goal met', notMet: 'Goal not met: {reason}',
        reasons: { limit: 'time ran out', deadline: 'not reached by the deadline', done: 'the run ended', goal: 'the goal was not held' },
        efficiency: 'Efficiency', withinPar: 'within par', overPar: 'over par', parMark: 'par',
        predictions: 'Your predictions', predicted: 'You predicted: {option}', happened: 'What happened: {fb}',
        skipped: 'Skipped (Expert).', estimate: 'Your estimate: {v}', estimateRight: 'Within range of what the cell did.',
        estimateWrong: 'Outside the range of what the cell did.',
        tryAgain: 'Try again', withoutGoal: 'Continue without the goal', continue: 'Continue',
        tryAgainNote: 'Try again gives the same cell a fresh start; your predictions stay as they are.',
      },
      echo: { heading: 'Meanwhile, in you', cardsHeading: 'Cards collected', universal: 'Universal', bacteria: 'Bacteria-only' },
      complete: {
        title: 'Level complete',
        goalMet: 'Goal met', goalNotMet: 'Goal not met', efficiency: 'Efficiency {v}', prediction: 'Prediction {v}',
        debrief: 'Debrief {a} of {b} right first time', expert: 'Expert {v}', expertOf: 'Expert {a} of {b}', total: 'Total {v}', notScored: 'Not scored',
        codeLabel: 'Completion code', copy: 'Copy code', share: 'Share', copied: 'Copied. Paste it into the Canvas quiz.',
        copyFailed: 'Press and hold the code to copy it.', keep: 'Paste your code into Canvas now; this device may not keep it.',
        download: 'Download this run', again: 'Play again', next: 'Next level', startNamed: 'Start level {id}', levels: 'Levels',
        shareTitle: 'Be the Cell code', cardsCollected: 'Cards collected: {list}',
      },
      hud: {
        goalMet: 'Goal met · Continue', continue: 'Continue', taskLabel: 'Goal: {text}. Open the task card.',
        running: 'To the end · {pct}%', stop: 'Stop', runningLabel: 'Running to the end, {pct}%. Tap to stop.',
      },
      reveal: 'Gene {letter} is now named: {name}.',
      table: {
        note: 'Set every cell of the three strains; the fourth is Expert and may be left.', expert: 'Expert',
        choose: 'Choose for {row}, {col}', differs: 'differs from normal',
      },
      design: {
        change: 'Change', close: 'Done', current: 'now: {v}', parts: 'Parts of the DNA', runNote: 'The design is fixed once it runs.',
      },
      designSummary: { present: 'present', absent: 'absent', normal: 'normal', deleted: 'deleted', blind: 'cannot bind allolactose', strong: 'strong (Iq)' },
      run: { ended: 'The run is over.' },
    },
  };
});
