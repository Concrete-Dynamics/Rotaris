---
milestone: M1
title: "Event Store and Auditable Learning"
status: planned
branch: milestone/m1-event-store
target-version: "0.121.0"
opened: 2026-08-25
epics: [SWR-2900]
requirements: [SWR-1640, SWR-1641, SWR-1642]
excludes: []
---

# M1 — Event Store and Auditable Learning

After this milestone a finished run is no longer write-only. Its events survive
the run that produced them, can be read back in order and filtered, and can be
exported as a trajectory. The improvement loop gets the same treatment: what it
changed is versioned, inspectable, and can be rolled back.

## Scope

The two halves need each other. [Epic SWR-2900](../requirements/2900-event-store.md)
gives the runtime event stream durable storage, a query and replay API, and a
trajectory export — the stream itself already exists (SWR-1828 emits it,
SWR-1829 versions its schema), but nothing persists it in a form anyone can ask
questions of. SWR-1640/1641/1642 make the improvement loop auditable: versioned
artifact history, rollback of an applied run, and a CLI to reach both.

Auditable learning is listed under the improvement-loop epic rather than the
event store, so it joins by id instead of by epic. That is what the
`requirements:` axis is for — the hundreds-blocks are not a scope boundary.

## Exit criteria

- [ ] the mechanical gate: `uv run python devtools/milestone.py gate M1 --tests-passed`
- [ ] a replayed session is compared against its original transcript by hand once,
      on a real multi-agent run — the store is only worth having if replay is faithful
- [ ] `docs/reference/releasing.md`'s website-promotion checklist re-read, since
      trajectory export is a new data destination

## History

- 2026-08-25 — Declared as the first milestone under the new workflow. Both
  halves were already written up in the Phase 2 round and sat `draft`; nothing
  in the requirements changed to form the milestone.
