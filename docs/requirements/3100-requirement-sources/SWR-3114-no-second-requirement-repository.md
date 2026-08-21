---
req-id: SWR-3114
status: approved
trace: required
test: required
title: "Rotaris keeps no second requirement repository"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3114 — Rotaris keeps no second requirement repository

The product's promise is that requirements stay where the team keeps them. A
cache that quietly becomes authoritative would turn Rotaris into a competing
requirement store, and the first divergence would make both untrustworthy.

Requirement: Rotaris persists no requirement *content* — no title, description,
acceptance criteria or lifecycle — as its own truth. What it persists is
operational: delivery state, satisfied hash, run history, evidence snapshots and
audit records, each keyed by requirement id and hash. Requirement text shown
anywhere in the product is read from the source; a cache is permitted only as a
revision-keyed read-through that is discarded when `revision()` changes.

## Acceptance criteria

- Nothing under `<workspace>/.rotaris/requirements/` contains requirement prose.
- With the source removed, the product reports the requirement as unavailable
  rather than serving stale text.
- A source revision change invalidates any cached read.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The persisted delivery record contains ids and hashes only; a revision change drops the cache | The delivery store schema + cache | `tests/unit/requirements/test_no_second_store.py` |
| Integration | Deleting the requirement source makes the board report unavailable requirements instead of rendering cached text | Registry + delivery store | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | `N/A — architectural invariant, asserted at the persistence boundary` | — | — |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
