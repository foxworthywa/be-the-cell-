// @deps
/*
 * Be the Cell: number and time formats (LAB_UI §8.3, §6). Pure.
 *
 * Counts below a million are exact with comma separators; larger ones read
 * "2.7 million". Concentrations get 2 significant figures. Nothing here uses
 * Intl or the locale, so every browser shows the same text.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.format = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** "12345" -> "12,345" for a non-negative integer. */
  function commas(n) {
    const s = String(Math.round(n));
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ',';
      out += s[i];
    }
    return out;
  }

  /** x to 2 significant figures, as a plain decimal string ("0.0050" -> "0.005", 98.4 -> "98", 1234 -> "1,200"). */
  function sig2(x) {
    if (!(x > 0) || x < 1e-90) return '0';
    const p = Math.floor(Math.log10(x)) - 1;
    const r = Math.round(x / Math.pow(10, p)) * Math.pow(10, p);
    if (p >= 0) return commas(r);
    // toFixed, never String(Number(…)): JS prints numbers below 1e-6 in exponent form ("3.5e-9").
    let s = r.toFixed(-p);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /** A molecule count (LAB_UI §8.3). */
  function count(n) {
    if (!(n > 0)) return '0';
    if (n < 999999.5) return commas(n);
    return sig2(n / 1e6) + ' million';
  }

  function mM(x) { return sig2(x) + ' mM'; }

  /** A fraction 0..1 as a percentage: integers, one decimal below 1%. */
  function pct(f) {
    const p = f * 100;
    if (!(p > 0)) return '0%';
    if (p < 0.95) return (Math.round(p * 10) / 10) + '%';
    return Math.round(p) + '%';
  }

  /** Simulated time: "12 min 30 s" when fine, "1 h 12 min" otherwise (LAB_UI §6). */
  function clock(t_s, fine) {
    const t = Math.max(0, Math.floor(t_s));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    if (fine) {
      if (h > 0) return h + ' h ' + m + ' min ' + s + ' s';
      if (m > 0) return m + ' min ' + s + ' s';
      return s + ' s';
    }
    if (h > 0) return h + ' h ' + m + ' min';
    return m + ' min';
  }

  /** Minutes to a duration label, 2 significant figures: 97.6 -> "98 min", 150 -> "150 min". */
  function minutes(min) { return sig2(min) + ' min'; }

  /**
   * "1 s = N unit" for any sim-seconds-per-real-second rate, rounded DOWN to 2
   * significant figures (the achieved-speed warning, LAB_UI §10.3).
   */
  function speedLabel(simPerReal) {
    let v = simPerReal, unit = 's';
    if (v >= 3600) { v /= 3600; unit = 'h'; } else if (v >= 60) { v /= 60; unit = 'min'; }
    if (v >= 1) {
      const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
      v = Math.floor(v / p) * p;
    } else {
      v = Math.floor(v * 10) / 10;
    }
    return '1 s = ' + v + ' ' + unit;
  }

  /** Capitalises a leading a–z letter only, so "β-galactosidase" stays as it is. */
  function capital(s) {
    const c = s.charCodeAt(0);
    return c >= 97 && c <= 122 ? String.fromCharCode(c - 32) + s.slice(1) : s;
  }

  /** Fills "{name}" placeholders from an object. */
  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
  }

  /**
   * A gene's finished proteins as the student counts them: working machines, so a four-chain LacZ is one
   * lactose-splitting enzyme (the engine counts chains). machinesRaw is the unrounded amount, for graph lines.
   */
  function machinesRaw(gv) { const o = gv && gv.oligomer > 1 ? gv.oligomer : 1; return gv ? gv.protein / o : 0; }
  function machines(gv) {
    if (!gv) return 0;
    return gv.oligomer > 1 ? Math.round(gv.protein / gv.oligomer) : (typeof gv.proteinRounded === 'number' ? gv.proteinRounded : Math.round(gv.protein));
  }

  return { commas, sig2, count, mM, pct, clock, minutes, speedLabel, fill, capital, machines, machinesRaw };
});
