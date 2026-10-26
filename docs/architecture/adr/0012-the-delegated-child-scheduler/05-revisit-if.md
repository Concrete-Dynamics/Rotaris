# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — Revisit if

Part 5 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## Revisit if

A requirement appears that needs children to be scheduled across runs — `REQ-ORCH-151` currently
forbids it; or the ledger's write rate at `REQ-MONITOR-285`'s maximum supported agent count makes the
per-transition commit a cost on the scheduling path, which is the trigger that replaces the withdrawn
debounce-dominance one and which nothing has measured; or a requirement gives a child state a meaning
across sessions, which would make the session-id predicate that now carries `REQ-ORCH-151`'s isolation
the wrong shape.
