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
