// U-5 (LAB_UI §8.2; LEVELS §15 item 5): the palette, checked the way it was chosen. Machado
// 2009 colour-vision simulation (severity 1.0, in linear RGB) and CIE Lab ΔE76: every pair of
// gene colours (the seven lab genes and lacI, lacA of M2; 1.1 colours its candidates from the
// same nine) stays ΔE ≥ 18 apart in light and ≥ 8 in dark, with normal vision and under each
// simulation; gene and phase-band colours keep ≥ 3:1 against the panel and the cell's inside;
// text tokens keep ≥ 4.5:1 against the panel.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PAL = require('../src/app/btc-palette.js');

const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp = (x) => Math.max(0, Math.min(1, x));
const simulate = (rgb, m) => { const l = rgb.map(lin); return m.map((r) => clamp(gam(clamp(r[0] * l[0] + r[1] * l[1] + r[2] * l[2])))); };
function lab(rgb) {
  const [r, g, b] = rgb.map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const lum = (rgb) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('U-5: the ΔE76 and contrast helpers agree with known values (negative controls)', () => {
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9);
  assert.ok(dE(hex('#ff0000'), hex('#ff0000')) === 0);
  // Red and green collapse under deuteranopia: far apart normally, close once simulated.
  const red = hex('#d62728'), green = hex('#2ca02c');
  assert.ok(dE(red, green) > 60);
  assert.ok(dE(simulate(red, MACHADO.deutan), simulate(green, MACHADO.deutan)) < 25);
});

test('U-5: gene colours stay apart under each colour-vision simulation, and stand out on the panel and the cell', () => {
  const ids = PAL.DISPLAY_COLORS;
  assert.deepEqual(ids.slice().sort(), PAL.ALL_GENE_IDS.filter((id) => id !== 'araE').map((id) => 'g-' + id).sort(),
    'the display colours are the gene colours (araE, 1.1 only, takes a display colour)');
  for (const [theme, minDE, what] of [['light', 18, 'light'], ['dark', 8, 'dark']]) {
    const P = PAL[theme];
    for (const mode of ['normal', 'protan', 'deutan', 'tritan']) {
      const f = mode === 'normal' ? (x) => x : (x) => simulate(x, MACHADO[mode]);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const d = dE(f(hex(P[ids[i]])), f(hex(P[ids[j]])));
          assert.ok(d >= minDE, `${what} ${mode}: ${ids[i]} and ${ids[j]} are ΔE ${d.toFixed(1)} apart (needs ${minDE})`);
        }
      }
    }
    for (const id of ids.concat(['band-G', 'band-L', 'band-B'])) {
      for (const surface of ['panel', 'inside']) {
        const c = contrast(P[id], P[surface]);
        assert.ok(c >= 3, `${what}: ${id} on ${surface} is ${c.toFixed(2)}:1`);
      }
    }
    for (const t of ['ink', 'muted', 'accent', 'warn-ink']) {
      const c = contrast(P[t], P.panel);
      assert.ok(c >= 4.5, `${what}: text ${t} on panel is ${c.toFixed(2)}:1`);
    }
  }
});
