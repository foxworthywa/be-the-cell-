// @deps
/*
 * Be the Cell: cell-view geometry (LAB_UI §2.2). Pure and tested (U-2).
 *
 * The rod is a spherocylinder lying along the stage's long axis. Its length
 * is to scale (view.cell.length_um); its width is drawn twice the true width
 * so the inside is readable (the legend says so). pxPerUm is fixed for the
 * session so that growth is visible: it is chosen once so that a 2.3 fL rod
 * plus 12% fits the long axis.
 *
 * Positions inside the cell are cell-local: u in [0,1] along the axis, v in
 * [-1,1] across it. map() scales v by the local half-width, so the caps are
 * round and a point stretches with the cell as it grows instead of jumping.
 * Membrane positions use a perimeter coordinate s in [0,1).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.cellgeom = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROD_RADIUS_UM = 0.38;       // true radius (btc-params rodRadius)
  const FIT_VOLUME_FL = 2.3;        // the rod that must fit: just above division size (~2 fL)
  const FIT_MARGIN = 1.12;          // 12% margin on the long axis
  const WIDTH_DRAWN = 2;            // width exaggeration, disclosed in the legend
  const U_INSET = 0.96, V_INSET = 0.9;   // keep mapped points strictly inside the membrane

  /** Rod length (µm) of a spherocylinder of volume V (fL = µm³) and radius r (µm). */
  function lengthForVolume(V, r) {
    const cap = (4 / 3) * Math.PI * r * r * r;
    return Math.max(2 * r, (V - cap) / (Math.PI * r * r) + 2 * r);
  }

  // Orientation hysteresis: a stage that is nearly square keeps the rod's current orientation.
  const TURN = 1.1;

  /**
   * A geometry for a stage of w × h CSS px. fit() then sets the rod's current size.
   * prevVertical (optional): the orientation so far; it changes only when the other axis is 10% longer.
   */
  function create(w, h, prevVertical) {
    let vertical = h > w;
    if (prevVertical === true && !(w > TURN * h)) vertical = true;
    else if (prevVertical === false && !(h > TURN * w)) vertical = false;
    const along = vertical ? h : w, across = vertical ? w : h;
    const fitLen = lengthForVolume(FIT_VOLUME_FL, ROD_RADIUS_UM);
    const fitWidth = 2 * ROD_RADIUS_UM * WIDTH_DRAWN;
    // The long axis sets the scale; the short axis may cap it on very wide, short stages.
    const pxPerUm = Math.max(1, Math.min(along / (fitLen * FIT_MARGIN), across / (fitWidth * 1.35)));
    return {
      w, h, vertical, cx: w / 2, cy: h / 2, pxPerUm, fitLen_um: fitLen,
      L: 0, r: 0, half: 0, straight: 0, pinch: 0, pinchW: 0, length_um: 0, scaleSteps: 0,
    };
  }

  /**
   * Sets the rod's size from the view: length_um (true) and width_um (true,
   * drawn ×2), and the septum pinch depth as a fraction of the half-width.
   * If the rod would outgrow the stage, pxPerUm steps down by 15% (returns true).
   */
  function fit(g, length_um, width_um, pinchFrac) {
    let changed = false;
    while (length_um * g.pxPerUm * FIT_MARGIN > (g.vertical ? g.h : g.w) && g.scaleSteps < 20) {
      g.pxPerUm *= 0.85;
      g.scaleSteps++;
      changed = true;
    }
    g.length_um = length_um;
    g.L = length_um * g.pxPerUm;
    g.r = (width_um * WIDTH_DRAWN / 2) * g.pxPerUm;
    g.half = g.L / 2;
    g.straight = Math.max(0, g.half - g.r);
    g.pinch = Math.max(0, Math.min(0.95, pinchFrac || 0)) * g.r;
    g.pinchW = g.r * 0.7;
    return changed;
  }

  /** Depth of the septum pinch at axial offset s (px from the centre). */
  function pinchAt(g, s) {
    if (g.pinch <= 0) return 0;
    const d = s / g.pinchW;
    return d >= 1 || d <= -1 ? 0 : g.pinch * (1 - d * d);
  }

  /** Membrane half-width at axial offset s (px from the centre), including caps and pinch. */
  function halfWidthAt(g, s) {
    const a = s < 0 ? -s : s;
    let hw;
    if (a <= g.straight) hw = g.r;
    else if (a >= g.half) hw = 0;
    else { const d = a - g.straight; hw = Math.sqrt(Math.max(0, g.r * g.r - d * d)); }
    return Math.max(0, hw - pinchAt(g, s));
  }

  function toStage(g, s, t, out) {
    if (g.vertical) { out.x = g.cx + t; out.y = g.cy + s; } else { out.x = g.cx + s; out.y = g.cy + t; }
    return out;
  }

  /** Cell-local (u in [0,1], v in [-1,1]) to stage px, strictly inside the membrane. */
  function map(u, v, g, out) {
    const o = out || { x: 0, y: 0 };
    const s = (u - 0.5) * g.L * U_INSET;
    return toStage(g, s, v * halfWidthAt(g, s) * V_INSET, o);
  }

  /** Perimeter coordinate s in [0,1) to a point on the membrane and its outward normal. */
  function perimeter(s01, g, out) {
    const o = out || { x: 0, y: 0, nx: 0, ny: 0 };
    const side = 2 * g.straight, arc = Math.PI * g.r;
    const P = 2 * side + 2 * arc;
    let d = (s01 - Math.floor(s01)) * P;
    let s, t, ns, nt;
    if (d < side) {                                     // side at t = +r, running +s
      s = -g.straight + d; t = g.r; ns = 0; nt = 1;
    } else if ((d -= side) < arc) {                     // cap at +s
      const a = Math.PI / 2 - d / g.r;
      ns = Math.cos(a); nt = Math.sin(a);
      s = g.straight + g.r * ns; t = g.r * nt;
    } else if ((d -= arc) < side) {                     // side at t = -r, running -s
      s = g.straight - d; t = -g.r; ns = 0; nt = -1;
    } else {                                            // cap at -s
      d -= side;
      const a = -Math.PI / 2 - d / g.r;
      ns = Math.cos(a); nt = Math.sin(a);
      s = -g.straight + g.r * ns; t = g.r * nt;
    }
    if (ns === 0) t = nt * (g.r - pinchAt(g, s));       // the pinch moves the sides in
    toStage(g, s, t, o);
    if (g.vertical) { o.nx = nt; o.ny = ns; } else { o.nx = ns; o.ny = nt; }
    return o;
  }

  /** Is stage point (x, y) inside the membrane, grown by pad px? */
  function inside(g, x, y, pad) {
    const s = g.vertical ? y - g.cy : x - g.cx;
    const t = g.vertical ? x - g.cx : y - g.cy;
    const p = pad || 0;
    const a = (s < 0 ? -s : s);
    if (a > g.half + p) return false;
    if (a <= g.straight) return (t < 0 ? -t : t) <= g.r + p;
    const d = a - g.straight;
    return d * d + t * t <= (g.r + p) * (g.r + p);
  }

  /**
   * Appends the membrane outline, grown by `inflate` px, as one closed subpath
   * (ctx is any object with moveTo/lineTo/arc/closePath). With a pinch the
   * sides are traced point by point so the septum shows.
   */
  function trace(ctx, g, inflate) {
    const r = Math.max(0.5, g.r + inflate), st = g.straight;
    const P = (s, t) => (g.vertical ? ctx.lineTo(g.cx + t, g.cy + s) : ctx.lineTo(g.cx + s, g.cy + t));
    const M = (s, t) => (g.vertical ? ctx.moveTo(g.cx + t, g.cy + s) : ctx.moveTo(g.cx + s, g.cy + t));
    const N = g.pinch > 0 ? 24 : 1;
    M(-st, r);
    for (let i = 1; i <= N; i++) { const s = -st + (2 * st * i) / N; P(s, r - pinchAt(g, s)); }
    // cap at +s: angle runs from +t round to -t
    for (let i = 1; i <= 12; i++) { const a = Math.PI / 2 - (Math.PI * i) / 12; P(st + r * Math.cos(a), r * Math.sin(a)); }
    for (let i = 1; i <= N; i++) { const s = st - (2 * st * i) / N; P(s, -(r - pinchAt(g, s))); }
    for (let i = 1; i <= 12; i++) { const a = -Math.PI / 2 - (Math.PI * i) / 12; P(-st + r * Math.cos(a), r * Math.sin(a)); }
    ctx.closePath();
  }

  // ---------------------------------------------------------------------------
  // Nucleoid and chromosome (§2.2): one lobe, or two after replication
  // ---------------------------------------------------------------------------
  const DNA_POINTS = 16;

  /** Lobes as {u, du, dv}: centre u and half-spans in u and v (cell-local). */
  function lobes(dosage) {
    return dosage >= 2
      ? [{ u: 0.3, du: 0.2, dv: 0.6 }, { u: 0.7, du: 0.2, dv: 0.6 }]
      : [{ u: 0.5, du: 0.275, dv: 0.6 }];
  }

  /**
   * The chromosome loop of a lobe: 16 control points in (u, v), placed by a
   * hash of (lobe, epoch) via hash01(key, index, epoch). Written into out
   * (Float64Array of 32).
   */
  function dnaLoop(lobe, lobeIndex, epoch, hash01, out) {
    for (let k = 0; k < DNA_POINTS; k++) {
      const a = (2 * Math.PI * (k + 0.35 * hash01('dnaA', k + 16 * lobeIndex, epoch))) / DNA_POINTS;
      const rho = 0.5 + 0.45 * hash01('dnaR', k + 16 * lobeIndex, epoch);
      out[2 * k] = lobe.u + lobe.du * rho * Math.cos(a);
      out[2 * k + 1] = lobe.dv * rho * Math.sin(a);
    }
    return out;
  }

  /**
   * A point at parameter T in [0,16) along the smooth closed curve through the
   * control points (quadratic segments between midpoints), in (u, v).
   */
  function loopPoint(pts, T, out) {
    const n = DNA_POINTS;
    const i = Math.floor(T) % n, f = T - Math.floor(T);
    const ip = (i + n - 1) % n, inx = (i + 1) % n;
    const m0u = (pts[2 * ip] + pts[2 * i]) / 2, m0v = (pts[2 * ip + 1] + pts[2 * i + 1]) / 2;
    const m1u = (pts[2 * i] + pts[2 * inx]) / 2, m1v = (pts[2 * i + 1] + pts[2 * inx + 1]) / 2;
    const a = (1 - f) * (1 - f), b = 2 * (1 - f) * f, c = f * f;
    out.u = a * m0u + b * pts[2 * i] + c * m1u;
    out.v = a * m0v + b * pts[2 * i + 1] + c * m1v;
    return out;
  }

  /** Gene slot k sits at fraction (k + 0.5)/8 along its lobe's loop. */
  function locusT(slot) { return ((slot + 0.5) / 8) * DNA_POINTS; }

  // ---------------------------------------------------------------------------
  // Hit testing: a coarse 8 × 8 grid over the stage, nearest item within 16 px
  // ---------------------------------------------------------------------------
  class HitGrid {
    constructor(capacity) {
      this.cap = capacity;
      this.x = new Float32Array(capacity);
      this.y = new Float32Array(capacity);
      this.next = new Int32Array(capacity);
      this.head = new Int32Array(64);
      this.n = 0; this.w = 1; this.h = 1;
    }
    build(xs, ys, n, w, h) {
      this.n = Math.min(n, this.cap);
      this.w = Math.max(1, w); this.h = Math.max(1, h);
      this.head.fill(-1);
      for (let i = 0; i < this.n; i++) {
        this.x[i] = xs[i]; this.y[i] = ys[i];
        const c = this.cellOf(xs[i], ys[i]);
        this.next[i] = this.head[c];
        this.head[c] = i;
      }
    }
    cellOf(x, y) {
      const cx = Math.max(0, Math.min(7, Math.floor((x / this.w) * 8)));
      const cy = Math.max(0, Math.min(7, Math.floor((y / this.h) * 8)));
      return cy * 8 + cx;
    }
    /** Index of the nearest item within maxDist px, or -1. */
    nearest(x, y, maxDist) {
      const md = maxDist || 16;
      const x0 = Math.max(0, Math.floor(((x - md) / this.w) * 8)), x1 = Math.min(7, Math.floor(((x + md) / this.w) * 8));
      const y0 = Math.max(0, Math.floor(((y - md) / this.h) * 8)), y1 = Math.min(7, Math.floor(((y + md) / this.h) * 8));
      let best = -1, bd = md * md;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          for (let i = this.head[cy * 8 + cx]; i >= 0; i = this.next[i]) {
            const dx = this.x[i] - x, dy = this.y[i] - y, d = dx * dx + dy * dy;
            if (d <= bd) { bd = d; best = i; }
          }
        }
      }
      return best;
    }
  }

  return {
    ROD_RADIUS_UM, FIT_VOLUME_FL, WIDTH_DRAWN, DNA_POINTS,
    lengthForVolume, create, fit, halfWidthAt, pinchAt, map, perimeter, inside, trace,
    lobes, dnaLoop, loopPoint, locusT, HitGrid,
  };
});
