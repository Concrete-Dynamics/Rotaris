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

## Outcome

Repaired 2026-09-29 under R-067. The children query selects `canonical_name`, and a child's terminal calls are found
under it (`childrenThatRanCommands` in `apps/desktop/scripts/lib/duress-checks.mjs`). Pinned by
`apps/desktop/scripts/lib/duress-checks.test.ts` ("a child's terminal calls are found under its canonical name"): child
`b` is found by its canonical name, where the given name found no child. Replayed over the 2026-09-29 pack's store, the
check finds `b` and its 12 reported commands, and the question is asked.

**What the live run found once the check could match (2026-09-30).** `pnpm live-run --confirm --skip-build --only=duress`
ran against `katalyst` (pack `.live-run/runs/2026-09-30T05-29-56-712Z`, session `c95d822d`). The check found `b` and its
6 reported commands. It then failed on `f`, which the deadline quit had paused mid-verification after 26 terminal
calls, and whose `report` column was NULL because a paused child has no report until it settles. "Reported none" is not
a reading of a child with no report. That was the check's gap, never visible while the names could not match. It now asks
only a child with a report; a child that ran commands and has not settled is named in a NOTE (`commandsReading` in
`duress-checks.mjs`, pinned by the case "asks only a child with a report"). Replayed over that pack's store, `b` is asked
(6 commands, none mute) and `f` is unsettled.
