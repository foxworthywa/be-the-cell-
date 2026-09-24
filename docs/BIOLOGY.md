# BIOLOGY.md — biological constraints the simulation must respect

These are treated as immutable. Any change to `src/engine` must keep every statement below
true, and `npm test` checks most of them (the test ids are listed under "Acceptance
behaviours"; the full criteria are in `docs/ENGINE.md` §14). Numbers in parentheses are model
values for the reference cell (the lab strain in 10 mM glucose, default dials, engine 1.1.0)
unless a source is named. Engine 1.1.0 changed what a cell does when energy is short (it cuts
its spending and keeps a charge; "Energy") and added the regulated lac operon (strain m2-lac;
"The lac operon"); the reference cell is unchanged.

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
- Three strains (engine 1.1.0): the lab strain `m1-lab` (7 genes, each on its own dial); `m2-l11`,
  the same plus the arabinose–proton symporter gene araE (a decoy that does nothing here: no
  arabinose is ever given); and `m2-lac`, the lab strain with lacZ, lacY and lacA as one operon
  under the lac promoter and operator, plus the repressor gene lacI on its own weak promoter
  (9 genes).

## DNA → RNA: transcription

- A gene is transcribed only when switched on. "Off" leaves a leak of 1/1,000 of the ×1 rate
  (generalised from the ≈ 1,300-fold repression of the lac operon; Oehler 1990); a knockout
  makes nothing.
- Transcription starts at random moments, at a rate set by the promoter.
- An mRNA exists only once RNA polymerase has copied the whole gene, so longer genes take
  longer (35 nt/s here: flagellin mRNA ≈ 45 s, lacZ ≈ 90 s).
- Transcription uses ATP (2 ATP per nucleotide) and stops when ATP is gone. When energy runs
  short, promoters fire less (housekeeping first), so a starving cell does not spend its last
  ATP starting transcripts it cannot finish or translate (RNA synthesis falls to about 7% in the
  diauxic lag; Jacobson 1970). The lac promoter is the exception (cAMP–CRP; "The lac operon").
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
- When energy is short, idle ribosomes stop starting new proteins (hibernation) before the
  running ones slow down. A ribosome paused on an mRNA that is then cut up is released and its
  unfinished chain is broken down to amino acids (trans-translation rescue).
- Ribosomes already on an mRNA that decays finish their protein (when there is energy to run).
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
  s). With no sugar coming in, the charge falls within seconds (below 0.3 after 3 s) and
  everything that builds stops, including making new transporters and enzymes.
- A cell cuts its spending before its ATP is gone (engine 1.1.0). As the charge falls, it first
  stops making ribosomes and slows initiation (the ppGpp stand-in χ), then cuts most of its
  upkeep, housekeeping transcription and amino-acid synthesis, then its promoters, and only
  then do running ribosomes pause. So a starving cell holds a charge near 0.1 for about an hour
  and runs down over hours (below 0.01 after about 12 h), instead of hitting zero in seconds.
  Starving E. coli keeps part of its charge (Chapman 1971); cells that stop growing spend far
  less on upkeep than growing cells (Biselli 2020).
- A cell short of carbon, not starved of it, slows its growth and keeps its charge high: at
  0.005 mM glucose it grows at half speed with a charge of 0.73 (engine 1.0.0: 0.29). A cell
  whose transporter is being diluted away slows down over hours with its charge near 0.64.
- Recovery after refeeding runs on the proteins that already exist. A cell that has lost its
  transporters recovers slowly, and one with none at all never recovers.
- Glycolysis uses a little ATP before it makes any (the transporter uses PEP, and
  phosphofructokinase uses ATP), so a cell whose ATP has run out restarts more slowly without
  the small reserve of primed intermediates. Because the energy gates shut the big ATP users
  first, even a cell with a twentieth of its enzymes now restarts; engine 1.0.0's threshold
  (too few enzymes never restart) is gone.
- Glycolytic flux is set by ATP demand, not by supply (Koebmann 2002): extra transporters
  barely change growth, fewer slow it.
- Making protein is the largest cost of growing (≈ 41% of ATP; about half in the literature,
  Li 2014). Making RNA is small (≈ 3%). When growth is blocked, upkeep becomes the largest cost,
  and when carbon limits growth it rises to about the share of translation (upkeep is a cost per
  hour, so it weighs more the slower a cell grows; Pirt).
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
- Switching a cell from glucose to lactose needs LacY and LacZ already made. In the lab strain
  (no regulation) a few minutes of both at ×1 before glucose is removed is enough since engine
  1.1.0: the cell pauses and keeps its charge (lowest 0.15–0.4) while the permeases it has bring
  in enough lactose to make more (half speed or better after 2 h, 4 of 4 seeds, with ×1 for 3
  min). Engine 1.0.0 needed ×1 for two hours. A cell with LacY but no LacZ keeps pumping
  lactose in without splitting it and runs its ATP down to nothing (lactose killing is caused by
  LacY transport itself, also in lacZ mutants; Dykhuizen & Hartl 1978).
- The narrator's line "Lactose is outside, but there is too little LacY and LacZ to keep ATP up,
  so the cell has stopped" now needs the charge below 0.1, which a cell holding a few lac
  proteins rarely reaches; such a cell usually reads "not growing" instead.

## The lac operon (strain m2-lac, engine 1.1.0)

- lacZ, lacY and lacA are one transcription unit: one promoter, one operator, one mRNA of
  4,992 nt read by ribosomes at three start sites. lacY's start is 3,072 nt in, so LacY appears
  about 90 s after LacZ's start. The three always report the same mRNA count.
- The repressor LacI is made from its own weak gene (about one mRNA per generation, ≈10
  tetramers; Gilbert & Müller-Hill 1966) and counted as whole tetramers. A free tetramer finds a
  free operator in about 300 s ÷ (number of tetramers) (Elf 2007).
- Each operator copy is either bound or free and flips at random. Bound, it lets through a
  small leak (partial release of the looped repressor; Choi 2008); free, the promoter runs at
  full rate. Together the wild type is repressed 1,000-fold at 10 tetramers (Oehler 1990:
  about 1,300-fold with all three natural operators).
- Basal expression comes in rare bursts: in glucose a cell makes a few lac mRNAs a day and
  carries 2–8 LacY on average, with none at all for part of the time (about half of
  glucose-grown cells carry at least one LacY; Choi 2008, Julou 2020).
- Inducer: LacZ turns about half of the lactose it handles into allolactose (Huber 1976) and
  breaks it down again. Allolactose (or IPTG from the medium) bound to a free repressor stops it
  binding (half at 1.3 µM, Hill 2); a repressor on the operator is pulled off more slowly and
  only at higher levels. `Is` repressors cannot bind inducer.
- Glucose first: while glucose flows in through the PTS, cAMP is low and CRP gives the free
  promoter little help (≈15% in 10 mM glucose), so with both sugars the operon makes about a
  tenth of what it makes on lactose alone. The leak from a bound operator is not scaled by CRP.
  Inducer exclusion (EIIA-Glc blocking LacY) is off by default.
- Switching from glucose to lactose alone, a wild-type cell that carries a few basal LacY and
  LacZ adapts after a lag of about two hours (125–146 min on 12 seeds; median 132): it pauses at
  a charge of 0.12–0.4 while its permeases bring in a trickle of lactose, induces the operon
  (the first full lac mRNA takes 45–50 min at that charge) and makes more permease, and growth
  passes half its lactose rate once most of the induced LacY is made. More
  pre-existing LacY and LacZ shortens the lag (10× → about 80 min, 100× → about 60 min). After
  two hours in both sugars (glucose-limited induction) the lag is about 65 min. Without a
  repressor and without the CRP site the operon is already fully on, and there is no lag.
  Real, oxygen-breathing cells adapt faster: single glucose-grown cells lag from under 50 min to
  3 h (Julou 2020) and populations about 40 min to 2 h (Fischer 1998; Jacobson 1970). This
  anaerobic cell gets 2 ATP per sugar, so each permease brings in about a tenth of the energy
  and more of them are needed before growth can resume (open item 1).
- A cell with no LacY at all cannot start on lactose alone here: nothing comes in, its charge
  runs down, and a spontaneous burst would have nothing to run on. Real "sensorless" cells wait
  1–3 h for such a burst (Julou 2020). The m2-lac preset is therefore a typical glucose-grown
  cell that carries a few LacY.
- The student's design (level 1.7) is fixed for the run: promoter strength ×0.5–4, operator
  present or absent (Oc), CRP site present or absent, lacI wild type, deleted or Is, lacI
  promoter ×1 or ×10 (Iq). Truth table after 3 h (LacZ as a share of the induced wild type):
  wild type 0.01–0.5% in glucose, 53–70% on lactose; no repressor or no operator 11–18% in
  glucose, 54–70% on lactose; Is under 0.6% in glucose and 0.1–1% on lactose.
- Making the lac proteins without need costs growth: the no-repressor design without the CRP
  site grows about 6% slower in glucose.

## Drugs

- Rifampicin (blocks RNA polymerase): no new mRNA; existing mRNA is read until it decays, so
  protein synthesis winds down over about 20 min and growth continues for a while.
- Chloramphenicol (stalls ribosomes): protein synthesis stops at once, the mRNA stays, ATP
  demand falls and the energy charge rises.
- The two are told apart by their mRNA: rifampicin removes it, chloramphenicol leaves it.

## Acceptance behaviours

These are the behaviours the M1 engine has to show (`docs/ENGINE.md` §14.1, criteria a–j). Each
line gives the test id, the claim in plain language and what engine 1.1.0 measures today. Seed
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
  building; still the largest with flagellin ×4. With the transporter at ×¼, carbon limits
  growth, the charge stays up and upkeep rises to 37% against 34% for translation; engine 1.0.0
  had translation largest there too.)
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
- **g1** No glucose → ATP falls a long way within seconds and everything that builds stalls,
  while the cell keeps a little charge. (Energy charge below 0.3 after 3 s, 0.19 at 10 s, 0.11
  at 20 min; growth below 5% after 6 s; initiation below 0.1% of before after the first minute;
  mRNA at a tenth after 10 min; then no protein made for 20 min. Engine 1.0.0: 0.004 at 5 s,
  then the floor.)
- **g2** Refeeding recovers with the proteins that already exist. (Energy charge above 0.8 after
  2 s; growth back to 91% by 5 min and 101% by 15 min.)
- **g3** Without new transporter the cell spirals down as PtsG is diluted, keeping its charge.
  (Growth 96% at 1 h, 29% at 6 h, 8% at 20 h; charge 0.64 at 6 h; engine 1.0.0: 0.14.)
- **g4** The longer the wait, the slower the recovery. (Time to half speed: 0.73 h after 6 h off,
  1.26 h after 10 h, 2.61 h after 20 h.)
- **g5** With no transporter at all there is no recovery: ATP runs down over hours (0.10 at 1 h,
  below 0.01 by 12 h) and nothing is made for 24 h.
- **g6** Glycolysis needs a little ATP to start. (From zero ATP a cell with a fifth of its
  transporters and enzymes restarts in 13 s without the priming reserve and 6 s with it; with
  half it is back to 80% speed in 11 min. Engine 1.0.0: the fifth never restarted.)
- **g7** The backup-transporter option gives the growth rate of a real ΔptsG strain. (0.126 per
  hour; target 0.10–0.18.)
- **g8** Low glucose (0.005 mM) about halves growth and the cell keeps its charge. (0.47–0.49 of
  the reference; doubling time 202 min; charge 0.73, engine 1.0.0: 0.29.)

**h. Lactose** (`tests/lactose.test.js`)
- **h1** Lactose supports growth only with both LacY and LacZ. (Both: doubling time 106 min.
  Either one missing: growth stops; with LacZ alone or neither the charge holds near 0.1, with
  LacY alone the pumping drains it to the floor within a minute.)
- **h2** With LacY but no LacZ, lactose gets in but is not split. (1.5 mM inside after 60 s;
  none split.)
- **h3** A glucose-grown wild-type lac cell (strain m2-lac, a few basal LacY and LacZ) adapts to
  lactose alone after a lag of about two hours and never goes dormant. (125–136 min on set C;
  lowest charge 0.12.)
- **h3b** More pre-existing LacY and LacZ shortens the lag. (132 min as preset; 81 min with 10×;
  59 min with 100×.)
- **h3c** The lab strain has no lac regulation: with its lac genes at the leak it never adapts.

**The lac operon** (`tests/lac-operon.test.js`; LEVELS.md RT-1…RT-6)
- **RT-1** Truth table after 3 h: the wild type makes LacZ only on lactose; without the repressor
  or the operator it is made in both; with an Is repressor, in neither.
- **RT-2** Moved from glucose to lactose alone, the wild type lags 1–3 h on all 12 seeds (125–146
  min) without going dormant; without repressor and CRP site there is no lag. (LEVELS.md asks
  20–60 min; open item 1.)
- **RT-3** With an Is repressor the cell never grows on lactose, and holds a little charge.
- **RT-4** An induced cell moved to glucose re-represses within half a minute (0.05% of induced).
- **RT-5** Glucose first: with both sugars the wild type makes 13% of its lactose-only lac
  protein; without the CRP site, 109%.
- **RT-6** The no-repressor design without the CRP site grows 6% slower in glucose.
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
   The lab strain has no lac operon and no regulation. "Off" leaves a 1/1,000 leak; a knockout
   removes the gene (engine only; not offered in the lab). Strain `m2-lac` (level 1.7) has the
   regulated lac operon ("The lac operon"). The strain lacks the mannose uptake
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
   - Upkeep uses an anaerobic non-growth value. Most of it is cut when energy is short (all but
     0.02%, `upkeepBasal`), which is how a starving cell keeps its charge for hours.
   - The ATP pool turns over in ≈ 2.7 s, somewhat slower than in real cells (1–2 s).
   - Glycolysis needs a little ATP to start (priming). A small reserve, the seed, stands for PEP
     and other intermediates.
   - *"When energy runs short, the cell cuts its spending in a fixed order: ribosome making
     first, then upkeep and housekeeping, then new transcripts, and last its running
     ribosomes."* (Engine 1.1.0.) Each cut is a steep function of the charge alone (Hill
     coefficients 8–12), standing for ppGpp, cAMP and ribosome hibernation, which in real cells
     respond to carbon flux as well as to ATP. Real cells also keep some ATP from reserves
     (glycogen, RNA turnover), which are not modelled: with nothing coming in, the charge here
     sits near 0.1 for about an hour and runs down over hours; real starving cells hold about
     0.5 for longer (Chapman 1971).
   - Paused ribosomes on mRNA that decays are released and their unfinished chains returned to
     the amino-acid pool (trans-translation); the ATP already spent on those chains is lost.
5. **Amino acids.** *"All twenty amino acids are treated as one pool."*
   The pool stands in for charged tRNA. Its carbon cost (0.8 glucose per amino acid) is derived,
   not measured.
6. **Ribosomes and polymerase.** *"Ribosomes are assembled instantly, and RNA polymerase never
   runs short."*
   - rRNA is made in step with ribosomal proteins, including under rifampicin.
   - Transcription speed is tied to translation speed (3 nt per amino acid), and ribosomes start
     on RNA still being made. When energy is short, promoters fire less in the same proportion
     as the ribosomes slow, so the number of transcripts in progress stays about as in growth. At the reference state this gives 35 nt/s (3 × 11.65), slower
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
   Only mRNA (and, in strain m2-lac, the repressor LacI, as whole tetramers, and the operator
   copies) is counted molecule by molecule. Protein numbers are averages given the random mRNA
   history, so a basal lac cell can hold a fraction of a LacY.
10. **Cell size and cycle.** *"The cell adds the same volume every cycle, and only one daughter
    is followed."*
    Cells add a fixed 1 fL per cycle whatever the medium (real cells are bigger in rich medium).
    Replication is a single dosage step at 1.4× birth volume, so the instantaneous growth rate
    ripples within each cycle; the clock shows the whole-cycle doubling time.
11. **Lactose.** *"LacZ splits lactose into glucose and galactose; the enzymes that use
    galactose are assumed present."*
    LacY runs on the proton gradient, and each lactose costs about ⅓ ATP. When energy is short,
    LacY also lets lactose run in down its gradient at no cost (facilitated diffusion, as
    de-energised LacY does), so a starving cell with a few permeases still gets a trickle. In the
    lab strain there is no LacA; in m2-lac LacA is made (the third cistron) but does nothing
    here.
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
18. **The lac operon** (strain m2-lac). *"One operator stands for the three real ones, and the
    repressor either sits on it or not."*
    - The loop between operators is lumped into one operator per gene copy with a small leak
      while bound; the leak does not depend on CRP (CRP also tightens the loop; Kuhlman 2007).
    - cAMP follows the glucose flux through PtsG at once, with no cAMP pool, synthesis or
      export; inducer exclusion (EIIA-Glc blocking LacY) is left out by default.
    - Allolactose is a signal pool: its carbon is counted as split lactose at once; it is broken
      down by LacZ and halved at division.
    - IPTG in the medium is inside at once (it diffuses in within seconds).
    - A newly replicated operon copy starts in the same state (bound or free) as the old one.
    - The design is fixed for the run; mutations and a second lac copy are not modelled.

## Open items and values to verify

1. **Adapting to lactose without oxygen** (tests h3, RT-2). Engine 1.1.0 took the "ppGpp-like
   demand cuts" option: a cell with a few LacY and LacZ now adapts after a lag (m2-lac wild type
   from glucose: 125–146 min on 12 seeds; the lab strain with lac ×1 for 3 min before glucose is
   removed: half speed after 2 h), and upkeep was not weakened in growing cells. Still open:
   - The lag is longer than in oxygen-breathing cells (Julou 2020: 30% of single cells under 50
     min, the rest 1–3 h; Fischer 1998: ≈40 min; Jacobson 1970: ≈2 h), and longer than the
     20–60 min that LEVELS.md RT-2 asks for level 1.7. The remaining causes: 2 ATP per sugar,
     so growth needs most of the induced LacY before it reaches half speed (maintenance takes
     about 30% of the lactose supply), and the first full lac mRNA takes 45–50 min while the
     charge sits near 0.12.
   - A cell with no LacY at all never adapts (nothing comes in; see "The lac operon").
   - Options for a later engine: a small glycogen/RNA-turnover reserve that holds a starving
     cell near a charge of 0.5 (Chapman 1971) so that bursts can be made and read; and
     preferential lac initiation in the lag (Rickenberg 1955; Jacobson 1970).
   - The lab's About sheet and the narrator still describe the engine 1.0.0 behaviour ("set
     LacY and LacZ to ×4 … and wait an hour"; "Real E. coli adapts … this model does not"),
     and `lac.toofew`, `gene.noatp` and `starve.dormant` now need the charge below 0.1, which
     takes about an hour of starvation (or never, with a few permeases). The app text needs
     updating.
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
7. **Priming threshold** (test g6). The energy gates shut every large ATP user first, so a cell
   whose ATP has run out restarts from the floor even with a twentieth of its glycolytic
   enzymes; the seed only speeds the restart (13 s vs 6 s). The planned level 1.3 threshold
   ("too few enzymes never restart", engine spec §13.3) no longer exists; it would need a
   different mechanism.

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
| `rRef_lac` | 0.02667 | /s per copy | as rRef_lacZ; Kennell & Riezman via Roussel & Zhu 2006 (≈20 LacZ/s fully induced) | U | 1.6 /min: fully induced (free operator, cAMP–CRP high) gives the lab strain's lacZ ×1, ≈2×10⁴ LacZ monomers (2.4% of proteome) |
| `rRef_lacI` | 8.333×10^-4 | /s per copy | Gilbert & Müller-Hill 1966 (≈10 repressor tetramers per gene copy) | PV | 0.05 /min with b_lacI 0.1: about one mRNA per generation, ≈4 monomers per mRNA (Yu 2006 via Roussel & Zhu 2006), ≈10 tetramers |
| `b_ptsG` | 1 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_gly` | 3 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_aaSyn` | 3 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_aaImp` | 1 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_lacY` | 0.5 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_lacZ` | 1.5 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_fliC` | 2 | – | calibrated to k_init ≈0.15 /s at b = 1 | D | relative ribosome-binding strength (RBS) |
| `b_lacA` | 0.5 | – | LEVELS.md R-E13 (translated less than lacZ; Soupene 2003: LacA activity ≈50× below LacZ) | D | relative ribosome-binding strength of the third lac cistron |
| `b_lacI` | 0.1 | – | Yu 2006 via Roussel & Zhu 2006 (≈4 proteins per mRNA for a lac-repressed gene) | PV | weak lacI ribosome-binding site |
| `k_on` | 1.757×10^-4 | fL/s per free ribosome per b·mRNA | calibrated to k_init 0.151 /s; Zong 2010; Kennell & Riezman via Roussel & Zhu 2006 (0.1–0.12 /s) | D |  |
| `gI_basal` | 0.1 | – | Dai 2016 (fewer active ribosomes when growth is slow); Jacobson 1970 (protein synthesis 10–15% of exponential during the diauxic lag) | D | initiation factor g_I = hin·(gI_basal + (1 − gI_basal)·χ) |
| `v_max` | 18 | aa/s | Young & Bremer 1976; Dai 2016 (9–17) | V | reference running speed 11.65 aa/s |
| `K_aa` | 1×10^6 | /fL | calibrated | D | 1.66 mM; amino-acid limitation of elongation |
| `K_E` | 0.1 | E | research note (K ≈10% of normal) | G | sharp stall threshold for ribosomes |
| `K_in` | 0.03 | E | design | D | initiation stalls only when E collapses |
| `K_chiA` | 2×10^6 | /fL | design | D | 3.3 mM; ppGpp-like signal χ, Hill 2 |
| `K_chiE` | 0.81 | E | Walker-Simmons & Atkinson 1977; Chapman 1971 (growth needs a charge ≳ 0.8) | D | half-point of the energy leg of χ; set so χ at the reference state is unchanged (0.47, v1.0 value) |
| `n_chiE` | 12 | – | Atkinson response curves: steepest above E ≈ 0.7, half-maximal at 0.8–0.9 (Walker-Simmons & Atkinson 1977) | D | Hill coefficient of the energy leg of χ: ribosome synthesis and initiation give way before ATP runs down (v1.1) |
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
| `upkeepBasal` | 2×10^-4 | – | Biselli 2020, citing Hoehler & Jørgensen 2013 (growth-phase maintenance overestimates what non-growing cells spend) | D | share of upkeep that energy shortage does not cut; the rest is gated by s_up (v1.1). Sets how slowly a starving cell loses its ATP (hours) |
| `K_up` | 0.6 | E | Walker-Simmons & Atkinson 1977 (charge held near 0.8 while cells adapt); Chapman 1971 | D | upkeep gate s_up(E) = E^n/(E^n + K^n): the regulated share of upkeep, sector Q and P transcription and amino-acid synthesis shut down first when energy is short (v1.1) |
| `n_up` | 12 | – | design | D | Hill coefficient of the upkeep gate; s_up ≈ 0.99 at a growing cell's charge |
| `K_tx` | 0.45 | E | Jacobson 1970 (RNA synthesis falls to ≈7% in the diauxic lag; lac mRNA is spared); design | D | promoter gate s_tx(E): unregulated player promoters fire less below this charge, so a starving cell does not spend its trickle on transcripts it cannot translate; the lac promoter is not gated (cAMP–CRP) (v1.1) |
| `n_tx` | 8 | – | design | D | Hill coefficient of the promoter gate; s_tx ≈ 1 at a growing cell's charge and ≈ 0.9 in a cell starving on the backup route (R-E7) |
| `K_el` | 0.3 | E | Chapman 1971 (starving cells keep a charge near 0.5); design | D | elongation gate s_el(E): running ribosomes pause, promoters fire less and idle ribosomes hibernate (basal initiation) below this charge; paused ribosomes are rescued (v1.1) |
| `n_el` | 8 | – | design | D | Hill coefficient of the elongation gate; s_el ≈ 1 at a growing cell's charge |
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
| `tau_search` | 300 | s | Elf 2007 (one repressor finds an operator in ≤ 354 s; estimate < 270 s) | V | a free operator is found at rate (active LacI tetramers)/tau_search |
| `lacIRef` | 10 | tetramers | Gilbert & Müller-Hill 1966 | V | repressor level at which the repression factor below holds |
| `rep_lac` | 1000 | × | Oehler 1990 (1,300× with all three operators; LEVELS.md R-E13 uses ≈1,000) | V | fold repression of the wild-type design at lacIRef tetramers: half from rare complete release, half from the leak while bound |
| `lacLeak` | 5×10^-4 | × | Choi 2008 (basal expression comes from partial release of the looped repressor) | PV | transcription from an operator copy while the repressor is bound, as a share of the free rate |
| `K_ind` | 1.3 | µM | Gilbert & Maxam 1973 (repressor binds IPTG with K ≈ 1.3 µM); allolactose taken as equal | PV | inducer bound to free repressor, Hill n_ind |
| `n_ind` | 2 | – | Kuhlman 2007 (IPTG response Hill ≈ 2) | PV | integer |
| `K_indOp` | 40 | µM | Choi 2008 citing Barkley 1975 (operator-bound repressor binds inducer 20–100× more weakly) | PV | inducer that frees an operator-bound repressor, Hill n_ind |
| `k_rel` | 0.05 | /s | Elf 2007 (repressors leave the operator within ≈40 s of saturating IPTG) | PV | release rate of an inducer-bound repressor |
| `f_allo` | 0.5 | – | Huber 1976 via Suyama 1986 (≈50% of lactose turned over becomes allolactose) | PV | allolactose made per lactose split by LacZ (a signal pool; its carbon is counted as split at once) |
| `K_allo` | 1 | mM | estimate | U | LacZ hydrolyses allolactose with rate k_Z·LacZ/(K_allo·N_mM·V) per molecule |
| `K_crp` | 1.3×10^5 | glucose/s/fL | design; Kuhlman 2007 (glucose lowers induced lac ≈3×; > 50× without CRP) | D | glucose import capacity per fL at which cAMP is half its no-glucose level; 10 mM glucose leaves ≈15% (crpFactor) |
| `IEmax` | 0 | – | Görke & Stülke 2008 (inducer exclusion causes the glucose–lactose diauxie) | U | largest share of LacY blocked by EIIA-Glc while glucose flows in; 0 = inducer exclusion not modelled (LEVELS.md §8.3) |
| `glucoseHigh` | 10 | mM | ≈0.2% sugar | G | the "High" glucose preset |
| `glucoseLow` | 0.005 | mM | design | G | the "Low" preset: PtsG only partly filled (sat = 0.25), growth about halved [proto Td 209 min, λ = 0.47 λ0, E 0.29]; 0.05 mM would change almost nothing, because glycolysis, not PtsG, limits flux at the reference state |
| `lactosePresent` | 5 | mM | design | G |  |
| `aminoAcidsPresent` | 2 | mM | design | G |  |
| `iptgPresent` | 1 | mM | Kuhlman 2007 (1 mM IPTG saturates) | G | the gratuitous inducer IPTG (m2-lac; enters by diffusion within seconds) |
| `drugLow` | 0.3 | dose | design | G | the "Low" drug preset; "Full" is 1 |
| `lambda_ref` | 1.18×10^-4 | /s | reference cell (spec §9) | D | observe-only; never read by the physics |
| `F_ref` | 5.8×10^5 | hexose/s | reference cell (spec §9) | D | observe-only |
| `U_ref` | 1.1×10^6 | glucose/s | 13,700 PtsG × 80 /s | D | observe-only |
| `lacY_ref` | 10000 | monomers | ×1 steady state in glucose [proto 10,460] | D | observe-only |
| `lacZ_ref` | 20000 | monomers | ×1 steady state in glucose [proto 19,460] | D | observe-only |
<!-- param-table:end -->
