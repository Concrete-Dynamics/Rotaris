## A run that fails before its window subscribes raises the background-failure warning about the session on screen

Recorded 2026-10-06 by acceptance round 1 of finacc2 (finding A1), on merged `main` at `27a5127`.

`RunFailurePublisher.failed` asks the focus test, which in `index.ts` means that a main window that is a relay subscriber of
the session follows it. A session the window has just started counts as followed only once the renderer's
`session.subscribe` arrives, which it sends after `session.start` has answered. A run that fails before that — in
resilience-proof's `auth-fallback-plan` the scripted 401 came 30 ms after the start and the subscription 27 ms after the
failure — is read as another session's failure: REQ-NOTIFY-032's persistent warning is raised ("Session <id> failed — The
session on screen is unaffected. Open the failed session to see its recovery.") and the class is held. `focused()` then
publishes the class; for a first authentication failure with a usable fallback that is the restart, its transient
acknowledgement and the non-modal prompt of REQ-NOTIFY-070/071, and none of them replaces the warning. The user is left with
a banner saying their own session failed and is unaffected, beside a prompt saying it continues on the fallback: two notices
about one failure.

The same leftover follows the ordinary REQ-NOTIFY-032 path: a background session that fails with a first 401 raises the
warning, and focusing it ("Open the session") restarts it on the fallback and opens the prompt, leaving the warning on
screen beside them, though the restart is a run of that session starting (REQ-NOTIFY-058).

Evidence: `scratchpad/accept1b/resilience-proof-run1-evidence/auth-fallback-plan.log` of the orchestration (line 21 the start
at 02:45:16.251, line 37 "is not focused; REQ-NOTIFY-032's notice is raised" at .281, line 39 "is focused" at .308, line 43
the restart, lines 57-58 the `.notice-slot` probe still holding the warning at 02:45:21), at load 10.54 to 7.47.
resilience-proof's notice check matched only "The run failed" and a bare "Authentication failed", so it let the text through.

## Specs

- REQ-NOTIFY-032: the warning is for "a run other than the focused one", and "two notices about one failure are never on
  screen at once". The session the window just started is the focused one.
- REQ-NOTIFY-058 / REQ-NOTIFY-029: a run starting clears a notice scoped to that session; REQ-NOTIFY-070's restart is a run
  of the session starting, and it left the session's warning standing.
- REQ-NOTIFY-030, REQ-NOTIFY-070, REQ-NOTIFY-071.

## Relevant files

- `apps/desktop/src/main/run-failure-notice.ts` — `RunFailurePublisher.failed` (the not-focused branch), `focused`,
  `publish` (the `restarted` outcome publishes nothing), `unfocusedFailureNotice`.
- `apps/desktop/src/main/index.ts` — the publisher's `isFocused`, through relay subscribers only.
- `apps/desktop/src/main/commands/session.ts` — `session.start` (main learns of the window's follow only at
  `session.subscribe`), `session.subscribe` (calls `runFailures.focused`).
- `apps/desktop/src/main/main-windows.ts` — `followerOfSession`, `setFollowedSession`.
- `apps/desktop/scripts/resilience-proof.mjs` — the notice check that let the warning through.
