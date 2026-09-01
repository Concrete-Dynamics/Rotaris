# Rotaris Design System

The brand and UI language for Rotaris — one Electron desktop application for agentic
software development. It covers the visual foundations (colour, type, spacing, radii,
elevation, motion), the component inventory and the copy voice, and it is authoritative
for how this product looks and behaves.

## Scope of this import

This directory carries the **design language** only. Which screens exist, what is on
them and how they are organised is **not** defined here: the primary views and their
order are fixed by `REQ-SHELL-023` in `docs/spec/12-desktop-shell-windows.md`, and the
specification is the single source of truth for information architecture. Where a
component could have carried a screen inventory (the nav rail), the inventory has been
removed and the component takes its items from the caller.

Two wiring notes for whoever consumes this:

- The stylesheets and specimen cards reference `assets/logo.svg` and
  `assets/fonts/*` relative to this directory, following the design system's own
  layout. In this repository the extracted binaries currently live in
  `docs/design/assets/` under content-hashed names, so those paths need to be
  re-pointed when the system is wired into a build.
- `guidelines/motion-tokens.html` documents 100 / 180 / 260 ms and a 4px shift, while
  `tokens/effects.css` ships 90 / 160 / 240 ms and a 3px shift. The two disagree in
  the source material; both are reproduced verbatim and the discrepancy needs a
  decision before implementation.

## Fonts — self-hosted

- **Space Grotesk** (display/headings) — a geometric-but-warm face with a quietly
  mathematical character (square dots, a distinctive lowercase g)
- **Manrope** (body/UI) — humanist, rounded terminals, comfortable at length
- **JetBrains Mono** (data, code, every number and path)

All three are **self-hosted as variable fonts** (OFL-licensed, pulled from their
official upstream repos) and declared via `@font-face` in `tokens/typography.css` — no
Google Fonts network dependency, so consuming projects and exports render identically
offline.

## Logo

The mark at `assets/logo.svg` is **final** — the primary circle traced in accent violet
with the X (amber) and Y (teal) axis circles breaking its edge. Used in the wordmark
card, app title bar and thumbnail. Use it as-is; never redraw or invent a variant.

## Content fundamentals

- **Voice**: direct, technical, unadorned. Sentences state what the system does
  ("Rotaris gives multi-agent development the interface it deserves") rather than
  selling ("supercharge your workflow!"). No emoji anywhere in product or brand copy —
  every status is icon plus text, never emoji.
- **Person**: second person in product copy and empty states ("Select an agent to
  inspect its context"); first person plural only in brand-level statements.
- **Casing**: sentence case everywhere — titles, buttons, nav labels ("New session",
  not "New Session"). Section kickers are the one exception: uppercase,
  letter-spaced, small (`.card-kicker` / `h6`).
- **Precision over hype**: numbers are exact and monospaced (`612,480 tok`, not
  "600K+"); states are named plainly (`running`, `waiting`, `done`, `failed`), never
  euphemized.
- **No filler**: every panel earns its place — don't add sections the product doesn't
  have.

## Visual foundations

- **Color**: a true neutral dark gray ground (`--rt-bg`, OKLCH chroma 0 — no hue tint,
  never blue-violet, never sepia/brown, never pure black) with a violet brand accent
  (OKLCH hue 292). See `guidelines/colors-*.html`.
- **The coordinate system (the brand's flourish)**: three axis colors — X (amber),
  Y (teal), Z (violet/accent) — read literally as the product's own agent states:
  **waiting, running, done**. This is mathematical flair made functional rather than
  decorative: the same triad shows up as status dots, tags, chart lines and the small
  abstract axis mark in `guidelines/axis-mark.html`. Failure (red) and info (cyan) sit
  outside the three-axis system deliberately — they're exceptions, not coordinates.
- **Grids**: a faint 32px line grid and dot grid (`.rt-grid-bg` / `.rt-dot-grid-bg`)
  appear behind hero sections and empty states only — never under dense data. The same
  32px unit is the fade-length of every divider (`.rt-fade-rule`, a rule that dissolves
  at both ends rather than stopping cleanly — it reads as precise without being loud).
- **Type**: see Fonts above. The system has **three weights and only three** — 400
  body, 500 for headings/labels/controls, 300 for large mono numbers. Nothing goes
  above 500; hierarchy is size, colour and space, never weight.
- **Spacing**: an 8px module (`--rt-space-*`) — the same module the grid motif is drawn
  on, so "grids" isn't just a background pattern but the actual layout discipline. See
  `guidelines/spacing-in-use.html`.
- **Radii**: 5 / 8 / 14px — tight enough to read as precise software, soft enough to
  stay comfortable. Every surface uses one of the three; no one-off values.
- **Shadows/elevation**: flat by default. A 1px hairline defines an edge; a shadow only
  ever means "this floats" (dialogs, popovers, toasts, palette). Neutral ambient only —
  no glow, no colored shadows, and **no inset highlights, bevels or gradient fills**
  anywhere in the system.
- **Backgrounds**: flat token colors and the grid motif only. No photography, no
  gradients-as-decoration, no hand-drawn illustration — this is a technical tool.
- **Animation**: sparse and purposeful. No animation in conversation content —
  animation belongs to status indicators only. `.status-dot.is-pulsing` (1.6s opacity
  breathe) is the one recurring motion, used only while a state is actively running.
- **Hover/press**: hover tints toward the accent or a neutral wash (`color-mix` at
  7–14%); pressed states go one ramp step darker. No scale/shrink effects anywhere.
- **Borders**: 1px hairlines throughout, and they whisper — `--rt-border` sits close in
  value to the surface it bounds, and row separators / internal rules use the fainter
  `--rt-divider`. Selection and active states are a **tint plus accent ink**, never an
  outlined box or a filled block. A 2px `--rt-focus` ring is the only focus treatment
  (never a color-only focus cue).
- **Transparency/blur**: `color-mix()` tints for hover/tint states only; no
  backdrop-blur anywhere — no glass effects in this system.
- **Cards**: flat surface fill, 1px border, 8px radius, no drop shadow and no inner
  highlight at rest (shadows are reserved for floating/overlay elements — dialogs,
  popovers).
- **Controls**: one filled variant only — the primary button. Everything else is a
  hairline or bare text, so a dense screen has exactly one accent surface.

## Iconography

**Phosphor icons** (regular + fill weights), loaded from
`unpkg.com/@phosphor-icons/web`. No emoji, no unicode-symbol icons, no PNGs. Icon
colour always carries meaning: neutral by default, coloured only for the semantics
listed in `guidelines/icon-colors.html`, one coloured icon per row at most. See
`guidelines/iconography.html`.

## Components

- **Core** — `Button`, `Tag`, `StatusDot`, `ToggleSwitch`, `SegmentedControl`, `Kbd`
- **Forms** — `Input`, `Select`
- **Surfaces** — `Card`, `KpiCard`, `SectionLabel`
- **Data** — `Sparkline`, `MeterBar`, `ContextRing`, `Table`
- **Feedback** — `Dialog`, `Tooltip`, `Toast`, `Spinner`
- **Navigation** — `Tabs`, `NavRail`, `CommandPalette`
- **Patterns** — `TableCard`, `PageHeader`, `EmptyState`, `LogPanel`, `ConfirmDialog`

**Patterns** are compositions of the primitives above, not new inventory: the
card-with-flush-table used by delegation trees and commit lists, the title row every
view opens with, the dot-grid empty state, the monospace run log, and the
destructive-action gate — packaged as ready-to-use examples so consumers don't
re-derive the recurring assemblies.

## Index

```
styles.css                      the one entry point — imports everything below
tokens/colors.css               ground, accent ramp, the X/Y/Z axis ramps, semantics, diff colors
tokens/typography.css           @font-face (self-hosted), fonts, sizes, tracking
tokens/spacing.css              8px module + grid unit
tokens/effects.css              radii, shadows, motion
base.css                        resets, headings, links, focus, scrollbars
components.css                  every component class (.btn, .card, .tag, .input …)
motif.css                       the grid backgrounds, fade rule, axis-mark
guidelines/                     20 foundation specimen cards (Colors, Type, Spacing, Brand, Motion)
components/core|forms|surfaces|data|feedback|navigation|patterns/
                                27 React components (22 primitives + 5 composed
                                patterns), each with .jsx + .d.ts + .prompt.md
```
