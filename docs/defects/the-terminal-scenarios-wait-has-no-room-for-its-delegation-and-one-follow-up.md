## The terminal scenario's wait has no room for its delegation and one follow-up

`live-run.mjs`'s `terminal` scenario waits `RUN_WAIT_MS` (420 s) plus the `steady` shape's own 130 s for the run's result:
550 s, the budget of one agent running fifteen shapes once. The scenario's role is `coordinator_only`, so the root holds no
terminal and must delegate the shapes to a child (REQ-TOOLS-004/006), and a coordinator that reads its child's report and asks
it to run one shape again is doing what a coordinator should. The budget leaves no room for either, so a faithful run whose
coordinator re-runs the longest shape once is cut mid-command and fails "the terminal run reached its result inside the wait".

Seen in the acceptance default run at `3c3f447` (pack `2026-10-14T15-58-45-917Z`, `terminal`): the session started 16:14:21;
the tester child ran shapes 1 to 9, then 10 to 15 on a follow-up, and passed `timeout: 2000` to the steady printer against the
prompt (#23, 130,226 ms), and said so; the coordinator followed it up again to run that 130 s command without the argument
(#25), and the wait ran out 64,802 ms into it (#26, interrupted). The capture quit at 16:23:35 (`terminal/app.log` lines 84 to
93), the run ended interrupted with the child paused by quit (PD-ORCH-005), and every shape reached had passed. The
orchestrator's run at `b9e3005` passed this scenario. Acceptance round 1 of fin46 (finding L7, live check failed, degrades).
Recorded 2026-10-14 by fin46 (`fin46-accept1-4`).

## Specs

None contradicted by the product: the deviation and the re-run are the model's, and the cut was recorded faithfully
(interrupted, `session_reset`, the child paused by quit). The defect is the harness's wait budget.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `terminal` launch's `TERMINAL_WAIT_MS = RUN_WAIT_MS + STEADY_INTERVAL_MS * STEADY_TICKS`.
- `apps/desktop/scripts/lib/terminal-shapes.mjs` — the `steady` shape's length (`STEADY_INTERVAL_MS`, `STEADY_TICKS`) and the
  default hard cap (`DEFAULT_SHELL_COMMAND_TIMEOUT_S`) that bounds it when no `timeout` is passed.
