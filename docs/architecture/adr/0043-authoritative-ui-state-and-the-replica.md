# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-3 (no polling; per-session sequence numbers with gap detection)
  and SR-4 (the durable anchor becomes the transaction commit).
- **Origin:** UI (ADR-UI-01), RUNTIME (ADR-RUNTIME-02)
- **Depends on:** ADR-0002, ADR-0008, ADR-0009, ADR-0010
- **Governed by:** `owner-decisions.md` SR-2, SR-3, SR-4
- **Contains an unresolved conflict between slices.**

## Parts

Since 2026-10-26 the rest of this document is in [`0043-authoritative-ui-state-and-the-replica/`](0043-authoritative-ui-state-and-the-replica/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0043-authoritative-ui-state-and-the-replica/01-context.md) | Context |
| [02](0043-authoritative-ui-state-and-the-replica/02-alternatives-considered.md) | Alternatives considered |
| [03](0043-authoritative-ui-state-and-the-replica/03-decision.md) | Decision; Where things live; The sequence number, and how a gap is caught; Why a reconcile stays rare, and why it is not a whole-transcript transfer; Other specifics |
| [04](0043-authoritative-ui-state-and-the-replica/04-unresolved-conflict-between-slices.md) | Unresolved conflict between slices |
| [05](0043-authoritative-ui-state-and-the-replica/05-consequences-accepted.md) | Consequences accepted |
| [06](0043-authoritative-ui-state-and-the-replica/06-revisit-if.md) | Revisit if |
| [07](0043-authoritative-ui-state-and-the-replica/07-first-execution-2026-09-03-the-projection-owner.md) | First execution — 2026-09-03, the projection owner and the replica end to end |
| [08](0043-authoritative-ui-state-and-the-replica/08-corrected-on-first-execution-of-the-run-loop.md) | Corrected on first execution of the run loop — 2026-09-03: a whole-session update keeps the rows |
