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
