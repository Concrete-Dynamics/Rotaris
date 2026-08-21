---
req-id: SWR-3105
status: approved
trace: required
test: required
title: "Source capabilities are declared and surfaced"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3105 — Source capabilities are declared and surfaced

Whether a requirement can be edited in Rotaris is a property of its source, not
of Rotaris. A user must be able to see that before trying, and the product must
not offer an action the source cannot honour.

Requirement: every source declares its capabilities — `read`, `create`,
`update`, `delete` — and the capability set is part of the data every consumer
receives with a requirement. Write paths (SWR-3111) consult the capability
before attempting the write; a source that cannot write yields a stated
read-only outcome that names the source and its artefact location.

## Acceptance criteria

- A requirement carries the capabilities of the source it came from.
- Attempting an unsupported write returns a refusal naming the source, and
  leaves the source untouched.
- Capabilities are declared by the adapter, never inferred from a failed write.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A read-only source reports `read` only, and `update()` refuses with the source name | Capability declaration + write guard | `tests/unit/requirements/test_source_capabilities.py` |
| Integration | The built-in ReqToCode source reports full capability and a declarative read-only source reports read only | Registry over two sources | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | `N/A — its product flow is the read-only notice in the detail view (SWR-3605)` | — | — |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
