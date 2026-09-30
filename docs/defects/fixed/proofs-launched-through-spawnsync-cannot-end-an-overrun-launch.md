## Proofs that launch through `spawnSync` cannot end a launch that overruns its timeout

Thirty-three proof scripts under `apps/desktop/scripts/` launch Electron with `spawnSync(electron|exe, …, { timeout })`,
at thirty-four sites. `spawnSync`'s timeout does not bound the launch. At the timeout Node sends SIGTERM and closes its
own ends of the child's standard output and error, and then waits, without a bound, for the process to exit. The
application's quit path writes a line to the closed stream at once and loops on the EPIPE
(`a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`), so the process never exits and the proof never
returns. Nothing is reported, and the proof hangs until something outside kills it. *(2026-09-29, R-067: that loop is repaired — `fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`
— and a launch whose pipes are closed as it is signalled now quits in about 60 ms, measured with an async launch; the
`spawnSync` sites were not re-run. The sentences above are kept as they were written.)* *(Corrected 2026-09-30, R-067: re-run
on this branch's build, the hang is gone. An application launched with `ROTARIS_CAPTURE_AFTER_MS=60000` under
`spawnSync(electron, …, { timeout: 8000 })` returned after 8075, 8081 and 8098 ms in three runs, as root under Xvfb,
with `status` 0, `signal` null and `error.code` `ETIMEDOUT`, and no `quit:` line in its captured output — its pipes were
closed before the quit path wrote. So on this build the defect is a different one: an overrun under `spawnSync` is
reported as a clean exit 0, with only `error.code === 'ETIMEDOUT'` to show it. Every `launch` checked only
`status !== 0`, so an overrun passed that check silently, without its log tail, and the proof went on as if the launch
had done its work. The hang described above is the 2026-09-28 reading, before the EPIPE repair.)* `resilience-proof`'s override launch
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
timeout reports an overrun as a clean exit" (named, until 2026-09-30, "… whose timeout cannot end an overrun launch"). Before the change it failed naming all thirty-five sites; after it, it passes.
It also asserts that the scan sees at least thirty-six `spawnBounded` launches (thirty-nine since 2026-09-30, below), and that a `spawnSync` launch is still
recognised when one is written. A launch with `ELECTRON_RUN_AS_NODE` starts no application and is exempt, as under
rule 2 (`build-hooks.cjs`'s probe). A second case, "every script that launches through spawnBounded reports an overrun
with overrunMessage's log tail", pins the report: `updater-proof`'s overrun check named only the bound and how the launch
ended until 2026-09-30, when it failed that case alone, and it now carries `overrunMessage`'s tail as the others do.

*(Added 2026-09-30, R-067.)* Three launches that were never `spawnSync`'s escaped rule 4, whose scan saw only
`spawnSync(`, and two of them had the defect this note names in another form. `fetch-proof`'s own asynchronous launch
was bounded by a bare `child.kill()` at 150 s: SIGTERM, no SIGKILL, no overrun flag. The application answers SIGTERM
with `quit: exiting with status 0`, so the overrun passed `launch`'s `status !== 0` check as a clean exit, with no log
tail, and the proof failed later, misattributed, at `ok: the run ended paused (application_shutdown)` (the verifier's
scratch run with the bound cut to 4 s). `workspace-proof`'s hand-over launch sent SIGTERM alone at 30 s and rejected at
once, so a secondary that did not answer it outlived the proof, and the failure carried none of its log.
`mcp-console-spike`'s launch had no bound at all. All three are `spawnBounded`'s, each checking `.overran` and throwing
`overrunMessage`. A new case, "every other launch of Electron is spawnBounded's too, but for the three named with their
reasons", fails a bare `spawn(electron|exe` outside the driver (ended by `stopApp`), `code-intel-proof`'s branch (a stdio
server its RPC client guards, and a branch that outlives the close is reported `killed-after-30s`) and `live-run`'s
`runElectron` (SIGKILL at its bound, reported as `signal` SIGKILL with `status` null, never as a clean exit; its fault
scenarios need the child in flight). Before the change it failed naming `fetch-proof.mjs`, `mcp-console-spike.mjs` and
`workspace-proof.mjs`; after it, it passes. The overrun case also checks each `spawnBounded` SITE for its own `.overran`
before the file's next launch and within forty lines, not just each file for `overrunMessage`; a scratch removal of
`config-proof`'s check failed it at `config-proof.mjs:90`.
Measured on this branch's build the same day, as root under Xvfb, another workflow on the host (load average 2.0 to
5.1): `fetch-proof` exited 0 in 58 s and `workspace-proof` passed 34 checks, both hand-over checks among them. With the
bound cut for one scratch run each, then restored: `fetch-proof` at 4 s exited 1 in 4.5 s with `ok overran its 4000 ms
bound: SIGTERM ended it after 248 ms` and the log tail ending `quit: exiting with status 0`; `workspace-proof`'s
hand-over at 300 ms failed with `the hand-over launch 1 overran its 300 ms bound: SIGTERM ended it after 80 ms` and its
tail. `mcp-console-spike` needs a Windows package (IC-3) and was syntax-checked and scanned only. The `fetch-proof`
scratch run's log also carried a run-host rejection after the quit, recorded as
[`an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled.md`](../an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled.md).

**Measured on the built app of this branch**, as root under Xvfb on Linux with Node 24. Another workflow was running on
the same host; no other Electron was running at the first launch, and the load average stayed between 0.7 and 2.3.

- `part-h-proof` with its bound cut to 6 s for one scratch run, then restored. The first launch was ended at the bound
  by SIGTERM in 96 ms. Its log tail ends with `quit: requested (before-quit)` … `quit: exiting with status 0`, and
  the proof exited 1 after 7 s with `loop-supervisor overran its 6000 ms bound: SIGTERM ended it after 96 ms`. ~~Under
  `spawnSync` the same overrun had not returned at 70 s.~~ *(Falsified 2026-09-30: that is the 2026-09-28 measurement,
  taken before the EPIPE repair, and it was not re-taken on this branch.)* Re-taken on this branch's build: the same kind
  of overrun (`ROTARIS_CAPTURE_AFTER_MS=60000`, bound 8 s) under `spawnSync` returned in 8075–8098 ms over three runs with
  `status` 0, `signal` null, `error.code` `ETIMEDOUT` and no quit-path line in its output; under `spawnBounded` it
  returned in 8073 ms, `overran.endedBy` SIGTERM after 59 ms, and `overrunMessage` named it. The repair is still needed,
  for that reason: under `spawnSync` the overrun passed every `launch`'s `status !== 0` check as a clean exit; under
  `spawnBounded` it is a failure with its log tail.
- With the bounds as written, these proofs exited 0: `part-h-proof`, `part-j-proof`, `overview-proof`, `config-proof`,
  `traceability-proof`, `terminal-proof` (116 of 116) and `updater-proof`, whose new check passed with exit 0 in
  10.6 s. `sessions-proof` exited 1 at its schema check, after every launch before it had returned. That red is
  [`sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md`](sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md),
  recorded before this change.

**Not measured:** the other twenty-six moved scripts were syntax-checked (`node --check`) and scanned, not run. The
package proof and the packaged terminal launch need a Windows build (IC-3). The SIGKILL step against the real
application was never needed; it is pinned against a child that ignores SIGTERM in `bounded-launch.test.ts`. While
moving the packaged launch, a separate defect in its checks was noticed and recorded:
[`the-packaged-terminal-streaming-checks-throw-on-a-launch-that-found-no-store.md`](../the-packaged-terminal-streaming-checks-throw-on-a-launch-that-found-no-store.md).
