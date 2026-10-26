# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — Consequences accepted

Part 4 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## Consequences accepted

1. Every state change is a function call that can fail, and callers must handle the refusal. That is
   the cost of `REQ-MONITOR-016` being observable, and it is the point.
2. The scheduler runs to a fixed point rather than on a tick. `REQ-ORCH-056`'s no-livelock clause
   becomes a **termination proof obligation**: each pass must either change some child's state or
   reach quiescence, so a pass that changes nothing must not schedule another.
3. **The crash story is not the one this record previously accepted, and the change is a specification
   amendment rather than a design choice.** The earlier text read: "the ledger is written through the
   10.0 s debounce like any other state, so a crash may lose up to one debounce window of ledger
   movement". `REQ-SESSION-067` as amended states the opposite in terms — "No save is deferred behind a
   timer, parked, or coalesced with a later one" — and `REQ-SESSION-034` now states the crash-loss
   budget **in saves rather than in seconds**, with `REQ-SESSION-028` making an interrupted save absent
   whole. A crash therefore loses only a transition for which no save was ever requested: an in-flight
   transaction, not a window of movement. `REQ-ORCH-053`'s settle-on-continue survives this unchanged
   and is *not* left without a purpose — it exists for children that were genuinely mid-flight when the
   host died, which is a state no durability rule removes. The instruction not to probe liveness also
   survives, and under SR-1 it is now trivially safe rather than merely justified.
4. The per-model hold queue is FIFO and per model key, scoped per run (`REQ-ORCH-151`), so two
   concurrent runs cannot starve each other of slots. Under one workspace store, "scoped per run" is a
   predicate rather than a partition — see the isolation obligation in the Decision.
5. The hard per-child timeout of 1200 s (`REQ-ORCH-088`), the visibility-only stall watchdog
   (`REQ-ORCH-089`, `REQ-MONITOR-117`) and the unresponsive-model fallback (`REQ-ORCH-090`) all read
   from the `MonotonicClock` port of ADR-0006, so `REQ-ORCH-156`'s controlled-clock conformance covers
   them.

6. **One crash domain replaces twenty small ones.** SR-4's own cost note applies here: a per-session
   directory lost one session's ledger at a time, and a workspace-scoped store is a single corruption
   domain for every session in that workspace. That is scoped rather than solved, and it is stated here
   rather than assumed.
