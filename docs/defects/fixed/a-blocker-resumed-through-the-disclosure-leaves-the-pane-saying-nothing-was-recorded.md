## A blocker resumed through the launch disclosure leaves the blockers pane saying nothing was recorded

The blockers pane's "Resume" goes through the board's one write path as `resume`. A resume that returns the card to
`ready` starts a run (`moveStartsRun`), so when the launch disclosure is due the host answers the pane at once with
`DISCLOSURE_PENDING` ("Nothing has been recorded for REQ-… yet: … The disclosure is on screen …"). `BlockersPane`
draws any `ok: false` as its error alert (`req-pane-blockers-refused`). Accepting the disclosure then takes the resume,
but the pane keeps the alert, and `answerBlocker` does not re-read the blocker, because it saw no `ok: true`.

It is the review pane's defect
([`a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`](a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md))
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

## Outcome

**Repaired 2026-10-02** (second repair round over the open notes, bundle `fin3-surface-words`; origin/main `503a98d`).

**Confirmed first, in the built app.** `requirements-proof` gained a `blocker-resume` stage. The queue is stopped, so
the release lands in `ready` without a run; the release is accepted with "Start the run"; the card is held out of
`ready` by a drag onto the blocked column with a stated reason; the blockers pane is opened from the detail and "Clear
the blocker (returns to ready)" is taken. The disclosure is due again, as it is for the review pane's re-run. Against
the unrepaired build the pane read, at 19.6 s with the disclosure on screen and at 23.0 s after "Start the run" had
taken the resume, the error alert "Nothing has been recorded for REQ-101 yet: …" (`req-pane-blockers-refused`), with
the resume still enabled and the blocker never re-read, while the card already sat in `ready`.

**What changed.** The blockers pane follows its answer to what the disclosure came to, as the review pane does.
`followAnswer` (`panes/presentation.ts`, over `followDecision`) tells the pane it is waiting while the disclosure
stands, and the pane draws that sentence as a status (`req-pane-blockers-waiting`, `role="status"`) with its answers
held. Once the disclosure is accepted nothing is drawn. An abandonment, or a refusal, is quoted in the alert
(REQ-TRACE-454). `answerBlocker` (`RequirementsView.tsx`) re-reads the blocker through `rereadWhenTaken` once the
answer was taken, which for a held resume is when the disclosure is accepted, so the pane then reads REQ-TRACE-447's
"Nothing is holding REQ-101." `BlockersPaneProps.onAnswer` returns `DecisionResult`.

**Pinned by** the case "a blocker answer held behind the launch disclosure (REQ-TRACE-453/454/472)" in
`packages/ui/src/requirements/requirements.test.ts` (three tests: accepted gives no refusal and one re-read; abandoned
quotes the abandonment and re-reads nothing; an immediate refusal is quoted and never drawn as waiting). These are the
pure halves, since vitest runs without a DOM. `requirements-proof`'s `blocker-resume` stage pins the pane in the
built app: after the repair the pane read the waiting sentence with no alert and the resume disabled while the
disclosure stood, then "Nothing is holding REQ-101." with no alert, the card in `ready`, and the store's history
`release, hold, resume`. The whole proof passed (134 tests, every stage). No live-run scenario resumes a blocker, so
none was run.

Noticed while repairing it: the resumed card's run never begins, because the resume provisions the unit's worktree a
second time. See
[`a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`](a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md) (repaired 2026-10-02).
