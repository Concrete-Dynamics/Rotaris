## The packaged load check isolates only Windows and reads its store at a Windows-shaped path

`apps/desktop/scripts/package.mjs`'s rule 4 (b) launch hands the packaged executable a private
`LOCALAPPDATA` and then reads the store back at `join(lad, 'rotaris', 'data', 'workspaces')`. Both halves
assume Windows:

- the launch names only `LOCALAPPDATA`, so on Linux or macOS the packaged application resolves its data
  directory from `XDG_DATA_HOME` or `$HOME/.local/share` — the operator's own. This is the same shape as
  `docs/defects/fixed/proof-isolation-is-windows-only-so-a-driven-run-writes-the-users-real-data-directory.md`,
  and it is the one launch site that repair deliberately left alone;
- the reader spells the sub-location as `rotaris/data/workspaces`, which is what `resolveUserDirs`
  answers on `win32`. On POSIX the same product answers `<XDG_DATA_HOME>/rotaris/workspaces` — no `data`
  segment — so even with both variable pairs named, this reader would find nothing.

Repairing the first half without the second would make the check pass by finding zero stores where it
used to find one, which is why it was left whole rather than half-moved.

## Specs

No requirement is contradicted. `REQ-STARTUP-145` fixes where the product stores its data and the product
obeys it on every platform; this is a defect of the script that measures the packaged build.

**IC-3 currently blocks a Linux or macOS release artifact at all**, so nothing runs this script on a
platform where the defect bites. It is recorded because the build-host obligations IC-3 names are owed,
and this is one of the things that will be wrong on the day they are met.

## Relevant files

- `apps/desktop/scripts/package.mjs` — the launch environment around line 150, and the store reader
  below it.
- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv`, the shared isolation every other launch
  site now uses.
- `packages/platform/src/dirs.ts` — `resolveUserDirs`, whose two branches differ by one path segment.

Noticed 2026-09-22 while routing every proof launch through the shared isolation.

## Repaired — 2026-09-22, both halves, same day it was filed

The note said the two halves had to move together or the check would "pass by finding zero stores where
it used to find one". They move together here.

**The rule now has one home.** `apps/desktop/scripts/lib/harness.mjs` gains `workspacesRootFor(local,
platform)`, which answers `<local>/rotaris/data/workspaces` on win32 and
`<local>/rotaris/data/rotaris/workspaces` on POSIX — the second being what `proofIsolationEnv`'s
`XDG_DATA_HOME` plus `resolveUserDirs`'s own `join(data, name)` actually produce. Four readers used it:

- `package.mjs` — the rule 4 (b) launch, which also now takes the whole `proofIsolationEnv` rather than
  `LOCALAPPDATA` alone;
- `terminal-proof/packaged.mjs` and `code-intel-proof.mjs` — the same literal, the same two places;
- `autopsy.mjs` — which had both branches already but named only `~/.local/share` on the POSIX side and
  so could not find a store on a machine that sets `XDG_DATA_HOME`. Every driven launch sets it now.

**The copy cannot drift, and that is asserted rather than hoped.** `harness.mjs` is plain JavaScript run
straight from the repository and cannot import a TypeScript package, so the rule is duplicated.
`proof-isolation.test.ts` compares `workspacesRootFor` against the product's own
`dataLayout(resolveUserDirs(...))` for `win32` and `linux`, and separately asserts that the two answers
differ — so the comparison cannot pass by agreeing with itself.

**IC-3 still blocks a Linux or macOS release artifact, and this does not change that.** What it changes
is that the scripts will be right on the day the build hosts exist, rather than silently reporting an
empty store. `darwin` is excluded from the comparison on purpose: it composes from `HOME` and is not a
`local`-rooted answer at all, which the test says in place rather than leaving to be discovered.

Measured: `apps/desktop/scripts/lib/` green (8 cases in this file); all scripts parse; `pnpm check`
exit 0. `pnpm package` itself is NOT run here — it produces a release artifact, takes many minutes, and
IC-3 bounds it; what is measured is the path rule it depends on, on both platforms.
