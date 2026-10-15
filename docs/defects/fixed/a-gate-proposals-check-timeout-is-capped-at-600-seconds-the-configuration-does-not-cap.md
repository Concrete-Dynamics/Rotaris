## A gate proposal's check timeout is capped at 600 seconds, which the configuration surface does not cap

Noticed 2026-10-14 by the reviewer of fin46's `fin46-accept1-19` (the improvement analyst told the verifier section's shape),
while checking the bounds `PROPOSAL_SHAPE` states against the specification; not in that bundle's scope and not repaired there.

`VerifierCheckSchema` in `packages/contracts/src/improvements.ts` declares a check's `timeout` as
`z.number().int().min(1).max(600).default(600)`. REQ-CONFIG-145 gives a check entry's `timeout` as "int seconds ≥ 1, default
**600**" with no upper bound, and REQ-ORCH-124 makes 600 s the per-check *default*, not a ceiling. REQ-LIBRARY-009 (c) says a
`proposed_verifier_section` is valid exactly when it validates as a `verifier` section of the layered configuration surface, and
that there is no second, improvement-specific gate schema. So a gate proposal whose check runs a slow suite with `timeout: 900`
is refused at construction (REQ-LIBRARY-016 discards the whole analysis pass through REQ-LIBRARY-022), and the same block is
refused again by `writeVerifierSection` (REQ-LIBRARY-063 `invalid`), though the configuration surface accepts it.

Since fin46 L1 the analyst's system text states the bound the build enforces ("whole seconds from 1 to 600",
`VERIFIER_CHECK_FIELDS` in `packages/engine/src/improvements/analyst.ts`), so a model told the shape keeps within it; a repair of
the schema moves that text with it.

## Specs

Contradicts REQ-CONFIG-145 (a check's `timeout` is ≥ 1 with no upper bound) and, through it, REQ-LIBRARY-009 (c) (the block is
validated as the configuration surface's `verifier` section, with no second gate schema). REQ-ORCH-124 states 600 s as the
default only.

## Relevant files

- `packages/contracts/src/improvements.ts` — `VerifierCheckSchema`, the `.max(600)` on `timeout`.
- `packages/config/src/writers.ts` — `writeVerifierSection`, which validates an approved block with the same schema.
- `packages/workspace/src/improvements/executor.ts` — the application-time validation of an approved gate proposal.
- `packages/engine/src/improvements/analyst.ts` — `VERIFIER_CHECK_FIELDS`, whose `timeout` text states the 600 s cap.

## Outcome — repaired 2026-10-15 (fin47, `fin47-gate-timeout-and-config`)

`VerifierCheckSchema` (`packages/contracts/src/improvements.ts`) now declares a check's `timeout` as
`z.number().int().min(1).default(600)`: whole seconds, at least 1, no ceiling, 600 when omitted, as REQ-CONFIG-145 bounds it
and REQ-ORCH-124 defaults it. It stays the one schema REQ-LIBRARY-009 (c) allows, so the one change reaches all three places
that validate a block: a proposal's construction (`ImprovementProposalSchema`, through it REQ-LIBRARY-016/022's analysis
pass), the application of an approved gate proposal (`prepareImprovementRun` in `packages/workspace/src/improvements/executor.ts`,
REQ-LIBRARY-063) and `writeVerifierSection` (`packages/config/src/writers.ts`). The analyst's system text moved with it:
`VERIFIER_CHECK_FIELDS.timeout` reads "whole seconds, at least 1 (600 when omitted)" where it read "whole seconds from 1 to 600"
(`packages/engine/src/improvements/analyst.ts`).

Pinned by three cases, each red before the change: `improvements.test.ts` "bounds a check timeout below at 1 s and nowhere
above, as REQ-CONFIG-145 does" (900 s and 86,400 s accepted, 0, -1 and 1.5 refused, a gate proposal with a 900 s check
constructs; red on "Too big: expected number to be <=600"); `writers.test.ts` "writes a check timeout above 600 s, which the
configuration surface accepts" (red: the writer answered `invalid`); `analyst.test.ts` "states a check timeout's bound as the
configuration surface does, and keeps a proposal whose check takes 900 s" (red on the text). No proof drives this path: a gate
proposal is the model's to write, and the live `ask-retrospective` stores whatever block the model proposes, so a live run
shows the text the analyst is sent, not a 900 s block. No architecture view states the bound, so none changed.
