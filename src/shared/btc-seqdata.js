// @deps
/*
 * Be the Cell: stored sequences, their annotations and where they come from
 * (docs/PROLOGUE.md §2.2, §13). Data only; BTC.seq computes everything shown.
 *
 * INS: human insulin. The mRNA is NCBI RefSeq NM_000207.3 (transcript variant 1),
 * written with T as DNA letters: the mature message without its cap or poly-A tail,
 * 465 letters = a 59-letter leader, the 333-letter coding sequence (positions 60–392,
 * ATG … TAG) and a 73-letter tail. Translated with the standard code from its first
 * AUG it gives preproinsulin, UniProt P01308 (110 amino acids), exactly (tests/seq.test.js).
 *
 * Status: matched against published copies of the UniProt and RefSeq records
 * (UniProt and NCBI themselves were blocked by the network policy of the sessions that
 * wrote this file). tools/verify-seq.js re-checks the sequences against UniProt and NCBI
 * directly where the network allows, and against the published copies otherwise; when a
 * direct check passes, record its date in INS.provenance.checked.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.seqdata = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LEADER = 'AGCCCTCCAGGACAGGCTGCATCAGAAGAGGCCATCAAGCAGATCACTGTCCTTCTGCC';
  const CDS = 'ATGGCCCTGTGGATGCGCCTCCTGCCCCTGCTGGCGCTGCTGGCCCTCTGGGGACCTGACCCAGCCGCAGCCTTTGTGAACCAACACCTGTGCGGCTCACACCTG' +
    'GTGGAAGCTCTCTACCTAGTGTGCGGGGAACGAGGCTTCTTCTACACACCCAAGACCCGCCGGGAGGCAGAGGACCTGCAGGTGGGGCAGGTGGAGCTGGGCGGGGGCCCT' +
    'GGTGCAGGCAGCCTGCAGCCCTTGGCCCTGGAGGGGTCCCTGCAGAAGCGTGGCATTGTGGAACAATGCTGTACCAGCATCTGCTCCCTCTACCAGCTGGAGAACTACTGC' +
    'AACTAG';
  const TAIL = 'ACGCAGCCCGCAGGCAGCCCCACACCCGCCGCCTCCTGCACCGAGAGAGATGGAATAAAGCCCTTGAACCAGC';

  const INS = Object.freeze({
    gene: 'INS',
    name: 'insulin',
    // The mature mRNA as DNA letters (T), 5′ → 3′: leader + coding sequence + tail.
    mRNA: LEADER + CDS + TAIL,
    leaderLength: LEADER.length,               // 59
    cdsRange: Object.freeze([60, 392]),         // 1-based, inclusive, on mRNA
    cds: CDS,                                   // 333 letters, ATG … TAG
    tailLength: TAIL.length,                    // 73
    // Preproinsulin processing (UniProt P01308 features), 1-based residue numbers.
    parts: Object.freeze({
      signal: Object.freeze([1, 24]),
      bChain: Object.freeze([25, 54]),
      cutRR: Object.freeze([55, 56]),
      cPeptide: Object.freeze([57, 87]),
      cutKR: Object.freeze([88, 89]),
      aChain: Object.freeze([90, 110]),
      // Disulfide links: A6–A11 (within A), A7–B7 and A20–B19 (between the chains).
      disulfides: Object.freeze([Object.freeze([95, 100]), Object.freeze([96, 31]), Object.freeze([109, 43])]),
    }),
    provenance: Object.freeze({
      uniprot: 'P01308 SV=1',
      refseq: 'NM_000207.3',
      cdsRange: '60-392',
      gene: 'NC_000011.10:2159779-2161209, minus strand, 11p15.5',
      status: 'matched against published copies',
      copies: Object.freeze([
        'UniProt FASTA >sp|P01308|INS_HUMAN … SV=1: plotly/datasets Dash_Bio/Genetic/sequence_viewer_P01308.fasta',
        'NCBI CDS FASTA >NM_000207.3:60-392 INS: joseluisvitte/human-insulin-genomic-analysis data/cds.fna',
        'NCBI FASTA >NM_000207.3 (465 letters): andreamgom/GenomicDataExplorer datos/INS.fasta',
      ]),
      checked: '2026-09-24 (published copies; a direct check at UniProt and NCBI is pending: tools/verify-seq.js)',
    }),
  });

  return { INS };
});
