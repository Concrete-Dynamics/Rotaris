---
req-id: SWR-2124
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2093
title: "Interactive control availability feedback"
epic: SWR-2000
date: 2026-07-22
---

# SWR-2124 — Interactive control availability feedback

Rotaris interactive controls MUST make enabled, disabled, focused, selected,
and busy states visually distinct. An unavailable action with a contextual
reason MUST expose that reason through an enabled, keyboard-reachable help
control beside its action group; disabled-control tooltips alone are not
sufficient because disabled Qt controls may not receive pointer events.

## Acceptance criteria

- Shared theme rules visibly differentiate disabled buttons, icon buttons,
  combos, text inputs, segmented controls, and toggles from enabled controls.
- Shared availability helpers synchronize disabled reason text with accessible
  descriptions and an optional enabled help control.
- Workspace run controls and Mission pause expose lifecycle/scope reasons via
  the shared helper.

Derived from: [SWR-2093 — Nocturne design-system primitives](SWR-2093-design-system-primitives.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)

Derived requirements: [SWR-2814 — Model picker availability rendering](SWR-2814-model-picker-availability.md)
