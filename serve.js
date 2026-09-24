// Zero-dependency static server for the built lab (LAB_UI §10.1).
// Usage: node serve.js [--root dist] [--port 8080]
// Serves dist/ by default; `--root .` serves the unbuilt source (no service worker then).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function createServer(rootDir) {
  const root = path.resolve(rootDir);
  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(root, '.' + p);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
      const name = path.basename(file);
      const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' };
      // The page and the worker must never be served stale, or an update could not arrive.
      if (name === 'sw.js' || name === 'index.html') headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
}

if (require.main === module) {
  const root = arg('root', path.join(__dirname, 'dist'));
  const port = Number(arg('port', process.env.PORT || 8080));
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error('No index.html in ' + root + '. Run "node build.js" first (or pass --root .).');
    process.exit(1);
  }
  createServer(root).listen(port, () => console.log('Be the Cell: http://localhost:' + port + '/  (serving ' + path.relative(process.cwd(), root) + ')'));
}
module.exports = { createServer };
