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
- is moved to `failed`, with REQ-ORCH-098's teardown as the settle in `execute` writes it: the `child_end`,
  `child_result` and `child_conversation_closed` timeline entries, then the `child_completed` hook;
- is handed to the scheduler's terminal callbacks, so a parent waiting in the resume loop or in `wait_for_tasks` is
  released.

Evidence, in `packages/engine/src/children/children.test.ts`, the describe "a raise outside the turn settles the
child":
- the fresh path: a tool-port factory that throws. The child ends `failed` with its report, artifact, issue,
  `child_end`, `child_result`, `child_conversation_closed` and `child_completed`, and the parent's foreground `delegate`
  wait returns the report. The iteration closes.
- the resume path: a paused child's recorded conversation corrupted in the store before the continue. The child ends
  `failed` with its report and the same three timeline entries, and the resumed iteration closes.

Both fail on the code before the repair: the child stays `running`.

The teardown's `child_result` and `child_conversation_closed` were added in the verifier's first round (2026-09-29):
the first form wrote only `child_end` and `child_completed`, which left REQ-ORCH-098's "whether or not its execution
raised … its conversation is closed, a `child_conversation_closed` timeline event is emitted" unmet. Both tests now
assert the three entries, and both fail with the two lines removed from `settleRaised`.

**Two edges this repair leaves, stated rather than hidden.**
- *A raise outside the turn while the run is coming to rest, before it has detached.* `settleRaised` ends such a child
  `failed`, where PD-ORCH-005 would leave an unfinished agent `paused`. The path has not been shown reachable: a raise
  in the stretch before the turn happens before any rest could matter to it, and one in the settle after the turn comes
  after the child has answered. Choosing `paused` would be choosing a rest behaviour the directive does not state, so
  the reading built is REQ-ORCH-052's settle.
- *A raise after the child's own terminal transition.* `settleRaised` leaves a terminal child as it is and does not call
  the scheduler's terminal callbacks, so a parent waiting on it is not released. Recorded in
  [`a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md`](../a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md).

**Corrected by the verifier's third round, 2026-09-29.** The resume path's settle was started without being tracked,
where the fresh path's is tracked through `runChild`. A pause or stop that came while its `child_completed` hook was
still running did not wait for it, so the run could come to rest with the settle, and the scheduler's terminal
callbacks after it, still in flight. `resumePaused` now tracks it as the fresh path does. `children.test.ts`'s "the
resume path: the rest waits for the settle" holds a second child's resumed step and the settle's hook, pauses, and
releases the step first; it fails without the tracking, because the rest ends while the hook still holds.

**Found by the verifier's fourth round, 2026-09-29, and repaired.** The paragraph above held for a rest, but a normal
end did not wait for the settle. `settleRaised` makes the terminal move before it runs the hook. A parent that found the
child ended took its report at once, and nothing at an iteration's end waits for an execution. On both start paths the
raise settles the child at once, so every time this repair settled a child, the root was given the report and the run
reached `iteration_end` and `session_end` while the `child_completed` hook still ran. The settle at the end of
`execute` had the same gap, reached by a race. The repair is recorded in
[`a-child-completed-hook-can-finish-after-its-iteration-ends.md`](a-child-completed-hook-can-finish-after-its-iteration-ends.md).
Since then, a parent takes a child as ended only once its settle, hook included, is done. A normal end now waits for
it too. The verifier's fifth round found that this held only for the settles running when a wait began: a second child
that ended during the wait was taken while its own hook ran. Since that round's repair, each wait looks again until
none of its children is settling (recorded on the same note).
