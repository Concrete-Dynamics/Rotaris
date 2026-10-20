## A live run at `--app-log-level=warning` or `error` misreads its missing `info` lines as outcomes

Noticed 2026-10-15 by the reviewer of fin47 (`fin47-rename-and-optionals`, task 2), as an optional finding left in the outcome
of [`fixed/a-live-launch-that-crashes-before-its-result-reads-as-reaching-it-inside-the-wait.md`](fixed/a-live-launch-that-crashes-before-its-result-reads-as-reaching-it-inside-the-wait.md);
recorded as its own note on 2026-10-20 (loc1, `loc1-live-evidence`, task 2).

`pnpm live-run --app-log-level=<lvl>` accepts PD-MONITOR-002's four words and hands the threshold to every launch as
`ROTARIS_APP_LOG_LEVEL`. At `warning` or `error` the application log drops every `info` line, and the harness reads `info`
lines throughout: the capture's `capture: wait for result satisfied` and `… timed out` (`apps/desktop/src/main/capture/probe.ts`,
`host.log`), its `capture: clicked` and `capture: probe …` lines, the sign-in's `providers: Added …` line, the run host's
code-intelligence discovery and `child_timeout=` lines. Each reading then takes the missing line for an outcome:
`overrunReading` (`apps/desktop/scripts/lib/duress-checks.mjs`) reads a launch with neither wait line as `ended`, so the duress
run's and the swarm's deadline checks FAIL with "the application exited or crashed before the result"; every scenario's
`!/capture: wait for result timed out/` check PASSES "the run reached its result inside the wait" whatever happened; a probe
read finds no notice and fails its own check; code-intelligence discovery reads as not run (a NOTE). Confirmed on
`0d89e971` by a reading of a log holding only `warn` lines, which `overrunReading` read as `ended`.

## Specs

No product requirement is contradicted: PD-MONITOR-002 sets the threshold and its words, and the product records what it
should. The defect is the harness's: it offers thresholds under which its own readings cannot be read, and reads a line's
absence as what the launch did.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `APP_LOG_LEVEL`'s parse, USAGE's `--app-log-level` line, every `capture:` reading.
- `apps/desktop/scripts/lib/duress-checks.mjs` — `overrunReading`'s `ended`.
- `apps/desktop/src/main/capture/probe.ts` — the capture's `info` lines the harness reads.
