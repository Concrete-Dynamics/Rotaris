## exit-trace-proof's renderer crash writes no RENDERER GONE line on a Linux host

`pnpm exit-trace-proof` failed 2 of its 37 checks in launch 2 ("crash") on a Linux x86_64 host (Node 26.8.1, a private Xvfb
at 1600×1000), on 2026-10-22 while R-081's Electron lane ran its proof sweep:

- "the renderer crashed: main writes render-process-gone with its reason, exit code and URL at error — no line"
- "one more GONE line at error than before the renderer crashed"

It is the same on untouched `b0d1b3ff` with Electron 44.1.1 (the baseline worktree, run alone) and on the Electron
44.3.0 tree, twice. So it is not the Electron bump. The other 35 checks pass, among them the run host's
`CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 9)` in the same launch, and the quit after the "crash", which
exits 0.

The proof finds the launch's renderer as a descendant of main with `--type=renderer` and sends it `SIGSEGV` from outside
(`process.kill(pid, 'SIGSEGV')`). After the signal, the launch log shows the renderer still invoking `workspace.usage`.
Three `Error occurred in handler for 'command': Error: no reply to workspace.usage within 5000 ms` lines follow it, and
the run host is gone by then. So it reads as though the renderer **survived** the signal, and `render-process-gone` never
fired. Why was not established. One possibility is that Chromium's own crash-signal handling in the renderer treats a
user-sent `SIGSEGV` (`si_code` `SI_USER`) differently from a fault. Another is that the pid chosen was not the main window's
renderer. Whether the proof passed on Linux before is not recorded in this note.

## Specs

None is shown contradicted by the product. The renderer half of the exit trace (PD-MONITOR-002, `render-process-gone` at
`error`) is unmeasured on this host, because the proof's instrument did not produce a renderer loss that the product saw.

## Relevant files

- `apps/desktop/scripts/exit-trace-proof.mjs` — launch 2: `renderersOf`, the `SIGSEGV`, and the two checks that fail.
- `apps/desktop/src/main/index.ts` — the `render-process-gone` handler that writes `RENDERER GONE (…)` (not changed here).
- `docs/defects/fixed/the-exit-trace-crash-handlers-were-never-fired-in-a-built-app.md` — the note under which this launch was built.
