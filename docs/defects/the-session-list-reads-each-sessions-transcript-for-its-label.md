## The session list reads each session's transcript for its label

`Sessions.list` (`packages/engine/src/sessions.ts`) labels each listed session with its first submitted prompt, which it
finds by reading that session's resident transcript rows (`dal.residentRows(...)`, up to `RESIDENT_ROW_CAP` rows per
session) and taking the oldest `user` row among them. Two things follow. Building the list reads every listed session's
transcript, so its cost grows with the transcripts and not only with the number of sessions. And once a session has more
rows than the resident window holds, its first prompt has been released to a page, so the label silently becomes the
oldest prompt still resident (a later one), or the session id where none is: the same session is listed under a
different name after a long run. Noticed 2026-10-02 by fin8 while replacing the engine's other resident-window readings
of a session's prompt
([the-continue-reads-the-last-prompt-from-the-resident-window-and-falls-back-to-the-session-id.md](fixed/the-continue-reads-the-last-prompt-from-the-resident-window-and-falls-back-to-the-session-id.md));
not repaired there: the listing's label is a different reading (the first prompt, not the last) and its repair is the
listing record's, not the transcript's.

## Specs

- REQ-SESSION-042: "Building the list MUST read nothing but those listing records — not a session's state, not its
  transcript, not its history — so the cost of listing grows with the number of sessions and with nothing else."
- REQ-SESSION-154: the row's label is the task title, else the launcher-known name, else the session id; a label that
  changes when rows are released is none of these consistently.

## Relevant files

- `packages/engine/src/sessions.ts`: `list`, its `firstPrompt` read over `dal.residentRows`.
- `packages/store/src/dal.ts`: `residentRows`, and the `sessions` listing record, which carries no title.
