# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step — Consequences accepted

Part 5 of 8 of [ADR-0043](../0043-authoritative-ui-state-and-the-replica.md), which indexes every part.

## Consequences accepted

1. Serialisation cost on every update, which ADR-0044 must budget for against the 250 ms p95.
2. **Replica drift is possible in principle, so the decline-and-re-read path is load-bearing** and must
   be exercised by tests rather than treated as an error branch — in normal operation it never fires.
   The sequence number makes drift *detectable*; it does not make it impossible.
3. Main becomes a relay that must never do unbounded work synchronously on the update path, or a slow
   relay stalls every window. Under the sequence contract it acquires a second obligation: it must not
   reorder or coalesce, because either would manufacture a gap the surface would then reconcile from.
4. `REQ-MONITOR-217`'s "every field any surface can display" is enforced by deriving the snapshot type
   from the session record type (ADR-0010), so adding a field to the record changes the payload by
   definition.
5. **The projection holds live transcript rows in memory beside the writer's own copy.** The 5000-row
   residency bound of `REQ-SESSION-192` bounds it and the paging path already exists for anything older,
   so this is a second bounded copy rather than an unbounded one — but it is a second copy, and
   `REQ-MONITOR-242`'s equality is a property of two in-memory structures agreeing rather than of one
   being read twice. *The earlier consequence that the projection and every replica are legitimately
   ahead of `state/ui_transcript.json` by up to one debounce window is withdrawn with the debounce: a
   published row is a committed row.* What survives from it is the comparison rule —
   `REQ-MONITOR-292` and `REQ-MONITOR-242` compare the view against **what a reattach restores**
   (`REQ-SESSION-196`), not against an intermediate artifact of the write path.
6. **The counter is per session and lives only as long as the session is live.** It is not persisted and
   does not survive a run-host crash; a session recovered as stale and then reopened is opened from its
   record (`REQ-SESSION-196`) rather than resumed at a sequence number, and if it is continued the new
   run's counter starts at 1 again. Nothing may treat the number as a durable identity or compare
   numbers across runs.
7. **Diagnostics gain two counters that must be watched, not merely recorded** — publications dropped at
   a full subscriber queue, and reconciles triggered by a gap. They are the only signal that the
   no-polling design has degraded into an accidental polling design.
