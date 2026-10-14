## The live cut check reads the run's shutdown result as reached before the quit

The default live run at a3be56c (pack `2026-10-14T04-30-51-088Z`, `cut/`) FAILED one check of the `cut` scenario, "cut: the quit
landed before the run reached its result", while every other cut check passed: the terminal call recorded failed / interrupted by
the run's cancel, the run paused `application_shutdown`, and `summary.md` counted it under interrupted. The check
(`apps/desktop/scripts/lib/cut-scenario.mjs`) reads the launch's log for the capture's `capture: wait for result satisfied` line
anywhere in it. But a run its quit cuts still ends with its one result — the interrupted end the shutdown writes — and the
capture's wait, still installed, reports that result as satisfied after the quit. The pack's log reads, in order: `quit: requested
(before-quit)` at 05:05:52.905, `run f0d6d135… ended interrupted (application_shutdown) → paused` at 53.576, `capture: wait for result
satisfied after 13012 ms` at 53.654. The product wrote no result before the quit; the harness misread the order. Found by the
orchestrator's reading of the pack (live-run finding L1); recorded by fin45 before the repair.

## Specs

None contradicted by the product: PD-TOOLS-013 (the cut call reads interrupted) and REQ-SESSION-139 hold in the pack. The check is
the harness's reading of the scenario's own precondition — that the quit cut the run rather than arriving after it had ended.

## Relevant files

- `apps/desktop/scripts/lib/cut-scenario.mjs` — `runCutScenario`'s last check, `!/capture: wait for result satisfied/.test(log)`.
- `apps/desktop/scripts/lib/cut-scenario.test.ts` — the readings' tests, none of which covers this one.
