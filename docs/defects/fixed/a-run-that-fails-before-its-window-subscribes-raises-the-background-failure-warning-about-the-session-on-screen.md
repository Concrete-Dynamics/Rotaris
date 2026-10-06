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

## Outcome

Repaired 2026-10-06 on branch `finacc2-accept1-2`, in two parts.

- **The window that starts a session shows it from the start (REQ-NOTIFY-032, REQ-NOTIFY-030).** `session.start` now
  mints every start's id — the base tree's too, which the run host previously minted — and marks it as the asking window's
  start (`MainWindows.beginStart`) before the run host is asked; the window's `session.subscribe` (or its unsubscribe or
  release, or a refused start, `endStart`) clears the mark. The focus test of a run's ending is `MainWindows.showingSession`:
  the window following the session among its subscribers, else the window starting it. `followerOfSession`, the
  subscription rule and the routing through `ownerOfSession` are unchanged. The renderer follows every session it starts
  (`session-actions.ts`), so this is the follow main used to learn of too late. Pinned by `main-windows.test.ts`
  ("the window starting a session shows it before it subscribes …") and `commands/session.test.ts` ("REQ-NOTIFY-030/032: the
  window that starts a session follows it from the start"), each red on the old code.
- **REQ-NOTIFY-070's restart clears the session's notice as a run start does (REQ-NOTIFY-058/029).** `RunFailurePublisher`
  gains `clearForRunStart` and calls it for the `restarted` outcome, so a failure held while the session was not on screen
  — the ordinary REQ-NOTIFY-032 path — and restarted on its fallback when the user focuses it no longer leaves the warning
  beside the prompt; a notice about another session survives. Pinned by `run-failure-notice.test.ts` ("REQ-NOTIFY-032 with
  REQ-NOTIFY-058/070: two notices about one failure are never on screen at once", driven through the real notice store),
  red on the old code. The repair did not withdraw the warning in `focused()`: REQ-NOTIFY-040 lets a notice leave only by
  replacement, a run-start clear or the user's dismissal.

**The proof.** The race needs the 401 to end the run before the renderer's subscription reaches main, which a quiet host
does not give: resilience-proof's `auth-fallback`, `auth-fallback-dialog` and `generic` all passed on the old build at load
8 to 19 with no "run failure:" line logged. A verification seam, `ROTARIS_CAPTURE_SUBSCRIBE_DELAY_MS` (capture only, pinned
in `commands/session.test.ts`), holds the subscription before it takes effect, and the `auth-fallback` launches set it to
600 ms. The proof now asserts, in `auth-fallback` (all three variants), `auth-fallback-dialog` and `generic`, that main never
logs "run failure: session … is not focused" for the session the window started, and in `auth-fallback` that the notice
slot holds no "Session … failed" / "The session on screen is unaffected". On the old product with the seam,
`auth-fallback` failed at 03:53 UTC (load 8.32 to 8.76): "main read the failure of the session this window started as
another session's (REQ-NOTIFY-032)", the log holding "is not focused; REQ-NOTIFY-032's notice is raised" 76 ms after the
held subscription began. On the repaired build `generic`, `auth-fallback` (with `-minimum` and `-plan`) and
`auth-fallback-dialog` passed at 03:54 UTC (load 11.62 to 15.96), no "run failure:" line logged, and `auth-fallback-plan`'s
notice slot empty beside the prompt. The whole of resilience-proof then passed on the repaired build (21 scenarios,
`failures: []`, 03:55 to 04:03 UTC, load 14.76 to 11.98), and notice-proof, whose `background-ending` and
`background-quota` drive the focus test for a session no window follows, passed (04:03 to 04:04 UTC, load 11.98 to 7.90).

Noticed while repairing, recorded and not fixed:
`docs/defects/fixed/a-prompt-or-retry-that-starts-a-run-does-not-clear-the-sessions-notice.md`.
