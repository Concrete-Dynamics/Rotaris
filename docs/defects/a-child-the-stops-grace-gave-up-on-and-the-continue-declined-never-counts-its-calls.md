## A child the stop's grace gave up on, and the continue declined, never counts its calls

A child whose execution was still running when a stop's 30 s grace ran out (REQ-SESSION-092) is detached: its execution
returns without counting (`IterationChildren.execute`'s `if (this.detached) return;` sits before `countToolCalls`), and the
rest records it `paused` without a count (`IterationChildren.rest` calls `ledger.rest` with no `toolCalls`). A continue that
resumes it credits its calls from its record (`priorCalls`), so that path is whole. A continue that declines the open
iteration (PD-ORCH-005 clause 6, `Run.closeLeftOpenIteration` → `cancelPausedAgents`) ends it `cancelled` and counts
nothing, so the calls it made before the stop are in its record and its transcript rows and never in `sessions.tool_calls`
or its own `children.tool_calls`. The root given up on is counted from its record at the detach (the repair of
[`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](fixed/a-roots-calls-before-a-crash-never-reach-the-session-total.md));
a detached child is not. Noticed while making that repair (2026-09-29), established by reading the code; not driven.

## Specs

`REQ-MONITOR-102` (per-agent tool-call counts and a session-wide total are persisted; the displayed total is the
persisted value), which a call never counted does not meet.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `execute` (the detached return before the count) and `rest` (the
  detached child rested with no count).
- `packages/engine/src/run/run.ts` — `closeLeftOpenIteration` / `cancelPausedAgents`, the decline, which counts nothing.
- `packages/engine/src/session-writer.ts` — `countToolCalls`, which a repair would write through.
