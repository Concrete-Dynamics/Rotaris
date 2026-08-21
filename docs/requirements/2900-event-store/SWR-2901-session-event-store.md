---
req-id: SWR-2901
status: draft
trace: required
test: required
title: "Durable per-session event store"
epic: SWR-2900
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-2901 — Durable per-session event store

Every event a run emits MUST be persisted per session, in emission order, so the run can be
examined after it ended.

- The store is append-only JSONL and follows the existing evidence convention rather than
  inventing a second one: it lives under the session directory next to
  `evidence/permissions.jsonl` and `evidence/tool-calls.jsonl`, is written through the
  same atomic-write primitive, and resolves its session the same way the audit log and the
  event bus already do (an explicit session id, falling back to the session directory
  name).
- Each line is one serialized event exactly as the wire schema produces it — same field
  names, same `schema_version`. A consumer that can read the stdout stream can read the
  store, and vice versa.
- Writing is **non-blocking for the run**: a store failure degrades to a logged warning
  and never propagates into the agent loop. Losing a stored event is acceptable; failing a
  run because of the store is not.
- Growth is bounded per session by a configurable cap, applied like the other evidence
  files (oldest lines dropped first). When lines are dropped, the store records that a
  truncation happened, so a reader can never mistake a truncated history for a complete
  one.
- The store is written for **every** run, not only for `--output-format stream-json`
  runs: an interactive Rotaris session and a headless CI run leave the same trace behind.

## Acceptance criteria

- After a run, the store contains the run's events in emission order, each parseable as
  one JSON object with the SWR-1829 envelope.
- A write error (read-only directory, full disk simulated) produces a warning and a
  completed run, not an exception surfacing to the caller.
- A session that exceeds the cap keeps the newest events and reports the truncation.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Append order, envelope preservation, truncation marking, failure isolation | Store writer | `tests/unit/eventstore/test_writer.py` |
| Integration | A scripted run leaves a store whose contents match the events the stream emitted | Store + event bus | `tests/integration/test_event_store.py` |
| User-flow E2E | Covered with SWR-2902: a user runs a task, the run ends, and the run's history is retrievable afterwards | Public product boundary → user-observable result | `tests/integration/test_event_store.py` (shared with SWR-2902) |

Epic: [Event Store, Replay & Trajectory Export](../2900-event-store.md)
