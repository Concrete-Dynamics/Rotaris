## A persona's `delegates_to` never narrows its delegations

The loader parses `delegates_to` (`packages/config/src/sections/personas.ts`), canonicalises its role names (`merge.ts`),
reports an entry naming no configured role and any delegation cycle through the lists (`validate.ts`), Settings shows those
messages, and an unattended run refuses to start over them. Nothing else reads the list: `delegate`'s catalogue
(`delegateCatalogue`), the ledger's `spawn` and the run's `delegate()` admission never consult it, so a persona whose
`delegates_to` names `[coding-agent, tester]` is still offered and admitted every other persona. A correct list changes nothing;
only a misspelt one has any effect, a warning.

Raised by the R-072 consortium's ruling of finding P5 (the default live run at `a68f121`), which set it aside as its own
question: no live run sets the key.

## Specs

- REQ-CONFIG-101: `delegates_to` is "roles this one may spawn", defaulting to empty.
- REQ-ORCH-034 and REQ-ORCH-038: the rejection of a delegation to a role the caller may not reach.

## Relevant files

- `packages/config/src/sections/personas.ts`, `packages/config/src/validate.ts` — the parse and the referential and cycle
  checks.
- `apps/desktop/src/run-host/configuration.ts` — `personaResolverFor`, which does not carry the list onto the persona.
- `apps/desktop/src/run-host/tools.ts` — `delegateCatalogue`.
- `packages/engine/src/children/personas.ts`, `ledger.ts`, `orchestration.ts`, `write-scope.ts` — the resolution, the spawn,
  the admission and the writers list.

## Outcome

Repaired 2026-10-13 (fin33, `fin33-delegation-targets-and-plan`) as [OQ-229](../../archive/architecture/open-questions/53-spikes-and-later-questions-20.md#oq-229) rules it,
covered work under REQ-CONFIG-101. A non-empty `delegates_to` becomes `Persona.delegatesTo` (`personaResolverFor`), and
`delegationTargetsFor` narrows the caller's targets by it for the catalogue (which then says it is narrowed), admission, the
ledger and the write-scope refusal's writers; a persona outside the list is refused naming the caller's `delegates_to`. An empty
list narrows nothing. Four shapes a person could misread are logged once at run setup. Pinned by
`packages/engine/src/children/children.test.ts`, `apps/desktop/src/run-host/tools.test.ts`,
`apps/desktop/src/run-host/configuration.test.ts` and `packages/agent-tools/src/tools/delegation.test.ts`.
