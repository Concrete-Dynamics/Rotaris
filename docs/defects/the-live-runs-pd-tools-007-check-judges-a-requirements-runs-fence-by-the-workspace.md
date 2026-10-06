## The live run's PD-TOOLS-007 check judges a requirements run's fence by the workspace, not by its worktree

`apps/desktop/scripts/live-run.mjs` reads a refused create-shaped `write_file` call (a path and content, no `operation`)
as PD-TOOLS-007's own refusal, `refusedFenced`, only when `outsideWorkspace(path)` says the write fence refuses the path,
and as the old shape, `refusedInferable` (a FAIL), otherwise. `outsideWorkspace` judges every session by the sandbox's
workspace. A requirements run is fenced to its worktree under `<workspace>/.rotaris/requirements/worktrees/…`, not to the
workspace: a create-shaped call from a requirements session naming a workspace path outside its worktree (`<workspace>/x.mjs`,
or `../../../../x.mjs` relative) is refused by the product's fence, `createOnlyTarget` in
`packages/agent-tools/src/tools/files.ts` returning null so no inference is made, yet the harness counts it
`refusedInferable` — a false FAIL of PD-TOOLS-007.

The c2a9444 pack shows the fence (`.live-run/runs/2026-10-06T17-41-48-175Z/workspace.db`, the requirements session's
ordinal 66): "Path '/tmp/rotaris-verify-req104.mjs' is outside workspace root
'<workspace>/.rotaris/requirements/worktrees/rotaris-req-req-104-u1'", and the session's own row records that worktree in
its `worktree` column (`worktree_path`). That run's create-shaped refusal (ordinal 62) named a path outside the workspace
as well, so the false FAIL did not arise there; a call naming the workspace root itself would have met it.

Found by fin23's verifier (plan fin23, landed at `d653d89`).

## Specs

None contradicted by the product: this is the harness. It bears on the verification of PD-TOOLS-007 ("a path the fence
refuses is not read as anything, and is refused as before") and REQ-TOOLS-130 (the fence's root).

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `outsideWorkspace`, and `checkToolRecord`, which passes it to `runWideReadings`.
- `apps/desktop/scripts/lib/tool-frictions.mjs` — `writeSelectorReadings`, `runWideReadings` and their `outside` option.
- `packages/agent-tools/src/tools/fence.ts` — `checkFence`, the product's fence, rooted at the run's workspace root (a
  requirements run's worktree).
