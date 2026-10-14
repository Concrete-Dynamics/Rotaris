## The CSS cascade reading is test support named as a product module

`packages/ui/src/css-cascade.ts` is the cascade reading two CSS tests share (`checkpoint-dialogs-css.test.ts` and
`library/artifact-inspector-css.test.ts`): it ranks the renderer's stylesheet declarations on an element chain so a test can
say which declaration wins. Nothing in the product imports it, and neither of the package's entries (`src/index.ts`,
`src/design-system/index.ts`) reaches it; only those two tests do. Yet it sits in `src/` beside the components under an
ordinary module name, so a reader of the package takes it for product code the renderer runs. Only its header comment says
otherwise ("Test support only"). It is the one module under `packages/ui/src/` that tests alone reach.

Found as an optional finding of fin45's review (Task 1B) and carried by acceptance round 1 of fin46 as finding C14
(harness defect, cosmetic). Confirmed on `fin46-accept1-21` at `fe4a055`: a walk of the package's relative imports from its
`package.json` entries leaves `css-cascade.ts` unreached and imported by those two tests only.

## Specs

None. No requirement governs how test support is named; this is a reading defect of the code base, not of the product.

## Relevant files

- `packages/ui/src/css-cascade.ts`: the module, test support under a product name.
- `packages/ui/src/checkpoint-dialogs-css.test.ts`, `packages/ui/src/library/artifact-inspector-css.test.ts`: its only
  importers.
- `packages/ui/package.json`: the entries (`exports`) that do not reach it.
