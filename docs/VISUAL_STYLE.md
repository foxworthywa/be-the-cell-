# VISUAL_STYLE.md

A diagram that runs: quiet, flat and textbook-like. Not a cartoon and not realistic
microscopy. Everything drawn is a count or a rate from the engine, and the screen says how many
molecules each mark stands for. The full rules are in `docs/LAB_UI.md` §2 and §8; this is the
summary.

## Tokens

The palette is defined once in `src/app/btc-palette.js` and written to CSS variables at startup
and on theme change; the canvas reads the same object. Light is the default. Dark follows
`prefers-color-scheme` unless the About sheet's theme setting (System, Light, Dark) overrides
it. Every surface sets an explicit background.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#f6f5f0` | `#15181e` | page |
| `--panel` | `#ffffff` | `#1d2129` | panels, cards, sheets |
| `--line` | `#d9d6cc` | `#343a46` | borders |
| `--ink` | `#1f2430` | `#e6e8ee` | text |
| `--muted` | `#5f6675` | `#a3a9b6` | secondary text, background stipple |
| `--accent` | `#2f6fd6` | `#6f9ef0` | focus gene, narrator bar, selection |
| `--good` `--warn` `--warn-ink` `--bad` | `#2f9e5b` `#c98a1b` `#8a5a00` `#c43d31` | not redefined | ATP gauge states; `--warn-ink` for warning text |
| `--outside` | `#eef2f8` | `#1a1f28` | medium around the cell |
| `--inside` / `--inside-depleted` | `#fbf3e6` / `#ecebe6` | `#2a2418` / `#24252a` | cytoplasm, charged / out of ATP |
| `--membrane` | `#8a7f6a` | `#b3a78e` | membrane, septum, sister ghost |
| `--dna` `--rnap` | `#1f2430` | `#d6d9e0` | chromosome, RNA polymerase |
| `--ribosome` | `#5f6675` | `#a3a9b6` | ribosomes |
| `--atp` | `#c98a00` | `#e3b341` | ATP and ADP |
| `--aa` | `#8a8f99` | `#9aa0ab` | amino acids |
| `--sugar` | `#3a3f4b` | `#c9ccd4` | glucose, lactose |
| `--products` | `#9aa0ab` | not redefined | fermentation products leaving |
| `--drug-rif` `--drug-cm` | `#7b61c9` `#b0523c` | not redefined | drug badges and rows |

Gene colours:

| Gene | Light | Dark |
|---|---|---|
| ptsG (glucose transporter) | `#005533` | `#61a17d` |
| gly (glucose-processing enzymes) | `#cc6644` | `#ffac89` |
| aaSyn (amino-acid-making enzymes) | `#3388dd` | `#91c9ff` |
| aaImp (amino-acid importers) | `#554499` | `#a690e4` |
| lacY (lactose permease) | `#aa77aa` | `#e8b7e7` |
| lacZ (β-galactosidase) | `#990066` | `#e970b1` |
| fliC (flagellin) | `#664400` | `#b78e53` |

Type, shape and space: `system-ui` font stack; 16 px base, 13 px small, 12 px minimum; line
height 1.45; radius 12 px for panels and 10 px for controls; touch targets 48 px (44 px
minimum); spacing steps 4, 8, 12, 16 and 24 px.

## Colour rules

- **A gene's colour is its identity everywhere:** its mRNA, its protein glyphs, its card chip,
  its plot line and its graph chip.
- **Molecule class is carried by shape, not colour:** hexagon = sugar; diamond = ATP (filled) or
  ADP (hollow); triangle = amino acid; wavy line = mRNA; two-lobed glyph = ribosome; ring = RNA
  polymerase; rectangle across the membrane = transporter; circle, cluster or bar = protein in
  the cytoplasm. The key sheet names every shape.
- **The cytoplasm shows energy:** it blends from `--inside-depleted` to `--inside` as the
  energy charge rises from 0.1 to 0.7.
- **State is never colour alone.** The ATP gauge always carries a word ("normal", "low",
  "very low"), stalled ribosomes carry a bar, and drug rows carry text.
- `--warn` is never used for text; `--warn-ink` is.
- The ATP-spending bar uses neutral greys (with a hatch for "making protein"), so it does not
  compete with the gene colours; each segment is labelled directly.
- The gene palette was checked with simulated colour-vision deficiency (Machado 2009) and CIE
  Lab ΔE: in light mode, gene pairs differ by ΔE ≥ 20 under every simulation and have ≥ 3.2:1
  contrast on the cell and panel backgrounds; in dark mode, ΔE ≥ 8.3 and ≥ 5:1 contrast. The
  automated check (U-5) is deferred, so change these values only with a new check.

## Type and components

- 16 px base everywhere, including every input and control, so iOS never zooms on focus.
- Live numbers use tabular numerals. Counts below a million are exact with thousands separators
  ("13,700"); above, "2.7 million". Concentrations have 2 significant figures and "mM".
  Percentages are whole numbers, with one decimal below 1%.
- Buttons and segments are at least 44 px (48 px preferred) with a visible focus ring.
- Nothing is available only on hover, and there are no `title` tooltips.
- Sheets are bottom sheets on phones and centred dialogs elsewhere, with a 44 px close button.
- The page itself never scrolls; panels scroll inside it. No horizontal scrolling at any width
  from 320 px.

## Motion

- Molecules never move toward a target. The only motion is a small jitter (1.2 px) around each
  dot's fixed position, and markers for things crossing the membrane, which travel straight,
  fixed paths.
- Motion runs on simulated time: when the lab is paused, everything freezes, and two paused
  frames are identical.
- **Reduced motion** (`prefers-reduced-motion`, or the About sheet's Auto/On/Off setting): no
  jitter, flux markers drawn still at the middle of their path, no drift of the sister cell
  after division, and no CSS transitions longer than 100 ms. The data shown is identical; only
  motion differs.

## Dots and the legend: honesty rules

- Every mark is a count: species count n at scale N is drawn as `floor(n/N + 0.5)` dots, and N
  is on screen.
- **The legend is always visible:** `1 dot = 1,000 proteins · 100 ribosomes · 100,000 ATP · 1
  mRNA [Key]`. On screens under 600 px tall it shortens to the protein scale and the Key
  button; the key sheet always has the full list.
- **Scales.** mRNA is always 1 dot per molecule, and so are transcripts in progress. Pooled
  ribosomes: 100 per dot. The focus gene's ribosomes: 1 per glyph, or 10 above 400 (back to 1
  below 320), and the legend says so. ATP, ADP, amino acids and lactose inside: 100,000 per dot.
  Molecules outside: 1,000,000 per dot, counted in a 1 µm-deep slab of the visible medium.
- **One protein scale for all seven genes,** so dot counts compare honestly between genes. It
  steps along 1, 10, 100, 1,000 … and changes only after the count has passed the threshold by
  20%; the reference cell draws at 1 dot = 1,000.
- **A hollow dot means "some, fewer than half a dot's worth",** so a gene that is on never looks
  empty while its count is small.
- **ATP and ADP are drawn together.** Their sum is constant, so running out of energy shows as
  diamonds going hollow, not vanishing.
- **Stable dots.** Each dot keeps its place for a whole generation; a new count adds or removes
  dots. mRNA dots are tied to molecule ids, so the molecule that decays is the dot that
  disappears. The layout reshuffles once at division, so the halving is visible at a glance.
- **Rates, not amounts, for things crossing the membrane:** each marker stands for N glucose (or
  lactose, amino acids, fermentation products), shown in the key, and lives 0.6 s.
- **Budget:** at most 1,500 glyphs per frame. If a layout would exceed it, the species with the
  most glyphs moves one scale step up and the legend updates; mRNA and the focus gene's
  ribosomes are never rescaled this way.
- **Disclosed in the key sheet:** width drawn ×2 (length to scale); mRNA drawn coiled, not to
  scale; the grey stipple is the rest of the proteome, not counted; no free glucose inside
  (PtsG passes it straight on); the division pinch is drawn from the cell's size.
- **Always shown elsewhere:** the time compression in the status strip ("1 s = 1 min · 60× real
  time") and the "stands for ~N genes" badges on lumped genes.
