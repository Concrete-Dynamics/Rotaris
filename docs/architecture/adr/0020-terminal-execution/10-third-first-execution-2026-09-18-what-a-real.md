# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Third first execution — 2026-09-18, what a real completed run did with the reset and the exit code

Part 10 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## Third first execution — 2026-09-18, what a real completed run did with the reset and the exit code

Run `cc6191a2` (logged as R-039) completed and its autopsy found two things this record had decided on paper
but never executed against a real run.

**The reset kept the REQ-TOOLS-099 contract and lost the shell around it.** A command that hung on an
unbalanced quote hit the hard timeout, the session respawned at the default directory with a default
environment, and the agent spent the next turns re-discovering where it had been. The tree must go and the
session must restart — that stands — and what happens *after* the restart is new, under PD-TOOLS-001: the
snapshot after each completed command (the cwd plus the exported variables, captured on the idle shell through
the session''s own marker scan rather than a private poll, which wedged the first draft), re-applied to the
fresh shell, the observation naming both the loss and the restore. The refresh is awaited, not
fired-and-forgotten: it rides the same scan a concurrent next command would overwrite. An explicit reset
clears the snapshot — the user asked for a clean shell. Aliases, functions and background jobs are not
restored and the detail says so. The timeout test now asserts the variable survives the respawn.

*Reported back 2026-09-29 (R-067), when the timeout test's intermittent `[]` was traced
([`a-hard-timeout-reset-can-lose-the-restored-variable-under-load`](../../../defects/fixed/a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md)):
"the snapshot after each completed command" means each command the session **sees** complete. A command that
soft-paused (REQ-TOOLS-098) and finished while the next call waited behind it is never seen. Its effects are then
missing from the snapshot a later reset re-applies, although they happened before the respawn PD-TOOLS-001 names.
The test had run into that, and now names its own timeout. Whether the directive asks for more is
[OQ-134](../../open-questions.md).*

**The exit-1 map is narrowed, not widened.** The run''s `git diff --no-index` with differences exited 1
carrying the payload and read as `shell_failure`, which the agent had to explain away. REQ-TOOLS-112 test 4
stands; the carve-out is the commands whose exit 1 IS the convention — `git diff`/`diff`, `grep` and its kin
plus `findstr` on Windows — matched on the command''s own leading tokens, with a real failure kind still
outranking it. Recorded as ESC-41; the amendment round writes the carve-out into the requirement. The e2e
proof spells the search portably (`findstr` on Windows, `grep` on POSIX) because the suite runs on both.
