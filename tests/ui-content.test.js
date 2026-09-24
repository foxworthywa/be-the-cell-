// U-3: every student-facing string passes the text rules (LAB_UI §7.3).
// Narrator templates, expanded for every gene with the app's own phrases, in
// named and hidden modes, get the full rules (one sentence, ≤ 140 characters,
// no digits, no "!", no teleology). Every other string in BTC.content gets the
// reduced rules (≤ 140, no "!", no teleology); job lines are ≤ 60 characters.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/app/btc-content.js');
const N = require('../src/shared/btc-narrate.js');
const CMD = require('../src/engine/btc-commands.js');

function strings(obj, where, out) {
  if (typeof obj === 'string') out.push({ where, text: obj });
  else if (Array.isArray(obj)) obj.forEach((x, i) => strings(x, where + '[' + i + ']', out));
  else if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) strings(obj[k], where + '.' + k, out);
  return out;
}

test('U-3: narrator sentences with the app\'s gene phrases pass the full text rules', () => {
  const all = N.expandAll(C.narratorPhrases());
  const bad = all.filter((s) => N.lint(s.text).length).map((s) => `${s.key}/${s.gene}: "${s.text}" (${N.lint(s.text).join('; ')})`);
  assert.deepEqual(bad, []);
  assert.ok(all.length >= 150);
});

test('U-3: every other string in BTC.content is ≤ 140 characters, with no "!" and no teleology', () => {
  const all = strings(C, 'content', []);
  const bad = [];
  for (const s of all) {
    if (s.text.length > 140) bad.push(`${s.where}: longer than 140 (${s.text.length})`);
    if (s.text.indexOf('!') >= 0) bad.push(`${s.where}: exclamation mark`);
    if (N.TELEOLOGY.test(s.text)) bad.push(`${s.where}: teleology "${N.TELEOLOGY.exec(s.text)[0]}"`);
  }
  assert.deepEqual(bad, []);
  assert.ok(all.length > 150, `${all.length} strings checked`);
  // Negative control: the lint catches what it must.
  const trap = strings({ a: 'LacY tries to import lactose.', b: 'Go!', c: 'x'.repeat(141) }, 't', []);
  assert.equal(trap.filter((s) => s.text.length > 140 || s.text.indexOf('!') >= 0 || N.TELEOLOGY.test(s.text)).length, 3);
});

test('U-3: job lines are ≤ 60 characters; every rejection code has text; names hide cleanly', () => {
  for (const id of C.GENE_IDS) assert.ok(C.genes[id].job.length <= 60, `${id} job line is ${C.genes[id].job.length} characters`);
  for (const code of CMD.CODES) assert.ok(C.rejections[code], `no text for rejection ${code}`);
  assert.equal(C.geneWords('fliC', false).name, 'Gene G');
  assert.equal(C.geneWords('ptsG', false).job, 'Unknown');
  assert.equal(C.geneWords('lacZ', true).name, 'β-galactosidase');
  // Seven genes in slot order, matching the engine's catalog.
  const cat = require('../src/engine/btc-catalog.js');
  assert.deepEqual(C.GENE_IDS, cat.STRAINS['m1-lab'].genes.map((g) => g.id));
});
