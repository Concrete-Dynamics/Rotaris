---
req-id: SWR-2421
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2093
title: "Persona-colored agent transcript labels"
epic: SWR-2000
date: 2026-07-28
---

# SWR-2421 — Persona-colored agent transcript labels

Each distinct agent persona type in the Rotaris transcript shall have a unique,
stable label color so that users can visually distinguish agent messages by
persona at a glance. The current behaviour — all non-orchestrator agents share
the same green (`theme.RUN`) label — makes it impossible to tell coding agents
from testers from librarians without reading the label text.

The feature comprises:

- **`theme.py`** — a `persona_color(name: str) -> str` function and a
  `PERSONA_COLORS` ramp. Known personas (orchestrator, architect, backend-dev,
  tester, docs-writer, refactorer, librarian, oracle, planner, coding-agent,
  intent-classifier, codebase-analyst, verifier) receive fixed stable
  assignments; unrecognised persona names receive a deterministic hash-based
  colour from the ramp so custom personas still render distinctly without manual
  mapping.
- **`TranscriptEvent.persona` field** — a new `persona: str = ""` field on the
  dataclass, populated from the session-projection pipeline (child agent
  persona metadata) and the demo-data factory. Empty string preserves existing
  behaviour for events produced before this change.
- **`_role_color()` update** — the delegate's role-colour function accepts an
  optional `persona` parameter. When the `role` is not one of the four
  hard-coded keys (`you`, `intent`, `system`, `orchestrator`) and a non-empty
  `persona` is provided, the colour is resolved through `theme.persona_color()`
  rather than falling through to `theme.RUN`.

## Acceptance criteria

- Each known persona has a fixed, documented colour assignment distinct from the
  green default and from each other.
- Custom/unknown persona names receive a deterministic hash-based colour that
  does not change between app launches.
- The transcript delegate paints the role label in the persona-specific colour
  when `TranscriptEvent.persona` is present.
- Events with an empty `persona` field render with the existing `theme.RUN`
  fallback (backward compatibility).
- All colours are defined in `theme.py`; no hex values are hard-coded in views
  or widgets.
- `sample_store()` demo data carries persona annotations on every agent
  transcript event.

Derived from: [SWR-2093 — Nocturne design-system tokens](SWR-2093-design-system-primitives.md)

Derived requirements: [SWR-2435 — Per-instance shade variation for persona transcript labels](SWR-2435-persona-instance-color-shading.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
