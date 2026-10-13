## A sibling's native write is not subtracted from an observation taken through a symlinked workspace

`observeReach` (`packages/agent-tools/src/tools/observe.ts`) leaves out of a cross-file EDIT call's observed files what other
agents' native file tools wrote meanwhile, comparing the paths the run host's `WriteJournal` noted with the changed paths
resolved against the root it was given. The native tools note against `realPathOf(root)` (`apps/desktop/src/run-host/tools.ts`),
while the MCP executor passes the workspace root unresolved (`apps/desktop/src/run-host/mcp.ts`). When the workspace path runs
through a symbolic link the two spellings differ, nothing matches, and a sibling's write inside the call's reach is listed among
the observing child's changed files: overstated, never concealed, but a mismatch with OQ-245's ruling, which subtracts them.
Found by fin35's review (`review:edits-and-reports#1`); recorded by fin36 before the repair.

## Outcome

Repaired 2026-10-13 (fin36). **Confirming it found worse than the note said**: given a root that is a symbolic link,
`snapshotTree` walks it with `lstat`, which does not follow the link, so the walk saw no files at all and the observation was
an empty list — a cross-file EDIT call in a symlinked workspace was reported as having changed nothing, which conceals, against
REQ-ORCH-109 — before the sibling subtraction could even mismatch. `observeReach` now resolves the root with `realpathSync`
(falling back to the root as given) and walks and compares in that one spelling, the one the native tools note against. Pinned
by `observe.test.ts` ("a sibling's write noted against the real path is left out when the root is given through a symbolic
link", red before: `expected [] to deeply equal [ 'src/a.ts' ]`).

**Corrected by fin36's review, the same day.** The repair as first built resolved the root with the JavaScript
`realpathSync`, while the native tools note against `realPathOf`, which uses `realpathSync.native`. The two agree on Linux and
macOS, so the claim above that the walk and the comparison now use "the one the native tools note against" held there; on
Windows they do not: the JavaScript form leaves a substituted drive (`subst`), an 8.3 short name or a drive letter's case as
given, where the native form canonicalises them, so the observation could still be walked under one spelling and compared with
notes in another. `observeReach` now takes its root through `realPathOf` itself (`fence.ts`), the very function the notes use.
Pinned by `observe-root.test.ts` ("a workspace whose two resolutions differ is walked, and a sibling's noted write is left
out"), which stands the JavaScript resolution in for Windows' by answering every path as given: red on the first repair
(`expected [] to deeply equal [ 'src/a.ts' ]`), green after. Not driven on Windows.

## Specs

- OQ-245 (XE1, ruled under R-072): what another agent's native writes touched meanwhile is left out of the observation.
- REQ-ORCH-109: the report lists the files the child changed.

## Relevant files

- `packages/agent-tools/src/tools/observe.ts` — `observeReach`, `rootAbs`.
- `packages/agent-tools/src/tools/fence.ts` — `realPathOf`, the native resolution both sides now share.
- `apps/desktop/src/run-host/tools.ts` — the journal's notes, against `realPathOf(ctx.effectiveRoot ?? ctx.workspaceRoot)`.
- `apps/desktop/src/run-host/mcp.ts` — the executor's `observeReach({ root: workspaceRoot, … })`.
