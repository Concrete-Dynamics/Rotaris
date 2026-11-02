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
Recorded 2026-10-14 by fin46 (`fin46-accept1-4`). *(As written 2026-10-14; repaired the same day, below.)*

**Outcome: repaired 2026-10-14 by fin46 (`fin46-accept1-4`).** The wait is `terminalWaitMs(RUN_WAIT_MS)`
(`apps/desktop/scripts/lib/terminal-shapes.mjs`): the common wait, the `steady` shape twice and one follow-up turn
(`FOLLOW_UP_ALLOWANCE_MS`, 120 s), 800 s at the default where it was 550 s; the launch's own bound stays the wait plus 120 s.
At `3c3f447` the re-run, cut 64.8 s in, would have ended at the 100 s default cap about 35 s later, leaving the child's report
and the coordinator's answer the rest. A run that needs a second re-run of the longest shape, or more, still fails the wait,
as it should. The model's deviation (a `timeout` it was told not to add) is not the harness's to prevent and stays a NOTE
(`hardCapReading`'s `supplied`). **Pinned by** `lib/terminal-shapes.test.ts` (red before the change): the wait carries the
steady shape twice and at least a minute more on top of the common wait, grows one for one with `LIVE_RUN_WAIT_MS`, covers
the `3c3f447` timeline, and is the wait `live-run.mjs`'s terminal launch uses. **Shown by** a `--only=terminal` live run on this
branch (pack `2026-10-14T18-53-27-355Z`, load 3.8 to 4.6 on 4 CPUs): the run reached its result after 487,909 ms, every shape
attempted once (the poll twice), and the scenario PASSED. That run's model neither deviated nor was followed up, so it shows the
new wait in place, not the slack spent; the slack is pinned by the test above.

## Specs

None contradicted by the product: the deviation and the re-run are the model's, and the cut was recorded faithfully
(interrupted, `session_reset`, the child paused by quit). The defect is the harness's wait budget.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `terminal` launch's `TERMINAL_WAIT_MS = RUN_WAIT_MS + STEADY_INTERVAL_MS * STEADY_TICKS`.
- `apps/desktop/scripts/lib/terminal-shapes.mjs` — the `steady` shape's length (`STEADY_INTERVAL_MS`, `STEADY_TICKS`) and the
  default hard cap (`DEFAULT_SHELL_COMMAND_TIMEOUT_S`) that bounds it when no `timeout` is passed.
