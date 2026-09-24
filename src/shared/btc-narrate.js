// @deps
/*
 * Be the Cell: the narrator (LAB_UI §7, which is authoritative).
 *
 * One plain sentence about what the cell is doing now. The narrator reads
 * only BTC.observe.facts (schema 1.2: words, no numbers) and the event
 * stream; it never touches the cell. The first rule in the priority list
 * whose condition holds wins.
 *
 *   createMemory(opts)            opts: {phrases, showNames, dt}
 *   ingest(memory, events, tick)  records episode phases, the last commanded gene, divisions,
 *                                 energy episodes, when rifampicin went on and when each drug went off
 *   narrate(facts, memory, tick, levelRules?) → {key, text, gene}   (one reused object)
 *
 * Tone: dry and understated. Molecules never want, try, decide or know
 * anything; the text lint below enforces it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.narrate = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The one regex for teleology, shared with the UI content lint (LAB_UI §7.3).
  const TELEOLOGY = /\b(wants?|tries|trying|try to|decides?|chooses|knows|needs? to|in order to|so that|likes?|hungry|happy)\b/i;

  /**
   * Default phrases (LAB_UI §3.2). The app passes BTC.content.genes instead;
   * these keep the module usable and testable on its own.
   */
  const PHRASES = Object.freeze({
    ptsG: { genePhrase: 'the glucose transporter gene', noun: 'the glucose transporter', plural: false, slot: 0 },
    gly: { genePhrase: 'the glucose-processing genes', noun: 'the glucose-processing enzymes', plural: true, slot: 1 },
    aaSyn: { genePhrase: 'the amino-acid-making genes', noun: 'the amino-acid-making enzymes', plural: true, slot: 2 },
    aaImp: { genePhrase: 'the amino-acid importer genes', noun: 'the amino-acid importers', plural: true, slot: 3 },
    lacY: { genePhrase: 'the lactose permease gene', noun: 'the lactose permease', plural: false, slot: 4, name: 'LacY' },
    lacZ: { genePhrase: 'the β-galactosidase gene', noun: 'β-galactosidase', plural: false, slot: 5, name: 'LacZ' },
    fliC: { genePhrase: 'the flagellin gene', noun: 'flagellin', plural: false, slot: 6 },
  });
  const GENE_IDS = Object.freeze(Object.keys(PHRASES));
  const PREEMPT = ['1', '2', '3', '4', '5', '6', '6b', '6c', '7', '8', '9', '10', '10b', '11', '11b'];

  // Priority list (LAB_UI §7.2). Tokens: {G} gene phrase, {n}/{N} noun, {is} is/are, {its} its/their,
  // {it} it/them, {s} verb ending, {Y}/{Z} the LacY/LacZ names. A sentence's first letter is capitalised.
  // preempt: rules 1–11b may replace the line after 0.5 s instead of 1.5 s (NarratorHold).
  const RULES = Object.freeze([
    ['1', 'drug.both', 'Both drugs are on: no new mRNA is started, and ribosomes are stalled.'],
    ['2', 'drug.cm', 'Chloramphenicol stalls ribosomes; the mRNA is still here, but almost no protein is made.'],
    ['3', 'drug.rif.late', 'Under rifampicin the old mRNA is almost gone, so protein synthesis is winding down.'],
    ['4', 'drug.rif', 'Rifampicin blocks RNA polymerase; mRNA already made is read until it decays.'],
    ['5', 'drug.cm.low', 'Some ribosomes are stalled by chloramphenicol, so protein is made more slowly and growth slows.'],
    ['6', 'drug.rif.low', 'Rifampicin is slowing transcription, so less new mRNA is made.'],
    ['6b', 'drug.rif.off', 'Rifampicin is gone, so RNA polymerase starts new mRNA again and protein synthesis picks up.'],
    ['6c', 'drug.cm.off', 'Chloramphenicol is gone, so ribosomes run again on the mRNA that is left and growth picks up.'],
    ['7', 'starve.nosugar', 'There is no sugar in the medium, so no new ATP is made and every machine that uses ATP slows to a stop.'],
    ['8', 'starve.dormant', 'With no ATP, no new transporters can be made, so no sugar gets in and nothing restarts.'],
    ['9', 'starve.noimport', 'Glucose is outside, but without transporters in the membrane none of it gets in.'],
    ['10', 'starve.fewimport', 'Too little glucose is getting in, so ATP is low and growth has slowed.'],
    ['10b', 'starve.noenzyme', '{N} {is} too scarce to break down glucose quickly, so ATP is low and growth slows.'],
    ['11', 'recover', 'Sugar is getting in through transporters that were already there, and ATP is coming back.'],
    ['11b', 'gene.noatp', '{G} {is} switched on, but with almost no ATP nothing is transcribed.'],
    ['12', 'lac.noY', 'Lactose is outside, but without {Y} it does not get in.'],
    ['13', 'lac.noZ', 'Lactose gets in, but without {Z} it is not split.'],
    ['13b', 'lac.toofew', 'Lactose gets in through only a few {Y} and {Z}, so ATP stays low and growth has paused.'],
    ['14', 'aa.low', 'Amino acids are running short, so ribosomes are moving more slowly.'],
    ['15', 'divided', 'The cell divided; this daughter received about half of everything.'],
    ['16a', 'gene.waiting', '{G} {is} switched on; RNA polymerase has not started on {it} yet.'],
    ['16b', 'gene.tx', '{G} {is} being transcribed; no protein yet.'],
    ['16c', 'gene.rising', '{N} {is} accumulating; each mRNA is read by many ribosomes before it decays.'],
    ['16d', 'gene.up', '{G} {is} transcribed more often now, so {its} protein climbs to a higher level.'],
    ['16e', 'gene.down', '{G} {is} transcribed less often now; {its} protein is diluted as the cell grows.'],
    ['16f', 'gene.leftover', 'Transcription of {G} has stopped, but {its} mRNA is still being translated.'],
    ['16g', 'gene.gone', 'The mRNA for {n} is gone; the protein remains and is shared out at each division.'],
    ['17a', 'burden.lac', 'With no lactose here, {n} does no work, and making it slows growth over a few generations.'],
    ['17b', 'burden', 'Ribosomes busy with {n} are not making other proteins, so growth slows over a few generations.'],
    ['18', 'growth.aa', 'Amino acids come in from the medium, so fewer have to be made inside and the cell grows faster.'],
    ['19', 'growth.lactose', 'The cell is growing on lactose, which {Z} splits into glucose and galactose.'],
    ['19b', 'growth.both', 'The cell is growing steadily on glucose and lactose.'],
    ['20', 'growth.low', 'Glucose is scarce, so growth is slow.'],
    ['21', 'growth.arrested', 'Growth has stopped.'],
    ['21b', 'growth.slow', 'Growth is slower than usual.'],
    ['22', 'growth.normal', 'The cell is growing steadily on glucose.'],
  ].map(([n, key, template], i) => Object.freeze({
    n, key, template, order: i,
    preempt: PREEMPT.indexOf(n) >= 0,                  // rules 1 … 11b
    perGene: /\{(G|n|N|is|its|it|s)\}/.test(template),
  })));
  const RULE = {};
  RULES.forEach((r) => { RULE[r.key] = r; });

  // Phase durations in simulated seconds (LAB_UI §7.1).
  const RISING_S = 600, UPDOWN_S = 1200, RECOVER_S = 300, RIF_LATE_S = 600, DRUG_OFF_S = 600;

  function createMemory(opts) {
    const o = opts || {};
    return {
      phrases: o.phrases || PHRASES,
      showNames: o.showNames !== false,
      dt: o.dt || 1,
      gene: null,               // last commanded gene
      phase: null,              // 'waiting' | 'transcribing' | 'rising' | 'up' | 'down' | 'leftover' | 'gone' | null
      phaseTick: 0,
      goneDivisions: 0,
      dormant: false,
      sawEnergyLow: false,
      recoverTick: null,
      rifOnTick: null,
      rifOffTick: null,         // when each drug last went from on to off
      cmOffTick: null,
      cache: {},
      out: { key: '', text: '', gene: null },
    };
  }

  const LETTERS = 'ABCDEFGHIJKLMNOP';

  /**
   * The words for gene id: named, or "gene A"/"protein A" by display slot when names are hidden.
   * A phrase marked open (a background gene, or one revealed in level 1.1) keeps its name.
   */
  function wordsFor(memory, id) {
    const ph = memory.phrases[id] || PHRASES[id];
    if (memory.showNames || ph.open) return ph;
    const letter = LETTERS[ph.slot !== undefined ? ph.slot : (PHRASES[id] ? PHRASES[id].slot : 0)];
    return { genePhrase: 'gene ' + letter, noun: 'protein ' + letter, plural: false, name: 'protein ' + letter };
  }

  function expand(template, memory, gene) {
    const w = gene ? wordsFor(memory, gene) : null;
    const y = wordsFor(memory, 'lacY'), z = wordsFor(memory, 'lacZ');
    const s = template.replace(/\{(G|n|N|is|its|it|s|Y|Z)\}/g, (m, t) => {
      switch (t) {
        case 'G': return w.genePhrase;
        case 'n': case 'N': return w.noun;
        case 'is': return w.plural ? 'are' : 'is';
        case 'its': return w.plural ? 'their' : 'its';
        case 'it': return w.plural ? 'them' : 'it';
        case 's': return w.plural ? '' : 's';
        case 'Y': return y.name || 'LacY';
        case 'Z': return z.name || 'LacZ';
      }
      return m;
    });
    // Capitalise the first letter (a sentence may start with a phrase such as "the flagellin gene").
    const c = s.charCodeAt(0);
    return c >= 97 && c <= 122 ? String.fromCharCode(c - 32) + s.slice(1) : s;
  }

  // Reading a setPromoter command's resolved form: level 'off', a multiplier, or null with a rate override.
  const isOnValue = (r) => !!r && r.level !== 'off' && (r.level !== null || r.rate_perS > 0);
  const strength = (r) => (r.level === null ? r.rate_perS : r.level);

  function setPhase(memory, phase, tick) {
    memory.phase = phase;
    memory.phaseTick = tick;
    memory.goneDivisions = 0;
  }

  /** Feeds the events of the last frame (any order within a tick is as the engine emitted it). */
  function ingest(memory, events, tick) {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.type) {
        case 'command_applied': commandApplied(memory, ev); break;
        case 'tx_start':
          if (ev.gene === memory.gene && memory.phase === 'waiting') setPhase(memory, 'transcribing', ev.tick);
          break;
        case 'first_protein':
          if (ev.gene === memory.gene && (memory.phase === 'waiting' || memory.phase === 'transcribing')) setPhase(memory, 'rising', ev.tick);
          break;
        case 'mrna_gone':
          if (ev.gene === memory.gene && memory.phase === 'leftover') setPhase(memory, 'gone', ev.tick);
          break;
        case 'division':
          if (memory.phase === 'gone') memory.goneDivisions++;
          break;
        case 'energy_low': memory.sawEnergyLow = true; break;
        case 'energy_ok':
        case 'revived':
          if (memory.sawEnergyLow) { memory.recoverTick = ev.tick; memory.sawEnergyLow = false; }
          if (ev.type === 'revived') memory.dormant = false;
          break;
        case 'dormant': memory.dormant = true; break;
      }
    }
    return memory;
  }

  function commandApplied(memory, ev) {
    const a = ev.args || {}, prev = ev.prev, res = ev.resolved;
    if (ev.cmdType === 'setDrug') {
      if (a.drug === 'rifampicin') {
        const was = prev && prev.dose > 0.5, now = res && res.dose > 0.5;
        if (now && !was) memory.rifOnTick = ev.tick;
        if (!now) memory.rifOnTick = null;
      }
      const wasOn = !!prev && prev.dose > 0, isOn = !!res && res.dose > 0;
      const offTick = wasOn && !isOn ? ev.tick : null;
      if (a.drug === 'rifampicin' && (offTick !== null || isOn)) memory.rifOffTick = offTick;
      if (a.drug === 'chloramphenicol' && (offTick !== null || isOn)) memory.cmOffTick = offTick;
      return;
    }
    if (typeof a.gene !== 'string') return;              // not a gene command
    const sameGene = a.gene === memory.gene;
    memory.gene = a.gene;
    if (ev.cmdType === 'setPromoter') {
      const was = isOnValue(prev), now = isOnValue(res);
      if (!was && now) return setPhase(memory, 'waiting', ev.tick);
      if (was && !now) return setPhase(memory, 'leftover', ev.tick);
      if (was && now && strength(res) !== strength(prev)) return setPhase(memory, strength(res) > strength(prev) ? 'up' : 'down', ev.tick);
    } else if (ev.cmdType === 'setKnockout' && res && res.knockout && !(prev && prev.knockout)) {
      return setPhase(memory, 'leftover', ev.tick);
    }
    if (!sameGene) setPhase(memory, null, ev.tick);
  }

  /** Ends phases whose time is up (LAB_UI §7.1). */
  function expirePhase(memory, tick) {
    const age = (tick - memory.phaseTick) * memory.dt;
    if ((memory.phase === 'rising' && age >= RISING_S) ||
        ((memory.phase === 'up' || memory.phase === 'down') && age >= UPDOWN_S) ||
        (memory.phase === 'gone' && memory.goneDivisions >= 2)) memory.phase = null;
  }

  const GENE_PHASE_KEY = {
    waiting: 'gene.waiting', transcribing: 'gene.tx', rising: 'gene.rising', up: 'gene.up', down: 'gene.down',
    leftover: 'gene.leftover', gone: 'gene.gone',
  };

  /** The winning rule for these facts: {key, gene}. */
  function choose(f, memory, tick, out) {
    const dt = memory.dt;
    expirePhase(memory, tick);
    const pick = (key, gene) => { out.key = key; out.gene = gene || null; return out; };
    const rif = f.drug.rif, cm = f.drug.cm;
    // With no ATP, a chloramphenicol line would be false (no mRNA is left); the true cause below wins instead.
    const cmSays = f.energy !== 'none';
    if (rif === 'full' && memory.rifOnTick === null) memory.rifOnTick = tick;    // switched on in the config, or before memory existed
    if (rif === 'full' && cm === 'full' && cmSays) return pick('drug.both');
    if (cm === 'full' && cmSays) return pick('drug.cm');
    if (rif === 'full') return pick((tick - memory.rifOnTick) * dt >= RIF_LATE_S ? 'drug.rif.late' : 'drug.rif');
    if (cm === 'low' && cmSays) return pick('drug.cm.low');
    if (rif === 'low') return pick('drug.rif.low');
    if (cm === 'off' && rif === 'off' && f.energy !== 'none' && f.medium !== 'none') {
      const r = memory.rifOffTick, c = memory.cmOffTick;
      const rOk = r !== null && (tick - r) * dt <= DRUG_OFF_S, cOk = c !== null && (tick - c) * dt <= DRUG_OFF_S;
      if (rOk && (!cOk || r > c)) return pick('drug.rif.off');
      if (cOk) return pick('drug.cm.off');
    }
    const glucoseOutside = f.medium === 'glucose' || f.medium === 'both';
    if (f.medium === 'none' && f.energy !== 'normal') return pick('starve.nosugar');
    if (glucoseOutside && f.carbon === 'none' && f.glucoseImport !== 'normal') return pick(memory.dormant ? 'starve.dormant' : 'starve.noimport');
    if (f.glucoseLevel === 'high' && (f.carbon === 'glucose' || f.carbon === 'both') && f.energy !== 'normal') {
      return f.glucoseStep === 'enzymes' ? pick('starve.noenzyme', 'gly') : pick('starve.fewimport');
    }
    if (memory.recoverTick !== null && (tick - memory.recoverTick) * dt <= RECOVER_S) return pick('recover');
    if (memory.gene !== null && memory.phase === 'waiting' && f.energy === 'none') return pick('gene.noatp', memory.gene);
    if (f.lactoseBlock === 'no-lacY' && f.medium === 'lactose') return pick('lac.noY');
    if (f.lactoseBlock === 'no-lacZ') return pick('lac.noZ');
    // Engine 1.1: a cell with a few lac proteins pauses on lactose alone (ATP low, not gone) until it has made more.
    if (f.medium === 'lactose' && f.lactoseBlock === null && f.energy !== 'normal' && f.growth === 'arrested') return pick('lac.toofew');
    if (f.aa === 'low') return pick('aa.low');
    if (f.justDivided) return pick('divided');
    if (memory.gene !== null && memory.phase !== null) return pick(GENE_PHASE_KEY[memory.phase], memory.gene);
    if (f.uselessGene === 'lacZ' || f.uselessGene === 'lacY') return pick('burden.lac', f.uselessGene);
    if (f.uselessGene !== null) return pick('burden', f.uselessGene);
    if (f.aaOutside && f.aaImportOn && f.growth === 'normal') return pick('growth.aa');
    if (f.carbon === 'lactose' && f.growth !== 'arrested') return pick('growth.lactose');
    if (f.carbon === 'both' && f.growth === 'normal') return pick('growth.both');
    if (f.glucoseLevel === 'low' && f.growth === 'slow') return pick('growth.low');
    if (f.growth === 'arrested') return pick('growth.arrested');
    if (f.growth === 'slow') return pick('growth.slow');
    return pick('growth.normal');
  }

  /**
   * The sentence for these facts. levelRules (optional, for levels) are
   * {key, when(facts, memory, tick), template, gene?} and are tried before rule 1.
   */
  function narrate(facts, memory, tick, levelRules) {
    const out = memory.out;
    let template = null;
    if (levelRules) {
      for (let i = 0; i < levelRules.length; i++) {
        const r = levelRules[i];
        if (r.when(facts, memory, tick)) { out.key = r.key; out.gene = r.gene || null; template = r.template; break; }
      }
    }
    if (template === null) {
      choose(facts, memory, tick, out);
      template = RULE[out.key].template;
    }
    const ck = out.key + '|' + (out.gene || '');
    let text = memory.cache[ck];
    if (text === undefined) text = memory.cache[ck] = expand(template, memory, out.gene);
    out.text = text;
    return out;
  }

  /** Problems with one narrator sentence (LAB_UI §7.3); [] when it passes. */
  function lint(text) {
    const problems = [];
    if (text.length > 140) problems.push('longer than 140 characters');
    if (/[0-9]/.test(text)) problems.push('contains a digit');
    if (text.indexOf('!') >= 0) problems.push('contains an exclamation mark');
    if (TELEOLOGY.test(text)) problems.push('teleology: ' + TELEOLOGY.exec(text)[0]);
    // One sentence: ends with a full stop, and no other sentence end inside.
    if (!/\.$/.test(text) || /[.?!]\s/.test(text) || /[?]/.test(text)) problems.push('not exactly one sentence');
    const c = text.charCodeAt(0);
    if (c >= 97 && c <= 122) problems.push('starts with a lower-case letter');
    return problems;
  }

  /** Every rule's sentence, expanded for every gene in named and hidden modes (for the lint). */
  function expandAll(phrases) {
    const out = [];
    for (const showNames of [true, false]) {
      const memory = createMemory({ phrases, showNames });
      for (const r of RULES) {
        if (r.perGene) for (const id of GENE_IDS) out.push({ key: r.key, gene: id, showNames, text: expand(r.template, memory, id) });
        else out.push({ key: r.key, gene: null, showNames, text: expand(r.template, memory, null) });
      }
    }
    return out;
  }

  return { TELEOLOGY, PHRASES, GENE_IDS, RULES, createMemory, ingest, narrate, expand, lint, expandAll };
});
