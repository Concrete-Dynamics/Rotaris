## The starter agents.yaml writes fourteen explicit nulls where the specification names twelve

`starterDocument` in `packages/config/src/writers.ts` writes `default_persona: orchestrator` followed by **fourteen**
explicitly-null keys: the twelve REQ-CONFIG-025 enumerates, then `retrospective_model: null` and
`retrospective_model_thinking: null`. REQ-WORKSPACE-038 says the starter "SHALL be exactly the scope-independent starter
document of REQ-CONFIG-025 … followed by `default_persona: orchestrator` and by exactly the twelve explicitly-null keys
that requirement enumerates".

The two extra keys arrived with PD-LIBRARY-002's retrospective slot (commit `eade970`, 2026-09-18). That directive
introduces `retrospective_model` and its companion as "persisted and round-tripped like other slots", but it extends
only REQ-LIBRARY-003, REQ-LIBRARY-006 and REQ-LIBRARY-015 and names neither REQ-CONFIG-025 nor REQ-WORKSPACE-038, so
it does not govern the starter's content. Since both keys are replace-if-not-null (REQ-CONFIG-041), writing them as
null overrides nothing, so the extra lines have no effect at runtime. The gap is conformance to "exactly".

Noticed 2026-10-03 on branch `finacc-accept1-3`, reading the starter the repaired open wrote in `slice-proof`'s scratch
workspace ([a-first-run-workspace-never-gets-the-starter-agents-yaml.md](fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md)). Recorded, not repaired. Either the two lines
come out, or the owner extends the starter to carry the retrospective slot, which would be a directive naming
REQ-CONFIG-025 and REQ-WORKSPACE-038. Choosing between them is the owner's.

## Specs

- REQ-WORKSPACE-038: "exactly the twelve explicitly-null keys"; the file has fourteen.
- REQ-CONFIG-025: enumerates the twelve and says nothing of a retrospective slot.
- PD-LIBRARY-002: the slot's origin; it does not name either requirement above.

## Relevant files

- `packages/config/src/writers.ts`: `starterDocument`, the two `retrospective_model*` lines.
- `packages/config/src/writers.test.ts`: the starter's tests, none of which counts the nulls.
- `apps/desktop/scripts/lib/starter-config.mjs`: the proofs' starter reader, which checks for the twelve and accepts
  lines beyond them.
