## The background "SIGINT while dash is starting the command" cases go red alone on a quiet Linux host

## Outcome: repaired 2026-11-21 (R-119's landing branch)

The attempt budget was a count, and on this host a miss costs about 1.5 ms: under the whole gate, two of the three cases
spent all 1 500 attempts inside 2.2 s without one landing, twice in a row (the landing of R-119, `8e94bfe`). The loop now
goes on past 1 500 attempts until one lands or 90 s have passed (the case's bound raised to 150 s), so a fast host buys
more aim with the time a slow one spends on hits. A miss over the whole 90 s still fails the case, as before.

`packages/agent-tools/src/terminal/background.test.ts`'s three cases "REQ-TOOLS-128 / R-044: a SIGINT that lands while
dash is starting the command still stops the session" (sleep, a shell script, Node) fail at `expect(hit).toBe(true)`
(line 219): none of the case's attempts landed its SIGINT inside dash's start window, so the case measured nothing and
says so as a red. Measured 2026-11-20 on Linux 7.0, a 24-thread i9-12900KF, dash as `/bin/sh`, the tree at `212d5b90`:

- the file run alone, six times in a row on a quiet host: red in two (two cases, then one);
- the whole suite as `main` runs it, the real-process files one at a time: red in the one run taken (the sleep case);
- the real-process project with twelve files side by side (the change that measured this): red in five runs of eight.

The window the case aims at is a property of the host's scheduler and of how fast dash gets from `vfork` to `exec`, so
on a fast host a fixed number of attempts misses it some of the time whether or not anything runs beside the file. The
reading is a harness one, not the product's: where an attempt does land, the assertions after it hold.

## Specs

None. REQ-TOOLS-128 and R-044 are what the cases prove when an attempt lands; a red here is the case failing to take
its measurement, which `.claude/rules/tests-and-proofs.md` already asks to be re-run alone before it is believed.

## Relevant files

- `packages/agent-tools/src/terminal/background.test.ts` — the three cases, and the attempt loop that ends at line 219.
- `vitest.config.ts` — `REAL_PROCESS_SUITES` and `realProcessWorkers`, which decide what runs beside the file.
