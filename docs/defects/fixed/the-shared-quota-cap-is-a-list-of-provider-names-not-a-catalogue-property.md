## The shared-quota cap is a list of provider names in configuration, not a number the catalogue entry declares

`PD-PROVIDER-001` (the ruling of OQ-6, 2026-10-06, R-071) has each provider's catalogue entry declare its shared-quota cap
as a number, the cap every model of that provider carries unless the user sets one. The build applies the right numbers
— `deepseek` 3 and `claude-code` 2 — but holds them in configuration's provider-conditional default
(`defaultMaxParallel`), a function that names the two providers, and the catalogue entry declares nothing. So a provider
added to the catalogue cannot declare a cap of its own, and the list of names REQ-MONITOR-021 refuses to hold lives in
the product's code. The caps in force, and what a user sees, are what the directive states; only the place differs.

Noticed 2026-10-06 while ruling OQ-6 as the owner directed (fin20); not repaired, since the ruling task changes no
product code.

## Specs

`PD-PROVIDER-001` ("declared on that provider's catalogue entry as a number"), narrowing REQ-MONITOR-021; REQ-PROVIDER-049
("the cap in force for a model is the one its provider's catalogue entry declares"); REQ-PROVIDER-002's closed attribute
set, which a declared cap would join; REQ-CONFIG-095, whose two values the build applies.

## Relevant files

- `packages/config/src/sections/models.ts` — `defaultMaxParallel(provider)`, the two names and their caps, applied when
  `max_parallel` is not stated.
- `packages/providers/src/catalogue.ts` — `CatalogueEntry` and `CATALOGUE`, which carry no quota attribute.
- `packages/engine/src/children/model-slots.ts` — where the cap in force is applied.

## Outcome

Repaired 2026-10-06 (fin22, bundle `fin22-window-strip-config`). Each provider's catalogue entry declares its shared-quota
cap as a number, `CatalogueEntry.sharedQuotaCap` (`packages/providers/src/catalogue.ts`: `deepseek` 3, `claude-code` 2,
every other entry `null`, none), checked by `validateCatalog` (a whole number of at least 1, or none). Configuration names no
provider any more: `defaultMaxParallel` is removed, and a `models:` entry's `max_parallel` is absent when unstated, a number
or an explicit `null` when stated (REQ-CONFIG-057). The run host cannot read the providers package (the component view),
so main's handshake `hello` carries `sharedQuotaCaps()` (`packages/contracts/src/process-protocol.ts`, an optional field),
the run host keeps it (`RunHost.sharedQuotaCaps`, `apps/desktop/src/run-host/dispatch.ts`), and every run's `modelCapFor`
applies `modelCapInForce` (`packages/config/src/sections/models.ts`): the entry's stated cap replaces the declared one
entirely, raising, lowering or removing it; unstated, the provider's declared cap applies, and a provider declaring none
leaves its models unbounded. A provider added later caps its models by declaring a number on its entry.

Pinned by `packages/providers/src/catalogue.test.ts` (each entry's declaration and its validation), `packages/config/src/load.test.ts`
("the cap in force for a model", and an unstated `max_parallel` read as absent where it read 3), `apps/desktop/src/run-host/configuration.test.ts`
(a deepseek model capped at 3 only through the handed-in caps, 6 and `null` when stated) and `apps/desktop/src/run-host/dispatch.test.ts`
(the handshake keeps the caps). Each failed on the previous code. The caps in force, and what a user sees, are unchanged.
