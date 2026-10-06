## The session list reads each session's transcript for its label

`Sessions.list` (`packages/engine/src/sessions.ts`) labels each listed session with its first submitted prompt, which it
finds by reading that session's resident transcript rows (`dal.residentRows(...)`, up to `RESIDENT_ROW_CAP` rows per
session) and taking the oldest `user` row among them. Two things follow. Building the list reads every listed session's
transcript, so its cost grows with the transcripts and not only with the number of sessions. And once a session has more
rows than the resident window holds, its first prompt has been released to a page, so the label silently becomes the
oldest prompt still resident (a later one), or the session id where none is: the same session is listed under a
different name after a long run. Noticed 2026-10-02 by fin8 while replacing the engine's other resident-window readings
of a session's prompt
([the-continue-reads-the-last-prompt-from-the-resident-window-and-falls-back-to-the-session-id.md](the-continue-reads-the-last-prompt-from-the-resident-window-and-falls-back-to-the-session-id.md));
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

## Outcome — repaired 2026-10-02 (fin10, bundle `fin10-strip-notices-and-listing`)

`Sessions.list` labels each row from its listing row alone: REQ-SESSION-032's task title, derived from the row's own
persisted todo (`sessionTaskTitle`, `packages/engine/src/todo-view.ts`: the last non-blank task name across the planner's
phases, a task's name where it has one, else its text; empty when there is none), else the session id (REQ-SESSION-030's
reader default), cut at 80 characters as before. The `residentRows` read is gone, so building the list reads no transcript.
No migration: every listing row carries `todo`, and every run writes its todo at `starting`. **The reading taken:** the
session's task list is the planner's document (REQ-ORCH-004's todo, which a run seeds with its task); the agent's own plan
(REQ-TOOLS-144, the version-2 envelope's `agent`) is not the session's task list and gives no title.

**A visible change the specification mandates:** a session is now labelled with its newest top-level task — its latest
prompt, or a queued prompt's task name (`Queued Prompt: <id>`, REQ-CHAT-040) — rather than its first prompt, and a session
that never saved a todo reads its id. Keeping the first prompt would be a product directive over REQ-SESSION-030/032/154,
which is the owner's to issue; the REQ-SESSION-042 half (read nothing but the listing record) holds either way.

Pinned by `packages/engine/src/sessions.test.ts`: `sessionTaskTitle` over planner documents, phases, blank names, a queued
prompt's name and the version-2 envelope, and empty for no, malformed or blank todo; and `list` over a DAL whose transcript
reads throw — a session whose first prompt was released past `RESIDENT_ROW_CAP` labelled with its newest task, a one-prompt
session with its prompt, a row with no todo with its id. All three failed before the repair (`sessionTaskTitle` absent; the
listing read `residentRows`). Shown in the built app by `apps/desktop/scripts/sessions-proof.mjs` (2026-10-02, load about 1.5,
nothing else running; 11 scenarios passed): after the seed's run, the live run cut mid-run and a relaunch, session A's
browser row reads its newest task `Wait a while.` and not its first prompt `Write the notes.` (`repair-one`), and the
planted `B-nolock`, `C-deadlock` and `D-live`, each with a prompt row and no todo, read their ids (`repair-all`).

Noticed while repairing, recorded and not repaired:
[the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md](the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md).
