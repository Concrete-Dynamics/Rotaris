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
