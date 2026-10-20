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
([`a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`](a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md)).
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
