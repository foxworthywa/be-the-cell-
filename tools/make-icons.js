// Renders the PNG icons from the SVGs, once, by hand (LAB_UI §9.2):
//   icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon-180.png
// Uses the globally installed Playwright; never runs "playwright install".
// The PNGs are committed; the build only copies them.
// Usage: node tools/make-icons.js
'use strict';
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  try { return require('/opt/node22/lib/node_modules/playwright'); } catch (e) { /* fall through */ }
  try { return require('playwright'); } catch (e) { return null; }
}

const ICONS = path.join(__dirname, '..', 'icons');
const JOBS = [
  { svg: 'icon.svg', out: 'icon-192.png', size: 192 },
  { svg: 'icon.svg', out: 'icon-512.png', size: 512 },
  { svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
  // iOS draws its own rounded mask, so the apple-touch icon is the full-bleed variant.
  { svg: 'icon-maskable.svg', out: 'apple-touch-icon-180.png', size: 180 },
];

async function main() {
  const pw = loadPlaywright();
  if (!pw) { console.log('skipped: playwright not installed'); return; }
  const browser = await pw.chromium.launch();
  try {
    for (const job of JOBS) {
      const page = await browser.newPage({ viewport: { width: job.size, height: job.size } });
      const svg = fs.readFileSync(path.join(ICONS, job.svg), 'utf8');
      await page.setContent('<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:' +
        job.size + 'px;height:' + job.size + 'px}</style>' + svg);
      await page.screenshot({ path: path.join(ICONS, job.out), omitBackground: true });
      await page.close();
      console.log('wrote icons/' + job.out);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
