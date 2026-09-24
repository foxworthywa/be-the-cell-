# Be the Cell: teaching-first redesign (the opening, close-up views, tiered screens and every level)

**Status:** implementation-ready proposal, 2026-09-24. It is not built yet. **Instructor:** Alex
Foxworthy (they/them). **Repo:** `/home/user/be-the-cell-`.

**Why the file name:** the work began as a new Prologue. Alex's later notes made it a redesign of
the opening and of every level, so the title says that; the file name stays `docs/PROLOGUE.md` so
that links to it keep working. It sits beside `docs/DESIGN.md`, `docs/PEDAGOGY.md`,
`docs/LEVELS.md`, `docs/LAB_UI.md` and `docs/ENGINE.md`. **Where this file and `LEVELS.md` or
`LAB_UI.md` disagree, this file describes the intended change**, and those files are updated when
each part is built (§12). `ENGINE.md` stays authoritative for physics; §7 here is a contract for
observe-only additions.

**Normative words:** MUST, MUST NOT, SHOULD. "Lab spec §x" is `docs/LAB_UI.md`, "Levels §x" is
`docs/LEVELS.md`, "Engine §x" is `docs/ENGINE.md`.

**Alex's notes this answers** (quoted in full in the session; summarised here):
1. The Prologue is too abstract: nobody can reason which gene is right without knowing that DNA
   sits in the nucleus, that mRNA is an exported copy of a gene, and that proteins are made from
   it. Zoom in on DNA to A, C, G and T, highlight a gene, and walk students through the process.
2. The lab view is too zoomed out to see genes, mRNA copies or how proteins are made, and does not
   show that a protein is a three-dimensional machine whose shape does its job.
3. Use simple, plain language: we are building understanding, not testing it.
4. Even the instructor ends up clicking buttons in the LacY levels: teach, do not test; make the
   task clear and let it illustrate the process.
5. Too many graphs and readouts: show what matters, and add complexity in tiers.
6. Everything feels abstract ("hold LacY between 530 and 1010"): students do not know what
   lactose is, why it matters or how it relates to energy. Give a story they can follow and
   stakes they can see.
7. The story needs to be more coherent, leading students toward understanding: story and lesson
   are one thread, the Commander's goal is concrete and constant, and the cast is small.

---

## Contents

0. Summary
1. Principles: how every screen teaches (1.5: the story)
2. The opening, in two parts
3. Close-up views in the live game
4. A flat picture language for protein machines
5. The tiered interface
6. The levels in the new pattern (1.2 in full; 1.1, 1.4, 1.7 sketched)
7. Engine and view contract (observe-only)
8. Performance
9. Telemetry
10. Tests
11. File layout
12. Build order: a vertical slice first, then stop for Alex
13. Facts, sequences and sources
14. Open questions for Alex
Appendix A. Engine measurements made for this spec

---

## 0. Summary

- **One story for the whole game: the cell's economy.** Sugar gets in only through transporter
  machines; enzyme machines break it down into ATP, the cell's energy currency; ATP is spent on
  everything, above all on building proteins; genes hold the instructions for every machine and
  mRNA copies carry them to the ribosomes; machines wear out and are replaced; when the economy
  runs well the cell grows and divides. Every level asks one question inside this story, and its
  goal says in plain words why it matters to the cell (§1.3).
- **The opening becomes two short guided parts, not scored.** Part 1, "How a gene becomes a
  machine" (about 7 minutes): zoom from the student to the letters of their own insulin gene,
  watch it copied into mRNA (the student fills in the first letters), exported, read by a ribosome
  (the student decodes the first two codons), folded, and then see a glucose transporter work.
  Every letter, copy and chain on screen is computed from the real human insulin sequence by an
  exact model (§2.2). Part 2, "A cell's economy" (about 6 minutes): the bacterium (same code, no
  nucleus), the two sugars, the economy, then a guided first experiment in the real engine with
  every step gated on the student or on what the model shows (§2.4).
- **Three zoom levels in the live game:** Cell (today's view), Gene (the focus gene's DNA, RNA
  polymerases, mRNA copies with their ribosomes, new chains going to their place) and Protein (one
  machine doing its job at the rate the engine reports, with a molecule that does not fit bouncing
  off). Everything drawn comes from engine state; what is schematic says so (§3).
- **A flat picture language for machines:** chain, fold, pocket, fit, shape change, work; oily
  stretches that sit in the membrane; the same pictures on task cards, gene cards, close-ups and
  the opening (§4).
- **Every level follows one pattern:** (1) Watch it happen up close, (2) Guess, then see, (3) Try a
  small concrete task that uses exactly what was just seen, (4) Explain, with feedback that
  teaches. Only (3) and (4) are scored (§1.4).
- **Tiered screens:** the opening and early levels show one or two big plain counters and at most
  one simple graph; each new readout is introduced with one plain sentence when it first matters;
  the free-play lab opens in a simple mode with "All controls" one tap away (§5).
- **Levels reframed around visible stakes:** 1.1 the starving cell (find the transporter by
  reasoning from where proteins go); 1.2 milk is on its way (get enough lactose transporters in
  place in time, and switch off when enough are on the way); 1.4 transporters wear out (keep
  enough to feed the cell without paying for extras); 1.7 the sugars change and nobody can tell the
  cell (its own repressor switch does the work) (§6).
- **The story is the same thread as the lessons** (§1.5): the Commander's goal is always "keep this
  cell fed and growing, until it divides"; each line either sets up the next question or reacts
  to what the student just saw, naming the cause; the Commander starts by giving orders and, level
  by level, comes to accept that the cell's own machines and switches do the work. Three speakers:
  the narrator, the Commander ("You") and the Ribosome. Complete text for the opening (§2.8) and
  1.2 (§6.2.8); outlines and key lines for 1.1, 1.4 and 1.7 (§6.1, §6.3, §6.4).
- **Build a vertical slice first** (the new opening, the close-ups, the tiered screens and level
  1.2), then stop for Alex's feedback before redoing 1.1, 1.4 and 1.7 (§12).
- **Sequences:** the human insulin coding sequence (NM_000207.3, 333 letters) and the preproinsulin
  protein (UniProt P01308, 110 amino acids) match each other exactly under the standard genetic
  code. UniProt and NCBI themselves were blocked by this session's network policy; both sequences
  were checked against copies of those records found by GitHub code search, and a direct check is
  the first build step (§2.2, §13).

---

## 1. Principles: how every screen teaches

### 1.1 Teaching rules

These add to PEDAGOGY.md; none of its rules is dropped.

1. **Teach, then ask.** A concept is shown and said in plain words before any question uses it.
   The first time a student meets an idea, the screen demonstrates it.
2. **Guess, then see.** Before each step the student may make a quick guess in plain words. The
   screen then shows what happens, and the feedback explains the cause in one sentence. Guesses
   are logged, never scored, and never marked wrong: the feedback reads "What happened: …" for
   every option (§1.4).
3. **A thing's job first, its name second.** Every protein is introduced by what it does, with its
   machine picture (§4.3), and only then by its name ("carries glucose across the membrane … it is
   called a glucose transporter, PtsG").
4. **Plain words** (§1.2). One idea per screen, one sentence per line, at most 140 characters.
5. **Visible stakes.** A goal says why it matters to the cell, and its result shows on the cell:
   it starves, energy runs low, growth slows, it grows and divides, or resources are wasted (§1.3).
6. **Show only what the lesson is about** (§5).
7. **Carried over unchanged:** every visual comes from model state; nothing advances because time
   passed (gates are taps or observed model states, never elapsed time); honest scale (scale bars,
   "1 dot = N", time compression always shown); names after function; no teleology; dry,
   understated tone; no exclamation marks; phone first.

**The lint** (Levels §12.1 L-2, Lab spec §7.3) applies to every string in this file marked as
student text: at most 140 characters, no "!", no match for
`/\b(wants?|tries|trying|try to|decides?|chooses|knows|needs? to|in order to|so that|likes?|hungry|happy)\b/i`
(note that it forbids "like" and "hungry"), and no "primitive", "advanced", "upgrade" or "evolved
from". Narrator rule templates also have no digits. Every draft below was checked against these
rules when this file was written (§10.1 C-1 makes it a test).

### 1.2 Plain words and when names arrive

A separate plain-language pass is rewriting the existing level text; this table is the shared
vocabulary so the two stay consistent. The left column is how a thing is first described; the name
arrives only after the student has seen it work.

| First said as | Named after its job is seen | Where it is named |
|---|---|---|
| the long threads the DNA is split into | chromosome | opening A4 |
| stretches along the DNA; the instructions for one protein, a stretch of letters | gene | opening A7 (the bands along the DNA), then B1 (a stretch of letters) |
| the four building blocks of DNA, written A, C, G and T | (bases are not named; "letters") | opening A9 |
| a copy of a gene | messenger RNA, mRNA | opening C5 |
| the machine that builds the copy | RNA polymerase | opening C5 |
| the machine that reads the copy and builds a chain | ribosome | opening E1 |
| a group of three letters | codon | opening E2 |
| the building blocks of a chain | amino acids | opening E2 |
| a protein that carries something across the membrane | transporter | opening F6 |
| the cell's energy currency, spent on everything | ATP | opening part 2, spine |
| machines inside the cell that break glucose down, releasing energy | enzymes ("glucose-processing enzymes") | opening F7 (a machine card, job first); part 2, spine (with ATP) |
| the sugar that proteins in the membrane carry into your cells | glucose | opening F3; part 2, Q5 adds "the everyday sugar" |
| the sugar in milk | lactose | part 2, Q6 |
| carries lactose in | lactose transporter (LacY) | part 2, Q7 card; 1.2 watch |
| splits lactose into two sugars, glucose and galactose | lactose-splitting enzyme (β-galactosidase, LacZ) | part 2, Q7 card; 1.2 task card |
| a protein that clamps the DNA so it cannot be copied | repressor (LacI) | 1.7 watch W1 |
| a lactose-shaped molecule the lactose machines make | allolactose | 1.7 watch W2 |
| the stretch of DNA the repressor clamps | operator | 1.7 design |
| machines that cut up worn-out proteins | proteases | 1.4 intro |

The two sugar machines keep one name each everywhere a student sees them: "glucose-processing
enzymes" and "lactose-splitting enzyme" (the slice's biology review, M2). Test ST-2
(`tests/story.test.js`) checks this table's order against the order of play.

Rules: gene symbols (*lacY*) appear only in muted italics after the plain name; numbers under
10,000 are digits in labels and counters but words in story lines where it reads better; units are
spelled out in lines ("minutes", "a second").

### 1.3 The narrative spine: the cell's economy

Taught in part 2 of the opening (§2.4.2, scenes S1–S9), then used by every level.

```
  outside:  sugar ─────┐
                        ▼
  membrane: [transporter]            (a machine; each sugar has its own)
                        ▼
  inside:   [enzymes] ──► ATP ◆◆◆   (energy currency; 2 ATP per glucose with no oxygen, as here)
                              │ spent on everything:
                              ├──► building proteins: about 4 ATP per amino acid (the biggest single cost)
                              ├──► other building (membrane, wall, DNA)
                              └──► upkeep
  genes ──► mRNA copies ──► ribosomes ──► new machines ──► wear out and are cut up
                                                   └──► enough machines, enough ATP: the cell grows and divides
```

**What each level asks inside the spine:**

| Level | The question in plain words | What the student sees happen to the cell |
|---|---|---|
| 1.1 | Glucose is all around, but it cannot get in. Which gene makes the machine that lets it in? | starving (energy low, slow growth) → fed (energy normal, growth back) |
| 1.2 | Milk sugar is coming. Can you get enough lactose transporters in place in time, without making far more than you use? | after the switch, the cell keeps growing on milk sugar, or stalls; extra copies show as energy spent |
| 1.4 | Transporters wear out. Can you keep enough to feed the cell without paying for extras? | too few: underfed and slow; enough: steady; too many: no more food comes in, and extra energy is spent |
| 1.7 | The sugars change and nobody can tell the cell. Can its own switch make the lactose machines only when they pay off? | growth on lactose phases, energy wasted in glucose phases |

**Numbers the spine may state (engine 1.1.0, reference cell, this session; Appendix A):** about
half a million glucose come in each second and about a million ATP are made and spent each second;
building proteins takes about 4 of every 10 ATP (the largest single share: `ledger` translation
40.6%, other building 27.4%, upkeep 26.6%); one transporter of about 450 amino acids costs about
1,800 ATP to build (4 ATP per amino acid, `c_tl`), the ATP from about 900 glucose at 2 ATP each
(this bacterium ferments; with oxygen, cells get far more, which a later unit covers; S3 says "with no
oxygen" so the 2 is not read as true of every cell).

### 1.4 The level pattern: Watch, Guess then see, Try, Explain

Every level from 1.1 on follows this pattern. The opening's part 2 is its first instance.

| Step | What the student does | Where | Gates | Scored |
|---|---|---|---|---|
| (1) **Watch** | watches the process up close, one step at a time | the Gene close-up (or Protein), on a watch cell the level builds | each step waits for a tap, a student action (a switch), or an observed model state; the run pauses itself when that state is reached | no |
| (2) **Guess, then see** | before a step, picks a plain-language guess; then sees what happens and why | the same screen | the guess is optional to change but must be picked before "See what happens"; feedback after the gate | no (logged; misconception flags recorded for the instructor, as now) |
| (3) **Try** | a small concrete task that uses exactly what was just seen, with the close-up still on screen | the run, tiered screen (§5) | the run's own goal and limit | yes: goal G and efficiency E |
| (4) **Explain** | 1–2 questions; feedback teaches | question sheets | each answered (retries allowed) | yes: D, first tap |

**Runner phases.** A new phase `watch` holds the steps (§2.4.3 gives the step schema). Phases for a
level become `intro, watch, task, run, result, debrief, echo, complete`; `predict` remains only for
Expert planning items. The old `demo` (1.2) is replaced by `watch`.

**Feedback wording.** Guesses: "What happened: {fb}" for every option, no ✓ or ✗. Explain
(debrief): a first wrong tap shows "Here is what actually happens: {fb}" and "Pick another."; the
right tap shows "Yes. {fb}". The words "Not quite" and the ✗ glyph go (Levels §5.4.1 changes).

**Scoring (proposal, open question 4).** P (predictions) leaves the Core score, because guesses now
teach rather than test:

`S = round(100 · (0.45·G + 0.25·G·E + 0.30·D_first/D_total))`

The completion code keeps its format (Levels §10.1) with `P` = `NA` for these levels; Expert
planning items (numbers, the 1.1 chain reading) go into the X bits. Flags from guesses stay (flags
never change the score). Each level's `version` is bumped.

**Task cards in plain terms** (template for every level, including the plain-language pass):

```
[machine card picture: what it does]          (§4.3; one or two cards)
Scenario, one line: what is happening to the cell, in everyday words.
Why it matters, one line: what happens to the cell if nothing is done.
Goal: a number, a place and a deadline, in plain words; the protein by its job, then its name.
Core:   1–2 lines, each a thing the student does ("Switch the gene off when …").
Expert: 1–2 lines, marked "Expert (required for majors)".
```

Rules: no gene symbol without its plain name first; no number band without the reason for its edges
("enough to feed the cell" / "more brings in no more food"); a deadline says what happens at it
("at minute 30 the glucose runs out").

### 1.5 The story: one thread with the lessons

**The rule.** Every story line does one of two jobs:
- **sets up** the question the student is about to explore: what the Commander wants to happen
  next, and why it matters to the cell; or
- **reacts** to what the student has just seen, naming the cause in plain words.

No line is there only for a joke (the dry humour lives inside lines that do one of the two jobs),
and no line uses a term or idea the student has not met yet (test ST-2 checks this against the
vocabulary of §1.2, in play order).

**The constant goal.** From Prologue 2 on, the Commander's goal never changes: *keep this cell fed
and growing, until it divides.* Each level is one step toward it, inside the economy of §1.3:

| Step | Level | What the Commander tries first (the naive expectation) | What the student sees instead | What the Commander takes away |
|---|---|---|---|---|
| The call | P2 | "I will give the orders." | A cell reads genes, not orders; one switched-on gene fed the cell, through copies and machines | "It did exactly what I told it." (not yet understood) |
| Get sugar in | 1.1 | "Order it to eat." | Glucose gets in only through a transporter sitting in the membrane; an inside protein cannot help | "I do not feed the cell. I switch on the gene for the machine that does." |
| Get enough transporters in time | 1.2 | "Build every transporter now, and stop when the milk arrives." | Transporters arrive minutes after the switch; copies keep delivering after it is off; extras cost energy | "The switch is only the start. The copies set the numbers." |
| Keep enough as they wear out | 1.4 | "Build a stockpile once, and keep it." | Transporters are cut up whatever is stored; a steady number needs steady making; more than enough brings no more food | "Nothing I build stays built." |
| Switch sugars without supervision | 1.7 | "I will switch the lactose genes on when milk comes, and off when it goes." | The sugars change without warning; the repressor switch flips because molecules fit | "Fine. I write the DNA, and after that I keep out of it." |

The letting-go arc is carried by what the student understands at each step, not announced: the
Commander never says "nobody is in charge" until the student has seen it happen, and the narrator
never says it at all.

**The cast** (three speakers; the others go):

| Speaker (label) | Teaching role | Lines per level (per play path) |
|---|---|---|
| Narrator | explains cause and effect, one sentence at a time; sets up each question | 3–6 |
| The Commander (label "You") | voices the student's naive expectation, just before the screen shows what really happens, so the correction lands on something the student may also have thought; ends each level with what they now understand | 1–4 |
| The Ribosome | shows the machinery's indifference and its universality (the same reader in every cell); it speaks only after it has been seen at work | 0–1 |

The glucose, protease and LacI speakers of the M2 levels are retired when those levels are
rewritten; their denial lines become narrator lines that state the cause ("Glucose got in because
it bumped into a transporter and fit."). Lint: a Commander line that matches the teleology regex
MUST be followed in the same beat by a narrator line (Levels §3.3 exception 1, unchanged).

**Tone.** Dry, understated and a little funny; never silly or solemn; plain words; no teleology
(molecules never want, decide, try, know or need); no exclamation marks. The funny part is always
the gap between what the Commander expects and what the cell does.

---

## 2. The opening, in two parts

### 2.1 Overview

| | Part 1: "How a gene becomes a machine" | Part 2: "A cell's economy" |
|---|---|---|
| Level id, code | `P` (code `P0`), content version 2 | `P2` (code `P2`), content version 1 |
| Time | about 7 min | about 6 min |
| Phases | `scenes`, `complete` | `scenes`, `watch`, `complete` |
| Pictures | drawings and exact sequence scenes (no engine) | drawings, then the live engine cell |
| Guesses | 2 (D1, F4) | 2 (E9, H5) |
| Story | §2.8.1 | §2.8.2 |
| Activities | letter fill, "copy again", codon decode | switch the gene on; zoom in |
| Cards | Gene, mRNA, Ribosome, Genetic code (all Universal) | No nucleus, One loop of DNA, Reading mRNA while it is made (Not in your cells); ATP (Universal) |
| Scored | no | no |

Both are listed on the home screen before 1.1 ("Prologue 1 · How a gene becomes a machine",
"Prologue 2 · A cell's economy"). Levels stay open in any order (Levels §14 decision 1); 1.1's task
card links "Watch Prologue 2 first" when P2 is not done (open question 9). Only a returning student
(one who has finished the part before) sees "Skip to the next activity" within a part, and it never
passes an unanswered activity; on a first play there is no Skip (it jumped from B1 past C3's U-for-T
rule: the phone play-through, PM6).

**Guess sheets on a phone** (PM7): a sheet with a guess to pick, a code table or an activity is a tall
sheet (up to 85% of the height, the drawing above it smaller), its line in a smaller size, "See what
happens" kept in reach at the bottom, and a fade at the bottom edge while more is below. All four D1
options and the button fit at 375 × 667. "See what happens" goes straight on to the scene that shows
what happens (D1 to D2's pore, F4 to F5's transporter; PB3): the student never sees the same still
again. Once an activity is done its prompt gives way to what happened: C4 "The machine copied the rest
of the gene, all {n} letters."; E3 "The ribosome read on, codon by codon, adding one amino acid each
time." (pm11).

**Codes.** The format of Levels §10.1 is unchanged. Both parts carry `G1`, `ENA`, `PNA`; `D`
carries how many of the part's two guesses were first picked on the explained cause, then the
total (`D02`, `D12` or `D22`), reported but not scored; the instructor's table labels that field
"guesses (not scored)". Example: `BTC1-P0-000000-G1ENAPNAD12X0-F01-A1N1-R111C2-000000-…`.

### 2.2 The exact sequence model

**Rule.** Every letter, copy, codon, amino acid and chain in parts 1 and 2 is computed from stored
sequence data by a small exact model at run time. Nothing is a canned picture of letters. Tests
(§10.1 SQ-*) check the model and the data.

**`BTC.seq`** (`src/shared/btc-seq.js`, UMD, no dependencies, pure, no randomness):

| Function | Behaviour |
|---|---|
| `CODE` | The standard genetic code (NCBI translation table 1) as a frozen object of 64 RNA codons → one-letter amino acid or `'*'` (stop). Built from the canonical 64-letter string `FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG` over the base order U, C, A, G |
| `AA` | one-letter → `{three: 'Met', name: 'methionine'}` for the 20 amino acids and stop |
| `dnaPartner(b)` | A↔T, C↔G (throws on anything else) |
| `rnaPartner(templateBase)` | across from DNA A → U, T → A, C → G, G → C |
| `complement(dna)`, `reverseComplement(dna)` | strings |
| `transcribe(coding)` | the mRNA: the coding strand with T → U; equal to `rnaPartner` over the template strand (tested) |
| `codons(rna, start)` | codon strings from index `start` |
| `firstStart(rna)` | index of the first `AUG` |
| `translate(rna, {from})` | reads codons from the first AUG (or `from`) until a stop; returns `{protein, startIndex, stopIndex, codons}` |
| `prefixChain(rna, nCodons)` | the chain a ribosome has built after `nCodons` codons (for the polysome picture) |
| `hydropathy(protein, w = 19)` | Kyte–Doolittle window means (Kyte & Doolittle 1982) |
| `oilyStretches(protein, {w: 19, min: 1.6})` | windows with mean ≥ 1.6, merged into stretches (the classic membrane-spanning criterion); used for the 1.1 chain clue and the visual language |
| `slice(protein, from, to)` | 1-based inclusive, for processing steps |

**Sequence data** (`src/shared/btc-seqdata.js`): frozen strings plus annotations and provenance.

| Key | Content |
|---|---|
| `INS.mRNA` | NM_000207.3, 465 letters as DNA (T), the mature mRNA without cap or poly-A tail: `AGCCCTCCAGGACAGGCTGCATCAGAAGAGGCCATCAAGCAGATCACTGTCCTTCTGCC` (5′ leader, 59) + the coding sequence (333) + `ACGCAGCCCGCAGGCAGCCCCACACCCGCCGCCTCCTGCACCGAGAGAGATGGAATAAAGCCCTTGAACCAGC` (3′ tail, 73) |
| `INS.cds` | positions 60–392 of the mRNA: `ATGGCCCTGTGGATGCGCCTCCTGCCCCTGCTGGCGCTGCTGGCCCTCTGGGGACCTGACCCAGCCGCAGCCTTTGTGAACCAACACCTGTGCGGCTCACACCTGGTGGAAGCTCTCTACCTAGTGTGCGGGGAACGAGGCTTCTTCTACACACCCAAGACCCGCCGGGAGGCAGAGGACCTGCAGGTGGGGCAGGTGGAGCTGGGCGGGGGCCCTGGTGCAGGCAGCCTGCAGCCCTTGGCCCTGGAGGGGTCCCTGCAGAAGCGTGGCATTGTGGAACAATGCTGTACCAGCATCTGCTCCCTCTACCAGCTGGAGAACTACTGCAACTAG` |
| `INS.protein` (tests only, `tests/fixtures/seq-uniprot.js`) | P01308, 110 aa: `MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN` |
| `INS.parts` | UniProt features: signal peptide 1–24; B chain 25–54; C-peptide 57–87; A chain 90–110; cleavage pairs RR 55–56 and KR 88–89; disulfides A6–A11 (95–100), A7–B7 (96–31), A20–B19 (109–43) |
| `INS.provenance` | `{uniprot: 'P01308 SV=1', refseq: 'NM_000207.3', cdsRange: '60-392', gene: 'NC_000011.10:2159779-2161209, minus strand, 11p15.5', checked: '2026-09-24 (copies of the records; direct check pending, §13)'}` |
| `L11.*` (1.1 chain clue) | the coding sequences of ptsG, lacY, lacZ, fliC and araE from *E. coli* K-12 MG1655 (NC_000913.3), and one representative amino-acid importer for the lumped aaImp (open question 13), each with its UniProt accession, length and UniProt's annotated transmembrane count; filled and checked when 1.1 is rebuilt (§12, phase 2) |

**What the model gives the scenes (computed, checked by SQ-3 to SQ-6):**
- The mRNA's first six letters are `AGCCCU`; across from them the template strand reads `TCGGGA`.
  The sixth letter is the first U, so the letter-fill activity meets "U takes the place of T" on its
  last letter.
- The first AUG is the start codon at mRNA position 60; the 5′ leader contains no AUG.
- The first codons read `AUG GCC CUG UGG AUG CGC CUC CUG CCC CUG CUG GCG` → M A L W M R L L P L L A.
- Translation from the first AUG gives exactly the 110 amino acids of P01308 and stops at UAG
  (codon 111).
- Cysteines sit at 31, 43, 95, 96, 100 and 109, which are B7, B19, A6, A7, A11 and A20.
- The Kyte–Doolittle 19-window maximum of preproinsulin is 1.56 (its signal peptide), just under
  the membrane threshold of 1.6, so the chain clue does not call insulin a membrane protein.

**Disclosed simplifications** (the "What is simplified" sheet of the opening, §2.6): the insulin
gene in your DNA is longer than the copy shown, because two stretches (introns) are copied and then
cut out before the mRNA leaves the nucleus (chapter 2); the real mRNA also gets a cap at its front
and a tail of many A's at its back; the ribosomes that make insulin sit on a membrane network next
to the nucleus (the ER), where the chain's first 24 amino acids dock them before they are cut off.

### 2.3 Part 1: "How a gene becomes a machine"

#### 2.3.1 The zoom ladder (scenes A0–A9)

Ten rungs from the student to the letters. Each rung is a drawing **to its scale bar**; anything
drawn larger than scale is labelled on the drawing and says what ("the copy drawn larger than scale"),
and no label sits on an outline or points at nothing (pm14). Drawings are inline SVG in
palette tokens (as today's Prologue), ≤ 6 KB each, pure (`svg(rung, text)`), light and dark.

| Rung | Drawing (content drawn to scale unless noted) | Field of view at 360 px | Scale bar | Line (exact student text) |
|---|---|---|---|---|
| A0 You | a neutral human outline, about 1.7 m | about 2 m tall | 50 cm | "This is you. Some of your cells are making a protein called insulin right now." |
| A1 Pancreas | the pancreas (about 15 cm) with stomach outline in muted ink; one islet marked by a ring because it is too small to see at this scale | about 20 cm | 5 cm | "This is your pancreas, about as long as your hand. The ring marks one tiny cluster of cells." |
| A2 Islet | a slice through one islet (about 150 µm), about 150 cells in section, beta cells tinted (about 55% of them, as in a human islet) | about 200 µm | 50 µm | "A slice through that cluster. After a meal, its beta cells release insulin into your blood." |
| A3 Beta cell | one beta cell (about 12 µm) in section: nucleus, insulin packets (about 300 nm, drawn to scale as 6 px dots) | about 15 µm | 5 µm | "One beta cell. Each small dot is a packet of insulin, ready to be released." |
| A4 Nucleus | the nucleus (about 6 µm) with its envelope, pores (about 120 nm) and chromosome regions; both chromosome 11s tinted ("your two chromosome 11s") | about 7 µm | 1 µm | "The nucleus holds the cell's DNA, split into 46 long threads called chromosomes." |
| A5 Chromosome 11 | one chromosome region (about 2 µm) as a loose tangle of thread; the insulin gene's place marked near one end; a note: "drawn far shorter: stretched out, this DNA is about 4.6 cm long" | about 2.5 µm | 500 nm | "This is one of your two chromosome 11s. In a cell that is not dividing, it is a loose tangle, not the X shape seen in pictures." |
| A6 Spools | DNA wound on protein spools (nucleosomes, about 11 nm) | about 100 nm | 20 nm | "The thread is DNA, wound around protein spools." (rung optional, open question 6) |
| A7 A stretch of DNA | DNA drawn straightened as a line; the insulin gene (1,431 letters on the chromosome) coloured, with "start" and "end" ticks; its real neighbourhood: the end of the next gene (tyrosine hydroxylase, which ends about 2,700 letters before the insulin gene starts) grey, labelled "the next gene", and DNA between genes; letters too small to show | about 5,000 letters (1.7 µm straightened) | 1,000 letters (340 nm) | "Along the DNA are genes. The coloured stretch is the insulin gene, one of about 20,000 genes for proteins in your DNA." |
| A8 Helix | the double helix at the start of the insulin instructions; strands in ink, pairs as rungs | about 20 nm | 2 nm | "DNA is two strands twisted around each other." |
| A9 Letters | the helix untwisted into a ladder with letters; 10–11 pairs across 328 px (30 px per pair) | about 3.7 nm | 1 nm | line 1: "Each strand is a chain of four building blocks, written A, C, G and T." · line 2: "Across the two strands, A always pairs with T, and C with G." |

A9's letters are the real sequence around the start of the instructions (`INS.mRNA` positions
52–62, `CTTCTGCC ATG`, drawn as DNA with its partner strand from `BTC.seq`). **Activity A9
(explore, not scored):** tapping any letter highlights it and its partner for 2 s with "A pairs
with T". The gate is the Next tap; the activity is optional.

**Zoom interaction (touch first).**
- **Closer** (primary, 48 px, bottom right of the sheet) and **Back** (44 px, bottom left) step one
  rung. Each rung also shows a pulsing 44 px ring on the thing to zoom into (the pancreas, the
  islet, the nucleus …); tapping the ring equals Closer.
- **Pinch:** a two-finger spread whose distance ratio passes 1.25 steps Closer; a pinch-in past
  0.8 steps Back. While the fingers move, the drawing follows up to ×1.3 or ×0.77 (live feedback),
  then snaps. `touch-action: none` on the drawing only; `pointercancel` restores the rung.
- **The ladder rail** (right edge, 28 px wide): one tick per rung, the current rung's name beside
  it ("Nucleus"), visited rungs filled. The whole rail is one 44 px-wide button that opens a
  "Zoom levels" sheet (ten 48 px rows); visited rungs can be jumped to, unvisited ones are listed
  but disabled on the first pass, so the story keeps its order.
- **Transitions:** 300 ms scale-and-crossfade centred on the ring; under reduced motion a 100 ms
  crossfade.
- **Laptop extras:** + / − and the arrow keys; the mouse wheel steps one rung per notch.
- **Gates:** none beyond the tap (these are teaching frames). A rung's line is shown before Closer
  is enabled (the sheet appears with the rung).

#### 2.3.2 A gene is a stretch of letters (scene B1)

Picture: A9's ladder scrolled so the **start of the instructions** is centred; the letters `ATG`
are boxed in the gene colour with a flag "start". The coding strand is labelled "the gene's
letters"; the other strand is drawn in muted ink.

- Line: "A gene is a stretch of these letters. The instructions for the insulin chain start here, at ATG."
- Gate: Next.

#### 2.3.3 Transcription (scenes C1–C5)

Model state: `k` = letters of the copy made so far (0 … 465), `copy = transcribe(INS.mRNA).slice(0, k)`.
The drawing: coding strand on top, labelled "the gene's letters (coding strand)", template strand
below, labelled "the strand the copy is built on (template strand)", opened into a bubble around RNA
polymerase (a ring-shaped machine, drawn to scale at about 13 nm across the bubble), the copy
growing out of the bubble with U drawn in the accent colour. A 10–11 letter window follows the
polymerase. A counter reads "letters copied {k} of 465". "Machine drawn smaller than scale" stays
on screen whenever the bubble is drawn, the run included (beside "shown at about real speed").

| Scene | Line (exact) | Interaction | Gate |
|---|---|---|---|
| C1 | "Not directly. To use a gene, the cell first makes a copy of it." (answers the Commander's line at B1, §2.8.1) | – | Next |
| C2 | "A machine opens the two strands and builds the copy one letter at a time, matching the letters of one strand." | polymerase moves to the gene's first letter (animation, 300 ms) | Next |
| C3 | "The copy pairs letters the same way, with one change: across from an A in the DNA, the copy has U, not T." | – | Next |
| C4 | prompt: "Fill in the copy. Which letter goes across from each DNA letter?" | **letter fill:** keypad A, C, G, T, U (five 56 × 48 px keys); six letters; the template letters are `T C G G G A`; each pick is checked by `rnaPartner` | all six placed |
| C4 run | "Let it run" button (48 px) | the polymerase copies the rest at 30 letters a second (about real speed for your cells; labels "shown at about real speed" and "machine drawn smaller than scale") | copy complete (`k = 465`), then Next |
| C5 | "The machine is called RNA polymerase. The copy is called messenger RNA, or mRNA." · "Built across from the other strand, the copy spells out the gene's letters, with U in place of T." | the finished copy peels away; the DNA closes | Next |

**Letter-fill feedback** (per pick; nothing is marked wrong; the right letter always goes in):
- right: the letter settles in place (no text).
- template A and the student picks T: "The copy has no T. Across from A, the copy has U."
- any other mismatch: "Across from {dna}, the copy has {rna}." (filled from `BTC.seq`).
The telemetry records each pick (§9).

#### 2.3.4 Export, and why a copy (scenes D1–D3)

Picture: zoom out one rung (the nucleus, A4's drawing, now with one mRNA near a pore).

The scene's line sets the picture up without voicing a guess option: "Here is the nucleus again,
with the finished copy near a pore." (The Commander's "Surely the gene goes out with it now" was
cut in the review: it pre-voiced option 2.)

**Guess D1** (logged; misconception flags as listed):
Prompt: "The copy is finished. What happens to the gene now?"

| Option (exact) | mc | What happened (fb, exact) |
|---|---|---|
| "It stays in the nucleus, and can be copied again." (the cause) | – | "The gene stayed put. Only the mRNA copy left, and the same gene can be copied again and again." |
| "It leaves the nucleus with the copy." | `DNA_DIRECT` | "The gene stayed put. Only the mRNA copy left, through a pore in the nucleus." |
| "It is used up by the copying." | `DNA_DIRECT` | "Copying left the gene as it was. The same gene can be copied again and again." |
| "It becomes part of the protein." | `DNA_DIRECT` | "The gene is never built into anything. The protein is built from the mRNA copy, out in the cell." (no "ribosome" before E1 names it) |

Then "See what happens": the mRNA passes through a pore (a process marker on a fixed path, 1 s);
the DNA stays. The gate is the marker's arrival (state of the scene model).

| Scene | Line (exact) | Interaction | Gate |
|---|---|---|---|
| D2 | "The mRNA leaves through a pore in the nucleus. The gene stays inside and can be copied again." | – | Next |
| D3 | "Tap to copy the gene again." | "Copy again" button (48 px); each tap runs one more transcription at 30 letters a second; counter "copies finished {n}" (C4's copy counts, pm12) | three copies made |
| D3b | "One gene can give many copies, and each copy can be read many times." | – | Next |

#### 2.3.5 Translation (scenes E1–E4)

Model state: `c` = codons read (0 … 111), `chain = prefixChain(mRNA, c)`. Drawing: the mRNA in the
cytoplasm with codon frames boxed, a ribosome (two subunits, about 25 nm, to the scale bar of
10 nm) over the current codon, the chain as beads with three-letter labels for the first eight
beads and plain beads after that.

| Scene | Line (exact) | Interaction | Gate |
|---|---|---|---|
| E1 | "Out in the cell, a machine called a ribosome reads the mRNA three letters at a time." | the ribosome slides from the leader to the first AUG | Next |
| E2 | "Each group of three letters, a codon, stands for one amino acid or for stop. Amino acids are the building blocks of a protein." | – | Next |
| E3 | prompt: "Which amino acid does this codon stand for?" | **codon decode**, twice (AUG, then GCC): a small code table of six 48 px rows, each a button with the name first (pm15): AUG methionine (Met), start · GCC alanine (Ala) · CUG leucine (Leu) · UGG tryptophan (Trp) · GGC glycine (Gly) · UAG stop; "Full table" opens all 64 codons from `BTC.seq.CODE` | both decoded |
| E3 run | "Let it run" | the ribosome reads the rest at 5 codons a second (about real speed for your cells; "shown at about real speed" stays for the whole run); the chain grows bead by bead; counter "amino acids {c} of 110" | stop codon reached |
| E3 end | "UAG means stop. The chain is finished: 110 amino acids, in the order the gene spelled out." | – | Next |
| E4 | "Several ribosomes can read the same mRNA at once, each a little further along." | four ribosomes drawn on the mRNA, each chain the computed prefix at its codon | Next |

Decode feedback (nothing marked wrong): a wrong row shows "Find {codon} in the left column: it
stands for {name} ({three})." above the rows (in view on a short phone, PM7) and the right row is
highlighted; the student taps it to continue.

#### 2.3.6 Folding, the job, and the machine (scenes F1–F7)

Pictures are schematic 2D folds in the language of §4, labelled "Shape drawn flat and simplified". The
order is the cell's: the first 24 amino acids (the signal) are cut off as the chain is made and
enters the ER, the rest (proinsulin) folds and forms its links there, and the middle piece is cut
out later, in the packets. Insulin is drawn in its own colour (the palette's `insulin`, the
prologue's `--gene`), not a lab gene's.
Chain membership and bonds come from `INS.parts` and the computed sequence (the cysteine pairs are
drawn as short links between the right beads).

| Scene | Picture | Line (exact) | Gate |
|---|---|---|---|
| F1 | the chain's first 24 beads faded aside ("cut away (24)"); the other 86 collapse into a folded blob (proinsulin) | "The first 24 amino acids are cut off as the chain is made, and the rest folds up on itself." | Next |
| F2 | the middle piece (the C-peptide with the pairs at its ends, 35 beads) cut out, faded ("cut away (35)"); two chains remain, joined by links | "A middle piece is cut out. What is left is insulin: two short chains held together by links." | Next |
| F3 | insulin in the blood; a muscle cell's membrane with its glucose carriers ("proteins that carry glucose"), and three more in small packets inside the cell with arrows up ("stored inside the cell") | "Insulin travels in your blood. Where it reaches muscle cells, stored proteins that carry glucose move into their membranes." (insulin moves stored transporters; it makes none; "transporter" is named at F6) | Next |
| F4 | a patch of membrane (oily middle shaded), glucose outside, no protein | guess F4 (below) | guess picked |
| F5 | a protein appears across the membrane: pocket open to the outside, glucose fits, shape change, glucose released inside (cycle at 0.8 s, shown repeatedly; labelled "shown much slower than in your cells": a real one carries about a hundred a second) | "This protein sits across the membrane. Glucose fits its pocket, the protein changes shape, and the glucose comes out inside." | Next |
| F6 | a bigger sugar (two joined hexagons) bumps the pocket and bounces off (the same "much slower" label) | "A bigger sugar does not fit this pocket, so it does not get through. A protein that carries things across a membrane is a transporter." | Next |
| F7 | a row of small machine cards: "Carries glucose across the membrane · Glucose transporter"; "Break glucose down, releasing energy · Glucose-processing enzymes"; "A signal in your blood: stored transporters move into muscle cell membranes · Insulin" | "Every protein is made this way, from its gene, including the transporters that let glucose into your cells." | Next → cards, completion |

**Guess F4** (logged):
Prompt: "Glucose is outside this membrane. Can it get through on its own?"

| Option (exact) | mc | What happened (fb, exact) |
|---|---|---|
| "No, not on its own." (the cause) | – | "The membrane's oily middle keeps glucose out. It crosses only through a protein that it fits." |
| "Yes, it slips through." | `MEMBRANE_OPEN` (new) | "It stayed outside. The membrane's oily middle keeps glucose out unless a protein it fits lets it through." |
| "Only when the cell wants it to." | `CELL_DECIDES` | "Nothing here lets it in on purpose. Glucose crosses only where a protein it fits sits in the membrane." |

The F-scene machine is the default "machine example" for the opening: a **glucose transporter in a
muscle cell (GLUT4)**, which ties insulin's job to transporters and sets up level 1.1 (open
question 1). Its picture follows §4 (alternating access: open outside → glucose bound → closed →
open inside → released).

**Cards collected at the end of part 1:** Gene · Universal; mRNA · Universal; Ribosome ·
Universal; Genetic code · Universal. Completion screen: "Next: Prologue 2" and "Levels".

### 2.4 Part 2: "A cell's economy"

#### 2.4.1 The bacterium and the two sugars (scenes Q1–Q7, drawings)

| Scene | Picture (to its scale bar) | Line (exact) |
|---|---|---|
| Q1 | a beta cell outline (12 µm) with a bacterium beside it (about 2 µm long), then zoom to the bacterium (Q2, Q3: about 2 × 1 µm to their 1 µm bar) | "This is a bacterium, much smaller than one of your cells. Bacteria of this kind live in your gut." |
| Q2 | a few of its ribosomes (labelled "a few of its many thousands of ribosomes") and an mRNA, same glyphs as part 1 | "It reads the same genetic code, with ribosomes that do the same job as yours." (not "the same kind": bacterial and human ribosomes differ, which the Magic bullet level depends on) |
| Q3 | its DNA: one loop, lying free in the cell, labelled "drawn far shorter: stretched out, this DNA is about 1.6 mm long"; no nucleus | "It has no nucleus. Its DNA is one loop of about 4.6 million letters, with about 4,300 genes, lying free in the cell." |
| Q4 | RNA polymerase making an mRNA from the insulin sequence, ribosomes already reading its front end (computed: ribosomes only on codons already copied) | "With no nucleus in the way, ribosomes start reading an mRNA while it is still being made." |
| Q5 | glucose glyph, large, with a blood drop and a bacterium | "Glucose is the everyday sugar. It is in your blood, and it is the sugar this bacterium uses first when it can." |
| Q6 | lactose glyph (two joined hexagons) with a milk glass | "Lactose is the sugar in milk. Some of it reaches the bacteria in your gut." |
| Q7 | two machine pairs, as cards (job first, no ATP yet: `cardsQ7`): "Carries glucose across the membrane · Glucose transporter" + "Break glucose down inside the cell · Glucose-processing enzymes"; "Carries lactose across the membrane · Lactose transporter" + "Splits lactose into two sugars: glucose and galactose · Lactose-splitting enzyme" | "Each sugar gets in through its own transporter. Lactose must also be split in two by its own enzyme before the cell can use it." (glucose needs no splitting) |

Q4's About row (tap to open): "Bacteria given an insulin gene with no cut-out stretches make its
chain; enzymes then cut it into insulin. Much insulin is made this way." (open question 8; "introns"
is never explained here, and about half of today's insulin is made in yeast, Baeshen 2014).

#### 2.4.2 The economy (scenes S1–S9)

One drawing, built up one piece per tap (the spine of §1.3), in the machine language of §4 and the
overview's glyphs (ATP a filled diamond, spent ATP hollow). The numbers come from the reference
cell (engine 1.1.0) and are filled from the calibration constants, not typed into the text.

| Scene | Adds to the drawing | Line (exact; `{…}` filled from constants) |
|---|---|---|
| S1 | the cell outline | "A cell runs as a small economy." (not "like": the lint forbids the word) |
| S2 | sugar outside, a transporter | "Food first: sugar gets in only through transporter machines in the membrane." |
| S3 | enzymes, ATP diamonds | "Enzyme machines inside break the sugar down and make ATP, the cell's energy currency." · "Here, with no oxygen, each glucose gives 2 ATP." (two lines) |
| S4 | ATP arrows to building, upkeep | "ATP is spent on everything the cell does. The biggest single cost is building proteins: about 4 ATP to join each amino acid on." |
| S5 | a transporter with a price tag ("450 amino acids" over "about 1,800 ATP") | "So one transporter costs about 1,800 ATP to build: the energy from about 900 glucose." (one number fewer, pm10) |
| S6 | gene → mRNA → ribosome | "Genes hold the instructions for every machine. mRNA copies carry them to the ribosomes." |
| S7 | a worn machine being cut up | "Machines wear out and are cut up, and new ones are made all the time." |
| S8 | the cell elongates and divides (drawing) | "When the economy runs well, the cell grows, copies its DNA and divides in two." |
| S9 | the live cell appears; the goal and the lever (§2.8.2), then guess E9 | "Your job: keep this cell fed and growing, until it divides in two." (and the lines of §2.8.2) |

**Guess E9** (logged):
Prompt (after the narrator's "Here is a cell with sugar all around it and no glucose
transporters."): "What will happen to its ATP?"

| Option (exact) | mc | What happened (fb, exact) |
|---|---|---|
| "It runs low, because little sugar gets in." (the cause) | – | "Its ATP ran low: without glucose transporters, only a trickle of sugar got in to be broken down." |
| "It stays high: sugar outside is enough." | `ENERGY_FIRST` | "Sugar outside makes no ATP. Only sugar that gets in and is broken down by enzymes does." |
| "It rises, because the cell saves energy." | `CELL_DECIDES` | "Nothing saves anything on purpose. ATP fell, because too little sugar got in." |

The feedback is shown after the live cell of §2.4.3 has shown it (step H4), so "What happened" is
literally true.

#### 2.4.3 The guided first experiment in the real engine (phase `watch`)

**Cell.** `config(v, 'watch')`: strain `m1-lab`, `start: 'birth'`, glucose 10 mM, `genes.ptsG =
{level: 'off', initial: {clear: true, protein: 0}}`, `flags: {backupGlucoseUptake: true, userGenes:
['ptsG']}`, seed `K.seedFor(deviceSeed, 'prologue2')`. It is the 1.1 starting state with names
shown and one gene in play. Not recorded as a scored run; its commands and gate ticks go to
telemetry.

**Screen:** tier T1 (§5): Cell view with the Gene and Protein close-ups available, focus gene ptsG,
an Off/On switch (On = ×2), two big counters (mRNA copies, transporters), the legend, the
narrator, and the guide's pointer. Speed 1 s = 10 s at the start; the guide offers "Speed up" (1 s
= 1 min) from H10.

**Step schema** (shared with every level's `watch` phase):

```js
{ id: 'h7', lines: [{who, text}], point: 'mrna:first' | 'ribosome:focus' | 'counter:protein' | 'glyph:membrane:ptsG'
    | 'marker:glucose' | 'gauge:energy' | 'control:promoter' | 'legend' | null,
  guess: {id, prompt, options: [{t, mc?, fb, cause?: true}]} | null,     // shown before the step's show
  act: {kind: 'command', expect: {type: 'setPromoter', gene: 'ptsG', on: true}} | {kind: 'zoom', to: 'gene'} | null,
  gate: {kind: 'tap'} | {kind: 'act'} | {kind: 'state', test: 'firstMRNA', gene: 'ptsG', pause: true},
  cause: 'one sentence shown after the gate' | null,
  offer: [{label, zoom: 'gene' | 'protein'}],                             // optional "Look closer" buttons
  wait: 'what the cell is doing while the step waits' | null,              // its own line, never a silent wait
  speed: 60 | {to: 60, test: 'watchedGoneOrOld'} }                         // the step moves the cell to 1 s = 1 min
```

**Waits** (the phone play-through, PM4): no step sits more than about 30 s of real time at the default
speed with nothing new on screen. A step's `wait` line is shown while it waits (in place of "Watching the
cell…" alone), and a step with `speed` moves the cell to that speed once (at once, or when its test turns
true) and says so in the callout: "Sped up: 1 s = 1 min." The callout keeps off what it points at: it goes
below or above the ring, inside the cell view, when its place would cover it (the pocket of the protein
close-up on a phone); it never covers the counters and the switch below the cell view. A step's `cellNote`
is said after its line only while the whole-cell view shows (H11's moving marks). While a callout shows,
the narrator bar under the cell is hidden (one voice at a time, PM2).

**State tests** (pure functions of `cell.observe()` and the step monitor, evaluated after every
tick by a monitor attached like a level's; when one turns true the loop stops after that tick and
the pointer appears; the same run replayed stops at the same tick):

| Test | True when |
|---|---|
| `firstTx` | `genes[g].nascent > 0` |
| `firstMRNA` | `genes[g].episode.firstMRNATick !== null` |
| `firstRibosome` | `genes[g].ribosomes ≥ 1` |
| `firstProtein` | `genes[g].episode.firstProteinTick !== null` |
| `inPlace` | `genes[g].protein ≥ 1` and the gene's location is membrane (a hollow membrane glyph is drawn) |
| `workOver(x)` | the gene's `work_perS` (§7) exceeds x × the side route's (glucose through PtsG beats the side route) |
| `energyNormal` | `energy.E > 0.7` for 30 consecutive ticks |
| `watchedGone` | the watched mRNA id is no longer in `mRNAIds` (§3.5) |
| `allMRNAGone` | `mRNA + nascent = 0` |
| `operatorFree`, `operatorBound` | `lac.operatorBound === 0` / `> 0` for 30 ticks (1.7) |

**The script:**

| Step | Pointer | Lines (exact) | Guess | Gate | Cause after the gate (exact) |
|---|---|---|---|---|---|
| H1 | the cell | "This cell is computed, not drawn by hand. Every mark on it comes from the model." | – | tap | – |
| H2 | legend | "Each dot stands for many molecules. The line under the cell says how many." | – | tap | – |
| H3 | side-route gates in the membrane | "Glucose is all around, but this cell has no glucose transporters. A trickle gets in by a slow side route." | – | tap | – |
| H4 | energy word | "So its energy is low and it grows slowly." | E9's feedback is shown here | tap | – |
| H5 | promoter switch | "This is the glucose transporter gene. It is off." | **H5 guess** (below) | guess picked | – |
| H6 | promoter switch | "Switch it on." | – | act: `setPromoter ptsG` on (accepted) | – |
| H7 | the first finished mRNA strand | "The first mRNA copy is finished. Each wavy strand is one copy." | – | state `firstMRNA` (pause) → tap | "The gene was copied first." |
| H8 | ribosome glyphs on it | "Ribosomes are reading it, each building one transporter chain." | – | state `firstRibosome` → tap; offer "Look closer" (Gene) | – |
| H9 | the transporter counter | "The first transporters are finished. Their count is here." | – | state `firstProtein` → tap | "Ribosomes built them from the copies." |
| H10 | a membrane glyph | "They sit across the membrane. A hollow mark means only a few so far." | – | state `inPlace` → tap; the cell moves to 1 s = 1 min ("Sped up: 1 s = 1 min.") | – |
| H11 | glucose markers | "Glucose now comes in through them." and, while the whole-cell view shows (`cellNote`), "Each moving mark stands for {N} glucose." (while it waits: "More transporters are being built. Glucose comes in faster as their number grows.") | – | state `workOver(1)` → tap; offer "Look at one transporter" (Protein) | "Glucose came in only once transporters sat in the membrane." |
| H12 | energy word | "With glucose coming in, energy is back to normal. Growth picks up over the next half hour." | – | state `energyNormal` → tap | – |
| H13–H14 | – | the closing story lines of §2.8.2 (the Commander's "It did exactly what I told it.", the narrator's cause, and the set-up for 1.1) | – | tap per line | – |

**Guess H5** (logged):
Prompt: "When you switch this gene on, what will you see first?"

| Option (exact) | mc | What happened (fb, exact) |
|---|---|---|
| "mRNA copies of the gene." (the cause) | – | "The gene was copied first. Transporters came next, and glucose got in only after that." |
| "Glucose coming in." | `DNA_DIRECT` | "Glucose came in only once transporters had been built and sat in the membrane, minutes later." |
| "Energy going up." | `ENERGY_FIRST` | "Energy rose last: it comes from glucose, and glucose waited for the transporters." |
| "New transporters in the membrane." | `OTHER` | "Transporters came second. Ribosomes can build them only from mRNA copies, so the copies came first." |

H5's feedback appears at H11, once glucose is coming in (at H9 the energy was still low: PM3): "What happened: …".

**If the student does something else** (not a gate, just honest handling): switching the gene off
during H7–H11 is allowed (the switch is real); the pointer then says "The gene is off, so no new
copies are started. Switch it on to carry on." (a step note, not narrator) and the current state
test keeps waiting. Nothing times out.

**Cards collected at the end of part 2:** No nucleus · Not in your cells; All its genes on one loop of DNA ·
Not in your cells; Reading mRNA while it is made · Not in your cells; ATP, the energy currency ·
Universal.

### 2.5 Screens and layouts

**Rung (compact 360 × 740):**
```
┌──────────────────────────────────────┐ 360
│ [≡ Levels]  How a gene becomes a     │ 44 px bar: Levels (44 × 44), title
│             machine                  │
├──────────────────────────────────────┤
│                                  ┬ You│ ladder rail (display; one 44 px button)
│        (beta cell drawing)       ● Pancreas
│                                  ● Islet
│         ◯ nucleus ring (44 px)   ◉ Beta cell   current
│                                  ○ Nucleus     not yet visited
│                                  ○ …
│ ├──── 5 µm ────┤ drawn to scale  ┴   │ scale bar (bottom left), words
├──────────────────────────────────────┤
│ NARRATOR                             │ bottom sheet ≤ 45% of height
│ One beta cell. Each small dot is a   │ 17 px line
│ packet of insulin, ready to be       │
│ released.                            │
│ [ ‹ Back ]              [ Closer › ] │ 44 px / 48 px
└──────────────────────────────────────┘
```

**Transcription with the letter fill (compact):**
```
┌──────────────────────────────────────┐
│ [≡ Levels]  How a gene becomes a …   │
├──────────────────────────────────────┤
│ the gene's letters (coding strand) → │ muted label, 13 px
│  A  G  C  C  C  T  C  C  A  G  G     │ 22 px letters, 30 px per pair
│  ╭──────────────╮ RNA polymerase     │ bubble (to scale, about 13 nm)
│  A  G  C  C  C  ?                    │ the copy; U in accent
│  ╰──────────────╯                    │
│  T  C  G  G  G  A  G  G  T  C  C     │ the other strand (template strand)
│ ├── 1 nm ──┤   letters copied 5 of 465│
├──────────────────────────────────────┤
│ Fill in the copy. Which letter goes  │
│ across from each DNA letter?         │
│ [ A ] [ C ] [ G ] [ T ] [ U ]        │ five 56 × 48 px keys
│ The copy has no T. Across from A,    │ feedback (after a pick)
│ the copy has U.                      │
│                     [ Let it run › ] │ enabled after six letters
└──────────────────────────────────────┘
```

**Codon decode (compact):**
```
│ mRNA … C U G C C │A U G│G C C│C U G│U G G … │ codon frames
│                  ⬭⬭  ribosome                │
│ chain  (Met)                                 │
├──────────────────────────────────────┤
│ Which amino acid does GCC stand for? │
│ [ AUG   Met (start)               ]  │ six 48 px rows, each a button
│ [ GCC   Ala                       ]  │
│ [ CUG   Leu                       ]  │
│ [ UGG   Trp                       ]  │
│ [ GGC   Gly                       ]  │
│ [ UAG   stop                      ]  │
│ [ Full table ]                       │
```

**Wide (1280 × 800):** the drawing on the left (max 760 × 600, centred), a 380 px right panel with
the line, the activity and Back/Closer; the ladder rail sits at the drawing's right edge with room
for full labels; keys and table rows keep 48 px.

**Guided experiment (compact, T1):**
```
┌──────────────────────────────────────┐
│ [Levels] [||] 3 min 20 s  [1 s = 10 s]│ status T1: pause, clock, speed only
├──────────────────────────────────────┤
│ [Cell•][Gene][Protein]               │ zoom control (§3.1)
│   ⬡      ⬡   ╭────────────╮   ⬡      │
│      ╭────── ▐ ▭ ≈≈≈  ◌    ▌ ─────╮   │ pointer ring (◌) with its callout:
│      │ "The first mRNA copy is     │  │ one line, ≤ 2 lines at 15 px
│      │  finished. Each wavy strand │  │
│      │  is one copy."   [ Next ]   │  │ 44 px
│      ╰─────────────────────────────╯  │
│ ├─1 µm · width ×2─┤                   │
├──────────────────────────────────────┤
│ mRNA copies  1      Transporters  0  │ big counters, 22 px numerals
│ [   Off   ][ •On  ]                  │ Off/On switch, 48 px
│ 1 dot = 1,000 proteins · 1 mRNA [Key]│ legend
├──────────────────────────────────────┤
│ Glucose is outside, but only a       │ narrator (as now)
│ trickle gets in by a slow side route.│
└──────────────────────────────────────┘
```

### 2.6 Disclosures ("What is simplified" sheet)

Reached from a 44 px "What is simplified" row on each part's completion screen and from the
opening's menu. Plain lines, one each. Part 1:
1. "The drawings of your body, pancreas and cells are to their scale bars, but simplified."
2. "Your insulin gene is longer than the copy shown: two stretches are copied, then cut out before the mRNA leaves the nucleus (chapter 2)."
3. "A real mRNA also gets a cap at its front and a long tail of A's at its back."
4. "Insulin's ribosomes sit on a membrane network next to the nucleus. The chain's first 24 amino acids dock them there, then are cut off."
5. "Protein shapes are drawn flat. Real proteins are three-dimensional; the fit between pocket and molecule is real."
6. "The copying and reading run at about the speed they do in your cells."

Part 2 (the bacterium's line moved here from part 1, where no bacterium has been met):
1. "The drawings of cells are to their scale bars, but simplified; what is not says so."
2. "Protein shapes are drawn flat. Real proteins are three-dimensional; the fit between pocket and molecule is real."
3. "The bacterium you run is a lab strain: each of its genes has its own switch."
4. "Each dot on the cell stands for many molecules; the line under the cell says how many."

### 2.7 Old Prologue parts that go

The old scenes 1–7, `p.q1` and the "Drawing, not to scale" caption are replaced. The flag
`PRED_DNA_DIRECT` (bit 0) is kept and is now raised by a first pick on a `DNA_DIRECT` option of D1
or H5 (so the instructor's key stays the same). New flag bits for P: 1 `PRED_MEMBRANE_OPEN` (F4), 2
`PRED_CELL_DECIDES` (F4); for P2: 0 `PRED_DNA_DIRECT` (H5), 1 `PRED_ENERGY_FIRST` (E9 or H5), 2
`PRED_CELL_DECIDES` (E9). The misconception registry gains `MEMBRANE_OPEN` ("Molecules such as
glucose cross the membrane by themselves").

### 2.8 The complete story text of the opening

Every line in play order. "Job" is the line's job under §1.5 (S = sets up the next question, R =
reacts to what was just seen and names the cause, T = teaches what is on screen). Narrator lines
marked T are the same strings as in the scene tables above; the Commander and Ribosome lines appear
only here and are added to the scenes' `lines` arrays in this order.

#### 2.8.1 Part 1: "How a gene becomes a machine"

| Scene | On screen | Speaker | Line (exact) | Job |
|---|---|---|---|---|
| A0 | the student's outline | narrator | "This is you. Some of your cells are making a protein called insulin right now." | T |
| A0 | same | You | "Good. Who gives the order to make it?" | S |
| A0 | same | narrator | "Watch and see." | S |
| A1 | pancreas | narrator | "This is your pancreas, about as long as your hand. The ring marks one tiny cluster of cells." | T |
| A2 | islet slice | narrator | "A slice through that cluster. After a meal, its beta cells release insulin into your blood." | T |
| A3 | beta cell | narrator | "One beta cell. Each small dot is a packet of insulin, ready to be released." | T |
| A4 | nucleus | narrator | "The nucleus holds the cell's DNA, split into 46 long threads called chromosomes." | T |
| A5 | chromosome 11 | narrator | "This is one of your two chromosome 11s. In a cell that is not dividing, it is a loose tangle, not the X shape seen in pictures." | T |
| A6 | spools (optional rung) | narrator | "The thread is DNA, wound around protein spools." | T |
| A7 | a stretch of DNA | narrator | "Along the DNA are genes. The coloured stretch is the insulin gene, one of about 20,000 genes for proteins in your DNA." | T |
| A8 | helix | narrator | "DNA is two strands twisted around each other." | T |
| A9 | letters | narrator | "Each strand is a chain of four building blocks, written A, C, G and T." | T |
| A9 | same | narrator | "Across the two strands, A always pairs with T, and C with G." | T |
| B1 | the start of the instructions | narrator | "A gene is a stretch of these letters. The instructions for the insulin chain start here, at ATG." | T |
| B1 | same | You | "So the gene is the instructions. Now it goes and makes the insulin." | S |
| C1 | the gene, closed | narrator | "Not directly. To use a gene, the cell first makes a copy of it." | R |
| C2 | polymerase at the gene | narrator | "A machine opens the two strands and builds the copy one letter at a time, matching the letters of one strand." | T |
| C3 | the bubble | narrator | "The copy pairs letters the same way, with one change: across from an A in the DNA, the copy has U, not T." | T |
| C4 | letter fill, then the run | – | (the activity's prompt and feedback, §2.3.3) | T |
| C5 | the finished copy | narrator | "The machine is called RNA polymerase. The copy is called messenger RNA, or mRNA." | T |
| C5 | same | narrator | "Built across from the other strand, the copy spells out the gene's letters, with U in place of T." | T |
| D1 | the nucleus with the copy | narrator | "Here is the nucleus again, with the finished copy near a pore." | S (guess D1 follows) |
| D2 | the copy leaves by a pore | narrator | "The mRNA leaves through a pore in the nucleus. The gene stays inside and can be copied again." | R |
| D3 | "Copy again" | narrator | "Tap to copy the gene again." | T |
| D3b | three copies | narrator | "One gene can give many copies, and each copy can be read many times." | R |
| E1 | ribosome on the copy | narrator | "Out in the cell, a machine called a ribosome reads the mRNA three letters at a time." | T |
| E1 | same | Ribosome | "I read whatever mRNA reaches me, three letters at a time. I have never once made a decision." | T |
| E2 | codon frames | narrator | "Each group of three letters, a codon, stands for one amino acid or for stop. Amino acids are the building blocks of a protein." | T |
| E3 | decode, then the run | – | (the activity's prompt and feedback, §2.3.5) | T |
| E3 end | the finished chain | narrator | "UAG means stop. The chain is finished: 110 amino acids, in the order the gene spelled out." | R |
| E4 | a polysome | narrator | "Several ribosomes can read the same mRNA at once, each a little further along." | T |
| F1 | folding | narrator | "The first 24 amino acids are cut off as the chain is made, and the rest folds up on itself." | T |
| F2 | cutting | narrator | "A middle piece is cut out. What is left is insulin: two short chains held together by links." | T |
| F3 | insulin at a muscle cell | narrator | "Insulin travels in your blood. Where it reaches muscle cells, stored proteins that carry glucose move into their membranes." | T |
| F4 | membrane, glucose outside | You | "Glucose is right there. Just let it in." | S (guess F4 follows) |
| F5 | the transporter at work | narrator | "This protein sits across the membrane. Glucose fits its pocket, the protein changes shape, and the glucose comes out inside." | R |
| F6 | a bigger sugar bounces off | narrator | "A bigger sugar does not fit this pocket, so it does not get through. A protein that carries things across a membrane is a transporter." | R |
| F7 | machine cards | narrator | "Every protein is made this way, from its gene, including the transporters that let glucose into your cells." | T |
| F7 | same | You | "I watched the whole thing. Nobody gave an order." | R |
| F7 | same | narrator | "Nobody did. A gene was copied, the copy was read, and the chain folded. Each step happened because molecules bumped together and fit." | R |
| F7 | same | narrator | "Next, a cell you can run yourself." | S |

#### 2.8.2 Part 2: "A cell's economy"

| Scene | On screen | Speaker | Line (exact) | Job |
|---|---|---|---|---|
| Q1 | beta cell and bacterium | narrator | "This is a bacterium, much smaller than one of your cells. Bacteria of this kind live in your gut." | T |
| Q2 | its ribosomes | narrator | "It reads the same genetic code, with ribosomes that do the same job as yours." | T |
| Q2 | same | Ribosome | "Different cell, same code, same job. I read what reaches me." | T |
| Q3 | its DNA loop | narrator | "It has no nucleus. Its DNA is one loop of about 4.6 million letters, with about 4,300 genes, lying free in the cell." | T |
| Q4 | copying and reading at once | narrator | "With no nucleus in the way, ribosomes start reading an mRNA while it is still being made." | T |
| Q5 | glucose | narrator | "Glucose is the everyday sugar. It is in your blood, and it is the sugar this bacterium uses first when it can." | T |
| Q6 | lactose | narrator | "Lactose is the sugar in milk. Some of it reaches the bacteria in your gut." | T |
| Q7 | two machine pairs | narrator | "Each sugar gets in through its own transporter. Lactose must also be split in two by its own enzyme before the cell can use it." | T |
| S0 | the bacterium | You | "A cell of my own. What does it do all day?" | S |
| S1 | the cell outline | narrator | "A cell runs as a small economy." | R |
| S2 | sugar, transporter | narrator | "Food first: sugar gets in only through transporter machines in the membrane." | T |
| S3 | enzymes, ATP | narrator | "Enzyme machines inside break the sugar down and make ATP, the cell's energy currency." | T |
| S3 | same | narrator | "Here, with no oxygen, each glucose gives 2 ATP." | T |
| S4 | spending | narrator | "ATP is spent on everything the cell does. The biggest single cost is building proteins: about 4 ATP to join each amino acid on." | T |
| S5 | a price tag | narrator | "So one transporter costs about 1,800 ATP to build: the energy from about 900 glucose." | T |
| S6 | gene → copy → ribosome | narrator | "Genes hold the instructions for every machine. mRNA copies carry them to the ribosomes." | T |
| S7 | a worn machine cut up | narrator | "Machines wear out and are cut up, and new ones are made all the time." | T |
| S8 | growth and division | narrator | "When the economy runs well, the cell grows, copies its DNA and divides in two." | T |
| S9 | the live cell appears | narrator | "Your job: keep this cell fed and growing, until it divides in two." | S |
| S9 | same | You | "Fed, growing, dividing. I will give the orders." | S |
| S9 | same | narrator | "A cell cannot read orders. It reads genes. Switching genes on and off is the one lever you have." | S |
| E9 | guess E9 | narrator | "Here is a cell with sugar all around it and no glucose transporters." | S |
| H1–H12 | the guided experiment | narrator | the step lines of §2.4.3, in order | T and R |
| H13 | energy back to normal | You | "It did exactly what I told it." | R |
| H13 | same | narrator | "You switched one gene on. RNA polymerase copied it, ribosomes read the copies, and the transporters let glucose in." | R |
| H14 | the cell, then six grey genes | narrator | "Next time this cell starts over with six unlabelled genes. One of them holds the instructions for the transporter." | S |
| H14 | same | You | "Then I will switch on the right one." | S |
| H14 | same | narrator | "First you will have to find it." | S |

The M2 Prologue's tone lines ("Congratulations. You are in charge of a cell.", "It has not been
informed.", "We will see.") are dropped: none of them set up or reacted to something on screen.

---

## 3. Close-up views in the live game

### 3.1 Zoom levels and the control

Three zoom levels in the Cell tab of the lab and of every level (compact), and in the cell view of
the other layouts:

| Zoom | Shows | Scale bar | Motion |
|---|---|---|---|
| **Cell** (today's overview) | the whole cell; dots at "1 dot = N" | "1 µm · width ×2" | jitter; flux markers (Lab spec §2.5–2.6) |
| **Gene** | the focus gene: its DNA, RNA polymerases, its mRNA copies with their ribosomes, new chains, where finished proteins go | a nice length chosen so the gene fits (100 nm or 200 nm) | jitter; process markers (below) |
| **Protein** | one of the focus gene's proteins doing its job | "2 nm" | the machine's cycle at the engine's per-copy rate, shown slowed with the factor printed |

**The control.** A three-segment control "Cell · Gene · Protein" as an overlay at the top left of
the stage (3 × 64 px wide, 44 px tall, panel background at 90% alpha), the current segment filled.
The "outside: 1 dot = …" chip stays at the top right in Cell zoom (it is not shown in the
close-ups). Also:
- **Pinch** on the stage: spread past ×1.25 → one level closer; pinch in past ×0.8 → one level out
  (discrete; live follow up to ×1.3, then snap). A two-finger gesture never changes the focus gene.
- **Tap chip:** tapping a strand, locus or protein in Cell zoom shows the chip as now, with a
  "Look closer ›" button (44 px) that opens the Gene zoom (for a protein: the Protein zoom).
- **Keys (laptop):** + and − step the zoom.
- Zoom is UI state: it is not a command, is not logged by the engine, and does not pause the run.
  It is kept per screen in `btc.ui.v1` (the lab) or in the level's autosave. `labConfig.zoom` sets
  which levels are allowed and the initial one (§5.1).
- Transition: 250 ms crossfade and scale centred on the focus gene's locus (Gene) or a protein
  glyph (Protein); none under reduced motion.

**What does not change between zooms:** the focus bar, legend line position, narrator and HUD. The
legend's content follows the zoom (Gene: "1 strand = 1 mRNA · 1 ribosome drawn = 1 [Key]";
Protein: "one {protein} of {count} · shown {k} times slower [Key]").

### 3.2 Cell zoom

Unchanged (Lab spec §2), with the tier rules of §5 deciding the overlays and the legend's length.
Membrane proteins keep their glyphs; a newly named or focused protein's glyph gains the machine
picture in the tap chip (§4.3).

### 3.3 Gene zoom

#### 3.3.1 What is drawn and where the numbers come from

Layout (portrait stage, top to bottom): outside (a band), the membrane (bilayer band, 12 px), the
cytoplasm with the polysomes, the gene's DNA near the bottom. Landscape stages rotate this 90° so
the DNA runs along the long axis.

| Element | Drawn as | Source (view path; §7 for new fields) | Count rule |
|---|---|---|---|
| The gene's DNA | double line in `--dna`, the gene body in the gene colour, 0.34 nm per letter at the stage's px/nm; one copy, or two stacked when `cell.dosage` = 2 | `genes[f].mRNA_nt` (3L + 60 letters, leaders included), `cell.dosage` | – |
| Promoter | bent arrow at the gene's front; named "copying starts here (promoter)" in the in-picture legend (beside the arrow when the legend has no room) | `genes[f].level`, `rate_perS` | – |
| Operator, CRP site (m2-lac) | the lac region's parts as in the 1.7 enlarged panel; LacI clamped on the operator while `lac.operatorBound > 0` for that copy | `view.lac` | 1 per copy |
| RNA polymerase | ring, to scale (about 13 nm across) or 6 px minimum, on the DNA at `progress × gene length` | `genes[f].nascent`, `nascentProgress[j]` | one ring per transcript in progress (all drawn; capped by `rnapFootprint` in the engine anyway) |
| Copy in progress | wavy strand growing from the ring, length ∝ progress | same | one per transcript |
| Ribosomes on a copy in progress (bacteria) | two-lobed glyph on the growing strand | `genes[f].tlCopies` (includes transcripts already past the start), the ribosome spread (below) | as for mature copies |
| mRNA copies | wavy strands in the gene colour, compressed to fit (disclosed); each keyed by molecule id | `genes[f].mRNAIds[0 … mRNA)`, `mRNABirthTick` | up to `MAXM` drawn (6 compact, 12 wide); the rest summarised |
| Ribosomes on each drawn copy | two-lobed glyph, to scale (21–25 nm) or 6 px minimum: the small subunit on the strand, the large one above it, the new chain leaving the large one's top (as in the opening's E-scenes; the cell view and the key use the same orientation) | total `genes[f].ribosomes`, shared over `tlCopies` | per drawn copy `round(ribosomes / tlCopies)`, remainder to copies in `hash(id, epoch)` order (the overview's rule) |
| Ribosome positions along a copy | at chain-progress values sampled from the gene's spread | `detail.ribosomeProgress[16]` (§7) | quantiles of the 16-bin spread, offset by `hash01('rp:' + id, k, epoch)` |
| New chains | beaded tail from each ribosome, length ∝ progress × L (1 bead per 20 aa), gene colour | the same progress values | one per ribosome |
| Chain into the membrane (membrane proteins) | the tail enters the membrane band as it grows (a thin line up to it); the ribosomes stay in their lanes, and the key says "Ribosomes making a membrane protein are held at the membrane; here they are drawn in lanes below it, for clarity." | `genes[f].location === 'membrane'` | – |
| Finished proteins | folded glyphs (§4) in their place: in the membrane band for membrane proteins, in the cytoplasm otherwise; up to 8 drawn, then "+{n} more" | `genes[f].protein` | `min(8, round(protein))` |
| "New protein" marker | a short fold animation at a ribosome's end (process marker, below) | `genes[f].synthesis_perS` via `FluxEmitter` | the emitter's count (exact over time) |
| mRNA broken down | the strand breaks into fragments that fade (process marker, 0.6 s render time) at the place of the molecule whose id vanished | id set difference between frames | one per vanished id |
| Protein cut up (1.4) | broken outline fragments at a finished glyph (process marker) | `genes[f].degraded_perS` via `FluxEmitter` | exact over time |

**Summary line** (top right, 13 px, the disclosure that honest scale requires): "showing {d} of {m}
mRNAs" when capped; "{n} ribosomes on {m} copies" otherwise.

**Scale and size.** `pxPerNm = clamp((stageLong − 32) / (geneLetters · 0.34), 0.25, 3)`. Ribosomes
and polymerases are drawn to scale when that is ≥ 6 px, else at 6 px with "ribosomes drawn larger
than scale" added to the key. mRNA strands are compressed to fit: a strand of ℓ letters (about 0.6
nm each when stretched) is drawn with a path length of `min(0.6·ℓ·pxPerNm, 0.45·stageShort·2)`; the
key says "mRNA drawn folded and shorter than it is". Positions of copies are schematic (hash-placed
lanes); the key says "Where each copy sits is drawn for clarity."

**Process markers (an extension of the motion rule, open question 2).** Lab spec §2.6 allows only
jitter and membrane-crossing markers. The close-ups add *process markers*: an event counted by an
engine flux (a chain finished, an mRNA broken down, a protein cut up) is shown as a short
animation **in place**, on a fixed path, lasting 0.6 s of render time, one marker per N events at a
scale given in the key. Nothing moves toward anything: membrane proteins are drawn being built at
the membrane (in bacteria their ribosomes are held there while the chain goes in), so no finished
protein travels to the membrane.

**What the model does not track, and how the drawing stays honest.** The engine counts ribosomes
per gene (cohorts by start position), not per mRNA. The close-up spreads the gene's ribosomes
evenly over its copies (which is exactly the model's assumption: every translatable copy gets the
same share of initiations, Engine §7.5) and places them along each copy at the gene's measured
spread of chain progress. The key says "The model shares ribosomes evenly among a gene's copies."

#### 3.3.2 Budgets and too many to draw

- Hard cap 600 glyphs per Gene frame (the overview's is 1,500). Order of giving way: finished
  proteins (8 max), then mRNA copies (drawn copies drop from 6 to 4 to 2), then ribosome glyphs per
  copy (from one per ribosome to one per 2, 5, 10, with the key updated: "1 ribosome glyph = 5"),
  then chain beads (tails drawn as lines). RNA polymerases and the watched mRNA (§3.5) are never
  dropped.
- Which copies are drawn: the watched copy (if any), then the youngest copies by birth tick (so new
  copies appear where the student is looking), filling lanes; a copy keeps its lane while it lives.
- A gene with no copies and no transcripts shows its DNA and promoter and the line "No copies of
  this gene right now." (tier-1 plain text, 15 px, centred).

#### 3.3.3 Wireframe (compact 360 × 740, in a level with the HUD)

```
┌──────────────────────────────────────┐
│ [Levels] [||] 12 min   [1 s = 10 s]  │ status (tier T3; energy and growth words on row 2)
├──────────────────────────────────────┤
│ 2,140 / 5,000 transporters · milk in 18 min│ HUD 44 px (goal · timer)
├──────────────────────────────────────┤
│ [Cell][•Gene][Protein]  showing 4 of 38 mRNAs│ zoom control, summary
│ outside                               │
│ ═▮═══▮▮════▮═════▮══════▮═══ +2,134 more │ membrane with finished transporters
│   ╲│   ╲│╱    chains going into the membrane│
│  ⬭─⬭──⬭──⬭~~~~~  this copy: 7 transporters│ the watched copy (outlined)
│  ⬭──⬭─⬭~~~~~~~~~~                          │
│  ⬭~~~~~~ ⬭─⬭~~~~                            │
│  ~~~~~⬭~~~~ ⸗ (broken copy fading)          │
│ ══◯═══◯═════════════════ lacY ▶  ↱ promoter│ DNA with two RNA polymerases
│    ╲~~   ╲~~~~   copies being made          │
│ ├─ 100 nm ─┤  mRNA drawn folded, shorter    │ scale bar, disclosure
├──────────────────────────────────────┤
│ mRNA copies 38        Transporters 2,140│ big counters (T1–T3)
│ [    Off    ][   • On   ]            │ Off/On, 48 px
│ 1 strand = 1 mRNA · 1 ribosome drawn = 1 [Key]│
├──────────────────────────────────────┤
│ Ribosomes read each copy one after   │ narrator
│ another until it is broken down.     │
├──────────────────────────────────────┤
│ [ ◉ Cell ]       [ Graph ]           │ tab bar (tier T3: two tabs)
└──────────────────────────────────────┘
```

At 1280 × 800 the Gene zoom fills the cell-view area (about 900 × 400, landscape): up to 12 copies
in two columns of lanes, the DNA along the bottom.

### 3.4 Protein zoom (the machine view)

#### 3.4.1 Rules

- One representative molecule of the focus gene's protein, drawn in the language of §4 at 2 nm =
  60 px (compact). Its label: "one {protein} of {count}" ("one of 13,210").
- **Rate:** the engine's per-copy work rate `r = genes[f].workPerCopy_perS` (§7): glucose carried
  per PtsG per second, lactose per LacY, lactose split per LacZ tetramer, hexose per lumped enzyme
  copy, amino acids per importer. The picture runs cycles at `r / k`, where `k` is the smallest of 1,
  10, 100, 1,000, 10,000 that puts one cycle between 0.6 and 3 s of real time; the line under the
  picture says "Carries about {r} glucose molecules a second. Shown {k} times slower than real life." (`r` to 2 significant
  figures). If `r = 0`, no cycle runs, and the line gives the reason from the facts: "No glucose
  outside." / "Nothing here fits it." / "Energy is too low for it to work." (lint-safe, no digits).
- **Simulated time:** the cycle advances only while the simulation runs (render time frozen when
  paused, as for markers); at game speeds above real time the per-copy rate is still the real one
  (a single molecule's cycle cannot be shown at 60× its real speed), and the line states both
  ("Shown {k} times slower than real life; the cell itself runs at 1 s = 1 min."). Where the model's
  per-copy rate is far from a measured one, the key sheet says so (LacY: "Rates are the model's; a real
  lactose transporter carries about twenty a second."; BIOLOGY.md open item 8).
- **Which state is drawn:** the cycle's phase is deterministic, `phase = frac(tRender · r / k)`.
  For a population state (LacI bound or not, allolactose in its pocket or not), the drawn molecule
  takes the state with a deterministic draw per display period: `hash01('m:' + gene, period, epoch)
  < share`, where `share` comes from the view (`operatorBound / operatorCopies`, `1 −
  activeLacI / lacITetramers`), and holds it for the period (2 s). The key says "One molecule, drawn
  at the average rate of all of them."
- **A molecule that does not fit:** when a non-substrate is present outside or inside where the
  protein works (lactose at PtsG; glucose at LacY; any sugar at the amino-acid importer), one such
  molecule is drawn bumping the pocket's rim and bouncing off on a fixed path every 1.5 s of render
  time, with the line "Lactose does not fit this pocket." When none is present, a 44 px row "What
  does not fit?" shows a still picture of the nearest non-substrate at the rim (labelled "picture,
  not the model").

#### 3.4.2 The machines

| Gene | Machine picture (§4) | Cycle states (the work) | Rate `r` (per copy, from §7) | Non-fitting molecule shown |
|---|---|---|---|---|
| ptsG | membrane protein, pocket open to the outside, glucose-shaped | open out → glucose bound → closed → open in → released inside as glucose with a phosphate tag (G6P), because PtsG tags glucose as it carries it | PtsG's share of glucose in ÷ PtsG copies (≈ 41/s in the reference cell) | lactose (too big) |
| lacY | membrane protein, lactose-shaped pocket, a proton site | open out → lactose + proton bound → open in → released | `lactoseIn / LacY` | glucose (does not fit the galactose end) |
| aaImp (lumped) | membrane protein, triangle pocket | as ptsG, with an amino acid | `aaImported / aaImp` ("stands for about 10 importers") | glucose |
| araE (1.1 decoy) | membrane protein, arabinose-shaped pocket | open out ↔ open in, empty | 0 (no arabinose ever present): "No arabinose here." | glucose bounces off |
| lacZ | four-chain cluster drawn to scale with its sugars (about 17.5 × 13.5 nm, Jacobson 1994), active site in a groove | lactose bound → split → glucose + galactose released | `lactoseSplit / (LacZ/4)` per four-chain enzyme | none (glucose, its own product, binds its pocket too, so it is not shown bouncing off) |
| gly (lumped) | one enzyme drawn, "stands for about 10 enzymes" | a sugar piece bound → changed → released, with ADP → ATP at the steps that make ATP | `hexoseToGlycolysis / gly` in hexose per copy (the engine's unit, stated) | lactose |
| aaSyn (lumped) | one enzyme drawn, "stands for about 100" | sugar pieces + ATP → amino acid | `aaMade / aaSyn` | – |
| fliC | a rod-shaped subunit with matching faces top and bottom | in a real cell: copies stack into the swimming tail (dashed ghost labelled "in a cell with the other flagellum genes"); here: "Made, but not exported: it does no work here." | 0 | – |
| lacI (1.7) | a V of two clamp heads over the operator DNA, an allolactose pocket in each arm | clamped on the operator ↔ allolactose in the pocket → shape change → released | state, not a rate: bound share and inducer share (§3.4.1) | glucose (does not fit the pocket) |
| lacA (1.7) | three-chain cluster | none shown ("does no work that matters here") | 0 | – |

#### 3.4.3 Wireframe (compact)

```
├──────────────────────────────────────┤
│ [Cell][Gene][•Protein]  one of 2,140 │
│ outside        ⬡⬡ lactose            │
│                 ↘                    │ fits: drawn into the pocket
│ ════════╗  ◠◡  ╔═════════ membrane   │
│         ║ ⬡⬡ ⊕ ║   lactose transporter│ protein outline, pocket, proton site
│ ════════╝      ╚═════════            │
│ inside     ⬡ → ⬡⬡ glucose bounces off│ non-fitting molecule (fixed path)
│ ├── 2 nm ──┤  shape drawn flat       │
│ Carries about 50 lactose molecules a │ 15 px lines
│ second. Shown 20 times slower than … │
├──────────────────────────────────────┤
│ (focus bar, legend, narrator as in the Gene zoom)
```

### 3.5 The watched mRNA

A level step, or a tap on a strand in the Gene zoom ("Watch this copy", 44 px), marks one mRNA
molecule as **watched**. Its strand is outlined and labelled "this copy: {n} transporters" (the protein's
one-word noun, singular for 1; "chains" for a machine of several chains).

`BTC.MRNAWatch` (`src/shared/btc-mrnawatch.js`, pure, attached per tick like the Recorder, so the
count is exact whatever the frame rate, and replays identically):
- keeps the watched id, its birth tick, and a small queue of `(D0, share)` entries;
- each tick while the id is in `mRNAIds`: `share = tlStarts_perS · dt / tlCopies` (this copy's share
  of the gene's new ribosomes, the model's own even split), pushed at `D0 = ribosomes.odometer_aa`;
- each tick: entries with `odometer_aa − D0 ≥ L` are finished and added to `made`;
- after the id vanishes (broken down), entries already started still finish (the model finishes
  chains on a decayed copy), then the count stops: "this copy: {round(made)} transporters, then broken
  down after {t}".
It exposes `{id, made, started, alive, lifetime_s}` and `save()` / `restore()` for the level
autosave. The count is the model's expected share (fractional, shown rounded); the key says "The
count adds up this copy's share of the ribosomes."

### 3.6 Narrator in the close-ups

The narrator line stays one causal sentence. Close-up rules (keys `z.*`, full template lint, no
digits) take priority over the lab's rules 16a–16g only while their zoom is shown:

| Key | When (zoom, state) | Template (exact) |
|---|---|---|
| `z.gene.off` | Gene; the focus gene off, no copies | "{G} is switched off, so no copies of it are being made." |
| `z.gene.tx` | Gene; nascent > 0, no mature copies yet | "RNA polymerase is copying {G}; ribosomes already read the front of each copy." |
| `z.gene.polysome` | Gene; copies > 0 and ribosomes ≥ copies | "Ribosomes read each copy one after another until it is broken down." |
| `z.gene.leftover` | Gene; gene off, copies > 0 | "{G} is off, but the copies already made are still being read." |
| `z.protein.work` | Protein; r > 0 | "{N} fits what it carries, changes shape and lets it through, over and over." (split per machine kind: transporter, enzyme, repressor) |
| `z.protein.nofit` | Protein; a non-substrate present | "Molecules that do not fit {N} bump into it and move on." |
| `z.protein.idle` | Protein; r = 0 | "{N} sits ready, but nothing it fits is here." |

`{G}`/`{N}` expand to hidden-name forms in 1.1 ("gene C", "protein C").

### 3.7 Hit testing, key sheet, accessibility, reduced motion

- Hit testing in the close-ups uses the same 8 × 8 grid, rebuilt with the glyph buffer: a copy ("mRNA
  copy, made 2 min ago"), a ribosome ("ribosome, chain 60% built"), a polymerase ("RNA polymerase,
  copy 35% made"), a protein ("glucose transporter, in the membrane"), the DNA ("the ptsG gene").
- The key sheet gains a section per zoom (glyphs, the scale rules, the disclosures above).
- The canvas `aria-label` states the zoom and the counts ("Gene view of the lactose transporter
  gene: 38 mRNA copies, 212 ribosomes, 2,140 transporters").
- Reduced motion: no jitter; process markers drawn still and faded; the Protein zoom shows its
  cycle as a strip of four still panels (open out, bound, open in, released) with the rate line,
  and the current phase outlined, advancing one panel per 2 s of render time.
- Two paused frames are pixel-identical in every zoom (test ZC-6).

---

## 4. A flat picture language for protein machines

### 4.1 Grammar

| Idea | Drawn as |
|---|---|
| A chain | a string of beads in the gene colour, 1 bead per amino acid in the opening, 1 bead per 20 amino acids in the Gene zoom |
| Oily (water-avoiding) stretches | thicker beads with a hatch (not colour alone), placed where `BTC.seq.oilyStretches` finds them; in a membrane protein they sit inside the membrane's oily middle |
| Fold | the chain collapses (300 ms, or none under reduced motion) into a rounded outline: gene colour at 25% fill, 2 px outline |
| Pocket | a notch in the outline whose shape is the complement of its substrate's outline (§4.2) |
| Binding surface | a flat face with a matching pattern: two "fingers" the width of the DNA groove (LacI), a top face matching a bottom face (flagellin) |
| Shape states | two to four named outlines per machine (open out, closed, open in; clamped, released); a change is a 150 ms morph |
| Fit | a molecule is drawn inside a pocket only when (1) it is on the machine's substrate list and (2) the engine's rate for that job is above 0 |
| No fit | a non-substrate touches the rim and bounces off on a fixed path; never drawn inside the pocket |
| Work | the shape change is what moves or changes the molecule; the picture never shows a molecule moving without a shape change |
| Wear | broken outline fragments that fade (process marker; 1.4) |
| Energy | ATP a filled diamond, ADP a hollow one, as in the Cell zoom |

### 4.2 Molecule outlines (Protein zoom and opening)

| Molecule | Outline |
|---|---|
| glucose | a hexagon with one short arm (its sixth carbon) |
| glucose with a phosphate tag (G6P, from PtsG) | the same with a small circle "P" on the arm |
| galactose | a hexagon with the arm drawn on the other side |
| lactose | galactose and glucose joined by a short link |
| allolactose | the same two joined by a bent link |
| arabinose | a hexagon with no arm |
| amino acid | a small triangle |
| proton | a small circle with "+" |

Outlines are schematic and say so in the key ("Molecules drawn as simple outlines").

### 4.3 Machine cards

A reusable component (`BTC.MachineCard`), 96 × 96 px picture plus two lines, used on task cards,
gene cards (a revealed gene, or any gene with names shown), the key sheet, the opening's F7 row and
the tap chip:

```
┌────────────┐  Carries glucose across the membrane.   ← what it does (first)
│  ═╗◠◡╔═    │  Glucose transporter · ptsG             ← name, then symbol (muted italics)
│   ║⬡⌐║     │  Works in the membrane                  ← where
└────────────┘
```
In hidden-name levels the card shows only what has been seen: "Gene C · its protein sits in the
membrane · job not seen yet".

### 4.4 Hooks for level 1.5 (mutations change the fold)

- A `fold` object for a short model chain: `{beads: 'HPPHHP…', path: [[x, y], …] (2D square lattice,
  self-avoiding), pocket: [bead indices], works: bool}`. `BTC.machineFold.energy(fold)` counts H–H
  contacts (the HP lattice model); `BTC.machineFold.best(beads)` finds the lowest-energy fold by
  exhaustive search for chains ≤ 16 beads (deterministic, cached).
- A mutation changes a bead (H ↔ P), inserts a stop (the chain ends) or shifts the frame (the rest
  of the beads change); the renderer draws the new fold in the same language; the pocket either
  keeps its shape (the protein works) or not.
- The level 1.5 spec decides how model folds map to the engine's `activity` per gene
  (`genes.<id>.activity`, already an inert genome field, Engine §13.1).

---

## 5. The tiered interface

### 5.1 `labConfig.ui` (extends Levels §5.5.1)

```js
labConfig.ui = {
  tier: 1,                                    // 1–5, or 'all' (the full M1 lab)
  status: { clock: true, speed: true, energy: false, growth: false, generation: false, doubling: false },
  zoom: { levels: ['cell', 'gene', 'protein'], initial: 'gene' },
  focusBar: { counters: ['mRNA', 'protein'], control: 'onoff' | 'dial', onLevel: 2 },
  tabs: ['cell'] | ['cell', 'graph'] | ['cell', 'genes', 'graph'] | …,   // 'graph' is the single simple graph
  graph: { series: [{gene, kind: 'protein' | 'mRNA'}], target: {y, label} | null, zone: {lo, hi, labels} | null,
           marks: [{t, label}], window: 'fit' },                          // no chips, no lin/log, no window row
  genesPanel: 'simple' | 'full',
  mediumPanel: 'hidden' | 'simple' | 'full',
  spendBar: false,
  legend: 'short' | 'full',
  introduce: ['counter.mRNA', 'counter.protein', 'legend', …],          // ids of §5.2 introduced on this screen
}
```

When `ui` is absent (old level files), the full M1 lab is shown, so nothing breaks while levels are
migrated. The speed chip (time compression) is shown in every tier: honest scale requires it.

### 5.2 Readouts, and the sentence that introduces each

When a readout first appears for a student, the guide points at it once with its sentence (a
callout with Next, gated on the tap); `progress.introduced[id] = true` so it is not repeated. The
key sheet lists every readout with the same sentence.

| Id | Readout | Introducing sentence (exact) |
|---|---|---|
| `counter.mRNA` | big counter "mRNA copies {m}" | "This counts the mRNA copies of this gene in the cell right now." |
| `counter.protein` | big counter "{Protein plural} {n}" | "This counts the finished {proteins} in the cell." |
| `counter.made` | "copies made {M}" | "This counts every copy made since the start, including ones already broken down." |
| `legend` | "1 dot = N …" | "Each dot stands for many molecules. This line says how many." |
| `status.energy` | the energy gauge with its word | "This bar is the cell's energy, its ATP. It runs low when too little sugar gets in." |
| `status.growth` | "growing normally / slowly / not growing" | "This says how fast the cell is growing now." |
| `readout.sugarIn` | "sugar coming in: plenty / some / a trickle / none" | "This says how much sugar is getting into the cell." |
| `graph.protein` | one line: this protein over time | "This line is the number of {proteins} over time." |
| `graph.target` | a dashed target line | "The dashed line is the number you are aiming for." |
| `graph.zone` | shaded zone with its two edges labelled | "Inside the shaded zone the cell has enough {proteins}, and not more than it can use." |
| `counter.rates` | "made {a} a minute · cut up {b} a minute" | "These count how fast {proteins} are made and how fast they are cut up." |
| `control.dial` | the six-step promoter dial | "This dial sets how often RNA polymerase starts copying the gene: ×2 is twice as often as ×1." |
| `bands.phases` | sugar phase bands on the graph | "The shaded bands show which sugars were outside at each time." |
| `status.doubling` | "doubling ≈ 98 min" | "This is how long the cell takes to double in size." |
| `graph.chips`, `graph.log`, `graph.window`, `spendBar`, `status.generation` | the M1 controls | shown only with "All controls" (§5.4) until a later level introduces them |

### 5.3 Level by level

| | P1 | P2 (guided) | 1.1 | 1.2 | 1.4 | 1.7 | Lab: Simple | Lab: All controls |
|---|---|---|---|---|---|---|---|---|
| Tier | 0 (drawings) | 1 | 2 | 3 | 4 | 5 | 4 | all |
| Status strip | – | pause, clock, speed | + energy word, growth word | same as 1.1 | same | same | same | M1: + generation, doubling, device limit |
| Zooms | – | Cell, Gene, Protein; opens on Cell | all; opens on Gene for the watch, Cell for the run | all; opens on Gene | all; opens on Gene | all; opens on Gene (lac region) | all; opens on Cell | all |
| Focus bar | – | 2 big counters; Off/On | 2 big counters; Off/On per card | watch: 3 counters (copies now, copies made, transporters); Try: 2 (copies now; transporters with "+ about {x} on the way" under them); Off/On | counters + rates; the dial | read-only in the run | 2 counters; the dial | M1 focus bar |
| Tabs | – | Cell | Cell, Genes (simple), Medium (simple) | Cell, Graph | Cell, Graph | Cell, Graph (design editor before the run) | Cell, Genes, Medium, Graph | M1: Cell, Genes, Medium, Graphs |
| Graph | – | none | none | one line: transporters; target line; "milk arrives" mark | one line: transporters; the enough zone | two lines (lac proteins, LacI) with sugar bands | one line: focus gene's protein | M1 graphs, chips, lin/log, window, scrub, spending bar |
| Medium | – | fixed | lactose and amino acids (Expert), as now | fixed (schedule) | fixed | schedule | glucose, lactose, amino acids | + drugs |
| New readouts introduced here | – | `counter.mRNA`, `counter.protein`, `legend`, `status.energy` (H4) | `status.growth`, `readout.sugarIn` | `counter.made`, `graph.protein`, `graph.target` | `graph.zone`, `counter.rates`, `control.dial` | `bands.phases` | – | the rest |

Later levels (M3) introduce the others: the spending bar in 1.3 ("where the ATP goes"), the doubling
time and log scale in 1.9.

### 5.4 The free-play lab: Simple and All controls

- The lab opens in **Simple** (tier 4) the first time; a 44 px "All controls" switch in the Medium
  panel's header (compact) or the status strip (wide) turns on the full M1 lab; the choice is kept
  in `btc.ui.v1` (`labMode: 'simple' | 'all'`) and logged (`ui_mode`).
- Simple keeps every lever that changes the cell (all seven dials, the medium), so free play is not
  weakened; it hides only readouts and graph options.
- `?lab=1&all=1` opens All controls (think-aloud and instructor use).
- The lab's first focus is the glucose transporter (it is on and working at the start; the flagellum
  protein, the old default, is off and does no work here), and the first time the lab opens in Simple
  one guide line points at the dial: "Try a gene: switch one on or off, run the cell, and watch its
  copies and its protein." It goes with its button or the student's first action (a switch, another
  gene, a tab, a close-up, Run), once per student (the phone play-through, PM10).

---

## 6. The levels in the new pattern

### 6.0 Shared changes

- Every level: `phases: ['intro', 'watch', 'task', 'run', 'result', 'debrief', 'echo', 'complete']`
  (1.7 adds `design`), `labConfig.ui` per §5.3, scoring per §1.4, content version bumped, the task
  card per the template of §1.4 with machine cards.
- The watch cell is built with role `'watch'` (`K.seedFor(variantSeed, 'watch')`) and discarded
  after the watch phase; the Try run is the scored `'task'` cell, as now.
- Headless solutions gain `watch: {taps, acts}` so tests play the watch phase (L-4).

### 6.1 Level 1.1, "Starving next to a feast" (sketch; built in phase 2)

**Stakes (plain):** "Your bacterium sits in glucose but can barely get any in, so it is short of
energy and grows slowly. Find the gene for the machine that lets glucose in."

**(1) Watch** (Gene and Protein zoom, watch cell = the 1.1 start):
- W1 (Protein zoom on bare membrane): glucose bumps the membrane; a trickle comes in through the
  side route. Line: "Glucose is all around, but it cannot cross the membrane without a transporter.
  Only a trickle gets in, by a slow side route."
- W2 guess: "These glucose-processing enzymes are made inside the cell. Could one of them carry glucose
  in?" (the background gene `gly`, names shown): cause option "No: only a protein that sits in the
  membrane meets the glucose outside." Then the Gene zoom of `gly`: its chains fold in the
  cytoplasm. Cause: "A transporter has to sit in the membrane, where the glucose is."
  (Lint note: "has to" is allowed; "needs to" is not.)
- W3 (pointer on the Genes tab): "When you switch a gene on, its protein appears either in the
  membrane or inside the cell. The gene card says which."

**(3) Try:** six unlabelled genes; switching a gene on shows, as soon as its first protein exists,
where the protein goes (glyph in the membrane or inside; the gene card's line "its protein: in the
membrane / inside the cell / not made yet", from state). An inside protein can be ruled out at once
and switched off.

**Task card:** principle first: "A transporter is a protein that sits in the membrane." Goal: "Find
the gene whose protein lets glucose in, and get growth back to normal." Core: "Test one gene at a
time." · "Switch off any gene whose protein stays inside the cell." Expert: "Before any test, read
each gene's chain and switch on only genes for membrane proteins." · "Also reveal a second gene's
job, with no wasted tests."

**Scoring (efficiency credits reasoning, not luck):** a *test* is a candidate switched from off to
on. A test is **wasted** when it (w1) re-tests a candidate already ruled out (its protein seen
inside, or it sat in the membrane for the fair-test time, `keepMin` after its first protein, with
no glucose job seen); (w2) leaves an inside protein's gene on for more than 5 game-min after its
first protein; (w3) opens a second test while another membrane candidate's test is still open (two
untested genes on at once); (w4) switches a membrane candidate off before its first protein
existed (`OFF_BEFORE_PROTEIN`). `E = clamp(1 − 0.35·wasted, 0, 1)`; par is no waste (E ≥ 0.8).
Every reasoning player reaches par on every variant, whatever the order (the old par of 3 tests
was reached by the `reasoned` solution on only 74.8%, Levels §16.7). HUD counter: "Tests {n}". The
result sheet explains each wasted test in one teaching sentence ("Gene D's protein stayed inside,
so it could not be the transporter; it was on for 12 more minutes.").

**Expert chain clue (LO5: sequence → shape → job):** each gene card has a row "Read its DNA"
(44 px) that opens the gene's chain, translated by `BTC.seq` from its stored coding sequence (§2.2
`L11`), drawn as a bar of the chain's length with oily stretches hatched. Line: "Stretches of oily
building blocks sit inside the membrane's oily middle. Many of them mean a membrane protein." Expert
bit 1: no inside-protein gene was ever switched on. (Test SQ-7 checks that the computed stretches
agree with UniProt's transmembrane annotations for all six.)

**Hidden names stay** (Levels §5.5.1): letters, display order, colours and loci follow the
variant; names come after `function_seen`. In the Protein zoom a hidden protein is drawn with its
real pocket shape once it exists (open question 3), labelled only "protein C".

**(4) Explain:** d1 and d2 as now, reworded plainly by the plain-language pass; feedback per §1.4.

**Story (outline and key lines).** The step: *get sugar in*. The Commander expects to order the
cell to eat; the student sees that glucose crosses only through a transporter sitting in the
membrane, and that an inside protein cannot help.

| When, on screen | Speaker | Key line (exact) | Job |
|---|---|---|---|
| intro, the starving cell (Protein zoom on bare membrane) | narrator | "Your cell is back where it started: glucose all around it, and only a trickle getting in." | S |
| same | You | "Then order it to eat." | S |
| same | narrator | "It cannot read orders. Glucose gets in only through a transporter, and this cell has none." | R |
| same, six grey gene cards | narrator | "One of these six unlabelled genes holds the instructions for the transporter. Each gets its name once its protein is seen at work." | S |
| watch W2, the glucose-processing enzymes | You | "These enzymes are already made. Put them to work on the glucose." | S (guess follows) |
| after W2's gate, their chains folded inside | narrator | "They sit inside the cell. The glucose is outside the membrane, where they cannot reach it." | R |
| run, a protein seen inside (rule `l11.inside`) | narrator | "{N} stays inside the cell, so it cannot carry glucose across the membrane." | R |
| run, a membrane protein with no glucose job (rule `l11.nofit`) | narrator | "{N} sits in the membrane, but no glucose gets in through it." | R |
| outro, found | narrator | "The glucose was there the whole time. The transporter was not." | R |
| same | You | "So I do not feed the cell. I switch on the gene for the machine that does." | R |
| same | Ribosome | "I built the transporters. I had no idea what they were for." | R |
| same | narrator | "With glucose coming in, the cell is fed and growing. Next, the sugar changes." | S (→ 1.2) |

The `missed` and `slow` outros keep their Levels §16.7 conditions, with the glucose speaker's line
rewritten for the narrator ("Glucose bumped into whatever sat in the membrane, and nothing there
fit it.").

### 6.2 Level 1.2, "Milk is on its way" (in full; part of the slice)

#### 6.2.1 Summary
Operator mode; LO2; confronts `MIDDLEMAN`, `PROTEIN_SELF_COPY`, `DELAY_MISATTRIBUTED`, `INSTANT`,
`MOLECULES_LAST`. The student first watches one mRNA copy being read into lactose transporters until
it is broken down, then sees what switching the gene off does. Then the task: glucose runs out at
minute 30 and milk sugar arrives; have enough lactose transporters in place by then, and switch the
gene off when enough are on the way, because every extra copy costs energy. After minute 30 the
student watches the cell live on milk sugar, which shows whether it was enough. The lesson: one
gene gives many copies, each copy is read into many proteins, and proteins keep arriving after the
gene is switched off.

#### 6.2.2 Setup
- Strain `m1-lab`, `start: 'birth'`, glucose 10 mM, lactose 0, amino acids 0.
- `genes.lacY = {level: 'off', initial: {clear: true, protein: 0}}`; `genes.lacZ = {level: 1,
  initial: {protein: LC.l12.lacZReady}}` (the lactose-splitting enzyme at its ×1 level, "already made", a
  background gene with its name shown); other genes as the lab strain.
- `config.schedule`: at `D·60` s, `setMedium {glucose_mM: 0, lactose_mM: 5}` and `setControls
  locked` (R-E11), both lesson commands.
- `flags.userGenes: ['lacY']`. The watch cell: the same config with no schedule, role `'watch'`.

#### 6.2.3 Variant and calibration
`T ∈ {T1, T2, T3}` and `D` from `tools/level-calibrate.js` (`l12` v2), with these rules (measured
probes, Appendix A):
- **T is "enough to live on milk sugar":** the LacY count at which a cell with the ready splitter
  grows on lactose alone at ≥ 0.8 of its glucose rate at steady state (probe: 5,065 LacY → 0.71,
  6,523 → 0.92, so T is about 5,500–6,000), and variants at 0.9·T, T, 1.1·T rounded to 100.
- **D** such that switching on at ×4 at tick 0 reaches T by D − 3 min on ≥ 95% of seeds (probe: ×4
  reaches about 3,800 at 20 min and 6,500 at 30 min; so D ≈ 30 min).
- `ppm` (transporters per mRNA copy, about 20) and `mPar = round(1.15·T / ppm)` copies.
- The number 400 in the current level (and in the draft wording of the new task) is far below what
  feeds a cell on lactose in this model (about 5% of it): with 400–1,250 transporters the cell grows
  at about 0.1–0.2 of its glucose rate on milk sugar. The target has to come from the cell's
  economy or the stakes are not true (open question 11).

#### 6.2.4 Flow and text

Phases: `intro`, `watch` (W1–W3), `task`, `run` (Try, with the milk phase), `result`, `debrief`
(Explain), `echo`, `complete`. Speeds: in the watch, 1 s = 10 s by default, with 1 s = 1 s and 1 s
= 1 min offered; in the run, 1 s = 10 s by default, with 1 s = 1 min offered. "About twenty" in
the lines below stands for the calibrated `LC.l12.ppm`; test L12-6 checks that it lies between 15
and 25, and the words change with it.

**Intro:** the story beat of §6.2.8 (lines I1–I4).

**Watch (tier 3 screen, Gene zoom on lacY, paused at each gate):**

| Step | Lines (exact) | Guess | Act / gate | Cause after the gate (exact) |
|---|---|---|---|---|
| W1 | "This is the lactose transporter gene. It is switched off, so nothing is being copied." | **g1** (below) | act: switch lacY on (the student's tap; logged) | – |
| W1b | "The first copy is outlined. Watch how many transporters ribosomes build from it before it is broken down." (while it waits: "Ribosomes are reading the copies. The count waits until the first ten copies have all been broken down.") | – | state `firstMRNA` sets the watched copy (the first mature lacY mRNA after the switch-on); the top bar reads "This copy: {n} transporters" ("…, broken down" once gone; no copies chip beside it, the copies made are counted below the cell) and the close-up labels the copy "this copy: {n} transporters" ("…, then broken down", its DNA moved up to clear the caption); gate `watchedGoneAndTen` (pause): the watched copy **and** the first ten copies made from it on are broken down (PB1: one copy can give 1 or 40). Speed: 1 s = 1 min once the watched copy is gone or has been read for 3 min (`watchedGoneOrOld`) | "This copy gave {nTr} in {t}, then it was broken down. Copies last different times: the first {b} gave {avg} each on average." ({nTr}: "1 transporter", "37 transporters"; {avg}: the mean of those ten copies' own counts, so no survivor bias) |
| W2 | "Ribosome after ribosome reads each copy until it is broken down." | **g2** (below) | act: switch lacY off | – |
| W2b | "The gene is off. Count the copies still left." (while it waits: "No new copies are started. The copies left are still read, and are broken down one by one.") | – | counters "copies left {m}" and "transporters made since off: +{a}"; gate `fewCopiesLeft` (pause): a tenth of the copies there were at the switch-off are left (PM5: the very last copy took up to 19 game-min); at 1 s = 1 min | "Switching the gene off stopped new copies from being started. The copies already made were still read: {a} more transporters in {tOff}." |
| W3 | "So one copy gives about {avg} transporters, and they keep arriving until the last copy is broken down." | – | tap | – |

**Guess g1:** "When you switch the gene on, how many transporters will ribosomes build from one mRNA copy before it is broken down?"

| Option (exact) | mc | What happened (fb, exact; shown at W1b's gate) |
|---|---|---|
| "One." | `OTHER` | "Ribosome after ribosome read each copy." |
| "About twenty." (the cause) | – | "Ribosome after ribosome read each copy until it was broken down." |
| "Thousands." | `OTHER` | "Each copy lasts only minutes, so it gives tens, not thousands." |
| "It is never broken down, so it keeps going." | `MOLECULES_LAST` | "Copies are broken down within minutes." |

(No numbers in this feedback: it is shown with W1b's cause, which already gives this copy's count and the average.)

**Guess g2:** "What will happen if you switch the gene off now?"

| Option (exact) | mc | What happened (fb, exact; shown at W2b's gate) |
|---|---|---|
| "The copies already made are still read, so transporters keep arriving for a few minutes." (the cause) | – | "Transporters kept arriving from the copies already made, {a} of them, until the last copy was broken down." |
| "Transporters stop arriving at once." | `INSTANT` | "They kept arriving: {a} more, from copies made before the switch-off." |
| "The copies stay, so transporters keep arriving for good." | `MOLECULES_LAST` | "The copies were broken down within minutes, so the arrivals slowed and then stopped." |
| "The transporters already made disappear." | `OTHER` | "The transporters stayed in the membrane. Only the copies were broken down." |

**Task card (exact):**
- Picture: two machine cards: "Carries lactose into the cell · Lactose transporter · lacY" (state: "none yet") and "Splits lactose into two sugars: glucose and galactose · Lactose-splitting enzyme · lacZ" (state: "ready").
- Scenario: "At minute {D} the glucose runs out and milk sugar arrives."
- Why it matters: "Without enough lactose transporters, the cell will be short of energy and grow slowly on milk sugar."
- Goal: "Before the milk arrives at minute {D}, get {T} lactose transporters into the membrane: enough to feed the cell on milk sugar."
- Core (bullets, not boxes): "Switch the gene on early: transporters arrive minutes after the switch." · "Switch the gene off when the transporters plus the ones on the way reach {T}."
- Expert (required for majors): "Finish with no more than {Tmax} transporters: switch off at the right moment." (`Tmax = round(1.15·T, 100)`).

**Try (the run; tier 3):** Gene zoom by default; counters "mRNA copies {m}" and "Lactose transporters {n}"
with, under the transporters, "+ about {x} on the way" (PB2: {x} = `ppm` × the copies here or being made,
to 10; nothing while none are on the way; the number the switch-off turns on, folded into the one
counter rather than a new readout; the counters take the width they need so it is never cut, and on a
short screen's one-row focus bar it reads "{n} +{x} on the way", the HUD just above naming the
transporters); Graph tab: transporters over time with the dashed
target line at T and a mark at minute D ("milk arrives"); control: Off/On (On = ×4), the graph's command
marks "gene on" / "gene off". Before the run starts its story adds: "Each copy still here will be read into
about twenty more transporters. The transporter counter adds them up as “on the way”." and "Switch the gene
on, then run the cell."
- HUD (PM1): goal "{n} of {T} lactose transporters" (bar), after D "Milk sugar here · {n} transporters";
  timer "milk in {time}", after D "watching {time} more"; no copies counter (the counters under the cell
  show them). On a phone: "Transporters {n} of {T}" and "Milk here · {n} transporters"; in the watch the
  goal reads "Watching the gene".
- Speed (PM4): once the gene is off with enough on the way (transporters + `ppm` × copies ≥ T), and again
  at the milk, the run moves to 1 s = 1 min by itself (once each, only ever faster) with a note:
  "Sped up to 1 s = 1 min: enough transporters are on the way." / "… while the cell lives on milk sugar."
  (`def.speedUps`). An introducing callout pauses the run until its Next (pm3).
- At D (schedule): glucose goes, lactose arrives, the switch locks ("Set by this level."), the view
  moves to Cell zoom (the student sees lactose markers entering through the transporters) and the
  economy readouts appear with their introducing sentences if new: sugar coming in, energy, growth.
  The run continues **20 game-min** ("watching the cell on milk sugar") and ends (`done`).
- Narrator rules (level): `l12.read` (gene on, copies > 0): "Ribosomes are reading every copy; each
  copy gives about twenty transporters before it is broken down." · `l12.leftover` (gene off,
  copies > 0): "The gene is off, but the copies already made are still being read." · `l12.milk`
  (after D): "The glucose is gone; lactose gets in only through the lactose transporters in the
  membrane." · `l12.short` (after D, energy low): "Too few transporters let too little lactose in, so
  energy is low and growth is slow." · `l12.fed` (after D, energy normal, growth normal): "Enough
  lactose gets in through the transporters, so the cell keeps growing."

#### 6.2.5 Goal and scoring
- **G:** transporters ≥ T at some tick ≤ D·60 (as now).
- **E:** `M` = lacY copies made from tick 0 to the end. `E = 1` if `M ≤ mPar`, else `clamp(1 − (M −
  mPar)/mPar, 0, 1)`. The result's bar reads "Copies made: just enough" or "… more than needed" (no
  number, no "par": `TEXT.resultWords`). When more than needed it says what the extras cost, in
  transporters rather than millions of ATP (PM1): "The extra copies made about {extra} more transporters
  than the cell could use. Building them used energy that could have gone into growing." ({extra} = final
  − T, to 100), and why: "When you switched off, {m} copies were still being read, so about {a} more
  transporters arrived after that." (never off before D: "The gene stayed on until the milk came. Switch
  it off when the transporters plus the ones on the way reach {T}.").
- **D:** 2 questions (below). **X:** bit 0 — final transporters ≤ Tmax with G met.
- **What the student sees at the end:** "On milk sugar the cell grew at {pct}% of its speed on glucose. Enough transporters means close to full speed."
  (60-s mean λ in the last 5 minutes ÷ λ_ref, whole percent).
- **Flags:** 0 `KEPT_ON_PAST_TARGET` (`MIDDLEMAN`), 1 `G1_MOLECULES_LAST` (g1), 2 `G2_INSTANT` (g2),
  3 `G2_MOLECULES_LAST` (g2), 4 `DEB_MIDDLEMAN`, 5 `DEB_PROTEIN_SELF_COPY`, 6 `DEB_CELL_DECIDES`, 7
  `SHORT_ON_MILK` (G not met).

#### 6.2.6 Explain (debrief; exact drafts for the plain-language pass to reconcile)
**d1** "You switched the gene off, yet transporters kept arriving. Why?"
- the cause: "Copies made before the switch-off were still being read by ribosomes." — "Each copy lasts a few minutes, and ribosomes keep reading it until it is broken down."
- `CELL_DECIDES` "The gene took a while to notice it was off." — "Genes notice nothing. No new copy was started after the switch-off; the copies already made were still read."
- `PROTEIN_SELF_COPY` "Transporters make more transporters once there are enough." — "Proteins are not copied from proteins. Every transporter was built by a ribosome reading an mRNA copy."
- `DELAY_MISATTRIBUTED` "The switch-off took minutes to reach the DNA." — "The switch acted at once: no new copy was started. The extra transporters came from copies already made."

**d2** "Why does the cell make mRNA copies instead of reading the gene itself?"
- the cause: "Many copies can be made, and each is read many times, so one gene gives many proteins." — "One gene gave {M} copies, each read into about twenty transporters. Copies are broken down, so making stops soon after the gene is off."
- `MIDDLEMAN` "mRNA is a spare copy kept in case the DNA is damaged." — "mRNA is read, not stored. Each copy lasts only minutes."
- `OTHER` "Ribosomes cannot reach the DNA." — "In this bacterium ribosomes start on a copy right beside the DNA, while it is still being made. Distance is not the reason."
- `MIDDLEMAN` "mRNA is an early form of the protein." — "mRNA is a copy of the instructions. Ribosomes read it; it is never built into the protein."

**Meanwhile, in you:** insulin from many copies of one mRNA; "Nearly every cell in your body has the
same two copies of the insulin gene. It is copied into mRNA almost only in beta cells." Card: "mRNA
copies are temporary · Universal" (id `mrna-temporary`; Part 1 already gives the mRNA card), with one
line under it on the last screen: "Your cells' mRNA copies are also broken down after a while. That is
how a cell stops making a protein soon after its gene is switched off."

**Outro:** chosen by `outroKey` from what happened (§6.2.8: `fed`, `keptOn`, `missed`), shown at
the start of `echo` as now.

#### 6.2.7 Solutions (tests L-4, L-5)
| Name | Plays | Must |
|---|---|---|
| `reference` | watch: taps and acts at each gate; g1, g2 the cause; ×4 at tick 0; off when `protein + 15·mRNA + 20·nascent ≥ 1.05·T`; right answers | goal, par, total ≥ 90, X bit 0 on ≥ 90% |
| `keepOn` | ×4 until D | goal; E = 0; flag `KEPT_ON_PAST_TARGET` |
| `stopAtTarget` | ×4, off when protein ≥ T | goal; miss par on ≥ 90% |
| `weak` | ×1 until D | fail the goal on ≥ 80%; flag `SHORT_ON_MILK` |
| `watchOnly` | the watch phase with every guess on an `mc` option | the watch completes; flags raised; nothing scored |

#### 6.2.8 Story, complete

Every line in play order (Job as in §2.8). The step lines of the watch table (§6.2.4) are part of
the story and are repeated here so the whole thread can be read at once.

| Id | When, and what is on screen | Speaker | Line (exact) | Job |
|---|---|---|---|---|
| I1 | intro sheet over the paused Gene zoom (lacY off) | narrator | "Your cell is fed and growing on glucose. In half an hour the glucose runs out, and milk sugar arrives instead." | S |
| I2 | same | narrator | "Milk sugar gets in only through lactose transporters, and this cell has none. Its lactose-splitting enzyme is already made." | S |
| I3 | same | You | "Then build every transporter now, and stop when the milk arrives." | S |
| I4 | same | narrator | "Each transporter is built from an mRNA copy of its gene. Before you plan, watch one copy at work." | S |
| W1 | the lacY gene, off | narrator | "This is the lactose transporter gene. It is switched off, so nothing is being copied." | T (guess g1, switch on) |
| W1b | the first copy outlined, its counter running | narrator | "The first copy is outlined. Watch how many transporters ribosomes build from it before it is broken down." | T |
| W1b gate | the copy and the first ten copies broken down | narrator | "This copy gave {nTr} in {t}, then it was broken down. Copies last different times: the first {b} gave {avg} each on average." | R |
| W2 | many copies with ribosomes | narrator | "Ribosome after ribosome reads each copy until it is broken down." | T (guess g2, switch off) |
| W2b | copies left counting down | narrator | "The gene is off. Count the copies still left." | T |
| W2b gate | a tenth of the copies left | narrator | "Switching the gene off stopped new copies from being started. The copies already made were still read: {a} more transporters in {tOff}." | R |
| W2c | same | Ribosome | "I read each copy that reaches me until it is broken down. Nobody tells me the gene is off." | R |
| W3 | same | narrator | "So one copy gives about {avg} transporters, and they keep arriving until the last copy is broken down." | R |
| W3b | same | You | "About {avg} from each copy. Then a handful of copies will do." | S |
| W3c | same | narrator | "Feeding a cell on milk sugar takes thousands of transporters, so it takes a few hundred copies." | R |
| T1 | the run, paused, after the task card | narrator | "Switch off too late and energy goes on copies that are not needed. Switch off too early and too few transporters arrive." | S |
| T1b | same | narrator | "Each copy still here will be read into about twenty more transporters. The transporter counter adds them up as “on the way”." | T |
| T1c | same | narrator | "Switch the gene on, then run the cell." | T |
| T2 | minute D: glucose gone, lactose markers at the transporters | narrator | "The glucose is gone. From now on the cell lives on what its transporters let in." | S |
| O-fed1 | echo, when G was met within par | narrator | "The milk sugar arrived, and the transporters were already in place, so the cell kept growing." | R |
| O-fed2 | same | narrator | "You switched one gene on and off at the right moments. The copies and the ribosomes did the rest." | R |
| O-kept1 | echo, when G was met over par | narrator | "The cell kept growing on milk sugar, but the gene stayed on long after enough copies had been made." | R |
| O-kept2 | same | You | "Better too many than too few." | S |
| O-kept3 | same | narrator | "Every extra copy and transporter cost energy that could have gone into growing." | R |
| O-miss1 | echo, when G was not met | narrator | "The milk sugar arrived before enough transporters did, so the cell ran short of energy and grew slowly." | R |
| O-miss2 | same | You | "I switched the gene on. Why was that not enough?" | S |
| O-miss3 | same | narrator | "Each copy takes minutes to be made and read, so transporters arrive well after the switch." | R |
| O-all1 | every outro ends | narrator | "One gene, a few hundred copies, thousands of transporters. The copies are where the numbers come from." | R |
| O-all2 | same | You | "The switch is only the start. The copies set the numbers." | R |
| O-all3 | same | narrator | "And transporters do not last forever. That is the next problem." | S (→ 1.4) |

### 6.3 Level 1.4, "Transporters wear out" (sketch; phase 2)

**Stakes (plain):** "Now the cell lives on milk sugar. Its lactose transporters wear out and are
cut up. Keep enough of them to feed the cell, without paying for extras."

**Setup (to calibrate):** lactose only (the cell starts growing on lactose, built from a
both-sugars start as in 1.7), `lacZ` at its ×1 level (background, "ready"), `lacY` with a
breakdown half-life `H` long enough that the dial spans hungry → enough → extras (probe: H = 40 min
gives ×1 ≈ 2,600 LacY and growth 0.37; ×2 ≈ 6,500 and 0.92; ×4 ≈ 12,300 and 0.95; H of 4–10 min
starves the cell at every setting, Appendix A).

**(1) Watch:** W1 guess: "Nothing is making new transporters. What happens to the ones in the
membrane?" (cause: "They are cut up one by one, so less and less sugar gets in."); the student
switches the gene off (or it starts off) and watches the count fall, the sugar-in word drop and the
energy word follow; a protease machine (§4, schematic, labelled "proteases are drawn here as one
machine") cuts transporters at `degraded_perS`. W2 guess: "The gene stays on at one setting. Will
the number of transporters keep rising?" (cause: "It rises, then levels off where making matches
cutting up."); the rate counters "made {a} a minute · cut up {b} a minute" converge.

**(3) Try:** "Keep enough transporters to feed the cell, without paying for extras, for 15
minutes." The graph shows the **enough zone**: its lower edge is the count below which the cell is
underfed (growth < 0.9 of the best on this medium, from calibration), its upper edge the count above
which more transporters bring in no more sugar (lactose intake within 5% of its plateau, × 1.2). Its
labels, on the graph: below "too few: underfed, slow growth"; inside "enough"; above "extras: no
more food, energy spent". The consequences are shown live: sugar-in word, energy word, growth word,
and "energy spent on transporters: {x} ATP a second".

**Honest limit (measured):** in this model extra transporters cost only a few percent of growth
(probe: ×4 vs ×2 differs by under 3%), too little to see within 15 minutes. The level therefore
shows the cost of extras as energy spent (true, and visible at once) and does not claim that the
cell visibly slows; the debrief says growth slows "a little, over many generations" (open question
12).

**Scoring:** G = the 60-s mean inside the zone for 15 consecutive min within the limit; E from
setting changes (as now, par 2); D.

**Story (outline and key lines).** The step: *keep enough as they wear out*. The Commander expects
a stockpile to last; the student sees transporters cut up whatever is stored, and a steady number
held only by steady making.

| When, on screen | Speaker | Key line (exact) | Job |
|---|---|---|---|
| intro, the cell on milk sugar (Gene zoom, transporters in the membrane) | narrator | "Your cell now lives on milk sugar, through the transporters you learned to make." | S |
| same, a protease machine cutting one transporter | narrator | "Transporters wear out. Machines called proteases cut worn ones up, a few every minute." | S |
| same | You | "Then build a stockpile once, and keep it." | S |
| same | narrator | "Watch what happens to a stockpile when nothing new is made." | S (guess W1) |
| after W1's gate: count, sugar-in and energy words fallen | narrator | "With nothing new being made, the transporters were cut up one by one, and less and less sugar got in." | R |
| same | You | "Then I keep the gene on at full power, forever." | S |
| same | narrator | "More than enough brings in no more food, and every extra transporter costs energy to build." | R (guess W2) |
| after W2's gate: the made and cut-up rates equal | narrator | "At one setting, the count rises until as many are cut up as are made, and then holds." | R |
| run start | narrator | "Find a setting that keeps enough transporters, without paying for extras." | S |
| outro | narrator | "A steady number is not a still one: transporters were made and cut up at the same rate the whole time." | R |
| same | You | "Nothing I build stays built." | R |
| same | narrator | "Nothing does. Keeping a machine means making it again and again." | R |
| same | Ribosome | "I made the replacements. I had no idea they were replacements." | R |
| same | narrator | "Next, the sugars start changing without warning." | S (→ 1.7) |

### 6.4 Level 1.7, "Nobody's in charge" (sketch; phase 2)

**Stakes (plain):** "Glucose and milk sugar come and go, and nobody can tell the cell. The lactose
machines are worth making only when lactose is here and glucose is not. Write DNA that makes the
cell switch them on and off by itself."

**(1) Watch** (Gene zoom on the lac region, wild-type design, watch cell in glucose):
- W1: "This is the lactose gene group, with its switch in front." Pointer: the operator with the
  repressor clamped on it; RNA polymerase reaches the promoter and cannot start copying (drawn from
  state: RNA polymerase rings appear only when `nascent > 0`; while `operatorBound > 0` the
  promoter shows a blocked mark). Lines: the story table below.
- W2 guess: "Milk sugar arrives. What lets these genes be copied?" Cause option: "A lactose-shaped
  molecule fits the repressor, changes its shape, and it lets go." Then the level switches the
  sugar to lactose only (a lesson command); the run goes at 1 s = 10 min until `operatorFree`
  (pause; about two game-hours from glucose, Levels §16.1). The Protein zoom on LacI shows
  allolactose in its pocket and the released shape (from `lac` state). Cause: the story table.
- W3 guess: "The milk sugar runs out. What happens?" The level switches back to glucose; gate
  `operatorBound`. Cause: the story table.
- W4 (Expert, optional): the glucose effect (CRP): shown the same way.

**(3) Try:** the designer (as now), with the Gene zoom of the lac region available during the run;
the design's consequences stay the same measures (growth on lactose phases, waste in glucose
phases), shown in plain words on the result.

**Story (outline and key lines).** The step: *switch sugars without supervision*. The Commander
expects to flip the lactose genes by hand; the student sees the repressor switch flip because
molecules fit, and then writes the DNA and lets it run.

| When, on screen | Speaker | Key line (exact) | Job |
|---|---|---|---|
| intro, the sugar-phase bands of a day | narrator | "Glucose and milk sugar now come and go without warning." | S |
| same | You | "I will switch the lactose genes on when milk comes, and off when it goes." | S |
| same | narrator | "The changes come faster than you can watch, and the cell gets no warning. It has a switch of its own." | S |
| watch W1, the lac region: LacI on the operator, polymerase blocked | narrator | "A repressor protein is clamped onto the DNA here, so RNA polymerase cannot start copying the lactose genes." | T |
| same | You | "Who told it to block the genes?" | S |
| same | narrator | "Nothing did. The repressor fits that stretch of DNA, and while it sits there, copying cannot start." | R (guess W2) |
| after W2's gate: the operator free, copies being made; Protein zoom on LacI | narrator | "The few lactose machines already present made allolactose. It fit the repressor's pocket and changed its shape, so it let go." | R |
| after W3's gate: clamped again | narrator | "With the lactose gone, the allolactose was used up, the repressor clamped on again, and copying stopped." | R |
| same | You | "So the switch flips itself." | R |
| same | narrator | "It flips because molecules fit. What you can change is the DNA the switch is built from." | S (→ design) |
| design, Run | – | "Once it runs, nothing can be changed. Run it?" (existing confirmation) | S |
| outro, a working design | narrator | "Each time the sugars changed, the switch did the work, and the cell stayed fed and kept growing." | R |
| same | You | "Fine. I write the DNA, and after that I keep out of it." | R |
| same | Ribosome | "I read the lactose copies when there were some. When there were none, I read other things." | R |

The `missed` and `alwaysOn` outros (Levels §16.8) keep their conditions; their first lines say
what this design did ("With no repressor gene, the lactose genes were copied all the time, and
energy went on them in every glucose phase.").

### 6.5 How later levels' task cards introduce their scenario (for the plain-language pass)

| Level | Scenario and protein, in plain terms |
|---|---|
| 1.3 The price of a protein | "Building anything costs ATP. This cell is short of it: which machines are worth building first?" The glucose-processing enzymes by job ("break glucose down and make ATP"), then their name. |
| 1.5 Shape is function | "One letter of a gene changed in four strains. In one, the transporter no longer works. Which, and why?" The fold picture of §4.4 before any term ("mutation" named after the student has seen one change a fold). |
| 1.6 Hijacked | "A virus is a set of instructions with no machines of its own. Your ribosomes read its mRNA as readily as yours." |
| 1.8 Breathing room | "Oxygen arrives. Machines that use it make far more ATP from the same sugar, but they are costly to build." |
| 1.9 Machines that build machines | "Ribosomes are machines too. How many should the cell build, and how many other machines?" |
| B Magic bullet | "A drug that jams a machine only bacteria have stops the infection and spares you." |

---

## 7. Engine and view contract (observe-only)

Nothing below changes physics, the hashed state, the golden hash or any random stream. Every field
is computed from existing state at `observe()` time or recorded as a per-tick scratch value, like
`pCompleted`. The engine version becomes **1.1.1** (patch); L-11 is relaxed to compare
major.minor, and `tools/level-calibrate.js` asserts that every calibrated number is unchanged.

| Field | Type | Definition | Used by |
|---|---|---|---|
| `view.genes[i].location` | `'membrane'` \| `'cytoplasm'` | the catalog's location | close-ups, gene cards, 1.1 |
| `view.genes[i].length_aa`, `mRNA_nt` | int | catalog L, and 3L + 60 | close-up scale |
| `view.genes[i].tlCopies` | number | copies ribosomes can load now: mature + transcripts already past the cistron's start (`translatableCopies`, Engine §7.5) | ribosome share per copy, `MRNAWatch` |
| `view.genes[i].tlStarts_perS` | number | ribosomes that started on this gene in the last tick, per s (`nBind·rbs·tlCopies/W / dt`, stored in `initiateTranslation` as a scratch value) | `MRNAWatch`, "chains started" |
| `view.ribosomes.odometer_aa` | number | the ribosome odometer `cell.D` | `MRNAWatch` |
| `view.genes[i].work_perS` | number | the protein's job flux: glucose-import: glucose through PtsG only (the side route excluded); glycolysis: `hexoseToGlycolysis`; aa-synthesis: `aaMade`; aa-import: `aaImported`; lactose-import: `lactoseIn`; lactose-split: `lactoseSplit`; lac-repressor and none: 0 | Protein zoom, 1.1 gates, `workOver` |
| `view.genes[i].workPerCopy_perS` | number | `work_perS / (protein · activity)` (per four-chain enzyme for LacZ: × 4), 0 when protein < 1 | Protein zoom rate |
| `view.flux.glucoseInPtsG`, `glucoseInSide` | number | the split of `glucoseIn` between PtsG and the side route by capacity share (the rule the cell view uses today, moved into the engine so every screen agrees) | side-route drawing, `workOver` |
| `cell.detail(geneId, out)` | fills `out` | `{ribosomeProgress: Float64Array(16)}`: ribosomes on the gene by chain progress `(D − D0)/L` in 16 bins (sum = `ribosomes`); walks the gene's cohort queue (≤ 2L + 1 entries, typically about L/v ≈ 40–90); allocation-free; called once per frame for the focus gene only while the Gene zoom is shown | ribosome positions and chain lengths |
| `view.lac.inducerShare` | number | `1 − activeLacI / lacITetramers` (0 when no LacI) | Protein zoom of LacI |

**Determinism:** all of these are pure reads or per-tick scratch values; rendering randomness stays
in hash-based positions (`BTC.dots.hash01`, keyed by molecule id, bead index and epoch).
**Tests:** OB-1 (every new field matches a direct computation in a test cell, across the fuzz
scenarios), OB-2 (`observe()` and `detail()` allocate nothing: the same objects every call), OB-3
(the golden hash and every existing test unchanged), OB-4 (`Σ ribosomeProgress = ribosomes` within
1e-9; `Σ work` of the glucose split equals `glucoseIn`).

---

## 8. Performance

- **Budgets (4× CPU-throttled Chromebook-class reference, Lab spec §2.7):** Gene zoom frame ≤ 4 ms
  and ≤ 600 glyphs; Protein zoom frame ≤ 2 ms (≤ 80 path operations); `detail()` ≤ 0.2 ms; the
  opening's sequence scenes ≤ 3 ms per frame; `MRNAWatch.onTick` O(1) amortised (its queue is at
  most L/v entries).
- Close-ups are capped at 30 fps while running, and drawn only on change while paused; hidden views
  do not draw.
- Glyph buffers are rebuilt only when the tick, epoch, zoom, focus gene or stage size changes (as
  the overview); jitter and markers re-apply per frame. Nothing is allocated per frame: strand paths
  are appended to one path per (shape, colour) batch.
- The sequence scenes precompute their letter layout once per scene; letter glyphs are `fillText`
  batched per colour (canvas) or static SVG text (the ladder).
- Build size: `btc-seq.js` ≈ 4 KB, `btc-seqdata.js` ≈ 2 KB (insulin) + ≈ 12 KB (1.1's six genes,
  phase 2), close-up and machine renderers ≈ 40 KB, opening drawings ≈ 60 KB; the bundle stays under
  the 1.2 MB warning (Levels §16.9).
- The watch phase's state gates cost one predicate per tick (tens of ns).

---

## 9. Telemetry

Additions to Levels §11.2 (same envelope, same storage):

| type | d |
|---|---|
| `guess` | `{id, option, cause: bool, step}` (a guess: logged, not scored) |
| `activity` | `{id, i, value, expected, match: bool}` (each letter picked, each codon decoded, each "copy again") |
| `step` | `{id, action: 'shown' \| 'gate' \| 'done', gate, tick?}` (watch and scene steps; `tick` for live gates) |
| `zoom` | `{from, to, via: 'segment' \| 'pinch' \| 'chip' \| 'key' \| 'guide' \| 'level'}` |
| `rung` | `{id, action: 'closer' \| 'back' \| 'jump' \| 'ring', via: 'button' \| 'pinch' \| 'tap' \| 'key'}` |
| `watch_mrna` | `{id, made, lifetime_s}` (when a watched copy is broken down) |
| `introduce` | `{readout}` |
| `ui_mode` | `{mode: 'simple' \| 'all'}` |
| `about` | `{row}` (a disclosure or About row opened) |

The time on each step is recoverable from `t` (ms since session start) of consecutive `step`
events; no absolute timestamps are added.

---

## 10. Tests

### 10.1 Node (`npm test`)

| Id | File | Test |
|---|---|---|
| SQ-1 | `seq.test.js` | `CODE` has 64 codons, 61 sense and 3 stops (UAA, UAG, UGA), 20 amino acids, AUG = M; it equals the NCBI table 1 string |
| SQ-2 | same | `complement` is an involution; `rnaPartner` over the template equals `transcribe` of the coding strand for random strings (fixed seed) |
| SQ-3 | same | `INS.cds` is 333 letters, starts ATG, ends TAG, has no internal stop, and `translate(transcribe(INS.cds))` equals P01308 (fixture) exactly; `INS.mRNA.slice(59, 392) === INS.cds`; `firstStart` of the mRNA is index 59; the leader has no AUG |
| SQ-4 | same | parts: B = `FVNQHLCGSHLVEALYLVCGERGFFYTPKT`, C = `EAEDLQVGQVELGGGPGAGSLQPLALEGSLQ`, A = `GIVEQCCTSICSLYQLENYCN`; cysteines at 31, 43, 95, 96, 100, 109; RR at 55–56, KR at 88–89 |
| SQ-5 | same | the scene facts of §2.2: first six copy letters `AGCCCU`, template `TCGGGA`, first codons, prefix chains for E4 |
| SQ-6 | same | `oilyStretches(P01308)` is empty (max 1.56) |
| SQ-7 | same (phase 2) | for each 1.1 candidate: translation equals its UniProt sequence; computed oily stretches ≥ 6 for membrane proteins and 0 for LacZ and FliC, and within ±2 of UniProt's transmembrane count |
| SQ-0 | manual, before merge | re-fetch P01308 and NM_000207.3 from UniProt and NCBI directly (not copies), compare byte for byte, and record the date in `INS.provenance.checked` |
| OP-1 | `prologue.test.js` | both parts validate; every scene has lines; every guess has ≥ 3 options, one marked `cause`, `fb` on all; every activity has an expected value computed by `BTC.seq` (none typed) |
| OP-2 | same | gating: `sceneNext` refuses until each activity is complete (six letters; two codons; three copies; the transcription and translation runs finished) and each guess picked; Skip never passes an unfinished activity |
| OP-3 | same | the P2 watch, played headless with its reference taps and acts: every state gate opens in order at a tick that does not depend on the speed or on frame timing (the same tick at 1 s = 10 s and 1 s = 1 h); advancing render time without ticks opens nothing |
| OP-4 | same | the switch-off detour (H7–H11) waits and resumes correctly |
| OP-5 | same | flags and codes: first picks on `DNA_DIRECT` options raise `PRED_DNA_DIRECT`; the codes decode; `D` counts cause picks |
| ZC-1 | `closeup-pure.test.js` | `planGene(view, detail, box, opts, out)` is deterministic (same input → identical buffer) and allocation-free after the first call |
| ZC-2 | same | honest counts: drawn copies + "more" = `view.genes[f].mRNA`; ribosome glyphs × glyph scale summed over all copies (drawn and summarised) = `round(ribosomes)`; transcripts drawn = `nascent`; protein text = `proteinRounded` |
| ZC-3 | same | caps: ≤ 600 glyphs across the fuzz scenarios and LacZ ×4; polymerases and the watched copy never dropped; the key text updates with the glyph scale |
| ZC-4 | `mrnawatch.test.js` | on a test cell, the watched copy's `made` summed over all copies alive at the same time equals the gene's `proteinMade` for chains started in that window (within 1%); `made` stops after the id vanishes and in-flight chains finish; save/restore round trip |
| ZC-5 | `machine-pure.test.js` | the machine state machine: r = 0 never binds; non-substrates never enter a pocket; the displayed slow factor keeps a cycle within 0.6–3 s for r from 0.01 to 10⁴ /s; population states follow the hashed draw exactly |
| ZC-6 | `ui-pure.test.js` (extended) | paused frames identical in every zoom (buffer equality); reduced motion yields the four-panel strip |
| ZC-7 | `narrate.test.js` (extended) | `z.*` rules pass the full template lint and are true whenever they speak (scripted scenarios) |
| TI-1 | `ui-level-pure.test.js` | each level's `labConfig.ui` is valid; the table of §5.3 holds (no hidden control is reachable; every introduced readout has its sentence) |
| TI-2 | same | Simple and All modes of the lab expose the same commands |
| L12-1…6 | `level-1-2.test.js` | the §6.2.7 solutions meet their expectations on 3 seeds per variant (40 in calibration); the watch gates open for the reference; W1b's gate opens only once the watched copy is gone and ten copies made from it on are broken down, its {avg} is their mean (8–40), the singular reads "1 transporter", W3 carries the same {avg}; W2b opens with a tenth of the copies left; the milk phase's growth line is true of the run; the Try's HUD has no copies counter and no "par"; `LC.l12.ppm` lies in 15–25, so "about twenty" stays true |
| C-1 | `level-content.test.js` (extended) | every student string of this file's levels (TEXT of P, P2, 1.2 and later 1.1, 1.4, 1.7), step lines, guesses, introducing sentences and machine card lines pass the lint of §1.1 |
| ST-1 | `story.test.js` | every story line has a speaker in {narrator, commander, ribosome}; every Commander line is answered by the next line the student reads, a narrator's; **per play path** (not per file: 1.2's three outros are three paths) at most 4 Commander and 1 Ribosome lines (P 4 + 1, P2 4 + 1, 1.2 3–4 + 1 after the review cut D1's Commander line, S5's and H13's Ribosome line); every outro variant's first line is true of the run it is shown after (1.2's reference, keepOn and weak solutions, 3 seeds each). The job tags (S, R, T) live in §2.8 and §6.2.8, not in the level data |
| ST-2 | same | terms: in play order from P1 (story lines, guesses and their feedback where shown, causes, notes, wait and done lines, machine cards, About rows, task, the run's counter and speed notes, result and debrief text), a term of the §1.2 vocabulary (`TERMS`, with the step that introduces each) appears only at or after its introducing step, and that step uses it |

### 10.2 Browser checks (`tools/ui-check-opening.js`, `tools/ui-check-zoom.js`, run by `tools/ui-check.js`)

All at **360 × 740** (touch) and **1280 × 800** (no touch) with `?test=1&seed=1`; each asserts no
console errors, no request off the origin, no horizontal scroll, no vertical page scroll, and every
visible button, key, row and segment ≥ 44 × 44. Screenshots go to `test-artifacts/opening/` and
`test-artifacts/zoom/`.

| Id | Check |
|---|---|
| BO-1 | Part 1 by taps from home to its completion: every rung with its scale bar text present and inside the viewport; Closer and Back; the rail's sheet; a pinch-out and pinch-in by synthesized touch events step one rung each; "See what happens" goes on at once to the scene that shows it (D1 to D2, F4 to F5; PB3); no Skip anywhere on a first play (PM6) |
| BO-2 | the letter fill: keys ≥ 44 px, a T pick for template A shows the U sentence, the sixth letter is U, "Let it run" disabled before six letters, the run ends at 465 |
| BO-3 | the codon decode: six rows ≥ 48 px, "Full table" lists 64 codons, the chain ends at 110 |
| BO-4 | Part 2: the economy scenes; the watch with its pointer ring on the right element at each gate (element bounding box contains the ring centre); the run stops at each gate on the real loop at 1 s = 10 s and 1 s = 1 min; the switch answers its tap with no toast; at H10 the cell moves to 1 s = 1 min and the callout says so, and H11 waits with its own line (PM4) |
| BO-5 | reduced motion: no transitions over 100 ms; the Protein zoom shows its four-panel strip |
| BZ-1 | Cell zoom unchanged (the M2 screenshots match within tolerance) |
| BZ-2 | Gene zoom for ptsG, lacY ×4 (many copies: "showing 6 of …"), lacZ (long gene: scale bar 200 nm), a gene off ("No copies of this gene right now."); the canvas ≥ 220 px tall with the HUD |
| BZ-3 | Protein zoom for ptsG with lactose outside (the bounce-off line), lacY with lactose, araE (idle), fliC (ghost), LacI in 1.7 (both states over time) |
| BZ-4 | the zoom control: segments, pinch, the tap chip's "Look closer", and + / − on the laptop |
| BZ-5 | 375 × 553 (short screen): all three zooms keep the canvas ≥ 220 px |
| BZ-6 | tiers: 1.2's run shows only the listed readouts (no chips, lin/log, window row, spending bar, generation or doubling); the lab's Simple and All modes |

### 10.3 Manual checks (before the next think-aloud)

1. Both opening parts on an iPhone (Safari and installed), an Android phone and a Chromebook; time
   each (targets: 7 and 6 minutes).
2. Pinch on each phone; VoiceOver/TalkBack reads each rung's line, the letter keys and the codon
   rows.
3. Alex reads every line against the misconception list and the plain-language rules.
4. Two or three students play P1, P2 and 1.2 aloud; note where they hesitate or click without
   reading (Alex's note 4 is the criterion).

---

## 11. File layout

| File | Global | Role |
|---|---|---|
| `src/shared/btc-seq.js` | `BTC.seq` | the exact sequence model (§2.2) |
| `src/shared/btc-seqdata.js` | `BTC.seqdata` | sequences, annotations, provenance |
| `src/shared/btc-mrnawatch.js` | `BTC.MRNAWatch` | the watched-copy tracker (§3.5) |
| `src/shared/btc-closeup.js` | `BTC.closeup` | pure planners: `planGene`, `planProtein`, `machineState` (tested in Node) |
| `src/levels/btc-level-p.js` | registers `'P'` | Part 1 (content 2): TEXT, rungs, scenes, activities, guesses, cards |
| `src/levels/btc-level-p2.js` | registers `'P2'` | Part 2: TEXT, scenes, economy, the watch steps, cards |
| `src/levels/btc-level-1-2.js` | registers `'1.2'` | rewritten per §6.2 (content 3) |
| `src/game/btc-level-runner.js` | – | + `watch` phase, step gates, activities, guesses (§2.4.3) |
| `src/game/btc-levels.js` | – | validation of steps, activities, `labConfig.ui` |
| `src/game/btc-misconceptions.js` | – | + `MEMBRANE_OPEN` |
| `src/app/btc-prologue.js` | `BTC.PrologueView` | becomes the opening's host: rung drawings, ladder rail, zoom gestures |
| `src/app/btc-seqscene.js` | `BTC.SeqScene` | the letter, transcription, translation and fold scenes drawn from `BTC.seq` |
| `src/app/btc-guide.js` | `BTC.Guide` | pointer ring and callout for watch steps and readout introductions |
| `src/app/btc-zoom.js` | `BTC.ZoomControl` | the Cell · Gene · Protein control and pinch handling |
| `src/app/btc-geneview.js` | `BTC.GeneView` | Gene zoom renderer (reads `BTC.closeup`) |
| `src/app/btc-machine.js` | `BTC.MachineView`, `BTC.MachineCard` | Protein zoom renderer and machine cards (§4) |
| `src/app/btc-tiers.js` | `BTC.tiers` | applies `labConfig.ui` to the status strip, focus bar, tabs and graph |
| `src/app/btc-simplegraph.js` | `BTC.SimpleGraph` | the single simple graph (one or two lines, target, zone, marks; built on `BTC.Plot`) |
| `src/engine/btc-observe.js`, `btc-expression.js`, `btc-cell.js` | – | §7 additions |
| `tests/seq.test.js`, `prologue.test.js`, `closeup-pure.test.js`, `mrnawatch.test.js`, `machine-pure.test.js`, `observe-detail.test.js`; fixtures `seq-uniprot.js` | – | §10.1 |
| `tools/ui-check-opening.js`, `tools/ui-check-zoom.js` | – | §10.2 |

`build-files.json` order: the new shared files after `btc-narrate.js`; `btc-level-p2.js` after
`btc-level-p.js`; the new app files before `btc-level-ui.js` (`btc-tiers`, `btc-simplegraph`,
`btc-zoom`, `btc-geneview`, `btc-machine`, `btc-guide`, `btc-seqscene`, then `btc-prologue`).

---

## 12. Build order: a vertical slice first, then stop for Alex

**The slice** (everything a student needs to go from the opening through level 1.2 in the new
style):

| Step | Work | Tests | Done when |
|---|---|---|---|
| S0 | Direct check of P01308 and NM_000207.3 at UniProt and NCBI (SQ-0), from a network that allows them | SQ-0 | the date is recorded |
| S1 | `BTC.seq`, `btc-seqdata.js` (insulin) | SQ-1 … SQ-6 | green |
| S2 | Engine observe additions (§7), patch 1.1.1, constants regenerated unchanged | OB-1 … OB-4, all existing tests | green; golden hash unchanged |
| S3 | Machine picture language and the Protein zoom; `BTC.MachineCard` | ZC-5, BZ-3 | ptsG, lacY, lacZ, gly, fliC machines drawn |
| S4 | Gene zoom, zoom control and pinch, `MRNAWatch`, close-up narrator rules, key sheet sections | ZC-1 … ZC-4, ZC-6, ZC-7, BZ-1 … BZ-5 | the lab shows three zooms |
| S5 | Tiered interface (`labConfig.ui`, `BTC.tiers`, simple graph, introductions, lab Simple / All) | TI-1, TI-2, BZ-6 | the lab opens in Simple |
| S6 | Runner: `watch` phase, steps, activities, guesses, new feedback wording, scoring formula | OP-2, OP-3, L-12 extended | a stub level plays through |
| S7 | Opening part 1 (rungs, sequence scenes) and part 2 (bacterium, sugars, economy, guided experiment) | OP-1 … OP-5, BO-1 … BO-5, C-1 | both parts playable on a phone |
| S8 | Level 1.2 per §6.2, with `l12` v2 calibration | L12-1 … L12-5, LV-4 replaced | 1.2 playable |
| S9 | Manual checks §10.3 items 1–3; publish to the think-aloud build | – | **stop: Alex plays P1, P2 and 1.2 and gives feedback** |

**After Alex's feedback (phase 2):** revise the slice; then 1.1 (§6.1, the chain clue with SQ-7
and the six E. coli sequences), 1.4 (§6.3, recalibrated on lactose), 1.7 (§6.4); update
`LEVELS.md`, `LAB_UI.md`, `PEDAGOGY.md` (the process-marker rule and the guess rule) and
`VISUAL_STYLE.md` (the machine language); retire the old Prologue text.

---

## 13. Facts, sequences and sources

**Network note.** In this session the egress policy blocked UniProt (`rest.uniprot.org`,
`www.uniprot.org`), NCBI (`eutils.ncbi.nlm.nih.gov`, `www.ncbi.nlm.nih.gov`), EBI, Ensembl,
Wikipedia and DrugBank; the Scite literature tool had reached its monthly limit. Facts marked
"memory" below were not re-checked here and MUST be checked before they ship (S0 and the content
review).

| Fact | Value used | Status and source |
|---|---|---|
| Preproinsulin | 110 aa, P01308 SV=1, sequence in §2.2 | **matched against copies of the UniProt record**: GitHub code search found the FASTA `>sp\|P01308\|INS_HUMAN Insulin OS=Homo sapiens OX=9606 GN=INS PE=1 SV=1` with this exact sequence in ten independent repositories (e.g. plotly/datasets `Dash_Bio/Genetic/sequence_viewer_P01308.fasta`, devalab/SCONES `DataGeneration/data/UniProt/P01308.fasta`); direct check pending (S0) |
| INS coding sequence | 333 nt, NM_000207.3 positions 60–392, §2.2 | **matched against copies of the RefSeq record**: an NCBI CDS FASTA `>NM_000207.3:60-392 INS [organism=Homo sapiens] [GeneID=3630] [transcript=1] [region=cds]` (joseluisvitte/human-insulin-genomic-analysis `data/cds.fna`) and a MANE 1.5 record (RefSeq annotation GCF_000001405.40-RS_2025_08; Trethewey `codon-compass/data/reference/NM_000207.3.json`), both identical to §2.2; the full 465-nt mRNA from three repositories; **and** it translates exactly to P01308 (computed here); direct check pending (S0) |
| INS location | NC_000011.10:2159779-2161209, minus strand, 11p15.5; 1,431 bp | from the MANE record copy above |
| Introns | two: one in the 5′ leader, one in the coding part within the C-peptide region | memory (Bell et al. 1980, *Nature* 284:26); exon sizes 42, 204 and 219 add up to the 465-nt mRNA, but were not checked here; not drawn |
| Insulin processing | signal 1–24; B 25–54; C-peptide 57–87; A 90–110; disulfides A6–A11, A7–B7, A20–B19 | UniProt P01308 features, memory; positions consistent with the verified sequence (cysteines computed) |
| Human protein-coding genes | about 20,000 | memory (GENCODE and Ensembl give about 19,000–20,000) |
| Human cells | about 3.0 × 10¹³ | Sender, Fuchs & Milo 2016 (verified in the M2 biology review) |
| Chromosomes | 46 per diploid cell | textbook |
| B-DNA | 0.34 nm per base pair; about 10.5 pairs per turn (3.4–3.6 nm); 2 nm across | memory (standard values) |
| Nucleosome | 147 bp around a histone core, about 11 nm across | memory |
| Nuclear pore | about 120 nm across | memory |
| Beta cell, nucleus, granules | cell about 10–15 µm; nucleus about 6 µm; insulin granules about 300 nm | memory; the current Prologue uses 12 µm |
| Islet | about 50–500 µm, typical 150 µm; roughly a million per pancreas | memory |
| Pancreas | about 12–15 cm long | memory |
| Ribosome size | about 25–30 nm (human), 20–25 nm (bacterial) | memory |
| Copying and reading speeds in human cells | RNA polymerase II about 1–4 kb per minute; about 5–6 amino acids per second | memory (e.g. Jonkers & Lis 2015; Ingolia et al. 2011); the scenes use 30 letters/s and 5 codons/s and say "about real speed" |
| *E. coli* K-12 MG1655 | one circular chromosome of 4,641,652 bp (NC_000913.3), about 4,300 protein-coding genes | memory (Blattner et al. 1997: 4,639,221 bp and 4,288 genes; later revised); the text says "about 4.6 million letters" and "about 4,300 genes" |
| ATP per amino acid | about 4 | engine `c_tl` (Lynch & Marinov 2015) |
| ATP per glucose here | 2 (fermentation; the lab cell has no oxygen) | engine `fermYield` |
| Reference cell economy | glucose in 5.4 × 10⁵ /s; ATP made 9.2 × 10⁵ /s; translation 40.6% of ATP spent | engine 1.1.0, measured here (Appendix A) |
| PtsG | tags glucose as glucose-6-phosphate while carrying it; per copy about 41 glucose/s in the reference cell | engine and Lab spec §2.9; measured here |
| LacY | carries lactose in together with a proton; about 12 membrane-spanning stretches; about 20 lactose a second per copy (BioNumbers 112482), where the model's k_Y gives about 50 (BIOLOGY.md open item 8) | memory (Abramson et al. 2003, *Science* 301:610); slice biology review |
| LacI | a four-chain repressor; allolactose binding changes its shape and loosens its hold on the operator | memory (Lewis et al. 1996, *Science* 271:1247) |
| Flagellin | thousands of copies stack into one flagellum filament | memory |
| GLUT4 | insulin moves GLUT4 transporters into muscle and fat cell membranes | textbook; already used in 1.1's "Meanwhile, in you" |
| Recombinant insulin | made in *E. coli* from an intron-free gene since the early 1980s (the chain is made, then cut into insulin by enzymes); about half of today's insulin is made in yeast | memory; Baeshen 2014 (slice biology review) |
| Neighbourhood of INS | tyrosine hydroxylase (TH) ends about 2,700 letters before the insulin gene starts | OMIM 191290; GRCh38 coordinates (slice biology review) |
| Chromosome 11 | about 135 million letters: 4.6 cm of DNA stretched out; two copies per cell | slice biology review |
| *E. coli* | about 2 × 0.8–1 µm; its chromosome about 1.6 mm stretched out; tens of thousands of ribosomes in fast growth (about 11,000 in the model's reference cell) | slice biology review |
| LacZ | a tetramer about 17.5 × 13.5 × 9 nm | Jacobson 1994 (slice biology review) |
| Islet | about 55% beta cells in a human islet | slice biology review |

---

## 14. Open questions for Alex

Each question below carries the coordinator's decision for the vertical slice (2026-09-24), marked "Decided (default)"; Alex may change any of them after playing the slice (§12, S9).

1. **The machine example in the opening.** Default: a glucose transporter (GLUT4 in a muscle cell),
   which follows from insulin's job and sets up level 1.1. Alternatives: the bacterium's own PtsG
   (closer to 1.1, but the opening is still in the human body at that point), or insulin itself
   (its job is signalling, which is harder to picture as a machine).
   **Decided (default):** a glucose transporter in a muscle cell. Student text never names GLUT4 (the code calls this machine `glut`: `BTC.closeup.MACHINES.glut`, the PtsG pocket without the phosphate tag).
2. **Motion rule.** May the close-ups show *process markers* (a chain finishing, a copy broken
   down, a protein cut up) as short animations in place, and a machine's cycle at a slowed,
   labelled rate? Nothing moves toward a target. PEDAGOGY.md would gain one sentence.
   **Decided (default):** yes to short process markers in place in the close-ups, and to a machine's cycle shown at a slowed rate with the factor printed on screen ("Shown 100 times slower"). PEDAGOGY.md gains the sentence when the slice is reviewed.
3. **1.1 and pocket shapes.** Once a hidden gene's protein exists, its Protein zoom shows the real
   pocket shape (for example lactose-shaped), which lets a student infer its job before the name
   is revealed. Default: allowed, since it is reasoning from shape and needs a test first.
   **Decided (default):** allowed: in 1.1 the Protein view shows a hidden protein's real pocket shape before its name is revealed (labelled only "protein C").
4. **Scoring.** Drop P (predictions) from the Core score in favour of `0.45·G + 0.25·G·E + 0.30·D`,
   since guesses now teach? Or keep a small P from one planning item in (3)?
   **Decided (default):** P leaves the Core score: `S = round(100 · (0.45·G + 0.25·G·E + 0.30·D))`.
5. **Two opening parts or one?** Default: two (7 and 6 minutes), each with its own code. One
   longer opening is possible but runs past 10 minutes.
   **Decided (default):** two parts (7 and 6 minutes), each with its own code.
6. **The "spools" rung** (DNA wound on nucleosomes): keep it (true, one line) or skip it (one fewer
   idea)?
   **Decided (default):** skip the spools rung (one fewer idea).
7. **The chromosome as a tangle, not an X.** Default: yes, with the line saying why.
   **Decided (default, the spec's recommendation):** yes, a loose tangle, with the line saying why.
8. **The insulin-from-bacteria About row** in part 2 (a nice universality hook, one more idea).
   **Decided (default, as drafted in §2.4.1):** keep the About row (tap to open), so it costs nothing to a student who does not open it.
9. **Order.** Should Prologue 2 be required (or at least suggested on the task card) before 1.1?
   Default: suggested, not required, as levels open in any order.
   **Decided (default, the spec's recommendation):** suggested on 1.1's task card, not required.
10. **Guess feedback.** Default: no right or wrong marks at all on guesses ("What happened: …").
    Should a matching guess get a quiet "Yes"?
   **Decided (default, the spec's recommendation):** no marks at all on guesses ("What happened: …").
11. **1.2's target.** The current 400 (and "about 400" in the draft wording) is about 5% of what
    feeds a cell on milk sugar in this model. Default: take T from the economy (about 5,500–6,000,
    by minute 30, with the splitter already made). Alternative: keep a small number but change the
    stakes to "a head start" (weaker, and harder to make true).
   **Decided (default):** T comes from the economy (about 6,000 transporters by minute 30, the splitter already made), from the `l12` v2 calibration.
12. **1.4's "too many" side.** In the model, extra transporters cost only a few percent of growth,
    which cannot be seen within 15 minutes. Default: show the cost as energy spent (true and
    immediate). Alternatives: a much longer run (hours) where the growth difference shows, or a
    larger cost per transporter (a disclosed game rule).
   **Decided (default):** the "too many" side is shown as energy spent (true and immediate).
13. **1.1's lumped amino-acid importers** for the chain clue: show one representative importer's
    chain (to be chosen and verified, e.g. the aromatic amino-acid permease AroP) with a "stands
    for about 10 importers" badge, or leave that card without a chain?
   **Decided (default, as §2.2 `L11` assumes):** show one representative importer's chain (to be chosen and verified in phase 2) with a "stands for about 10 importers" badge.
14. **Scale words.** Should each rung also show the zoom factor ("100 times closer") beside its
    scale bar?
   **Decided (default, as drawn in §2.3.1):** no zoom factor; each rung keeps its scale bar and field of view only.
15. **Speed of the sequence scenes.** "About real speed" (30 letters and 5 codons a second) makes
    the full insulin copy take about 15 s and the chain about 22 s. Faster, with the factor stated?
   **Decided (default, as drafted in §2.3.3 and §2.3.5):** about real speed (30 letters and 5 codons a second), labelled so.
16. **1.1's efficiency.** Replace "at most 3 tests" (which luck decides: a perfect reasoner makes
    par only about three times in four) with "no wasted tests" (§6.1), which every reasoner can
    reach? Default: yes.
   **Decided (default):** "no wasted tests" (§6.1).
17. **The Ribosome as a speaker.** Keep it (0–1 line per level, for indifference and "same machine
    in every cell")? Default: yes. The glucose, protease and LacI speakers are retired.
   **Decided (default):** keep the Ribosome as a speaker (0–1 line per level); the glucose, protease and LacI speakers are retired.
18. **The Commander's payoff in Prologue 1** ("I watched the whole thing. Nobody gave an order."):
    it comes only after the student has watched every step, so it states what they saw rather than
    announcing a theme. Keep it, or leave the thought unspoken until 1.7?
   **Decided (default):** keep it, after the student has watched every step.
19. **Where the Commander's goal begins.** Default: Prologue 2 ("Your job: keep this cell fed and
    growing, until it divides in two."). In Prologue 1 the student watches their own body, where
    nobody is given a job.
   **Decided (default, the spec's recommendation):** Prologue 2.

---

## Appendix A. Engine measurements made for this spec (engine 1.1.0, seed 1)

Scripts in the session scratchpad; one seed each, so they guide the design and the calibration
tool replaces them.

**Reference cell (steady preset + 10 min, glucose 10 mM).** ATP spent by use: translation 40.6%,
other building 27.4%, upkeep 26.6%, making amino acids 2.9%, transcription 2.6%, transport 0.0%.
Glucose in 537,164 /s; ATP made 923,763 /s. PtsG 13,210, so about 41 glucose per PtsG per second.
Ribosomes 10,715; running speed 11.78 aa/s; initiation 0.188 /s per copy at b = 1. Ribosomes per
copy: ptsG 9.2, gly 14.7, aaSyn 14.9, aaImp 6.5.

**Growth on lactose only vs LacY setting** (both sugars for 40 min, then lactose 5 mM only; mean over
hours 2–4 after the switch; lacZ ×1):

| LacY breakdown | ×¼ | ×½ | ×1 | ×2 | ×4 |
|---|---|---|---|---|---|
| none | 0.32 λref (1,978 LacY) | 0.71 (5,065) | 0.95 (9,150) | 0.94 (18,580) | 0.93 (34,530) |
| half-life 40 min | 0.12 (759) | 0.18 (998) | 0.37 (2,631) | 0.92 (6,523) | 0.95 (12,305) |
| half-life 20 min | 0.02 (109) | 0.11 (619) | 0.18 (1,032) | 0.42 (3,323) | 0.95 (7,042) |
| half-life 10 min | 0.00 (0) | 0.00 (5) | 0.12 (657) | 0.17 (975) | 0.37 (2,804) |
| half-life 4 min | 0 | 0 | 0 | 0 | 0.15 (710) |

A cell moved from glucose straight to lactose with LacY and LacZ both starting from none never
starts growing on lactose within 5 h in this setup (energy stays near the floor), so 1.4 must start
from a cell already living on lactose.

**LacY build-up from a newborn in glucose (lacZ ×1):** ×1: 337, 905, 1,559, 2,252 at 10, 20, 30,
40 min (87 copies made by 30 min); ×2: 693, 1,748, 3,367, 4,782; ×4: 1,381, 3,832, 6,487, 8,998 (351
copies made by 30 min). ×4 switched off at 5, 10 and 20 min gave 1,254, 2,602 and 4,981 LacY at
minute 30, and growth on lactose (lacZ built only from the newborn's ×1, about 2,200) of about 0.2,
0.36 and 0.6 of the glucose rate; with the splitter already made (§6.2.2) these are expected to be
higher, which the `l12` calibration measures.
