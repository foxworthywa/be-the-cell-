# BIOLOGY.md — biological constraints the simulation must respect

These are treated as immutable. Any change to `src/engine` must keep every statement below
true, and `npm test` checks most of them (the test ids are listed under "Acceptance
behaviours"; the full criteria are in `docs/ENGINE.md` §14). Numbers in parentheses are model
values for the reference cell (the lab strain in 10 mM glucose, default dials, engine 1.0.0)
unless a source is named.

The simulated cell is an E. coli-like lab strain growing without oxygen at 37 °C. It is
engineered, and students are told so: every gene sits on its own switchable promoter, and the
mannose uptake system is deleted (ΔmanXYZ), so PtsG is the only way glucose gets in.

## The cell

- One rod-shaped cell, born at about 1 fL and dividing at about 2 fL (born at 1.00 fL; mean
  1.43 fL; about 2.9 million proteins).
- Most of the proteome is housekeeping and metabolism, not the genes on screen: housekeeping
  (sector Q) ≈ 48%, other metabolism (P) ≈ 32%, ribosomes (R) ≈ 9.5%; the 7 player genes share
  the rest. Measured housekeeping share: 45–55% (Scott 2010).
- Each gene is present in one copy until replication, then two (a single dosage step at 1.4×
  birth volume).
- Without oxygen, glucose is fermented: 2 ATP per glucose (real mixed-acid fermentation gives
  2–3).

## DNA → RNA: transcription

- A gene is transcribed only when switched on. "Off" leaves a leak of 1/1,000 of the ×1 rate
  (generalised from the ≈ 1,300-fold repression of the lac operon; Oehler 1990); a knockout
  makes nothing.
- Transcription starts at random moments, at a rate set by the promoter.
- An mRNA exists only once RNA polymerase has copied the whole gene, so longer genes take
  longer (35 nt/s here: flagellin mRNA ≈ 45 s, lacZ ≈ 90 s).
- Transcription uses ATP (2 ATP per nucleotide) and stops when ATP is gone.
- Rifampicin blocks the start of transcription; transcripts already in progress finish.

## mRNA

- mRNA is made and counted one molecule at a time.
- Each mRNA decays at a random moment, with a half-life of about 3 min (180 s; mean lifetime
  260 s). When transcription stops, mRNA falls to about a tenth within 10 min.
- One gene makes many mRNAs (the transporter gene at ×1: about 250 per generation, about 10 at
  any moment).
- In bacteria, ribosomes start on mRNA that is still being made, so protein follows its mRNA
  within seconds.

## RNA → protein: translation

- One mRNA is read by many ribosomes before it decays (≈ 39 proteins per mRNA at the default
  ribosome-binding strength; literature 20–40). Doubling the binding strength roughly doubles
  it.
- All genes share one pool of ribosomes. A ribosome busy on one mRNA is not available to any
  other; this is where the cost of an unneeded protein comes from.
- Each amino acid added costs 4 ATP (ATP and GTP are lumped). Ribosomes run at ≈ 11.6 amino
  acids per second, slow when amino acids or ATP run short, and stop when ATP is gone.
- Ribosomes already on an mRNA that decays finish their protein.
- Chloramphenicol stalls ribosomes where they are; the mRNA stays.

## Proteins

- Proteins come only from translation. There is no other way to make a transporter or an
  enzyme.
- Each player protein has one job: PtsG carries glucose in, the glucose-processing enzymes
  ferment it, LacY carries lactose in, LacZ (active as a tetramer) splits it, and the
  amino-acid enzymes and importers supply amino acids. Flagellin does no work here: the other
  flagellum genes are missing, so no flagellum is built and it stays inside the cell.
- In the lab, proteins are not degraded. Their concentration falls only by dilution: the count
  never drops between divisions and is split in two at each division.
- At steady state, synthesis equals removal, so doubling a promoter roughly doubles its
  protein, and adding degradation lowers the level as synthesis ÷ (growth rate + degradation
  rate) predicts.

## Energy

- ATP comes only from protein machines: glucose (or lactose) has to be brought in and broken
  down by proteins the cell has already made.
- The ATP pool is small and turns over fast (≈ 3.1 mM, replaced every ≈ 2.7 s; real cells: 1–2
  s). With no sugar coming in, ATP runs out within seconds and everything that uses ATP stops,
  including making new transporters and enzymes.
- Recovery after refeeding runs on the proteins that already exist. A cell that has lost its
  transporters recovers slowly, and one with none at all never recovers.
- Glycolysis uses a little ATP before it makes any (the transporter uses PEP, and
  phosphofructokinase uses ATP), so a cell with too few enzymes cannot restart.
- Glycolytic flux is set by ATP demand, not by supply (Koebmann 2002): extra transporters
  barely change growth, fewer slow it.
- Making protein is the largest cost of growing (≈ 41% of ATP; about half in the literature,
  Li 2014). Making RNA is small (≈ 3%). When growth is blocked, upkeep becomes the largest cost.
- The energy charge of a growing cell stays high (≈ 0.89; measured > 0.9, Bennett 2009).

## Amino acids

- Amino acids are either made by enzymes, from sugar and ATP, or imported from the medium at 1
  ATP each. Importing spares the cost of making them, so amino acids in the medium speed growth.
- Amino-acid synthesis is slowed by its own product (feedback inhibition).
- When amino acids run short, ribosomes slow down but do not stop.

## Growth and division

- Growth is protein synthesis: the growth rate is the rate at which amino acids are
  polymerised, divided by the protein mass.
- The cell divides after adding a fixed volume (about 1 fL; the "adder", Taheri-Araghi 2015),
  and one daughter is followed.
- At division every molecule goes to one daughter or the other. mRNA molecules are split at
  random (binomially), and nothing is created or lost.
- An unneeded protein slows growth in proportion to its share of the proteome (≈ 2% slower per
  1%; lac enzymes without lactose: −4.5% at 2.2%, Dekel & Alon 2005).
- Natural expression of the genes the cell uses sits near the growth optimum: doubling them
  gains nothing, halving them costs growth.
- The bacterial growth laws hold without being programmed in: across nutrients, the ribosome
  share rises linearly with growth rate; partial chloramphenicol lowers growth and raises the
  ribosome share (Scott 2010).

## Lactose

- Lactose needs LacY to get in (a third of an ATP per lactose, through the proton gradient)
  and LacZ to be split into glucose and galactose. Without either protein, lactose gives no
  energy.
- Lactose outside a cell with no LacY changes nothing inside it.
- Switching a cell from glucose to lactose needs enough LacY and LacZ already made. LacY
  import needs ATP, so a cell with too little of them runs out of ATP and stops: ×1 for 30 min
  before removing glucose stops on every seed tested; ×4 for 45 min or more (or ×1 for two
  hours) keeps growing (8 of 8 seeds). Real E. coli adapts after a lag instead (open item 1).
  Adding glucose back restarts a stopped cell within about 5 min; the narrator's line for the
  stopped cell is "Lactose is outside, but there is too little LacY and LacZ to keep ATP up, so
  the cell has stopped."

## Drugs

- Rifampicin (blocks RNA polymerase): no new mRNA; existing mRNA is read until it decays, so
  protein synthesis winds down over about 20 min and growth continues for a while.
- Chloramphenicol (stalls ribosomes): protein synthesis stops at once, the mRNA stays, ATP
  demand falls and the energy charge rises.
- The two are told apart by their mRNA: rifampicin removes it, chloramphenicol leaves it.

## Acceptance behaviours

These are the behaviours the M1 engine has to show (`docs/ENGINE.md` §14.1, criteria a–j). Each
line gives the test id, the claim in plain language and what engine 1.0.0 measures today. Seed
sets: A = 12 seeds, B = 8, C = 4. Steady states are an 8 h settle followed by a 12 h average.

**a. Switching genes on and off** (`tests/expression.test.js`, `tests/offswitch.test.js`)
- **a1** A gene switched on gives mRNA within a minute and protein right behind it. (Flagellin
  ×4: first mRNA after 45 s, median of set A; protein in the same second.)
- **a2** The protein then rises over tens of minutes, not seconds. (10% of the first hour's
  protein is made in the first 10 min.)
- **a3** Switched off, the mRNA vanishes within minutes. (A tenth left at 10 min; fewer than
  one molecule at 20 min.)
- **a4** The protein stays and is diluted by growth. (It never falls between divisions; each
  division keeps 0.49–0.51 of it; after three doubling times about 13% of the concentration is
  left.)
- **a5** Delays follow gene length. (lacZ ×4: first mRNA after 92 s and first tetramer after
  100 s. Aerobic, fast-growing cells take 60–85 s (Vogel & Jensen); transcription here runs at
  the slower anaerobic speed.)

**b. Many copies** (`tests/expression.test.js`)
- **b1** One mRNA yields tens of proteins. (39 per mRNA; twice the binding strength gives 1.9–2.0
  times as many.)
- **b2** One gene makes many mRNAs. (Transporter gene at ×1: 260 per generation; 10.5 at a time.)
- **u1** Unit guard: promoter rates are per second, so the transporter gene at ×1 keeps about 7
  mature mRNAs in a cell held at fixed energy. (7.3.)

**c. Protein keeps rising after transcription stops** (`tests/offswitch.test.js`)
- **c1** After a switch-off the protein rises for minutes more, by the amount the remaining mRNA
  predicts. (Rise of 11–16%; measured ÷ predicted averages 1.06.)

**d. Steady state = synthesis ÷ removal** (`tests/steady.test.js`)
- **d1** Doubling a promoter roughly doubles the steady-state protein. (1.84–1.99 for flagellin,
  the transporter and LacZ.)
- **d2** At steady state, synthesis equals dilution. (Synthesis ÷ (growth rate × count) =
  0.99–1.04.)
- **d3** Degradation at the growth rate halves the steady state. (0.49–0.50.)

**e. Energy budget** (`tests/energy.test.js`)
- **e1** Making protein is the largest ATP cost of a growing cell. (41% against 28% for other
  building; still the largest with flagellin ×4 or the transporter at ×¼.)
- **e2** The ATP books balance on every tick of a 24 h run with random commands. (Worst
  imbalance 5 × 10⁻¹⁵ of the flux.)
- **e3** When chloramphenicol blocks growth, upkeep is the largest cost. (87%.)

**f. Burden** (`tests/burden.test.js`)
- **f1** A useless protein slows growth. (Flagellin ×1, 3.5% of the proteome: −6.5%; ×4, 11%:
  −21%.)
- **f2** Growth falls about linearly with the useless fraction, from 3% to 40%. (Slope 2.05;
  R² 0.999.)
- **f3** Lac enzymes made without lactose cost growth like any useless protein. (−5.6% at 3.0%.)

**g. Glucose, ATP and recovery** (`tests/glucose.test.js`)
- **g1** No glucose → no ATP → everything stalls. (Energy charge below 0.3 after 3 s; growth
  below 5% after 6 s; mRNA at a tenth after 10 min; then no protein made for 20 min.)
- **g2** Refeeding recovers with the proteins that already exist. (Energy charge above 0.8 after
  5 s; growth back to 90% by 5 min.)
- **g3** Without new transporter the cell spirals down as PtsG is diluted. (Growth 99% at 1 h,
  27% at 6 h, 8% at 20 h.)
- **g4** The longer the wait, the slower the recovery. (Time to half speed: 0.7 h after 6 h off,
  1.2 h after 10 h, 2.7 h after 20 h.)
- **g5** With no transporter at all there is no recovery: ATP stays at the floor and nothing is
  made for 24 h.
- **g6** Glycolysis needs a little ATP to start. (After 20 min without glucose, a cell left with
  20% of its transporters and enzymes never restarts without the priming reserve, and one with
  50% does; with the reserve, even 15% restarts.)
- **g7** The backup-transporter option gives the growth rate of a real ΔptsG strain. (0.135 per
  hour; target 0.10–0.18.)
- **g8** Low glucose (0.005 mM) about halves growth. (0.46–0.50 of the reference; doubling time
  203 min.)

**h. Lactose** (`tests/lactose.test.js`)
- **h1** Lactose supports growth only with both LacY and LacZ. (Both: doubling time 104 min;
  either one missing: ATP gone within an hour.)
- **h2** With LacY but no LacZ, lactose gets in but is not split. (1.5 mM inside after 60 s;
  none split.)
- **h3** Documented gap: a cell with only the leak amount of lac proteins cannot adapt to
  lactose alone without oxygen (see "Open items").
- **h4** Negative control: lactose outside a cell with no LacY leaves its physics bit-for-bit
  unchanged.

**i. Drugs** (`tests/drugs.test.js`)
- **i1** Rifampicin: mRNA at a tenth after 10 min, translation winding down over 20 min, a
  protein that was rising keeps rising briefly, then levels off.
- **i2** Chloramphenicol: translation at 2% from the next second, mRNA stays (0.95–0.96 at
  10–40 min), ATP use falls by two thirds, energy charge rises (0.89 → 0.96).
- **i3** The two are distinguishable at 5 min. (mRNA under rifampicin is a third of that under
  chloramphenicol; growth is 30 times faster.)

**j. Growth and division** (`tests/growth.test.js`)
- **j1** The reference cell doubles in about 98 min, divides at twice its birth volume and is
  born at about 1 fL. (97.8 min; 2.00; 1.00 fL.)
- **j2** Each daughter gets about half of every molecule, with binomial scatter. (mRNA kept
  0.487 over 60 divisions; variance 1.08 × binomial.)
- **j3** Division conserves molecules exactly.

**Calibration and emergent behaviour** (`tests/growth.test.js`, `tests/optimum.test.js`)
- **r1** The reference cell sits inside measured ranges for energy charge, ATP, ribosomes,
  mRNA, protein count, glucose uptake and the housekeeping share.
- **r3** Glycolytic flux is controlled by ATP demand. (Transporter ×2: −1.3%; ×0.5: −10.5%.)
- **r4** Starved of amino acids, ribosomes slow only partly. (Amino-acid enzymes off in plain
  glucose: growth about 44% after 8 h, ribosomes at 8.0 amino acids/s.)
- **r5** Amino acids in the medium speed growth. (Importers ×4, synthesis off: doubling time
  halved, to 49 min.)
- **r6** Natural expression sits near the growth optimum. (×2 gains nothing; ×0.5 costs 9.5–16%.)
- **L1** Growth law 1: across 8 nutrient conditions the ribosome share rises linearly with
  growth rate. (6.0% at 0.21 per hour to 16.4% at 0.85 per hour; r = 0.997.)
- **L2** Growth law 2: partial chloramphenicol lowers growth and raises the ribosome share.
  (Growth 0.40 → 0.31 per hour; ribosome share 9.8% → 11.7%.)

Engineering tests (determinism, replay, mass balance, fuzzing, build checks) are listed in
`docs/ENGINE.md` §14.3.

## Known simplifications

Each item gives the short form for students first (the lab's "About this cell" sheet carries
short forms like these), then the detail for instructors.

1. **Lab strain.** *"Each gene here has its own switch, and you set it; real cells switch genes
   with regulator proteins that sense conditions."* Also: *"Real E. coli keeps its lac genes
   nearly off while glucose is present; here you control them."* and *"'Off' still leaks a
   little, so a switched-off gene makes a few proteins."* and *"This strain has no second
   glucose transporter."*
   There is no lac operon and no regulation in M1. "Off" leaves a 1/1,000 leak; a knockout
   removes the gene (engine only; not offered in the lab). The strain lacks the mannose uptake
   system, so without PtsG no glucose gets in. A backup-transporter option (engine config only
   in M1) reproduces the real ΔptsG growth rate.
2. **Lumped genes.** *"Some genes stand for many: the glucose-processing card for about 10
   genes, the amino-acid-making card for about 100."*
   The importer card stands for about 10 genes. The rest of the proteome is three sectors with
   simple rules: ribosomes (R), made in proportion to a ppGpp-like signal; housekeeping (Q),
   held at 50% of synthesis; and other metabolism (P), which also supplies the precursors for
   amino-acid synthesis.
3. **Environment.** *"The flask has no oxygen, the medium never runs out, and waste does not
   build up."*
   Anaerobic, 37 °C.
4. **Energy.** *"One energy gauge stands for ATP, GTP and the proton gradient, and each glucose
   gives 2 ATP."*
   - The yield is the fermentation teaching value; real mixed-acid fermentation gives 2–3.
   - Energy spilling is not modelled, so glucose uptake (≈ 12.6 mmol/gDW/h) is slightly below
     measured anaerobic values (13–18).
   - Upkeep uses an anaerobic non-growth value and falls when energy is short.
   - The ATP pool turns over in ≈ 2.7 s, somewhat slower than in real cells (1–2 s).
   - Glycolysis needs a little ATP to start (priming). A small reserve, the seed, stands for PEP
     and other intermediates. Level 1.3 removes it.
   - *"ATP falls further here than in real cells, which keep some ATP from stored reserves and
     slow their ribosomes instead."* When carbon is short the charge drops far lower than in
     real carbon-limited E. coli (glucose Low: E ≈ 0.04 at 30 min, 0.12 at 2 h, 0.28 at 4 h,
     at about half the normal growth rate). A starved cell sits at the E floor, 3.5·10⁻⁹ mM of
     ATP, which the graphs show as "< 0.01 mM". For spring: make translation demand give way to
     low E sooner, with a test that low glucose keeps E > 0.6 (without breaking the g tests).
5. **Amino acids.** *"All twenty amino acids are treated as one pool."*
   The pool stands in for charged tRNA. Its carbon cost (0.8 glucose per amino acid) is derived,
   not measured.
6. **Ribosomes and polymerase.** *"Ribosomes are assembled instantly, and RNA polymerase never
   runs short."*
   - rRNA is made in step with ribosomal proteins, including under rifampicin.
   - Transcription speed is tied to translation speed (3 nt per amino acid), and ribosomes start
     on RNA still being made. At the reference state this gives 35 nt/s (3 × 11.65), slower
     than the ≈ 40–50 nt/s measured in fast aerobic growth; anaerobic, slower-growing cells
     elongate more slowly. A new lacZ mRNA therefore takes ≈ 90–100 s here, against 60–85 s in
     Vogel & Jensen's aerobic measurements (test a5).
   - A transcript is charged for its whole final tick.
7. **Drugs.** *"Drugs act instantly, with no uptake and no resistance; otherwise each acts as
   rifampicin or chloramphenicol does."* The controls are labelled "Rifampicin-type" and
   "Chloramphenicol-type"; the badges and narrator use the plain names.
   - Chloramphenicol binds reversibly: at any moment a fraction of ribosomes is stalled, running
     ribosomes keep their speed, and RNA polymerase slows by about a third (extrapolated).
   - Without energy spilling, the energy charge rises under chloramphenicol; this is reported as
     "demand falls". The model's drop in demand (−67%) is larger than the ≈ 50% in the
     literature, because other building work is tied to translation.
8. **mRNA.** *"Every mRNA has the same half-life here, about 3 minutes."*
   Decay is first-order with a single default half-life. Ribosomes already on a decayed mRNA
   finish their protein.
9. **Counting.** *"Each mRNA is counted one by one; protein numbers are averages."*
   Only mRNA (and, in later levels, the repressor LacI) is counted molecule by molecule. Protein
   numbers are averages given the random mRNA history.
10. **Cell size and cycle.** *"The cell adds the same volume every cycle, and only one daughter
    is followed."*
    Cells add a fixed 1 fL per cycle whatever the medium (real cells are bigger in rich medium).
    Replication is a single dosage step at 1.4× birth volume, so the instantaneous growth rate
    ripples within each cycle; the clock shows the whole-cycle doubling time.
11. **Lactose.** *"LacZ splits lactose into glucose and galactose; the enzymes that use
    galactose are assumed present."*
    LacY runs on the proton gradient, and each lactose costs about ⅓ ATP. There is no LacA.
12. **Flagellin.** *"Flagellin stays inside the cell: no flagellum is built, and the cell does
    not swim."* The card says: *"Many flagellin molecules form the flagellum a cell swims with;
    the other flagellum genes are missing here, so it stays inside."*
13. **No death.** *"Cells in this lab stop growing but do not die."*
    There is only arrest and dormancy. Any time-to-death in later levels is a design choice, not
    a sourced value.
14. **Burden.** *"An unneeded protein slows growth because it keeps ribosomes busy; any extra
    toxicity is left out."*
    The model reaches zero growth near 45–50% useless protein (Scott 2010). Gratuitous
    overexpression experiments stop growth near 30% because of extra toxicity (Dong 1995), which
    is not modelled.
15. **Unverified values.** *"Some numbers are estimates; each one is flagged with its source in
    the parameter table."*
    See "Open items" and the confidence codes below.
16. **Always on screen.** *"The speed, the molecules per dot and the "stands for" badges are
    always on screen."*
    The time compression, the molecules per dot for every species and the "stands for ~N genes"
    badges are never hidden.
17. **Protein degradation** (hidden until level 1.4). *"Proteins that are broken down return
    their amino acids to the pool."*
    The ATP that proteases spend is not charged. In M1 no protein is degraded.

## Open items and values to verify

1. **Adapting to lactose without oxygen** (test h3). The model predicts that a cell with only
   the leak amount of LacY and LacZ never adapts to lactose alone; Koch 1975 measured 25–65 min
   lags, but aerobically. Decide before level 1.7: frame the level as glucose + lactose diauxie
   (glucose pays for building LacY and LacZ), add a small glycogen reserve, or add CRP/ppGpp
   reallocation. It must not be "fixed" by weakening upkeep, because that would break the g
   tests. The same gap shows in the free lab: a partly induced cell (LacY and LacZ ×1 for
   30–60 min) moved to lactose alone runs out of ATP and stops, because LacY import falls with
   the charge and the fall feeds itself; there is no slow-growth middle ground. Until then the
   lab's About sheet says: "In this model, set LacY and LacZ to ×4 with glucose present and wait
   an hour before removing glucose; with fewer, ATP runs out." and "Real E. coli adapts to
   lactose after a lag; this model does not. Adding glucose back restarts a cell whose ATP has
   run out." The narrator's `lac.toofew` line names the cause. For spring, take one of the
   options above (a glycogen reserve, or ppGpp-like demand cuts) so that a partly induced cell
   grows slowly instead of stopping.
2. **Values to verify before the spring release:**
   - protein lengths against UniProt E. coli K-12 (PtsG P69786, GapA P0A9B2, LacY P02920, LacZ
     P00722, FliC P04949);
   - 7,336 amino acids per ribosome (the sum of the r-protein sequences);
   - PtsG, LacY and FliC copy numbers and turnover numbers (Schmidt 2016 supplement);
   - LacZ turnover number and K_m;
   - the size of the amino-acid-synthesis sector (Hui 2015; Mori 2021);
   - the doubling time on lactose;
   - replication timing (C + D; the 1.4× step is a placeholder; Cooper–Helmstetter);
   - carbon per amino acid (0.8 derived here; 0.5 in the research notes, unverified).
3. **Glucose uptake** is 12.6 mmol/gDW/h against 13–18 measured, because energy spilling is not
   modelled. Do not tune the transporter rate upward to close the gap.
4. **Cross-browser determinism** must be confirmed with `tools/golden.html` on real iPhone,
   Android and Chromebook devices before any server-side score check. So far it has been
   checked in Node and in desktop Chromium only.
5. **Amino-acid pool under blocked translation.** The pool keeps rising slowly (×7.7 after 1 h
   of chloramphenicol), bounded only by feedback inhibition. Acceptable for M1; add an efflux
   term if a level needs a bounded pool.
6. **ATP per glucose with oxygen** (for level 1.8). `docs/DESIGN.md` says oxygen gives about 15×
   more ATP per glucose (about 30 vs 2). For E. coli the retrieved values are about 20–24 ATP
   per glucose (Kukurugya 2024; Chen & Nielsen 2019), about 10–12×; 30–32 is the textbook value
   for mitochondria. The engine plans 20–24 for level 1.8, with the narrator noting the
   textbook figure. Settle the wording before level 1.8.

## Parameters

Every constant in `src/engine/btc-params.js`, with its unit, source and confidence. The table is
generated: after changing a parameter, run `node tools/param-table.js --write` (test b-3 fails
if the table is stale). Numbers in [brackets] were measured with the calibration prototype.

Confidence codes: **V** verified in the research brief; **PV** partly verified, or derived from
verified values; **U** unverified estimate; **D** derived or calibrated in the engine spec;
**G** a game or numerics choice, disclosed.

<!-- param-table:start -->
| id | value | unit | source | conf. | note |
|---|---|---|---|---|---|
| `dt` | 1 | s | design | G | integer tick; t = tick·dt |
| `substeps` | 8 | – | convergence test (spec §10) | G | h = dt/substeps = 0.125 s; must be ≤ 0.25 s |
| `E_floor` | 1×10^-9 | E | numerics | G | lowest energy charge; any injection is recorded in ledger.floor |
| `emaTau` | 300 | s | design | G | time constant of the displayed growth-rate average (5 min) |
| `N_mM` | 6.022×10^5 | molecules/(mM·fL) | Avogadro constant | V |  |
| `rho` | 6×10^8 | aa/fL | Milo 2013 (2–4×10⁶ proteins/µm³) | PV | low end; 2×10⁶ proteins of 300 aa per fL |
| `Vadd` | 1 | fL | Taheri-Araghi 2015 (adder); Volkmer & Heinemann 2011 (0.5–4 µm³) | V/G | steady birth size ≈1 fL whatever the medium |
| `repFrac` | 1.4 | ×Vbirth | placeholder for C+D timing | U | single gene-dosage step (verify with Cooper–Helmstetter) |
| `rodRadius` | 0.38 | µm | design | G | display only: cell drawn as a rod of this radius |
| `aaPerRibosome` | 7336 | aa | growth-law literature | U | verify the r-protein sequence sum |
| `rRNAperRibosome` | 4566 | nt | 16S + 23S + 5S | V |  |
| `L_R` | 133 | aa | 7336/55 r-proteins | PV | chain length used for ribosome occupancy |
| `L_Q` | 300 | aa | Brocchieri & Karlin 2005 (median 267) | PV | housekeeping sector |
| `L_P` | 300 | aa | Brocchieri & Karlin 2005 (median 267) | PV | other-metabolism sector |
| `beta_R` | 3 | /s per gene copy | calibrated (φ_R ≈9.5%) | D | R-sector transcription, × dosage × χ |
| `beta_P` | 2.43 | /s per gene copy | calibrated (φ_P ≈32%) | D | P-sector transcription, × dosage × f_P |
| `phi_Q` | 0.5 | – | Scott 2010 (0.45–0.55) | V | Q takes this share of synthesis, so burden comes out of R, P and the player genes |
| `rnapPerFL` | 2000 | /fL | design | U | display only; RNA polymerase is not limiting in M1 |
| `utrNt` | 60 | nt | design | D | mRNA length = 3L + 60 (UTRs lumped) |
| `mRNAHalfLife` | 180 | s | Bernstein 2002; Chen 2015 | V | per-gene knob from level 1.5 |
| `rateCap` | 0.3 | /s per copy | Dennis 2009 (rrn ≈1/s ceiling) | V/D | highest per-copy initiation rate |
| `leak` | 0.001 | ×rRef | Oehler 1990 (lac ≈1,300×), generalised | PV | "off" keeps this leak; knockout is 0 |
| `rnapFootprint` | 35 | nt | design (RNA polymerase covers ≈30–40 bp of DNA) | G | a gene copy of ℓ nt holds at most ℓ/35 transcripts in progress; binds only when elongation stalls |
| `ntPerAA` | 3 | nt per aa | Proshkin 2010 | V | RNA polymerase and the leading ribosome move together |
| `cmTx` | 0.35 | – | Proshkin 2010 (42 → 27 nt/s at sub-inhibitory Cm) | PV | transcription slows by cmTx·θ; extrapolated to full dose |
| `rRef_ptsG` | 0.02833 | /s per copy | calibrated; range from Taniguchi 2010 | U | 1.7 /min. |
| `rRef_gly` | 0.085 | /s per copy | calibrated; range from Taniguchi 2010 | U | 5.1 /min. |
| `rRef_aaSyn` | 0.085 | /s per copy | calibrated; range from Taniguchi 2010 | U | 5.1 /min. |
| `rRef_aaImp` | 0.01667 | /s per copy | calibrated; range from Taniguchi 2010 | U | 1 /min. |
| `rRef_lacY` | 0.05 | /s per copy | calibrated; range from Taniguchi 2010 | U | 3 /min. |
| `rRef_lacZ` | 0.02667 | /s per copy | calibrated; range from Taniguchi 2010 | U | 1.6 /min. lacZ ×1 gives 2.0×10⁴ monomers (2.4% of proteome); research: 2–3×10⁴ (≈2.2%). |
| `rRef_fliC` | 0.06667 | /s per copy | calibrated; range from Taniguchi 2010 | U | 4 /min. |
| `b_ptsG` | 1 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_gly` | 3 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_aaSyn` | 3 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_aaImp` | 1 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_lacY` | 0.5 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_lacZ` | 1.5 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_fliC` | 2 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `k_on` | 1.6×10^-4 | fL/s per free ribosome per b·mRNA | calibrated to k_init 0.151 /s; Zong 2010; Kennell & Riezman via Roussel & Zhu 2006 (0.1–0.12 /s) | D |  |
| `gI_basal` | 0.2 | – | Dai 2016 (fewer active ribosomes when growth is slow) | D | initiation factor g_I = hin·(gI_basal + (1 − gI_basal)·χ) |
| `v_max` | 18 | aa/s | Young & Bremer 1976; Dai 2016 (9–17) | V | reference running speed 11.65 aa/s |
| `K_aa` | 1×10^6 | /fL | calibrated | D | 1.66 mM; amino-acid limitation of elongation |
| `K_E` | 0.1 | E | research note (K ≈10% of normal) | G | sharp stall threshold for ribosomes |
| `K_in` | 0.03 | E | design | D | initiation stalls only when E collapses |
| `K_chiA` | 2×10^6 | /fL | design | D | 3.3 mM; ppGpp-like signal χ, Hill 2 |
| `K_chiE` | 0.5 | E | design | D | ppGpp-like signal χ, Hill 2 |
| `thetaMax` | 0.98 | – | Dai 2016 (mechanism) | D | fraction of ribosomes stalled at full chloramphenicol dose |
| `A_tot` | 3.5 | mM | Bennett 2009 (9.6 mM aerobic); Yaginuma 2014 (1.5 mM) | PV | ATP ≈3.1 mM; turnover ≈2.7 s |
| `c_tl` | 4 | ATP/aa | Lynch & Marinov 2015; Russell & Cook 1995 | V |  |
| `c_o` | 2.7 | ATP/aa polymerised | Stouthamer via Martin 2026 | D | other building work (lipids, wall, DNA, de novo nucleotides). Stouthamer: 34.7 mmol ATP/g in total, 19.1 for polymerisation; at 4 ATP/aa that is 4.775 mmol aa/g, so (34.7 − 19.1)/4.775 = 3.27 ATP/aa besides polymerisation; minus aa synthesis 0.28 and the transcription charged explicitly (0.29 at the reference state) leaves 2.70 |
| `atpPerNT` | 2 | ATP/nt | Lynch & Marinov 2015 | PV | NTPs recycled |
| `c_rRNA` | 1.245 | ATP per R-sector aa | 2 × 4566/7336 | D | rRNA made in step with r-protein |
| `c_syn` | 0.28 | ATP/aa made | Stouthamer via Martin 2026 | PV | not Lynch's 25–30 (contested) |
| `chi_C` | 0.8 | hexose/aa | carbon balance (≈4.8 C per residue) | D | research value 0.5 is unverified; both listed |
| `m_V` | 2.4×10^5 | ATP/s/fL × hm(E) | Klamt 2018 anaerobic non-growth 2.8 mmol glucose/gDW/h × 2 ATP | PV | 5.6 mmol ATP/gDW/h at E = 0.9 |
| `K_m` | 0.3 | E | design | D | upkeep falls under energy stress |
| `fermYield` | 2 | ATP/hexose | Hasona 2004; Wang 2010 (2–3) | V | teaching value; majors note 2–3 |
| `K_pi` | 0.05 | E | design | G | priming: the PTS needs PEP and PFK needs ATP |
| `s0` | 0.01 | E | design | G | priming seed; stands for PEP and phosphorylated intermediates (0 in level 1.3) |
| `K_adp` | 0.08 | 1−E (Hill 2) | Koebmann 2002 (flux controlled by ATP demand; ≈1.7× headroom) | D | proto headroom C_gly/F = 1.6 |
| `mmolPerGDWh` | 32100 | molecules/s per fL | derived: 0.192 pg dry mass per fL | D | display only: 1 mmol/gDW/h in molecules per second per fL |
| `k_pts` | 80 | /s per copy | Schmidt 2016 (to verify) | U | copy number proto 13,700 (research ≈10⁴, U) |
| `K_G` | 0.015 | mM | Steinsiek & Bettenbrock 2012 | V | PtsG half-saturation for glucose |
| `uBasal_backup` | 1.8×10^5 | glucose/s/fL | calibrated to anaerobic ΔptsG 0.14 /h (Steinsiek & Bettenbrock 2012) | V | used only when backupGlucoseUptake is set; the lab strain lacks the mannose PTS |
| `k_gly` | 8 | hexose/s per lumped copy | calibrated; share 4.5% vs Mori 2021 ≈4% glycolysis | PV | fermentation enzymes sit in sector P |
| `k_syn` | 6 | aa/s per copy | sector size 3–5% (estimate) | U | verify against Hui 2015 and Mori 2021 |
| `k_P` | 0.3 | aa/s per P protein | sector size 3–5% (estimate) | D | precursor supply from sector P, in series with aaSyn |
| `K_i` | 3×10^6 | /fL | design | D | 5.0 mM; feedback inhibition of aa synthesis, Hill 2 |
| `k_imp` | 20 | /s per copy | estimate | U |  |
| `K_imp` | 0.01 | mM | estimate | U |  |
| `K_iI` | 5×10^6 | /fL | estimate | U | 8.3 mM; trans-inhibition of import, Hill 2 |
| `c_imp` | 1 | ATP/aa | estimate | U | amino-acid import cost |
| `k_Y` | 60 | /s per copy | estimate | U |  |
| `K_Y` | 0.5 | mM | estimate | U |  |
| `L_max` | 10 | mM | estimate | U | internal lactose cap |
| `c_Y` | 0.33 | ATP/lactose | 1 H⁺ ÷ ≈3 H⁺ per ATP | U |  |
| `k_Z` | 60 | /s per monomer site | estimate | U | verify in β-galactosidase reviews |
| `K_Z` | 1 | mM | estimate | U |  |
| `glucoseHigh` | 10 | mM | ≈0.2% sugar | G | the "High" glucose preset |
| `glucoseLow` | 0.005 | mM | design | G | the "Low" preset: PtsG only partly filled (sat = 0.25), growth about halved [proto Td 209 min, λ = 0.47 λ0, E 0.29]; 0.05 mM would change almost nothing, because glycolysis, not PtsG, limits flux at the reference state |
| `lactosePresent` | 5 | mM | design | G |  |
| `aminoAcidsPresent` | 2 | mM | design | G |  |
| `drugLow` | 0.3 | dose | design | G | the "Low" drug preset; "Full" is 1 |
| `lambda_ref` | 1.18×10^-4 | /s | reference cell (spec §9) | D | observe-only; never read by the physics |
| `F_ref` | 5.8×10^5 | hexose/s | reference cell (spec §9) | D | observe-only |
| `U_ref` | 1.1×10^6 | glucose/s | 13,700 PtsG × 80 /s | D | observe-only |
| `lacY_ref` | 10000 | monomers | ×1 steady state in glucose [proto 10,460] | D | observe-only |
| `lacZ_ref` | 20000 | monomers | ×1 steady state in glucose [proto 19,460] | D | observe-only |
<!-- param-table:end -->
