---
req-id: SWR-2814
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2812
title: "Model picker availability rendering"
epic: SWR-2000
date: 2026-08-08
---

# SWR-2814 — Model picker availability rendering

SWR-2812 requires an unusable model to remain visible, remain unchoosable, and explain
itself at the point of choice. In Rotaris that point of choice is a combo box, and there
are five of them: the active run model, the composer's model for the next prompt, the
agent inspector's model, the startup model slots, and the per-persona model column. All
five read the same catalog, so the rendering belongs in one shared control rather than in
five hand-rolled copies.

SWR-2124 established that a disabled Qt control cannot be relied upon to deliver its own
explanation, because a disabled widget may not receive pointer events. That constraint
does not apply here in the same way: the picker itself stays enabled and only the
individual entries are made unchoosable, which is the arrangement the slash command
suggestion popup already uses to keep unavailable commands listed with their reason.

The product MUST therefore:

- Carry per-model availability into the desktop state layer, so a view never has to
  re-derive it or ask the backend directly.
- Report the catalog of *selectable* model names separately from the full list that
  includes unselectable entries, so first-run checks, run pre-flight validation, and
  command argument validation keep treating an unusable model as one the user does not
  have.
- Render an unselectable entry through a single shared control that marks it with an
  icon, a distinct disabled foreground, a textual marker independent of icon and colour,
  a tooltip, and an accessible description carrying the reason.
- Prevent selection of such an entry by pointer and by keyboard.
- Keep showing the reason when the currently configured model is itself unselectable,
  including on the closed control, rather than rendering an empty or silently substituted
  selection.
- Rebuild a picker without emitting a selection change that would overwrite the user's
  stored configuration.
- Answer a command that names an unselectable model with that model's reason, and keep
  the model listed.

## Acceptance criteria

- The shared control marks an unselectable entry with an icon, disabled foreground, text
  marker, tooltip, and accessible description, and clears its enabled and selectable item
  flags.
- All five model pickers use the shared control.
- A configured model that has become unselectable stays displayed as the current
  selection, with its reason available from the closed control.
- Rebuilding a picker does not emit a selection change for the value it already showed.
- The selectable-name projection excludes unselectable models.

Derived from: [SWR-2812 — A model the provider will not accept must stay visible, must not be selectable, and must state why](../800-model-registry.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
