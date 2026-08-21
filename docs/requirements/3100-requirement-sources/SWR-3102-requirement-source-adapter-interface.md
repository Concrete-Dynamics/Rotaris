---
req-id: SWR-3102
status: approved
trace: required
test: required
title: "Requirement source adapter interface"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3102 — Requirement source adapter interface

Requirement sources differ in what they can do: a Markdown store can be written,
a legacy specification export can only be read, an issue tracker can be written
but not reordered. Rotaris must not encode any one of those assumptions into the
code that consumes requirements.

Requirement: a requirement source is reached through an adapter interface with
the mandatory operations `discover()` (which requirement artefacts exist),
`read()` (canonical requirements, SWR-3101) and `revision()` (an opaque token
that changes exactly when the source content changes), plus the optional
`create()`, `update()` and `delete()`. An adapter declares which optional
operations it implements (SWR-3105); calling an undeclared operation raises
rather than silently degrading.

## Acceptance criteria

- A read-only adapter that implements only the three mandatory operations is a
  valid adapter and drives the board end to end.
- `revision()` is stable across repeated reads of unchanged content and differs
  after any content change.
- An adapter error (unreadable file, unreachable tracker) surfaces as a named
  source error and never as an empty requirement set.
- Registering an adapter requires no edit to consuming code.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A fake read-only adapter satisfies the interface; calling `update()` on it raises `UnsupportedOperation` | The adapter protocol | `tests/unit/requirements/test_source_protocol.py` |
| Integration | Two adapters registered at once are both discovered and read through the same registry | Registry + adapters | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | `N/A — seam; its product flow is SWR-3103's built-in source` | — | — |

Derived requirements: [SWR-3117 — Requirements configuration block](SWR-3117-requirements-configuration-block.md)

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
