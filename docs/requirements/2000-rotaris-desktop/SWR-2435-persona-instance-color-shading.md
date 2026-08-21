---
req-id: SWR-2435
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2421
title: "Per-instance shade variation for persona transcript labels"
epic: SWR-2000
date: 2026-08-03
---

# SWR-2435 — Per-instance shade variation for persona transcript labels

SWR-2421 gives each persona *type* a fixed, stable label color, but when
multiple agents of the same persona run concurrently (e.g. `coding-agent-1`
and `coding-agent-2`), they render in the exact same hex color in the "All
Activity" transcript, making concurrent instances of one persona
indistinguishable from each other.

Each agent *instance* shall receive a deterministic, distinct shade of its
persona's base hue, so instances stay visually distinguishable while
remaining clearly identifiable as the same persona type at a glance.

The feature comprises:

- **`theme.py`** — a `persona_instance_color(persona: str, instance: str) -> str`
  function. It resolves the persona's base color via `persona_color()`, then
  selects one of a fixed set of lightness/saturation deltas (applied in HLS
  color space). A trailing instance number selects its bucket directly, so
  neighbouring instance numbers never collide; other instance keys fall back to
  a hash of `f"{persona}:{instance}"`. One delta bucket is the identity (no
  change), so some instances land exactly on the base persona color.
- **A readability floor** — the deltas only ever climb towards white, and the
  resolved lightness is clamped up to the lowest value that still clears
  `theme.MIN_TEXT_CONTRAST` against `theme.READABLE_TEXT_GROUND`. Rotaris is a
  dark theme: shading a mid-tone persona hue *downwards* drops the label below
  4.5:1, which is how instance shades previously reached 2.1:1.
- **`_role_color()` update** — the transcript delegate's role-colour function
  now resolves persona-driven colors via `theme.persona_instance_color(persona, role)`
  instead of `theme.persona_color(persona)`, using the event's `role` (the
  agent instance id, e.g. `"coding-agent-1"`) as the instance key.
- **`_delegation_context_html()` update** — the delegation-context header's
  persona label color uses the same `persona_instance_color()` call, keyed by
  the child agent's id, so it matches the color of that agent's own transcript
  rows.

## Acceptance criteria

- The same `(persona, instance)` pair always resolves to the same color
  (stable across calls and app launches).
- Different instances of the same persona (e.g. `coding-agent-1` vs
  `coding-agent-2`) resolve to visibly different colors in the common case.
- Instance shading only adjusts lightness/saturation — the resolved color's
  hue stays in the same family as the persona's base color.
- Every persona base color and every instance shade clears 4.5:1 against every
  ground Rotaris paints transcript text on; instance shades of one persona
  never resolve to the same color as each other.
- An empty `instance`, or an `instance` equal to the `persona` name, returns
  the exact base `persona_color()` value (backward compatibility with
  single-instance personas and the four hard-coded role keys, which bypass
  instance shading entirely).
- `agent_window.py`'s single-agent header keeps using plain `persona_color()`
  (type-only), unaffected by this change.
- All color math is defined in `theme.py`; no hex values or HLS math are
  hard-coded in views or widgets.

Derived from: [SWR-2421 — Persona-colored agent transcript labels](SWR-2421-persona-colored-transcript-labels.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
