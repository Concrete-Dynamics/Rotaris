## The per-model cap counts only one iteration's children

`ChildLedger.slotsInUse(modelKey)` counts the children holding a slot on a model among `this.all()` — the children of
**one iteration of one session** (`childrenOfIteration(sessionId, iteration)`). REQ-CONFIG-094 counts every child running
against the `models:` entry "across the whole process and at every delegation depth — … children belonging to any other
session running in the same process". `Sessions` holds its live runs in a map keyed by session, and each run's ledger
counts only its own iteration's children, so two sessions running at once in one run host could each fill a
`max_parallel` of 2 and put four children on the model. Whether two sessions do run at once in one run host on today's
routes was not established.

Noticed 2026-09-29 while repairing live-run finding D5 (a child's cap was looked up by its model's bare id), after which
the cap is found at all. Established by reading the code; not driven.

## Specs

REQ-CONFIG-094 (what counts against the cap: every child on that entry, process-wide, by the entry's key; a synthetic copy
counts against its entry), with REQ-MONITOR-020 (only running and summarizing agents count) and REQ-ORCH-050. ADR-0012
places the ledger in one session's rows and says nothing of a process-wide count.

## Relevant files

- `packages/engine/src/children/ledger.ts` — `slotsInUse`, `slotFree`, `all()` (one iteration's rows).
- `packages/engine/src/sessions.ts` — `Sessions.live`, one entry per running session.
- `packages/engine/src/children/scheduler.ts` — the promotion that frees a slot, within one iteration.
- `apps/desktop/src/run-host/configuration.ts` — `modelCapFor`, the cap by `models:` key.
