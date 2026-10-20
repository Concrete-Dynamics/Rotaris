## A live run at `--app-log-level=warning` or `error` misreads its missing `info` lines as outcomes

## Outcome (2026-10-20, loc1 `loc1-live-evidence`, task 2): repaired — the harness refuses the two thresholds

Of the two repairs the task allowed, the refusal: `pnpm live-run` takes `--app-log-level=debug` or `info` (any casing) and
refuses `warning` and `error` before any launch, exiting 2 with the reason ("Every scenario's readings, sign-in's included, read
the application log's info lines … A live run takes debug or info"), in `apps/desktop/scripts/lib/app-log-level.mjs`; its USAGE
line and AGENTS.md's `app.log` row say so. Why not the other: PD-MONITOR-002 makes the level a field that means what it says,
and the one level every threshold keeps is `error`. The lines the harness reads are not the capture's alone (sign-in's
`providers: Added …`, the run host's discovery and `child_timeout=` lines are the product's own `info` lines), and none of them
is an error, so raising them would bend the product's levels to the harness. The flag exists to ask for `debug` (its comment in
`live-run.mjs`, AGENTS.md), which the refusal keeps. And so that no reading misreads an absence even where a log comes from
elsewhere, `overrunReading` (`apps/desktop/scripts/lib/duress-checks.mjs`) reads a log that holds no `info` line as `unread` —
"the deadline cannot be read" — never `ended`; the callers' `inside` check fails it with that detail.

Pinned by `apps/desktop/scripts/lib/duress-checks.test.ts` ("a launch whose log holds no info line reads `unread`, never
`ended`", red on `0d89e971`, where it read `ended`) and `apps/desktop/scripts/lib/app-log-level.test.ts` (debug and info pass;
warning and error are refused with the reason; `live-run.mjs` refuses through it, and the script exits 2 on
`--app-log-level=warning` before it reads an endpoint). No live run was made at either threshold: the refusal ends the run
before its first launch, which the last test shows on the script itself.

## The defect, as recorded

Noticed 2026-10-15 by the reviewer of fin47 (`fin47-rename-and-optionals`, task 2), as an optional finding left in the outcome
of [`a-live-launch-that-crashes-before-its-result-reads-as-reaching-it-inside-the-wait.md`](a-live-launch-that-crashes-before-its-result-reads-as-reaching-it-inside-the-wait.md);
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
