---
req-id: SWR-3205
status: approved
trace: required
test: required
title: "Delivery metadata store"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3205 — Delivery metadata store

Delivery state, satisfied hashes, evidence snapshots and execution history have
to survive restarts, be safe to write while runs are in flight, and never
corrupt a workspace whose Rotaris version changed. The session store already
solved this problem for sessions; requirements need the same guarantees.

Requirement: operational requirement data is persisted under
`<workspace>/.rotaris/requirements/`, keyed by requirement id, written
atomically, and carrying a schema version. Records for ids the sources no longer
declare are retained (SWR-3113). An unreadable or future-versioned record
degrades that one requirement to defaults with a stated notice; it never fails
the load of the rest.

## Acceptance criteria

- Writes are atomic: an interrupted write leaves the previous record intact.
- Concurrent writes from parallel runs do not lose updates.
- A record written by a newer schema version is reported, not silently
  reinterpreted.
- Adding a field keeps older records loadable with defaults.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Atomic replace, schema-version handling, unknown-field tolerance, and per-record isolation of a corrupt file | The store | `tests/unit/requirements/test_delivery_store.py` |
| Integration | Two concurrent run completions write two requirements' records without loss | Store under parallel writers | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | A user restarts Rotaris and the board shows the same states, hashes and history | Public product boundary → user-observable result | `tests/integration/test_requirement_delivery.py` |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
