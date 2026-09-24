// Decodes Be the Cell completion codes for the instructor (LEVELS.md §10.4).
//
//   node tools/decode-codes.js <file.csv | codes.txt> [--csv out.csv]
//
// Reads a Canvas "Student analysis" CSV (the answer column is found by its content, the
// student name by its header) or a plain list with one code per line, and prints one row per
// code: student, level, variant (and its values), G, E, P, D, X (with the Expert objectives
// met), flags by name, attempt, runs, engine, content version, total, and whether the code is
// valid. Warnings: the same code or the same variant from two students, a think-aloud override
// (attempt 0), a code from another engine. --csv writes the table as CSV. tools/codes.html does
// the same in a browser.
'use strict';
const fs = require('fs');
const path = require('path');
const CODE = require('../src/game/btc-code.js');
const LV = require('../src/game/btc-levels.js');
const { ENGINE_VERSION } = require('../src/engine/btc-cell.js');

/** Every shipped level definition, validated. */
function levels() {
  const dir = path.join(__dirname, '..', 'src', 'levels');
  return fs.readdirSync(dir).filter((f) => /^btc-level-[\w-]+\.js$/.test(f) && f !== 'btc-level-constants.js')
    .map((f) => LV.validate(require(path.join(dir, f)))).sort((a, b) => a.order - b.order);
}

function decodeText(text) {
  return CODE.table(CODE.readCodes(text), levels(), { engine: ENGINE_VERSION });
}

function print(rows) {
  const cols = ['student', 'level', 'variant', 'variantValues', 'G', 'E', 'P', 'D', 'X', 'flags', 'attempt', 'runs', 'engine', 'content', 'total', 'valid'];
  const cell = (r, c) => (c === 'valid' ? (r.valid ? 'yes' : 'NO: ' + r.reason) : String(r[c] === undefined ? '' : r[c]));
  const width = cols.map((c) => Math.min(40, Math.max(c.length, ...rows.map((r) => cell(r, c).length))));
  const line = (vals) => vals.map((v, i) => String(v).slice(0, width[i]).padEnd(width[i])).join('  ');
  console.log(line(cols));
  console.log(width.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) {
    console.log(line(cols.map((c) => cell(r, c))));
    if (r.expert) console.log('    Expert met: ' + r.expert);
    if (r.warnings) console.log('    WARNING: ' + r.warnings);
  }
  const bad = rows.filter((r) => !r.valid).length, warn = rows.filter((r) => r.warnings).length;
  console.log(`\n${rows.length} code(s): ${rows.length - bad} valid, ${bad} invalid, ${warn} with warnings (engine of this build: ${ENGINE_VERSION}).`);
}

function main() {
  const args = process.argv.slice(2);
  const csvAt = args.indexOf('--csv');
  const out = csvAt >= 0 ? args[csvAt + 1] : null;
  const input = args.find((a, i) => a !== '--csv' && !(csvAt >= 0 && i === csvAt + 1));
  if (!input) { console.error('usage: node tools/decode-codes.js <file.csv | codes.txt> [--csv out.csv]'); process.exit(2); }
  const rows = decodeText(fs.readFileSync(input, 'utf8'));
  if (!rows.length) { console.log('No Be the Cell codes found in ' + input + '.'); process.exitCode = 1; return; }
  print(rows);
  if (out) { fs.writeFileSync(out, CODE.toCSV(rows)); console.log('wrote ' + out); }
}

if (require.main === module) main();
module.exports = { levels, decodeText };
