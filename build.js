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
// LEVELS.md §16 (coordinator decision with levels 1.1 and 1.7): 1.5 MB throw, 1.2 MB warn; no comment stripping
// (Pages serves the file gzipped, about a quarter of its size).
const MAX_BYTES = 1536 * 1024, WARN_BYTES = 1229 * 1024;

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
    const src = read(f);
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
module.exports = { build };
