// @deps btc-palette btc-layout btc-format
/*
 * Be the Cell: a flat picture language for protein machines (docs/PROLOGUE.md §4), and the
 * Protein zoom (§3.4).
 *
 *   BTC.machineArt   the pictures: molecule outlines (§4.2); machines whose pocket is cut to the
 *                    shape of what they carry or change (a transporter's two halves, the lactose
 *                    splitter's four chains, a generic enzyme, the flagellum protein, the repressor
 *                    on its DNA); a chain folding into its shape; oily stretches hatched.
 *   BTC.MachineView  draws one representative molecule of the focus gene's protein at its cycle
 *                    (BTC.closeup.machineState), the molecule that does not fit bouncing off, and
 *                    the four-panel strip under reduced motion.
 *   BTC.MachineCard  a 96 × 96 picture plus what it does, its name, where it works (§4.3).
 *
 * Coordinates are nm from the machine's centre, y down (for a membrane protein the outside is
 * up); s is px per nm. Everything is appended to the current path or drawn with a few fills and
 * strokes per machine (Protein zoom ≤ 80 path operations, §8). Pocket outlines are computed
 * once per molecule from its outline plus a margin, so the fit on screen is the fit of the shapes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-palette.js'), require('./btc-layout.js'), require('./btc-format.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    const api = factory(B.palette, B.layout, B.format);
    B.machineArt = api.art;
    B.MachineView = api.MachineView;
    B.MachineCard = api.MachineCard;
  }
})(typeof self !== 'undefined' ? self : this, function (PAL, LY, F) {
  'use strict';

  const TAU = 6.283185307179586;
  const DASH_33 = [3, 3], DASH_44 = [4, 4], DASH_54 = [5, 4], NO_DASH = [];
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // ---------------------------------------------------------------------------
  // Molecule outlines (§4.2), in nm: convex polygons (pts) and circles, pointy-top hexagons
  // ---------------------------------------------------------------------------
  function hexPts(cx, cy, r) {
    const out = [];
    for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 3; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  function barPts(x0, y0, x1, y1, t) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * t, ny = (dx / L) * t;
    return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
  }
  const R_HEX = 0.42;
  function sugar(cx, cy, armSide) {
    // A six-ring with one short arm (its sixth carbon) at the upper-left (glucose) or lower-left (galactose) corner.
    const parts = [{ poly: hexPts(cx, cy, R_HEX) }];
    if (armSide) {
      const v = armSide < 0 ? [cx - 0.866 * R_HEX, cy - 0.5 * R_HEX] : [cx - 0.866 * R_HEX, cy + 0.5 * R_HEX];
      const tip = armSide < 0 ? [v[0] - 0.24, v[1] - 0.14] : [v[0] - 0.24, v[1] + 0.14];
      parts.push({ poly: barPts(v[0], v[1], tip[0], tip[1], 0.055), arm: true });
      parts.push({ circle: [tip[0] - 0.04, tip[1] + (armSide < 0 ? -0.02 : 0.02), 0.075], arm: true });
    }
    return parts;
  }
  const MOL = {
    glucose: sugar(0, 0, -1),
    galactose: sugar(0, 0, 1),
    g6p: sugar(0, 0, -1).concat([{ circle: [-0.72, -0.43, 0.15], tag: 'P' }]),
    arabinose: [{ poly: hexPts(0, 0, 0.4) }],
    lactose: sugar(0, -0.62, 1).concat(sugar(0, 0.62, -1), [{ poly: barPts(0, -0.2, 0, 0.2, 0.05) }]),
    allolactose: sugar(-0.16, -0.64, 1).concat(sugar(0.16, 0.64, -1), [{ poly: barPts(-0.16, -0.22, 0.1, 0.02, 0.05) }, { poly: barPts(0.1, 0.02, 0.16, 0.22, 0.05) }]),
    aa: [{ poly: [[0, -0.34], [0.3, 0.18], [-0.3, 0.18]] }],
    proton: [{ circle: [0, 0, 0.16], tag: '+' }],
    piece: [{ poly: [[-0.34, -0.12], [0.34, -0.12], [0.2, 0.16], [-0.2, 0.16]] }],
  };
  // Half the height of each molecule upright (nm), for where it touches a rim.
  const HALF_H = { glucose: 0.5, galactose: 0.5, g6p: 0.58, arabinose: 0.42, lactose: 1.1, allolactose: 1.12, aa: 0.34, proton: 0.16, piece: 0.16 };

  /** Appends a molecule's outline (upright, or turned by rot radians) at (x, y) px, s px per nm. */
  function molPath(c, type, x, y, s, rot) {
    const parts = MOL[type];
    if (!parts) return;
    const ca = Math.cos(rot || 0), sa = Math.sin(rot || 0);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.poly) {
        for (let k = 0; k < p.poly.length; k++) {
          const u = p.poly[k][0], v = p.poly[k][1];
          const px = x + s * (u * ca - v * sa), py = y + s * (u * sa + v * ca);
          if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.closePath();
      } else if (p.circle) {
        const u = p.circle[0], v = p.circle[1], r = p.circle[2] * s;
        const px = x + s * (u * ca - v * sa), py = y + s * (u * sa + v * ca);
        c.moveTo(px + r, py); c.arc(px, py, r, 0, TAU);
      }
    }
  }
  /** Draws a molecule: pale fill, ink outline, and its tag letters (P, +). */
  function drawMol(c, P, type, x, y, s, rot, alpha, fill) {
    if (!MOL[type]) return;
    const a0 = c.globalAlpha;
    c.globalAlpha = a0 * (alpha === undefined ? 1 : alpha);
    c.beginPath(); molPath(c, type, x, y, s, rot);
    c.fillStyle = fill || P.panel || '#fff'; c.fill();
    c.strokeStyle = P.sugar; c.lineWidth = Math.max(1.2, s * 0.06); c.lineJoin = 'round'; c.stroke();
    const parts = MOL[type];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.tag) continue;
      const ca = Math.cos(rot || 0), sa = Math.sin(rot || 0), u = p.circle[0], v = p.circle[1];
      c.fillStyle = P.sugar;
      c.font = '700 ' + Math.max(8, Math.round(s * 0.22)) + 'px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(p.tag, x + s * (u * ca - v * sa), y + s * (u * sa + v * ca) + 0.5);
    }
    c.globalAlpha = a0;
  }

  // x range of a molecule at height y (nm, upright): [min, max] or null.
  function rowRange(type, y, noArms) {
    let lo = Infinity, hi = -Infinity;
    for (const p of MOL[type]) {
      if (noArms && (p.arm || p.tag)) continue;
      if (p.circle) {
        const dy = y - p.circle[1], r = p.circle[2];
        if (Math.abs(dy) > r) continue;
        const dx = Math.sqrt(r * r - dy * dy);
        lo = Math.min(lo, p.circle[0] - dx); hi = Math.max(hi, p.circle[0] + dx);
        continue;
      }
      const pts = p.poly;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) {
          if (a[1] === y) { lo = Math.min(lo, a[0]); hi = Math.max(hi, a[0]); }
          continue;
        }
        const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
    }
    return lo <= hi ? [lo, hi] : null;
  }
  const pocketCache = {};
  /**
   * The pocket for a molecule sitting upright at (0, 0): the molecule's left and right silhouettes
   * widened by a margin, sampled every 0.04 nm, as {left: [[x, y]…], right: […], top, bottom}.
   */
  function pocketFor(type) {
    if (pocketCache[type]) return pocketCache[type];
    // The rings' silhouette (the short arms left out, so the pocket reads as one clean cavity) widened by a margin.
    const m = 0.07, left = [], right = [];
    const hh = HALF_H[type] + 0.05;
    for (let y = -hh; y <= hh + 1e-9; y += 0.03) {
      const r = rowRange(type, y, true);
      if (!r) continue;
      left.push([r[0] - m, y]); right.push([r[1] + m, y]);
    }
    if (left.length) {                          // close the pocket's ends by the margin
      left.unshift([left[0][0] + 0.02, left[0][1] - m]); right.unshift([right[0][0] - 0.02, right[0][1] - m]);
      const l = left[left.length - 1], r = right[right.length - 1];
      left.push([l[0] + 0.02, l[1] + m]); right.push([r[0] - 0.02, r[1] + m]);
    }
    const out = { left, right, top: left.length ? left[0][1] - m : 0, bottom: left.length ? left[left.length - 1][1] + m : 0 };
    pocketCache[type] = out;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Transformations: rotate (u, v) about a pivot, then place at (x, y) with s px per nm
  // ---------------------------------------------------------------------------
  const TP = { x: 0, y: 0 };
  function tr(u, v, pu, pv, ang, x, y, s) {
    const ca = Math.cos(ang), sa = Math.sin(ang), du = u - pu, dv = v - pv;
    TP.x = x + s * (pu + du * ca - dv * sa); TP.y = y + s * (pv + du * sa + dv * ca);
    return TP;
  }

  // ---------------------------------------------------------------------------
  // The machines
  // ---------------------------------------------------------------------------
  const TR = { hw: 2.0, hh: 3.0, gap: 0.03, chamfer: 0.35, tilt: 0.24 };

  /**
   * One half of a transporter (side −1 left, +1 right) as a polygon: the outer edge, and the inner
   * edge following the pocket (the substrate's silhouette plus a margin). open: +1 open to the
   * outside, 0 closed, −1 open to the inside (the half turns about its inner-bottom or inner-top corner).
   */
  function halfPath(c, side, pocket, open, x, y, s) {
    const hw = TR.hw, hh = TR.hh, g = TR.gap, ch = TR.chamfer;
    const ang = -side * open * TR.tilt;
    const pu = side * g, pv = open >= 0 ? hh * 0.72 : -hh * 0.72;
    // The outline in local nm (outer edge, then the inner edge bottom to top through the pocket), built once per pocket.
    const key = side < 0 ? 'l' : 'r';
    let pts = pocket[key + 'Half'];
    if (!pts) {
      pts = [[side * g, -hh], [side * (hw - ch), -hh], [side * hw, -hh + ch], [side * hw, hh - ch], [side * (hw - ch), hh], [side * g, hh]];
      const sil = side < 0 ? pocket.left : pocket.right;
      for (let i = sil.length - 1; i >= 0; i--) pts.push([side < 0 ? Math.min(-g, sil[i][0]) : Math.max(g, sil[i][0]), sil[i][1]]);
      pocket[key + 'Half'] = pts;
    }
    for (let k = 0; k < pts.length; k++) {
      const p = tr(pts[k][0], pts[k][1], pu, pv, ang, x, y, s);
      if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
    }
    c.closePath();
  }

  /** A site on the right half's inner edge (a hydrogen-ion site for the proton-carrying transporters): its centre. */
  function sitePos(open, x, y, s, out) {
    const ang = -open * TR.tilt, pv = open >= 0 ? TR.hh * 0.72 : -TR.hh * 0.72;
    const p = tr(0.62, 1.45, TR.gap, pv, ang, x, y, s);
    out.x = p.x; out.y = p.y;
    return out;
  }
  const SITE = { x: 0, y: 0 };

  /** Hatching over the part of the current clip region between y0 and y1 (px): oily stretches. */
  function hatch(c, x0, x1, y0, y1, step, color, width) {
    c.beginPath();
    for (let x = x0 - (y1 - y0); x < x1; x += step) { c.moveTo(x, y1); c.lineTo(x + (y1 - y0), y0); }
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }

  /** The membrane band across the stage: head groups, the oily middle hatched, 4 nm thick. */
  function drawMembrane(c, P, x0, x1, y, s) {
    const t = 2 * s;
    c.fillStyle = P['warn-pale'] || P.inside;
    c.globalAlpha = 0.55;
    c.fillRect(x0, y - t, x1 - x0, 2 * t);
    c.globalAlpha = 1;
    c.save();
    c.beginPath(); c.rect(x0, y - t * 0.62, x1 - x0, t * 1.24); c.clip();
    c.globalAlpha = 0.35;
    hatch(c, x0, x1, y - t * 0.62, y + t * 0.62, Math.max(5, s * 0.35), P.membrane, 1);
    c.globalAlpha = 1;
    c.restore();
    // Head groups: a row of small circles on each face.
    const r = Math.max(2, s * 0.22), step = 2.3 * r;
    c.beginPath();
    for (let x = x0 + r; x < x1; x += step) {
      c.moveTo(x + r, y - t + r); c.arc(x, y - t + r, r, 0, TAU);
      c.moveTo(x + r, y + t - r); c.arc(x, y + t - r, r, 0, TAU);
    }
    c.fillStyle = P.membrane; c.globalAlpha = 0.8; c.fill(); c.globalAlpha = 1;
  }

  /**
   * A transporter across the membrane: two halves with a pocket shaped to its substrate (§4.1).
   * st: {open, siteBound} (BTC.closeup.machineState); color: the gene colour.
   */
  function drawTransporter(c, P, type, color, st, x, y, s, opts) {
    const pocket = pocketFor(type);
    const open = st ? st.open : 1;
    c.beginPath(); halfPath(c, -1, pocket, open, x, y, s); halfPath(c, 1, pocket, open, x, y, s);
    c.fillStyle = P.panel || '#fff'; c.fill();
    c.globalAlpha = 0.28; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
    // The parts inside the membrane's oily middle are hatched (not colour alone).
    if (!opts || opts.hatch !== false) {
      c.save();
      c.clip();
      c.globalAlpha = 0.45;
      hatch(c, x - TR.hw * s * 1.3, x + TR.hw * s * 1.3, y - 1.25 * s, y + 1.25 * s, Math.max(4, s * 0.3), color, 1);
      c.globalAlpha = 1;
      c.restore();
    }
    c.beginPath(); halfPath(c, -1, pocket, open, x, y, s); halfPath(c, 1, pocket, open, x, y, s);
    c.strokeStyle = color; c.lineWidth = Math.max(1.5, s * 0.07); c.lineJoin = 'round'; c.stroke();
    if (opts && opts.site) {
      sitePos(open, x, y, s, SITE);
      c.beginPath(); c.arc(SITE.x, SITE.y, 0.2 * s, 0, TAU);
      c.fillStyle = P.panel || '#fff'; c.fill(); c.strokeStyle = color; c.lineWidth = 1.2; c.stroke();
      if (st && st.siteBound) drawMol(c, P, 'proton', SITE.x, SITE.y, s, 0, 1);
    }
  }

  /**
   * A cytoplasmic enzyme body: overlapping round chains (lobes) with a groove cut to its substrate at the top.
   * The lactose-splitting enzyme (LacZ) is drawn to scale with its sugars: four chains about 17.5 × 13.5 nm together
   * (Jacobson 1994), so the groove is small against its body.
   */
  const LOBES = {
    splitter: [[-3.3, 3.32, 5.4], [3.3, 3.32, 5.4], [-3.3, 6.02, 5.4], [3.3, 6.02, 5.4]],   // four chains, 17.4 × 13.5 nm
    idle: [[0, -0.9, 1.3], [-1.05, 0.9, 1.3], [1.05, 0.9, 1.3]],                           // three chains
    one: [[0, 0.9, 2.2], [-1.6, 0.1, 1.2], [1.6, 0.1, 1.2]],                               // one chain, folded
  };
  function enzymeLobes(kind) { return LOBES[kind] || LOBES.one; }
  /**
   * Draws an enzyme with its groove at (0, −0.9) shaped to `type` lying flat (rotated a quarter turn),
   * and a lid lobe that closes over the groove (st.lid 0 … 1): the shape change that does the work.
   */
  function drawEnzyme(c, P, kind, type, color, st, x, y, s, bg) {
    const lobes = enzymeLobes(kind);
    c.beginPath();
    for (let i = 0; i < lobes.length; i++) { const u = lobes[i][0], v = lobes[i][1], r = lobes[i][2]; c.moveTo(x + (u + r) * s, y + v * s); c.arc(x + u * s, y + v * s, r * s, 0, TAU); }
    // One outline around the chains together: a double-width stroke under the fill leaves only the outer edge.
    c.strokeStyle = color; c.lineWidth = 2 * Math.max(1.5, s * 0.07); c.stroke();
    c.fillStyle = P.panel || '#fff'; c.fill();
    c.globalAlpha = 0.28; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
    // Faint seams between the chains (each chain is one lobe).
    c.globalAlpha = 0.25; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
    // The groove: the substrate's outline (flat) plus a margin, cut into the top.
    const gy = kind === 'splitter' ? -0.85 : -1.0;
    if (type) {
      c.save();
      c.beginPath(); pocketPolygon(c, type, x, y + gy * s, s, Math.PI / 2);
      c.fillStyle = bg; c.fill();
      c.strokeStyle = color; c.lineWidth = Math.max(1.5, s * 0.07); c.stroke();
      c.restore();
    }
    // The lid: a small lobe hinged at the groove's right end, swinging over it when the substrate is bound.
    const lid = st ? st.lid : 0;
    const hx = kind === 'splitter' ? 1.3 : 1.0, hy = gy - 0.2;
    const a = -1.05 - lid * 1.55;                      // open: up and to the right; closed: over the groove
    const lx = hx + Math.cos(a) * 0.95, ly = hy + Math.sin(a) * 0.95;
    c.beginPath(); c.moveTo(x + (lx + 0.62) * s, y + ly * s); c.arc(x + lx * s, y + ly * s, 0.62 * s, 0, TAU);
    c.fillStyle = P.panel || '#fff'; c.fill();
    c.globalAlpha = 0.4; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = color; c.lineWidth = Math.max(1.3, s * 0.06); c.stroke();
    return gy;
  }
  /** The pocket's outline (the molecule's silhouette plus margin, both sides joined), turned by rot. */
  function pocketPolygon(c, type, x, y, s, rot) {
    const pk = pocketFor(type), ca = Math.cos(rot), sa = Math.sin(rot);
    const pts = pk.ring || (pk.ring = pk.left.concat(pk.right.slice().reverse()));     // built once per molecule
    for (let k = 0; k < pts.length; k++) {
      const u = pts[k][0], v = pts[k][1];
      const px = x + s * (u * ca - v * sa), py = y + s * (u * sa + v * ca);
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  /** ATP (filled diamond) or ADP (hollow) at a side site. */
  function drawEnergy(c, P, filled, x, y, s) {
    const r = 0.32 * s;
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.75, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.75, y); c.closePath();
    if (filled) { c.fillStyle = P.atp; c.fill(); }
    c.strokeStyle = P.atp; c.lineWidth = 1.4; c.stroke();
  }

  /** The flagellum protein: a rod with a notch on top and a matching tab below; ghosts of a stack (dashed). */
  function drawRod(c, P, color, x, y, s, ghost) {
    const rod = (cy) => {
      const w = 0.8, h = 2.2, n = 0.35;
      c.moveTo(x - w * s, cy - h * s); c.lineTo(x - 0.3 * s, cy - h * s); c.lineTo(x, cy - (h - n) * s); c.lineTo(x + 0.3 * s, cy - h * s);
      c.lineTo(x + w * s, cy - h * s); c.lineTo(x + w * s, cy + h * s); c.lineTo(x + 0.3 * s, cy + h * s); c.lineTo(x, cy + (h + n) * s);
      c.lineTo(x - 0.3 * s, cy + h * s); c.lineTo(x - w * s, cy + h * s); c.closePath();
    };
    if (ghost) {
      c.save(); c.setLineDash(DASH_44);
      c.beginPath(); rod(y - 4.4 * s); rod(y + 4.4 * s);
      c.strokeStyle = P.muted; c.lineWidth = 1.2; c.stroke();
      c.restore();
    }
    c.beginPath(); rod(y);
    c.fillStyle = P.panel || '#fff'; c.fill();
    c.globalAlpha = 0.28; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = color; c.lineWidth = Math.max(1.5, s * 0.07); c.stroke();
  }

  /**
   * The repressor on its DNA: a V of two arms, each with an allolactose pocket; clamped (lift 0)
   * its heads sit in the DNA's groove; with allolactose in its pockets it changes shape and lets go.
   * The DNA runs across at y + 3.2 nm; lift 0 … 1 is the eased state.
   */
  function drawRepressor(c, P, color, lift, inducer, x, y, s, w) {
    const dy = 3.2;
    // DNA: two strands with rungs, the operator stretch darker.
    const y0 = y + (dy - 0.9) * s, y1 = y + (dy + 0.9) * s;
    c.beginPath();
    for (let px = 8; px < w - 8; px += Math.max(6, 0.34 * s * 2)) { c.moveTo(px, y0); c.lineTo(px, y1); }
    c.strokeStyle = P.dna; c.globalAlpha = 0.3; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
    c.beginPath(); c.moveTo(8, y0); c.lineTo(w - 8, y0); c.moveTo(8, y1); c.lineTo(w - 8, y1);
    c.strokeStyle = P.dna; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.rect(x - 1.6 * s, y0 - 2, 3.2 * s, y1 - y0 + 4);
    c.strokeStyle = P.ink; c.lineWidth = 2; c.stroke();
    const spread = 0.34 + 0.34 * lift, up = 1.3 * lift;
    for (let side = -1; side <= 1; side += 2) {
      const ang = side * spread;
      // Arm: from the core (0, −1.6 − up) down toward the DNA.
      const cx0 = x, cy0 = y + (-1.6 - up) * s;
      const L = 3.9, wA = 0.75;
      const ex = cx0 + Math.sin(ang) * L * s, ey = cy0 + Math.cos(ang) * L * s;
      const nx = Math.cos(ang) * wA * s, ny = -Math.sin(ang) * wA * s;
      c.beginPath();
      c.moveTo(cx0 + nx, cy0 + ny); c.lineTo(ex + nx, ey + ny); c.lineTo(ex - nx, ey - ny); c.lineTo(cx0 - nx, cy0 - ny); c.closePath();
      // Head with two fingers into the groove.
      c.moveTo(ex + 0.55 * s, ey); c.arc(ex, ey, 0.55 * s, 0, TAU);
      c.fillStyle = P.panel || '#fff'; c.fill();
      c.globalAlpha = 0.3; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
      c.strokeStyle = color; c.lineWidth = Math.max(1.5, s * 0.07); c.stroke();
      c.beginPath(); c.moveTo(ex - 0.25 * s, ey + 0.4 * s); c.lineTo(ex - 0.25 * s, ey + 0.9 * s); c.moveTo(ex + 0.25 * s, ey + 0.4 * s); c.lineTo(ex + 0.25 * s, ey + 0.9 * s);
      c.strokeStyle = color; c.lineWidth = Math.max(2, s * 0.12); c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
      // The allolactose pocket half way down the arm, on its outer side.
      const px = cx0 + Math.sin(ang) * 1.8 * s + side * Math.cos(ang) * 0.9 * s, py = cy0 + Math.cos(ang) * 1.8 * s - side * Math.sin(ang) * 0.9 * s;
      c.beginPath(); c.arc(px, py, 0.62 * s, 0, TAU);
      c.fillStyle = P.inside; c.fill(); c.strokeStyle = color; c.lineWidth = 1.2; c.stroke();
      if (inducer) drawMol(c, P, 'allolactose', px, py, s * 0.5, 0, 1);
    }
    // The core joining the arms.
    c.beginPath(); c.arc(x, y + (-1.6 - up) * s, 0.95 * s, 0, TAU);
    c.fillStyle = P.panel || '#fff'; c.fill(); c.globalAlpha = 0.3; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = color; c.lineWidth = Math.max(1.5, s * 0.07); c.stroke();
  }

  // The folded shape's bead places (unit disc, a dent at the top like a pocket), cached per bead count: a sunflower
  // packing, filled from the middle out, skipping the dent, then ordered so that beads next to each other on the chain
  // land near each other (a greedy walk), so the chain visibly gathers into one compact shape.
  const foldCache = {};
  function foldPlaces(k) {
    if (foldCache[k]) return foldCache[k];
    const GA = Math.PI * (3 - Math.sqrt(5)), dent = 0.42, pts = [];
    const M = Math.ceil(k * 1.2) + 4;
    for (let m = 0; pts.length < k && m < 4 * M; m++) {
      const rr = Math.sqrt((m + 0.5) / M), a = m * GA;
      let d = ((a + Math.PI / 2) % TAU + TAU) % TAU; if (d > Math.PI) d -= TAU;
      if (Math.abs(d) < dent && rr > 0.38) continue;                     // the dent (a pocket-like notch at the top)
      pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
    }
    // A chain order: start at the dent's left lip, then always the nearest free place.
    const out = [], used = new Array(pts.length).fill(false);
    let cur = [-0.5, -0.85];
    for (let i = 0; i < pts.length; i++) {
      let best = -1, bd = Infinity;
      for (let j = 0; j < pts.length; j++) if (!used[j]) { const dx = pts[j][0] - cur[0], dy = pts[j][1] - cur[1], dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = j; } }
      used[best] = true; out.push(pts[best]); cur = pts[best];
    }
    foldCache[k] = out;
    return out;
  }
  /**
   * A chain folding into its shape (§4.1 Fold; PM8): n beads in a line (t = 0) gather into one compact shape with a
   * dent like a pocket (t = 1), the chain drawn as a thin line through them. Oily beads (hatched) are drawn thicker.
   * oily: a function i → bool. len: the line's length; r: the bead radius.
   */
  function drawChainFold(c, P, color, n, t, x, y, len, r, oily) {
    const k = Math.max(2, n), pl = foldPlaces(k);
    const R = r * 2.35 * Math.sqrt(k * 1.2 + 4) / 2 * 1.05;           // beads about touching in the packed shape
    const e = t * t * (3 - 2 * t);
    const at = (i) => {
      const lx = x - len / 2 + (len * i) / (k - 1), ly = y + Math.sin(i * 0.9) * r * 0.6 * (1 - e);
      const fx = x + pl[i][0] * R, fy = y + pl[i][1] * R;
      return [lx + (fx - lx) * e, ly + (fy - ly) * e];
    };
    if (e > 0.5) {
      // The folded shape's outline, with its dent, fading in.
      const dent = 0.42, R2 = R * 1.12;
      c.globalAlpha = ((e - 0.5) / 0.5) * 0.25;
      c.beginPath(); c.moveTo(x + Math.cos(-Math.PI / 2 + dent) * R2, y + Math.sin(-Math.PI / 2 + dent) * R2);
      c.arc(x, y, R2, -Math.PI / 2 + dent, -Math.PI / 2 - dent + TAU);
      c.lineTo(x, y - R * 0.3); c.closePath();
      c.fillStyle = color; c.fill(); c.globalAlpha = 1;
    }
    c.beginPath();
    for (let i = 0; i < k; i++) { const p = at(i); if (i === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); }
    c.strokeStyle = color; c.globalAlpha = 0.45; c.lineWidth = Math.max(1, r * 0.35); c.stroke(); c.globalAlpha = 1;
    c.beginPath();
    for (let i = 0; i < k; i++) {
      const p = at(i), br = oily && oily(i) ? r * 1.4 : r;
      c.moveTo(p[0] + br, p[1]); c.arc(p[0], p[1], br, 0, TAU);
    }
    c.fillStyle = color; c.fill();
  }

  // ---------------------------------------------------------------------------
  // One machine at one state: the protein and its molecules (shared by the view, the strip and the cards)
  // ---------------------------------------------------------------------------
  /**
   * Draws the machine of gene `M` (BTC.closeup.MACHINES entry) at state st around (x, y), s px/nm.
   * o: {color, bg (the background colour a groove is cut to), w (stage width), molecules (true: draw them)}.
   */
  function drawMachine(c, P, M, st, x, y, s, o) {
    const color = o.color, kind = M.kind;
    if (kind === 'transporter') {
      drawTransporter(c, P, M.substrate, color, st, x, y, s, { site: M.site === 'proton', hatch: o.hatch });
      if (o.molecules !== false && st && st.subShown) {
        const type = st.subForm ? 'g6p' : M.substrate;
        drawMol(c, P, type, x + st.subX * s, y + st.subY * s, s, 0, st.subA);
      }
    } else if (kind === 'splitter' || kind === 'enzyme' || kind === 'builder') {
      const gy = drawEnzyme(c, P, kind, M.substrate, color, st, x, y, s, o.bg);
      if (M.atp) drawEnergy(c, P, st ? st.atpFilled : M.atp === 'spend', x + (kind === 'splitter' ? 3.6 : 2.9) * s, y + 0.2 * s, s);
      if (o.molecules !== false && st) {
        if (st.subShown) drawMol(c, P, M.substrate, x + st.subX * s, y + (st.subY + 0.9 + gy) * s, s, Math.PI / 2, 1);
        if (st.prodShown) {
          const t1 = kind === 'splitter' ? 'galactose' : M.product, t2 = kind === 'splitter' ? 'glucose' : M.product;
          drawMol(c, P, t1, x + st.prodX * s * (kind === 'splitter' ? 1.8 : 1), y + (st.prodY + 0.9 + gy) * s, s, 0, st.prodA);
          drawMol(c, P, t2, x + st.prod2X * s * (kind === 'splitter' ? 1.8 : 1), y + (st.prod2Y + 0.9 + gy) * s, s, 0, st.prodA);
        }
      }
    } else if (kind === 'rod') {
      drawRod(c, P, color, x, y, s, o.ghost !== false);
    } else if (kind === 'repressor') {
      drawRepressor(c, P, color, o.lift === undefined ? (st && st.clamped ? 0 : 1) : o.lift, st ? st.inducer : false, x, y, s, o.w || x * 2);
    } else {
      drawEnzyme(c, P, 'idle', null, color, null, x, y, s, o.bg);
    }
  }

  /** Size of a machine's picture (nm, width × height) for fitting it to a box. */
  const SIZES = { transporter: [6.2, 8.8], splitter: [17.6, 15.6], enzyme: [7.4, 7.4], builder: [7.4, 7.4], rod: [4, 14], repressor: [9, 10], idle: [6, 6] };
  function sizeOf(M) { return SIZES[M.kind] || SIZES.idle; }
  /** Top and bottom of a machine's picture (nm from its origin, the molecules' paths included), where not about ±5.2. */
  const EXTENT = { splitter: [-4.2, 11.6] };
  function extentOf(M) { return EXTENT[M.kind] || [-5.2, 5.2]; }

  // ---------------------------------------------------------------------------
  // The Protein zoom renderer
  // ---------------------------------------------------------------------------
  class MachineView {
    constructor() {
      this.lift = 1;            // the repressor's eased shape (150 ms morph between clamped and released)
      this.last = -1;
      this.geom = { s: 30, x: 0, y: 0, scaleNm: 2, scalePx: 60, membraneY: 0 };
    }

    /** Fits the machine into the free box; returns the geometry the overlays read (scale bar). */
    fit(M, w, h, top, bottom, strip, side) {
      const [mw, mh] = sizeOf(M);
      // side: the words sit at the left (a wide stage), so the picture takes the right part.
      const availW = strip ? (w - 16) / 4 : side ? w * 0.55 : w - 24, availH = h - top - bottom - (strip ? 40 : 34);
      let s = Math.min(availW / mw, availH / mh);
      s = Math.max(strip ? 3 : 6, Math.min(strip ? 16 : 44, s));
      const g = this.geom;
      // Centre the picture's full extent (the molecules' paths included) in the free box.
      const off = M.kind === 'splitter' ? -3.7 : M.kind === 'enzyme' || M.kind === 'builder' ? 0.45 : 0;
      g.s = s; g.x = side && !strip ? w * 0.64 : w / 2; g.y = top + (h - top - bottom) / 2 + off * s;
      const bars = [1, 2, 5, 10];
      let best = 2, bd = Infinity;
      for (const nm of bars) { const d = Math.abs(nm * s - 64); if (d < bd) { bd = d; best = nm; } }
      g.scaleNm = best; g.scalePx = best * s;
      return g;
    }

    /**
     * Draws the Protein zoom. o: {w, h, top, bottom, model (planProtein), st (machineState), P, color,
     * reduced, tau, strip (four still panels), labels: {outside, membrane, inside, nonfit, picture, flat, stripPhases}}.
     */
    draw(c, o) {
      const P = o.P, M = o.model.machine, w = o.w, h = o.h, kind = M.kind;
      const membrane = kind === 'transporter';
      const g = this.fit(M, w, h, o.top, o.bottom, o.strip, o.side);
      const s = g.s;
      // Background: outside above the membrane, inside below (a membrane protein); inside only otherwise.
      c.fillStyle = membrane ? P.outside : P.inside;
      c.fillRect(0, 0, w, h);
      if (membrane) {
        c.fillStyle = P.inside;
        c.fillRect(0, g.y, w, h - g.y);
        drawMembrane(c, P, 0, w, g.y, s);
      }
      // The repressor's shape eases to its state (a 150 ms morph).
      const target = o.st && o.st.clamped ? 0 : 1;
      const dt = Math.max(0, Math.min(0.1, o.dtReal || 0));
      this.lift += (target - this.lift) * (o.reduced ? 1 : Math.min(1, dt / 0.15));
      if (o.strip) this.drawStrip(c, o, g);
      else {
        const faded = o.model.none;
        if (faded) { c.save(); c.globalAlpha = 0.35; c.setLineDash(DASH_54); }
        drawMachine(c, P, M, faded ? null : o.st, g.x, g.y, s, { color: o.color, bg: P.inside, w, lift: this.lift, ghost: true });
        if (faded) c.restore();
        // A molecule that does not fit: to the rim and back, never into the pocket (lactose lies flat: too wide).
        const flat = M.nonfit === 'lactose' ? Math.PI / 2 : 0, halfH = flat ? 0.5 : HALF_H[M.nonfit];
        const rimY = kind === 'transporter' ? -TR.hh : kind === 'repressor' ? -2.4 : kind === 'splitter' ? -1.95 : -1.45;
        if (o.st && o.st.nfShown && M.nonfit) {
          const my = Math.min(o.st.nfY, rimY - halfH - 0.06);
          const mx = g.x + o.st.nfX * s, myPx = g.y + my * s;
          drawMol(c, P, M.nonfit, mx, myPx, s, flat, 1);
          if (o.labels.nonfit) this.label(c, P, o.labels.nonfit, 8, Math.max(o.top + 30, myPx), 'left', true);
        } else if (o.showPicture && M.nonfit) {
          // "Show a sugar that does not fit": a still picture of the nearest molecule that does not fit, at the rim.
          drawMol(c, P, M.nonfit, g.x + 1.2 * s, g.y + (rimY - halfH - 0.08) * s, s, flat, 1);
          this.label(c, P, o.labels.picture, 8, Math.max(o.top + 30, g.y + (rimY - halfH - 0.08) * s), 'left', true);
        }
      }
      // The pocket, named once (what fits it is the point of the picture).
      if (!o.strip && !o.model.none && o.labels.pocket && (kind === 'transporter' || kind === 'splitter' || kind === 'enzyme' || kind === 'builder')) {
        const py = kind === 'transporter' ? g.y : g.y + (kind === 'splitter' ? -0.85 : -1.0) * s;
        const px = kind === 'transporter' ? g.x + (TR.hw + 0.4) * s : g.x + (kind === 'splitter' ? 9.3 : 3.3) * s;
        c.beginPath(); c.moveTo(px - 4, py); c.lineTo(g.x + (kind === 'transporter' ? 0.75 : 1.3) * s, py);
        c.strokeStyle = P.muted; c.lineWidth = 1; c.setLineDash(DASH_33); c.stroke(); c.setLineDash(NO_DASH);
        this.label(c, P, o.labels.pocket, px, py, 'left');
      }
      // Region labels.
      // (On a wide stage the words sit at the left, so the region labels go to the right edge.)
      const lx = o.side ? w - 10 : 10, la = o.side ? 'right' : 'left';
      if (membrane) {
        this.label(c, P, o.labels.outside, lx, o.top + 12, la);
        this.label(c, P, o.labels.membrane, lx, g.y, la);
        this.label(c, P, o.labels.inside, lx, Math.min(h - o.bottom - 12, g.y + 2 * s + 14), la);
      } else {
        this.label(c, P, o.labels.inside, lx, o.top + 12, la);
      }
    }

    label(c, P, text, x, y, align, italic) {
      if (!text) return;
      c.font = (italic ? 'italic ' : '') + '600 12px ' + FONT;
      c.textBaseline = 'middle';
      c.textAlign = align || 'left';
      const tw = c.measureText(text).width;
      const lx = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
      c.globalAlpha = 0.85; c.fillStyle = P.panel || '#fff'; c.fillRect(lx - 3, y - 8, tw + 6, 16); c.globalAlpha = 1;
      c.fillStyle = P.muted; c.fillText(text, x, y + 0.5);
    }

    /** Reduced motion: four still panels of the cycle, the current one outlined (advancing every 2 s of render time). */
    drawStrip(c, o, g) {
      const P = o.P, M = o.model.machine, w = o.w, s = g.s;
      const phases = M.kind === 'transporter' ? [0.1, 0.4, 0.7, 0.9] : [0.12, 0.36, 0.55, 0.8];
      const pw = (w - 16) / 4, ex = extentOf(M);
      const CU = o.closeup;
      for (let k = 0; k < 4; k++) {
        const cx = 8 + pw * (k + 0.5);
        // Each panel is the cycle at a fixed phase (a model running one cycle per unit of time; reused, not allocated per frame).
        const sm = this.stripModel || (this.stripModel = {});
        sm.machine = M; sm.kind = M.kind; sm.gene = o.model.gene; sm.working = true; sm.r = 1; sm.k = 1; sm.nonfitPresent = false;
        sm.share = o.model.share; sm.inducerShare = o.model.inducerShare;
        const st = CU.machineState(sm, phases[k] + 1e-6, this.stripState || (this.stripState = CU.createMachineState()));
        drawMachine(c, P, M, st, cx, g.y, s, { color: o.color, bg: P.inside, w, lift: 1, ghost: false, hatch: false });
        if (k === (o.st ? o.st.panel : 0) && o.model.working) {
          c.strokeStyle = P.accent; c.lineWidth = 2;
          c.strokeRect(cx - pw / 2 + 3, g.y + ex[0] * s, pw - 6, (ex[1] - ex[0]) * s);
        }
        const words = M.kind === 'transporter' ? o.labels.strip.transporter : o.labels.strip.enzyme;
        this.label(c, P, words[k], cx, g.y + (ex[1] + 0.4) * s + 8, 'center');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Machine cards (§4.3): a 96 × 96 picture and three lines
  // ---------------------------------------------------------------------------
  const MachineCard = {
    /**
     * Draws a machine icon into a square of size px at (x, y) (top-left). M: a BTC.closeup.MACHINES
     * entry; st: a machine state, or null for its bound pose.
     */
    icon(c, P, M, color, x, y, size, st) {
      const sz = sizeOf(M), mw = sz[0], mh = M.kind === 'rod' ? 6 : sz[1];     // a card shows one rod, no stack
      const s = Math.min((size - 8) / mw, (size - 8) / mh) * (M.kind === 'transporter' ? 1.1 : 1);
      // The picture's own centre (the four-chain enzyme's lobes hang below its groove).
      const cx = x + size / 2, cy = y + size / 2 - (M.kind === 'splitter' ? 4.7 : M.kind === 'enzyme' || M.kind === 'builder' ? 0.8 : 0) * s;
      c.save();
      c.beginPath(); c.rect(x, y, size, size); c.clip();
      c.fillStyle = M.kind === 'transporter' ? P.outside : P.inside; c.fillRect(x, y, size, size);
      if (M.kind === 'transporter') { c.fillStyle = P.inside; c.fillRect(x, cy, size, size); drawMembrane(c, P, x, x + size, cy, s); }
      const pose = st || { open: 0, lid: 1, subShown: true, subX: 0, subY: M.kind === 'transporter' ? 0 : -0.9, subA: 1, subForm: 0, siteBound: true, clamped: true, inducer: false, atpFilled: M.atp === 'make' };
      drawMachine(c, P, M, pose, cx, cy, s, { color, bg: P.inside, w: x * 2 + size, lift: 0, ghost: false, hatch: true });
      c.restore();
    },
    /**
     * A card element: picture, what it does (first), name and symbol (muted italics), where it works.
     * words: {job, name, symbol, where}. Hidden-name levels pass only what has been seen.
     */
    create(M, color, words, opts) {
      const h = LY.h, P = PAL.current();
      const cv = document.createElement('canvas');
      const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
      cv.width = 96 * dpr; cv.height = 96 * dpr;
      cv.className = 'mc-pic';
      cv.setAttribute('aria-hidden', 'true');
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (M) MachineCard.icon(c, P, M, P[color] || color || P.muted, 0, 0, 96, opts && opts.state);
      else {
        // Nothing seen yet: a dashed outline and a question mark (the picture must not tell what the student has not seen).
        c.fillStyle = P.inside; c.fillRect(0, 0, 96, 96);
        c.setLineDash([5, 4]); c.beginPath(); c.arc(48, 48, 26, 0, TAU); c.strokeStyle = P.muted; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
        c.fillStyle = P.muted; c.font = '700 26px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 48, 50);
      }
      return h('div', { class: 'machine-card' + (opts && opts.className ? ' ' + opts.className : '') }, [
        cv,
        h('div', { class: 'mc-text' }, [
          h('div', { class: 'mc-job', text: words.job || '' }),
          h('div', { class: 'mc-name' }, [words.name || '', words.symbol ? ' · ' : '', words.symbol ? h('span', { class: 'sym', text: words.symbol }) : null]),
          words.where ? h('div', { class: 'mc-where', text: words.where }) : null,
        ]),
      ]);
    },
  };

  /**
   * The card for a gene (§4.3), from the screen's gene model when there is one (hidden names in 1.1):
   * what it does, then its name and symbol, then where it works. opts: {model (BTC.content.geneModel),
   * location ('membrane' | 'cytoplasm'), seen (its job has been seen; default: it is named), className}.
   */
  MachineCard.forGene = function (geneId, opts) {
    const o = opts || {}, B = (typeof self !== 'undefined' && self.BTC) || {};
    const CU = B.closeup, C = B.content;
    const m = o.model || null, named = m ? m.named(geneId) : true;
    const g = C.genes[geneId] || {}, T = CU.TEXT.card, loc = o.location || (PAL.shape[geneId] === 'membrane' ? 'membrane' : 'cytoplasm');
    const color = m ? m.color(geneId) : 'g-' + geneId;
    // opts.location === null: where the protein goes has not been seen yet (a hidden gene before its first protein).
    const words = named
      ? { job: g.job, name: g.name, symbol: g.symbol, where: loc === 'membrane' ? T.membrane : T.inside }
      : { job: m.words(geneId).name, name: o.location === null ? '' : loc === 'membrane' ? T.hiddenMembrane : T.hiddenInside, symbol: '', where: T.hiddenJob };
    return MachineCard.create(!named && o.location === null ? null : CU.machineOf(geneId), color, words, o);
  };

  const art = {
    MOL, HALF_H, TR, molPath, drawMol, pocketFor, rowRange, drawMembrane, drawTransporter, drawEnzyme, drawRod, drawRepressor,
    drawChainFold, drawMachine, drawEnergy, sizeOf, extentOf, hatch,
    /** Draws a model fold (BTC.machineFold) on its lattice: oily beads thicker and hatched, pocket beads ringed. */
    drawFold(c, P, fold, x, y, cell, color) {
      const path = fold.path;
      if (!path.length) return;
      let mx = 0, my = 0;
      for (const [u, v] of path) { mx += u; my += v; }
      mx /= path.length; my /= path.length;
      const X = (u) => x + (u - mx) * cell, Y = (v) => y + (v - my) * cell;
      c.beginPath();
      path.forEach(([u, v], i) => { if (i === 0) c.moveTo(X(u), Y(v)); else c.lineTo(X(u), Y(v)); });
      c.strokeStyle = color; c.lineWidth = 2; c.stroke();
      for (let i = 0; i < path.length; i++) {
        const oily = fold.beads[i] === 'H', r = cell * (oily ? 0.3 : 0.22);
        c.beginPath(); c.arc(X(path[i][0]), Y(path[i][1]), r, 0, TAU);
        c.fillStyle = oily ? color : (P.panel || '#fff'); c.fill();
        c.strokeStyle = color; c.lineWidth = 1.5; c.stroke();
        if (fold.pocket && fold.pocket.indexOf(i) >= 0) {
          c.beginPath(); c.arc(X(path[i][0]), Y(path[i][1]), r + 3, 0, TAU);
          c.strokeStyle = fold.works === false ? P.bad : P.accent; c.lineWidth = 1.5; c.stroke();
        }
      }
    },
  };

  return { art, MachineView, MachineCard };
});
