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

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. REQ-TOOLS-006 requires the removal to be logged with the persona and the control.
It names no level. The level comes from PD-MONITOR-002's four: `debug`, `info`, `warning`, `error`.

- **A narrowing control's removal is `info`.** The four controls are the run's allow-list, `coordinator_only`,
  `read_only` and `tool_restrictions`. Their removal is the configuration doing what it says. `info` is PD-MONITOR-002's
  default threshold, so the application log still keeps every such line and REQ-TOOLS-006's obligation is met in a
  packaged build. `debug` would drop the line by default. `warning` was the defect.
- **A REQ-TOOLS-004 prerequisite's removal stays `warning`.** Examples are `terminal_backend_absent`,
  `delegation_runtime_absent`, `artifact_store_absent` and `executor_absent`. That requirement calls these "degrade
  availability": a tool the persona declared, which this run cannot provide. The one `git_commit executor_absent` line
  in the evidence is therefore still a warning. It is true: no `git_commit` executor is built yet (REQ-GIT-144 is owed,
  `docs/architecture/codebase.md`).

What changed:

- `ToolPortContext` (`packages/engine/src/sessions.ts`) gains `info`. It writes the application log at `info` and the
  session log at `INFO`. `Sessions` fills it on a start and on a continuation.
- `createToolPort` (`apps/desktop/src/run-host/tools.ts`) logs a control's removal through `info` and a prerequisite's
  through `warn`.
- The session log's default is `WARNING` (REQ-SESSION-142). By default it no longer carries these lines. At `INFO` it
  keeps them at `INFO`.

Pinned by:

- `apps/desktop/src/run-host/tools.test.ts`, "REQ-TOOLS-006: a narrowing control's removal is logged at info …". A
  coordinating orchestrator's four `coordinator_only` lines reach `info` and not `warn`. Its prerequisite lines stay
  `warn`. This test fails on the code before the repair.
- `packages/engine/src/tool-port-log.test.ts`. The port's `info` reaches the application log and never the warning path.
  The session log drops it at `WARNING`. At `INFO` it keeps it, on a start and on a continuation.

Live, `pnpm live-run --confirm --only=edit` on this branch passed twice, against `katalyst`. The packs are
`.live-run/runs/2026-09-29T23-21-17-800Z` and `…T23-26-20-433Z`, both git-ignored. In both, the coordinated run's four
removals read `info    run host: tool '…' removed from orchestrator by coordinator_only` in `app.log`. They read `INFO`
in `session.log`, where the harness sets that level. The second pack's `app.log` has no `warning` or `error` line at
all. The first pack's five warnings are all the code-intelligence runtime, which that worktree did not bundle.
