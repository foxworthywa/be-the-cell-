// @deps btc-content btc-format btc-layout btc-controls btc-pwa
/*
 * Be the Cell: home and level select (LEVELS §5.1).
 *
 * One column of 72 px level rows on a phone, a two-column grid of tiles on a
 * laptop. Every level is open in any order; the list shows the recommended
 * order. The free-play lab is always one tap away. "My codes" lists each
 * level's first-attempt and latest codes with Copy buttons; "Cards" shows the
 * collected "Meanwhile, in you" cards, each stamped Universal or
 * "Not in your cells"; "Export my data" hands over progress and telemetry.
 *
 * HomeView.model(levels, progress) is pure (test L-13).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-content.js'), require('./btc-format.js'), require('./btc-layout.js'),
      require('./btc-controls.js'), require('./btc-pwa.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.HomeView = factory(B.content, B.format, B.layout, B.controls, B.pwa);
  }
})(typeof self !== 'undefined' ? self : this, function (C, F, LY, CTL, PWA) {
  'use strict';

  const H = C.home;

  const textAt = (def, key) => String(key).split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), def.text);
  const nameOf = (def) => F.fill(def.id === 'P' ? H.prologueName : H.levelName, { id: def.id, title: textAt(def, def.title) });

  /** The list model: rows with name, challenge, status chip and minutes; the Continue row; the card count. */
  function model(levels, progress) {
    const rows = levels.map((def) => {
      const results = progress.results(def.id);
      const latest = results.length ? results[results.length - 1] : null;
      const open = progress.isOpen(def.id);
      let status, state;
      if (open) { status = H.status.open; state = 'open'; }
      else if (latest) {
        state = 'done';
        status = def.scored && typeof latest.total === 'number' ? F.fill(H.status.doneTotal, { total: latest.total }) : H.status.done;
      } else { status = H.status.fresh; state = 'new'; }
      const nExpert = def.scored && def.text.task && def.text.task.expert ? def.text.task.expert.length : 0;
      const full = nExpert ? (1 << nExpert) - 1 : 0;
      const expert = full > 0 && results.some((r) => (r.X & full) === full);
      return {
        id: def.id, name: nameOf(def), challenge: textAt(def, def.challenge), status, state, expert,
        expertText: expert ? H.status.expert : '', minutes: F.fill(H.minutes, { n: def.estMinutes }),
      };
    });
    const openId = progress.openLevel();
    const openDef = openId ? levels.find((d) => d.id === openId) : null;
    return {
      rows,
      continueRow: openDef ? { id: openDef.id, text: F.fill(H.continueRow, { title: nameOf(openDef) }) } : null,
      cards: progress.cardIds().length,
    };
  }

  /** Card titles and stamps from every registered level. */
  function cardIndex(levels) {
    const out = {};
    for (const def of levels) for (const c of def.echo.cards) out[c.id] = { id: c.id, title: textAt(def, c.title), stamp: c.stamp, level: def.id };
    return out;
  }

  class HomeView {
    constructor(app) { this.app = app; this.root = null; }

    mount(root) { this.root = root; }

    render() {
      const app = this.app, h = LY.h, root = this.root;
      const m = model(app.BTC.levels.list, app.progress);
      root.textContent = '';
      const wrap = h('div', { class: 'home-wrap' });
      wrap.appendChild(h('header', { class: 'home-head' }, [
        h('h1', { class: 'home-title', text: H.title }), h('p', { class: 'home-tagline', text: H.tagline }),
      ]));
      if (m.continueRow) {
        wrap.appendChild(h('button', { class: 'btn primary home-continue', type: 'button', 'data-level': m.continueRow.id,
          onclick: () => app.enterLevel(m.continueRow.id) }, [h('span', { class: 'home-continue-mark', 'aria-hidden': 'true', text: '▸' }),
          h('span', { class: 'home-continue-text', text: m.continueRow.text })]));
      }
      const list = h('ol', { class: 'level-list', 'aria-label': H.listLabel });
      for (const r of m.rows) {
        list.appendChild(h('li', null, h('button', {
          class: 'level-row is-' + r.state, type: 'button', 'data-level': r.id, onclick: () => app.enterLevel(r.id),
        }, [
          h('span', { class: 'lr-top' }, [h('span', { class: 'lr-name', text: r.name }),
            h('span', { class: 'lr-chip st-' + r.state, text: r.status }), r.expert ? h('span', { class: 'lr-chip lr-expert', text: r.expertText }) : null]),
          h('span', { class: 'lr-challenge', text: r.challenge }),
          h('span', { class: 'lr-min', text: r.minutes }),
        ])));
      }
      wrap.appendChild(list);
      wrap.appendChild(h('div', { class: 'home-actions' }, [
        h('button', { class: 'btn home-lab', type: 'button', 'data-action': 'lab', onclick: () => app.enterLab() },
          [h('span', { class: 'choice-title', text: H.lab }), h('span', { class: 'choice-note', text: H.labNote })]),
        h('div', { class: 'home-row' }, [
          h('button', { class: 'btn', type: 'button', 'data-action': 'codes', onclick: () => this.openCodes() }, H.codes),
          h('button', { class: 'btn', type: 'button', 'data-action': 'cards', onclick: () => this.openCards() }, F.fill(H.cards, { n: m.cards })),
          h('button', { class: 'btn', type: 'button', 'data-action': 'about', onclick: () => this.openAbout() }, H.about),
        ]),
        h('p', { class: 'home-privacy', text: H.privacy }),
        h('button', { class: 'btn home-export', type: 'button', 'data-action': 'export', onclick: () => app.exportData() }, H.exportData),
      ]));
      root.appendChild(wrap);
    }

    openCodes() {
      const app = this.app, h = LY.h;
      app.logEvent('screen', { name: 'codes' });
      LY.openSheet({
        title: H.codesTitle, className: 'codes-sheet',
        build: (body) => {
          body.appendChild(h('p', { class: 'sheet-note', text: H.codesNote }));
          let any = false;
          for (const def of app.BTC.levels.list) {
            const first = app.progress.firstResult(def.id), latest = app.progress.latestResult(def.id);
            if (!latest) continue;
            any = true;
            const box = h('section', { class: 'code-row' }, [h('h3', { text: nameOf(def) })]);
            const add = (label, res) => {
              const text = h('span', { class: 'code-text', text: res.code });
              const status = h('span', { class: 'code-status', 'aria-live': 'polite' });
              box.appendChild(h('div', { class: 'code-line' }, [
                h('span', { class: 'code-label', text: label }), text,
                h('button', { class: 'btn small', type: 'button', onclick: () => {
                  PWA.copyText(res.code, text).then((r) => LY.setText(status, r === 'copied' ? H.copied : C.game.complete.copyFailed));
                } }, H.copy), status,
              ]));
            };
            if (first) add(H.codesFirst, first);
            if (latest && latest !== first && latest.code !== (first && first.code)) add(H.codesLatest, latest);
            body.appendChild(box);
          }
          if (!any) body.appendChild(h('p', { text: H.codesNone }));
        },
      });
    }

    openCards() {
      const app = this.app, h = LY.h;
      app.logEvent('screen', { name: 'cards' });
      const idx = cardIndex(app.BTC.levels.list);
      LY.openSheet({
        title: H.cardsTitle, className: 'cards-sheet',
        build: (body) => {
          body.appendChild(h('p', { class: 'sheet-note', text: H.cardsNote }));
          const ids = app.progress.cardIds().filter((id) => idx[id]);
          if (!ids.length) { body.appendChild(h('p', { text: H.cardsEmpty })); return; }
          body.appendChild(h('div', { class: 'card-tiles' }, ids.map((id) => cardTile(idx[id]))));
        },
      });
    }

    openAbout() {
      const app = this.app, h = LY.h, S = C.sheets.about;
      LY.openSheet({
        title: H.aboutTitle, className: 'about-sheet',
        build: (body) => {
          for (const t of H.aboutText) body.appendChild(h('p', { text: t }));
          const theme = CTL.segmented({ label: S.theme, options: S.themes, onSelect: (k) => { app.setTheme(k); theme.update(k, null); } });
          theme.update(app.prefs.theme, null);
          const motion = CTL.segmented({ label: S.motion, options: S.motions, onSelect: (k) => { app.setMotion(k); motion.update(k, null); } });
          motion.update(app.prefs.reducedMotion, null);
          body.appendChild(h('div', { class: 'ctl-row' }, [h('div', { class: 'ctl-label', text: S.theme }), theme.el]));
          body.appendChild(h('div', { class: 'ctl-row' }, [h('div', { class: 'ctl-label', text: S.motion }), motion.el]));
          body.appendChild(h('p', { class: 'sheet-note num', text: F.fill(S.version, { build: app.build, engine: app.BTC.ENGINE_VERSION }) }));
        },
      });
    }
  }

  /** A 72 px card tile with its title and its stamp, the word always printed. */
  function cardTile(c) {
    const h = LY.h, E = C.game.echo;
    return h('div', { class: 'card-tile stamp-' + c.stamp, 'data-card': c.id }, [
      h('span', { class: 'card-tile-title', text: c.title }),
      h('span', { class: 'card-stamp', text: c.stamp === 'universal' ? E.universal : E.bacteria }),
    ]);
  }

  HomeView.model = model;
  HomeView.cardIndex = cardIndex;
  HomeView.cardTile = cardTile;
  HomeView.nameOf = nameOf;
  return HomeView;
});
