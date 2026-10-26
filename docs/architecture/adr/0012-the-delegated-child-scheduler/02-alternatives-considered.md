# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — Alternatives considered

Part 2 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## Alternatives considered

**A — A promise graph.** Each delegation is an asynchronous function; dependents await their
dependencies; concurrency is a semaphore. Idiomatic, small, and the first thing reached for. It fails
on four hard constraints:

- `REQ-MONITOR-016` requires an *attempted illegal move* to be rejected with a specific error and to
  leave no trace. Implicit control flow has no representation of a move that was attempted and
  refused.
- `REQ-ORCH-049` requires the duplicate-start race to be **observable** — a timeline event and an
  issue. A promise that has already been awaited simply resolves again; the race is prevented and
  invisible, which is not what is asked for.
- `REQ-ORCH-052` and `REQ-ORCH-053` sweep non-terminal records **left behind by a previous run** of the
  same session, whose process is gone. A promise graph has no representation of a child that exists only
  as a record. *SR-4 does not weaken this objection; it sharpens it, because the record is now a row a
  query returns rather than a fragment of a document somebody has to remember to parse.*
- `REQ-ORCH-048` requires the cascade to settle dependents that have not started while leaving started
  ones running. An await-graph cannot distinguish "not yet started" from "started"; a rejected
  dependency propagates to every dependent uniformly.

**B — An actor or queue per child.** Adds a mailbox and a supervisor without addressing the ledger
requirement, since the ledger still has to exist to satisfy the sweeps and the illegal-move rule. The
actor model would be a way of *driving* the ledger, not a replacement for it.

**C — A persisted child ledger with a scheduler run to quiescence.** Chosen.
