## A timed-out child's summary opens as if the run failed

OQ-217's Outcome line read "Outcome: failed — Child timed out after 1200s.", and the summarising pass, asked to state
"that outcome" in its first sentence, wrote it with the run as the subject. At the final duress live run at `a68f121`
(session `e6747bd0`, pack `2026-10-07T07-09-30-708Z`, the autopsy's finding D9) both failed testers' summaries opened "The
run failed because the child [agent] timed out after 1200s …", and the timeline relayed them as "Child wave3-verify-all
reported failed: The run failed because …" (entries 74 and 98) while the session completed `tasks_complete`. The same
sentence reached two child-report artifacts and the sibling index. The Outcome line and the ask never said whose outcome it
is, nor that the session goes on.

Recorded 2026-10-07 before the repair (fin32).

## Specs

- OQ-217's ruling ("the pass is asked to state that outcome in the summary's first sentence"): the outcome is the child's,
  and a first sentence that reads as the session failing misstates it.
- REQ-ORCH-108 (the report condenses what already happened), REQ-ORCH-112 (the report status is the child's terminal state).

## Relevant files

- `packages/engine/src/children/report.ts` — `outcomeLine` (the line's words) and `produceReport`'s `outcomeAsk` (the ask).
- `packages/engine/src/children/report.test.ts`, `packages/engine/src/children/children.test.ts` — the cases pinning the line.
