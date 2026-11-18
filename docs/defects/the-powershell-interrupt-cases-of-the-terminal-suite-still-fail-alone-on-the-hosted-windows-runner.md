## The PowerShell interrupt cases of the terminal suite still fail alone on the hosted Windows runner

Since 2026-11-17 the real-process suites run as a project of their own, one file at a time, after every other test file (`REAL_PROCESS_SUITES` in `vitest.config.ts`). That removed the reds that came from contention: before it, the hosted Windows gate was red eleven times of nineteen on four branches; in the six runs of the change's own pull request it was green six times.

It did not make `packages/agent-tools/src/terminal/terminal.test.ts` reliable. Two reds in about twenty-four gate runs since, both in that file, both in a case that sends PowerShell an interrupt through ConPTY, both with nothing else running beside the file:

- run `44259268639` attempt 1 (2026-11-18, branch `chore/release-0.1.0rc3`): "on PowerShell a poll at once after C-c is OQ-168's soft pause, and the next calls report the end once, each with its own output" — `expected '(no output)' to be 'AAA'`. That is [the swallowed command](on-windows-a-command-written-in-the-same-tick-as-a-c-c-is-swallowed.md)'s symptom, and that note carries the sighting.
- run `44355144125` attempt 1 (2026-11-18, branch `docs/r-104-rc3-published`, a documentation-only change): "the window's interrupt ends a running ping and a running node at once; the call itself runs out its cap, and the reset r…" — `ping: expected null to be true`.

Both passed when the job was run again. The archived note on the gate's flake said a site that goes red again while it runs alone is a defect of its own case; these are those. Whether each is the product's race with PowerShell's own Ctrl-C handling, as the first is measured to be, or a reading the case takes too early, is not decided for the second: its log gives the assertion and not what the session reported.

Recorded while publishing `v0.1.0rc3` ([R-104](../product/requests.md#r-104)); not repaired there.

## Specs

REQ-TOOLS-096, REQ-TOOLS-098 and REQ-SHELL-092/093 are what the two cases hold. A gate that judges one tree two ways is not evidence about the commit (the archived note, "The gate is right to go red").

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the two cases, in the "OQ-168 / OQ-147 / OQ-10 on PowerShell and ConPTY" group and beside it.
- `packages/agent-tools/src/terminal/` — the session's interrupt path on Windows.
- `vitest.config.ts` — `REAL_PROCESS_SUITES`, which runs the file alone.
