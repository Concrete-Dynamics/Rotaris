## A graceful stop persists `paused` where one requirement says `stopped`

A graceful user stop ends with stop reason `user_cancelled`, result `interrupted` and status `paused`, the same as a
forced cancel, a pause and a quit. `REQ-SESSION-186` says a run the user stopped gracefully and cleanly persists
`stopped`, and only a forced or cancelled one `paused`; `REQ-MONITOR-029` maps `interrupted` to `paused` and
`REQ-SESSION-093` persists `paused` for "cancelled/interrupted". The code follows the second pair. The four ways a run
comes to rest can be told apart only by `stop_reason` and the timeline.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-SESSION-186` against `REQ-MONITOR-029` and `REQ-SESSION-093`, which cannot all hold for a graceful stop. This is
a contradiction in the corpus and belongs to an ESC; recorded here so it is not lost. It bears on the run-continuation
policy [R-058](../product/requests.md#r-058) asked for.

## Relevant files

- `packages/engine/src/run/stop-conditions.ts` — `classifyStop`.
- `packages/engine/src/run/run.ts` — the terminal status and the `Run paused…` rows.
- `packages/engine/src/sessions.ts` — the `cancel` and `pause` controls.
