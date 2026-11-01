## `delegate` offers and admits personas that are not delegation targets

`delegate`'s catalogue lists every persona of the configuration (`PersonaResolver.knownRoles()`, which is
`Object.keys(cfg.personas)`), and the ledger and the run's admission resolve through the same resolver, so the three personas the
specification keeps out of delegation are offered and admitted:

- `intent-classifier` is in the defaults (`packages/config/src/defaults.ts`, "a built-in persona outside the delegation
  vocabulary"): in the default live run at `a68f121` (pack `2026-10-07T06-48-50-123Z`; the autopsy's finding P5) 71 of 71
  coordinator requests offered "intent-classifier (none of these: it neither reads nor writes workspace files nor runs
  commands)". A child of it would run with an empty prompt and no tools.
- `gatekeeper` is in the built-in table and listed among the research and decision roles
  (`packages/agent-tools/src/tools/delegation.test.ts` pins it).
- `project-initializer`, when a configuration names it, is offered and admitted the same way.

The rejections that list known personas name them too (the ledger's unknown-persona message, the write-scope refusal's writers
through `fileWriters`), and the resolver path's unknown-persona message omits the aliases REQ-ORCH-034 requires.

## Specs

- REQ-MCP-014: `intent-classifier` and `project-initializer` "are personas that are not delegation targets".
- REQ-ORCH-126: `gatekeeper` is "reachable only through the gate-authoring path and never as an ordinary delegation target".
- REQ-ORCH-034: an unknown role is rejected "with a message listing the known role names and the supported aliases rendered as
  `<alias>-><target>`" — the resolver path lists no aliases.
- REQ-ORCH-038: an unknown role is rejected with no spawn.
- `PD-TOOLS-006` revision 4: the catalogue names "every persona that agent can delegate to".

## Relevant files

- `packages/contracts/src/roles.ts` — the role vocabulary; no record of which personas are not delegation targets.
- `packages/engine/src/children/personas.ts` — `PersonaResolver.knownRoles`, `knownRolesMessage`.
- `packages/engine/src/children/ledger.ts` — `spawn`'s unknown-persona rejection.
- `packages/engine/src/children/orchestration.ts` — `delegate()`'s admission.
- `packages/engine/src/children/write-scope.ts` — `fileWriters`.
- `apps/desktop/src/run-host/configuration.ts` — `personaResolverFor`'s `knownRoles`.
- `apps/desktop/src/run-host/tools.ts` — `delegateCatalogue`.

## Outcome

Repaired 2026-10-13 (fin33, `fin33-delegation-targets-and-plan`) as [OQ-228](../../archive/architecture/open-questions/53-spikes-and-later-questions-20.md#oq-228) rules it,
covered work under REQ-MCP-014, REQ-ORCH-126, REQ-ORCH-034 and REQ-ORCH-038. `NOT_DELEGATION_TARGETS` (`packages/contracts/src/roles.ts`)
names the three reserved personas with what the product runs each for; `PersonaResolver.delegationTargets` (renamed from
`knownRoles`, now filtered) and `delegationTargetsFor` are the one list the catalogue, `ChildLedger.spawn`, `fileWriters` and
`IterationChildren.delegate` read; `resolveDelegationTarget` refuses an unknown or reserved persona first in `delegate()`, with no
record and no task id, its reason listing the targets and the `<alias>-><target>` aliases. Pinned by
`packages/contracts/src/contracts.test.ts`, `packages/engine/src/children/children.test.ts` ("OQ-228 / OQ-229"),
`apps/desktop/src/run-host/tools.test.ts` ("OQ-228 (red)") and `packages/agent-tools/src/tools/delegation.test.ts`, each red on the
code before where it pins a behaviour.
