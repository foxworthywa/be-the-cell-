// @deps
/*
 * Be the Cell: scoring (LEVELS §6; docs/PROLOGUE.md §1.4, coordinator decision on open question 4).
 *
 *   S = round(100 · (0.45·G + 0.25·G·E + 0.30·D_first/D_total))        (code format BTC2, from the redesign)
 *
 * G (goal met, 0/1) comes from the level's monitor, E (efficiency against
 * par, 0–1) counts only when the goal was met, and D is the Explain (debrief)
 * answers that were right on the first tap. Guesses and predictions teach, so
 * they are no longer scored: P is still reported in the code (older levels
 * lock predictions in) but never counts. Within par ⇔ E ≥ 0.8. The opening is
 * not scored: its total is null. Flags never change the score.
 *
 * Codes of the first format (BTC1) were totalled with the old weights,
 *   S1 = round(100 · (0.40·G + 0.20·G·E + 0.20·P + 0.20·D_first/D_total)),
 * which totalV1 keeps so the instructor's decoder can still read them.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.score = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WEIGHTS = Object.freeze({ G: 0.45, E: 0.25, P: 0, D: 0.30 });
  // The weights of code format 1 (BTC1), before predictions left the score.
  const WEIGHTS_V1 = Object.freeze({ G: 0.40, E: 0.20, P: 0.20, D: 0.20 });
  const PAR = 0.8;

  const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);

  function weighted(W, c) {
    const G = c.G ? 1 : 0;
    const E = G && typeof c.E === 'number' ? clamp01(c.E) : 0;
    const P = typeof c.P === 'number' ? clamp01(c.P) : 0;
    const D = c.D && c.D[1] > 0 ? c.D[0] / c.D[1] : 0;
    return Math.round(100 * (W.G * G + W.E * G * E + W.P * P + W.D * D));
  }

  /** The total S (0–100) of components {G, E, D: [first, total]} (P, if given, does not count). */
  function total(c) { return weighted(WEIGHTS, c); }

  /** The total of a code in the first format (BTC1): predictions counted a fifth. */
  function totalV1(c) { return weighted(WEIGHTS_V1, c); }

  const withinPar = (E) => typeof E === 'number' && E >= PAR;

  /** E = clamp(1 − per·max(0, n − par), 0, 1): 1.1's experiments and 1.4's setting changes. */
  function stepPenalty(n, par, per) {
    return clamp01(1 - per * Math.max(0, n - par));
  }

  /** E = 1 while m ≤ par, then clamp(1 − (m − par)/par, 0, 1): 1.2's mRNA budget. */
  function overBudget(m, par) {
    return m <= par ? 1 : clamp01(1 - (m - par) / par);
  }

  /** A 0–1 component in percent for display and codes; null stays null ("NA"). */
  function percent(x) {
    return typeof x === 'number' ? Math.round(100 * clamp01(x)) : null;
  }

  /** The mean of booleans (true = 1), or null for none. */
  function mean(bools) {
    if (!bools.length) return null;
    let n = 0;
    for (const b of bools) if (b) n++;
    return n / bools.length;
  }

  /** The flag byte: bit k set when the level's k-th flag was raised. */
  function flagMask(flagIds, raised) {
    const on = {};
    for (const f of raised || []) on[typeof f === 'string' ? f : f.id] = true;
    let mask = 0;
    flagIds.forEach((id, k) => { if (on[id]) mask |= 1 << k; });
    return mask;
  }

  /** The Expert mask: bit k set when objective k was met. */
  function expertMask(bits) {
    let mask = 0;
    (bits || []).forEach((b, k) => { if (b) mask |= 1 << k; });
    return mask;
  }

  return { WEIGHTS, WEIGHTS_V1, PAR, clamp01, total, totalV1, withinPar, stepPenalty, overBudget, percent, mean, flagMask, expertMask };
});
