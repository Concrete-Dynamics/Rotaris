---
req-id: SWR-2902
status: draft
trace: required
test: required
title: "Query and replay API"
epic: SWR-2900
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-2902 — Query and replay API

A stored session MUST be readable back without re-running anything.

- Events are readable in emission order for a given session, and filterable by event type,
  by iteration, and by time window. Filters compose; an empty result is a normal answer,
  not an error.
- Reading is **streaming**, not "load the file into memory": a long session must be
  traversable without materializing the whole history.
- **Forward compatibility is mandatory.** A stored line whose `event` discriminator is
  unknown to the running build MUST be returned as an opaque record — never dropped
  silently, never raised as an exception. A store written by a newer build has to stay
  readable by an older one, and the P1 features whose event types arrive incrementally
  (SWR-1831) must not brick a reader written before them. Strict model reconstruction
  stays available as an explicit opt-in for callers that want it.
- A corrupt or truncated final line (a run killed mid-write) is skipped with a warning and
  does not prevent the rest of the session from being read.
- Reading is read-only: it never rewrites, compacts or repairs the store as a side effect
  of being read.

## Acceptance criteria

- A file containing an unknown `event` value is read successfully; the unknown record is
  returned with its raw payload intact and is distinguishable from a known one.
- A file whose last line is a partial JSON fragment yields every preceding event plus a
  warning.
- Filtering by type and iteration returns exactly the matching events in original order.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Order preservation, composed filters, unknown-type passthrough, truncated-tail tolerance, streaming (no full read) | Reader and query functions | `tests/unit/eventstore/test_reader.py`, `tests/unit/eventstore/test_query.py` |
| Integration | A store produced by a real scripted run is replayed and yields the same event sequence the run emitted | Store round-trip | `tests/integration/test_event_store.py` |
| User-flow E2E | A user completes a run and afterwards retrieves that run's history — tool calls, permission decisions, verifier results — from the store alone | Public product boundary → user-observable result | `tests/integration/test_event_store.py` |

Epic: [Event Store, Replay & Trajectory Export](../2900-event-store.md)
