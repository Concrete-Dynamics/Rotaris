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
