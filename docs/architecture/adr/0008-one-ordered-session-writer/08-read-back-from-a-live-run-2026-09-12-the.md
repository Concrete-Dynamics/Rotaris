# ADR-0008 — One ordered session writer per session, owning the session's transactions — Read back from a live run — 2026-09-12: the compression aggregate was declared and never raised

Part 8 of 8 of [ADR-0008](../0008-one-ordered-session-writer.md), which indexes every part.

## Read back from a live run — 2026-09-12: the compression aggregate was declared and never raised

*A defect of this record's own mechanism, found by reading the store after a 22-minute run rather than by
reading the code, and recorded here because this is where "maintained, not recomputed" was decided.*

**Measured.** Three `context_compressed` timeline entries against `sessions.compressions = 0`. The
per-agent counter of `REQ-MONITOR-086` said three for the same run, so the product held two records of one
fact and they disagreed.

**Found.** `run/aggregates.ts` declared `compressions`, rehydrated it from the row under `REQ-SESSION-169`
and copied it into every `patch()` under `REQ-SESSION-168` — and had no increment method at all. The figure
was complete at both ends of its life and empty in the middle. Nothing in the earlier note caught it because
the note proves the COPY, and a copy of zero is a correct copy.

**The falsified reason, kept beside its replacement.** The section above enumerates the counters
`REQ-SESSION-139` names and says the writer "adjusts them inside the transaction that inserts an evidence
row". That is true of the tool-call and token figures, whose events ARE evidence rows. A compression is not
an evidence row: it completes in `run/compression.ts`, writes a timeline entry and a transcript row, and
inserts nothing the writer would adjust a counter for. The rule as stated therefore had no reach over the
fourth figure, and the code inherited the gap. Restated: **every figure `REQ-SESSION-139` names is raised
where its event completes**, which for three of the four is inside the writer's transaction and for the
fourth is the compression runner.

**Built.** `Aggregates.addCompression()`, called from the one place a compression completes — beside
`writer.activity.compressed(agent)` in `CompressionRunner.runOnce`, on the same line of reasoning that the
two counters count the same event — reached through an optional `onCompressed` on the per-agent
`TurnCompression` that `run.ts` supplies. Every agent's compressor, the root's and each child's, raises the
one session figure, because `REQ-SESSION-139`'s aggregate is the session's and not an agent's.

**Refused: counting the timeline back at save time.** It would close the gap and it is what this record
exists to forbid; a per-save scan is the cost the decision above removes. Proved by
`packages/engine/src/run/compression.test.ts`, which asserts the persisted aggregate equals the number of
`context_compressed` entries the same run wrote.
