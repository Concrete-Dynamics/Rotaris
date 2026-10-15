## The workspace package's traceability test support is named as product modules

Two modules under `packages/workspace/src/traceability/` are reached by tests alone and by neither the package's entry
(`src/index.ts`) nor any product module, yet sit beside the engine under ordinary module names, so a reader of `src/` takes
them for product code:

- `scale-fixture.ts`, Spike 7's generator of a large requirement store and source tree, imported only by
  `traceability.proof.test.ts` (its header says so: "Not exported from the package index; the proof and the tests use it").
- `growth-readings.ts`, `interleavedMinima` and `growthPair`, which order the timed readings of that proof's growth ratio,
  imported only by `traceability.proof.test.ts` and its own `growth-readings.test.ts`.

It is the shape `packages/ui/src/css-cascade.ts` had
([`fixed/the-css-cascade-reading-is-test-support-named-as-a-product-module.md`](fixed/the-css-cascade-reading-is-test-support-named-as-a-product-module.md)),
whose repair named test support `<unit>.test-support.ts` and pinned it for `@rotaris/ui` only. Noticed on 2026-10-14 (UTC, late) by fin46's
builder of `fin46-accept1-21`, walking every package's relative imports from its `package.json` entries for that repair: these
two are the only other modules in `packages/` that tests alone reach. Recorded, not repaired: it is outside that task.

`packages/workspace/src/traceability/consumer.ts` is also reached by its own test only, but it is product code built "as far as
the product reaches" (Part AJ2, REQ-TRACE-176/181/182/183/500) and is not of this shape.

A repair renames the two (`scale-fixture.test-support.ts`, `growth-readings.test-support.ts`, its test following as
`growth-readings.test-support.test.ts` or staying a test of the renamed unit), repoints the prose that names them
(`apps/desktop/scripts/traceability-proof.mjs`, `apps/desktop/scripts/requirements-proof.mjs`,
`apps/desktop/scripts/lib/growth-verdict.mjs`, `docs/architecture/codebase.md`, `docs/architecture/first-executions.md`, the
traceability notes in `docs/defects/fixed/`), and widens the guard in `packages/ui/src/test-support.test.ts` to every package
or adds one beside the workspace package.

## Specs

None. No requirement governs how test support is named; this is a reading defect of the code base, not of the product.

## Relevant files

- `packages/workspace/src/traceability/scale-fixture.ts`: test support under a product name.
- `packages/workspace/src/traceability/growth-readings.ts`: test support under a product name.
- `packages/workspace/src/traceability/traceability.proof.test.ts`, `packages/workspace/src/traceability/growth-readings.test.ts`:
  their only importers.
- `packages/ui/src/test-support.test.ts`: the guard that pins the naming for `@rotaris/ui` only.
