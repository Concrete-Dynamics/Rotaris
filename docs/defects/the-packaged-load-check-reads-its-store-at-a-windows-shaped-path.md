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
