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
- `docs/defects/fixed/a-background-runs-non-failure-ending-raises-its-summary-not-a-notice-naming-the-session.md` — the
  repair that made the unfocused ending REQ-NOTIFY-031's.
