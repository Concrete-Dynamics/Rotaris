## A graceful stop persists `paused` where one requirement says `stopped`

A graceful user stop ends with stop reason `user_cancelled`, result `interrupted` and status `paused`, the same as a
forced cancel, a pause and a quit. `REQ-SESSION-186` says a run the user stopped gracefully and cleanly persists
`stopped`, and only a forced or cancelled one `paused`; `REQ-MONITOR-029` maps `interrupted` to `paused` and
`REQ-SESSION-093` persists `paused` for "cancelled/interrupted". The code follows the second pair. The four ways a run
comes to rest can be told apart only by `stop_reason` and the timeline.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-SESSION-186` against `REQ-MONITOR-029` and `REQ-SESSION-093`, which cannot all hold for a graceful stop. This is
a contradiction in the corpus and belongs to an ESC; recorded here so it is not lost. It bears on the run-continuation
policy [R-058](../../product/requests.md#r-058) asked for.

## Relevant files

- `packages/engine/src/run/stop-conditions.ts` — `classifyStop`.
- `packages/engine/src/run/run.ts` — the terminal status and the `Run paused…` rows.
- `packages/engine/src/sessions.ts` — the `cancel` and `pause` controls.

## Read by PD-ORCH-005's build — 2026-09-27, not repaired

PD-ORCH-005 does not settle this. Clause 2 has a pause persist `paused`, and clause 3 has a stop leave "the same
state": every unfinished agent `paused` and the iteration open. The build persists `paused` for a stop, graceful or
forced. That keeps REQ-MONITOR-029 and REQ-SESSION-093 and leaves REQ-SESSION-186's `stopped` unmet, as before.
REQ-SESSION-186 is not in the directive's Narrows list, so the contradiction is still the corpus's, and it still
belongs to an ESC. A stop is told apart from a pause by `children.interruption` and `iterations.interruption` (`stop`),
as well as by `stop_reason` and the timeline. OQ-96 records the reading.

> **Corrected 2026-09-29.** "as well as by `stop_reason`" is false of a stop against a pause: both record
> `user_cancelled` (`packages/engine/src/run/run.ts`, the stop conditions at the top of the iteration loop and
> `teardown`), and REQ-MONITOR-301's closed set has no member for a pause. `stop_reason` tells a quit
> (`application_shutdown`) from the rest; a stop is told apart from a pause only by the interruption and the timeline.

## Settled 2026-09-29 by the owner's ruling (R-067)

Settled 2026-09-29 by the owner's ruling ([R-067](../../product/requests.md#r-067)): a graceful user stop persists
`paused`, as built. [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 5 adds clause 21 — a stop the user
made, graceful and clean or forced, persists `paused` as a pause does and never `stopped` — and names `REQ-SESSION-186`
among what it narrows, with `REQ-SESSION-073`, whose vocabulary glosses `stopped` with the user's stop; both carry the
back-pointer in `docs/spec/07-sessions-persistence.md`, and `stopped` stays in the vocabulary for an exhausted budget
(`REQ-MONITOR-029`). The contradiction this note recorded is no longer ungoverned: `REQ-SESSION-186`'s `stopped` gives way where the
directive reaches, and `REQ-MONITOR-029` and `REQ-SESSION-093` stand. OQ-96 carries the ruling.

No code changed. `packages/engine/src/run/stop-conditions.ts` already persists `paused` for a user's stop (confirmed on
origin/main 5c7de7c: `classifyStop('user_cancelled')` answers the result `interrupted`, lines 26-29, and
`statusForResult('interrupted')` answers `paused`, lines 60-62), which is what the ruling keeps. The mapping is pinned by the existing
case "REQ-SESSION-076 is total over REQ-SESSION-073 …" in `packages/engine/src/run/run-pure.test.ts`
(`statusForResult('interrupted')` → `paused`), green on this branch. Settled, not repaired: there was nothing to repair once the requirement was narrowed.
