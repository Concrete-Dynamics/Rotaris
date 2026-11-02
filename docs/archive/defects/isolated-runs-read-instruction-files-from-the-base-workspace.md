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

## Fixed 2026-09-22

Confirmed first, against a real tree: a base workspace and a worktree each holding their own `AGENTS.md`,
and `SkillHost.contextUnits` asked for the worktree — it answered with the base's text (`skills.test.ts`,
red before the change).

The repair carries the execution root to the reader rather than teaching the reader to guess it:

- `Sessions.setupFor` takes the root the run **executes** in and passes it to `configure` — from
  `opts.worktree` at a start, from the stored binding (`effectiveRootOf`) at a continuation, a resume and
  a plan-gate relaunch, so every route that starts a run in a bound session carries it.
- `host.ts` and `dispatch.ts` hand it to `SkillHost.contextUnits`, which reads the instruction files from
  it while the catalog, the policy and the `global`/user bases stay with the base workspace — the other
  half of the same sentence, which was already right.
- The cache the note names as the second thing to settle is now nested — base workspace, then execution
  root — so two sessions on one base with different trees hold different merges and neither answers for
  the other, while a rescan and a session creation still clear by the base root alone (REQ-WORKSPACE-046).

The per-file switches were not touched and did not need to be: they key on a stable identity
(`workspace:AGENTS.md`), so the switch a user set governs whichever root the text is read from.

Evidence: `skills.test.ts` — the worktree's instructions reach the unit, the base's do not, the catalog
still comes from the base, and a session on the base itself is unaffected (red before, green after);
`session-resume.test.ts` — an isolated session hands `configure` the worktree as its execution root at
start and again at its continuation. `pnpm check` green in the worktree and on merged `main` but for
`terminal.test.ts`'s real `git diff` case, which fails identically on `main` before this change (the
recorded `the-real-git-diff-terminal-test-times-out-on-win32.md`, exit 124).
