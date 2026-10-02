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
([the-session-list-reads-each-sessions-transcript-for-its-label.md](fixed/the-session-list-reads-each-sessions-transcript-for-its-label.md));
not repaired there (outside that task).

## Specs

- REQ-SESSION-042: "Building the list MUST read nothing but those listing records — not a session's state, not its
  transcript, not its history".
- REQ-SESSION-030: `checkpoint_count` is one of the listing record's fields, and "Every attribute a listing shows about the
  session itself MUST be one of these".

## Relevant files

- `packages/engine/src/sessions.ts`: `list`, its `checkpointCount` read per row and its `tokens`, `durationLabel`, `detail`.
- `packages/store/src/dal.ts`: `checkpointCount` (ADR-0039's derived count) and `listSessions`.
