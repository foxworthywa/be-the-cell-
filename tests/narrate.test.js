// The narrator (LAB_UI §7; engine spec c-1 = LAB_UI U-3 and U-4).
//
// U-3: every sentence template, expanded for every gene with names shown and
// hidden, is one sentence of at most 140 characters with no digits, no
// exclamation mark and no teleology.
// U-4: every rule is reached by a scripted engine run (fixed seed, commands at
// exact ticks), and across the runs every value of every facts field occurs.
// Key sequences are asserted, not text.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const { BTC, Cell, PV, HOUR, mergeConfig } = H;
const N = BTC.narrate, OBS = BTC.observe;

// ---------------------------------------------------------------------------
// U-3: text lint
// ---------------------------------------------------------------------------
test('c-1 / U-3: every narrator sentence, for every gene, named and hidden, passes the text rules', (t) => {
  const all = N.expandAll();
  const bad = [];
  let longest = '';
  for (const s of all) {
    const problems = N.lint(s.text);
    if (problems.length) bad.push(`${s.key}/${s.gene}/${s.showNames ? 'named' : 'hidden'}: "${s.text}" (${problems.join('; ')})`);
    if (s.text.length > longest.length) longest = s.text;
  }
  t.diagnostic(`${all.length} expansions; longest ${longest.length} characters: "${longest}"`);
  // Soft check (LAB_UI §7.4): lines over 110 characters may need three lines on a 360 px phone.
  const over = [...new Set(all.filter((s) => s.text.length > 110).map((s) => `${s.key}/${s.gene} (${s.text.length})`))];
  t.diagnostic(`over 110 characters: ${over.length ? over.join(', ') : 'none'}`);
  assert.deepEqual(bad, []);
  // Each rule has a unique key; 36 rules: 1–22 with 6b–c, 10b, 11b, 13b, 16a–g, 17a–b, 19b and 21b.
  assert.equal(N.RULES.length, 36);
  assert.equal(new Set(N.RULES.map((r) => r.key)).size, 36);
  assert.deepEqual(N.RULES.filter((r) => r.preempt).map((r) => r.n), ['1', '2', '3', '4', '5', '6', '6b', '6c', '7', '8', '9', '10', '10b', '11', '11b']);
});

test('c-1 / U-3: the lint catches what it must (negative controls), and the LAB_UI examples render exactly', () => {
  assert.ok(N.lint('The ribosome wants to make protein.').length > 0);
  assert.ok(N.lint('LacY tries to import lactose.').length > 0);
  assert.ok(N.lint('The cell needs to grow.').length > 0);
  assert.ok(N.lint('Ribosomes are made so that the cell grows.').length > 0);
  assert.ok(N.lint('There are 12 ribosomes.').length > 0);
  assert.ok(N.lint('Growth has stopped!').length > 0);
  assert.ok(N.lint('Growth has stopped. ATP is gone.').length > 0);
  assert.ok(N.lint('x'.repeat(141) + '.').length > 0);
  assert.deepEqual(N.lint('Growth has stopped.'), []);
  const m = N.createMemory(), hidden = N.createMemory({ showNames: false });
  const say = (key, gene, mem) => N.expand(N.RULES.find((r) => r.key === key).template, mem || m, gene);
  assert.equal(say('gene.tx', 'fliC'), 'The flagellin gene is being transcribed; no protein yet.');
  assert.equal(say('gene.tx', 'gly'), 'The glucose-processing genes are being transcribed; no protein yet.');
  assert.equal(say('gene.leftover', 'fliC'), 'Transcription of the flagellin gene has stopped, but its mRNA is still being translated.');
  assert.equal(say('gene.gone', 'lacZ'), 'The mRNA for β-galactosidase is gone; the protein remains and is shared out at each division.');
  assert.equal(say('burden', 'fliC'), 'Ribosomes busy with flagellin are not making other proteins, so growth slows over a few generations.');
  assert.equal(say('gene.noatp', 'lacY'), 'The lactose permease gene is switched on, but with no ATP nothing is transcribed.');
  assert.equal(say('gene.down', 'ptsG'), 'The glucose transporter gene is transcribed less often now; its protein is diluted as the cell grows.');
  assert.equal(say('gene.up', 'gly'), 'The glucose-processing genes are transcribed more often now, so their protein climbs to a higher level.');
  assert.equal(say('starve.noenzyme', 'gly'), 'The glucose-processing enzymes are too scarce to break down glucose quickly, so ATP is low and growth slows.');
  assert.equal(say('starve.noenzyme', 'gly', hidden), 'Protein B is too scarce to break down glucose quickly, so ATP is low and growth slows.');
  assert.equal(say('lac.toofew', null), 'Lactose is outside, but there is too little LacY and LacZ to keep ATP up, so the cell has stopped.');
  assert.equal(say('gene.tx', 'fliC', hidden), 'Gene G is being transcribed; no protein yet.');
  assert.equal(say('lac.noY', null, hidden), 'Lactose is outside, but without protein E it does not get in.');
  assert.equal(say('burden.lac', 'lacZ'), 'With no lactose here, β-galactosidase does no work, and making it slows growth over a few generations.');
});

// ---------------------------------------------------------------------------
// U-4: scripted scenarios
// ---------------------------------------------------------------------------
const coverage = {};
for (const field of Object.keys(OBS.FACT_VALUES)) coverage[field] = new Set();
function cover(f) {
  coverage['drug.rif'].add(f.drug.rif);
  coverage['drug.cm'].add(f.drug.cm);
  for (const field of ['medium', 'glucoseLevel', 'carbon', 'glucoseImport', 'glucoseStep', 'energy', 'aa', 'lactoseBlock', 'uselessGene',
    'aaOutside', 'aaImportOn', 'growth', 'justDivided', 'limiting']) coverage[field].add(f[field]);
  coverage.lastCommandedGene.add(f.lastCommandedGene === null ? null : 'gene');
}
const keysSeen = new Set();
const slowButNormal = [];      // M2: the key is never growth.normal while facts.growth is 'slow'

/**
 * Runs one scenario: a steady cell (seed 1 unless given), commands [[tick, cmd], …]
 * submitted at their ticks (as the UI would: applied at the start of that step),
 * an optional script(cell, facts, tick) that may issue commands before each step,
 * and the narrator fed after every step. Returns the key sequence (consecutive
 * repeats collapsed) with the tick each key first appeared, plus the events.
 */
function play({ seed = 1, config = {}, commands = [], ticks, script }) {
  const cell = new Cell(mergeConfig({ seed, start: 'steady' }, config));
  const mem = N.createMemory();
  const facts = OBS.createFacts();
  const keys = [], events = [];
  let next = 0;
  OBS.facts(cell, facts);
  while (cell.tick < ticks) {
    while (next < commands.length && commands[next][0] === cell.tick) cell.command(commands[next++][1]);
    if (script) script(cell, facts, cell.tick);
    cell.step();
    const evs = cell.takeEvents();
    for (const e of evs) events.push(e);
    N.ingest(mem, evs, cell.tick);
    OBS.facts(cell, facts);
    cover(facts);
    const out = N.narrate(facts, mem, cell.tick);
    keysSeen.add(out.key);
    if (out.key === 'growth.normal' && facts.growth !== 'normal' && slowButNormal.length < 5) slowButNormal.push(`seed ${seed} tick ${cell.tick} growth ${facts.growth}`);
    if (!keys.length || keys[keys.length - 1].key !== out.key || keys[keys.length - 1].gene !== out.gene) {
      keys.push({ tick: cell.tick, key: out.key, gene: out.gene, text: out.text });
    }
  }
  const first = (key, after) => { const k = keys.find((x) => x.key === key && x.tick >= (after || 0)); return k ? k.tick : -1; };
  const keyAt = (tick) => { let k = null; for (const x of keys) { if (x.tick > tick) break; k = x.key; } return k; };
  const event = (type, gene) => { const e = events.find((x) => x.type === type && (!gene || x.gene === gene)); return e ? e.tick : -1; };
  const seq = () => keys.map((k) => `${k.tick}:${k.key}`).join(' ');
  return { cell, keys, events, first, keyAt, event, seq, facts };
}

const setP = (gene, level) => ({ type: 'setPromoter', gene, level });
const medium = (m) => Object.assign({ type: 'setMedium' }, m);
const drug = (d, dose) => ({ type: 'setDrug', drug: d, dose });
const KO = { knockout: true, initial: { protein: 0 } };

test('U-4: fliC ×4 → gene.tx within 20 ticks, before gene.rising; lacZ ×¼ from off → gene.waiting first', () => {
  const r = play({ commands: [[0, setP('fliC', 4)]], ticks: 400 });
  const tx = r.first('gene.tx'), rising = r.first('gene.rising');
  assert.ok(tx > 0 && tx <= 20 && rising > tx, r.seq());
  assert.ok(rising >= r.event('first_protein', 'fliC'), r.seq());
  const w = play({ commands: [[0, setP('lacZ', 0.25)]], ticks: 600 });
  assert.equal(w.keys[0].key, 'gene.waiting', w.seq());
  assert.ok(w.first('gene.tx') > w.keys[0].tick, w.seq());
});

test('U-4: glucose None → starve.nosugar within 10 ticks, and still starve.nosugar after 15 min (after dormant)', () => {
  const r = play({ commands: [[0, medium({ glucose_mM: 0 })]], ticks: 900 });
  const t = r.first('starve.nosugar');
  assert.ok(t >= 0 && t <= 10, r.seq());
  const dormant = r.event('dormant');
  assert.ok(dormant > 0 && dormant < 900, `dormant at ${dormant}`);
  assert.equal(r.keyAt(900), 'starve.nosugar', r.seq());
  assert.ok(!r.keys.some((k) => k.key === 'starve.dormant'), r.seq());
});

test('U-4: ptsG knockout (no protein), glucose High → starve.noimport before dormant, then starve.dormant', () => {
  const r = play({ config: { genes: { ptsG: KO } }, ticks: 900 });
  const dormant = r.event('dormant');
  const noimport = r.first('starve.noimport');
  assert.ok(noimport >= 0 && noimport < dormant, r.seq());
  assert.ok(r.first('starve.dormant') >= dormant, r.seq());
  assert.equal(r.keyAt(900), 'starve.dormant', r.seq());
});

test('U-4: gly knockout (no protein), glucose High → growth.arrested (transporters are fine, so no transporter line)', () => {
  const r = play({ config: { genes: { gly: KO } }, ticks: 1800 });
  assert.equal(r.keyAt(1800), 'growth.arrested', r.seq());
  assert.ok(!r.keys.some((k) => /starve\.(noimport|dormant)/.test(k.key)), r.seq());
  assert.equal(r.facts.limiting, 'energy');
});

test('U-4: glucose None + lactose, then (once E < 0.1) lacY ×1 and lacZ ×1 on → gene.noatp', () => {
  let switched = -1;
  const r = play({
    commands: [[0, medium({ glucose_mM: 0, lactose_mM: PV.lactosePresent })]], ticks: 600,
    script: (c, f, tick) => {
      if (switched < 0 && f.energy === 'none') { switched = tick; c.command(setP('lacY', 1)); c.command(setP('lacZ', 1)); }
    },
  });
  assert.ok(switched > 0);
  const t = r.first('gene.noatp');
  assert.ok(t > switched, r.seq());
  assert.equal(r.keys.find((k) => k.key === 'gene.noatp').gene, 'lacZ');
  assert.equal(r.keyAt(600), 'gene.noatp', r.seq());
});

test('U-4: lacZ ×1 in glucose, 30 min later glucose None + lactose → lac.noY; the same with lacY → lac.noZ', () => {
  const lactoseOnly = medium({ glucose_mM: 0, lactose_mM: PV.lactosePresent });
  const y = play({ commands: [[0, setP('lacZ', 1)], [1800, lactoseOnly]], ticks: 1900 });
  assert.equal(y.keyAt(1900), 'lac.noY', y.seq());
  const z = play({ commands: [[0, setP('lacY', 1)], [1800, lactoseOnly]], ticks: 1900 });
  assert.equal(z.keyAt(1900), 'lac.noZ', z.seq());
});

test('U-4: fliC ×4 for 2 h → burden; after off: leftover, gone, uselessGene clears within 10 min of mrna_gone, no burden for 4 h', () => {
  let cleared = -1, gone = -1;
  const r = play({
    commands: [[0, setP('fliC', 4)], [2 * HOUR, setP('fliC', 'off')]], ticks: 6 * HOUR,
    script: (c, f, tick) => {
      if (gone < 0) for (const e of c.events) if (e.type === 'mrna_gone' && e.gene === 'fliC') gone = e.tick;
      if (tick > 2 * HOUR && cleared < 0 && f.uselessGene === null) cleared = tick;
    },
  });
  const off = 2 * HOUR;
  assert.ok(r.keys.some((k) => k.key === 'burden' && k.gene === 'fliC' && k.tick < off), r.seq());
  assert.ok(r.first('gene.leftover', off) >= off, r.seq());
  const goneTick = r.event('mrna_gone', 'fliC');
  assert.ok(goneTick > off, 'mrna_gone never fired');
  assert.ok(r.first('gene.gone', off) >= goneTick, r.seq());
  assert.ok(cleared > 0 && cleared - goneTick <= 600, `uselessGene cleared at ${cleared}, mrna_gone at ${goneTick}`);
  assert.ok(!r.keys.some((k) => k.key === 'burden' && k.tick > off), r.seq());
  assert.equal(r.keyAt(6 * HOUR), 'growth.normal', r.seq());
});

test('U-4: lacY ×2 and lacZ ×2 without lactose, 1 h → burden.lac', () => {
  const r = play({ commands: [[0, setP('lacY', 2)], [0, setP('lacZ', 2)]], ticks: HOUR });
  assert.ok(r.keys.some((k) => k.key === 'burden.lac' && k.tick > 600), r.seq());
  assert.equal(r.facts.uselessGene, 'lacZ');
});

test('U-4: glucose Low → growth.low after 1 h (not starve.fewimport); ptsG ×¼ in High → gene.down, then starve.fewimport by 8 h', () => {
  const low = play({ commands: [[0, medium({ glucose_mM: PV.glucoseLow })]], ticks: 2 * HOUR });
  assert.equal(low.keyAt(HOUR), 'growth.low', low.seq());
  assert.equal(low.keyAt(2 * HOUR), 'growth.low', low.seq());
  assert.ok(!low.keys.some((k) => k.key === 'starve.fewimport'), low.seq());
  const few = play({ commands: [[0, setP('ptsG', 0.25)]], ticks: 8 * HOUR });
  const down = few.first('gene.down'), starved = few.first('starve.fewimport');
  assert.ok(down >= 0 && down < 60, few.seq());
  assert.ok(starved > down && starved <= 8 * HOUR, few.seq());
  assert.ok(!few.keys.some((k) => k.key === 'starve.noenzyme'), 'transporters limit here, not the enzymes: ' + few.seq());
});

test('U-4: glucose-processing genes Off in High glucose → starve.noenzyme (the enzymes limit), never starve.fewimport', () => {
  const r = play({ commands: [[0, setP('gly', 'off')]], ticks: 5 * HOUR });
  const t = r.first('starve.noenzyme');
  assert.ok(t > 0, r.seq());
  assert.equal(r.keys.find((k) => k.key === 'starve.noenzyme').gene, 'gly');
  assert.ok(!r.keys.some((k) => k.key === 'starve.fewimport'), r.seq());
  assert.equal(r.keyAt(5 * HOUR), 'starve.noenzyme', r.seq());
});

test('U-4: lac genes ×1 for only 30 min, then lactose only → lac.toofew once ATP is gone; ×4 for an hour never gives it', () => {
  const lactoseOnly = medium({ glucose_mM: 0 });
  const few = play({ commands: [[0, setP('lacY', 1)], [0, setP('lacZ', 1)], [0, medium({ lactose_mM: PV.lactosePresent })], [1800, lactoseOnly]], ticks: 1800 + 900 });
  assert.ok(few.first('lac.toofew', 1800) > 1800, few.seq());
  assert.equal(few.keyAt(1800 + 900), 'lac.toofew', few.seq());
  const ok = play({ commands: [[0, setP('lacY', 4)], [0, setP('lacZ', 4)], [0, medium({ lactose_mM: PV.lactosePresent })], [HOUR, lactoseOnly]], ticks: 2 * HOUR });
  assert.ok(!ok.keys.some((k) => k.key === 'lac.toofew'), ok.seq());
  assert.equal(ok.keyAt(2 * HOUR), 'growth.lactose', ok.seq());
});

test('U-4: glucose and lactose both used → growth.both; slow growth with no named cause → growth.slow, not growth.normal', () => {
  const both = play({ commands: [[0, setP('lacY', 1)], [0, setP('lacZ', 1)], [0, medium({ lactose_mM: PV.lactosePresent })]], ticks: HOUR });
  assert.equal(both.facts.carbon, 'both');
  assert.equal(both.keyAt(HOUR), 'growth.both', both.seq());
  const slow = play({ commands: [[0, setP('aaSyn', 'off')]], ticks: 4 * HOUR });
  assert.equal(slow.facts.growth, 'slow');
  assert.equal(slow.keyAt(4 * HOUR), 'growth.slow', slow.seq());
});

test('U-4: a drug switched off → drug.cm.off / drug.rif.off for 10 min; under chloramphenicol with no ATP the line is not drug.cm', () => {
  const cm = play({ commands: [[0, drug('chloramphenicol', 1)], [1800, drug('chloramphenicol', 0)]], ticks: 1800 + 900 });
  assert.ok(cm.first('drug.cm.off', 1800) >= 1800 && cm.first('drug.cm.off', 1800) <= 1802, cm.seq());
  assert.notEqual(cm.keyAt(1800 + 700), 'drug.cm.off', 'drug.cm.off lasts 10 min');
  const rif = play({ commands: [[0, drug('rifampicin', 1)], [1800, drug('rifampicin', 0)]], ticks: 1800 + 900 });
  assert.ok(rif.first('drug.rif.off', 1800) >= 1800 && rif.first('drug.rif.off', 1800) <= 1802, rif.seq());
  assert.notEqual(rif.keyAt(1800 + 700), 'drug.rif.off');
  // fliC ×4, then glucose gone (lactose but no LacY), then chloramphenicol: with no ATP there is no mRNA to talk about.
  const noatp = play({
    commands: [[0, setP('fliC', 4)], [1800, medium({ glucose_mM: 0, lactose_mM: PV.lactosePresent })], [2400, drug('chloramphenicol', 1)]],
    ticks: 2 * HOUR,
  });
  assert.equal(noatp.facts.energy, 'none');
  assert.notEqual(noatp.keyAt(2 * HOUR), 'drug.cm', noatp.seq());
  assert.equal(noatp.keyAt(2 * HOUR), 'lac.noY', noatp.seq());
});

test('U-4: the burden line does not flicker (uselessGene hysteresis): fliC ×½ and lacZ ×1 stay at least 120 s between changes', () => {
  for (const [gene, level] of [['fliC', 0.5], ['lacZ', 1]]) {
    for (const seed of [1, 2, 3, 4]) {
      const cell = new Cell(mergeConfig({ seed, start: 'steady' }, {}));
      cell.command(setP(gene, level));
      const f = OBS.createFacts();
      let last = null, lastTick = 0, minDwell = Infinity;
      for (let t = 0; t < 5400; t++) {
        cell.step();
        OBS.facts(cell, f);
        const on = f.uselessGene !== null;
        if (last !== null && on !== last) { if (cell.tick > 900) minDwell = Math.min(minDwell, cell.tick - lastTick); lastTick = cell.tick; }
        last = on;
      }
      assert.ok(minDwell >= 120, `${gene} ×${level} seed ${seed}: shortest stay ${minDwell} s`);
    }
  }
});

test('U-4: lac genes preinduced 4 h in glucose, then lactose only → growth.lactose once adapted', () => {
  const r = play({
    commands: [[0, setP('lacY', 1)], [0, setP('lacZ', 1)], [4 * HOUR, medium({ lactose_mM: PV.lactosePresent })],
      [4 * HOUR + 600, medium({ glucose_mM: 0 })]],
    ticks: 6 * HOUR,
  });
  assert.ok(r.first('growth.lactose', 4 * HOUR + 600) > 0, r.seq());
  assert.equal(r.keyAt(6 * HOUR), 'growth.lactose', r.seq());
});

test('U-4: amino acids Present and aaImp ×1 → gene.up, then growth.aa once the up phase ends', () => {
  const r = play({ commands: [[0, medium({ aminoAcids_mM: PV.aminoAcidsPresent })], [0, setP('aaImp', 1)]], ticks: HOUR });
  const up = r.first('gene.up');
  assert.ok(up >= 0 && up < 5, r.seq());
  const aa = r.first('growth.aa');
  assert.ok(aa >= 1200, r.seq());                    // the up phase lasts 20 min from the command (tick 0)
  assert.equal(r.keyAt(HOUR), 'growth.aa', r.seq());
});

test('U-4: aaSyn knockout (no protein), no amino acids outside → aa.low', () => {
  const r = play({ config: { genes: { aaSyn: KO } }, ticks: HOUR });
  assert.ok(r.first('aa.low') > 0, r.seq());
  assert.equal(r.keyAt(HOUR), 'aa.low', r.seq());
  assert.equal(r.facts.limiting, 'amino-acids');
});

test('U-4: drugs: Cm Full, Rif Full then Rif late after 10 min, both Full, and the Low doses', () => {
  const r = play({
    commands: [[0, drug('chloramphenicol', 1)], [60, drug('chloramphenicol', 0)], [61, drug('rifampicin', 1)],
      [900, drug('chloramphenicol', 1)], [960, drug('chloramphenicol', 0)], [961, drug('rifampicin', 0)],
      [962, drug('chloramphenicol', PV.drugLow)], [1100, drug('chloramphenicol', 0)], [1101, drug('rifampicin', PV.drugLow)]],
    ticks: 1300,
  });
  assert.equal(r.keyAt(30), 'drug.cm', r.seq());
  assert.equal(r.keyAt(100), 'drug.rif', r.seq());
  const late = r.first('drug.rif.late');
  assert.ok(late >= 61 + 600 && late <= 61 + 602, r.seq());
  assert.equal(r.keyAt(930), 'drug.both', r.seq());
  assert.equal(r.keyAt(1000), 'drug.cm.low', r.seq());
  assert.equal(r.keyAt(1200), 'drug.rif.low', r.seq());
});

test('U-4: glucose None for 20 min, then High → recover', () => {
  const r = play({ commands: [[0, medium({ glucose_mM: 0 })], [1200, medium({ glucose_mM: PV.glucoseHigh })]], ticks: 1800 });
  const t = r.first('recover', 1200);
  assert.ok(t > 1200 && t < 1220, r.seq());
  assert.equal(r.keyAt(1400), 'recover', r.seq());
  assert.notEqual(r.keyAt(1800), 'recover', 'recover lasts 5 min');
});

test('U-4: a division → divided for 90 s', () => {
  const r = play({ ticks: 2 * HOUR });
  const div = r.event('division');
  assert.ok(div > 0);
  assert.equal(r.keyAt(div + 1), 'divided', r.seq());
  assert.equal(r.keyAt(div + 100), 'growth.normal', r.seq());
});

test('U-4: lacY and aaImp as useless genes (fast promoters and strong RBS), and the transporter death spiral (glucoseImport low)', () => {
  const y = play({ commands: [[0, { type: 'setPromoter', gene: 'lacY', rate_perS: 0.3 }], [0, { type: 'setRBS', gene: 'lacY', rbs: 4 }]], ticks: 1800 });
  assert.equal(y.facts.uselessGene, 'lacY');
  assert.equal(y.keyAt(1800), 'burden.lac', y.seq());
  const a = play({ commands: [[0, { type: 'setPromoter', gene: 'aaImp', rate_perS: 0.3 }], [0, { type: 'setRBS', gene: 'aaImp', rbs: 4 }]], ticks: 1800 });
  assert.equal(a.facts.uselessGene, 'aaImp');
  assert.ok(a.keys.some((k) => k.key === 'burden' && k.gene === 'aaImp'), a.seq());
  let low = -1;
  const s = play({ commands: [[0, setP('ptsG', 'off')]], ticks: 6 * HOUR, script: (c, f, tick) => { if (low < 0 && f.glucoseImport === 'low') low = tick; } });
  assert.ok(low > 0, s.seq());
});

test('U-4: every rule was reached and every facts value occurred (run after the scenarios)', (t) => {
  const missingKeys = N.RULES.map((r) => r.key).filter((k) => !keysSeen.has(k));
  assert.deepEqual(missingKeys, [], 'rules never reached');
  assert.deepEqual(slowButNormal, [], 'growth.normal while growth was not normal');
  const missing = [];
  for (const [field, values] of Object.entries(OBS.FACT_VALUES)) {
    for (const v of values) if (!coverage[field].has(v)) missing.push(`${field} = ${v}`);
  }
  t.diagnostic(`${keysSeen.size} rules reached; facts values covered: ${Object.values(coverage).reduce((s, x) => s + x.size, 0)}`);
  assert.deepEqual(missing, [], 'facts values never produced');
});
