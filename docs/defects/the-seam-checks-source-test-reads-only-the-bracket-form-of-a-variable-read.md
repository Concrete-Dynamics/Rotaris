## The seam check's source test reads only the bracket form of a variable read

`apps/desktop/scripts/lib/seam-check.test.ts` holds the source of the three roots a packaged build keeps (main, the run host,
the workspace service) to the seam check's lists: every `ROTARIS_*` variable read on a line without `__ROTARIS_SEAMS__` must be
one of the product's own seven or the packaged probe's three (`unflaggedVariables`), every capture variable likewise
(`unflaggedReads`), and every variable read behind the flag must be named by `FORBIDDEN` (`flaggedReads`). All three find a
read by one regular expression over the literal bracket form, `env['ROTARIS_X']` (`process.env[…]` alone for the last two).
A read written any other way is invisible to them:

- the dot form, `process.env.ROTARIS_X` or `deps.env?.ROTARIS_X`;
- a read keyed by a constant, `process.env[SOME_VARIABLE]` with `const SOME_VARIABLE = 'ROTARIS_X'` in this or another
  module. Three such reads exist on main today, all of product variables the list allows
  (`APP_LOG_LEVEL_VARIABLE` in `main/index.ts`, `PORTABLE_ARTIFACT_VARIABLE` and `APPIMAGE_VARIABLE` in
  `main/updater/classify.ts`, the last two declared in `packages/platform/src/artifact-environment.ts`), and the test sees none
  of them;
- a destructuring read, `const { ROTARIS_X } = process.env`.

So a verification seam added off the flag in one of those shapes would ship in a packaged build while this test passed. The
bundle-level check (`seam-check.mjs`'s `seamCheck`, run by `scripts/package.mjs`) still reads the emitted text for the name
itself and would refuse such a build, but only when a package is built: the source test exists to fail it first, and does not.
Found by fin45's review (Task 1A, optional) and taken as acceptance finding C12 of fin46's first round.

`apps/desktop/src/main/capture/seam-reads.test.ts` reads main with the same bracket-only expression; its rule over main is a
subset of `seam-check.test.ts`'s over the three roots.

## Specs

ADR-0056 rule 4 and its seam check: a packaged build carries no verification seam, and the source test is the step that
fails one before a package is built. No requirement's text is contradicted; the test does not measure what its name says.

## Relevant files

- `apps/desktop/scripts/lib/seam-check.test.ts` — `flaggedReads`, `unflaggedReads` and `unflaggedVariables`, each matching
  `env['ROTARIS_…']` only (line 137 for the last).
- `apps/desktop/scripts/lib/seam-check.mjs` — the lists the test holds the source to.
- `apps/desktop/src/main/index.ts`, `apps/desktop/src/main/updater/classify.ts`,
  `packages/platform/src/artifact-environment.ts`, `apps/desktop/src/main/app-log.ts` — the constant-keyed reads the test
  does not see.
- `apps/desktop/src/main/capture/seam-reads.test.ts` — the same bracket-only reader over main.
