## The improvement analyst is never told the verifier section's shape, so one invented key discards a whole retrospective

## Outcome: repaired 2026-10-14 (fin46, `fin46-accept1-19`)

Both system texts now carry `PROPOSAL_SHAPE` (`packages/engine/src/improvements/analyst.ts`): every proposal field with its
closed vocabulary or bound (the ten categories, `risk` as `"low"`, `"medium"` or `"high"`, when `target_persona` is required),
and the whole `proposed_verifier_section` shape: its six keys and the seven keys of a check, each with the bound the schema
enforces (`VERIFIER_SECTION_FIELDS`, `VERIFIER_CHECK_FIELDS`), that any other key makes the whole reply invalid, and an example
block. Nothing about validation changed: an invalid block is still rejected and still takes REQ-LIBRARY-022's recovery.

**Pinned by** `analyst.test.ts`'s "REQ-LIBRARY-009/016/022 the analyst is told the proposal's shape" cases (four, all red on
the text before): both passes' texts name every key `VerifierSectionSchema` and `VerifierCheckSchema` take, every role, severity,
risk and category, and an example the section schema accepts; the two field maps hold exactly the strict schemas' key sets, so a
key added there cannot go unnamed; and the shape goes out on both attempts while the live run's `when` / `check` block is still
refused with `collector parse failed: … unrecognized_keys`. `pnpm retrospective-proof` 67 of 67 on the built head (load average
1.8 to 3.4 on four CPUs).

**Shown live:** `live-run.mjs --confirm --skip-build --only=ask` on this branch's build, 2026-10-14 from 23:22 UTC, the registered
self-hosted default endpoint: `ask-retrospective` sent one request, whose system text carried the shape, and the model answered on
the first try with a `verifier_gate_update` proposal whose block held only `checks` (`name`, `command`, `timeout`, `severity`,
`role`, `cwd`) and `gate_completion`; it was stored, and the notice read "1 retrospective proposal ready". The run passed. One
run of a nondeterministic model shows the instruction reaching it and being followed once, not that a model never invents a key;
when one does, REQ-LIBRARY-016 still discards the pass, as it must.

Not repaired, as the note says: PD-LIBRARY-005's `<err>` still carries the raw zod JSON into the notice's detail, which the
directive asks for.

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
