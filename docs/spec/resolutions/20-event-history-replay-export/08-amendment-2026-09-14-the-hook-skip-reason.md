# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export — Amendment, 2026-09-14 — the hook skip-reason vocabulary is two values

Part 8 of 8 of [domain 20's resolutions](../20-event-history-replay-export.md), which indexes every part.

## Amendment, 2026-09-14 — the hook skip-reason vocabulary is two values

Building the plan gate (REQ-ORCH-152 to REQ-ORCH-154, ADR-0062) implemented
A4's amendment of `REQ-HOOKS-126` — the closed set of hook skip reasons widened
from one member to two, adding `plan_gate` for a hook invocation withheld while
a run is held at the plan gate — and the event document was not amended with it.
`REQ-EVENTS-047` and the `hook.finish` row of the event-payload table both still
said `untrusted_workspace` was the only defined value, so a reader validating
`hook.finish` against this document alone would have rejected a conformant
`plan_gate` event. Recorded as
a defect note (removed once repaired).

`REQ-HOOKS-126` remains the sole owner of the vocabulary and is unchanged; both
sentences here restate it and now restate it correctly. `REQ-EVENTS-047` keeps
its restriction to `untrusted_workspace` — that sentence governs a hook the
trust gate of REQ-HOOKS-090 withheld, and only that hook — and loses the
parenthetical that promoted the case's own value to the whole set. The payload
table names both values and cites REQ-HOOKS-126 for their meanings, the same
delegation its neighbouring rows make for the vocabularies they do not copy.
