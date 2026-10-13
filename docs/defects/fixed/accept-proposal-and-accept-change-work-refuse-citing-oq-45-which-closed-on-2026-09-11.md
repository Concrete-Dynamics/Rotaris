## Accept-proposal and accept-change-work refuse citing OQ-45, which closed on 2026-09-11

The board's transition function refuses both actions with one sentence
(`packages/workspace/src/delivery/transition.ts`, `decide`, the `accept-proposal` / `accept-change-work` arm):
"… needs the improvement store, which has no owning decision yet (OQ-45); nothing was written." Its comment says "no
decision owns the improvement store's write path". Both statements are false three times over:

1. **OQ-45 is closed.** `docs/architecture/open-questions.md` records it closed on 2026-09-11, with ADR-0061 owning the
   store, and `docs/architecture/codebase.md` records the improvement store built on 2026-09-14 and its lifecycle finished
   on 2026-09-15.
2. **The dependency is the wrong one.** `accept-proposal` (REQ-TRACE-427..433) writes a technical requirement into the
   project's own requirement store through the board's one write path. That path exists: `requirements.source.write` was
   built on 2026-09-10. The improvement artifact store of REQ-LIBRARY-042ff is a different store and has nothing to do with
   it. `accept-change-work` needs the change-analysis offer of REQ-TRACE-409..416 (the offer, the staleness guard and the
   automatic-mode acceptance), which is not built.
3. **The same stale reason is written in two more places.** `apps/desktop/src/renderer/main.tsx` (the `Library` comment)
   says the PROPOSALS body is a placeholder because "no ADR owns the improvement artifact store's write path (OQ-45)",
   although `packages/ui/src/library/ProposalsTab.tsx` is built and mounted. ADR-0041 (`docs/architecture/adr/0041-the-delivery-store.md`,
   "Not built here, stated") says the review's proposals cannot be accepted because "there is no store to write into".

No UI control dispatches either action, so a person meets the false sentence only through a raw `requirements.act`. What a
person does meet is the gap behind it: the review pane lists a run's proposed technical requirements
(`packages/ui/src/requirements/panes/presentation.ts`, the `proposals` element) as plain lines with no way to accept one,
so REQ-TRACE-429's per-proposal acceptance does not exist and every proposal is declined by inaction (REQ-TRACE-430).

Recorded 2026-10-13 by fin41 (task N83 of the 2026-10-13 survey, confirmed on main `6de2a67`).

## Specs

- `REQ-TRACE-427..433` — proposals are put to the reviewer and written only on acceptance, one at a time, through the
  board's single write path, as a technical requirement with an origin link, without consulting `confirm_source_writes`
  (REQ-TRACE-431), with a refusal shown in the engine's wording (REQ-TRACE-432).
- `REQ-TRACE-411..413` — change-work is offered after analysis and accepted as a single action, behind a staleness guard.
- `REQ-TRACE-389`/`397` — a refusal names the unmet condition; this one names a condition that was met a month ago.

## Relevant files

- `packages/workspace/src/delivery/transition.ts` — the refusal and its comment.
- `packages/workspace/src/delivery/transition.test.ts` — pins the refusal to `/OQ-45/`.
- `apps/desktop/src/workspace-service/delivery.ts` — `requirements.act`, `requirements.source.write` and `readProposals`.
- `packages/ui/src/requirements/panes/presentation.ts`, `ReviewPane.tsx` — the proposals shown with no accept control.
- `apps/desktop/src/renderer/main.tsx` — the stale Library comment.
- `docs/architecture/adr/0041-the-delivery-store.md` — the stale "no store to write into".

## Outcome

**Repaired 2026-10-13 (fin41, `fin41-config-and-proposals`).** `accept-proposal` is built. `decide` admits it in `review` as a
record that moves nothing. The delivery service's `beforeCommit` (`acceptProposal`) writes the proposal as a `type: technical`
requirement with its origin link through `requirements.source.write`'s units, between the admission and the commit, so a refused
write records nothing (REQ-TRACE-432). `confirm_source_writes` is not read (REQ-TRACE-431). The record names the identifier
written (`BeforeCommitOutcome.reason`), and the new requirement gets its `create` record. The review payload marks each
proposal `acceptedAs` from the requirement store and `origin`, the link the write makes (the reviewed requirement where the
run names an id the store does not hold; corrected at the bundle's review, where the confirmation still named the run's id), and the review pane draws one `Accept "<title>"` control per proposal still
only proposed, below REQ-TRACE-428's sentence on how the two kinds of artifact differ. `accept-change-work` stays refused,
because REQ-TRACE-409..416's offers are not built; its refusal now names REQ-TRACE-411/412 and no longer names OQ-45. The
`main.tsx` Library comment and ADR-0041's "no store to write into" are corrected in place, the old sentence kept beside the
correction in the ADR, and ADR-0041 carries the report-back ("Execution — 2026-10-13").

Pinned by `packages/workspace/src/delivery/transition.test.ts` (the decision and the bound record),
`apps/desktop/src/workspace-service/accept-proposal.test.ts` (the real service, store and traceability engine over the fixture
store: the write, the origin link, the two records, the review's `acceptedAs`, the second acceptance refused, the refusals
that write nothing, and `accept-change-work`'s new reason) and `packages/ui/src/requirements/panes/panes.test.ts` (the offers and
the prose). All five new cases were red on the code before. No built-app proof drives the review pane's proposals:
`requirements-proof`'s review stage runs a scripted unit that writes no `proposed-requirements.json`, so the control is not shown
there. A live run scenario is written up in the bundle's report.
