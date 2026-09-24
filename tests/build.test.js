// Engineering checks on the source files: determinism lint (s1), loading in
// Node and in a bare browser-like context (b-1), and the generated parameter
// table in docs/BIOLOGY.md (b-3).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'src', 'engine');
const FILES = require('../build-files.json');
const SHARED = path.join(ROOT, 'src', 'shared');
const engineFiles = fs.readdirSync(ENGINE).filter((f) => f.endsWith('.js')).sort();
const sharedFiles = fs.existsSync(SHARED) ? fs.readdirSync(SHARED).filter((f) => f.endsWith('.js')).sort() : [];

// Comments and string contents removed, so the lint sees only code.
function codeOnly(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; out += q + q; continue;
    }
    out += c; i++;
  }
  return out;
}

const FORBIDDEN = [
  [/Math\.random\b/, 'Math.random'], [/Math\.exp\b/, 'Math.exp'], [/Math\.log\w*\b/, 'Math.log'], [/Math\.pow\b/, 'Math.pow'],
  [/Math\.sqrt\b/, 'Math.sqrt'], [/Math\.(sin|cos|tan)\b/, 'Math trig'], [/Math\.hypot\b/, 'Math.hypot'], [/Math\.cbrt\b/, 'Math.cbrt'],
  [/\*\*/, '**'], [/\bDate\b/, 'Date'], [/\bperformance\b/, 'performance'], [/\.sort\(/, '.sort('],
  [/for\s*\(\s*(?:const|let|var)?\s*[\w$]+\s+in\s/, 'for…in'], [/\btoFixed\b/, 'toFixed'], [/\bIntl\b/, 'Intl'],
];

test('s1: engine code uses only operations that give identical results in every browser', () => {
  const found = [];
  for (const f of engineFiles) {
    const code = codeOnly(fs.readFileSync(path.join(ENGINE, f), 'utf8'));
    for (const [re, name] of FORBIDDEN) if (re.test(code)) found.push(`${f}: ${name}`);
  }
  assert.deepEqual(found, [], 'forbidden APIs found: ' + found.join(', '));
});

test('s1: the lint itself catches a forbidden call (negative control)', () => {
  const code = codeOnly('// Math.exp in a comment is fine\nconst s = "Math.sqrt";\nconst y = Math.exp(x);');
  assert.ok(FORBIDDEN.some(([re]) => re.test(code)));
  assert.ok(!FORBIDDEN.some(([re]) => re.test(codeOnly('// Math.exp\nconst s = "Math.sqrt ** 2";'))));
});

const depsOf = (src) => {
  const m = /^\/\/ @deps(.*)$/m.exec(src.split('\n')[0]);
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : null;
};
const requiresOf = (src) => Array.from(src.matchAll(/require\('\.\/([\w-]+)\.js'\)/g), (m) => m[1]);

test('s1: shared renderer helpers never use Math.random (rendering must not add randomness)', () => {
  const found = sharedFiles.filter((f) => /Math\.random\b/.test(codeOnly(fs.readFileSync(path.join(SHARED, f), 'utf8'))));
  assert.deepEqual(found, []);
});

test('b-1: every engine and shared file starts with an @deps line that matches its require list', () => {
  const all = engineFiles.map((f) => path.join(ENGINE, f)).concat(sharedFiles.map((f) => path.join(SHARED, f)));
  for (const file of all) {
    const f = path.basename(file);
    const src = fs.readFileSync(file, 'utf8');
    const deps = depsOf(src);
    assert.ok(deps, `${f} has no @deps header on line 1`);
    assert.deepEqual(requiresOf(src), deps, `${f}: @deps ${deps.join(' ')} vs require ${requiresOf(src).join(' ')}`);
  }
});

test('b-1: build-files.json lists every engine and shared file once, in an order that loads dependencies first', () => {
  const listed = FILES.filter((f) => f.startsWith('src/engine/')).map((f) => path.basename(f));
  assert.deepEqual(listed.slice().sort(), engineFiles, 'build-files.json and src/engine differ');
  const listedShared = FILES.filter((f) => f.startsWith('src/shared/')).map((f) => path.basename(f));
  assert.deepEqual(listedShared.slice().sort(), sharedFiles, 'build-files.json and src/shared differ');
  assert.equal(new Set(FILES).size, FILES.length, 'a file is listed twice');
  const seen = new Set();
  for (const f of FILES) {
    const deps = depsOf(fs.readFileSync(path.join(ROOT, f), 'utf8')) || [];
    for (const d of deps) assert.ok(seen.has(d), `${f} loads before its dependency ${d}`);
    seen.add(path.basename(f, '.js'));
  }
});

const GLOBAL_NAME = {
  'btc-math': 'math', 'btc-prng': 'prng', 'btc-params': 'params', 'btc-catalog': 'catalog', 'btc-presets': 'presets',
  'btc-genome': 'genome', 'btc-queue': 'queue', 'btc-expression': 'expression', 'btc-metabolism': 'metabolism',
  'btc-growth': 'growth', 'btc-commands': 'commands', 'btc-events': 'events', 'btc-observe': 'observe', 'btc-cell': 'Cell',
  'btc-replay': 'replay', 'btc-dots': 'dots', 'btc-recorder': 'Recorder', 'btc-narrate': 'narrate',
};

test('b-1: each file loads through require and in a bare context with only `self`, defining BTC.<name>', () => {
  const ctx = vm.createContext({});
  vm.runInContext('var self = this;', ctx);
  for (const f of FILES.filter((x) => !x.startsWith('src/app/'))) {
    const name = path.basename(f, '.js');
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(require(path.join(ROOT, f)), `${f} did not load through require`);
    vm.runInContext(src, ctx, { filename: f });
    assert.ok(GLOBAL_NAME[name], `${name} has no expected global`);
    assert.ok(ctx.self.BTC && ctx.self.BTC[GLOBAL_NAME[name]], `${f} did not define BTC.${GLOBAL_NAME[name]}`);
  }
  // The browser build runs the same simulation as Node, bit for bit.
  const B = ctx.self.BTC;
  const a = new B.Cell({ seed: 5, start: 'steady' });
  a.advance(500);
  const { Cell } = require('./helpers.js');
  const b = new Cell({ seed: 5, start: 'steady' });
  b.advance(500);
  assert.equal(a.hash(), b.hash());
});

test('b-3: the parameter table in docs/BIOLOGY.md is exactly what tools/param-table.js generates', () => {
  const table = require('../tools/param-table.js');
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'BIOLOGY.md'), 'utf8');
  assert.equal(table.extract(doc), table.block(), 'BIOLOGY.md is stale: run node tools/param-table.js --write');
});

test('b-3: every parameter carries a value, unit, source and confidence code; rRef is stored per second', () => {
  const P = require('../src/engine/btc-params.js');
  for (const e of P.list) {
    assert.ok(typeof e.value === 'number' && e.value === e.value, `${e.id} value`);
    assert.ok(e.unit && e.source, `${e.id} lacks a unit or source`);
    assert.ok(/^(V|PV|U|D|G|V\/G|V\/D|U\/V)$/.test(e.confidence), `${e.id} confidence ${e.confidence}`);
  }
  assert.equal(P.byId.rRef_ptsG.value, 1.7 / 60);
  assert.equal(P.byId.rRef_ptsG.unit, '/s per copy');
  assert.equal(P.byId.glucoseLow.value, 0.005);
});
