## An explicit search base inside an ignored directory is walked

A `grep` `paths` entry or a `glob` `base_path` that names a directory inside a hard-coded ignore component, or under a
directory the workspace `.gitignore` prunes, is still walked. The walker (`walkFiles`) tests only the names of entries
*below* the base, never the base or its ancestors, and tests gitignore rules against each entry's full workspace-relative
path, whose rules also match descendants. So the answer for one base depends on how the user spelled one `.gitignore` line:

- `grep paths=['node_modules/x']` or `glob '*.js' base_path='node_modules/x'` serves `node_modules/x/index.js`, while
  `glob 'node_modules/x/*.js'` from the root answers `No files found`, and the whole-workspace scan never reaches it;
- `glob '*' base_path='.rotaris'` lists the product's own state (`secrets.yaml`, other sessions' records, isolated
  worktrees) that every root scan hides;
- with `gen/` ignored, `grep paths=['gen']` serves `gen/f.ts` and silently drops `gen/sub/g.ts`; with `gen` it serves
  nothing.

A `grep` entry naming one file is found by walking its parent's whole subtree and comparing lower-cased real paths
(`search.ts`), so a root-level file stats every file in the workspace, and on a case-sensitive disk naming `src/a.ts`
also searches `src/A.ts`.

Found 2026-10-07 by the R-072 consortium while ruling OQ-215 (live-run finding L3), and ruled as OQ-219 (G1): REQ-TOOLS-139
governs as written.

## Specs

REQ-TOOLS-139 skips "paths containing a hard-coded ignore component" and honours the workspace's `.gitignore` with
"directories pruned during traversal", for grep scans and glob alike; the paths a scan reports are workspace-relative
(REQ-TOOLS-138, REQ-TOOLS-141), so a match under `node_modules/x` is a path containing `node_modules`. The explicit-naming
exemption belongs to `read_file` and `haet_read` alone. REQ-TOOLS-140 lists the components; REQ-TOOLS-141 replaces only a
base outside the workspace or one that is not a directory.

## Relevant files

- `packages/agent-tools/src/tools/search.ts` — `walkFiles` (the per-entry `IGNORE_COMPONENTS` test, the base visited
  untested), `grepTool` (the parent walk and the lower-cased `only` comparison for a named file), `globTool` (the accepted
  base), and the two tool descriptions.
- `packages/config/src/init/gitignore.ts` — `ignoredBy`, whose rules also match descendants (shared with REQ-WORKSPACE-100's
  classifier; not changed by this repair).
- `packages/agent-tools/src/tools/tools.test.ts` — the grep and glob cases.

## Outcome — repaired 2026-10-07 (fin27), as OQ-219 rules

`scanExcludes(rules, relPosix, isDir)` (`packages/agent-tools/src/tools/search.ts`) applies the root-down walk's own tests to
every step of a workspace-relative path: a segment that is a hard-coded component, a proper directory prefix the
`.gitignore` prunes, or the path itself ignored. `walkFiles` returns without visiting a base it excludes, the path taken
relative to the run's own root, so a run rooted under `.rotaris/worktrees/<w>` scans normally. `grepTool` searches a named
file directly when `scanExcludes` passes it and it is at most 2 MiB and not binary, with the same matching and `max_matches`
stop; the parent walk and the lower-cased comparison are gone. `globTool` keeps an excluded base as the base, so it answers
`No files found`. The two tool descriptions say which directories and files are never searched and name `read_file` as the
route that remains. `ignoredBy` (`packages/config/src/init/gitignore.ts`) is unchanged. Pinned by the five cases under "an
explicit base or a named file inside an excluded directory yields nothing" in
`packages/agent-tools/src/tools/tools.test.ts`, among them the property that a scan beneath each of six bases equals the
root scan restricted to it; four were red before the repair.
