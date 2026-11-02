## `can_publish_artifacts` is read and never gates `artifact_write`

A persona that declares `artifact_write` under `tools:` is handed the tool whatever its `can_publish_artifacts` says, and the
flag defaults to `false`. The configuration reads the field (`packages/config/src/sections/personas.ts`,
`can_publish_artifacts: r.bool('can_publish_artifacts', false)`) and nothing reads it afterwards: the run host's one tool
resolution passes `canPublishArtifacts: artifacts !== undefined` (`apps/desktop/src/run-host/tools.ts`), the artifact store's
presence, so the registry's removal `artifact_publish_not_granted` (`packages/agent-tools/src/registry.ts`) is never taken
while a store exists. The comment beside that call gives the reason as "no requirement in this part names such a grant — a
persona that must not publish declares no `artifact_write` (REQ-TOOLS-002). Recorded as a decision taken." REQ-TOOLS-004 and
REQ-CONFIG-106 name exactly that grant.

Observable: `pnpm artifacts-proof` configures its orchestrator with `artifact_write` in `tools:` and no
`can_publish_artifacts`, so the flag is at its default `false`, and the run publishes (its launch 1 asserts the
`artifact_write` row and the published artifact).

Noticed 2026-10-06 by finacc3's acceptance round 1 while raising OQ-212 (which built-in personas may publish) for finding F16.
Not repaired there: the repair is a change of what a configured persona may call, outside that task, and the artifacts proof's
configuration needs `can_publish_artifacts: true` beside it.

## Specs

- REQ-CONFIG-106: "`can_publish_artifacts` (bool, default false) gates `artifact_write`: naming that tool in `tools` is not
  sufficient on its own, and the role is handed it only while this flag is true." The build hands it over with the flag false.
- REQ-TOOLS-004: among the removals that must be distinguishable, "`artifact_write` declared by a persona that lacks
  `can_publish_artifacts: true`". The build records no such removal.

## Relevant files

- `apps/desktop/src/run-host/tools.ts`: the `resolveToolSet` call, `canPublishArtifacts: artifacts !== undefined`, and the
  comment that gives the falsified reason.
- `packages/config/src/sections/personas.ts`: `can_publish_artifacts`, read and defaulted, consumed by nothing.
- `packages/agent-tools/src/registry.ts`: `canPublishArtifacts` and the `artifact_publish_not_granted` removal.
- `apps/desktop/scripts/artifacts-proof.mjs`: `globalYaml`, the orchestrator declaring `artifact_write` with no flag.
- `docs/architecture/open-questions.md`: OQ-212, the built-in personas' side of the same tool.

## Outcome

Repaired 2026-10-07 by bundle `fin28-artifacts`, with OQ-212's ruling under R-072 (confirmed as built: no built-in persona
publishes; publishing is a grant made with both keys). `Persona` (`packages/engine/src/children/personas.ts`) gains
`canPublishArtifacts`, false for every built-in role; `personaResolverFor` (`apps/desktop/src/run-host/configuration.ts`)
carries a role's `can_publish_artifacts` with the same stated-or-built-in rule as `coordinator_only`; and `createToolPort`
(`apps/desktop/src/run-host/tools.ts`) passes `artifacts !== undefined && persona.canPublishArtifacts`, with the falsified
reason kept beside its replacement. A declared `artifact_write` without the flag is now removed as
`artifact_publish_not_granted` and logged at warning.

Pinned by `apps/desktop/src/run-host/tools.test.ts` (the flag absent or false withholds the tool from the listing and the
callable set and logs the removal, red on the code before; the flag true keeps it; the built-in orchestrator holds none and logs
nothing), `configuration.test.ts` (the flag carried when stated, false otherwise) and `packages/engine/src/children/personas.test.ts`
(no built-in role declares the tool or carries the flag). `pnpm artifacts-proof` grants its orchestrator both keys and adds
launch 3b, which declares the tool without the flag: the session log carried
`WARNING tool 'artifact_write' removed from orchestrator by prerequisite (artifact_publish_not_granted) (REQ-TOOLS-004/006)` and
no artifact was stored; the whole proof passed (2026-10-07, load average 11.4 on four CPUs).
