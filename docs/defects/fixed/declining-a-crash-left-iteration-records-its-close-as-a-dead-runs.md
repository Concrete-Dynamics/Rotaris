## Declining a crash-left iteration records its close as a dead run's

`PD-ORCH-005` clause 18 offers "continue without them" on a session a crash left, and records the crash first
(`launchContinuation` → `recordCrashOf` sets the open iteration's interruption to `crash`). The declining run then
closes that iteration in `Run.closeLeftOpenIteration`, which chose the `iteration.end` summary from what left the
iteration open: an interruption of `null` or `crash` read "the run that owned this iteration ended before it closed", a
branch written for an iteration a dead run left open and nobody declined. Every crash-left decline therefore recorded
its close as a dead run's, while the same call gave each cancelled agent the report "Cancelled: the session was
continued without this agent, which a crash had left paused." The user's choice was missing from the iteration's own
record, and the record contradicted itself. A decline of a rest read "the session was continued without the agents the
pause had left paused", as it should.

Found 2026-09-28 by the seventh review round of the merged revision 4 build of `PD-ORCH-005` (R-064). At the base the
branch could not be reached by a user's decline: the continue refused an `interrupted` or busy session, and the decline
was offered only for `paused`.

## Specs

`PD-ORCH-005` clause 6 ("continue without them" ends those agents cancelled and closes the iteration, the user's
decline) with clause 18 (a crash-left session offers the same choice, recording the crash first); REQ-ORCH-135 (an
iteration left open closes as cancelled, its task anchored).

## Relevant files

- `packages/engine/src/run/run.ts` — `closeLeftOpenIteration`, which picks the close summary and the agents' reports.
- `packages/engine/src/sessions.ts` — `launchContinuation`, which records the crash and hands the run
  `openIteration: { resume: false }` on a decline.
- `packages/engine/src/run/crash.test.ts` — clause 18's "continue without them" cases.

## Repaired — 2026-09-28

By the seventh fix round of the merged revision 4 build (R-064). `closeLeftOpenIteration` chooses the summary by whether
this run declined the iteration (`openIteration.resume === false`), not by what left it open. A declined iteration reads
"the session was continued without the agents … had left paused" with the recorded interruption's phrase (`a crash` on
clause 18's route), matching its agents' reports. Only a run told nothing about the open iteration still records the
dead run's wording.

Evidence: `packages/engine/src/run/crash.test.ts`, "recovery: / interrupted: "continue without them" records the crash
first, …" now assert iteration 2's `iteration.end` summary "the session was continued without the agents a crash had
left paused" beside the child's report. Restoring the old predicate turns both red. `children.test.ts`'s pause decline
still pins the rest wording.
