# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — The listing record's `checkpoint_count` is this record's derived count — 2026-10-03 (fin11)

Part 10 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## The listing record's `checkpoint_count` is this record's derived count — 2026-10-03 (fin11)

A defect note asked whether `Sessions.list`, which fills each row's count with `StoreDal.checkpointCount` (a `count(*)`
over that session's rows), breaks REQ-SESSION-042's "read nothing but those listing records"
([`the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md`](../../../defects/fixed/the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md)).
The reading recorded here: the count this record derives **is** REQ-SESSION-030's `checkpoint_count` field, held as a count
over rows rather than stored twice. It reads no session state, transcript or history, and no Git. Nothing in the code
changed. The same note's other half (the sessions card's token, duration and detail labels) waits on OQ-192. *(Ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the labels stay and the listing record gains the three fields, [`PD-SESSION-001`](../../../product/directives/pd-session-001.md#pd-session-001); the note is closed.)*
