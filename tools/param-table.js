#!/usr/bin/env node
/*
 * Generates the parameter table in docs/BIOLOGY.md from src/engine/btc-params.js
 * (engine spec §8, test b-3). The table sits between the markers
 *   <!-- param-table:start -->  and  <!-- param-table:end -->
 * and everything outside them is left alone.
 *
 *   node tools/param-table.js           print the table
 *   node tools/param-table.js --write   rewrite the block in docs/BIOLOGY.md
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PARAMS = require(path.join(__dirname, '..', 'src', 'engine', 'btc-params.js'));
const DOC = path.join(__dirname, '..', 'docs', 'BIOLOGY.md');
const START = '<!-- param-table:start -->';
const END = '<!-- param-table:end -->';

// Numbers as a reader expects them: up to 4 significant digits, scientific notation when very large or small.
function formatValue(x) {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = x.toExponential(3).split('e');
    return m.replace(/\.?0+$/, '') + '×10^' + Number(e);
  }
  return String(Number(x.toPrecision(4)));
}

const cell = (s) => String(s).replace(/\|/g, '\\|');

function table() {
  const rows = ['| id | value | unit | source | conf. | note |', '|---|---|---|---|---|---|'];
  for (const e of PARAMS.list) {
    rows.push('| `' + e.id + '` | ' + formatValue(e.value) + ' | ' + cell(e.unit) + ' | ' + cell(e.source) + ' | ' +
      e.confidence + ' | ' + cell(e.note) + ' |');
  }
  return rows.join('\n');
}

/** The text between the markers, exactly as it should appear in docs/BIOLOGY.md. */
function block() {
  return '\n' + table() + '\n';
}

function extract(doc) {
  const i = doc.indexOf(START), j = doc.indexOf(END);
  if (i < 0 || j < i) throw new Error('docs/BIOLOGY.md has no param-table markers');
  return doc.slice(i + START.length, j);
}

if (require.main === module) {
  if (process.argv.includes('--write')) {
    const doc = fs.readFileSync(DOC, 'utf8');
    const i = doc.indexOf(START), j = doc.indexOf(END);
    if (i < 0 || j < i) throw new Error('docs/BIOLOGY.md has no param-table markers');
    fs.writeFileSync(DOC, doc.slice(0, i + START.length) + block() + doc.slice(j));
    console.log('updated ' + path.relative(process.cwd(), DOC));
  } else {
    process.stdout.write(table() + '\n');
  }
}

module.exports = { table, block, extract, formatValue, START, END };
