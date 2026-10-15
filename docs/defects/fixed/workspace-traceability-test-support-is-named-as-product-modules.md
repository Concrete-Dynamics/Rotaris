## The workspace package's traceability test support is named as product modules

Two modules under `packages/workspace/src/traceability/` are reached by tests alone and by neither the package's entry
(`src/index.ts`) nor any product module, yet sit beside the engine under ordinary module names, so a reader of `src/` takes
them for product code:

- `scale-fixture.ts`, Spike 7's generator of a large requirement store and source tree, imported only by
  `traceability.proof.test.ts` (its header says so: "Not exported from the package index; the proof and the tests use it").
- `growth-readings.ts`, `interleavedMinima` and `growthPair`, which order the timed readings of that proof's growth ratio,
  imported only by `traceability.proof.test.ts` and its own `growth-readings.test.ts`.

It is the shape `packages/ui/src/css-cascade.ts` had
([`the-css-cascade-reading-is-test-support-named-as-a-product-module.md`](the-css-cascade-reading-is-test-support-named-as-a-product-module.md)),
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

## Outcome — repaired 2026-10-15 (fin47, `fin47-guard-and-support`)

The two modules are renamed as `css-cascade.test-support.ts` was (each a `git mv`; the content is unchanged but for a header
paragraph that states the name, the old one and what pins it): `packages/workspace/src/traceability/scale-fixture.test-support.ts`
and `packages/workspace/src/traceability/growth-readings.test-support.ts`. The latter's own test keeps its name,
`growth-readings.test.ts`, as a test of the renamed unit, so the record's many citations of it stay true. Their importers
(`traceability.proof.test.ts`, `growth-readings.test.ts`) read them at the new paths; the proof scripts' prose
(`apps/desktop/scripts/traceability-proof.mjs`, `apps/desktop/scripts/requirements-proof.mjs`,
`apps/desktop/scripts/lib/growth-verdict.mjs`) names the new paths; and the record's historical mentions (`codebase.md`'s
traceability row, `spikes/traceability-scale.md`, ADR-0040's 2026-10-01 and 2026-10-02 report-backs, the two `first-executions.md`
rows and the two traceability notes in `fixed/`) keep the old name with "(since 2026-10-15 `<unit>.test-support.ts`)" beside it.

The guard is widened to every package: `packages/ui/src/test-support.test.ts` moved to
`tools/test-support-naming/test-support-naming.test.ts` (a `git mv`) and walks each package under `packages/` from its own
`package.json` `exports`. It holds the same four rules for each (every module only tests reach is `*.test-support.ts`, no product
module imports one, no entry reaches one, and the renamed units keep their names) and one stated exception:
`packages/workspace/src/traceability/consumer.ts`, product code that only its own test reaches today (Part AJ2), kept in
`PRODUCT_NOT_YET_REACHED` with its reason, and checked to be still present and still unreached, so the exception fails the guard
once it is no longer true. `.claude/rules/tests-and-proofs.md` and `css-cascade.test-support.ts`'s header name the new guard.

**Pinned** by `tools/test-support-naming/test-support-naming.test.ts`: on the unrepaired tree it fails twice, with
`["packages/workspace/src/traceability/growth-readings.ts", "packages/workspace/src/traceability/scale-fixture.ts"]` misnamed
and `scale-fixture.test-support.ts` missing; after the rename all five cases pass. The walk over every package found no other
module of this shape.

**Shown** by the proof that drives the renamed units: `pnpm traceability-proof`, which runs `traceability.proof.test.ts` (the one
importer of both outside their own test), passed at the new paths on 2026-10-15 (`--skip-build`, against this branch's build, under
`xvfb-run`; load average 1.0 to 1.24 on 4 CPUs; parse growth ratio 2.41 against work 2.14, sweep 2.07 against 2, parser 2.06
against 2). The product does not change: the package entry reached neither module before or after, so nothing that ships moves.
