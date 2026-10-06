## The user's own pause is logged at WARNING

Observed 2026-10-03 by the orchestrator's default live run at origin/main `1763f7f` (pack `2026-10-03T05-56-27-364Z`,
part of finding D5 of its autopsy), an all-PASS run. `resume/session.log` reads
`2026-10-03T06:01:36.446Z WARNING iteration 1: 2 child(ren) left paused by pause (PD-ORCH-005)`: the user pressed
Pause at 06:01:34.060, the in-flight steps finished, both children were paused and the run rested `paused`, which is
what PD-ORCH-005 clause 2 says a pause does. Nothing went wrong, yet the line is a warning, one of the 14 lines of that
session log. In the same run the two informational states already under the open question on misstated log levels
were also written at WARNING: REQ-MONITOR-118's `agent waiting on tools` ×4 (edit 1, resume 1, requirements 2) and
REQ-MONITOR-120's `agent stall recovered` ×1 (faults-stall); the healthy `requirements` session log carries two
warnings of its nine lines.

This line is outside that question's three records. It is added there as a further case, with the reading the build
proceeds under: the level stays as it is until the owner rules. No level is changed here.

## Specs

- PD-ORCH-005 clause 2 — a pause rests the run with its children paused; the line reports exactly that, so the state
  is intended, not a fault.
- REQ-SESSION-142 — the session log and its levels; no requirement states the level of this line, which is why the
  question is the owner's. The open question on misstated log levels (by its heading in
  `docs/architecture/open-questions.md`: "What counts as 'an outcome that produced no output within
  `child_stall_timeout`' when the stall watchdog never cancels, and what does the watchdog count, write and call?")
  now names it as a further case.

## Relevant files

- `packages/engine/src/run/run.ts` — `Run` writes the line through `this.deps.warn` after `children.rest(rest, …)`
  returns a non-zero count.
- `packages/engine/src/children/orchestration.ts` — `IterationChildren.rest`, which pauses or finalizes the
  iteration's children and returns the count the line reports.

Noticed 2026-10-03 by the autopsy of the live run at `1763f7f`. Open, the owner's: a ruling on the level.

## Seen again 2026-10-06, on `main` `27a5127`: every warning a wait, and the run's two errors in neither log; still open

The orchestrator's final duress live run at `27a5127` against the self-hosted endpoint (pack
`.live-run/runs/2026-10-06T01-47-53-900Z/` of the live worktree, git-ignored; `--only=duress`, `live-run PASSED` with 19
PASS, 0 FAIL, 5 NOTE), G9 of the default run's autopsy recurring in the duress one.

- **Every warning is a wait.** All 32 warnings of `duress/app.log`, and 32 of `duress/session.log`'s 38 lines (the other
  six are `INFO`), are REQ-MONITOR-118's "agent waiting on tools: orchestrator …", one every 90 s of its four
  `wait_for_tasks` (3,075.3 s, 92 % of the run).
- **The run's two `error` issues reach neither log.** Issue 12 (`timeout`, `error`, 02:35:48.489, "Child
  wave3-verify-result timed out after 1200s.") and issue 7 (`terminal_shell_failure`, `error`, 02:02:12.897, "A terminal
  command failed (exit 1).") are in the store's `issues` table and nowhere in `app.log` or `session.log`, although the
  session log was written at `INFO` and a line at `ERROR` would have passed its threshold.

**What the specification says those logs carry.** REQ-SESSION-142 and REQ-MONITOR-238 fix the session log's form (a file
an ordinary text reader opens) and its threshold (the configured level, default WARNING); REQ-SESSION-087 attaches it at
run start; REQ-SESSION-191 offers it for reading; REQ-TOOLS-171 names application log files among the surfaces one
redaction pass backs. The application log is named as the place for a few facts of other domains — REQ-LIBRARY-035(b)'s
failed analysis pass is "a warning … recorded in the application log" (REQ-LIBRARY-124 keeps it), and REQ-HOOKS-102 bounds
what a withheld-hooks diagnostic may disclose there. **None names a run's issues, an `error`-severity one among them, or
the run's waits, as something either log must carry.** Whether the waits belong at WARNING is this note's question and OQ-127's ("What counts as 'an outcome
that produced no output within `child_stall_timeout`' when the stall watchdog never cancels, and what does the watchdog
count, write and call?"); whether an `error` issue must also reach a log is not asked by any requirement. Recorded as
evidence only; no level and no log line is changed, and nothing is ruled.

## Outcome — repaired 2026-10-06 under OQ-127's ruling ([R-071](../../product/requests.md#r-071))

The owner ruled OQ-127 as recommended, and the ruling settles this line's level with the watchdog's: a log line that
records an intended state is written at `INFO`. `Run` writes `iteration N: n child(ren) left paused by <rest>` through
its own `info` (`RunDeps.info`, wired by `Sessions` to the session log at `INFO` and the application log), for every
rest that reaches it — the user's own pause, stop or quit, each of which PD-ORCH-005 clause 2 or 3 says leaves its
agents paused. REQ-MONITOR-118's `waiting on tools` and REQ-MONITOR-120's `stall recovered` lines, the 32 of 32
warnings of the 2026-10-06 duress run, are written at `INFO` too, and are also timeline entries (`waiting_on_tools`,
`stall_recovered`). Pinned by `packages/engine/src/children/children.test.ts` (the clause 2 pause and the clause 3 stop
each assert the line reaches `INFO` and no warning; red on `37f7a98`) and by `stall.test.ts`'s `stallRecords` cases.
The two `error` issues the second section records as reaching neither log are not a defect of this note: no requirement
asks for them there, and nothing was changed for them.
