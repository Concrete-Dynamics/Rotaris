## A blocker resumed through the launch disclosure leaves the blockers pane saying nothing was recorded

The blockers pane's "Resume" goes through the board's one write path as `resume`. A resume that returns the card to
`ready` starts a run (`moveStartsRun`), so when the launch disclosure is due the host answers the pane at once with
`DISCLOSURE_PENDING` ("Nothing has been recorded for REQ-… yet: … The disclosure is on screen …"). `BlockersPane`
draws any `ok: false` as its error alert (`req-pane-blockers-refused`). Accepting the disclosure then takes the resume,
but the pane keeps the alert, and `answerBlocker` does not re-read the blocker, because it saw no `ok: true`.

It is the review pane's defect
([`fixed/a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`](fixed/a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md))
on the other pane that asks for a run-starting action. That repair gave the host's answer the outcome still to come
(`DecisionResult.afterDisclosure`, settled by `acceptLaunch` and `abandonLaunch`) and taught the review pane to follow
it (`followDecision`). The blockers pane and `answerBlocker` do not follow it yet. Found by reading the code while
repairing the review pane (R-067, acceptance A34). It has not been observed in the built app: no proof resumes a
blocker whose disclosure is due.

## Specs

- `REQ-TRACE-472`: accepting the disclosure takes the action. After that, the pane's standing "Nothing has been
  recorded" is false.
- `REQ-TRACE-453/454`: the answer's outcome is the pane's to report. A refusal is quoted; a resume that was taken is
  not a refusal.

## Relevant files

- `packages/ui/src/requirements/panes/BlockersPane.tsx`: `answer` sets the refusal from any `ok: false` and never reads
  `afterDisclosure`.
- `packages/ui/src/requirements/RequirementsView.tsx`: `answerBlocker` re-reads the blocker only on `r.ok`.
- `packages/ui/src/requirements/panes/presentation.ts`: `followDecision`, which the review pane already uses for this.
