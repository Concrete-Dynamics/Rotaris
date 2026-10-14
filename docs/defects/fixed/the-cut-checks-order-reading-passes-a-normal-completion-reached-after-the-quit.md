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
- [`the-live-cut-check-reads-the-runs-shutdown-result-as-reached-before-the-quit.md`](the-live-cut-check-reads-the-runs-shutdown-result-as-reached-before-the-quit.md) — the repair that
  introduced the order reading.

## Outcome — repaired 2026-10-14 (fin46, `fin46-accept1-2`); the harness misread, the product did not

`quitLandedFirst` reads which end the run reached as well as the order: main's `run <id> ended <status> (<stop_reason>)` lines
beside the quit line and the capture's satisfied line. It fails a run end or a result logged before the quit (as before, and now
also an end the wait never reported), a first run end after the quit that is anything but `ended interrupted
(application_shutdown)`, and a result the wait reported after the quit with no run end logged to say which; it passes the
interrupted end after the quit, naming it in its detail whether or not the wait reported it, and a launch that logged neither an
end nor a result.

**Pinned** by `apps/desktop/scripts/lib/cut-scenario.test.ts` ("the cut scenario reads whether the quit came before the run's
result by the log's order"): a normal completion after the quit fails with and without the satisfied line, the 3c3f447 pack's
shape (the interrupted end, no satisfied line) passes naming that end, an end before the quit with no satisfied line fails, and a
satisfied line after the quit with no end fails. Red before the change: those four cases failed against fin45's reading (16
tests, 4 failed), and green after (16 passed).

**Shown** over the packs: every `cut/app.log` on the host reads PASS with the interrupted end named (3c3f447's
`2026-10-14T15-58-45-917Z`, "the run's first end after it is the interrupted one (line 44) … the wait reported no result";
`2026-10-13T23-07-32-069Z`, `2026-10-14T04-30-51-088Z` and `2026-10-14T13-37-17-899Z` likewise); the 3c3f447 log with its end
rewritten to `ended completed (end_turn) → completed` reads PASS ("the run reached no result after the quit") under fin45's
reading and FAIL under this one. A live run of the scenario on this branch (`live-run.mjs --confirm --skip-build --only=cut`, pack
`2026-10-14T17-57-37-671Z`) PASSED every cut check, this one reading "the quit (line 51) came first; the run's first end after it
is the interrupted one (line 55): run 5df1da0d… ended interrupted (application_shutdown) → paused; the result the wait reported
(line 58) is that end".
