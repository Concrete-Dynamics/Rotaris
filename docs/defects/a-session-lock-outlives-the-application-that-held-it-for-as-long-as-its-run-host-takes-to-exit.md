## A session's lock outlives the application that held it, for as long as its run host takes to exit

A session opened in one instance of the application is refused to the next instance with "Session S1200 is held by
another run in this application (pid 27377). Finish or stop that run first." when that next instance opens it within
about a second and a half of the first instance's main process exiting. The pid named is the FIRST instance's run
host — a utility child that main's exit does not wait for — and the lock's liveness check finds it still answering.
No run holds the session; a process that is shutting down does.

Seen 2026-09-28 in `transcript-proof` on Linux as root: the invariance launch's main exited at 08:07:11, its run host
(pid 27377) was still alive at 08:07:14.267 when the behaviour launch — a separate process the proof started once
`spawnSync` had returned — opened the same session, and the open was refused with the message above. The proof's four
earlier runs that day did not hit the window; the fifth did. The proof now waits for a launch's children to be gone
before the next launch (`apps/desktop/scripts/transcript-proof.mjs`, `launch`), which removes the race from the harness
and leaves the behaviour in the product.

Whether a person can meet it: REQ-STARTUP-161 keeps one instance per user account, so two instances do not run
together — but a quit followed by an immediate relaunch (the update restart of REQ-STARTUP-123, a crash's recovery, a
user re-opening the app) puts the new main process's session open in the same window if the old run host has not yet
exited. The message would then tell the user another run holds the session when nothing does, and the resume would be
refused until the next attempt.

## Specs

REQ-SESSION-186 and the lock's own rule (the run host holds a session while a run uses it; `packages/engine/src/sessions.ts`,
`lock-held-local`) — neither says the hold must end with the application that made it; the hold is keyed on the run
host's pid and released by its exit, and main does not wait for that exit before it is gone itself (`main/exit.ts`
races each child's shutdown against its exit, by design, PD-MONITOR-002's round). Not a contradiction of a stated
requirement; recorded as a window a reading of "is held by another run in this application" does not expect.

## Relevant files

- `packages/engine/src/sessions.ts` — the `lock-held-local` refusal and its pid liveness check.
- `apps/desktop/src/main/exit.ts` — the quit racing each child's shutdown against its exit.
- `apps/desktop/scripts/transcript-proof.mjs` — `launch` now waits for a launch's children before the next launch.
