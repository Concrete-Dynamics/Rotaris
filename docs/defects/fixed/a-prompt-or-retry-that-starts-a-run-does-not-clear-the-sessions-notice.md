## A prompt or a retry that starts a run does not clear the session's notice

Recorded 2026-10-06 by the builder of finacc2's `accept1-2`, noticed while repairing
`docs/defects/fixed/a-run-that-fails-before-its-window-subscribes-raises-the-background-failure-warning-about-the-session-on-screen.md`;
not fixed there.

Main clears the standing notice for a run start (`NoticeStore.clearForRunStart`) in exactly two places: `session.start`
(`commands/session.ts`) and an improvement's start (`commands/improvements.ts`); since that repair, also REQ-NOTIFY-070's
fallback restart (`RunFailurePublisher`). `session.prompt` and `session.retry` also launch a run — the run host's
`dispatch.ts` says so ("a prompt on a resumed session launches a run", "a retry launches a run as a prompt does") — and
their main handlers clear nothing. So a failed run's notice ("The run failed", or REQ-NOTIFY-032's warning about that
session) stays on screen after the user's retry or next prompt has started a new run of the same session, until something
replaces it or the user dismisses it. Read from the code only; not reproduced in the built app.

## Specs

- REQ-NOTIFY-058: "A run starting … clears any notice that is unscoped or scoped to that same session".
- REQ-NOTIFY-029: the scoping of that clear.
- REQ-NOTIFY-045: the retry is a run of the session.

## Relevant files

- `apps/desktop/src/main/commands/session.ts` — `session.prompt`, `session.retry` (no clear) beside `session.start` (clears).
- `apps/desktop/src/run-host/dispatch.ts` — `session.prompt` / `session.retry` launch a run.
- `apps/desktop/src/main/notices.ts` — `clearForRunStart`.

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

Not taken by finacc2's open repair (accept1-6): `origin/main` at `9e2b9b3` still held the note open and no branch touched
the handlers, so it was built here.

Main clears the standing notice (`NoticeStore.clearForRunStart`, REQ-NOTIFY-029's scoping) on every command that launches a
run of an existing session, once the run host has launched it: `session.prompt` and `session.retry` on their `ack` (the
engine answers one only after `launchContinuation`; it refuses a prompt while a run is active), and, found by the same
reading, `session.continue` when it `resumed`, `session.planDecision` when it `relaunched`, and the recovery dialog's two
restarts (`AuthRecovery.retry` and `reauthenticate` on `session.authRestarted`, through a new `clearForRunStart` dependency
wired in `apps/desktop/src/main/index.ts`), each of which goes through `launchContinuation` as well. A refused command, a
continue that left the session paused and a decision that left it at rest clear nothing; the dialog's Cancel still leaves
the notice (REQ-NOTIFY-080).

Pinned by `apps/desktop/src/main/commands/session.test.ts`, "REQ-NOTIFY-058: a run of an existing session starting clears
its notice" (two cases), and `apps/desktop/src/main/auth-recovery.test.ts`, "REQ-NOTIFY-058: a restart the dialog asks for
clears the session's notice once the run host restarted it, and only then"; all three red without the repair. The runtime
view's focus-gate passage says so. Not shown in the built app: no proof drives a failed run followed by a retry; a live run
that fails and is retried from its notice would show the notice gone once the retry's run starts.
