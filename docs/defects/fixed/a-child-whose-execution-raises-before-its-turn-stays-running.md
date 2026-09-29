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

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Both start paths now run a child through `IterationChildren.executeSettling`: the
scheduler's `runChild` and `resumePaused`. `executeSettling` awaits `execute` and hands any raise to `settleRaised`.
`execute`'s own `try` still catches a raise inside the child's turn. The guard covers a raise anywhere else:
- the stretch that builds the turn's persona, resilience, compression, tool port and fingerprint;
- the settle after the turn.

`resumePaused` also guards the load of a resumed child's record. A record that does not decode is settled the same
way, and the loop goes on to the next paused child.

`settleRaised` leaves a child that is already terminal, or `paused`, as it is, and writes nothing once the rest has
detached the iteration. Any other child:
- is recorded as a `child_exception` issue;
- gets a `failed` report whose error names the raise, stored with its artifact;
- is moved to `failed`, with the `child_end` timeline entry and the `child_completed` hook;
- is handed to the scheduler's terminal callbacks, so a parent waiting in the resume loop or in `wait_for_tasks` is
  released.

Evidence, in `packages/engine/src/children/children.test.ts`, the describe "a raise outside the turn settles the
child":
- the fresh path: a tool-port factory that throws. The child ends `failed` with its report, artifact, issue,
  `child_end` and `child_completed`, and the parent's foreground `delegate` wait returns the report. The iteration
  closes.
- the resume path: a paused child's recorded conversation corrupted in the store before the continue. The child ends
  `failed` with its report, and the resumed iteration closes.

Both fail on the code before the repair: the child stays `running`.
