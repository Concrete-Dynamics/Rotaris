---
req-id: SWR-3402
status: approved
trace: required
test: required
title: "Every run works against a requirement snapshot"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3402 — Every run works against a requirement snapshot

A requirement can be edited while an agent is implementing it. If the run
reported against whatever the requirement says at the moment it finishes, it
would claim to have delivered text it never saw.

Requirement: starting a run for an execution unit captures a snapshot —
requirement id, requirement hash, source revision, base commit, execution unit
id and session id — and the run works against that snapshot for its whole
lifetime. The snapshot is what the agent context is built from (SWR-3407), what
the completion is judged against, and what becomes the `satisfied_hash`
(SWR-3204) if the result is accepted.

## Acceptance criteria

- A requirement edited mid-run does not change the running run's context.
- The snapshot is persisted before the agent starts, and survives a crash.
- Every run in the execution history names the snapshot it ran against.
- A run cannot start without a resolvable base commit.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Snapshot capture, persistence before start, and immutability under a mid-run source change | The snapshot record | `tests/unit/requirements/test_run_snapshot.py` |
| Integration | A scripted run whose requirement file is edited mid-flight keeps its original snapshot | Snapshot + run lifecycle | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | `N/A — its user-visible half is SWR-3403's review flag` | — | — |

Epic: [Requirement Execution](../3400-requirement-execution.md)
