// @deps btc-content btc-layout
/*
 * Be the Cell: the DNA editor of level 1.7 (LEVELS §5.10) and the lac-region drawings.
 *
 * The editor shows the two stretches of DNA the student may write, as strips of parts:
 *   Repressor gene:  [promoter] [lacI]
 *   lac operon:      [CRP site] [promoter] [operator] [lacZ lacY lacA (not editable)]
 * Every part is a button (≥ 48 px tall) showing what it is now; tapping one opens its options
 * under the strip (rows ≥ 52 px, each part with a one-line description). A plain summary of
 * the choices sits under the strips, with nothing that grades them. "Run" asks for
 * confirmation in place ("Once it runs, nothing can be changed. Run it?"): the letting-go
 * beat. At 360 px the strips wrap; wider, each strip is one row.
 *
 * Pure drawing helpers (inline SVG, palette tokens only, so both themes work):
 *   DesignerView.regionSvg(design, state, {words, title})  the lac region with LacI and CRP–cAMP
 *                                                          on it (the cell view's panel)
 *   DesignerView.strainSvg(rowId, words)                    a truth-table strain, its difference outlined
 *   DesignerView.summary(design, text)                      the "This design: …" sentence
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.DesignerView = factory(B.content, B.layout);
  }
})(typeof self !== 'undefined' ? self : this, function (C, LY) {
  'use strict';

  const PARTS = Object.freeze(['lacI.promoter', 'lacI.allele', 'lac.crpSite', 'lac.promoter', 'lac.operator']);
  const STRIPS = Object.freeze([
    { key: 'repressorUnit', parts: ['lacI.promoter', 'lacI.allele'] },
    { key: 'lacUnit', parts: ['lac.crpSite', 'lac.promoter', 'lac.operator'], genes: true },
  ]);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const get = (d, path) => { const [a, b] = path.split('.'); return d[a][b]; };
  const set = (d, path, v) => { const [a, b] = path.split('.'); const out = JSON.parse(JSON.stringify(d)); out[a][b] = v; return out; };

  /** The option text of a part's current value ("normal", "×4", …); short: the part button's form, if the option has one. */
  function optionText(text, path, v, short) {
    const o = text.parts[path].options.find((x) => x.v === v);
    return o ? (short && o.short) || o.t : String(v);
  }

  /** "This design: lac promoter ×4 · operator absent · repressor gene deleted · CRP site absent." */
  function summary(d, text) {
    const S = text.summaryParts, F = (t, v) => t.replace('{v}', v);
    const parts = [
      F(S.lacPromoter, optionText(text, 'lac.promoter', d.lac.promoter)),
      F(S.operator, optionText(text, 'lac.operator', d.lac.operator)),
      F(S.lacI, optionText(text, 'lacI.allele', d.lacI.allele)),
    ];
    if (d.lacI.allele !== 'deleted') parts.push(F(S.lacIPromoter, optionText(text, 'lacI.promoter', d.lacI.promoter)));
    parts.push(F(S.crp, optionText(text, 'lac.crpSite', d.lac.crpSite)));
    return text.summary.replace('{parts}', parts.join(' · '));
  }

  // ---------------------------------------------------------------------------
  // SVG pieces (x along the DNA, the DNA line at y)
  // ---------------------------------------------------------------------------
  const V = (name) => 'var(--' + name + ')';
  function arrow(x, y, strong) {
    const w = strong ? 3 : 2;
    return '<path d="M' + x + ' ' + y + 'v-12h10" fill="none" stroke="' + V('ink') + '" stroke-width="' + w + '"/>' +
      '<path d="M' + (x + 9) + ' ' + (y - 16) + 'l5 4-5 4z" fill="' + V('ink') + '"/>';
  }
  function geneBox(x, y, w, color, label, dashed) {
    return '<rect x="' + x + '" y="' + (y - 7) + '" width="' + w + '" height="14" rx="3" fill="' + (dashed ? V('panel') : V(color)) + '" stroke="' +
      (dashed ? V('muted') : V(color)) + '" stroke-width="1.5"' + (dashed ? ' stroke-dasharray="4 3"' : '') + '/>' +
      (label ? '<text x="' + (x + w / 2) + '" y="' + (y + 4) + '" text-anchor="middle" class="dz-in' + (dashed ? ' is-muted' : '') + '">' + esc(label) + '</text>' : '');
  }
  function vee(x, y, color, inducer) {
    // Two arms of a V (the LacI tetramer), point down onto the DNA.
    const a = '<path d="M' + (x - 8) + ' ' + (y - 13) + 'L' + x + ' ' + (y - 3) + 'L' + (x + 8) + ' ' + (y - 13) + '" fill="none" stroke="' + V(color) + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';
    return a + (inducer ? '<circle cx="' + x + '" cy="' + (y - 11) + '" r="2.4" fill="' + V('sugar') + '"/>' : '');
  }
  function crpBlob(x, y) {
    return '<ellipse cx="' + x + '" cy="' + (y - 12) + '" rx="9" ry="6" fill="' + V('accent') + '"/>';
  }

  /**
   * The lac region: [lacI] … [CRP site] [promoter] [operator] [lacZ lacY lacA]. state (optional):
   * {bound (LacI on the operator), crp (CRP–cAMP on the site), inducer (allolactose on LacI)}.
   * opts: {words (C.lacRegion), title, highlight: 'lacI'|'operator'|'crp' (outlined), compact}.
   */
  function regionSvg(design, state, opts) {
    const o = opts || {}, W = o.words || C.lacRegion, d = design, st = state || {};
    const hasTitle = !!o.title;
    const H = hasTitle ? 76 : 58, y = hasTitle ? 48 : 30, ly = y + 21;
    let s = '<svg class="dz-svg" viewBox="0 0 340 ' + H + '" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">';
    if (hasTitle) s += '<text x="4" y="13" class="dz-title">' + esc(o.title) + '</text>';
    s += '<line x1="2" y1="' + y + '" x2="338" y2="' + y + '" stroke="' + V('dna') + '" stroke-width="3" stroke-opacity=".6"/>';
    const hl = (x, w, key) => (o.highlight === key ? '<rect x="' + (x - 3) + '" y="' + (y - 22) + '" width="' + (w + 6) + '" height="34" rx="6" fill="none" stroke="' + V('accent') + '" stroke-width="2.2"/>' : '');
    // Repressor gene (named inside its box).
    const del = d.lacI.allele === 'deleted';
    s += arrow(4, y, d.lacI.promoter === 10);
    s += geneBox(22, y, 54, 'g-lacI', del ? W.noLacI : d.lacI.allele === 'Is' ? W.lacI + ' Is' : W.lacI, del);
    s += hl(22, 54, 'lacI');
    // CRP site (label below).
    const cx = 102;
    if (d.lac.crpSite) {
      s += '<path d="M' + cx + ' ' + (y - 6) + 'l6 6-6 6-6-6z" fill="' + V('panel') + '" stroke="' + V('accent') + '" stroke-width="2"/>';
      if (st.crp) s += crpBlob(cx, y);
    }
    s += hl(cx - 10, 20, 'crp');
    s += '<text x="' + cx + '" y="' + ly + '" text-anchor="middle" class="dz-lab' + (d.lac.crpSite ? '' : ' is-muted') + '">' + esc(d.lac.crpSite ? W.crp : W.noCrp) + '</text>';
    // lac promoter (label above its arrow, clear of the labels below).
    s += arrow(128, y, d.lac.promoter >= 2);
    s += '<text x="138" y="' + (y - 21) + '" text-anchor="middle" class="dz-lab">' + esc(W.promoter) + '</text>';
    // Operator (label below).
    const ox = 174;
    if (d.lac.operator) {
      s += '<rect x="' + (ox - 7) + '" y="' + (y - 6) + '" width="14" height="12" fill="' + V('panel') + '" stroke="' + V('ink') + '" stroke-width="2"/>';
      if (st.bound && d.lacI.allele !== 'deleted') s += vee(ox, y - 5, 'g-lacI', !!st.inducer && d.lacI.allele !== 'Is');
    }
    s += hl(ox - 11, 22, 'operator');
    s += '<text x="' + ox + '" y="' + ly + '" text-anchor="middle" class="dz-lab' + (d.lac.operator ? '' : ' is-muted') + '">' + esc(d.lac.operator ? W.operator : W.noOperator) + '</text>';
    // The genes, sized roughly by length (1024 : 417 : 203 aa).
    s += geneBox(206, y, 76, 'g-lacZ', 'lacZ') + geneBox(282, y, 32, 'g-lacY', 'Y') + geneBox(314, y, 22, 'g-lacA', 'A');
    s += '</svg>';
    return s;
  }

  /** A truth-table strain's DNA (§5.4.4), the part that differs from the normal genes outlined. */
  function strainSvg(row, words) {
    const base = { lac: { promoter: 1, operator: true, crpSite: true }, lacI: { allele: 'wt', promoter: 1 } };
    const d = JSON.parse(JSON.stringify(base));
    let highlight = null;
    if (row === 'dlacI') { d.lacI.allele = 'deleted'; highlight = 'lacI'; }
    if (row === 'Is') { d.lacI.allele = 'Is'; highlight = 'lacI'; }
    if (row === 'Oc') { d.lac.operator = false; highlight = 'operator'; }
    return regionSvg(d, null, { words: words || C.lacRegion, highlight });
  }

  // ---------------------------------------------------------------------------
  // The editor
  // ---------------------------------------------------------------------------
  class DesignerView {
    /**
     * opts: {text (the level's TEXT.design), design, onChange(design, path, from, to), onRun(), words (C.game.design)}.
     */
    constructor(opts) {
      this.opts = opts;
      this.design = JSON.parse(JSON.stringify(opts.design));
      this.open = null;
      this.confirming = false;
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      const h = LY.h, T = this.opts.text, Wd = this.opts.words || C.game.design, d = this.design;
      const host = this.host;
      host.textContent = '';
      host.appendChild(h('p', { class: 'sheet-note', text: T.note }));
      const pic = h('div', { class: 'dz-preview', 'aria-hidden': 'true' });
      pic.innerHTML = regionSvg(d, null, { words: C.lacRegion });
      host.appendChild(pic);
      for (const strip of STRIPS) {
        const box = h('section', { class: 'dz-strip', 'aria-label': T[strip.key] });
        box.appendChild(h('h3', { class: 'dz-strip-title', text: T[strip.key] }));
        const row = h('div', { class: 'dz-parts' });
        for (const path of strip.parts) row.appendChild(this.partButton(path));
        if (strip.genes) row.appendChild(h('div', { class: 'dz-genes', role: 'note', 'aria-label': T.genes }, [
          h('span', { class: 'dz-gene', style: { background: 'var(--g-lacZ)' }, text: 'lacZ' }),
          h('span', { class: 'dz-gene', style: { background: 'var(--g-lacY)' }, text: 'lacY' }),
          h('span', { class: 'dz-gene', style: { background: 'var(--g-lacA)' }, text: 'lacA' }),
        ]));
        box.appendChild(row);
        if (this.open && strip.parts.indexOf(this.open) >= 0) box.appendChild(this.options(this.open));
        host.appendChild(box);
      }
      host.appendChild(h('p', { class: 'dz-summary', 'aria-live': 'polite', text: summary(d, T) }));
      const actions = h('div', { class: 'lv-sticky lv-actions dz-actions' });
      if (!this.confirming) {
        actions.appendChild(h('p', { class: 'dz-run-note', text: Wd.runNote }));
        actions.appendChild(h('button', { class: 'btn primary lv-wide', type: 'button', 'data-primary': '', 'data-action': 'design-run',
          onclick: () => { this.confirming = true; this.open = null; this.render(); this.focus('[data-action="design-confirm"]'); } }, T.run));
      } else {
        actions.appendChild(h('p', { class: 'dz-confirm', role: 'alert', text: T.confirm }));
        actions.appendChild(h('button', { class: 'btn', type: 'button', 'data-action': 'design-keep',
          onclick: () => { this.confirming = false; this.render(); this.focus('[data-action="design-run"]'); } }, T.keepEditing));
        actions.appendChild(h('button', { class: 'btn primary', type: 'button', 'data-primary': '', 'data-action': 'design-confirm',
          onclick: () => { if (this.opts.onRun) this.opts.onRun(this.design); } }, T.runNow));
      }
      host.appendChild(actions);
    }

    focus(sel) {
      const el = this.host.querySelector(sel);
      if (el) el.focus({ preventScroll: false });
    }

    partButton(path) {
      const h = LY.h, T = this.opts.text, P = T.parts[path], v = get(this.design, path);
      const on = this.open === path;
      const absent = (path === 'lac.operator' || path === 'lac.crpSite') && v === false || (path === 'lacI.allele' && v === 'deleted');
      const disabled = path === 'lacI.promoter' && this.design.lacI.allele === 'deleted';
      const icon = h('span', { class: 'dz-icon dz-' + path.replace('.', '-') + (absent ? ' is-absent' : ''), 'aria-hidden': 'true' });
      return h('button', {
        class: 'btn dz-part' + (on ? ' is-open' : '') + (absent ? ' is-absent' : ''), type: 'button', 'data-part': path,
        'aria-expanded': on ? 'true' : 'false', 'aria-label': P.name + ': ' + optionText(T, path, v), disabled: disabled || null,
        onclick: () => { this.open = on ? null : path; this.confirming = false; this.render(); this.focus('[data-part="' + path + '"]'); },
      }, [icon, h('span', { class: 'dz-part-text' }, [h('span', { class: 'dz-part-name', text: P.label }), h('span', { class: 'dz-part-value', text: optionText(T, path, v, true) })])]);
    }

    options(path) {
      const h = LY.h, T = this.opts.text, P = T.parts[path], cur = get(this.design, path);
      const box = h('div', { class: 'dz-options', role: 'radiogroup', 'aria-label': P.name });
      box.appendChild(h('p', { class: 'dz-desc' }, [h('strong', { text: P.name + '. ' }), P.desc]));
      if (P.note) box.appendChild(h('p', { class: 'dz-desc dz-note', text: P.note }));
      for (const o of P.options) {
        const on = o.v === cur;
        box.appendChild(h('button', {
          class: 'btn dz-option' + (on ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-value': String(o.v),
          onclick: () => {
            const from = get(this.design, path);
            if (from !== o.v) {
              this.design = set(this.design, path, o.v);
              if (this.opts.onChange) this.opts.onChange(this.design, path, from, o.v);
            }
            this.open = null;
            this.render();
            this.focus('[data-part="' + path + '"]');
          },
        }, [h('span', { class: 'dz-check', 'aria-hidden': 'true', text: on ? '✓' : '' }), o.t]));
      }
      return box;
    }
  }

  DesignerView.PARTS = PARTS;
  DesignerView.regionSvg = regionSvg;
  DesignerView.strainSvg = strainSvg;
  DesignerView.summary = summary;
  DesignerView.optionText = optionText;
  return DesignerView;
});
