## A retrospective's failure warning ends in a doubled period when its reason ends in one

`passFailureDetail` (`apps/desktop/src/main/improvement-notice.ts`) closes the failure warning's detail with a period after the
reason, for both passes: "This workspace's own history was not reviewed: <reason>." A job that ended without an artifact
because the run host refused its analysis carries the coordinator's reason "the analyst could not start — <headline>: <detail>"
(`reasonOf`, `apps/desktop/src/main/improvements.ts`), and a refusal's detail is a sentence that ends in its own period, so the
warning read "… before continuing this run.." for a retrospective whose lease was refused at analysis. Read from the code on
2026-10-14 by fin45 (`fin45-retro-and-record`) while building OQ-300's ruling, which says that warning "ends in a single
period"; the post-run pass's detail has the same shape.

## Specs

`PD-LIBRARY-002` revision 5 ([OQ-300](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-300)): at analysis, the reason "appears inside clause
(c)'s failure warning, which offers no action and ends in a single period". REQ-LIBRARY-124's warning carries "the failure's
reason" for the post-run pass on the same terms.

## Relevant files

- `apps/desktop/src/main/improvement-notice.ts` — `passFailureDetail`, the closing period.
- `apps/desktop/src/main/improvements.ts` — `reasonOf`, which carries a refusal's detail into the reason whole.
- `apps/desktop/src/main/index.ts` — the coordinator's `failed` hook, which posts the warning.

## Outcome

Repaired 2026-10-14 by fin45 (`fin45-retro-and-record`), in the commit that builds `PD-LIBRARY-002` revision 5: `passFailureDetail`
adds its closing period only when the reason does not already end in `.`, `!` or `?`, for both passes; a reason ending in `)`
(`PD-LIBRARY-005`'s "the analysis call failed (<exc>)") still gains one. Pinned by `apps/desktop/src/main/improvement-notice.test.ts`,
"adds the closing period only to a reason that does not already end in terminal punctuation, for both passes", red before the
change. No proof drives a refused analysis; the live run's credential-withheld step (OQ-300) is the orchestrator's.
