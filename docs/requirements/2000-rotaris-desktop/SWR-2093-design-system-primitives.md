---
req-id: SWR-2093
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2000
title: "Nocturne design-system tokens and reusable UI primitives"
epic: SWR-2000
date: 2026-07-20
---

# SWR-2093 — Nocturne design-system tokens and reusable UI primitives

Every Rotaris view and widget MUST draw its colors, spacing, radii, and shared
surface/indicator components from one design-system layer rather than
hard-coding presentation. This layer exists so the six primary views
(SWR-2000/SWR-2002) render as one consistent, accessible surface and so
contrast/focus requirements (SWR-2032) are met from a single source of truth.

The layer comprises:

- **`rotaris.theme`** — the design tokens (color ramps, borders, focus, spacing,
  radii) translated to Qt. It is the sole source of truth for every hex,
  spacing, and radius; no view or widget may hard-code these values. The layer
  originally named one palette, Nocturne, in a flat module of constants;
  SWR-3700 made it theme-scoped and moved the shipped palette to the Rotaris
  design system, keeping Nocturne as a selectable theme. The rule this
  requirement states is unchanged by that move — only the number of palettes it
  can express.
- **`widgets/cards.py`** — surface primitives: `Card`, `SectionLabel`, `Tag`,
  `KpiCard`, styled buttons, and artifact links used to compose every view.
- **`widgets/meters.py`** — painted indicator primitives: `Sparkline`,
  `ContextBar`, `ContextRing`, `ProgressBarThin`, `SegmentedControl`,
  `StatusDot`, `ToggleSwitch` — the shared vocabulary for showing context use,
  progress, status, and toggles across views.

These primitives carry no product behavior of their own; they are the
presentation substrate the product-facing view requirements build on.

## Acceptance criteria

- All Rotaris colors, spacing, and radii resolve through `theme.py`; no view or
  widget hard-codes a hex value.
- Surface primitives (`Card`, `SectionLabel`, `Tag`, `KpiCard`, buttons) render
  consistently wherever they are reused across the six views.
- Painted indicator primitives render context use, progress, status, and toggle
  state and are reused rather than re-implemented per view.

Derived from: [SWR-2000 — Rotaris Desktop](../2000-rotaris-desktop.md)

Derived requirements: [SWR-2124 — Interactive control availability feedback](SWR-2124-interactive-control-availability-feedback.md), [SWR-2421 — Persona-colored agent transcript labels](SWR-2421-persona-colored-transcript-labels.md), [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
