// The lab's files and build: app lint (U-11), the build and its relative URLs
// (engine spec b-2, LAB_UI U-12), and loading every app file without a DOM (U-13).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'app');
const FILES = require('../build-files.json');
const appFiles = fs.readdirSync(APP).filter((f) => f.endsWith('.js')).sort();
const { build } = require('../build.js');

function codeOnly(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; out += q + q; continue;
    }
    out += c; i++;
  }
  return out;
}

// Real-time timers are allowed only for UI chrome: the service worker, toasts, the tap chip and the scrub readout.
const TIMER_ALLOWED = { 'btc-pwa.js': true, 'btc-layout.js': true, 'btc-cellview.js': true, 'btc-graphs-panel.js': true };

test('U-11: no Math.random in the app; timers only in the UI-chrome allow-list', () => {
  const found = [];
  for (const f of appFiles) {
    const code = codeOnly(fs.readFileSync(path.join(APP, f), 'utf8'));
    if (/Math\.random\b/.test(code)) found.push(f + ': Math.random');
    if (/\bset(Timeout|Interval)\b/.test(code) && !TIMER_ALLOWED[f]) found.push(f + ': timer');
    if (/\bsetInterval\b/.test(code)) found.push(f + ': setInterval');
  }
  assert.deepEqual(found, []);
});

test('U-11: index.html has no title tooltips, no hover rules that change content, and 16 px controls', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/\stitle=/.test(html), 'a title= attribute (tooltips carry no information here)');
  for (const m of html.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
    assert.ok(!/\bcontent\s*:/.test(m[2]) && !/display\s*:/.test(m[2]), 'hover rule changes content: ' + m[1].trim());
  }
  assert.match(html, /button, input, select, textarea \{[^}]*font-size: 16px/, 'controls must use a 16 px font so iOS does not zoom');
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
});

test('U-13: every app file loads through require without a DOM, and in a bare context with only `self`', () => {
  const listed = FILES.filter((f) => f.startsWith('src/app/')).map((f) => path.basename(f));
  assert.deepEqual(listed.slice().sort(), appFiles, 'build-files.json and src/app differ');
  for (const f of appFiles) {
    const src = fs.readFileSync(path.join(APP, f), 'utf8');
    assert.match(src.split('\n')[0], /^\/\/ @deps/, `${f} has no @deps line`);
    assert.ok(require(path.join(APP, f)), `${f} did not load through require`);
  }
  const ctx = vm.createContext({});
  vm.runInContext('var self = this;', ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const B = ctx.self.BTC;
  for (const name of ['content', 'palette', 'format', 'prefs', 'layout', 'Loop', 'cellgeom', 'controls', 'CellView', 'Plot',
    'StatusStrip', 'GenesPanel', 'MediumPanel', 'GraphsPanel', 'NarratorHold', 'NarratorView', 'pwa', 'app']) {
    assert.ok(B[name], `BTC.${name} is not defined`);
  }
});

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'btc-build-')); }

test('b-2 / U-12: the bundle inlines every script, stamps the build hash and keeps every URL relative', () => {
  const out = tmpDir();
  try {
    const r = build({ out, quiet: true });
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(!/<script src=/.test(html), 'an external script remains');
    // LEVELS.md §16: 1.5 MB throw, 1.2 MB warn; the scripts are inlined without comments and indentation (strip).
    assert.ok(r.bytes <= 1229 * 1024, `bundle is ${Math.round(r.bytes / 1024)} KB, over the 1.2 MB warning`);
    assert.match(html, new RegExp('<meta name="btc-build" content="' + r.buildHash + '">'));
    assert.ok(html.indexOf("window.BTC_BUILD = '" + r.buildHash + "'") >= 0);
    for (const m of html.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
      assert.ok(!/^(\/|[a-z]+:\/\/)/i.test(m[1]), 'absolute or off-site URL in dist/index.html: ' + m[1]);
    }
    const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
    assert.ok(sw.indexOf(r.buildHash) >= 0 && sw.indexOf('__BUILD_HASH__') < 0, 'sw.js is stamped');
    const assets = JSON.parse(/const ASSETS = (\[[^\]]*\])/.exec(sw)[1].replace(/'/g, '"'));
    for (const a of assets) {
      assert.ok(a.startsWith('./'), 'service-worker asset is not relative: ' + a);
      if (a !== './') assert.ok(fs.existsSync(path.join(out, a)), 'precached asset missing: ' + a);
    }
    const man = JSON.parse(fs.readFileSync(path.join(out, 'manifest.webmanifest'), 'utf8'));
    for (const k of ['id', 'start_url', 'scope']) assert.ok(/^\.\//.test(man[k]), `manifest ${k} is not relative: ${man[k]}`);
    for (const icon of man.icons) {
      assert.ok(!/^(\/|[a-z]+:)/i.test(icon.src), 'icon URL is not relative: ' + icon.src);
      assert.ok(fs.existsSync(path.join(out, icon.src)), 'icon missing: ' + icon.src);
    }
    assert.ok(man.icons.some((i) => i.purpose === 'maskable'));
    const pwa = fs.readFileSync(path.join(APP, 'btc-pwa.js'), 'utf8');
    assert.match(pwa, /register\('\.\/sw\.js', \{ scope: '\.\/' \}\)/, 'service worker registration must be relative');
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('b-2: the build throws on a missing or extra script tag, and uses a function replacer', () => {
  const real = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const out = tmpDir();
  try {
    const noTag = (f) => (f === 'index.html' ? real(f).replace('<script src="src/app/btc-plot.js"></script>\n', '') : real(f));
    assert.throws(() => build({ out, quiet: true, read: noTag }), /missing: src\/app\/btc-plot\.js/);
    const extra = (f) => (f === 'index.html' ? real(f).replace('</head>', '<script src="x.js"></script>\n</head>') : real(f));
    assert.throws(() => build({ out, quiet: true, read: extra }), /extra: x\.js/);
    // "$'" and "$&" are replacement patterns for a string replacer; they must survive verbatim.
    const dollars = (f) => (f === 'src/app/btc-format.js' ? real(f) + "\nvar keepDollars = \"keep: $' $& $$ </script>\";\n" : real(f));
    build({ out, quiet: true, read: dollars });
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(html.indexOf("\"keep: $' $& $$ <\\/script>\"") >= 0);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// The bundle's scripts go in without comments and indentation (build.js strip): a tokenizer that copies every token
// byte for byte, so the stripped code is the same program.
// ---------------------------------------------------------------------------------------------------------------
const { strip } = require('../build.js');

test('b-2: strip drops comments and needless whitespace and keeps every token, and every line break a semicolon may hang on', () => {
  const cases = [
    ['a + +b; c - -d; e++ / 2; f = g / h / i;', 'a+ +b;c- -d;e++/2;f=g/h/i;'],
    ['x = /[/]"\\//g.test(y) // a "comment"\nz()', 'x=/[/]"\\//g.test(y)\nz()'],
    ['const s = `a ${ b + `c${ d }` } e`; /* one\nor two */ f()', 'const s=`a ${b+`c${d}`} e`;f()'],
    ['a = b /* a comment over\ntwo lines is a line break */ c()', 'a=b\nc()'],
    ['return\nx', 'return\nx'],
    ['f()\n(g)()', 'f()\n(g)()'],
    ['a = b\n+c', 'a=b\n+c'],
    ['if (a) {\n  b();\n}\n', 'if(a){b();}'],
    ['x = 1 .toFixed; y = a ? .5 : 1', 'x=1 .toFixed;y=a? .5:1'],
    ["case 'x': return 'y // no comment';", "case 'x':return 'y // no comment';"],
    ['r = /re/ instanceof RegExp', 'r=/re/ instanceof RegExp'],
    ['const o = {\n  a: 1,\n  b: [2, 3],\n};', 'const o={a:1,b:[2,3],};'],
    ['x = y\n.z', 'x=y\n.z'],
    ['n = a-- > 0', 'n=a-- >0'],
    ['s = "a\\\nb"', 's="a\\\nb"'],
    ['if (x) return /a/.test(y); else throw /b/', 'if(x)return/a/.test(y);else throw/b/'],
  ];
  for (const [src, want] of cases) assert.equal(strip(src), want, JSON.stringify(src));
  assert.throws(() => strip('a = "open'), /unterminated string/);
  assert.throws(() => strip('a = `open'), /unterminated template/);
  assert.throws(() => strip('/* open'), /unterminated comment/);
});

test('b-2: every bundled script strips to code that compiles, strips again to itself, and is at most two thirds its size', () => {
  let before = 0, after = 0;
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8'), out = strip(src, f);
    assert.doesNotThrow(() => new vm.Script(out, { filename: f }), f);
    assert.equal(strip(out, f), out, f + ': strip is not a fixed point');
    before += src.length; after += out.length;
  }
  assert.ok(after <= (2 / 3) * before, `stripped ${after} of ${before} characters`);
});

test('b-2: the stripped scripts run the same: the engine gives the golden hash, and a level reference play the same code', () => {
  const ctx = vm.createContext({});
  vm.runInContext('var self = this;', ctx);
  for (const f of FILES.filter((x) => !x.startsWith('src/app/'))) vm.runInContext(strip(fs.readFileSync(path.join(ROOT, f), 'utf8'), f), ctx, { filename: f });
  const B = ctx.self.BTC, G = require('./golden.json');
  const cell = new B.Cell(G.config);
  let k = 0;
  for (let t = 0; t < G.ticks; t++) {
    while (k < G.commands.length && G.commands[k].tick === t) cell.command(G.commands[k++].cmd);
    cell.step();
  }
  assert.equal(cell.hash(), G.hash, 'the golden hash from the stripped engine');
  const RUN = require('../src/game/btc-level-runner.js'), LV = require('../src/game/btc-levels.js'), K = require('../src/game/btc-level-kit.js');
  const vs = K.variantSeed(3, '1.2', 0);
  const plain = RUN.game.playHeadless(LV.validate(require('../src/levels/btc-level-1-2.js')), { variantSeed: vs, solution: 'reference', today: () => '2026-01-01' });
  const reg = B.levels.build(B.levelDefs);
  const stripped = B.game.playHeadless(reg.get ? reg.get('1.2') : B.levelDefs['1.2'], { variantSeed: vs, solution: 'reference', today: () => '2026-01-01' });
  assert.equal(stripped.code, plain.code);
});
