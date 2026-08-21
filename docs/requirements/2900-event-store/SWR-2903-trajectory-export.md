---
req-id: SWR-2903
status: draft
trace: required
test: required
title: "Trajectory export for evaluation"
epic: SWR-2900
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-2903 — Trajectory export for evaluation

A stored session MUST be exportable as a self-contained **trajectory** — the artifact an
evaluation harness, a regression comparison or a bug report needs.

- The export is a single document per session containing the run's identity (session id,
  workspace, start/end, exit result), the ordered events, and a summary block (iteration
  count, tool calls, permission denials, verifier verdicts, token and cost totals) so a
  reader gets the shape of the run without parsing every line.
- It is **portable**: no absolute paths of the producing machine outside the recorded
  workspace root, no dependency on the session directory still existing, and no need for
  the agent SDK to parse it.
- Redaction is inherited, not re-implemented: what the schema masked stays masked, and an
  export must never contain a credential that the stream did not contain.
- Truncation is visible: if the store was capped (SWR-2901), the export says so rather
  than presenting a partial run as complete.
- Exporting is offered for a single session and for a set of sessions, so a batch of runs
  can be evaluated together.

## Acceptance criteria

- An exported trajectory of a run with tool calls, a permission denial and a verifier
  failure contains all three, and its summary counts match the event contents.
- The export of a truncated store is explicitly marked as truncated.
- A credential injected into a tool argument during the run appears nowhere in the export.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Summary counts derived from a synthetic event sequence; truncation flag; redaction preserved | Export function | `tests/unit/eventstore/test_export.py` |
| Integration | A real scripted run is exported and the document round-trips: every event it claims is present and the totals agree with the run's own metrics | Store + export over a real session | `tests/integration/test_event_store.py` |
| User-flow E2E | A user finishes a run and exports it as one file that another tool consumes without access to the original session directory | Public product boundary → user-observable result | `tests/integration/test_event_store.py` |

Epic: [Event Store, Replay & Trajectory Export](../2900-event-store.md)
