## A timed-out improvement analysis reads as one that found nothing

When a post-run improvement analysis reaches `runtime.improvement_collector_timeout`, its result is REQ-LIBRARY-023's empty
artifact with `notes` = `collector timed out after <t> seconds`. Main raises REQ-LIBRARY-124's zero-proposal notice for it
exactly as for a review that looked and proposed nothing: "Improvement analysis complete — no proposals" with the detail
"Nothing was proposed in <id>." (`apps/desktop/src/main/index.ts`, the coordinator's `stored`). A person cannot tell an
analysis cut off by its bound from an empty one, nor that the bound is what to raise. OQ-114's F4 measured six analyst calls
on the owner's endpoint at 22 to 134 s, three past the 60 s default R-071 kept. Noticed on 2026-10-07 by advocate A of the
R-072 consortium's question IT1 (OQ-223), whose ruling builds the repair; recorded before its code, as the ruling asks.

## Specs

REQ-NOTIFY-100 (an operation's bound reached is reported as that operation's timeout), REQ-LIBRARY-023 (the timeout
artifact's notes), REQ-LIBRARY-124 (the zero-proposal notice: its title and its absence of an action, unchanged by the
repair); `PD-CONFIG-003` revision 2.

## Relevant files

- `apps/desktop/src/main/index.ts` — the improvement coordinator's `stored` handler, which raises the zero-proposal notice.
- `packages/engine/src/improvements/analyst.ts` — where the timeout's notes are written.

## Repaired — 2026-10-07, fin29 (PD-CONFIG-003 revision 2; REQ-NOTIFY-100, REQ-LIBRARY-023, REQ-LIBRARY-124)

`zeroProposalDetail` (`apps/desktop/src/main/improvement-notice.ts`), which the coordinator's `stored` handler in
`apps/desktop/src/main/index.ts` now calls, reads REQ-LIBRARY-023's note (`analysisTimedOutAfter`) and gives a post-run
analysis that reached its limit the detail "The review of this run reached its <t>-second limit before it proposed anything.
Settings › Runtime › Improvement analysis timeout allows it longer."; every other empty artifact, and the retrospective
(whose bound has no control), keeps "Nothing was proposed in <id>.". The title and the absence of an action are unchanged.
Pinned by `improvement-notice.test.ts`. Not shown in the built app: no proof or drive makes an analysis reach its limit (the
scripted analyst answers at once, and a live run quits within seconds of each run's end, which cancels the analysis first,
REQ-LIBRARY-127).
