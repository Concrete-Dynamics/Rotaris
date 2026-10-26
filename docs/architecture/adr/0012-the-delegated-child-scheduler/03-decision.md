# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — Decision

Part 3 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## Decision

The **ledger is the primary representation**: one **row per delegated child**, carrying the fields
`REQ-ORCH-043` and `REQ-MONITOR-022` enumerate, in the workspace database of ADR-0058, written through
the session writer of ADR-0008.

**The run's root execution record is not a row here, and that is a decision rather than an omission**
(recorded 2026-09-13, when `REQ-ORCH-072` was amended for item A4 of the accepted review). The ledger's
membership is what a `delegate` call created; the root is what the run created for itself. Keeping it out
is what makes the counters mean what they say — `REQ-ORCH-046`'s depth, total and active limits count
delegated work, and `REQ-ORCH-050`'s per-model slots are held by agents the scheduler admits — and a root
row would silently consume one of each on every iteration of every run, a `single` run included, where
`REQ-ORCH-025` promises exactly zero delegated children. The surfaces already read it that way:
`REQ-MONITOR-043` and `REQ-MONITOR-089` call it the run's synthetic root and `REQ-CHAT-068` withholds the
delegation-context header from it. What the root does carry is an identity of the same shape — a
canonical name and a task id in this namespace — so a lookup naming it resolves rather than reporting it
unknown, with the parent-scoping of `REQ-TOOLS-155` and `REQ-TOOLS-156` unchanged. SR-4's table names "the delegated-child ledger" among the session data a row holds,
and the ledger meets that ruling's own principle exactly: only the application reads a child record, and
the record is queried and transactional. Nothing about the ledger's *contents* changes —
`REQ-MONITOR-022` requires the record to expose its fields "to monitoring surfaces" and fixes no medium.

All state change goes through one `transition(childId, to, reason)` function, which is the **sole**
implementation of `REQ-MONITOR-300`. It validates the move, stamps the completion timestamp on a
terminal state, and emits `child.transition`. No second table exists anywhere in the product; every
other domain that names a child state cites `REQ-MONITOR-300` rather than restating it, and the code
mirrors that.

**The transition function becomes stronger under rows, and the strength is worth naming.** The child
row's update and the `child.transition` event are written in **one transaction** by the writer of
ADR-0008, so `REQ-MONITOR-016`'s "leave the record untouched, and no state-change event delivered to
any surface" is no longer a discipline the function must be trusted to keep — a refused move commits
nothing, and there is no interval in which a record has moved but its event has not, or the reverse.
The two settling paths `REQ-MONITOR-300` now admits (`REQ-MONITOR-209`, `REQ-MONITOR-211`) are
implemented as ordinary arguments to the same function rather than as a bypass around it, so the claim
that this function is the machine's *sole* implementation survives the sweeps that previously looked
like exceptions to it.

**The start claim becomes simpler and is now genuinely atomic.** A start is a **compare-and-set on the
child row** — one conditional update that moves `queued -> starting` only where the row still reads
`queued`, and the statement's own affected-row count is the claim's outcome. Under the file design this
"compare-and-set" was a read-modify-write over a document, and its atomicity was supplied by the
writer's serialised queue rather than by the store; the ledger and its guard were the same document,
and two scheduling passes could only be kept apart by the queue that ordered them. A conditional update
needs neither the queue nor the argument. `REQ-ORCH-049`'s "started at most once, however many
scheduling passes are in flight" therefore holds by the store rather than by the scheduler's shape, and
a losing claim is a zero-row result — an observation, which is exactly what `REQ-ORCH-049` asks to be
recorded as a `child_launch_suppressed` timeline event and a `stale_child_launch_claim` issue. **The
suppression record is written in the same transaction as the losing claim**, so a race that is
suppressed can never go unrecorded.

Scheduling is a **pass over the ledger triggered by a state change, not by a timer**. Each pass admits
ready children through the five checks in order, promotes at most one held child per model key per
freed slot, applies the dependency cascade, and repeats until the three-condition quiescence holds.
Promises live only *inside* one child's execution, from `starting` through to a terminal state, which is
where they belong.

**A scheduling pass is not one transaction, and must not become one.** The temptation the store creates
is to wrap a whole pass so that admission, promotion and cascade settle together. That is refused: a
pass may start children, and starting a child is model and tool work that cannot sit inside a write
transaction. Each *transition* is a transaction; a pass is a sequence of them. What the store does buy
is that the pass's reads see a consistent ledger, so the five checks of `REQ-ORCH-046` — depth, total
children, active children, dependency existence, and cycle closure — are evaluated against one state
rather than against a document that may have been rewritten between two of them.

**`REQ-ORCH-151`'s per-run isolation changes shape and gets weaker by construction, so it needs a
test.** Under the file design a run's child records lived in that session's own directory and isolation
was a property of the path. In one workspace-scoped store they are rows distinguished by a session-id
predicate, and a query written without that predicate is a cross-run leak that nothing structural
prevents. `REQ-ORCH-151` requires that "a run's stop reason, terminal status, and the sequence of states
each of its children passes through MUST NOT depend on how many other runs are in flight", which is now
a statement about every ledger query carrying its session id. This is recorded as an obligation, not as
an incidental.

Per-model concurrency caps come from the user's setting, else the provider catalogue entry's
declaration, else uncapped (`REQ-ORCH-050`). Which of those the catalogue declares — a number or a
boolean — is unsettled between `REQ-CONFIG-095`, `REQ-MONITOR-021` and `REQ-PROVIDER-049`; see OQ-6.
