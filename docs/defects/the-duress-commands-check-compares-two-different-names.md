## The duress run's commands check compares two different names and can never match

"Every child that ran a command reported its commands" finds a child's terminal calls by comparing the call's
`agent_name` (the canonical name, `b--add-test-…`) with the child's `given_name` (`b: add test/…`). They never match, so
no child is ever found to have run a command, and the check is never asked; the run's note says no child ran one.

Live-run finding: H-b (live runs of 2026-09-29)

## Specs

- None; harness.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: child `b` ran 12 commands and reported all 12 (`results.json`, `commands: 12`), yet the
  note read that no child ran a terminal command.

## Relevant files

- `apps/desktop/scripts/live-run.mjs:1903` — `call.agent_name === c.given_name`.
- `apps/desktop/scripts/live-run.mjs:1880` — the children query selects `given_name` and not `canonical_name`.
