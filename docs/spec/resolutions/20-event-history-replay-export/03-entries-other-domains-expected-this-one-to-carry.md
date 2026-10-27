# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export — Entries other domains expected this one to carry

Part 3 of 8 of [domain 20's resolutions](../20-event-history-replay-export.md), which indexes every part.

## Entries other domains expected this one to carry

- **REQ-NOTIFY-268** (every `warning` and `error` notice is recorded to the session timeline before
  being rendered). Decided deliberately as *not* an event-stream entry: new **REQ-EVENTS-176** states
  that recording a notice publishes no event of its own. A `warning` notice produces nothing, which
  matches REQ-EVENTS-056's rule that only error-severity issues reach the wire; an `error` notice
  produces an event only by way of the error-severity issue the underlying condition was recorded as,
  so one failure reaches the stream exactly once whether or not it was also shown to anyone, and a
  consumer counting `error` events counts failures rather than renderings. The timeline entry remains
  the durable record of what the user was told.
- **`evidence/verification-gate.jsonl`** (REQ-TOOLS-190). Decided deliberately as *not* a new event
  type: new **REQ-EVENTS-177** keeps the catalog at the 23 types of REQ-EVENTS-041 and records why.
  Every gate write and decline is an attempt an agent made through a tool, so it is already visible
  on the stream as that call's `tool.start` / `tool.finish` pair, with a decline carried as the
  call's failure; the gate's own `outcome`, `decline_case`, `reason`, `checks` and `detail` stay
  durable in the evidence file and its timeline entry. A consumer needing that detail reads the file
  and must not read the absence of an event as evidence that no gate decision was taken. The file is
  named in the on-disk layout and in REQ-EVENTS-163's list of distinct contracts.
- **`session_end.status` and the hooks payload vocabularies** (REQ-HOOKS-075, fixed against
  REQ-EVENTS-026). Carried, and the draft's conflict resolved in domain 9's favour: REQ-EVENTS-058 no
  longer calls the field free-form (OQ 9). The hook `skip_reason` (REQ-HOOKS-126), `lifecycle_point`
  (REQ-HOOKS-001), `scope` (REQ-HOOKS-020) and no-exit-status representation (REQ-HOOKS-119) are now
  cited rather than left open (OQ 15, OQ 16).
