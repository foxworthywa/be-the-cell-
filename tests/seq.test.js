// The exact sequence model and the insulin data (docs/PROLOGUE.md §2.2, §10.1 SQ-1 … SQ-6).
// Every letter, codon and chain the opening shows is computed by BTC.seq from BTC.seqdata;
// these tests pin the model to the standard genetic code and the data to UniProt P01308.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/shared/btc-seq.js');
const { INS } = require('../src/shared/btc-seqdata.js');
const { P01308 } = require('./fixtures/seq-uniprot.js');

test('SQ-1: the genetic code is NCBI table 1: 64 codons, 61 sense and 3 stops, 20 amino acids, AUG = Met', () => {
  const keys = Object.keys(S.CODE);
  assert.equal(keys.length, 64);
  assert.ok(keys.every((k) => /^[UCAG]{3}$/.test(k)));
  const stops = keys.filter((k) => S.CODE[k] === '*').sort();
  assert.deepEqual(stops, ['UAA', 'UAG', 'UGA']);
  const aas = new Set(keys.map((k) => S.CODE[k]).filter((a) => a !== '*'));
  assert.equal(aas.size, 20);
  for (const a of aas) assert.ok(S.AA[a] && /^[A-Z][a-z]{2}$/.test(S.AA[a].three), a);
  assert.equal(S.CODE.AUG, 'M');
  assert.equal(S.AA.M.three, 'Met');
  // Spot checks from any textbook table.
  assert.equal(S.CODE.UUU, 'F'); assert.equal(S.CODE.GCC, 'A'); assert.equal(S.CODE.UGG, 'W'); assert.equal(S.CODE.GGC, 'G');
  assert.equal(S.CODE.CUG, 'L'); assert.equal(S.CODE.AGA, 'R'); assert.equal(S.CODE.UAC, 'Y');
  // The table, read in U C A G order, is the canonical 64-letter string.
  const B = 'UCAG';
  let s = '';
  for (const a of B) for (const b of B) for (const c of B) s += S.CODE[a + b + c];
  assert.equal(s, 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG');
  assert.ok(Object.isFrozen(S.CODE));
});

test('SQ-2: complement is an involution; the copy built across from the template equals the coding strand with U for T', () => {
  let x = 12345;
  const rnd = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x / 4294967296; };   // fixed seed
  for (let t = 0; t < 200; t++) {
    let dna = '';
    const n = 1 + Math.floor(rnd() * 60);
    for (let i = 0; i < n; i++) dna += 'ACGT'[Math.floor(rnd() * 4)];
    assert.equal(S.complement(S.complement(dna)), dna);
    assert.equal(S.reverseComplement(S.reverseComplement(dna)), dna);
    const template = S.complement(dna);
    let across = '';
    for (const b of template) across += S.rnaPartner(b);
    assert.equal(across, S.transcribe(dna));
  }
  assert.equal(S.dnaPartner('A'), 'T'); assert.equal(S.dnaPartner('G'), 'C');
  assert.equal(S.rnaPartner('A'), 'U'); assert.equal(S.rnaPartner('T'), 'A');
  assert.throws(() => S.dnaPartner('U'), /not a DNA letter/);
  assert.throws(() => S.transcribe('ACGU'), /not a DNA letter/);
});

test('SQ-3: the insulin coding sequence translates to UniProt P01308 exactly; the leader has no AUG before the real start', () => {
  assert.equal(INS.cds.length, 333);
  assert.equal(INS.mRNA.length, 465);
  assert.equal(INS.leaderLength + INS.cds.length + INS.tailLength, 465);
  assert.ok(INS.cds.startsWith('ATG') && INS.cds.endsWith('TAG'));
  assert.equal(INS.mRNA.slice(59, 392), INS.cds, 'the coding sequence is mRNA positions 60–392');
  assert.deepEqual(Array.from(INS.cdsRange), [60, 392]);
  // No stop inside the coding sequence.
  const cdsRNA = S.transcribe(INS.cds);
  const cds = S.codons(cdsRNA, 0);
  assert.equal(cds.length, 111);
  assert.ok(cds.slice(0, 110).every((c) => S.CODE[c] !== '*'), 'an internal stop');
  assert.equal(S.CODE[cds[110]], '*');
  // The coding sequence alone, and the whole mRNA from its first AUG, give P01308.
  assert.equal(P01308.length, 110);
  assert.equal(S.translate(cdsRNA).protein, P01308);
  const m = S.transcribe(INS.mRNA);
  assert.equal(S.firstStart(m), 59, 'the first AUG is at mRNA position 60');
  assert.equal(m.slice(0, 59).indexOf('AUG'), -1, 'the 5′ leader has no AUG');
  const tr = S.translate(m);
  assert.equal(tr.protein, P01308);
  assert.equal(tr.startIndex, 59);
  assert.equal(tr.stopIndex, 59 + 330, 'stops at codon 111');
  assert.equal(m.slice(tr.stopIndex, tr.stopIndex + 3), 'UAG');
  assert.equal(tr.codons.length, 111);
  assert.equal(INS.provenance.status, 'matched against published copies');
  assert.equal(INS.provenance.uniprot, 'P01308 SV=1');
  assert.equal(INS.provenance.refseq, 'NM_000207.3');
});

test('SQ-4: the processing parts: signal, B chain, C-peptide, A chain, the cut pairs and the cysteines', () => {
  const p = S.translate(S.transcribe(INS.cds)).protein, P = INS.parts;
  assert.equal(S.slice(p, P.signal[0], P.signal[1]), 'MALWMRLLPLLALLALWGPDPAAA');
  assert.equal(S.slice(p, P.bChain[0], P.bChain[1]), 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT');
  assert.equal(S.slice(p, P.cPeptide[0], P.cPeptide[1]), 'EAEDLQVGQVELGGGPGAGSLQPLALEGSLQ');
  assert.equal(S.slice(p, P.aChain[0], P.aChain[1]), 'GIVEQCCTSICSLYQLENYCN');
  assert.equal(S.slice(p, P.cutRR[0], P.cutRR[1]), 'RR');
  assert.equal(S.slice(p, P.cutKR[0], P.cutKR[1]), 'KR');
  const cys = [];
  for (let i = 0; i < p.length; i++) if (p[i] === 'C') cys.push(i + 1);
  assert.deepEqual(cys, [31, 43, 95, 96, 100, 109]);
  for (const [a, b] of P.disulfides) { assert.equal(p[a - 1], 'C'); assert.equal(p[b - 1], 'C'); }
  // B7 = 31, B19 = 43, A6 = 95, A7 = 96, A11 = 100, A20 = 109.
  assert.equal(P.bChain[0] + 6, 31); assert.equal(P.bChain[0] + 18, 43);
  assert.equal(P.aChain[0] + 5, 95); assert.equal(P.aChain[0] + 19, 109);
});

test('SQ-5: the facts the opening scenes show are computed, not typed', () => {
  const m = S.transcribe(INS.mRNA);
  assert.equal(m.slice(0, 6), 'AGCCCU', 'the first six letters of the copy');
  const template = S.complement(INS.mRNA.slice(0, 6));
  assert.equal(template, 'TCGGGA');
  assert.equal(Array.from(template, S.rnaPartner).join(''), 'AGCCCU');
  assert.equal(m.indexOf('U'), 5, 'the sixth letter is the first U');
  const first = S.codons(m, S.firstStart(m)).slice(0, 12);
  assert.deepEqual(first, ['AUG', 'GCC', 'CUG', 'UGG', 'AUG', 'CGC', 'CUC', 'CUG', 'CCC', 'CUG', 'CUG', 'GCG']);
  assert.equal(first.map((c) => S.CODE[c]).join(''), 'MALWMRLLPLLA');
  assert.equal(S.prefixChain(m, 0), '');
  assert.equal(S.prefixChain(m, 2), 'MA');
  assert.equal(S.prefixChain(m, 12), 'MALWMRLLPLLA');
  assert.equal(S.prefixChain(m, 110), S.translate(m).protein);
  assert.equal(S.prefixChain(m, 111), S.translate(m).protein, 'reading the stop adds nothing');
  assert.equal(S.prefixChain(m, 500), S.translate(m).protein);
  // The letters around the start that the ladder shows (mRNA positions 52–62): CTTCTGCC ATG.
  assert.equal(INS.mRNA.slice(51, 62), 'CTTCTGCCATG');
});

test('SQ-6: preproinsulin has no oily stretch long enough to span a membrane (Kyte–Doolittle, window 19, max 1.56)', () => {
  const p = S.translate(S.transcribe(INS.cds)).protein;
  const h = S.hydropathy(p, 19);
  assert.equal(h.length, 110 - 19 + 1);
  const max = Math.max(...h);
  assert.equal(max.toFixed(2), '1.56');
  assert.ok(h.indexOf(max) < 24, 'the most oily window is in the signal peptide');
  assert.deepEqual(S.oilyStretches(p), []);
  // A made-up chain with one long oily run is found as one stretch.
  const tm = 'KDE' + 'LLIVAFLLIVAFLLIVAFLLIV' + 'KDERKDE';
  const st = S.oilyStretches(tm);
  assert.equal(st.length, 1);
  assert.ok(st[0].from >= 1 && st[0].to <= tm.length && st[0].max >= 1.6);
});
