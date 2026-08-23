---
req-id: SWR-177
status: approved
trace: required
test: required
title: "Atomic parent-scoped child launch"
epic: SWR-100
date: 2026-08-23
---

# SWR-177 — Atomic parent-scoped child launch

When an agent delegates multiple children, each direct child shall be claimed
and launched exactly once, even when parent and nested drain paths execute
concurrently. A launch claim belongs to the child's declared parent, reserves
runtime and model capacity atomically, and remains distinguishable from a
conversation that is already running.

A duplicate or stale launch attempt shall leave the active launch intact and
emit diagnostic evidence. Agent-construction failures shall terminate only the
affected child and remain consumable by its parent as a first-class child
result. Run shutdown and continuation shall settle interrupted launch claims so
persisted sessions never advertise abandoned launch work as live.

## Acceptance criteria

1. Readiness resolution and launch claiming occur atomically under the child
   manager's synchronization boundary.
2. A drain may claim only records whose `parent_agent_id` identifies the drain's
   current parent; nested drains cannot launch siblings owned by another parent.
3. Claimed children enter `starting`; model concurrency counts `starting` and
   `running` children, and successful construction advances `starting` to
   `running`.
4. Concurrent claim attempts return each child to at most one launcher. A stale
   claim is suppressed with task, parent, and claim identity in diagnostics.
5. Agent-construction failure advances `starting` to `failed`, preserves a child
   report, and allows the parent and unrelated children to continue.
6. Cancellation, run finalization, and session continuation settle `starting`
   records consistently with the existing terminal-record recovery contract.
7. Parent resume, wait, dependency, and background-notification behavior remains
   scoped to direct children.
8. The three-background-agent scenario with overlapping construction and nested
   drains completes without an invalid state transition and emits one start per
   child.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | An orchestrator launches several children while another drain inspects the same manager; each child receives one parent-scoped claim and model capacity remains bounded. | `ChildManager` claim lifecycle, ownership filtering, model-slot accounting, stale-claim handling | `tests/unit/test_child_manager.py`; `tests/unit/test_scheduler.py` |
| Integration | A nested background agent completes while its parent is still constructing sibling agents; all children launch once and the parent receives their reports. | Real `ChildManager` + scheduler drain collaboration with blocked agent factories and fake conversations | `tests/integration/test_orchestrator_e2e.py` |
| User-flow E2E | A user asks the orchestrator to run three delegated probes concurrently and receives a completed run with one result per agent. | Public run host through real orchestration wiring; external model conversations faked | `tests/integration/test_orchestrator_e2e.py` |

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)
