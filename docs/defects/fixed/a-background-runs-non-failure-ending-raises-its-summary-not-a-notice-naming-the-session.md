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

## Outcome

Repaired 2026-10-02 (fin8, bundle `fin8-noticed-gaps-4`). The specification decides it (REQ-NOTIFY-031, with REQ-MONITOR-202),
so no question was raised.

- `unfocusedEndingNotice` (`apps/desktop/src/main/run-failure-notice.ts`): persistent, titled `Session <id> <state>` with the
  state in the normalised vocabulary (`presentationStatus`, REQ-NOTIFY-048/049 — `paused_message_limit` and
  `awaiting_plan_decision` read `paused`, `interrupted` `idle`, never the raw status), at `success` where it is `completed`
  and `info` for every other non-failure ending, the body "The session on screen is unaffected. Open the finished session to
  review it.", the action "Open the session" (`focus-session`), and the session's id, so a starting run of another session
  does not clear it (REQ-NOTIFY-029) and it reads as unread (REQ-NOTIFY-028). It names the session by its id, as
  REQ-NOTIFY-032's sibling does.
- Main's run-result handler sends every non-failure ending through `RunFailurePublisher.endedOtherwise`, the focus test the
  REQ-NOTIFY-032 gate already used (`MainWindows.followerOfSession`): a session a main window follows raises the notice
  `runEndingPublication` decided, as before; any other raises REQ-NOTIFY-031's in its place. Nothing changes the focus.
  REQ-NOTIFY-032's warning replaces it in the one slot where a later failure follows (REQ-NOTIFY-024). A run a cancelled
  quota wait ended is one of these endings: not on screen, it raises REQ-NOTIFY-031's `info` notice, not REQ-NOTIFY-063's,
  and nothing brings REQ-NOTIFY-063's (with its model-settings action) at the focus — recorded, not repaired, in
  [`a-background-run-ended-on-a-provider-limit-loses-its-quota-notice.md`](../a-background-run-ended-on-a-provider-limit-loses-its-quota-notice.md).
- Found while showing it: after "New session" the window shows no session (REQ-MONITOR-249/252) but main went on counting the
  released one as followed until the next prompt subscribed another, so the most common way a run goes to the background
  still raised its summary — and a failure there published its class notice at once rather than REQ-NOTIFY-032's. A new
  renderer command, `session.release` (`packages/contracts/src/commands.ts`, `apps/desktop/src/main/commands/session.ts`),
  clears the sender's follow in `MainWindows` and nothing else (the relay subscription stays, so the run's background
  notices and terminal frames still reach the window); the renderer's `acceptLaunch` sends it for the session it releases.

Pinned by `apps/desktop/src/main/run-failure-notice.test.ts` (the notice's words, severities and the normalised state; the
publisher raising the run's own notice for a focused session and REQ-NOTIFY-031's for any other — both red before) and
`apps/desktop/src/main/commands/session.test.ts` (`session.release` clears the follow, unsubscribes and detaches nothing —
red before). Shown by `notice-proof`'s new driven section 8, `background-ending` (2026-10-02, load 0.9, every section
green): a run held 6 s by its scripted step, "New session" accepted from the Overview meanwhile, and on its completion the
slot holds "Session <id> completed" at `success` with the body and "Open the session" (`background-ending.png`) while the
window still shows the empty new session; the action then puts the finished session on screen
(`background-ending-focused.png`). The scenario turns the improvement collector off, whose own notice follows a completed
run within seconds and would replace this one in the single slot. Not run on the code before the repair (the unit tests are
the red evidence).
