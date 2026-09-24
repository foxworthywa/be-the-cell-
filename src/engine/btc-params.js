// @deps
/*
 * Be the Cell: every constant the engine uses (engine spec §8).
 *
 * Each entry is {id, value, unit, source, confidence, note}. The parameter
 * table in docs/BIOLOGY.md is generated from this list (tools/param-table.js,
 * test b-3), so a number and its source cannot drift apart.
 *
 * Confidence: V verified in the research brief; PV partly verified or derived
 * from verified values; U unverified estimate; D derived or calibrated in the
 * spec; G game or numerics choice, disclosed.
 *
 * Units: s, molecules per cell, aa (protein mass), nt, fL, mM. Promoter rates
 * are stored per SECOND; the spec's gene table lists them per minute, so each
 * rRef value is written as (per-minute figure)/60.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.params = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIST = [];
  function p(id, value, unit, source, confidence, note) {
    LIST.push(Object.freeze({ id, value, unit, source, confidence, note: note || '' }));
  }

  // --- Numerics -------------------------------------------------------------
  p('dt', 1, 's', 'design', 'G', 'integer tick; t = tick·dt');
  p('substeps', 8, '–', 'convergence test (spec §10)', 'G', 'h = dt/substeps = 0.125 s; must be ≤ 0.25 s');
  p('E_floor', 1e-9, 'E', 'numerics', 'G', 'lowest energy charge; any injection is recorded in ledger.floor');
  p('emaTau', 300, 's', 'design', 'G', 'time constant of the displayed growth-rate average (5 min)');

  // --- Cell size, growth and division ----------------------------------------
  p('N_mM', 602214.076, 'molecules/(mM·fL)', 'Avogadro constant', 'V', '');
  p('rho', 6.0e8, 'aa/fL', 'Milo 2013 (2–4×10⁶ proteins/µm³)', 'PV', 'low end; 2×10⁶ proteins of 300 aa per fL');
  p('Vadd', 1.0, 'fL', 'Taheri-Araghi 2015 (adder); Volkmer & Heinemann 2011 (0.5–4 µm³)', 'V/G', 'steady birth size ≈1 fL whatever the medium');
  p('repFrac', 1.4, '×Vbirth', 'placeholder for C+D timing', 'U', 'single gene-dosage step (verify with Cooper–Helmstetter)');
  p('rodRadius', 0.38, 'µm', 'design', 'G', 'display only: cell drawn as a rod of this radius');

  // --- Ribosomes and sectors -------------------------------------------------
  p('aaPerRibosome', 7336, 'aa', 'growth-law literature', 'U', 'verify the r-protein sequence sum');
  p('rRNAperRibosome', 4566, 'nt', '16S + 23S + 5S', 'V', '');
  p('L_R', 133, 'aa', '7336/55 r-proteins', 'PV', 'chain length used for ribosome occupancy');
  p('L_Q', 300, 'aa', 'Brocchieri & Karlin 2005 (median 267)', 'PV', 'housekeeping sector');
  p('L_P', 300, 'aa', 'Brocchieri & Karlin 2005 (median 267)', 'PV', 'other-metabolism sector');
  p('beta_R', 3.0, '/s per gene copy', 'calibrated (φ_R ≈9.5%)', 'D', 'R-sector transcription, × dosage × χ');
  p('beta_P', 2.43, '/s per gene copy', 'calibrated (φ_P ≈32%)', 'D', 'P-sector transcription, × dosage × f_P');
  p('phi_Q', 0.50, '–', 'Scott 2010 (0.45–0.55)', 'V', 'Q takes this share of synthesis, so burden comes out of R, P and the player genes');
  p('rnapPerFL', 2000, '/fL', 'design', 'U', 'display only; RNA polymerase is not limiting in M1');

  // --- Transcription and mRNA ------------------------------------------------
  p('utrNt', 60, 'nt', 'design', 'D', 'mRNA length = 3L + 60 (UTRs lumped)');
  p('mRNAHalfLife', 180, 's', 'Bernstein 2002; Chen 2015', 'V', 'per-gene knob from level 1.5');
  p('rateCap', 0.3, '/s per copy', 'Dennis 2009 (rrn ≈1/s ceiling)', 'V/D', 'highest per-copy initiation rate');
  p('leak', 0.001, '×rRef', 'Oehler 1990 (lac ≈1,300×), generalised', 'PV', '"off" keeps this leak; knockout is 0');
  p('rnapFootprint', 35, 'nt', 'design (RNA polymerase covers ≈30–40 bp of DNA)', 'G',
    'a gene copy of ℓ nt holds at most ℓ/35 transcripts in progress; binds only when elongation stalls');
  p('ntPerAA', 3, 'nt per aa', 'Proshkin 2010', 'V', 'RNA polymerase and the leading ribosome move together');
  p('cmTx', 0.35, '–', 'Proshkin 2010 (42 → 27 nt/s at sub-inhibitory Cm)', 'PV', 'transcription slows by cmTx·θ; extrapolated to full dose');

  // Per-gene promoter strength at ×1, stored per second (spec §5.1 lists per minute).
  const RREF_PER_MIN = { ptsG: 1.7, gly: 5.1, aaSyn: 5.1, aaImp: 1.0, lacY: 3.0, lacZ: 1.6, fliC: 4.0 };
  const lacZNote = ' lacZ ×1 gives 2.0×10⁴ monomers (2.4% of proteome); research: 2–3×10⁴ (≈2.2%).';
  for (const id of ['ptsG', 'gly', 'aaSyn', 'aaImp', 'lacY', 'lacZ', 'fliC']) {
    const perMin = RREF_PER_MIN[id];
    p('rRef_' + id, perMin / 60, '/s per copy', 'calibrated; range from Taniguchi 2010', 'U',
      perMin + ' /min.' + (id === 'lacZ' ? lacZNote : ''));
  }

  // --- Translation -----------------------------------------------------------
  const RBS = { ptsG: 1.0, gly: 3.0, aaSyn: 3.0, aaImp: 1.0, lacY: 0.5, lacZ: 1.5, fliC: 2.0 };
  for (const id of ['ptsG', 'gly', 'aaSyn', 'aaImp', 'lacY', 'lacZ', 'fliC']) {
    p('b_' + id, RBS[id], '–', 'calibrated to k_init ≈0.15 /s at b = 1', 'D', 'relative ribosome-binding strength (RBS)');
  }
  p('k_on', 1.6e-4, 'fL/s per free ribosome per b·mRNA', 'calibrated to k_init 0.151 /s; Zong 2010; Kennell & Riezman via Roussel & Zhu 2006 (0.1–0.12 /s)', 'D', '');
  p('gI_basal', 0.2, '–', 'Dai 2016 (fewer active ribosomes when growth is slow)', 'D', 'initiation factor g_I = hin·(gI_basal + (1 − gI_basal)·χ)');
  p('v_max', 18, 'aa/s', 'Young & Bremer 1976; Dai 2016 (9–17)', 'V', 'reference running speed 11.65 aa/s');
  p('K_aa', 1.0e6, '/fL', 'calibrated', 'D', '1.66 mM; amino-acid limitation of elongation');
  p('K_E', 0.10, 'E', 'research note (K ≈10% of normal)', 'G', 'sharp stall threshold for ribosomes');
  p('K_in', 0.03, 'E', 'design', 'D', 'initiation stalls only when E collapses');
  p('K_chiA', 2.0e6, '/fL', 'design', 'D', '3.3 mM; ppGpp-like signal χ, Hill 2');
  p('K_chiE', 0.5, 'E', 'design', 'D', 'ppGpp-like signal χ, Hill 2');
  p('thetaMax', 0.98, '–', 'Dai 2016 (mechanism)', 'D', 'fraction of ribosomes stalled at full chloramphenicol dose');

  // --- Energy ------------------------------------------------------------------
  p('A_tot', 3.5, 'mM', 'Bennett 2009 (9.6 mM aerobic); Yaginuma 2014 (1.5 mM)', 'PV', 'ATP ≈3.1 mM; turnover ≈2.7 s');
  p('c_tl', 4, 'ATP/aa', 'Lynch & Marinov 2015; Russell & Cook 1995', 'V', '');
  p('c_o', 2.7, 'ATP/aa polymerised', 'Stouthamer via Martin 2026', 'D',
    'other building work (lipids, wall, DNA, de novo nucleotides). Stouthamer: 34.7 mmol ATP/g in total, 19.1 for polymerisation; ' +
    'at 4 ATP/aa that is 4.775 mmol aa/g, so (34.7 − 19.1)/4.775 = 3.27 ATP/aa besides polymerisation; minus aa synthesis 0.28 and the ' +
    'transcription charged explicitly (0.29 at the reference state) leaves 2.70');
  p('atpPerNT', 2, 'ATP/nt', 'Lynch & Marinov 2015', 'PV', 'NTPs recycled');
  p('c_rRNA', 2 * 4566 / 7336, 'ATP per R-sector aa', '2 × 4566/7336', 'D', 'rRNA made in step with r-protein');
  p('c_syn', 0.28, 'ATP/aa made', 'Stouthamer via Martin 2026', 'PV', 'not Lynch\'s 25–30 (contested)');
  p('chi_C', 0.8, 'hexose/aa', 'carbon balance (≈4.8 C per residue)', 'D', 'research value 0.5 is unverified; both listed');
  p('m_V', 2.40e5, 'ATP/s/fL × hm(E)', 'Klamt 2018 anaerobic non-growth 2.8 mmol glucose/gDW/h × 2 ATP', 'PV', '5.6 mmol ATP/gDW/h at E = 0.9');
  p('K_m', 0.30, 'E', 'design', 'D', 'upkeep falls under energy stress');
  p('fermYield', 2, 'ATP/hexose', 'Hasona 2004; Wang 2010 (2–3)', 'V', 'teaching value; majors note 2–3');
  p('K_pi', 0.05, 'E', 'design', 'G', 'priming: the PTS needs PEP and PFK needs ATP');
  p('s0', 0.01, 'E', 'design', 'G', 'priming seed; stands for PEP and phosphorylated intermediates (0 in level 1.3)');
  p('K_adp', 0.08, '1−E (Hill 2)', 'Koebmann 2002 (flux controlled by ATP demand; ≈1.7× headroom)', 'D', 'proto headroom C_gly/F = 1.6');
  p('mmolPerGDWh', 3.21e4, 'molecules/s per fL', 'derived: 0.192 pg dry mass per fL', 'D', 'display only: 1 mmol/gDW/h in molecules per second per fL');

  // --- Player-gene kinetics ----------------------------------------------------
  p('k_pts', 80, '/s per copy', 'Schmidt 2016 (to verify)', 'U', 'copy number proto 13,700 (research ≈10⁴, U)');
  p('K_G', 0.015, 'mM', 'Steinsiek & Bettenbrock 2012', 'V', 'PtsG half-saturation for glucose');
  p('uBasal_backup', 1.8e5, 'glucose/s/fL', 'calibrated to anaerobic ΔptsG 0.14 /h (Steinsiek & Bettenbrock 2012)', 'V',
    'used only when backupGlucoseUptake is set; the lab strain lacks the mannose PTS');
  p('k_gly', 8.0, 'hexose/s per lumped copy', 'calibrated; share 4.5% vs Mori 2021 ≈4% glycolysis', 'PV', 'fermentation enzymes sit in sector P');
  p('k_syn', 6.0, 'aa/s per copy', 'sector size 3–5% (estimate)', 'U', 'verify against Hui 2015 and Mori 2021');
  p('k_P', 0.30, 'aa/s per P protein', 'sector size 3–5% (estimate)', 'D', 'precursor supply from sector P, in series with aaSyn');
  p('K_i', 3.0e6, '/fL', 'design', 'D', '5.0 mM; feedback inhibition of aa synthesis, Hill 2');
  p('k_imp', 20, '/s per copy', 'estimate', 'U', '');
  p('K_imp', 0.010, 'mM', 'estimate', 'U', '');
  p('K_iI', 5e6, '/fL', 'estimate', 'U', '8.3 mM; trans-inhibition of import, Hill 2');
  p('c_imp', 1, 'ATP/aa', 'estimate', 'U', 'amino-acid import cost');
  p('k_Y', 60, '/s per copy', 'estimate', 'U', '');
  p('K_Y', 0.5, 'mM', 'estimate', 'U', '');
  p('L_max', 10, 'mM', 'estimate', 'U', 'internal lactose cap');
  p('c_Y', 0.33, 'ATP/lactose', '1 H⁺ ÷ ≈3 H⁺ per ATP', 'U', '');
  p('k_Z', 60, '/s per monomer site', 'estimate', 'U', 'verify in β-galactosidase reviews');
  p('K_Z', 1, 'mM', 'estimate', 'U', '');

  // --- Medium and drug presets ------------------------------------------------
  p('glucoseHigh', 10, 'mM', '≈0.2% sugar', 'G', 'the "High" glucose preset');
  p('glucoseLow', 0.005, 'mM', 'design', 'G',
    'the "Low" preset: PtsG only partly filled (sat = 0.25), growth about halved [proto Td 209 min, λ = 0.47 λ0, E 0.29]; ' +
    '0.05 mM would change almost nothing, because glycolysis, not PtsG, limits flux at the reference state');
  p('lactosePresent', 5, 'mM', 'design', 'G', '');
  p('aminoAcidsPresent', 2, 'mM', 'design', 'G', '');
  p('drugLow', 0.3, 'dose', 'design', 'G', 'the "Low" drug preset; "Full" is 1');

  // --- Reference constants for the facts layer (observe-only) ----------------
  p('lambda_ref', 1.18e-4, '/s', 'reference cell (spec §9)', 'D', 'observe-only; never read by the physics');
  p('F_ref', 5.8e5, 'hexose/s', 'reference cell (spec §9)', 'D', 'observe-only');
  p('U_ref', 1.1e6, 'glucose/s', '13,700 PtsG × 80 /s', 'D', 'observe-only');
  p('lacY_ref', 1.0e4, 'monomers', '×1 steady state in glucose [proto 10,460]', 'D', 'observe-only');
  p('lacZ_ref', 2.0e4, 'monomers', '×1 steady state in glucose [proto 19,460]', 'D', 'observe-only');

  const BY_ID = {};
  for (const e of LIST) {
    if (BY_ID[e.id]) throw new Error('duplicate parameter id ' + e.id);
    BY_ID[e.id] = e;
  }

  /** A fresh {id: value} map of the defaults, with optional overrides (ids must exist). */
  function values(overrides) {
    const v = {};
    for (const e of LIST) v[e.id] = e.value;
    if (overrides) {
      const keys = Object.keys(overrides);
      for (let i = 0; i < keys.length; i++) {
        if (!BY_ID[keys[i]]) throw new Error('unknown parameter ' + keys[i]);
        v[keys[i]] = overrides[keys[i]];
      }
    }
    return v;
  }

  return { list: LIST, byId: BY_ID, values };
});
