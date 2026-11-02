## A continuation's run timing starts after its pre-flight, where a launch's counts it

A continued run records `sessions.run_started_at` as the instant its intent classification returned, not the instant the
run started. The run takes the column from the session row's last `updated_at` at the moment it saves `running`
(`packages/engine/src/run/run.ts:994`). For a launch nothing writes the row between the `starting` save and that moment,
so the value is the `starting` save and the pre-flight is counted. For a continuation the "Intent classified" row is
appended after the classification returns and moves `updated_at`, so the value is the end of the pre-flight. The run
header's frozen duration, the inspector's run-level row and the session list's duration label all read from that
column, so a continued run reads shorter than it ran by the length of its classification (up to the 12 s bound).

Live-run finding: G8 of the final default live run at origin/main `27a5127` (2026-10-06).

## Specs

- `REQ-CHAT-158`: once the run reaches a terminal state the indicator "MUST freeze at that run's total wall-clock
  duration". The pre-flight is part of the run (REQ-ORCH-005: the intent is decided before the first iteration, while
  the session reads `starting`), and a launch's frozen value counts it, so a continuation's must too.
- `REQ-SESSION-154` / `REQ-MONITOR-171`: the session list's row carries "a relative-time duration label"; as built
  (OQ-192's reading) it is `durationLabel(run_started_at, …)`, so it inherits the shortened value.

## Evidence

Default pack `.live-run/runs/2026-10-06T01-30-08-282Z/` of the `live` worktree at `27a5127` (git-ignored; the self-hosted
endpoint):

- `workspace.db`, session `4b497643` (`resume`): `run_started_at` = 01:34:35.817, one millisecond after `resume/app.log`
  line 61 (01:34:35.816, "intent: small_feature (0.82)"), 8.6 s after the Continue press (`resume/app.log` line 55,
  01:34:27.171). `resume/model-traffic.jsonl` #5 is that classification (8,598 ms).
- `resume/resume.png`: the header reads "Completed 0:56" and the inspector "done · 56s"; the continuation ran 64.9 s from
  the press to its end (`updated_at` 01:35:32.060).
- `shell/shell.png`: the session list reads "0:56" for the same session.
- The launch counts its pre-flight: session `1690f84c` (`ask`) has `run_started_at` 01:30:45.081, before its
  classification request (`ask/model-traffic.jsonl` #0, 01:30:45.118).

## Relevant files

- `packages/engine/src/run/run.ts` — `start()`: the `starting` save, the pre-flight, the continuation's "Intent
  classified" row, and the `saveRunning({ run_started_at: … })` that takes the row's last `updated_at`.
- `packages/engine/src/sessions.ts` — `list()`: the session list's `durationLabel(row.run_started_at, …)`.
- `packages/ui/src/composer.ts` — `runTimingSeconds`, the header's frozen value (`updatedAt − runStartedAt`).
- `packages/ui/src/agents.ts` — the inspector's run-level row (`spawnedAt: session.runStartedAt`).

## Repaired (2026-10-06, fin18)

`Run.start()` reads the row's `updated_at` back right after the `starting` save, before the pre-flight, and the `running`
save writes that as `run_started_at` (`packages/engine/src/run/run.ts`). A continuation's run now starts where a launch's
does, its classification counted, so the header's frozen value, the inspector's run-level row and the session list's
duration label read the run's whole wall-clock duration from its starting save (64.9 s for the live run's continuation,
where they read 56 s).
The column is still written after the pre-flight, so the cancel overlay's order (`packages/ui/src/cancel-overlay.ts`)
holds as it was.

The value is the run's `starting` save, not literally the press: what lies between the two (the click's IPC, the run host
loading the configuration and opening the continuation) is still outside `run_started_at`, as it is for a launch. In the
pack that is about 35 ms (the press at `resume/app.log` line 55, 01:34:27.171; "a continuation run is executing" at line 58,
01:34:27.202; the classification request at line 60, 01:34:27.208), so the repaired header reads the run from its starting
save: 64.86 s for the pack's continuation (01:34:27.202 to 01:35:32.060), 31 ms short of the 64.89 s from the press. Both
read 64.9 s to one decimal, the figure OQ-192's case gives. (Repair round 2 wrote "about 64.8 s" here, a rounding slip the
round-3 verifier found.)

Pinned by `packages/engine/src/run/preflight.test.ts`, "REQ-CHAT-158 / REQ-SESSION-154 (live-run finding G8): a
continuation's run starts at its `starting` save, its pre-flight counted as a launch's is": the launch's classification
takes 3 s and the Continue's 8.6 s on the run's clock; the launch's `run_started_at` is its `starting` save, the
continuation's is its own `starting` save (it was the instant after its classification returned, 9.6 s later, before the
repair), and the session list's duration label reads `0:09` for the continued run. It fails without the repair.
The built app shows the repair in the next default live run's `resume` scenario (the orchestrator's; an agent's live-run
launch is refused): `run_started_at` precedes that run's `run_continuation_intent` timeline entry.

Not decided here: whether the session list's duration label is the latest run's (as built, OQ-192's reading:
`durationLabel(run_started_at, …)`) or the session's whole (the autopsy reads 87.7 s for this session, its first run's
22.6 s outside the label). REQ-SESSION-154 says "a relative-time duration label" and REQ-MONITOR-171 "a duration label";
neither says which. The case is added to [OQ-192](../../architecture/open-questions.md) ("The sessions card's rows carry a
token label, a duration label and a detail caption, which the listing record's closed field set does not hold."), whose
ruling decides whether the label stays on the row at all.
