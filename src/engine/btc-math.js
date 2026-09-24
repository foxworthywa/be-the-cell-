// @deps
/*
 * Be the Cell: deterministic math (engine spec §4).
 *
 * Everything inside src/engine must give bit-identical results on every
 * browser, because a run is stored as (config, seed, command log) and is
 * replayed elsewhere. ECMAScript lets Math.exp, Math.log and Math.sqrt differ
 * between engines, so the engine uses the versions here, built only from
 * correctly rounded + − × ÷.
 *
 * Also here: string ordering without a comparator sort, the FNV-1a hashes,
 * the canonical byte writer/reader behind hash() and snapshots, and base64.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.math = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LN2 = 0.6931471805599453;
  // ln 2 split so that k·LN2HI is exact for |k| < 2^20 (Cody–Waite reduction).
  const LN2HI = 0.6931471803691238;
  const LN2LO = 1.9082149292705877e-10;

  // Molecules per (mM·fL): Avogadro's number × 1e-3 mol/L × 1e-15 L.
  const N_mM = 602214.076;

  // Exact powers of two, 2^-1100 … 2^1100, built by repeated doubling and halving.
  const POW2 = new Float64Array(2201);
  (function () {
    let p = 1;
    POW2[1100] = 1;
    for (let k = 1; k <= 1100; k++) { p *= 2; POW2[1100 + k] = p; }
    p = 1;
    for (let k = 1; k <= 1100; k++) { p /= 2; POW2[1100 - k] = p; }
  })();

  /** e^x from + − × ÷ only: range reduction by ln 2, then a degree-13 Taylor polynomial. */
  function detExp(x) {
    if (x < -745) return 0;
    if (x > 709) return Infinity;
    const k = Math.round(x / LN2);
    const r = (x - k * LN2HI) - k * LN2LO;          // |r| ≤ ln2/2
    let s = 1 / 6227020800;                          // 1/13!
    s = s * r + 1 / 479001600;
    s = s * r + 1 / 39916800;
    s = s * r + 1 / 3628800;
    s = s * r + 1 / 362880;
    s = s * r + 1 / 40320;
    s = s * r + 1 / 5040;
    s = s * r + 1 / 720;
    s = s * r + 1 / 120;
    s = s * r + 1 / 24;
    s = s * r + 1 / 6;
    s = s * r + 0.5;
    s = s * r + 1;
    s = s * r + 1;
    return s * POW2[1100 + k];
  }

  /** √y by Newton's method from a power-of-two guess at or above the root; a fixed 40 steps. */
  function dsqrt(y) {
    if (!(y > 0)) return 0;
    let g = 1;
    while (g * g < y) g = g * 2;
    for (let i = 0; i < 40; i++) g = 0.5 * (g + y / g);
    return g;
  }

  /** x^n for a small non-negative integer n, by repeated multiplication (Math.pow is banned, §2.3). */
  function powInt(x, n) {
    let r = 1;
    for (let i = 0; i < n; i++) r *= x;
    return r;
  }

  /**
   * Hill function x^n/(x^n + Kn) with an integer coefficient n and Kn = K^n given
   * (precomputed once with powInt). 0 for x ≤ 0.
   */
  function hill(x, Kn, n) {
    if (!(x > 0)) return 0;
    const xn = powInt(x, n);
    return xn / (xn + Kn);
  }

  /** In-place insertion sort of strings by UTF-16 code units (no comparator sort, no locale). */
  function sortStrings(arr) {
    for (let i = 1; i < arr.length; i++) {
      const v = arr[i];
      let j = i - 1;
      while (j >= 0 && v < arr[j]) { arr[j + 1] = arr[j]; j--; }
      arr[j + 1] = v;
    }
    return arr;
  }

  /** UTF-8 bytes of a string (labels and JSON keys; no TextEncoder needed). */
  function utf8(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        const d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  const FNV_PRIME = 0x01000193;

  /** FNV-1a, 32 bit, over a byte array (or the UTF-8 bytes of a string). Returns uint32. */
  function fnv1a32(data, basis) {
    const bytes = typeof data === 'string' ? utf8(data) : data;
    let h = basis === undefined ? 0x811c9dc5 : basis;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, FNV_PRIME);
    }
    return h >>> 0;
  }

  function hex8(u) {
    const s = (u >>> 0).toString(16);
    return '00000000'.slice(s.length) + s;
  }

  /** 64-bit digest as 16 hex characters: two FNV-1a lanes with different offset bases. */
  function hash64(bytes) {
    return hex8(fnv1a32(bytes, 0x811c9dc5)) + hex8(fnv1a32(bytes, 0x050c5d1f));
  }

  // ---------------------------------------------------------------------------
  // Canonical bytes: little-endian DataView; numbers as float64, integer arrays
  // as int32. Variable-length structures are written as a length, then entries.
  // ---------------------------------------------------------------------------
  class ByteWriter {
    constructor(capacity) {
      this.buf = new ArrayBuffer(capacity || 65536);
      this.dv = new DataView(this.buf);
      this.n = 0;
    }
    _room(k) {
      if (this.n + k <= this.buf.byteLength) return;
      let cap = this.buf.byteLength * 2;
      while (cap < this.n + k) cap *= 2;
      const next = new ArrayBuffer(cap);
      new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.n));
      this.buf = next;
      this.dv = new DataView(next);
    }
    f64(x) { this._room(8); this.dv.setFloat64(this.n, x, true); this.n += 8; }
    i32(x) { this._room(4); this.dv.setInt32(this.n, x, true); this.n += 4; }
    u32(x) { this._room(4); this.dv.setUint32(this.n, x >>> 0, true); this.n += 4; }
    /** Writes one string as its UTF-16 length and code units (used for small tags only). */
    str(s) { this.i32(s.length); for (let i = 0; i < s.length; i++) this.i32(s.charCodeAt(i)); }
    bytes() { return new Uint8Array(this.buf.slice(0, this.n)); }
  }

  class ByteReader {
    constructor(bytes) {
      this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.n = 0;
    }
    f64() { const x = this.dv.getFloat64(this.n, true); this.n += 8; return x; }
    i32() { const x = this.dv.getInt32(this.n, true); this.n += 4; return x; }
    u32() { const x = this.dv.getUint32(this.n, true); this.n += 4; return x; }
    str() { const k = this.i32(); let s = ''; for (let i = 0; i < k; i++) s += String.fromCharCode(this.i32()); return s; }
    get done() { return this.n === this.dv.byteLength; }
  }

  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64_INDEX = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) B64_INDEX[B64.charCodeAt(i)] = i;

  function base64Encode(bytes) {
    let s = '';
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      s += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
    }
    const rest = bytes.length - i;
    if (rest === 1) {
      const v = bytes[i] << 16;
      s += B64[v >> 18] + B64[(v >> 12) & 63] + '==';
    } else if (rest === 2) {
      const v = (bytes[i] << 16) | (bytes[i + 1] << 8);
      s += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + '=';
    }
    return s;
  }

  function base64Decode(s) {
    let len = s.length;
    while (len > 0 && s[len - 1] === '=') len--;
    const out = new Uint8Array(Math.floor(len * 3 / 4));
    let o = 0, acc = 0, bits = 0;
    for (let i = 0; i < len; i++) {
      const v = B64_INDEX[s.charCodeAt(i)];
      if (v < 0) throw new Error('base64: bad character at ' + i);
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
    }
    return out;
  }

  /**
   * JSON with object keys ordered by sortStrings, so equal values give equal
   * text on every engine (configHash, paramsHash). −0 is written as 0.
   */
  function canonicalJSON(value) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'number') return JSON.stringify(value + 0);
      return JSON.stringify(value === undefined ? null : value);
    }
    if (Array.isArray(value)) {
      let s = '[';
      for (let i = 0; i < value.length; i++) s += (i ? ',' : '') + canonicalJSON(value[i]);
      return s + ']';
    }
    const keys = sortStrings(Object.keys(value));
    let s = '{', first = true;
    for (let i = 0; i < keys.length; i++) {
      const v = value[keys[i]];
      if (v === undefined) continue;
      s += (first ? '' : ',') + JSON.stringify(keys[i]) + ':' + canonicalJSON(v);
      first = false;
    }
    return s + '}';
  }

  return {
    LN2, LN2HI, LN2LO, N_mM, POW2,
    detExp, dsqrt, powInt, hill, sortStrings, utf8, fnv1a32, hash64, canonicalJSON,
    ByteWriter, ByteReader, base64Encode, base64Decode,
  };
});
