// Builds the single-file lab: dist/index.html with every script inlined, plus
// the service worker, manifest and icons (LAB_UI §10.2), and the instructor's
// code decoder dist/tools/codes.html (LEVELS §10.4), also a single file.
// Usage: node build.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
// LEVELS.md §16 (coordinator decision with levels 1.1 and 1.7): 1.5 MB throw, 1.2 MB warn (Pages serves the file
// gzipped, about a quarter of its size). The app's scripts are inlined without their comments and indentation
// (strip below); tools/codes.html keeps its sources as written.
const MAX_BYTES = 1536 * 1024, WARN_BYTES = 1229 * 1024;

// ---------------------------------------------------------------------------------------------------------------
// strip(src): the script without comments and needless whitespace. A tokenizer, never a regular expression over
// code: it knows strings, template literals (and the code inside ${…}), regular-expression literals (told from
// division by the token before) and comments. Every token is copied byte for byte; only what lies between tokens
// changes. A gap between two tokens becomes nothing, one space where the two would otherwise run together or
// form another token (a + +b, 1 .x, x - ->), or one line break wherever automatic semicolon insertion could
// depend on it (a line break is dropped only after a token that cannot end a statement, or before } ) ] , ;).
// ---------------------------------------------------------------------------------------------------------------
const PUNCTUATORS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=',
  '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
// Two characters that must not touch: the start of a longer punctuator, a comment, or an HTML comment in a script.
const JOINS = new Set(PUNCTUATORS.map((p) => p.slice(0, 2)).concat(['//', '/*', '*/', '<!', '->', '?.', '..']));
// After these words a / starts a regular expression; after any other word or number it divides.
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do',
  'else', 'yield', 'await']);
const NL_AFTER = '{([,;:?=&|*%<>!~^';    // a token ending in one of these cannot end a statement …
const NL_BEFORE = '})],;';               // … nor can a line break before one of these start one
const isWord = (ch) => /[\w$#\\\u0080-\uffff]/.test(ch);
const isQuote = (ch) => ch === '"' || ch === "'" || ch === '`';
const NUMBER = /(?:0[xXoObB][\da-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)n?/y;

function strip(src, name) {
  const n = src.length, where = (i) => (name || 'script') + ' at ' + i;
  const parts = [];
  let last = null, lastText = '', lastEnd = '', gap = 0;   // gap: 0 none, 1 space, 2 line break
  const stack = [];                                          // 'b' a brace, 't' a template's ${
  const emit = (text, kind) => {
    if (last && gap) {
      const a = lastEnd, b = text[0];
      const opener = last === 'punct' || last === 'open';
      const lineBreak = gap === 2 && !(opener && NL_AFTER.indexOf(a) >= 0) && NL_BEFORE.indexOf(b) < 0;
      if (lineBreak) parts.push('\n');
      else if ((isWord(a) && isWord(b)) || (last === 're' && isWord(b)) || JOINS.has(a + b) ||
        (/[\d.]/.test(a) && b === '.') || (a === '.' && /\d/.test(b)) ||
        (isQuote(a) && (isWord(b) || isQuote(b))) || (isWord(a) && isQuote(b))) parts.push(' ');
    }
    parts.push(text);
    last = kind; lastText = text; lastEnd = text[text.length - 1]; gap = 0;
  };
  const regexAllowed = () => {
    if (!last) return true;
    if (last === 'word') return REGEX_AFTER.has(lastText);
    if (last === 'open') return true;
    if (last !== 'punct') return false;                      // after a number, string, template or regex: division
    return ')]}'.indexOf(lastEnd) < 0 && lastText !== '++' && lastText !== '--';
  };
  // A template from its ` (or from the } that closes a ${…}) to its closing ` or its next ${.
  const template = (i) => {
    let j = i + 1;
    while (j < n) {
      const d = src[j];
      if (d === '\\') { j += 2; continue; }
      if (d === '`') { emit(src.slice(i, j + 1), 'tpl'); return j + 1; }
      if (d === '$' && src[j + 1] === '{') { emit(src.slice(i, j + 2), 'open'); stack.push('t'); return j + 2; }
      j++;
    }
    throw new Error('strip: unterminated template literal in ' + where(i));
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '\n' || c === '\u2028' || c === '\u2029') { gap = 2; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '\u00a0' || c === '\ufeff') { if (!gap) gap = 1; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; if (!gap) gap = 1; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) throw new Error('strip: unterminated comment in ' + where(i));
      if (/[\n\u2028\u2029]/.test(src.slice(i, e))) gap = 2; else if (!gap) gap = 1;
      i = e + 2; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j += src[j + 1] === '\r' && src[j + 2] === '\n' ? 3 : 2;
        else if (src[j] === '\n') throw new Error('strip: unterminated string in ' + where(i));
        else j++;
      }
      if (j >= n) throw new Error('strip: unterminated string in ' + where(i));
      emit(src.slice(i, j + 1), 'str'); i = j + 1; continue;
    }
    if (c === '`') { i = template(i); continue; }
    if (c === '{') { stack.push('b'); emit('{', 'punct'); i++; continue; }
    if (c === '}') {
      if (stack.pop() === 't') { i = template(i); continue; }
      emit('}', 'punct'); i++; continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] || ''))) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(src);
      emit(m[0], 'num'); i += m[0].length; continue;
    }
    if (isWord(c)) {
      let j = i + 1;
      while (j < n && isWord(src[j])) j++;
      emit(src.slice(i, j), 'word'); i = j; continue;
    }
    if (c === '/' && regexAllowed()) {
      let j = i + 1, inClass = false;
      for (;;) {
        const d = src[j];
        if (j >= n || d === '\n') throw new Error('strip: unterminated regular expression in ' + where(i));
        if (d === '\\') { j += 2; continue; }
        if (inClass) { if (d === ']') inClass = false; } else if (d === '[') inClass = true; else if (d === '/') break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      emit(src.slice(i, j), 're'); i = j; continue;
    }
    let p = c;
    for (const q of PUNCTUATORS) if (src.startsWith(q, i)) { p = q; break; }
    emit(p, 'punct'); i += p.length;
  }
  if (stack.length) throw new Error('strip: unbalanced braces in ' + (name || 'script'));
  return parts.join('');
}

function build(opts) {
  const o = opts || {};
  // opts.read(relPath) lets the tests feed altered sources (default: the file on disk).
  const read = o.read || ((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const files = JSON.parse(read('build-files.json'));
  let html = read('index.html');

  // 1. index.html must carry exactly the build-files.json scripts, in order.
  const tags = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), (m) => m[1]);
  const same = tags.length === files.length && tags.every((t, i) => t === files[i]);
  if (!same) {
    const missing = files.filter((f) => tags.indexOf(f) < 0), extra = tags.filter((t) => files.indexOf(t) < 0);
    throw new Error('index.html scripts do not match build-files.json' +
      (missing.length ? '; missing: ' + missing.join(', ') : '') + (extra.length ? '; extra: ' + extra.join(', ') : '') +
      (!missing.length && !extra.length ? '; the order differs' : ''));
  }

  // 2. Inline each file. A function replacer, so "$&" and friends in the source are not patterns.
  for (const f of files) {
    const src = o.strip === false ? read(f) : strip(read(f), f);
    const tag = '<script src="' + f + '"></script>';
    html = html.replace(tag, () => '<script>\n' + src.replace(/<\/script/gi, '<\\/script') + '\n</script>');
  }
  if (/<script src=/.test(html)) throw new Error('a <script src=…> tag was left after inlining');

  // 3. Build hash of the inlined page, stamped into the page and the service worker.
  const buildHash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
  html = html.replace('<meta charset="utf-8">', () => '<meta charset="utf-8">\n<meta name="btc-build" content="' + buildHash + '">');
  html = html.replace('<script>\n', () => '<script>window.BTC_BUILD = \'' + buildHash + '\';</script>\n<script>\n');

  // 4. Outputs.
  const out = o.out || DIST;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  const sw = read('sw.js');
  if (sw.indexOf('__BUILD_HASH__') < 0) throw new Error('sw.js has no __BUILD_HASH__ placeholder');
  fs.writeFileSync(path.join(out, 'sw.js'), sw.split('__BUILD_HASH__').join(buildHash));
  fs.copyFileSync(path.join(ROOT, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
  for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) {
    if (/\.(png|svg)$/.test(f)) fs.copyFileSync(path.join(ROOT, 'icons', f), path.join(out, 'icons', f));
  }

  // 5. The instructor's code decoder (LEVELS §10.4, §14 decision 5): tools/codes.html with the engine, game and
  // level scripts inlined the same way, published at …/tools/codes.html. It must load exactly the non-app files.
  let codes = read('tools/codes.html');
  const toolTags = Array.from(codes.matchAll(/<script src="\.\.\/([^"]+)"><\/script>/g), (m) => m[1]);
  const toolWant = files.filter((f) => !f.startsWith('src/app/'));
  if (toolTags.length !== toolWant.length || toolTags.some((t, i) => t !== toolWant[i])) {
    throw new Error('tools/codes.html scripts do not match build-files.json (every file before src/app/, in order)');
  }
  for (const f of toolWant) {
    const src = read(f);
    codes = codes.replace('<script src="../' + f + '"></script>', () => '<script>\n' + src.replace(/<\/script/gi, '<\\/script') + '\n</script>');
  }
  if (/<script src=/.test(codes)) throw new Error('a <script src=…> tag was left in tools/codes.html after inlining');
  fs.mkdirSync(path.join(out, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(out, 'tools', 'codes.html'), codes);

  // 6. Size budget.
  const bytes = Buffer.byteLength(html);
  if (bytes > MAX_BYTES) throw new Error('dist/index.html is ' + Math.round(bytes / 1024) + ' KB, over the 1.5 MB budget');
  if (bytes > WARN_BYTES && !o.quiet) console.warn('warning: dist/index.html is ' + Math.round(bytes / 1024) + ' KB (warning at 1.2 MB, budget 1.5 MB)');
  if (!o.quiet) console.log('wrote dist/index.html (' + Math.round(bytes / 1024) + ' KB), build ' + buildHash + '; dist/tools/codes.html (' + Math.round(Buffer.byteLength(codes) / 1024) + ' KB)');
  return { buildHash, bytes, out, codesBytes: Buffer.byteLength(codes) };
}

if (require.main === module) build();
module.exports = { build, strip };
