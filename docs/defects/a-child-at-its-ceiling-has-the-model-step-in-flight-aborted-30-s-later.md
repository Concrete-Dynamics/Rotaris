## A child at its ceiling has the model step in flight aborted 30 s later, and the step is discarded

Observed 2026-10-03 by the orchestrator's duress live run of the built product at origin/main `1763f7f` against the
self-hosted endpoint `katalyst` (`qwen3.8-flash-next`, a model that reasons before it answers), 06:15 to 07:32 UTC,
`LIVE_RUN_DURESS_MS=5400000`. The run ended `live-run PASSED` with 18 checks; this finding passed every check, because
no check reads the traffic's `aborted` outcomes. Finding U1 of that run's autopsy.

Two children reached REQ-ORCH-088's 1200 s ceiling, `wave2-d reconcile docs` (docs-writer) and `wave3 verification.md`
(tester). Each was in the middle of a model step at the ceiling. The ceiling asked each to land, and the landing
backstop then aborted the step in flight at exactly ceiling + 30.0 s:

| child | ceiling | step in flight (traffic #) | step started | aborted | generation lost |
|---|---|---|---|---|---|
| wave2-d reconcile docs | 06:40:58.786 | #100 | 06:39:33.389 | 06:41:28.809 | 115.4 s |
| wave3 verification.md | 07:17:57.577 | #186 | 07:17:00.596 | 07:18:27.590 | 87.0 s |

The timeout issue followed each abort within 31 ms and 11 ms. Neither step had produced text or a tool call when it was
cut. Their streamed reasoning was kept as settled `thinking` rows of the transcript (row 293, 19,470 characters; row 513,
25,494 characters), but nothing of either step reached the child's conversation, its report or its continuation:

- #186's reasoning ends "…Now let me write docs/verification.md. It must include: exact command + full output, three
  sections CHECKED/FOUND/COULD NOT CONFIRM". The child had changed nothing, and its report says so. The continuation
  that wrote the file took 746 s.
- #100's reasoning ends with its plan for the `overview.md` edits ("B1. todos.js paragraph … B2. App paragraph"). Its
  continuation re-derived the plan: 7 min 28 s of reading before its first edit (tool call #207, 06:49:37).

Together that is 202.4 s of generation thrown away. Whether either step would have finished inside a longer landing is
not shown. At `71ad8e8` the duress run's three landings all finished their step and its tool ran. Both children here
were continued once (tool calls #170 and #287) and both continuations succeeded.

This is not a defect of the code against a requirement: no requirement bounds how long a model step may take to land.
It is the owner's question
"How long may a child at its time limit take to finish the model step in flight, and what is kept when that bound is
reached?" in [`docs/architecture/open-questions.md`](../architecture/open-questions.md), raised with this note. The build
proceeds under the current behaviour, unchanged until the owner rules. No code is changed here.

## Specs

- REQ-ORCH-088: on expiry, "gracefully pause the child". Narrowed by PD-ORCH-004, whose cut-off report and continuation
  offer both children received. Neither text bounds the landing.
- REQ-MONITOR-123: a pause "finishes its current step and then stops" (narrowed by PD-ORCH-005 revision 2, "in-flight
  tool calls finish"). The step cut here was a model call, not a tool call.
- REQ-CONFIG-131: `graceful_pause_tool_deadline` (default 30.0 s, range 5.0 to 120.0 s) bounds in-flight **tool
  calls** during a pause or shutdown. Nothing bounds a model step's landing.
- REQ-CONFIG-113: `child_timeout` is the "hard per-child wall clock". An unbounded landing would weaken that ceiling,
  which is why the build has a backstop at all.
- ADR-0014 rule 1's single 30 s allowance (`STOP_GRACE`) is the figure the backstop reuses. ADR-0012
  (`docs/architecture/adr/0012-the-delegated-child-scheduler.md`, the landing built 2026-09-16) chose it, and the code
  comment beside `CHILD_LANDING_GRACE` says that should 30 s prove wrong for a landing, it is reported back beside that
  reason rather than repaired quietly. That report-back waits on the ruling.

## Relevant files

- `packages/engine/src/children/orchestration.ts:55` — `CHILD_LANDING_GRACE = STOP_GRACE`, with the reason above it.
- `packages/engine/src/children/orchestration.ts:1199-1216` — the ceiling's timer raises the landing flag and arms the
  backstop that calls `controller.abort()` `CHILD_LANDING_GRACE` later.
- `packages/engine/src/run/grace.ts:14` — `STOP_GRACE`, 30,000 ms.
- `packages/engine/src/run/turn.ts` — the landing flag stops the turn before its next model step; the step already in
  flight runs until it ends or is aborted.
- Evidence (git-ignored): pack `/home/user/Rotaris-crw-wt-live/.live-run/runs/2026-10-03T06-15-52-273Z/`,
  `duress/model-traffic.jsonl` lines 100 and 186 (0-based, `outcome: "aborted"`, `ms` 115,420 and 86,994), store
  session `24cb74e4`, transcript rows 293 and 513.

Noticed 2026-10-03 by the autopsy of the duress live run at `1763f7f`. Open, the owner's: a ruling on the landing's
bound and on what is kept when it is reached.
