## fetch-proof's quit by SIGTERM exits 1 on Windows

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-terminalkill` at `0c1b3641` and its fork point `0d89e971` (a detached tree built for the
comparison), Electron 44.1.1 arm64, dev tree, Git Bash. Recorded 2026-10-20 by plan loc1's builder of
`loc1-terminal-kill`, running `fetch-proof` because `pnpm verify:plan` names the Tools suite for that bundle's diff;
record-only, never repaired by this plan.

`node apps/desktop/scripts/fetch-proof.mjs --skip-build` went red the same way in four runs, two at each head (CPU load 46 % to
91 % before the launches, 4 to 19 Electron processes of other trees running): scenario 9, "a fetch the run cancels", sends
the application `process.kill(app.pid, 'SIGTERM')` 300 ms after the local server holds `/cut`, and the proof then refuses
with `cancelled: the quit by SIGTERM exited 1`. Every scenario before it passed. On Windows Node's `process.kill(pid,
'SIGTERM')` does not deliver a signal: it terminates the process outright (Node's documentation of `process.kill` and
`subprocess.kill` on Windows), so the application's orderly quit on SIGTERM never runs and the exit status is 1, never the
0 the step asserts. The code path is Windows-specific in the same way `exit-trace-proof`'s was before `51d85dd7` on `main`
("fix(proofs): exit-trace-proof sends what Windows can send"). Whether the fetch row the step reads afterwards is recorded
`interrupted` on Windows was not reached.

## Specs

PD-TOOLS-013 revision 2 (OQ-238): a fetch the run cancels reads `interrupted`, `InterruptedError`, and files no issue. The
proof's means of making the run cancel (a SIGTERM quit) is not available on Windows; no requirement is shown wrong.

## Relevant files

- `apps/desktop/scripts/fetch-proof.mjs` — scenario 9, the `onCut` handler (`process.kill(app.pid, 'SIGTERM')`) and the
  `result.status !== 0` refusal.
- `apps/desktop/scripts/exit-trace-proof.mjs` — how `51d85dd7` made the same kind of quit sendable on Windows.
