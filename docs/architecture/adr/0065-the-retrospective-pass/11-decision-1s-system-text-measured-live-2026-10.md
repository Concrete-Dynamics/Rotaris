# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Decision 1's system text measured live — 2026-10-14 (the default live run at `b9e3005`, L1; fin46)

Part 11 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Decision 1's system text measured live — 2026-10-14 (the default live run at `b9e3005`, L1; fin46)

**Found by the live run:** `ask-retrospective` at `b9e3005` asked for proposals whose `proposed_verifier_section` the model then
filled with keys of its own (`when`, `check`), on both of REQ-LIBRARY-022's attempts; the section schema is strict, so the pass
ended `collector parse failed` and the person saw PD-LIBRARY-005's warning. Decision 1 said "only the system text and the
serialised evidence branch on `pass`", and both texts said only "proposed_verifier_section when relevant": the reading that
naming the field was enough for the model to produce a block REQ-LIBRARY-009 (c) accepts **was false**, and is kept here beside
its replacement. **Now:** both texts carry `PROPOSAL_SHAPE` (`packages/engine/src/improvements/analyst.ts`), every proposal
field's vocabulary or bound and every key the verifier block and its checks take, with an example; the branch on `pass` is
unchanged. Pinned by `analyst.test.ts`'s four "the analyst is told the proposal's shape" cases (red on the text before), which
also hold the named keys equal to the strict schemas'. **Measured live** on the repaired build (`--only=ask`, 2026-10-14 from
23:22 UTC): the retrospective's one request carried the shape and its answer, a `verifier_gate_update` with a valid block, was
stored on the first attempt. One run of a nondeterministic model, so it shows the instruction followed once, not never broken
([`../../../defects/fixed/the-improvement-analyst-is-never-told-the-verifier-sections-shape.md`](../../../defects/fixed/the-improvement-analyst-is-never-told-the-verifier-sections-shape.md)).
