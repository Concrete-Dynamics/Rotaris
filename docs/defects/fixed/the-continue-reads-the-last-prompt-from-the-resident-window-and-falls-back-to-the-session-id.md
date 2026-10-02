## The continue reads the last prompt from the resident window and falls back to the session id

The engine's continue (`Sessions.continueSession`), its plan decision (`planDecisionHeld`) and the relaunch of a decided plan
(`relaunchPlanDecision`) take the session's last submitted prompt to be the newest `user` row among
`dal.residentRows(sessionId)`, the rows still resident (at most `RESIDENT_ROW_CAP`, 5000; the oldest are released to a
page by `session-writer.ts`). Where more rows than that followed the prompt (a long run's tool and agent rows), the prompt
has been released, the search finds nothing, and the code falls back to `stored.session_id`: the session's id becomes
"Latest user request:" in the continuation's payload, the label of the task the continuation appends, and the text
`holdsUnfinished` compares. The authentication restart (`restartOnFallback`) and the recovery dialog's reading
(`lastPromptOf`, behind `restartAfterAuthFailure` and `authRecoveryFacts`'s `lastPrompt`) carry a third and fourth copy
of the same search, falling back to `''`: the restart is then refused as "No prompt is recorded for this session." and
the dialog says there is none, both untrue. The renderer's retry has its own copy over the replica's window
([the-retry-action-reads-the-last-prompt-from-the-resident-window.md](../the-retry-action-reads-the-last-prompt-from-the-resident-window.md)).
Noticed 2026-10-02 by the fourth triage of open defect notes, while reading that note's code; recorded before its repair.

## Specs

- REQ-SESSION-192: "a reader that asks for a row older than the resident window MUST be served it from the released
  pages"; a released prompt is still the session's.
- REQ-NOTIFY-045 and REQ-NOTIFY-069 name "the last submitted prompt" and "a recorded last prompt".
- REQ-ORCH-004: the continuation appends the request again as a task; a task labelled with the session id is no request.
- REQ-NOTIFY-070: the restart "with the same prompt" is refused only where none is recorded.

## Relevant files

- `packages/engine/src/sessions.ts`: `continueSessionHeld`, `planDecisionHeld`, `relaunchPlanDecision` (fall back to
  `stored.session_id`), `restartOnFallback` and `lastPromptOf` (fall back to `''`).
- `packages/store/src/dal.ts`: `residentRows` (`page IS NULL`), the only reading those paths use.
- `packages/store/src/schema.ts`: `RESIDENT_ROW_CAP`.

## Outcome

Repaired 2026-10-02 (fin8, bundle `fin8-focus-bound-recovery`). `StoreDal.lastPromptRow` reads the session's newest `user`
row with text or images over every row, resident or released (`page` is not consulted), and
`lastSubmittedPrompt` (`packages/engine/src/sessions.ts`) is the one engine reading built on it: the continue
(`continueSessionHeld`), the plan decision (`planDecisionHeld`) and the relaunched decision (`relaunchPlanDecision`) take
their "Latest user request" from it (`latestRequestOf`), and the authentication restart (`restartOnFallback`) and the
recovery dialog's reading (`lastPromptOf`) take the text the restart re-sends from it. The session id stands in as the
request only for a session with no submitted prompt at all, which a transcript cleared under REQ-CHAT-084 is; a released
prompt never reaches that fallback. The restarts still re-send the text alone (OQ-182's reading), so a last prompt of
images alone reads as none there and the restart is refused rather than sending an empty prompt.

Pinned by `packages/engine/src/last-prompt.test.ts`: a session planted with its prompt and `RESIDENT_ROW_CAP + 10` rows
after it, the prompt released to a page, is read back by `lastSubmittedPrompt` with its stored image, and continued with
"Latest user request:" naming the prompt — on the code before the repair that test read `Latest user request:\nR7`, the
session's id.
