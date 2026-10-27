# ADR-0008 — One ordered session writer per session, owning the session's transactions — Alternatives considered

Part 2 of 8 of [ADR-0008](../0008-one-ordered-session-writer.md), which indexes every part.

## Alternatives considered

**A — Each producer writes its own rows and publishes its own event.** Rejected, and the store change
strengthens the rejection. Four ordering rules enforced at every producer are unverifiable; and with a
transaction available, each producer opening its own would let two producers' events commit in an order
other than the order they were emitted, which `REQ-EVENTS-076` forbids — it fixes orderings judged
alike by delivery order on the live channel and by position in the stored history.

**B — An asynchronous write queue with promises.** The natural answer in this runtime, and it fails on
`REQ-SESSION-068` and `REQ-SESSION-070` exactly as it did under the file design: a promise-based queue
cannot offer a flush usable where no asynchronous runtime is active that does not return until the
state is durable, and `REQ-SESSION-070`'s "readable back by any other reader of the store before the
call returns" makes it unambiguous. **This is a constraint on the store's binding and not only on this
writer**, and ADR-0058 applies it as a filter over candidate engines rather than discovering it
afterwards. Any binding whose only interface is a promise is disqualified here, not merely
inconvenient.

**C — Let the store's own concurrency control serialise the writers, with no in-process queue.** The
tempting simplification once a database exists: one transaction per unit of work, a busy timeout for
contention. Rejected, and `REQ-EVENTS-098` has since made the rejection the specification's rather than
this record's. A transaction supplies atomicity and isolation; it does **not** supply emission order,
and the requirement now states that serialisation is required *even where the store cannot corrupt*,
because order is what is at stake. A busy timeout is separately disqualified: it is a wait of unbounded
relation to our own work, where a queue makes the wait bounded by work we scheduled, and
`REQ-MONITOR-232` forbids a view from changing a run's timing.

**D — The ten-second window, narrowed to the session record.** *This record's own previous decision,
preserved as the alternative it now is, because its argument was real and one part of it survives.*

Its case had three legs. `REQ-SESSION-071` stated a bound on write volume as an **observable** — at
most two writes per window, at most twelve per minute — and an observable is not a mechanism to be
optimised away. `REQ-SESSION-067` fixed the window against configuration, so it was not tuning.
And the cost it bounded was real: the session record carries the metric aggregates `REQ-SESSION-139`
reports, and rebuilding those on every tool call would put an aggregate query on the hot path. The
narrowing was careful — the window covered only the session record and never a write that carried a
publish anchor, so `REQ-MONITOR-218` was untouched.

**What changed is a ruling followed by an amendment, and the second went further than the first.**
SR-4 removed the *reason* for the window by making a save record only what changed. The specification
then withdrew the window **outright** rather than narrowing it, and withdrew the observable with it:
`REQ-SESSION-067` now forbids parking and coalescing in terms, and `REQ-SESSION-071` states that no
bound on write volume is needed. Two of the three legs therefore no longer exist. The third — the
aggregate rebuild — is a genuine cost and it does not disappear with the window; it is answered below
by maintaining the aggregates incrementally, which is where the argument goes rather than being lost.

**E — A synchronous-capable serialised writer, per session, owning one transaction per unit of work,
applying every requested save.** Chosen.
