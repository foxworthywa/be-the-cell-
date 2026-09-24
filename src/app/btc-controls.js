// @deps btc-layout
/*
 * Be the Cell: the segmented control and the pending-command registry
 * (LAB_UI §3.4, §4).
 *
 * A control never pretends a change has happened. Tapping a segment sends a
 * command; the segment shows "pending" (a dotted outline) until the engine's
 * command_applied event with the same seq arrives, and only then does the
 * solid selection move, because the solid selection is always read from the
 * cell's own state. A rejected command simply clears the pending mark, so the
 * control shows the engine's value again, plus a short reason.
 *
 * Every instance of one control (a gene's promoter on its card and in the
 * focus bar) shares one pending entry, keyed by gene id, so a tap in either
 * place shows pending in both.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.controls = factory(B.layout);
  }
})(typeof self !== 'undefined' ? self : this, function (LY) {
  'use strict';

  /** Pending commands by control key: {seq, value}. Pure. */
  class Pending {
    constructor() { this.map = {}; this.bySeq = {}; }
    set(key, seq, value) {
      const old = this.map[key];
      if (old) delete this.bySeq[old.seq];
      this.map[key] = { seq, value };
      this.bySeq[seq] = key;
    }
    get(key) { return this.map[key] || null; }
    has(key) { return !!this.map[key]; }
    any() { for (const k in this.map) if (this.map[k]) return true; return false; }
    /** A command event arrived: clears the entry it resolves (only the latest seq counts). Returns the key or null. */
    resolve(ev) {
      const key = this.bySeq[ev.seq];
      if (key === undefined) return null;
      delete this.bySeq[ev.seq];
      if (this.map[key] && this.map[key].seq === ev.seq) delete this.map[key];
      return key;
    }
    clear() { this.map = {}; this.bySeq = {}; }
  }

  /**
   * A segmented radiogroup.
   * opts: {label, options: [{key, label, sub?}], defaultKey?, onSelect(key), className?}
   * update(currentKey, pendingKey, note) paints it; nothing else changes its look.
   */
  function segmented(opts) {
    const h = LY.h;
    const group = h('div', { class: 'seg-group ' + (opts.className || ''), role: 'radiogroup', 'aria-label': opts.label });
    const buttons = opts.options.map((o) => {
      const b = h('button', {
        class: 'seg' + (o.key === opts.defaultKey ? ' is-default' : ''), type: 'button', role: 'radio',
        'aria-checked': 'false', tabindex: '-1', 'data-key': o.key,
        'aria-label': o.spoken || null,
      }, [h('span', { class: 'seg-label', text: o.label }), o.sub ? h('span', { class: 'seg-sub', text: o.sub }) : null]);
      b.addEventListener('click', () => opts.onSelect(o.key));
      return b;
    });
    buttons.forEach((b) => group.appendChild(b));
    // Arrow keys move the selection (a laptop extra).
    group.addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(buttons.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = buttons.length - 1;
      if (j < 0 || j === i) return;
      e.preventDefault();
      buttons[j].focus();
      opts.onSelect(opts.options[j].key);
    });
    const note = h('div', { class: 'seg-note', hidden: true });
    let last = '';
    function update(currentKey, pendingKey, noteText) {
      const sig = currentKey + '|' + pendingKey + '|' + (noteText || '');
      if (sig === last) return;
      last = sig;
      const shown = pendingKey !== null && pendingKey !== undefined ? pendingKey : currentKey;
      for (let i = 0; i < buttons.length; i++) {
        const k = opts.options[i].key;
        buttons[i].classList.toggle('is-on', k === currentKey);
        buttons[i].classList.toggle('is-pending', k === pendingKey && k !== currentKey);
        buttons[i].setAttribute('aria-checked', k === shown ? 'true' : 'false');
        buttons[i].tabIndex = k === shown ? 0 : -1;
      }
      note.hidden = !noteText;
      LY.setText(note, noteText || '');
    }
    return { el: group, note, buttons, update };
  }

  return { Pending, segmented };
});
