## The retry-run notice action has no target

REQ-NOTIFY-044's closed vocabulary includes "retry the failed run under REQ-NOTIFY-045", and REQ-NOTIFY-045 says what
activating it does: it "resubmits the current composer draft, or the last submitted prompt where the draft is empty".
The member exists in the contract (`packages/contracts/src/notices.ts`, `{ kind: 'retry-run' }`), but the window's
dispatcher sends it nowhere: `dispatchNoticeAction` in `apps/desktop/src/renderer/main.tsx` groups it with the members
"whose target does not exist in this build", logs `notice action "retry-run" has no target in this build` and returns.
A notice carrying the action would therefore show a control that does nothing, which REQ-NOTIFY-044 ("activating one
produces the stated result") does not allow. No notice in this build carries it either; which notice should is a
question the specification leaves open ([OQ-177](../../architecture/open-questions.md)). Found read-only by the third
triage of open defect notes; confirmed on `fin5-noticed-gaps` by reading the dispatcher, and by the absence of any
renderer action that resubmits a draft or a prompt.

## Specs

- REQ-NOTIFY-044 — the vocabulary member and "activating one produces the stated result".
- REQ-NOTIFY-045 — what the retry does.
- REQ-NOTIFY-030 — after a focus change a retry resubmits the newly focused session's draft or last submitted prompt,
  never the previous session's.
- REQ-NOTIFY-066 — the draft outlives a failure "so it remains available to the retry action of REQ-NOTIFY-045".

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — `dispatchNoticeAction`, the `retry-run` arm; `useDraft`, the composer draft's
  window state.
- `apps/desktop/src/renderer/session-actions.ts` — `submitPrompt`, the composer's own path to the followed session.
- `packages/contracts/src/notices.ts` — `NoticeActionSchema`'s `retry-run` member.

## Outcome

Repaired 2026-10-02 on `fin5-noticed-gaps`; which notice should carry the action stays open as OQ-177.

- `retryRun` (`apps/desktop/src/renderer/session-actions.ts`) resubmits the draft it is handed, or — the draft blank — the
  followed session's newest `user` row, through `submitPrompt`, so it reaches the session the window follows
  (REQ-NOTIFY-030); with no session followed, or nothing to resubmit, it refuses with a reason and sends nothing.
- `dispatchNoticeAction`'s `retry-run` arm (`apps/desktop/src/renderer/main.tsx`) hands it the draft the composer last
  published (`composerDraft`, `shell.ts`, written by `useDraft`'s publish), else the stored one (REQ-NOTIFY-066), and
  reports a refusal in a warning notice; `retry-run` left the list of members with no target.

Pinned by `apps/desktop/src/renderer/session-actions.test.ts` ("REQ-NOTIFY-045: a notice's retry …", four tests) and
`recovery-wiring.test.ts` ("the retry action reaches its target"), all five failing before the repair. Shown in the built
app by `notice-proof`'s new section 7 (`retry-action`): a run fails at its first call, a notice carrying `retry-run` is
published through the real store, its `Retry` is clicked, and the session's last submitted prompt is submitted again as a
second run of the same session (two `user` rows with the prompt, `iterations_completed` 2, one session). The proof was
not run against a build without the repair; the unit tests carry that comparison.
