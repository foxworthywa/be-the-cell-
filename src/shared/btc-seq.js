// @deps
/*
 * Be the Cell: the exact sequence model (docs/PROLOGUE.md §2.2).
 *
 * Every letter, copy, codon, amino acid and chain the opening shows is
 * computed here from stored sequence data (BTC.seqdata), never drawn from a
 * canned picture. Pure: no randomness, no state, no DOM.
 *
 *   CODE                       the standard genetic code (NCBI translation table 1), 64 RNA codons
 *   AA                         one letter → {three, name} for the 20 amino acids and stop ('*')
 *   dnaPartner(b)              A↔T, C↔G (throws on anything else)
 *   rnaPartner(templateBase)   the RNA letter built across from a DNA letter: A→U, T→A, C→G, G→C
 *   complement(dna), reverseComplement(dna)
 *   transcribe(coding)         the mRNA: the coding strand with T → U (= rnaPartner over the template strand)
 *   codons(rna, start)         codon strings from index start
 *   firstStart(rna)            index of the first AUG (−1 if none)
 *   translate(rna, {from})     reads from the first AUG (or from) until a stop: {protein, startIndex, stopIndex, codons}
 *   prefixChain(rna, n)        the chain a ribosome has built after reading n codons from the start
 *   hydropathy(protein, w)     Kyte–Doolittle window means (Kyte & Doolittle 1982), window w (default 19)
 *   oilyStretches(protein, o)  windows with mean ≥ o.min (1.6), merged into stretches {from, to} (1-based)
 *   slice(protein, from, to)   1-based, inclusive
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.seq = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // NCBI translation table 1, over the base order U, C, A, G (first, second, third letter).
  const TABLE_1 = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const ORDER = 'UCAG';
  const CODE = (() => {
    const c = {};
    for (let i = 0; i < 64; i++) c[ORDER[i >> 4] + ORDER[(i >> 2) & 3] + ORDER[i & 3]] = TABLE_1[i];
    return Object.freeze(c);
  })();

  const AA = Object.freeze({
    A: Object.freeze({ three: 'Ala', name: 'alanine' }), R: Object.freeze({ three: 'Arg', name: 'arginine' }),
    N: Object.freeze({ three: 'Asn', name: 'asparagine' }), D: Object.freeze({ three: 'Asp', name: 'aspartate' }),
    C: Object.freeze({ three: 'Cys', name: 'cysteine' }), Q: Object.freeze({ three: 'Gln', name: 'glutamine' }),
    E: Object.freeze({ three: 'Glu', name: 'glutamate' }), G: Object.freeze({ three: 'Gly', name: 'glycine' }),
    H: Object.freeze({ three: 'His', name: 'histidine' }), I: Object.freeze({ three: 'Ile', name: 'isoleucine' }),
    L: Object.freeze({ three: 'Leu', name: 'leucine' }), K: Object.freeze({ three: 'Lys', name: 'lysine' }),
    M: Object.freeze({ three: 'Met', name: 'methionine' }), F: Object.freeze({ three: 'Phe', name: 'phenylalanine' }),
    P: Object.freeze({ three: 'Pro', name: 'proline' }), S: Object.freeze({ three: 'Ser', name: 'serine' }),
    T: Object.freeze({ three: 'Thr', name: 'threonine' }), W: Object.freeze({ three: 'Trp', name: 'tryptophan' }),
    Y: Object.freeze({ three: 'Tyr', name: 'tyrosine' }), V: Object.freeze({ three: 'Val', name: 'valine' }),
    '*': Object.freeze({ three: 'Stop', name: 'stop' }),
  });

  // Kyte & Doolittle (1982) hydropathy index.
  const KD = Object.freeze({
    A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5, Q: -3.5, E: -3.5, G: -0.4, H: -3.2, I: 4.5,
    L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6, S: -0.8, T: -0.7, W: -0.9, Y: -1.3, V: 4.2,
  });

  const DNA_PAIR = Object.freeze({ A: 'T', T: 'A', C: 'G', G: 'C' });
  const RNA_ACROSS = Object.freeze({ A: 'U', T: 'A', C: 'G', G: 'C' });

  function dnaPartner(b) {
    const p = DNA_PAIR[b];
    if (!p) throw new Error('not a DNA letter: ' + b);
    return p;
  }

  /** The RNA letter RNA polymerase builds across from a letter of the template (DNA) strand. */
  function rnaPartner(templateBase) {
    const p = RNA_ACROSS[templateBase];
    if (!p) throw new Error('not a DNA letter: ' + templateBase);
    return p;
  }

  function complement(dna) {
    let s = '';
    for (let i = 0; i < dna.length; i++) s += dnaPartner(dna[i]);
    return s;
  }

  function reverseComplement(dna) {
    let s = '';
    for (let i = dna.length - 1; i >= 0; i--) s += dnaPartner(dna[i]);
    return s;
  }

  /** The mRNA copy of a coding strand (written 5′→3′): the same letters with U for T. */
  function transcribe(coding) {
    let s = '';
    for (let i = 0; i < coding.length; i++) {
      const b = coding[i];
      if (!DNA_PAIR[b]) throw new Error('not a DNA letter: ' + b);
      s += b === 'T' ? 'U' : b;
    }
    return s;
  }

  function codons(rna, start) {
    const out = [];
    for (let i = start || 0; i + 3 <= rna.length; i += 3) out.push(rna.slice(i, i + 3));
    return out;
  }

  function firstStart(rna) { return rna.indexOf('AUG'); }

  /**
   * Reads codons from the first AUG (or opts.from) until a stop codon. stopIndex is the index of
   * the stop codon's first letter, or −1 when the message ends first; the stop is not in protein.
   */
  function translate(rna, opts) {
    const from = opts && typeof opts.from === 'number' ? opts.from : firstStart(rna);
    const out = { protein: '', startIndex: from, stopIndex: -1, codons: [] };
    if (from < 0) return out;
    let p = '';
    for (let i = from; i + 3 <= rna.length; i += 3) {
      const cd = rna.slice(i, i + 3), aa = CODE[cd];
      if (aa === undefined) throw new Error('not an RNA codon: ' + cd);
      out.codons.push(cd);
      if (aa === '*') { out.stopIndex = i; break; }
      p += aa;
    }
    out.protein = p;
    return out;
  }

  /** The chain after a ribosome has read nCodons codons from the start (a stop adds nothing). */
  function prefixChain(rna, nCodons, from) {
    const start = typeof from === 'number' ? from : firstStart(rna);
    if (start < 0 || !(nCodons > 0)) return '';
    let p = '';
    for (let k = 0; k < nCodons; k++) {
      const i = start + 3 * k;
      if (i + 3 > rna.length) break;
      const aa = CODE[rna.slice(i, i + 3)];
      if (aa === '*') break;
      p += aa;
    }
    return p;
  }

  /** Kyte–Doolittle means over every window of w residues: element i covers residues i … i + w − 1 (0-based). */
  function hydropathy(protein, w) {
    const W = w || 19, n = protein.length - W + 1;
    const out = [];
    if (n <= 0) return out;
    let sum = 0;
    for (let i = 0; i < W; i++) sum += kd(protein[i]);
    out.push(sum / W);
    for (let i = 1; i < n; i++) {
      sum += kd(protein[i + W - 1]) - kd(protein[i - 1]);
      out.push(sum / W);
    }
    return out;
  }
  function kd(a) {
    const v = KD[a];
    if (v === undefined) throw new Error('not an amino acid: ' + a);
    return v;
  }

  /**
   * Oily (water-avoiding) stretches: every window whose mean is at least o.min (default 1.6, the
   * classic membrane-spanning criterion for w = 19), merged where windows overlap or touch.
   * Returns [{from, to, max}] in 1-based residue numbers, inclusive.
   */
  function oilyStretches(protein, o) {
    const W = (o && o.w) || 19, min = o && typeof o.min === 'number' ? o.min : 1.6;
    const h = hydropathy(protein, W), out = [];
    let cur = null;
    for (let i = 0; i < h.length; i++) {
      if (h[i] < min) continue;
      const from = i + 1, to = i + W;
      if (cur && from <= cur.to + 1) { cur.to = to; if (h[i] > cur.max) cur.max = h[i]; }
      else { cur = { from, to, max: h[i] }; out.push(cur); }
    }
    return out;
  }

  /** Residues from … to, 1-based and inclusive (processing steps: the signal peptide is 1–24). */
  function slice(protein, from, to) { return protein.slice(from - 1, to); }

  return {
    TABLE_1, CODE, AA, KD, dnaPartner, rnaPartner, complement, reverseComplement, transcribe, codons, firstStart,
    translate, prefixChain, hydropathy, oilyStretches, slice,
  };
});
