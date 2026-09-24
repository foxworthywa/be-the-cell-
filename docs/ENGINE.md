# Be the Cell: engine specification v1.1 (M0 foundations + M1 free-play lab)

**Status:** final. The implementation agent follows this document exactly. If a proposal or a prototype disagrees with it, this document wins. It is committed as `docs/ENGINE.md`. v1.1 applies the adversarial review; every change is listed in "Changes from v1.0" at the end.

**Instructor:** Alex Foxworthy (they/them). **Repo:** `/home/user/be-the-cell-` (GitHub `foxworthywa/be-the-cell-`; note the trailing hyphen). **Published at:** `https://foxworthywa.github.io/be-the-cell-/`, so the Pages base path is `/be-the-cell-/` and every URL the app uses (manifest `start_url`, `scope`, `id`, service worker, icons, links) MUST be relative (`./…`). **Conventions come from:** `/home/user/neuronsim`.

**M1 scope trim.** Items marked *(deferred)* are listed in §20 "Deferred to M1.x (not implemented now)". They are kept in this document as the target design, but M1 does not implement or test them. Everything else in this document is in scope for the first student test.

**Engine 1.1.0** (§22 and §21.1) adds energy homeostasis, transcription units, the regulated lac operon (strain `m2-lac`), the decoy strain `m2-l11`, newborn presets and the level hooks of `docs/LEVELS.md` §8. Where §22 and §7 or §11 differ, §22 wins.

**Normative words:** MUST, MUST NOT and SHOULD. "Proto" marks a value measured with the calibration prototype (§17). Every proto value was produced by the equations in this document, run in Node 22 with seeded runs.

---

## 0. How the judges' disagreement was resolved

The two judges picked different winners (fidelity and robustness). This spec merges them.

| Area | Taken from | Why |
|---|---|---|
| Architecture: file layout, roles, cohort odometer, internal lactose pool, gene catalog, API (`fork`, watchers, read-only views, term table), most tests | **fidelity** | Both judges grafted toward this structure. |
| Fast-pool numerics: modified Patankar–Euler (MPE) substeps. Energy supply limited by ADP availability and ATP priming, with a seed term. Q-sector share rule. Growth-law-2 and convergence tests. H4 negative control. Checkpoint hashes. `@deps` headers | **robustness** | Priming makes ATP supply non-monotone in the energy charge E, so fidelity's bisection could land on the wrong root. MPE is linearly implicit, always positive, and conserves adenylate exactly. |
| ppGpp proxy χ (gates initiation and ribosome synthesis), `function_seen`, declarative genome schema, narrator phrase table and lint, backup-uptake strain option, Koebmann flux-control test, mass-balance test, "stands for ~N genes" badges | **legibility** | Grafts requested by the judges. |

- All judge corrections are applied; §16 maps each correction to where it is handled.
- The parameters were **recalibrated** with a new throwaway prototype (§17). The earlier proposals' numbers no longer apply.

---

## 1. Scope

**In M0/M1:**
- one E. coli-like cell, anaerobic, in a gut-like medium;
- 7 player genes, each with its own promoter dial: off, ×¼, ×½, ×1, ×2, ×4, plus knockout;
- the medium: glucose, lactose and amino acids;
- rifampicin-like and chloramphenicol-like drugs;
- growth and division, following one daughter;
- the ATP ledger, fluxes, events, deterministic replay, and dot-sampling support;
- the narrator facts layer.

**Out of M1, but with hooks already present (§13):**
- regulation (LacI, CRP);
- designer mode;
- alleles and folding;
- phage;
- oxygen and respiration;
- player-controlled ribosomes;
- compartments (chapter 2; **plasma cell first for level 2.3**).

The UI is a separate document. This spec covers only what the UI reads and the commands it may send.

---

## 2. Files, namespace, loading

### 2.1 Layout

```
be-the-cell-/
  index.html                      app shell; <script src> tags in build-files.json order
  build-files.json                ordered list of every script (single source of truth for build + tests)
  build.js                        inlines scripts (function replacer); throws on missing tag or leftover <script src=
  serve.js                        zero-dependency static server (tests SW on localhost)
  sw.js  manifest.webmanifest  icons/
  presets/m1-lab-glucose.json     steady-state snapshot (generated; also embedded in btc-presets.js)
  src/engine/                     DETERMINISM BOUNDARY: only code that touches simulation state
    btc-math.js        BTC.math        detExp, dsqrt, sortStrings, constants, FNV-1a 64 hash, base64 of typed arrays
    btc-prng.js        BTC.prng        splitmix32, sfc32 streams, uniform, poisson, bernoulli, normal12
    btc-params.js      BTC.params      every constant as {id,value,unit,source,confidence,note}
    btc-catalog.js     BTC.catalog     strain 'm1-lab' genome spec, sectors, ladder, media and drug presets
    btc-presets.js     BTC.presets     generated steady-state snapshot(s) (data only)
    btc-genome.js      BTC.genome      flat M1 catalog -> compiled typed-array layout (slots, roles, lengths); full schema compiler deferred (§20)
    btc-queue.js       BTC.queue       CohortQueue, NascentQueue, MoleculeList (fixed-capacity rings)
    btc-expression.js  BTC.expression  transcription, mRNA decay, ribosome initiation, completion
    btc-metabolism.js  BTC.metabolism  capacities, energy term table, MPE fast-pool substeps, ledger
    btc-growth.js      BTC.growth      mass, volume, growth rate, dosage, division + partition
    btc-commands.js    BTC.commands    validation, resolution, rejection codes
    btc-events.js      BTC.events      edge-triggered detectors, episodes (watchers deferred, §20)
    btc-observe.js     BTC.observe     read-only view, classifiers, limiting(), facts()
    btc-cell.js        BTC.Cell        state owner, step pipeline, log, snapshot/restore/fork/hash
    btc-replay.js      BTC.replay      run(), verify()
  src/shared/                     pure, Node-testable, outside the determinism boundary
    btc-dots.js        BTC.dots        "1 dot = N" ladder, hash-based stable positions, flux emitters
    btc-recorder.js    BTC.Recorder    Float64 ring buffers sampled on ticks
    btc-narrate.js     BTC.narrate     createMemory / ingest / narrate(facts, memory, tick); rules and templates per LAB_UI §7
  src/app/                        UI (separate spec): reads cell.observe(), sends commands only
  tools/make-presets.js  tools/param-table.js  tools/golden.html
  tests/*.test.js                 node:test, no dependencies (§14)
  docs/ENGINE.md (this) LAB_UI.md DESIGN.md BIOLOGY.md PEDAGOGY.md VISUAL_STYLE.md
  README.md                       how to run, test, build, and save the single-file page (LAB_UI §10.2)
```

`dist/` is a build output and is **not committed** (it is gitignored). CI builds it and publishes it to Pages; the published `index.html` is itself the single-file bundle (LAB_UI §10.2).

`build-files.json` order: math, prng, params, catalog, presets, genome, queue, expression, metabolism, growth, commands, events, observe, cell, replay, dots, recorder, narrate, then the app files.

### 2.2 UMD wrapper (every engine and shared file)

Line 1 of each file is a machine-readable `@deps` line.

```js
// @deps btc-math btc-prng btc-params
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-math.js'), require('./btc-prng.js'), require('./btc-params.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.expression = factory(B.math, B.prng, B.params);
  }
})(typeof self !== 'undefined' ? self : this, function (M, R, P) { 'use strict'; /* ... */ return { /* api */ }; });
```

- There is exactly one browser global, `BTC`.
- There are no ES modules.
- `file://` double-click of the built single-file `index.html` MUST work.
- The page registers the service worker only when `location.protocol` starts with `http`.
- `window.__btc = { cell, BTC, app }` is kept as the debug hook.

### 2.3 Forbidden in `src/engine/*` (lint test s1)

`Math.random`, `Math.exp`, `Math.log`, `Math.pow`, `Math.sqrt`, `Math.sin`, `Math.cos`, `Math.tan`, `Math.hypot`, `Math.cbrt`, `**`, `Date`, `performance`, `.sort(`, `for (… in …)`, `toFixed`, `Intl`.

Allowed: `+ − × ÷`, comparisons, `Math.floor`, `Math.round`, `Math.trunc`, `Math.abs`, `Math.min`, `Math.max`, `Math.imul`, bit operations, typed arrays and `DataView`.

`Math.sqrt` is banned too, because ECMAScript marks it implementation-approximated. `dsqrt` replaces it.

`.sort(` is banned because comparator-based sorts are not required to be stable across engines. Anything in `src/engine` that needs an ordering (the canonical config JSON behind `configHash`, §11.2) uses `BTC.math.sortStrings` (§4).

---

## 3. Units and conventions

| Quantity | Unit |
|---|---|
| time | s of simulated time; `t = tick·dt` (never accumulated) |
| amounts | molecules per cell (float64 for continuous pools, int32 for mRNA and nascent transcripts) |
| protein mass | aa residues |
| mRNA length | nt |
| volume | fL |
| medium | mM |

- **Conversion:** N_mM = 602,214.076 molecules per (mM·fL).
- **Energy state:** E = ATP/(ATP+ADP), in [0,1]. The adenylate pool is N_A = A_tot·N_mM·V molecules, evaluated at V at tick start. ATP = E·N_A.
- **Dry-mass conversion (display only):** 1 mmol/gDW/h = 3.21×10⁴ molecules/s per fL.
  - Derivation: ρ = 6×10⁸ aa/fL × 110 Da gives 0.110 pg protein/fL. Protein is 0.572 of dry mass (Bremer & Dennis via Norris & Ripoll 2021), so dry mass is 0.192 pg/fL.

**Symbols used throughout:**
- `sat(x,K) = x/(x+K)`
- `hE(e) = e/(e+K_E)`, `hin(e) = e/(e+K_in)`, `hm(e) = e/(e+K_m)`
- `π(e) = (e+s0)/(e+s0+K_π)` (priming)
- `α(e) = (1−e)²/((1−e)²+K_adp²)` (ADP availability)

---

## 4. Deterministic math and PRNG (`btc-math.js`, `btc-prng.js`)

**`detExp(x)`**
- Returns 0 if x < −745, and +Infinity if x > 709.
- k = Math.round(x / LN2). r = (x − k·LN2HI) − k·LN2LO, with LN2HI = 0.6931471803691238 and LN2LO = 1.9082149292705877e−10.
- Degree-13 Horner Taylor polynomial in r: coefficients 1/13! down to 1, then + 1.
- Multiply by an exact power-of-two table POW2[k] (built by repeated ×2 and ÷2 at load).
- Test n1: within 2 ulp of `Math.exp` on [−50, 5].
- Used only for per-tick factors: initiation exposure, Poisson p₀, decay factors computed when a rate changes, and the EMA factor.

**`dsqrt(y)`**
- 0 if y ≤ 0.
- Initial guess g = 1. While g·g < y, set g = g·2. Then run exactly 40 Newton steps: g = 0.5·(g + y/g).
- Deterministic because it uses only correctly rounded operations. Used only in division partitioning and in Poisson with μ > 30.

**`sortStrings(arr)`**
- In-place insertion sort of an array of strings, comparing UTF-16 code units with `<` (no `localeCompare`, no `Intl`). Returns `arr`.
- Used for the sorted keys of canonical JSON (`configHash`, `presetHash`). Arrays are tiny (tens of keys), so insertion sort is enough.
- Test n1 checks it against a reference ordering, including non-ASCII keys.

**PRNG**
- sfc32, 128-bit state (4×uint32), advanced with `|0`, `>>>`, `Math.imul`, `+`.
- Uniform = `(t>>>0)/4294967296`.
- Seeding: each stream gets `splitmix32(seed ^ fnv1a32(label))` and the first 12 outputs are discarded.
- Streams, created at compile time:
  - `tx:<geneId>`: transcription initiation
  - `decay:<geneId>`: mRNA decay
  - `division`
  - `variant`: per-student variants (reserved label; not created in M1, §20)

  Stream labels use the **gene id only**. Slot numbers never enter a PRNG label, so moving a gene to another slot, adding a decoy in the free slot or shuffling display order (level 1.1) never changes a draw. Adding a gene or process never shifts another stream. A `fork()` twin therefore shares random numbers wherever its history matches the original's.

**Samplers**

| Sampler | Method |
|---|---|
| `poisson(stream, μ)` | Always consumes exactly **one** uniform, even when μ = 0. For μ ≤ 30: inversion with p₀ = detExp(−μ), recurrence p ← p·μ/k, cap k at 200. For μ > 30 (never reached in M1): round(μ + dsqrt(μ)·(Σ₁₂u − 6)), clamped at ≥ 0, consuming 12 uniforms. |
| `bernoulli(stream, p)` | One uniform u; returns u < p. |
| `binomialHalf(stream, n)` | n ≤ 1000: Σ bernoulli(½). Otherwise round(n/2 + dsqrt(n/4)·(Σ₁₂u − 6)), clamped to [0, n]. |

**Hash (`hash64(bytes)`)**
- Two FNV-1a-32 lanes over the same bytes: offset bases 0x811c9dc5 and 0x050c5d1f, prime 0x01000193 via `Math.imul`.
- Returns 16 hex characters (lane A, then lane B).

**Canonical bytes**
- A `DataView`, little-endian. Numbers are written as float64. Integer arrays are written as int32/uint32. Variable-length structures are written live entries only, each prefixed by its length.

---

## 5. Gene catalog and background proteome (strain `m1-lab`)

The lab strain is **engineered**, and both points are disclosed to students:
- each gene sits on its own switchable promoter;
- the strain **lacks the mannose PTS (ΔmanXYZ)**, so PtsG is the only way glucose gets in unless the `backupGlucoseUptake` flag is set.

### 5.1 Player genes

- ℓ = 3L + 60 nt (mRNA length).
- **Units of rRef.** The table below lists rRef in **/min per copy** because those numbers are easy to read. `btc-params.js` stores it in **/s per copy**: `value = rRef_perMin/60` (e.g. `rRef_ptsG` has `value: 1.7/60`, `unit: '/s per copy'`, and the note "1.7 /min"). Every formula in this document uses the stored /s value, written `rRef_i` (= `rRef_perMin,i/60`).
- **Level ladder** multiplies rRef: off → `leak` = 0.001; ×0.25, ×0.5, ×1, ×2, ×4.
- **Effective rate per gene copy (/s):** r = min(rateCap, (rRef_perMin/60)·level), with rateCap = 0.3 /s.
- **Knockout** means r = 0, with no leak.
- Default mRNA half-life is 180 s. Default protein degradation k_deg is 0.

| slot | id | stands for | L (aa) | ℓ (nt) | location | role (what metabolism reads) | rRef (/min per copy; stored as /s = value/60) | RBS b | default level | kinetics |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | `ptsG` | glucose transporter EIICB^Glc | 477 | 1,491 | membrane | `glucose-import` | 1.7 | 1.0 | ×1 | k 80 /s per copy; K_G 0.015 mM; PEP-driven (no ATP charge) |
| 1 | `gly` | glucose-processing enzymes (lumped glycolysis, ~10 enzymes; drawn as GapA). Badge: "stands for ~10 genes" | 331 | 1,053 | cytoplasm | `glycolysis` | 5.1 | 3.0 | ×1 | 8.0 hexose/s per lumped copy |
| 2 | `aaSyn` | amino-acid-making enzymes (~100 genes, lumped). Badge | 350 | 1,110 | cytoplasm | `aa-synthesis` | 5.1 | 3.0 | ×1 | 6.0 aa/s per copy, in series with sector P; feedback K_i 3.0×10⁶/fL (5.0 mM), Hill 2 |
| 3 | `aaImp` | amino-acid importers (~10 genes, lumped). Badge | 440 | 1,380 | membrane | `aa-import` | 1.0 | 1.0 | ×0.25 | 20 /s; K_imp 0.010 mM; trans-inhibition K_iI 5×10⁶/fL (8.3 mM), Hill 2; 1 ATP/aa |
| 4 | `lacY` | lactose permease LacY | 417 | 1,311 | membrane | `lactose-import` | 3.0 | 0.5 | off | 60 /s; K_Y 0.5 mM; internal cap L_max 10 mM; 0.33 ATP per lactose |
| 5 | `lacZ` | β-galactosidase LacZ (monomer; active as tetramer; assembly instant) | 1,024 | 3,132 | cytoplasm | `lactose-split` | 1.6 | 1.5 | off | 60 lactose/s per monomer active site; K_Z 1 mM |
| 6 | `fliC` | flagellin | 498 | 1,554 | cytoplasm (export not modelled) | `none` | 4.0 | 2.0 | off | none in a still flask |
| 7 | (free) | reserved for level 1.1 decoys and 1.7 LacI | | | | | | | | |

The catalog entry for each gene also carries the inert fields of the target schema (§13.1): `oligomer` (lacZ 4, others 1), `sites: []`, `allele: 'wt'`, `signalPeptide: false`, `compartment: 0`, `activity: 1`. M1 reads only `oligomer` (for `first_protein`) and `activity` (always 1).

Lengths are from sequence databases. They MUST be checked against the UniProt E. coli K-12 entries (PtsG P69786, GapA P0A9B2, LacY P02920, LacZ P00722, FliC P04949) before the parameter table is generated. `aaSyn` and `aaImp` use representative lengths (a design choice, D).

### 5.2 Background sectors (not player-controlled in M1)

| Sector | Stands for | Chain length L_s (for occupancy) | ℓ_s (nt) | b_s | Transcription σ⁰_s (/s; energy factor applied separately) | Proto share |
|---|---|---|---|---|---|---|
| **R** | ribosomes: 55 r-proteins, 7,336 aa per ribosome, plus rRNA made in step (4,566 nt) | 133 | 459 | 1 | β_R · g · χ · (1−ρ_rif), β_R = 3.0 | 9.5% |
| **Q** | housekeeping: RNAP, translation factors, chaperones, DNA machinery | 300 | 960 | 1 | k_M · m_Q* · (1−ρ_rif), where m_Q* = φ_Q/(1−φ_Q) · W_L,nonQ/(b_Q·L_Q) and φ_Q = 0.50 | 48.4% |
| **P** | other metabolism: precursors, nucleotides, lipids, wall, fermentation branch enzymes, Leloir | 300 | 960 | 1 | β_P · g · f_P · (1−ρ_rif), β_P = 2.43, f_P = (0.4 + 0.6/(1+x_a²))/0.7 | 31.8% |

- W_L,nonQ = Σ_players b_i (m_i + n_i) L_i + b_R m_R L_R + b_P m_P L_P.
- This makes Q take a share φ_Q of *synthesis*, so Q is protected, and burden comes out of R, P and the player genes.
- Sector P has a job: its protein supplies precursors for amino-acid synthesis (§7.6). Without this role the burden slope is too weak.
- RNA polymerase is not limiting in M1. It is displayed as 2,000 per fL inside Q.

---

## 6. State (everything that determines the future; all of it is hashed)

These are compiled at construction into typed arrays. There is **no allocation inside `step()`**.

| Group | Field | Type | Meaning | Proto typical (mean cell) |
|---|---|---|---|---|
| time | `tick` | int | completed steps; t = tick·dt | – |
| cell | `Vbirth` | f64 | volume at last division (fL) | ≈1.0 |
| | `gen` | int | divisions so far | – |
| | `dosage` g | int | 1, or 2 after the replication step | – |
| | `lambdaEMA` | f64 | 5-min EMA of λ (1/s) | 1.18×10⁻⁴ |
| | `lastCycle_s` | f64 | duration of the last complete cell cycle | 5,860 |
| | `birthTick` | int | tick of the last division | – |
| pools | `E` | f64 | energy charge | 0.89 |
| | `AA` | f64 | usable amino-acid pool (charged-tRNA proxy), molecules | 3.7×10⁶ (4.3 mM) |
| | `Lin` | f64 | internal lactose, molecules | 0 in glucose |
| odometers | `D` | f64 | ribosome odometer (aa); rebased to 0 at each division | – |
| | `N` | f64 | transcription odometer (nt); rebased at division | – |
| | `Rbusy` | f64 | ribosomes busy right after last tick's initiation (§7.5); halved at division | ≈8,830 |
| per player gene i | `level`, `rateOverride` (NaN if none), `knockout`, `rbs`, `pDecay`, `kdeg`, `activity` (=1) | f64/int | control inputs | – |
| | mature mRNA: `mId` Int32[512], `mBirth` Int32[512], `m` count | int | molecule list, in id order | ptsG 10.2; gly 31; aaSyn 31; aaImp 1.5 |
| | nascent: ring of {`N0` f64, `initTick` int32}, capacity 512 | – | transcripts in progress | ptsG 1.7; gly 3.7 |
| | translation: CohortQueue {`D0` f64, `n` f64}, capacity 2L+4, plus running sums `nSum` and `nD0Sum` | – | ribosomes in flight | – |
| | `P` | f64 | finished protein (monomers) | ptsG 13,660; gly 118,000; aaSyn 118,000; aaImp 2,000 |
| | counters: `initiations`, `mMade`, `pMade` | f64 | cumulative | – |
| per sector s ∈ {R,Q,P} | `m_s` | f64 | mRNA (continuous) | R 520; Q 1,216; P 805 |
| | CohortQueue plus sums | – | ribosomes in flight | – |
| | `mass_s` | f64 | finished protein, aa | R 8.2×10⁷ aa |
| | (derived) R_tot = mass_R/7336 | – | ribosomes | 11,230 |
| global | `nextMRNAId` | uint32 | – | – |
| | `nascentAA` | derived = Σ_queues (D·nSum − nD0Sum) | aa in growing chains | – |
| | `R_elong` | derived = Σ nSum | ribosomes on mRNA | 8,830 (active 0.786) |
| env | `glucose_mM`, `lactose_mM`, `aminoAcids_mM`, `oxygen` (always false) | f64 | clamped medium | 10, 0, 0 |
| drugs | `rho` (rifampicin occupancy), `theta` (chloramphenicol-stalled fraction) | f64 | θ = 0.98 × dose | 0, 0 |
| flags | `s0` (priming seed), `uBasal`, `controls` | – | – | 0.01, 0, 'free' |
| PRNG | 4×uint32 per stream | – | – | – |
| ledger | cumulative float64 per category (§7.7) | – | – | – |
| commands | pending queue {tick, seq, cmd}; `seqNext` | – | – | – |

**Not hashed, but included in snapshots:** event hysteresis flags and episodes, the per-tick flux and ledger scratch, and the checkpoint list. (Watchers and marks are deferred, §20; their snapshot fields are reserved and always empty in M1.)

The hash covers exactly the fields that affect the future trajectory, plus tick and the pending commands. Test d-6 checks coverage: perturbing any listed field by 1 ulp MUST change the hash.

**Physics digest.** `cell.physicsDigest()` hashes the same canonical bytes **minus the `env` and `drugs` groups and the pending-command queue**. Two cells whose medium or drug settings differ but whose internal trajectories are identical have equal digests. It exists for negative controls (test h4) and is never used for replay or verification.

---

## 7. The step: fixed order and every equation

**Defaults:** dt = 1 s, K = 8 substeps, h = dt/K = 0.125 s.

**Config validation:** h ≤ 0.25 s, maintenance > 0 and dt ≤ 2 s. Otherwise throw ConfigError.

**Tick index:** a step processes tick T = `this.tick`.

### 7.1 Commands

Apply every pending command with `tick == T`, in `seq` order (§11.3). Commands change only control inputs, medium and drugs; knockout may also set counts.

### 7.2 Derived quantities (start of tick)

```
M   = Σ_i P_i·L_i + mass_R + mass_Q + mass_P + nascentAA        (aa)
V   = M/ρ                                                      (fL), ρ = 6.0e8
e0  = E ;  a0 = AA/V
hin = e0/(e0+K_in)
x_a = a0/K_χa ;  χ_a = x_a²/(1+x_a²) ;  χ_e = e0²/(e0²+K_χe²) ;  χ = χ_a·χ_e     (proto χ ≈ 0.47)
                                                  // v1.1: χ_e = hill(e0, 0.81, 12) and the gates s_up, s_tx, s_el (§22.1)
rifF = 1 − ρ_rif ;  cmF = 1 − θ
```

### 7.3 Player transcription initiation (stochastic)

For each gene i in slot order:

```
// rRef_i is the btc-params value in /s per copy (= the §5.1 /min figure ÷ 60); rateCap = 0.3 /s; rateOverride is /s
r_i = knockout ? 0 : min(rateCap, isNaN(rateOverride) ? rRef_i·(level_i>0 ? level_i : leak) : rateOverride)
μ_i = g · r_i · hin · rifF · dt                // dimensionless: (/s)·(s)
k   = poisson(tx:<id_i>, μ_i)                  // exactly one uniform; stream labelled by gene id
k   = min(k, g·floor(ℓ_i/rnapFootprint) − nascent_i)   // a gene copy holds at most ℓ/35 polymerases (v1.1 impl., §21 row 29)
repeat k: nascent_i.push({N0: N, initTick: T}); initiations_i += 1
```

### 7.4 Sector transcription (nominal; energy factor applied in the substeps)

```
σ⁰_R = β_R·g·χ·rifF
σ⁰_Q = k_M·m_Q*·rifF        (m_Q* from §5.2, using current m and nascent counts)
σ⁰_P = β_P·g·f_P(x_a)·rifF
bgTx0 = 2·Σ_s σ⁰_s·ℓ_s      (ATP/s per unit hin; the cost is charged at initiation)
```

### 7.5 Translation initiation (shared ribosome pool: this is where burden comes from)

```
W       = Σ_i b_i·(m_i + n_i) + Σ_s b_s·m_s          (nascent transcripts count: coupled translation)
R_tot   = mass_R/7336 ;  R_free = max(0, R_tot − Rbusy)     // Rbusy = R_elong right after last tick's push (before its completions):
                                                       // a ribosome that finishes in tick T binds again from T+2 (prototype m.js; §21 row 26)
g_I     = hin·(0.2 + 0.8·χ)                          (ppGpp/hibernation stand-in; Dai 2016)
                                                     // v1.1: hin·(0.1·s_el + 0.9·χ), k_on 1.757e-4 (§22.1)
κ       = k_on·g_I·W/V
n_bind  = R_free·cmF·(1 − detExp(−κ·dt))
unit u receives n_u = n_bind·b_u·(m_u+n_u)/W  (players) or n_bind·b_s·m_s/W (sectors)
push cohort {D0 = D, n = n_u}  (merge into the tail cohort if D − D0_tail < 0.5; the merged D0 is the
                               ribosome-weighted mean, so nD0Sum += n·D and no aa is created; §21 row 27)
R_elong = Σ_u nSum_u ;  Rbusy = R_elong ;  f_R = nSum_R/R_elong ;  N_nasc = Σ_i n_i
```

The initiation rate per mRNA is k_init ≈ b·k_on·g_I·R_free·cmF/V. Proto: 0.151 /s at b = 1, which gives about 39 proteins per mRNA (lifetime 260 s).

### 7.6 Capacities (constant within the tick; read by role and multiplied by activity)

```
U       = (P_ptsG·k_pts + uBasal·V)·sat(G, K_G)                 glucose import capacity (/s)
C_gly   = P_gly·k_gly                                            hexose/s
V_ded   = P_aaSyn·k_syn ;  V_cen = k_P·mass_P/300
SynCap  = (V_ded>0 && V_cen>0) ? V_ded·V_cen/(V_ded+V_cen) : 0   aa/s (dedicated enzymes in series with precursor supply)
ImpCap  = P_aaImp·k_imp·sat(A_out, K_imp)
YCap    = P_lacY·k_Y·sat(L_out, K_Y)
ZMax    = P_lacZ·k_Z
N_A     = A_tot·N_mM·V
```

### 7.7 Fast pools: K modified Patankar–Euler substeps (E, AA, Lin)

Every ATP demand is written as e × (a "tilde" rate), so no division by e is ever needed. Supply is written as (1−e) × (a tilde rate).

**Energy term table** (`BTC.metabolism.TERMS`). Each row is {id, kind, ledgerCategory}. Kinds:
- **CAPPED**: translation-coupled demand, factor e/(e+K_E).
- **DEMAND**: demand with its own K.
- **SUPPLY**: production, factor (1−e).

M1 rows, in this fixed order:

| id | kind | tilde rate (per unit e, or per unit (1−e) for SUPPLY) | ledger category |
|---|---|---|---|
| translation | CAPPED | c_tl·J̃, c_tl = 4 ATP/aa | translation |
| otherBuilding | CAPPED | c_o·J̃, c_o = 2.7 ATP/aa | otherBuilding |
| rRNA | CAPPED | c_rRNA·f_R·J̃, c_rRNA = 2·4566/7336 = 1.2448 | transcription |
| mRNAelong | CAPPED | 2·3·(1 − 0.35θ)·ṽ·N_nasc | transcription |
| upkeep | DEMAND | m_V·V/(e+K_m) | upkeep |
| bgTranscription | DEMAND | bgTx0/(e+K_in) | transcription |
| aaImport | DEMAND | c_imp·Ĩ, c_imp = 1 | transport |
| lacY | DEMAND | c_Y·Ỹ, c_Y = 0.33 | transport |
| fermentation | SUPPLY | 2F̃ − (2χ_C + c_syn)·J̃_syn (net of the aa-making ATP) | supply: fermentation (gross 2(F−χ_C·J_syn)); spend: aaMaking (c_syn·J_syn) |

Later modules append rows (§13.2). The solver loops over rows by kind. M1 MAY hard-code the evaluation of these rows, but it MUST keep the table as the ledger's source of names.

**Substep algorithm** (k = 0…K−1; `e` starts at e0; `AA` and `Lin` are the state):

```
a    = AA/V ;  s_aa = a/(a+K_aa)
ṽ    = v_max·s_aa/(e+K_E)                    // running-ribosome speed per unit e
J̃    = R_elong·cmF·ṽ                         // aa/s per unit e
D̃_c  = (4 + c_o + c_rRNA·f_R)·J̃ + 2·3·(1−0.35θ)·ṽ·N_nasc
Ĩ    = ImpCap/(1+(a/K_iI)²)/(e+K_E)
room = max(0, 1 − Lin/(L_max·N_mM·V))
Ỹ    = YCap·room/(e+K_E)
D̃_u  = m_V·V/(e+K_m) + bgTx0/(e+K_in) + 1·Ĩ + 0.33·Ỹ
Z    = min(ZMax·Lin/(Lin + K_Z·N_mM·V), K_adp·Lin/h)      // cap guarantees Lin ≥ 0 (§7.13)
C_in = U + 2Z ;  C_hex = min(C_gly, C_in)
u    = 1 − e ;  π = (e+s0)/(e+s0+K_π)
F̃    = C_hex·π·u/(u² + K_adp²)                           // F = F̃·(1−e)
Syn0 = SynCap/(1+(a/K_i)²)
J̃_syn= u>0 ? min(Syn0·e/((e+K_E)·u), F̃/(χ_C + c_syn/2)) : 0   // carbon cap: χ_C·J_syn + ATP stays ≤ F
S̃    = 2F̃ − (2χ_C + c_syn)·J̃_syn                          // ≥ 0 by the cap
q = h·S̃/N_A ;  r_c = h·D̃_c/N_A ;  r_u = h·D̃_u/N_A
x = (e+q)/(1+q+r_c+r_u) ;  m_c = x
if (x > e + K_E) { m_c = e + K_E ; x = (e + q − r_c·m_c)/(1 + q + r_u) }   // ribosomes cannot outrun full charge
// actual fluxes over this substep (/s): one flux, one number (computed from the unfloored x, so the ledger identity is exact)
J = J̃·m_c ; F = F̃·(1−x) ; J_syn = J̃_syn·(1−x) ; J_imp = Ĩ·x ; J_Y = Ỹ·x
J_Z = C_in>0 ? F·Z/C_in : 0 ;  J_glc = C_in>0 ? F·U/C_in : 0
AA  += h·(J_syn + J_imp − J)
Lin += h·(J_Y − J_Z)
vInt += h·ṽ·m_c                         // integral of the running-ribosome speed (aa)
σInt_s += h·σ⁰_s·x/(e+K_in)             // for each sector
ledger (ATP): translation += h·4J ; otherBuilding += h·c_o·J ; transcription += h·(c_rRNA·f_R·J + 6(1−0.35θ)ṽ·m_c·N_nasc + bgTx0·x/(e+K_in))
              upkeep += h·m_V·V·x/(e+K_m) ; aaMaking += h·c_syn·J_syn ; transport += h·(J_imp + 0.33·J_Y)
              fermentation += h·2(F − χ_C·J_syn)
flux accumulators: aaPolymerised += h·J ; aaMade += h·J_syn ; aaImported += h·J_imp ; glucoseIn += h·J_glc
                   lactoseIn += h·J_Y ; lactoseSplit += h·J_Z ; hexoseToGlycolysis += h·F ; hexoseFermented += h·(F − χ_C·J_syn)
inj = 0 ; if (x < E_floor) { inj = (E_floor − x)·N_A ; x = E_floor }       // E_floor = 1e-9; floor += inj (after the fluxes; §21 row 28)
e = x
```

After the loop:

```
E = e
D += cmF·vInt
N += 3·(1−0.35θ)·vInt
```

**Exact identities** (by construction; tests e2 and m1):
- N_A·(E − e0) = fermentation + floor − (translation + otherBuilding + transcription + upkeep + aaMaking + transport), to round-off.
- aaPolymerised = R_elong·(D_after − D_before).

### 7.8 Completions

For every unit, pop cohorts while D − D0_head ≥ L_u.

| Unit | Effect of popping a cohort of n |
|---|---|
| player i | P_i += n; pMade_i += n; **the overshoot n·(D − D0 − L_i) is credited to mass_Q**. The released ribosome finishes the tick on background mRNA. This is < 1% of player synthesis. |
| sector s | mass_s += n·(D − D0) (continuous; exact) |

Update nSum and nD0Sum on push and pop.

### 7.9 Player mRNA

For each gene i:
1. **Decay first:** for each mature molecule in id order, if `bernoulli(decay:i, pDecay_i)`, remove it (compact in place). pDecay_i = 1 − detExp(−ln2·dt/t½_i), precomputed.
2. **Then completions:** pop nascent entries with N − N0 ≥ ℓ_i. Each becomes a mature mRNA with id = nextMRNAId++, birth = T, and mMade_i += 1.

Ribosomes already on a decayed mRNA finish their chains. Nascent transcripts never decay.

### 7.10 Sector mRNA (exact for constant input over the tick)

`σ_s = σInt_s/dt ;  m_s = m_s·E_k + (σ_s/k_M)·(1 − E_k)`, with E_k = detExp(−k_M·dt) precomputed and k_M = ln2/180.

### 7.11 Protein degradation

If kdeg_i > 0 (factor precomputed; M1 default is kdeg = 0, so nothing below runs in the reference cell):

```
ΔP_i  = P_i·(1 − detExp(−kdeg_i·dt))      // monomers degraded this tick
P_i  −= ΔP_i
AA   += L_i·ΔP_i                          // proteases return residues to the amino-acid pool
aaRecycled += L_i·ΔP_i                    // flux accumulator (aa); view.flux.aaRecycled
```

Degraded residues are recycled, which is the correct biology (and level 1.4 depends on it). Mass balance m1 therefore holds unchanged: the residues leave M and enter AA in the same tick, so the two terms cancel. The ATP cost of proteolysis is not modelled (§18 item 17).

### 7.12 Growth, dosage, division

```
M_new = recompute (7.2) ;  λ = aaPolymerised/(M·dt) ;  lambdaEMA += (λ − lambdaEMA)·(1 − detExp(−dt/300))
V_new = M_new/ρ
if (g == 1 && V_new ≥ 1.4·Vbirth) { g = 2; event replication }
if (V_new ≥ Vbirth + 1.0) divide()
```

`divide()` follows one daughter. It uses the `division` stream only, in this order:

1. **Per gene:**
   - each mature mRNA: kept with bernoulli(½), in id order;
   - each nascent entry: kept with bernoulli(½);
   - protein: n = floor(P_i), kept = binomialHalf(n), P_i = kept + (P_i − n)·½ (both daughters' shares ≥ 0, no clamp; §21 row 30);
   - cohort queue: every n × ½ (and Rbusy × ½).
2. **Sectors:** m_s ×½, mass_s ×½, cohorts ×½.
3. **Pools:** AA ×½ and Lin ×½. E is unchanged (ATP halves with V).
4. **Bookkeeping:**
   - rebase the odometers (D0 −= D for every cohort, D = 0; N0 −= N for every nascent entry, N = 0), then recompute the sums;
   - g = 1; Vbirth = M/ρ; gen += 1;
   - lastCycle_s = (T+1 − birthTick)·dt; birthTick = T+1;
   - emit event `division {gen, keptFraction}`.

### 7.13 Why everything stays positive (proofs; asserted in fuzz test m2)

- **E:** x = (e+q)/(1+q+r) lies in (0,1) for q, r ≥ 0. The capped branch gives a larger x than the uncapped one, so x > 0. Because upkeep > 0, 1 − x ≥ r_u/(1+q+r_u) > 0, so E never reaches 1. The floor 1e−9 is reached only when there is no carbon at all.
- **AA:** J·h ≤ R_elong·v_max·(a/K_aa)·h ≤ AA·(ρ/7336)·v_max·h/K_aa = 0.184·AA when h = 0.125 s. This uses m_c ≤ e+K_E and R ≤ ρV/7336. That is why config validation requires h ≤ 0.25 s (bound 0.37).
- **Lin:** J_Z ≤ Z/(2K_adp) because π ≤ 1 and u/(u²+K²) ≤ 1/(2K). With Z ≤ K_adp·Lin/h this gives J_Z·h ≤ Lin/2.
- **Integer species** (mRNA, nascent) are only decremented by removing existing entries.
- **Proteins** change only by adding completed chains, by exact factors, or by a clamped binomial split.

### 7.14 Drugs

| Drug | Mechanism in the model | Signature it produces (proto; §14) |
|---|---|---|
| **Rifampicin-like**, dose ρ ∈ [0,1] | multiplies **every** initiation by (1−ρ): player, R, Q, P and rRNA; transcripts in progress finish | mRNA 0.32 of before at 5 min and 0.10 at 10 min; translation 0.84 at 5 min and 0.08 at 20 min; ATP use falls gradually; proteins plateau |
| **Chloramphenicol-like**, dose d; θ = 0.98·d | Cm binding is reversible, so at any instant a fraction θ of ribosomes is stalled. Free ribosomes initiate at ×(1−θ). In-flight chains advance at (1−θ)·v_run on average. The observable speed of a running ribosome, `v_run`, is unchanged, and running = (1−θ)·R_elong. Transcription speed is ×(1 − 0.35θ), extrapolated from Proshkin 2010 (42 → 27 nt/s) | translation 2% at once; mRNA stays at 1.00–1.03 (plateau); ATP use −67% at once; E rises 0.89 → 0.95 |

There are no uptake kinetics and no resistance (disclosed).

---

## 8. Parameters (`btc-params.js`; the BIOLOGY.md table is generated from it, test b-3)

Confidence codes:
- **V**: verified in the research brief.
- **PV**: partly verified or derived from verified values.
- **U**: unverified estimate.
- **D**: derived or calibrated in this spec.
- **G**: game or numerics choice, disclosed.

| id | value | unit | source | conf. | note / disclosure |
|---|---|---|---|---|---|
| dt | 1 | s | design | G | integer tick |
| K (substeps) | 8 | – | convergence test (§10) | G | h = 0.125 s; must be ≤ 0.25 s |
| E_floor | 1e−9 | – | numerics | G | injection recorded in ledger.floor |
| rho | 6.0e8 | aa/fL | Milo 2013 (2–4×10⁶ proteins/µm³) | PV | low end; 2×10⁶ proteins of 300 aa per fL |
| Vadd (adder) | 1.0 | fL | Taheri-Araghi 2015 (adder); Volkmer & Heinemann 2011 (0.5–4 µm³) | V/G | steady birth size ≈1 fL whatever the medium |
| repFrac | 1.4 | ×Vbirth | placeholder for C+D timing | U | single dosage step (verify with Cooper–Helmstetter) |
| aaPerRibosome | 7,336 | aa | growth-law literature | U | verify r-protein sequence sum |
| rRNAperRibosome | 4,566 | nt | 16S+23S+5S | V | |
| L_R, L_Q, L_P | 133, 300, 300 | aa | 7336/55; Brocchieri & Karlin 2005 (median 267) | PV | |
| mRNA length | 3L+60 | nt | – | D | UTRs lumped |
| rnapFootprint | 35 | nt | design (RNA polymerase covers ≈30–40 bp) | G | caps transcripts in progress at ℓ/35 per gene copy; binds only when elongation stalls (§21 row 29) |
| t½ mRNA | 180 | s | Bernstein 2002; Chen 2015 | V | per-gene knob (1.5) |
| rateCap | 0.3 | /s per copy | Dennis 2009 (rrn ≈1/s ceiling) | V/D | |
| leak ("off") | 0.001 | ×rRef | Oehler 1990 (lac ≈1,300×), generalised | PV | knockout = 0 |
| rRef per gene | §5.1 ÷ 60 | /s per copy (stored); §5.1 lists /min | calibrated; range from Taniguchi 2010 | U | e.g. ptsG 1.7/60 = 0.0283 /s. lacZ ×1 gives 2.0×10⁴ monomers (2.4% of proteome); research: 2–3×10⁴ (≈2.2%) |
| b per gene | §5.1 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | Zong 2010; Kennell & Riezman via Roussel & Zhu 2006 (0.1–0.12 /s) |
| k_on | 1.6e−4 | fL/s per free ribosome per b·mRNA | calibrated to k_init 0.151 /s | D | |
| g_I | hin·(0.2+0.8χ) | – | Dai 2016 (fewer active ribosomes when slow) | D | |
| K_in | 0.03 | E | design | D | initiation stalls only when E collapses |
| K_E | 0.10 | E | research note (K ≈10% of normal) | G | sharp stall threshold |
| K_m | 0.30 | E | design | D | upkeep falls under energy stress |
| K_χa | 2.0e6 (3.3 mM) | /fL | design | D | Hill 2 |
| K_χe | 0.5 | E | design | D | Hill 2 |
| v_max | 18 | aa/s | Young & Bremer 1976; Dai 2016 (9–17) | V (range) | reference v_run 11.65 aa/s |
| K_aa | 1.0e6 (1.66 mM) | /fL | calibrated | D | amino-acid limitation of elongation |
| transcription coupling | 3 nt per aa | – | Proshkin 2010 | V | |
| cmTx (0.35) | 0.35 | – | Proshkin 2010 (42 → 27 nt/s at sub-inhibitory Cm) | PV | extrapolated to full dose |
| β_R | 3.0 | /s per gene copy | calibrated (φ_R ≈9.5%) | D | |
| β_P | 2.43 | /s per gene copy | calibrated (φ_P ≈32%) | D | |
| φ_Q | 0.50 | – | Scott 2010 (0.45–0.55) | V (secondary) | |
| A_tot | 3.5 | mM | Bennett 2009 (9.6 mM aerobic); Yaginuma 2014 (1.5 mM) | PV | ATP ≈3.1 mM; turnover ≈2.7 s |
| c_tl | 4 | ATP/aa | Lynch & Marinov 2015; Russell & Cook 1995 | V | |
| c_o (other building) | 2.7 | ATP/aa polymerised | Stouthamer via Martin 2026 (worked in §9.2) | D | lipids, wall, DNA, de novo nucleotides, and so on |
| ATP per nt | 2 | ATP/nt | Lynch & Marinov 2015 | PV | NTPs recycled |
| c_rRNA | 1.2448 | ATP per R-sector aa | 2 × 4566/7336 | D | rRNA made in step with r-protein |
| c_syn | 0.28 | ATP/aa made | Stouthamer via Martin 2026 (0.28) | PV | not Lynch's 25–30 (contested) |
| χ_C (carbon) | 0.8 | hexose/aa | carbon balance (≈4.8 C per residue) | D | research value 0.5 is unverified; both listed |
| upkeep | 5.6 mmol ATP/gDW/h at E = 0.9 → m_V = 2.40e5 | ATP/s/fL × hm(E) | Klamt 2018 anaerobic non-growth 2.8 mmol glucose/gDW/h × 2 ATP | PV | |
| fermentation yield | 2 | ATP/hexose | Hasona 2004; Wang 2010 (2–3) | V | teaching value; majors note 2–3 |
| K_π | 0.05 | E | design | G | priming (PTS needs PEP; PFK needs ATP) |
| s0 | 0.01 (lab); 0 (level 1.3) | E | design | G | stands for PEP and phosphorylated intermediates |
| K_adp | 0.08 | 1−E (Hill 2) | Koebmann 2002 (flux controlled by ATP demand; ≈1.7× headroom) | D | proto headroom C_gly/F = 1.6 |
| k_pts, K_G | 80 /s; 0.015 mM | – | K_G: Steinsiek & Bettenbrock 2012 | U/V | copy number proto 13,700 (research ≈10⁴, U) |
| uBasal | 0 (lab); 1.8e5 when `backupGlucoseUptake` | glucose/s/fL | calibrated to anaerobic ΔptsG 0.14 /h (Steinsiek & Bettenbrock 2012) | V (target) | |
| k_gly | 8.0 | hexose/s per lumped copy | calibrated; share 4.5% vs Mori 2021 ≈4% glycolysis | PV | fermentation enzymes sit in P |
| k_syn, k_P, K_i | 6.0 aa/s; 0.30 aa/s per P protein; 3.0e6/fL (Hill 2) | – | sector size 3–5% (estimate) | U/D | verify against Hui 2015 and Mori 2021 |
| k_imp, K_imp, K_iI | 20 /s; 0.010 mM; 5e6/fL | – | – | U | |
| k_Y, K_Y, L_max | 60 /s; 0.5 mM; 10 mM | – | – | U | cost 0.33 ATP per lactose (1 H⁺ ÷ ≈3 H⁺ per ATP) |
| k_Z, K_Z | 60 /s per monomer site; 1 mM | – | – | U | verify in β-gal reviews |
| θ at full Cm dose | 0.98 | – | Dai 2016 (mechanism) | D | |
| medium presets | glucose 10 (low 0.005); lactose 5; amino acids 2 | mM | ≈0.2% sugar | G | Low = 0.005 mM leaves PtsG only partly filled (sat = 0.25) and halves growth [proto Td 209 min, λ = 0.47 λ0, E 0.29]; 0.05 mM would change almost nothing (Td 97.9 vs 97.6 min), because glycolysis, not PtsG, limits flux at the reference state |
| reference constants for facts (§11.5) | λ_ref 1.18×10⁻⁴ /s; F_ref 5.8×10⁵ hexose/s; U_ref 1.1×10⁶ glucose/s; lacY_ref 1.0×10⁴; lacZ_ref 2.0×10⁴ monomers | – | reference cell (§9) and ×1 steady states in glucose [LacY 10,460; LacZ 19,460] | D | observe-only; never read by the physics |

---

## 9. Does it close? Worked by hand for the reference cell

**Reference cell:** m1-lab, glucose 10 mM, no oxygen, default levels, cycle mean.

### 9.1 Numbers

| Quantity | By hand | Proto | Literature |
|---|---|---|---|
| mean V; M | V̄ = Vbirth/ln 2 = 1.44 fL; M = ρV̄ = 8.66×10⁸ aa (2.9×10⁶ proteins of 300 aa) | 1.444; 8.66×10⁸ | ≈3×10⁶ proteins |
| growth | λ = ln2/(97.7 min) = 1.182×10⁻⁴ /s (0.426 /h) | Td 97.6–97.8 min | 90–126 min anaerobic |
| translation flux | J = λM = 1.024×10⁵ aa/s | 1.027×10⁵ | |
| ribosome identity | R·f_active·v = 11,230 × 0.786 × 11.65 = 1.028×10⁵ | exact every tick | Niess 2019 (>1.7×10⁵ at 60 min) |
| growth law | λ = φ_R·f·v/7336 = 0.0951 × 0.786 × 11.65/7336 = 1.187×10⁻⁴ | ✓ | |
| ATP: translation | 4 × 1.027×10⁵ = 4.11×10⁵ | 40.9% | ≈50% (Li 2014); 55% of biosynthesis |
| ATP: other building | 2.7 × 1.027×10⁵ = 2.77×10⁵ | 27.6% | |
| ATP: upkeep | 2.40×10⁵ × 1.444 × 0.891/1.191 = 2.59×10⁵ | 25.7% | |
| ATP: transcription | rRNA 1.245 × (0.095 × 1.027×10⁵) = 1.2×10⁴; mRNA 2 × k_M × Σmℓ ≈ 2 × 3.85×10⁻³ × 2.26×10⁶ nt = 1.8×10⁴; total 3.0×10⁴ | 3.0% | ≪ translation (criterion e) |
| ATP: aa making | 0.28 × 1.027×10⁵ = 2.9×10⁴ | 2.9% | |
| **total spend** | **≈1.00×10⁶ ATP/s** | 1.00×10⁶ | 1.5–4.8×10⁶ (theoretical–observed) |
| supply | 2(F − 0.8 J_syn) = spend → F = 5.0×10⁵ + 0.82×10⁵ = 5.82×10⁵ hexose/s | 5.8×10⁵ | |
| glucose uptake | 5.82×10⁵/(3.21×10⁴ × 1.444) = 12.6 mmol/gDW/h | 12.6 | 13–18 measured (energy spilling not modelled) |
| energy charge | F = C_hex·π·α: C_gly = 8 × 118,000 = 9.4×10⁵ (< U = 1.09×10⁶); π(0.891) = 0.947; α(0.891) = 0.650 → 5.8×10⁵ ✓ | E 0.886–0.893 | AEC > 0.9 (Bennett) |
| ATP pool | 0.891 × 3.5 mM = 3.12 mM = 2.71×10⁶ molecules; turnover 2.7 s | ✓ | 1–2 s (research); disclosed |
| aa pool | 3.7×10⁶ (4.3 mM); turnover 36 s | ✓ | – |
| steady-state ptsG | 39 proteins/mRNA × 243 mRNA/generation = 9,500 per generation; mean = 9,500/ln 2 = 13,700 | 13,660 | ≈10⁴ (U) |
| proteins per mRNA (b = 1) | k_init × 1/k_M = 0.151 × 260 = 39 | 39.3 | 20–40 |
| total mRNA | players ≈75 + R 520 + Q 1,216 + P 805 | 2,605 | ≈3,000 |
| proteome shares | Q 48.4, P 31.8, R 9.5, aaSyn 4.8, gly 4.5, ptsG 0.75, aaImp 0.1 (%) | ✓ | Q 45–55% (Scott) |

Translation is the largest single expense at 1.48× the next category (other building). It stays the largest with FliC ×4 (38.0 vs 30.3 upkeep) and with ptsG ×0.25 (37.6 vs 31.5). The pie chart and lessons say **"the largest cost of *growing*"**, because under chloramphenicol upkeep becomes the largest.

### 9.2 Derivation of c_o

- Stouthamer (via Martin 2026): 34.7 mmol ATP/g in total, 19.1 for polymerisation.
- At 4 ATP per aa, 19.1 mmol corresponds to 4.775 mmol aa per g.
- Non-polymerisation ATP per aa = (34.7 − 19.1)/4.775 = 3.27.
- Subtract amino-acid synthesis (1.355/4.775 = 0.28) and the transcription the model charges explicitly (0.29 ATP per aa at the reference state).
- Result: c_o = 2.70.

This arithmetic is written into the `note` field of the btc-params.js entry.

---

## 10. Numerics, determinism, performance

**Scheme (operator splitting, fixed order as in §7):**
- stochastic events at tick resolution;
- exact exponentials for linear decay;
- MPE for the stiff energy pool with explicit, provably positive updates for AA and Lin inside the substeps;
- queue odometers for exact delays.

**Convergence** (proto; test n2):

| dt / K | Td (min) |
|---|---|
| dt = 1, K = 4 | 97.60 |
| dt = 1, K = 8 | 97.65 |
| dt = 1, K = 16 | 97.85 |
| dt = 1, K = 32 | 97.85 |
| dt = 2, K = 16 | 98.93 (+1.3%) |
| dt = 0.5, K = 4 | 98.07 |

- The time for E to fall below 0.1 after glucose removal is 3–4 s in every setting.

**Determinism:**
- only the operations allowed in §2.3;
- a fixed draw order: genes in slot order, one uniform per Poisson, decay in id order, division order fixed;
- no dependence on frame timing;
- rendering never touches engine streams.

**Performance:**
- Proto: 7.6 µs per tick (Node 22, this container, unoptimised JS arrays).
- Production target: ≤ 6 µs per tick in Node on desktop. Assume a low-end Chromebook or phone is 5–8× slower (≤ 50 µs).
- There is no allocation in `step()`. Memory is about 300 KB (queues sized in §6).

| Speed (sim per real s) | ticks/frame at 60 Hz | engine time per frame, low-end |
|---|---|---|
| 1 sim-s | 0.017 | ≈0 |
| 1 sim-min | 1 | ≤ 0.05 ms (target < 1 ms) |
| 10 sim-min | 10 | ≤ 0.5 ms |
| 1 sim-h | 60 | ≤ 3 ms |

**Frame contract (UI):**
- `acc += dtReal·speed`; `n = floor(acc/dt)`; call `cell.step()` up to n times, stopping once 4 ms of engine time have elapsed; `acc −= done·dt`. If the cap was hit, drop the remainder and show the **achieved** speed.
- Pause stops the loop. The loop also stops on `visibilitychange`.
- Speed and pause are UI state, not commands.

---

## 11. Public API (exact)

### 11.1 Construction

```js
const cell = new BTC.Cell(config);            // throws BTC.ConfigError {code, path, message}
```

```js
config = {
  engineVersion: '1.1.0',                     // optional; if present must equal BTC.ENGINE_VERSION
  seed: 20270115,                             // uint32, required
  strain: 'm1-lab',                           // v1.1: | 'm2-l11' | 'm2-lac' (§22.5, §22.6)
  start: 'steady',                            // 'steady' (preset, reseeded) | 'birth' (v1.1, newborn preset) | 'cold' | Snapshot
  medium: { glucose_mM: 10, lactose_mM: 0, aminoAcids_mM: 0, iptg_mM: 0 /* v1.1 */, oxygen: false },
  design: null,                               // v1.1, m2-lac only: the lac design (§22.5)
  genes: {                                    // optional per-gene overrides, applied at tick 0 (not logged as commands)
    fliC: { level: 0 /* 'off'|0|0.25|0.5|1|2|4 */, rate_perS: undefined, rbs: 2, knockout: false,
            mRNAHalfLife_s: 180, kdeg_perS: 0, initial: { mRNA: undefined, protein: undefined } }
  },
  drugs: { rifampicin: 0, chloramphenicol: 0 },   // doses 0..1
  flags: { controls: 'free' /* | 'locked' */, backupGlucoseUptake: false, primingSeed: 0.01 },
  params: {},                                 // { paramId: value } whitelist = btc-params ids; folded into paramsHash
  schedule: [],                               // [{tick, cmd}] designer/level programs; applied and logged with source:'schedule'
  variant: null                               // v1.1: opaque JSON ≤ 2 KB, hashed, never read by physics (§22.7)
}
```

**Start modes:**
- **`start:'cold'`:** V ≈ 1 fL; E = 0.9; AA = 1.9×10⁶; mRNA/protein: ptsG 8/9,000, gly 25/9×10⁴, aaSyn 25/9×10⁴, aaImp 0/300; R: m 400, mass 0.09ρ; Q: m 1,100, mass 0.5ρ; P: m 700, mass 0.28ρ.
- **`start: Snapshot`:** the snapshot's state is the starting point and is treated like the preset: tick rebased to 0, counters, ledger and log cleared, streams re-derived from `config.seed`, then the config applied; `presetHash` is `null` (§21 row 36). (To continue a saved run unchanged, use `BTC.Cell.restore`.)
- **`start:'steady'`:** loads `BTC.presets['m1-lab-glucose']`, which `tools/make-presets.js` makes from a cold start with seed 0 run for 120,000 ticks. Then:
  - tick is reset to 0 and the log is cleared; every stored tick (`birthTick`, episode ticks) is rebased by the same offset, so it may be negative;
  - **all PRNG streams are re-derived from config.seed**;
  - config genes, medium and drugs are applied.

  Test d-7 re-derives the preset and compares hashes.
- **`presetHash`:** the `hash64` of the preset's canonical state bytes, stored beside the preset in `btc-presets.js`. With `start:'steady'` it is folded into the canonical config JSON (as `presetHash`) before `configHash` is computed, and it is written into every run record. A preset regenerated without an `ENGINE_VERSION` bump therefore makes old run records fail `replay.run` with a clear `configHash` mismatch instead of diverging silently. With `start:'cold'` or a Snapshot, `presetHash` is `null`.

### 11.2 Methods and getters

| Signature | Returns / effect |
|---|---|
| `cell.tick` (getter) | int, completed steps |
| `cell.t` (getter) | tick·dt, in s |
| `cell.dt` | 1 |
| `cell.step()` | one tick; void |
| `cell.advance(n)` | runs n ticks; returns n |
| `cell.advanceTo(tick)` | runs until cell.tick == tick |
| `cell.runUntil(pred, maxTicks)` | *(deferred, §20)* pred(view, events) is checked after each tick; returns ticks run, or −1 on timeout |
| `cell.command(cmd)` | `{ok:true, tick, seq}` (applies at the start of the next step, stamped tick = cell.tick) or `{ok:false, error, message, seq}`. A rejection is logged with its code and emits `command_rejected` (§11.4) |
| `cell.schedule(tick, cmd)` | same shape; tick ≥ cell.tick; for lessons and tests |
| `cell.getLog()` | a copy of the LogEntry[] |
| `cell.takeEvents()` | drains Event[] |
| `cell.watch({id, gene?, field, op, value})` | *(implemented in v1.1, §22.7)* registers an edge-triggered watcher; returns id. `op` ∈ `>=`, `<=`, `>`, `<`; `field` is a numeric path in the view using gene ids (grammar in §20) |
| `cell.unwatch(id)` | *(implemented in v1.1)* |
| `cell.observe()` | the View (§11.5); one reused object, refreshed lazily when `view.tick !== cell.tick` |
| `cell.ledgerSinceMark(label)` | *(deferred, §20)* per-category ATP totals since the `mark` command with that label |
| `cell.snapshot()` | Snapshot (JSON-safe, exact) |
| `BTC.Cell.restore(snapshot)` | Cell; continuing gives the same hash as never stopping |
| `cell.fork()` | `restore(snapshot())`; a twin with common random numbers |
| `cell.hash()` | 16 hex characters |
| `cell.physicsDigest()` | 16 hex characters; the hash without the env, drugs and pending-command fields (§6). Negative controls only |
| `cell.configHash` (getter) | 16 hex characters; hash of the canonical config JSON (keys sorted with `BTC.math.sortStrings`; includes `presetHash`) |
| `cell.paramsHash` (getter) | |
| `cell.presetHash` (getter) | 16 hex characters, or `null` (§11.1) |
| `cell.attachRecorder(rec)` / `detachRecorder(rec)` | the engine calls `rec.onTick(cell)` after each step; not hashed |
| `cell.runRecord()` | `{engineVersion, configHash, presetHash, config, log, finalTick, checkpoints:[{tick, hash}], finalHash}`; checkpoints every 600 ticks, taken automatically |
| `BTC.replay.run(record \| {config, log}, toTick, {attach}?)` | Cell. Refuses on an engineVersion or configHash mismatch. Skips log entries with `source:'schedule'`; they come from the config. v1.1: `attach(cell)` is called once before the first step (R-E18) |
| `BTC.replay.verify(record)` | `{ok, mismatchTick?, expected?, got?, finalHash}` |

**Snapshot format:**

```
{schema:1, engineVersion, configHash, paramsHash, presetHash, config, tick, seqNext,
 state: base64(canonical bytes), scratch: base64(last-tick scratch), pending, log, eventState, watchers: [], marks: [], checkpoints}
```

`scratch` holds the per-tick flux, ledger and derived values of §6 ("not hashed, but included in snapshots") as float64, so a restored cell's view shows the same last-tick fluxes as the original (§21 row 35).

`watchers` and `marks` are reserved and always empty in M1 (§20).

- The canonical bytes are the same bytes that are hashed, so −0, denormals and every bit round-trip exactly.
- **Reset** is `new BTC.Cell(config)`, never field patching. Test d-5 checks that reset equals a fresh cell by hash.

### 11.3 Commands (pure data; validated; always logged)

| type | args | rules |
|---|---|---|
| `setPromoter` | `{gene, level}` with level ∈ {'off', 0, 0.25, 0.5, 1, 2, 4}, or `{gene, rate_perS}` with 0 ≤ rate ≤ 0.3 (majors; not offered in the M1 UI) | rejected with `locked` when controls = 'locked' **and** the command's source is `'user'`; the log stores the resolved per-copy rate. Switching from off/knockout to on opens an **on-episode**; switching to off opens an **off-episode** |
| `setRBS` | `{gene, rbs}` with 0 < rbs ≤ 16 | majors; implemented, not offered in the M1 UI; `locked` rule applies (source `'user'` only) |
| `setKnockout` | `{gene, knockout: bool}` | designer/tests; knockout does not delete existing protein or mRNA (it stops transcription). A knockout in `config.genes` describes a strain that never had the gene: its mRNA, transcripts in progress and ribosomes on its mRNA are cleared at construction, and `initial.protein` sets the protein (§21 row 31) |
| `setMedium` | any of `{glucose_mM, lactose_mM, aminoAcids_mM, iptg_mM}` ≥ 0 | `oxygen` → rejected `not-available`; `iptg_mM` is v1.1 (does nothing without LacI) |
| `setControls` | `{controls: 'locked'\|'free'}` | v1.1 (R-E11): source `'lesson'` or `'schedule'` only; a `'user'` submission is rejected `locked` |
| `setDrug` | `{drug:'rifampicin'\|'chloramphenicol', dose: 0..1}` | |
| `setMRNAHalfLife` | `{gene, s}` with 30 ≤ s ≤ 1800 | implemented; hidden until level 1.5 |
| `setDegradation` | `{gene, perS}` with 0 ≤ perS ≤ 0.01 | implemented; hidden until level 1.4 |
| `mark` | `{label}` (string ≤ 40 characters) | *(deferred, §20)*; in M1 it is rejected with `unknown-type` |

- **Rejection codes:** `unknown-type`, `unknown-gene`, `bad-value`, `locked`, `not-available`, `tick-in-past`.
- **`locked` applies only to source `'user'`.** Commands with source `'schedule'` (the config's designer or level program) and `'lesson'` are never rejected as `locked`, so a level can lock the student's controls and still run its own program.
- **Canonical numbers.** Validation replaces every numeric argument `x` by `x + 0` before it is logged or queued, so `−0` never enters the log and the pending-command hash is the same after a JSON round trip.
- **LogEntry:** `{tick, seq, type, args, resolved?, rejected?: code, source: 'user'|'schedule'|'lesson', submitTick}`. `tick` is the tick the command was for (for `command()`, the submission tick); `submitTick` is the tick at which it was submitted, which replay needs to rebuild the same pending queue and seq numbers (§21 row 34).
- Replay re-validates each entry. A rejected entry MUST reject again, otherwise it is a mismatch.

### 11.4 Events

Every event is `{tick, tEnd_s: (tick+1)·dt, type, gene?, value?, id?}`, stamped with the tick in which it occurred. Command events carry extra fields (below).

**Command events.** `command_applied` and `command_rejected` are `{tick, tEnd_s, type, seq, cmdType, args, resolved, prev, code?}`:
- `seq`: the command's sequence number (the UI matches pending controls on it);
- `cmdType`: the command's `type` (`setPromoter`, `setMedium`, …); `args`: its canonical arguments;
- `resolved`: the control value after the command, in the log's resolved form (for `setPromoter`: `{level, rate_perS}` with the per-copy rate in /s; for `setMedium`: the whole medium; for `setDrug`: `{drug, dose}`); `null` on rejection;
- `prev`: the same control's resolved value just before the command (same shape as `resolved`). The narrator reads the up/down direction from `prev` and `resolved`;
- `code`: the rejection code (`command_rejected` only).

`command_applied` is stamped with the tick in which the command was applied (§7.1). A command rejected at submission is logged with its code and emits `command_rejected` into the event queue at once, stamped `tick = cell.tick`; a scheduled command rejected at application is stamped with that tick.

| type | fires when |
|---|---|
| `command_applied {seq, cmdType, args, resolved, prev}` | a command is applied at the start of a step |
| `command_rejected {seq, cmdType, args, resolved: null, prev, code}` | a command is rejected (at submission or at application) |
| `tx_start {gene}` | first initiation in an on-episode |
| `first_mrna {gene}` | first mature mRNA whose `initTick` ≥ episode start |
| `first_protein {gene}` | after `first_mrna` of the episode, proteins completed since episode start reach the oligomer size (lacZ 4, others 1) |
| `mrna_gone {gene}` | in an off-episode, the first tick with m = 0 and no nascent transcripts |
| `function_seen {gene}` | *(implemented in v1.1)* once per cell. The protein's role contribution is ≥ 10% of its class total **and** ≥ 1,000 /s, for 30 consecutive ticks. Classes: glucose-import share of glucose in; glycolysis: hexose to glycolysis; aa-synthesis and aa-import: shares of aa supply; lactose-import: lactose in; lactose-split: 2·J_Z/hexose to glycolysis (≥ 500 lactose/s). fliC never fires |
| `replication` | dosage step |
| `division {gen}` | |
| `energy_low` | E < 0.30; re-armed at E > 0.45 |
| `energy_ok` | E > 0.45 after an `energy_low` (the same crossing that re-arms `energy_low`) |
| `energy_none` | E < 0.01 |
| `dormant` | E < 0.01 for 600 ticks |
| `revived` | E > 0.30 after `dormant` |
| `aa_low` | a < 0.5×10⁶/fL |
| `growth_arrest` | λ < 0.05·λ_ref for 60 ticks, λ_ref = 1.18×10⁻⁴ /s |
| `growth_resumed` | λ > 0.2·λ_ref for 60 ticks |
| `watch {id, value}` | *(implemented in v1.1)* a watcher's condition becomes true (edge) |

Test d-2 compares the `command_applied` / `command_rejected` stream of the replay (every field above) with the live run's.

### 11.5 View (`cell.observe()`)

The view is a flyweight: plain objects and typed arrays, all allocated once at construction. **The UI MUST NOT write to it.** An app lint test fails on any `cell.`/`view.` assignment in `src/app`.

**No per-frame allocation.** `observe()` never calls `subarray()` or creates arrays. Variable-length per-gene data is exposed as the gene's **fixed-capacity base array plus a count**: only entries `[0, count)` are valid, and the rest is stale. `mRNAIds` and `mRNABirthTick` are the gene's molecule-list arrays (capacity 512, valid `[0, mRNA)`, id order). `nascentProgress` is a preallocated `Float64Array(512)` that `observe()` refills from the nascent ring (valid `[0, nascent)`, oldest first). Fixed-length arrays (`byUnit`, `byGene`, the per-gene flux arrays, the ledger arrays) are the same objects on every call.

**Genes by id.** `view.genes` is an array in slot order. `view.geneById` is an object keyed by gene id whose values are **the same objects** as in `view.genes` (`view.geneById.lacZ === view.genes[5]`). The UI indexes by id; slot numbers are for layout only.

```
view.tick, view.t_s
view.clock      { minutes, generation, cellAge_s, lastCycle_min /* cycle-averaged doubling time; the value the UI shows when growth is steady (LAB_UI §6) */,
                  doublingEMA_min /* ln2/λEMA; ripples ±4% within a cycle [proto 94.4–102.3 min] */ }
view.cell       { V_fL, Vbirth_fL, length_um /* rod, radius 0.38 µm */, width_um, dosage, M_aa, proteins300,
                  lambda_perS, lambda_perH, lambdaEMA_perH }
view.energy     { E, ATP, ADP, ATP_mM, turnover_s, state: 'normal'|'low'|'depleted' /* >0.7 / else / <0.1 */ }
view.aminoAcids { count, mM, state: 'ok'|'low' }
view.lactose    { inside, inside_mM }
view.ribosomes  { total, elongating, running /* (1−θ)·elongating */, stalled, free, activeFraction,
                  vRun_aaPerS, vTx_ntPerS, byUnit: Float64Array /* players then R,Q,P */, kInitPerMRNA /* at b = 1 */ }
view.genes[i]   { id, slot, role, lumped: bool, standsForGenes /* 10, 100, … */, level, rate_perS, knockout, rbs,
                  mRNA, mRNAIds: Int32Array(512, valid [0,mRNA)), mRNABirthTick: Int32Array(512, valid [0,mRNA)),
                  nascent, nascentProgress: Float64Array(512, valid [0,nascent), 0..1), ribosomes, polysome /* ribosomes per (mRNA+nascent) */,
                  protein, proteinRounded, conc_perFL, proteomeFraction, synthesis_perS /* last tick */,
                  madeSinceOn, madeSinceOff, geneState, functionSeen /* reserved; always false in M1 (§20) */,
                  episode: {onTick, firstMRNATick, firstProteinTick, offTick} }
view.geneById   { ptsG: <same object as view.genes[0]>, gly: …, …, fliC: … }
view.sectors    { R: {mRNA, mass, fraction}, Q: {…}, P: {…} }
view.proteome   { byGene: Float64Array, R, Q, P }
view.flux       (/s, averaged over the last tick) { glucoseIn, glucoseIn_mmolPerGDWh, lactoseIn, lactoseSplit,
                  hexoseToGlycolysis, hexoseFermented, fermentationProductsOut /* = 2·hexoseFermented, lumped acids/ethanol */,
                  aaMade, aaImported, aaRecycled /* 0 unless kdeg > 0 */, aaPolymerised, ntPolymerised,
                  transcriptsStarted: Float64Array, mRNAsCompleted: Float64Array,
                  proteinsCompleted: Float64Array, ribosomesMade, atpMade, atpSpent }
view.ledger     { names: ['translation','otherBuilding','transcription','upkeep','aaMaking','transport'],
                  perS: Float64Array(6) /* last tick */, fractions: Float64Array(6), cumulative: Float64Array(6),
                  supply_perS /* fermentation */, floor_perS, cumulativeSupply }
view.env        { glucose_mM, lactose_mM, aminoAcids_mM, oxygen:false }
view.drugs      { rifampicin, chloramphenicol, theta }
view.scale      { dt_s, substeps }
```

**`geneState` values:**

| value | meaning |
|---|---|
| `knocked-out` | gene is knocked out |
| `off` | off, with no mRNA, no nascent transcripts and protein < 1 |
| `waiting` | on, but nothing initiated yet this episode |
| `transcribing` | on, with nascent transcripts or mRNA |
| `stalled` | on, but E < 0.05 or the drug factor is < 0.1 |
| `leftover-mRNA` | off, but m or nascent > 0 |
| `protein-only` | off, m = 0, protein ≥ 1 |

**`BTC.observe.limiting(cell)`** returns the first of these that is true, in this order:
1. `'translation-blocked'` (θ > 0.5)
2. `'transcription-blocked'` (ρ > 0.5)
3. `'no-carbon'` (C_in = 0)
4. `'energy'` (E < 0.5)
5. `'amino-acids'` (s_aa < 0.5)
6. `'ribosomes'`

**`BTC.observe.facts(cell, out)`** fills `out` (a reused object) with the fields in the table below. **Facts schema 1.2** (`BTC.observe.FACTS_SCHEMA = '1.2'`; engine 1.1.0 is schema 1.3, which adds `lacOperator`, `inducer` and `crp`, §22.7). Facts contain no numbers: only strings, booleans, `null` and gene ids. They are observe-only, so no physics and no hash depend on them. Every value is computed from the state at the end of the last completed tick, from the last tick's fluxes, and from the event detectors' flags.

**Reference constants** (btc-params, conf. D, §8): λ_ref = 1.18×10⁻⁴ /s; F_ref = 5.8×10⁵ hexose/s (reference flux into glycolysis, §9.1); U_ref = 1.1×10⁶ glucose/s (13,700 PtsG × 80 /s, the reference import capacity at saturation); lacY_ref = 1.0×10⁴ and lacZ_ref = 2.0×10⁴ monomers (the ×1 steady states in glucose, proto 10,460 and 19,460).

| field | values | definition and thresholds |
|---|---|---|
| `drug` | `{rif, cm}`, each `'off'`\|`'low'`\|`'full'` | rif: ρ = 0 → off; 0 < ρ ≤ 0.5 → low; ρ > 0.5 → full. cm: the same cut-points on θ (= 0.98·dose). The UI's Low dose 0.3 gives low; Full gives full |
| `medium` | `'none'`\|`'glucose'`\|`'lactose'`\|`'both'` | what is **outside**: glucose when `glucose_mM > 0`, lactose when `lactose_mM > 0` |
| `glucoseLevel` | `'none'`\|`'low'`\|`'high'` | G = 0 → none; 0 < G < 0.1 mM → low; G ≥ 0.1 mM → high. The presets are Low 0.005 mM and High 10 mM |
| `carbon` | `'none'`\|`'glucose'`\|`'lactose'`\|`'both'` | what is **getting in**: glucose when `flux.glucoseIn` > 0.01·F_ref; lactose when 2·`flux.lactoseSplit` > 0.01·F_ref (hexose equivalents); both when both; otherwise none |
| `glucoseImport` | `'none'`\|`'low'`\|`'normal'` | import capacity at saturation C_U = P_ptsG·k_pts + uBasal·V: C_U < 0.01·U_ref → none; C_U < 0.25·U_ref → low; otherwise normal |
| `glucoseStep` | `'import'`\|`'enzymes'` | which capacity holds glucose use back this tick: `'enzymes'` when k.Cgly < k.U (glycolysis capacity below PtsG uptake capacity, §7.6; PTS uptake is matched to glycolysis, C_hex = min(C_gly, C_in)), otherwise `'import'`. The default cell sits near the boundary (C_gly/U ≈ 0.95); the narrator reads it only when ATP is already short |
| `energy` | `'normal'`\|`'low'`\|`'none'` | E > 0.7 → normal; 0.1 ≤ E ≤ 0.7 → low; E < 0.1 → none. These are the cut-points of `view.energy.state` (`'none'` here is `'depleted'` there) |
| `aa` | `'ok'`\|`'low'` | a = AA/V < 0.5×10⁶ /fL → low (the `aa_low` threshold and `view.aminoAcids.state`) |
| `lactoseBlock` | `'no-lacY'`\|`'no-lacZ'`\|`null` | only when `lactose_mM > 0`, else null. P_lacY < 0.01·lacY_ref → no-lacY; otherwise P_lacZ < 0.01·lacZ_ref → no-lacZ; otherwise null. Equivalently: YCap (resp. ZMax) below 1% of the reference-induced capacity. The "off" leak leaves a few monomers (proto LacY 6, LacZ 2 after 10 h), which is far below 1% |
| `lastCommandedGene` | `{id, state}` or `null` | the gene of the most recent **applied** gene-targeted command (`setPromoter`, `setKnockout`, `setRBS`, `setMRNAHalfLife`, `setDegradation`), any source; `state` is its `geneState` |
| `uselessGene` | gene id or `null` | the first gene in the order fliC, lacZ, lacY, aaImp that is currently useless **and** has a current ribosome share `genes[i].ribosomes / ribosomes.elongating` above a hysteresis band: a gene becomes the burden above **2.5%** and stays it while above **1.0%** (the previous value is read from the reused `out` object; `facts(cell)` without `out` has no memory and uses 2.5%). One gene's share swings with mRNA bursts (lacZ ×1: about 1–5%), so a single 2% threshold flickered. Useless: fliC always; lacZ and lacY when `medium` has no lactose; aaImp when `aminoAcids_mM = 0`. It keys on ribosomes **now** translating the gene, not on protein left over, so it clears within about a minute of the mRNA being gone. The app calls facts once per rendered frame, so there the band acts on sampled ticks; that affects only the narrator, never the physics or the hash |
| `aaOutside` | boolean | `aminoAcids_mM > 0` |
| `aaImportOn` | boolean | the last tick's amino-acid import supplied more than 5% of the amino acids polymerised (`flux.aaImported > 0.05·flux.aaPolymerised`), whatever the promoter level. At the default aaImp level (×¼) with amino acids Present this is about 27%, so it is true; with none outside it is false |
| `growth` | `'normal'`\|`'slow'`\|`'arrested'` | arrested from `growth_arrest` until `growth_resumed`; otherwise slow when λEMA < 0.8·λ_ref; otherwise normal |
| `justDivided` | boolean | a `division` event occurred within the last 90 ticks |
| `limiting` | string | `BTC.observe.limiting(cell)` |

Each value is reached by a scripted scenario in LAB_UI test U-4. Schema 1.2 adds `glucoseStep`, gives `uselessGene` its 2.5%/1.0% hysteresis band, and bases `aaImportOn` on the import flux instead of the promoter level (review of the M1 build). Schema 1.1 added `medium`, `glucoseLevel`, `glucoseImport`, `aaOutside` and `aaImportOn`, defines every threshold above, and changes `uselessGene` from proteome fraction to current ribosome share.

---

## 12. Renderer support (src/shared; not hashed)

**`BTC.dots`**

| Function | Behaviour |
|---|---|
| `scaleFor(count, maxDots, prevScale)` | picks from the ladder {1, 10, 100, 1,000, 10⁴, 10⁵, 10⁶}. It chooses the smallest N with count/N ≤ maxDots (default 120), and changes scale only after the threshold is crossed by 20% (hysteresis) |
| `count(n, N)` | floor(n/N + 0.5) |
| `pos(speciesKey, index, epoch, rect, out)` | a position from fnv1a32(speciesKey, index, epoch), with no PRNG state. Dot k is stable while counts change; the layout reshuffles only at division (epoch = generation). mRNA dots use **molecule ids**, so the molecule that decays is the dot that disappears |
| `FluxEmitter(N)` | `.add(flux_perS × dtSim)` returns an integer number of particles to spawn, carrying the remainder. Used for glucose in and fermentation products out |

- **Default scales:** mRNA and nascent 1; ribosomes (pool) 100; the selected gene's polysome 1 (drawn on its mRNAs), switching to 10 when it exceeds 400 ribosomes (back to 1 below 320; LAB_UI §2.3); proteins by the ladder; ATP 10⁵; amino acids 10⁵; lactose 10⁵.
- The legend always shows "1 dot = N". The clock and the time compression are always visible (UI spec).

**`BTC.Recorder({every: 5, capacity: 4096, channels})`**
- Float64 rings sampled when `tick % every == 0`. A parallel `Int32Array(capacity)` stores the tick of each sample, so plots use the stored ticks, never an assumed spacing.
- When full, it keeps every second sample **and doubles `every`** (5 → 10 → 20 … ticks), so old and new data have the same spacing and plots show no resolution seam.
- Deterministic, so a level 1.2 sketch score can be recomputed on a server by replay.

**`BTC.narrate`** (module; **LAB_UI §7 is authoritative**)
- API: `createMemory()`, `ingest(memory, events, tick)`, `narrate(facts, memory, tick) → {key, text, gene?}`. It reads facts schema 1.2 (§11.5) and the command events' `prev`/`resolved` fields (§11.4).
- The rules, their priority, the sentence templates, the text lint and the display hold are specified in LAB_UI §7 and tested there (U-3, U-4, U-7).
- **Superseded in v1.1:** the priority summary and the phrase-table seed below are kept only as a record of v1.0. Where they differ from LAB_UI §7, LAB_UI §7 wins; they MUST NOT be implemented from here.
- The tone is dry and understated, as Alex chose. *(Superseded)* v1.0 priority: drug > no carbon or no energy > lactose block > amino acids low > just divided (brief) > last commanded gene's life cycle > useless-protein burden > growth summary. *(Superseded)* v1.0 phrase table seed:
  - "Gene C is being transcribed; no protein yet."
  - "Transcription of gene C has stopped, but its mRNA is still being translated."
  - "The mRNA is gone; the protein remains and is split at each division."
  - "No sugar is coming in, so ATP has run down and every machine has stopped."
  - "Rifampicin blocks RNA polymerase; mRNA already made is read until it decays."
  - "Chloramphenicol stalls ribosomes; the mRNA is still here, but little protein is made."
  - "Ribosomes busy with flagellin are not making anything else, so growth has slowed."
  - "Lactose is outside, but without LacY it does not get in."
  - "Lactose gets in, but without LacZ it is not split."
  - "The cell divided; this daughter received about half of everything."

---

## 13. Extension hooks (M1 implements the data model; later levels plug in)

### 13.1 Genome schema (compiled by BTC.genome; M1 uses the subset shown)

```js
genome: {
  replicons: [{ id:'chr', dosage:'step' /* M1 */ }],                        // 1.6 adds {id:'phage', dosage:'integer'}
  tus: [{ id:'tu_lacZ', replicon:'chr', promoter:{ rRef:1.6/60, level:0, leak:0.001, sites:[] /* 1.7 operators */ },
          cistrons:['lacZ'] /* 1.7: ['lacZ','lacY','lacA'] polycistronic */, mRNA:{ halfLife_s:180 }, compartment:0 }],
  cistrons: { lacZ:{ protein:'lacZ', rbs:1.5, allele:'wt' /* 1.5 */ } },
  proteins: { lacZ:{ length:1024, oligomer:4, location:'cyto', kdeg:0, signalPeptide:false /* 2.3 */, compartment:0,
                     role:'lactose-split', activity:1 } },
  reactions: { /* library keyed by role; M1 rows fixed */ }
}
```

- M1 has one cistron per TU. `sites`, `allele`, `signalPeptide` and `compartment` are present but inert.
- Slots are preallocated to `maxGenes = 16`. PRNG streams are labelled by gene id, never by slot (§4).
- **M1 builds only the data model.** The M1 catalog is the flat §5.1 table with the inert fields listed there; `btc-genome.js` compiles it to the slot layout. The general compiler for this schema (replicons, polycistronic TUs, operator sites, alleles, compartments) is deferred (§20).

### 13.2 Module contract

A module is `{id, capacities(cell, caps), terms: [{id, kind, category}], rates(cell, substepCtx, tilde), apply(cell, fluxes)}`.
- New energy sinks and sources are rows in the term table (CAPPED, DEMAND or SUPPLY).
- New translation units join W and the cohort mechanism, so ribosome competition applies to them automatically.

### 13.3 Hooks by level

Several of these hooks use items deferred to M1.x (§20): watchers, marks, `function_seen`, `variant.slotOrder`, `runUntil` and the schema compiler. They are built when their level is built, not in M1. Engine 1.1.0 built watchers, `function_seen`, opaque variants, transcription units and the 1.7 module (§22); `docs/LEVELS.md` §8 is the level contract where it differs from this table (for example, display order is UI, not `variant.slotOrder`).

| Level | What attaches |
|---|---|
| 1.1 Starving next to a feast | `variant.slotOrder` shuffles display slots from the `variant` stream; physics reads roles, so nothing leaks; decoys go in the free slot; `function_seen` drives name reveal; counted experiments = counted `setPromoter` commands |
| 1.2 One gene, many copies | watcher `genes.ptsG.protein >= 500` plus a deadline; sketch scored against the Recorder (deterministic, replayable); `madeSinceOff` shows the continued rise |
| 1.3 Price of a protein | `flags.primingSeed = 0` (a real threshold, about 30% of default capacity, §14 g6; **gone in v1.1**: the energy gates let even 5% restart, §21.1 row 6); low starting gly/ptsG; optional finite medium pool (`medium.mode:'finite'`, reserved) |
| 1.4 Nothing lasts | `setDegradation` (ssrA-like tag); band watcher; steady state = synthesis/(λ + k_deg) (test d3) |
| 1.5 Shape is function | allele compiler → {L_eff, activity, kdeg}; `btc-fold.js` (pure HP lattice) sets missense activity; nonsense truncates L (cheaper) with activity 0; frameshift gives activity 0; `setMRNAHalfLife` |
| 1.6 Hijacked | `injectGenome` adds a replicon with integer dosage; phage mRNAs join W (takeover emerges); early host-shutoff protein multiplies host promoters; restriction enzyme cuts unmethylated DNA at a rate ∝ its count (seeded); lysis threshold gives a terminal state |
| 1.7 Nobody's in charge | `btc-regulation.js`: operator occupancy per promoter; LacI as a low-copy integer species (reserved flag `stochasticTranslation` for Poisson ribosome initiation on player mRNAs); seeded bind/unbind, search ≈6 min ÷ copies; allolactose as a LacZ side product from Lin; CRP–cAMP from PTS flux; `controls:'locked'` plus `schedule`; truth table (Oehler 1990): wild type ≈1,300×, O1 only ≈20×, lacI null constitutive. **Decision needed** (§15): diauxie framing. **Built in v1.1** (§22.5): one operator per copy with a leak, integer tetramers, search 300 s ÷ tetramers, allolactose, IPTG, CRP–cAMP; wild type 1,000× |
| 1.8 Breathing room | `setMedium {oxygen}` enabled; a respiration gene set (membrane, large L); a SUPPLY row at ≈20–24 ATP/glucose (Kukurugya 2024); membrane-area budget ∝ V^(2/3); narrator: "2 vs about 20; textbooks say about 30 for mitochondria" |
| 1.9 Machines that build machines | R becomes a player tile (σ_R set by the player, no longer by χ); both growth laws already emerge (L1, L2) |
| Bridge | two Cell instances; drugs carry a target tag (bacterial RNAP, 70S) |
| Chapter 2 (human cell) | `compartment` index on every pool and cohort; transit FIFOs (clock-keyed CohortQueue) for nucleus processing and export (`coupled:false`), ER → Golgi → secretion; mRNA half-lives of hours (to be sourced). **Level 2.3 is the plasma cell first**: `signalPeptide` routes cohorts to an ER-bound pool; H₂L₂ assembly (heavy ≈450 aa, light ≈214 aa, stoichiometric, like the LacZ oligomer); a secreted counter. Beta-cell insulin reuses the same pipeline. Signalling uses QSS pools feeding `sites`; division makes the replication rate ∝ DNA polymerase protein. dt/K are config |

---

## 14. Tests (node:test; each title states a biology claim; failure messages print the measured value)

**Helpers:**
- `warm(seed, cfg)` = `new Cell({seed, start:'steady', ...cfg})` then 3,600 ticks.
- `twin(cell)` = `cell.fork()`.
- `avg(cell, ticks, fn)`.

**Seed sets are fixed:** A = [1..12]; B = [1..8]; C = [1, 2, 3, 4]. Steady-state claims use 8 h of warm-up and a 12 h average. Values in [brackets] are proto results.

### 14.1 Biology: acceptance criteria a–j

| id | claim | pass criterion [proto] |
|---|---|---|
| a1 | Switching a gene on: mRNA appears within seconds to a minute | fliC ×4 from off, set A: median `tx_start` ≤ 20 s [2]; median `first_mrna` 35–75 s [45]; no mRNA completes sooner than ℓ/(3·v_max) = 28.8 s after its initiation; `first_protein` − `first_mrna` ≤ 15 s [≈1, coupled translation]. fliC ×1: median `first_mrna` ≤ 120 s [50] |
| a2 | Protein rises over minutes | fliC ×4: protein made in 10 min / protein made in 60 min ≤ 0.2 [0.09]; made in 60 min 6×10⁴–1.3×10⁵ [8.9×10⁴] |
| a3 | Switching off: mRNA vanishes within minutes | fliC ×4 for 45 min, then off, set B: mean m(10 min)/m(0) in [0.05, 0.2] [0.099]; mean m(20 min) ≤ 2 molecules [1.1] |
| a4 | The protein persists and is diluted over generations | after off: the count never falls between divisions (k_deg = 0); each division ratio 0.47–0.53 [0.491–0.506]; concentration after 3·Td_ref (from 30 min post-off) in [0.11, 0.16] of its value [0.134–0.138] |
| a5 | Delays follow gene length (lac benchmarks) | lacZ ×4, set A: median first full-length mRNA 80–120 s after the command [98]; median first tetramer (4 monomers) 85–150 s [109]. Test comment MUST note: this is slower than Vogel & Jensen's 60–85 s (aerobic, fast growth, ≈40–50 nt/s), because transcription here runs at 3·v_run = 35 nt/s, the anaerobic, slower-growth speed (§18 item 6) |
| b1 | One mRNA yields tens of proteins | ptsG (b = 1) proteins per mRNA over 12 h: 25–55 [39.3]; rbs ×2 gives 1.8–2.1× [1.91–1.96] |
| b2 | One gene makes many mRNAs | ptsG ×1: ≥ 150 transcripts per generation [243]; mean mRNA 5–20 [10.2] |
| u1 | Promoter rates are per second (unit guard) | stub run (§19 step 3: E fixed at 0.9, no growth, no division, 4 h, set C): ptsG ×1 initiation rate × mean mRNA lifetime (260 s) gives mean mature mRNA 5–20 (expected by hand: 0.0283 × hin(0.9) 0.968 × g 1 × 260 ≈ 7), and the measured initiation rate is within 10% of `rRef_ptsG`·hin·g with `rRef_ptsG` = 1.7/60 /s. A build that forgets the /60 gets 0.3 /s (the cap) and a mean near 75, and fails |
| c1 | Protein keeps rising after transcription stops | fliC ×4 for 45 min, then off, set C: rise ≥ 5 min long; total rise 8–25% [12.5–17.2%]; set-C mean of rise ÷ (m_at_off × b × k_init,at_off × 260 s) in [0.6, 1.2] (§21 row 32). After a 10 h steady state the rise is 2–6% [3.5] (the UI shows it with `madeSinceOff`) |
| d1 | Doubling promoter strength roughly doubles steady-state protein | 2×/1× concentration ratio, set C, for fliC, ptsG, lacZ: each in [1.7, 2.15]; mean ≥ 1.75 [1.77–1.99] |
| d2 | Steady state = synthesis/removal | synthesis_perS/(λ·count) = 1 ± 0.07 for fliC ×1, ptsG, lacZ ×1 [0.97–1.02] |
| d3 | Adding degradation lowers the steady state as predicted | kdeg = λ_ref halves fliC ×1: ratio 0.43–0.57 [0.49–0.51] |
| e1 | Translation is the largest ATP expense of a growing cell (v1.1: with ptsG ×0.25 upkeep catches up, §21.1 row 8) | reference: translation is the largest category and ≥ 1.25× the next [40.9 vs 27.6; 1.48×]; transcription ≤ 6% [3.0]; total spend 7×10⁵–1.3×10⁶ /s [1.00×10⁶]. With fliC ×4 and with ptsG ×0.25, translation is still the largest [38.0, 37.6] |
| e2 | The ATP budget closes every tick | fermentation + floor − Σ spend − N_A·ΔE ≤ 1e−9·max(fermentation, Σspend, 1) on every tick of a 24 h run with random commands |
| e3 | Upkeep dominates when growth is blocked | cm dose 1: upkeep is the largest category |
| f1 | A useless protein slows growth | fliC ×1 (3.5% of proteome): −4 to −10% [−6.5]; ×4 (11.5%): −16 to −27% [−21.6] |
| f2 | Growth falls about linearly with the useless fraction | fliC fractions 3–40% (rate overrides; b up to 16 in the test only): slope 1.6–2.4 per unit fraction [1.89–2.08]; linear-fit R² ≥ 0.98 [≈10% slower per 5%] |
| f3 | Unneeded lac enzymes cost growth | lacY + lacZ ×1 without lactose (2.9%): −3 to −9% [−5.6] (Dekel & Alon −4.5% at 2.2%) |
| g1 | No glucose → no ATP → everything stalls (v1.1 criterion: §21.1 row 3) | glucose to 0: E < 0.3 within 5 s [0.004 at 5 s]; λ < 0.05 λ0 within 10 s [0]; while E < 1e−3, initiation rates < 1% of before; total mRNA ≤ 0.2 of before at 10 min [0.10]. **Stall window:** starts once E < 1e−3 has held for 60 consecutive ticks (so chains already in flight have finished) and lasts 20 min; over the window every player protein has \|ΔP_i\| < 1 molecule and every `pMade_i` rises by < 1. (Exact equality is not required: at the energy floor the odometer still creeps by about 1e−7 aa/s.) |
| g2 | Refeeding recovers with the proteins that already exist | after 20 min: E > 0.8 within 10 s [5 s]; λ ≥ 0.8 λ0 by 5 min [0.85] and ≥ 0.9 by 15 min [1.10] |
| g3 | Transporter death spiral (v1.1: E(6 h) ≥ 0.55, §21.1 row 4) | ptsG off, no backup: λ(1 h) ≥ 0.9 λ0 [1.01]; λ(6 h) ≤ 0.5 λ0 [0.28]; E(6 h) < 0.5 [0.14]; λ(20 h) ≤ 0.15 λ0 [0.07] |
| g4 | Recovery depends on how much transporter is left | time to 0.5 λ0 after ptsG back on: 20 h-off > 10 h-off > 6 h-off [2.08 > 1.43 > 0.70 h] |
| g5 | No transporter at all means no recovery (v1.1 criterion: §21.1 row 5) | ptsG knockout with initial protein 0, glucose 10. Window starts once E < 1e−3 has held for 60 ticks and lasts 24 h: E ≤ 1e−6 throughout; every player protein has \|ΔP_i\| < 1 molecule and every `pMade_i` rises by < 1 over the window |
| g6 | Bootstrapping threshold (priming) (v1.1: the threshold is gone, §21.1 row 6) | starve 20 min, then scale P_ptsG and P_gly by f before refeeding. With s0 = 0: f = 0.2 → no recovery in 4 h (E at floor); f = 0.5 → λ ≥ 0.8 λ0 within 30 min [0.97]. Lab s0 = 0.01: f = 0.15 recovers to ≥ 0.9 λ0 within 6 h [1.02 at 4 h] |
| g7 | Backup transporters match the ΔptsG phenotype | backupGlucoseUptake on, ptsG off, after 16 h: λ 0.10–0.18 /h [≈0.14; 0.111 at 1.5e5, 0.155 at 2e5] |
| g8 | Low glucose halves growth (the Low preset does something) and (v1.1) the charge stays ≥ 0.7 | glucose 0.005 mM (the UI's Low), 8 h settle then 12 h average, set C: λ between 0.35 and 0.65 of λ0 [0.47; Td 209 min, E 0.29]; `facts.glucoseLevel = 'low'` and `facts.growth = 'slow'` |
| h1 | Lactose needs both LacY and LacZ (v1.1 energy criterion: §21.1 row 9) | preinduced 4 h, then lactose only: Y+Z ×1 → Td 90–130 min [104], E > 0.8 [0.87]. The missing gene in each other arm is a **knockout with initial protein 0** (`genes.<id>.knockout: true, initial.protein: 0`), so no leak protein exists: Y only (lacZ knocked out), Z only (lacY knocked out), neither (both knocked out) → λ < 0.01 λ0 and E < 0.01 within 1 h [≈1e−9] |
| h2 | LacY without LacZ: lactose gets in but is not split | Y only (lacY ×1 preinduced, lacZ knockout with initial protein 0): Lin > 0.5 mM within 60 s [1.31 mM]; `flux.lactoseSplit` = 0 exactly (ZMax = 0); `facts.lactoseBlock = 'no-lacZ'`. Leak arm (lacZ left at its default "off", leak only, never switched on): cumulative lactoseSplit over the first hour < 1% of the Y+Z ×1 arm's, and `facts.lactoseBlock` is still `'no-lacZ'` |
| h3 | (replaced in v1.1 by h3/h3b/h3c, §21.1 row 10) a basal-lac cell cannot adapt to lactose alone without oxygen | uninduced cell in lactose only: λ < 0.01 λ0 after 10 h; `facts.lactoseBlock = 'no-lacY'` [LacY 6.4, LacZ 2.0 monomers]. Asserts the current behaviour and links §15 item 1 |
| h4 | Negative control: lactose outside does nothing without LacY | two cells, same seed, `start:'cold'`, lacY knockout with initial protein 0 (`genes.lacY: {knockout: true, initial: {protein: 0}}`), lactose 5 mM vs 0, glucose 10: after 20,000 ticks the **physics digests** (§6: hash without env, drugs and pending commands) are identical, and Lin stays exactly 0 on every tick of both runs [proto with a true knockout: identical]. The full `hash()` differs, because `env.lactose_mM` is hashed state; that is expected. (The v1.0 proto run that printed "identical? false" used warm cells with lacY merely "off", whose 1/1000 leak makes a few LacY; that is not a knockout.) |
| i1 | Rifampicin signature | total mRNA at 10 min ≤ 0.2 [0.10]; translation at 5 min ≥ 0.6 [0.84] and at 20 min ≤ 0.15 [0.08]; λ(5 min) > 0.5 λ0 [0.81]; an on-gene mid-rise keeps rising ≥ 3 min, then changes < 1% between 25 and 40 min [+29.5%, then flat]; ATP use at 5 min ≥ 0.8 [0.89] and at 20 min ≤ 0.5 [0.35] |
| i2 | Chloramphenicol signature | translation ≤ 0.03 of before from the next tick [0.020]; λ ≤ 0.05 λ0 [0.019]; mRNA at 10 min in [0.8, 1.2] [1.02] and at 40 min in [0.8, 1.3] (plateau) [1.01]; ATP use falls ≥ 40% within 1 tick [−67%; the model overshoots the ≈50% in the literature, disclosed]; E ≥ E_before [0.95] |
| i3 | The two drugs are distinguishable | at 5 min: mRNA(rif)/mRNA(cm) < 0.5 [0.32]; λ(rif) > 10 × λ(cm) [≈32×] |
| j1 | Growth and division | reference Td 90–105 min [97.7]; V at division / Vbirth in [1.9, 2.1]; Vbirth → 1.00 ± 0.05 fL |
| j2 | Each daughter gets about half | ≥ 60 divisions: mRNA kept fraction 0.45–0.55 [0.480]; variance / binomial 0.7–1.3 [0.99]; proteins > 1,000 copies: 0.47–0.53 |
| j3 | Division conserves molecules | before = kept + implied sister for every species (exact bookkeeping) |

### 14.2 Calibration and emergent-behaviour tests

| id | claim | pass [proto] |
|---|---|---|
| r1 | Reference ranges | E 0.85–0.93 [0.89]; ATP 2.5–3.5 mM [3.1]; ATP turnover 2–4 s [2.7]; v_run 10.5–13 [11.65]; active fraction 0.72–0.85 [0.786]; ribosomes 9,000–13,500 [11,230]; φ_R 8–11% [9.5]; total mRNA 2,000–3,500 [2,605]; proteins 2.5–3.3×10⁶ [2.9×10⁶]; glucose 10–16 mmol/gDW/h [12.6]; φ_Q 0.47–0.51 [0.484]; PtsG 8,000–20,000 [13,700]; k_init 0.12–0.18 /s [0.151] |
| r2 | Ribosome identity | aaPolymerised = R_elong·ΔD to 1e−12 relative every tick |
| r3 | Glycolytic flux is controlled by ATP demand (Koebmann 2002) | ptsG ×2: \|Δλ\| < 3% [−1.5]; ptsG ×0.5: λ lower by 5–30% [−10.8]; C_gly/F at reference 1.4–1.9 [1.6] |
| r4 | Amino-acid starvation slows ribosomes only partly | aaSyn off in minimal: λ(8 h) ≤ 0.6 λ0 [0.43]; v_run ≥ 6 aa/s throughout, and v_run(8 h) in [6, 10] [8.0]. Active fraction at ptsG ×0.25 is lower than at reference [0.64 vs 0.78] |
| r5 | Amino acids in the medium speed growth | aa 2 mM, aaImp ×4, aaSyn off: Td shortened 1.5–2.3× [1.96×; 49.7 min]; default settings: ≥ 1.05× [1.14×] |
| r6 | Natural expression sits near the growth optimum | ptsG, gly, aaSyn at ×2: Δλ ≤ +2% [−1.5, −7.1, −0.7]; at ×0.5: slower by ≥ 5% [−10.8, −16.6, −10.2] |
| L1 | Growth law 1: ribosome share rises with growth rate across nutrients | ≥ 6 conditions (reference; glucose 0.005 mM; ptsG ×0.25; lactose; aa medium in 4 settings): φ_R vs λ linear, r ≥ 0.95, slope 12–22% per h⁻¹ [16.0, r 0.997; points (0.199, 5.8) … (0.836, 16.3)]. v1.0 used glucose 0.02 mM, which moved λ by only 7% [(0.398, 9.1)] |
| L2 | Growth law 2: partial chloramphenicol lowers λ and raises the ribosome share | θ 0.1/0.2/0.3/0.45: λ strictly decreasing [0.404/0.377/0.353/0.310 /h]; φ_R strictly increasing [9.87/10.17/10.74/11.67%] |

### 14.3 Engineering tests

| id | test |
|---|---|
| m1 | Mass balance: on every non-division tick, (aaMade + aaImported)·dt − ΔAA − ΔM = 0 to 1e−9 relative. Holds with `setDegradation` too, because degraded residues are recycled into AA (§7.11); the fuzz run m2 checks m1 on every tick, including ticks with kdeg > 0 |
| m2 | Fuzz: 200 random command sequences × 6 h (all M1 command types, including `setDegradation`). Every tick: counts ≥ 0; E ∈ (0,1); AA > 0; Lin ≥ 0; R_free ≥ 0; no NaN; queue occupancy below capacity; m1 holds |
| n1 | detExp within 2 ulp of Math.exp on [−50, 5] (the test may use Math); dsqrt exact on perfect squares and within 1 ulp elsewhere; one uniform per Poisson call; `sortStrings` matches the code-unit ordering of a reference list (ASCII, mixed case, non-ASCII) |
| n2 | Convergence: K 4 vs 16 changes Td by < 1%; dt 2 with K 16 changes Td by < 2% and keeps E ∈ (0,1); config with h > 0.25 s throws |
| d-1 | Same (config, seed, log) gives the same hash after 20,000 ticks; a different seed gives a different hash |
| d-2 | A live run with 30 seeded random commands (including some that are rejected), replayed by `BTC.replay.verify`, matches every checkpoint (every 600 ticks); the replay's `command_applied` / `command_rejected` events equal the live run's in every field (tick, seq, cmdType, args, resolved, prev, code) |
| d-3 | Snapshot at tick 7,777 → JSON string → restore → continue matches the uninterrupted run; snapshot bytes round-trip exactly |
| d-4 | Golden hash for (steady preset, seed 1, fixed log, 10,000 ticks), pinned in tests/golden.json; it changes only with an ENGINE_VERSION bump; `tools/golden.html` prints it for manual checks on iPhone Safari, Android Chrome, Chromebook, and Windows/Mac Firefox |
| d-5 | Reset: `new Cell(cfg)` after any run hashes equal to a fresh one |
| d-6 | Hash coverage: perturbing any STATE_LAYOUT field changes the hash |
| d-7 | Preset freshness: re-deriving the preset gives the stored hash |
| d-8 | `fork()` twin plus one command: all other genes' tx streams stay aligned (same draw count per tick) |
| d-9 | Run records carry the preset: `runRecord().presetHash` equals `BTC.presets` hash; a record whose `presetHash` is altered is refused by `replay.run` with a `configHash` mismatch; a command with `−0` in its args logs `0`, and snapshot → JSON → restore gives the same `hash()` with that command still pending |
| d-10 | `locked` is user-only: with `flags.controls:'locked'`, a `'user'` setPromoter is rejected `locked`, while the same command from `config.schedule` applies |
| s1 | Forbidden-API lint on `src/engine/*` (§2.3) |
| b-1 | Each file loads through `require` and inside a `vm` context with only `self`, defining `BTC.x`; `@deps` headers match the `require` lists; `build-files.json` is a topological order |
| b-2 | The built bundle has no external `<script src>`; the build throws on a missing tag; the build uses a function replacer (a `$'` in the source survives) |
| b-3 | `docs/BIOLOGY.md` parameter table equals `tools/param-table.js` output |
| c-1 | Narrator text lint and rule reachability: implemented as LAB_UI tests U-3 (templates: one sentence, ≤ 140 characters, no digits, no exclamation mark, and the LAB_UI §7.3 teleology regex) and U-4 (every rule and every facts value reached by a scripted scenario). LAB_UI §7.3 is the single source of the regex |
| c-3 | View allocation: 1,000 consecutive `step()` + `observe()` calls leave every typed array in the view identical by reference (`===`) to the first call's, and `view.geneById[id] === view.genes[slot]` for every gene |
| c-2 | App lint: no assignments to `cell.*` or `view.*` in `src/app` |
| p1 | ≥ 40,000 ticks/s in Node on CI with every gene at ×4 [proto ≈130,000 at reference] |

---

## 15. Open items and decisions still needed

1. **Adapting to lactose from basal lac without oxygen.** The model predicts no adaptation (h3). Koch 1975 measured 25–65 min lags, but aerobically.
   - Decide before level 1.7: frame the level as glucose + lactose diauxie (glucose pays for building LacY and LacZ), add a small glycogen reserve, or add CRP/ppGpp reallocation.
   - MUST NOT be "fixed" by weakening upkeep, because that would break criterion g.
   - **Engine 1.1.0** took the CRP/ppGpp option (energy gates, §22.1; the lac promoter spared, §22.5). A glucose-grown m2-lac cell with a few basal LacY adapts after 125–146 min (12 seeds); growing cells' upkeep is unchanged. Still open: (a) LEVELS.md RT-2 asks 20–60 min; the lag here is set by 2 ATP per hexose (half the lactose growth rate needs most of the induced LacY, since upkeep takes ≈30% of the lactose supply) and by the first full lac mRNA taking 45–50 min at a charge near 0.12. Real single cells lag < 50 min to 3 h (Julou 2020); (b) a cell with no LacY never adapts, and the m2-lac preset is chosen to carry a few (§22.6); (c) a glycogen/RNA-turnover reserve holding starving cells near 0.5 (Chapman 1971) is the candidate for both, together with preferential lac initiation in the lag (Rickenberg 1955; Jacobson 1970). Decision for the instructor and the level designer: accept 2-h lags in level 1.7 (L phases ≥ 3·lagP90 ≈ 7 h under LEVELS.md §7.7.3), start L phases after both-sugar phases (lag 64–71 min), or ask for the reserve in a later engine.
2. **Values to verify before the spring release:**
   - UniProt lengths;
   - 7,336 aa per ribosome;
   - PtsG, LacY and FliC copy numbers and k_cat values (Schmidt 2016 supplement);
   - LacZ k_cat and K_m;
   - aa-synthesis sector size (Hui 2015; Mori 2021);
   - lactose doubling time;
   - C+D timing;
   - carbon per amino acid (0.8 derived vs 0.5 in the research).
3. **Glucose uptake** is 12.6 mmol/gDW/h against 13–18 measured, because energy spilling is not modelled. Do not tune k upward.
4. **Cross-engine determinism** must be confirmed with `tools/golden.html` on real iOS and ChromeOS devices before any server-side score verification.
5. **Amino-acid pool under blocked translation.** The pool keeps rising slowly (×7.7 after 1 h of Cm), bounded only by Hill-2 feedback. This is acceptable for M1. Add an efflux term if a level needs a bounded pool.

---

## 16. Judge corrections: where each is handled

| Correction | Where it is handled |
|---|---|
| maintenance re-sourced | §8: 5.6 mmol/gDW/h from Klamt's anaerobic value |
| c_o arithmetic | §9.2 |
| ATP ledger closure | §7.7, test e2 |
| A_tot and turnover | §8, §9 |
| Cm coupling plus a plateau bound on mRNA | §7.14, test i2 |
| Cm ATP-demand overshoot disclosed | i2; §18 item 7 |
| uptake below literature by design | §9, §15 |
| adder source; replication step is a placeholder | §8 |
| sqrt determinism | §4 `dsqrt` |
| lactose gap kept open | §15 |
| lengths to verify | §5.1, §15 |
| criterion-e margin | 1.48×; test e1 requires ≥ 1.25× |
| absorbing stall | seed s0, floor, `dormant` and `revived` events, test g6 |
| Cm frozen subset vs slowdown | §7.14: reversible-binding time average; running ribosomes reported at v_run |
| internal lactose pool | §7.7 |
| criterion c tested mid-rise | c1, `madeSinceOff` |
| 1/1000 leak plus a separate knockout | §5.1, §11.3 |
| dosage ripple | `lastCycle_min` shown in the UI |
| glycolytic optimum | r6 |
| prototype provenance | §17 |
| configHash and version in snapshots and run records; rejected commands logged with reason | §11 |
| carbon 0.8 vs 0.5 | §8 |

---

## 17. Calibration prototype (reference only; not for the repo)

**Path:** `/tmp/claude-0/-home-user-neuronsim/c3e829ef-58a1-5dea-bc5a-e887285e65bd/scratchpad/final/`
- `m.js`: the equations of §7 with the §8 values.
- `lib.js`, `scan.js`, `st.js`: reference state.
- Criteria scripts: `sa` (a1/a2/a5), `sb` (a3/a4/b), `sd` (d1/d2), `sf` (f and r6), `sg` (g1–g4), `sh` (h), `si` (i), `sl` (L1/L2/r4/r5/g7), `se` (e1), `sm` (a4/c1/d3/b1), `sk` (g6), `sc` (n2), `sj` (h4/d-1/j2/perf).

Every [bracketed] value in this document comes from these scripts in Node 22.

**Where the prototype differs from this spec** (the spec wins):
- JS arrays instead of typed rings;
- no molecule ids;
- Math.sqrt used at division;
- a single nascent array;
- no events or commands layer.

Its numbers are the acceptance targets that the production engine MUST reproduce within the §14 tolerances.

---

## 18. Known simplifications (copy into docs/BIOLOGY.md; short forms go in the student "About this cell" panel)

1. **Lab strain.** Each gene is on its own dial. There is no lac operon or regulation in M1. "Off" leaves a 1/1,000 leak; knockout removes the gene. The strain lacks the mannose PTS, so without PtsG no glucose gets in (the backup-transporter option reproduces the real ΔptsG growth rate).
2. **Lumped genes.**
   - The glucose-processing enzyme stands for about 10 glycolytic enzymes.
   - The amino-acid-making enzyme stands for about 100 genes; the importer for about 10.
   - The rest of the proteome is three sectors (R, Q, P) with simple rules: a ppGpp-like signal χ, Q held at 50% of synthesis, and P supplying amino-acid precursors.
3. **Environment.** Anaerobic, 37 °C. The medium never runs out and waste products do not build up.
4. **Energy.**
   - One energy charge stands for ATP, GTP and proton-motive force.
   - The yield is 2 ATP per glucose (fermentation teaching value; real mixed-acid fermentation gives 2–3).
   - Energy spilling is not modelled, so glucose uptake (≈12.6 mmol/gDW/h) is slightly below measured anaerobic values (13–18).
   - Upkeep uses an anaerobic non-growth value and falls when energy is short.
   - The ATP pool turns over in ≈2.7 s, somewhat slower than real cells (1–2 s).
   - Glycolysis needs a little ATP to start (priming). A small reserve (the seed) stands for PEP and other intermediates. Level 1.3 removes it.
5. **Amino acids** are one pool standing in for charged tRNA. The carbon cost (0.8 glucose per amino acid) is derived, not measured.
6. **Ribosomes and polymerase.**
   - Ribosomes assemble instantly. rRNA is made in step with ribosomal proteins, including under rifampicin.
   - RNA polymerase is never limiting.
   - Transcription speed is tied to translation speed (3 nt per amino acid), and ribosomes start on RNA still being made. At the reference state this gives 35 nt/s (3 × 11.65), slower than the ≈40–50 nt/s measured in fast aerobic growth; anaerobic, slower-growing cells elongate more slowly. So a new lacZ mRNA takes ≈90–100 s here, against 60–85 s in Vogel & Jensen's aerobic measurements (test a5).
   - A transcript is charged for its whole final tick.
7. **Drugs.**
   - Both act instantly, with no uptake or resistance.
   - Chloramphenicol binds reversibly: at any moment a fraction of ribosomes is stalled, running ribosomes keep their speed, and RNA polymerase slows by about a third (extrapolated).
   - Without energy spilling, the ATP charge rises under chloramphenicol. This is reported as "demand falls". The model's demand drop (−67%) is larger than the ≈50% in the literature, because other building work is tied to translation.
8. **mRNA** decays at first order with a single default half-life (3 min). Ribosomes already on a decayed mRNA finish their protein.
9. **Counting.** Only mRNA (and later LacI) is counted molecule by molecule. Protein numbers are averages given the random mRNA history.
10. **Cell size and cycle.** Cells add a fixed 1 fL per cycle whatever the medium (real cells are bigger in rich medium). One daughter is followed. Replication is a single dosage step at 1.4× birth volume, so the instantaneous growth rate ripples within each cycle; the clock shows the whole-cycle doubling time.
11. **Lactose** gives glucose plus galactose; the Leloir enzymes are assumed present. LacY needs the proton gradient, and each lactose costs about ⅓ ATP. There is no LacA.
12. **Flagellin** stays inside the cell. No flagellum is built and there is no swimming benefit.
13. **No death in the free-play lab**, only arrest and dormancy. Any time-to-death in later levels is a design choice, not a sourced value.
14. **Burden** comes from ribosome competition. The model reaches zero growth near 45–50% useless protein (Scott 2010). Gratuitous overexpression experiments stop growth near 30% because of extra toxicity (Dong 1995), which is not modelled.
15. **Unverified values** are flagged in the parameter table (§15 item 2).
16. **Always shown on screen:** the time compression, the molecules per dot for every species, and the "stands for ~N genes" badges.
17. **Protein degradation** (hidden until level 1.4) returns the amino acids to the pool; the ATP that proteases spend is not charged.
18. **ATP under carbon limitation** (v1.0 text; resolved in v1.1). With too little carbon the energy charge fell much further than in real cells (glucose Low: E ≈ 0.04 at 30 min, 0.28 at 4 h; a starved cell at the floor). Engine 1.1.0 gates demand by the charge (§22.1): Low glucose keeps E 0.73, a starving cell holds ≈0.1 for about an hour and runs down over hours. The gates respond to the charge only; real ppGpp and cAMP also respond to carbon flux, and real reserves (glycogen) are not modelled (BIOLOGY.md simplification 4).
19. **Lactose adaptation** (v1.1). A lab-strain cell switched to lactose with a few LacY and LacZ now pauses and adapts; the m2-lac wild type adapts after ≈2 h, longer than oxygen-breathing cells (§15 item 1). A cell with no LacY at all cannot start. The About sheet's v1.0 recipe ("×4 for an hour") is out of date.
20. **Diauxie.** In the lab strain the student sets the lac genes, so glucose and lactose can be used together. Strain m2-lac (level 1.7) has catabolite repression through CRP–cAMP (§22.5); inducer exclusion is off by default. BIOLOGY.md simplification 18 lists the lac operon's simplifications.
21. **Drug names.** The drugs are "rifampicin-type" and "chloramphenicol-type": each acts only as §7.14 describes (instant, no uptake, no resistance).

---

## 19. Build order for M0 → M1

1. `btc-math` (including `sortStrings`), `btc-prng`, hash and base64 → tests n1, s1.
2. `btc-params` (rRef stored in /s), `btc-catalog`, `btc-genome` (flat catalog only), `btc-queue` → tests b-1, b-3.
3. `btc-expression` with a stub metabolism (E fixed at 0.9) → u1 (unit guard, first), a1–a5, b1, c1, j2.
4. `btc-metabolism` (term table, MPE) and `btc-growth` → e, f, g, h, i, r, L, m1, m2, n2.
5. `btc-commands`, `btc-events`, log, snapshot, replay → d-1 to d-10.
6. `btc-observe` (facts schema 1.2), `btc-dots`, `btc-recorder`, `btc-narrate` → c-1, c-2, c-3 and LAB_UI U-3, U-4.
7. `tools/make-presets.js` → d-7; golden hash d-4; perf p1.
8. `build.js`, `serve.js`, `sw.js`, manifest → b-2; then the M1 UI (separate spec).

Nothing in §20 is built in M1.

**References:** the research brief's DOIs, plus:
- Weiße et al. 2015, 10.1073/pnas.1416533112
- Koebmann et al. 2002, 10.1128/jb.184.14.3909-3916.2002
- Scott et al. 2014, 10.15252/msb.20145379
- Hui et al. 2015, 10.15252/msb.20145697
- Burchard, Deleersnijder & Meister 2003, 10.1016/S0168-9274(03)00101-6
- Gaal et al. 1997, 10.1126/science.278.5346.2092
- Taheri-Araghi et al. 2015, 10.1016/j.cub.2014.12.009 (erratum; not retracted)

These are carried over from the proposals, where each was retrieved and checked.

---

## 20. Deferred to M1.x (not implemented now)

These items are **out of scope for the first student test**. M1 MUST NOT implement them beyond the reserved, inert data fields named here. They stay specified in this document so they can be built later without redesign. Each is built together with the level that first needs it.

| Item | Where it is specified | What M1 keeps |
|---|---|---|
| Watchers: `cell.watch`, `cell.unwatch`, the `watch` event | §11.2, §11.4 | **built in v1.1** (§22.7) |
| Marks: the `mark` command and `cell.ledgerSinceMark` | §11.2, §11.3 | snapshot field `marks: []`; `mark` is rejected `unknown-type` |
| `function_seen` event | §11.4 | **built in v1.1** |
| `variant.slotOrder` and the `variant` PRNG stream | §4, §11.1, §13.3 | v1.1: `config.variant` is opaque JSON (hashed, never read); `slotOrder` stays unbuilt (display order is UI; LEVELS.md §8.2) and the stream unused |
| The full genome-schema compiler (replicons, polycistronic TUs, operator sites, alleles, compartments) | §13.1 | v1.1 compiles polycistronic TUs and the lac regulation (§22.4); replicons, alleles and compartments stay unbuilt |
| `cell.runUntil(pred, maxTicks)` | §11.2 | – (tests use `advance`/`advanceTo` and loops) |
| `setRBS` and `setPromoter {rate_perS}` **in the UI** | §11.3 | the engine commands stay implemented and tested (b1, f2); the UI never offers them |

**Watch-path grammar** (for when watchers are built): `path := group '.' field | 'genes.' geneId '.' field`, where `group` is a view group (`energy`, `cell`, `clock`, `aminoAcids`, `lactose`, `ribosomes`, `flux`), `geneId` is a catalog id (never a slot number) and `field` names a numeric scalar in that object. Examples: `genes.lacZ.protein`, `energy.E`, `cell.lambda_perH`. It resolves through `view.geneById`.

**Tests deferred with these items:** none of the §14 tests depends on them. Tests for watchers, marks, `function_seen`, `variant` and the schema compiler are written when those items are built.

---

## 21. Changes from v1.0

Critique items are numbered in the order of `critique.json` (1–29). "Coordinator" marks a decision taken on top of the critique.

| # | Change | Where | Addresses |
|---|---|---|---|
| 1 | rRef is stored in btc-params in /s per copy (`value = rRef_perMin/60`); §5.1 and §7.3 formulas say so explicitly; §8 row updated; new unit-guard test u1 (stub run, mean mRNA 5–20) | §5.1, §7.3, §8, §14.1 u1, §19 | critique 1 (major, unit error); coordinator decision 1 |
| 2 | h4 rewritten: cold-start cells with a true lacY knockout (initial protein 0), compared by the new `cell.physicsDigest()` (excludes env, drugs, pending commands); asserts Lin ≡ 0. The v1.0 proto mismatch is explained (it used lacY "off", whose leak makes LacY) | §6, §11.2, §14.1 h4 | critique 2 (major); coordinator decision 3 |
| 3 | h1 and h2 use knockouts with initial protein 0 for the missing genes; h2 asserts lactoseSplit = 0 exactly, plus a leak arm with a < 1% tolerance; `lactoseBlock` defined as capacity below 1% of the reference-induced capacity (lacY_ref, lacZ_ref) | §8, §11.5, §14.1 h1–h3 | critique 3 (major); coordinator decision 3 |
| 4 | Glucose "Low" preset is 0.005 mM (was 0.05, which changed Td by 0.3%); new test g8 (λ 0.35–0.65 of λ0; proto 0.47); L1 uses 0.005 mM instead of 0.02 mM and its proto values are re-measured (slope 16.0, r 0.997) | §8, §14.1 g8, §14.2 L1 | critique 4 (major); coordinator decision 2 |
| 5 | `facts.uselessGene` keys on the current ribosome share (`genes[i].ribosomes / ribosomes.elongating` > 2%), not on proteome fraction | §11.5 | critique 5 (major); coordinator decision 4 |
| 6 | `facts.medium` and `facts.glucoseImport` added so the narrator's dormancy line fires only when glucose is outside and the transporters are missing (rule order itself is in LAB_UI §7.2) | §11.5 | critique 6 (major); coordinator decision 4 |
| 7 | New facts table: every value and threshold defined (energy 0.7/0.1, aa 0.5×10⁶/fL, growth 0.8·λ_ref and the arrest events, carbon 1% of F_ref = 5.8×10⁵ /s, lactose via 2·J_Z, glucoseLevel, drug cut-points, `aaOutside`); `energy_ok` defined (E > 0.45 after `energy_low`); reference constants added to btc-params | §8, §11.4, §11.5 | critique 7 (major); coordinator decision 4 |
| 8 | `command_applied` / `command_rejected` carry `{seq, cmdType, args, resolved, prev, code?}`; rejections at submission emit `command_rejected`; d-2 compares these events | §11.2, §11.4, §14.3 d-2 | critique 8 (major); coordinator decision 5 |
| 9 | Focus-polysome scale 1 → 10 above 400 ribosomes, recorded in the dots defaults (drawing rules are in LAB_UI §2.3) | §12 | critique 9 (major, UI) |
| 10 | Facts support the "switched on but no ATP" narrator rule (`energy = 'none'` with the gene still in the waiting phase); rule itself in LAB_UI §7.2 | §11.5 | critique 11 (major) |
| 11 | M1 scope trim: watchers/`watch()`, marks/`ledgerSinceMark`, `function_seen`, `variant.slotOrder`, the full genome-schema compiler, `runUntil`, and UI use of `setRBS`/`rate_perS` moved to the new §20; inert data fields kept; fork, snapshot, replay, run records, golden hash, presets, narrator facts, dots and Recorder stay in scope | §2.1, §4, §6, §11, §13, §19, §20 | critique 12 (major, scope); coordinator decision 10 |
| 12 | `BTC.math.sortStrings` (insertion sort on UTF-16 code units) added for canonical JSON; n1 tests it | §2.3, §4, §11.2, §14.3 n1 | critique 13 |
| 13 | Degraded protein residues are recycled into AA (`aaRecycled` flux), so m1 holds with `setDegradation`; m2 fuzz includes it; §18 item 17 discloses that proteolysis ATP is not charged | §7.11, §11.5, §14.3 m1/m2, §18 | critique 14 |
| 14 | g1 and g5: the stall window starts once E < 1e−3 has held for 60 ticks, and the assertions are \|ΔP_i\| < 1 and `pMade` increment < 1 instead of exact equality | §14.1 g1, g5 | critique 15; coordinator decision 3 |
| 15 | `view.geneById` added (same objects as `view.genes`); watch-path grammar `genes.<id>.<field>` specified in §20 | §11.5, §20 | critique 16; coordinator decision 6 |
| 16 | PRNG streams labelled by gene id only; "streams per slot" removed; slots never enter labels | §4, §7.3, §13.1 | critique 17 |
| 17 | `locked` rejection applies only to source `'user'`; new test d-10 | §11.3, §14.3 d-10 | critique 18 |
| 18 | `presetHash` folded into `configHash`, stored in snapshots and run records; numeric command args canonicalised with `x + 0`; new test d-9 | §11.1, §11.2, §11.3, §14.3 d-9 | critique 19 |
| 19 | a5 test comment and §18 item 6 disclose that transcription runs at 35 nt/s (anaerobic) against Vogel & Jensen's aerobic 60–85 s for lacZ | §14.1 a5, §18 | critique 20 |
| 20 | Recorder doubles `every` on each thinning and stores sample ticks | §12 | critique 24 |
| 21 | Narrator: LAB_UI §7 is authoritative; the §12 phrase list and priority summary are marked superseded; `facts.aaImportOn` added; facts schema 1.1 defined here; c-1 now points to LAB_UI U-3/U-4 and its single regex | §2.1, §11.5, §12, §14.3 c-1 | critique 25; coordinator decision 4 |
| 22 | View exposes fixed-capacity base arrays plus counts; no `subarray()` per `observe()`; new test c-3 | §11.5, §14.3 c-3 | critique 28 |
| 23 | `view.clock` notes that `lastCycle_min` is the displayed value when steady and gives the proto EMA ripple (±4%) | §11.5 | critique 23 (UI); coordinator decision 7 |
| 24 | Repo path `/home/user/be-the-cell-`, Pages base path `/be-the-cell-/`, all app URLs relative; `dist/` stays uncommitted | header, §2.1 | coordinator decisions 8 and 11 |
| 25 | Preset start rebases stored ticks (`birthTick`, episode ticks) when tick is reset to 0 (found while defining `justDivided`) | §11.1 | internal consistency |
| 26 | `R_free` uses `Rbusy`, the elongating count right after the previous tick's initiation (before its completions), as m.js does; `Rbusy` is hashed state. Reading §7.5 as "current Σ nSum" would free ≈400 more ribosomes per tick (≈17% of R_free) and move every calibrated number | §6, §7.5 | implementation (build steps 3–4): reproduces the proto calibration (Td 97.8 min, k_init 0.151, φ_R 9.5%) |
| 27 | A cohort merge sets the tail's D0 to the ribosome-weighted mean (nD0Sum += n·D). Keeping the old D0 (m.js) credits the merged ribosomes with up to 0.5 aa each that were never polymerised, which broke m1 by up to 8×10⁻⁹·M when translation nearly stalls (E ≈ 4×10⁻³). Merges never happen in normal growth, so no calibrated number changes | §7.5 | implementation; test m1 (now ≤ 5×10⁻¹⁶·M over 24 h of random commands) |
| 28 | The energy floor is applied after the substep fluxes are booked (as in m.js), so N_A·ΔE = fermentation + floor − Σ spend holds to round-off (test e2: ≤ 5×10⁻¹⁵ relative) | §7.7 | implementation |
| 29 | New parameter `rnapFootprint` = 35 nt: a gene copy holds at most ℓ/35 transcripts in progress (the Poisson draw is still made, then clamped). Without it the 512-entry nascent ring overflows within minutes when elongation stops but initiation does not (amino-acid starvation with aaSyn knocked out: v_run → 0 at E ≈ 0.97; a LAB_UI U-4 scenario). Never binds in normal growth (fliC ×4: ≈20 of 44) | §7.3, §8 | implementation; found by fuzz test m2 design |
| 30 | Division splits protein as n = floor(P) whole molecules plus half the fractional remainder each. With round(P) and a clamp, the sister's implied share went negative (−0.24 molecules) and the clamp broke conservation (test j3) | §7.12 | implementation; test j3 |
| 31 | A knockout in `config.genes` clears that gene's mRNA, transcripts in progress and ribosomes at construction (a strain that never had the gene). With `start:'steady'` the preset's ptsG mRNA would otherwise make ≈600 PtsG and hold E near 0.05, so the g5 window (E < 10⁻³) would never start | §11.3 | implementation; tests g5, h1, h2, h4 |
| 32 | c1's rise ÷ prediction is asserted on the set-C mean. The prediction omits ribosomes already on the mRNA at the switch (≈43 s of transit ÷ 260 s ≈ +17%), so single seeds reach 1.26 (m.js itself gives 1.03–1.20 with the actual k_init at the switch; its [0.64–0.80] used a constant 0.151 /s); set-C mean 1.04 | §14.1 c1 | implementation (measured) |
| 33 | Cell-cycle phase of `warm()`: the preset (cold start, seed 0, 120,000 ticks) ends at V = 1.28 fL, so `warm()` (+3,600 ticks) starts experiments at V ≈ 1.96 fL, just before a division, while m.js's warm cells started at 1.27 fL. Protocols that count protein over the next hour therefore read lower than the proto: a2 made in 60 min 6.7×10⁴ [8.9×10⁴] (range 6×10⁴–1.3×10⁵ still met). No tolerance was changed | §14 helpers | note (measured) |
| 34 | Log entries carry `submitTick`; for a command rejected at submission, `tick` is the tick it asked for (the event is still stamped with the submission tick). Replay resubmits every non-schedule entry at its `submitTick`, in seq order, so the pending queue and seq numbers, which are hashed, match at every checkpoint; without it a lesson command scheduled ahead, or a `tick-in-past` rejection, could not be replayed. Source `'schedule'` is reserved for `config.schedule`: `command()`/`schedule()` reject it with `bad-value`, and replay skips exactly the config's own entries (source `'schedule'`, seq below the schedule's length), so a rejected impostor is still replayed | §11.3, `btc-replay.js` | implementation (build step 5); tests d-2, d-3 |
| 35 | Snapshots gain a `scratch` field: the last tick's derived values, fluxes and ledger (§6 says they are in snapshots; the format line had no field for them), written as float64 bytes in base64 so they round-trip exactly | §11.2 | implementation; test d-3 compares the views |
| 36 | `start: Snapshot` is defined: the snapshot is a custom starting point handled like the preset (rebased to tick 0, reseeded, config applied), `presetHash = null`. `BTC.Cell.restore` is the way to continue a run | §11.1 | implementation (the spec named the option without defining it) |
| 37 | Event details the spec left open: detectors run at the end of the tick (after division), so events carry that tick; `energy_none` re-arms at E > 0.30 and `aa_low` at a > 1.0×10⁶/fL (twice its threshold); `growth_arrest`/`growth_resumed` use the per-tick λ; a gene switched on or off by `config.genes` opens its episode at tick 0; `first_mrna` compares the start tick of the newest transcript finished in the tick with the episode start (transcripts finish in order); on/off is the dial (level > 0 or rate override > 0) and not knocked out, so `off` (the leak) is off | §11.4, `btc-events.js` | implementation |
| 38 | Resolved and view form of a promoter level: `'off'`, a multiplier, or `null` while a per-second rate override is set (the rate is in `rate_perS`). The UI and narrator read on/off and up/down from it | §11.4, §11.5 | implementation |
| 39 | `geneState` for a gene that is on: `stalled` is checked first (E < 0.05 or min(1−ρ, 1−θ) < 0.1); `waiting` also covers an on gene with no mRNA and nothing in progress outside an episode (a gene on since the preset, between transcripts) | §11.5 | implementation |
| 40 | Tools: `tools/make-golden.js` writes `tests/golden.json` and the scenario block of `tools/golden.html`, and refuses to change the hash without an `ENGINE_VERSION` bump (`--force` overrides); `tools/make-presets.js` also writes `presets/m1-lab-glucose.json`. `tools/golden.html` loads `../src/engine/*.js`, so it runs from a checkout or any server of the repository root (`dist/` does not contain it) | §2.1, §14.3 d-4, d-7 | implementation |
| 41 | Shared-module details: `BTC.dots.pos(key, index, epoch, rect?, out?)` returns (u, v) in [0,1)² when `rect` is null, plus `hash01` (membrane positions) and `polysomeScale` (1 → 10 above 400, back below 320); Recorder channels are `{name, read(cell, view)}` with `BTC.Recorder.labChannels(cell)` for the 27 lab channels, and thinning keeps samples on multiples of the doubled interval; `BTC.narrate.createMemory({phrases, showNames, dt})` carries a default phrase table (the app passes `BTC.content.genes`) | §12 | implementation |

**Not applied in this document:** critique 26 ("commit `dist/index.html`") is rejected by coordinator decision 8. The published Pages site serves the single-file bundle as its `index.html`, so a student or instructor who needs the offline file saves that page (README explains how); committing a generated file would add a freshness check to every commit and a second copy that can drift from the source. The UI-only items (10, 21, 22, 27, 29 and the UI halves of 4, 5, 6, 9, 11, 23) are applied in LAB_UI.md v1.1.

### 21.1 Engine 1.1.0 (behaviour changes and the tests changed on purpose)

Engine 1.1.0 implements §22. Every test whose claim or number changed on purpose is listed here; the old criterion is in §14 and the new one in the test title (the test file prints the measured value).

| # | Change | Where | Why |
|---|---|---|---|
| 1 | `ENGINE_VERSION` 1.1.0, `STATE_SCHEMA` 2 (lac state, transcription units); presets and golden hash regenerated (golden `2a00ef8a0cbafc18`) | §22, d-4, d-7 | LEVELS.md R-E1 |
| 2 | Energy homeostasis: χ energy leg Hill 12 at 0.81 (was Hill 2 at 0.5); gates s_up, s_tx, s_el; basal upkeep share; rescue of paused ribosomes; `gI_basal` 0.2 → 0.1 with `k_on` 1.6×10⁻⁴ → 1.757×10⁻⁴ (reference k_init unchanged) | §22.1–22.3 | task 1: carbon-limited cells keep E high |
| 3 | g1: no longer "E < 1e−3, then a 20-min stall window at the floor". Now: E < 0.3 within 5 s, initiation < 1% of before after the first minute, and a 20-min window (10–30 min) with E in [0.05, 0.2] and no protein made | §14.1 g1 | the cell keeps a little charge (§22.1) |
| 4 | g3: E(6 h) < 0.5 → E(6 h) ≥ 0.55 (the charge stays up while growth spirals down) | §14.1 g3 | §22.1 |
| 5 | g5: "E ≤ 1e−6 for 24 h" → E < 0.15 at 1 h, < 0.01 at 24 h, never rising, every protein changing < 1% | §14.1 g5 | ATP now runs down over hours |
| 6 | g6: the priming threshold is gone. From E = 0 (set by the test), f = 0.2 restarts in 13 s without the seed and 6 s with it; asserted: slower without the seed, within 60 s | §14.1 g6, §15 | every large ATP user is gated, so supply wins from the floor |
| 7 | g8: adds E ≥ 0.7 (measured 0.73; v1.0 0.29) | §14.1 g8 | task 1(a) |
| 8 | e1: with ptsG ×0.25 upkeep (37%) now edges out translation (34%); asserted: upkeep share rises by > 5 points over the reference and the two lead | §14.1 e1 | homeostasis keeps upkeep at full rate while growth slows (Pirt) |
| 9 | h1: "E < 0.01 within 1 h" holds only for LacY-without-LacZ (lactose killing, Dykhuizen & Hartl 1978); Z-only and neither hold E in [0.05, 0.2] | §14.1 h1 | §22.1 |
| 10 | h3 (documented gap) replaced: h3 (m2-lac wild type adapts after 60–180 min, never dormant, set C), h3b (10× and 100× the lac proteins shorten the lag), h3c (the lab strain at its leak never adapts) | §14.1 h3 | task 2 |
| 11 | events test split: glucose removal gives `energy_low` and `growth_arrest` but no `energy_none` in 20 min; the `energy_none`/`dormant`/`revived` sequence is checked with `params.upkeepBasal` 0.03 (test-only faster drain) | §11.4 | §22.1 |
| 12 | facts schema 1.3 (`lacOperator`, `inducer`, `crp`; null without the module) | §11.5, §22.7 | LEVELS.md R-E16 |
| 13 | LAB_UI U-4 scenarios: the dormancy, `gene.noatp` and `lac.toofew` scenarios use `params.upkeepBasal` 0.03 (0.3 for `lac.toofew`, with lac ×1 for 5 min) so ATP runs out; new m2-lac scenario covers the facts 1.3 values. UI check P4: the ATP word under starvation is "low", not "very low" | LAB_UI §P4, U-4 | §22.1 |
| 14 | d-7 covers all six presets; p1 adds m2-lac (≥ 40,000 ticks/s) and a two-run 1.7 timing (≤ 2 s) | §14.3 | R-E2, R-E17 |
| 15 | Bundle budget 450 KB → 900 KB (warn 750 KB) in build.js and b-2, per LEVELS.md §2 | §14.3 b-2 | the level framework |
| 16 | RT-2 asserts the engine's lag (60–180 min on 12 seeds; measured 125–146), not LEVELS.md's 20–60 min; RT-1 "almost none" is checked on the seed-set mean (≤ 1%) with no seed above 2% (Is on lactose: one seed of four reaches 1.02%) | §22.8 | open item §15 item 1 |

---

## 22. Engine 1.1.0: energy homeostasis, the regulated lac operon and the level hooks

This section is normative for engine 1.1.0 and overrides §7 where they differ. The reference cell (§9) is unchanged: Td 98.1 min, E 0.896, φ_R 9.5%, χ 0.474, k_init 0.154 /s, glucose 12.5 mmol/gDW/h, upkeep 25.8% of spending.

### 22.1 Energy gates (ppGpp, hibernation and upkeep cuts as functions of the charge)

`hill(x, K, n) = xⁿ/(xⁿ + Kⁿ)` (`BTC.math.hill`, with `powInt`; 0 for x ≤ 0). At the start of the tick (§7.2), from e0:

```
χ_e  = hill(e0, K_chiE = 0.81, n_chiE = 12)          (was e0²/(e0²+0.5²); χ_ref stays 0.47)
s_up = hill(e0, K_up = 0.6, n_up = 12)                 regulated upkeep, σ_Q and σ_P, amino-acid synthesis
s_tx = hill(e0, K_tx = 0.45, n_tx = 8)                 unregulated player promoters
s_el = hill(e0, K_el = 0.3, n_el = 8)                  ribosome elongation, all promoter firing, basal initiation, rescue
```

The gates close in this order as E falls: χ (growth machinery, initiation), s_up, s_tx, s_el. Each is ≥ 0.99 at the reference charge, so the reference cell is unchanged.

- §7.3: `μ_i = g_copies · r_i · hin · rifF · s_el · dt`, with `g_copies = dosage · s_tx` for an unregulated unit and `k.lacTx` (§22.5) for the lac unit (the lac promoter is not gated by s_tx: cAMP–CRP is high exactly when carbon is short; Jacobson 1970).
- §7.4: `σ⁰_Q = k_M·m_Q*·rifF·s_up`, `σ⁰_P = β_P·g·f_P·rifF·s_up`.
- §7.5: `g_I = hin·(gI_basal·s_el + (1 − gI_basal)·χ)`, gI_basal = 0.1 (hibernation of idle ribosomes; Jacobson 1970: protein synthesis 10–15% of exponential in the diauxic lag), k_on = 1.757×10⁻⁴ so that k_init at the reference state is unchanged.
- §7.7, inside every substep, from the substep's e:
  ```
  s_E = hill(e, K_el, n_el) ;  s_U = hill(e, K_up, n_up)
  ṽ   = v_max·s_aa·s_E/(e+K_E)                                   // running ribosomes pause
  upkeep tilde = m_V·V/(e+K_m)·(upkeepBasal + (1 − upkeepBasal)·s_U)   // upkeepBasal = 2×10⁻⁴
  J̃_syn = min(Syn0·s_U·e/((e+K_E)·u), F̃/K_syn)                  // amino-acid synthesis stops with housekeeping
  ```
  The MPE form, the ledger identity and the positivity argument (§7.13) are unchanged: every new factor is a non-negative multiplier of an existing demand term, evaluated at the substep's start.

### 22.2 Rescue of paused ribosomes (§7.8b, after completions)

A ribosome paused by s_el on an mRNA that is cut up is released by trans-translation and its unfinished chain is broken down. Each tick, from every cohort of every unit, the share `(1 − hill(E, K_el, n_el))·(1 − e^{−k_M·dt})` is released: `aaRecycled += share·nascentAA`, `Rbusy −= share·nSum`, `k.rescued` records the count. Mass and the amino-acid balance are conserved (m1); the ATP already spent is lost. In a growing cell the share is ≈ 0.

### 22.3 LacY without energy (facilitated diffusion)

`Yp = YRaw·(sat(L_out) − sat(L_in))·K_E/(e+K_E)` when the outside is higher (no ATP; LacY in a de-energised cell lets lactose run down its gradient). It adds to `lactoseIn` and Lin, not to the transport ledger.

### 22.4 Transcription units (§13.1)

The genome compiler builds transcription units from `C.STRAINS[s].tus`. The leader (first cistron) owns the promoter, the nascent ring, the mature mRNA list and its decay; followers share them. Cistron i starts at `offset_i = Σ_{j<i} 3·L_j` nt; the unit's mRNA is `Σ 3·L_j + utr` nt (m2-lac: lacZ 0, lacY 3,072, lacA 4,323; 4,992 nt). A follower's translatable copies are the mature molecules plus the transcripts whose polymerase has passed its offset. Division halves leaders only. Promoter, knockout and half-life commands on a follower or a regulated unit are rejected `not-available` ("use config.design").

### 22.5 The lac regulation module (`btc-regulation.js`, strain m2-lac; LEVELS.md R-E13)

State (hashed): operator copies `op[2]` (1 = repressor bound; copy 1 exists after replication and starts in copy 0's state), allolactose `allo` (molecules), stream `op:lac` (exactly two uniforms per tick). Per tick, after the derived quantities:

```
I       = allo_µM + 1000·iptg_mM                                   (µM)
f_act   = Is ? 1 : 1 − hill(I, K_ind 1.3 µM, n_ind 2)               free repressor that can bind
release = Is ? 0 : hill(I, K_indOp 40 µM, n_ind)                    inducer reaching a bound repressor
T       = floor(P_lacI·activity/4)                                   whole tetramers (0 for 'deleted')
k_on    = operator ? T·f_act/tau_search : 0 ;  tau_search = 300 s (Elf 2007)
k_off   = k_off0 + k_rel·release ;  k_rel = 0.05 /s ;  k_off0 = (lacIRef/tau_search)·f/(1−f)
          f = (1/rep_lac − lacLeak)/(1 − lacLeak) ;  rep_lac = 1000 (Oehler 1990 ≈1,300×), lacLeak = 5×10⁻⁴ (Choi 2008)
for each copy slot c (always two draws): free → bound with 1−e^{−k_on dt}, bound → free with 1−e^{−k_off dt}
u       = (P_ptsG·activity·k_pts + uBasal·V)·sat(G)/V ;  cAMP = 1 − u/(u + K_crp) ;  K_crp = 1.3×10⁵ /s/fL
crpFactor = crpSite ? cAMP : 1 ;  exclusion = IEmax·u/(u+K_crp), IEmax = 0 (off)
k.lacTx = crpFactor·(free copies) + lacLeak·(bound copies)           replaces the dosage for the lac unit
after the fast pools: allo = (allo + f_allo·J_Z·dt)·e^{−k_h dt},  k_h = k_Z·P_lacZ·activity/(K_allo·N_mM·V)
```

The leak from a bound copy is not scaled by CRP (CRP also tightens the loop; Kuhlman 2007), so glucose lowers the induced level, not the repressed one. `inducerHalf_uM` (facts `inducer`) is the inducer level that frees half the operators at lacIRef tetramers (6.5 µM). IPTG is a medium field (`iptg_mM`, preset 1 mM) and enters at once.

**Design** (`config.design`, LEVELS.md R-E14; fixed for the run, folded into `configHash`, applied at tick 0 on top of the preset): `{lac: {promoter: 0.5|1|2|4, operator: bool, crpSite: bool}, lacI: {allele: 'wt'|'deleted'|'Is', promoter: 1|10}}`; missing fields take the wild-type defaults; anything else is a `ConfigError` (`bad-value` with the field's path; `not-available` for a strain without the module). `deleted` clears LacI protein, mRNA, transcripts and ribosomes; `Is` keeps LacI blind to inducer; `promoter` scales the unit's rate (`promoterScale`).

**Genes** (m2-lac, 9 slots): the lab strain's 7 (lacY and lacZ now cistrons of `tu_lac`, rRef `rRef_lac` = 1.6/min) plus lacI (slot 7, 360 aa, tetramer, `rRef_lacI` 0.05/min, b 0.1) and lacA (slot 8, 203 aa, trimer, b 0.5, role none). LEVELS.md R-E19 says "10 genes in m2-lac"; the strain has 9 (open question for the level designer).

### 22.6 Strains and presets (LEVELS.md R-E2, R-E5)

| preset | built by `tools/make-presets.js` |
|---|---|
| `m1-lab-glucose` | cold start, seed 0, 120,000 ticks |
| `m1-lab-glucose-birth` | the same, run on to just after its next division (V 1.000 fL, dosage 1) |
| `m2-lac-glucose` | cold start, seed 0, 120,000 ticks, then run on until the cell is between lac bursts (no lac mRNA, transcript or ribosome) with 2–6 LacY and 8–14 LacI tetramers: a typical glucose-grown cell (long-run means ≈3 LacY and ≈10 tetramers; Julou 2020 and Choi 2008: about half of glucose-grown cells carry a LacY). A cell without LacY cannot start on lactose alone in this model (BIOLOGY.md) |
| `m2-lac-glucose-birth` | the steady m2-lac cell run on to just after its next division |
| `m2-l11-glucose`, `…-birth` | the lab strain's presets transplanted into m2-l11 with araE empty (shared genes, streams and state copied by id) |

`start: 'birth'` loads `<strain>-glucose-birth`, reseeded like `'steady'`; its presetHash is folded into `configHash`. From birth, replication comes 48.3–48.5 min and division 97.5–97.9 min later. m2-l11 adds araE (slot 7, 472 aa, P0AE24, role none, lacY's rRef and RBS, default off). PRNG streams are labelled by gene id, so the shared genes' draws are those of m1-lab.

### 22.7 API additions (§11)

- **Config:** `strain: 'm1-lab'|'m2-l11'|'m2-lac'`; `start: 'birth'`; `design` (§22.5); `variant`: any JSON-safe object ≤ 2 KB as canonical JSON, keys sorted, folded into `configHash`, carried in snapshots and run records, never read by physics (R-E3; `variant.slotOrder` is not implemented); `flags.userGenes: [ids] | null` (user gene commands for other genes are rejected `locked`; lessons and the schedule are not restricted; R-E12); `genes.<id>.initial.clear: true` (clears the gene's mRNA, transcripts and ribosomes without a knockout; R-E6); `medium.iptg_mM`.
- **Commands:** `setControls {controls: 'locked'|'free'}` from source `'lesson'` or `'schedule'` only (a user submission is rejected `locked`); changes the hashed `controls`; logged and replayed (R-E11). `setMedium` accepts `iptg_mM`.
- **Methods:** `cell.watch({id?, field, op, value, gene?})` / `unwatch(id)` are implemented (edge-triggered `watch {id, value}` events; kept in snapshots, not hashed); LEVELS.md does not need them (§8.2). `BTC.replay.run(record, toTick, {attach(cell)})` calls `attach` once before the first step (R-E18).
- **Events:** `function_seen {gene}` as specified in §11.4 (role share ≥ 10% and ≥ 1,000 /s, lactose-split ≥ 500 lactose/s, 30 ticks, once per cell; never for role `none` or `lac-repressor`); its state is in the event state, so it survives restore (R-E4).
- **View:** `view.genes[i]` adds `mRNAMade`, `proteinMade`, `initiations` (cumulative; a unit's cistrons share mRNA counts; R-E8), `degraded_perS` (R-E10), `tu`, and `functionSeen` is live; `view.tus[]` = `{id, cistrons, mRNA, mRNAIds, nascent, leader}`; `view.lac` = `{operatorCopies, operatorBound, lacITetramers, lacIFree, allolactose, allolactose_mM, cAMP, crpFactor, inducer_uM, iptg_uM, activeLacI, promoterActivity, exclusion, inducerHalf_uM, design}` or `null` (R-E16); `view.env.iptg_mM`; `geneState` adds `'repressed'`.
- **Facts schema 1.3:** adds `lacOperator: 'bound'|'free'|'none'|null` (bound when any copy is bound; none without an operator), `inducer: 'none'|'some'|null` (some at or above `inducerHalf_uM`), `crp: 'low'|'high'|null` (cAMP below or above 0.5); all null without the module.

### 22.8 Tests added in engine 1.1.0

`tests/lac-operon.test.js`: RT-1…RT-6 (LEVELS.md §8.1; RT-2 with the engine's range, §21.1 row 16), the 1,000-fold repression and burst statistics, IPTG/Iq/Is, design validation and hashing, view and facts, determinism. `tests/level-engine.test.js`: R-E1, R-E2, R-E3, R-E4, R-E5/R-E19, R-E6, R-E7 (set C), R-E8/R-E9/R-E10, R-E11, R-E12, R-E18, watchers. `tests/golden.test.js`: d-7 for all presets, p1 for m2-lac and the 1.7 two-run timing (R-E17). `tests/lactose.test.js`: h3, h3b, h3c. `tests/narrate.test.js`: the m2-lac facts scenario.

### 22.9 Numbers (engine 1.0.0 → 1.1.0)

| | 1.0.0 | 1.1.0 |
|---|---|---|
| Reference: Td, E, φ_R, k_init | 97.8 min, 0.89, 9.5%, 0.151 | 98.1 min, 0.896, 9.5%, 0.154 |
| Low glucose 0.005 mM: λ/λ0, E | 0.47, 0.29 | 0.47–0.50, 0.73 |
| No glucose: E at 5 s / 10 s / 20 min | 0.004 / floor / floor | 0.22 / 0.19 / 0.11 (below 0.01 after ≈12 h) |
| Refeed after 20 min: E > 0.8, λ at 5 / 15 min | 5 s, 0.85 / 1.10 | 2 s, 0.91 / 1.01 |
| ptsG off (spiral): λ/λ0 at 1 / 6 / 20 h; E at 6 h | 1.01 / 0.28 / 0.07; 0.14 | 0.96 / 0.29 / 0.08; 0.64 |
| Recovery to 0.5 λ0 after 6 / 10 / 20 h off | 0.70 / 1.43 / 2.08 h | 0.73 / 1.26 / 2.61 h |
| m2-lac wild type, glucose → lactose: lag (LEVELS §7.7.5) | never | 125–146 min (12 seeds; p50 132, p90 143) |
| same, with 10× / 100× the basal lac proteins | – | 81 / 59 min |
| after 2 h in both sugars → lactose | – | 64–71 min (with CRP site); 0 min without it |
| no repressor, no CRP site | – | 0 min |
| RT-1 truth table (LacZ, % of induced; 4 seeds) | – | wt 0.01–0.5 / 53–70; ΔlacI and Oc 11–18 / 54–70; Is 0.01–0.5 / 0.1–1.0 |
| RT-4 re-repression; RT-5 glucose first; RT-6 burden | – | < 5% after 25 s; 0.13 (no site 1.09); 6.0% slower |
| R-E7 backup starving state; ptsG on | – | λ 0.35–0.37 λref, E 0.61; function_seen 6.7–10.3 min, 0.8 λref at 58–80 min |

## 23. Engine 1.1.1: observe-only fields for the close-ups (PROLOGUE.md §7)

A patch release: **no physics change**. The golden hash (`2a00ef8a0cbafc18`), every preset hash and
every calibrated number are 1.1.0's; `tests/observe-detail.test.js` pins `physicsDigest()` and `hash()`
of three scenarios to their 1.1.0 values, observed every tick or not (OB-3). L-11 compares the level
constants' engine version by major.minor, so a patch keeps the calibration.

| Addition | Definition |
|---|---|
| `view.genes[i].location` | the catalog's `'membrane'` or `'cytoplasm'` |
| `view.genes[i].length_aa`, `mRNA_nt` | L, and 3L + 60 (this gene's own message) |
| `view.genes[i].unit_nt`, `cistronOffset_nt` | the transcription unit's mRNA length, and where this gene starts on it |
| `view.genes[i].oligomer` | chains per working machine (LacZ 4, LacI 4, LacA 3) |
| `view.genes[i].tlCopies` | copies ribosomes could load in the last tick (mature + transcripts past this gene's start; §7.5) |
| `view.genes[i].tlStarts_perS` | ribosomes that started on this gene in the last tick, per s (`nBind·rbs·tlCopies/W / dt`, a per-tick scratch value set in `initiateTranslation`, kept in snapshots) |
| `view.genes[i].work_perS` | the protein's job flux: glucose through PtsG only (glucose-import), `hexoseToGlycolysis`, `aaMade`, `aaImported`, `lactoseIn`, `lactoseSplit`; 0 for `lac-repressor` and `none` |
| `view.genes[i].workPerCopy_perS` | `work_perS / (P·activity) × oligomer`, 0 below one copy |
| `view.flux.glucoseInPtsG`, `glucoseInSide` | `glucoseIn` split by the shares of the last tick's import capacity U (PtsG·k_pts vs uBasal·V) |
| `view.ribosomes.odometer_aa` | the ribosome odometer D |
| `view.lac.inducerShare` | 1 − activeLacI / lacITetramers (0 without LacI) |
| `cell.detail(geneId, out)` | fills `out.ribosomeProgress` (Float64Array, 16 bins) with the gene's ribosomes by chain progress (D − D0)/L from its cohort queue; allocation-free with `out`; pure read |

Snapshot scratch gains two numbers per gene (`tlCopies`, `tlStarts`), so a restored cell's view shows
the same last-tick values (test d-3).
