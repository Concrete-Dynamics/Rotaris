## A live launch that crashes before its result reads as reaching it inside the wait

## Outcome (2026-10-15, fin47 `fin47-rename-and-optionals`): repaired; the note written at review, after the repair

`overrunReading` (`apps/desktop/scripts/lib/duress-checks.mjs`) reads a launch whose log carries neither the capture's
`capture: wait for result satisfied` line nor its `timed out` line as `ended`, with the elapsed time beside the wait: the
application exited or crashed before the result. The two callers in `apps/desktop/scripts/live-run.mjs`, the duress run's deadline
check and the delegation swarm's, fail any outcome but `inside` (and note `window`), so a crash now fails the deadline check itself,
saying so, instead of passing it.

Pinned by `apps/desktop/scripts/lib/duress-checks.test.ts`: "a launch that ended with its wait neither satisfied nor run out reads
`ended`, not inside", red on `f37f49d`, where the same log read `inside`; and "a launch whose capture saw its result reached it
inside the wait", which now gives the satisfied line. **Not shown:** no duress or swarm live run was made on the repair; those are
the orchestrator's. The next default live run should read both deadline checks as before (PASS, or the window's NOTE); only a launch
that ends before its result reads FAIL with "the application exited or crashed before the result".

The reading depends on the capture's `info` lines, as the scenario checks that look for `capture: clicked …` or `capture: probe …`
already do: a live run started with `--app-log-level=warning` or `error` hides them, and both deadline checks then read `ended`.

This note was written by the bundle's reviewer: the builder carried the finding as an optional one and repaired it without a note,
which the task's "record a defect note before code" required.

Noticed 2026-10-14 by the reviewer of fin46 (`fin46-accept1-5`, optional finding on Task 1).

The duress and swarm deadline checks read a launch's overrun from its pack. Their `timedOut` was the presence of the capture's
`capture: wait for result timed out` line, and every launch without it went on to `deadlineReading` as one that reached its
result inside the wait. A launch the application ended early (a crash, an exit, a kill) logs neither line, so it read `inside`
and passed the deadline check, as the bare check before H-h had; only the session's status and the summary's checks could then
show it.

## Specs

None: a defect of the live-run harness, whose two checks ("the long run reached its result inside the wait", "the swarm run
reached its result inside the wait") said so of a launch that never reached it.

## Relevant files

- `apps/desktop/scripts/lib/duress-checks.mjs` — `overrunReading`, the repair.
- `apps/desktop/scripts/live-run.mjs` — the swarm's `swarmDeadline` and the duress run's `deadline` checks.
- `apps/desktop/src/main/capture/probe.ts` — the capture's `satisfied` and `timed out` lines.
