## By-design tool removals are logged at warning level on every coordinated run

When a control removes a tool from a persona — `coordinator_only` taking the orchestrator's `terminal` and file tools,
an executor absent for `git_commit` — the run host logs the removal through `ctx.warn`, which writes a `warn` line.
Every coordinated run writes four of them, in both the application log and the session log, and they are the only
warnings most sessions carry. The removal is the configuration working as designed.

Live-run finding: L14 (live runs of 2026-09-29)

## Specs

- `REQ-TOOLS-006` requires the removal to be logged and names no level; a warning for the designed case is noise that
  hides real warnings (and meets `REQ-SESSION-142`'s default `WARNING` threshold in the session log).

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): 4 lines per run in 6 of 7 runs (24 warnings), plus one `git_commit executor_absent` warning in `frictions`,
  in `app.log` and `session.log` alike. Recurred in the duress run.

## Relevant files

- `apps/desktop/src/run-host/tools.ts:307` — the removal line through `ctx.warn`.
- `apps/desktop/src/run-host/host.ts:318` — `warn: (m) => log(m, 'warn')`.
