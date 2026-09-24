// Verifies a Be the Cell level run file by replaying it (LEVELS.md §10.4, §11.4).
//
//   node tools/verify-run.js <be-the-cell-<level>-<variant>-a<attempt>.json> [--json]
//
// Replays the scored run record with the level's monitor attached (R-E18), replays the 1.2
// demo, re-marks the stored answers and debrief taps, and recomputes E, the sketch or table
// scores, the flags, the total and the code. Prints "match" or each difference; exits 1 on a
// mismatch. It shows that the run and the score belong together, not who played it (§10.5).
'use strict';
const fs = require('fs');
const RUN = require('../src/game/btc-level-runner.js');
const { levels } = require('./decode-codes.js');

function verifyFile(file) {
  const byId = {};
  for (const d of levels()) byId[d.id] = d;
  return RUN.game.verifyRunFile(file, { levels: byId });
}

function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  if (!input) { console.error('usage: node tools/verify-run.js <run.json> [--json]'); process.exit(2); }
  let file;
  try { file = JSON.parse(fs.readFileSync(input, 'utf8')); } catch (e) { console.error('Could not read ' + input + ': ' + e.message); process.exit(2); }
  const res = verifyFile(file);
  if (args.indexOf('--json') >= 0) { console.log(JSON.stringify(res, null, 2)); process.exitCode = res.ok ? 0 : 1; return; }
  if (res.error) { console.log('NOT VERIFIED: ' + res.error); process.exitCode = 1; return; }
  const L = file.level;
  console.log(`Level ${L.id}, variant ${L.variantSeed}, attempt ${L.attempt}, ${L.runs} run(s); code ${L.code}`);
  for (const c of res.checks) {
    console.log((c.ok ? '  ok        ' : '  MISMATCH  ') + c.what + (c.ok ? '' : ': file ' + JSON.stringify(c.got) + ', replay ' + JSON.stringify(c.want)));
  }
  console.log(res.ok ? 'match' : 'mismatch');
  process.exitCode = res.ok ? 0 : 1;
}

if (require.main === module) main();
module.exports = { verifyFile };
