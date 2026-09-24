// @deps btc-content btc-prefs btc-layout
/*
 * Be the Cell: install and offline support, autosave, and the run download
 * (LAB_UI §9.3, §10.5, §4.5).
 *
 * The service worker is registered only over http(s), never from file://,
 * never with ?test=1, and only in a built bundle (window.BTC_BUILD is set):
 * a cache-first worker over unbuilt source files would serve stale code
 * during development. Every URL is relative, because GitHub Pages serves the
 * app under /be-the-cell-/. The page never reloads without a tap.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-prefs.js'), require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.pwa = factory(B.content, B.prefs, B.layout);
  }
})(typeof self !== 'undefined' ? self : this, function (C, PR, LY) {
  'use strict';

  const UPDATE_EVERY_MS = 3600 * 1000;      // reg.update() at most once an hour

  function register(opts) {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!/^http/.test(location.protocol) || opts.test || !opts.build) return;
    const hadController = !!navigator.serviceWorker.controller;
    let lastCheck = 0, reloading = false;
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
      const check = () => {
        const now = Date.now();
        if (now - lastCheck < UPDATE_EVERY_MS) return;
        lastCheck = now;
        reg.update().catch(() => {});
      };
      check();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
          if (w.state === 'activated' && !hadController && !PR.flag('offline-toast')) {
            PR.flag('offline-toast', true);
            LY.toast(C.pwa.offline);
          }
        });
      });
    }).catch(() => { /* no offline support; the app still runs */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading && window.__btcReloadRequested) { reloading = true; location.reload(); }
    });
  }

  function showUpdate(worker) {
    const el = document.getElementById('banner');
    if (!el || !el.hidden) return;
    el.textContent = '';
    el.appendChild(LY.h('span', { class: 'banner-text', text: C.pwa.update }));
    el.appendChild(LY.h('button', {
      class: 'btn primary', type: 'button',
      onclick: () => { window.__btcReloadRequested = true; worker.postMessage('skip-waiting'); },
    }, C.pwa.reload));
    el.appendChild(LY.h('button', { class: 'btn', type: 'button', onclick: () => { el.hidden = true; } }, C.pwa.dismiss));
    el.hidden = false;
  }

  /** Saves the cell (paused state is restored as paused). */
  function autosave(app) {
    if (app.params.test) return false;
    return PR.saveAutosave({
      engineVersion: app.BTC.ENGINE_VERSION, build: app.build, savedAt_tick: app.cell.tick,
      snapshot: app.cell.snapshot(), gen0: app.gen0,
    });
  }

  /** The saved cell if it can be restored here, or null. */
  function loadAutosave(app) {
    if (app.params.test || app.params.reset) return null;
    const s = PR.loadAutosave();
    if (!s || s.engineVersion !== app.BTC.ENGINE_VERSION || !s.snapshot) return null;
    return s;
  }

  /**
   * Download this run: the share sheet where Web Share with files works (phones),
   * otherwise an ordinary file download.
   */
  function downloadRun(app) {
    const record = app.cell.runRecord();
    const json = JSON.stringify({ ui: { build: app.build, layout: app.layout, speedHistory: app.speedHistory }, record });
    deliverFile(json, 'be-the-cell-run-t' + app.cell.tick + '.json', C.pwa.shareTitle);
  }

  /** Hands a JSON file to the student: the share sheet where it works, else a download (LAB_UI §4.5). */
  function deliverFile(json, name, title) {
    const blob = new Blob([json], { type: 'application/json' });
    let file = null;
    try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title }).catch((err) => {
        if (err && err.name === 'AbortError') return;       // the student closed the sheet
        anchorDownload(blob, name);
      });
      return;
    }
    anchorDownload(blob, name);
  }

  /**
   * Copies text (LEVELS §10.3): the clipboard API; else a read-only input and execCommand('copy');
   * else the visible text in selectEl is selected for a long press. Resolves 'copied' or 'failed'.
   */
  function copyText(text, selectEl) {
    const fallback = () => {
      let ok = false;
      try {
        const inp = document.createElement('input');
        inp.readOnly = true; inp.value = text;
        inp.style.position = 'fixed'; inp.style.top = '0'; inp.style.left = '-1000px'; inp.style.fontSize = '16px';
        document.body.appendChild(inp);
        inp.focus({ preventScroll: true }); inp.select(); inp.setSelectionRange(0, text.length);
        ok = document.execCommand && document.execCommand('copy');
        inp.remove();
      } catch (e) { ok = false; }
      if (ok) return 'copied';
      try {
        if (selectEl) {
          const range = document.createRange();
          range.selectNodeContents(selectEl);
          const sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
        }
      } catch (e) { /* nothing more to try */ }
      return 'failed';
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => 'copied', () => fallback());
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve(fallback());
  }

  function anchorDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  return { register, autosave, loadAutosave, downloadRun, deliverFile, copyText };
});
