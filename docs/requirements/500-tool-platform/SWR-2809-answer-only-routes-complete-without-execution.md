---
req-id: SWR-2809
status: approved
trace: required
test: required
type: technical
derived-from: [SWR-548, SWR-549]
title: "Answer-only routes complete without a task-advancing tool"
epic: SWR-500
date: 2026-08-07
---

# SWR-2809 — Answer-only routes complete without a task-advancing tool

The playbook matrix (SWR-2416) routes the `question` and `exploration` intents to
`ROUTE: answer-only`, whose variant text instructs the agent not to edit files and
not to assign implementation work. The stall guard of SWR-548/SWR-549 then demanded
a task-advancing tool call regardless of route, and its recovery prompt named
`write_file` and `terminal` explicitly. An agent that obeyed its route was sent a
prompt contradicting that route and, on correctly declining, was failed. The stall
guard shall be route-aware.

The scheduler shall resolve the child's playbook `ROUTE` slot for the run's classified
intent. When that route is `answer-only` and the child produced a user-visible message,
a transcript outcome of `answered`, `message_only`, or `housekeeping_only` shall be
accepted as a successful completion: no recovery prompt is sent and no incomplete-
execution failure report is produced. Acceptance keys on a user-visible message rather
than on `final_response`, because a child that answers and then calls the terminal tool
ends on a tool call and therefore carries its answer in `last_response` under SWR-2132.

The guard shall remain fully in force otherwise. `malformed_tool_attempt` and
`empty_stalled` are never accepted, because raw tool-call markup and a silent stall
are defects on every route. A child that produced no user-visible message is never
accepted. A run whose route is not `answer-only`, or whose intent is unclassified,
keeps the unmodified SWR-548/SWR-549 behaviour.

The run's classified intent shall reach the scheduler: assigning `RalphLoop.run_intent`
propagates the value to the scheduler that loop owns.

## Test coverage

Unit coverage over the scheduler asserts that an answer-only child that answers and
finishes succeeds without a recovery prompt, that the same transcript on a non-
answer-only route still receives the recovery prompt and still fails, and that
`malformed_tool_attempt`, `empty_stalled`, and a transcript with no user-visible
message are refused even on an answer-only route. Unit coverage over `RalphLoop` asserts intent
propagation to the scheduler. Integration coverage exercises a question-intent run
reaching a successful report through the scheduler seam. The originating product flow
— single recovery prompt and clean stall failure — is enabled by `derived-from`
SWR-548 and SWR-549.

Derived from: [SWR-548 — Single Recovery Prompt and SWR-549 — Fail Incomplete Execution Cleanly](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)
