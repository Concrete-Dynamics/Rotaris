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
