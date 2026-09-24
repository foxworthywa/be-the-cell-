# Be the Cell: Lab UI specification v1.1 (M1 free-play lab)

**Status:** ready to implement. Committed as `docs/LAB_UI.md`. It sits beside `docs/ENGINE.md` (the engine spec v1.1). Where the two touch, the engine spec is authoritative for physics and for the API. This document is authoritative for everything the student sees and touches, including the narrator (§7), which the engine spec defers to. v1.1 applies the adversarial review; every change is listed in "Changes from v1.0" at the end. **Instructor:** Alex Foxworthy (they/them). **Repo:** `/home/user/be-the-cell-` (GitHub `foxworthywa/be-the-cell-`, trailing hyphen included).

**Hosting and paths.** GitHub Pages serves the app at `https://foxworthywa.github.io/be-the-cell-/`, so the base path is `/be-the-cell-/`. Every URL in the app (manifest `id`, `start_url`, `scope`, icon paths, the service-worker script and scope, the cache list, and any link) MUST be relative (`./…`); nothing may start with `/`. The same build then works at the Pages path, on `localhost` and from `file://`.

**M1 scope trim.** Items marked *(deferred)* are listed in §14 "Deferred to M1.x (not implemented now)". M1 does not build or test them.

**Normative words:** MUST, MUST NOT and SHOULD. "Engine spec §x" refers to `docs/ENGINE.md`.

---

## 0. Scope and principles

### 0.1 In M1

The M1 lab is one screen, a free-play lab with these parts:
- **status strip:** clock, speed and pause, an ATP gauge, growth, and the generation count;
- **cell view:** drawn from engine state;
- **genes panel:** 7 gene cards;
- **medium and drugs panel;**
- **graphs panel:** small time-series plots and an ATP-spending bar;
- **narrator:** one causal sentence at a time;
- **reset and new-cell sheet,** an "About this cell" sheet, and "Download this run";
- an installable PWA with offline caching, a single-file `dist/index.html` (which is also the published page), and the `file://` double-click path.

### 0.2 Not in M1 (hooks reserved: §12)

Levels, story, prediction sketching, name hiding, the designer mode, oxygen, and knockouts in the UI. Also deferred for the first student test (§14): instructor options, RBS and per-second rate controls, gene-slot variants, and most browser automation.

### 0.3 Rules carried from NeuronSim, and how this UI meets each

| Rule | How the lab UI satisfies it |
|---|---|
| Every visual is rendered from simulated state | The cell view, plots, cards and narrator read only `cell.observe()`, `BTC.observe.facts()`, events and the Recorder. There are no timers on wall-clock time. Jitter and flux markers are display effects that cannot change any count or position that encodes data (§2.6). |
| Honest scale | The time compression is always shown in the status strip, and "1 dot = N" is always visible: the legend for the cell's contents, and an "outside: 1 dot = N" label on the canvas for the medium. Width exaggeration is disclosed on the scale bar ("1 µm · width ×2"); not-to-scale mRNA is disclosed in the key sheet. "Stands for ~N genes" badges appear on the lumped genes. |
| Never advance just because time passed | This matters for levels. In M1 the lab starts **paused** and nothing is gated. |
| Minimal text | One idea per screen and a one-sentence narrator. Longer explanations sit behind tap-to-reveal "About" rows. |
| No teleology | Every student-facing string lives in one content file and is linted (§11, U-3). |
| Names after function | The lab shows names. Every name comes from `BTC.content` through `labConfig.showNames` (§12), so levels can hide them without code changes. |
| Tone | Dry and understated. The cell is not a character. There are no exclamation marks, jokes or mascots. |

### 0.4 Engineering principles

- **Classic scripts only.** Each file uses the engine's UMD pattern and sets `BTC.<name>`. There are no ES modules, no framework and no dependencies.
- **Node-loadable app files.** Every `src/app/*` file MUST load in Node without a DOM, touching DOM only inside functions called at mount. This keeps the pure helpers (layout, geometry, formatting, plot scales, narrator hold) unit-testable, and lets test b-1 load every file.
- **Engine owns state; the UI issues commands.** The UI MUST NOT write to `cell.*` or `view.*` (engine spec test c-2).
- **Separate randomness.** Rendering MUST NOT draw from engine PRNG streams. Positions come from `BTC.dots.pos` (hash-based). `Math.random` is banned in `src/app` and `src/shared`. The only randomness in the app is `crypto.getRandomValues`, used once to pick a new cell's seed.

---

## 1. Screen layout per breakpoint

### 1.1 Layout classes

`BTC.layout.classify(w, h)` is pure and tested. It runs on load, on `resize` and on `orientationchange`, then sets `<body data-layout="…">`, plus `data-short` when `h < 600` (one-line legend, §2.9). CSS grid areas key off that attribute. Media queries are used only for theme and reduced motion.

```
classify(w, h):
  if (w >= 1024 && h >= 560) return 'wide'      // laptops, Chromebooks, landscape tablets
  if (w > h && w >= 600)     return 'split'     // landscape phones, small windows
  if (w >= 600)              return 'stack'     // portrait tablets (768x1024)
  return 'compact'                              // phones in portrait (360x740 primary)
```

| Layout | Main regions | Tab set |
|---|---|---|
| compact | status strip, HUD slot, one content pane, narrator, bottom tab bar | Cell, Genes, Medium, Graphs (bottom bar) |
| stack | status strip, HUD slot, cell view (top, 42% of height), narrator, tabbed panel below | Genes, Medium, Graphs (tabs at the top of the panel) |
| split | status strip (one row), left: cell view and narrator (55% of width); right: tabbed panel | Genes, Medium, Graphs |
| wide | status strip (one row); left column: cell view, narrator, graphs grid; right panel 380 px | Genes, Medium (graphs are always visible) |

**Sizing rules for every layout**
- Use `height: 100dvh`, with a `100vh` fallback.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- Pad with `env(safe-area-inset-*)`: the status strip gets the top inset, and the tab bar or bottom edge gets the bottom inset.
- **The page itself never scrolls.** Panels scroll internally with `overflow-y: auto` and `overscroll-behavior: contain`.
- There is no horizontal page scroll at any width ≥ 320 px (test P1).

**Tab state**
- The active tab is UI state, remembered in `localStorage` (§10.5).
- When the layout class changes, a tab that no longer exists maps to the nearest one (Cell → Genes, and Graphs → Genes in `wide`).
- The **selected gene** is shared across all views (§3.6). Its default is `fliC`, which is Off at the start, so a first-time student sees the Off segment selected and "mRNA 0" (a gene that is already on at steady state shows no change when play is pressed). Saved preferences keep their own choice.

### 1.2 Compact (phone portrait, 360×740): Cell tab

Height budget, assuming 640 px of usable height in a browser tab (740 px in an installed PWA; about 553 px in Safari on a 375×667 iPhone SE):

| Region | Height (px) |
|---|---|
| status strip | 68 |
| HUD slot | 0 in M1 |
| cell canvas | flexes; **minimum 220** (≈340 at 640 px, ≈440 at 740 px, ≈271 at 553 px, before safe-area insets) |
| focus bar | about 110: a 56 px gene row (name, then mRNA and protein on their own lines, so the height never changes with the counts) plus a 54 px promoter row (§2.8); under 600 px tall the counts share one line and "Change" becomes a chevron, about 98 |
| legend | 36 (2 lines, clamped so it never grows to 3); **18 (1 line) when the viewport is under 600 px tall** (§2.9) |
| narrator | **fixed** 72 (3 lines at 15 px); 54 under 600 px tall (3 lines at 13 px). A fixed height, so a new sentence never resizes the cell view |
| tab bar | 56, plus the safe-area inset |

Fixed regions total 300 px (282 px under 600 px of height), so the canvas never drops below 220 px on any phone of 502 px usable height or more, and the page still never scrolls. If the usable height is below 502 px (very small windows), the canvas keeps its 220 px minimum and the narrator drops to one line with an ellipsis; the full sentence stays in the canvas `aria-label`.

```
┌──────────────────────────────────────┐ 360
│ [ || ]  12 min 30 s     ┌──────────┐ │  row 1, 44 px
│  48px   generation 3    │1 s = 1 min│ │  speed chip
│                         └──────────┘ │
│ ATP ▮▮▮▮▮▮▮▯ normal   doubling ≈98 min│  row 2, 24 px
├──────────────────────────────────────┤
│ (level HUD slot: 0 px in M1)         │
├──────────────────────────────────────┤
│  ⬡        ⬡             ⬡     ⬡      │  outside: glucose (hexagons)
│      ⬡  ╭──────────────╮   ⬡         │
│         ▐ ▭   ∙ ◆  ▵  ▭▌             │  membrane with transporters (▭)
│   ⬡     │ ∘  ≈≈  ●  ◇  │       ⬡     │  ≈ mRNA, ● protein, ∘ ribosome
│         │  ┌┄┄┄┄┄┄┐  ● │             │  ◆ ATP, ◇ ADP, ▵ amino acid
│  ⬡      │  ┆ DNA  ┆ ≈  │   ⬡         │
│         │  └┄┄┄┄┄┄┘ ∘  │             │  rod drawn vertically in portrait
│    ⬡    │ ●  ◆   ▵   ∘ │      ⬡      │
│         ╰──────────────╯             │
│ [Paused]                   ├─1 µm─┤  │  overlays: badge, scale bar
├──────────────────────────────────────┤
│ ● Flagellin  mRNA 12 +2 · prot 34,100 ▸│ focus bar row 1, 40 px (tap: choose gene)
│ [Off][ ¼ ][ ½ ][ 1 ][ 2 ][•4 ]         │ focus bar row 2, 48 px: its promoter control
│ 1 dot = 1,000 proteins · 100 ribosomes │ legend (2 lines, 13 px; 1 line
│ · 100,000 ATP · 1 mRNA  [Key]          │  below 600 px of height)
├──────────────────────────────────────┤
│ The cell is growing steadily on      │  narrator (3 lines, fixed height)
│ glucose.                             │
├──────────────────────────────────────┤
│  [◉ Cell] [ Genes ] [Medium] [Graphs]│  tab bar: icon + label, 56 px
└──────────────────────────────────────┘
```

### 1.3 Compact: Genes tab

The status strip, narrator and tab bar stay in place; only the content pane changes. The cards scroll.

```
├──────────────────────────────────────┤
│ Genes            lab strain · [About]│  header, 36 px
│ ┌──────────────────────────────────┐ │
│ │▮ Glucose transporter  ptsG making mRNA│
│ │ Carries glucose across the membrane.│
│ │ [Off][ ¼ ][ ½ ][•1 ][ 2 ][ 4 ]     │  segmented, 48 px tall
│ │ mRNA 10 +2   protein 13,700  ╱‾‾╲_ │  counts + sparkline
│ │ ribosome share ▮▯▯▯▯▯▯▯▯▯  1%       │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │▮ Glucose-processing enzymes  gly │ │
│ │   stands for ~10 genes            │ │
│ │ …                                 │ │
│ └──────────────────────────────────┘ │
│   … (7 cards, about 150 px each) …   │
├──────────────────────────────────────┤
│ narrator                             │
├──────────────────────────────────────┤
│  [ Cell ] [◉Genes] [Medium] [Graphs] │
```

### 1.4 Compact: Medium tab

```
│ Medium (never runs out)              │
│ Glucose        [None][ Low ][•High ] │  Low = 0.005 mM, High = 10 mM
│ Lactose        [•None][ Present ]    │  5 mM
│ Amino acids    [•None][ Present ]    │  2 mM
│ No oxygen: this flask is like the gut.│
│──────────────────────────────────────│
│ Drugs  (act instantly; no resistance)│
│ Rifampicin-type                       │
│ Blocks RNA polymerase: no new mRNA is │
│ started.          [•Off][ Low ][Full]│
│ Chloramphenicol-type                  │
│ Stalls ribosomes: mRNA stays, protein │
│ is not made.      [•Off][ Low ][Full]│
│──────────────────────────────────────│
│ [ Start over… ]  [ About this cell ] │
│ [ Download this run ]                │
│ build 3f9a1c2e · seed 20270115       │  small, muted
```

### 1.5 Compact: Graphs tab

```
│ [●ptsG][○gly][○aaSyn][○aaImp][●lacZ]…│  gene chips, wrap to 2 rows; ≤3 selected
│ Window [10 min][•1 h][ 6 h ][ All ]  │
│ ┌ mRNA (molecules)          [lin|log]┐│  each plot 120 px tall
│ │ ptsG 10 ─────╮                     ││  direct labels at line ends
│ │ lacZ 31 ──╱──┴───┊────────         ││  ┊ = division marker
│ └ 0          sim time (min)       60 ┘│
│ ┌ Protein (molecules)       [lin|log]┐│
│ ┌ ATP (mM)                           ┐│  fixed 0–4 mM
│ ┌ Cell size (fL)                     ┐│  fixed 0–2.5 fL; sawtooth
│ ┌ Growth (doublings per hour)        ┐│
│ ┌ ATP spending now ──────────────────┐│  100% stacked bar + labels
│ │▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮││
│ │making protein · other building ·   ││
│ │upkeep · making RNA · amino acids · ││
│ │transport                            ││
```

### 1.6 Stack (tablet portrait, 768×1024)

```
┌───────────────────────────────────────────────────────────────┐
│ [||] 1 h 12 min · gen 3  [1 s = 1 min]  ATP ▮▮▮▮▮▯ normal  doubling ≈98 min │ 56 px, one row
├───────────────────────────────────────────────────────────────┤
│                   cell canvas (landscape rod), 42% of height   │
│                   focus bar · legend                           │
├───────────────────────────────────────────────────────────────┤
│ narrator                                                      │
├───────────────────────────────────────────────────────────────┤
│ [Genes] [Medium] [Graphs]                                      │
│ gene cards in 2 columns (each ≥ 340 px) / medium / graphs 2×N  │
└───────────────────────────────────────────────────────────────┘
```

### 1.7 Split (phone landscape, 740×360)

```
┌─────────────────────────────────────────────────────────────┐
│ [||] 12 min · gen 3 [1 s = 1 min] ATP ▮▮▮▯ ≈98 min          │ 44 px
├──────────────────────────────┬──────────────────────────────┤
│ cell canvas (landscape rod)  │ [Genes][Medium][Graphs]       │
│ legend (1 line)              │ scrolling panel               │
│ narrator (2 lines)           │                               │
└──────────────────────────────┴──────────────────────────────┘
```

### 1.8 Wide (laptop, 1280×800)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [||] t = 1 h 12 min · generation 3   [1 s = 1 min · 60× real time]  ATP ▮▮▮▮▮▮▯ normal   doubling ≈ 98 min │
├──────────────────────────────────────────────────────────┬───────────────────┤
│                                                          │ [Genes] [Medium]  │
│           CELL VIEW (canvas, landscape rod)               │ ┌───────────────┐ │
│           ~900 × 400                                      │ │ gene card     │ │
│  focus bar · legend (1 line)                              │ │ gene card     │ │
│  narrator                                                 │ │ …  (scroll)   │ │
├──────────────────────────────────────────────────────────┤ │               │ │
│ gene chips · window         (graphs always visible)       │ │               │ │
│ ┌ mRNA ───────────────┐ ┌ Protein ─────────────┐          │ │               │ │
│ ┌ ATP ────────────────┐ ┌ Cell size ───────────┐          │ │               │ │
│ ATP spending now ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮ (growth plot: chip toggle)│ └───────────────┘ │
└──────────────────────────────────────────────────────────┴───────────────────┘
```

In `wide`, the right panel is 380 px. The left column splits its height 55/45 between the cell view and the graphs area. The Growth plot is swapped in for the Cell size plot with a chip ("Size | Growth").

---

## 2. Cell view

### 2.1 Technology

- The view uses **one `<canvas>`** (2D context) for everything drawn, plus **HTML overlays** for text: the "Paused" badge, the drug badges, the scale bar label, the tap-to-identify chip and the legend.
- There is no SVG text and no per-molecule DOM.
- The backing store is sized to `min(devicePixelRatio, 2)` times its CSS size. It is resized only when the element's size changes (ResizeObserver). `setTransform(dpr, 0, 0, dpr, 0, 0)` is applied after each resize.
- `role="img"`; `aria-label` holds the current narrator sentence plus the focus gene's counts, updated only when the narrator key changes.

### 2.2 Geometry (`BTC.cellgeom`, pure, tested)

**Orientation**
- The rod lies along the stage's long axis: vertical in portrait stages, horizontal in landscape ones.
- Orientation is fixed per mount and changes only on relayout, with hysteresis: a vertical rod turns horizontal only when the stage is more than 10% wider than tall, and back only when it is more than 10% taller than wide (`create(w, h, prevVertical)`), so a few pixels of layout change never flip it.

**Scale**
- `pxPerUm` is fixed for the session so that growth is visible. It is chosen so that a rod of length `L(2.3 fL)` plus 12% margin fits the long axis.
- Rod length uses `view.cell.length_um` (true length).
- Drawn width = `2 × view.cell.width_um` (width exaggerated ×2, disclosed on the scale bar as "1 µm · width ×2").
- If a cell ever exceeds the fitted length, `pxPerUm` steps down by 15% and the scale bar updates. This does not happen in normal M1 runs.

**Scale bar and disclosure**
- The scale bar reads "1 µm · width ×2" and runs along the long axis (the bar measures length, which is to scale).
- The legend sheet says: "Length to scale; width drawn twice as wide so the inside is readable."

**Cell-local coordinates**
- `u ∈ [0,1]` along the axis and `v ∈ [−1,1]` across it.
- `map(u, v, geom, out)` places the point inside the spherocylinder. It scales `v` by the local half-width, so the caps are rounded.
- As the cell grows, points stretch with it. A dot does not jump between frames unless its own data changes.

**Perimeter coordinate**
- `s ∈ [0,1)` is used for membrane proteins.
- `perimeter(s, geom, out)` returns the point on the membrane and its outward normal.

**Nucleoid**
- One nucleoid: an ellipse centred at u = 0.5, spanning 55% of the length and 60% of the width.
- At dosage 2 (after the `replication` event): two lobes centred at u = 0.3 and u = 0.7, each 40% × 60%.
- The chromosome is drawn as a closed, looped line inside each lobe, built from 16 hash-placed control points per epoch.
- The 7 gene loci sit at fixed fractions along that loop (slot k at `(k + 0.5)/8`). At dosage 2 every locus appears once in each lobe.

**Hit testing**
- `hitTest(x, y)` returns the nearest drawn item within 16 CSS px.
- It uses a coarse grid (8×8 bins, rebuilt only when the positions buffer is rebuilt, §2.7).

### 2.3 What is drawn and where the numbers come from

Every count below is `BTC.dots.count(n, N)`, which is `floor(n/N + 0.5)`. The value N is shown in the legend.

**Visibility rule.** If `0 < n < N/2` for a species that matters (a player protein, or mRNA when N > 1), draw **one hollow dot** meaning "some, fewer than half a dot's worth". The key sheet explains it. This way a gene that is switched on never looks empty while its count is still small.

| Element | Shape | Colour token | Source (view path) | Scale N | Position |
|---|---|---|---|---|---|
| Medium region | fill | `--outside` | – | – | stage outside the rod |
| Glucose outside | hexagon outline, 7 px | `--sugar` | `env.glucose_mM` × N_mM × (visible outside area µm² × 1 µm depth) | fixed 10⁶ | `dots.pos('glc', k, 0, outsideRect)`, rejected if inside the rod (deterministic retry index) |
| Lactose outside | two linked hexagons | `--sugar` | `env.lactose_mM` (same volume rule) | fixed 10⁶ | as above |
| Amino acids outside | small triangle | `--aa` | `env.aminoAcids_mM` | fixed 10⁶ | as above |
| Membrane | two parallel strokes (bilayer), 3 px | `--membrane` | `cell.length_um`, `width_um` | – | capsule outline |
| Constriction (septum) | membrane indents at u = 0.5 | `--membrane` | progress p = (V − Vbirth)/1 fL; depth = max(0, (p − 0.8)/0.2) × 0.45 × half-width | – | drawn from size; the engine has no septum (disclosed in the key) |
| Sister ghost after division | dashed outline of the sister, 40% alpha fading to 0 | `--membrane` | `clock.cellAge_s`: alpha = 1 − age/180; offset = age/180 × one rod length | – | drawn from sim time since birth (not from real time) |
| Cytoplasm | fill | lerp(`--inside-depleted`, `--inside`, clamp((E − 0.1)/0.6, 0, 1)) | `energy.E` | – | inside the rod |
| Background proteome | static stipple, 6% alpha | `--muted` | none (constant) | not counted | rebuilt per epoch; the key says "the other ~4,000 genes' proteins; not counted" |
| Nucleoid and DNA | 8% tint fill; DNA as a 1.5 px double line | `--nucleoid`, `--dna` | `cell.dosage` | – | §2.2 |
| RNA polymerase (transcribing) | ring, 5 px, at the growing tip of each nascent transcript | `--rnap` | `genes[i].nascent` | 1 | at the locus |
| Nascent mRNA | strand from the locus, length ∝ progress | gene colour | `genes[i].nascentProgress[j]` | 1 | at gene i's locus, fanned by j |
| Mature mRNA, focus gene | wavy polyline; length ∝ ℓ, clamped 12–48 px, then scaled down uniformly (floor 8 px) so that Σ(length × 2 px stroke) of all focus strands ≤ 40% of the cell interior's area; not to scale (disclosed) | gene colour | `genes[f].mRNAIds[0 … mRNA)` | 1 | `pos('m:'+id, 0, epoch)`. Keyed by **molecule id**, so the molecule that decays is the dot that disappears |
| Mature mRNA, other player genes | short straight mark, 6–8 px (length from the hash), 2 px stroke; still one mark per molecule | gene colour | `genes[i].mRNAIds[0 … mRNA)` | 1 | `pos('m:'+id, 0, epoch)`, keyed by molecule id as above |
| Ribosomes on the focus gene's mRNA | two-lobed glyph (large and small subunit), 4 px, drawn at 60% alpha over the strands so the mRNA shows through | `--ribosome` | `genes[f].ribosomes`, spread over that gene's mRNA and nascent strands | **1**, or **10** when `genes[f].ribosomes` > 400 (back to 1 below 320); the key sheet row "ribosome on the watched mRNA" and the tap chip give the scale | along each strand. Strand j gets `floor(R/S)` glyphs (R = glyph count after scaling), and the remainder goes to strands chosen by `hash(id, epoch)` order |
| All other ribosomes | same glyph, 5 px. Filled = elongating; hollow = free; a short `--bad` bar across the glyph = stalled | `--ribosome` | `ribosomes.elongating − focus polysome`, `free`, `stalled` | 100 | `pos('rib', k, epoch)` |
| Membrane proteins (ptsG, lacY, aaImp) | rounded rectangle spanning the bilayer, oriented along the normal, 5×9 px | gene colour | `genes[i].protein` | shared protein scale P | `perimeter(hash01('p:'+id, k, epoch))` |
| Cytoplasmic proteins (gly, aaSyn) | filled circle, 5 px | gene colour | `genes[i].protein` | P | `pos('p:'+id, k, epoch)` |
| LacZ | four-lobed cluster (tetramer), 7 px | gene colour | `genes.lacZ.protein / 4` tetramers, drawn at scale P/4, so 1 glyph = P monomers | P | as above |
| Flagellin | short bar (rod), 3×8 px | gene colour | `genes.fliC.protein` | P | as above |
| Focus gene's protein | same glyph plus a 1.5 px `--accent` ring | – | – | – | – |
| ATP | filled diamond, 6 px, with a 1 px ink outline at 40% | `--atp` | `energy.ATP` | 10⁵ | `pos('atp', k, epoch)` |
| ADP | hollow diamond, same size | `--atp` | `energy.ADP` | 10⁵ | `pos('adp', k, epoch)`. ATP + ADP is constant, so starvation shows as diamonds going hollow, not vanishing |
| Amino acids inside | small triangle, 4 px | `--aa` | `aminoAcids.count` | 10⁵ | `pos('aa', k, epoch)` |
| Lactose inside | linked hexagons, 6 px | `--sugar` | `lactose.inside` | 10⁵ | `pos('lin', k, epoch)` |
| Glucose inside | not drawn as a pool | – | – | – | The engine has no free-glucose pool: PtsG hands glucose straight on as glucose-6-phosphate. The key says so. Flux markers (§2.5) show the traffic. |

**Shared protein scale**
- One scale P is used for **all** player proteins, so dot counts compare honestly across genes.
- `P = BTC.dots.scaleFor(max_i protein_i, 120, prevP)`. This has 20% hysteresis, and the ladder is 1, 10, 100, 1,000, 10⁴ …
- The reference cell gives P = 1,000: gly and aaSyn about 118 dots each, and ptsG about 14.

**Dot budget**
- The hard cap is **1,500 glyphs per frame**.
- The focus polysome follows its own 1 → 10 rule above, which keeps it under the cap in every M1 setting (fliC ×4 as focus gene is about 1,900 ribosomes, drawn as about 190 glyphs).
- If a computed layout would still exceed the cap, the species with the most glyphs, **other than mRNA and the focus polysome**, moves one ladder step up (the legend updates). mRNA stays at 1 per molecule.
- A test asserts the cap across the fuzz scenarios (U-6).

**Drug badges** are HTML overlays at the top-left of the stage: "Rifampicin on" and "Chloramphenicol on", using the drug tokens. The drug's *effect* is visible in the drawing itself: no new RNA polymerase rings appear under rifampicin, and ribosomes show stalled bars under chloramphenicol.

### 2.4 Epochs and stability

- `epoch = view.clock.generation`. Dot k of a species keeps its (u, v) or s for the whole epoch.
- Counts change by adding or removing high-k dots. mRNA is keyed by molecule id, not by index.
- At division, the epoch changes and the layout reshuffles once. The halving of every count is then visible at a glance.

### 2.5 Flux markers ("things crossing the membrane")

These markers carry rates, not amounts.

| Marker | Flux (`view.flux`) | Path |
|---|---|---|
| glucose in | `glucoseIn` | from outside, through a ptsG glyph chosen by `hash(emitIndex)`, to just inside, then fades. If ptsG has no glyph (backup uptake), it crosses at a hashed perimeter point with no glyph |
| lactose in | `lactoseIn` | through a lacY glyph |
| amino acids in | `aaImported` | through an aaImp glyph |
| fermentation products out | `fermentationProductsOut` | small grey circles from inside to outside; key label "acids and ethanol out" |

- Emission uses `BTC.dots.FluxEmitter(N)`: the number spawned per frame is `emitter.add(flux_perS × dtSimThisFrame)`. It is exact, carries its remainder, and is state-driven.
- **Marker scale** N_f = the smallest ladder value (≥ 10³) with `flux × speed / N_f ≤ 20` markers per real second. It is shown in the key as "each marker = N glucose".
- **Marker lifetime** is 0.6 s of *render time*, a display constant disclosed in the key.
- **Render time** advances only while the simulation is running. When paused, markers freeze in place; they do not finish or vanish.
- The marker pool is preallocated: 128 per flux, and the oldest is recycled.

### 2.6 Motion: jitter only

- Molecules never move toward a target. The only motion is a small jitter around each dot's fixed position:
  `dx = A·sin(τ·ω₁ + φ₁)`, `dy = A·sin(τ·ω₂ + φ₂)`, with A = 1.2 CSS px, ω between 2 and 5 rad/s (from the hash), φ from the hash, and τ = render time (frozen while paused).
- Flux markers move along straight, fixed paths (§2.5).
- `Math.sin` is allowed here: the app is outside the determinism boundary, and none of this feeds back into the engine.
- **Reduced motion** applies under `prefers-reduced-motion: reduce` or the in-app toggle:
  - A = 0;
  - flux markers are drawn fixed at their path midpoint and fade over their lifetime;
  - the sister ghost does not drift and only fades.

### 2.7 Render pipeline and performance plan

**Per frame, when the cell view is visible and a redraw is due:**
1. Read `view = cell.observe()` (flyweight; no allocation).
2. **Rebuild the positions buffer only if something changed:** a count, the epoch, the focus gene, the scale P or the stage size. The buffer is one preallocated `Float32Array(1500 × 2)` plus a `Uint8Array` of kinds and a `Uint16Array` of source indices. An unchanged frame (the usual case when speed is below 1 tick per frame) skips the rebuild and only re-applies jitter.
3. **Draw in this fixed z-order:** outside fill, outside molecules (55% alpha), cytoplasm, stipple, nucleoid and DNA, nascent strands and RNA polymerase, other genes' mRNA marks, then **the crowd at 45% alpha** (pooled ribosomes, other genes' cytoplasmic proteins, ATP and ADP, amino acids, lactose inside), the focus gene's cytoplasmic proteins at full alpha, **the focus gene's mRNA strands** (a 4 px halo in `--inside` under the 2 px gene-colour stroke), the focus polysome (4 px, 60% alpha), membrane and membrane proteins (full alpha), flux markers, septum and ghost. A focus gene is always set, so the dimmed crowd is the permanent look. Only alpha changes: dot counts, positions and hit-testing do not, so honest scale and the pixel-identical paused frames (P14) still hold. (A "Closer" zoom is deferred: it would change pxPerUm, the scale bar and hit-testing.)
4. **Batch by (shape, colour):** one `beginPath()`, all subpaths, then a single `fill()` or `stroke()`. That is at most about 30 fill or stroke calls per frame.
5. **No allocation per frame.** No Path2D objects are created per frame. Glyph subpaths are appended with `moveTo`, `lineTo` and `arc`.

**Redraw scheduling**
- **While running:** redraw every animation frame by default. An exponential moving average of render cost adapts the rate: above 8 ms it caps at 30 fps; above 14 ms it caps at 20 fps.
- **While paused:** redraw only on a change (resize, focus gene, tab shown, theme). Two consecutive paused frames MUST be pixel-identical (P14).
- **When hidden** (another tab in `compact`): no drawing at all.

**Budgets on a low-end device** (the reference is a 4× CPU-throttled Chromebook-class run):
- cell render ≤ 6 ms per frame;
- positions rebuild ≤ 2 ms.

### 2.8 Focus bar and tap-to-identify

**Focus bar** (below the canvas):
- row 1 (56 px): colour chip, gene display name, then `mRNA m + n being made` and `protein P` on their own lines (on one line under 600 px tall, where "Change ›" shrinks to "›");
- tapping row 1 opens a gene picker sheet: 7 rows, 48 px each;
- row 2 (48 px), **compact layout only**: the focus gene's 6-segment promoter control, the same component as on the gene card (§3.4), labelled "promoter strength for {name}" for screen readers. In the other layouts the Genes panel is visible beside or below the cell, so row 2 is omitted.

This keeps the phone's predict-and-observe loop on one screen: a student switches the focus gene on or off and watches its mRNA appear or fade without leaving the Cell tab (the cell view does not draw while hidden). Every gene can be switched from the Cell tab, because tapping a locus or strand on the canvas, or choosing a gene in the picker, changes the focus gene. The Genes tab remains the overview of all 7.

**Tap on the canvas** runs `hitTest`:
- It shows a chip near the tap for 3 s of real time (this is UI chrome, not simulated state).
- Chip examples: "Flagellin protein · 1 dot = 1,000", "mRNA for the glucose transporter · molecule #4412", "Ribosome (stalled)" and "ATP · 1 dot = 100,000".
- Tapping a locus or a strand also makes that gene the focus gene.

### 2.9 Legend (always visible) and key sheet

**Legend line (13 px, at most 2 lines on a phone):**

`1 dot = 1,000 proteins · 100 ribosomes · 100,000 ATP · 1 mRNA  [Key]`

The legend is clamped to 2 lines. The focus polysome's own scale (1 or 10) is not in the legend line, because at 360 px it made a third line that resized the cell view; it is in the key sheet ("ribosome on the watched mRNA · 1 dot = N") and in the tap chip.

**Outside scale.** While outside molecules are drawn, an overlay at the top-right of the canvas reads "outside: 1 dot = 1,000,000" (the scale of the most numerous outside species), so the most visible glyphs on screen always carry their scale.

**Short screens.** When the viewport is under 600 px tall, the legend collapses to one line: the protein scale and the Key button, e.g. `1 dot = 1,000 proteins · … [Key]`. The full legend is always in the key sheet, and the collapsed line still states N for the proteins, the species whose scale changes most often.

**Key sheet** (tap "Key"), in one scrolling list:
- each glyph with its name and current N (including the focus ribosome scale);
- "the chosen gene's mRNA is drawn as long strands; other genes' mRNA as short marks, one per molecule";
- outside molecules: "1 dot = 1,000,000; outside counted in a 1 µm-deep slab of the visible medium";
- the flux marker scales;
- "width drawn ×2; length to scale";
- "mRNA drawn coiled, not to scale";
- "the grey stipple is the rest of the proteome, not counted";
- "Glucose from PtsG arrives already tagged (as glucose-6-phosphate) and goes straight to the enzymes, so free glucose is not drawn.";
- "hollow dot: fewer than half a dot's worth".

---

## 3. Genes panel

### 3.1 Card content

There is one card per gene, in slot order. (Display-order variants, `variant.slotOrder`, are deferred: §14.)

| Element | Content | Source |
|---|---|---|
| Colour chip | 12 × 28 px bar in the gene colour | `BTC.palette.gene[id]` |
| Name | display name, 17 px semibold, with the gene symbol in muted italic after it | `BTC.content.genes[id].name`, `.symbol` |
| "Stands for" badge | lumped genes only: "stands for ~10 genes" or "~100 genes" | `genes[i].standsForGenes` |
| State chip | see §3.3 | `genes[i].geneState` |
| Job line | one line, ≤ 60 characters | `BTC.content.genes[id].job` |
| Promoter control | segmented radiogroup `Off · ¼ · ½ · 1 · 2 · 4`, labelled "promoter strength" (visually hidden label; the aria label is spoken). The gene's **default** level has a small tick under it | commands `setPromoter` |
| Counts | `mRNA m + n being made` and `protein P` on two lines, in tabular numerals, with the sparkline beside them (never past the card edge) | `genes[i].mRNA`, `nascent`, `proteinRounded` |
| Sparkline | 88×28 canvas: protein (solid) and mRNA (thin, scaled to its own maximum) over the last 60 sim-min | the recent Recorder (§5.1) |
| Cost | "ribosome share" bar (0–25% full scale) with a percentage; screen-reader label "Share of working ribosomes reading this gene's mRNA" | `genes[i].ribosomes / ribosomes.elongating` |
| About | tap-to-reveal row, ≤ 2 sentences (e.g. "One PtsG carries about 80 glucose per second. It sits in the inner membrane.") | `BTC.content.genes[id].about` |

**Card sizing**
- about 150 px tall on a phone, with 12 px padding;
- 12 px radius and a 1 px `--line` border;
- the focus gene's card gets a 2 px `--accent` left border.

**Tapping the card header** (name row) makes that gene the focus gene. Tapping inside the controls never changes the focus.

### 3.2 Gene content table (`BTC.content.genes`)

| slot | id | name | symbol | job (≤ 60 characters) | plural | default |
|---|---|---|---|---|---|---|
| 0 | ptsG | Glucose transporter | ptsG | Carries glucose across the membrane. | no | 1 |
| 1 | gly | Glucose-processing enzymes | gapA et al. | Break glucose down, making ATP. | yes | 1 |
| 2 | aaSyn | Amino-acid-making enzymes | (many) | Build amino acids from sugar. | yes | 1 |
| 3 | aaImp | Amino-acid importers | (several) | Bring amino acids in from outside. | yes | ¼ |
| 4 | lacY | Lactose transporter | lacY | Carries lactose across the membrane. | no | Off |
| 5 | lacZ | Lactose-splitting enzyme | lacZ | Splits lactose into glucose and galactose. | no | Off |
| 6 | fliC | Flagellum protein | fliC | Part of the swimming tail; does no work here. | no | Off |

Each entry also carries the phrases the narrator needs:
- `genePhrase` (e.g. "the flagellum protein gene" / "the glucose-processing genes");
- `noun` (e.g. "the flagellum protein" / "the glucose-processing enzymes");
- `plural`.

When `labConfig.showNames` is false, names become "Gene A"…"Gene G" (by display slot), jobs become "Unknown", and the nouns become "gene A" and "protein A".

### 3.3 State chip text (from `geneState`)

| geneState | chip text | style |
|---|---|---|
| off | off | muted outline |
| waiting | switched on | accent outline |
| transcribing | making mRNA | accent fill (pale) |
| stalled | stalled | warn fill (pale) with warn-ink text |
| leftover-mRNA | off · mRNA left | muted fill |
| protein-only | off · some protein | muted fill (it is also the state of a gene never touched, which has its leak protein, so the chip does not say "left") |
| knocked-out | removed | bad outline (not reachable in the M1 UI) |

### 3.4 Promoter control behaviour

**Segments**
- Each segment is at least 48 px tall and 48 px wide; in a 328 px card, 6 segments come to about 52 px each.
- `touch-action: manipulation`.
- `role="radiogroup"`; each segment is `role="radio"` with `aria-checked`. Arrow keys move the selection (a laptop extra).

**Tapping a segment**
1. `cell.command({type:'setPromoter', gene:id, level})` runs. `'off'` maps to the engine's `'off'`.
2. The segment shows **pending** (a dotted outline) until the `command_applied` event with the same `seq` arrives (engine spec §11.4: `{seq, cmdType, args, resolved, prev}`), then it becomes solid at `resolved.level`.
3. **While paused,** the pending state persists, and a one-line note appears under the control: "Applies when time runs." The UI does not pretend the change has happened.
4. If the command is rejected (`{ok:false}`, or a `command_rejected` event with that `seq`), the control reverts to `prev` and shows the code's human text from `BTC.content.rejections` (for example `locked` → "This gene cannot be changed in this level.").

**The promoter control component is the only writer of promoter commands.** It appears on each gene card and, in compact, in the Cell tab's focus bar (§2.8). Both instances of a gene's control share one pending-state entry keyed by gene id, so a tap in either place shows pending in both. There are no long-press or slider variants in M1, and no RBS or per-second rate controls (engine commands `setRBS` and `setPromoter {rate_perS}` exist but are not offered; §14).

### 3.5 Update rate

- Card text updates at most 4 times per real second.
- A field is written (`textContent`) only when its formatted string changes.
- Sparklines redraw at 2 Hz, and only while the Genes panel is visible.

### 3.6 Focus gene (shared UI state)

| Consumer | What the focus gene sets |
|---|---|
| cell view | whose polysomes are drawn (1 ribosome per glyph, or 10 above 400), whose mRNA is drawn as full strands, and which proteins get the accent ring |
| focus bar | the gene shown, and (compact) whose promoter control is in row 2 |
| Graphs | the first gene chip. Choosing a new focus gene replaces the oldest chip if 3 are already selected |
| narrator | nothing. The narrator follows the *last commanded* gene, not the focus gene |

---

## 4. Medium and experiments panel

### 4.1 Medium (commands: `setMedium`)

| Row | Options (value) | One-line description |
|---|---|---|
| Glucose | None (0), Low (0.005 mM), High (10 mM) | "Low: transporters are only partly filled, so less sugar gets in." |
| Lactose | None (0), Present (5 mM) | – |
| Amino acids | None (0), Present (2 mM) | – |

Under the rows: "The medium never runs out and waste does not build up. No oxygen: like the gut."

Values in mM are shown in muted 13 px text under each option.

### 4.2 Drugs (commands: `setDrug`)

| Row | Options (dose) | Description (exact text) |
|---|---|---|
| Rifampicin-type | Off (0), Low (0.3), Full (1) | "Blocks RNA polymerase: no new mRNA is started. mRNA already made is still read." |
| Chloramphenicol-type | Off (0), Low (0.3), Full (1) | "Stalls ribosomes: protein is not made, but the mRNA stays." |

Footer: "Drugs act instantly here; there is no uptake and no resistance." (The "Drugs" heading has no title note; the footer says it once.) The controls say "-type" because the model drugs act only as the engine spec describes; the badges and the narrator use the plain names.

While a drug is on, its row gets a tinted background in its drug token (§8.1).

### 4.3 Start over (sheet)

**Options**

| Option | Effect |
|---|---|
| Same cell again | `new BTC.Cell(initialConfig)` with the same seed. The run replays identically if the same things are done. |
| New cell | new seed from `crypto.getRandomValues`, otherwise the default config |
| Instructor options (only with `?instructor=1`) | *(deferred, §14)* a toggle "Backup glucose uptake (ΔptsG phenotype)" that sets `flags.backupGlucoseUptake`. It starts a new cell. In M1 the `?instructor` parameter is ignored |

**Reset procedure**
- Reset is always a fresh `Cell` built from config; fields are never patched (engine spec §11.2).
- The app replaces the cell, the Recorder, the narrator memory, the pending-control map, the cell-view epoch cache and the graph markers.
- UI preferences (tab, speed, focus gene, window, theme) are kept.
- The new cell starts **paused**.

### 4.4 About this cell (sheet)

- First, under the heading "Why a bacterium": "A bacterium is the simplest cell that does it all; your own cells also copy genes into mRNA and read it with ribosomes."
- Then the practical rows under the heading "Lactose" (engine 1.1.0): "Switch LacY and LacZ on while glucose is still there, then remove glucose: the cell pauses, then grows on lactose.", "More LacY and LacZ at the switch, a shorter pause: about 2 h after ×1 for 3 min, a few minutes after ×4 for 15 min." and "Switched on after glucose is gone, they are never made: no sugar gets in, so ATP runs down. Adding glucose back restarts the cell." (Measured on the lab strain from the steady preset with lactose present throughout, seeds 1–4; the pause is the time from removing glucose until the growth rate, averaged over a few minutes as the app shows it, is back above half the rate on lactose (doubling 106 min): ×1 for 3 min 112–123 min, 5 min 94–102, 15 min 47–61, 30 min 31–42; ×4 for 5 min 30–35; after ×4 for 15 min it never falls below half (the charge dips to 0.53–0.56 for a few minutes), after ×4 for 30 min the charge stays above 0.78. Switched on 1 min after glucose is removed, no lacY mRNA is finished in 40 min, the narrator reaches `gene.noatp` at about 12 min, and the cell is dormant at about 2 h; glucose added back after 3 h brings it to half speed in about 70 s. They speak to the student; no molecule wants or needs anything, and they pass the lint.)
- Then "What is simplified": short forms of engine spec §18 items 1–21, one idea per row, from `BTC.content.about`. For example: "In the free lab each gene has its own switch, and you set it; in real cells, regulator proteins that bind signals switch genes."
- The sheet ends with "Full details are in the instructor notes." as plain text (a repository path means nothing to a student).

### 4.5 Download this run

- Builds a `Blob` of `JSON.stringify({ui: {build, layout, speedHistory}, record: cell.runRecord()})` (the record carries `presetHash`, engine spec §11.2).
- The file is named `be-the-cell-run-t<tick>.json`, type `application/json`.
- **Delivery** (blob downloads from an installed iOS PWA are unreliable, and the test group is phone-first):
  1. Wrap the blob in a `File`. If `navigator.canShare && navigator.canShare({files: [file]})`, call `navigator.share({files: [file], title: 'Be the Cell run'})`. The share sheet lets the student mail or save it.
  2. If the share is rejected with `AbortError` (the student closed the sheet), do nothing more.
  3. Otherwise (no Web Share with files, or any other error), fall back to an anchor download: `URL.createObjectURL(blob)`, a temporary `<a download="…">`, `click()`, then `revokeObjectURL` on the next tick.
- It contains no personal data.
- Purpose: test-group students can send a run file, and the instructor can replay it exactly with `BTC.replay.verify`.

---

## 5. Graphs

### 5.1 Recorder channels (`BTC.Recorder({every: 5, capacity: 4096, channels})`)

**Channels:**
- `mRNA:<id>` (mature + nascent) and `protein:<id>` for each of the 7 genes;
- `ATP_mM`, `E`, `V_fL`, `growth_dph` (λ_EMA/ln2 × 3600, in doublings per hour);
- `aa_mM`, `lacIn_mM`, `ribosomes_elongating`;
- `ledger:<name>` fractions (6).

That is 27 channels.

**Memory:** 27 × 4096 × 8 B ≈ 0.9 MB.

**Retention:** two recorders sample the same 27 channels (they share one `observe()` refresh per tick; recorders are not hashed, so replay and golden tests are unaffected).
- `app.rec` (capacity 4096, mode `thin`) keeps the whole run: at every = 5 ticks it holds 5.7 sim-hours before thinning. On each thinning it keeps every second sample **and doubles its sampling interval** (5 → 10 → 20 ticks), so old and new data stay evenly spaced (engine spec §12). The "All" window reads it.
- `app.recRecent` (capacity 8640, mode `ring`) never changes its interval: when full it drops its oldest half (`copyWithin`), so it always holds at least the last 6 sim-hours at every = 5 (27 × 8640 × 8 B ≈ 1.9 MB). The 10-min, 1-h and 6-h windows and the gene-card sparklines read it, so a student who runs at "1 s = 1 h" for a minute and then slows down still sees full detail.
Each sample's tick is stored beside its values, and plots place points by stored tick.

**Live head:** each plot appends the current `view` value as its last point, so plots feel live even at "1 s = 1 s", where a new sample arrives only every 5 real s.

**Markers** are kept in a UI-side list, capacity 256, oldest dropped:

| Source event | Marker |
|---|---|
| `division` | dashed vertical line on every plot |
| `command_applied` | a small tick at the top with a short label built from `cmdType` and `resolved`: "fliC ×4", "glucose none", "rifampicin full"; a level's `setControls` reads "controls locked" or "controls free" (never the command's name). When labels collide, the more important one is kept: glucose, then other medium changes, then drugs, then promoters (newest first within a rank) |
| drug intervals | shaded band in the drug colour at 10% alpha, from the on-command to the off-command, labelled "rif" or "Cm" at its start |

### 5.2 Plots (`BTC.Plot`, one canvas each)

| # | Title (unit) | Series | Y scale |
|---|---|---|---|
| 1 | mRNA (molecules) | selected genes (≤ 3) | lin (default) or log; floor for log is 1, and 0 is drawn on the baseline |
| 2 | Protein (molecules) | selected genes (≤ 3) | lin or log (log shows dilution after switch-off as a straight descent) |
| 3 | ATP (mM) | ATP_mM | fixed 0–4. A pale band below 1.05 mM (E = 0.3) is labelled "low". Readouts below 0.01 mM read "< 0.01 mM" (`format.sig2` never prints exponent notation). Since engine 1.1.0 a cell without sugar keeps 0.39 mM after 15 min, 0.34 mM after 1 h and 0.03 mM after 11 h, so the readout is rare; under engine 1.0.0 a starved cell sat at 3.5·10⁻⁹ mM |
| 4 | Cell size (fL) | V_fL | fixed 0–2.5 |
| 5 | Growth (doublings per hour) | growth_dph | fixed 0–1.5, auto-extended to the next 0.5 above the maximum |
| 6 | ATP spending now | 100% horizontal stacked bar of `view.ledger.fractions`. When the total spent (Σ `ledger.perS`) is below 1% of the reference cell's (fermYield × F_ref ≈ 1.2 million ATP/s), the bar is hidden and the panel says "Almost no ATP is being made or spent." (shares of almost nothing would look like a busy cell) | – |

**Stacked-bar labels:** "making protein" (translation), "other building", "upkeep", "making RNA" (transcription), "making amino acids", "transport". Each segment uses a neutral greyscale step plus a hatch for the "making protein" segment, so it does not compete with the gene colours. Each segment is labelled directly with its name and percentage. Segments narrower than 8% move their label to a line below with a leader.

**Plot anatomy**
- The title and live value are HTML over the plot's top-left, e.g. "Protein · fliC 34,100".
- The y-axis has 3 "nice" ticks, labelled in a left gutter as wide as the widest tick label, never over the data.
- **One time axis for all plots:** the graphs panel measures every visible plot's left gutter (tick labels) and right gutter (end labels) and passes the largest of each to every plot, so a given time sits at the same x in every stacked plot.
- End labels are first clamped inside the plot, then nudged 14 px apart; if the stack would pass the bottom it shifts up as a whole.
- "per h" in the growth readout is joined with non-breaking spaces.
- The x-axis shows sim time: minutes up to a 60 min window, hours beyond. Axis label: "sim time".
- Series are 2 px lines in the gene colour, with a direct label (symbol and value) at the right end.
- Phone plots are 120 px tall; wide-layout plots are 160–200 px.

**Controls**
- **Window:** `10 min · 1 h · 6 h · All`, default 1 h.
- **Gene chips:** multi-select, up to 3. Choosing a 4th deselects the oldest. Each chip is ≥ 44 px tall and shows the colour and the symbol.

**Scrub**
- A horizontal drag on any plot shows a crosshair and a readout of every visible plot's value at that time. The plots are linked.
- Plots set `touch-action: pan-y`, so vertical drags still scroll the Graphs panel.
- The plot uses `setPointerCapture`, handles `pointercancel`, and sets `user-select: none` and `-webkit-touch-callout: none`.
- On release the readout stays for 3 s, or until the next tap.

**Enlarge:** a tap without a drag opens a full-screen sheet of that plot (in portrait, rotated layout is not required), with a close button (44 px).

**Redraw:** at most 15 fps while running and visible; on change only while paused; never while hidden.

**Pure helpers, tested:** `niceTicks(min, max, n)`, `logTicks`, `xTicks(windowSec)`, and `thinForPixels(n, widthPx)`. The last draws at most 2 points per pixel column, using min/max per column so spikes survive.

---

## 6. Status strip

| Item | Content | Source | Interaction |
|---|---|---|---|
| Pause/Play | 48×48 button, icon plus a visible "Paused" or "Running" word in `wide`/`stack`. `aria-pressed` | UI state | tap. Laptop extra: Space |
| Clock | "12 min 30 s" when the speed is ≤ 1 s = 10 s; otherwise "1 h 12 min". Always prefixed "t =" in wide | `view.t_s` | – |
| Generation | "generation 3", counted from lab start: `view.clock.generation − gen0`, where gen0 is taken at cell construction | `view.clock.generation` | – |
| Speed chip | "1 s = 1 min", with a second muted line "60× real time" in compact | UI state | tap opens the speed sheet |
| ATP gauge | a 64 px bar filled to E. Fill uses `--good`, `--warn` or `--bad` for `normal`, `low` or `depleted`; the word "normal", "low" or "very low" always follows (not colour alone) | `view.energy.E`, `.state` | tap → Graphs tab, ATP plot |
| Growth | Rounded to 2 significant figures. **Steady:** "doubling ≈ 98 min" from `clock.lastCycle_min` (the whole-cycle value, free of the dosage ripple, engine spec §11.5 and §18 item 10). **Changing:** when there is no completed cycle yet (cold start only), or when \|`doublingEMA_min` − `lastCycle_min`\| > 15% of `lastCycle_min` (after a change of conditions), it shows `doublingEMA_min` labelled "recent": "doubling ≈ 150 min (recent)". It returns to the steady form once the difference is ≤ 10% (hysteresis; the proto's in-cycle EMA ripple is about ±4%). When `growth_arrest` is active: "not growing". Before the first 5 sim-min of data on a cold start: "doubling: measuring…" | view.clock, events | tap → Graphs tab, Growth plot |
| Achieved-speed warning | only when behind (§10.3): "device limit: 1 s = 22 min" in warn-ink | loop stats | – |

**Speed sheet**
- five 52 px rows, each with a label and a gloss;
- the current row is checked; the choice persists in preferences.

| Label | Gloss | sim s per real s |
|---|---|---|
| 1 s = 1 s | real time | 1 |
| 1 s = 10 s | 10× faster | 10 |
| **1 s = 1 min** (default) | 60× faster | 60 |
| 1 s = 10 min | 600× faster | 600 |
| 1 s = 1 h | 3,600× faster (max) | 3,600 |

Laptop extras: keys 1–5 select a speed. All keyboard shortcuts are also reachable by touch. Speed and pause are UI state, **not engine commands** (engine spec §10).

---

## 7. Narrator

### 7.1 Modules and data flow

This section is **authoritative for the narrator**. Engine spec §12's v1.0 phrase list is superseded by it.

- **`src/shared/btc-narrate.js`** (pure, Node-tested; engine spec §12) holds:
  - `createMemory()`;
  - `ingest(memory, events, tick)`, which records episode phases, the last commanded gene and its direction, the last division tick, energy episodes, drug-on ticks and drug-off ticks from the event stream;
  - `narrate(facts, memory, tick) → {key, text, gene?}`.
- **`src/app/btc-narrator-ui.js`** holds `NarratorHold` (pure, with the clock injected) and the DOM binding.

**Facts.** The narrator reads `BTC.observe.facts` **schema 1.2**, which is defined, with every value and threshold, in engine spec §11.5. Summary of the fields the rules below use: `drug.rif` and `drug.cm` (`off`/`low`/`full`, full meaning dose-derived ρ or θ > 0.5); `medium` (what is **outside**); `carbon` (what is **getting in**: flux above 1% of the reference flux); `glucoseLevel`; `glucoseImport` (transporter capacity: `none`/`low`/`normal`); `glucoseStep` (`import` or `enzymes`: which capacity holds glucose use back); `energy` (`normal` E > 0.7, `low`, `none` E < 0.1); `aa`; `lactoseBlock` (capacity below 1% of the induced reference); `uselessGene` (a useless gene whose **current ribosome share** exceeds 2.5%, and stays above 1.0% once named); `aaOutside`; `aaImportOn` (import supplies > 5% of the amino acids used); `growth` (`normal`/`slow`/`arrested`); `justDivided`. Facts contain no numbers.

**Episode phases in memory** (last commanded gene, from events):

| Phase | Entered on |
|---|---|
| `waiting` | the on-command is applied |
| `transcribing` | `tx_start` |
| `rising` | `first_protein`; lasts until 10 sim-min after it |
| `up` / `down` | a level change between two non-off levels, read from the `command_applied` event's `prev.level` and `resolved.level` (engine spec §11.4); lasts 20 sim-min |
| `leftover` | the off-command is applied (while mRNA or nascent remain) |
| `gone` | `mrna_gone`; lasts until the 2nd division after it |
| (steady) | anything after these; the gene rule no longer applies |

### 7.2 Priority list

The first rule whose condition holds wins. `{G}` is the gene phrase, `{n}` the noun, `{N}` the noun capitalised, and `{is}`/`{its}`/`{it}` (is/are, its/their, it/them) and the verb ending `{s}` agree with `plural`; `{Y}`/`{Z}` are the lacY/lacZ nouns ("the lactose transporter"/"the lactose-splitting enzyme") or their hidden-name nouns. A sentence's first letter is capitalised when it is a–z (so a noun such as "β-galactosidase" would stay lower case). Timing windows are in **sim time**.

| # | key | condition | sentence |
|---|---|---|---|
| 1 | drug.both | drug.rif = full and drug.cm = full, energy ≠ none | Both drugs are on: no new mRNA is started, and ribosomes are stalled. |
| 2 | drug.cm | drug.cm = full, energy ≠ none (with no ATP there is no mRNA left to speak of; the true cause below wins) | Chloramphenicol stalls ribosomes; the mRNA is still here, but almost no protein is made. |
| 3 | drug.rif.late | drug.rif = full and ≥ 10 min since on | Under rifampicin the old mRNA is almost gone, so protein making is winding down. |
| 4 | drug.rif | drug.rif = full | Rifampicin blocks RNA polymerase, so no new mRNA is made; mRNA already made is read until it breaks down. |
| 5 | drug.cm.low | drug.cm = low, energy ≠ none | Some ribosomes are stalled by chloramphenicol, so protein is made more slowly and growth slows. |
| 6 | drug.rif.low | drug.rif = low | Rifampicin is slowing RNA polymerase, so less new mRNA is made. |
| 6b | drug.rif.off | both drugs off, ≤ 10 min since rifampicin went from on (any dose) to off, energy ≠ none, medium ≠ none (the more recent of 6b/6c wins) | Rifampicin is gone, so RNA polymerase starts new mRNA again and protein making picks up. |
| 6c | drug.cm.off | both drugs off, ≤ 10 min since chloramphenicol went from on to off, energy ≠ none, medium ≠ none | Chloramphenicol is gone, so ribosomes run again on the mRNA that is left and growth picks up. |
| 7 | starve.nosugar | medium = none and energy ≠ normal | There is no sugar in the medium, so no new ATP is made and every machine that uses ATP slows to a stop. |
| 8 | starve.dormant | `dormant` active, medium ∈ {glucose, both}, carbon = none, glucoseImport ≠ normal | With no ATP, no new transporters can be made, so no sugar gets in and nothing restarts. |
| 9 | starve.noimport | medium ∈ {glucose, both}, carbon = none, glucoseImport ≠ normal | Glucose is outside, but without transporters in the membrane none of it gets in. |
| 10 | starve.fewimport | glucoseLevel = high, carbon ∈ {glucose, both}, energy ∈ {low, none}, glucoseStep = import | Too little glucose is getting in, so ATP is low and growth has slowed. |
| 10b | starve.noenzyme | as rule 10 but glucoseStep = enzymes; gene = gly | {N} {is} too scarce to break down glucose quickly, so ATP is low and growth slows. |
| 11 | recover | within 5 min of `energy_ok` or `revived` that followed `energy_low` | Sugar is getting in through transporters that were already there, and ATP is coming back. |
| 11b | gene.noatp | last commanded gene in phase waiting (on, nothing initiated) and energy = none | {G} {is} switched on, but with almost no ATP nothing is copied into mRNA. |
| 12 | lac.noY | lactoseBlock = no-lacY and medium = lactose | Lactose is outside, but without {Y} none of it gets in. |
| 13 | lac.noZ | lactoseBlock = no-lacZ | Lactose gets in, but without {Z} it is not split. |
| 13b | lac.toofew | medium = lactose, lactoseBlock = null, energy ≠ normal, growth = arrested | There is only a little of {Y} and {Z} yet, so ATP stays low and growth has paused. |
| 14 | aa.low | aa = low | Amino acids are running short, so ribosomes are moving more slowly. |
| 15 | divided | justDivided (≤ 90 s since `division`) | The cell divided; this daughter received about half of everything. |
| 16a | gene.waiting | phase waiting | {G} {is} switched on, but RNA polymerase has not started copying {it} yet. |
| 16b | gene.tx | phase transcribing | {G} {is} being copied into mRNA; no protein yet. |
| 16c | gene.rising | phase rising | {N} {is} building up; each mRNA is read by many ribosomes before it breaks down. |
| 16d | gene.up | phase up | {G} {is} copied more often now, so {its} protein climbs to a higher level. |
| 16e | gene.down | phase down | {G} {is} copied less often now, so {its} protein thins out as the cell grows and divides. |
| 16f | gene.leftover | phase leftover | Copying of {G} has stopped, but ribosomes are still reading {its} mRNA. |
| 16g | gene.gone | phase gone | The mRNA for {n} is gone; the protein remains and is shared out at each division. |
| 17a | burden.lac | uselessGene ∈ {lacZ, lacY}; gene = uselessGene | With no lactose here, {n} does no work, and making it slows growth over a few generations. |
| 17b | burden | uselessGene set; gene = uselessGene | Ribosomes busy with {n} are not making other proteins, so growth slows over a few generations. |
| 18 | growth.aa | aaOutside, aaImportOn, growth = normal | Amino acids come in from the medium, so fewer have to be made inside and the cell grows faster. |
| 19 | growth.lactose | carbon = lactose, growth ≠ arrested | The cell is growing on lactose, which {Z} splits into glucose and galactose. |
| 19b | growth.both | carbon = both, growth = normal | The cell is growing steadily on glucose and lactose. |
| 20 | growth.low | glucoseLevel = low, growth = slow | Glucose is scarce, so growth is slow. |
| 21 | growth.arrested | growth = arrested | Growth has stopped. |
| 21b | growth.slow | growth = slow | Growth is slower than usual. |
| 22 | growth.normal | growth = normal (the only case left) | The cell is growing steadily on glucose. |

Rules 11b and 16 apply only to the **last commanded** gene. With `showNames` false, the lacY and lacZ nouns in rules 12, 13, 13b and 19 are replaced by the hidden-name nouns. Rule 22 fires only at normal growth, so "steadily" is always true.

**Why the order and conditions are as they are (v1.1):**
- **Rule 7 before rule 8.** An empty medium is the cause whenever the medium is empty, so the dormancy line (rule 8) cannot mislead a student who set glucose to None: after 10 min without glucose the narrator still says there is no sugar. Rule 8 now fires only when glucose is outside but the transporters are missing (for example a ptsG knockout, or the death spiral), which is where its sentence is true. It never fires in a lactose-only medium.
- **Rules 8 and 9 need glucoseImport ≠ normal.** Both sentences blame missing transporters, so they fire only when the transporters really are scarce. If glucose stops getting in for another reason (for example a knocked-out glycolysis gene in a test), the narrator falls through to a plainer line such as "Growth has stopped."
- **Rule 10 needs glucoseLevel = high.** At the Low preset the cell's energy charge is also low (proto E 0.29), so without this condition rule 10 would always hide rule 20. Rule 10 is for transporter-limited cells in plenty of glucose (e.g. ptsG ×¼); rule 20 is for scarce glucose.
- **Rule 11b** covers the natural dead end: glucose None, lactose Present, then lacY and lacZ switched on. Since engine 1.1.0 the charge falls to about 0.1 within minutes and below 0.1 (energy = none) after about 12 min; the lac promoter is not gated, but transcription needs ATP, so no lacY mRNA is finished in 40 min (U-4). "almost no ATP" is the true phrase: the charge is below 0.1, not zero. Before that, the student sees rule 12 (no LacY). The About sheet adds the practical advice (§4.4).
- **Rules 10 and 10b split on glucoseStep.** PTS uptake is matched to glycolysis, so with the glucose-processing genes off the transporters are plentiful and the enzymes limit; blaming import there was false (review B-M1/P1). Both accept energy = none as well as low, so a slow, ATP-starved cell never falls through to "growing steadily".
- **Rule 13b** names the lactose pause (engine 1.1.0). A cell moved to lactose alone with a few LacY and LacZ no longer runs out of ATP: it holds a low charge (0.12–0.4) and stops growing while its permeases bring in a trickle of lactose, until it has made more of both and grows on lactose (rule 19). The old condition (energy = none) was never reached at the default parameters, and its sentence ("the cell has stopped") was no longer true. The rule now needs growth = arrested and energy ≠ normal, and says "growth has paused", which the cell's later growth bears out. It sits after 11b (so the gene.noatp scenario keeps its line) and before the gene-phase rules, which would otherwise win with a lingering phase.
- **Rules 6b/6c** explain the recovery after a drug is removed, instead of "Growth has stopped." for the first minute and a bare growth line after.
- **Rules 21b/22.** Slow growth with no named cause says so ("Growth is slower than usual."); rule 19b covers a cell using both sugars.
- **Rules 17a and 17b** key on ribosomes translating the gene **now** (engine spec §11.5), with a 2.5%/1.0% hysteresis band so the line does not flicker as mRNA comes in bursts. They say growth "slows over a few generations", because the cost shows in the doubling time only after an hour or so. After a switch-off they stop within about a minute of the mRNA being gone, while the leftover protein is still diluting; the cost is in making protein, not in holding it.

**More examples as rendered** (all pass the lint):
- "The flagellum protein gene is being copied into mRNA; no protein yet."
- "The glucose-processing genes are being copied into mRNA; no protein yet."
- "Copying of the flagellum protein gene has stopped, but ribosomes are still reading its mRNA."
- "The mRNA for the lactose-splitting enzyme is gone; the protein remains and is shared out at each division."
- "Ribosomes busy with the flagellum protein are not making other proteins, so growth slows over a few generations."
- "The lactose transporter gene is switched on, but with almost no ATP nothing is copied into mRNA."
- "The glucose transporter gene is copied less often now, so its protein thins out as the cell grows and divides."

The template-by-gene expansion test keeps every combination ≤ 140 and lists (as a diagnostic) every expansion over 110 characters; the longest reachable ones are about 100–117.

### 7.3 Text rules (lint test c-1, extended)

Every **narrator template**, expanded for every gene in both named and hidden modes, MUST:
- be exactly one sentence;
- be ≤ 140 characters;
- contain no digits and no exclamation mark;
- not match `/\b(wants?|tries|trying|try to|decides?|chooses|knows|needs? to|in order to|so that|likes?|hungry|happy)\b/i`.

This regex is the single source for both specs (engine spec test c-1 points here).

**Every other string in `BTC.content`** (job lines, About rows, key-sheet items, drug descriptions, sheet texts, rejection texts) MUST be ≤ 140 characters, contain no exclamation mark and not match the regex. The one-sentence and no-digit rules do **not** apply to them: About rows may have two sentences and need numbers (for example "One PtsG carries about 80 glucose per second.").

**Rule reachability:** every rule is reached by a scripted scenario in `tests/narrate.test.js` (U-4).

### 7.4 Display rules (`NarratorHold`)

- **Placement:** in compact, directly above the tab bar, persistent across tabs. In the other layouts, directly under the cell view. In compact the region has a **fixed** height of 3 lines (15 px, 72 px tall; under 600 px of height 13 px, 54 px tall), clamped with an ellipsis as a backstop, so a new sentence never resizes the cell view. Text is `--ink`, with a 4 px `--accent` left bar.
- **Hold:** a new key replaces the current line only after the current one has been shown for **≥ 1.5 s of real time**. Rules 1–11b (drugs, drug-off, starvation and the no-ATP gene line, including 6b, 6c and 10b) may pre-empt after 0.5 s.
- **Queue:** only the most recent candidate is kept, with no backlog. At high speed, intermediate phases can be skipped, and that is acceptable.
- **Screen readers:** the element has `aria-live="polite"`. Its `textContent` is written **only when the key or the gene changes**. Numbers never appear in it.
- **Paused:** the narrator keeps its line. Pausing does not add a narrator sentence; the "Paused" badge on the cell does that job.

---

## 8. Visual style

### 8.1 Tokens (`:root`; the palette is defined once in `btc-palette.js` and written to CSS variables at startup and on theme change)

```css
:root {
  /* surfaces and text */
  --bg:#f6f5f0; --panel:#ffffff; --line:#d9d6cc; --ink:#1f2430; --muted:#5f6675; --accent:#2f6fd6;
  --good:#2f9e5b; --warn:#c98a1b; --warn-ink:#8a5a00; --bad:#c43d31;
  /* cell */
  --outside:#eef2f8; --inside:#fbf3e6; --inside-depleted:#ecebe6; --membrane:#8a7f6a;
  --nucleoid:rgba(31,36,48,.08); --dna:#1f2430; --rnap:#1f2430; --ribosome:#5f6675;
  --atp:#c98a00; --aa:#8a8f99; --sugar:#3a3f4b; --products:#9aa0ab;
  --drug-rif:#7b61c9; --drug-cm:#b0523c;
  /* genes (validated: §8.2) */
  --g-ptsG:#005533; --g-gly:#cc6644; --g-aaSyn:#3388dd; --g-aaImp:#554499;
  --g-lacY:#aa77aa; --g-lacZ:#990066; --g-fliC:#664400;
  /* type, shape, space */
  --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --fs-base:16px; --fs-small:13px; --fs-min:12px; --lh:1.45;
  --radius-panel:12px; --radius-ctl:10px; --tap:48px; --tap-min:44px;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark set below */ } }
:root[data-theme="dark"] { /* same dark set */ }
```

**Dark set**

| Token | Value |
|---|---|
| `--bg` | #15181e |
| `--panel` | #1d2129 |
| `--line` | #343a46 |
| `--ink` | #e6e8ee |
| `--muted` | #a3a9b6 |
| `--accent` | #6f9ef0 |
| `--outside` | #1a1f28 |
| `--inside` | #2a2418 |
| `--inside-depleted` | #24252a |
| `--membrane` | #b3a78e |
| `--dna` | #d6d9e0 |
| `--rnap` | #d6d9e0 |
| `--ribosome` | #a3a9b6 |
| `--atp` | #e3b341 |
| `--aa` | #9aa0ab |
| `--sugar` | #c9ccd4 |
| `--g-ptsG` | #61a17d |
| `--g-gly` | #ffac89 |
| `--g-aaSyn` | #91c9ff |
| `--g-aaImp` | #a690e4 |
| `--g-lacY` | #e8b7e7 |
| `--g-lacZ` | #e970b1 |
| `--g-fliC` | #b78e53 |

**Theme handling**
- **Light is the default.** Dark follows `prefers-color-scheme` unless the About sheet's theme toggle (System, Light, Dark) overrides it.
- `<meta name="theme-color">` has one entry per scheme.
- Every surface sets an explicit background.

### 8.2 Colour rules

- **Gene colour is the gene's identity everywhere:** its mRNA strands, its protein glyphs, its card chip, its plot series and its graph chip.
- **Molecule class is carried by shape**, not colour:
  - hexagon = sugar;
  - diamond = ATP (filled) or ADP (hollow);
  - triangle = amino acid;
  - wavy line = mRNA;
  - two-lobed glyph = ribosome;
  - ring = RNA polymerase;
  - rectangle in the membrane = transporter;
  - circle, cluster or bar = cytoplasmic protein.

  The key sheet names every shape.
- **Palette validation** (run while writing this spec, using Machado 2009 CVD simulation and CIE Lab ΔE76):
  - light gene set: minimum pairwise ΔE of 33 with normal vision, 20 deuteranopia, 20.5 protanopia and 21 tritanopia;
  - contrast of each gene colour on `--inside`, `--panel` and `--bg` is ≥ 3.2:1;
  - dark gene set: minimum pairwise ΔE of 25 / 13.9 / 8.3 / 18 (normal / deutan / protan / tritan); contrast ≥ 5:1 on the dark surfaces.
- **Test U-5 enforces these:**
  - gene pairs: ΔE ≥ 18 (light) and ≥ 8 (dark) under each simulation;
  - graphical contrast: ≥ 3:1 against `--panel` and `--inside`;
  - text tokens: ≥ 4.5:1 against `--panel`.

  `--warn` is never used for text; `--warn-ink` is used instead.
- **State is never colour alone.** The ATP gauge carries a word, stalled ribosomes carry a bar, and drug rows carry text.

### 8.3 Type and components

- **Base font** is 16 px everywhere. That includes every input, select and custom control, so iOS never zooms on focus. The minimum text size is 12 px.
- **Numerals:** `font-variant-numeric: tabular-nums` on every live number.
- **Number formats** (`BTC.format`, pure):

  | Count | Format |
  |---|---|
  | < 10⁶ | exact, with comma thousands separators |
  | ≥ 10⁶ | "2.7 million" |

  Concentrations use 2 significant figures plus "mM". Percentages are integers, except below 1%, which shows one decimal.
- **Buttons and segments:** ≥ 44 px (48 px preferred), `touch-action: manipulation`, and a visible `:focus-visible` ring.
- **Hover:** no hover-only styling carries information, and there are **no `title` tooltips**.
- **Sheets:** bottom sheets on compact, centred dialogs elsewhere. They have a close button (44 px) and close on the backdrop or Escape. Focus is trapped while open.

### 8.4 Reduced motion

Triggered by `prefers-reduced-motion: reduce` or the About-sheet toggle (Auto, On, Off):
- jitter amplitude 0;
- static flux markers (§2.6);
- no ghost drift;
- no CSS transitions longer than 100 ms.

The data shown is identical; only motion differs.

---

## 9. PWA

### 9.1 Manifest (`manifest.webmanifest`, copied into dist)

```json
{
  "name": "Be the Cell",
  "short_name": "Be the Cell",
  "description": "A game about genes and proteins, in which you are in charge of a cell. In principle.",
  "id": "./",
  "start_url": "./?source=pwa",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#f6f5f0",
  "theme_color": "#f6f5f0",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Relative URLs:** `id`, `start_url`, `scope` and every icon `src` are relative, so the installed app is scoped to `https://foxworthywa.github.io/be-the-cell-/` and nothing breaks under the `/be-the-cell-/` base path. Test U-12 fails on any manifest or `sw.js` URL that starts with `/` or names a host.

**Orientation:** `"any"` is a deliberate choice. The `split` and `wide` layouts exist, Chromebook tablets rotate, and locking to portrait would break landscape tablets.

**`index.html` head also includes:**
- `<link rel="manifest" href="manifest.webmanifest">`
- `<link rel="apple-touch-icon" href="icons/apple-touch-icon-180.png">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-title" content="Be the Cell">`
- an inline SVG data-URI favicon.

### 9.2 Icon

`icons/icon.svg` is a 512 viewBox:
- `--bg` rounded square (radius 96);
- a horizontal capsule (the rod) with the membrane stroke in `#8a7f6a`;
- one wavy mRNA line in `#3388dd`, 3 ribosome glyphs in `#5f6675`, and 5 protein dots in `#005533`.

It has no text and no brand marks. The maskable variant keeps the content inside the central 80% safe zone.

`tools/make-icons.js` renders the PNGs **once, by hand**, with the globally installed Playwright (required by absolute path, `require('/opt/node22/lib/node_modules/playwright')`, falling back to `require('playwright')`; never `playwright install`). It loads `icons/icon.svg` (and the maskable variant) into headless Chromium at each size and saves screenshots: 192, 512, maskable 512 and apple-touch 180. The PNGs are committed and the build only copies them. There is no hand-written PNG encoder (deferred, §14), and neither the build nor `npm test` runs `make-icons.js`.

### 9.3 Service worker (`sw.js` template; the build stamps `__BUILD_HASH__`)

```js
const CACHE = 'btc-__BUILD_HASH__';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon-180.png'];
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('btc-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(hit => hit || fetch(r)));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r)));
});
self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });
```

Every entry in `ASSETS` and the registration below is relative (`./`), which is required for the `/be-the-cell-/` Pages path.

**Strategy:** cache-first for the versioned shell. The only large asset, the bundle, is precached. There is no runtime caching of anything else, and the app makes no network requests at all.

**Registration** (`btc-pwa.js`) happens only when `location.protocol` starts with `http` and the URL has no `?test=1`:
- `navigator.serviceWorker.register('./sw.js', { scope: './' })`.
- **Update banner:** if `reg.waiting` exists and there is a controller, or when a new worker reaches `installed` with a controller, show a banner: "An update is ready. Reload (your current cell restarts)". It has a 44 px Reload button and a dismiss button.
- **Reload flow:** Reload posts `'skip-waiting'`. On `controllerchange`, the page reloads once (guarded by a flag). **The page never reloads without a tap.**
- **Update checks:** `reg.update()` runs on load and on `visibilitychange` to visible, at most once an hour.
- **First activation:** a one-time toast reads "Ready to work offline."

### 9.4 Offline behaviour

- After the first successful load over http(s), the app loads and runs fully offline, in the browser and when installed.
- From `file://` (double-clicking `dist/index.html`, or a saved copy of the published page, §10.2), everything works except install and the service worker. No error is shown.
- Autosave (§10.5) means that a phone killing a background tab does not lose the student's cell.

---

## 10. Files, bundling and the app loop

### 10.1 File layout (UI parts; the engine files are in engine spec §2.1)

```
index.html                 shell: inline <style> (tokens + layout), DOM skeleton, <script src> tags in build-files.json order
build-files.json           ... engine and shared files ..., then the app files in this order:
src/app/
  btc-content.js     BTC.content      every student-facing string: gene names/jobs/about/phrases, control labels,
                                      drug text, rejection text, About-sheet items, key-sheet items (data only; linted)
  btc-palette.js     BTC.palette      light/dark colours + glyph shapes; apply(theme) writes CSS vars; canvas reads the object
  btc-format.js      BTC.format       counts, mM, %, clock, speed labels (pure)
  btc-prefs.js       BTC.prefs        URL params + localStorage wrapper (every access in try/catch; defaults when blocked)
  btc-layout.js      BTC.layout       classify(w,h) (pure) + DOM apply, tab switching, sheet manager
  btc-loop.js        BTC.Loop         frame contract, speed, pause, visibility, stats; now() and raf injected (pure core)
  btc-cellgeom.js    BTC.cellgeom     capsule geometry, map(u,v), perimeter(s), nucleoid, loci, hit grid (pure)
  btc-cellview.js    BTC.CellView     canvas renderer, legend, key sheet, focus bar, tap-to-identify
  btc-plot.js        BTC.Plot         small canvas time-series plot + pure scale helpers (niceTicks, logTicks, thin)
  btc-status.js      BTC.StatusStrip
  btc-genes-panel.js BTC.GenesPanel
  btc-medium-panel.js BTC.MediumPanel
  btc-graphs-panel.js BTC.GraphsPanel
  btc-narrator-ui.js BTC.NarratorHold (pure) + BTC.NarratorView
  btc-pwa.js         BTC.pwa          SW registration, update banner, autosave/restore, run download
  btc-app.js         BTC.app          bootstrap and wiring; window.__btc
sw.js  manifest.webmanifest  icons/*
serve.js                   zero-dependency static server (default root dist/, port 8080; correct MIME for .webmanifest,
                           .svg, .png, .js; Cache-Control: no-cache on sw.js and index.html)
tools/make-icons.js  tools/ui-check.js      (both use the global Playwright; run by hand, not by npm test or CI)
tests/ui-*.test.js
README.md                  run, test, build; how to save the single-file page (§10.2)
```

Every app file uses the UMD wrapper with an `@deps` line (engine spec §2.2). DOM files reference `document` only inside their `mount` or `create` functions.

### 10.2 build.js

1. **Read `build-files.json`.** Check that `index.html` contains exactly those `<script src="…">` tags, in that order. Throw on any mismatch, missing tag or extra tag.
2. **Inline each file** with a *function* replacer:
   `html.replace(tag, () => '<script>\n' + src.replace(/<\/script/gi, '<\\/script') + '\n</script>')`.
   Afterwards, throw if any `<script src=` remains.
3. **Compute the build hash:** `buildHash = sha256(inlinedHtml).slice(0, 12)` (`node:crypto` is allowed in tools). Inject `<meta name="btc-build" content="<hash>">` and `window.BTC_BUILD = '<hash>'`.
4. **Write the outputs:**
   - `dist/index.html`;
   - `dist/sw.js` with `__BUILD_HASH__` replaced (throw if the placeholder is absent);
   - copies of `manifest.webmanifest` and `icons/*`.
5. **Size budget:** throw if `dist/index.html` is over 450 KB; warn above 350 KB.
6. **Git:** `dist/` is gitignored and **not committed**. CI (`.github/workflows/pages.yml`) runs `npm test`, then `node build.js`, then deploys `dist/` to Pages from `main` only.
7. **The published page is the single file.** Because the build inlines everything, `https://foxworthywa.github.io/be-the-cell-/index.html` *is* the single-file bundle. The README explains the two ways to get it as a file for offline or `file://` use:
   - from the live site: open it and use the browser's "Save Page As…", choosing "Webpage, HTML only" (Chrome, Edge), "Web Page, HTML only" (Firefox) or "Page Source" (Safari), so the original HTML is saved rather than the live DOM;
   - from a checkout: `node build.js`, then open `dist/index.html`.

   The saved file runs from `file://` (P11). The run-file download (§4.5) needs no network either.

### 10.3 App loop (`BTC.Loop`) — implements engine spec §10's frame contract

```js
// state: running (bool), speed (sim s per real s), acc (sim s), last (ms or null), stats
function frame(ts) {
  if (!running) { rafId = 0; return; }
  const dtReal = last === null ? 0 : Math.min(0.25, (ts - last) / 1000);  // cap: no giant catch-up after a hitch
  last = ts;
  acc += dtReal * speed;
  const want = Math.floor(acc / cell.dt);
  const t0 = now(); let done = 0;
  while (done < want) {
    cell.step(); done++;
    if (now() - t0 > 4) break;                    // 4 ms engine budget per frame
  }
  acc -= done * cell.dt;
  if (done < want) { acc = 0; stats.behindFrames++; } // drop the remainder; never spiral
  stats.record(done, now() - t0, dtReal);            // rolling 1 s window -> achievedSpeed, engineMsAvg
  const events = cell.takeEvents();
  app.onEvents(events);                             // pending controls, markers, narrator memory, epoch
  app.render(dtReal, done > 0);                     // each view decides whether to redraw (§2.7, §3.5, §5.2)
  rafId = requestAnimationFrame(frame);
}
```

**Achieved speed:** when `stats.achievedSpeed < 0.9 × speed` for 2 consecutive seconds, the status strip shows "device limit: 1 s = X". The label uses the ladder wording, rounded down to 2 significant figures. The warning clears after 2 s at ≥ 0.95.

**Pause**
- Pausing sets `running = false`. The rAF loop stops completely; the loop never idles while paused.
- Any repaint while paused (resize, tab, theme, focus gene) is requested explicitly through `app.requestPaint()`, which uses one rAF.
- Resuming sets `last = null` and `acc = 0`.

**Start state:** a new cell starts **paused**, with the cell view showing a "Paused" badge. The Play button is visibly the primary control; it does not animate.

**Background tabs** (`visibilitychange` to hidden, `pagehide`, or a `freeze` event where supported):
- Stop the loop and autosave (§10.5).
- On return to visible: if the user had not paused, resume with `last = null` and `acc = 0`.
- **Simulated time does not pass while the page is hidden,** and there is no catch-up.
- `pageshow` with `persisted` (bfcache) follows the same path.

**Events → UI:**

| Event | UI effect |
|---|---|
| `command_applied` / `command_rejected` | resolve the pending controls by `seq` (set to `resolved`, or revert to `prev`); graph marker |
| `division` | cell-view epoch; graph marker |
| `replication` | nucleoid lobes |
| `energy_*`, `growth_*`, gene episode events | narrator memory |
| `function_seen` | *(deferred, §14)* the engine does not emit it in M1 |

**Commands:** the UI calls only `cell.command(cmd)`. Its source defaults to `'user'`. Commands never go directly into `cell.schedule`, which is for lessons and tests.

**Recorder:** attached with `cell.attachRecorder(rec)` at construction, so sampling is by tick and deterministic.

### 10.4 Bootstrap (`btc-app.js`)

1. Read the preferences and URL parameters:

   | Parameter | Effect |
   |---|---|
   | `?seed=` | seed for the new cell |
   | `?speed=` | starting speed |
   | `?tab=` | starting tab |
   | `?theme=` | light / dark |
   | `?reset=1` | ignore the autosave |
   | `?test=1` | no SW, no autosave, exposes test hooks, fixed seed 1 unless `?seed` is given |
   | `?instructor=1` | *(deferred, §14)* shows the instructor options; ignored in M1 |

2. Build the config: `{seed, strain:'m1-lab', start:'steady', medium:{glucose_mM:10, lactose_mM:0, aminoAcids_mM:0, oxygen:false}}`. The seed comes from the URL, or the autosave, or `crypto.getRandomValues` (one uint32).
3. `cell = new BTC.Cell(config)`, or `BTC.Cell.restore(autosave.snapshot)` (§10.5).
4. Attach the Recorder, create the narrator memory, mount the views for the current layout, and apply the theme.
5. Set the debug hook: `window.__btc = { get cell(){…}, BTC, app }`. `cell` is a getter because reset replaces the cell.
6. **With `?test=1`**, also expose `app.test`:
   - `runTicks(n)`: steps synchronously, drains events and paints once;
   - `pause()`, `resume()`, `setSpeed(s)`;
   - `stats()`;
   - `cellViewStats()`: drawn glyph counts per species and gene.

### 10.5 Browser storage (conveniences only)

Every access is wrapped in try/catch. The app MUST behave correctly when storage throws or is empty (private windows, blocked storage).

| Key | Contents |
|---|---|
| `btc.ui.v1` | `{tab, speed, focusGene, graphGenes, window, logScales, theme, reducedMotion}` |
| `btc.autosave.v1` | `{engineVersion, build, savedAt_tick, snapshot, gen0}` |
| `btc.lastError` | the last frame error, `{msg, stack, build, tick}` (diagnostics only; nothing reads it yet) |

**When the autosave is written:**
- on hide and on `pagehide`;
- every 60 real seconds while running;
- after a reset.

**Autosave size and failure handling:** skip the write if the serialised size is over 2 MB; ignore quota errors.

**Restore on load**, unless `?reset=1` or `?test=1`:
- Proceed only if `engineVersion` matches (otherwise discard silently).
- The restored cell is **paused**. Graph history starts at the restore point, with a "resumed" marker.
- Commands still waiting in the restored cell's queue (`cell.pending`, source `user`) are shown as pending on their controls again, so a control never shows the old value and then changes on its own.
- A toast reads: "Resumed your last cell. [Start over]", but only when the cell was run or changed (snapshot tick > 0, a logged command, or a pending one). An untouched tick-0 cell is saved on every visit, and announcing it was noise.
- Saved preferences from another build are cleaned on load: unknown genes are dropped from `graphGenes` (fallback `['fliC', 'ptsG']`), and `focusGene`, `window` and `plot4` fall back to their defaults if not recognised.

**Errors in a frame.** `BTC.Loop` wraps each frame in try/catch. On an error it stops (so the button no longer says "Running"), calls `onError`, and the app shows a toast "Something went wrong. Start over, or reload the page." with a Start over action, logs to the console and stores `{msg, stack, build, tick}` under `btc.lastError` (try/catch). The first render at boot is guarded the same way, so the service worker and the debug hook still register.

---

## 11. Acceptance checks

### 11.1 Node tests (`npm test`; no dependencies)

These are added alongside the engine spec's tests.

| id | test |
|---|---|
| U-1 | `layout.classify`: 360×740 and 375×553 → compact; 768×1024 → stack; 740×360 → split; 1280×800 and 1366×768 → wide; 1024×600 → wide; 600×900 → stack. The short-screen flag (legend on one line) is set for heights < 600 (375×553, 740×360) and not for 360×740 |
| U-2 | `cellgeom`: 10⁵ hash points from `map(u, v)` all lie strictly inside the capsule; `perimeter(s)` points lie on it within 0.5 px, with unit normals; points are stable (same input, same output) as `length_um` grows (monotone in u) |
| U-3 | Content lint: every narrator template, expanded for all genes in named and hidden modes, passes the full §7.3 template rules (one sentence, ≤ 140, no digits, no `!`, regex); every other `BTC.content` string passes the reduced rules (≤ 140, no `!`, regex; digits allowed); job lines ≤ 60 characters; every rejection code has text |
| U-4 | Narrator scenarios: for each of the 36 rules (1–22 with 6b, 6c, 10b, 11b, 13b, 16a–g, 17a–b, 19b, 21b), a scripted engine run (commands at exact ticks, fixed seed) produces that key. Key sequences are asserted, not text. Required scenarios:<br>• fliC ×4 at tick 0 → the key sequence contains `gene.tx` (by tick 20) **before** `gene.rising` (after `first_protein`); `gene.waiting` is optional, because the first Poisson draw often initiates in tick 0. `gene.waiting` itself is asserted with lacZ ×¼ from off (μ ≈ 0.006 per tick).<br>• Glucose None → `starve.nosugar` within 10 ticks, and **still** `starve.nosugar` after 11 h, after `dormant` has fired (at about 10.5 h since engine 1.1.0).<br>• ptsG knockout with initial protein 0, glucose High → `starve.noimport` for hours, then `dormant` (after 8 h), then `starve.dormant`.<br>• gly knockout with initial protein 0, glucose High → `growth.arrested` (import capacity is normal, so neither transporter line fires).<br>• Glucose None and lactose Present; lacY ×1 and lacZ ×1 on after 1 min → `lac.noY` while ATP is low, then `gene.noatp` once energy = none (before 30 min); no lacY mRNA is finished in 40 min.<br>• lacZ ×1 on with glucose present; 30 min later glucose None and lactose Present → `lac.noY`. The same with lacY ×1 instead → `lac.noZ`.<br>• fliC ×4 for 2 h, then off → `burden` before the off-command; after it, `facts.uselessGene` becomes `null` within 10 sim-min of `mrna_gone`, and `burden` never appears again in the following 4 h.<br>• lacY ×2 and lacZ ×2 without lactose, 1 h → `burden.lac`.<br>• Glucose Low → `growth.low` after 1 h (not `starve.fewimport`); ptsG ×¼ with glucose High → `gene.down`, then `starve.fewimport` by 8 h.<br>• lacY ×1 and lacZ ×1 preinduced 4 h with glucose, then glucose None and lactose Present → `growth.lactose` once the cell has adapted.<br>• Amino acids Present and aaImp ×1 → `gene.up`, then `growth.aa` once the up phase ends.<br>• aaSyn knockout with initial protein 0, no amino acids → `aa.low`.<br>• Drugs: Cm Full → `drug.cm`; Rif Full → `drug.rif`, then `drug.rif.late` after 10 min; both Full → `drug.both`; Low doses → `drug.cm.low`, `drug.rif.low`.<br>• Glucose None for 20 min, then High → `recover`.<br>• gly Off with glucose High → `starve.noenzyme`, never `starve.fewimport`; the ptsG ×¼ scenario never gives `starve.noenzyme`.<br>• lacY and lacZ ×1 for 5 min with glucose and lactose, then glucose None → `lac.toofew` within 20 min while growth pauses, then `growth.lactose` once the cell has made more LacY and LacZ (by 3 h); ×4 for an hour never gives `lac.toofew` and ends in `growth.lactose`.<br>• Every scenario runs on the default parameters (engine 1.1.0); none raises `upkeepBasal` to drain ATP faster.<br>• lacY and lacZ ×1 with glucose and lactose for 1 h → `growth.both`; aaSyn Off for 4 h → `growth.slow`.<br>• Cm Full for 30 min then Off → `drug.cm.off` at once, gone after 10 min; the same for rifampicin → `drug.rif.off`. fliC ×4, glucose None + lactose at 30 min, Cm Full at 40 min → at 2 h the key is `lac.noY`, not `drug.cm`.<br>• fliC ×½ and lacZ ×1 without lactose, seeds 1–4, 90 min: `uselessGene` never changes twice within 120 sim-s (hysteresis).<br>Across all scenarios the key is never `growth.normal` while `facts.growth` is not `normal`, and every value of every facts field (engine spec §11.5, schema 1.2) occurs at least once; the test asserts this coverage table |
| U-5 | *(deferred, §14)* Palette: the thresholds of §8.2 (Machado CVD matrices and a CIE Lab ΔE76 implementation live in the test) |
| U-6 | Dot budget: over 50 fuzz states (random levels, media, drugs, 2 h each), computed glyph totals ≤ 1,500; every gene with protein > 0 has ≥ 1 glyph (solid or hollow); the shared protein scale obeys 20% hysteresis. **Worst case:** fliC ×4 as focus gene after 2 h (≈150 mRNAs, ≈1,900 ribosomes on them): focus polysome at 1 dot = 10 and the legend says so; non-focus mRNA are short marks; Σ(focus strand length × 2 px) ≤ 40% of the interior area; total glyphs ≤ 1,500 |
| U-7 | `NarratorHold` with a fake clock: holds ≥ 1.5 s; pre-emption after 0.5 s only for rules 1–11b; writes to the live region only on key change |
| U-8 | `BTC.Loop` with a fake clock, fake rAF and a stub cell: never runs more than 4 ms of steps per frame; drops the remainder when behind; runs 0 steps while paused or hidden; resumes with no catch-up; reports achieved speed |
| U-9 | Formatters: counts, mM, clock, and exact speed labels for all 5 speeds |
| U-10 | Plot helpers: `niceTicks` gives 3–5 ticks covering the data; `logTicks` handles 0 and 1; `thinForPixels` keeps per-column minimum and maximum |
| U-11 | App lint: no `Math.random`, `setTimeout` or `setInterval` driving model-related visuals (allowed only in `btc-pwa.js` and the UI chrome's toast and chip timers, via an allow-list); no `title=` attributes in `index.html`; no `:hover` rules that change content; every input and select has `font-size` ≥ 16 px; engine spec c-2 (no assignments to `cell.*` or `view.*`) |
| U-12 | Build: all engine spec b-2 checks; `dist/sw.js` contains the build hash and no placeholder; `manifest.webmanifest` parses and has relative `start_url`, `scope` and `id`; every icon it names exists; no URL in the manifest or `sw.js` (`ASSETS`, registration), and no `src`/`href` attribute in `dist/index.html`, starts with `/` or names a host (the `/be-the-cell-/` Pages path) |
| U-13 | Every `src/app` file loads under `require` without a DOM and in a `vm` context with only `self` |

### 11.2 Browser checks (`node tools/ui-check.js`)

**Tool setup**
- Uses the globally installed Playwright 1.56, required by absolute path (`require('/opt/node22/lib/node_modules/playwright')`, falling back to `require('playwright')`), with the Chromium in `PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`). Playwright is **not** a package.json dependency, and nothing ever runs `playwright install`. The script exits 0 with "skipped: playwright not installed" when it is absent.
- It runs against `serve.js` serving `dist/` (so run `node build.js` first), except P11, which opens `dist/index.html` by `file://`.
- In M1 it is run **by hand** before the student test and before each release, not in CI (a CI job is deferred, §14).
- Screenshots go to `test-artifacts/`, which is gitignored. They are for human review; there is no pixel-diff gate, because fonts vary.
- All interactive checks use `?test=1&seed=1` and drive time with `app.test.runTicks(n)`, so results do not depend on machine speed.
- **M1 scope:** layout screenshots at five viewports (P1, P1b, P16) plus a handful of interaction checks. The v1.0 checks P5, P6, P10, P12–P15, P17 and P18 are deferred (§14); their behaviour is covered by Node tests or by the manual checklist (§11.3).

| id | check (viewport; Chromium with `isMobile`, `hasTouch` unless noted) |
|---|---|
| P1 | 360×740: load; screenshot each tab (Cell, Genes, Medium, Graphs). No console errors. No request leaves the origin. `scrollWidth ≤ 360` on the document and every tab |
| P1b | 375×553 (iPhone SE Safari tab, short screen): load; screenshot each tab. No console errors; `scrollWidth ≤ 375`; the document does not scroll vertically (`scrollHeight ≤ 553`); the cell canvas is ≥ 220 px tall; the legend is one line; the legend and Key button are not clipped by the narrator; the focus bar's promoter row is fully visible |
| P2 | 360×740 touch targets: every visible `button`, `[role=radio]`, `[role=tab]` and chip has a bounding box ≥ 44×44 (checked during the P1 run) |
| P3 | Gene on → mRNA rises (Genes tab): tap fliC "4" on the Genes tab; `runTicks(90)`; the fliC card's mRNA text (mature + nascent) > 0; `runTicks(600)`; protein text > 0 and increasing over another 300 ticks; `cellViewStats().mRNA.fliC > 0`; narrator key went through `gene.tx` |
| P3b | Gene on → mRNA rises **without leaving the Cell tab**: on the Cell tab, open the focus picker and choose fliC; tap "4" in the focus bar's promoter row; the segment shows pending, then solid after `runTicks(1)`; `runTicks(90)`; `cellViewStats().mRNA.fliC > 0` and the focus bar's mRNA text > 0; the Genes tab's fliC card shows level 4 (shared state); the active tab never changed |
| P4 | Remove glucose → starvation: Medium, Glucose "None"; `runTicks(30)`; narrator key is `starve.nosugar`; ATP gauge word is "low" (engine 1.1: a starving cell keeps a little charge, E ≈ 0.1–0.2; "very low" needs E < 0.1, after about an hour); `runTicks(120)`; growth reads "not growing"; the cell view shows ADP glyphs ≥ 15 and ATP glyphs ≤ ¼ of them |
| P7 | Pause and speed: paused → tick unchanged over 1.5 real s; Play at "1 s = 1 min" → tick advances by 60 ± 20 per real s (loose, real-time check); the speed sheet shows 5 options with the exact labels of §6 |
| P8 | Reset: after P3, P3b and P4, "Start over → Same cell again" → `__btc.cell.hash()` equals the hash of a fresh `new BTC.Cell(sameConfig)` |
| P9 | Replay: after a scripted sequence of ≥ 10 UI taps (Genes tab, focus bar, Medium, Drugs) interleaved with `runTicks`, `BTC.replay.verify(__btc.cell.runRecord()).ok === true` (so the UI issued only commands) |
| C3 | Restore with a pending command (360×740, no `?test`, `?reset=1` first): pause, Medium → Glucose "None", reload → `cell.pending.length === 1`, the glucose row shows one pending segment ("none"), and the cell is paused |
| P11 | `file://`: open `dist/index.html` directly (desktop Chromium, 1280×800) → the app renders, runs 100 ticks, registers no SW, logs no errors |
| P16 | Layouts: screenshots at 740×360 (split), 768×1024 (stack) and 1280×800 (wide; desktop Chromium, no touch); no overflow; every region visible |

### 11.3 Manual device checklist (before the student test group)

Test on each of: iPhone Safari, Android Chrome, a school Chromebook, and Windows or Mac with Chrome, Edge and Firefox.

For each device:
1. Add to the home screen or install the app. Launch in standalone mode, then use it offline in airplane mode. (This replaces the deferred automated offline check P10.)
2. Rotate the device.
3. Switch apps for 5 minutes and return. The cell should resume, paused.
4. Run `tools/golden.html` and record its hash (engine spec d-4).
5. Read the narrator with VoiceOver or TalkBack for one gene cycle (replaces the deferred P18).
6. On a phone, switch a gene on from the Cell tab's focus bar and watch its mRNA appear.
7. Download a run: the share sheet appears on phones, a file downloads on laptops; replay it with `BTC.replay.verify`.
8. On an iPhone in landscape (split layout), check that the narrator's last line and the bottom of the panel clear the home indicator (the bottom cells pad by `env(safe-area-inset-bottom)`; Playwright cannot check this).
8. After a new deploy, reopen the installed app: the update banner appears and the page reloads only after Reload is tapped (replaces the deferred P12).

---

## 12. Hooks reserved for levels (inert in M1)

| Hook | M1 form | Later use |
|---|---|---|
| `labConfig` | `{showNames:true, genesVisible:'all', controls:{genes:true, medium:true, drugs:true}, lockedGenes:[], allowedLevels:null, speedOptions:null, startPaused:true}`, read by every panel | 1.1 hides names (they appear on `function_seen`), 1.3 limits levels, 1.7 locks controls (designer mode) |
| HUD slot | an empty `<div id="hud">` between the status strip and the content, 0 px tall | goal chip, deadline, experiment counter, level title |
| Plot overlay | `plot.setOverlay(points, style)` and `plot.setInputMode('sketch', onDone)`, both implemented as no-ops that throw "not in M1" | 1.2 predicted protein curve, scored against the Recorder by replay. **Implemented in M2** (§17): `setOverlay(points [[t_s, y]], {color, dash, width})`, `setInputMode('sketch', {onPoint(t, v, phase)})` with pointer capture, `setYBand({lo, hi, label})` (1.4's band), and the options `xStep`, `yStep`, `xLabel`, `yLabel` |
| Narrator | `narrate` accepts an optional `levelRules` array evaluated before rule 1 | level-specific lines, in the same lint |
| Sheets | the generic sheet manager supports `question {prompt, options:[{t, ok, fb}]}` rendering, unused | prediction questions with misconception-specific feedback |
| Commands | the UI never calls `schedule`; lessons will issue commands with `source:'lesson'` | scripted scenes |
| Content | all strings are in `BTC.content`; a level can supply an override table | story text (dry, understated) |
| Compartments | `CellView` draws from a `compartments` list of length 1 in M1 | chapter 2: nucleus, ER, Golgi (plasma cell first for 2.3) |

---

## 13. Decisions for Alex (defaults already chosen; change any one without affecting the rest)

1. **The lab starts paused.** This leaves room to look at the controls before anything moves. Alternative: start running at "1 s = 1 min".
2. **Gene symbols are shown in muted italic beside the plain names** (e.g. "Flagellin *fliC*"). This is useful for majors and easy to ignore for non-majors. Alternative: names only, with symbols under "About".
3. **"Start over" defaults to "Same cell again" (identical randomness).** "New cell" gets a different random history, which is a quiet way to show that the random events differ between cells while the averages do not.

---

## 14. Deferred to M1.x (not implemented now)

These items are **out of scope for the first student test**. They stay specified above (marked *deferred*) so they can be built later without redesign.

| Item | Where | M1 behaviour |
|---|---|---|
| Instructor options (`?instructor=1`, backup-uptake toggle) | §4.3, §10.4 | the parameter is ignored; `flags.backupGlucoseUptake` stays reachable only through engine config (test g7) |
| RBS and per-second promoter-rate controls | §3.4 | not offered; the engine commands exist (engine spec §20) |
| Display-order variants (`variant.slotOrder`) | §3.1 | cards in slot order |
| `function_seen` handling (`app.seen`, name reveal) | §10.3, §12 | not emitted by the engine in M1 |
| Hand-written PNG encoder in `tools/make-icons.js` | §9.2 | icons are PNGs rendered once with Playwright from the SVG and committed |
| U-5 palette/CVD test | §8.2, §11.1 | the palette values stay as validated in §8.2; no automated check |
| P12 service-worker update test | §11.2 | manual checklist item 8 (§11.3) |
| Other browser automation: P5 (lac.noY), P6 (chloramphenicol), P10 (offline), P13 (hidden tab), P14 (themes and motion), P15 (performance with CPU throttling), P17 (WebKit), P18 (accessibility), and the 1366×768 screenshot | §11.2 | P5 and P6 behaviour is covered by U-4; P13 by U-8; P10 and P18 by the manual checklist; P14, P15 and P17 are not covered in M1 |
| A CI job for `tools/ui-check.js` | §11.2 | run by hand before the student test and each release |
| Engine items: watchers, marks, `runUntil`, the genome-schema compiler | engine spec §20 | – |

Everything else in this document is in scope, including the narrator, the Recorder, the dots module, reset, replay and run download.

---

## 15. Changes from v1.0

Critique items are numbered in the order of `critique.json` (1–29). "Coordinator" marks a decision taken on top of the critique.

| # | Change | Where | Addresses |
|---|---|---|---|
| 1 | Glucose Low = 0.005 mM (was 0.05, which changed growth by 0.3%); description now "Low: transporters are only partly filled, so less sugar gets in."; rule 10 limited to glucoseLevel = high so that rule 20 ("Glucose is scarce…") is what Low shows | §1.4, §4.1, §7.2 | critique 4 (major); coordinator decision 2 |
| 2 | Burden rules 17a/17b key on the **current ribosome share** via `facts.uselessGene` (engine spec §11.5); U-4 scenario: after fliC ×4 is switched off, `uselessGene` clears within 10 sim-min of `mrna_gone` and `burden` does not return | §7.1, §7.2, §11.1 U-4 | critique 5 (major); coordinator decision 4 |
| 3 | Starvation rules: `starve.nosugar` moved above `starve.dormant` (now rules 7 and 8); dormancy and no-import lines require glucose outside, carbon = none and glucoseImport ≠ normal; U-4 scenarios for glucose None at 15 min and for a ptsG knockout | §7.2, §11.1 U-4, P4 | critique 6 (major); coordinator decision 4 |
| 4 | Every narrator condition is written in facts schema 1.1 terms (drug `off/low/full`, `medium`, `glucoseLevel`, `glucoseImport`, `energy`, `justDivided`, `aaOutside`, `aaImportOn`); thresholds live in engine spec §11.5; U-4 asserts that every facts value occurs | §7.1, §7.2, §11.1 U-4 | critique 7 (major); coordinator decision 4 |
| 5 | Pending controls resolve on `command_applied` / `command_rejected` by `seq`, using `resolved` and `prev`; narrator up/down phases read `prev.level` and `resolved.level`; graph markers use `cmdType` and `resolved` | §3.4, §5.1, §7.1, §10.3 | critique 8 (major); coordinator decision 5 |
| 6 | Cell view: non-focus mRNA drawn as 6–8 px marks (one per molecule); only the focus gene's mRNA as full strands, scaled so their summed area ≤ 40% of the interior; focus polysome 1 dot = 10 above 400 ribosomes, shown in the legend; the dot-budget fallback never rescales mRNA or the focus polysome; U-6 worst case with fliC ×4 as focus | §2.3, §2.9, §3.6, §11.1 U-6 | critique 9 (major); coordinator decision 7 |
| 7 | Compact Cell tab: the focus bar gets a second 48 px row with the focus gene's promoter control; tapping a locus or choosing in the picker changes focus, so every gene can be switched without leaving the Cell tab; the control component is shared with the gene cards; new browser check P3b | §1.2, §2.8, §3.4, §3.6, §11.2 P3b | critique 10 (major); coordinator decision 7 |
| 8 | New rule 11b `gene.noatp` ("{G} {is} switched on, but with no ATP nothing is transcribed."); U-4 scenario; About sheet row advising to switch lactose genes on while glucose is present; pre-emption now covers rules 1–11b | §4.4, §7.2, §7.4, §11.1 U-4, U-7 | critique 11 (major) |
| 9 | M1 scope trim: instructor options, RBS/rate UI, `variant.slotOrder`, `function_seen` handling, the PNG encoder, U-5, P12 and all browser automation except layout screenshots at 360×740, 375×553, 740×360, 768×1024 and 1280×800 plus P2, P3, P3b, P4, P7, P8, P9 and P11 moved to §14; Playwright is the global install, required by absolute path, run by hand | §0.2, §3.1, §3.4, §4.3, §9.2, §10.1, §10.3, §10.4, §11.1, §11.2, §14 | critique 12 (major, scope); coordinator decision 10 |
| 10 | Content lint: the no-digit and one-sentence rules apply to narrator templates only; length (≤ 140), no-exclamation and teleology rules apply to all content; the duplicate `trying` in the regex removed; the regex is the single source for both specs | §7.3, §11.1 U-3 | critique 21; coordinator decision 4 |
| 11 | Compact height: canvas minimum 220 px; legend collapses to one line (protein scale plus Key) below 600 px of height; `data-short` layout flag; new check P1b at 375×553; U-1 covers 375×553 | §1.1, §1.2, §2.9, §11.1 U-1, §11.2 P1b | critique 22; coordinator decision 7 |
| 12 | Status strip shows `lastCycle_min` when growth is steady and switches to the EMA, labelled "recent", when there is no cycle yet or the two differ by > 15% (back at ≤ 10%) | §6 | critique 23; coordinator decision 7 |
| 13 | Recorder doubles its sampling interval on each thinning and stores sample ticks | §5.1 | critique 24 |
| 14 | §7 declared authoritative for the narrator; facts amendments moved into engine spec §11.5 (schema 1.1) and summarised here; rule 18 uses `aaImportOn` and `aaOutside` | §7.1, §7.2 | critique 25; coordinator decision 4 |
| 15 | Run download uses `navigator.share({files})` when `canShare` allows it, with the anchor download as fallback; the record carries `presetHash` | §4.5 | critique 27; coordinator decision 9 |
| 16 | U-4 asserts `gene.tx` before `gene.rising` with `gene.waiting` optional (asserted separately with lacZ ×¼); P4 ADP threshold lowered to ≥ 15 and P4 asserts the key `starve.nosugar` instead of a rule number | §11.1 U-4, §11.2 P4 | critique 29 |
| 17 | Repo path `/home/user/be-the-cell-`; Pages base path `/be-the-cell-/`; every app URL relative; U-12 checks it | header, §9.1, §9.3, §11.1 U-12 | coordinator decision 11 |
| 18 | `dist/` stays gitignored; the published `index.html` is the single-file bundle and the README explains how to save it ("HTML only") or build it | §0.1, §9.4, §10.1, §10.2 | coordinator decision 8 (critique 26 rejected, below) |
| 19 | Icons rendered once from the SVG with Playwright; no PNG encoder | §9.2 | critique 12; coordinator decision 10 |
| 20 | Manual checklist gains the checks that replace deferred automation (offline, VoiceOver/TalkBack, update banner) and the phone Cell-tab switch and run download | §11.3 | critique 12, 10, 27 |
| 21 | Narrator templates agree in number for plural genes ("The glucose-processing enzymes are accumulating", "… fall slowly …", "… started on them yet"): `{is}` in 16c and 16d, new tokens `{it}` and `{s}` in 16a and 16e; rule 19 names LacZ through `{Z}` so hidden-name mode hides it too. Found by the U-3 expansion lint | §7.2 | implementation (build step 6) |

**Rejected: critique 26 ("commit `dist/index.html`, as NeuronSim does").** Coordinator decision 8 keeps `dist/` out of git. The GitHub Pages workflow builds and publishes the bundle on every push to `main`, and the published `index.html` is already the single self-contained file, so anyone can save it from the site for double-click use (README, §10.2). Committing it would duplicate a generated artifact that can drift from its sources and would need a freshness check on every commit. NeuronSim's committed copy is not needed here, because the hosted page serves the same file.

**Consistency fixes between the two specs:** the narrator API (`createMemory` / `ingest` / `narrate(facts, memory, tick)`) and its rules now live only here, with engine spec §12 marked superseded; the text-lint regex is shared; facts thresholds live only in engine spec §11.5; the focus-polysome scale is stated identically in engine spec §12 and §2.3 here; the Low glucose value (0.005 mM) matches engine spec §8.

## 16. Changes after the M1 build review (before the first phone test)

A review of the built lab (biology, code, phone UX and teaching-text lenses) led to these changes. The engine's physics, the golden hash and the presets are unchanged; `ENGINE_VERSION` stays 1.0.0. Facts (observe-only) move to schema 1.2.

| # | Change | Sections |
|---|---|---|
| 1 | Narrator: rule 10 split on the new fact `glucoseStep` (10 `starve.fewimport` when import limits, new 10b `starve.noenzyme` when the glucose-processing enzymes do); both accept energy none | §7.1, §7.2; engine §11.5 |
| 2 | New rule 13b `lac.toofew` for a partly induced cell moved to lactose; the About lactose advice now names the recipe that works (×4 for an hour) and says that glucose restarts a stopped cell | §4.4, §7.2; BIOLOGY open item 1 |
| 3 | New rules 19b `growth.both`, 21b `growth.slow`; rule 22 only at normal growth. New rules 6b/6c for a drug switched off. Chloramphenicol lines need energy ≠ none | §7.2 |
| 4 | Burden: `uselessGene` hysteresis 2.5% on / 1.0% stay; 17a per gene; 17a/17b say growth slows "over a few generations". 3, 16d and 16e reworded (winding down; "its protein") and 7 ("slows to a stop") | §7.1, §7.2; engine §11.5 |
| 5 | `aaImportOn` from the import flux (> 5% of amino acids used), so amino acids at the default importer level give `growth.aa` | §7.1; engine §11.5 |
| 6 | Cell view: the watched gene's strands on top with a halo, its polysome 4 px at 60%, the crowd at 45%; rod orientation hysteresis; outside scale on the canvas; scale bar "1 µm · width ×2"; the focus-ribosome scale moved from the legend to the key sheet; legend clamped to 2 lines | §0.3, §2.2, §2.3, §2.7, §2.9 |
| 7 | Compact: fixed narrator height (3 lines); focus bar with mRNA and protein on their own lines ("+ n being made"); short screens hide the "Change" word; the offline/resumed toast sits above the tab bar | §1.2, §2.8, §7.4 |
| 8 | Default focus gene fliC (Off at start); graph genes default `['fliC', 'ptsG']` | §1.1, §3.6 |
| 9 | Graphs: a second, ring-mode recorder keeps full resolution for windows up to 6 h and the sparklines; one shared gutter pair for all plots, y labels in a left gutter, end labels kept inside, command labels by priority, drug bands labelled; ATP "< 0.01 mM"; the spending bar says "Almost no ATP is being made or spent." below 1% of the reference | §5.1, §5.2 |
| 10 | Restore: pending commands shown again; the resumed toast only for a cell that was run or changed; saved preferences cleaned. Loop errors stop the loop and show a toast | §10.5 |
| 11 | Speed keys 1–5 work while a button has focus; the keyboard-shortcut boxes are hidden on touch screens; non-compact layouts pad the narrator and panes by the bottom safe-area inset | §6, §11.3 |
| 12 | Content: fliC job and About, the PtsG key note (glucose-6-phosphate), share-bar label, "off · some protein", About rows split and added ("Why a bacterium", ATP, lac regulation, lactose lag), the drugs title note dropped, "Full details are in the instructor notes."; docs use "rifampicin-type" and "chloramphenicol-type" like the UI | §3.2, §3.3, §4.2, §4.4 |

## 17. Changes after engine 1.1 (M2 build: levels 1.2 and 1.4)

Engine 1.1.0 changed how a cell without sugar behaves (it cuts its spending and keeps a little charge for hours) and how lactose adaptation works (a cell with a few LacY and LacZ now pauses and then grows). App text written for engine 1.0.0 had become false; the level hooks of §12 are now in use. Numbers are from the lab strain (`m1-lab`, steady preset) at the default parameters unless noted; docs/BIOLOGY.md "Lactose" and "The lac operon" have the model's side.

| # | Change | Sections |
|---|---|---|
| 1 | About sheet, "Lactose": the engine 1.0.0 recipe ("×4 … and wait an hour"; "this model does not" adapt) replaced by three true rows: switch on while glucose is there, then remove it (the cell pauses, then grows); more LacY and LacZ, a shorter pause (about 2 h after ×1 for 3 min, a few minutes after ×4 for 15 min); switched on after glucose is gone they are never made, and glucose restarts the cell. The "What is simplified" ATP row now says the cell slows its ribosomes and upkeep as real cells do but its ATP still falls lower | §4.4 |
| 2 | Narrator 11b `gene.noatp`: "with almost no ATP" (energy = none means E < 0.1, not zero). Reached at about 12 min when lacY and lacZ are switched on 1 min after glucose is removed; no lacY mRNA is finished in 40 min, so "nothing is transcribed" is true | §7.2, §11.1 |
| 3 | Narrator 13b `lac.toofew`: the old condition (energy = none on lactose with both proteins) was unreachable at the default parameters, and "the cell has stopped" was false for a cell that later grows. Now energy ≠ normal and growth = arrested: "Lactose gets in through only a few {Y} and {Z}, so ATP stays low and growth has paused." (reached within 20 min after ×1 for 5 min, followed by `growth.lactose`) | §7.2, §11.1 |
| 4 | Rule 8 `starve.dormant` is unchanged and true: dormancy (E < 0.01 for 10 min) now comes after about 10.5 h without sugar or with a ptsG knockout. U-4 scenarios run on the default parameters for 11 h (none raises `upkeepBasal`) | §11.1 |
| 5 | ATP plot: the "< 0.01 mM" readout is now rare (0.39 mM after 15 min without sugar, 0.03 mM after 11 h) | §5.2 |
| 6 | Graph markers: a level's `setControls` reads "controls locked" / "controls free" | §5.1 |
| 7 | `BTC.Plot`: `setOverlay`, `setInputMode('sketch')` (pointer capture, `touch-action: none`), `setYBand({lo, hi, label})` (drawn under the data, its label after the grid on a patch of the panel colour), options `xStep`, `yStep`, `xLabel`, `yLabel` | §5.2, §12 |
| 8 | Graphs panel reads `labConfig.plots` (which plots, in order), `labConfig.yBand` (on the Protein plot), `labConfig.graphWindow` (a window that is not one of the presets hides the Window row) and `labConfig.initialTab`; time ticks every 5 min for windows up to 30 min | §5.2, §12 |
| 9 | Cell view: a fifth flux marker, "cut up": a gene-coloured rectangle in two pieces leaving a glyph of the visible gene with the most protein degradation (`degraded_perS`), ladder from 1; key row "{protein} cut up by proteases (proteases are not drawn)", shown only while a protein is being degraded (level 1.4) | §2.5 |
| 10 | Gene controls show "Set by this level." when the level's schedule has locked the controls (`cell.controls === 'locked'`, 1.2 after the deadline) | §3.4 |
| 11 | The HUD slot is used: goal, timer and counter with short forms below 400 px, a progress bar or a band gauge (1.4), a "Continue ›" button when the phase is done; every tap target ≥ 44 px | §12 |
| 12 | `sw.js`: navigations to pages other than the app (for example `tools/codes.html`) go to the network, so a cached `index.html` never answers for them | §9.3 |

## 18. Changes after the M2 reviews (before the think-aloud)

Four reviews (code, phone UX, biology, text) of the M2 build; LEVELS.md §16.11 has the level side.

| # | Change | Sections |
|---|---|---|
| 1 | The free-play lab shows the **Levels** button at the left of the status strip (`StatusStrip.setLevel(null, true)`); it goes home. Before, the lab was a one-way door (a reload went back to the lab, and no sheet led home) | §6 |
| 2 | Cell view: a sixth flux, glucose through the **slow side route** (level 1.1's `backupGlucoseUptake`). The route is drawn as a dashed gate across the membrane at two fixed places (perimeter 0.19 and 0.69) with the canvas label "side route"; its share of the glucose flux, uBasal·V ÷ (uBasal·V + PtsG protein·k_pts), enters only there, and the rest through PtsG glyphs. No glucose marker crosses bare membrane. Key row "glucose by the slow side route (not one of the six genes)" with its marker scale; tap chip "A slow side route for glucose: …" | §2.3, §2.5, §2.8, §2.9 |
| 3 | While a level hides gene names (1.1), a dial marks no default level and a card shows no "stands for ~N genes" badge until the gene is named (both named the transporter or the importers) | §3.1, §3.4 |
| 4 | A level's change of names (1.1's reveal) resets the narrator, so the line on screen is said again with the new name | §7.4 |
| 5 | Narrator rule 18: "Amino acids come in from the medium, so fewer have to be made inside and the cell grows faster." | §7.2 |
| 6 | About sheet: "In the free lab each gene has its own switch, and you set it; in real cells, regulator proteins that bind signals switch genes." and "In real E. coli, LacI and CRP keep the lac genes nearly off while glucose is present; level 1.7 builds that in."; the gly card's About no longer names glycolysis; the lacZ card's About adds that LacZ turns a little lactose into allolactose | §3.2, §4.4 |
| 7 | HUD counters: short forms keep a unit ("1/3 tests", "32/48 mRNA", "1/2 changes"); `counter.over` marks a count past par in `--warn-ink` (bold) and the long form says "over par". The run's end refreshes the HUD in the same frame (the loop has stopped, so the 250-ms refresh never came) | §12 |
| 8 | Sketch sliders: ±100 (was ±50), the value is a text field that takes a typed number, and Done stays disabled until one value has been set (a flat line at zero could be locked in) | §12 |
| 9 | Toasts on home and the Prologue's drawings sit at the top (they covered home's buttons and the Prologue's sheet) | §9.4 |
| 10 | Manifest and page description: "A game about genes and proteins, in which you are in charge of a cell. In principle." | §9.1 |
| 11 | Telemetry merges the other tabs' stored events before it writes; `clear()` writes an empty log | §10.5 |

## 19. Tiered screens and the lab's Simple mode (docs/PROLOGUE.md §5; slice part B)

| # | Change | Sections |
|---|---|---|
| 1 | `labConfig.ui` (PROLOGUE §5.1) chooses a tier (`src/app/btc-tiers.js`): which status readouts show (pause, clock and speed always; then the energy bar with its word, growth as a word, "sugar in: plenty / some / a trickle / none"; generation and doubling time only with All controls), the focus bar (big counters "mRNA copies", "copies made", "{Proteins}", "made … a minute · cut up … a minute", with an Off/On switch or the dial), the tabs (`graph` is the single simple graph), simple gene cards (no sparkline or ribosome-share bar), the medium panel, the legend (one line in tiers 1–3). A labConfig without `ui` is the full M1 screen | §1, §2.8, §3, §6 |
| 2 | The single simple graph (`src/app/btc-simplegraph.js`): one or two lines from the start of the run, a dashed target, a shaded zone, a level's marks, command marks; no gene chips, lin/log, window row or spending bar | §5 |
| 3 | The free-play lab opens in **Simple** mode (tier 4: every lever kept, the drugs folded behind one row); the "All controls" switch (Medium panel header on a phone, status strip on a laptop) restores this spec's lab; kept as `labMode` in `btc.ui.v1`, logged as `ui_mode`; `?lab=1&all=1` opens All controls | §4, §10.5 |
| 4 | The guide (`src/app/btc-guide.js`): a callout over the cell (or the open panel) with a ring on what it is about, for watch steps and for each readout's one-sentence introduction, shown once per student (`progress.introduced`) | §2 |
| 5 | HUD: from 400 to 599 px the goal keeps its long form and the timer and counter take their short ones (the goal chip was squeezed to about 100 px) | §12 |
| 6 | Browser checks: the M1 checks of `tools/ui-check.js` open `?lab=1&all=1`; `tools/ui-check-tiers.js` checks Simple and All controls, the tiers and the watch flow | §11.2 |
