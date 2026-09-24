// @deps btc-content btc-format btc-layout btc-tiers
/*
 * Be the Cell: the guide (docs/PROLOGUE.md §2.4.3, §5.2): a callout over the cell with one line at a
 * time and a Next button, and a pulsing ring on what the line is about. Watch steps use it, and so do
 * the readout introductions ("This counts the mRNA copies of this gene in the cell right now."), each
 * shown once per student. It never covers the controls the student has to use: it sits over the cell
 * view, or over the open panel when the cell is on another tab (the simple graph's introduction), at the
 * top or, when the ring is up there, at the bottom; the ring lets taps through.
 *
 *   guide.show({key, who, text, extra: [{text, kind}], point, count, buttons: [{label, action, primary, onClick}]})
 *   guide.hide(); guide.place()            (after a layout change; the app calls it on its slow tick)
 *
 * Where it points: a readout or `point` id (BTC.tiers.TARGETS), 'tab:<name>', a CSS selector, or a
 * canvas target the cell view can locate (views.cellView.locate(point) → {x, y} in canvas pixels),
 * when the cell view offers that. With no target on screen there is no ring.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'), require('./btc-tiers.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.Guide = factory(B.content, B.format, B.layout, B.tiers);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY, TI) {
  'use strict';

  const RING = 44;

  /** A visible element's rectangle, or null. */
  function rectOf(el) {
    if (!el || el.closest('[hidden]')) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
    return r;
  }

  class Guide {
    constructor(app) {
      this.app = app;
      this.cur = null;
    }

    mount(stage) {
      const h = LY.h;
      this.stage = stage;
      this.speaker = h('span', { class: 'gd-who' });
      this.count = h('span', { class: 'gd-count num' });
      this.text = h('p', { class: 'gd-line', 'aria-live': 'polite' });
      this.extra = h('div', { class: 'gd-extra' });
      this.actions = h('div', { class: 'gd-actions' });
      // The buttons sit beside the last lines when there is room (the callout stays short over the cell).
      this.box = h('div', { class: 'guide', role: 'region', 'aria-label': C.game.watch.label, hidden: true }, [
        h('div', { class: 'gd-head' }, [this.speaker, this.count]), this.text, h('div', { class: 'gd-foot' }, [this.extra, this.actions]),
      ]);
      document.body.appendChild(this.box);
      this.ring = h('div', { class: 'guide-ring', 'aria-hidden': 'true', hidden: true });
      document.body.appendChild(this.ring);
      this.onResize = () => this.place();
      window.addEventListener('resize', this.onResize);
    }

    /** Shows (or updates in place) the callout. Buttons: [{label, action, primary, disabled, onClick}]. */
    show(o) {
      const h = LY.h;
      this.cur = o;
      const who = o.who || 'narrator';
      LY.setText(this.speaker, (C.game.speakers && C.game.speakers[who]) || who);
      this.speaker.classList.toggle('is-you', who === 'commander');
      LY.setText(this.count, o.count || '');
      LY.setText(this.text, o.text || '');
      this.text.hidden = !o.text;
      this.extra.textContent = '';
      for (const x of o.extra || []) this.extra.appendChild(h('p', { class: 'gd-extra-line' + (x.kind ? ' is-' + x.kind : ''), text: x.text }));
      this.extra.hidden = !(o.extra && o.extra.length);
      const sig = JSON.stringify((o.buttons || []).map((b) => [b.label, b.action, !!b.primary, !!b.disabled]));
      if (sig !== this.btnSig) {
        this.btnSig = sig;
        this.actions.textContent = '';
        for (const b of o.buttons || []) {
          const el = h('button', { class: 'btn gd-btn' + (b.primary ? ' primary' : ''), type: 'button', 'data-action': b.action || null, disabled: !!b.disabled },
            b.label);
          el.addEventListener('click', () => { const f = this.cur && (this.cur.buttons || []).find((x) => x.action === b.action); if (f && f.onClick) f.onClick(); });
          this.actions.appendChild(el);
        }
      }
      this.actions.hidden = !(o.buttons && o.buttons.length);
      this.box.hidden = false;
      this.box.setAttribute('data-key', o.key || '');
      this.place();
    }

    hide() {
      this.cur = null;
      if (this.box) this.box.hidden = true;
      if (this.ring) this.ring.hidden = true;
      this.btnSig = null;
    }
    get visible() { return !!this.cur; }

    /** The rectangle (viewport px) of what the current line points at, or null. */
    target() {
      const p = this.cur && this.cur.point;
      if (!p) return null;
      const app = this.app;
      if (p.indexOf('tab:') === 0) {
        const tab = p.slice(4) === 'graph' ? 'graphs' : p.slice(4);
        const list = Array.from(document.querySelectorAll('[data-tab="' + tab + '"]'));
        for (const el of list) { const r = rectOf(el); if (r) return r; }
        return null;
      }
      const sel = TI.TARGETS[p] || (/^[#.[]/.test(p) ? p : null);
      if (sel) {
        for (const el of document.querySelectorAll(sel)) { const r = rectOf(el); if (r) return r; }
        return null;
      }
      // A mark on the canvas: the cell view may know where it drew it.
      const cv = app.views && app.views.cellView;
      if (cv && typeof cv.locate === 'function' && cv.canvas && !app.views.cellView.canvas.closest('[hidden]')) {
        const at = cv.locate(p);
        if (at) {
          const c = cv.canvas.getBoundingClientRect();
          return { left: c.left + at.x - 2, top: c.top + at.y - 2, width: 4, height: 4, right: c.left + at.x + 2, bottom: c.top + at.y + 2 };
        }
      }
      return null;
    }

    /** The ring on the target, and the callout at the top of the cell view, or at its bottom when the ring is up there. */
    place() {
      if (!this.cur || !this.box) return;
      const t = this.target();
      if (t) {
        // A control or readout gets an outline around it; a mark on the canvas (a point) a 44 px ring centred on it.
        const point = t.width <= 8 && t.height <= 8, pad = 4;
        const w = point ? RING : t.width + 2 * pad, hgt = point ? RING : t.height + 2 * pad;
        const x = point ? t.left + t.width / 2 - RING / 2 : t.left - pad, y = point ? t.top + t.height / 2 - RING / 2 : t.top - pad;
        this.ring.style.width = Math.round(w) + 'px'; this.ring.style.height = Math.round(hgt) + 'px';
        this.ring.style.left = Math.round(x) + 'px'; this.ring.style.top = Math.round(y) + 'px';
        this.ring.classList.toggle('is-point', point);
        this.ring.hidden = false;
      } else this.ring.hidden = true;
      // Over the cell view when it is on screen, else over the open panel (the Graph tab on a phone).
      const wrap = this.stage.closest('#stage-wrap') || this.stage;
      let area = rectOf(this.stage), overCell = !!area;
      if (!area) {
        for (const el of document.querySelectorAll('#app .pane')) { const r = rectOf(el); if (r) { area = r; break; } }
      }
      if (!area) area = wrap.getBoundingClientRect();
      const top = area.top + (overCell ? 60 : 8);
      const width = Math.min(480, area.width - 16);
      this.box.style.width = Math.round(width) + 'px';
      const compact = document.body.getAttribute('data-layout') === 'compact';
      this.box.style.left = Math.round(compact ? area.left + (area.width - width) / 2 : area.left + 12) + 'px';
      // Low (at the area's bottom) when what it points at is below the area (the counters, the switch), so the line
      // sits next to it, or when it is in the area's upper part, so the line never hides it.
      const below = !!t && t.top >= area.bottom - 1;
      const low = below || (!!t && t.top >= area.top && t.top < top + this.box.offsetHeight && t.top < area.top + area.height * 0.6);
      if (low) {
        this.box.style.top = '';
        this.box.style.bottom = Math.round(window.innerHeight - area.bottom + (overCell ? 40 : 8)) + 'px';
      } else {
        this.box.style.bottom = '';
        this.box.style.top = Math.round(top) + 'px';
      }
      this.box.classList.toggle('is-low', low);
    }

    destroy() {
      this.hide();
      if (this.onResize) window.removeEventListener('resize', this.onResize);
    }
  }

  return Guide;
});
