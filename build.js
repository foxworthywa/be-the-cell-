// Builds the single-file lab: dist/index.html with every script inlined, plus
// the service worker, manifest and icons (LAB_UI §10.2).
// Usage: node build.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const MAX_BYTES = 450 * 1024, WARN_BYTES = 350 * 1024;

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

  // 5. Size budget.
  const bytes = Buffer.byteLength(html);
  if (bytes > MAX_BYTES) throw new Error('dist/index.html is ' + Math.round(bytes / 1024) + ' KB, over the 450 KB budget');
  if (bytes > WARN_BYTES && !o.quiet) console.warn('warning: dist/index.html is ' + Math.round(bytes / 1024) + ' KB (budget 450 KB)');
  if (!o.quiet) console.log('wrote dist/index.html (' + Math.round(bytes / 1024) + ' KB), build ' + buildHash);
  return { buildHash, bytes, out };
}

if (require.main === module) build();
module.exports = { build };
