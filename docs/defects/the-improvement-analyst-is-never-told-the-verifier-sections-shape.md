## The improvement analyst is never told the verifier section's shape, so one invented key discards a whole retrospective

Found by the default live run at `b9e3005` (acceptance finding L1 of fin46, 2026-10-14; pack `2026-10-14T13-37-17-899Z` of the
`wt-live` tree, `ask-retrospective/app.log` lines 33 to 47). The retrospective's model wrote `when` and `check` into
`proposals[0].proposed_verifier_section` on both of its tries. `VerifierSectionSchema` is `.strict()`, so the parse failed twice,
REQ-LIBRARY-022 stored `collector parse failed: [{"code":"unrecognized_keys","keys":["when","check"],"path":["proposals",0,"proposed_verifier_section"]}]`,
REQ-LIBRARY-016 discarded the whole pass, and the person saw "The retrospective could not be completed" (PD-LIBRARY-005).

Rejecting the invalid block is faithful (REQ-LIBRARY-009 (c), REQ-LIBRARY-016). The cause is the instruction: both system texts,
`IMPROVEMENT_ANALYST_SYSTEM` and `RETROSPECTIVE_SYSTEM`, say only "proposed_verifier_section when relevant" and never name its
keys (`checks` with `name`, `command`, `timeout`, `severity`, `role`, `cwd`, `failure_pattern`; `gate_completion`, `suite_timeout`,
`author_gate`, `probe_timeout`, `max_repair_attempts`), so the model invents them. The REQ-LIBRARY-022 retry hands back the zod
error, which did not help the model at `b9e3005`. The same texts leave `risk` unbounded too (`low`, `medium`, `high` are the only
values `ImprovementRiskSchema` takes, so "moderate" fails the pass the same way) and name no category, which REQ-LIBRARY-021 then
coerces to `workspace_note`.

Secondary, faithful to the directive and not repaired here: PD-LIBRARY-005's `<err>` puts the raw multi-line zod JSON into the
notice's detail. The live run at `3c3f447` proposed nothing in its retrospective and passed, so it did not meet this.

## Specs

No requirement fixes the analyst's instruction text, so stating the shape departs from nothing. The defect is that the
product asks for a block REQ-LIBRARY-009 (c) validates against REQ-CONFIG-139 to REQ-CONFIG-145 without saying what that block
is, so a pass REQ-LIBRARY-016 would accept is lost to an avoidable REQ-LIBRARY-022 recovery. Related: REQ-LIBRARY-020,
REQ-LIBRARY-021, PD-LIBRARY-002 (the retrospective pass), PD-LIBRARY-005 (its failure warning).

## Relevant files

- `packages/engine/src/improvements/analyst.ts` lines 17 to 39: the two system texts, which name the field and not its shape.
- `packages/contracts/src/improvements.ts` lines 49 and 63 to 96: `ImprovementRiskSchema`, `VerifierCheckSchema` and
  `VerifierSectionSchema` (both `.strict()`), the shapes the reply is validated against.
- `apps/desktop/scripts/live-run.mjs`, the `ask-retrospective` scenario, which found it.
