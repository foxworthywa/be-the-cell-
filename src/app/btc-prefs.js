// @deps
/*
 * Be the Cell: URL parameters and browser storage (LAB_UI §10.4–10.5).
 *
 * Storage holds conveniences only: UI preferences and an autosave of the
 * cell. Every access is wrapped in try/catch, because private windows and
 * blocked storage throw; the lab then simply starts from defaults.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.prefs = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UI_KEY = 'btc.ui.v1';
  const SAVE_KEY = 'btc.autosave.v1';
  const MAX_SAVE_CHARS = 2 * 1024 * 1024;     // skip an autosave above 2 MB

  const DEFAULTS = Object.freeze({
    tab: 'cell', speed: 60, focusGene: 'fliC', graphGenes: ['fliC', 'ptsG'], window: 3600,
    logScales: { mRNA: false, protein: false }, theme: 'system', reducedMotion: 'auto', plot4: 'size',
    screen: 'home',
  });

  /**
   * URL parameters (pure): ?seed ?speed ?tab ?theme ?reset=1 ?test=1, and for levels (LEVELS §5.11)
   * ?lab=1, ?level=<id> and ?v=<variant seed, 6 base32 characters>. ?instructor is ignored.
   */
  function parseParams(search) {
    const out = {};
    const s = (search || '').replace(/^\?/, '');
    if (!s) return out;
    for (const part of s.split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const k = decodeURIComponent(i < 0 ? part : part.slice(0, i));
      const v = i < 0 ? '' : decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
      out[k] = v;
    }
    const r = {};
    if (out.seed !== undefined && /^\d+$/.test(out.seed)) r.seed = Number(out.seed) >>> 0;
    if (out.speed !== undefined && Number(out.speed) > 0) r.speed = Number(out.speed);
    if (out.tab) r.tab = out.tab;
    if (out.theme === 'light' || out.theme === 'dark') r.theme = out.theme;
    r.reset = out.reset === '1';
    r.test = out.test === '1';
    r.lab = out.lab === '1';
    if (out.level && /^[\w.]{1,8}$/.test(out.level)) r.level = out.level;
    if (out.v && /^[0-9A-Za-z]{6}$/.test(out.v)) r.v = out.v;
    return r;
  }

  function storage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function readJSON(key) {
    try {
      const st = storage();
      const s = st && st.getItem(key);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function writeString(key, s) {
    try {
      const st = storage();
      if (st) st.setItem(key, s);
      return true;
    } catch (e) { return false; }    // quota or blocked: ignored
  }

  /** UI preferences, merged over the defaults. */
  function loadUI() {
    const saved = readJSON(UI_KEY) || {};
    const out = Object.assign({}, DEFAULTS, saved);
    out.logScales = Object.assign({}, DEFAULTS.logScales, saved.logScales || {});
    if (!Array.isArray(out.graphGenes)) out.graphGenes = DEFAULTS.graphGenes.slice();
    return out;
  }
  function saveUI(ui) { writeString(UI_KEY, JSON.stringify(ui)); }

  function loadAutosave() { return readJSON(SAVE_KEY); }
  function saveAutosave(obj) {
    let s;
    try { s = JSON.stringify(obj); } catch (e) { return false; }
    if (s.length > MAX_SAVE_CHARS) return false;
    return writeString(SAVE_KEY, s);
  }
  function clearAutosave() {
    try { const st = storage(); if (st) st.removeItem(SAVE_KEY); } catch (e) { /* ignored */ }
  }

  /** A one-off flag (e.g. the "ready offline" toast was shown). */
  function flag(name, set) {
    const key = 'btc.flag.' + name;
    if (set) return writeString(key, '1');
    try { const st = storage(); return !!(st && st.getItem(key)); } catch (e) { return false; }
  }

  return { DEFAULTS, parseParams, loadUI, saveUI, loadAutosave, saveAutosave, clearAutosave, flag };
});
