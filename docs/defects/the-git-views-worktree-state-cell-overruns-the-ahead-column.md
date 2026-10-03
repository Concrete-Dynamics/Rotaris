## The Git view's worktree State cell overruns the Ahead column

A worktree row bound to a session draws its State cell as the session's status followed by ` · {merge status}`
(`completed · ready`, REQ-GIT-109). At the opening window size (1440×900) that text is wider than the State column, is
neither wrapped nor shortened, and runs on under the next cell: the Ahead figure is painted over it, so the row reads
`completed · r0ady` / `completed · r1ady`, the Ahead figure on top of `ready`'s `e`. Seen in `pnpm git-proof`'s
`isolated.png` (launch 3) and `worktree-ahead.png` (launch 3b), 2026-10-03, while repairing the status strip's worktree
branch (acceptance F8); only a row bound to a session carries the longer status word, so the unbound `idle · ready` rows
fit. The same screenshot shows the base row's branch name cut to `ma…` beside its `base`
and `active` tags, which may be the column budget working as intended. Not repaired: outside that task.

## Specs

- REQ-GIT-109: a matched worktree carries the session's execution status and the binding's merge status; drawn over by
  the next column, the merge status is not legible.
- REQ-SHELL-022 states the labels rendered in full at the minimum window only; no requirement names this table's column
  widths, so the overrun contradicts no stated figure — it is a craft defect against the adopted design language's table
  (`docs/design/README.md`), which never lets one cell paint into another.

## Relevant files

- `packages/ui/src/GitView.tsx`: the worktree row's `td.git__cell-state` (`{status}<span class="git__merge-status"> · {merge}</span>`).
- `packages/ui/src/shell.css`: `.git__merge-status` and the worktree table's column rules.
- `apps/desktop/scripts/git-proof.mjs`: launches 3 (`isolated`) and 3b (`worktree-ahead`) paint the bound row; no assertion reads its geometry.
