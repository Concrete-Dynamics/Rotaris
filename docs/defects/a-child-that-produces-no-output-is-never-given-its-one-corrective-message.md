## A child that produces no output is never given its one corrective message

REQ-NOTIFY-111/112's stall recovery is not built. Nothing in the engine watches a delegated child for
`runtime.child_stall_timeout` seconds without output, and nothing composes the one corrective message a
recovery-eligible child is owed. Until 2026-09-27 `runtime.child_stall_timeout` and a role's `stall_timeout`
(REQ-CONFIG-108) were loaded and validated by `packages/config` and read by nothing. `PD-ORCH-004`'s progress rule
is now their only reader, and it reads the window only when `runtime.child_timeout` has already expired.

A child that goes quiet is therefore bounded only by the 1200 s hard limit (REQ-ORCH-088). No stall is detected, and
neither the corrective instruction nor its fixed read-then-edit fallback is ever sent.

Noticed 2026-09-27 while building `PD-ORCH-004` (R-057). That build wired the stall window into the run. Established by
searching the engine and the run host for any reader of the key, and for REQ-NOTIFY-111/112. Not observed on a live
run.

## Specs

- `REQ-NOTIFY-111`: a child reporting a recoverable stuck condition receives a corrective instruction and resumes.
  A fixed instruction stands in where none can be composed. The third recovery escalates under REQ-NOTIFY-105.
- `REQ-NOTIFY-112`: "it produced no output within `runtime.child_stall_timeout`" is recovery-eligible, and such a
  child receives at most one corrective message about its lack of progress. Nothing produces that outcome or that
  message.
- `REQ-CONFIG-113`: `child_stall_timeout` (default 90 s) is the "no-event threshold before a child is reported
  stalled", and `REQ-NOTIFY-100` bounds a child producing no output by it. Nothing reports a child stalled.

## Relevant files

- `packages/config/src/sections/runtime.ts`: `child_stall_timeout`, parsed with its default.
- `packages/config/src/sections/personas.ts`: a role's `stall_timeout`, parsed.
- `apps/desktop/src/run-host/configuration.ts`: since `PD-ORCH-004`, hands both to the run (`childStallTimeoutMs`,
  `Persona.stallTimeoutMs`).
- `packages/engine/src/children/orchestration.ts`: `execute`, where a per-child stall watch would sit beside the
  hard timeout. `PD-ORCH-004` reads the window there, at the expiry only.
- `packages/engine/src/run/turn.ts`: `STALL_AFTER` (10 s) marks a live row stalled for the transcript
  (REQ-CHAT-164). That is a presentation mark and not this mechanism.
