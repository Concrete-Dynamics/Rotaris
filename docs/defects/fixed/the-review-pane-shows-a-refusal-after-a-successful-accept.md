## The review pane shows a refusal immediately after a successful Accept

After Accept on a card in review, the pane shows "REQ-104 is not awaiting a review decision: it is in done." above
"Accept recorded for REQ-104. The review you were reading is out of date. [Reload the review]". The accept was
recorded once. The live refresh had already re-read the payload — the card is in `done` — so the refusal is the
refreshed pane's, and "out of date / Reload" refers to a pane already replaced.

Live-run finding: L12 (live runs of 2026-09-29)

## Specs

- `REQ-TRACE-424`: the refusal's wording is faithful for opening a review on a card not awaiting one; here nobody
  opened one.
- `REQ-TRACE-426`: the notice and its reload refer to a payload the live refresh already replaced.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), `requirements/requirements.png` (session `360c8ac1`); `delivery_audit` holds exactly one accept (seq 4).

## Relevant files

- `packages/ui/src/requirements/panes/ReviewPane.tsx:41-49` — the decision handler; the notice at `:48-49`.
- `apps/desktop/src/workspace-service/delivery.ts:201` — the refusal a refreshed read returns.

## Outcome

**Repaired 2026-09-29 under R-067.** The refusal came from the board's own host, not the service. `decide` in
`RequirementsView.tsx` re-read the review (`loadReview`) as soon as a decision was recorded. The service answered
that re-read with REQ-TRACE-424's refusal, which is correct for a card the accept had just moved to `done`. The pane
then drew that refusal above its own notice, which called it out of date.

The host no longer re-reads on its own. The pane keeps the payload the decision was taken against, with its state
tag still `review` and the decisions withdrawn. It says that payload is out of date and offers the reload as its one
action (REQ-TRACE-426). Taking the reload reads the requirement where the decision put it. The pane then shows
REQ-TRACE-424's refusal "REQ-101 is not awaiting a review decision: it is in done.", because this time a person asked
for the review. The service's refusal wording (`delivery.ts`) and the pane are unchanged.

**Pinned by** `requirements-proof`'s end-to-end stage, which drives the built app. After the accept it reads the pane
(`REVIEW_AT` at 36.8 s): the notice word for word, the actions exactly `["Reload the review"]`, no refusal, the tag
`review` and no decisions. Then it clicks the reload (38.8 s) and reads the refusal above (39.8 s). Against the
unrepaired build the stage failed on the refusal assertion with the pack's own words. Against the repaired build it
passed. A unit test cannot hold this, because the repository runs vitest without a DOM and the re-read was a click's
consequence. The same pane-level reads are recorded under `review` in `.proof/requirements-proof/results.json`.

**Live evidence:** `pnpm live-run --only=requirements` passed against the `katalyst` endpoint (pack
`.live-run/runs/2026-09-30T00-51-42-344Z/` of the `fix-status-text` worktree; git-ignored). Its `requirements.png`
shows the review of REQ-104 after the accept. The pane still holds the elements of the review the accept was taken
against, and below them the notice "Accept recorded for REQ-104. The review you were reading is out of date." with
its one action, "Reload the review". The service returns a refusal with no elements, so the elements on screen show
the pane was not re-read.

Noticed while repairing it: a re-run or send-back taken through the launch disclosure leaves the pane saying nothing
was recorded. See
[`a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`](a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md).
