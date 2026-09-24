// @deps btc-math
/*
 * Be the Cell: energy and small-molecule pools (engine spec §7.6–§7.7).
 *
 * Three fast pools change within a tick: the energy charge E = ATP/(ATP+ADP),
 * the amino-acid pool AA, and internal lactose Lin. They are advanced in K
 * substeps with a modified Patankar–Euler (MPE) update, which is linearly
 * implicit: E stays inside (0, 1) and the adenylate pool is conserved exactly,
 * however stiff the ATP turnover (≈2.7 s) is compared with the tick.
 *
 * Every ATP demand is written as e × (a "tilde" rate) and every supply as
 * (1 − e) × (a tilde rate), so the update never divides by e.
 *
 * The ledger records where every ATP went, per category (TERMS). The budget
 * closes on every tick: N_A·ΔE = fermentation + floor − Σ spending (test e2).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-math.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.metabolism = factory(B.math);
  }
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  // Energy term table (§7.7), in evaluation order. Kinds: CAPPED (translation-coupled,
  // factor e/(e+K_E)), DEMAND (own saturation), SUPPLY (production, factor 1−e).
  const TERMS = Object.freeze([
    { id: 'translation', kind: 'CAPPED', category: 'translation' },
    { id: 'otherBuilding', kind: 'CAPPED', category: 'otherBuilding' },
    { id: 'rRNA', kind: 'CAPPED', category: 'transcription' },
    { id: 'mRNAelong', kind: 'CAPPED', category: 'transcription' },
    { id: 'upkeep', kind: 'DEMAND', category: 'upkeep' },
    { id: 'bgTranscription', kind: 'DEMAND', category: 'transcription' },
    { id: 'aaImport', kind: 'DEMAND', category: 'transport' },
    { id: 'lacY', kind: 'DEMAND', category: 'transport' },
    { id: 'fermentation', kind: 'SUPPLY', category: 'fermentation', alsoSpends: 'aaMaking' },
  ].map((t) => Object.freeze(t)));

  // Spending categories, in ledger order (view.ledger.names).
  const LEDGER = Object.freeze(['translation', 'otherBuilding', 'transcription', 'upkeep', 'aaMaking', 'transport']);
  const L_TL = 0, L_OTHER = 1, L_TX = 2, L_UPKEEP = 3, L_SYN = 4, L_TRANSPORT = 5;

  const sat = (x, K) => (x > 0 ? x / (x + K) : 0);

  function roleAmount(cell, role) {
    const i = cell.layout.roleIndex[role];
    if (i < 0) return 0;
    const g = cell.genes[i];
    return g.P * g.activity;
  }

  // §7.6 Capacities, fixed for the tick; read by role, multiplied by activity.
  function capacities(cell) {
    const k = cell.k, p = cell.p, env = cell.env, V = k.V;
    const pts = roleAmount(cell, 'glucose-import');
    k.U = (pts * p.k_pts + cell.uBasal * V) * sat(env.glucose_mM, p.K_G);
    k.Cgly = roleAmount(cell, 'glycolysis') * p.k_gly;
    // Dedicated aa-making enzymes in series with precursor supply from sector P.
    const Vded = roleAmount(cell, 'aa-synthesis') * p.k_syn;
    const Vcen = p.k_P * cell.sectors[2].mass / p.L_P;
    k.SynCap = Vded > 0 && Vcen > 0 ? Vded * Vcen / (Vded + Vcen) : 0;
    k.ImpCap = roleAmount(cell, 'aa-import') * p.k_imp * sat(env.aminoAcids_mM, p.K_imp);
    k.YCap = roleAmount(cell, 'lactose-import') * p.k_Y * sat(env.lactose_mM, p.K_Y);
    k.ZMax = roleAmount(cell, 'lactose-split') * p.k_Z;
    k.NA = p.A_tot * p.N_mM * V;
  }

  // §7.7 Fast pools: K modified Patankar–Euler substeps for E, AA and Lin.
  function fastPools(cell) {
    const k = cell.k, p = cell.p, sec = cell.sectors;
    const V = k.V, NA = k.NA, h = k.h, K = p.substeps;
    const KE = p.K_E, Kin = p.K_in, Km = p.K_m, Kadp2 = p.K_adp * p.K_adp;
    const cmF = k.cmF, txSlow = 1 - p.cmTx * cell.theta;
    const Jfac = k.Relong * cmF;                       // J̃ = Relong·cmF·ṽ
    const cCapped = p.c_tl + p.c_o + p.c_rRNA * k.fR;  // ATP per aa polymerised, capped group
    const txPerV = p.atpPerNT * p.ntPerAA * txSlow * k.Nnasc;   // mRNA elongation ATP per unit ṽ
    const upkeepV = p.m_V * V;
    const bgTx0 = k.bgTx0;
    const LinMaxN = p.L_max * p.N_mM * V, KZN = p.K_Z * p.N_mM * V;
    const Ksyn = p.chi_C + p.c_syn / p.fermYield;       // carbon + ATP cost of one aa, in hexose
    const s0 = cell.s0, Kpi = p.K_pi, Kaa = p.K_aa;
    const Ki = p.K_i, KiI = p.K_iI;
    const U = k.U, Cgly = k.Cgly, SynCap = k.SynCap, ImpCap = k.ImpCap, YCap = k.YCap, ZMax = k.ZMax;

    let e = cell.E, AA = cell.AA, Lin = cell.Lin;
    let vInt = 0, sigX = 0;
    let lTl = 0, lOther = 0, lTx = 0, lUp = 0, lSyn = 0, lTr = 0, lFerm = 0, lFloor = 0;
    let fPoly = 0, fMade = 0, fImp = 0, fGlc = 0, fLacIn = 0, fLacSplit = 0, fHex = 0, fFerm = 0;
    let Cin = 0;

    for (let s = 0; s < K; s++) {
      const a = AA / V;
      const vt = p.v_max * (a / (a + Kaa)) / (e + KE);        // running-ribosome speed per unit e
      const Jt = Jfac * vt;                                   // aa/s per unit e
      const Dc = cCapped * Jt + txPerV * vt;
      const aI = a / KiI;
      const It = ImpCap / (1 + aI * aI) / (e + KE);           // import, trans-inhibited by the inside pool
      let room = 1 - Lin / LinMaxN;
      if (room < 0) room = 0;
      const Yt = YCap * room / (e + KE);
      const upT = upkeepV / (e + Km);
      const bgT = bgTx0 / (e + Kin);
      const Du = upT + bgT + p.c_imp * It + p.c_Y * Yt;
      let Z = Lin > 0 ? ZMax * Lin / (Lin + KZN) : 0;
      const Zcap = p.K_adp * Lin / h;                         // keeps Lin ≥ 0 (§7.13)
      if (Z > Zcap) Z = Zcap;
      Cin = U + 2 * Z;
      const Chex = Cgly < Cin ? Cgly : Cin;
      const u = 1 - e;
      const pi = (e + s0) / (e + s0 + Kpi);                  // priming: glycolysis needs a little ATP to start
      const Ft = Chex * pi * u / (u * u + Kadp2);             // F = F̃·(1 − e): needs ADP to phosphorylate
      const aK = a / Ki;
      const Syn0 = SynCap / (1 + aK * aK);                    // feedback-inhibited aa synthesis
      let Synt = 0;
      if (u > 0) {
        Synt = Syn0 * e / ((e + KE) * u);
        const carbonCap = Ft / Ksyn;                          // carbon for aa plus its ATP stays ≤ F
        if (Synt > carbonCap) Synt = carbonCap;
      }
      const St = p.fermYield * Ft - (p.fermYield * p.chi_C + p.c_syn) * Synt;
      const q = h * St / NA, rc = h * Dc / NA, ru = h * Du / NA;
      let x = (e + q) / (1 + q + rc + ru);
      let mc = x;
      if (x > e + KE) {                                       // ribosomes cannot outrun full charge
        mc = e + KE;
        x = (e + q - rc * mc) / (1 + q + ru);
      }
      // Fluxes over this substep (/s), from the MPE solution x.
      const w = 1 - x;
      const J = Jt * mc, F = Ft * w, Jsyn = Synt * w, Jimp = It * x, JY = Yt * x;
      const JZ = Cin > 0 ? F * Z / Cin : 0;
      const Jglc = Cin > 0 ? F * U / Cin : 0;
      AA += h * (Jsyn + Jimp - J);
      Lin += h * (JY - JZ);
      vInt += h * vt * mc;
      sigX += h * x / (e + Kin);
      lTl += h * p.c_tl * J;
      lOther += h * p.c_o * J;
      lTx += h * (p.c_rRNA * k.fR * J + txPerV * vt * mc + bgT * x);
      lUp += h * upT * x;
      lSyn += h * p.c_syn * Jsyn;
      lTr += h * (p.c_imp * Jimp + p.c_Y * JY);
      lFerm += h * p.fermYield * (F - p.chi_C * Jsyn);
      fPoly += h * J; fMade += h * Jsyn; fImp += h * Jimp; fGlc += h * Jglc;
      fLacIn += h * JY; fLacSplit += h * JZ; fHex += h * F; fFerm += h * (F - p.chi_C * Jsyn);
      // Floor applied after the fluxes so the ledger identity stays exact; the injection is booked.
      if (x < p.E_floor) { lFloor += (p.E_floor - x) * NA; x = p.E_floor; }
      e = x;
    }

    cell.E = e;
    cell.AA = AA;
    cell.Lin = Lin;
    const dD = cmF * vInt;
    cell.D += dD;
    cell.N += p.ntPerAA * txSlow * vInt;
    for (let s = 0; s < sec.length; s++) sec[s].sigInt = sec[s].sigma0 * sigX;

    k.dD = dD;
    k.vInt = vInt;
    k.Cin = Cin;
    bookTick(cell, lTl, lOther, lTx, lUp, lSyn, lTr, lFerm, lFloor);
    const f = cell.flux, dt = p.dt;
    f.aaPolymerised = fPoly / dt;
    f.aaMade = fMade / dt;
    f.aaImported = fImp / dt;
    f.glucoseIn = fGlc / dt;
    f.lactoseIn = fLacIn / dt;
    f.lactoseSplit = fLacSplit / dt;
    f.hexoseToGlycolysis = fHex / dt;
    f.hexoseFermented = fFerm / dt;
    f.vRun = vInt / dt;
  }

  /** Books one tick's ATP amounts (molecules) into the per-second and cumulative ledger. */
  function bookTick(cell, tl, other, tx, up, syn, tr, ferm, floor) {
    const led = cell.ledger, dt = cell.p.dt;
    const t = led.tick;
    t[L_TL] = tl; t[L_OTHER] = other; t[L_TX] = tx; t[L_UPKEEP] = up; t[L_SYN] = syn; t[L_TRANSPORT] = tr;
    let spent = 0;
    for (let i = 0; i < 6; i++) {
      led.perS[i] = t[i] / dt;
      led.cumulative[i] += t[i];
      spent += t[i];
    }
    for (let i = 0; i < 6; i++) led.fractions[i] = spent > 0 ? t[i] / spent : 0;
    led.supply = ferm;
    led.floor = floor;
    led.spent = spent;
    led.supply_perS = ferm / dt;
    led.floor_perS = floor / dt;
    led.spent_perS = spent / dt;
    led.cumulativeSupply += ferm;
    led.cumulativeFloor += floor;
  }

  /**
   * Stub metabolism for isolating gene expression (spec §19 step 3): E held,
   * AA untouched, ribosomes run at a fixed speed, no ATP booked.
   */
  function stubPools(cell, stub) {
    const k = cell.k, p = cell.p, sec = cell.sectors, dt = p.dt;
    const vInt = stub.v * dt;
    cell.E = stub.E;
    const dD = k.cmF * vInt;
    cell.D += dD;
    cell.N += p.ntPerAA * (1 - p.cmTx * cell.theta) * vInt;
    const sigX = dt * stub.E / (stub.E + p.K_in);
    for (let s = 0; s < sec.length; s++) sec[s].sigInt = sec[s].sigma0 * sigX;
    k.dD = dD;
    k.vInt = vInt;
    k.Cin = 0;
    bookTick(cell, 0, 0, 0, 0, 0, 0, 0, 0);
    cell.flux.aaPolymerised = k.Relong * dD / dt;
    cell.flux.vRun = vInt / dt;
  }

  return { TERMS, LEDGER, capacities, fastPools, stubPools, bookTick };
});
