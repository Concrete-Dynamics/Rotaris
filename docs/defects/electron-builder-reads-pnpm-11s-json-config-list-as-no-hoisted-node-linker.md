## electron-builder reads pnpm 11's JSON `config list` as no hoisted node linker

electron-builder 26.15.3 decides whether the workspace's `node_modules` is hoisted by running `pnpm config list` and
splitting its output into `key=value` lines, looking for `node-linker=hoisted`
(`node_modules/app-builder-lib/out/node-module-collector/nodeModulesCollector.js`, `isHoisted`). pnpm 11.9.0 prints that
list as JSON (`"nodeLinker": "hoisted"`, measured 2026-11-01 in a worktree of `6a7f5088`: no line of the output holds
an `=`), so the test never matches and the collector takes this repository's layout for pnpm's isolated virtual store.
With that answer it skips the downward search that finds a version-conflicted copy nested at
`node_modules/<a>/node_modules/<b>` (`pnpmNodeModulesCollector.js`, `locateFromDepOrRoot`, `skipDownwardSearch`), which is
the one place a hoisted tree keeps a second version of a package. Whether the packaged `win-unpacked` tree misses or
mis-picks such a copy today is not measured; the collector first searches from each dependency's own reported path,
which may find it anyway. Noticed while making the supply-chain settings explicit (R-091, hardening bundle G1); not
repaired there.

## Specs

None directly. ADR-0056 requires the installer and the portable to carry the tree that was tested, which a collector
that misreads the layout may not do for a nested copy.

## Relevant files

- `node_modules/app-builder-lib/out/node-module-collector/nodeModulesCollector.js` — `isHoisted`: parses `pnpm config list` as `key=value` lines.
- `node_modules/app-builder-lib/out/node-module-collector/pnpmNodeModulesCollector.js` — `locateFromDepOrRoot`: skips the downward search when not hoisted.
- `pnpm-workspace.yaml` — `nodeLinker: hoisted`, the setting pnpm 11 reads; `.npmrc`'s `node-linker=hoisted` is not read by pnpm 11.
- `apps/desktop/scripts/package.mjs` — step 2, electron-builder, where the collector runs.
