// @deps btc-content btc-format btc-layout
/*
 * Be the Cell: the medium and drugs panel (LAB_UI §4.1–4.2), plus the
 * Start over / About / Download actions.
 *
 * Each row is a segmented control that sends one command (setMedium or
 * setDrug) and shows pending until the engine applies it. The solid choice
 * is read back from the cell's own medium and drug doses.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.MediumPanel = factory(B.content, B.format, B.layout);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY) {
  'use strict';

  class MediumPanel {
    constructor(app) {
      this.app = app;
      this.visible = false;
      this.since = 1;
    }

    mount(root) {
      const h = LY.h, app = this.app;
      const presets = app.BTC.catalog.MEDIUM_PRESETS, doses = app.BTC.catalog.DRUG_PRESETS;
      this.rows = {};
      root.appendChild(h('div', { class: 'pane-head' }, [h('h2', { text: C.medium.title }), h('span', { class: 'pane-note', text: C.medium.titleNote })]));
      const med = h('div', { class: 'ctl-list' });
      for (const field of ['glucose', 'lactose', 'aminoAcids']) {
        const row = C.medium.rows[field];
        const values = presets[field];
        const options = row.options.map((o) => ({ key: o.key, label: o.label, sub: F.mM(values[o.key]) }));
        const ctrl = app.makeControl({
          key: field, label: row.label, options,
          read: (view) => keyFor(values, view.env[field + '_mM']),
          send: (key) => ({ type: 'setMedium', [field + '_mM']: values[key] }),
        });
        med.appendChild(h('div', { class: 'ctl-row', 'data-row': field }, [
          h('div', { class: 'ctl-label', text: row.label }), ctrl.el, ctrl.note,
          row.desc ? h('p', { class: 'ctl-desc', text: row.desc }) : null,
        ]));
      }
      med.appendChild(h('p', { class: 'pane-foot', text: C.medium.footer }));
      root.appendChild(med);

      root.appendChild(h('div', { class: 'pane-head' }, [h('h2', { text: C.drugs.title }), h('span', { class: 'pane-note', text: C.drugs.titleNote })]));
      const drugs = h('div', { class: 'ctl-list' });
      for (const drug of ['rifampicin', 'chloramphenicol']) {
        const row = C.drugs.rows[drug];
        const ctrl = app.makeControl({
          key: drug, label: row.label, options: C.drugs.options,
          read: (view) => keyFor(doses, view.drugs[drug]),
          send: (key) => ({ type: 'setDrug', drug, dose: doses[key] }),
        });
        const el = h('div', { class: 'ctl-row drug-row', 'data-row': drug, 'data-drug': drug }, [
          h('div', { class: 'ctl-label', text: row.label }), h('p', { class: 'ctl-desc', text: row.desc }), ctrl.el, ctrl.note,
        ]);
        this.rows[drug] = el;
        drugs.appendChild(el);
      }
      drugs.appendChild(h('p', { class: 'pane-foot', text: C.drugs.footer }));
      root.appendChild(drugs);

      this.buildLine = h('p', { class: 'build-line num' });
      root.appendChild(h('div', { class: 'actions' }, [
        h('button', { class: 'btn', type: 'button', onclick: () => app.openStartOver() }, C.actions.startOver),
        h('button', { class: 'btn', type: 'button', onclick: () => app.openAbout() }, C.actions.about),
        h('button', { class: 'btn', type: 'button', onclick: () => app.downloadRun() }, C.actions.download),
        this.buildLine,
      ]));
    }

    setVisible(v) { this.visible = v; this.since = 1; }

    render(dtReal, force) {
      if (!this.visible) return;
      this.since += dtReal;
      if (!force && this.since < 0.25) return;
      this.since = 0;
      const view = this.app.cell.observe();
      this.rows.rifampicin.classList.toggle('is-on', view.drugs.rifampicin > 0);
      this.rows.chloramphenicol.classList.toggle('is-on', view.drugs.chloramphenicol > 0);
      LY.setText(this.buildLine, F.fill(C.actions.build, { build: this.app.build, seed: this.app.config.seed }));
    }
  }

  /** The preset key whose value matches x (the nearest one if none matches exactly). */
  function keyFor(values, x) {
    let best = null, bd = Infinity;
    for (const k of Object.keys(values)) {
      const d = Math.abs(values[k] - x);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  MediumPanel.keyFor = keyFor;
  return MediumPanel;
});
