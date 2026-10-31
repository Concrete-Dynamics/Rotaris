## The live run's `cut` scenario reads Windows SIGTERM as a quit

`runCutScenario` ends its launch with `process.kill(child.pid, 'SIGTERM')` and expects the application's orderly quit. On
Windows that call terminates the process outright, so main never quits: in the pack `2026-10-31T19-40-08-158Z` (head
`c583e1bc`, Windows 11, Node 26.13.0, endpoint `ds41-vpn`) the launch exited 1, `cut/app.log` holds no `quit: requested` line
and the session stayed `running`. The launch failure then throws out of the run, so `delegation` and `crlf` never ran that
time; they passed on their own with `--only=delegation,crlf` (pack `2026-10-31T20-01-30-279Z`). No `electron.exe` was left
behind. The question the scenario asks, what a quit does to a foreground command, went unanswered on this platform.

Not repaired (record-only). `fetch-proof` has the same shape on Windows, in the note named under Relevant files, which also
points to the forms already repaired elsewhere (`exit-trace-proof`, `mcp-proof`'s `quitMethod`).

## Specs

None contradicted by the product as far as this reading shows: the quit it asks about was never delivered.

## Relevant files

- `apps/desktop/scripts/lib/cut-scenario.mjs` — `runCutScenario`, the SIGTERM.
- `apps/desktop/scripts/live-run.mjs` — the launch's exit check, which throws and ends the run.
- `docs/defects/fetch-proofs-cancelled-launch-reads-windows-sigterm-as-a-failed-quit.md` — the same reading in another proof.
