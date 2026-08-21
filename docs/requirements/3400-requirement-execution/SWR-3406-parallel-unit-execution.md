---
req-id: SWR-3406
status: approved
trace: required
test: required
title: "Independent units run in parallel"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3406 — Independent units run in parallel

The whole point of splitting a requirement into units with a dependency graph is
that the independent ones need not wait for each other. Rotaris already runs
several sessions concurrently (SWR-2415, SWR-2434); requirement execution
inherits that rather than serialising.

Requirement: units with no unmet dependency may execute concurrently, each in
its own session and worktree, up to the configured concurrency limit. A unit
whose dependency has not completed does not start. The board shows several
requirements and several units running at once, each with its own workspace.

## Acceptance criteria

- Two independent units of one requirement run at the same time.
- A dependent unit does not start before its dependency completes.
- Reaching the concurrency limit queues rather than rejects.
- A failing unit does not cancel its independent siblings.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Readiness computation over the dependency graph, queueing at the limit, and sibling isolation on failure | The unit scheduler | `tests/unit/requirements/test_unit_scheduling.py` |
| Integration | Two independent units run concurrently on separate worktrees and both complete | Scheduler + run coordination | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | A user watches two units of one requirement progress at the same time | Public product boundary → user-observable result | `tests/integration/test_requirement_execution.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
