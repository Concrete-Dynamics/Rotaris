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

## Outcome — repaired 2026-10-14 (fin45, `fin45-seams-ui-and-live`); the harness misread, the product did not

`cut-scenario.mjs` reads the order now: `quitLandedFirst(log)` compares the first `quit: requested` line with the capture's
`wait for result satisfied` line, and fails only a result reached BEFORE the quit (or one reached with no quit logged); a result
after the quit is the run's own end, named in the check's detail (`run … ended interrupted (application_shutdown)`).

**Pinned** by `apps/desktop/scripts/lib/cut-scenario.test.ts` ("the cut scenario reads whether the quit came before the run's
result by the log's order"): the a3be56c pack's order passes, a result before the quit fails, a launch with no result passes, a
result with no quit logged fails (red before: the reading did not exist, and the old one failed the first case). Read over the
pack's own `cut/app.log`, it passes: "the quit (line 40) came first; the result the wait reported (line 46) is the run's end after
it: run f0d6d135-7b8f-480c-915a-6e3cd43fe21a ended interrupted (application_shutdown) → paused".

**What a live run should show** (the orchestrator's: `node apps/desktop/scripts/live-run.mjs --confirm --only=cut`): every cut
check PASS, this one included, with its detail naming the run's interrupted end after the quit; a run that finished before the
harness's quit still FAILS it.

**Addendum (fin46, 2026-10-14).** The order reading above passed any result after the quit, a normal completion included, and read
the 3c3f447 pack's logged interrupted end as "no result": it now also requires the run's first end after the quit to be the
interrupted one ([`the-cut-checks-order-reading-passes-a-normal-completion-reached-after-the-quit.md`](the-cut-checks-order-reading-passes-a-normal-completion-reached-after-the-quit.md)).
