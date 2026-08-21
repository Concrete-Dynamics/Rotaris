---
req-id: SWR-2904
status: draft
trace: required
test: required
title: "CLI surface for replay and export"
epic: SWR-2900
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-2904 — CLI surface for replay and export

The store (SWR-2901), its query API (SWR-2902) and the trajectory export (SWR-2903) are
reachable only from Python. The precedent in this codebase is clear: `checkpoints list` /
`restore` (SWR-2437) made session rollback usable without any UI work, and
`improvements list` / `show` / `rollback` (SWR-1642) followed it.

Requirement: an `events` command group over the stored sessions.

- `list` — the sessions that have a store, newest first: session id, event count, time
  span, and whether the store was truncated.
- `replay <session>` — the session's events in order, filterable by `--type` (repeatable),
  `--iteration` (repeatable), `--since` / `--until`; `--json` emits one JSON object per
  line so the output is pipeable into the same tooling that consumes the live stream.
- `export <session>` — writes the trajectory document; `--output` names the file, absent
  it goes to stdout. Accepts several sessions for a batch.
- All three take `--workspace` and default to the current directory, matching the
  `checkpoints` and `improvements` groups.
- An unknown event type in the store is displayed, not dropped or fatal — the CLI inherits
  SWR-2902's forward compatibility rather than re-deciding it.

## Acceptance criteria

- `replay --type` output is identical to what the live stream produced for those events,
  so a stored run and a live run are interchangeable inputs to a consumer.
- Exporting a truncated store says so on stderr and still exits 0.
- An unknown session id exits non-zero with a message naming the workspace it looked in.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Argument parsing, filter composition, exit codes for unknown session and empty result | Command callbacks | `tests/unit/eventstore/test_events_cli.py` |
| Integration | A real run is stored, then `list` → `replay --json` → `export` reproduce its events and totals | CLI over the real store | `tests/integration/test_event_store.py` |
| User-flow E2E | A user finishes a run and, from the CLI alone, replays what happened and exports it for evaluation | Public product boundary → user-observable result | `tests/integration/test_event_store.py` |

Epic: [Event Store, Replay & Trajectory Export](../2900-event-store.md)
