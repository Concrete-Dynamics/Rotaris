---
req-id: SWR-3700
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2093
title: "Themeable design-token layer"
epic: SWR-2000
date: 2026-08-20
---

# SWR-3700 — Themeable design-token layer

SWR-2093 established that one layer owns every colour, spacing and radius, and
that rule held: no Rotaris view hard-codes a hex. But the layer it created was a
flat module of constants naming one palette — Nocturne — and a constant is bound
at import. Half of Rotaris paints itself in `paintEvent` or assembles a
stylesheet in a class body, so those readings freeze whatever loaded first.
The consequence is not cosmetic: Rotaris cannot carry a second palette at all,
and adopting the Rotaris design system would mean overwriting the only one it
has.

The token layer shall therefore describe a *theme*, and the app shall read
tokens from whichever theme is active rather than from module state.

- Tokens are **semantic, not literal**. A widget asks for `color.text_secondary`,
  `space.md`, `radius.lg`, `type.scale.sm` — never for a hue, a hex or a
  pixel count with no name. A palette decides what each one is.
- Tokens are grouped as the design system groups them: colour, spacing, radii,
  sizing, typography, motion and elevation.
- A **theme** is one complete set of those groups plus its identity: a stable
  key, a label a user reads, and whether it is dark, so Qt's own palette can be
  set to match and the native surfaces Rotaris does not style — a file dialog, a
  context menu — do not arrive light inside a dark application.
- Themes are obtained from a **registry** keyed by name, and the active theme is
  reached through one accessor rather than by importing values.
- Adding a theme is **writing one palette**. It must require no change to any
  widget, view or stylesheet.
- The design system's ramps are nine steps addressed by the step number the
  source uses, so a palette and the stylesheet it was transcribed from can be
  compared line by line.

Rotaris ships three themes: **Rotaris Dim** (the design system, default),
**Nocturne** (the previous palette, preserved so the change is reversible and
so the abstraction is proven by a second real palette), and **High Contrast**
(a ground and text pushed apart for readers the AA floor does not serve).

## Acceptance criteria

- A `Theme` carries the complete token set; constructing one with a group
  missing is a type error, not a runtime surprise.
- `rotaris.theme.tokens()` returns the active theme's tokens, and returns the
  new ones immediately after the active theme changes.
- The registry lists every built-in theme by name, and resolves an unknown name
  to the default rather than raising — a stale persisted preference must not
  prevent the application from starting.
- Every built-in theme fills every token group; no theme falls back to another
  theme's value for anything.
- Every colour a theme paints text in clears 4.5:1 against that theme's own
  readable ground, and every interactive boundary clears 3:1.
- The three ramp steps the product reads as run, wait and done resolve to the
  theme's Y, X and Z axes respectively, so the coordinate system is a
  consequence of the palette rather than a convention repeated per view.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Every built-in theme is complete, its ramps are ordered light-to-dark, and its text and boundary colours clear the WCAG floors it declares | `Theme` and each palette's `build()` | `apps/rotaris/tests/test_theme_tokens.py` |
| Integration | The registry resolves known names, degrades an unknown name to the default, and `tokens()` reflects the active theme after a change | `rotaris.theme` registry and accessor | `apps/rotaris/tests/test_theme_registry.py` |
| User-flow E2E | A user running Rotaris sees the design system's ground, accent and type, and every primary view paints from the active theme rather than from import-time state | Real `MainWindow` across all seven views | `apps/rotaris/tests/test_theme_switching_flow.py` |

Derived from: [SWR-2093 — Design-system tokens and reusable UI primitives](SWR-2093-design-system-primitives.md)

Derived requirements: [SWR-3702 — Design-system component library](SWR-3702-design-system-components.md), [SWR-3703 — Brand typography ships with the application](SWR-3703-brand-typography.md), [SWR-3704 — Brand motif and elevation in Qt](SWR-3704-motif-and-elevation.md), [SWR-3705 — Colour tokens are authored in OKLCH](SWR-3705-oklch-colour-resolution.md), [SWR-3706 — Every surface reads tokens at paint time](SWR-3706-tokens-read-at-paint-time.md)

Related: [SWR-3701 — Choosing the Rotaris theme](SWR-3701-theme-selection.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
