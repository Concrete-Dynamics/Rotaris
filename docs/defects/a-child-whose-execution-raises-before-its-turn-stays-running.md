## A child whose execution raises before its turn stays running

A child's execution (`IterationChildren.execute`) moves the child `running` and then builds what its turn needs — its
persona, its tool port (`toolsFor`), its compression, its payload or its recorded conversation — before the `try` that
settles it on any failure. Something that raises in that stretch (a tool-port factory that throws, a record that
cannot be decoded) rejects the execution; the scheduler's wrapper warns and runs a pass, but the child is left
`running` with no execution behind it, and a parent waiting on it waits for good. It holds on both start paths, the
scheduler's and the resume's. Noticed by phase 4's review of `PD-ORCH-005` (2026-09-27), established by reading the
code; not driven.

## Specs

`REQ-ORCH-073` (a child whose execution raises ends `failed`) and `REQ-ORCH-052` (every exit path from an iteration
leaves every child record terminal), neither of which a child left `running` with no execution meets.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `execute`, the stretch between the move to `running` and its `try`;
  `resumePaused`, whose wrapper warns and passes.
- `packages/engine/src/children/scheduler.ts` — `startOne`, the same wrapper on the fresh path.
