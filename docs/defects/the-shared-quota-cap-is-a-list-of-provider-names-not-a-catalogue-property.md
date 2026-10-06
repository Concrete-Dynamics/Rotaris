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
