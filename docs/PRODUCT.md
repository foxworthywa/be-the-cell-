# PRODUCT.md

**Be the Cell** (working title) is a resource game for a General Biology course, for majors and
non-majors. Students run a cell with one lever, which genes it expresses, and every action pays
the full DNA → RNA → protein cost, so playing well takes a working model of the central dogma.
It starts in a bacterium, moves to a human cell, and is built to become a mastery gate after a
low-stakes pilot. The full design is `docs/DESIGN.md`.

## M1: the free-play lab

M1 is the first thing students touch, and the basis for the first small-group sessions.

**What it is**
- One screen and one bacterium (an E. coli-like lab strain without oxygen), with 7 genes, each
  on its own promoter dial (Off, ¼, ½, 1, 2, 4).
- A medium to change (glucose None/Low/High, lactose, amino acids) and two drugs
  (rifampicin-like, chloramphenicol-like) at Low or Full dose.
- A cell view drawn from engine state, gene cards, graphs, an ATP-spending bar and a
  one-sentence narrator.
- Pause and five speeds (real time to "1 s = 1 h"), "Start over" (the same cell or a new one),
  an "About this cell" sheet that lists the simplifications, and "Download this run": a file
  that replays exactly.
- Phone first, with layouts for phones in portrait and landscape, tablets and laptops. It
  installs to the home screen, works offline, and the published page is a single
  self-contained file that also runs from `file://`.
- No accounts and no server. The app makes no network requests, and nothing leaves the device
  except a run file the student chooses to send.
- It starts paused, and nothing is gated.

**What it is not**
- No levels, story, prediction sketching, scoring, completion codes or telemetry (M2 onward).
- No hidden gene names, designer mode, regulation (LacI, CRP), mutations or folding, phage,
  oxygen or human cells. The hooks for them exist but are inert.
- Not in the M1 UI, although the engine supports them: knockouts, ribosome-binding strength and
  per-second promoter rates, and the backup glucose-uptake option. Also deferred to M1.x:
  instructor options, shuffled gene order, watchers and marks, and most browser automation
  (`docs/ENGINE.md` §20, `docs/LAB_UI.md` §14).
- Not a grading tool. The mastery gate needs the server, Canvas LTI 1.3 and replay checks of M5.

## Roadmap

From `docs/DESIGN.md`. Small-group testing starts as soon as the lab and the first levels
exist; the mastery gate comes only after the spring pilot has been analysed.

| Milestone | Contents | Unlocks | Target |
|---|---|---|---|
| M0 Foundations | New repository, docs, engine, biology tests | — | Now |
| M1 Free-play lab | Bacterium with 7 genes, expression controls, live graphs; phone and laptop | First small-group sessions | Fall 2026 |
| M2 Playable slice | Prologue and levels 1.1, 1.2, 1.4 and 1.7 with their story beats; completion codes; telemetry | Think-aloud tests with the small group | Fall 2026 |
| M3 Chapter 1 | Levels 1.3, 1.5, 1.6, 1.8 and 1.9, the bridge level, Expert objectives | Phase A pilot in class | Before the spring term (January 2027) |
| M4 Chapter 2 | Levels 2.1–2.3 before the unit's spring dates; 2.4–2.7 before the later units | Full campaign | Spring 2027 |
| M5 Mastery | Server, Canvas LTI 1.3, replay verification, instructor dashboard | Phase C mastery gate | After the pilot analysis; fall 2027 at the earliest |

## How the pieces fit

```
  levels (later: data files)       level engine (later: modes, hints, flow, scoring)
              │                                 │ commands (source 'lesson', config.schedule)
              ▼                                 ▼
  src/app  ── cell.command() ──►  src/engine: BTC.Cell   (deterministic; owns all state)
     ▲                                  │
     │                                  │ cell.observe() · facts() · events
     │                                  ▼
     └──────────────  src/shared: BTC.dots · BTC.Recorder · BTC.narrate
```

- **`src/engine`** is the simulation and the determinism boundary: only code here touches
  simulation state, and it uses only operations that give identical results in every browser.
  The same engine runs in the browser, in the Node tests and, later, on a server that replays
  submitted runs.
- **`src/shared`** turns engine state into things to show: dots and their scales, time series
  for the graphs, narrator sentences. It never draws from the engine's random streams.
- **`src/app`** is the lab UI. It reads the view and sends commands, never writes to the cell,
  and keeps every student-facing string in one content file.

The engine determines what happens biologically, the level sets the problem the student
investigates, and the renderer shows the consequences. Levels will be data (genome, medium
schedule, goals, par, prediction prompts, debriefs, evidence map), so adding a level does not
touch the engine. The M1 code already reserves what they attach to:

- **UI:** `labConfig` (names shown or hidden, allowed levels, locked controls), an empty HUD
  slot, a plot overlay for sketched predictions, narrator `levelRules`, question sheets with
  per-option feedback, and content override tables.
- **Engine:** `config.schedule` and locked controls for designer mode, commands with source
  `'lesson'`, the inert genome-schema fields (operator sites, alleles, signal peptides,
  compartments), a free gene slot for level 1.1's decoys and level 1.7's LacI, and a term table
  that new energy sources and costs join as rows.

Later modules follow `docs/DESIGN.md` ("Architecture"): levels, game flow, assessment, sync and,
for M5 only, a server.
