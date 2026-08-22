# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Canonical agent instructions live in [AGENTS.md](AGENTS.md)** — read that first.
It carries the architecture map, naming, rules, workflow, critical ReqToCode rules,
commands, conventions, and links to every scoped instruction file and policy doc.

Before touching code, read
[AGENTS.md § Workflow](AGENTS.md#workflow--worktree-merge-verify-fix-forward): it
decides whether the work belongs in a worktree, on a branch in the main
checkout, or straight on `master`, and it sets the order — **fast gate, merge
into `master` unasked, verify the merged tree, fix forward on a short `fix/…`
branch**. Nothing there waits for a human, and the long suites run after the
merge, never in front of it.

This file adds only what is true for **Claude Code sessions and false or
meaningless for the other agents** — Rotaris' own agents and anything else
reading AGENTS.md. One fact, one home: everything shared belongs in AGENTS.md or
the scoped file that owns it, and nothing here may be copied there.

## Worktrees in Claude Code sessions

AGENTS.md makes a worktree the default workspace for a feature. Claude Code owns
`.claude/worktrees/` and reaches it through session tools; the other harnesses
have their own areas and never write into this one.

- **Enter** with `EnterWorktree`, passing an explicit `name` in branch form
  (`feat/swr-2608-verifier-visibility`) — never the generated random one, since
  the branch follows from the name. It branches off `origin/master`, creates
  `.claude/worktrees/<name>`, and moves the session there.
- **Then** run `uv sync --all-packages` once, before any test — AGENTS.md § 1
  says why that step is what makes a worktree trustworthy.
- **Leave** with `ExitWorktree` action `keep`, once the branch is committed and
  `master` is merged into it. Never `remove`: it deletes the branch, and at that
  point the merge has not happened yet.
- **Merge and verify from the main checkout.** `ExitWorktree` puts the session
  back there; that tree is on `master`, so it is where AGENTS.md § 4's merge and
  § 5's full pass both run. A `fix/…` branch for a post-merge failure is cut
  there too — merge it, `git branch -d` it, and the checkout is back on `master`
  within minutes.
- **Only then** clean up: `git branch -d <branch>` and
  `git worktree remove .claude/worktrees/<name>` after § 5 is green, not before.
- **Background `Agent` calls** take `isolation: "worktree"` instead; they get
  their own tree and cannot use the session tools.
- Not every session can switch directory (a hook-driven or non-interactive run).
  Those fall back to the plain `git worktree add .tmp_wt/<name>` form in
  AGENTS.md § 1.