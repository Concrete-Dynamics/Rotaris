---
req-id: SWR-2132
status: approved
trace: required
test: required
type: technical
derived-from: [SWR-107, SWR-141, SWR-142]
title: "Deterministic child-result handoff"
epic: SWR-100
date: 2026-07-23
---

# SWR-2132 — Deterministic child-result handoff

Delegated work needs a result that the parent can use immediately, but creating a
second model-generated terminal report can distort the child’s answer, delay
handoff, and create a durable artifact the child did not author. The orchestration
seam shall instead extract child responses deterministically from the in-memory
transcript.

When a child finishes, retain both the latest assistant response (`last_response`)
and `final_response` only when assistant text follows all tool activity. Dependency
context, `wait_for_tasks`, and `background_output` shall select an explicitly
authored artifact first, then `final_response`, then `last_response`. Non-artifact
results are ephemeral to the active child-manager handoff; only `artifact_write`
creates a durable, structured artifact.

## Acceptance criteria

- No terminal `SummaryAgent` completion call or `SUMMARIZING` lifecycle state is
  used for an ordinary child result.
- Assistant text after tools is exposed as `final_response`; a terminal tool call
  exposes the latest assistant response as `last_response` without mislabeling it
  as final.
- An authored artifact remains the preferred handoff and is not duplicated as a
  generated `child_report` artifact.
- Unit coverage exercises transcript selection plus each parent retrieval path.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Parent retrieves a completed child’s usable response without a second model call. | Scheduler, `ChildManager`, `background_output` | `tests/unit/test_scheduler.py`, `tests/unit/test_child_manager.py`, `tests/unit/test_background_output_tool.py` |
| Integration | Parent waits for delegated work and receives the selected result. | Scheduler delegation drain and wait barrier | `tests/integration/test_orchestrator_e2e.py` |
| User-flow E2E | N/A — this technical seam is covered through the originating orchestration product flows. | N/A | N/A — derived from SWR-107, SWR-141, and SWR-142. |

Derived from: [SWR-107, SWR-141, and SWR-142](../100-orchestration-core.md)

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)
