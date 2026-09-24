// L-7 (LEVELS §12.1, §10.4): a headless reference play of each scored level gives a run file
// whose verify-run recomputation matches its score, flags and code; editing one command in the
// record, or a stored answer, gives a mismatch. The instructor tools read it too: the CLI
// (tools/verify-run.js, tools/decode-codes.js) and the published single-file tools/codes.html.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const K = require('../src/game/btc-level-kit.js');
const RUN = require('../src/game/btc-level-runner.js');
const CODE = require('../src/game/btc-code.js');
const { levels } = require('../tools/decode-codes.js');
const { build } = require('../build.js');

const ROOT = path.join(__dirname, '..');
const scored = levels().filter((d) => d.scored && d.monitor);
const byId = {};
for (const d of levels()) byId[d.id] = d;
const copy = (x) => JSON.parse(JSON.stringify(x));

test('L-7: every scored level\'s reference play verifies (score, flags, code); an edited command or answer does not', () => {
  assert.ok(scored.length >= 2, 'levels 1.2 and 1.4 at least');
  for (const def of scored) {
    // A misconception play too, so flags are in the file.
    for (const name of ['reference', Object.keys(def.solutions).find((n) => n !== 'reference')]) {
      const p = RUN.game.playHeadless(def, { variantSeed: K.variantSeed(11, def.id, 0), solution: name });
      const file = copy(p.runner.runFile({ build: 'test' }));
      const res = RUN.game.verifyRunFile(file, { levels: byId });
      assert.equal(res.ok, true, def.id + ' ' + name + ': ' + JSON.stringify(res.checks.filter((c) => !c.ok)));
      assert.equal(res.recomputed.code, p.code);
      // Edit the first user command's argument: the replay no longer reaches the recorded hash.
      const bad = copy(file);
      const e = bad.records.task.log.find((x) => x.source === 'user' && x.type === 'setPromoter');
      e.args.level = e.args.level === 2 ? 1 : 2;
      const r2 = RUN.game.verifyRunFile(bad, { levels: byId });
      assert.equal(r2.ok, false, def.id + ': an edited command still verified');
      assert.ok(r2.checks.some((c) => !c.ok && /hash|code|efficiency/.test(c.what)), JSON.stringify(r2.checks.filter((c) => !c.ok)));
      // A changed prediction changes P (or the flags), and the stored result no longer matches.
      const ans = copy(file);
      const choice = def.predictions.find((it) => it.kind === 'choice');
      if (choice) ans.level.answers[choice.id] = choice.options.findIndex((o) => !o.ok);
      else ans.level.answers.sketch = [[0, 0], [20, 0]];
      assert.equal(RUN.game.verifyRunFile(ans, { levels: byId }).ok, false, def.id + ': an edited answer still verified');
    }
  }
});

test('L-7: tools/verify-run.js prints "match" for a good file and exits 1 for a tampered one; tools/decode-codes.js decodes its code', () => {
  const def = byId['1.2'];
  const p = RUN.game.playHeadless(def, { variantSeed: K.variantSeed(5, def.id, 0), solution: 'reference' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'btc-run-'));
  try {
    const good = path.join(dir, p.runner.fileName());
    fs.writeFileSync(good, JSON.stringify(p.runner.runFile({ build: 'test' })));
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'verify-run.js'), good], { encoding: 'utf8' });
    assert.match(out, /\nmatch\n?$/);
    const tampered = JSON.parse(fs.readFileSync(good, 'utf8'));
    tampered.level.result.X = 3;                                 // claims both Expert objectives
    tampered.level.answers.ppm = 90;                             // … with an answer far from the demo's copies per mRNA
    const badPath = path.join(dir, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify(tampered));
    let code = 0, text = '';
    try { execFileSync(process.execPath, [path.join(ROOT, 'tools', 'verify-run.js'), badPath], { encoding: 'utf8' }); } catch (e) { code = e.status; text = e.stdout; }
    assert.equal(code, 1);
    assert.match(text, /MISMATCH/);
    // The decoder: a CSV with the same code twice (two students) and a typo.
    const csv = path.join(dir, 'canvas.csv');
    fs.writeFileSync(csv, 'name,id,"1: Paste your code"\nAda,1,"' + p.code + '"\nGrace,2,"' + p.code.toLowerCase() + '"\nTypo,3,"' + p.code.slice(0, -1) + (p.code.slice(-1) === 'A' ? 'B' : 'A') + '"\n');
    const outCsv = path.join(dir, 'out.csv');
    const dec = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'decode-codes.js'), csv, '--csv', outCsv], { encoding: 'utf8' });
    assert.match(dec, /3 code\(s\): 2 valid, 1 invalid, 2 with warnings/);
    assert.match(dec, /same code as Grace/);
    const rows = CODE.parseCSV(fs.readFileSync(outCsv, 'utf8'));
    assert.deepEqual(rows[0], CODE.TABLE_COLUMNS);
    assert.equal(rows[1][rows[0].indexOf('level')], def.id);
    assert.equal(rows[1][rows[0].indexOf('variantValues')], def.variantLabel(p.runner.variant));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('L-8: the decoded table names the Expert objectives and flags met, and the variant\'s values', () => {
  const def = byId['1.2'];
  const flagIds = def.flags.map((f) => (typeof f === 'string' ? f : f.id));
  const code = CODE.encode({ level: def.code, variantSeed: 777, G: 1, E: 90, P: 75, D: [1, 2], X: 2, flags: 0b101, attempt: 2, runs: 1,
    engine: '1.1.0', content: def.version, digest: 'abc123' });
  const [row] = CODE.table([{ student: 'Ada', code }], levels(), { engine: '1.1.0' });
  assert.equal(row.valid, true);
  assert.equal(row.level, '1.2');
  assert.equal(row.variantValues, def.variantLabel(def.variant(777)));
  assert.equal(row.expert, '2 of 2');
  assert.equal(row.flags, [flagIds[0], flagIds[2]].join(', '));
  assert.equal(row.total, String(CODE.decode(code).total));
  const [unknown] = CODE.table([{ student: 'X', code: CODE.encode({ level: '99', variantSeed: 1, G: 1, E: 1, P: 1, D: [0, 1], X: 0, flags: 0, attempt: 1, runs: 1, engine: '1.1.0', content: 1, digest: '000000' }) }], levels(), {});
  assert.equal(unknown.valid, false);
  assert.match(unknown.reason, /unknown level 99/);
});

test('§10.4: the build publishes tools/codes.html as one file with the engine, game and level scripts inlined, and no request leaves it', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'btc-build-'));
  try {
    const r = build({ out, quiet: true });
    const html = fs.readFileSync(path.join(out, 'tools', 'codes.html'), 'utf8');
    assert.ok(!/<script src=/.test(html), 'an external script remains');
    assert.ok(!/\s(?:src|href)="(?:\/|[a-z]+:\/\/)/i.test(html), 'an absolute or off-site URL');
    for (const f of ['src/engine/btc-cell.js', 'src/engine/btc-replay.js', 'src/game/btc-code.js', 'src/game/btc-level-runner.js', 'src/levels/btc-level-1-2.js']) {
      const head = fs.readFileSync(path.join(ROOT, f), 'utf8').slice(0, 300);
      assert.ok(html.indexOf(head) >= 0, f + ' is inlined');
    }
    assert.ok(html.indexOf('src="../') < 0);
    assert.ok(r.codesBytes < 900 * 1024);
    // In the repository it loads the same files from ../src (runnable by file:// from a checkout).
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'codes.html'), 'utf8');
    const tags = Array.from(src.matchAll(/<script src="\.\.\/([^"]+)"><\/script>/g), (m) => m[1]);
    assert.deepEqual(tags, require('../build-files.json').filter((f) => !f.startsWith('src/app/')));
    // The service worker leaves pages other than the app to the network (a cached index.html must not answer for codes.html).
    const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
    assert.match(sw, /path !== scope && path !== scope \+ 'index\.html'/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
