---
req-id: SWR-3101
status: approved
trace: required
test: required
title: "Canonical requirement model"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3101 — Canonical requirement model

Rotaris must be able to work with requirements from projects that organise them
differently — Markdown files, YAML/JSON specifications, Gherkin, GitHub issues,
an external tracker, or a house format. Today the only requirement shape Rotaris
knows is this repository's ReqToCode store, read through
`rotaris_core.reqtocode.generator.parse_requirements` into a `ReqMeta` tuned for
trace enforcement, not for delivery.

Requirement: a canonical, source-independent requirement value object carries at
least id, title, description, lifecycle (`draft` / `approved` / `deprecated`),
type (`product` / `technical`), source id, source path, source revision,
`current_hash`, parent, children, relations, trace obligation and test
obligation. Everything downstream — board, execution, verification, change
propagation — reads this model and never the originating file format.

The model is a read projection of the customer's source: it is rebuilt from the
source on every read and carries no state that only Rotaris knows. Operational
state (delivery state, satisfied hash, run history) is layered on top by
SWR-3205 and is never mixed into the canonical requirement.

## Acceptance criteria

- Two different sources producing the same logical requirement yield equal
  canonical requirements apart from `source` / `source_path` / `source_revision`.
- A requirement whose source declares no lifecycle defaults to `draft`, and the
  default is visible in the model rather than implied by a missing field.
- The model is immutable and hashable; mutating a requirement means re-reading
  the source.
- No delivery or execution field exists on the model — asserted, not assumed.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A ReqToCode requirement and a synthetic YAML requirement normalise into equal canonical requirements | The canonical model + normalisation | `tests/unit/requirements/test_model.py` |
| Integration | The real `docs/requirements/` store loads into canonical requirements with stable ids and hashes | Model over the real store | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | `N/A — value object; its product flow is the board that renders it (SWR-3302)` | — | — |

Derived requirements: [SWR-3116 — Requirement index refresh is incremental and off the UI thread](SWR-3116-requirement-index-refresh.md)

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
