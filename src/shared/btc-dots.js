// @deps
/*
 * Be the Cell: dots (engine spec §12). Pure helpers for drawing molecules.
 *
 * A dot stands for N molecules, with N from a fixed ladder (1, 10, 100, …),
 * and the legend always says so. Dot positions come from a hash of (species,
 * index, epoch), never from a random-number stream, so drawing cannot disturb
 * the simulation, and dot k stays put while counts change: only the
 * highest-numbered dots appear or disappear. The layout reshuffles once per
 * generation (epoch), which makes the halving at division visible.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.dots = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LADDER = Object.freeze([1, 10, 100, 1000, 1e4, 1e5, 1e6]);
  const HYSTERESIS = 1.2;          // a scale changes only once its threshold is crossed by 20%

  /** Smallest ladder step N with count/N ≤ limit (the top step if none fits). */
  function smallestFit(count, limit) {
    for (let i = 0; i < LADDER.length; i++) if (count / LADDER[i] <= limit) return LADDER[i];
    return LADDER[LADDER.length - 1];
  }

  /**
   * Molecules per dot for a count, at most maxDots dots (default 120), with 20%
   * hysteresis around the previous scale so the legend does not flicker.
   */
  function scaleFor(count, maxDots, prevScale) {
    const max = maxDots || 120;
    const n = count > 0 ? count : 0;
    if (!prevScale) return smallestFit(n, max);
    if (n / prevScale > max * HYSTERESIS) return smallestFit(n, max);             // too many dots: step up
    const down = smallestFit(n, max / HYSTERESIS);                                // comfortably fewer: step down
    return down < prevScale ? down : prevScale;
  }

  /** Dots to draw for n molecules at N per dot: rounded to the nearest dot. */
  function count(n, N) {
    return Math.floor(n / N + 0.5);
  }

  // FNV-1a over the key's code units, then the index and epoch as 4 bytes each.
  function mix(h, x) {
    for (let s = 0; s < 32; s += 8) {
      h ^= (x >>> s) & 255;
      h = Math.imul(h, 0x01000193);
    }
    return h;
  }

  function hash32(key, index, epoch, basis) {
    let h = basis;
    for (let i = 0; i < key.length; i++) {
      const c = key.charCodeAt(i);
      h ^= c & 255; h = Math.imul(h, 0x01000193);
      h ^= c >>> 8; h = Math.imul(h, 0x01000193);
    }
    h = mix(h, index | 0);
    h = mix(h, epoch | 0);
    // Final avalanche so neighbouring indices land far apart.
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** A number in [0, 1) from (key, index, epoch); used for positions along the membrane. */
  function hash01(key, index, epoch) {
    return hash32(key, index, epoch, 0x811c9dc5) / 4294967296;
  }

  /**
   * Position of dot `index` of a species: (u, v) in [0,1)², or a point in rect
   * {x, y, w, h} when one is given. Written into out (reused; no allocation).
   */
  function pos(speciesKey, index, epoch, rect, out) {
    const o = out || { x: 0, y: 0 };
    const u = hash32(speciesKey, index, epoch, 0x811c9dc5) / 4294967296;
    const v = hash32(speciesKey, index, epoch, 0x050c5d1f) / 4294967296;
    if (rect) { o.x = rect.x + u * rect.w; o.y = rect.y + v * rect.h; }
    else { o.x = u; o.y = v; }
    return o;
  }

  /**
   * Turns a flux into whole particles to draw: add(flux_perS × dtSim) returns
   * how many to spawn now and carries the remainder, so over time the
   * particles drawn match the flux exactly.
   */
  class FluxEmitter {
    constructor(N) {
      this.N = N || 1;
      this.carry = 0;
    }
    add(amount) {
      const x = this.carry + (amount > 0 ? amount : 0) / this.N;
      const k = Math.floor(x);
      this.carry = x - k;
      return k;
    }
    reset() { this.carry = 0; }
  }

  // Default molecules per dot (spec §12); proteins use scaleFor on a shared scale.
  const DEFAULT_SCALES = Object.freeze({
    mRNA: 1, nascent: 1, ribosomePool: 100, ATP: 1e5, aminoAcids: 1e5, lactose: 1e5,
    focusPolysome: 1, focusPolysomeCoarse: 10,
  });

  /** Focus-gene polysome scale: 1 ribosome per glyph, 10 above 400 ribosomes, back to 1 below 320. */
  function polysomeScale(ribosomes, prev) {
    if (prev === 10) return ribosomes < 320 ? 1 : 10;
    return ribosomes > 400 ? 10 : 1;
  }

  return { LADDER, HYSTERESIS, DEFAULT_SCALES, scaleFor, count, hash01, pos, FluxEmitter, polysomeScale };
});
