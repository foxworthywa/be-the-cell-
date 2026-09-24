// c-2 (engine spec §14.3; LAB_UI U-11 part): the UI only reads the cell. It
// sends commands and reads cell.observe(); it never assigns to cell.* or
// view.*. Until src/app exists this passes with nothing to check, and a
// negative control shows the lint would catch a violation.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'src', 'app');

// Comments and string contents removed, so only code is checked.
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

// cell.x = …, view.a.b += …, cell['x'] = …, view.x++, ++cell.x, delete view.x (but not ==, ===, =>).
const TARGET = String.raw`\b(?:cell|view)\s*(?:\.\s*[\w$]+|\[[^\]]*\])+`;
const WRITES = [
  new RegExp(TARGET + String.raw`\s*(?:[-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=(?![=>])`),
  new RegExp(TARGET + String.raw`\s*(?:\+\+|--)`),
  new RegExp(String.raw`(?:\+\+|--)\s*` + TARGET),
  new RegExp(String.raw`\bdelete\s+` + TARGET),
];

function violations(src) {
  const found = [];
  codeOnly(src).split('\n').forEach((line, i) => {
    if (WRITES.some((re) => re.test(line))) found.push(`line ${i + 1}: ${line.trim()}`);
  });
  return found;
}

function appFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...appFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('c-2: no file in src/app assigns to cell.* or view.*', (t) => {
  const files = appFiles(APP);
  t.diagnostic(files.length ? `${files.length} app files checked` : 'src/app does not exist yet: nothing to check');
  const found = [];
  for (const f of files) for (const v of violations(fs.readFileSync(f, 'utf8'))) found.push(`${path.relative(APP, f)} ${v}`);
  assert.deepEqual(found, []);
});

test('c-2: the lint catches writes and ignores reads (negative control)', () => {
  const bad = ['cell.E = 1;', 'view.genes[0].protein = 5;', 'view.energy.E += 0.1;', 'cell.tick++;', '--view.cell.V_fL;',
    "cell['AA'] = 0;", 'delete view.flux;', 'cell.env.glucose_mM ??= 1;'];
  for (const s of bad) assert.equal(violations(s).length, 1, s);
  const ok = ['const e = view.energy.E;', 'if (view.tick === last) return;', 'cell.command({ type: "setPromoter" });',
    'const f = (view) => view.tick;', 'x = cell.observe();', '// cell.E = 1 in a comment', 'const s = "view.x = 1";',
    'if (cell.tick == 3) {}', 'a[cell.tick] = 1;'];
  for (const s of ok) assert.deepEqual(violations(s), [], s);
});
