# PEDAGOGY.md — teaching rules for the lab and every level

## Carried over from NeuronSim

1. **Prediction before explanation.** The student predicts what a gene, an mRNA count or the
   ATP level will do before the simulation shows it. In levels this is a question or a sketched
   curve scored against the model; in the free-play lab it is the habit the narrator and the
   paused start leave room for.
2. **Causal reasoning over terminology recall.** Questions ask "what happens / which way / why",
   not "what is this called". Names come after the function has been seen (below).
3. **Every visual comes from simulated state.** Nothing on screen is a canned animation. An mRNA
   appears because the engine finished a transcript, a ribosome glyph is stalled because the
   drug stalls that fraction, and the graphs are the engine's own numbers. Molecules never move
   toward a target: the only motion is jitter around fixed positions and markers for things
   crossing the membrane, whose rate is the model's flux.
4. **Never advance merely because time passed.** In levels, Continue is enabled only when the
   question is answered and the activity is done. The M1 lab gates nothing and starts paused.
5. **Each wrong answer gets its own feedback.** Every wrong option explains the specific
   misconception behind it, and the student can try again.
6. **Minimal text.** One idea per screen, a one-sentence narrator, and longer explanations behind
   tap-to-reveal "About" rows. The picture carries the meaning.
7. **Connect molecules to the whole cell.** The same screen shows a gene's mRNA and protein, the
   ATP gauge, the growth rate and where the ATP is going, so a single switch can be followed to
   its cost for the whole cell.
8. **One causal loop.** Gene switched on → RNA polymerase makes mRNA → ribosomes translate it,
   paying amino acids and ATP → the protein does its job (import, convert, build) → resources
   and growth change → back to the genes. Every pass takes time and resources, and its products
   decay or dilute. That delay, cost and turnover is what the levels score.
9. **Semi-quantitative model, invisible equations.** The student never sees an equation, but the
   behaviour is right, so free play (a gene at ×4, glucose removed, a drug added) has real
   consequences instead of a scripted animation.

## Specific to Be the Cell

### Teach first, in plain words (Alex, after the first play-through)

The game builds understanding; it does not test understanding the student has not had a chance
to build. So:

- **Plain language wherever possible.** Write for a first-year non-major reading on a phone.
  Course terms (gene, DNA, mRNA, ribosome, protein, enzyme, transporter, repressor, promoter,
  ATP) stay, with a plain explanation the first time each appears. Family names, acronyms and
  dense clauses do not ("Yours are GLUTs and SGLTs, not PtsG's family" became "Your
  transporters are different proteins that do the same job").
- **Function before name.** Every protein is introduced by what it does, in context, with a
  picture of its shape at work, and only then by name. A goal such as "400 LacY in the membrane
  by minute 14" is rewritten as "Lactose, the sugar in milk, gets in only through a transporter
  protein in the membrane. Get 400 of them in place within 14 minutes."
- **Show the process before asking about it.** The opening walks through gene → mRNA → protein
  at a scale where each step is visible (see docs/PROLOGUE.md) before any level asks the student
  to reason with it.
- **Predictions invite a guess; feedback explains the cause.** A wrong prediction is the start
  of an explanation, never a failed test.
- **Each level teaches before it asks.** Every level follows one pattern: watch it happen up
  close (the gene close-up, one step at a time, gated on the student) → guess, then see →
  try a small concrete task that uses exactly what was just seen → explain. Scores and codes
  apply only to the last two parts.
- **Few readouts, added in tiers.** Early levels show only the one or two quantities the lesson
  is about, as big plain counters or a single simple graph. Graph options (gene chips, lin/log,
  windows), the ATP-spending bar and the status-strip readouts appear later, one at a time, each
  introduced with one plain sentence saying what it shows. The free-play lab opens in a simple
  mode with an "All controls" option.

### The player is the genome

The only lever is which genes are expressed. Everything else in the cell happens because a
protein encoded in the genome does it. There is no button that builds a machine, delivers ATP or
moves a molecule, and every action pays the full DNA → RNA → protein cost. An unneeded protein
slows growth; that is measured bacterial physiology (Scott & Hwa 2011), not a made-up penalty.

### From operator to designer

- **Operator** (early levels and the M1 lab): the student switches genes on and off in real
  time. It is the intuitive entry point and builds a feel for delay and cost.
- **Designer** (from level 1.7): the student edits the DNA before the run (promoters, operator
  sites, regulator genes), presses play and cannot touch it. The cell responds only through its
  own molecules.

The move from operator to designer is itself the lesson: nobody is in charge, and regulation is
done by proteins encoded in the same DNA. Designer solutions also make better evidence: they
can be inspected, re-run and compared, and nobody gets through on fast reflexes.

### Story: learning to let go

The player starts as "the Commander", convinced they run the cell, and wins only by letting go.
Each loss of control is a plot beat and a real change in how the game plays (operator mode,
then the Virus reading the same ribosomes, then designer mode, then the student's own cells,
then a final run with no controls). The joke is always on the belief that someone is in
charge, so the humour teaches the lesson instead of undercutting it.

### Tone rules for the narrator and the story

- Dry and understated: deadpan, never slapstick, and no exclamation marks. In the lab the cell
  is not a character and there are no mascots.
- **No teleology.** Molecules never want, try, decide, choose or know anything. Only the
  Commander thinks that way, and the story proves them wrong. Things happen because molecules
  collide and fit.
- One or two lines per story beat, skippable and replayable. No line carries biology the
  simulation does not also show.
- The narrator says one causal sentence at a time: what is happening and why, in words, with no
  numbers.
- All text lives in data files, not code, so it can be rewritten freely. Every joke is checked
  against the misconception list before it ships, and humour is playtested like any other
  mechanic.

The lab enforces this with a lint (`docs/LAB_UI.md` §7.3; tests U-3 and c-1). Every narrator
sentence, expanded for every gene with names shown and hidden, must be one sentence of at most
140 characters, with no digits and no exclamation mark, and must not match
`/\b(wants?|tries|trying|try to|decides?|chooses|knows|needs? to|in order to|so that|likes?|hungry|happy)\b/i`.
Every other student-facing string follows the same length, exclamation and wording rules. The
lint matches words, not intent, so story lines that deny intent ("I don't want anything.") will
need a reviewed exception when story text arrives.

### Names after function

- A gene is named only after the student has seen what its protein does. The M1 lab shows names;
  levels can hide them ("Gene A" … "Gene G", jobs "Unknown") through `labConfig.showNames`,
  with no code changes.
- Early levels show a black-box "glucose-processing machinery", not the steps of glycolysis.
  Fermentation and respiration are named after the student has seen the difference in ATP.
- Gene symbols are shown in muted italics beside the plain names (useful to majors, easy to
  ignore for everyone else).

### Honest scale

- Game time runs faster than real time, and the speed is always shown ("1 s = 1 min", "60× real
  time"). If a device cannot keep up, the speed it actually reaches is shown as well.
- "1 dot = N" is always visible for every species, and anything drawn out of proportion says so
  (the cell's width, the mRNA strands).
- Lumped genes carry a "stands for ~N genes" badge.
- The "About this cell" sheet lists what the model simplifies (`docs/BIOLOGY.md`, "Known
  simplifications").

### Universality: from bacteria to your own cells

Chapter 1 uses a bacterium as the simplest cell that does it all, never as the topic itself.

1. **Start in the student's body.** The prologue zooms from the student to a pancreatic cell
   making insulin, then to a ribosome, and only then to a bacterium.
2. **Stamp every card** the student collects as **Universal** or **Not in your cells** (the
   design doc's "Bacteria-only"; renamed after the M2 biology review, because archaea have no
   nucleus either and some animals have operons). The list stays short: operons, no nucleus,
   transcription and translation happening together, a circular chromosome.
3. **"Meanwhile, in you"** after every chapter 1 level: one or two screens with the same process
   in a human cell (glucose transporters in gut and muscle, insulin from many copies of one
   mRNA, red blood cells wearing out in about 120 days, sickle-cell hemoglobin, flu and mRNA
   vaccines, transcription factors, mitochondria).
4. **A bridge level** ("Magic bullet") with both cells side by side: only drug targets that
   differ between them, such as the bacterial ribosome, stop the infection and spare the
   patient.
5. **Chapter 2 opens with a replay** of level 1.1 in a human cell, with a scored prediction of
   what carries over.
6. **Transfer questions about human cells** in every mastery check.

**Language rules.** Never call human cells "advanced", an "upgrade" or "evolved from bacteria",
and never call bacteria "primitive". They are two designs descended from a common ancestor, each
with its own trade-offs.

## Misconceptions

Each misconception has a level built to confront it and a behaviour in play that flags it for
the instructor.

| Misconception | Confronted in | Signal in play |
|---|---|---|
| DNA acts directly or "makes" the trait | Prologue, 1.1 | Expects the environment to change before any protein exists; debrief choice |
| Proteins are food or material, not machines | 1.1, 1.5 | Debrief choice |
| mRNA is a pointless middleman | 1.2 | Keeps transcribing past the target; predicts protein stops rising the moment transcription stops |
| Once made, molecules last | 1.4 | Pulses a gene on and off; predicts a flat level after expression stops |
| All mutations are equally harmful | 1.5 | Predicts a silent mutation breaks the protein |
| Food is energy by itself; ATP is free | 1.3, 1.8 | Expects ATP to rise before glucose-processing enzymes exist |
| The cell "decides"; someone is in charge | 1.7, 2.4 | Debrief explanation choices |
| Bacteria do this; human cells don't, or do it differently | Bridge, 2.1 | Wrong carry-over predictions in 2.1 |
| Bacteria are "primitive"; human cells are an upgrade | Bridge, 2.1 | Debrief choice |
| Different cell types have different DNA | 2.6 | Tries to edit the genome to make the second cell type |

The M1 lab already shows the behaviours behind several of these: protein that keeps rising after
a switch-off (c1), mRNA that decays within minutes and protein that dilutes (a3, a4), ATP that
cannot rise before the enzymes exist (g1–g6), and growth that slows under a useless protein (f1).

## Evidence, not just completion

Levels score what students do, combined so that no single part can be gamed: the goal met,
efficiency against par, a prediction sketched before the run, a short debrief, and a transfer
variant (`docs/DESIGN.md`, "Assessment and the mastery gate"). Because the engine is
deterministic, every score can be recomputed by replaying the run.
