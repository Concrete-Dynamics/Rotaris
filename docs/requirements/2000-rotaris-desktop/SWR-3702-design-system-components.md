---
req-id: SWR-3702
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3700
title: "Design-system component library"
epic: SWR-2000
date: 2026-08-20
---

# SWR-3702 — Design-system component library

The design system names an inventory of components and specifies each one's
anatomy, variants and states. Rotaris already ships about half of them under
`widgets/`, built ad hoc as views needed them: a `Tag` that computes its
stylesheet in a class body, a `Card` whose padding is three literals, a
`SegmentedControl` that exists but is not the design system's. The other half —
tooltip, toast, spinner, tabs, command palette, log panel, page header — is
re-assembled by hand wherever a view happens to need it.

Rotaris shall carry the design system's inventory as one reusable library, and
every component in it shall take its presentation from the active theme.

The inventory, grouped as the design system groups it:

| Group | Components |
| --- | --- |
| Core | `Button`, `Tag`, `StatusDot`, `ToggleSwitch`, `SegmentedControl`, `Kbd` |
| Forms | `Input`, `Select` |
| Surfaces | `Card`, `KpiCard`, `SectionLabel` |
| Data | `Sparkline`, `MeterBar`, `ContextRing`, `Table` |
| Feedback | `Dialog`, `Tooltip`, `Toast`, `Spinner` |
| Navigation | `Tabs`, `NavRail`, `CommandPalette` |
| Patterns | `TableCard`, `PageHeader`, `EmptyState`, `LogPanel`, `ConfirmDialog` |

Patterns are compositions of the primitives above them, not new inventory: the
card-with-flush-table, the title row a view opens with, the dot-grid empty
state, the monospace run log, and the destructive confirm.

- A component resolves **no literal presentation value**. Colour, spacing,
  radius, size and type come from the active theme, read when the component
  paints or restyles, never captured at import or in a class body.
- A component **restyles itself when the theme changes**, including components
  that paint themselves rather than carrying a stylesheet.
- Variants and states are **declared, not duplicated**: one `Button` with
  variants, not six button constructors.
- Components carry the app's own accessibility contract — an accessible name on
  every icon-only or custom control, state conveyed by more than colour, and a
  visible focus indicator.
- Existing primitives are **moved into the library rather than duplicated
  beside it**. A view that imported `widgets.cards.Card` keeps working; there is
  never a second `Card`.

## Acceptance criteria

- Every component in the inventory exists, is constructible without a running
  backend, and is exported from one package.
- No component module resolves a colour, radius, spacing or font size that did
  not come from the active theme.
- Each component with variants renders every variant it declares, and each
  component with states renders every state it declares.
- After a theme change, every component instance reports the new theme's
  values — including self-painting ones.
- Every interactive component exposes an accessible name, and no component
  conveys state by colour alone.
- The pre-existing import paths under `widgets/` continue to resolve to the
  library's components.

## Test coverage

Unit tests construct each component directly and assert its variants, states,
accessible names and token resolution. A parametrised sweep over the whole
inventory asserts that no component holds a literal presentation value and that
every instance follows a theme change. Integration coverage comes from the views
that compose them, and from the accessibility sweep, which walks the live widget
tree of all seven primary views.

Derived from: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
