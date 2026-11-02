## MCP proof's cancellation launch kills Electron on Windows

Found 2026-10-16 under R-074. The MCP proof's `cancel` launch sent `process.kill(pid, 'SIGTERM')` on Windows ARM64. Electron exited 1 with no orderly shutdown lines, and the assertion for a clean exit stopped the suite. The launch had reached its slow MCP call, but the signal did not exercise the cancellation and summary path the proof intended to measure.

## Specs

The harness is wrong for this host. PD-TOOLS-013 revision 2's cancelled-call record, REQ-SESSION-136's issue accounting and the summary reading still need an orderly application shutdown.

## Relevant files

- `apps/desktop/scripts/mcp-proof.mjs` — `cancelLaunch`.
- `apps/desktop/scripts/lib/driver.mjs` — the driver's orderly `quit`.

## Outcome

Repaired 2026-10-16. POSIX still receives SIGTERM. Windows uses the existing driver's orderly quit after the fixture receives the call, with the same enclosing bounded launch and a bounded driver connection. Driver errors fail the proof explicitly. Both `cancel` and `cancel-throw` execute their existing interrupted-call, issue and summary assertions on Windows.
