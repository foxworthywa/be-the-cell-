// @deps btc-content btc-layout
/*
 * Be the Cell: the Prologue's scenes (LEVELS §7.P): four labelled line
 * drawings (the student's body, the pancreas with one islet, one beta cell,
 * a ribosome on an mRNA), each marked "Drawing, not to scale" with a scale
 * bar. They are pictures, not simulations. Scene 5 fades scene 4 out; scenes
 * 6 and 7 are the live lab bacterium, which the app shows on the lab screen.
 *
 * The drawings are inline SVG (≤ 4 KB each) in palette tokens, so they follow
 * the light and dark themes. Labels come from the level's TEXT. A scene
 * change is a 300 ms zoom (a CSS animation, none under reduced motion).
 *
 * PrologueView.svg(picture, text) is pure (tested: size, labels, tokens).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.PrologueView = factory(B.content, B.layout);
  }
})(typeof self !== 'undefined' ? self : this, function (C, LY) {
  'use strict';

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Shared pieces: a label with a leader line, and a scale bar with end ticks.
  const label = (x, y, text, anchor) => '<text class="pl-t" x="' + x + '" y="' + y + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(text) + '</text>';
  const leader = (x1, y1, x2, y2) => '<path class="pl-k" d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '"/>';
  function scaleBar(x, y, len, text, vertical) {
    if (vertical) {
      return '<path class="pl-sb" d="M' + x + ' ' + y + 'v' + (-len) + 'M' + (x - 5) + ' ' + y + 'h10M' + (x - 5) + ' ' + (y - len) + 'h10"/>' +
        '<text class="pl-s" x="' + (x - 9) + '" y="' + (y - len / 2 + 4) + '" text-anchor="end">' + esc(text) + '</text>';
    }
    return '<path class="pl-sb" d="M' + x + ' ' + y + 'h' + len + 'M' + x + ' ' + (y - 5) + 'v10M' + (x + len) + ' ' + (y - 5) + 'v10"/>' +
      '<text class="pl-s" x="' + (x + len / 2) + '" y="' + (y - 9) + '" text-anchor="middle">' + esc(text) + '</text>';
  }
  const open = (w, h) => '<svg class="pl-svg" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">';

  /** The SVG markup for one picture; text is the level's TEXT (labels and scale words). */
  function svg(picture, text) {
    const L = text.labels, S = text.scale;
    if (picture === 'body') {
      // A neutral outline, about 1.7 m tall: 1 m is 118 px.
      return open(320, 250) +
        '<g class="pl-l pl-f">' +
        '<rect x="128" y="134" width="22" height="94" rx="10"/><rect x="170" y="134" width="22" height="94" rx="10"/>' +
        '<rect x="110" y="70" width="18" height="78" rx="9"/><rect x="192" y="70" width="18" height="78" rx="9"/>' +
        '<rect x="130" y="62" width="60" height="86" rx="18"/><rect x="152" y="52" width="16" height="14" rx="4"/>' +
        '<circle cx="160" cy="36" r="19"/></g>' +
        '<path class="pl-l pl-a" d="M150 114c6-6 20-7 30-3 4 2 3 6-1 7-9 2-20 1-29-4z"/>' +
        leader(182, 113, 226, 104) + label(230, 108, L.pancreas) +
        scaleBar(64, 228, 118, S.m1, true) + '</svg>';
    }
    if (picture === 'pancreas') {
      // The pancreas (about 15 cm; 10 cm is 148 px) and one islet enlarged (about 150 µm across; 100 µm is 59 px).
      let cells = '';
      const pts = [[232, 158], [214, 148], [250, 146], [206, 170], [258, 172], [232, 186], [216, 192], [248, 194], [232, 136]];
      for (const [x, y] of pts) cells += '<circle cx="' + x + '" cy="' + y + '" r="10"/>';
      return open(320, 250) +
        '<path class="pl-l pl-f" d="M28 92c0-30 40-38 62-22 30 22 70 2 110-4 40-6 78 0 90 12 8 9-4 20-26 22-44 4-84 22-128 32-40 9-108 14-108-40z"/>' +
        '<path class="pl-l pl-m" d="M46 100c50 4 110-16 222-24"/>' +
        '<circle class="pl-l pl-a" cx="150" cy="96" r="6"/>' +
        '<path class="pl-k" d="M155 101L192 146M146 102L204 200"/>' +
        '<circle class="pl-l pl-f" cx="232" cy="166" r="44"/><g class="pl-l pl-a">' + cells + '</g>' +
        label(40, 36, L.pancreas) + leader(62, 42, 74, 62) +
        label(284, 122, L.islet, 'middle') +
        scaleBar(28, 170, 148, S.cm10) + scaleBar(203, 240, 59, S.um100) + '</svg>';
    }
    if (picture === 'betaCell') {
      // One beta cell, about 12 µm across (10 µm is 146 px), its nucleus and the insulin gene.
      let granules = '';
      const g = [[70, 120], [84, 150], [96, 88], [210, 90], [226, 124], [214, 168], [120, 190], [180, 196], [74, 180], [238, 150]];
      for (const [x, y] of g) granules += '<circle cx="' + x + '" cy="' + y + '" r="4"/>';
      return open(320, 250) +
        '<path class="pl-l pl-f" d="M60 72c30-26 120-40 170-14 30 16 36 70 22 112-12 36-60 52-112 48-50-4-90-30-96-70-4-30 0-58 16-76z"/>' +
        '<g class="pl-l pl-m">' + granules + '</g>' +
        '<circle class="pl-l pl-n" cx="150" cy="134" r="42"/>' +
        '<path class="pl-l pl-m" d="M122 120c8-10 16 10 24 0s16 10 24 0M124 146c8-10 16 10 24 0s16 10 24 0"/>' +
        '<path class="pl-l pl-a pl-w" d="M146 120c4-5 8 5 12 0"/>' +
        label(24, 40, L.betaCell) + leader(56, 46, 84, 70) +
        label(40, 234, L.nucleus) + leader(70, 222, 120, 162) +
        label(300, 40, L.insulinGene, 'end') + leader(262, 46, 160, 118) +
        scaleBar(160, 240, 146, S.um10) + '</svg>';
    }
    if (picture === 'ribosome') {
      // A ribosome on an mRNA, about 25 nm across (30 nm is 120 px), with the protein chain coming out.
      let beads = '';
      const b = [[146, 104], [136, 92], [130, 78], [136, 64], [148, 56], [160, 48]];
      for (const [x, y] of b) beads += '<circle cx="' + x + '" cy="' + y + '" r="6"/>';
      let ticks = '';
      for (let x = 30; x <= 290; x += 20) ticks += 'M' + x + ' 180v6';
      return open(320, 250) +
        '<path class="pl-l pl-m" d="M20 183h280' + ticks + '"/>' +
        '<path class="pl-l pl-f" d="M110 130c0-30 26-42 52-42s54 12 54 40c0 22-20 34-54 34s-52-10-52-32z"/>' +
        '<path class="pl-l pl-f" d="M118 184c0-16 18-24 44-24s42 8 42 24-18 22-42 22-44-6-44-22z"/>' +
        '<g class="pl-l pl-a">' + beads + '</g>' +
        label(226, 122, L.ribosome) + leader(224, 118, 212, 120) +
        label(300, 206, L.mRNA, 'end') +
        label(174, 40, L.chain) +
        scaleBar(170, 236, 120, S.nm30) + '</svg>';
    }
    return open(320, 250) + '</svg>';
  }

  class PrologueView {
    constructor(app) { this.app = app; this.root = null; this.key = null; }

    mount(root) {
      const h = LY.h, app = this.app;
      this.root = root;
      this.title = h('span', { class: 'pl-title' });
      this.figure = h('figure', { class: 'pl-figure', role: 'img' });
      this.art = h('div', { class: 'pl-art' });
      this.note = h('figcaption', { class: 'pl-note' });
      this.figure.appendChild(this.note);
      this.figure.appendChild(this.art);
      root.appendChild(h('div', { class: 'pl-bar' }, [
        h('button', { class: 'btn levels-btn', type: 'button', 'aria-label': C.game.levelsLabel, onclick: () => app.leaveLevel() },
          [h('span', { class: 'levels-icon', 'aria-hidden': 'true' }), h('span', { class: 'levels-word', text: C.game.levels })]),
        this.title,
      ]));
      root.appendChild(h('div', { class: 'pl-stage' }, this.figure));
    }

    /** Shows scene (from the level definition) with def's TEXT; a new picture zooms in, a faded one fades. */
    show(scene, def, title) {
      LY.setText(this.title, title);
      const text = def.text;
      const key = scene.picture;
      if (key !== this.key) {
        this.key = key;
        this.art.innerHTML = svg(key, text);
        this.figure.setAttribute('aria-label', text.alt[key] + ' ' + text.notToScale + '.');
        LY.setText(this.note, text.notToScale);
        this.figure.classList.remove('pl-zoom');
        void this.figure.offsetWidth;          // restart the zoom animation
        this.figure.classList.add('pl-zoom');
      }
      this.figure.classList.toggle('pl-fade', !!scene.fade);
    }

    reset() { this.key = null; if (this.art) this.art.textContent = ''; }
  }

  PrologueView.svg = svg;
  return PrologueView;
});
