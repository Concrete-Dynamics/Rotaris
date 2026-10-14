## The cut check's order reading passes a normal completion reached after the quit

`quitLandedFirst` (`apps/desktop/scripts/lib/cut-scenario.mjs`), the live `cut` scenario's "the quit landed before the run
reached its result" check, passes any log in which the capture's `wait for result satisfied` line comes after the first
`quit: requested` line, and passes a log with no such line at all. It never reads which result the run reached. A run that
finished normally a moment after the harness's SIGTERM, the quit having cut nothing, logs `run … ended completed (end_turn)
→ completed` after the quit, and the check passes it: its detail even names that completion as "the run's end after it". The
check therefore measures only the order of two lines, not what its name says. At 3c3f447 (pack `2026-10-14T15-58-45-917Z`,
`cut/`) the capture logged no satisfied line, and the check read "the run reached no result after the quit" while the log held
`run 170ce19f… ended interrupted (application_shutdown) → paused` four lines after the quit: a correct pass, for the wrong
reason, with a detail that contradicts the log. The scenario's other checks (the call recorded failed / interrupted, the
summary counting it under interrupted) would catch a normal completion, so the defect is cosmetic, but the check's detail and
its name disagree with what it reads. Found by fin45's reviewer (seams-ui-and-live, optional finding L1) and the acceptance
round on merged main (finding C11); recorded by fin46 before the repair.

## Specs

None contradicted by the product. PD-TOOLS-013 is what the scenario measures; the check is the harness's reading of the
scenario's own precondition, that the quit cut the run rather than arriving after it had ended.

## Relevant files

- `apps/desktop/scripts/lib/cut-scenario.mjs` — `quitLandedFirst`, which compares the quit line only with the capture's
  satisfied line.
- `apps/desktop/scripts/lib/cut-scenario.test.ts` — its cases, none of which gives a normal end after the quit.
- `apps/desktop/src/main/index.ts` — logs `run <id> ended <status> (<stop_reason>) → <execution_status>` once per run end, the
  line the check should read.
- `docs/defects/fixed/the-live-cut-check-reads-the-runs-shutdown-result-as-reached-before-the-quit.md` — the repair that
  introduced the order reading.
