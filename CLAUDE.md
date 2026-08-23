# CLAUDE.md

Before touching code, read
[AGENTS.md § Workflow](AGENTS.md#workflow--worktree-merge): it
decides whether the work belongs in a worktree, on a branch in the main
checkout, or straight on `master`, and it sets the order — **fast gate, merge
into `master` unasked**. Nothing there waits for a human.

## Worktrees in Claude Code sessions

AGENTS.md makes a worktree the default workspace for a feature. Claude Code owns
`.claude/worktrees/` and reaches it through session tools; the other harnesses
have their own areas and never write into this one.

- **Enter** with `EnterWorktree`, passing an explicit `name` in branch form
  (`feat/swr-2608-verifier-visibility`) — never the generated random one, since
  the branch follows from the name. It branches off `origin/master`, creates
  `.claude/worktrees/<name>`, and moves the session there.
- **Then** run `uv sync --all-packages` once — AGENTS.md § 1 says why that
  step is what makes a worktree trustworthy.
- **Leave** with `ExitWorktree` action `keep`, once the branch is committed and
  `master` is merged into it. Never `remove`: it deletes the branch, and at that
  point the merge has not happened yet.
- **Merge from the main checkout.** `ExitWorktree` puts the session back there;
  that tree is on `master`, so it is where AGENTS.md § 4's merge runs.
- **Only then** clean up: `git branch -d <branch>` and
  `git worktree remove .claude/worktrees/<name>`.
- **Background `Agent` calls** take `isolation: "worktree"` instead; they get
  their own tree and cannot use the session tools.
- Not every session can switch directory (a hook-driven or non-interactive run).
  Those fall back to the plain `git worktree add .tmp_wt/<name>` form in
  AGENTS.md § 1.