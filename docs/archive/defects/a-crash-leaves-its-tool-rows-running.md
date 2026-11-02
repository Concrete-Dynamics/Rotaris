## A crash leaves its tool rows running

A tool row is opened `running` when its call starts and settled when the call returns (`runTurn`). A run host that dies
while a call is under way never settles it, and nothing does afterwards: neither the repair (REQ-SESSION-182) nor the
continue that follows touches transcript rows, so the transcript keeps a row at `running` for a call no process is
running. `PD-ORCH-005` phase 3 answers such a call in the agent's conversation record — the crash record writes the
interrupted result a resume reads — but the transcript row is a separate record and stays as the dead run left it.

Noticed 2026-09-27 while building `PD-ORCH-005` phase 3 (the crash record, `run/crash.ts`). Established by reading the
code; not driven.

## Specs

`REQ-SESSION-129` ("no transcript row of its own left at status `running`; every such row MUST be persisted at status
`failed`, keeping whatever output it had already recorded"), as narrowed by `PD-ORCH-005` (a call cut off by a crash is
recorded as interrupted).

## Relevant files

- `packages/engine/src/run/turn.ts` — the tool row opened `running` and settled after `dispatch`.
- `packages/engine/src/run/crash.ts` — `recordCrash`, which writes the conversation's answer and no transcript row.
- `packages/engine/src/sessions.ts` — `repairOne`, and `launchContinuation`'s crash record before the settle.

## Repaired — 2026-09-27

Repaired by `PD-ORCH-005` phase 3, while repairing the fourth review's finding that a rest answered a completed call as
interrupted. The crash record now answers each unfinished agent's open calls through the same function a rest uses
(`answerOpenCalls`, `run/crash.ts`): a call whose row settled keeps what it returned, and a call whose row is still
`running` is answered as interrupted, with whatever output that row had recorded, and the row settles `failed` with the
same statement — REQ-SESSION-129's "keeping whatever output it had already recorded". The root's rows are found by its
persona (`root_persona`), a child's by its canonical name, so another agent's call with the same id is left alone.

What it still does not reach: a row released past the resident window (the writer settles resident rows only), and a
`running` row of an agent the crash record does not visit — one outside the open iteration, or in a terminal state.

Evidence: `crash.test.ts` ("a call that completed before the crash keeps what it returned…"), red when the settle, the
name filter, the recorded output or the latest-row rule is reverted.
