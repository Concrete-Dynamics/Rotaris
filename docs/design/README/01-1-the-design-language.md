# Design Brief — Rotaris Desktop Interface — 1. The design language

Part 1 of 7 of [the design README](../README.md), which indexes every part.

## 1. The design language

Everything below is in `docs/design/system/`. `styles.css` is the single entry point; it imports
`tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`, then
`base.css`, `components.css`, `motif.css`. Token names are normative — cite the token, never a
literal colour or pixel value.

### 1.1 The ground

A true neutral dark grey. OKLCH chroma is exactly `0` on every ground and text token: no hue tint,
never blue-violet, never sepia, never pure black. Ground levels sit five lightness points apart so
panels, cards and hover states stay legibly separate.

| Token | Value | Use |
|---|---|---|
| `--rt-bg` | `oklch(21% 0 0)` | window ground, view background |
| `--rt-surface` | `oklch(25% 0 0)` | cards, dialogs, raised panels |
| `--rt-surface-2` | `oklch(29% 0 0)` | inset tracks, meter grooves, code chips |
| `--rt-chrome` | `oklch(23% 0 0)` | title bar, nav rail, status strip, side panels |
| `--rt-hover` | `oklch(30% 0 0)` | resting hover wash |
| `--rt-overlay` | `oklch(12% 0 0 / 0.72)` | modal backdrop |

Text ramp: `--rt-text` `oklch(94% 0 0)` (primary), `--rt-text-secondary` `80%`,
`--rt-text-tertiary` `68%` (captions, passive metadata), `--rt-text-disabled` `58%` (OQ-56, ruled 2026-09-18; was `52%`).

### 1.2 The accent

One brand accent, violet, OKLCH hue **292**, shipped as a nine-stop ramp `--rt-accent-100` …
`--rt-accent-900`. `--rt-accent` aliases `--rt-accent-500` = `oklch(59% 0.160 292)`.

Selection and active states are **a tint plus accent ink**, never an outlined box and never a filled
block. Three tint strengths exist and no fourth may be invented:
`--rt-accent-tint-07`, `--rt-accent-tint-10`, `--rt-accent-tint-14`.

**Where the imported sheet disagrees with this rule, the rule governs — and it disagrees in one
place.** `system/components.css` line 65 draws `.seg-opt.is-active` with
`background: var(--rt-surface-2)`, a neutral block off the ground ramp rather than one of the three
tints. Found 2026-09-13 by the first visual-critic pass (UIR-005), which measured the product doing
exactly what the sheet says and read it as a violation of this paragraph — correctly. This document
is what **adopts** that sheet, so a sentence here outranks a declaration there; the product draws the
active option as `--rt-accent-tint-14` plus `--rt-accent-200`. The sheet is left as it was imported,
because it is reference material and not a file this repository authors, and this note is how a
reader learns the two differ without having to find it again.

`--rt-accent-300` is the readable accent shade for text and links on the dark ground.
`--rt-accent-200` is link hover.

### 1.3 The three-axis state colours

The brand's coordinate-system flourish is made functional: three axis colours are the product's own
agent lifecycle states. This is the single most load-bearing idea in the language.

| Axis | Hue | Meaning | Ramp | Product alias |
|---|---|---|---|---|
| **X** | amber, ~86 | **waiting** | `--rt-axis-x-100…900` | `--rt-wait` = `--rt-axis-x-500` |
| **Y** | teal, 165 | **running** | `--rt-axis-y-100…900` | `--rt-run` = `--rt-axis-y-500` |
| **Z** | violet, 292 | **done** | `--rt-axis-z-*`, aliasing the accent ramp | `--rt-done` = `--rt-axis-z-500` |

Two colours sit **outside** the triad, deliberately, because they are exceptions rather than
coordinates:

- `--rt-danger-500` `oklch(64% 0.200 25)` — failure, destructive actions. Alias `--rt-fail`.
- `--rt-info-500` `oklch(70% 0.130 210)` — informational, idle.

A second, parallel reading of the same three hues covers connection and provider health, and the two
families are never mixed on one surface: `--rt-ok` (= axis Y, sound), `--rt-warn` (= axis X,
attention), `--rt-fail` (= danger, broken).

Derived families that ride the same triad:

- **Diff.** `--rt-diff-add` / `--rt-diff-add-bg` ride axis Y; `--rt-diff-del` / `--rt-diff-del-bg`
  ride danger; `--rt-diff-meta` rides info. Both washes are at 10 % opacity so code syntax colour
  survives underneath; line numbers never take a wash.
- **Pill fills.** `--rt-fill-accent` / `--rt-fill-x` / `--rt-fill-y` / `--rt-fill-danger`, each a
  ~16–17 % translucent wash of that hue's 500 stop, each carrying its own light ink token
  (`--rt-fill-*-ink`). Softer than the 800 block without going pastel.
- **Data-viz.** `--rt-viz-1` … `--rt-viz-6`, built from the three axes plus hue midpoints, used **in
  order**; `--rt-viz-grid` for chart rules. Never invent a chart colour outside this set.

Colour never carries a fact on its own anywhere in this product (`REQ-SHELL-149`,
`REQ-TRACE-261`, `REQ-NOTIFY-258`). Every state is icon-plus-text or dot-plus-word.

### 1.4 Type

Three faces, all self-hosted OFL variable fonts declared by `@font-face` in
`tokens/typography.css`. No Google Fonts, no network dependency — the application renders identically
offline.

- `--rt-font-display` — **Space Grotesk**. Headings, view titles, the wordmark.
- `--rt-font-body` — **Manrope**. All body and UI text.
- `--rt-font-mono` — **JetBrains Mono**. Every number, path, identifier, command, hash, branch name,
  token count and diff line. If it is data, it is monospaced.

**Three weights, and only three.** `--rt-weight-body: 400` for body, `--rt-weight-medium` /
`--rt-weight-display: 500` for headings, labels and controls, and `300` for large mono numerals.
Nothing in the system goes above 500. Hierarchy is size, colour and space — never weight.

Sizes: `--rt-text-2xs: 10`, `--rt-text-xs: 11`, `--rt-text-sm: 12`, `--rt-text-base: 14`,
`--rt-text-md: 16`. Headings: `--rt-h6: 11`, `--rt-h5: 16`, `--rt-h4: 20`, `--rt-h3: 24`,
`--rt-h2: 32`, `--rt-h1: 44`.

`h6` is not a heading in the usual sense — it is the **section kicker**: 11 px, weight 500,
uppercase, `--rt-tracking-label` (`0.075em`), painted in `--rt-text-tertiary`. It is also available
as `.card-kicker` and as the `SectionLabel` component, and it is the one exception to sentence case.

Tracking: `--rt-tracking-tight` (`-0.022em`) on display sizes, `--rt-tracking-wide` (`0.05em`),
`--rt-tracking-label` (`0.075em`). Leading: `--rt-leading-tight` `1.12` for headings,
`--rt-leading-body` `1.62` for prose.

### 1.5 Spacing

An **8 px module**: `--rt-space-1: 4` through `--rt-space-24: 96`
(4/8/12/16/20/24/32/40/48/64/96). `--rt-grid-unit: 32px` is the visible module the grid motif is
drawn on and the fade length of every divider — so "grid" is the actual layout discipline, not
only a background pattern.

### 1.6 Radii

`--rt-radius-sm: 5`, `--rt-radius-md: 8`, `--rt-radius-lg: 14`, `--rt-radius-pill: 999`. Every
surface uses one of the three. There are no one-off radii.

### 1.7 Borders and elevation

**Flat by default.** A 1 px hairline defines an edge; a shadow only ever means *this floats*.

- `--rt-border` `oklch(31% 0 0)` — ordinary hairline, sits close in value to the surface it bounds.
- `--rt-border-strong` `oklch(40% 0 0)` — emphasis edges, dot-grid dots, scrollbar thumb.
- `--rt-border-panel` `oklch(28% 0 0)` — structural panel seams.
- `--rt-divider` — `color-mix(in oklch, var(--rt-text) 9%, transparent)`, the faintest rule in the
  system, for row separators and internal rules.
- `--rt-focus` `oklch(83% 0.10 292)` — a 2 px ring is the **only** focus treatment. Never a
  colour-only focus cue.

Shadows: `--rt-shadow-sm` is a 1 px ring and nothing else. `--rt-shadow-md` and `--rt-shadow-lg` add
neutral ambient shadow and are reserved for dialogs, popovers, toasts and the command palette.
Cards at rest carry no shadow.

Forbidden throughout: glow, coloured shadows, inset highlights, bevels, gradient fills,
backdrop-blur or glass, photography, decorative illustration.

Hover is a `color-mix` wash at 7–14 % toward the accent or toward neutral; pressed goes one ramp
step darker. **No scale or shrink effects anywhere.**

**One filled control.** The primary button is the only filled surface in the system; every other
control is a hairline or bare text, so a dense screen carries exactly one accent surface.

### 1.8 Motion

Sparse and purposeful. Short distances, decelerating ease, nothing springy.

`--rt-ease` `cubic-bezier(.4,0,.2,1)` for in-place state changes; `--rt-ease-out`
`cubic-bezier(0,0,.2,1)` for entrances; `--rt-ease-in` `cubic-bezier(.4,0,1,1)` for exits.
Durations `--rt-duration-fast` / `--rt-duration` / `--rt-duration-slow` for hover-and-press /
state change / enter-and-exit respectively, and `--rt-shift` as the only entrance distance.

**No animation in conversation content.** Animation belongs to status indicators only. Exactly two
infinite animations are permitted in the whole system: `.status-dot.is-pulsing` (1.6 s opacity
breathe, used only while a state is actively running) and `.spinner` (0.8 s).

Reduced motion is resolved by `REQ-SHELL-135` — an in-app setting first, then an OS signal, then
motion on — read at each animation start rather than cached. The `prefers-reduced-motion` block that
ships in `base.css` implements only the OS leg and is therefore not sufficient on its own.

Three motion figures in the imported material need a decision before implementation:

1. `tokens/effects.css` ships **90 / 160 / 240 ms** and a **3 px** shift.
   `guidelines/motion-tokens.html` documents **100 / 180 / 260 ms** and a **4 px** shift. The two
   disagree in the source material and both are reproduced verbatim. `REQ-NOTIFY-022` fixes the
   default theme's acknowledgement enter at **160 ms** and exit at **120 ms**, which agrees with
   `tokens/effects.css`; that is the recommended tiebreaker, but it is a decision for the
   Architecture Gate, not a silent edit.
2. `REQ-NOTIFY-022` also fixes the acknowledgement travel at **12 px**, which neither shift value
   expresses. The theme needs a distinct acknowledgement-travel token; `--rt-shift` is not it.
3. `base.css` sets `:focus-visible { outline-offset: 2px }`, painting the ring **outside** the
   control's bounds. `REQ-SHELL-148` requires self-painted navigation controls and divider handles
   to draw the ring **entirely within their own bounds**. Those controls need an inset focus
   treatment at the same width and colour.

### 1.9 Iconography

**Phosphor icons**, regular and fill weights. No emoji anywhere in product or brand copy, no
unicode-symbol icons, no PNGs.

Icon colour always carries meaning and never decoration, at most one coloured icon per row
(`guidelines/icon-colors.html`):

| Ink | Meaning |
|---|---|
| `--rt-text-secondary` | default — the icon inherits text and has no colour of its own |
| `--rt-text-tertiary` | passive metadata beside dim caption text |
| `--rt-accent-400` | skills and capabilities — the brand's own objects |
| `--rt-info-500` | tool invocations, matching mono tool names in logs |
| `--rt-run` / `--rt-ok` | live activity, healthy connection |
| `--rt-wait` / `--rt-warn` | blocked on input, nearing a limit |
| `--rt-fail` | failures and destructive actions only |
| `--rt-done` | completed lifecycle state |

If an icon is not one of those meanings, it stays neutral.

The system currently loads Phosphor from `unpkg.com/@phosphor-icons/web`. **That must be replaced by
a bundled local copy before implementation.** This is a desktop application that renders offline, and
`REQ-SHELL-139` requires the About page to render with zero network requests.

The mark at `docs/design/assets/rotaris-mark.svg` is final — the primary circle in accent violet with
the X (amber) and Y (teal) axis circles breaking its edge. Use it as-is; never redraw it, never
invent a variant. `REQ-SHELL-034` requires a graceful degradation when it cannot be rendered: a
letter placeholder "R" in a dashed accent frame.

### 1.10 Motif

`.rt-grid-bg` (32 px line grid) and `.rt-dot-grid-bg` (32 px dot grid) appear behind hero sections
and empty states **only** — never under dense data. `.rt-fade-rule` is a rule that dissolves to
transparent over one grid unit at each end rather than stopping cleanly. `.rt-axis-mark` is the
three-stroke coordinate mark: a decorative device, never a stand-in for the logo.

### 1.11 Copy voice

Direct, technical, unadorned. Sentence case everywhere — titles, buttons, nav labels ("New session",
not "New Session") — with the section kicker as the only exception. Second person in product copy and
empty states; first person plural only in brand statements. Numbers exact and monospaced
(`612,480 tok`, never "600K+"). States named plainly (`running`, `waiting`, `done`, `failed`), never
euphemised. No filler: every panel earns its place.

Where the specification fixes a string — an accessible name, a tooltip sentence, an error message,
an empty-state body — the specification's wording wins over the voice guidance. The voice governs
copy the specification leaves to the implementation.

### 1.12 Two wiring notes carried over from the import

- The stylesheets and specimen cards reference `assets/logo.svg` and `assets/fonts/*` relative to
  `docs/design/system/`. In this repository the extracted binaries live in `docs/design/assets/`
  under content-hashed names. Those paths must be re-pointed when the system is wired into a build.
- `guidelines/colors-axis.html` prints slightly different chroma figures for the X and Y 500 stops
  than `tokens/colors.css` carries. **`tokens/colors.css` is authoritative**; the specimen card is
  illustrative.

---
