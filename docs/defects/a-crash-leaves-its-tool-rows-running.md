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
