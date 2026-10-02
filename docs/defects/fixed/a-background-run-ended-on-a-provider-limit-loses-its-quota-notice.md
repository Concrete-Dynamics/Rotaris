## A background run that ended on a provider limit loses its quota notice and its model-settings action

A run that ends otherwise than failed on a provider limit (a cancelled quota wait) publishes REQ-NOTIFY-063's quota
notice where its session is on screen (`runEndingPublication`'s `isQuotaFailure` branch). Since the background-ending
repair (2026-10-02, fin8, bundle `fin8-noticed-gaps-4`), a session not on screen raises REQ-NOTIFY-031's `info` notice
naming it in its place (`RunFailurePublisher.endedOtherwise`), and nothing holds the quota notice for the session's focus,
as `RunFailurePublisher` holds a failure's class notice under REQ-NOTIFY-032. Focusing the session therefore never brings
the provider-limit statement or its "open model settings" action: a quota condition that ended the run reaches the user
as a plain ending. Noticed by the verifier of that repair and recorded 2026-10-02; not repaired (outside its task).

## Specs

REQ-NOTIFY-093 says a quota or rate-limit condition that ends a run is reported through REQ-NOTIFY-062/063's
classification, which a background session of this shape never receives. REQ-NOTIFY-031 covers "a terminal state that is
not a failure", and REQ-NOTIFY-032's hold-until-focus covers a run "that fails"; neither names a run a cancelled quota wait
ended, so which notice it raises while not focused, and whether REQ-NOTIFY-063's arrives with the focus as under
REQ-NOTIFY-030, may need an open question before a repair.

## Relevant files

- `apps/desktop/src/main/run-failure-notice.ts` — `runEndingPublication` (the `isQuotaFailure` branch decides the focused
  notice), `RunFailurePublisher.endedOtherwise` (raises `unfocusedEndingNotice` for any other session, holding nothing),
  `RunFailurePublisher.focused` (publishes only a held failure class).
- [`a-background-runs-non-failure-ending-raises-its-summary-not-a-notice-naming-the-session.md`](a-background-runs-non-failure-ending-raises-its-summary-not-a-notice-naming-the-session.md) — the
  repair that made the unfocused ending REQ-NOTIFY-031's.

## Outcome — repaired 2026-10-02 (fin10, bundle `fin10-strip-notices-and-listing`)

No open question was needed: the build met REQ-NOTIFY-093 under no reading, since a background run that ended otherwise
on a quota condition never received REQ-NOTIFY-063's report. **The reading the repair takes**: REQ-NOTIFY-031 fits the state
the run reached (a cancelled wait is not a failure, so REQ-NOTIFY-032 does not reach it), REQ-NOTIFY-093 requires
REQ-NOTIFY-063's report, and REQ-NOTIFY-030 moves the recovery affordances with the focus. Holding REQ-NOTIFY-063's notice for
the focus, as REQ-NOTIFY-032 holds a failure's class notice, is the one placement that meets all three without putting an
error about another session on screen.

`runEndingPublication` now returns the limit's text (`quota`) beside REQ-NOTIFY-063's notice for a run that ended otherwise
on a provider limit, and `RunFailurePublisher.endedOtherwise` takes it: a session a main window follows raises the quota
notice at once, as before; a session no main window follows raises REQ-NOTIFY-031's `info` notice, as before, **and holds
the `quota` class**, so `focused` publishes REQ-NOTIFY-063's notice and its "Open Models settings" action once, and a later
ending of the session supersedes it (`ended`). The notice slot holds one notice, so the two about one ending are never on
screen at once. `apps/desktop/src/main/index.ts` passes `publication.quota` through.

Pinned by `apps/desktop/src/main/run-failure-notice.test.ts`: "REQ-NOTIFY-093 with REQ-NOTIFY-030/031: an unfocused run that
ended on a limit raises 031's notice and holds REQ-NOTIFY-063's for the focus" (one `info` 031 notice and `holds()` true;
focusing another session publishes nothing; focusing it publishes the quota notice once; a focused limit ending raises 063
at once and holds nothing; a later ending supersedes the held one), and the publication case now expects `quota`. Both
failed before the repair (`holds('S2')` was false; the publication carried no `quota`).

Shown in the built app by `apps/desktop/scripts/notice-proof.mjs` section 9, `background-quota` (2026-10-02, load 1.2 to 2.8,
nothing else running): a run parked on a quota wait with no candidate, "New session" accepted, the parked run stopped from
the background, REQ-NOTIFY-031's `info` notice "Session <id> paused" with "Open the session" while the window stayed
released; activating it focused the session and REQ-NOTIFY-063's notice, "The provider limit was reached; the session is
preserved", arrived with "Open Models settings", whose activation opened the Settings view. The proof stops the parked run
with the Stop control's own `session.control` cancel addressed to that session, since no control in the window reaches a
session it does not show; the run rests `paused` ("Run paused: interrupted by user"), which the notice names. Evidence:
`.proof/notice-proof/background-quota.png`, `background-quota-focused.png` (git-ignored).
