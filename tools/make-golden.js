#!/usr/bin/env node
/*
 * Pins the golden hash (engine spec test d-4): the steady preset, seed 1, a
 * fixed command log, 10,000 ticks. The same scenario is embedded in
 * tools/golden.html, which prints the hash in any browser, so the result can
 * be compared by hand across devices (iPhone Safari, Android Chrome,
 * Chromebook, Windows/Mac Firefox).
 *
 *   node tools/make-golden.js          compute; write tests/golden.json and the block in tools/golden.html
 *   node tools/make-golden.js --check  exit 1 if either file is stale
 *
 * The hash may change only together with an ENGINE_VERSION bump: if the
 * version is unchanged and the hash differs, this refuses to write (a physics
 * change without a version bump would make old run records replay differently).
 * --force overrides that, for use while the engine is still pre-release.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'tests', 'golden.json');
const HTML_PATH = path.join(ROOT, 'tools', 'golden.html');

const SCENARIO = {
  about: 'Golden hash (engine spec d-4): steady preset, seed 1, these commands submitted at these ticks, then stepped to `ticks`.',
  config: { seed: 1, start: 'steady' },
  commands: [
    { tick: 100, cmd: { type: 'setPromoter', gene: 'fliC', level: 4 } },
    { tick: 600, cmd: { type: 'setPromoter', gene: 'lacY', level: 1 } },
    { tick: 1200, cmd: { type: 'setMedium', lactose_mM: 5 } },
    { tick: 2400, cmd: { type: 'setMedium', glucose_mM: 0.005 } },
    { tick: 4000, cmd: { type: 'setDrug', drug: 'chloramphenicol', dose: 0.3 } },
    { tick: 4600, cmd: { type: 'setDrug', drug: 'chloramphenicol', dose: 0 } },
    { tick: 5000, cmd: { type: 'setDegradation', gene: 'fliC', perS: 0.001 } },
    { tick: 5500, cmd: { type: 'setMRNAHalfLife', gene: 'ptsG', s: 90 } },
    { tick: 6000, cmd: { type: 'setPromoter', gene: 'lacZ', level: 'nope' } },
    { tick: 7000, cmd: { type: 'setDrug', drug: 'rifampicin', dose: 1 } },
    { tick: 7300, cmd: { type: 'setDrug', drug: 'rifampicin', dose: 0 } },
    { tick: 8000, cmd: { type: 'setMedium', glucose_mM: 10 } },
    { tick: 8500, cmd: { type: 'setRBS', gene: 'lacZ', rbs: 2 } },
    { tick: 9000, cmd: { type: 'setKnockout', gene: 'aaImp', knockout: true } },
  ],
  ticks: 10000,
};

/** Runs the scenario on a BTC namespace (Node modules or the browser global). */
function runGolden(BTC, scenario) {
  const cell = new BTC.Cell(scenario.config);
  let next = 0;
  for (let t = 0; t < scenario.ticks; t++) {
    while (next < scenario.commands.length && scenario.commands[next].tick === t) cell.command(scenario.commands[next++].cmd);
    cell.step();
  }
  return { hash: cell.hash(), presetHash: cell.presetHash, engineVersion: BTC.ENGINE_VERSION };
}

function nodeBTC() {
  const cell = require(path.join(ROOT, 'src', 'engine', 'btc-cell.js'));
  return { Cell: cell.Cell, ENGINE_VERSION: cell.ENGINE_VERSION };
}

function golden() {
  const r = runGolden(nodeBTC(), SCENARIO);
  return Object.assign({ engineVersion: r.engineVersion }, SCENARIO, { presetHash: r.presetHash, hash: r.hash });
}

const BEGIN = '<script type="application/json" id="golden">';
const END = '</script>';

function embed(html, g) {
  const i = html.indexOf(BEGIN), j = html.indexOf(END, i);
  if (i < 0 || j < 0) throw new Error('tools/golden.html has no golden JSON block');
  return html.slice(0, i + BEGIN.length) + '\n' + JSON.stringify(g, null, 2) + '\n' + html.slice(j);
}

function embedded(html) {
  const i = html.indexOf(BEGIN), j = html.indexOf(END, i);
  return JSON.parse(html.slice(i + BEGIN.length, j));
}

if (require.main === module) {
  const g = golden();
  const text = JSON.stringify(g, null, 2) + '\n';
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const old = fs.existsSync(JSON_PATH) ? JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) : null;
  if (process.argv.includes('--check')) {
    const fresh = old && JSON.stringify(old) === JSON.stringify(g) && JSON.stringify(embedded(html)) === JSON.stringify(g);
    console.log(fresh ? 'golden is fresh: ' + g.hash : 'golden is STALE: stored ' + (old && old.hash) + ', computed ' + g.hash);
    process.exit(fresh ? 0 : 1);
  }
  if (old && old.engineVersion === g.engineVersion && old.hash !== g.hash && !process.argv.includes('--force')) {
    console.error(`the golden hash changed (${old.hash} → ${g.hash}) but ENGINE_VERSION is still ${g.engineVersion}: bump it, or pass --force`);
    process.exit(1);
  }
  fs.writeFileSync(JSON_PATH, text);
  fs.writeFileSync(HTML_PATH, embed(html, g));
  console.log('golden hash ' + g.hash + ' (engine ' + g.engineVersion + ')');
}

module.exports = { SCENARIO, runGolden, golden, embedded };
