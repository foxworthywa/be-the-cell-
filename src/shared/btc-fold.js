// @deps
/*
 * Be the Cell: model folds for level 1.5, "Shape is function" (docs/PROLOGUE.md §4.4). Hooks only:
 * the level's spec decides how a fold maps to a gene's engine `activity`.
 *
 * A short model chain of oily (H, water-avoiding) and water-loving (P) beads folds on a 2D square
 * lattice (the HP lattice model, Lau & Dill 1989): the best fold is the self-avoiding path with the
 * most H–H contacts. A mutation changes a bead (H ↔ P), ends the chain early (a stop) or shifts the
 * frame (every bead after it changes). The pocket is a set of bead indices; the protein works when
 * the pocket keeps its shape.
 *
 *   fold = {beads: 'HPPH…', path: [[x, y], …], pocket: [indices], works: bool}
 *   energy(fold)                 −(H–H contacts between beads not next to each other in the chain)
 *   best(beads)                  the lowest-energy fold by exhaustive search (≤ 16 beads; deterministic, cached)
 *   mutate(beads, m)             m: {kind: 'swap' | 'stop' | 'shift', at}  → the new bead string
 *   pocketShape(path, pocket)    the pocket's shape as a canonical string (the same under rotation and reflection)
 *   foldFor(beads, pocket, ref)  best(beads) with its pocket and whether it matches the reference pocket shape
 *   REFERENCE                    a 16-bead chain whose best fold holds a pocket (used by the pictures)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.machineFold = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_BEADS = 16;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const SPAN = 2 * MAX_BEADS + 1;
  const cache = new Map();

  const key = (x, y) => (x + MAX_BEADS) * SPAN + (y + MAX_BEADS);

  function contacts(beads, path) {
    const occ = new Map();
    for (let i = 0; i < path.length; i++) occ.set(key(path[i][0], path[i][1]), i);
    let c = 0;
    for (let i = 0; i < path.length; i++) {
      if (beads[i] !== 'H') continue;
      for (const [dx, dy] of DIRS) {
        const j = occ.get(key(path[i][0] + dx, path[i][1] + dy));
        if (j !== undefined && j > i + 1 && beads[j] === 'H') c++;
      }
    }
    return c;
  }

  function energy(fold) { return -contacts(fold.beads, fold.path); }

  /**
   * Exhaustive search over self-avoiding paths: the first step goes +x and the first turn goes +y
   * (every other fold is a rotation or reflection of one of these). Ties keep the first fold found,
   * so the answer is the same on every machine.
   */
  function best(beads) {
    if (typeof beads !== 'string' || !/^[HP]*$/.test(beads)) throw new Error('beads must be a string of H and P');
    if (beads.length > MAX_BEADS) throw new Error('at most ' + MAX_BEADS + ' beads');
    if (cache.has(beads)) return cache.get(beads);
    const n = beads.length;
    const xs = new Int8Array(n), ys = new Int8Array(n);
    const occ = new Int8Array(SPAN * SPAN).fill(-1);
    let bestC = -1, bestX = null, bestY = null;
    const place = (i, x, y) => { xs[i] = x; ys[i] = y; occ[key(x, y)] = i; };
    const gain = (i) => {
      if (beads[i] !== 'H') return 0;
      let g = 0;
      for (const [dx, dy] of DIRS) {
        const j = occ[key(xs[i] + dx, ys[i] + dy)];
        if (j >= 0 && j < i - 1 && beads[j] === 'H') g++;
      }
      return g;
    };
    // Remaining H beads can each add at most 2 contacts (3 for the last): a bound that prunes nothing wrong.
    const hLeft = new Int32Array(n + 1);
    for (let i = n - 1; i >= 0; i--) hLeft[i] = hLeft[i + 1] + (beads[i] === 'H' ? 1 : 0);
    function walk(i, c, turned) {
      if (i === n) {
        if (c > bestC) { bestC = c; bestX = Array.from(xs); bestY = Array.from(ys); }
        return;
      }
      if (c + 3 * hLeft[i] <= bestC) return;
      for (let d = 0; d < 4; d++) {
        if (!turned && d === 3) continue;                     // the first turn goes +y
        const x = xs[i - 1] + DIRS[d][0], y = ys[i - 1] + DIRS[d][1];
        if (occ[key(x, y)] >= 0) continue;
        place(i, x, y);
        walk(i + 1, c + gain(i), turned || d === 1);
        occ[key(x, y)] = -1;
      }
    }
    if (n === 0) { bestC = 0; bestX = []; bestY = []; }
    else {
      place(0, 0, 0);
      if (n === 1) { bestC = 0; bestX = [0]; bestY = [0]; }
      else { place(1, 1, 0); walk(2, 0, false); }
    }
    const path = bestX.map((x, i) => Object.freeze([x, bestY[i]]));
    const out = Object.freeze({ beads, path: Object.freeze(path), contacts: bestC });
    cache.set(beads, out);
    return out;
  }

  /** A deterministic bead for position i after a frameshift (FNV-1a of the old bead and position). */
  function shifted(b, i) {
    let h = 0x811c9dc5;
    h ^= b.charCodeAt(0); h = Math.imul(h, 0x01000193);
    h ^= i & 255; h = Math.imul(h, 0x01000193);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 7) & 1 ? 'H' : 'P';
  }

  function mutate(beads, m) {
    const at = m.at | 0;
    if (at < 0 || at >= beads.length) throw new Error('mutation outside the chain');
    if (m.kind === 'swap') return beads.slice(0, at) + (beads[at] === 'H' ? 'P' : 'H') + beads.slice(at + 1);
    if (m.kind === 'stop') return beads.slice(0, at);
    if (m.kind === 'shift') {
      let s = beads.slice(0, at);
      for (let i = at; i < beads.length; i++) s += shifted(beads[i], i);
      return s;
    }
    throw new Error('unknown mutation ' + m.kind);
  }

  /** The pocket beads' relative positions, canonical under the 8 lattice symmetries ('' if a bead is missing). */
  function pocketShape(path, pocket) {
    for (const i of pocket) if (i >= path.length) return '';
    let bestS = null;
    const T = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0], [-1, 0, 0, 1], [1, 0, 0, -1], [0, 1, 1, 0], [0, -1, -1, 0]];
    for (const [a, b, c, d] of T) {
      const pts = pocket.map((i) => [a * path[i][0] + b * path[i][1], c * path[i][0] + d * path[i][1]]);
      const mx = Math.min(...pts.map((p) => p[0])), my = Math.min(...pts.map((p) => p[1]));
      const s = pts.map((p) => (p[0] - mx) + ',' + (p[1] - my)).join(' ');
      if (bestS === null || s < bestS) bestS = s;
    }
    return bestS;
  }

  function foldFor(beads, pocket, reference) {
    const b = best(beads);
    const shape = pocketShape(b.path, pocket);
    const refShape = reference ? pocketShape(reference.path, reference.pocket) : shape;
    return { beads, path: b.path, pocket: pocket.slice(), contacts: b.contacts, works: shape !== '' && shape === refShape };
  }

  // A 16-bead chain whose best fold wraps its oily beads into a core and leaves a notch lined by
  // beads 6–9 (the pocket drawn in the pictures).
  const REFERENCE_BEADS = 'HPHPPHHPPHHPPHPH';
  const REFERENCE_POCKET = Object.freeze([6, 7, 8, 9]);

  return {
    MAX_BEADS, energy, best, mutate, pocketShape, foldFor,
    get REFERENCE() { const b = best(REFERENCE_BEADS); return { beads: REFERENCE_BEADS, path: b.path, pocket: REFERENCE_POCKET.slice(), works: true }; },
  };
});
