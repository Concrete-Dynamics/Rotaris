# ADR-0008 — One ordered session writer per session, owning the session's transactions — First execution — 2026-09-03, the session writer

Part 6 of 8 of [ADR-0008](../0008-one-ordered-session-writer.md), which indexes every part.

## First execution — 2026-09-03, the session writer

*Recorded under GD-10.*

**Built and run:** `packages/engine/src/session-writer.ts`. One transaction per unit of work: the
transcript row, its `transcript.row` event and the session's `updated_at` commit together; the
resident-window release happens in the same transaction before the append that would exceed the cap
(`REQ-SESSION-192`: the 5,001st append releases the oldest 50 as page 1, indices untouched, the
released rows unreachable to the settle path); the trim is its own transaction after the append that
overflowed `cap + cap ÷ 8`, keeping the newest `cap`, with the four-fact truncation record inside it;
a recording failure is sticky, warned exactly once, and later recordings return a failure value with
the store untouched; a terminal-status save commits at the stronger setting and is readable by a
second connection before it returns. All of it is tested against a real store with a controlled
clock, and it runs in the application: a prompt typed into the composer became row 0 of a new session,
its event ordinal 2 behind `session.start`.

**Found: nothing in this record's mechanism.** The queue this record argues for at length is, under a
synchronous binding, call order on one thread — a save is durable when `save()` returns and `flush()`
is the no-op `REQ-SESSION-067` describes. That is not a simplification of the record; it is what the
record's alternative B refused a promise-based queue *for*.

**What it did not build:** the metric aggregates (`REQ-SESSION-139`), the launch audit
(`REQ-SESSION-138`), `summary.md` (`REQ-SESSION-028`'s one file), the evidence rings of ADR-0024, and
the tee to consumers with its 5 s bound (`REQ-EVENTS-165`) — each lands with the mechanism that
produces its rows. Spike 8 and spike 18 were taken with this build; see
`../spikes/store-schema-and-open-path.md` and `../spikes/two-writers-one-store.md`, and ADR-0009's
note for what they changed.
