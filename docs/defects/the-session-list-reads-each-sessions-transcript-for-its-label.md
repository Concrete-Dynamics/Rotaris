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

*Amended 2026-10-02 (fin10, before the repair).* The label is not the first prompt's to keep. REQ-SESSION-154 labels a row
with the task title, and REQ-SESSION-030 and REQ-SESSION-032 define it: `task_title` is a listing-record field "derived
from persisted todo state as the last non-blank task name across phases (the newest top-level task)", empty when there is
none, its reader default the session id. The build derives no such title anywhere (`task_title` appears in no source file
on `origin/main` 97e1de4). No migration is owed: every listing row already carries the session's persisted todo (the
`todo` column of `SessionRow`, read by `listSessions`), and every run seeds its todo with its task (`Todo.fresh`) before
its `starting` save, so a just-launched run carries a title from its first save. A repair to the specification is
therefore visible: the label becomes the session's newest top-level task — the latest prompt, or a queued prompt's task
name — rather than its first prompt, and a session that never ran reads its id. Keeping the first prompt would be a
product directive over REQ-SESSION-030/032/154, which is the owner's to issue; the REQ-SESSION-042 half (read nothing but
the listing record) holds either way.

## Specs

- REQ-SESSION-042: "Building the list MUST read nothing but those listing records — not a session's state, not its
  transcript, not its history — so the cost of listing grows with the number of sessions and with nothing else."
- REQ-SESSION-154: the row's label is the task title, else the launcher-known name, else the session id; a label that
  changes when rows are released is none of these consistently.
- REQ-SESSION-030 / REQ-SESSION-032: `task_title` is the listing record's, derived from the persisted todo state (the newest
  top-level task), its reader default the session id; the build reads the first prompt instead.

## Relevant files

- `packages/engine/src/sessions.ts`: `list`, its `firstPrompt` read over `dal.residentRows`.
- `packages/store/src/dal.ts`: `residentRows`, and the `sessions` listing record, which carries no title column but does
  carry the persisted todo (`SessionRow.todo`) the title is derived from.
- `packages/engine/src/todo-view.ts`: `decodeStoredTodo`, the persisted todo's one reader; `packages/engine/src/run/todo.ts`:
  `taskTitle`, a task's name where it has one, else its text.
