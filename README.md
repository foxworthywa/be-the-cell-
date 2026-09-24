# Be the Cell — run a bacterium through its genes

Be the Cell is a phone-first browser lab for a General Biology course. The student runs one
bacterium with a single lever, which of its genes are expressed, and every consequence has to
pass through DNA → RNA → protein: mRNA appears one molecule at a time, ribosomes read it, the
protein accumulates, and ATP, amino acids and growth respond. The cell is a deterministic model
of E. coli physiology whose parameters come from published measurements where they exist
(each is listed with its source and confidence in [`docs/BIOLOGY.md`](docs/BIOLOGY.md)), so a
protein the cell does not use costs ribosomes and ATP and slows growth by about the amount
measured in real bacteria. This repository holds milestone M1, the free-play lab; the levels
and story in [`docs/DESIGN.md`](docs/DESIGN.md) come later. Instructor: Alex Foxworthy.

**Live version:** https://foxworthywa.github.io/be-the-cell-/ (published on every push to `main`).

## What the student can do (M1 free-play lab)

- Set each of 7 genes with a promoter dial (Off, ¼, ½, 1, 2, 4): the glucose transporter
  (PtsG), the glucose-processing enzymes, the amino-acid-making enzymes, the amino-acid
  importers, the lactose permease (LacY), β-galactosidase (LacZ) and flagellin (FliC).
- Watch a gene that is switched on make its first mRNA within a minute or two, and its protein
  rise over tens of minutes; switch it off and watch the mRNA vanish and the protein dilute.
- Change the medium: glucose None, Low or High; lactose; amino acids. It never runs out, and
  there is no oxygen.
- Add a rifampicin-type or a chloramphenicol-type drug at a Low or Full dose.
- See the cell drawn from the model: each mRNA, the ribosomes, proteins, ATP and ADP, with
  "1 dot = N" always on screen.
- Follow graphs of mRNA, protein, ATP, cell size and growth, and a bar showing where ATP is
  being spent now.
- Read a one-sentence narrator that says what is happening and why.
- Pause, set the speed from real time to "1 s = 1 h", start the same cell again or a new one,
  and download a run file that replays exactly.
- Add it to the home screen and use it offline.

## How it works

- `src/engine/` — the simulation (`BTC.Cell`). Molecule counts, not molecules: each gene's
  transcripts are counted one by one, ribosomes share one pool (this is where the cost of a
  protein comes from), and ATP, amino acids, growth and division follow from the proteins that
  exist. It holds all simulation state and is the only code that changes it.
- `src/shared/` — pure helpers outside the engine: `BTC.dots` ("1 dot = N" scales and stable
  dot positions), `BTC.Recorder` (time series for the graphs) and `BTC.narrate` (the narrator's
  rules and sentences).
- `src/app/` — the lab UI. It reads `cell.observe()` and sends commands; it never writes to the
  cell (a lint test checks this).
- `tests/` — `npm test`, Node's built-in test runner with no dependencies. Each test title
  states a biology claim, and failures print the measured value.
- `tools/` — the parameter table generator, the steady-state preset maker and the
  cross-browser golden-hash page (`tools/golden.html`).

Plain JavaScript throughout: no framework, no ES modules and no npm dependencies. Each file
adds one part of the single global `BTC` and also loads in Node, so the tests run the same code
the browser does.

**Determinism and replay.** The engine uses only arithmetic that gives the same bits in every
browser, and all randomness comes from seeded streams, so the same seed and the same commands
give the same cell to the last bit. Every command is logged, and a run record (config, log and
a state hash every 600 simulated seconds) replays to the same hash with `BTC.replay.verify`;
that is how a downloaded run file can be checked.

## Model notes (for instructors)

Numbers are for the reference cell (glucose High, default dials), measured with engine 1.0.0.

- One E. coli-like cell in 10 mM glucose, without oxygen, at 37 °C. At each division one
  daughter is followed.
- Doubling time about 98 min (measured anaerobic E. coli: 90–126 min). Born at 1.0 fL, divides
  at 2.0 fL.
- mRNA half-life 3 min for every gene; proteins are not degraded, only diluted by growth.
- About 39 proteins per mRNA at the default ribosome-binding strength (literature 20–40). At
  ×1, the transporter gene makes about 250 mRNAs per generation, keeps about 10 at a time and
  holds about 14,000 PtsG.
- About 1.0 million ATP spent per second. Shares: making protein 41%, other building (lipids,
  wall, DNA, nucleotides) 28%, upkeep 26%, making RNA 3%, making amino acids 3%, transport
  about 0 in plain glucose. Making protein is the largest cost of growing; when
  chloramphenicol stops growth, upkeep takes 87%.
- Energy charge 0.89; ATP 3.1 mM, turned over every 2.7 s. Fermentation gives 2 ATP per
  glucose; glucose uptake is 12.6 mmol/gDW/h (measured anaerobic: 13–18).
- About 11,000 ribosomes (9.5% of the protein), 2.9 million proteins and 2,600 mRNAs.
- A useless protein slows growth by about 2% per 1% of the proteome: flagellin at ×4
  (11% of the protein) slows it by 21%.
- Low glucose (0.005 mM) about halves growth (doubling time about 200 min).
- Transcription runs at 35 nt/s and each ribosome at 11.6 amino acids/s, so a new lacZ mRNA
  takes about 90 s.
- The two bacterial growth laws are not programmed in; they emerge from ribosome allocation.

**Tell students before they start (first phone test):**

- To grow on lactose, set LacY and LacZ to ×4 with glucose still present and wait an hour
  before removing glucose. With less (for example ×1 for 30 min) ATP runs out and the cell
  stops; the model has no lag-and-adapt the way real E. coli does. Adding glucose back
  restarts a stopped cell within a few minutes.
- When carbon is short, ATP falls much further here than in real cells (the graphs then show
  "< 0.01 mM"); real cells keep ATP up from reserves and by slowing their ribosomes.

The simplifications, the values still to verify and every parameter with its source are in
[`docs/BIOLOGY.md`](docs/BIOLOGY.md).

## The single-file version

The published page is the whole app in one self-contained HTML file: every script and style is
inlined, and it makes no network requests. To keep a copy for offline or double-click use, open
https://foxworthywa.github.io/be-the-cell-/ and save the page as HTML only: "Webpage, HTML
only" in Chrome and Edge, "Web Page, HTML only" in Firefox, "Page Source" in Safari. (A
"complete" save stores the page as it is currently drawn, not the original file.) The saved
file runs from `file://`; only installing to the home screen and the offline cache need the web
address. The built file is not committed: `.github/workflows/pages.yml` runs `npm test`, builds
it and publishes it on every push to `main`.

## Running it locally

Node 22 or later; there is nothing to install (no npm dependencies).

```sh
npm test            # engine, narrator and UI tests (node:test)
npm run build       # writes dist/: the single-file index.html, sw.js, manifest and icons
npm start           # serves dist/ at http://localhost:8080/ (run the build first)
npm run ui-check    # builds, then runs the browser checks and saves screenshots
```

`npm start` passes options to `serve.js`: `npm start -- --port 9000`, or `npm start -- --root .`
to serve the unbuilt source files directly (no service worker is registered then). Opening
`dist/index.html` by double-click also works. Useful URL parameters: `?seed=N` (a new cell with
that seed), `?reset=1` (ignore the autosaved cell), `?test=1` (no autosave or service worker,
seed 1, and test hooks on `window.__btc.app.test`). The app opens on the level list (or the last
screen used); `?lab=1` opens the free-play lab, `?level=<id>` a level, and `?level=<id>&v=<6
characters>` a given variant as a think-aloud attempt 0 (docs/LEVELS.md §5.11).

`npm run ui-check` needs Playwright and Chromium installed globally (it never installs them,
and prints "skipped" without them). It checks five screen sizes (360×740, 375×553, 740×360,
768×1024, 1280×800) plus switching a gene on, removing glucose, rifampicin, reset, replay and
the `file://` page. Screenshots go to `test-artifacts/screens/` (or `-- --out <dir>`).
`node tools/make-icons.js` re-renders the PNG icons from `icons/*.svg` the same way; the PNGs
are committed.

## Documentation

- [`docs/DESIGN.md`](docs/DESIGN.md) — the course-level design: goals, levels, story,
  assessment, platform. (It calls the model spec `docs/MODEL.md`; that document is
  `docs/ENGINE.md`.)
- [`docs/PRODUCT.md`](docs/PRODUCT.md) — what M1 is and is not, the roadmap, how the pieces fit.
- [`docs/BIOLOGY.md`](docs/BIOLOGY.md) — the biology the model must respect, the acceptance
  tests, the known simplifications and the parameter table.
- [`docs/PEDAGOGY.md`](docs/PEDAGOGY.md) — the teaching rules every screen and level follows.
- [`docs/VISUAL_STYLE.md`](docs/VISUAL_STYLE.md) — colours, type, motion and the dot rules.
- [`docs/ENGINE.md`](docs/ENGINE.md) and [`docs/LAB_UI.md`](docs/LAB_UI.md) — the engine and lab
  UI specifications (authoritative for implementation).
