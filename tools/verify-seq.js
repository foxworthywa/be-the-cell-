// Re-verifies the stored sequences (src/shared/btc-seqdata.js) against their sources
// (docs/PROLOGUE.md §10.1 SQ-0, §13): the preproinsulin protein at UniProt (P01308) and the
// mRNA and coding sequence at NCBI (NM_000207.3), byte for byte.
//
//   node tools/verify-seq.js [--copies]
//
// Each source is fetched directly first. Where the network blocks UniProt or NCBI, the
// published copies of the same records (GitHub raw files) are checked instead, and the
// report says so: only a direct match may be recorded in INS.provenance.checked.
// --copies checks the published copies even when the direct sources answered.
// Not part of npm test (it needs the network). Uses curl, so it honours HTTPS_PROXY.
'use strict';
const { execFileSync } = require('child_process');
const S = require('../src/shared/btc-seq.js');
const { INS } = require('../src/shared/btc-seqdata.js');

const DIRECT = [
  { what: 'protein P01308', url: 'https://rest.uniprot.org/uniprotkb/P01308.fasta', expect: () => S.translate(S.transcribe(INS.cds)).protein },
  { what: 'mRNA NM_000207.3', url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=NM_000207.3&rettype=fasta&retmode=text', expect: () => INS.mRNA },
  { what: 'CDS NM_000207.3:60-392', url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=NM_000207.3&rettype=fasta_cds_na&retmode=text', expect: () => INS.cds, first: true },
];
const COPIES = [
  { what: 'protein P01308 (copy of the UniProt FASTA)', url: 'https://raw.githubusercontent.com/plotly/datasets/master/Dash_Bio/Genetic/sequence_viewer_P01308.fasta',
    expect: () => S.translate(S.transcribe(INS.cds)).protein, header: /P01308\|INS_HUMAN.*SV=1/ },
  { what: 'CDS NM_000207.3:60-392 (copy of the NCBI CDS FASTA)', url: 'https://raw.githubusercontent.com/joseluisvitte/human-insulin-genomic-analysis/main/data/cds.fna',
    expect: () => INS.cds, header: /NM_000207\.3:60-392/, first: true },
  { what: 'mRNA NM_000207.3 (copy of the NCBI FASTA)', url: 'https://raw.githubusercontent.com/andreamgom/GenomicDataExplorer/main/datos/INS.fasta',
    expect: () => INS.mRNA, header: /^NM_000207\.3 Homo sapiens insulin/ },
];

function get(url) {
  try {
    return execFileSync('curl', ['-sS', '-f', '-m', '30', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return null;
  }
}

/** The sequence of the first FASTA record (or of the record whose header matches). */
function fastaSeq(text, header) {
  const recs = text.split(/^>/m).filter(Boolean);
  const rec = header ? recs.find((r) => header.test(r.split('\n')[0])) : recs[0];
  if (!rec) return null;
  return { header: rec.split('\n')[0], seq: rec.split('\n').slice(1).join('').replace(/\s+/g, '').toUpperCase() };
}

function check(list, kind) {
  const out = [];
  for (const src of list) {
    const text = get(src.url);
    if (text === null) { out.push({ what: src.what, kind, status: 'unreachable', url: src.url }); continue; }
    const rec = fastaSeq(text, src.header);
    if (!rec) { out.push({ what: src.what, kind, status: 'no record', url: src.url }); continue; }
    const want = src.expect();
    const ok = rec.seq === want;
    let at = -1;
    if (!ok) for (let i = 0; i < Math.min(rec.seq.length, want.length); i++) if (rec.seq[i] !== want[i]) { at = i + 1; break; }
    out.push({ what: src.what, kind, status: ok ? 'match' : 'MISMATCH', header: rec.header, length: rec.seq.length, want: want.length, firstDiff: at, url: src.url });
  }
  return out;
}

if (require.main === module) {
  const direct = check(DIRECT, 'direct');
  const reached = direct.filter((r) => r.status !== 'unreachable');
  const copies = process.argv.indexOf('--copies') >= 0 || reached.length < DIRECT.length ? check(COPIES, 'copy') : [];
  for (const r of direct.concat(copies)) {
    console.log((r.status === 'match' ? 'ok   ' : r.status === 'unreachable' ? 'skip ' : 'FAIL ') + '[' + r.kind + '] ' + r.what + ': ' + r.status +
      (r.length !== undefined ? ' (' + r.length + ' letters, stored ' + r.want + (r.firstDiff > 0 ? ', first difference at ' + r.firstDiff : '') + ')' : '') +
      (r.header ? '\n       ' + r.header : '') + (r.status === 'unreachable' ? '\n       ' + r.url : ''));
  }
  const bad = direct.concat(copies).filter((r) => r.status === 'MISMATCH' || r.status === 'no record');
  const allDirect = direct.every((r) => r.status === 'match');
  const copiesOk = copies.length > 0 && copies.every((r) => r.status === 'match');
  if (bad.length) { console.log('\nThe stored sequences differ from a source: fix src/shared/btc-seqdata.js.'); process.exit(1); }
  if (allDirect) console.log('\nDirect check passed: record today\'s date in INS.provenance.checked (src/shared/btc-seqdata.js).');
  else if (copiesOk) console.log('\nUniProt or NCBI was not reachable; the published copies match. Status stays "matched against published copies".');
  else { console.log('\nNothing could be checked from this network.'); process.exit(2); }
}

module.exports = { fastaSeq, DIRECT, COPIES };
