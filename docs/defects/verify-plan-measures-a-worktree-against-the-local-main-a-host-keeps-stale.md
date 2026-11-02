## verify:plan measures a worktree against the local `main`, which a host keeps stale

`pnpm verify:plan` with no `--base` diffs against the merge-base with the local `main` and falls back to `origin/main`
only when `main` is missing (`collectGitPaths(root, 'main')`, `resolveCompareRef`). On a host where the primary checkout
is never written to (`AGENTS.md`, "Where the work happens"; the orchestrated build's `references/environment.md`,
"Places": "never write in it, not even a fast-forward"), the local `main` stays at whatever it last held while
`origin/main` moves on, and every worktree cut from `origin/main` shares that ref. The plan then names every file that
landed between the two as the diff's own, with their proof suites and review items.

Seen 2026-11-02 in `C:/dev/Rotaris-wt-hrd2-coverageratc` (branch `hrd2-coverage-ratchet`, cut from `origin/main` at
`2bb1ea60`), while the primary checkout's `main` stood at `fee57734`: the default plan read 384 paths, 41 proof scripts
and 11 review items, and its "Requirements this diff cites" named `PD-STARTUP-009` as newly cited and
`REQ-SESSION-117` as dropped, all from other landings; `--base=origin/main` read the branch's own 2 source files, no
proof and one review item. The skill (`.agents/skills/verify-plan/SKILL.md`) gives the default as the way to run it, so
an agent following it is told to run proof suites its change does not touch, or learns to skip what the plan names.

Not repaired here (noticed while building hardening bundle H2). One repair would prefer `origin/main` when it is ahead of
`main`, or say in the plan's head which ref it resolved and how far it is behind its upstream.

## Specs

None: a development tool. It works against `AGENTS.md`'s "run the whole suite a part touches" rule, which the planner
exists to make mechanical, by naming suites a part does not touch.

## Relevant files

- `tools/verify-plan/plan.mjs` — `collectGitPaths` (default `'main'`) and `resolveCompareRef` (tries `origin/<name>`
  only when the local ref is missing).
- `tools/verify-plan/plan.test.ts` — "collectGitPaths uses origin/main…" pins the fallback for a missing `main` only.
- `.agents/skills/verify-plan/SKILL.md` — states the default input as the merge-base with `main`.
