## `wait_for_tasks` called with no `task_ids` ends the run on its row label

## Outcome: repaired 2026-11-24 (`fix-wait-for-tasks-empty-args`)

Seen in the installed 0.1.0rc9 `.deb`: an orchestrator delegated two read-only children, then called `wait_for_tasks`
with `{}` — the documented "all of your active background children" form. The run ended at once with
`Run failed: TypeError: Cannot read properties of undefined (reading 'join')`, stop reason `agent_session_aborted`, and
both children settled `cancelled` at exit (REQ-ORCH-052). The tool result recorded for the call was "cut off before it
completed".

Cause: the gate computes a call's row label from the arguments **as sent** (after the payload repairs, before the
schema parses them), so `wait_for_tasks`'s schema default (`task_ids: []`) had not been applied, and its label read
`a.task_ids.join(...)` on `undefined`. The label is computed outside the executor's error handling, so the throw left
`Gate.dispatch` and aborted the agent session rather than answering the call.

Repair, in two places: the label reads an absent `task_ids` as "(all)"; and the gate falls back to its default label when
any tool's `label` throws, so a row header can never end a run again. `gate.test.ts` ("a row label never ends the run")
replays the call as sent and the throwing label.

## Specs

REQ-TOOLS-105 (a call renders in a row header), REQ-TOOLS-032 (a malformed or partial call is answered, not fatal), and
`wait_for_tasks`'s own description: an empty list waits on every active child.

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts` — `waitForTasksTool`'s `label`
- `packages/agent-tools/src/gate.ts` — `dispatch`, where the label is computed from `argsForGate`
- `packages/agent-tools/src/gate.test.ts` — the regression tests
