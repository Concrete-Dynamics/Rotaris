## The session list counts each session's checkpoints from the checkpoint table

`Sessions.list` (`packages/engine/src/sessions.ts`) fills each row's `checkpointCount` with `dal.checkpointCount(...)`, a
`count(*)` over that session's rows in the `checkpoints` table, so building the list still reads one store table per
listed session beside the listing records. REQ-SESSION-030 makes `checkpoint_count` a field **of the listing record**, and
REQ-SESSION-042 says building the list reads nothing but those records (and, for staleness, the lock record). ADR-0039's
"derived from the rows, never stored twice" (the comment on `StoreDal.checkpointCount`) is the reason the count has no
column; whether that ADR's choice governs the listing, or the listing record owes the count as a column, is not settled
here. The listing rows also carry figures from outside REQ-SESSION-030's field set (`tokens`, `durationLabel`, `detail`
from `workspace_root`), which the Overview draws. Noticed 2026-10-02 (fin10, bundle `fin10-strip-notices-and-listing`)
while removing the list's transcript read
([the-session-list-reads-each-sessions-transcript-for-its-label.md](the-session-list-reads-each-sessions-transcript-for-its-label.md));
not repaired there (outside that task).

## Status (2026-10-03, fin11)

- **The checkpoint half is closed, as a reading and without a code change.** ADR-0039 makes `checkpoint_count` "derived,
  not stored twice: a count over that session's checkpoint rows". That count **is** the listing record's
  `checkpoint_count` (REQ-SESSION-030): the field is held in the store as a count over rows in the same database, not as a
  second copy, and reading it reads no session state, transcript or history (REQ-SESSION-042's three exclusions) and no
  Git (REQ-GIT-018). Recorded beside ADR-0039's first execution as well.
- **The label half is open on the owner**:
  [OQ-192](../../architecture/open-questions.md) ("The sessions card's rows carry a token label, a duration label and a detail
  caption, which the listing record's closed field set does not hold"). REQ-MONITOR-171 requires the three labels on each
  sessions-card row; REQ-SESSION-030's closed field set forbids them. The build proceeds under REQ-MONITOR-171, the three
  read from the same session row as the listing record. This note stays open until that question is ruled.

## Specs

- REQ-SESSION-042: "Building the list MUST read nothing but those listing records — not a session's state, not its
  transcript, not its history".
- REQ-SESSION-030: `checkpoint_count` is one of the listing record's fields, and "Every attribute a listing shows about the
  session itself MUST be one of these".

## Relevant files

- `packages/engine/src/sessions.ts`: `list`, its `checkpointCount` read per row and its `tokens`, `durationLabel`, `detail`.
- `packages/store/src/dal.ts`: `checkpointCount` (ADR-0039's derived count) and `listSessions`.

## Ruled as built — 2026-10-06 ([R-071](../../product/requests.md#r-071)); closed

The owner kept the three labels and amended the listing record's field list to include the token total, the run start time and the workspace path (OQ-192, ruled in [`open-questions.md`](../../architecture/open-questions.md); [`PD-SESSION-001`](../../product/directives.md#pd-session-001) narrows REQ-SESSION-030). The label half is closed by that ruling, the checkpoint half having closed on 2026-10-03; the duration label stays the latest run's. Nothing is changed in the code.
