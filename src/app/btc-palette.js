// @deps
/*
 * Be the Cell: colours (LAB_UI §8.1–8.2), defined once.
 *
 * apply() writes the tokens into a <style> element as CSS variables (light by
 * default, dark under prefers-color-scheme unless the About sheet overrides
 * it), and the canvas reads the resolved set from current(). Gene colour is a
 * gene's identity everywhere: strands, protein glyphs, card chip, plot series.
 * Molecule class is carried by shape, never by colour alone.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.palette = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const light = {
    bg: '#f6f5f0', panel: '#ffffff', line: '#d9d6cc', ink: '#1f2430', muted: '#5f6675', accent: '#2f6fd6',
    'accent-ink': '#ffffff', 'accent-pale': '#e4edfb',
    good: '#2f9e5b', warn: '#c98a1b', 'warn-ink': '#8a5a00', 'warn-pale': '#f8ecd4', bad: '#c43d31',
    outside: '#eef2f8', inside: '#fbf3e6', 'inside-depleted': '#ecebe6', membrane: '#8a7f6a',
    nucleoid: 'rgba(31,36,48,.08)', dna: '#1f2430', rnap: '#1f2430', ribosome: '#5f6675',
    atp: '#c98a00', aa: '#8a8f99', sugar: '#3a3f4b', products: '#9aa0ab',
    'drug-rif': '#7b61c9', 'drug-cm': '#b0523c', 'drug-rif-pale': '#efebf9', 'drug-cm-pale': '#f7ebe7',
    'muted-fill': '#eeede8',
    'g-ptsG': '#005533', 'g-gly': '#cc6644', 'g-aaSyn': '#3388dd', 'g-aaImp': '#554499',
    'g-lacY': '#aa77aa', 'g-lacZ': '#990066', 'g-fliC': '#664400',
    // ATP-spending bar: neutral greyscale steps, so it does not compete with gene colours.
    'ledger-0': '#3c4250', 'ledger-1': '#6b7282', 'ledger-2': '#9097a5', 'ledger-3': '#b4b9c3', 'ledger-4': '#cfd2d9', 'ledger-5': '#e3e5ea',
  };

  const dark = Object.assign({}, light, {
    bg: '#15181e', panel: '#1d2129', line: '#343a46', ink: '#e6e8ee', muted: '#a3a9b6', accent: '#6f9ef0',
    'accent-ink': '#0e1420', 'accent-pale': '#22314d',
    'warn-ink': '#e3b341', 'warn-pale': '#3a3020', bad: '#e0685c', good: '#4cbf7c',
    outside: '#1a1f28', inside: '#2a2418', 'inside-depleted': '#24252a', membrane: '#b3a78e',
    nucleoid: 'rgba(230,232,238,.07)', dna: '#d6d9e0', rnap: '#d6d9e0', ribosome: '#a3a9b6',
    atp: '#e3b341', aa: '#9aa0ab', sugar: '#c9ccd4', products: '#7d8391',
    'drug-rif': '#a28ee6', 'drug-cm': '#d9826c', 'drug-rif-pale': '#2a2540', 'drug-cm-pale': '#35241f',
    'muted-fill': '#262b35',
    'g-ptsG': '#61a17d', 'g-gly': '#ffac89', 'g-aaSyn': '#91c9ff', 'g-aaImp': '#a690e4',
    'g-lacY': '#e8b7e7', 'g-lacZ': '#e970b1', 'g-fliC': '#b78e53',
    'ledger-0': '#d6d9e0', 'ledger-1': '#aab0bc', 'ledger-2': '#838a98', 'ledger-3': '#646b79', 'ledger-4': '#4b515d', 'ledger-5': '#3a3f49',
  });

  const GENE_IDS = ['ptsG', 'gly', 'aaSyn', 'aaImp', 'lacY', 'lacZ', 'fliC'];

  // What each gene's protein is drawn as (LAB_UI §2.3).
  const shape = {
    ptsG: 'membrane', gly: 'circle', aaSyn: 'circle', aaImp: 'membrane', lacY: 'membrane', lacZ: 'tetramer', fliC: 'bar',
  };

  function block(set) {
    let s = '';
    for (const k of Object.keys(set)) s += '--' + k + ':' + set[k] + ';';
    return s;
  }

  /** The CSS that defines every token: light, dark by system preference, and both forced themes. */
  function css() {
    return ':root{' + block(light) + 'color-scheme:light;}' +
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + block(dark) + 'color-scheme:dark;}}' +
      ':root[data-theme="dark"]{' + block(dark) + 'color-scheme:dark;}';
  }

  let active = light;
  let theme = 'system';

  function prefersDark() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** Writes the tokens (once) and applies a theme: 'system' | 'light' | 'dark'. Returns the resolved set. */
  function apply(t) {
    theme = t || theme;
    if (typeof document !== 'undefined') {
      let el = document.getElementById('btc-tokens');
      if (!el) {
        el = document.createElement('style');
        el.id = 'btc-tokens';
        el.textContent = css();
        document.head.appendChild(el);
      }
      if (theme === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', theme);
    }
    active = theme === 'dark' || (theme === 'system' && prefersDark()) ? dark : light;
    return active;
  }

  /** The resolved colour set the canvas draws with. */
  function current() { return active; }
  function isDark() { return active === dark; }

  return { light, dark, GENE_IDS, shape, css, apply, current, isDark };
});
