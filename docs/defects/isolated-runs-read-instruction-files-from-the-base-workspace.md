## An isolated run reads instruction files from the base workspace, not its worktree

`REQ-WORKSPACE-050` splits where the three kinds of workspace material are read from when a run executes
in an isolated worktree: **context files from the run's execution root**, the portable-skill catalog and
persona memory from the user-selected base workspace, so persistent workspace metadata stays with the base.

The injection built for `PD-WORKSPACE-002` reads both from the base workspace. `SkillHost.contextUnits` is
wired in `host.ts` as `contextUnits: () => skills.contextUnits(workspaceRoot, ctx.sessionId)`, where
`workspaceRoot` is what `configure` was called with — the base workspace — and `workspaceContext` resolves
its `workspace:` discovery base from that same argument. The comment beside the wiring cites
REQ-WORKSPACE-050 for the skills half, which is correct; the context half is the half it does not do.

The effect: a session running in a worktree is given the base workspace's `AGENTS.md` even where the
worktree's branch changed it, and never the worktree's own. The per-file switches are unaffected — they key
on a stable identity, not on the path — so the switch a user sets still governs; what is wrong is which
file's text that identity resolves to.

## Specs

`REQ-WORKSPACE-050`, in full, is unmet in the context-file half. `REQ-WORKSPACE-041` as narrowed by
`PD-WORKSPACE-002` fixes the names and the bases but not the root the workspace base resolves to, so this
is REQ-WORKSPACE-050's sentence alone.

The merged-context cache (`REQ-WORKSPACE-046`, keyed per workspace root) is a second thing a repair has to
settle: two sessions on one base workspace with different execution roots would need different cache keys,
which the present `Map<string, string>` keyed on the base root cannot hold.

## Relevant files

- `apps/desktop/src/run-host/host.ts` — the `configure` wiring that supplies `contextUnits`, and the
  comment there that cites REQ-WORKSPACE-050 for the skills half only.
- `apps/desktop/src/run-host/skills.ts` — `workspaceContext` and the `contexts` cache keyed per
  workspace root.
- `packages/config/src/instructions.ts` — `discoverInstructionFiles`, whose `workspaceRoot` is the
  argument a repair would change.
