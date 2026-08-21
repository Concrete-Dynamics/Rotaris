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

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->