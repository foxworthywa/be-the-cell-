// @deps btc-content
/*
 * Be the Cell: layout classes, tabs, sheets and toasts (LAB_UI §1, §8.3).
 *
 * classify(w, h) is pure and tested (U-1). CSS grid areas key off
 * <body data-layout="…">, plus data-short when the viewport is under 600 px
 * tall. The page itself never scrolls; panels scroll inside.
 *
 * DOM is touched only inside functions called after the page has loaded.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.layout = factory(B.content);
  }
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  function classify(w, h) {
    if (w >= 1024 && h >= 560) return 'wide';      // laptops, Chromebooks, landscape tablets
    if (w > h && w >= 600) return 'split';          // landscape phones, small windows
    if (w >= 600) return 'stack';                   // portrait tablets
    return 'compact';                               // phones in portrait
  }
  const isShort = (h) => h < 600;

  const TABS = Object.freeze({
    compact: ['cell', 'genes', 'medium', 'graphs'],
    stack: ['genes', 'medium', 'graphs'],
    split: ['genes', 'medium', 'graphs'],
    wide: ['genes', 'medium'],
  });

  /** A tab that no longer exists in this layout maps to the nearest one (Cell → Genes, Graphs → Genes in wide). */
  function mapTab(tab, layout) {
    const tabs = TABS[layout];
    return tabs.indexOf(tab) >= 0 ? tab : 'genes';
  }

  // ---------------------------------------------------------------------------
  // Small DOM helper: h('button', {class: 'seg', onclick: f}, ['text', child])
  // ---------------------------------------------------------------------------
  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children !== undefined && children !== null) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c === null || c === undefined || c === false) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return e;
  }

  /** Writes textContent only when the string changed (LAB_UI §3.5). */
  function setText(el, s) {
    if (el.__t !== s) { el.__t = s; el.textContent = s; }
  }

  // ---------------------------------------------------------------------------
  // Sheets: bottom sheets on compact, centred dialogs elsewhere. Close button,
  // backdrop and Escape close them; focus is trapped while open.
  // ---------------------------------------------------------------------------
  let openSheetState = null;
  let sheetCount = 0;

  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      (e) => !e.disabled && e.offsetParent !== null);
  }

  /**
   * openSheet({title, build(body, close), onClose, className}) → {close, body}.
   * Only one sheet is open at a time; opening another closes the first.
   */
  function openSheet(opts) {
    if (openSheetState) openSheetState.close();
    const root = document.getElementById('sheets');
    const opener = document.activeElement;
    const titleId = 'sheet-title-' + (++sheetCount);
    const body = h('div', { class: 'sheet-body' });
    const closeBtn = h('button', { class: 'btn icon-btn sheet-close', 'aria-label': C.sheets.close }, '✕');
    const sheet = h('div', { class: 'sheet ' + (opts.className || ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
      h('div', { class: 'sheet-head' }, [h('h2', { id: titleId, text: opts.title }), closeBtn]),
      body,
    ]);
    const backdrop = h('div', { class: 'sheet-backdrop' }, sheet);
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      openSheetState = null;
      if (opts.onClose) opts.onClose();
      if (opener && opener.focus && document.contains(opener)) opener.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(sheet);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey, true);
    opts.build(body, close);
    root.appendChild(backdrop);
    closeBtn.focus({ preventScroll: true });
    openSheetState = { close, body, sheet };
    return openSheetState;
  }

  function closeSheet() { if (openSheetState) openSheetState.close(); }

  /**
   * Renders a multiple-choice question into a sheet body (reserved for levels,
   * LAB_UI §12; unused in M1): {prompt, options: [{t, ok, fb}]}.
   */
  function question(body, q, onAnswer) {
    body.appendChild(h('p', { class: 'q-prompt', text: q.prompt }));
    const fb = h('p', { class: 'q-feedback', 'aria-live': 'polite' });
    q.options.forEach((o, i) => body.appendChild(h('button', {
      class: 'btn row-btn', onclick: () => { fb.textContent = o.fb || ''; if (onAnswer) onAnswer(i, o); },
    }, o.t)));
    body.appendChild(fb);
  }

  // ---------------------------------------------------------------------------
  // Toasts (UI chrome; a real-time timer is allowed here, LAB_UI U-11)
  // ---------------------------------------------------------------------------
  let toastTimer = 0;
  function toast(text, action) {
    const root = document.getElementById('toast');
    root.textContent = '';
    root.appendChild(h('span', { text }));
    if (action) {
      root.appendChild(h('button', { class: 'btn toast-action', onclick: () => { hideToast(); action.run(); } }, action.label));
    }
    root.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 8000 : 4000);
  }
  function hideToast() {
    const root = document.getElementById('toast');
    if (root) root.hidden = true;
  }

  /** Sets data-layout and data-short on <body>; returns the layout class. */
  function applyToBody(w, h2) {
    const layout = classify(w, h2);
    document.body.setAttribute('data-layout', layout);
    if (isShort(h2)) document.body.setAttribute('data-short', '');
    else document.body.removeAttribute('data-short');
    return layout;
  }

  return { classify, isShort, TABS, mapTab, h, setText, openSheet, closeSheet, question, toast, hideToast, applyToBody };
});
