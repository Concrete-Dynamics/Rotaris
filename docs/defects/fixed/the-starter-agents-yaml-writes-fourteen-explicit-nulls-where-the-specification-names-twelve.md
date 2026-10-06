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
workspace ([a-first-run-workspace-never-gets-the-starter-agents-yaml.md](a-first-run-workspace-never-gets-the-starter-agents-yaml.md)). Recorded, not repaired. Either the two lines
come out, or the owner extends the starter to carry the retrospective slot, which would be a directive naming
REQ-CONFIG-025 and REQ-WORKSPACE-038. Choosing between them is the owner's.

## Specs

- REQ-WORKSPACE-038: "exactly the twelve explicitly-null keys"; the file has fourteen.
- REQ-CONFIG-025: enumerates the twelve and says nothing of a retrospective slot.
- PD-LIBRARY-002: the slot's origin; it does not name either requirement above.

## Relevant files

- `packages/config/src/writers.ts`: `starterDocument`, the two `retrospective_model*` lines.
- `packages/config/src/writers.test.ts`: the bootstrap case "writes the starter for an absent or blank file…", which
  counts the nulls and holds them at fourteen (`expect((starterDocument().match(/: null$/gm) ?? []).length).toBe(14)`,
  its comment crediting PD-LIBRARY-002 with the two extra): either outcome changes that count. ~~the starter's tests,
  none of which counts the nulls.~~ *(Corrected 2026-10-04, fin15: the verifier of finacc's fourth round found the
  count; the note had said there was none.)*
- `apps/desktop/scripts/lib/starter-config.mjs`: the proofs' starter reader, which checks for the twelve and accepts
  lines beyond them.

## Outcome — repaired 2026-10-06 (branch `finacc2-accept1-4`, final acceptance round 1, finding A6)

REQ-WORKSPACE-038 is faithful and PD-LIBRARY-002 does not govern it, so the requirement's "exactly the twelve" was
conformed to and no open question was raised: the choice the note left to the owner was between conforming and a
directive the owner had not given, and only a directive could extend the starter. `starterDocument` no longer writes
`retrospective_model: null` and `retrospective_model_thinking: null`; after `default_persona: orchestrator` it states
the twelve keys REQ-CONFIG-025 enumerates, in its order, and nothing else. Nothing changes at runtime: both keys are
replace-if-not-null (REQ-CONFIG-041), the retrospective slot was never read from the starter, and the slot editor and
the per-field writer add the key when someone sets it, as they already did for `gatekeeper_model`, which the starter
never stated. A workspace whose file already holds the two lines keeps them (REQ-CONFIG-026).

The proofs' reader (`apps/desktop/scripts/lib/starter-config.mjs`, `starterMissing`) now names any top-level key
stated as an explicit null beyond the twelve ("exactly the twelve explicit nulls (it also states …)"), so
`slice-proof`'s first-launch scenario and `live-run`'s sign-in scenario would go red on the fourteen-null starter.

Pinned by:
- `packages/config/src/writers.test.ts`: the bootstrap case's null count is 12 (was 14); "states default_persona then
  exactly REQ-WORKSPACE-038's twelve explicitly-null keys, in its order, and nothing else" reads the starter's body
  whole. Both fail on the old starter. "leaves the retrospective slot resolving as before" pins the global layer's
  `retrospective_model` and its thinking level through the workspace starter, with and without the two old nulls.
- `apps/desktop/scripts/lib/starter-config.test.ts`, "names an explicit null beyond REQ-WORKSPACE-038's twelve": the
  fourteen-null starter, and a `~` null with a comment, are named; a nested null, a set value and initialization's
  block are not. It fails on the old reader.

Shown by `pnpm slice-proof` against the registered unmetered endpoint `katalyst` (build of this branch, `--skip-build`
after `pnpm build`, as root under Xvfb, Node 24, 04:45:12 to 04:51:37 UTC, load 7.5 falling to 5.6 with other agents
on the host): exit 0, all seven scenarios. The open's bootstrap logged `written`, the sign-in's `exists`, and the
workspace file held the three-line header, `default_persona: orchestrator` and twelve `: null` lines, with the
proof's own `runtime:` block after them.
