## The run host outlives a killed main on Windows and keeps calling the model

The Windows ARM64 live run's `crlf` launch (pack `2026-10-15T15-16-50-373Z`, head `8080fbda`; Windows 11 ARM64 (build
26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree) was ended by the harness at its 522,320 ms bound with
`child.kill('SIGKILL')`, which on Windows terminates the main process alone. Main (started about 15:25:16 UTC) was gone at
about 15:34 UTC. What it had started was not:

- The recorded traffic holds one streamed model call that began at 15:28:52 UTC and ran **7,273 s**, to 17:30:05 UTC, when
  the upstream reset it (`read ECONNRESET`); its 425,505-byte response is reasoning deltas only. Two **new** model requests
  followed at 17:30:06 and 17:30:08 UTC (`getaddrinfo ENOTFOUND`; the machine had lost its network), about two hours after
  main had ended. Only the run host makes model calls.
- A process snapshot taken after the harness exited (23:33 UTC) still listed two `electron.exe --type=utility
  --utility-sub-type=node.mojom.NodeService` processes whose parent was the dead main, both created at the launch's start.
- The harness's `runElectron` resolves on the child's `close`, which waits for every holder of the launch's output pipes; it
  returned at 23:33 UTC, about eight hours after the kill.

The machine was restarted before this was examined (2026-10-20), so the survivors' pids could no longer be matched to a run
host or a workspace service, and the store went with the sandbox
([`a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`](../archive/defects/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md)).
Not established: why the child's hard per-child timeout (REQ-ORCH-088, 1200 s) and PD-ORCH-004's 30 s bound on what is in
flight at its expiry did not end the 7,273 s call. The run host's own timers may or may not have run on with main gone; the
model client's bound is an idle one by design (`packages/model/src/ai-sdk-client.ts`), and a stream that never pauses does
not trip it. Item C1 (path C, main killed without `/T`) measures the orphaning on purpose; this note is the accidental first
reading.

## Specs

REQ-SHELL-121: "no run keeps consuming a model provider afterwards" — written of the orderly shutdown, and a forced end of
main is not one; but a run that keeps calling the provider for two hours after the application's main process is gone is the
outcome that sentence rules out, and REQ-SHELL-121 also asks that the end be "checkable from outside the process". REQ-TOOLS-111
and PD-ORCH-005 clause 10 for the same question about a background command (C1). Possibly REQ-ORCH-088 / PD-ORCH-004 (see above,
not established).

## Relevant files

- `apps/desktop/src/run-host/host.ts` — the run host reads `process.parentPort`; nothing observed ends it when main is gone.
- `apps/desktop/src/main/index.ts` — starts the run host and the workspace service as utility processes; no Job Object.
- `apps/desktop/scripts/live-run.mjs` — `runElectron` kills main alone and resolves only once every pipe holder has gone.
- `packages/model/src/ai-sdk-client.ts` — the model call's `timeoutMs` is an idle bound, re-armed on every streamed part.

## Addendum, 2026-10-20 — C1's deliberate kill did not reproduce it

The Windows ARM64 session's C1 killed main on purpose (`taskkill /F /PID`, no `/T`) on a scripted run with a background
PowerShell heartbeat (at `0fde55f2`): the run host and the shell were gone 5 s later and the beats stopped within about 1 s
(ADR-0002, "First execution — 2026-10-20"). That run host was waiting on a scripted `wait` step; the live run's was streaming
a model call. Which difference let the live run's utility processes run on is not established, and the note stays open on
the live run's evidence.

## Addendum, 2026-10-20 — the evidence lines up with the machine's Modern Standby

The host's System event log (Kernel-Power 506, entering Modern Standby; 507, leaving it) puts the machine in standby from
15:29:45 to 17:30:02 UTC on 2026-10-15, out of it for about a millisecond, and in it again until 23:33:31 UTC. Every
reading this note rests on falls on those edges: the streamed call began at 15:28:52, 53 s before the first entry, and was
reset at 17:30:05, 3 s after the exit; the two new requests (17:30:06, 17:30:08) failed name resolution in the seconds
around a resume, before the network was back; `runElectron` returned at 23:33, at the second exit, and the process snapshot
that found the two `NodeService` processes was taken then. A connection frozen across standby and reset at resume accounts
for the 7,273 s call without any process running on with main gone, and wall-clock spans across standby measure the sleep,
not the processes.

What is left of the note is therefore unsupported, not falsified: whether the two `NodeService` processes would have ended
had the machine stayed awake was not observed, and C1's path C, on an awake machine, saw the run host and its shell gone
within about 1 s of main's kill. The same host put a `sessions-proof` launch into standby on 2026-10-20 (its `seed` launch
reported "SIGTERM ended it after 9152074 ms", standby 09:09:10 to 12:37:14 UTC, broken only for a moment at 10:04:41), so a long stall read on this machine is
checked against 506/507 first. The note is kept open as written; closing it is not this session's to rule.

## The parent watch, built 2026-11-03 (R-091, hardening §3.2 row 1) — the note stays open

Whatever let the live run's utility processes run on, nothing in the run host watched for main's end, and that is now
closed. Both utility processes probe main's pid every 250 ms from their first statement and exit with status 69 once it
is gone (`watchParent` / `superviseUtilityProcess`, `packages/platform/src/utility-process.ts`, installed by
`apps/desktop/src/run-host/index.ts` and `apps/desktop/src/workspace-service/index.ts`). Measured first, on this host
(Windows 11 ARM64, Electron 44.3.0, a scratch app): Electron's `parentPort` emits no `close` when main is killed with
`taskkill /F`, and the child receives no `disconnect` or `exit` either; Chromium ended the child natively between about 0
and 3 s later, with no JavaScript run. Measured after, on the built app at `hrd1-child-process-failure`: main killed with
`taskkill /F` in four driven launches at 100 % CPU (another session's proofs beside it), the run host and the workspace
service each read **exit code 69** — the probe's end, not Chromium's — 343 to 377 ms after the kill began in two launches
and 1.2 to 2.5 s in the other two; `exit-trace-proof`'s new `main-killed` launch (CPU 26 % at its start) read both gone 60 ms
after the kill. What the probe cannot answer is a host in Modern Standby, where no process runs at all (the second
addendum): such a stall is still read against Kernel-Power 506/507 first. Pinned by `utility-process.test.ts` and
`exit-trace-proof`'s `main-killed` launch.

**Not closed: two survivors in the proof (2026-11-04).** `exit-trace-proof`'s `main-killed` launch read the run host still
running 10 s after main's kill in 2 of its 4 runs on this host (CPU 100 % from other sessions' work): once by signal-0
polling (pid 24016) and once by a PowerShell watcher holding the process handle, which a recycled pid cannot fool (pid 6140;
the workspace service beside it ended with Chromium's exit 0 in 91 ms). In both, main had been killed while the run host's
code-intelligence setup step was running its child (`electron.exe … builtin:code-intelligence -- project create`); in the
two passing runs that step had already ended. Neither Chromium's own end nor the parent watch (which runs on the run host's
main thread) ended it, which reads as that thread being blocked — not established. Not reproduced outside the
proof (34 kills, `taskkill /F` of a driven or scripted launch, at the workspace's `ack` and 0 to 1 s into the setup step: every run
host ended within 84 ms to 2.5 s, with Chromium's 0 or the watch's 69). The proof now describes a survivor — its CPU time, its
threads by state and wait reason, its children — so the next red says what the run host was doing. Until that is read, the
watch is a measured improvement and not the repair.

**Sighting, 2026-11-04 (hrda).** Windows 11 ARM64, Node 26.13.0, `C:/dev/Rotaris-wt-hrda-corruptstore` (bundle hrda-corrupt-store-resolution, OQ-477) on `origin/main` `3bf27f00` plus its commits, no other tree's Electron running; `pnpm exit-trace-proof --skip-build` run alone at 20 % CPU: 75 of 76 checks green, the one red `main-killed`'s "16552: still running 10 s after the kill; 17824: gone 96 ms after the kill, exit 0" (survivor CPU 0.36 s, 29 threads, a child `electron.exe` 33168). Recorded, not repaired.

**Sighting, 2026-11-05 (plan hrdb, bundle `hrdb-recovered-error-line-and-scope-strings`, Windows 11 ARM64, Node 26.13.0, Electron 44.10.0, on that branch over `f71f4073`, no other tree's Electron running).** `pnpm exit-trace-proof` in the configuration-and-startup suite at 12 % CPU: 92 of 93 checks green, the one red `main-killed`'s "27004: still running 10 s after the kill; 9568: gone 85 ms after the kill, exit 0" (survivor CPU 0.31 s, 29 threads, a child `electron.exe` 8264). Run again alone at 14 % CPU straight after: 93 of 93. Recorded, not repaired.
