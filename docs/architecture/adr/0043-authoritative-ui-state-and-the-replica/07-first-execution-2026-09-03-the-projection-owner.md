# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step — First execution — 2026-09-03, the projection owner and the replica end to end

Part 7 of 8 of [ADR-0043](../0043-authoritative-ui-state-and-the-replica.md), which indexes every part.

## First execution — 2026-09-03, the projection owner and the replica end to end

*Recorded under GD-10.*

**Built and run:** `packages/engine/src/projection-owner.ts` — one per live session, fed by the
writer, holding the resident rows beside the writer's copy, owning the counter, the sole publisher;
and the replica's step-0 check extended with `REQ-SESSION-161`'s **decline**: an increment whose
earliest-changed index precedes the oldest row held is refused, costs one whole read, and leaves the
rows on display untouched (a genuine reset at index 0, `REQ-MONITOR-229`, is not a decline). Paging
older rows (`REQ-CHAT-165`) is a command answered from any page, placed above what is held. The
end-to-end test runs writer → owner → replica in one process against a real store with a controlled
clock, and the application ran the same path across three processes: a typed prompt, then
`applied 1 · reset 1 · refused 0` in the status strip.

**Found: one thing about this record's own shape, not a defect.** A whole-session update now
**clears the replica's transcript**, because the attach and the reconcile both re-deliver it on the
increment channel immediately after (`REQ-SESSION-161`) and a snapshot alone cannot say which rows
survived. The earlier replica kept rows across a snapshot; that was only safe while nothing published
one.

**Not exercised:** several windows on one session; a hidden window's unsubscribe (`REQ-SHELL-151`);
the subscriber-queue drop of point 7; the two diagnostics counters as instruments (ADR-0052).
