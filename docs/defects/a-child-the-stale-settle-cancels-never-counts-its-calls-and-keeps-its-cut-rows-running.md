## A child the stale settle cancels never counts its calls and keeps its cut rows running

A child a dead run left neither terminal nor `paused` — a plan cycle's child a crash ended (a plan cycle has no
`iterations` row, so the crash record pauses none of its agents, OQ-96), or another root's orphan — is settled `cancelled`
by the stale-child settle at the next continue (`settleStaleChildren`, REQ-ORCH-053). The settle writes its transition and
its report and nothing else: the calls its record holds beyond its `children.tool_calls` never join the session's total
(its count moves only when its execution settles or rests, and the crash record counts only the open iteration's
unfinished agents), its record's last unanswered calls are never answered, and a transcript row of a call the crash cut is
left `running` for good — the same shapes the crash record repairs for an execution iteration's agents
(`answerOpenCalls`, `countCrashedCalls`). The settle runs only at a continue, so a repair alone leaves the child `running`
too. Noticed 2026-09-30 while repairing
[`a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md`](fixed/a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md),
which repaired the plan cycle's root only; established by reading the code, not driven.

## Specs

`REQ-MONITOR-102` (a session-wide total tool-call count is persisted, and counts each call), which a call never counted does
not meet. `REQ-SESSION-129` ("when a child agent dies while a tool call is open … no transcript row of its own left at status
`running`; every such row MUST be persisted at status `failed`"), which a cut row left `running` does not meet.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `settleStaleChildren`, which transitions and reports only.
- `packages/engine/src/run/crash.ts` — `answerOpenCalls` and `countCrashedCalls`, what the crash record does for an open
  iteration's agents and not for these.
- `packages/engine/src/sessions.ts` — `launchContinuation`, where the settle runs after the crash record.
