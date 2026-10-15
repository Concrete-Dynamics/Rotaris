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

## Outcome — repaired 2026-10-14 (fin46, `fin46-accept1-21`)

The module is renamed `packages/ui/src/css-cascade.test-support.ts` (a `git mv`; its content is unchanged but for the header,
which now states the name and what pins it). Its two importers read it at the new path, and the two repaired notes that named
it at the old one (`the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md`,
`the-restore-confirmations-preview-field-is-not-drawn-in-the-monospace-face.md`) say it has since been renamed. The suffix
is not one `vitest.config.ts` collects (`*.test.ts` only), and it is not one the lint treats as a test, so the module is
still type-checked and linted as source. `.claude/rules/tests-and-proofs.md` states the naming.

**Pinned** by `packages/ui/src/test-support.test.ts`, which walks the package's relative imports from the entries its
`package.json` exports: every module that only tests reach must be named `*.test-support.ts`, no product module may import
one, and no entry may reach one. On the unrepaired tree it fails with `["css-cascade.ts"]` misnamed; with an
`import './css-cascade.test-support.js'` added to `theme.ts` it fails with `theme.ts -> css-cascade.test-support.ts`.

**Shown** by the build: no proof found this (it was a reviewer's reading), and the product's behaviour does not change, so
the evidence is that a `pnpm build` of this branch carries no trace of the module in `apps/desktop/out/` (a search for
`cascadeOf`, `selectorMatches` and `css-cascade` finds nothing). Neither entry reached it before the rename either, so this shows the rename changed nothing that ships.

The same shape outside `@rotaris/ui` is recorded, not repaired here:
[`../workspace-traceability-test-support-is-named-as-product-modules.md`](../workspace-traceability-test-support-is-named-as-product-modules.md).
