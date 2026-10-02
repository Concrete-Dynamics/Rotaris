## A background run's non-failure ending raises its summary, not a notice naming the session

A run that reaches a terminal state that is not a failure raises the same notice whether or not its session is the one on
screen: the run's summary as the title, at the severity summarisation assigned, its failure text (where any) as detail, and
no action (`runEndingPublication`'s last branch, `apps/desktop/src/main/run-failure-notice.ts`, called from main's run-result
handler in `apps/desktop/src/main/index.ts`). For a run other than the focused one, REQ-NOTIFY-031 asks for a persistent
notice naming that session and the state it reached — `success` where the state normalises to `completed`, `info` for every
other non-failure terminal state — whose body states that the session on screen is unaffected and that the finished session
can be opened for review, offering an action focusing that session. None of that is built: a background session finishing
replaces whatever notice stands with a summary that does not say which session it is about and offers no way to it.

Noticed 2026-10-02 while repairing `fin6-auth-recovery-2`'s finding that an unfocused session's 401 opened the recovery dialog
over another session's window: that repair built REQ-NOTIFY-032 (a non-focused FAILED run raises a warning naming the
session and holds its class publication until the session is followed) for every failure class, and left the non-failure
half (REQ-NOTIFY-031) as it was. Recorded, not repaired: the focus test is there (`RunFailurePublisher`'s `isFocused`,
`MainWindows.followerOfSession`), but REQ-NOTIFY-031's wording, its severity mapping over the normalised states and its
"replaced by REQ-NOTIFY-032's notice" rule are their own work.

## Specs

- REQ-NOTIFY-031 — a non-focused run's non-failure terminal state is not reported as a persistent notice naming the session,
  with the body and the focusing action the requirement fixes, at `success` or `info`.
- REQ-NOTIFY-028 — the notice carries no session, so it is recorded against whichever session is focused when it is applied.

## Relevant files

- `apps/desktop/src/main/run-failure-notice.ts` — `runEndingPublication`: a non-failure ending's notice, the same whatever
  the focus.
- `apps/desktop/src/main/index.ts` — the run-result handler that publishes it.
- `apps/desktop/src/main/main-windows.ts` — `followerOfSession`, the focus test REQ-NOTIFY-032's gate already uses.
