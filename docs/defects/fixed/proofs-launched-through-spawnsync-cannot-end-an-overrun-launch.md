## Proofs that launch through `spawnSync` cannot end a launch that overruns its timeout

Thirty-three proof scripts under `apps/desktop/scripts/` launch Electron with `spawnSync(electron|exe, …, { timeout })`,
at thirty-four sites. `spawnSync`'s timeout does not bound the launch. At the timeout Node sends SIGTERM and closes its
own ends of the child's standard output and error, and then waits, without a bound, for the process to exit. The
application's quit path writes a line to the closed stream at once and loops on the EPIPE
(`a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`), so the process never exits and the proof never
returns. *(2026-09-29, R-067: that loop is repaired — `fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`
— and a launch whose pipes are closed as it is signalled now quits in about 60 ms, measured with an async launch; the
`spawnSync` sites were not re-run. The sentence above is kept as it was written.)* Nothing is reported, and the proof hangs until something outside kills it. `resilience-proof`'s override launch
was seen alive 649 s into a 180 s timeout. On 2026-09-28 a scratch `spawnSync` of scenario 4's launch with a 20 s timeout
had not returned at 70 s, when a second SIGTERM from outside ended it.

A launch overruns when the condition it waits for never comes: a seam addressed to a control the design system
replaced, a result that never arrives, a hang in the product. So this is the failure mode of every stale seam and
every product hang these proofs could meet. They turn into a stuck proof rather than a red.

## Specs

None contradicted by the product. The defect is the harness's, the proofs are evidence
(`.claude/rules/tests-and-proofs.md`), and a proof that cannot fail is not evidence. The product half is its own note.

## Relevant files

- `apps/desktop/scripts/*.mjs`: every `spawnSync(electron, …)` or `spawnSync(exe, …)` with a `timeout` (`grep -l
  "spawnSync(electron\|spawnSync(exe" apps/desktop/scripts/*.mjs`).
- `apps/desktop/scripts/lib/bounded-launch.mjs`: `spawnBounded`, `spawnSync`'s return shape from a launch that is
  ended within its bound (SIGTERM with the pipes open, a grace, SIGKILL to the group) and reported (`overrunMessage`).
  `resilience-proof` is on it since 2026-09-28, and `lib/launch-sites.test.ts` scans it for `hostSwitches` as it scans
  `spawnSync`.

Noticed 2026-09-28 while repairing `resilience-proof`'s overrun under R-062. Only that proof was moved onto
`spawnBounded`. Moving the others changes each one's `launch`, which `harness.mjs` deliberately left per script, and
turns each from synchronous to asynchronous. That was outside the item.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Every launch of Electron a proof starts itself is `spawnBounded`'s
(`apps/desktop/scripts/lib/bounded-launch.mjs`). That is thirty-five sites in thirty-four scripts: the thirty-four the
grep above finds, plus `terminal-proof/packaged.mjs`'s launch of the packaged binary, which sits one directory down. At
its bound a launch is sent SIGTERM with its pipes still open and read, is given a grace, and then its process group is
sent SIGKILL. The overrun is a failure named by `overrunMessage` with the launch's last log lines. Each script's own
`launch` stays its own, as `harness.mjs` left it; only the call inside it changed, and the function became `async`,
with every call site awaiting it. So did `transcript-proof`'s `appendRun`, `package.mjs`'s app step (`stepAsync`) and
`terminal-proof/packaged.mjs`'s `packagedTerminalStreaming`, whose caller in `terminal-stream-proof` awaits it. Where a
proof reports rather than throws, an overrun is a reported failure. That is `updater-proof`'s new check "the capture
launch ended by itself within its bound", `terminal-proof`'s failures list, and the packaged launch's `error`.
`part-j-proof`'s store sampler stays a worker thread; its comment no longer says the launch blocks the thread.

Pinned by `apps/desktop/scripts/lib/launch-sites.test.ts`'s rule 4, "no launch of Electron goes through spawnSync, whose
timeout cannot end an overrun launch". Before the change it failed naming all thirty-five sites; after it, it passes.
It also asserts that the scan sees at least thirty-six `spawnBounded` launches, and that a `spawnSync` launch is still
recognised when one is written. A launch with `ELECTRON_RUN_AS_NODE` starts no application and is exempt, as under
rule 2 (`build-hooks.cjs`'s probe).

**Measured on the built app of this branch**, as root under Xvfb on Linux with Node 24. Another workflow was running on
the same host; no other Electron was running at the first launch, and the load average stayed between 0.7 and 2.3.

- `part-h-proof` with its bound cut to 6 s for one scratch run, then restored. The first launch was ended at the bound
  by SIGTERM in 96 ms. Its log tail ends with `quit: requested (before-quit)` … `quit: exiting with status 0`, and
  the proof exited 1 after 7 s with `loop-supervisor overran its 6000 ms bound: SIGTERM ended it after 96 ms`. Under
  `spawnSync` the same overrun had not returned at 70 s.
- With the bounds as written, these proofs exited 0: `part-h-proof`, `part-j-proof`, `overview-proof`, `config-proof`,
  `traceability-proof`, `terminal-proof` (116 of 116) and `updater-proof`, whose new check passed with exit 0 in
  10.6 s. `sessions-proof` exited 1 at its schema check, after every launch before it had returned. That red is
  [`sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md`](../sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md),
  recorded before this change.

**Not measured:** the other twenty-six moved scripts were syntax-checked (`node --check`) and scanned, not run. The
package proof and the packaged terminal launch need a Windows build (IC-3). The SIGKILL step against the real
application was never needed; it is pinned against a child that ignores SIGTERM in `bounded-launch.test.ts`. While
moving the packaged launch, a separate defect in its checks was noticed and recorded:
[`the-packaged-terminal-streaming-checks-throw-on-a-launch-that-found-no-store.md`](../the-packaged-terminal-streaming-checks-throw-on-a-launch-that-found-no-store.md).
