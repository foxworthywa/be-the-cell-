// @deps btc-level-kit btc-misconceptions btc-level-constants
/*
 * Be the Cell: the Prologue, "You, right now" (LEVELS §7.P). Not scored.
 *
 * Scenes 1–5 are labelled line drawings of the student's own body, pancreas,
 * one beta cell and one ribosome (btc-prologue.js draws them); they are not
 * simulations, and each says so. Scenes 6–7 are the live lab bacterium. The
 * one question (p.q1) is answered like a debrief question: immediate
 * feedback, retries, the first tap logged. Its code is BTC1-P0-000000-….
 *
 * Every student-facing string is in TEXT (linted, §12.1 L-2).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../game/btc-level-kit.js'), require('../game/btc-misconceptions.js'),
      require('./btc-level-constants.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    (B.levelDefs || (B.levelDefs = {})).P = factory(B.levelKit, B.misconceptions, B.levelConstants);
  }
})(typeof self !== 'undefined' ? self : this, function (K, MC, LC) {
  'use strict';
  void MC; void LC;

  const TEXT = {
    title: 'You, right now',
    challenge: 'From you to one cell, then to a bacterium.',
    notToScale: 'Drawing, not to scale',
    scale: { m1: '1 m', cm10: '10 cm', um100: '100 µm', um10: '10 µm', nm30: '30 nm' },
    labels: {
      pancreas: 'pancreas', islet: 'islet', betaCell: 'beta cell', nucleus: 'nucleus',
      insulinGene: 'insulin gene', ribosome: 'ribosome', mRNA: 'mRNA', chain: 'growing chain',
    },
    alt: {
      body: 'Line drawing of a person, with the pancreas marked.',
      pancreas: 'Line drawing of the pancreas, with one islet drawn larger beside it.',
      betaCell: 'Line drawing of one beta cell, with its insulin gene marked inside the nucleus.',
      ribosome: 'Line drawing of a ribosome on an mRNA, with a protein chain coming out of it.',
    },
    scenes: {
      s1: [
        { who: 'narrator', text: 'Congratulations. You are in charge of a cell.' },
        { who: 'narrator', text: 'Several, actually. About thirty trillion of them.' },
      ],
      s2: [
        { who: 'narrator', text: 'This is your pancreas. It is making insulin right now, whether or not you are paying attention.' },
      ],
      s3: [
        { who: 'narrator', text: 'One beta cell. Its insulin gene sits in the nucleus, and it stays there.' },
      ],
      s4: [
        { who: 'ribosome', text: 'I read whatever mRNA lands on me. I have never once made a decision.' },
      ],
      s5: [
        { who: 'narrator', text: 'Your cells do this for thousands of genes at once. To see how, start with the simplest cell that does it all.' },
      ],
      s6: [
        { who: 'narrator', text: 'A bacterium. Its ribosomes do the same job as yours, and it reads the same genetic code.' },
        { who: 'narrator', text: 'It has no nucleus, so its ribosomes start on mRNA that is still being made.' },
      ],
      s7: [
        { who: 'narrator', text: 'This one is yours now. It has not been informed.' },
        { who: 'commander', text: 'Excellent. It will do as I say.' },
        { who: 'narrator', text: 'We will see.' },
      ],
    },
    q1: {
      prompt: 'Where did the mRNA this ribosome is reading come from?',
      options: [
        { t: 'It was copied from the insulin gene.', ok: true,
          fb: 'Right. The gene stays in the nucleus; its copies go out to the ribosomes.' },
        { t: 'It came from the food you ate.', mc: 'OTHER',
          fb: 'Food supplies building blocks. The instructions in this mRNA were copied from your own insulin gene.' },
        { t: 'It is the insulin gene itself, moved out of the nucleus.', mc: 'DNA_DIRECT',
          fb: 'The gene never leaves. The mRNA is a copy, and the gene can be copied again and again.' },
        { t: 'The ribosome made it.', mc: 'OTHER',
          fb: 'Ribosomes read mRNA; they do not write it. RNA polymerase copied it from the gene.' },
      ],
    },
    cards: { ribosome: 'Ribosome', code: 'Genetic code', noNucleus: 'No nucleus' },
  };

  const DEF = {
    id: 'P', code: 'P0', order: 0, version: 1, title: 'title', challenge: 'challenge', text: TEXT,
    mode: 'guided', scored: false, los: ['LO1', 'LO7'], misconceptions: ['DNA_DIRECT'], estMinutes: 3, engine: '1.1',
    phases: ['scenes', 'complete'],

    /** No variant: every student sees the same Prologue, and its code carries 000000. */
    variant() { return { seed: 0 }; },

    /** The live bacterium of scenes 6–7: the lab strain at steady state, seeded from the device, not recorded. */
    config(v, role, extra) {
      return {
        seed: K.seedFor((extra && extra.deviceSeed) >>> 0, 'prologue'), strain: 'm1-lab', start: 'steady',
        medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0 },
        variant: { levelId: 'P', content: 1, seed: 0 },
      };
    },
    labConfig() {
      return {
        showNames: true, controls: { genes: false, medium: false, drugs: false }, tabs: ['cell'], focusGene: 'ptsG',
        speedOptions: null, defaultSpeed: 60, startPaused: false, hud: false,
      };
    },

    scenes: [
      { id: 's1', picture: 'body', scale: 'm1', lines: TEXT.scenes.s1 },
      { id: 's2', picture: 'pancreas', scale: 'cm10', insetScale: 'um100', lines: TEXT.scenes.s2 },
      { id: 's3', picture: 'betaCell', scale: 'um10', lines: TEXT.scenes.s3 },
      { id: 's4', picture: 'ribosome', scale: 'nm30', lines: TEXT.scenes.s4, question: 'p.q1' },
      { id: 's5', picture: 'ribosome', scale: 'nm30', fade: true, lines: TEXT.scenes.s5 },
      { id: 's6', live: true, lines: TEXT.scenes.s6 },
      { id: 's7', live: true, lines: TEXT.scenes.s7 },
    ],

    predictions: [],
    debrief: [{ id: 'p.q1', kind: 'choice', prompt: TEXT.q1.prompt, options: TEXT.q1.options }],
    flags: [{ id: 'PRED_DNA_DIRECT', mc: 'DNA_DIRECT' }],
    /** Not scored: only the flag, raised by a first tap on the DNA_DIRECT option. */
    score(v, m, answers) {
      const q = answers.debrief['p.q1'];
      return { flags: q && q.firstMc === 'DNA_DIRECT' ? [{ id: 'PRED_DNA_DIRECT', data: { option: q.first } }] : [] };
    },
    echo: {
      screens: [],
      cards: [
        { id: 'ribosome', title: 'cards.ribosome', stamp: 'universal' },
        { id: 'genetic-code', title: 'cards.code', stamp: 'universal' },
        { id: 'no-nucleus', title: 'cards.noNucleus', stamp: 'bacteria' },
      ],
    },
    story: { intro: [], outro: [] },
    narratorRules: [],
    solutions: {
      reference: { debrief: { 'p.q1': 'ok' }, expect: { goal: true, par: true, flags: [] } },
      dnaDirect: { debrief: { 'p.q1': 2 }, expect: { goal: true, flags: ['PRED_DNA_DIRECT'] } },
    },
  };
  return DEF;
});
