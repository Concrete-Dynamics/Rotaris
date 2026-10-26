# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-02, under `owner-decisions.md` SR-2, SR-4, SR-6, SR-9(a), ESC-18 and ESC-20, and
  against the specification as amended — `REQ-TRACE-514` (new), `REQ-LIBRARY-176` (new),
  `REQ-CONFIG-192`, `REQ-LIBRARY-042`
- **Origin:** DATA (ADR-DATA-07)
- **Depends on:** ADR-0003, ADR-0040
- **Scope note:** this record now also owns the **export** of the improvement artifact store, and only
  the export. That store's write path was unowned when this note was written — OQ-45 — and this record still does not take it; **ADR-0061 takes it, 2026-09-11**, and OQ-45 is closed. The split stands: the export is this record's because `REQ-LIBRARY-176` and `REQ-TRACE-514` were minted by one ruling over one guarantee, and the write is ADR-0061's because the rule is not this store's.

> **What moves and what does not.** Delivery state, history, the audit trail, run records, worktree
> references and tombstones become rows in the per-workspace database SR-4 introduces. **Requirement
> text does not** — `REQ-CONFIG-192` already forbids it from this store, and ADR-0040 keeps the
> documents in the project's repository, which `REQ-TRACE-513` now states as a requirement. **Worktrees
> do not** — they are directories on disk (`REQ-GIT-140`), referenced by row. The **capability split
> between the reader and the writer stays**, because `REQ-TRACE-403` is a requirement about the
> composition rather than about the store.
>
> **What is new is that the records have to be able to leave.** When this record was written, the loss
> of a delivery record a user could open in a text editor was noted in a consequence and dismissed on
> the grounds that no requirement asked for it. SR-9(a) and ESC-20 reversed that, and the specification
> has since minted the two exports: `REQ-TRACE-514` for the delivery store and `REQ-LIBRARY-176` for the
> improvement store. Both are built to `REQ-SESSION-199`'s shape, deliberately and by the requirements'
> own instruction, rather than to a second one invented here.

## Parts

Since 2026-10-26 the rest of this document is in [`0041-the-delivery-store/`](0041-the-delivery-store/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0041-the-delivery-store/01-context.md) | Context |
| [02](0041-the-delivery-store/02-alternatives-considered.md) | Alternatives considered; Alternatives for the exports themselves |
| [03](0041-the-delivery-store/03-decision.md) | Decision; The capability split stays, and it earns its keep; The startup self-check is unchanged; Forward-tolerant records survive the move, and how is not obvious; One transaction, and what it settles; Restart, under SR-2; The two exports SR-9(a) minted; The improvement store's export, and the part of that store this record does not take; What SR-4 dissolves here |
| [04](0041-the-delivery-store/04-consequences-accepted.md) | Consequences accepted |
| [05](0041-the-delivery-store/05-revisit-if.md) | Revisit if |
| [06](0041-the-delivery-store/06-first-execution-2026-09-09-part-ak.md) | First execution — 2026-09-09 (Part AK) |
| [07](0041-the-delivery-store/07-second-execution-2026-09-09-part-ak-the-board.md) | Second execution — 2026-09-09 (Part AK′), the board |
| [08](0041-the-delivery-store/08-second-execution-2026-09-09-part-ap.md) | Second execution — 2026-09-09 (Part AP) |
| [09](0041-the-delivery-store/09-third-execution-2026-09-11-part-r-the-lane.md) | Third execution — 2026-09-11 (Part R″), the lane closed end to end |
| [10](0041-the-delivery-store/10-repair-2026-10-02-a-units-worktree-is.md) | Repair — 2026-10-02: a unit's worktree is provisioned once |
| [11](0041-the-delivery-store/11-repair-2026-10-02-a-card-resting-in-ready-keeps.md) | Repair — 2026-10-02: a card resting in `ready` keeps a way to start after a restart |
| [12](0041-the-delivery-store/12-repair-2026-10-02-a-cards-next-unit-is.md) | Repair — 2026-10-02: a card's next unit is provisioned at the claim |
| [13](0041-the-delivery-store/13-repair-2026-10-02-an-automatic-queue-resumes-at.md) | Repair — 2026-10-02: an automatic queue resumes at a workspace open |
| [14](0041-the-delivery-store/14-repair-2026-10-02-one-acceptance-holds-for-the.md) | Repair — 2026-10-02: one acceptance holds for the rest of the launch |
| [15](0041-the-delivery-store/15-repair-2026-10-02-a-board-run-is-settled.md) | Repair — 2026-10-02: a board run is settled against its own workspace |
| [16](0041-the-delivery-store/16-execution-2026-10-13-a-proposed-technical.md) | Execution — 2026-10-13: a proposed technical requirement is accepted from the review |
