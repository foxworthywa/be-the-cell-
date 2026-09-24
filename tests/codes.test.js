// L-8 (LEVELS §12.1, §10): completion codes. Encode/decode round trip for
// 1,000 random payloads; every single-character substitution in 1,000 codes
// is caught; normalisation (O/0, I/L/1, case, spaces, dashes); the decoder
// reads a sample Canvas CSV and flags duplicates.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CODE = require('../src/game/btc-code.js');
const S = require('../src/game/btc-score.js');
const K = require('../src/game/btc-level-kit.js');

const LEVELS = ['P0', '11', '12', '14', '17'];

function randomPayload(r) {
  const level = r.pick(LEVELS);
  const scored = level !== 'P0';
  const Dt = r.int(1, 2);
  return {
    level, variantSeed: scored ? r.int(0, 0x3FFFFFFF) : 0, G: r.int(0, 1),
    E: scored ? r.int(0, 100) : null, P: scored ? r.int(0, 100) : null, D: [r.int(0, Dt), Dt],
    X: r.int(0, 15), flags: r.int(0, 255), attempt: r.int(0, 999), runs: r.int(1, 99),
    engine: r.int(0, 31) + '.' + r.int(0, 31) + '.' + r.int(0, 31), content: r.int(1, 99),
    digest: r.shuffle('0123456789abcdef'.split('')).slice(0, 6).join(''),
  };
}

test('L-8: the spec examples have the right shape (format BTC2: predictions are not scored)', () => {
  const c = CODE.encode({ level: '12', variantSeed: CODE.decodeSeed('7K2Q9C'), G: 1, E: 100, P: 75, D: [1, 2], X: 1, flags: 2,
    attempt: 1, runs: 2, engine: '1.1.0', content: 1, digest: '3f9a0b' });
  assert.match(c, /^BTC2-12-7K2Q9C-G1E100P75D12X1-F02-A1N2-R110C1-3F9A0B-[0-9A-HJKMNP-TV-Z]{7}$/);
  const p = CODE.encode({ level: 'P0', variantSeed: 0, G: 1, E: null, P: null, D: [1, 1], X: 0, flags: 0, attempt: 1, runs: 1,
    engine: '1.1.0', content: 1, digest: '000000' });
  assert.match(p, /^BTC2-P0-000000-G1ENAPNAD11X0-F00-A1N1-R110C1-000000-/);
  const d = CODE.decode(p);
  assert.equal(d.ok, true);
  assert.equal(d.format, 2);
  assert.equal(d.total, null, 'the opening has no total');
  assert.equal(CODE.decode(c).total, S.total({ G: 1, E: 1, P: 0.75, D: [1, 2] }));
  assert.equal(CODE.decode(c).total, 85, 'PROLOGUE §1.4: 45 + 25 + 15, whatever P was');
  // A level in the new pattern reports P as NA; its total is the same.
  const n = CODE.encode({ level: '12', variantSeed: 5, G: 1, E: 80, P: null, D: [2, 2], X: 0, flags: 0, attempt: 1, runs: 1,
    engine: '1.1.0', content: 3, digest: 'abcdef' });
  assert.match(n, /-G1E80PNAD22X0-/);
  assert.equal(CODE.decode(n).total, 95, '45 + 25 × 0.8 + 30');
  assert.equal(S.total({ G: 0, E: 1, P: 1, D: [2, 2] }), 30, 'without the goal only the Explain part counts');
});

test('L-8: codes of the first format (BTC1) still decode, with the old weights and a warning', () => {
  const payload = { level: '12', variantSeed: CODE.decodeSeed('7K2Q9C'), G: 1, E: 100, P: 75, D: [1, 2], X: 1, flags: 2,
    attempt: 1, runs: 2, engine: '1.1.0', content: 1, digest: '3f9a0b' };
  const old = CODE.encode(payload, { format: 'BTC1' });
  assert.match(old, /^BTC1-12-7K2Q9C-G1E100P75D12X1-F02-A1N2-R110C1-3F9A0B-[0-9A-HJKMNP-TV-Z]{7}$/);
  const d = CODE.decode(old);
  assert.equal(d.ok, true);
  assert.equal(d.format, 1);
  assert.equal(d.old, true);
  assert.equal(d.total, 85, 'the old §5.9 example: 40 + 20 + 15 + 10');
  assert.equal(d.total, S.totalV1({ G: 1, E: 1, P: 0.75, D: [1, 2] }));
  const oldP = CODE.decode(CODE.encode({ level: 'P0', variantSeed: 0, G: 1, E: null, P: null, D: [1, 1], X: 0, flags: 0, attempt: 1, runs: 1,
    engine: '1.1.0', content: 1, digest: '000000' }, { format: 'BTC1' }));
  assert.equal(oldP.total, null);
  // The same payload in the two formats is two different codes, each with its own checksum.
  assert.notEqual(old.slice(5), CODE.encode(payload).slice(5));
  const rows = CODE.analyse([{ student: 'A', code: old }, { student: 'B', code: CODE.encode(Object.assign({}, payload, { variantSeed: 9 })) }], {});
  assert.ok(rows[0].warnings.some((w) => /older code format \(BTC1\)/.test(w)), rows[0].warnings.join('; '));
  assert.ok(!rows[1].warnings.some((w) => /older code format/.test(w)));
  assert.equal(CODE.findCode('my code ' + old.toLowerCase()), old);
});

test('L-8: encode/decode round trip for 1,000 random payloads', () => {
  const r = K.rng(2026, 'codes');
  for (let i = 0; i < 1000; i++) {
    const p = randomPayload(r);
    const code = CODE.encode(p);
    const d = CODE.decode(code);
    assert.equal(d.ok, true, code + ' ' + d.message);
    for (const k of ['level', 'variantSeed', 'G', 'E', 'P', 'X', 'flags', 'attempt', 'runs', 'engine', 'content']) {
      assert.deepEqual(d[k], p[k], k + ' in ' + code);
    }
    assert.deepEqual(d.D, p.D);
    assert.equal(d.digest, p.digest.toUpperCase());
    assert.equal(d.override, p.attempt === 0);
    assert.ok(code.length <= 64, code.length + ' characters');
  }
});

test('L-8: every single-character substitution in 1,000 codes is caught', () => {
  const r = K.rng(7, 'subst');
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ-';
  let tried = 0;
  for (let i = 0; i < 1000; i++) {
    const code = CODE.encode(randomPayload(r));
    for (let pos = 0; pos < code.length; pos++) {
      let ch;
      do { ch = ALPHA[r.int(0, ALPHA.length - 1)]; } while (ch === code[pos]);
      const bad = code.slice(0, pos) + ch + code.slice(pos + 1);
      tried++;
      assert.equal(CODE.decode(bad).ok, false, 'accepted ' + bad + ' (from ' + code + ')');
    }
  }
  assert.ok(tried > 50000);
});

test('L-8: normalisation: case, O/0, I and L/1, spaces, line breaks and long dashes', () => {
  const code = CODE.encode({ level: '14', variantSeed: 0x3FFFFFFF, G: 1, E: 50, P: 100, D: [2, 2], X: 3, flags: 0xA5, attempt: 11,
    runs: 1, engine: '1.1.0', content: 2, digest: 'ABC123' });
  const typed = code.toLowerCase().replace(/0/g, 'o').replace(/1/g, (m, i) => (i % 2 ? 'l' : 'I'))
    .replace(/-/g, (m, i) => (i % 3 ? '–' : '—')).replace(/(.{7})/g, '$1 ');
  const d = CODE.decode(typed + '\n');
  assert.equal(d.ok, true, typed);
  assert.equal(d.code, code);
  assert.equal(CODE.decodeSeed('zzzzzz'), 0x3FFFFFFF);
  assert.equal(CODE.decodeSeed('7k2q9c'), CODE.decodeSeed('7K2Q9C'));
  assert.equal(CODE.decodeSeed('7K2Q9'), null);
  assert.equal(CODE.decodeSeed('7K2Q9U'), null, 'U is not Crockford');
  assert.equal(CODE.encodeSeed(CODE.decodeSeed('0000O1')), '000001');
  // Wrong shapes and out-of-range values are refused with a reason.
  assert.equal(CODE.decode('hello').error, 'format');
  assert.equal(CODE.decode(code.slice(0, -1) + (code.slice(-1) === '0' ? '1' : '0')).error, 'checksum');
});

test('L-8: the decoder reads a Canvas "Student analysis" CSV and flags duplicates', () => {
  const mk = (seed, attempt, extra) => CODE.encode(Object.assign({ level: '12', variantSeed: seed, G: 1, E: 80, P: 75, D: [1, 2], X: 0, flags: 0,
    attempt, runs: 1, engine: '1.1.0', content: 1, digest: '0a1b2c' }, extra || {}));
  const shared = mk(1234, 1);
  const csv = [
    'name,id,sis_id,section,section_id,submitted,attempt,"12345: Paste your Be the Cell completion code for level 1.2.",1.0,n correct,n incorrect,score',
    'Ada Lovelace,1,a1,Bio 101,9,2026-09-30,1,"' + shared + '",1.0,1,0,1',
    'Grace Hopper,2,g2,Bio 101,9,2026-09-30,1,"My code: ' + shared.toLowerCase().replace(/-/g, ' - ') + '",1.0,1,0,1',
    'Barbara McClintock,3,b3,Bio 101,9,2026-09-30,1,"' + mk(1234, 2) + '",1.0,1,0,1',
    'Rosalind Franklin,4,r4,Bio 101,9,2026-09-30,1,"' + mk(98765, 0) + '",1.0,1,0,1',
    'Lynn Margulis,5,l5,Bio 101,9,2026-09-30,1,"' + mk(55555, 1, { engine: '1.0.0' }) + '",1.0,1,0,1',
    'Nobody,6,n6,Bio 101,9,2026-09-30,1,"I lost it, sorry",1.0,0,1,0',
    'Typo Person,7,t7,Bio 101,9,2026-09-30,1,"' + mk(4242, 1).replace(/-F00-/, '-F01-') + '",1.0,0,1,0',
  ].join('\r\n');
  const entries = CODE.readCodes(csv);
  assert.deepEqual(entries.map((e) => e.student), ['Ada Lovelace', 'Grace Hopper', 'Barbara McClintock', 'Rosalind Franklin', 'Lynn Margulis', 'Typo Person']);
  const rows = CODE.analyse(entries, { engine: '1.1.0', levels: { 12: { id: '1.2', version: 1 } } });
  const by = (name) => rows.find((x) => x.student === name);
  assert.ok(by('Ada Lovelace').warnings.some((w) => /same code as Grace Hopper/.test(w)));
  assert.ok(by('Grace Hopper').warnings.some((w) => /same code as Ada Lovelace/.test(w)));
  assert.ok(by('Barbara McClintock').warnings.some((w) => /same variant as Ada Lovelace, Grace Hopper/.test(w)));
  assert.ok(by('Rosalind Franklin').warnings.some((w) => /override/.test(w)));
  assert.ok(by('Lynn Margulis').warnings.some((w) => /engine 1\.0\.0 differs/.test(w)));
  assert.equal(by('Typo Person').ok, false);
  assert.equal(by('Typo Person').error, 'checksum');
  // A plain list, one code per line, and an unknown level.
  const list = CODE.readCodes(shared + '\n' + mk(1, 1, { level: '99' }) + '\n');
  assert.equal(list.length, 2);
  const lr = CODE.analyse(list, { levels: { 12: { id: '1.2', version: 1 } } });
  assert.equal(lr[1].error, 'level');
  // CSV quoting: commas, doubled quotes and line breaks inside a field.
  assert.deepEqual(CODE.parseCSV('a,"b, ""c""\nd",e\r\n1,2,3'), [['a', 'b, "c"\nd', 'e'], ['1', '2', '3']]);
});
